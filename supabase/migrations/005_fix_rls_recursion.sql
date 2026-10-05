-- ============================================================
-- Faza 1e — ispravka: beskonačna rekurzija u RLS pravilima.
--
-- Uzrok: svaka "admin" provera je radila
--   exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
-- a profiles tabela je i sama pod RLS-om, pa ta unutrašnja
-- provera ponovo pokreće istu policy — beskonačno.
--
-- Rešenje: is_admin() je SECURITY DEFINER funkcija. Takve
-- funkcije se izvršavaju pod identitetom VLASNIKA funkcije
-- (ovde: postgres), a vlasnik tabele je po Postgres default
-- pravilu izuzet od sopstvenih RLS pravila (osim ako je na
-- tabeli eksplicitno pozvano FORCE ROW LEVEL SECURITY, što
-- ovde nismo radili). Zato poziv is_admin() čita profiles
-- bez ikakve RLS provere — nema rekurzije.
--
-- Sve "admin" policy iz 001_schema.sql se zamenjuju da
-- pozivaju is_admin() umesto da same rade subquery nad
-- profiles.
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;


-- ---------- profiles ----------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- stara "profiles_update_own_no_role_change" je isto imala
-- rekurzivni subquery u with check. Zamenjujemo je prostijom
-- policy + triggerom koji koristi OLD vrednost iz reda koji
-- se već menja (bez ikakvog dodatnog select-a nad profiles).
drop policy if exists "profiles_update_own_no_role_change" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

create or replace function public.prevent_self_admin_escalation()
returns trigger as $$
begin
  if new.is_admin is distinct from old.is_admin then
    new.is_admin := old.is_admin;  -- tiho ignoriše pokušaj promene sopstvene role
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_self_admin_escalation on public.profiles;
create trigger trg_prevent_self_admin_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_admin_escalation();


-- ---------- groups ----------
drop policy if exists "groups_write_admin_only" on public.groups;
create policy "groups_write_admin_only"
  on public.groups for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------- group_memberships ----------
drop policy if exists "memberships_select_own_or_admin" on public.group_memberships;
create policy "memberships_select_own_or_admin"
  on public.group_memberships for select
  using (member_id = auth.uid() or public.is_admin());

drop policy if exists "memberships_write_admin_only" on public.group_memberships;
create policy "memberships_write_admin_only"
  on public.group_memberships for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------- signup_periods ----------
drop policy if exists "periods_write_admin_only" on public.signup_periods;
create policy "periods_write_admin_only"
  on public.signup_periods for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------- monthly_signups ----------
drop policy if exists "monthly_signups_select_own_or_admin" on public.monthly_signups;
create policy "monthly_signups_select_own_or_admin"
  on public.monthly_signups for select
  using (member_id = auth.uid() or public.is_admin());

drop policy if exists "monthly_signups_update_admin_only" on public.monthly_signups;
create policy "monthly_signups_update_admin_only"
  on public.monthly_signups for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "monthly_signups_delete_admin_only" on public.monthly_signups;
create policy "monthly_signups_delete_admin_only"
  on public.monthly_signups for delete
  using (public.is_admin());


-- ---------- dropin_signups ----------
drop policy if exists "dropin_select_own_or_admin" on public.dropin_signups;
create policy "dropin_select_own_or_admin"
  on public.dropin_signups for select
  using (member_id = auth.uid() or public.is_admin());

drop policy if exists "dropin_insert_own_or_admin" on public.dropin_signups;
create policy "dropin_insert_own_or_admin"
  on public.dropin_signups for insert
  with check (member_id = auth.uid() or public.is_admin());

drop policy if exists "dropin_update_admin_only" on public.dropin_signups;
create policy "dropin_update_admin_only"
  on public.dropin_signups for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "dropin_delete_admin_only" on public.dropin_signups;
create policy "dropin_delete_admin_only"
  on public.dropin_signups for delete
  using (public.is_admin());


-- ---------- events ----------
drop policy if exists "events_select_published_or_admin" on public.events;
create policy "events_select_published_or_admin"
  on public.events for select
  using (published = true or public.is_admin());

drop policy if exists "events_write_admin_only" on public.events;
create policy "events_write_admin_only"
  on public.events for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------- event_signups ----------
drop policy if exists "event_signups_select_own_or_admin" on public.event_signups;
create policy "event_signups_select_own_or_admin"
  on public.event_signups for select
  using (member_id = auth.uid() or public.is_admin());

drop policy if exists "event_signups_insert_own_or_admin" on public.event_signups;
create policy "event_signups_insert_own_or_admin"
  on public.event_signups for insert
  with check (member_id = auth.uid() or public.is_admin());

drop policy if exists "event_signups_update_admin_only" on public.event_signups;
create policy "event_signups_update_admin_only"
  on public.event_signups for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "event_signups_delete_admin_only" on public.event_signups;
create policy "event_signups_delete_admin_only"
  on public.event_signups for delete
  using (public.is_admin());


-- ---------- notifications ----------
drop policy if exists "notifications_write_admin_only" on public.notifications;
create policy "notifications_write_admin_only"
  on public.notifications for insert
  with check (public.is_admin());


-- ---------- push_subscriptions ----------
drop policy if exists "push_subs_select_own_or_admin" on public.push_subscriptions;
create policy "push_subs_select_own_or_admin"
  on public.push_subscriptions for select
  using (member_id = auth.uid() or public.is_admin());

drop policy if exists "push_subs_delete_own_or_admin" on public.push_subscriptions;
create policy "push_subs_delete_own_or_admin"
  on public.push_subscriptions for delete
  using (member_id = auth.uid() or public.is_admin());


-- ---------- invites ----------
drop policy if exists "invites_admin_only" on public.invites;
create policy "invites_admin_only"
  on public.invites for all
  using (public.is_admin())
  with check (public.is_admin());
