-- 043: Upit za 1 na 1 više ne ide direktno u tabelu, nego preko Edge funkcije submit-session-request,
-- koja prvo proveri Cloudflare Turnstile. Direktan upis je zatvoren za sve osim service role.

drop policy if exists "oneonone_insert_public" on public.one_on_one_requests;
revoke insert on public.one_on_one_requests from anon, authenticated;

-- Prioritet mejlova: kad se dnevna kvota bliži kraju (posle 70 poslatih), šalju se samo mejlovi
-- o prijavama, uplatama i nalogu. Potvrde upita i masovna obaveštenja čekaju sledeći dan.
create or replace function public.claim_emails(p_limit int default 20, p_daily_limit int default 95)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent_today int;
  v_take int;
  v_low_ok boolean;
begin
  update public.email_outbox set status = 'pending'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';

  select count(*) into v_sent_today from public.email_outbox
   where status = 'sent' and sent_at >= date_trunc('day', now() at time zone 'Europe/Belgrade') at time zone 'Europe/Belgrade';
  v_take := least(p_limit, p_daily_limit - v_sent_today);
  if v_take <= 0 then return; end if;
  v_low_ok := v_sent_today < 70;

  return query
  update public.email_outbox o
     set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
   where o.id in (
     select id from public.email_outbox
      where status = 'pending'
        and (v_low_ok or kind not in ('oneonone_received', 'month_open', 'event_announce'))
      order by (kind in ('oneonone_received', 'month_open', 'event_announce')), id
      limit v_take
      for update skip locked)
  returning o.*;
end;
$$;
revoke execute on function public.claim_emails(int, int) from public, anon, authenticated;
grant execute on function public.claim_emails(int, int) to service_role;
