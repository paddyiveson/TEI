-- 021: dividend payments (TEI Launch v2). Applied to production 2026-11-09
-- as migration "021_dividend_payments" (Paddy approved).
--
-- Wealth's dividend strip needs dated payments: "£X received" this year,
-- the month dots and the next expected payment. pay_months says which
-- months each holding usually pays; dividend_payments logs what actually
-- arrived (entered in Update balances; source 'feed' is kept for a future
-- automatic feed). Same client-or-adviser RLS as dividend_holdings. Rerun-safe.

alter table wealth_os.dividend_holdings add column if not exists pay_months smallint[];
comment on column wealth_os.dividend_holdings.pay_months is 'Months this holding usually pays (1 to 12). Drives the month dots and the next expected payment.';

create table if not exists wealth_os.dividend_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references wealth_os.clients(id) on delete cascade,
  dividend_holding_id uuid references wealth_os.dividend_holdings(id) on delete set null,
  paid_on date not null,
  amount numeric not null check (amount >= 0),
  source text not null default 'manual' check (source in ('manual', 'feed')),
  last_edited_by text,
  created_at timestamptz not null default now()
);
create index if not exists dividend_payments_client_paid on wealth_os.dividend_payments (client_id, paid_on);
alter table wealth_os.dividend_payments enable row level security;

drop policy if exists dividend_payments_select_own_or_adviser on wealth_os.dividend_payments;
create policy dividend_payments_select_own_or_adviser on wealth_os.dividend_payments for select
  using (wealth_os.is_adviser() or exists (select 1 from wealth_os.clients c where c.id = dividend_payments.client_id and c.user_id = auth.uid()));
drop policy if exists dividend_payments_insert_own_or_adviser on wealth_os.dividend_payments;
create policy dividend_payments_insert_own_or_adviser on wealth_os.dividend_payments for insert
  with check (wealth_os.is_adviser() or exists (select 1 from wealth_os.clients c where c.id = dividend_payments.client_id and c.user_id = auth.uid()));
drop policy if exists dividend_payments_update_own_or_adviser on wealth_os.dividend_payments;
create policy dividend_payments_update_own_or_adviser on wealth_os.dividend_payments for update
  using (wealth_os.is_adviser() or exists (select 1 from wealth_os.clients c where c.id = dividend_payments.client_id and c.user_id = auth.uid()))
  with check (wealth_os.is_adviser() or exists (select 1 from wealth_os.clients c where c.id = dividend_payments.client_id and c.user_id = auth.uid()));
drop policy if exists dividend_payments_delete_own_or_adviser on wealth_os.dividend_payments;
create policy dividend_payments_delete_own_or_adviser on wealth_os.dividend_payments for delete
  using (wealth_os.is_adviser() or exists (select 1 from wealth_os.clients c where c.id = dividend_payments.client_id and c.user_id = auth.uid()));
grant select, insert, update, delete on wealth_os.dividend_payments to authenticated;
