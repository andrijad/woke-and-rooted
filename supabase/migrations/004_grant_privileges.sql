-- ============================================================
-- Faza 1d — dozvoli pristup tabelama preko Data API-ja.
--
-- "Automatically expose new tables" je isključeno (namerno,
-- to je bezbedno podrazumevano stanje), što znači da nijedna
-- nova tabela ne dobija privilegije za anon/authenticated
-- role dok im ih eksplicitno ne date — bez obzira da li je
-- tabela napravljena kroz SQL Editor ili Table Editor.
--
-- Ovo je poseban sloj od RLS-a:
--   GRANT   = sme li uloga uopšte da pozove select/insert/...
--             na ovoj tabeli (tabela je "vidljiva" API-ju)
--   POLICY  = koje redove tačno sme da vidi/menja u okviru toga
--
-- Standardna Supabase praksa je da se GRANT da široko na
-- authenticated ulogu, a RLS policy (koju već imamo) odradi
-- stvarno ograničavanje. Bez ovoga bi svaka policy bila mrtvo
-- slovo na papiru, jer poziv ne bi ni stigao do provere reda.
--
-- anon uloga namerno ne dobija ništa — u ovoj aplikaciji sve
-- se radi kroz ulogovan nalog, nema javnog nepri jav­ljenog
-- pregleda.
-- ============================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles           to authenticated;
grant select, insert, update, delete on public.groups             to authenticated;
grant select, insert, update, delete on public.group_memberships  to authenticated;
grant select, insert, update, delete on public.signup_periods     to authenticated;
grant select, insert, update, delete on public.monthly_signups    to authenticated;
grant select, insert, update, delete on public.dropin_signups     to authenticated;
grant select, insert, update, delete on public.events             to authenticated;
grant select, insert, update, delete on public.event_signups      to authenticated;
grant select, insert, update, delete on public.notifications      to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.invites            to authenticated;

-- Napomena: davanje insert/update/delete na tabele koje
-- policy ograničava samo na admina (npr. groups, invites)
-- je bezbedno — GRANT samo otvara vrata, RLS policy i dalje
-- odbija svakog ko nije admin. Ovo je namerno širok grant,
-- uzak policy.
