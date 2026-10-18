-- 035: Notifikacije u aplikaciji (zvonce). Pročitano = obrisano, bez istorije.

-- Stara tabela notifications iz 001 (tip/naslov za sve članove) nikad nije korišćena u aplikaciji — zamenjuje se.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notifications' and column_name = 'created_by') then
    drop table public.notifications cascade;
  end if;
end $$;

create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
revoke insert, update on public.notifications from authenticated;
grant select, delete on public.notifications to authenticated;

-- Svako vidi i briše (= čita) samo svoje.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- Upis samo iz triggera / funkcija baze.
create or replace function public.notify_user(p_user uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_body is null then return; end if;
  -- ručni članovi nemaju nalog, pa ni zvonce
  if exists (select 1 from public.profiles where id = p_user and not is_manual) then
    insert into public.notifications (user_id, body) values (p_user, p_body);
  end if;
end;
$$;
revoke execute on function public.notify_user(uuid, text) from public, anon, authenticated;

create or replace function public.notify_admins(p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, body)
  select id, p_body from public.profiles where is_admin;
end;
$$;
revoke execute on function public.notify_admins(text) from public, anon, authenticated;

-- Prvi okidač: nova registracija → vlasnica.
create or replace function public.notify_on_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_manual and not new.is_admin then
    perform public.notify_admins('Novi član: ' || coalesce(nullif(trim(new.full_name), ''), new.email) || ' se registrovao/la.');
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_registered_notify on public.profiles;
create trigger on_profile_registered_notify
  after insert on public.profiles
  for each row execute function public.notify_on_registration();

-- Neobrisane notifikacije starije od 60 dana se brišu (jednom dnevno).
select cron.unschedule('cleanup-notifications') where exists (select 1 from cron.job where jobname = 'cleanup-notifications');
select cron.schedule('cleanup-notifications', '20 3 * * *',
  $$delete from public.notifications where created_at < now() - interval '60 days'$$);
