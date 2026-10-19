-- 045: Novi admin se postavlja iz SQL editora; preko API-ja (prijavljen korisnik) is_admin i dalje ne može da se menja.

-- Zaštita uloge: član (i bilo ko preko API-ja) ne može da menja is_admin; promena je moguća samo
-- iz SQL editora / servera (bez prijavljenog korisnika), kako bi se mogao postaviti novi admin.
create or replace function public.prevent_self_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;
revoke execute on function public.prevent_self_admin_escalation() from public, anon, authenticated;
