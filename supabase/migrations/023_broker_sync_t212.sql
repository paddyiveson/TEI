-- Wealth OS: Trading 212 broker sync (PILOT -- adviser's own accounts only).
--
-- Pulls positions and cash from the Trading 212 Public API into a Wealth OS
-- Stocks ISA / Invest (GIA) account: units, average price, GBP cost, GBP
-- value and cash. Runs hourly on weekdays and on demand from the adviser's
-- account card ("Sync now").
--
-- Why pilot-only: Trading 212's API Terms (6.2, 6.3) allow personal use only
-- and need their written consent before the API is used for other people's
-- accounts. save_broker_connection() therefore refuses any account that
-- does not belong to the signed-in adviser's own client record. Lifting
-- that check is the only change needed if consent is granted.
--
-- Keys: the API key and secret are stored together in Supabase Vault as
-- "key:secret" and are never readable from the browser -- only the
-- broker-sync Edge Function (service role) can decrypt them. The key should
-- be created with read permissions only (Account data, Portfolio); the sync
-- never places or cancels orders.
--
-- Pricing: a synced holding is switched to price_source 'manual' so the
-- Twelve Data job (004) never overwrites Trading 212's real GBP cost basis.
-- The hourly sync keeps it current instead.
--
-- Safe to re-run.

-- 1. Tables ----------------------------------------------------------------

create table if not exists wealth_os.broker_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references wealth_os.accounts(id) on delete cascade,
  broker text not null default 'trading212' check (broker in ('trading212')),
  vault_secret_id uuid not null,
  key_hint text,                         -- last 4 characters of the API key, display only
  auto_sync boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  last_synced_at timestamptz,
  last_status text check (last_status is null or last_status in ('ok', 'error')),
  last_error text,
  last_result jsonb
);

alter table wealth_os.broker_connections enable row level security;
drop policy if exists broker_connections_adviser_select on wealth_os.broker_connections;
create policy broker_connections_adviser_select on wealth_os.broker_connections
  for select using (wealth_os.is_adviser());
-- No insert/update/delete policies: writes only go through the functions below.
grant select on wealth_os.broker_connections to authenticated;
grant all on wealth_os.broker_connections to service_role;

-- The Trading 212 instrument a holding was matched to (e.g. ONDS_US_EQ), so
-- later syncs match exactly instead of by ticker/name.
alter table wealth_os.holdings add column if not exists broker_ref text;

-- 2. Adviser-facing functions (called from the browser) --------------------

create or replace function wealth_os.save_broker_connection(p_account_id uuid, p_api_key text, p_api_secret text)
returns uuid
language plpgsql
security definer
set search_path = wealth_os, public
as $$
declare
  v_key text := trim(coalesce(p_api_key, ''));
  v_secret text := trim(coalesce(p_api_secret, ''));
  v_type text;
  v_owner uuid;
  v_conn wealth_os.broker_connections;
  v_secret_id uuid;
begin
  if not wealth_os.is_adviser() then
    raise exception 'Only the adviser can connect a broker';
  end if;
  select a.type, c.user_id into v_type, v_owner
  from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
  where a.id = p_account_id;
  if not found then
    raise exception 'Account not found';
  end if;
  -- PILOT GUARD (Trading 212 API Terms 6.2/6.3): own accounts only.
  if v_owner is distinct from auth.uid() then
    raise exception 'Pilot: Trading 212 can only be connected to your own accounts for now';
  end if;
  if v_type not in ('isa', 'gia') then
    raise exception 'The Trading 212 API only covers Stocks ISA and Invest (GIA) accounts';
  end if;
  if v_key = '' or v_secret = '' then
    raise exception 'Enter both the API key and the API secret';
  end if;
  if length(v_key) > 300 or length(v_secret) > 300 or position(':' in v_key) > 0 then
    raise exception 'That does not look like a Trading 212 API key';
  end if;

  select * into v_conn from wealth_os.broker_connections where account_id = p_account_id;
  if found then
    perform vault.update_secret(v_conn.vault_secret_id, v_key || ':' || v_secret);
    update wealth_os.broker_connections
       set key_hint = right(v_key, 4), last_status = null, last_error = null
     where id = v_conn.id;
    return v_conn.id;
  end if;

  delete from vault.secrets where name = 'broker_t212_' || p_account_id::text;  -- stale leftover, if any
  v_secret_id := vault.create_secret(
    v_key || ':' || v_secret,
    'broker_t212_' || p_account_id::text,
    'Trading 212 API key for Wealth OS account ' || p_account_id::text
  );
  insert into wealth_os.broker_connections (account_id, vault_secret_id, key_hint)
  values (p_account_id, v_secret_id, right(v_key, 4))
  returning id into v_conn.id;
  return v_conn.id;
