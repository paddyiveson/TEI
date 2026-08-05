-- Wealth OS Phase 6: "Build a Business" goal type — link a goal to one
-- specific income entry (e.g. a Self-Employed or Business Venture Income
-- source) instead of always tracking total household income.
--
-- No new table, no RLS changes needed: goals already has row-level policies
-- from Phase 2 (wealth_os_phase2_rls_writes.sql) scoped by client_id, which
-- cover every column on the row including this new one.
--
-- Safe to re-run ("if not exists" / "or replace" throughout).

alter table wealth_os.goals
  add column if not exists linked_income_id uuid references wealth_os.income(id) on delete set null;
