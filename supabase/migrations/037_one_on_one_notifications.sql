-- 037: Obaveštenja za 1 na 1 seanse.
--  * novi upit          → podnosilac: mejl (+ notifikacija ako je član); vlasnica: notifikacija
--  * zakazan termin     → podnosilac: mejl sa terminom, cenom i IPS QR (+ notifikacija)
--  * promenjen termin   → podnosilac: mejl (+ notifikacija)
--  * potvrđena uplata   → gost: mejl; član: notifikacija
--  * otkazano           → podnosilac: mejl (+ notifikacija)

create or replace function public.sr_datetime(p timestamptz)
returns text language sql stable as $$
  select to_char(p at time zone 'Europe/Belgrade', 'FMDD.FMMM.YYYY.') || ' u ' || to_char(p at time zone 'Europe/Belgrade', 'HH24:MI')
$$;

create or replace function public.one_on_one_payload(r public.one_on_one_requests)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.studio_settings%rowtype;
  v_name text;
begin
  select * into s from public.studio_settings where id = 1;
  select coalesce(nullif(nickname, ''), full_name) into v_name from public.profiles where id = r.member_id;
  return jsonb_build_object(
    'name', coalesce(v_name, r.full_name),
    'session_type', r.session_type,
    'mode', case r.mode when 'uzivo' then 'uživo' when 'online' then 'online' else null end,
    'when', case when r.scheduled_at is not null then public.sr_datetime(r.scheduled_at) end,
    'status_url', 'https://prijave.wokeandrooted.com/seanse/status/' || r.access_token,
    'is_member', r.member_id is not null,
    'paid', r.status = 'paid',
    'owner', public.owner_display_name(),
    'amount', r.amount,
    'ref_code', r.ref_code,
    'account_number', s.account_number,
    'recipient_name', s.recipient_name,
    'purpose_code', s.purpose_code
  );
end;
$$;
revoke execute on function public.one_on_one_payload(public.one_on_one_requests) from public, anon, authenticated;

-- Novi upit.
create or replace function public.on_one_on_one_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_email(new.email, 'oneonone_received', public.one_on_one_payload(new));
  if new.member_id is not null then
    perform public.notify_user(new.member_id, 'Upit za 1 na 1 seansu (' || new.session_type || ') je poslat. Javićemo ti se za termin.');
  end if;
  perform public.notify_admins('Novi upit za 1 na 1: ' || new.full_name || ' (' || new.session_type || ').');
  return null;
end;
$$;

drop trigger if exists trg_one_on_one_created_notify on public.one_on_one_requests;
create trigger trg_one_on_one_created_notify after insert on public.one_on_one_requests
  for each row execute function public.on_one_on_one_created();

-- Promene statusa / termina.
create or replace function public.on_one_on_one_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_when text := case when new.scheduled_at is not null then public.sr_datetime(new.scheduled_at) end;
begin
  if new.status = 'scheduled' and old.status = 'new' then
    perform public.enqueue_email(new.email, 'oneonone_scheduled', public.one_on_one_payload(new));
    if new.member_id is not null then
      perform public.notify_user(new.member_id, 'Zakazan termin za 1 na 1 seansu: ' || v_when || '. Podaci za uplatu su u aplikaciji i u mejlu.');
    end if;

  elsif new.status in ('scheduled', 'paid') and old.status = new.status
        and new.scheduled_at is distinct from old.scheduled_at and new.scheduled_at is not null then
    perform public.enqueue_email(new.email, 'oneonone_rescheduled', public.one_on_one_payload(new));
    if new.member_id is not null then
      perform public.notify_user(new.member_id, 'Promenjen termin 1 na 1 seanse: ' || v_when || '.');
    end if;

  elsif new.status = 'paid' and old.status is distinct from 'paid' then
    if new.member_id is not null then
      perform public.notify_user(new.member_id, 'Uplata za 1 na 1 seansu (' || coalesce(v_when, new.session_type) || ') je potvrđena. Hvala!');
    else
      perform public.enqueue_email(new.email, 'oneonone_paid', public.one_on_one_payload(new));
    end if;

  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.enqueue_email(new.email, 'oneonone_cancelled', public.one_on_one_payload(new));
    if new.member_id is not null then
      perform public.notify_user(new.member_id, '1 na 1 seansa (' || coalesce(v_when, new.session_type) || ') je otkazana.');
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_one_on_one_updated_notify on public.one_on_one_requests;
create trigger trg_one_on_one_updated_notify after update on public.one_on_one_requests
  for each row execute function public.on_one_on_one_updated();
