-- ============================================================
-- Čišćenje: ukloni zastarelu dodelu članova grupama.
-- Od faze 6 članovi sami biraju grupu iz otvorenih prijava
-- (monthly_signups + group_signup_periods), a trigger koji je
-- tražio dodelu je uklonjen u 017.
-- PAŽNJA: briše tabelu group_memberships sa starim dodelama.
-- ============================================================

drop function if exists public.admin_set_member_group(uuid, uuid);
drop function if exists public.check_monthly_requires_membership();
drop table if exists public.group_memberships cascade;
