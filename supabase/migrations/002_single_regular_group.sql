-- ============================================================
-- Faza 1b — dopuna: član sme biti REDOVAN (mesečna članarina)
-- samo u jednoj grupi u isto vreme. Individualni (drop-in)
-- časovi ostaju bez ograničenja broja grupa — jedino ne u
-- grupi gde je za taj period već mesečno prijavljen
-- (to već sprečava trigger iz 001_schema.sql).
-- ============================================================

-- Član ima najviše jedno AKTIVNO redovno članstvo u grupi.
-- Admin mora prvo da deaktivira staro (active = false) pre
-- nego što doda novo — to je namerno, jer je promena redovne
-- grupe retka i svesna odluka, ne nešto što se dešava slučajno.
create unique index one_active_group_per_member
  on public.group_memberships (member_id)
  where active;

-- Mesečna prijava je moguća samo u grupi u kojoj je vlasnica
-- već zavela člana kao redovnog (group_memberships.active = true).
-- Bez ovoga bi neko mogao preko API-ja (ne kroz UI) da se mesečno
-- prijavi u grupu u koju ga vlasnica nije rasporedila.
create or replace function public.check_monthly_requires_membership()
returns trigger as $$
begin
  if not exists (
    select 1 from public.group_memberships gm
    where gm.group_id = new.group_id
      and gm.member_id = new.member_id
      and gm.active = true
  ) then
    raise exception 'Član mora prvo biti dodat u ovu grupu od strane vlasnice pre mesečne prijave.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_monthly_requires_membership
  before insert on public.monthly_signups
  for each row execute function public.check_monthly_requires_membership();
