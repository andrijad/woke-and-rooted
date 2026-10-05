-- ============================================================
-- Faza 6, deo 2 — član sme biti prijavljen u samo jednu
-- redovnu grupu po mesecu. Pravilo se nameće u bazi, ne samo
-- u prikazu.
--
-- Ako ovaj upit javi grešku "could not create unique index",
-- u bazi već postoje dve prijave istog člana za isti mesec
-- (verovatno iz testiranja). Nađi ih ovim upitom, ukloni
-- višak kroz admin ekran (dugme "Ukloni") i pokreni ponovo:
--
--   select member_id, period, count(*)
--   from monthly_signups group by 1, 2 having count(*) > 1;
-- ============================================================

create unique index if not exists monthly_signups_one_group_per_member_period
  on public.monthly_signups (member_id, period);
