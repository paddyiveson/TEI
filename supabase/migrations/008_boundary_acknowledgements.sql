-- Client Hub: boundary wording acknowledgement ("coaching, not advice")
-- NOT YET APPLIED. Run in Supabase Dashboard -> SQL Editor.
--
-- The first-login notice in the Client Hub (hub/js/hub-boundary.js) shows the
-- boundary wording with an "I understand" button. Clicking it inserts one row
-- here for the signed-in login, so the notice does not show again on any
-- device. No row = not yet acknowledged.
--
-- Keyed by login (auth.users), not by wealth_os.clients row, because not
-- every Hub login has a clients row. To see it per client, join on
-- wealth_os.clients.user_id.
--
-- The row is a record, so a client can add their own and read it back but
-- cannot change or remove it, and cannot choose the timestamp: the only
-- column they may write is user_id, and acknowledged_at always comes from
-- the default. The adviser can read every row. Nothing is backfilled, so
-- existing clients see the notice once, the next time they open the Hub.
--
-- Safe to deploy the code before this runs: while the table is missing the
-- notice simply does not show.

create table wealth_os.boundary_acknowledgements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now()
);
comment on table wealth_os.boundary_acknowledgements is 'One row per Hub login that has clicked "I understand" on the boundary wording notice (coaching and education, not regulated advice). Insert-only for clients.';
comment on column wealth_os.boundary_acknowledgements.acknowledged_at is 'When the login acknowledged the boundary wording. Set by the database, never by the client.';

alter table wealth_os.boundary_acknowledgements enable row level security;

create policy "boundary_acknowledgements: own or adviser read"
  on wealth_os.boundary_acknowledgements for select
  using (user_id = auth.uid() or wealth_os.is_adviser());

create policy "boundary_acknowledgements: own insert"
  on wealth_os.boundary_acknowledgements for insert
  with check (user_id = auth.uid());

-- No update or delete policy, and no update or delete privilege.
revoke all on wealth_os.boundary_acknowledgements from anon, authenticated;
grant select on wealth_os.boundary_acknowledgements to authenticated;
grant insert (user_id) on wealth_os.boundary_acknowledgements to authenticated;