end;
$$;

create or replace function wealth_os.delete_broker_connection(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = wealth_os, public
as $$
declare
  v_conn wealth_os.broker_connections;
begin
  if not wealth_os.is_adviser() then
    raise exception 'Only the adviser can disconnect a broker';
  end if;
  select * into v_conn from wealth_os.broker_connections where account_id = p_account_id;
  if not found then return; end if;
  delete from wealth_os.broker_connections where id = v_conn.id;
  delete from vault.secrets where id = v_conn.vault_secret_id;
end;
$$;

-- Called by the Edge Function with the user's own JWT, so auth.uid() is the
-- person who pressed "Sync now". Returns the connection to sync.
create or replace function wealth_os.request_broker_sync(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = wealth_os, public
as $$
declare
  v_id uuid;
begin
  if not wealth_os.is_adviser() then
    raise exception 'Only the adviser can sync a broker';
  end if;
  select bc.id into v_id
  from wealth_os.broker_connections bc
  join wealth_os.accounts a on a.id = bc.account_id
  join wealth_os.clients c on c.id = a.client_id
  where bc.account_id = p_account_id and c.user_id = auth.uid();  -- PILOT GUARD
  if v_id is null then
    raise exception 'No Trading 212 connection on this account';
  end if;
  return v_id;
end;
$$;

revoke all on function wealth_os.save_broker_connection(uuid, text, text) from public, anon;
revoke all on function wealth_os.delete_broker_connection(uuid) from public, anon;
revoke all on function wealth_os.request_broker_sync(uuid) from public, anon;
grant execute on function wealth_os.save_broker_connection(uuid, text, text) to authenticated;
grant execute on function wealth_os.delete_broker_connection(uuid) to authenticated;
grant execute on function wealth_os.request_broker_sync(uuid) to authenticated;

-- 3. Service-role functions (Edge Function only) ---------------------------

-- p_connection_id null = every auto_sync connection (the scheduled run).
create or replace function wealth_os.broker_sync_targets(p_connection_id uuid default null)
returns table (connection_id uuid, account_id uuid, credentials text)
language sql
stable
security definer
set search_path = wealth_os, public
as $$
  select bc.id, bc.account_id, ds.decrypted_secret
  from wealth_os.broker_connections bc
  join vault.decrypted_secrets ds on ds.id = bc.vault_secret_id
  where (p_connection_id is null and bc.auto_sync) or bc.id = p_connection_id;
$$;

-- p_summary:   {"currency": "GBP", "cash": 540.12}
-- p_positions: [{"ref","base","name","units","avgOpen","lastPrice","cost","value"}]
--              prices already in pounds (GBX converted), cost/value in GBP.
create or replace function wealth_os.apply_broker_sync(p_connection_id uuid, p_summary jsonb, p_positions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = wealth_os, public
as $$
declare
  v_account uuid;
  v_cash numeric := coalesce((p_summary->>'cash')::numeric, 0);
  v_pos jsonb;
  v_hid uuid;
  v_touched uuid[] := '{}';
  v_updated int := 0;
  v_added int := 0;
  v_missing text[];
  v_total numeric;
  v_result jsonb;
begin
  select account_id into v_account from wealth_os.broker_connections where id = p_connection_id;
  if v_account is null then
    raise exception 'apply_broker_sync: unknown connection %', p_connection_id;
  end if;
  if coalesce(p_summary->>'currency', '') <> 'GBP' then
    raise exception 'Trading 212 account currency is %, Wealth OS only supports GBP', coalesce(p_summary->>'currency', 'unknown');
  end if;

  for v_pos in select * from jsonb_array_elements(coalesce(p_positions, '[]'::jsonb)) loop
    v_hid := null;
    -- 1) exact match from an earlier sync
    select id into v_hid from wealth_os.holdings
     where account_id = v_account and broker_ref = v_pos->>'ref' and id <> all(v_touched)
     order by created_at limit 1;
    -- 2) ticker, then 3) name, against holdings not already claimed
    if v_hid is null then
      select id into v_hid from wealth_os.holdings
       where account_id = v_account and broker_ref is null and id <> all(v_touched)
         and upper(trim(ticker)) = upper(v_pos->>'base')
       order by created_at limit 1;
    end if;
    if v_hid is null then
      select id into v_hid from wealth_os.holdings
       where account_id = v_account and broker_ref is null and id <> all(v_touched)
         and upper(trim(name)) = upper(v_pos->>'base')
       order by created_at limit 1;
    end if;

    if v_hid is not null then
      update wealth_os.holdings
         set units = (v_pos->>'units')::numeric,
             avg_open = (v_pos->>'avgOpen')::numeric,
             cost_basis = (v_pos->>'cost')::numeric,
             value = (v_pos->>'value')::numeric,
             last_price = (v_pos->>'lastPrice')::numeric,
             last_priced_at = now(),
             price_source = 'manual',
             broker_ref = v_pos->>'ref',
             ticker = coalesce(nullif(trim(ticker), ''), v_pos->>'base'),
             last_edited_by = 'trading212',
             last_edited_at = now()
       where id = v_hid;
      v_updated := v_updated + 1;
    else
      insert into wealth_os.holdings
        (account_id, name, ticker, units, avg_open, cost_basis, value, last_price, last_priced_at,
         price_source, broker_ref, last_edited_by, last_edited_at)
      values
        (v_account, coalesce(nullif(v_pos->>'name', ''), v_pos->>'base'), v_pos->>'base',
         (v_pos->>'units')::numeric, (v_pos->>'avgOpen')::numeric, (v_pos->>'cost')::numeric,
         (v_pos->>'value')::numeric, (v_pos->>'lastPrice')::numeric, now(),
         'manual', v_pos->>'ref', 'trading212', now())
      returning id into v_hid;
      v_added := v_added + 1;
    end if;
    v_touched := v_touched || v_hid;
  end loop;

  -- Holdings Wealth OS still has that Trading 212 no longer holds. Not
  -- deleted automatically (pilot) -- flagged so the adviser removes them.
  select coalesce(array_agg(name order by name), '{}') into v_missing
    from wealth_os.holdings where account_id = v_account and id <> all(v_touched);

  select coalesce(sum(value), 0) + v_cash into v_total from wealth_os.holdings where account_id = v_account;
  update wealth_os.accounts
     set cash_balance = round(v_cash, 2),
         value = v_total,
         last_updated = current_date,
         last_edited_by = 'trading212',
         last_edited_at = now()
   where id = v_account;

  v_result := jsonb_build_object('updated', v_updated, 'added', v_added, 'missing', to_jsonb(v_missing),
                                 'cash', round(v_cash, 2), 'accountValue', round(v_total, 2));
  update wealth_os.broker_connections
     set last_synced_at = now(), last_status = 'ok', last_error = null, last_result = v_result
   where id = p_connection_id;
  return v_result;
