-- 044: Potpis vlasnice u porukama („Maja te je dodala…“, „Uplatu potvrđuje Maja“).
-- Ako radnju radi admin — njegov nadimak. Inače: admin koji ima nadimak (vlasnica), pa najstariji admin.
create or replace function public.owner_display_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(nullif(nickname, ''), full_name) from public.profiles where id = auth.uid() and is_admin),
    (select nickname from public.profiles where is_admin and nullif(nickname, '') is not null order by created_at limit 1),
    (select full_name from public.profiles where is_admin order by created_at limit 1),
    'Woke & Rooted')
$$;
revoke execute on function public.owner_display_name() from public, anon, authenticated;
