-- Wealth OS -- Phase 20: profile edit tracking
--
-- Adds last_edited_by/last_edited_at to clients, matching the pattern
-- already used on accounts/holdings/goals/income (see clientPersonalToRow
-- and TEI.calc.stampEdit in hub/wealth-os.html). Until now, edits made to
-- personal/contact fields via Adviser Workspace -> Manual Entry -> Profile
-- never actually persisted to Supabase at all -- the only way they took
-- effect was downloading the JSON export and re-importing it by hand (see
-- savePersonal() in wealth-os.html). This migration, together with the
-- app fix, makes Profile saves real, and lets a client's own edits there
-- surface in the adviser's existing "Client Updates" tab the same way
-- account/holding/goal edits already do.
--
-- No RLS changes needed: clients already has an UPDATE policy covering
-- "own row or adviser" (see wealth_os_phase2_rls_writes.sql,
-- clients_update_own_or_adviser) and RLS in this schema is row-level, not
-- column-level, so it already covers these two new columns.
--
-- Safe to re-run.

alter table wealth_os.clients
  add column if not exists last_edited_by text,
  add column if not exists last_edited_at timestamptz;
