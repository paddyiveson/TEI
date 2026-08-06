-- Wealth OS Phase 9: cash balance -- money sitting in an account that
-- hasn't been put into a priced holding yet (e.g. an uninvested chunk of a
-- deposit, or dividends not yet reinvested). Without this, an account's
-- value was silently understated by however much sat in cash the moment it
-- had any holdings logged at all (syncAccountValueFromHoldings replaces the
-- account's value with the sum of its holdings, full stop) -- which also
-- threw off the deposits-based Investment return, reading uninvested cash
-- as a loss.
--
-- No new table, no RLS changes needed: accounts already has row-level
-- policies from Phase 2 (wealth_os_phase2_rls_writes.sql), which cover
-- every column on the row including this new one.
--
-- Safe to re-run ("if not exists" throughout).

alter table wealth_os.accounts
  add column if not exists cash_balance numeric;
