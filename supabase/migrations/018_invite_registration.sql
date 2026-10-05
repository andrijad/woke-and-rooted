-- ============================================================
-- Faza 8 — registracija članova preko pozivnog linka
--
-- * Nalog može da se napravi samo uz važeći pozivni token
--   (provera je u triggeru, ne u frontendu).
-- * Pozivnica može biti vezana za ručno dodatog člana
--   (invites.member_id): pri registraciji se ta evidencija
--   (sa svim prijavama) povezuje sa novim nalogom.
-- * Nalozi se više ne prave direktno iz Supabase dashboarda.
--   Novi admin: registruj se preko linka, pa u SQL editoru:
--   update profiles set is_admin = true where email = '...';
-- ============================================================

alter table public.invites
  add column if not exists member_id uuid references public.profiles(id) on delete set null;

-- Da bi se evidencija ručnog člana mogla prebaciti na novi auth id,
-- svi strani ključevi ka profiles(id) dobijaju ON UPDATE CASCADE.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and pg_get_constraintdef(c.oid) not ilike '%on update cascade%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s on update cascade', r.tbl, r.conname, r.def);
  end loop;
end $$;

-- Javna provera pozivnice (za prikaz forme). Ne otkriva ništa osim statusa
-- i imena člana na koga je pozivnica vezana (token je tajna).
create or replace function public.get_invite_status(p_token uuid)
returns table (status text, member_name text)
language plpgsql
security definer
set search_path = public
as $$
declare inv public.invites%rowtype;
begin
  select * into inv from public.invites where token = p_token;
  if not found then
    return query select 'invalid'::text, null::text; return;
  end if;
  if inv.used_at is not null then
    return query select 'used'::text, null::text; return;
  end if;
  if inv.expires_at <= now() then
    return query select 'expired'::text, null::text; return;
  end if;
  return query
    select 'ok'::text, (select p.full_name from public.profiles p where p.id = inv.member_id and p.is_manual);
end;
$$;

grant execute on function public.get_invite_status(uuid) to anon, authenticated;

-- Pravi profil pri registraciji i troši pozivnicu.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tok uuid;
  inv public.invites%rowtype;
  meta_name text := coalesce(new.raw_user_meta_data->>'full_name', '');
  meta_phone text := nullif(new.raw_user_meta_data->>'phone', '');
begin
  begin
    tok := (new.raw_user_meta_data->>'invite_token')::uuid;
  exception when others then
    tok := null;
  end;

  if tok is null then
    raise exception 'Registracija je moguća samo preko pozivnog linka.';
  end if;

  select * into inv from public.invites
  where token = tok and used_at is null and expires_at > now()
  for update;

  if not found then
    raise exception 'Pozivni link nije važeći ili je istekao.';
  end if;

  if inv.member_id is not null
     and exists (select 1 from public.profiles where id = inv.member_id and is_manual) then
    -- povezivanje sa postojećom evidencijom
    update public.profiles
    set id = new.id,
        is_manual = false,
        email = new.email,
        phone = coalesce(phone, meta_phone),
        full_name = case when full_name = '' then meta_name else full_name end
    where id = inv.member_id;
  else
    insert into public.profiles (id, full_name, phone, email)
    values (new.id, meta_name, meta_phone, new.email);
  end if;

  update public.invites set used_at = now(), used_by = new.id where token = tok;
  return new;
end;
$$;
