-- ============================================================
-- Faza 2b — funkcija za admin ekran "Članovi".
--
-- Postavlja (ili menja) redovnu grupu člana. Pošto pravilo
-- kaže "samo jedna aktivna redovna grupa po članu"
-- (one_active_group_per_member iz 002), promena grupe mora
-- da bude atomarna: prvo deaktiviraj staru, pa tek onda upiši
-- novu — u istoj transakciji, da ne postoji trenutak kad je
-- član u dve grupe niti trenutak kad je unique index povređen.
--
-- p_group_id = null znači "ukloni iz svake redovne grupe",
-- korisno ako član napusti studio ili pređe samo na drop-in.
-- ============================================================

create or replace function public.admin_set_member_group(p_member_id uuid, p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Samo admin može da menja grupu člana.';
  end if;

  update public.group_memberships
  set active = false
  where member_id = p_member_id and active = true;

  if p_group_id is not null then
    insert into public.group_memberships (group_id, member_id, active)
    values (p_group_id, p_member_id, true)
    on conflict (group_id, member_id) do update set active = true;
  end if;
end;
$$;

grant execute on function public.admin_set_member_group(uuid, uuid) to authenticated;

-- Napomena: funkcija sama proverava is_admin() i baca grešku
-- za nekog ko nije admin — RLS na group_memberships bi je
-- inače sam odbio, ali eksplicitna provera daje jasniju
-- poruku o grešci na frontendu umesto generičkog RLS teksta.
