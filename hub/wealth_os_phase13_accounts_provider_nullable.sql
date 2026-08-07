-- Wealth OS Phase 13: accounts.provider must allow NULL.
--
-- The "Provider" field on both Add-account forms (Adviser Workspace and
-- onboarding) is optional -- accountToRow sends `a.provider || null` -- but
-- the live column is NOT NULL, so any account added without a provider
-- typed in fails outright:
--
--   null value in column "provider" of relation "accounts" violates
--   not-null constraint
--
-- (Existing accounts presumably all happen to have a provider filled in,
-- which is why this hadn't surfaced before now.)
--
-- Safe to re-run.

alter table wealth_os.accounts alter column provider drop not null;
