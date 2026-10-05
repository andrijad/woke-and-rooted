-- =========================================================
-- Joga studio — inicijalna šema (Supabase / Postgres)
-- Faza 1: tabele + Row Level Security
-- =========================================================

-- ---------------------------------------------------------
-- 1. PROFILI
-- Jedan red po auth korisniku. is_admin je jedini izvor
-- istine za rolu — nikad se ne izvlači iz frontenda.
-- ---------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- svako čita samo svoj profil; admin čita sve
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- korisnik menja samo svoje ime/telefon, nikad is_admin
create policy "profiles_update_own_no_role_change"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select is_admin from public.profiles where id = auth.uid()));

-- is_admin se postavlja samo ručno (SQL editor / service role), nikad iz appa
-- (namerno nema insert/update policy koja dozvoljava is_admin = true)


-- ---------------------------------------------------------
-- 2. GRUPE
-- Redovni termini. Kapacitet je informativan, ne tvrd limit —
-- provera se radi u UI kao upozorenje, ne kao DB constraint,
-- jer vlasnica sme svesno da premaši broj.
-- ---------------------------------------------------------
create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,              -- npr. "Ponedeljak i sreda"
  time_label    text not null,              -- npr. "19.00 — 20.15"
  monthly_price integer not null,           -- RSD, cela vrednost
  dropin_price  integer not null,           -- cena individualnog časa u ovoj grupi
  capacity      integer,                    -- informativno, može biti null (bez limita)
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.groups enable row level security;

create policy "groups_select_all_authenticated"
  on public.groups for select
  to authenticated
  using (true);

create policy "groups_write_admin_only"
  on public.groups for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));


-- ---------------------------------------------------------
-- 3. ČLANSTVO U GRUPI
-- Da li je član uopšte "vezan" za grupu (može biti u više
-- grupa istovremeno). Ovo NIJE mesečna prijava — to je
-- monthly_signups ispod. Ovo je "pripada ovoj grupi".
-- ---------------------------------------------------------
create table public.group_memberships (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (group_id, member_id)
);

alter table public.group_memberships enable row level security;

create policy "memberships_select_own_or_admin"
  on public.group_memberships for select
  using (
    member_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "memberships_write_admin_only"
  on public.group_memberships for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));


-- ---------------------------------------------------------
-- 4. OTVOREN MESEC ZA PRIJAVE
-- Kad vlasnica "otvori" mesec, upisuje se red ovde —
-- to je okidač za notifikacije i za prikaz opcije prijave.
-- ---------------------------------------------------------
create table public.signup_periods (
  id          uuid primary key default gen_random_uuid(),
  period      date not null unique,   -- prvi dan meseca, npr. 2026-10-01
  opened_at   timestamptz not null default now(),
  opened_by   uuid not null references public.profiles(id)
);

alter table public.signup_periods enable row level security;

create policy "periods_select_all_authenticated"
  on public.signup_periods for select
  to authenticated
  using (true);

create policy "periods_write_admin_only"
  on public.signup_periods for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));


-- ---------------------------------------------------------
-- 5. MESEČNE PRIJAVE (redovna članarina)
-- Jedan član, jedna grupa, jedan mesec — najviše jednom.
-- Član mora biti u group_memberships za tu grupu da bi
-- uopšte mogao da se prijavi (proverava se u aplikaciji
-- i dodatno u trigeru ispod).
-- ---------------------------------------------------------
create table public.monthly_signups (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id),
  member_id   uuid not null references public.profiles(id),
  period      date not null,          -- prvi dan meseca
  amount      integer not null,
  ref_code    text not null,          -- poziv na broj, videti format ispod
  status      text not null default 'due' check (status in ('due','paid')),
  created_at  timestamptz not null default now(),
  unique (group_id, member_id, period)
);

alter table public.monthly_signups enable row level security;

create policy "monthly_signups_select_own_or_admin"
  on public.monthly_signups for select
  using (
    member_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- član sme sam da kreira svoju prijavu (insert), ne sme da je briše niti da menja status
create policy "monthly_signups_insert_own"
  on public.monthly_signups for insert
  with check (member_id = auth.uid());

-- samo admin potvrđuje uplatu (update statusa)
create policy "monthly_signups_update_admin_only"
  on public.monthly_signups for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "monthly_signups_delete_admin_only"
  on public.monthly_signups for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));


