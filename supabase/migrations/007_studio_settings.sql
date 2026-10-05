-- ============================================================
-- Faza 3a — podaci studija potrebni za generisanje IPS QR koda.
-- Jedan red (id uvek 1), admin ga menja po potrebi preko
-- SQL Editora ili kasnije kroz admin ekran za podešavanja.
-- ============================================================

create table public.studio_settings (
  id             integer primary key default 1,
  account_number text not null,
  recipient_name text not null,
  purpose_code   text not null default '189',
  constraint studio_settings_singleton check (id = 1)
);

alter table public.studio_settings enable row level security;

create policy "studio_settings_select_all_authenticated"
  on public.studio_settings for select
  to authenticated
  using (true);

create policy "studio_settings_write_admin_only"
  on public.studio_settings for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.studio_settings to authenticated;
