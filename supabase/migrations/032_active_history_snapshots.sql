-- 032: "aktivno" umesto arhivirano/objavljeno, evidencija prijava ostaje i posle brisanja grupe/događaja.
-- Pokrenuti posle 031.

-- 1) Grupe: active = aktivno (nekadašnje arhivirane postaju neaktivne). archived ostaje kao "ogledalo" (not active)
--    da bi postojeće funkcije iz ranijih migracija nastavile da rade; aplikacija koristi samo `active`.
update public.groups set active = (active and not archived);

alter table public.events add column if not exists active boolean not null default true;
update public.events set active = (published and not archived);

create or replace function public.sync_group_flags()
returns trigger language plpgsql as $$
begin
  new.archived := not new.active;
  return new;
end;
$$;
drop trigger if exists trg_sync_group_flags on public.groups;
create trigger trg_sync_group_flags before insert or update on public.groups
  for each row execute function public.sync_group_flags();

create or replace function public.sync_event_flags()
returns trigger language plpgsql as $$
begin
  new.published := new.active;
  new.archived := false;
  return new;
end;
$$;
drop trigger if exists trg_sync_event_flags on public.events;
create trigger trg_sync_event_flags before insert or update on public.events
  for each row execute function public.sync_event_flags();

update public.groups set active = active;   -- primeni ogledalo na postojeće redove
update public.events set active = active;

-- Član vidi aktivne događaje i one na koje je prijavljen (za istoriju).
drop policy if exists "events_select_published_or_admin" on public.events;
drop policy if exists "events_select_active_own_or_admin" on public.events;
create policy "events_select_active_own_or_admin" on public.events for select
  using (
    active
    or public.is_admin()
    or exists (select 1 from public.event_signups s where s.event_id = events.id and s.member_id = auth.uid())
  );

-- 2) Evidencija prijava preživljava brisanje grupe/događaja.
alter table public.monthly_signups add column if not exists group_name text;
alter table public.monthly_signups alter column group_id drop not null;
alter table public.event_signups add column if not exists event_name text;
alter table public.event_signups add column if not exists event_date_from date;
alter table public.event_signups add column if not exists event_date_to date;
alter table public.event_signups alter column event_id drop not null;

do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'f'
      and ((c.conrelid = 'public.monthly_signups'::regclass and c.confrelid = 'public.groups'::regclass)
        or (c.conrelid = 'public.event_signups'::regclass and c.confrelid = 'public.events'::regclass))
      and pg_get_constraintdef(c.oid) not ilike '%on delete set null%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s on delete set null',
                   r.tbl, r.conname, regexp_replace(r.def, '\s+ON DELETE (CASCADE|RESTRICT|NO ACTION)', '', 'i'));
  end loop;
end $$;

-- Pre brisanja upisujemo naziv/datum u prijave (FK posle toga postaje null).
create or replace function public.snapshot_group_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.monthly_signups set group_name = old.name where group_id = old.id;
  return old;
end;
$$;
drop trigger if exists trg_snapshot_group on public.groups;
create trigger trg_snapshot_group before delete on public.groups
  for each row execute function public.snapshot_group_before_delete();

create or replace function public.snapshot_event_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.event_signups
  set event_name = old.name, event_date_from = old.date_from, event_date_to = old.date_to
  where event_id = old.id;
  return old;
end;
$$;
drop trigger if exists trg_snapshot_event on public.events;
create trigger trg_snapshot_event before delete on public.events
  for each row execute function public.snapshot_event_before_delete();

-- 3) Član ne može da se prijavi na događaj čiji je datum prošao.
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
  if not found or not e.active then
    raise exception 'Događaj nije dostupan.';
  end if;
  if coalesce(e.date_to, e.date_from) < current_date then
    raise exception 'Događaj je već prošao.';
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
