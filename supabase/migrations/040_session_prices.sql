-- 040: Cena 1 na 1 seanse se upisuje pri zakazivanju (zavisi od trajanja); u podešavanjima su samo
-- indikativne cene po vrsti seanse (slobodan tekst, npr. „6.000 RSD po satu“), koje se prikazuju u formi za upit.

alter table public.studio_settings add column if not exists session_price_info jsonb not null default '{}'::jsonb;

-- Forma za upit je javna (i gosti), a studio_settings čitaju samo ulogovani — zato posebna funkcija.
create or replace function public.get_session_price_info()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(session_price_info, '{}'::jsonb) from public.studio_settings where id = 1
$$;
revoke execute on function public.get_session_price_info() from public;
grant execute on function public.get_session_price_info() to anon, authenticated;

-- Izmena cene zakazane (neplaćene) seanse šalje isti mejl kao promena termina, sa novim podacima za uplatu.
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
      perform public.notify_user(new.member_id, 'Zakazan termin za 1 na 1 seansu: ' || v_when || ' (' || new.amount || ' RSD). Podaci za uplatu su u aplikaciji i u mejlu.');
    end if;

  elsif new.status in ('scheduled', 'paid') and old.status = new.status and new.scheduled_at is not null
        and (new.scheduled_at is distinct from old.scheduled_at
             or (new.status = 'scheduled' and new.amount is distinct from old.amount)) then
    perform public.enqueue_email(new.email, 'oneonone_rescheduled', public.one_on_one_payload(new));
    if new.member_id is not null then
      perform public.notify_user(new.member_id,
        case when new.scheduled_at is distinct from old.scheduled_at
             then 'Promenjen termin 1 na 1 seanse: ' || v_when || '.'
             else 'Promenjena cena 1 na 1 seanse (' || v_when || '): ' || new.amount || ' RSD.' end);
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
