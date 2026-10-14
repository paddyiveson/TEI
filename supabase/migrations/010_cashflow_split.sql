-- Wealth OS: essentials / lifestyle and the monthly cashflow split
-- (redesign spec B8, B9.7). NOT YET APPLIED. Apply before using Cashflow's
-- "Update this month" panel or tagging an expense as lifestyle.
--
-- 1. expenses.spend_category: 'essential' or 'lifestyle' (B9.7). The table's
--    own `category` column is already the fixed / variable split, so this is
--    a separate column. Existing rows default to essential, as the spec says.
--    Set in Manual Entry (and, from B12.9, Settings). Cashflow's essentials
--    and lifestyle totals sum by it.
-- 2. cashflow_months.essentials / lifestyle / wealth_building: the split that
--    Cashflow's Update this month panel saves for a month (take-home stays in
--    actual_income; actual_expenses is still written as essentials +
--    lifestyle, so anything reading the older shape keeps working). Null on
--    months logged before this, which the app splits as the standing
--    expense lines are.
--
-- The app only sends spend_category for lifestyle rows (or rows that already
-- have one), so expense saves keep working before this is applied. The panel
-- always sends the split, so it fails until this is applied.
-- RLS: policies are row-level, so new columns need no change. cashflow_months:
-- hub/wealth_os_phase4_client_logging.sql. expenses: its policies are not in
-- this repo; hub/wealth_os_phase18_joint_expenses.sql added the owner column
-- the same way with no policy change.

alter table wealth_os.expenses
  add column spend_category text not null default 'essential'
    check (spend_category in ('essential', 'lifestyle'));
comment on column wealth_os.expenses.spend_category is 'Essential or lifestyle (redesign B9.7). Separate from category, which is fixed / variable.';

alter table wealth_os.cashflow_months
  add column essentials numeric(12,2) check (essentials >= 0),
  add column lifestyle numeric(12,2) check (lifestyle >= 0),
  add column wealth_building numeric(12,2) check (wealth_building >= 0);
comment on column wealth_os.cashflow_months.essentials is 'Essentials spent this month, from Cashflow > Update this month (B8).';
comment on column wealth_os.cashflow_months.lifestyle is 'Lifestyle spent this month, from Cashflow > Update this month (B8).';
comment on column wealth_os.cashflow_months.wealth_building is 'Saved or invested this month, cash included, from Cashflow > Update this month (B8).';
