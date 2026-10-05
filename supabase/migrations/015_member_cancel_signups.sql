-- ============================================================
-- Faza 6, deo 1 — član može sam da poništi svoju prijavu
-- (mesečnu, individualni čas, događaj) dok vlasnica NIJE
-- potvrdila uplatu (status = 'due'). Čim je 'paid', brisanje
-- iz aplikacije više nije moguće — samo vlasnica.
-- Policy-ji se sabiraju (OR) sa postojećim admin delete policy-jima.
-- ============================================================

create policy "monthly_signups_delete_own_due"
  on public.monthly_signups for delete
  using (member_id = auth.uid() and status = 'due');

create policy "dropin_delete_own_due"
  on public.dropin_signups for delete
  using (member_id = auth.uid() and status = 'due');

create policy "event_signups_delete_own_due"
  on public.event_signups for delete
  using (member_id = auth.uid() and status = 'due');
