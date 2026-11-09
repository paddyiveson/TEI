-- 019: debt details for the Wealth page Debts row and the Cashflow Debts
-- tile (TEI Launch v2, brief section 3.5). Shown to Paddy 9 Nov 2026.
--
-- Field names follow the Debt and Opportunity Cost Lab (name, apr, minPay,
-- term, rateType, changeMonth/newApr), snake_cased. The Lab's "rate changes
-- in N months" is stored as a date (change_date) so it does not drift as
-- months pass. One change point covers both a fix ending (rate_type fixed)
-- and a 0% period ending (rate_type promo, apr 0, new_apr the revert rate).
-- type keeps its existing values (mortgage, loan, credit, other).
-- RLS: wealth_liabilities policies are row-level (client or adviser), so the
-- new columns are covered with no policy change. Safe to rerun.

alter table wealth_os.wealth_liabilities
  add column if not exists name        text,
  add column if not exists apr         numeric,
  add column if not exists min_pay     numeric,
  add column if not exists term_months integer,
  add column if not exists end_date    date,
  add column if not exists rate_type   text,
  add column if not exists change_date date,
  add column if not exists new_apr     numeric;

alter table wealth_os.wealth_liabilities drop constraint if exists wealth_liabilities_rate_type_check;
alter table wealth_os.wealth_liabilities add constraint wealth_liabilities_rate_type_check
  check (rate_type is null or rate_type in ('fixed', 'variable', 'promo'));

comment on column wealth_os.wealth_liabilities.apr is 'Interest rate, % a year (as the Debt Lab).';
comment on column wealth_os.wealth_liabilities.min_pay is 'Monthly payment, £.';
comment on column wealth_os.wealth_liabilities.term_months is 'Months left, when no end_date is given.';
comment on column wealth_os.wealth_liabilities.change_date is 'When the fixed rate or the 0% period ends.';
comment on column wealth_os.wealth_liabilities.new_apr is 'Rate after change_date, % a year.';
