-- 036: Obaveštenja za prijave (joga i događaji): mejl sa podacima za uplatu + notifikacije.
--  * član se sam prijavi     → član: mejl (uplata + IPS QR) i notifikacija; vlasnica: notifikacija
--  * vlasnica doda člana     → član: mejl i notifikacija („Maja te je dodala…“); vlasnica: notifikacija
--  * vlasnica potvrdi uplatu → član: notifikacija
--  * član otkaže prijavu     → vlasnica: notifikacija (kad vlasnica ukloni prijavu — ništa)

create or replace function public.sr_month_label(p date)
returns text language sql immutable as $$
  select (array['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'])[extract(month from p)::int]
         || ' ' || extract(year from p)::int
$$;

create or replace function public.sr_date(p date)
returns text language sql immutable as $$
  select extract(day from p)::int || '.' || extract(month from p)::int || '.' || extract(year from p)::int || '.'
$$;

-- Naziv prijave za poruke, npr. „Jutarnja joga – novembar 2026“ ili „Kakao ceremonija (28.10.2026., 18:00)“.
create or replace function public.signup_label(p_table text, p_row jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
  e public.events%rowtype;
  v_from date;
  v_to date;
begin
  if p_table = 'monthly_signups' then
    select name into v_name from public.groups where id = (p_row->>'group_id')::uuid;
    return coalesce(v_name, p_row->>'group_name', 'Joga') || ' – ' || public.sr_month_label((p_row->>'period')::date);
  end if;

  select * into e from public.events where id = (p_row->>'event_id')::uuid;
  if found then
    v_name := e.name; v_from := e.date_from; v_to := e.date_to;
  else
    v_name := coalesce(p_row->>'event_name', 'Događaj');
    v_from := (p_row->>'event_date_from')::date; v_to := (p_row->>'event_date_to')::date;
  end if;
  if v_from is null then return v_name; end if;
  return v_name || ' (' || public.sr_date(v_from)
    || case when v_to is not null and v_to <> v_from then ' – ' || public.sr_date(v_to)
            when e.start_time is not null then ', ' || to_char(e.start_time, 'HH24:MI')
            else '' end
    || ')';
end;
$$;
revoke execute on function public.signup_label(text, jsonb) from public, anon, authenticated;

-- Ime vlasnice za poruke (nadimak, pa ime).
create or replace function public.owner_display_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(nullif(nickname, ''), full_name) from public.profiles where id = auth.uid() and is_admin),
    (select coalesce(nullif(nickname, ''), full_name) from public.profiles where is_admin order by created_at limit 1),
    'Woke & Rooted')
$$;
revoke execute on function public.owner_display_name() from public, anon, authenticated;

-- Nova prijava.
create or replace function public.on_signup_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.profiles%rowtype;
  s public.studio_settings%rowtype;
  v_label text;
  v_by_admin boolean := auth.uid() is not null and public.is_admin();
  v_owner text;
  v_kind text;
begin
  select * into m from public.profiles where id = new.member_id;
  if not found then return null; end if;
  select * into s from public.studio_settings where id = 1;
  v_label := public.signup_label(TG_TABLE_NAME, to_jsonb(new));

  if v_by_admin then
    v_owner := public.owner_display_name();
    perform public.notify_user(m.id, v_owner || ' te je dodala u ' || v_label || '.');
    perform public.notify_admins('Dodala si ' || m.full_name || ' u ' || v_label || '.');
    v_kind := 'signup_added';
  else
    perform public.notify_user(m.id, 'Uspešna prijava: ' || v_label || '.');
    perform public.notify_admins(m.full_name || ' – nova prijava: ' || v_label || '.');
    v_kind := 'signup_created';
  end if;

  perform public.enqueue_email(m.email, v_kind, jsonb_build_object(
    'name', coalesce(nullif(m.nickname, ''), m.full_name),
    'label', v_label,
    'owner', coalesce(v_owner, public.owner_display_name()),
    'amount', new.amount,
    'ref_code', new.ref_code,
    'account_number', s.account_number,
    'recipient_name', s.recipient_name,
    'purpose_code', s.purpose_code
  ));
  return null;
end;
$$;

drop trigger if exists trg_signup_created_notify on public.monthly_signups;
create trigger trg_signup_created_notify after insert on public.monthly_signups
  for each row execute function public.on_signup_created();
drop trigger if exists trg_signup_created_notify on public.event_signups;
create trigger trg_signup_created_notify after insert on public.event_signups
  for each row execute function public.on_signup_created();

-- Potvrđena uplata → samo notifikacija članu.
create or replace function public.on_signup_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform public.notify_user(new.member_id,
      'Uplata za ' || public.signup_label(TG_TABLE_NAME, to_jsonb(new)) || ' je potvrđena. Hvala!');
  end if;
  return null;
end;
$$;

drop trigger if exists trg_signup_paid_notify on public.monthly_signups;
create trigger trg_signup_paid_notify after update of status on public.monthly_signups
  for each row execute function public.on_signup_paid();
drop trigger if exists trg_signup_paid_notify on public.event_signups;
create trigger trg_signup_paid_notify after update of status on public.event_signups
  for each row execute function public.on_signup_paid();

-- Član sam otkaže prijavu → vlasnica.
create or replace function public.on_signup_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  if auth.uid() is not null and auth.uid() = old.member_id and not public.is_admin() then
    select full_name into v_name from public.profiles where id = old.member_id;
    perform public.notify_admins(coalesce(v_name, 'Član') || ' – otkazana prijava: '
      || public.signup_label(TG_TABLE_NAME, to_jsonb(old)) || '.');
  end if;
  return null;
end;
$$;

drop trigger if exists trg_signup_cancelled_notify on public.monthly_signups;
create trigger trg_signup_cancelled_notify after delete on public.monthly_signups
  for each row execute function public.on_signup_cancelled();
drop trigger if exists trg_signup_cancelled_notify on public.event_signups;
create trigger trg_signup_cancelled_notify after delete on public.event_signups
  for each row execute function public.on_signup_cancelled();
