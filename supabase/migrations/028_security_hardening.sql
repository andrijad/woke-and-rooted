-- 028: bezbednosno učvršćivanje (audit 2026-10-17). Pokrenuti posle 027.

-- 1) Član je mogao direktnim API pozivom da upiše svoju prijavu kao 'paid', sa proizvoljnim
--    iznosom, u zatvorenu/punu/arhiviranu grupu. Sada baza sama proverava i postavlja iznos/status.
create or replace function public.validate_member_monthly_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare g public.groups%rowtype;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;  -- vlasnica i interni trigeri

  select * into g from public.groups where id = new.group_id;
  if not found or not g.active or g.archived then
    raise exception 'Grupa nije dostupna.';
  end if;
  if new.period < date_trunc('month', current_date)::date
     or not exists (select 1 from public.group_signup_periods
                    where group_id = new.group_id and period = new.period and is_open) then
    raise exception 'Prijave za taj mesec nisu otvorene.';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.group_id::text || new.period::text));
  if g.capacity is not null
     and (select count(*) from public.monthly_signups where group_id = new.group_id and period = new.period) >= g.capacity then
    raise exception 'Grupa je popunjena.';
  end if;

  new.amount := g.monthly_price;
  new.status := 'due';
  return new;
end;
$$;

drop trigger if exists trg_validate_member_signup on public.monthly_signups;
create trigger trg_validate_member_signup before insert on public.monthly_signups
  for each row execute function public.validate_member_monthly_signup();

create or replace function public.validate_member_event_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare e public.events%rowtype;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;

  select * into e from public.events where id = new.event_id;
  if not found or not e.published or e.archived then
    raise exception 'Događaj nije dostupan.';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.event_id::text));
  if e.capacity is not null
     and (select count(*) from public.event_signups where event_id = new.event_id) >= e.capacity then
    raise exception 'Događaj je popunjen.';
  end if;

  new.amount := e.price;
  new.status := 'due';
  new.added_by_admin := false;
  return new;
end;
$$;

drop trigger if exists trg_validate_member_signup on public.event_signups;
create trigger trg_validate_member_signup before insert on public.event_signups
  for each row execute function public.validate_member_event_signup();

-- 2) Član više ne može sam da menja email, is_manual (uz nadimak i merge_candidate_id).
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
  end if;
  return new;
end;
$$;

-- 3) 1 na 1: pored limita po mejlu, i ukupni limit (zaštita od spama sa promenljivim mejlovima).
create or replace function public.limit_one_on_one_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.one_on_one_requests
      where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.one_on_one_requests
         where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'rate_limit';
  end if;
  return new;
end;
$$;

alter table public.one_on_one_requests
  add constraint one_on_one_email_format check (email ~ '^[^@[:space:]?&#]+@[^@[:space:]?&#]+$') not valid;

-- 4) Brojači kapaciteta samo za prijavljene korisnike.
revoke execute on function public.count_monthly_signups(uuid, date) from public, anon;
revoke execute on function public.count_event_signups(uuid) from public, anon;
grant execute on function public.count_monthly_signups(uuid, date) to authenticated;
grant execute on function public.count_event_signups(uuid) to authenticated;
