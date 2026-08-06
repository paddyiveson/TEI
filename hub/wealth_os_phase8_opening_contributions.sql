-- Wealth OS Phase 8: "Total contributions to date" -- a one-off lump sum
-- entered when an account is set up (Adviser Workspace > Accounts),
-- representing money paid in before Wealth OS existed (e.g. transferred
-- from an old spreadsheet). Added to whatever gets logged afterwards via
-- the existing monthly Deposits widget (account_deposits/contribLog) so
-- "Investment return vs. deposits" has something to work with immediately,
-- not just once month-by-month history has been built up.
--
-- No new table, no RLS changes needed: accounts already has row-level
-- policies from Phase 2 (wealth_os_phase2_rls_writes.sql), which cover
-- every column on the row including this new one.
--
-- Safe to re-run ("if not exists" throughout).

alter table wealth_os.accounts
  add column if not exists opening_contributions numeric;
