-- Wealth Plan forecasts: settings a client (or the adviser) has changed inside
-- a forecast document, saved per forecast document. The forecast HTML itself
-- lives in the private client-documents bucket with a wealth_os.documents row
-- (type 'forecast'); this table only holds the state the forecast posts back
-- to the portal via postMessage. Deleting the document deletes its state.

create table wealth_os.forecast_state (
  document_id uuid primary key references wealth_os.documents(id) on delete cascade,
  client_id   uuid not null references wealth_os.clients(id),
  stamp       text not null,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table wealth_os.forecast_state enable row level security;

-- Adviser: full read and write (may adjust settings on a client's behalf).
create policy forecast_state_adviser_all on wealth_os.forecast_state for all
  using (wealth_os.is_adviser())
  with check (wealth_os.is_adviser());

-- Client: only rows for their own client record, and only against a forecast
-- document that belongs to that same client.
create policy forecast_state_client_select on wealth_os.forecast_state for select
  using (exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid()));

create policy forecast_state_client_insert on wealth_os.forecast_state for insert
  with check (
    exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
    and exists (select 1 from wealth_os.documents d where d.id = document_id and d.client_id = forecast_state.client_id)
  );

create policy forecast_state_client_update on wealth_os.forecast_state for update
  using (exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (
    exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
    and exists (select 1 from wealth_os.documents d where d.id = document_id and d.client_id = forecast_state.client_id)
  );

create policy forecast_state_client_delete on wealth_os.forecast_state for delete
  using (exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid()));

grant select, insert, update, delete on wealth_os.forecast_state to authenticated;
