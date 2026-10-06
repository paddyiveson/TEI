-- Run AFTER 005_pension_contribution_engine.sql in the same transaction.
-- Ends by raising an exception carrying the PASS/FAIL log, which also
-- rolls the whole transaction (migration included) back.
create temp table t_log(n serial, line text) on commit drop;
create function pg_temp.chk(p_name text, p_got numeric, p_exp numeric) returns void language sql as $$
  insert into t_log(line) values (case when p_got is not distinct from p_exp then 'PASS ' || p_name
                                       else 'FAIL ' || p_name || ': got ' || coalesce(p_got::text,'null') || ' expected ' || coalesce(p_exp::text,'null') end);
$$;
create function pg_temp.chkt(p_name text, p_got text, p_exp text) returns void language sql as $$
  insert into t_log(line) values (case when p_got is not distinct from p_exp then 'PASS ' || p_name
                                       else 'FAIL ' || p_name || ': got ' || coalesce(p_got,'null') || ' expected ' || coalesce(p_exp,'null') end);
$$;

do $test$
declare
  v_today date := current_date;
  v_day int := extract(day from current_date)::int;
  c uuid; inc uuid; inc2 uuid;
  a uuid; h1 uuid; h2 uuid;            -- £304 55/45
  b uuid; b1 uuid;                     -- created after scheduled day
  e uuid; e1 uuid; e2 uuid;            -- rule edit / versions
  d uuid; d1 uuid;                     -- uplift
  s uuid; s1 uuid;                     -- income change accepted
  p uuid; p1 uuid;                     -- pending flag at anniversary
  g uuid; g1 uuid; g2acc uuid; g21 uuid; -- RAS / sacrifice
  m uuid; m1 uuid; ctl uuid; ctl1 uuid; -- pricing guard
  res jsonb; r jsonb; v_run uuid; v_flag uuid; n int; x numeric; t text;
