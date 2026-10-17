-- 025: nadimak + dodatni mejl na profilu, izmena podataka člana od strane vlasnice.

alter table public.profiles add column if not exists nickname text;
alter table public.profiles add column if not exists email_secondary text;

-- Nadimak može da menja samo vlasnica (član preko profiles_update_own ne sme).
create or replace function public.protect_profile_owner_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.nickname := old.nickname;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_owner_fields on public.profiles;
create trigger protect_profile_owner_fields
  before update on public.profiles
  for each row execute function public.protect_profile_owner_fields();

-- Vlasnica menja podatke bilo kog člana (ne i admina).
-- Email za prijavu (auth) se ne menja ovde: menja se samo za ručno dodate članove.
create or replace function public.admin_update_member(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_nickname text,
  p_email_secondary text,
  p_email text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manual boolean;
  v_admin boolean;
begin
  if not public.is_admin() then
    raise exception 'Samo vlasnica može da menja podatke članova.';
  end if;
  select is_manual, is_admin into v_manual, v_admin from public.profiles where id = p_id;
  if not found then
    raise exception 'Član nije pronađen.';
  end if;
  if v_admin then
    raise exception 'Admin nalog se ne menja ovde.';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Ime i prezime je obavezno.';
  end if;

  update public.profiles set
    full_name = trim(p_full_name),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    nickname = nullif(trim(coalesce(p_nickname, '')), ''),
    email_secondary = nullif(lower(trim(coalesce(p_email_secondary, ''))), ''),
    email = case when v_manual then nullif(lower(trim(coalesce(p_email, ''))), '') else email end
  where id = p_id;
end;
$$;

revoke all on function public.admin_update_member(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.admin_update_member(uuid, text, text, text, text, text) to authenticated;
