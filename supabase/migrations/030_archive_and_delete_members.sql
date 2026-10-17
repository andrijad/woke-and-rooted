-- 030: arhiviranje članova; trajno brisanje samo arhiviranih (uz opciono brisanje njihovih prijava).
-- Pokrenuti posle 029.

alter table public.profiles add column if not exists archived boolean not null default false;

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
    new.archived := old.archived;
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_member_archived(p_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Samo vlasnica.'; end if;
  update public.profiles set archived = p_archived where id = p_id and not is_admin;
  if not found then raise exception 'Član nije pronađen.'; end if;
end;
$$;

-- Trajno brisanje: samo arhiviran član. Ako ima prijave, traži se potvrda (p_with_signups = true).
drop function if exists public.admin_delete_account(uuid);
create or replace function public.admin_delete_account(p_id uuid, p_with_signups boolean default false)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_archived boolean;
  v_admin boolean;
  v_count integer;
begin
  if not public.is_admin() then raise exception 'Samo vlasnica.'; end if;
  select archived, is_admin into v_archived, v_admin from public.profiles where id = p_id;
  if not found then raise exception 'Član nije pronađen.'; end if;
  if v_admin then raise exception 'Admin nalog se ne briše.'; end if;
  if not v_archived then raise exception 'Prvo arhiviraj člana.'; end if;

  select (select count(*) from public.monthly_signups where member_id = p_id)
       + (select count(*) from public.event_signups where member_id = p_id) into v_count;
  if v_count > 0 and not p_with_signups then
    raise exception 'Član ima prijave (%).', v_count;
  end if;

  delete from public.monthly_signups where member_id = p_id;
  delete from public.event_signups where member_id = p_id;
  update public.one_on_one_requests set member_id = null where member_id = p_id;
  update public.invites set used_by = null where used_by = p_id;

  delete from auth.users where id = p_id;      -- za članove sa nalogom (profil se briše kaskadno)
  delete from public.profiles where id = p_id; -- za članove bez naloga
end;
$$;

revoke all on function public.admin_set_member_archived(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_account(uuid, boolean) from public, anon;
grant execute on function public.admin_set_member_archived(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_account(uuid, boolean) to authenticated;
