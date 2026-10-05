-- ============================================================
-- 020 — poziv na broj samo od cifara (model 99)
-- Svaki član i događaj dobija kratak redni broj; poziv na broj se
-- sastavlja od cifara:
--   mesečna prijava : 1 + GGMM + broj člana (4)        npr. 126100007
--   individualni čas: 2 + GGMMDD + broj člana (4)      npr. 22610280007
--   događaj         : 3 + broj događaja (3) + član (4) npr. 30010007
-- Pokrenuti posle 019. Postojeće prijave sa statusom 'due' dobijaju
-- novi poziv na broj; plaćene (paid) se ne diraju.
-- ============================================================

alter table public.profiles
  add column if not exists member_no integer generated always as identity;
create unique index if not exists profiles_member_no_key on public.profiles (member_no);

alter table public.events
  add column if not exists event_no integer generated always as identity;
create unique index if not exists events_event_no_key on public.events (event_no);

update public.monthly_signups s
   set ref_code = '1' || to_char(s.period, 'YYMM') || lpad(p.member_no::text, 4, '0')
  from public.profiles p
 where p.id = s.member_id and s.status = 'due';

update public.dropin_signups s
   set ref_code = '2' || to_char(s.session_date, 'YYMMDD') || lpad(p.member_no::text, 4, '0')
  from public.profiles p
 where p.id = s.member_id and s.status = 'due';

update public.event_signups s
   set ref_code = '3' || lpad(e.event_no::text, 3, '0') || lpad(p.member_no::text, 4, '0')
  from public.profiles p, public.events e
 where p.id = s.member_id and e.id = s.event_id and s.status = 'due';
