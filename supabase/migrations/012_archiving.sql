-- ============================================================
-- Faza 5, deo 3 — arhiviranje grupa i događaja.
-- Arhiviran red ostaje u bazi (istorija uplata se ne gubi),
-- ali se sakriva iz member prikaza. Vlasnica ga i dalje vidi
-- u admin ekranima, sa napomenom "arhivirano".
-- ============================================================

alter table public.groups add column if not exists archived boolean not null default false;
alter table public.events add column if not exists archived boolean not null default false;
