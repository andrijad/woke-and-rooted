-- ============================================================
-- 022 — ispravka za 021: članovi (rola authenticated) nisu imali pravo
-- nad sekvencom pa je prijava pucala sa "permission denied for sequence".
-- Funkcija sada radi kao vlasnik (SECURITY DEFINER), pa korisnici ne
-- trebaju direktan pristup sekvenci. Pokrenuti posle 021.
-- ============================================================

create or replace function public.assign_ref_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.ref_code := nextval('public.ref_code_seq')::text;
  return new;
end;
$$;
