-- Wealth OS Phase 15: Cash ISA type + interest rate / fixed-term fields on accounts.
--
-- Adds a new 'cash_isa' account type alongside the existing 'cash' type
-- (which is being relabelled "Current / Deposit Account" client-side --
-- no data migration needed, the stored type value is unchanged).
--
-- New columns support an optional interest rate on cash-flavoured accounts
-- (type in ('cash','cash_isa')), with a variable/fixed distinction and an
-- optional maturity date for fixed-rate/fixed-term products. Accrued
-- interest is tracked separately from `value` (interest_accrued_to_date)
-- so it can be surfaced as its own line in Investment return and excluded
-- from the contribution-discrepancy nudge, rather than showing up as an
-- unexplained balance gap. last_accrued_at prevents double-crediting
-- across repeated loads.
--
-- Safe to re-run (add-if-not-exists / drop-then-create).

alter table wealth_os.accounts add column if not exists interest_rate numeric;
alter table wealth_os.accounts add column if not exists rate_type text;
alter table wealth_os.accounts add column if not exists maturity_date date;
alter table wealth_os.accounts add column if not exists interest_accrued_to_date numeric default 0;
alter table wealth_os.accounts add column if not exists last_accrued_at timestamptz;

alter table wealth_os.accounts drop constraint if exists accounts_rate_type_check;
alter table wealth_os.accounts add constraint accounts_rate_type_check
  check (rate_type is null or rate_type in ('variable','fixed'));

alter table wealth_os.accounts drop constraint if exists accounts_type_check;
alter table wealth_os.accounts add constraint accounts_type_check
  check (type in ('isa','gia','lisa','pension','cash','cash_isa','other'));
