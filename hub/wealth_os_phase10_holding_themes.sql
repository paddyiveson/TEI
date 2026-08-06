-- Wealth OS Phase 10: holding themes -- investment-theme tags (e.g. "AI
-- Infrastructure", "Defense", "Semiconductors") alongside the existing
-- sector column, both auto-derived from a hardcoded ticker lookup table in
-- wealth-os.html (TEI.data.lookupTickerInfo) with manual override always
-- available in the UI. A holding can carry more than one theme (e.g. NVDA
-- is both "AI Infrastructure" and "Semiconductors"), so this is a real
-- Postgres array column (text[]), not a single scalar.
--
-- text[] over a comma-joined text column: every other column on this table
-- is scalar, but the app already talks to Supabase exclusively through the
-- supabase-js client, and clients.dividend_history (a jsonb array) already
-- round-trips a plain JS array with no manual (de)serialization -- a
-- comma-joined text column would need split/join/escaping logic duplicated
-- across three separate script blocks that don't share JS scope (adviser,
-- onboarding, wealthOS) and breaks silently if a theme name ever contains
-- a comma. text[] avoids both problems for less code.
--
-- No RLS changes needed: holdings already has row-level policies from
-- Phase 2 (wealth_os_phase2_rls_writes.sql) covering every column on the
-- row, this included.
--
-- Safe to re-run ("if not exists" throughout). No backfill of existing
-- production holdings' theme/sector here -- that's an explicit, separate
-- future step, not part of this migration.

alter table wealth_os.holdings
  add column if not exists theme text[];
