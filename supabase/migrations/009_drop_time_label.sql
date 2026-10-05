-- ============================================================
-- Faza 4, deo 3 — ispravka: time_label je zamenjen sa
-- group_schedule (deo 1) i više nema svrhu. Bila je NOT NULL,
-- pa je blokirala kreiranje nove grupe kroz admin ekran, koji
-- je namerno ne popunjava.
-- ============================================================

alter table public.groups drop column if exists time_label;
