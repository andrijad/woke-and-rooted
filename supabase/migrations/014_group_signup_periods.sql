-- ============================================================
-- Faza 5, deo 4 — prijave se otvaraju/zatvaraju PO GRUPI,
-- ne globalno za sve grupe odjednom. Stara signup_periods
-- tabela ostaje netaknuta u bazi (istorijski podaci), ali kod
-- je više ne koristi — zamenjuje je ova tabela.
-- ============================================================

create table public.group_signup_periods (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  period      date not null,             -- prvi dan meseca
  is_open     boolean not null default true,
  opened_at   timestamptz not null default now(),
  opened_by   uuid not null references public.profiles(id),
  closed_at   timestamptz,
  unique (group_id, period)
);

alter table public.group_signup_periods enable row level security;

create policy "group_periods_select_all_authenticated"
  on public.group_signup_periods for select
  to authenticated
  using (true);

create policy "group_periods_write_admin_only"
  on public.group_signup_periods for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

grant select, insert, update, delete on public.group_signup_periods to authenticated;
