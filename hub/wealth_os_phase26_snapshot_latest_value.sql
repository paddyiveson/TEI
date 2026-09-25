-- Wealth OS Phase 26: monthly snapshot carries forward the latest known
-- value, not a stale accounts.value.
--
-- Problem: Phase 22's run_monthly_snapshot() copies accounts.value into the
-- new month. But logging a month's balance (Update page / Adviser
-- Workspace) only ever wrote account_months -- accounts.value was left at
-- whatever it was last set to via the account form. So for manually valued
-- accounts the snapshot could write an OLDER figure than the month before
-- it: e.g. Paddy's IG, Aug '26 logged £350, accounts.value £150 (set 3 Aug)
-- -> Sep '26 auto row £150, a fake £200 loss. (The app now also keeps
-- accounts.value in step when the latest month is logged -- see
-- TEI.calc.syncAccountValueFromMonth -- this covers existing data and any
-- other write path.)
--
-- Fix: for accounts WITHOUT holdings, carry forward whichever is more
-- recent -- the latest logged month (dated by its last edit, or the end of
-- that month if the row has no edit stamp) or accounts.value (dated by
-- accounts.last_updated). Accounts WITH holdings keep using accounts.value:
-- it's the live holdings total, kept current by price refresh.
--
-- Also corrects existing auto-carried-forward rows (carried_forward = true,
-- i.e. never confirmed by a client/adviser) that the old rule got wrong.
-- Confirmed rows are never touched.
--
-- Run the whole file once in the Supabase SQL editor. Safe to re-run.

create or replace function wealth_os.carry_forward_account_value(p_account_id uuid, p_month text)
returns numeric
language sql
stable
-- Deliberately NOT security definer: wealth_os is exposed through the API,
-- so a definer function would let any logged-in user read any account's
-- value via /rpc. It's only ever called from run_monthly_snapshot (which is
-- definer, via pg_cron) and from this file's correction below; execute is
-- revoked from API roles at the bottom.
set search_path = wealth_os, public
as $$
  with acct as (
    select a.id, a.value, a.last_updated,
           exists (select 1 from wealth_os.holdings h where h.account_id = a.id) as has_holdings
    from wealth_os.accounts a
    where a.id = p_account_id
  ),
  latest as (
    select m.value,
           coalesce(m.last_edited_at::date,
                    (to_date(m.month_key || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date) as as_of
    from wealth_os.account_months m
    where m.account_id = p_account_id
      and m.month_key < p_month
      and m.carried_forward = false
    order by m.month_key desc
    limit 1
  )
  select case
    when acct.has_holdings then acct.value
    -- Strictly newer only: a same-day tie can't be ordered, so it keeps
    -- accounts.value (the Phase 22 behaviour).
    when latest.value is not null and (acct.last_updated is null or latest.as_of > acct.last_updated) then latest.value
    else acct.value
  end
  from acct left join latest on true
$$;

create or replace function wealth_os.run_monthly_snapshot()
returns void
language plpgsql
security definer
set search_path = wealth_os, public
as $$
declare
  v_month text := to_char(current_date, 'YYYY-MM');
  v_month_start date := date_trunc('month', current_date)::date;
begin
  -- Accounts: carry forward the latest known value (see
  -- carry_forward_account_value) for anything that existed before this
  -- month started and has no row yet for this month.
  insert into wealth_os.account_months (account_id, month_key, value, last_edited_by, last_edited_at, carried_forward)
  select a.id, v_month, wealth_os.carry_forward_account_value(a.id, v_month), 'system:auto-carry-forward', now(), true
  from wealth_os.accounts a
  where a.created_at < v_month_start
    and not exists (
      select 1 from wealth_os.account_months m
      where m.account_id = a.id and m.month_key = v_month
    );

  -- Holdings: unchanged from Phase 22 -- holdings.value is the live market
  -- value when a price refresh has run.
  insert into wealth_os.holding_months (holding_id, month_key, value, last_edited_by, last_edited_at, carried_forward)
  select h.id, v_month, h.value, 'system:auto-carry-forward', now(), true
  from wealth_os.holdings h
  where h.created_at < v_month_start
    and not exists (
      select 1 from wealth_os.holding_months m
      where m.holding_id = h.id and m.month_key = v_month
    );
end;
$$;

-- One-off correction of existing unconfirmed auto rows. Only manual
-- (no-holdings) accounts can differ under the new rule.
update wealth_os.account_months m
set value = wealth_os.carry_forward_account_value(m.account_id, m.month_key),
    last_edited_at = now()
where m.carried_forward = true
  and not exists (select 1 from wealth_os.holdings h where h.account_id = m.account_id)
  and m.value is distinct from wealth_os.carry_forward_account_value(m.account_id, m.month_key);

-- Neither function should be callable through the API (/rpc) -- pg_cron runs
-- the snapshot as the owning role.
revoke execute on function wealth_os.carry_forward_account_value(uuid, text) from public, anon, authenticated;
revoke execute on function wealth_os.run_monthly_snapshot() from public, anon, authenticated;
