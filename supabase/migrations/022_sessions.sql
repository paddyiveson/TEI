-- 022: coaching sessions from Cal.com (TEI Launch v2). Applied to production
-- 2026-11-09 as migration "022_sessions" (Paddy approved).
--
-- Written by the cal-booking-webhook Edge Function (service role) when a
-- session is booked, moved or cancelled. Wealth OS reads the client's next
-- booked session: Home's Next session tile, Wealth's summary line, and the
-- Forecast and Cashflow buttons ("Add to next session" or "Ask Paddy about
-- this"). Clients read their own; advisers read and change all. Rerun-safe.

create table if not exists wealth_os.sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references wealth_os.clients(id) on delete cascade,
  cal_uid text not null unique,
  attendee_email text,
  title text,
  start_at timestamptz not null,
  end_at timestamptz,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  updated_at timestamptz not null default now()
);
comment on table wealth_os.sessions is 'Coaching sessions booked on Cal.com, written by the cal-booking-webhook Edge Function. client_id is null when the attendee email matches no client.';
create index if not exists sessions_client_start on wealth_os.sessions (client_id, start_at);
alter table wealth_os.sessions enable row level security;
drop policy if exists sessions_select_own_or_adviser on wealth_os.sessions;
create policy sessions_select_own_or_adviser on wealth_os.sessions for select
  using (wealth_os.is_adviser() or exists (select 1 from wealth_os.clients c where c.id = sessions.client_id and c.user_id = auth.uid()));
drop policy if exists sessions_adviser_write on wealth_os.sessions;
create policy sessions_adviser_write on wealth_os.sessions for all
  using (wealth_os.is_adviser()) with check (wealth_os.is_adviser());
grant select on wealth_os.sessions to authenticated;
grant insert, update, delete on wealth_os.sessions to authenticated;
