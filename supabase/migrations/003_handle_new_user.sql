-- ============================================================
-- Faza 1c — automatsko kreiranje profila pri registraciji.
-- Supabase Auth pravi red u auth.users, ali ne i u
-- public.profiles — to mora ručno, inače RLS pravila
-- (koja proveravaju public.profiles) nemaju šta da nađu
-- za novoregistrovanog korisnika.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- full_name i phone se šalju iz registracione forme kao
-- auth metadata (signUp({ options: { data: { full_name, phone }}}))
-- — to pokrivamo u fazi 2, kod invite/registracije.
