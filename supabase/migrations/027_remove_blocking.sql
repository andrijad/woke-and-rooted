-- 027: blokiranje naloga se ukida (vlasnici nije potrebno). Pokrenuti posle 026.

drop policy if exists "monthly_signups_not_blocked" on public.monthly_signups;
drop policy if exists "event_signups_not_blocked" on public.event_signups;
drop policy if exists "one_on_one_not_blocked" on public.one_on_one_requests;

drop function if exists public.admin_set_blocked(uuid, boolean);
drop function if exists public.is_blocked();

create or replace function public.protect_profile_owner_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.nickname := old.nickname;
    new.merge_candidate_id := old.merge_candidate_id;
  end if;
  return new;
end;
$$;

alter table public.profiles drop column if exists blocked;

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
    raise exception 'Nalog ima prijave. Prvo ukloni prijave u tabu „Termini i uplate“.';
  end if;
  update public.one_on_one_requests set member_id = null where member_id = p_id;
  delete from auth.users where id = p_id;
end;
$$;
