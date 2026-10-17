-- ============================================================
-- 024 — 1 na 1 seanse: upiti sa upitnikom
-- Upit može da pošalje gost (bez naloga) ili član. Vlasnica u adminu
-- dogovori termin (offline), sistem dodeli poziv na broj, a posle
-- uplate ona ažurira status. Gost prati status preko privatnog
-- linka (access_token), bez prijave.
-- Statusi: new → scheduled → paid  (+ cancelled)
-- Pokrenuti posle 022 (023 nije preduslov).
-- ============================================================

-- cena seanse (jedan iznos za sve) — vlasnica je menja u adminu
alter table public.studio_settings
  add column if not exists session_price integer check (session_price is null or session_price >= 0);

create table public.one_on_one_requests (
  id              uuid primary key default gen_random_uuid(),
  access_token    uuid not null unique,                  -- generiše ga aplikacija
  member_id       uuid references public.profiles(id) on update cascade on delete set null,
  full_name       text not null check (char_length(full_name) between 1 and 120),
  email           text not null check (char_length(email) between 3 and 200),
  phone           text check (phone is null or char_length(phone) <= 60),
  session_type    text not null check (char_length(session_type) <= 80),
  first_time      boolean not null,
  topic           text not null check (char_length(topic) between 1 and 1500),
  preferred_times text check (preferred_times is null or char_length(preferred_times) <= 300),
  mode            text not null check (mode in ('uzivo','online','svejedno')),
  message         text check (message is null or char_length(message) <= 2000),
  consent         boolean not null check (consent),
  status          text not null default 'new' check (status in ('new','scheduled','paid','cancelled')),
  scheduled_at    timestamptz,
  amount          integer,
  ref_code        text,
  created_at      timestamptz not null default now()
);

create index one_on_one_requests_member_idx on public.one_on_one_requests (member_id);
create index one_on_one_requests_status_idx on public.one_on_one_requests (status, created_at desc);

alter table public.one_on_one_requests enable row level security;

-- slanje upita: gost i član; ne mogu da postave status/termin/iznos/poziv
create policy "oneonone_insert_public"
  on public.one_on_one_requests for insert
  to anon, authenticated
  with check (
    status = 'new' and scheduled_at is null and amount is null and ref_code is null
    and (member_id is null or member_id = auth.uid())
  );

create policy "oneonone_select_own_or_admin"
  on public.one_on_one_requests for select
  to authenticated
  using (member_id = auth.uid() or public.is_admin());

create policy "oneonone_update_admin"
  on public.one_on_one_requests for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "oneonone_delete_admin"
  on public.one_on_one_requests for delete
  to authenticated
  using (public.is_admin());

grant insert on public.one_on_one_requests to anon;
grant select, insert, update, delete on public.one_on_one_requests to authenticated;

-- zaštita od spama: najviše 3 upita sa istog mejla u satu
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
  return new;
end;
$$;

create trigger trg_one_on_one_rate before insert on public.one_on_one_requests
  for each row execute function public.limit_one_on_one_rate();

-- poziv na broj iz zajedničkog brojača, tek kad se termin zakaže
create or replace function public.assign_one_on_one_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'scheduled' and (new.ref_code is null or new.ref_code = '') then
    new.ref_code := nextval('public.ref_code_seq')::text;
  end if;
  return new;
end;
$$;

create trigger trg_one_on_one_ref before update on public.one_on_one_requests
  for each row execute function public.assign_one_on_one_ref();

-- status za goste: samo ko ima token vidi svoj upit; podaci za uplatu
-- se vraćaju tek kad je termin zakazan
create or replace function public.get_one_on_one_status(p_token uuid)
returns table (
  status text, scheduled_at timestamptz, amount integer, ref_code text,
  session_type text, created_at timestamptz,
  account_number text, recipient_name text, purpose_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.status, r.scheduled_at, r.amount, r.ref_code, r.session_type, r.created_at,
         case when r.status = 'scheduled' then s.account_number end,
         case when r.status = 'scheduled' then s.recipient_name end,
         case when r.status = 'scheduled' then s.purpose_code end
  from public.one_on_one_requests r
  cross join public.studio_settings s
  where r.access_token = p_token and s.id = 1;
$$;

grant execute on function public.get_one_on_one_status(uuid) to anon, authenticated;
