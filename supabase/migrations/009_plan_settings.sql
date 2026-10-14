-- Wealth OS: Plan settings (redesign spec B9.4, B9.7)
-- NOT YET APPLIED. Apply before using Forecast's "Save as my plan".
--
-- Two client-editable figures, saved from Forecast's Adjust strip ("Save as
-- my plan", B7.2) and, from phase B12.9, from Settings > Plan settings:
--   retirement_age   planned retirement age, 55 to 68 in the app
--   yearly_spending  yearly spending in independence, in pounds. The FI
--                    number is fi_multiple (25 by default) times this, unless
--                    fi_override is set.
-- Both stay null until the client saves them; until then the app uses its
-- default retirement age and today's spending from Cashflow (annualSpend,
-- which is worked out from the expense lines, not stored).
--
-- They live on cashflow_settings next to fi_multiple / fi_override /
-- wealth_conversion_target (the existing preferences), as B9.4 asks, so no
-- new table. The app only sends these columns once they hold a value, so
-- other cashflow_settings saves keep working before this is applied.
-- RLS: cashflow_settings policies are row-level (hub/wealth_os_phase2_rls_writes.sql: adviser via is_adviser(),
-- client via clients.user_id = auth.uid()); new columns need no change.

alter table wealth_os.cashflow_settings
  add column retirement_age smallint check (retirement_age between 40 and 80),
  add column yearly_spending numeric(12,2) check (yearly_spending >= 0);
comment on column wealth_os.cashflow_settings.retirement_age is 'Planned retirement age (Plan settings, B9.4). Null until the client saves one.';
comment on column wealth_os.cashflow_settings.yearly_spending is 'Yearly spending in independence, GBP (Plan settings, B9.4). FI number = fi_multiple x this unless fi_override is set. Null until saved.';