begin
  perform set_config('request.jwt.claim.sub', '2ef6b2e1-3d5e-4479-bc0d-b9f91c4ded5a', true);
  perform set_config('request.jwt.claims', '{"sub":"2ef6b2e1-3d5e-4479-bc0d-b9f91c4ded5a","role":"authenticated"}', true);
  perform pg_temp.chkt('auth context is adviser', wealth_os.is_adviser()::text, 'true');

  insert into wealth_os.clients(first_name, last_name) values ('ZZ', 'Contribution Test') returning id into c;
  insert into wealth_os.income(client_id, owner, type, amount, frequency) values (c, 'client', 'Salary', 2500, 'monthly') returning id into inc;
  insert into wealth_os.income(client_id, owner, type, amount, frequency) values (c, 'client', 'Salary', 3000, 'monthly') returning id into inc2;

  -- ===== T1: £304/month split 55/45 =====
  insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'pension', 0, 'ZZ A') returning id into a;
  insert into wealth_os.holdings(account_id, name, value, cost_basis) values (a, 'Fund 1', 1000, 900) returning id into h1;
  insert into wealth_os.holdings(account_id, name, value, cost_basis) values (a, 'Fund 2', 500, 400) returning id into h2;
  perform wealth_os.set_manual_priced(a, true);
  res := wealth_os.save_contribution_rule(a, jsonb_build_object('basis','fixed','allocation_method','percentage','total_amount',304,
           'day_of_month', least(v_day,28), 'allocations', jsonb_build_array(
             jsonb_build_object('holding_id',h1,'weight_pct',55), jsonb_build_object('holding_id',h2,'weight_pct',45))));
  perform pg_temp.chk('T1 calc total', (res#>>'{calc,total}')::numeric, 304);
  perform pg_temp.chkt('T1 next run date = today', res->>'next_run_date', v_today::text);
  update wealth_os.accounts set last_updated = '2026-01-01' where id = a;
  res := wealth_os.run_contribution_engine();
  perform pg_temp.chk('T1 engine runs', (res->>'runs')::numeric, 1);
  perform pg_temp.chk('T1 h1 cost +167.20', (select cost_basis from wealth_os.holdings where id=h1), 1067.20);
  perform pg_temp.chk('T1 h2 cost +136.80', (select cost_basis from wealth_os.holdings where id=h2), 536.80);
  perform pg_temp.chk('T1 h1 value +167.20', (select value from wealth_os.holdings where id=h1), 1167.20);
  perform pg_temp.chk('T1 h2 value +136.80', (select value from wealth_os.holdings where id=h2), 636.80);
  perform pg_temp.chk('T1 account value +304', (select value from wealth_os.accounts where id=a), 1804);
  perform pg_temp.chkt('T1 account last_updated today', (select last_updated::text from wealth_os.accounts where id=a), v_today::text);
  perform pg_temp.chkt('T1 value_checked_at unchanged (null)', (select string_agg(coalesce(value_checked_at::text,'null'),',') from wealth_os.holdings where account_id=a), 'null,null');
  perform pg_temp.chk('T1 deposit amount', (select amount from wealth_os.account_deposits where account_id=a and month_key=to_char(v_today,'YYYY-MM')), 304);
  perform pg_temp.chk('T1 legacy personal', (select contribution_personal from wealth_os.accounts where id=a), 304);
  perform pg_temp.chk('T1 legacy sacrifice', (select contribution_sacrifice from wealth_os.accounts where id=a), 0);
  perform pg_temp.chkt('T1 engine stamp', (select string_agg(distinct last_edited_by, ',') from wealth_os.holdings where account_id=a), 'system:contribution-engine');

  -- ===== T2: engine twice in one day =====
  perform wealth_os.run_contribution_engine();
  perform pg_temp.chk('T2 still one run', (select count(*) from wealth_os.contribution_runs where account_id=a), 1);
  perform pg_temp.chk('T2 value not doubled', (select value from wealth_os.accounts where id=a), 1804);

  -- ===== T3: manual value entry overwrites =====
  res := wealth_os.record_holding_valuation(h1, 2000, v_today);
  perform pg_temp.chk('T3 value replaced', (select value from wealth_os.holdings where id=h1), 2000);
  perform pg_temp.chk('T3 cost unchanged', (select cost_basis from wealth_os.holdings where id=h1), 1067.20);
  perform pg_temp.chkt('T3 value_checked_at set', (select value_checked_at::text from wealth_os.holdings where id=h1), v_today::text);

  -- ===== T4: next run increases from the entered figure =====
  res := wealth_os.run_contribution_engine((date_trunc('month', v_today) + interval '1 month')::date + (least(v_day,28)-1));
  perform pg_temp.chk('T4 next-month run', (res->>'runs')::numeric, 1);
  perform pg_temp.chk('T4 h1 value from statement', (select value from wealth_os.holdings where id=h1), 2167.20);
  perform pg_temp.chkt('T4 value_checked_at not moved', (select value_checked_at::text from wealth_os.holdings where id=h1), v_today::text);

  -- ===== T14: reverse after a statement -> cost restored, value kept =====
  select id into v_run from wealth_os.contribution_runs where account_id=a and run_date = v_today;
  res := wealth_os.reverse_contribution_run(v_run, 'test reverse');
  perform pg_temp.chk('T14 h1 cost restored', (select cost_basis from wealth_os.holdings where id=h1), 1067.20 + 167.20 - 167.20);
  perform pg_temp.chk('T14 h1 value kept (statement + later run)', (select value from wealth_os.holdings where id=h1), 2167.20);
  perform pg_temp.chk('T14 h2 cost restored', (select cost_basis from wealth_os.holdings where id=h2), 536.80);
  perform pg_temp.chk('T14 h2 value restored', (select value from wealth_os.holdings where id=h2), 636.80);
  perform pg_temp.chk('T14 reports kept holdings', jsonb_array_length(res->'value_kept'), 1);
  perform pg_temp.chk('T14 deposit back to 0', (select amount from wealth_os.account_deposits where account_id=a and month_key=to_char(v_today,'YYYY-MM')), 0);
  perform pg_temp.chkt('T14 status', (select status from wealth_os.contribution_runs where id=v_run), 'reversed');
  perform wealth_os.run_contribution_engine();
  perform pg_temp.chk('T14 reversed run not re-applied', (select count(*) from wealth_os.contribution_runs where account_id=a and month_key=to_char(v_today,'YYYY-MM')), 1);

  -- valuation as at a past date carries later runs on top
  res := wealth_os.record_holding_valuation(h2, 600, v_today - 3);
  perform pg_temp.chk('T3b statement as at earlier date + later run', (select value from wealth_os.holdings where id=h2), 600 + 136.80);

  -- ===== T5: rule created after this month's scheduled day =====
  if v_day > 1 then
    insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'pension', 0, 'ZZ B') returning id into b;
    insert into wealth_os.holdings(account_id, name, value, cost_basis) values (b, 'B Fund', 100, 100) returning id into b1;
    perform wealth_os.set_manual_priced(b, true);
    res := wealth_os.save_contribution_rule(b, jsonb_build_object('basis','fixed','allocation_method','manual','day_of_month', least(v_day-1,28),
             'allocations', jsonb_build_array(jsonb_build_object('holding_id',b1,'amount',50))));
    perform pg_temp.chkt('T5 next run is next month', res->>'next_run_date', ((date_trunc('month', v_today) + interval '1 month')::date + (least(v_day-1,28)-1))::text);
    res := wealth_os.run_contribution_engine();
    perform pg_temp.chk('T5 no run this month', (select count(*) from wealth_os.contribution_runs where account_id=b), 0);
    perform wealth_os.run_contribution_engine((date_trunc('month', v_today) + interval '1 month')::date + (least(v_day-1,28)-1));
    perform pg_temp.chk('T5 first run next month', (select count(*) from wealth_os.contribution_runs where account_id=b), 1);
    perform pg_temp.chk('T5 manual total', (select total_amount from wealth_os.contribution_runs where account_id=b), 50);
    perform pg_temp.chk('T5 legacy personal (manual method)', (select contribution_personal from wealth_os.accounts where id=b), 50);
  end if;

  -- ===== T6: rule edit -> old version for past, new for future =====
  insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'isa', 0, 'ZZ E') returning id into e;
  insert into wealth_os.holdings(account_id, name, value, cost_basis) values (e, 'E1', 0, 0) returning id into e1;
  perform wealth_os.set_manual_priced(e, true);
  perform wealth_os.save_contribution_rule(e, jsonb_build_object('basis','fixed','allocation_method','percentage','total_amount',100,'day_of_month',5,
           'allocations', jsonb_build_array(jsonb_build_object('holding_id',e1,'weight_pct',100))));
  -- pretend v1 was created 1 Aug
  update wealth_os.contribution_rules set effective_from = date_trunc('month', v_today - interval '2 months')::date where account_id = e;
  update wealth_os.contribution_rule_state set start_date = date_trunc('month', v_today - interval '2 months')::date where account_id = e;
  perform wealth_os.save_contribution_rule(e, jsonb_build_object('basis','fixed','allocation_method','percentage','total_amount',200,'day_of_month',5,
           'allocations', jsonb_build_array(jsonb_build_object('holding_id',e1,'weight_pct',100))));
  perform pg_temp.chk('T6 two versions', (select count(*) from wealth_os.contribution_rules where account_id=e), 2);
  perform pg_temp.chkt('T6 v1 closed yesterday', (select effective_to::text from wealth_os.contribution_rules where account_id=e and version=1), (v_today-1)::text);
  perform pg_temp.chk('T6 legacy contribution synced (isa)', (select contribution from wealth_os.accounts where id=e), 200);
  perform wealth_os.run_contribution_engine();
  perform pg_temp.chk('T6 catch-up runs on v1', (select count(*) from wealth_os.contribution_runs cr join wealth_os.contribution_rules r on r.id=cr.rule_id
                                                where cr.account_id=e and r.version=1 and cr.total_amount=100), case when v_day >= 5 then 3 else 2 end);
  perform wealth_os.run_contribution_engine((date_trunc('month', v_today) + interval '1 month')::date + 4);
  perform pg_temp.chk('T6 future run on v2 = 200', (select cr.total_amount from wealth_os.contribution_runs cr join wealth_os.contribution_rules r on r.id=cr.rule_id
                                                    where cr.account_id=e and r.version=2), 200);
  perform pg_temp.chkt('T6 state reviewed by manual_edit', (select last_review_source from wealth_os.contribution_rule_state where account_id=e), 'manual_edit');

  -- ===== T7: anniversary, no income change, 3% uplift =====
  insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'pension', 0, 'ZZ D') returning id into d;
  insert into wealth_os.holdings(account_id, name, value, cost_basis) values (d, 'D1', 0, 0) returning id into d1;
  perform wealth_os.set_manual_priced(d, true);
  perform wealth_os.save_contribution_rule(d, jsonb_build_object('basis','fixed','allocation_method','percentage','total_amount',100,
           'day_of_month', least(v_day,28), 'annual_uplift_pct', 3,
           'allocations', jsonb_build_array(jsonb_build_object('holding_id',d1,'weight_pct',100))));
  update wealth_os.contribution_rules set effective_from = (v_today - interval '1 year')::date where account_id = d;
  update wealth_os.contribution_rule_state set start_date = (v_today - interval '1 year')::date, next_uplift_date = v_today,
         last_reviewed_at = (v_today - interval '1 year')::date, last_review_source = 'created' where account_id = d;
  res := wealth_os.run_contribution_engine();
  perform wealth_os.run_contribution_engine();
  perform pg_temp.chk('T7 one uplift version', (select count(*) from wealth_os.contribution_rules where account_id=d and change_reason='annual_uplift'), 1);
  perform pg_temp.chk('T7 uplifted total', (select total_amount from wealth_os.contribution_rules where account_id=d and effective_to is null), 103);
  perform pg_temp.chkt('T7 next uplift +1y', (select next_uplift_date::text from wealth_os.contribution_rule_state where account_id=d), (v_today + interval '1 year')::date::text);
  perform pg_temp.chk('T7 today''s run uses uplifted rule', (select total_amount from wealth_os.contribution_runs where account_id=d and run_date=v_today), 103);
  perform pg_temp.chk('T7 catch-up: 12 runs at 100 then today at 103', (select count(*) from wealth_os.contribution_runs where account_id=d), 13);
  perform pg_temp.chk('T7 legacy synced to 103', (select contribution_personal from wealth_os.accounts where id=d), 103);

  -- ===== T8: income change accepted within the cycle -> roll, no uplift =====
  insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'pension', 0, 'ZZ S') returning id into s;
  insert into wealth_os.holdings(account_id, name, value, cost_basis) values (s, 'S1', 0, 0) returning id into s1;
  perform wealth_os.set_manual_priced(s, true);
  perform wealth_os.save_contribution_rule(s, jsonb_build_object('basis','salary_derived','allocation_method','percentage','day_of_month',28,
           'annual_uplift_pct', 3, 'gross_annual_salary', 40000, 'pensionable_basis','full_salary','employee_pct',5,'employer_pct',3,
           'employer_match_cap_pct',0,'contribution_method','relief_at_source','linked_income_id', inc,
           'allocations', jsonb_build_array(jsonb_build_object('holding_id',s1,'weight_pct',100))));
  update wealth_os.contribution_rule_state set next_uplift_date = v_today, start_date = v_today where account_id = s;
  update wealth_os.income set amount = 2750 where id = inc;
  select id into v_flag from wealth_os.contribution_flags where account_id = s and status='pending';
  perform pg_temp.chkt('T8 flag created', (v_flag is not null)::text, 'true');
  perform pg_temp.chk('T8 suggested gross approx', (select (suggested->>'gross_annual_salary')::numeric from wealth_os.contribution_flags where id=v_flag), 44000);
  perform pg_temp.chkt('T8 suggestion marked approximate', (select suggested->>'approximate' from wealth_os.contribution_flags where id=v_flag), 'true');
  update wealth_os.income set amount = 2800 where id = inc;   -- second edit updates the same flag
  perform pg_temp.chk('T8 still one pending flag', (select count(*) from wealth_os.contribution_flags where account_id=s and status='pending'), 1);
  perform pg_temp.chk('T8 suggestion recomputed vs original', (select (suggested->>'gross_annual_salary')::numeric from wealth_os.contribution_flags where id=v_flag), 44800);
  res := wealth_os.resolve_contribution_flag(v_flag, 'accept', null);
  perform pg_temp.chk('T8 new version gross', (select gross_annual_salary from wealth_os.contribution_rules where account_id=s and effective_to is null), 44800);
  perform pg_temp.chkt('T8 change reason', (select change_reason from wealth_os.contribution_rules where account_id=s and effective_to is null), 'income_change');
  perform wealth_os.run_contribution_engine();
  perform pg_temp.chk('T8 no uplift version', (select count(*) from wealth_os.contribution_rules where account_id=s and change_reason='annual_uplift'), 0);
  perform pg_temp.chkt('T8 anniversary rolled', (select next_uplift_date::text from wealth_os.contribution_rule_state where account_id=s), (v_today + interval '1 year')::date::text);

  -- ===== T9: pending flag at anniversary -> held; resolve; rolled, no uplift =====
  insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'pension', 0, 'ZZ P') returning id into p;
  insert into wealth_os.holdings(account_id, name, value, cost_basis) values (p, 'P1', 0, 0) returning id into p1;
  perform wealth_os.set_manual_priced(p, true);
  perform wealth_os.save_contribution_rule(p, jsonb_build_object('basis','salary_derived','allocation_method','percentage','day_of_month',28,
           'annual_uplift_pct', 3, 'gross_annual_salary', 30000, 'pensionable_basis','qualifying_earnings','employee_pct',5,'employer_pct',3,
           'contribution_method','salary_sacrifice','linked_income_id', inc2,
           'allocations', jsonb_build_array(jsonb_build_object('holding_id',p1,'weight_pct',100))));
  update wealth_os.contribution_rule_state set next_uplift_date = v_today, start_date = v_today,
         last_reviewed_at = (v_today - interval '1 year')::date, last_review_source = 'created' where account_id = p;
  update wealth_os.income set frequency = 'annual', amount = 36000 where id = inc2;   -- same annual figure
  perform pg_temp.chk('T9 no flag when annualised income unchanged', (select count(*) from wealth_os.contribution_flags where account_id=p), 0);
  update wealth_os.income set amount = 39600 where id = inc2;
  select id into v_flag from wealth_os.contribution_flags where account_id = p and status='pending';
  res := wealth_os.run_contribution_engine();
  perform pg_temp.chk('T9 held', (res->>'held')::numeric, 1);
  perform pg_temp.chkt('T9 anniversary not rolled', (select next_uplift_date::text from wealth_os.contribution_rule_state where account_id=p), v_today::text);
  perform pg_temp.chk('T9 no uplift while held', (select count(*) from wealth_os.contribution_rules where account_id=p), 1);
  perform wealth_os.resolve_contribution_flag(v_flag, 'dismiss');
  perform wealth_os.run_contribution_engine();
  perform pg_temp.chkt('T9 rolled after resolve', (select next_uplift_date::text from wealth_os.contribution_rule_state where account_id=p), (v_today + interval '1 year')::date::text);
  perform pg_temp.chk('T9 still no uplift', (select count(*) from wealth_os.contribution_rules where account_id=p), 1);

  -- ===== T10: RAS vs sacrifice =====
  insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'pension', 0, 'ZZ G RAS') returning id into g;
  insert into wealth_os.holdings(account_id, name, value, cost_basis) values (g, 'G1', 1000, 1000) returning id into g1;
  perform wealth_os.set_manual_priced(g, true);
  perform wealth_os.save_contribution_rule(g, jsonb_build_object('basis','salary_derived','allocation_method','percentage','day_of_month', least(v_day,28),
           'gross_annual_salary', 40000, 'pensionable_basis','full_salary','employee_pct',5,'employer_pct',3,'employer_match_cap_pct',0,
           'contribution_method','relief_at_source','allocations', jsonb_build_array(jsonb_build_object('holding_id',g1,'weight_pct',100))));
  insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'pension', 0, 'ZZ G SS') returning id into g2acc;
  insert into wealth_os.holdings(account_id, name, value, cost_basis) values (g2acc, 'G21', 0, 0) returning id into g21;
  perform wealth_os.set_manual_priced(g2acc, true);
  perform wealth_os.save_contribution_rule(g2acc, jsonb_build_object('basis','salary_derived','allocation_method','percentage','day_of_month', least(v_day,28),
           'gross_annual_salary', 40000, 'pensionable_basis','full_salary','employee_pct',5,'employer_pct',3,'employer_match_cap_pct',0,
           'contribution_method','salary_sacrifice','allocations', jsonb_build_array(jsonb_build_object('holding_id',g21,'weight_pct',100))));
  perform wealth_os.run_contribution_engine();
  select to_jsonb(x) into r from wealth_os.contribution_runs x where account_id = g;
  perform pg_temp.chk('T10 RAS total', (r->>'total_amount')::numeric, 266.67);
  perform pg_temp.chk('T10 RAS employee gross', (r->>'employee_amount')::numeric, 166.67);
  perform pg_temp.chk('T10 RAS employer', (r->>'employer_amount')::numeric, 100.00);
  perform pg_temp.chk('T10 RAS relief = 20% of employee', (r->>'relief_amount')::numeric, 33.33);
  perform pg_temp.chk('T10 RAS sacrifice 0', (r->>'sacrifice_amount')::numeric, 0);
  perform pg_temp.chk('T10 RAS deposit amount (client pays)', (select amount from wealth_os.account_deposits where account_id=g), 133.34);
  perform pg_temp.chk('T10 RAS deposit sacrifice col = employer', (select sacrifice_amount from wealth_os.account_deposits where account_id=g), 100);
  perform pg_temp.chk('T10 RAS deposit relief', (select relief_amount from wealth_os.account_deposits where account_id=g), 33.33);
  perform pg_temp.chk('T10 RAS legacy personal', (select contribution_personal from wealth_os.accounts where id=g), 133.34);
  perform pg_temp.chk('T10 RAS legacy sacrifice', (select contribution_sacrifice from wealth_os.accounts where id=g), 133.33);
  select to_jsonb(x) into r from wealth_os.contribution_runs x where account_id = g2acc;
  perform pg_temp.chk('T10 SS sacrifice = employee', (r->>'sacrifice_amount')::numeric, 166.67);
  perform pg_temp.chk('T10 SS relief 0', (r->>'relief_amount')::numeric, 0);
  perform pg_temp.chk('T10 SS deposit amount 0', (select amount from wealth_os.account_deposits where account_id=g2acc), 0);
  perform pg_temp.chk('T10 SS deposit sacrifice', (select sacrifice_amount from wealth_os.account_deposits where account_id=g2acc), 266.67);
  perform pg_temp.chkt('T10 SS deposit relief null', (select relief_amount::text from wealth_os.account_deposits where account_id=g2acc), null);
  perform pg_temp.chk('T10 SS legacy personal', (select contribution_personal from wealth_os.accounts where id=g2acc), 0);
  perform pg_temp.chk('T10 SS legacy sacrifice', (select contribution_sacrifice from wealth_os.accounts where id=g2acc), 266.67);
  -- QE basis: (30000-6240)=23760 * 5% /12 = 99.00
  perform pg_temp.chk('T10 qualifying earnings employee', ((wealth_os.calc_contribution_core('{"basis":"salary_derived","allocation_method":"percentage","gross_annual_salary":30000,"pensionable_basis":"qualifying_earnings","employee_pct":5,"contribution_method":"salary_sacrifice"}', '[]'))->>'employee_gross')::numeric, 99.00);

  -- ===== T13: reverse with no statement since -> both restored exactly =====
  select id into v_run from wealth_os.contribution_runs where account_id = g;
  perform wealth_os.reverse_contribution_run(v_run, 'wrong month');
  perform pg_temp.chk('T13 cost restored', (select cost_basis from wealth_os.holdings where id=g1), 1000);
  perform pg_temp.chk('T13 value restored', (select value from wealth_os.holdings where id=g1), 1000);
  perform pg_temp.chk('T13 deposit amount 0', (select amount from wealth_os.account_deposits where account_id=g), 0);
  perform pg_temp.chk('T13 deposit sacrifice 0', (select sacrifice_amount from wealth_os.account_deposits where account_id=g), 0);
  perform pg_temp.chk('T13 deposit relief 0', (select relief_amount from wealth_os.account_deposits where account_id=g), 0);

  -- adjust: SS run 266.67 -> 200
  select id into v_run from wealth_os.contribution_runs where account_id = g2acc;
  res := wealth_os.adjust_contribution_run(v_run, jsonb_build_array(jsonb_build_object('holding_id', g21, 'amount', 200)), 'payslip showed less');
  perform pg_temp.chk('T13b adjust cost', (select cost_basis from wealth_os.holdings where id=g21), 200);
  perform pg_temp.chk('T13b adjust value', (select value from wealth_os.holdings where id=g21), 200);
  perform pg_temp.chk('T13b adjust deposits total', (select amount + coalesce(sacrifice_amount,0) + coalesce(relief_amount,0) from wealth_os.account_deposits where account_id=g2acc), 200);
  perform wealth_os.reverse_contribution_run(v_run, 'then reversed');
  perform pg_temp.chk('T13c reverse after adjust cost 0', (select cost_basis from wealth_os.holdings where id=g21), 0);
  perform pg_temp.chk('T13c reverse after adjust deposits 0', (select amount + coalesce(sacrifice_amount,0) + coalesce(relief_amount,0) from wealth_os.account_deposits where account_id=g2acc), 0);

  -- ===== T11: employer match =====
  r := wealth_os.calc_contribution_core('{"basis":"salary_derived","allocation_method":"percentage","gross_annual_salary":12000,"pensionable_basis":"full_salary","employee_pct":6,"employer_pct":3,"employer_match_cap_pct":5,"contribution_method":"salary_sacrifice"}', '[]');
  perform pg_temp.chk('T11 6/3/5 -> employer 5%', (r->>'employer_effective_pct')::numeric, 5);
  perform pg_temp.chk('T11 6/3/5 employer monthly', (r->>'employer')::numeric, 50);
  r := wealth_os.calc_contribution_core('{"basis":"salary_derived","allocation_method":"percentage","gross_annual_salary":12000,"pensionable_basis":"full_salary","employee_pct":2,"employer_pct":3,"employer_match_cap_pct":5,"contribution_method":"salary_sacrifice"}', '[]');
  perform pg_temp.chk('T11 2/3/5 -> employer 3%', (r->>'employer_effective_pct')::numeric, 3);

  -- 006 NI savings: £34k, 5% EE + 5% ER, salary sacrifice, employer passes on 100% of its NI saving
  r := wealth_os.calc_contribution_core('{"basis":"salary_derived","allocation_method":"percentage","gross_annual_salary":34000,"pensionable_basis":"full_salary","employee_pct":5,"employer_pct":5,"contribution_method":"salary_sacrifice","employer_ni_passon_pct":100}', '[]');
  perform pg_temp.chk('NI: total into funds £304.59', (r->>'total')::numeric, 304.59);
  perform pg_temp.chk('NI: employer saving 15% x 1700 / 12', (r->>'employer_ni_saving')::numeric, 21.25);
  perform pg_temp.chk('NI: employee saving 8% x 1700 / 12 (info only)', (r->>'employee_ni_saving')::numeric, 11.33);
  perform pg_temp.chk('NI: deposits employer/sacrifice column incl. pass-on', (r->>'deposit_sacrifice')::numeric, 304.59);
  r := wealth_os.calc_contribution_core('{"basis":"salary_derived","allocation_method":"percentage","gross_annual_salary":34000,"pensionable_basis":"full_salary","employee_pct":5,"employer_pct":5,"contribution_method":"salary_sacrifice","employer_ni_passon_pct":0}', '[]');
  perform pg_temp.chk('NI: no pass-on -> total £283.34', (r->>'total')::numeric, 283.34);
  r := wealth_os.calc_contribution_core('{"basis":"salary_derived","allocation_method":"percentage","gross_annual_salary":34000,"pensionable_basis":"full_salary","employee_pct":5,"employer_pct":5,"contribution_method":"relief_at_source","employer_ni_passon_pct":100}', '[]');
  perform pg_temp.chk('NI: relief at source has no NI saving', (r->>'employer_ni_passon')::numeric, 0);
  -- above the UEL the employee saving is at 2%: £60k, 10% sacrificed (6000) -> 54000 still above UEL -> 2% x 6000 / 12 = 10.00
  r := wealth_os.calc_contribution_core('{"basis":"salary_derived","allocation_method":"percentage","gross_annual_salary":60000,"pensionable_basis":"full_salary","employee_pct":10,"contribution_method":"salary_sacrifice"}', '[]');
  perform pg_temp.chk('NI: employee saving above UEL at 2%', (r->>'employee_ni_saving')::numeric, 10.00);

  -- rounding: 3-way 33.333 split of 100 sums exactly
  r := wealth_os.calc_contribution_core('{"basis":"fixed","allocation_method":"percentage","total_amount":100}',
         '[{"holding_id":"a","weight_pct":33.333,"sort_order":0},{"holding_id":"b","weight_pct":33.333,"sort_order":1},{"holding_id":"c","weight_pct":33.334,"sort_order":2}]');
  perform pg_temp.chk('Rounding: split sums to total', (select sum((x->>'amount')::numeric) from jsonb_array_elements(r->'allocations') x), 100);
  perform pg_temp.chk('Rounding: last absorbs', (r#>>'{allocations,2,amount}')::numeric, 33.34);

  -- ===== T12: apply_us_prices skips manual-priced accounts =====
  insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'gia', 0, 'ZZ M') returning id into m;
  insert into wealth_os.holdings(account_id, name, ticker, units, avg_open, value, cost_basis) values (m, 'M1', 'ZZTESTQ', 10, 5, 77, 66) returning id into m1;
  perform wealth_os.set_manual_priced(m, true);
  perform pg_temp.chkt('T12 set_manual_priced forces manual', (select price_source from wealth_os.holdings where id=m1), 'manual');
  update wealth_os.holdings set price_source = 'auto_us' where id = m1;   -- force the bad state the guard protects against
  insert into wealth_os.accounts(client_id, type, value, provider) values (c, 'gia', 0, 'ZZ CTL') returning id into ctl;
  insert into wealth_os.holdings(account_id, name, ticker, units, avg_open, value, cost_basis, price_source) values (ctl, 'C1', 'ZZTESTQ', 10, 5, 77, 66, 'auto_us') returning id into ctl1;
  n := wealth_os.apply_us_prices('{"ZZTESTQ":100}'::jsonb, 0.8);
  perform pg_temp.chk('T12 manual-priced value untouched', (select value from wealth_os.holdings where id=m1), 77);
  perform pg_temp.chk('T12 manual-priced cost untouched', (select cost_basis from wealth_os.holdings where id=m1), 66);
  perform pg_temp.chk('T12 control account priced', (select value from wealth_os.holdings where id=ctl1), 800);

  -- ===== validation =====
  begin
    perform wealth_os.save_contribution_rule(a, jsonb_build_object('basis','fixed','allocation_method','percentage','total_amount',100,'day_of_month',5,
             'allocations', jsonb_build_array(jsonb_build_object('holding_id',h1,'weight_pct',50), jsonb_build_object('holding_id',h2,'weight_pct',40))));
    perform pg_temp.chkt('V weights must sum to 100', 'no error', 'error');
  exception when others then perform pg_temp.chkt('V weights must sum to 100', 'error', 'error'); end;
  begin
    perform wealth_os.save_contribution_rule(a, jsonb_build_object('basis','fixed','allocation_method','percentage','total_amount',100,'day_of_month',5,
             'allocations', jsonb_build_array(jsonb_build_object('holding_id',ctl1,'weight_pct',100))));
    perform pg_temp.chkt('V other account holding rejected', 'no error', 'error');
  exception when others then perform pg_temp.chkt('V other account holding rejected', 'error', 'error'); end;
  begin
    perform wealth_os.save_contribution_rule(a, jsonb_build_object('basis','fixed','allocation_method','percentage','total_amount',100,'day_of_month',29,
             'allocations', jsonb_build_array(jsonb_build_object('holding_id',h1,'weight_pct',100))));
    perform pg_temp.chkt('V day 29 rejected', 'no error', 'error');
  exception when others then perform pg_temp.chkt('V day 29 rejected', 'error', 'error'); end;
  begin
    delete from wealth_os.holdings where id = h1;
    perform pg_temp.chkt('V deleting an allocated fund blocked', 'no error', 'error');
  exception when others then perform pg_temp.chkt('V deleting an allocated fund blocked', 'error', 'error'); end;

  -- non-adviser is refused
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  begin
    perform wealth_os.end_contribution_rule(a);
    perform pg_temp.chkt('V non-adviser refused', 'no error', 'error');
  exception when others then perform pg_temp.chkt('V non-adviser refused', 'error', 'error'); end;
  begin
    perform wealth_os.record_holding_valuation(h1, 1, v_today);
    perform pg_temp.chkt('V stranger cannot value holding', 'no error', 'error');
  exception when others then perform pg_temp.chkt('V stranger cannot value holding', 'error', 'error'); end;
  perform set_config('request.jwt.claim.sub', '2ef6b2e1-3d5e-4479-bc0d-b9f91c4ded5a', true);
  perform set_config('request.jwt.claims', '{"sub":"2ef6b2e1-3d5e-4479-bc0d-b9f91c4ded5a","role":"authenticated"}', true);

  -- end rule keeps history
  perform wealth_os.end_contribution_rule(a);
  perform pg_temp.chkt('End: flag off', (select has_contribution_rule::text from wealth_os.accounts where id=a), 'false');
  perform pg_temp.chk('End: history kept', (select count(*) from wealth_os.contribution_rules where account_id=a), 1);
  perform pg_temp.chk('End: legacy figures left as at last update', (select contribution_personal from wealth_os.accounts where id=a), 304);

  -- deleting a whole account with a rule works (cascade)
  delete from wealth_os.accounts where id = g;
  perform pg_temp.chk('Delete account with rule', (select count(*) from wealth_os.accounts where id=g), 0);

  -- cron registered
  perform pg_temp.chk('Cron job registered', (select count(*) from cron.job where jobname='wealth_os_contribution_engine' and schedule='30 5 * * *'), 1);

  raise exception 'TEST RESULTS (rolled back)%', E'\n' || (select string_agg(line, E'\n' order by n) from t_log);
end;
$test$;
