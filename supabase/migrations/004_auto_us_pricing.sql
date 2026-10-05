-- Wealth OS: scheduled auto-pricing for US-listed holdings.
--
-- US holdings flagged price_source = 'auto_us' are repriced four times each
-- weekday (15:00, 17:00, 19:00, 21:15 UK time) by the refresh-us-prices Edge
-- Function, so clients see current prices on login without triggering any
-- Twelve Data calls from the browser. Everything else (UK/LSE, funds, crypto,
-- free-text tickers) stays 'manual'.
--
-- pg_cron runs in UTC and can't follow UK clock changes, so the job fires
-- every minute 13:00-21:59 UTC Mon-Fri and the function itself decides
-- (in Europe/London time) whether it's inside the 15 minutes after a slot.
-- Inside a window each call prices the next batch of tickers not yet
-- attempted since the slot started (<= 8 Twelve Data credits per call, the
-- free tier's per-minute cap).
--
-- Manual step after running this: add TWELVE_DATA_API_KEY as an Edge
-- Function secret (Supabase dashboard > Edge Functions > Secrets) -- same
-- key as the Vercel TWELVE_DATA_API_KEY used by api/prices.js.
--
-- Safe to re-run.

-- 1. Which holdings the job may touch ------------------------------------

alter table wealth_os.holdings add column if not exists price_source text not null default 'manual';
alter table wealth_os.holdings drop constraint if exists holdings_price_source_check;
alter table wealth_os.holdings add constraint holdings_price_source_check
  check (price_source in ('auto_us', 'manual'));

-- Backfill: only the tickers confirmed as US-listed (5 Oct 2026). EXUS, IVV,
-- ASML and every free-text/fund ticker deliberately stay manual.
update wealth_os.holdings h
set price_source = 'auto_us'
from wealth_os.accounts a
where a.id = h.account_id
  and a.type <> 'crypto'
  and h.price_source = 'manual'
  and upper(trim(h.ticker)) in (
    'AMZN','ASTS','GOOG','HIMS','HOOD','KRKNF','MELI','MSFT','NBIS',
    'NU','NVDA','ONDS','PLTR','RKLB','SOFI','TEM','TSLA','ZETA'
  );

-- 2. price_cache: track attempts separately from successful prices -------
-- A ticker that errors is marked attempted so the job doesn't spend a credit
-- retrying it every minute for the rest of the slot window. price/fetched_at
-- stay the last *good* values (null if it has never priced).

alter table wealth_os.price_cache alter column price drop not null;
alter table wealth_os.price_cache alter column fetched_at drop not null;
alter table wealth_os.price_cache alter column fetched_at drop default;
alter table wealth_os.price_cache add column if not exists attempted_at timestamptz;
alter table wealth_os.price_cache add column if not exists last_error text;

-- 3. Run log, so a silent failure is visible ------------------------------

create table if not exists wealth_os.price_refresh_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  slot_start timestamptz,
  tickers text[] not null default '{}',        -- requested this call
  priced text[] not null default '{}',         -- came back with a price
  failures jsonb not null default '{}'::jsonb, -- ticker -> error message
  usd_gbp_rate numeric,
  holdings_updated integer not null default 0,
  error text                                   -- whole-call failure, if any
);
alter table wealth_os.price_refresh_log enable row level security;
drop policy if exists "price_refresh_log: adviser read" on wealth_os.price_refresh_log;
create policy "price_refresh_log: adviser read" on wealth_os.price_refresh_log
  for select using (wealth_os.is_adviser());
grant select on wealth_os.price_refresh_log to authenticated;
grant select, insert, update on wealth_os.price_refresh_log to service_role;
grant select, insert, update on wealth_os.price_cache to service_role;

-- 4. Service-role-only helpers called by the Edge Function ---------------

-- Tickers still to price in the current slot.
create or replace function wealth_os.us_price_pending(p_slot_start timestamptz)
returns setof text
language sql
stable
security definer
set search_path = wealth_os, public
as $$
  select distinct upper(trim(h.ticker))
  from wealth_os.holdings h
  join wealth_os.accounts a on a.id = h.account_id
  where h.price_source = 'auto_us'
    and h.units is not null
    and coalesce(trim(h.ticker), '') <> ''
    and a.type <> 'crypto'
    and not exists (
      select 1 from wealth_os.price_cache c
      where c.ticker = upper(trim(h.ticker))
        and c.attempted_at >= p_slot_start
    )
  order by 1;
