-- Wealth OS: account portfolio settings (set-and-forget / earmarked)
-- Applied to production 2026-10-06 as migration "add_account_portfolio_flags".
--
-- Two independent yes/no settings on an account, both chosen by the user in
-- Manual Entry -> Accounts -> "More options". Neither changes any total:
-- they only let the Portfolio treemap (and the Lab, which models whatever
-- the treemap shows) hide that account's holdings via the "Hide
-- set-and-forget" / "Hide earmarked" chips.
--
-- Separate from the pension contribution engine's is_manual_priced /
-- has_contribution_rule (005) -- do not merge with those.
--
-- No backfill and no per-type defaults: every existing row is false.
-- RLS: accounts policies are row-level (adviser via is_adviser(), client via
-- clients.user_id = auth.uid()) and authenticated has table-wide
-- INSERT/SELECT/UPDATE, so both roles can read/write these columns with no
-- policy change.

alter table wealth_os.accounts
  add column set_and_forget boolean not null default false,
  add column earmarked boolean not null default false;
comment on column wealth_os.accounts.set_and_forget is 'User says this account is set-and-forget (not actively managed). Excluded from treemap when the hide-set-and-forget filter is on. Still counts in total wealth.';
comment on column wealth_os.accounts.earmarked is 'Money earmarked for a near-term use (e.g. LISA for house deposit). Excluded from treemap when the hide-earmarked filter is on. Still counts in total wealth.';
