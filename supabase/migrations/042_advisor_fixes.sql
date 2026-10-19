-- 042: Ispravke po Supabase Security Advisor-u (2026-10-19).

-- 1) Trigger funkcije ne treba da budu pozive preko API-ja (/rest/v1/rpc). Trigeri rade i bez EXECUTE prava.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'assign_one_on_one_ref', 'assign_ref_code', 'clear_new_on_admin_signup', 'email_on_verified',
        'handle_new_user', 'limit_one_on_one_rate', 'notify_on_registration', 'on_one_on_one_created',
        'on_one_on_one_updated', 'on_signup_cancelled', 'on_signup_created', 'on_signup_paid',
        'prevent_self_admin_escalation', 'protect_profile_owner_fields', 'protect_profile_unsubscribe_fields',
        'snapshot_event_before_delete', 'snapshot_group_before_delete', 'sync_email_verified',
        'validate_member_event_signup', 'validate_member_monthly_signup', 'rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- 2) Fiksan search_path i za pomoćne funkcije.
alter function public.sr_date(date) set search_path = public;
alter function public.sr_datetime(timestamptz) set search_path = public;
alter function public.sr_month_label(date) set search_path = public;
alter function public.unsubscribe_url(public.profiles) set search_path = public;
alter function public.sync_group_flags() set search_path = public;
alter function public.sync_event_flags() set search_path = public;

-- 3) pg_net van šeme public (pg_net ne podržava SET SCHEMA, pa se ponovo instalira).
--    Funkcije ostaju u šemi `net` (net.http_post), pa red za mejlove radi isto.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
