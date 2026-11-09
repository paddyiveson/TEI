-- 018: asset class on each holding (Paddy, 21 Oct 2026: "record asset
-- class but it will be mainly cash or shares").
-- Applied to production 2026-10-21 as migration "018_holding_asset_class".
--
-- One of shares, cash, bonds or other; null until someone sets it. The app
-- reads null as cash for a holding with the ticker CASH and as shares for
-- everything else, so existing holdings are not changed or backfilled.
-- Used by the Portfolio Lab's Target allocation "by asset class" (B5.2).
-- RLS: holdings policies are row-level and authenticated already has
-- table-wide INSERT/SELECT/UPDATE (as 007), so no policy change.

alter table wealth_os.holdings add column if not exists asset_class text;

alter table wealth_os.holdings drop constraint if exists holdings_asset_class_check;
alter table wealth_os.holdings add constraint holdings_asset_class_check
  check (asset_class is null or asset_class in ('shares', 'cash', 'bonds', 'other'));

comment on column wealth_os.holdings.asset_class is 'shares, cash, bonds or other; null = cash for ticker CASH, otherwise shares. Used by the Lab''s Target allocation by asset class.';