end;
$$;

create or replace function wealth_os.mark_broker_sync_error(p_connection_id uuid, p_error text)
returns void
language sql
security definer
set search_path = wealth_os, public
as $$
  update wealth_os.broker_connections
     set last_synced_at = now(), last_status = 'error', last_error = left(p_error, 500)
   where id = p_connection_id;
$$;

revoke all on function wealth_os.broker_sync_targets(uuid) from public, anon, authenticated;
revoke all on function wealth_os.apply_broker_sync(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function wealth_os.mark_broker_sync_error(uuid, text) from public, anon, authenticated;
grant execute on function wealth_os.broker_sync_targets(uuid) to service_role;
grant execute on function wealth_os.apply_broker_sync(uuid, jsonb, jsonb) to service_role;
grant execute on function wealth_os.mark_broker_sync_error(uuid, text) to service_role;

-- 4. Schedule: hourly on weekdays, 07:05-21:05 UTC -------------------------
-- Reuses the Vault job secret from 004 (price_job_secret).

create or replace function wealth_os.trigger_broker_sync()
returns void
language plpgsql
security definer
set search_path = wealth_os, public, extensions
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from wealth_os.broker_connections where auto_sync) then
    return;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'price_job_secret';
  perform net.http_post(
    url := 'https://ztyqijiiayrengvxsqkw.supabase.co/functions/v1/broker-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-price-job-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function wealth_os.trigger_broker_sync() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'wealth_os_broker_sync';
end $$;
select cron.schedule('wealth_os_broker_sync', '5 7-21 * * 1-5', $$select wealth_os.trigger_broker_sync();$$);
