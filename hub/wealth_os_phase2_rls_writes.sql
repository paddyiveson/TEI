-- Wealth OS Phase 2: write (INSERT/UPDATE/DELETE) RLS policies.
-- Additive to Phase 1's SELECT-only policies -- does not touch or replace them.
-- Same ownership rule throughout: an adviser (wealth_os.profiles.role='adviser'
-- for their own auth user), or the client who owns the row via
-- clients.user_id = auth.uid().
--
-- Run the whole file. Safe to re-run (drops-then-creates by fixed policy name).

-- reuse the Phase 1 helper if it doesn't already exist
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

grant insert, update, delete on all tables in schema wealth_os to authenticated;
alter default privileges in schema wealth_os grant insert, update, delete on tables to authenticated;

-- ---------- tables keyed directly by client_id ----------
-- accounts, goals, dividend_holdings: normal one-row-per-record tables.
-- cashflow_settings: at most one row per client (client_id is effectively
-- the primary key) -- same ownership check works fine for insert/update/delete.
-- income, wealth_assets, wealth_liabilities: included here on the assumption
-- they also use a client_id FK (confirmed pattern on every other child table
-- in this schema) -- flag if that turns out wrong once their exact columns
-- are confirmed.
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','goals','dividend_holdings','cashflow_settings',
    'income','wealth_assets','wealth_liabilities'
  ]
  loop
    execute format('drop policy if exists %I on wealth_os.%I;', t || '_insert_own_or_adviser', t);
    execute format($f$
      create policy %I on wealth_os.%I
      for insert
      with check (
        wealth_os.is_adviser()
        or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
      );
    $f$, t || '_insert_own_or_adviser', t);

    execute format('drop policy if exists %I on wealth_os.%I;', t || '_update_own_or_adviser', t);
    execute format($f$
      create policy %I on wealth_os.%I
      for update
      using (
        wealth_os.is_adviser()
        or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
      )
      with check (
        wealth_os.is_adviser()
        or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
      );
    $f$, t || '_update_own_or_adviser', t);

    execute format('drop policy if exists %I on wealth_os.%I;', t || '_delete_own_or_adviser', t);
    execute format($f$
      create policy %I on wealth_os.%I
      for delete
      using (
        wealth_os.is_adviser()
        or exists (select 1 from wealth_os.clients c where c.id = client_id and c.user_id = auth.uid())
      );
    $f$, t || '_delete_own_or_adviser', t);
  end loop;
end $$;

-- ---------- holdings: keyed by account_id, one hop through accounts ----------
drop policy if exists holdings_insert_own_or_adviser on wealth_os.holdings;
create policy holdings_insert_own_or_adviser on wealth_os.holdings
for insert
with check (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
);

drop policy if exists holdings_update_own_or_adviser on wealth_os.holdings;
create policy holdings_update_own_or_adviser on wealth_os.holdings
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

drop policy if exists holdings_delete_own_or_adviser on wealth_os.holdings;
create policy holdings_delete_own_or_adviser on wealth_os.holdings
for delete
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
    where a.id = account_id and c.user_id = auth.uid()
  )
);

-- ---------- goal_accounts: keyed by goal_id, one hop through goals ----------
drop policy if exists goal_accounts_insert_own_or_adviser on wealth_os.goal_accounts;
create policy goal_accounts_insert_own_or_adviser on wealth_os.goal_accounts
for insert
with check (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.goals g join wealth_os.clients c on c.id = g.client_id
    where g.id = goal_id and c.user_id = auth.uid()
  )
);

drop policy if exists goal_accounts_delete_own_or_adviser on wealth_os.goal_accounts;
create policy goal_accounts_delete_own_or_adviser on wealth_os.goal_accounts
for delete
using (
  wealth_os.is_adviser()
  or exists (
    select 1 from wealth_os.goals g join wealth_os.clients c on c.id = g.client_id
    where g.id = goal_id and c.user_id = auth.uid()
  )
);

-- ---------- clients: UPDATE only (no insert/delete -- a client can't create
-- or remove client rows, only edit their own or, if adviser, any) ----------
drop policy if exists clients_update_own_or_adviser on wealth_os.clients;
create policy clients_update_own_or_adviser on wealth_os.clients
for update
using (wealth_os.is_adviser() or user_id = auth.uid())
with check (wealth_os.is_adviser() or user_id = auth.uid());
