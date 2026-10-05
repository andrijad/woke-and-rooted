-- ============================================================
-- Faza 7 — (1) ispravka za samostalno biranje grupe,
--          (2) članovi bez naloga (evidencija koju vodi vlasnica)
-- ============================================================

-- (1) Stari trigger iz 002 nije dozvoljavao mesečnu prijavu ako
-- vlasnica nije prethodno rasporedila člana u grupu. Sada članovi
-- sami biraju otvorenu grupu, pa pravilo više ne važi.
-- (Jedna grupa po mesecu se i dalje nameće indeksom iz 016.)
drop trigger if exists trg_monthly_requires_membership on public.monthly_signups;

-- vlasnica sme da upiše mesečnu prijavu u ime člana
drop policy if exists "monthly_signups_insert_admin" on public.monthly_signups;
create policy "monthly_signups_insert_admin"
  on public.monthly_signups for insert
  with check (public.is_admin());

-- (2) Profil sme da postoji i bez auth naloga (ručno dodat član).
do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'f'
    and confrelid = 'auth.users'::regclass;
  if c is not null then
    execute format('alter table public.profiles drop constraint %I', c);
  end if;
end $$;

alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists is_manual boolean not null default false;

-- email postojećih naloga
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- novi nalozi odmah čuvaju email u profilu
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.email
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- vlasnica upravlja SAMO ručno dodatim članovima (is_manual)
drop policy if exists "profiles_admin_insert_manual" on public.profiles;
create policy "profiles_admin_insert_manual"
  on public.profiles for insert
  with check (public.is_admin() and is_manual and not is_admin);

drop policy if exists "profiles_admin_update_manual" on public.profiles;
create policy "profiles_admin_update_manual"
  on public.profiles for update
  using (public.is_admin() and is_manual)
  with check (public.is_admin() and is_manual and not is_admin);

drop policy if exists "profiles_admin_delete_manual" on public.profiles;
create policy "profiles_admin_delete_manual"
  on public.profiles for delete
  using (public.is_admin() and is_manual);
