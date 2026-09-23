-- Wealth OS Phase 24: add 'crypto' as a new account type.
--
-- Crypto accounts are manual-valuation only (no price API) -- they hold a
-- list of holdings in the existing wealth_os.holdings table (coin name/
-- ticker, optional units, GBP value) exactly like an ISA/GIA/LISA holding
-- does, so no new columns are needed there. The only schema change is
-- extending accounts_type_check to accept the new type, following the same
-- drop-then-recreate pattern as Phase 12 (cash/other) and Phase 15
-- (cash_isa) -- both #newAcctType (Adviser Workspace) and #obNewAcctType
-- (onboarding) in wealth-os.html already offer a "Crypto" option, and the
-- app's display maps (ACCOUNT_TYPE_LABEL, ACCT_TYPE_LABEL) already include
-- it -- this migration brings the live constraint in line with them, same
-- JS/DB drift the account-type check has needed patching for before.
--
-- Crypto is always unwrapped/taxable: it's simply not one of the ISA/
-- pension type values, so it can never be selected as either, and it's
-- deliberately left out of isaAccounts/liquidTotal's hardcoded
-- ('isa'/'gia') filters the same way cash_isa already is (see the comment
-- above COMP_PALETTE in wealth-os.html).
--
-- Safe to re-run (drop-then-create).

alter table wealth_os.accounts drop constraint if exists accounts_type_check;
alter table wealth_os.accounts add constraint accounts_type_check
  check (type in ('isa','gia','lisa','pension','cash','cash_isa','crypto','other'));
