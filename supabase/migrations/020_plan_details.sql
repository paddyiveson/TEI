-- 020: the rest of the Forecast plan (TEI Launch v2, brief 3.2).
-- NOT YET APPLIED: waiting for Paddy's go-ahead on the SQL.
--
-- Save as my plan already writes retirement_age and yearly_spending here
-- (migration 009). The v3.1 Forecast also keeps the saving rise, the
-- one-offs and the money view as the plan, and the coach's note shows
-- "Written before your changes on [date]" when the plan was saved after
-- the note, so the save date is kept too. Same pattern as 009: the app
-- sends these only once set. RLS on cashflow_settings is row-level, so no
-- policy change. Safe to rerun.

alter table wealth_os.cashflow_settings
  add column if not exists plan_saving_rise numeric,      -- % a year
  add column if not exists plan_one_offs    jsonb,        -- [{at, amt}], amt < 0 is money out
  add column if not exists plan_real        boolean,      -- true = today's money
  add column if not exists plan_saved_at    timestamptz;  -- last Save as my plan

comment on column wealth_os.cashflow_settings.plan_saving_rise is 'Forecast plan: monthly saving rises this % a year.';
comment on column wealth_os.cashflow_settings.plan_one_offs is 'Forecast plan one-offs: [{at: age, amt: pounds, negative = money out}].';
comment on column wealth_os.cashflow_settings.plan_real is 'Forecast plan money view: true = today''s money.';
comment on column wealth_os.cashflow_settings.plan_saved_at is 'When Save as my plan last ran; the coach''s note stale line compares with it.';
