-- Phase 14: "Mark reviewed" for the contribution-vs-holdings discrepancy
-- check (Portfolio Overview flags / Adviser Workspace Accounts list).
-- Stores the diff at the moment an adviser investigated and accepted a gap
-- as explained, so the flag can be suppressed without silencing the
-- account forever -- app code re-flags if the gap later drifts meaningfully
-- from what was accepted (see TEI.calc.isDiscrepancyDismissed in
-- hub/wealth-os.html). No RLS changes needed: covered by the existing
-- accounts UPDATE policies from Phase 2.

alter table wealth_os.accounts
  add column if not exists discrepancy_dismissed_amount numeric,
  add column if not exists discrepancy_dismissed_at timestamptz;
