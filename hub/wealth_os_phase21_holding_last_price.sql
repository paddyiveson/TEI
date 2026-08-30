-- Wealth OS -- Phase 21: holding last live price
--
-- Adds holdings.last_price -- the raw per-share price Twelve Data
-- returned at the moment of the last "Refresh live price" (native
-- currency, USD for every ticker this app prices), captured alongside
-- the already-existing last_priced_at timestamp. Until now only the
-- *derived* total value (price x FX rate x units) was persisted; the
-- per-share price itself was discarded right after being used to
-- compute that total. Added so the Adviser Workspace's Holdings card
-- can show "what a share is actually worth" rather than only the
-- position's total value.
--
-- No RLS changes needed: holdings already has an UPDATE policy covering
-- "own row or adviser" via its account's client, and RLS in this schema
-- is row-level, not column-level, so it already covers this new column.
--
-- Safe to re-run.

alter table wealth_os.holdings
  add column if not exists last_price numeric;
