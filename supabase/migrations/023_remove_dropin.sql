-- ============================================================
-- 023 — uklanjanje individualnih časova (drop-in)
-- Briše tabelu dropin_signups (sa politikama i triggerima), pomoćne
-- funkcije i kolonu groups.dropin_price. NEPOVRATNO: sve postojeće
-- prijave na individualne časove nestaju. Pokrenuti tek kad je
-- novi frontend (ovaj PR) objavljen.
-- ============================================================

drop table if exists public.dropin_signups cascade;

drop function if exists public.check_no_duplicate_dropin();
drop function if exists public.check_dropin_matches_schedule();

alter table public.groups drop column if exists dropin_price;
