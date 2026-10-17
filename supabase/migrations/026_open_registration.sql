-- 026: otvorena registracija (/registracija), blokiranje/brisanje naloga, spajanje sa evidencijom.
-- Pokrenuti POSLE 025.

alter table public.profiles add column if not exists blocked boolean not null default false;
-- Ako se novi nalog registrovao mejlom koji već postoji kod ručno dodatog člana,
-- ovde je id te evidencije; vlasnica potvrđuje spajanje (admin_merge_member).
alter table public.profiles add column if not exists merge_candidate_id uuid
  references public.profiles(id) on update cascade on delete set null;

create or replace function public.is_blocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select blocked from public.profiles where id = auth.uid()), false);
$$;

-- Blokiran nalog ne može da pravi nove prijave.
drop policy if exists "monthly_signups_not_blocked" on public.monthly_signups;
create policy "monthly_signups_not_blocked" on public.monthly_signups
  as restrictive for insert to authenticated with check (not public.is_blocked());

drop policy if exists "event_signups_not_blocked" on public.event_signups;
create policy "event_signups_not_blocked" on public.event_signups
  as restrictive for insert to authenticated with check (not public.is_blocked());

drop policy if exists "one_on_one_not_blocked" on public.one_on_one_requests;
create policy "one_on_one_not_blocked" on public.one_on_one_requests
  as restrictive for insert with check (not public.is_blocked());

-- Član ne sme sam da se odblokira.
create or replace function public.protect_profile_owner_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.nickname := old.nickname;
    new.blocked := old.blocked;
    new.merge_candidate_id := old.merge_candidate_id;
  end if;
  return new;
end;
$$;

-- Javna lista grupa sa otvorenim prijavama i brojem slobodnih mesta (za formu /registracija).
create or replace function public.get_open_groups_for_registration()
returns table (group_id uuid, name text, period date, monthly_price integer, free_spots integer, schedule text)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, gsp.period, g.monthly_price,
         greatest(g.capacity - (select count(*) from public.monthly_signups ms
                                where ms.group_id = g.id and ms.period = gsp.period), 0)::integer,
         coalesce((select string_agg(
                     (array['pon','uto','sre','čet','pet','sub','ned'])[s.weekday] || ' ' || to_char(s.start_time, 'HH24:MI'),
                     ', ' order by s.weekday)
                   from public.group_schedule s where s.group_id = g.id), '')
  from public.group_signup_periods gsp
  join public.groups g on g.id = gsp.group_id
  where gsp.is_open
    and gsp.period >= date_trunc('month', current_date)::date
    and g.active and not g.archived
  order by gsp.period, g.name;
$$;

grant execute on function public.get_open_groups_for_registration() to anon, authenticated;

-- Pravi profil pri registraciji. Stari pozivni linkovi i dalje rade; bez tokena je otvorena registracija.
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
      set id = new.id, is_manual = false, email = new.email,
          phone = coalesce(phone, meta_phone),
          full_name = case when full_name = '' then meta_name else full_name end
      where id = inv.member_id;
    else
      insert into public.profiles (id, full_name, phone, email)
      values (new.id, meta_name, meta_phone, new.email);
    end if;
    update public.invites set used_at = now(), used_by = new.id where token = tok;
    return new;
  end if;

  -- otvorena registracija
  select id into v_candidate from public.profiles
  where is_manual and lower(email) = lower(new.email)
  limit 1;

  insert into public.profiles (id, full_name, phone, email, merge_candidate_id)
  values (new.id, meta_name, meta_phone, new.email, v_candidate);

  -- opciono: izbor grupe (greška ovde ne sme da obori registraciju)
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

-- Vlasnica blokira / odblokira nalog.
create or replace function public.admin_set_blocked(p_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Samo vlasnica.'; end if;
  update public.profiles set blocked = p_blocked where id = p_id and not is_admin;
  if not found then raise exception 'Nalog nije pronađen.'; end if;
end;
$$;

-- Vlasnica briše nalog (npr. spam). Ne radi ako član ima prijave — tada ga blokiraj.
create or replace function public.admin_delete_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Samo vlasnica.'; end if;
  if exists (select 1 from public.profiles where id = p_id and is_admin) then
    raise exception 'Admin nalog se ne briše.';
  end if;
  if exists (select 1 from public.monthly_signups where member_id = p_id)
     or exists (select 1 from public.event_signups where member_id = p_id) then
    raise exception 'Nalog ima prijave. Blokiraj ga umesto brisanja.';
  end if;
  update public.one_on_one_requests set member_id = null where member_id = p_id;
  delete from auth.users where id = p_id;
end;
$$;

-- Spaja novi nalog sa ručno dodatom evidencijom (prebacuje sve prijave na novi nalog).
create or replace function public.admin_merge_member(p_new uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  r record;
  o public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Samo vlasnica.'; end if;
  select merge_candidate_id into v_old from public.profiles where id = p_new;
  if v_old is null then raise exception 'Nema evidencije za spajanje.'; end if;
  select * into o from public.profiles where id = v_old and is_manual;
  if not found then raise exception 'Evidencija više ne postoji.'; end if;

  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
      and array_length(c.conkey, 1) = 1
      and c.conrelid <> 'public.profiles'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col) using p_new, v_old;
  end loop;

  update public.profiles set
    nickname = coalesce(nickname, o.nickname),
    phone = coalesce(phone, o.phone),
    email_secondary = coalesce(email_secondary, o.email_secondary),
    merge_candidate_id = null
  where id = p_new;

  delete from public.profiles where id = v_old;
end;
$$;

-- Vlasnica odbija spajanje (to je druga osoba sa istim mejlom).
create or replace function public.admin_dismiss_merge(p_new uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Samo vlasnica.'; end if;
  update public.profiles set merge_candidate_id = null where id = p_new;
end;
$$;

revoke all on function public.admin_set_blocked(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_account(uuid) from public, anon;
revoke all on function public.admin_merge_member(uuid) from public, anon;
revoke all on function public.admin_dismiss_merge(uuid) from public, anon;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_account(uuid) to authenticated;
grant execute on function public.admin_merge_member(uuid) to authenticated;
grant execute on function public.admin_dismiss_merge(uuid) to authenticated;
