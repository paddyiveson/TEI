-- Wealth OS Phase 4: client self-service logging (account deposits, cashflow
-- actuals). New tables -- includes its own SELECT policies as well as
-- INSERT/UPDATE/DELETE (same reasoning as Phase 3: no earlier Phase 1
-- SELECT-only file exists for these).
-- Same ownership rule as Phase 1-3 throughout: an adviser
-- (wealth_os.profiles.role='adviser' for their own auth user), or the client
-- who owns the row via clients.user_id = auth.uid(). Both roles get full
-- read/write here -- same "clients have the same reach as advisers" pattern
-- as the Phase 3 monthly-history tables.
--
-- Run the whole file. Safe to re-run (drops-then-creates by fixed policy
-- name; create table uses "if not exists").

-- account_deposits: money paid INTO an account during a given month --
-- distinct from account_months (the account's balance/value AT month-end).
-- Lets "total deposited vs current value" be worked out later without
-- guessing how much of a balance change was your own money vs growth.
--
-- amount = the client's own personal deposit (relief-eligible for LISA/
-- pension). sacrifice_amount = employer/salary-sacrifice portion, pension
-- accounts only -- already pre-tax, so never relief-eligible, but still
-- real money in and counted in "total deposited". relief_amount = the
-- auto-calculated LISA/pension government top-up on `amount` (basic rate
-- only -- no LISA annual-cap enforcement, no higher/additional-rate relief,
-- which isn't automatic and is claimed separately) -- tracked and shown,
-- but deliberately excluded from "total deposited" since it's not the
-- client's own money.
create table if not exists wealth_os.account_deposits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references wealth_os.accounts(id) on delete cascade,
  month_key text not null,          -- 'YYYY-MM'
  amount numeric not null,
  sacrifice_amount numeric,
  relief_amount numeric,
  last_edited_by text,
  last_edited_at timestamptz,
  unique (account_id, month_key)
);
-- idempotent for anyone who already ran an earlier version of this file
-- before these columns existed
alter table wealth_os.account_deposits add column if not exists sacrifice_amount numeric;
alter table wealth_os.account_deposits add column if not exists relief_amount numeric;

-- cashflow_months: a client's ACTUAL income/expenses for a given month,
-- distinct from the stated regular figures in cashflow_settings /
-- income / expenses. One row per client per month (client-level, not
-- per income-source or per expense-line -- keeps this a quick "how did
-- this month actually go" log, not a full itemised statement).
create table if not exists wealth_os.cashflow_months (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references wealth_os.clients(id) on delete cascade,
  month_key text not null,
  actual_income numeric,
  actual_expenses numeric,
  last_edited_by text,
  last_edited_at timestamptz,
  unique (client_id, month_key)
);

alter table wealth_os.account_deposits enable row level security;
alter table wealth_os.cashflow_months enable row level security;

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

-- ---------- account_deposits: one hop through accounts ----------
drop policy if exists account_deposits_select_own_or_adviser on wealth_os.account_deposits;
create policy account_deposits_select_own_or_adviser on wealth_os.account_deposits
for select
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
);

drop policy if exists account_deposits_insert_own_or_adviser on wealth_os.account_deposits;
create policy account_deposits_insert_own_or_adviser on wealth_os.account_deposits
for insert
with check (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
);

drop policy if exists account_deposits_update_own_or_adviser on wealth_os.account_deposits;
create policy account_deposits_update_own_or_adviser on wealth_os.account_deposits
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

drop policy if exists account_deposits_delete_own_or_adviser on wealth_os.account_deposits;
create policy account_deposits_delete_own_or_adviser on wealth_os.account_deposits
for delete
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
);

-- ---------- cashflow_months: direct client_id, no hop ----------
drop policy if exists cashflow_months_select_own_or_adviser on wealth_os.cashflow_months;
create policy cashflow_months_select_own_or_adviser on wealth_os.cashflow_months
for select
using (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
);

drop policy if exists cashflow_months_insert_own_or_adviser on wealth_os.cashflow_months;
create policy cashflow_months_insert_own_or_adviser on wealth_os.cashflow_months
for insert
with check (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
);

drop policy if exists cashflow_months_update_own_or_adviser on wealth_os.cashflow_months;
create policy cashflow_months_update_own_or_adviser on wealth_os.cashflow_months
for update
using (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
)
with check (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
);

drop policy if exists cashflow_months_delete_own_or_adviser on wealth_os.cashflow_months;
create policy cashflow_months_delete_own_or_adviser on wealth_os.cashflow_months
for delete
using (
  wealth_os.is_adviser()
  or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
);
