-- Wealth OS Phase 3: monthly history tables (account/holding/goal values by month).
-- New tables -- no earlier Phase 1 SELECT-only file exists for these (unlike
-- Phase 2, which was additive on top of one), so this file includes its own
-- SELECT policies as well as INSERT/UPDATE/DELETE.
-- Same ownership rule as Phase 1/2 throughout: an adviser
-- (wealth_os.profiles.role='adviser' for their own auth user), or the client
-- who owns the row via clients.user_id = auth.uid(). Both roles get full
-- read/write here -- this is the one area where clients have the same reach
-- as advisers (logging/backfilling their own monthly figures).
--
-- Run the whole file. Safe to re-run (drops-then-creates by fixed policy
-- name; create table uses "if not exists").

create table if not exists wealth_os.account_months (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references wealth_os.accounts(id) on delete cascade,
  month_key text not null,          -- 'YYYY-MM'
  value numeric not null,
  last_edited_by text,
  last_edited_at timestamptz,
  unique (account_id, month_key)
);

create table if not exists wealth_os.holding_months (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references wealth_os.holdings(id) on delete cascade,
  month_key text not null,
  value numeric not null,
  last_edited_by text,
  last_edited_at timestamptz,
  unique (holding_id, month_key)
);

create table if not exists wealth_os.goal_months (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references wealth_os.goals(id) on delete cascade,
  month_key text not null,
  value numeric not null,
  last_edited_by text,
  last_edited_at timestamptz,
  unique (goal_id, month_key)
);

alter table wealth_os.account_months enable row level security;
alter table wealth_os.holding_months enable row level security;
alter table wealth_os.goal_months enable row level security;

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

-- ---------- account_months: one hop through accounts ----------
drop policy if exists account_months_select_own_or_adviser on wealth_os.account_months;
create policy account_months_select_own_or_adviser on wealth_os.account_months
for select
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
);

drop policy if exists account_months_insert_own_or_adviser on wealth_os.account_months;
create policy account_months_insert_own_or_adviser on wealth_os.account_months
for insert
with check (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
);

drop policy if exists account_months_update_own_or_adviser on wealth_os.account_months;
create policy account_months_update_own_or_adviser on wealth_os.account_months
for update
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
)
with check (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
);

drop policy if exists account_months_delete_own_or_adviser on wealth_os.account_months;
create policy account_months_delete_own_or_adviser on wealth_os.account_months
for delete
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
);

-- ---------- holding_months: two hops through holdings -> accounts ----------
drop policy if exists holding_months_select_own_or_adviser on wealth_os.holding_months;
create policy holding_months_select_own_or_adviser on wealth_os.holding_months
for select
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.holdings h
    join wealth_os.accounts a on a.id = h.account_id
    join wealth_os.clients c on c.id = a.client_id
    where h.id = holding_id and c.user_id = auth.uid()
  )
);

drop policy if exists holding_months_insert_own_or_adviser on wealth_os.holding_months;
create policy holding_months_insert_own_or_adviser on wealth_os.holding_months
for insert
with check (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.holdings h
    join wealth_os.accounts a on a.id = h.account_id
    join wealth_os.clients c on c.id = a.client_id
    where h.id = holding_id and c.user_id = auth.uid()
  )
);

drop policy if exists holding_months_update_own_or_adviser on wealth_os.holding_months;
create policy holding_months_update_own_or_adviser on wealth_os.holding_months
for update
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.holdings h
    join wealth_os.accounts a on a.id = h.account_id
    join wealth_os.clients c on c.id = a.client_id
    where h.id = holding_id and c.user_id = auth.uid()
  )
)
with check (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.holdings h
    join wealth_os.accounts a on a.id = h.account_id
    join wealth_os.clients c on c.id = a.client_id
    where h.id = holding_id and c.user_id = auth.uid()
  )
);

drop policy if exists holding_months_delete_own_or_adviser on wealth_os.holding_months;
create policy holding_months_delete_own_or_adviser on wealth_os.holding_months
for delete
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.holdings h
    join wealth_os.accounts a on a.id = h.account_id
    join wealth_os.clients c on c.id = a.client_id
    where h.id = holding_id and c.user_id = auth.uid()
  )
);

-- ---------- goal_months: one hop through goals ----------
drop policy if exists goal_months_select_own_or_adviser on wealth_os.goal_months;
create policy goal_months_select_own_or_adviser on wealth_os.goal_months
for select
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.goals g join wealth_os.clients c on c.id = g.client_id
    where g.id = goal_id and c.user_id = auth.uid()
  )
);

drop policy if exists goal_months_insert_own_or_adviser on wealth_os.goal_months;
create policy goal_months_insert_own_or_adviser on wealth_os.goal_months
for insert
with check (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.goals g join wealth_os.clients c on c.id = g.client_id
    where g.id = goal_id and c.user_id = auth.uid()
  )
);

drop policy if exists goal_months_update_own_or_adviser on wealth_os.goal_months;
create policy goal_months_update_own_or_adviser on wealth_os.goal_months
for update
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.goals g join wealth_os.clients c on c.id = g.client_id
    where g.id = goal_id and c.user_id = auth.uid()
  )
)
with check (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.goals g join wealth_os.clients c on c.id = g.client_id
    where g.id = goal_id and c.user_id = auth.uid()
  )
);

drop policy if exists goal_months_delete_own_or_adviser on wealth_os.goal_months;
create policy goal_months_delete_own_or_adviser on wealth_os.goal_months
for delete
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.goals g join wealth_os.clients c on c.id = g.client_id
    where g.id = goal_id and c.user_id = auth.uid()
  )
);
