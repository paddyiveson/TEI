-- Diagnostic only -- not a migration, nothing to "run and forget". Paste the
-- result back. Lists every NOT NULL column (excluding primary keys) across
-- the tables the onboarding/adviser forms write optional values into, so we
-- can cross-check against the app's row-mapper functions in one pass instead
-- of hitting these one at a time in production.
select table_name, column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'wealth_os'
  and table_name in (
    'accounts','holdings','goals','income','wealth_assets','wealth_liabilities',
    'dividend_holdings','cashflow_settings','clients'
  )
  and is_nullable = 'NO'
  and column_default is null
  and column_name not in ('id','client_id','account_id','holding_id','goal_id')
order by table_name, column_name;
