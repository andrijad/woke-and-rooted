-- ============================================================
-- 021 — poziv na broj = jedinstven brojač za ceo sistem
-- Svaka nova prijava (mesečna, individualni čas, događaj) dobija
-- sledeći broj iz jedne sekvence (1001, 1002, ...). Dodeljuje ga baza
-- (trigger), aplikacija ga samo prikazuje. Vlasnica u pregledu vidi
-- broj uz svaku prijavu.
-- Pokrenuti posle 020. Prijave sa statusom 'due' dobijaju nov broj,
-- plaćene se ne diraju. Kolone iz 020 (member_no, event_no) više
-- nisu potrebne i brišu se.
-- ============================================================

create sequence if not exists public.ref_code_seq start 1001;

create or replace function public.assign_ref_code()
returns trigger
language plpgsql
as $$
begin
  new.ref_code := nextval('public.ref_code_seq')::text;
  return new;
end;
$$;

alter table public.monthly_signups alter column ref_code set default '';
alter table public.dropin_signups  alter column ref_code set default '';
alter table public.event_signups   alter column ref_code set default '';

drop trigger if exists trg_assign_ref_code on public.monthly_signups;
create trigger trg_assign_ref_code before insert on public.monthly_signups
  for each row execute function public.assign_ref_code();

drop trigger if exists trg_assign_ref_code on public.dropin_signups;
create trigger trg_assign_ref_code before insert on public.dropin_signups
  for each row execute function public.assign_ref_code();

drop trigger if exists trg_assign_ref_code on public.event_signups;
create trigger trg_assign_ref_code before insert on public.event_signups
  for each row execute function public.assign_ref_code();

-- postojeće neplaćene prijave: novi brojevi po redosledu nastanka
update public.monthly_signups set ref_code = nextval('public.ref_code_seq')::text where status = 'due';
update public.dropin_signups  set ref_code = nextval('public.ref_code_seq')::text where status = 'due';
update public.event_signups   set ref_code = nextval('public.ref_code_seq')::text where status = 'due';

drop index if exists public.profiles_member_no_key;
drop index if exists public.events_event_no_key;
alter table public.profiles drop column if exists member_no;
alter table public.events  drop column if exists event_no;
