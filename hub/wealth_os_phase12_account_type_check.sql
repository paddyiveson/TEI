-- Wealth OS Phase 12: allow 'cash' (and 'other') through accounts_type_check.
--
-- Both Add-account forms (Adviser Workspace and onboarding -- #newAcctType /
-- #obNewAcctType in wealth-os.html) offer isa/gia/lisa/pension/cash/other,
-- and the app's own display maps (ACCOUNT_TYPE_LABEL, ACCT_TYPE_LABEL) have
-- included 'cash' for a while -- but the live table's check constraint,
-- accounts_type_check, was never updated to match and still rejects it:
--
--   new row for relation "accounts" violates check constraint
--   "accounts_type_check"
--
-- Confirmed via Adviser Workspace repro on 2026-08-07: adding a Cash account
-- silently fails (the insert throws, caught by addAccount()'s try/catch,
-- which should show a toast -- if it read as "nothing happens" rather than
-- an error toast, worth re-checking the browser console when this is next
-- hit, but the constraint violation itself is confirmed from the reported
-- Postgres error).
--
-- Safe to re-run (drop-then-create).

alter table wealth_os.accounts drop constraint if exists accounts_type_check;
alter table wealth_os.accounts add constraint accounts_type_check
  check (type in ('isa','gia','lisa','pension','cash','other'));
