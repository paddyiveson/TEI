-- Wealth OS Phase 7: track when a holding was last live-priced, so the
-- "Refresh live prices" batch button can offer "skip holdings priced in
-- the last hour" -- avoids re-fetching Twelve Data credits for tickers
-- that were just refreshed via the per-holding "Refresh price" button
-- moments ago, while tagging new companies one at a time.
--
-- No new table, no RLS changes needed: holdings already has row-level
-- policies from Phase 2 (wealth_os_phase2_rls_writes.sql), keyed through
-- accounts, which cover every column on the row including this new one.
--
-- Set only by TEI.wealthOS.saveHolding() when called from
-- applyLivePriceToHolding() (hub/wealth-os.html) -- never touched by the
-- regular add/edit-holding form.
--
-- Safe to re-run ("if not exists" throughout).

alter table wealth_os.holdings
  add column if not exists last_priced_at timestamptz;
