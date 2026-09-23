-- Wealth OS -- Phase 23: track when an adviser last opened each client
--
-- Adds last_viewed_at to clients so the "Your clients" landing page can
-- sort by most-recently-viewed instead of alphabetically. Stamped by
-- openClientAsAdviser() in hub/wealth-os.html every time an adviser opens
-- a client from the list (opening only -- not hovering/scrolling). There's
-- one shared login model here (no per-adviser distinction anywhere else in
-- this schema, see lastViewedClientId's old localStorage-only version), so
-- this is a single column, not a join table keyed by adviser.
--
-- No RLS changes needed: clients already has an UPDATE policy covering
-- "own row or adviser" (see wealth_os_phase2_rls_writes.sql,
-- clients_update_own_or_adviser) and RLS in this schema is row-level, not
-- column-level, so it already covers this new column.
--
-- Safe to re-run.

alter table wealth_os.clients
  add column if not exists last_viewed_at timestamptz;
