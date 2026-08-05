-- Wealth OS Phase 5: client feedback / bug-report widget. New table only.
-- Same ownership rule as Phase 1-4 throughout: an adviser
-- (wealth_os.profiles.role='adviser' for their own auth user), or the client
-- who owns the row via clients.user_id = auth.uid(). Both roles get full
-- read/write at the RLS layer (same "clients have the same reach as
-- advisers" pattern as every other client-logging table) -- the app's UI is
-- what actually restricts clients to insert-only and advisers to triage
-- (status changes), not RLS.
--
-- Run the whole file. Safe to re-run (drops-then-creates by fixed policy
-- name; create table uses "if not exists").

-- One row per submitted note. Deliberately flat/lightweight -- this is a
-- fire-and-forget report, not a chat thread, so there is no reply/thread
-- table: triage happens by changing `status`, not by adding messages.
create table if not exists wealth_os.feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references wealth_os.clients(id) on delete cascade,
  area text,                              -- client-picked tag, e.g. 'general' | 'portfolio' | 'goals' | 'cashflow' | 'deposits' | 'documents' -- free text, no enum constraint (matches the rest of this schema)
  page_context text,                      -- which dashboard page (PAGES id) the client was actually on when they hit send -- auto-captured, not client-entered
  message text not null,
  status text not null default 'new',     -- 'new' | 'read' | 'resolved' -- adviser triage state
  submitted_by text,                      -- 'client' or 'adviser', mirrors the last_edited_by convention elsewhere
  created_at timestamptz not null default now(),
  status_updated_at timestamptz,
  status_updated_by text
);

create index if not exists feedback_client_id_idx on wealth_os.feedback(client_id);
create index if not exists feedback_status_idx on wealth_os.feedback(status);
create index if not exists feedback_created_at_idx on wealth_os.feedback(created_at desc);

alter table wealth_os.feedback enable row level security;

-- reuse the Phase 2 helper if it doesn't already exist
create or replace function wealth_os.is_adviser()
returns boolean
language sql
stable
security definer
set search_path = wealth_os, public
as $$
  select exists (
    select 1 from wealth_os.profiles p
    where p.user_id = auth.uid() and p.role = 'adviser'
  );
$$;

grant select, insert, update, delete on all tables in schema wealth_os to authenticated;
alter default privileges in schema wealth_os grant select, insert, update, delete on tables to authenticated;

-- ---------- feedback: direct client_id, no hop ----------
drop policy if exists feedback_select_own_or_adviser on wealth_os.feedback;
create policy feedback_select_own_or_adviser on wealth_os.feedback
for select
using (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
);

drop policy if exists feedback_insert_own_or_adviser on wealth_os.feedback;
create policy feedback_insert_own_or_adviser on wealth_os.feedback
for insert
with check (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
);

drop policy if exists feedback_update_own_or_adviser on wealth_os.feedback;
create policy feedback_update_own_or_adviser on wealth_os.feedback
for update
using (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
)
with check (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
);

drop policy if exists feedback_delete_own_or_adviser on wealth_os.feedback;
create policy feedback_delete_own_or_adviser on wealth_os.feedback
for delete
using (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
);
