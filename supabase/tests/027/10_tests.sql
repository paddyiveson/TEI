-- Behaviour tests for migration 027, run against a local copy of the live
-- wealth_os contribution engine. Each block raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- Fixtures: one coach, one client, three accounts.
insert into wealth_os.profiles (user_id, role) values ('aaaaaaaa-0000-4000-8000-000000000001', 'adviser');
select set_config('test.uid', 'aaaaaaaa-0000-4000-8000-000000000001', false);
insert into wealth_os.clients (id) values ('cccccccc-0000-4000-8000-000000000001');
-- A: pension held as a balance only, £10,000, history from July.
insert into wealth_os.accounts (id, client_id, type, value, last_updated) values ('a0000000-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-000000000001', 'pension', 10000, '2026-07-31');
insert into wealth_os.account_months (account_id, month_key, value, last_edited_by, last_edited_at, carried_forward) values
  ('a0000000-0000-4000-8000-00000000000a', '2026-07', 10000, 'client', '2026-07-31', false),
  ('a0000000-0000-4000-8000-00000000000a', '2026-08', 10000, 'system:auto-carry-forward', '2026-08-02', true),
  ('a0000000-0000-4000-8000-00000000000a', '2026-09', 10000, 'system:auto-carry-forward', '2026-09-02', true),
  ('a0000000-0000-4000-8000-00000000000a', '2026-10', 10000, 'system:auto-carry-forward', '2026-10-02', true);
