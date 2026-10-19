-- 041: Bezbednosna dopuna (audit 2026-10-18).

-- 1) Javna forma za 1 na 1 šalje mejl na upisanu adresu. Pored postojećeg limita (3 upita po mejlu na sat)
--    dodajemo ukupan limit za goste, da bot ne bi mogao da potroši dnevnu kvotu mejlova i ugrozi
--    isporuku mejlova o prijavama i uplatama.
create or replace function public.limit_one_on_one_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.one_on_one_requests
      where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'rate_limit';
  end if;
  if new.member_id is null and (select count(*) from public.one_on_one_requests
      where member_id is null and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limit';
  end if;
  return new;
end;
$$;

-- 2) Notifikacije: ograničena dužina teksta (ime iz registracije je slobodan unos).
create or replace function public.notify_user(p_user uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_body is null then return; end if;
  if exists (select 1 from public.profiles where id = p_user and not is_manual) then
    insert into public.notifications (user_id, body) values (p_user, left(p_body, 500));
  end if;
end;
$$;
revoke execute on function public.notify_user(uuid, text) from public, anon, authenticated;

create or replace function public.notify_admins(p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, body)
  select id, left(p_body, 500) from public.profiles where is_admin;
end;
$$;
revoke execute on function public.notify_admins(text) from public, anon, authenticated;

-- 3) Pomoćna funkcija sa tokenom za odjavu ne treba da bude dostupna preko API-ja.
revoke execute on function public.unsubscribe_url(public.profiles) from public, anon, authenticated;

-- 4) Ime i telefon iz registracije: razumna dužina (ne dira postojeće podatke).
alter table public.profiles drop constraint if exists profiles_full_name_len;
alter table public.profiles add constraint profiles_full_name_len
  check (full_name is null or char_length(full_name) <= 120) not valid;
alter table public.profiles drop constraint if exists profiles_phone_len;
alter table public.profiles add constraint profiles_phone_len
  check (phone is null or char_length(phone) <= 60) not valid;