-- ---------------------------------------------------------
-- 6. INDIVIDUALNI ČASOVI (drop-in unutar grupe)
-- Prijava na jedan konkretan termin grupe, bez mesečne
-- pretplate. Trigeri ispod sprečavaju duplu prijavu:
--   a) ne može dropin ako već postoji aktivna mesečna
--      prijava za tu grupu/mesec (nema potrebe)
--   b) ne može dva puta isti dropin
-- Admin sme da doda člana ručno i preko kapaciteta —
-- zato capacity nije DB constraint, samo groups.capacity
-- kao informacija za UI.
-- ---------------------------------------------------------
create table public.dropin_signups (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id),
  member_id     uuid not null references public.profiles(id),
  session_date  date not null,
  amount        integer not null,
  ref_code      text not null,
  status        text not null default 'due' check (status in ('due','paid')),
  added_by_admin boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (group_id, member_id, session_date)
);

alter table public.dropin_signups enable row level security;

create policy "dropin_select_own_or_admin"
  on public.dropin_signups for select
  using (
    member_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "dropin_insert_own_or_admin"
  on public.dropin_signups for insert
  with check (
    member_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "dropin_update_admin_only"
  on public.dropin_signups for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "dropin_delete_admin_only"
  on public.dropin_signups for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Server-side provera (a) iznad — ne oslanjamo se samo na UI da sakrije opciju,
-- jer neko može pozvati insert direktno preko API-ja.
create or replace function public.check_no_duplicate_dropin()
returns trigger as $$
begin
  if exists (
    select 1 from public.monthly_signups ms
    where ms.group_id = new.group_id
      and ms.member_id = new.member_id
      and ms.period = date_trunc('month', new.session_date)::date
  ) then
    raise exception 'Član je već mesečno prijavljen na ovu grupu za taj period — individualni čas nije potreban.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_no_duplicate_dropin
  before insert on public.dropin_signups
  for each row execute function public.check_no_duplicate_dropin();


-- ---------------------------------------------------------
-- 7. POSEBNI DOGAĐAJI (jednokratni, jedan ili više dana)
-- ---------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  date_from   date not null,
  date_to     date,                  -- null ako je jednodnevni
  price       integer not null,
  capacity    integer,               -- informativno, isti princip kao groups.capacity
  published   boolean not null default false,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

alter table public.events enable row level security;

-- član vidi samo objavljene događaje; admin vidi sve (uključujući nacrte)
create policy "events_select_published_or_admin"
  on public.events for select
  using (
    published = true
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "events_write_admin_only"
  on public.events for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));


create table public.event_signups (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id),
  member_id     uuid not null references public.profiles(id),
  amount        integer not null,
  ref_code      text not null,
  status        text not null default 'due' check (status in ('due','paid')),
  added_by_admin boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (event_id, member_id)   -- ne može dvaput na isti događaj
);

alter table public.event_signups enable row level security;

create policy "event_signups_select_own_or_admin"
  on public.event_signups for select
  using (
    member_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "event_signups_insert_own_or_admin"
  on public.event_signups for insert
  with check (
    member_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "event_signups_update_admin_only"
  on public.event_signups for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "event_signups_delete_admin_only"
  on public.event_signups for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));


-- ---------------------------------------------------------
-- 8. OBAVEŠTENJA (log onoga što treba poslati/poslato je)
-- Edge Function čita nove redove i šalje email + push.
-- ---------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('month_opened','event_published')),
  title       text not null,
  body        text not null,
  ref_id      uuid,                  -- id perioda ili događaja
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications_select_all_authenticated"
  on public.notifications for select
  to authenticated
  using (true);

create policy "notifications_write_admin_only"
  on public.notifications for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));


create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_key    text not null,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subs_select_own_or_admin"
  on public.push_subscriptions for select
  using (
    member_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "push_subs_insert_own"
  on public.push_subscriptions for insert
  with check (member_id = auth.uid());

create policy "push_subs_delete_own_or_admin"
  on public.push_subscriptions for delete
  using (
    member_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );


-- ---------------------------------------------------------
-- 9. INVITE LINKOVI (registracija preko linka)
-- Jednokratni token, ističe za 7 dana. Kreira admin,
-- koristi ga anonimni posetilac tokom sign-up flow-a
-- (proverava se u Edge Function-u pre kreiranja auth naloga).
-- ---------------------------------------------------------
create table public.invites (
  token       uuid primary key default gen_random_uuid(),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  used_at     timestamptz,
  used_by     uuid references public.profiles(id)
);

alter table public.invites enable row level security;

-- niko sa anon/authenticated ključem ne čita ovu tabelu direktno;
-- validacija tokena ide isključivo kroz Edge Function sa service_role ključem
create policy "invites_admin_only"
  on public.invites for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
