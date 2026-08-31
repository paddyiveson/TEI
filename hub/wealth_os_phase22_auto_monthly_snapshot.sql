-- Wealth OS Phase 22: automatic monthly snapshot of account/holding values.
--
-- Problem: account_months/holding_months (Phase 3) only ever get a row when
-- a client or adviser visits Update and logs one. A client who doesn't log
-- in for months gets a flat gap in their Wealth/Portfolio charts even though
-- nothing about their situation changed -- the balance just sat there.
--
-- Fix: a monthly job that, for every account/holding with NO row yet for
-- the current month, carries its current value forward as this month's data
-- point -- accounts.value and holdings.value are already "the last known
-- figure" (kept current by manual edits for accounts, by live price refresh
-- for holdings), so this is a genuine carry-forward, not a guess. Marked
-- carried_forward=true so the UI can flag it as auto-filled rather than a
-- real client-confirmed figure (see hub/wealth-os.html's Update page, which
-- reads this column back via monthsMeta/holdingsMonthsMeta).
--
-- Runs entirely inside Postgres via pg_cron -- deliberately NOT a Vercel
-- serverless function. .env.example's "never deploy the service role key to
-- Vercel" rule would otherwise force an awkward choice; pg_cron sidesteps it
-- completely since the job runs as a database role and never needs a key
-- shipped anywhere.
--
-- Run the whole file once (in the Supabase SQL editor, like every other
-- phaseN file here). Safe to re-run -- extension/column adds are
-- "if not exists", and the schedule step unschedules its own job name
-- before re-scheduling so re-running this file doesn't create duplicate cron
-- jobs.

create extension if not exists pg_cron;

alter table wealth_os.account_months add column if not exists carried_forward boolean not null default false;
alter table wealth_os.holding_months add column if not exists carried_forward boolean not null default false;

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
  -- Accounts: carry forward accounts.value for anything that existed before
  -- this month started and has no row yet for this month. The "existed
  -- before this month" guard just avoids manufacturing a first-ever data
  -- point for an account someone is mid-way through onboarding right now --
  -- that one gets its first real snapshot the ordinary way (a save, or next
  -- month's carry-forward).
  insert into wealth_os.account_months (account_id, month_key, value, last_edited_by, last_edited_at, carried_forward)
  select a.id, v_month, a.value, 'system:auto-carry-forward', now(), true
  from wealth_os.accounts a
  where a.created_at < v_month_start
    and not exists (
      select 1 from wealth_os.account_months m
      where m.account_id = a.id and m.month_key = v_month
    );

  -- Holdings: same carry-forward, using holdings.value (already the live
  -- market value when a price refresh has run -- see holdings.last_price).
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

-- Re-schedulable: drop any existing job with this name first so re-running
-- this file updates the schedule instead of stacking a second job.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'wealth_os_monthly_snapshot';
exception when others then
  null; -- pg_cron not yet initialised on first run -- nothing to unschedule
end $$;

-- 2nd of every month, 06:00 UTC -- a day's grace past the month boundary
-- rather than midnight on the 1st, so it never races a client's own
-- end-of-month save.
select cron.schedule('wealth_os_monthly_snapshot', '0 6 2 * *', $$select wealth_os.run_monthly_snapshot();$$);
