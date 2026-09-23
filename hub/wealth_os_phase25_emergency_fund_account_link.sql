-- Wealth OS -- Phase 25: link the emergency fund to an account
--
-- emergency_fund_current used to be a hand-typed figure, self-reported
-- separately from the accounts it was meant to describe -- the same
-- drift problem monthly_savings/monthly_investing had before those were
-- made account-derived (see wealth-os.html's renderCalculatedSavingStats
-- comment). This adds emergency_fund_account_id so "current" can instead
-- be read live from the linked account's own balance, the one source of
-- truth the rest of the app already uses.
--
-- on delete set null (not cascade): deleting the linked account should
-- unlink the emergency fund, not delete the client's cashflow_settings
-- row along with it.
--
-- emergency_fund_current itself is kept, not dropped -- hub/wealth-os.html
-- still writes the derived figure into it on every save (a denormalised
-- mirror of the linked account's balance, useful for reporting/audit),
-- it just never accepts hand-typed input into it any more.
--
-- No RLS changes needed: same reasoning as phase23_last_viewed -- RLS on
-- cashflow_settings is row-level, already covers new columns.
--
-- Safe to re-run.

alter table wealth_os.cashflow_settings
  add column if not exists emergency_fund_account_id uuid references wealth_os.accounts(id) on delete set null;
