-- Wealth OS Phase 11: dividend payment frequency -- how often a holding
-- actually pays (monthly, quarterly, semi-annually, annually), used to
-- compound the "reinvested" dividend income forecast at the holding's real
-- schedule instead of assuming everything reinvests once a year. A monthly
-- payer (e.g. JEPQ) reinvests, and so compounds, 12x/yr at the same nominal
-- yield -- meaningfully more than an annual payer -- so the old once-a-year
-- assumption understated what monthly/quarterly payers would really return
-- if reinvested. See TEI.data.DIVIDEND_FREQUENCY_OPTIONS in wealth-os.html.
--
-- Plain text column (not an enum) to match every other lookup-style column
-- on this table (e.g. no enum for account type either) -- the fixed set of
-- valid values lives in the app, same pattern as elsewhere in this schema.
--
-- Defaults to 'annual' for both new rows and the backfill below, matching
-- the compounding this app already assumed before frequency was tracked --
-- existing holdings' numbers don't silently change until someone sets each
-- one's real payment schedule in the UI.
--
-- No RLS changes needed: dividend_holdings already has row-level policies
-- from Phase 2 (wealth_os_phase2_rls_writes.sql) covering every column on
-- the row, this included.
--
-- Safe to re-run ("if not exists" throughout).

alter table wealth_os.dividend_holdings
  add column if not exists frequency text not null default 'annual';

update wealth_os.dividend_holdings set frequency = 'annual' where frequency is null;
