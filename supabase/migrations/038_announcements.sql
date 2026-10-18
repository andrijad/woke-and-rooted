-- 038: Masovna obaveštenja (prijave za mesec otvorene, novi događaj) + odjava od tih mejlova.

alter table public.profiles add column if not exists email_opt_out boolean not null default false;
alter table public.profiles add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_unsubscribe_token_idx on public.profiles (unsubscribe_token);

alter table public.events add column if not exists announced_at timestamptz;

-- Evidencija poslatih obaveštenja (da vlasnica vidi šta je i kad poslato).
create table if not exists public.announcements (
  id bigserial primary key,
  kind text not null check (kind in ('month_open', 'event')),
  ref text not null,                 -- 'YYYY-MM-01' ili id događaja
  recipients int not null,
  sent_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon;
grant select on public.announcements to authenticated;
drop policy if exists announcements_select_admin on public.announcements;
create policy announcements_select_admin on public.announcements
  for select to authenticated using (public.is_admin());

-- Član ne menja sam opt-out direktno (samo preko linka iz mejla), ni token.
create or replace function public.protect_profile_unsubscribe_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and coalesce(current_setting('app.allow_opt_out', true), '') <> 'on' then
    new.email_opt_out := old.email_opt_out;
    new.unsubscribe_token := old.unsubscribe_token;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_unsubscribe on public.profiles;
create trigger trg_protect_unsubscribe before update on public.profiles
  for each row execute function public.protect_profile_unsubscribe_fields();

-- Primaoci masovnih obaveštenja: svi članovi (i ručni sa mejlom), osim arhiviranih i odjavljenih.
create or replace function public.announcement_recipients()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles
  where not is_admin and not coalesce(archived, false)
$$;
revoke execute on function public.announcement_recipients() from public, anon, authenticated;

create or replace function public.unsubscribe_url(p public.profiles)
returns text language sql stable as $$
  select 'https://prijave.wokeandrooted.com/odjava/' || p.unsubscribe_token
$$;

-- Vlasnica: „Obavesti članove da su prijave za MESEC otvorene“.
create or replace function public.admin_announce_month(p_period date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_label text := public.sr_month_label(date_trunc('month', p_period)::date);
  v_groups jsonb;
  r public.profiles%rowtype;
  v_count int := 0;
begin
  if not public.is_admin() then raise exception 'Samo vlasnica.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', g.name,
           'price', g.monthly_price,
           'schedule', (select string_agg(
               (array['ponedeljak','utorak','sreda','četvrtak','petak','subota','nedelja'])[s.weekday]
               || ' ' || to_char(s.start_time, 'HH24:MI'), ', ' order by s.weekday, s.start_time)
             from public.group_schedule s where s.group_id = g.id)
         ) order by g.name), '[]'::jsonb)
    into v_groups
    from public.groups g
    join public.group_signup_periods p on p.group_id = g.id and p.period = v_period and p.is_open
   where g.active;

  if jsonb_array_length(v_groups) = 0 then
    raise exception 'Za taj mesec nijedna grupa nema otvorene prijave.';
  end if;

  for r in select * from public.announcement_recipients() loop
    perform public.notify_user(r.id, 'Prijave za jogu za ' || v_label || ' su otvorene.');
    if not r.email_opt_out then
      perform public.enqueue_email(r.email, 'month_open', jsonb_build_object(
        'name', coalesce(nullif(r.nickname, ''), r.full_name),
        'month', v_label,
        'groups', v_groups,
        'unsubscribe_url', public.unsubscribe_url(r)));
      if r.email is not null then v_count := v_count + 1; end if;
    end if;
  end loop;

  insert into public.announcements (kind, ref, recipients) values ('month_open', v_period::text, v_count);
  return v_count;
end;
$$;
revoke execute on function public.admin_announce_month(date) from public, anon;
grant execute on function public.admin_announce_month(date) to authenticated;

-- Vlasnica: najava događaja (jednom po događaju).
create or replace function public.admin_announce_event(p_event_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.events%rowtype;
  v_label text;
  v_when text;
  r public.profiles%rowtype;
  v_count int := 0;
begin
  if not public.is_admin() then raise exception 'Samo vlasnica.'; end if;
  select * into e from public.events where id = p_event_id for update;
  if not found then raise exception 'Događaj nije pronađen.'; end if;
  if not e.active then raise exception 'Događaj nije aktivan.'; end if;
  if coalesce(e.date_to, e.date_from) < current_date then raise exception 'Događaj je prošao.'; end if;
  if e.announced_at is not null then raise exception 'Obaveštenje za ovaj događaj je već poslato.'; end if;

  v_when := public.sr_date(e.date_from)
    || case when e.date_to is not null and e.date_to <> e.date_from then ' – ' || public.sr_date(e.date_to) else '' end
    || case when e.start_time is not null then ', ' || to_char(e.start_time, 'HH24:MI')
              || coalesce('–' || to_char(e.end_time, 'HH24:MI'), '') else '' end;
  v_label := e.name || ' (' || public.sr_date(e.date_from) || ')';

  for r in select * from public.announcement_recipients() loop
    perform public.notify_user(r.id, 'Prijave za ' || v_label || ' su otvorene.');
    if not r.email_opt_out then
      perform public.enqueue_email(r.email, 'event_announce', jsonb_build_object(
        'name', coalesce(nullif(r.nickname, ''), r.full_name),
        'event_name', e.name,
        'when', v_when,
        'price', e.price,
        'description_short', e.description_short,
        'description_html', e.description_html,
        'unsubscribe_url', public.unsubscribe_url(r)));
      if r.email is not null then v_count := v_count + 1; end if;
    end if;
  end loop;

  update public.events set announced_at = now() where id = e.id;
  insert into public.announcements (kind, ref, recipients) values ('event', e.id::text, v_count);
  return v_count;
end;
$$;
revoke execute on function public.admin_announce_event(uuid) from public, anon;
grant execute on function public.admin_announce_event(uuid) to authenticated;

-- Odjava preko linka iz mejla (javno, bez prijave).
create or replace function public.set_email_opt_out(p_token uuid, p_opt_out boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.allow_opt_out', 'on', true);
  update public.profiles set email_opt_out = p_opt_out where unsubscribe_token = p_token;
  return found;
end;
$$;
revoke execute on function public.set_email_opt_out(uuid, boolean) from public;
grant execute on function public.set_email_opt_out(uuid, boolean) to anon, authenticated;
