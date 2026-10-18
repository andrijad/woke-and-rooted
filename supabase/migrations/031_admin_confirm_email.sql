-- 031: vlasnica ručno potvrđuje email člana (kad mejl ode u spam ili ga član ne vidi).
-- Postavlja email_confirmed_at u auth.users, pa član može da se prijavi; trigger iz 029 ažurira profil.
-- Pokrenuti posle 030.

create or replace function public.admin_confirm_email(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Samo vlasnica.'; end if;
  if exists (select 1 from public.profiles where id = p_id and (is_manual or is_admin)) then
    raise exception 'Ovaj član nema nalog za potvrdu.';
  end if;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = p_id;
  if not found then raise exception 'Nalog nije pronađen.'; end if;
  update public.profiles set email_verified = true where id = p_id;
end;
$$;

revoke all on function public.admin_confirm_email(uuid) from public, anon;
grant execute on function public.admin_confirm_email(uuid) to authenticated;