$$;

-- Writes good prices to price_cache and reprices matching auto_us holdings.
-- Same maths as the browser refresh (applyLivePriceToHolding in
-- hub/wealth-os.html): value = price * USD/GBP * units, cost_basis =
-- avg_open * USD/GBP * units when avg_open is set, last_price in USD.
-- Ignores non-positive prices, so a bad response can never write zero.
create or replace function wealth_os.apply_us_prices(p_prices jsonb, p_rate numeric, p_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = wealth_os, public
as $$
declare
  n integer;
begin
  if p_rate is null or p_rate <= 0 then
    raise exception 'apply_us_prices: invalid USD/GBP rate %', p_rate;
  end if;

  insert into wealth_os.price_cache (ticker, price, currency, fetched_at, attempted_at, last_error)
  select upper(key), value::numeric, 'USD', p_at, p_at, null
  from jsonb_each_text(coalesce(p_prices, '{}'::jsonb))
  where value ~ '^[0-9]+(\.[0-9]+)?$' and value::numeric > 0
  on conflict (ticker) do update
    set price = excluded.price, currency = 'USD', fetched_at = excluded.fetched_at,
        attempted_at = excluded.attempted_at, last_error = null;

  update wealth_os.holdings h
  set last_price = p.price,
      value = p.price * p_rate * h.units,
      cost_basis = case when h.avg_open is not null then h.avg_open * p_rate * h.units else h.cost_basis end,
      last_priced_at = p_at
  from (
    select upper(key) as ticker, value::numeric as price
    from jsonb_each_text(coalesce(p_prices, '{}'::jsonb))
    where value ~ '^[0-9]+(\.[0-9]+)?$' and value::numeric > 0
  ) p, wealth_os.accounts a
  where upper(trim(h.ticker)) = p.ticker
    and a.id = h.account_id
    and a.type <> 'crypto'
    and h.price_source = 'auto_us'
    and h.units is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Marks tickers attempted-but-failed for this slot, keeping the old price.
create or replace function wealth_os.mark_us_price_failures(p_failures jsonb, p_at timestamptz default now())
returns void
language sql
security definer
set search_path = wealth_os, public
as $$
  insert into wealth_os.price_cache (ticker, attempted_at, last_error)
  select upper(key), p_at, left(value, 500) from jsonb_each_text(coalesce(p_failures, '{}'::jsonb))
  on conflict (ticker) do update
    set attempted_at = excluded.attempted_at, last_error = excluded.last_error;
$$;

-- Checks the shared secret pg_cron sends (held in Vault, never in code).
create or replace function wealth_os.check_price_job_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = wealth_os, public
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets
    where name = 'price_job_secret' and decrypted_secret = p_secret
  );
$$;

revoke all on function wealth_os.us_price_pending(timestamptz) from public, anon, authenticated;
revoke all on function wealth_os.apply_us_prices(jsonb, numeric, timestamptz) from public, anon, authenticated;
revoke all on function wealth_os.mark_us_price_failures(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function wealth_os.check_price_job_secret(text) from public, anon, authenticated;
grant execute on function wealth_os.us_price_pending(timestamptz) to service_role;
grant execute on function wealth_os.apply_us_prices(jsonb, numeric, timestamptz) to service_role;
grant execute on function wealth_os.mark_us_price_failures(jsonb, timestamptz) to service_role;
grant execute on function wealth_os.check_price_job_secret(text) to service_role;

-- 5. Shared secret + cron job -------------------------------------------

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'price_job_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'price_job_secret',
      'Shared secret pg_cron sends to the refresh-us-prices Edge Function'
    );
  end if;
end $$;

create or replace function wealth_os.trigger_us_price_refresh()
returns void
language plpgsql
security definer
set search_path = wealth_os, public, extensions
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'price_job_secret';
  perform net.http_post(
    url := 'https://ztyqijiiayrengvxsqkw.supabase.co/functions/v1/refresh-us-prices',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-price-job-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function wealth_os.trigger_us_price_refresh() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'wealth_os_us_price_refresh';
end $$;

-- Every minute 13:00-21:59 UTC, Mon-Fri. Covers all four UK slots in both
-- GMT and BST; the function exits immediately (no API call) outside them.
select cron.schedule('wealth_os_us_price_refresh', '* 13-21 * * 1-5', $$select wealth_os.trigger_us_price_refresh();$$);
