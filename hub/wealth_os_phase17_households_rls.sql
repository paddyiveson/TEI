-- Wealth OS Phase 17: RLS for wealth_os.households.
--
-- Phase 16 created the table but left RLS off -- every other table in this
-- schema has RLS enabled (see list_tables), so this closes that gap before
-- any client-facing household read path goes live in Phase 16's follow-up
-- UI work. Same ownership rule as everywhere else: an adviser can do
-- anything; a client can only read (never write) the household row their
-- own clients.household_id points at. Household writes (create/link/
-- rename) are adviser-only -- clients never create or edit a household
-- directly.
--
-- Safe to re-run (drop-then-create by fixed policy name).

alter table wealth_os.households enable row level security;

drop policy if exists households_select_own_or_adviser on wealth_os.households;
create policy households_select_own_or_adviser on wealth_os.households
for select
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.clients c
    where c.household_id = households.id and c.user_id = auth.uid()
  )
);

drop policy if exists households_write_adviser_only on wealth_os.households;
create policy households_write_adviser_only on wealth_os.households
for all
using (wealth_os.is_adviser())
with check (wealth_os.is_adviser());
