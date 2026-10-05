-- ============================================================
-- Faza 5, deo 1b — usklađivanje sa stvarnim stanjem baze.
-- description_short i description_html već postoje (ručno
-- dodati po uzoru na groups tabelu); stara description kolona
-- se ne koristi nigde u kodu, pa se briše. Dodaju se start_time
-- i end_time za jednodnevne događaje.
-- ============================================================

alter table public.events drop column if exists description;
alter table public.events add column if not exists start_time time;
alter table public.events add column if not exists end_time time;