-- F: pension with one manual fund (today's behaviour), £5,000.
insert into wealth_os.accounts (id, client_id, type, value, is_manual_priced) values ('a0000000-0000-4000-8000-00000000000f', 'cccccccc-0000-4000-8000-000000000001', 'pension', 5000, true);
insert into wealth_os.holdings (id, account_id, name, value, cost_basis) values ('b0000000-0000-4000-8000-00000000000f', 'a0000000-0000-4000-8000-00000000000f', 'Global fund', 5000, 4000);
-- C: cash ISA, balance only, no history rows at all.
insert into wealth_os.accounts (id, client_id, type, value) values ('a0000000-0000-4000-8000-00000000000c', 'cccccccc-0000-4000-8000-000000000001', 'cash_isa', 2000);

do $t$
declare r jsonb; ok boolean;
begin
  -- 1. Validation: without funds the rule is one monthly total.
  begin
    perform wealth_os.save_contribution_rule('a0000000-0000-4000-8000-00000000000a',
      '{"basis":"fixed","allocation_method":"manual","day_of_month":28,"allocations":[]}');
    raise exception 'FAIL 1b: manual split accepted with no funds';
  exception when others then
    if sqlerrm not like 'Without funds, the rule pays one monthly total%' then raise exception 'FAIL 1b: %', sqlerrm; end if;
  end;
  raise notice 'PASS 1 validation';

  -- 2. Save: salary-derived pension rule on the balance-only account.
  r := wealth_os.save_contribution_rule('a0000000-0000-4000-8000-00000000000a',
    '{"basis":"salary_derived","allocation_method":"percentage","day_of_month":28,"gross_annual_salary":38000,"pensionable_basis":"full_salary","employee_pct":5,"employer_pct":4,"employer_match_cap_pct":5,"contribution_method":"salary_sacrifice","employer_ni_passon_pct":0,"allocations":[]}');
  if (r->'calc'->>'total')::numeric <> 316.66 then raise exception 'FAIL 2: total %', r->'calc'->>'total'; end if;
  if (select contribution_sacrifice from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000a') <> 316.66 then raise exception 'FAIL 2: legacy fields not synced'; end if;
  -- Fund rule on F and a fixed £150 rule on the cash ISA, all starting in August.
  perform wealth_os.save_contribution_rule('a0000000-0000-4000-8000-00000000000f',
    '{"basis":"fixed","allocation_method":"percentage","total_amount":200,"day_of_month":28,"allocations":[{"holding_id":"b0000000-0000-4000-8000-00000000000f","weight_pct":100}]}');
  perform wealth_os.save_contribution_rule('a0000000-0000-4000-8000-00000000000c',
    '{"basis":"fixed","allocation_method":"percentage","total_amount":150,"day_of_month":28,"allocations":[]}');
  update wealth_os.contribution_rule_state set start_date = '2026-08-01';
  update wealth_os.contribution_rules set effective_from = '2026-08-01';
  raise notice 'PASS 2 save';
end
$t$;

-- 3. Engine catch-up: Aug, Sep and Oct runs on the 28th.
do $t$
declare r jsonb; v numeric; m jsonb;
begin
  r := wealth_os.run_contribution_engine('2026-11-18');
  if (r->>'runs')::int <> 9 or jsonb_array_length(r->'errors') <> 0 then raise exception 'FAIL 3: %', r; end if;
  -- A: 10,000 + 3 x 316.66
  select value into v from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000a';
  if v <> 10949.98 then raise exception 'FAIL 3 A value %', v; end if;
  select jsonb_object_agg(month_key, value) into m from wealth_os.account_months where account_id = 'a0000000-0000-4000-8000-00000000000a';
  if m <> '{"2026-07":10000,"2026-08":10316.66,"2026-09":10633.32,"2026-10":10949.98}'::jsonb then raise exception 'FAIL 3 A months %', m; end if;
  -- A: money paid in logged as salary sacrifice, 3 months.
  if (select sum(sacrifice_amount) from wealth_os.account_deposits where account_id = 'a0000000-0000-4000-8000-00000000000a') <> 949.98 then raise exception 'FAIL 3 A deposits'; end if;
  -- F (funds): unchanged behaviour, fund +600, account follows its holding.
  if (select value from wealth_os.holdings where id = 'b0000000-0000-4000-8000-00000000000f') <> 5600
     or (select value from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000f') <> 5600 then raise exception 'FAIL 3 F'; end if;
  -- C: no history rows; value + 450, no rows invented for past months.
  if (select value from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000c') <> 2450 then raise exception 'FAIL 3 C value'; end if;
  if exists (select 1 from wealth_os.account_months where account_id = 'a0000000-0000-4000-8000-00000000000c') then raise exception 'FAIL 3 C rows'; end if;
  if (select sum(amount) from wealth_os.account_deposits where account_id = 'a0000000-0000-4000-8000-00000000000c') <> 450 then raise exception 'FAIL 3 C deposits'; end if;
  -- A second engine run the same day does nothing more.
  r := wealth_os.run_contribution_engine('2026-11-18');
  if (r->>'runs')::int <> 0 then raise exception 'FAIL 3 rerun %', r; end if;
  raise notice 'PASS 3 engine: balance accounts grow, fund account unchanged behaviour, no double runs';
end
$t$;

-- 4. Reverse and adjust on a balance run with no statement since.
do $t$
declare r jsonb; v_run uuid; v numeric;
begin
  select id into v_run from wealth_os.contribution_runs where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = '2026-09';
  r := wealth_os.adjust_contribution_run(v_run, '[{"amount": 300}]', 'payslip said 300');
  if r->>'message' <> 'Money paid in and balance adjusted.' then raise exception 'FAIL 4 adjust msg %', r; end if;
  select value into v from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000a';
  if v <> 10933.32 then raise exception 'FAIL 4 adjust value %', v; end if;
  if (select value from wealth_os.account_months where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = '2026-08') <> 10316.66
     or (select value from wealth_os.account_months where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = '2026-09') <> 10616.66 then raise exception 'FAIL 4 adjust months'; end if;
  if (select sacrifice_amount from wealth_os.account_deposits where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = '2026-09') <> 300 then raise exception 'FAIL 4 adjust deposits'; end if;
  begin
    perform wealth_os.adjust_contribution_run(v_run, '[{"holding_id":"b0000000-0000-4000-8000-00000000000f","amount": 300}]', 'x');
    raise exception 'FAIL 4: a fund allocation was accepted on a balance run';
  exception when others then
    if sqlerrm not like 'Enter the corrected amount%' then raise exception 'FAIL 4b: %', sqlerrm; end if;
  end;
  r := wealth_os.reverse_contribution_run(v_run, 'wrong month');
  select value into v from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000a';
  if v <> 10633.32 or r->>'message' <> 'Money paid in and balance restored.' then raise exception 'FAIL 4 reverse % %', v, r; end if;
  if (select sacrifice_amount from wealth_os.account_deposits where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = '2026-09') is not null
     and (select sacrifice_amount from wealth_os.account_deposits where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = '2026-09') <> 0 then raise exception 'FAIL 4 reverse deposits'; end if;
  raise notice 'PASS 4 adjust and reverse move the balance, history and money paid in';
end
$t$;

-- 5. A statement entered after a run stands.
do $t$
declare r jsonb; v_run uuid; v numeric;
begin
  -- The client enters October's balance on 5 Nov (after the 28 Oct run).
  update wealth_os.account_months set value = 11200, last_edited_by = 'client', last_edited_at = '2026-11-05'
   where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = '2026-10';
  update wealth_os.accounts set value = 11200, last_updated = '2026-11-05' where id = 'a0000000-0000-4000-8000-00000000000a';
  select id into v_run from wealth_os.contribution_runs where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = '2026-10';
  r := wealth_os.reverse_contribution_run(v_run, 'test');
  if (r->>'balance_kept')::boolean is not true or r->>'message' not like 'Money paid in restored. Balance left as the figure entered%' then raise exception 'FAIL 5 msg %', r; end if;
  select value into v from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000a';
  if v <> 11200 then raise exception 'FAIL 5 value %', v; end if;
  if (select value from wealth_os.account_months where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = '2026-10') <> 11200 then raise exception 'FAIL 5 month'; end if;
  raise notice 'PASS 5 a balance entered after the run stands';
end
$t$;

-- 6. Next run after the statement adds on top of it, and fills this month.
do $t$
declare r jsonb; v numeric; mv numeric;
begin
  -- Today is 18 Nov; pretend the run day has come by running the engine for 28 Nov.
  update wealth_os.contribution_rules set day_of_month = 18 where account_id = 'a0000000-0000-4000-8000-00000000000a' and effective_to is null;
  r := wealth_os.run_contribution_engine(current_date);
  select value into v from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000a';
  -- Nov: the statement (5 Nov) is before today's run, so the run adds.
  if v <> 11516.66 then raise exception 'FAIL 6 value % (%)', v, r; end if;
  select value into mv from wealth_os.account_months where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = to_char(current_date, 'YYYY-MM');
  if mv is distinct from 11516.66 then raise exception 'FAIL 6 current month row %', mv; end if;
  if (select carried_forward from wealth_os.account_months where account_id = 'a0000000-0000-4000-8000-00000000000a' and month_key = to_char(current_date, 'YYYY-MM')) is not true then raise exception 'FAIL 6 not marked to confirm'; end if;
  raise notice 'PASS 6 later run adds on top of the statement; this month''s balance added for the client to confirm';
end
$t$;

-- 7. Funds added later to a balance-rule account: payments go into its cash.
do $t$
declare r jsonb;
begin
  insert into wealth_os.holdings (account_id, name, value) values ('a0000000-0000-4000-8000-00000000000c', 'Cash fund', 2450);
  update wealth_os.contribution_rules set day_of_month = 18 where effective_to is null;
  r := wealth_os.run_contribution_engine(current_date);
  if jsonb_array_length(r->'errors') <> 0 then raise exception 'FAIL 7 errors %', r; end if;
  if (select cash_balance from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000c') <> 150
     or (select value from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000c') <> 2600 then raise exception 'FAIL 7 cash/value'; end if;
  if (select sum(amount) from wealth_os.account_deposits where account_id = 'a0000000-0000-4000-8000-00000000000c') <> 600 then raise exception 'FAIL 7 deposits'; end if;
  if not exists (select 1 from wealth_os.contribution_runs where account_id = 'a0000000-0000-4000-8000-00000000000f' and month_key = to_char(current_date, 'YYYY-MM')) then raise exception 'FAIL 7 fund account did not run'; end if;
  raise notice 'PASS 7 funds added later: payments go into the account''s cash, others run';
end
$t$;

-- 8. Monthly snapshot after a run carries the new balance forward.
do $t$
begin
  if wealth_os.carry_forward_account_value('a0000000-0000-4000-8000-00000000000a', to_char(current_date + interval '1 month', 'YYYY-MM'))
     <> (select value from wealth_os.accounts where id = 'a0000000-0000-4000-8000-00000000000a') then raise exception 'FAIL 8'; end if;
  raise notice 'PASS 8 next month''s carry-forward uses the grown balance';
end
$t$;

-- 9. Preview of a no-funds rule (the editor calls this).
do $t$
declare r jsonb;
begin
  r := wealth_os.preview_contribution('{"account_id":"a0000000-0000-4000-8000-00000000000a","basis":"fixed","allocation_method":"percentage","total_amount":250,"day_of_month":28,"allocations":[]}');
  if (r->>'total')::numeric <> 250 or jsonb_array_length(r->'allocations') <> 0 then raise exception 'FAIL 9 %', r; end if;
  raise notice 'PASS 9 preview';
end
$t$;

-- 10. An account holding only auto-priced shares (like a S&S LISA of US shares):
--     a rule with no funds pays into the account's cash; the shares are untouched.
insert into wealth_os.accounts (id, client_id, type, value, cash_balance, is_manual_priced) values ('a0000000-0000-4000-8000-0000000000ab', 'cccccccc-0000-4000-8000-000000000001', 'lisa', 3000, 0, false);
insert into wealth_os.holdings (id, account_id, name, ticker, value, cost_basis, price_source) values
  ('b0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000ab', 'Tesla', 'TSLA', 2000, 1800, 'auto_us'),
  ('b0000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-0000000000ab', 'Microsoft', 'MSFT', 1000, 900, 'auto_us');
do $t$
declare r jsonb; v_run uuid;
begin
  -- Funds that are auto-priced still cannot be chosen.
  begin
    perform wealth_os.save_contribution_rule('a0000000-0000-4000-8000-0000000000ab',
      '{"basis":"fixed","allocation_method":"percentage","total_amount":100,"day_of_month":18,"allocations":[{"holding_id":"b0000000-0000-4000-8000-0000000000a1","weight_pct":100}]}');
    raise exception 'FAIL 10a: an auto-priced fund was accepted';
  exception when others then
    if sqlerrm not like 'Funds must belong to this account and be manually priced%' then raise exception 'FAIL 10a: %', sqlerrm; end if;
  end;
  -- No funds chosen: accepted, pays into cash.
  perform wealth_os.save_contribution_rule('a0000000-0000-4000-8000-0000000000ab',
    '{"basis":"fixed","allocation_method":"percentage","total_amount":100,"day_of_month":18,"allocations":[]}');
  r := wealth_os.run_contribution_engine(current_date);
  if jsonb_array_length(r->'errors') <> 0 then raise exception 'FAIL 10 errors %', r; end if;
  if (select cash_balance from wealth_os.accounts where id = 'a0000000-0000-4000-8000-0000000000ab') <> 100
     or (select value from wealth_os.accounts where id = 'a0000000-0000-4000-8000-0000000000ab') <> 3100 then raise exception 'FAIL 10 cash/value'; end if;
  if (select sum(value) from wealth_os.holdings where account_id = 'a0000000-0000-4000-8000-0000000000ab') <> 3000
     or (select sum(cost_basis) from wealth_os.holdings where account_id = 'a0000000-0000-4000-8000-0000000000ab') <> 2700 then raise exception 'FAIL 10 shares touched'; end if;
  if (select amount from wealth_os.account_deposits where account_id = 'a0000000-0000-4000-8000-0000000000ab') <> 100 then raise exception 'FAIL 10 deposits'; end if;
  -- Adjust to £80, then reverse: cash follows.
  select id into v_run from wealth_os.contribution_runs where account_id = 'a0000000-0000-4000-8000-0000000000ab';
  r := wealth_os.adjust_contribution_run(v_run, '[{"amount": 80}]', 'statement said 80');
  if (select cash_balance from wealth_os.accounts where id = 'a0000000-0000-4000-8000-0000000000ab') <> 80 then raise exception 'FAIL 10 adjust %', r; end if;
  -- The client saves the account (their own cash figure) after the run: a reverse leaves it.
  update wealth_os.accounts set cash_balance = 75, last_edited_by = 'client', last_edited_at = now() where id = 'a0000000-0000-4000-8000-0000000000ab';
  r := wealth_os.reverse_contribution_run(v_run, 'test');
  if (r->>'balance_kept')::boolean is not true or (select cash_balance from wealth_os.accounts where id = 'a0000000-0000-4000-8000-0000000000ab') <> 75 then raise exception 'FAIL 10 reverse kept %', r; end if;
  if coalesce((select amount from wealth_os.account_deposits where account_id = 'a0000000-0000-4000-8000-0000000000ab'), 0) <> 0 then raise exception 'FAIL 10 reverse deposits'; end if;
  raise notice 'PASS 10 auto-priced shares: the rule pays into the account''s cash, shares untouched, adjust and reverse follow';
end
$t$;
