-- 033: Red za slanje mejlova (email_outbox) + cron koji poziva Edge funkciju send-emails.
-- Pre ovoga: Resend ključ i CRON_SECRET u Edge Function secrets, i dve tajne u Vault-u (vidi PR / docs/mejlovi.md).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.email_outbox (
  id bigserial primary key,
  to_email text not null,
  kind text not null,                 -- vrsta mejla (šablon u Edge funkciji)
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index if not exists email_outbox_pending_idx on public.email_outbox (id) where status in ('pending', 'sending');

-- Niko iz aplikacije ne čita niti piše red direktno; radi samo preko funkcija ispod i service role-a.
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

-- Upis u red (koriste ga triggeri).
create or replace function public.enqueue_email(p_to text, p_kind text, p_payload jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_to is null or position('@' in p_to) = 0 then return; end if;
  insert into public.email_outbox (to_email, kind, payload) values (lower(trim(p_to)), p_kind, coalesce(p_payload, '{}'));
end;
$$;
revoke execute on function public.enqueue_email(text, text, jsonb) from public, anon, authenticated;

-- Edge funkcija preuzima sledeću turu mejlova. Poštuje dnevni limit (Resend free: 100/dan, ostavljamo rezervu).
create or replace function public.claim_emails(p_limit int default 20, p_daily_limit int default 95)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent_today int;
  v_take int;
begin
  -- zaglavljeni (funkcija pala usred slanja) vraćaju se u red posle 10 minuta
  update public.email_outbox set status = 'pending'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';

  select count(*) into v_sent_today from public.email_outbox
   where status = 'sent' and sent_at >= date_trunc('day', now() at time zone 'Europe/Belgrade') at time zone 'Europe/Belgrade';
  v_take := least(p_limit, p_daily_limit - v_sent_today);
  if v_take <= 0 then return; end if;

  return query
  update public.email_outbox o
     set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
   where o.id in (
     select id from public.email_outbox
      where status = 'pending'
      order by id
      limit v_take
      for update skip locked)
  returning o.*;
end;
$$;
revoke execute on function public.claim_emails(int, int) from public, anon, authenticated;

-- Rezultat slanja.
create or replace function public.finish_email(p_id bigint, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ok then
    update public.email_outbox set status = 'sent', sent_at = now(), last_error = null where id = p_id;
  else
    update public.email_outbox
       set status = case when attempts >= 5 then 'failed' else 'pending' end,
           last_error = left(p_error, 500)
     where id = p_id;
  end if;
end;
$$;
revoke execute on function public.finish_email(bigint, boolean, text) from public, anon, authenticated;

-- Cron: svakog minuta, ali Edge funkciju zove samo kad ima mejlova u redu.
create or replace function public.kick_email_sender()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.email_outbox where status = 'pending') then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'email_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'email_cron_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke execute on function public.kick_email_sender() from public, anon, authenticated;

select cron.unschedule('send-emails') where exists (select 1 from cron.job where jobname = 'send-emails');
select cron.schedule('send-emails', '* * * * *', 'select public.kick_email_sender()');

-- Čišćenje: poslati mejlovi stariji od 30 dana se brišu (jednom dnevno).
select cron.unschedule('cleanup-email-outbox') where exists (select 1 from cron.job where jobname = 'cleanup-email-outbox');
select cron.schedule('cleanup-email-outbox', '15 3 * * *',
  $$delete from public.email_outbox where status = 'sent' and sent_at < now() - interval '30 days'$$);

-- Prvi okidač: član je potvrdio email (sam ili ga je vlasnica potvrdila ručno).
create or replace function public.email_on_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_verified and not coalesce(old.email_verified, false) and not new.is_manual then
    perform public.enqueue_email(new.email, 'email_verified',
      jsonb_build_object('name', coalesce(nullif(new.nickname, ''), new.full_name)));
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_email_verified on public.profiles;
create trigger on_profile_email_verified
  after update of email_verified on public.profiles
  for each row execute function public.email_on_verified();
