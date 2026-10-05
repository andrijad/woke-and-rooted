-- ============================================================
-- Faza 5, deo 2 — funkcije za proveru popunjenosti
-- RLS dozvoljava članu da vidi samo svoje prijave, pa običan
-- select za brojanje ne bi radio ispravno za člana (video bi
-- samo sebe). Ove funkcije vraćaju SAMO broj (nikakve lične
-- podatke), pa je bezbedno da ih poziva bilo koji ulogovani
-- korisnik — koriste se isključivo da se dugme za prijavu
-- onemogući kad je kapacitet dostignut.
-- ============================================================

create or replace function public.count_monthly_signups(p_group_id uuid, p_period date)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from public.monthly_signups
  where group_id = p_group_id and period = p_period;
$$;

grant execute on function public.count_monthly_signups(uuid, date) to authenticated;

create or replace function public.count_event_signups(p_event_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from public.event_signups
  where event_id = p_event_id;
$$;

grant execute on function public.count_event_signups(uuid) to authenticated;
