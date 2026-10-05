-- ============================================================
-- Faza 4, deo 1 — strukturirani termini grupa i opisi.
--
-- group_schedule zamenjuje slobodan tekst (groups.time_label)
-- kao izvor istine za to KADA se grupa stvarno održava.
-- Individualni časovi (dropin_signups) smeju samo na dane koji
-- se poklapaju sa ovim rasporedom — to sprovodi trigger na dnu
-- fajla, ne samo UI (isti princip kao i do sad: baza je poslednja
-- linija odbrane, ne samo ono što frontend ponudi na izbor).
-- ============================================================

create table public.group_schedule (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  weekday     integer not null check (weekday between 1 and 7), -- 1=ponedeljak … 7=nedelja
  start_time  time not null,
  created_at  timestamptz not null default now(),
  unique (group_id, weekday)
);

alter table public.group_schedule enable row level security;

create policy "group_schedule_select_all_authenticated"
  on public.group_schedule for select
  to authenticated
  using (true);

create policy "group_schedule_write_admin_only"
  on public.group_schedule for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.group_schedule to authenticated;


-- Opisi grupa (kratak za listu, pun HTML za "Detaljnije")
alter table public.groups
  add column if not exists description_short text,
  add column if not exists description_html text;

-- Isto za događaje, pored postojeće description kolone
alter table public.events
  add column if not exists description_short text,
  add column if not exists description_html text;


-- ------------------------------------------------------------
-- Individualni čas sme samo na dan koji se poklapa sa
-- rasporedom te grupe.
-- ------------------------------------------------------------
create or replace function public.check_dropin_matches_schedule()
returns trigger as $$
begin
  if not exists (
    select 1 from public.group_schedule gs
    where gs.group_id = new.group_id
      and gs.weekday = extract(isodow from new.session_date)::integer
  ) then
    raise exception 'Ta grupa nema termin na izabrani dan.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_dropin_matches_schedule on public.dropin_signups;
create trigger trg_dropin_matches_schedule
  before insert on public.dropin_signups
  for each row execute function public.check_dropin_matches_schedule();
