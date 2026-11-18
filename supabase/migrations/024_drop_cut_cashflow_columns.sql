-- 024: drop cashflow_settings columns for features cut in the V2 revamp.
--
-- NOT APPLIED. For Paddy to apply after sign-off of PR v2/audit-fixes,
-- once that PR's Wealth OS code is live (it no longer loads or saves these).
--
--   scenario, best_mult, worst_mult  the old Cashflow Best / Base / Worst switch
--   monte_carlo                      the old Forecast 5 / 8 / 15% return-line choices
--
-- Checked read-only on 18 Nov 2026:
--   * every client is on scenario 'base' (no client used Best or Worst);
--   * all four columns are NOT NULL with a default, so the page can stop
--     sending them before this runs, and new rows still insert;
--   * no view, function or Cortex (admin/) code reads them.
-- Safe to re-run.

alter table wealth_os.cashflow_settings
  drop column if exists scenario,
  drop column if exists best_mult,
  drop column if exists worst_mult,
  drop column if exists monte_carlo;
