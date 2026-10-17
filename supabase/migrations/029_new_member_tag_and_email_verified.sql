-- 029: oznaka „nov član“ i status verifikacije mejla u profilu. Pokrenuti posle 028.

alter table public.profiles add column if not exists is_new boolean not null default false;
alter table public.profiles add column if not exists email_verified boolean not null default false;

-- Postojeći nalozi: verifikacija iz auth tabele; nove registracije iz poslednjih 14 dana dobijaju oznaku.
update public.profiles p set email_verified = true
from auth.users u where u.id = p.id and u.email_confirmed_at is not null;

update public.profiles set is_new = true
where not is_manual and not is_admin and created_at > now() - interval '14 days';

-- Sinhronizacija verifikacije mejla (kad član klikne link u mejlu).
create or replace function public.sync_email_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null then
    update public.profiles set email_verified = true where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.sync_email_verified();

-- Član ne sme sam da menja ni is_new ni email_verified.
create or replace function public.protect_profile_owner_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.nickname := old.nickname;
    new.merge_candidate_id := old.merge_candidate_id;
    new.is_manual := old.is_manual;
    new.email := old.email;
    new.is_new := old.is_new;
    new.email_verified := old.email_verified;
  end if;
  return new;
end;
$$;

-- Registracija: nov član + status verifikacije (ostalo kao u 026).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tok uuid;
  inv public.invites%rowtype;
  meta_name text := trim(coalesce(new.raw_user_meta_data->>'full_name', ''));
  meta_phone text := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  v_group uuid;
  v_period date;
  v_group_row public.groups%rowtype;
  v_candidate uuid;
  v_verified boolean := new.email_confirmed_at is not null;
begin
  if meta_name = '' then
    raise exception 'Ime i prezime je obavezno.';
  end if;

  begin
    tok := (new.raw_user_meta_data->>'invite_token')::uuid;
  exception when others then
    tok := null;
  end;

  if tok is not null then
    select * into inv from public.invites
    where token = tok and used_at is null and expires_at > now()
    for update;
    if not found then
      raise exception 'Pozivni link nije važeći ili je istekao.';
    end if;

    if inv.member_id is not null
       and exists (select 1 from public.profiles where id = inv.member_id and is_manual) then
      update public.profiles
      set id = new.id, is_manual = false, email = new.email, email_verified = v_verified,
          phone = coalesce(phone, meta_phone),
          full_name = case when full_name = '' then meta_name else full_name end
      where id = inv.member_id;
    else
      insert into public.profiles (id, full_name, phone, email, email_verified, is_new)
      values (new.id, meta_name, meta_phone, new.email, v_verified, true);
    end if;
    update public.invites set used_at = now(), used_by = new.id where token = tok;
    return new;
  end if;

  select id into v_candidate from public.profiles
  where is_manual and lower(email) = lower(new.email)
  limit 1;

  insert into public.profiles (id, full_name, phone, email, merge_candidate_id, email_verified, is_new)
  values (new.id, meta_name, meta_phone, new.email, v_candidate, v_verified, true);

  begin
    v_group := (new.raw_user_meta_data->>'group_id')::uuid;
    v_period := (new.raw_user_meta_data->>'period')::date;
  exception when others then
    v_group := null;
  end;

  if v_group is not null and v_period is not null and v_candidate is null then
    begin
      select g.* into v_group_row from public.groups g
      where g.id = v_group and g.active and not g.archived;
      if found
         and exists (select 1 from public.group_signup_periods
                     where group_id = v_group and period = v_period and is_open
                       and period >= date_trunc('month', current_date)::date)
         and (select count(*) from public.monthly_signups where group_id = v_group and period = v_period) < v_group_row.capacity
      then
        insert into public.monthly_signups (group_id, member_id, period, amount, status)
        values (v_group, new.id, v_period, v_group_row.monthly_price, 'due');
      end if;
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

-- Vlasnica dodeli člana u grupu/na događaj → oznaka „nov član“ se skida.
create or replace function public.clear_new_on_admin_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and public.is_admin() then
    update public.profiles set is_new = false where id = new.member_id and is_new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_clear_new on public.monthly_signups;
create trigger trg_clear_new after insert on public.monthly_signups
  for each row execute function public.clear_new_on_admin_signup();
drop trigger if exists trg_clear_new on public.event_signups;
create trigger trg_clear_new after insert on public.event_signups
  for each row execute function public.clear_new_on_admin_signup();

-- Izmena člana: dodat parametar is_new (stara verzija se zamenjuje).
drop function if exists public.admin_update_member(uuid, text, text, text, text, text);
create or replace function public.admin_update_member(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_nickname text,
  p_email_secondary text,
  p_email text default null,
  p_is_new boolean default null
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
    email = case when v_manual then nullif(lower(trim(coalesce(p_email, ''))), '') else email end,
    is_new = coalesce(p_is_new, is_new)
  where id = p_id;
end;
$$;

revoke all on function public.admin_update_member(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_update_member(uuid, text, text, text, text, text, boolean) to authenticated;
