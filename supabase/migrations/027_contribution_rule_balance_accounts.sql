-- 027: recurring contribution rules that do not go into a fund.
--
-- NOT APPLIED. For Paddy to apply after sign-off.
--
-- Until now a rule had to pay into one or more manually priced funds, so an
-- account held as a single balance, or one holding only auto-priced shares,
-- could not grow automatically. With this migration a rule can choose no
-- funds, and its monthly total then goes:
--
--   * into the account balance, on an account with no holdings:
--     accounts.value goes up on the run day, and so do that month's and any
--     later months' balances in account_months (the history the Wealth chart
--     reads). If the run month has no balance yet and it is the current
--     month, one is added, marked as carried forward so the client is still
--     asked to confirm it. A balance a person entered on or after the run day
--     is the statement figure and stands (the run does not change it).
--     "Entered by a person" = account_months.last_edited_by is not system:*.
--   * into the account's cash ("Cash not yet invested"), on an account with
--     holdings: accounts.cash_balance goes up, and the existing trigger sets
--     the account value to holdings plus cash. The holdings are untouched,
--     so live prices keep working. If a person saved the account on or after
--     the run day (accounts.last_edited_by not system:*), their cash figure
--     stands for a reverse or adjust.
--
--   Either way the money is logged as paid in (account_deposits), exactly as
--   for fund rules, and Reverse and Adjust move the balance or cash back by
--   the difference. Cash never goes below zero on a reverse.
--
-- Rules that choose funds are untouched by this change.
--
-- Rewrites four live functions (validate_contribution_payload,
-- contribution_apply_run, reverse_contribution_run, adjust_contribution_run)
-- from their definitions as read on 18 Nov 2026, and adds two helpers. The
-- guard below refuses to run if any of the four has changed since, so a
-- later edit is never overwritten. Safe to re-run once applied.

do $guard$
declare
  expected constant jsonb := '{
    "validate_contribution_payload": "dfaa897d59f2f2f5a087000431a4dd86",
    "contribution_apply_run": "cfa2d57d96f257049c2c93676180a48f",
    "reverse_contribution_run": "e150ab0e5053e90ec256a44941f60314",
    "adjust_contribution_run": "491abfe6dea2f5de1a8c623e0c51f912"}';
  k text; h text;
begin
  if to_regprocedure('wealth_os.contribution_apply_balance_delta(uuid,date,numeric,boolean)') is not null then
    raise notice '027: already applied';
    return;
  end if;
  for k in select jsonb_object_keys(expected) loop
    select md5(pg_get_functiondef(p.oid)) into h
      from pg_proc p where p.pronamespace = 'wealth_os'::regnamespace and p.proname = k;
    if h is distinct from expected->>k then
      raise exception '027: wealth_os.% has changed since this migration was written; nothing applied', k;
    end if;
  end loop;
end
$guard$;

-- When a person last entered a balance for this account (client or adviser),
-- or null. Carried-forward and engine rows are system:* and do not count.
create or replace function wealth_os.contribution_balance_checked_at(p_account_id uuid)
returns date
language sql
stable
set search_path to 'wealth_os', 'public'
as $function$
  select max(m.last_edited_at::date)
    from wealth_os.account_months m
   where m.account_id = p_account_id
     and m.last_edited_at is not null
     and coalesce(m.last_edited_by, '') not like 'system:%';
$function$;

-- Add (or, for a reversal, take away) p_amount for a run on p_run_date that
-- chose no funds: into the account's cash when it holds funds, otherwise
-- into its balance. p_correction is true for Reverse and Adjust. Returns
-- true when a figure a person entered on or after the run day stands
-- instead (nothing changed). For cash that only applies to corrections, so
-- a client saving the account on a payment day never blocks the payment.
create or replace function wealth_os.contribution_apply_balance_delta(p_account_id uuid, p_run_date date, p_amount numeric, p_correction boolean default false)
returns boolean
language plpgsql
set search_path to 'wealth_os', 'public'
as $function$
declare
  v_checked date; v_mk text := to_char(p_run_date, 'YYYY-MM'); v_value numeric;
  v_by text; v_at timestamptz;
begin
  if coalesce(p_amount, 0) = 0 then return false; end if;

  if exists (select 1 from wealth_os.holdings where account_id = p_account_id) then
    -- Holds funds: the money is cash in the account until it is invested.
    select last_edited_by, last_edited_at into v_by, v_at from wealth_os.accounts where id = p_account_id;
    if p_correction and v_at is not null and coalesce(v_by, '') not like 'system:%' and v_at::date >= p_run_date then
      return true;
    end if;
    -- The accounts_recalc_on_cash_change trigger sets value = holdings + cash.
    update wealth_os.accounts
       set cash_balance = greatest(round(coalesce(cash_balance, 0) + p_amount, 2), 0),
           last_edited_by = 'system:contribution-engine', last_edited_at = now()
     where id = p_account_id;
    return false;
  end if;

  v_checked := wealth_os.contribution_balance_checked_at(p_account_id);
  if v_checked is not null and v_checked >= p_run_date then
    return true;
  end if;

  update wealth_os.accounts
     set value = round(coalesce(value, 0) + p_amount, 2),
         last_updated = current_date,
         last_edited_by = 'system:contribution-engine', last_edited_at = now()
   where id = p_account_id
  returning value into v_value;

  -- The run month and every later month already recorded include the money.
  update wealth_os.account_months
     set value = round(value + p_amount, 2)
   where account_id = p_account_id and month_key >= v_mk;

  -- No balance for the run month yet: add one when it is the current month,
  -- marked as carried forward so the client is still asked to confirm it.
  if v_mk = to_char(current_date, 'YYYY-MM') and not exists (
       select 1 from wealth_os.account_months where account_id = p_account_id and month_key = v_mk) then
    insert into wealth_os.account_months (account_id, month_key, value, last_edited_by, last_edited_at, carried_forward)
    values (p_account_id, v_mk, v_value, 'system:contribution-engine', now(), true);
  end if;
  return false;
end;
$function$;

create or replace function wealth_os.validate_contribution_payload(p_account_id uuid, p jsonb)
returns void
language plpgsql
stable
set search_path to 'wealth_os', 'public'
as $function$
declare
  v_basis text := p->>'basis';
  v_method text := p->>'allocation_method';
  v_n int; v_bad int; v_sum numeric; v_dupes int; v_client uuid; v_day int; v_passon numeric;
begin
  select client_id into v_client from wealth_os.accounts where id = p_account_id;
  if v_client is null then raise exception 'Account not found'; end if;
  if v_basis not in ('fixed','salary_derived') or v_basis is null then raise exception 'Basis must be fixed or salary_derived'; end if;
  if v_method not in ('percentage','manual') or v_method is null then raise exception 'Allocation method must be percentage or manual'; end if;
  if v_basis = 'salary_derived' and v_method <> 'percentage' then raise exception 'Salary-derived rules split by percentage'; end if;
  v_day := nullif(p->>'day_of_month','')::int;
  if v_day is null or v_day not between 1 and 28 then raise exception 'Day of month must be 1-28'; end if;
  if coalesce(nullif(p->>'annual_uplift_pct','')::numeric, 0) < 0 then raise exception 'Annual uplift cannot be negative'; end if;
  v_passon := coalesce(nullif(p->>'employer_ni_passon_pct','')::numeric, 0);
  if v_passon < 0 or v_passon > 100 then raise exception 'Employer NI pass-on must be between 0 and 100%%'; end if;

  select count(*), count(distinct a->>'holding_id') into v_n, v_dupes from jsonb_array_elements(coalesce(p->'allocations','[]'::jsonb)) a;
  if v_n = 0 then
    -- No funds chosen: one monthly total into the account's cash, or its
    -- balance when it has no holdings (migration 027).
    if v_method <> 'percentage' then raise exception 'Without funds, the rule pays one monthly total'; end if;
  else
    if v_dupes <> v_n then raise exception 'Each fund can appear only once'; end if;
    select count(*) into v_bad
      from jsonb_array_elements(p->'allocations') a
      left join wealth_os.holdings h on h.id = (a->>'holding_id')::uuid and h.account_id = p_account_id
     where h.id is null or h.price_source <> 'manual';
    if v_bad > 0 then raise exception 'Funds must belong to this account and be manually priced'; end if;

    if v_method = 'percentage' then
      select coalesce(sum(nullif(a->>'weight_pct','')::numeric), 0), count(*) filter (where coalesce(nullif(a->>'weight_pct','')::numeric, 0) <= 0)
        into v_sum, v_bad from jsonb_array_elements(p->'allocations') a;
      if v_bad > 0 then raise exception 'Every fund needs a weight above 0'; end if;
      if abs(v_sum - 100) > 0.0005 then raise exception 'Weights must add up to 100 (currently %)', v_sum; end if;
    else
      select count(*) filter (where coalesce(nullif(a->>'amount','')::numeric, 0) <= 0) into v_bad
        from jsonb_array_elements(p->'allocations') a;
      if v_bad > 0 then raise exception 'Every fund needs an amount above £0'; end if;
    end if;
  end if;

  if v_basis = 'fixed' and v_method = 'percentage' and coalesce(nullif(p->>'total_amount','')::numeric, 0) <= 0 then
    raise exception 'Enter the monthly total';
  end if;
  if v_basis = 'salary_derived' then
    if coalesce(nullif(p->>'gross_annual_salary','')::numeric, 0) <= 0 then raise exception 'Enter gross annual salary'; end if;
    if coalesce(nullif(p->>'employee_pct','')::numeric, -1) < 0 then raise exception 'Enter employee %%'; end if;
    if coalesce(p->>'pensionable_basis','') not in ('full_salary','qualifying_earnings') then raise exception 'Choose the pensionable basis'; end if;
    if coalesce(p->>'contribution_method','') not in ('salary_sacrifice','relief_at_source') then raise exception 'Choose salary sacrifice or relief at source'; end if;
  end if;
  if nullif(p->>'linked_income_id','') is not null and not exists (
       select 1 from wealth_os.income i where i.id = (p->>'linked_income_id')::uuid and i.client_id = v_client) then
    raise exception 'Linked income must belong to this client';
  end if;
end;
$function$;

create or replace function wealth_os.contribution_apply_run(p_account_id uuid, p_rule_id uuid, p_run_date date)
returns uuid
language plpgsql
set search_path to 'wealth_os', 'public'
as $function$
declare
  c jsonb; a jsonb; v_run uuid; v_mk text := to_char(p_run_date, 'YYYY-MM');
begin
  c := wealth_os.calc_contribution(p_rule_id);
  if coalesce((c->>'total')::numeric, 0) <= 0 then return null; end if;

  if jsonb_array_length(coalesce(c->'allocations', '[]'::jsonb)) = 0 then
    -- No funds: the total goes into the account's cash, or its balance
    -- when it has no holdings (migration 027).
    perform wealth_os.contribution_apply_balance_delta(p_account_id, p_run_date, (c->>'total')::numeric);
  else
    for a in select * from jsonb_array_elements(c->'allocations') loop
      update wealth_os.holdings
         set cost_basis = coalesce(cost_basis, 0) + (a->>'amount')::numeric,
             value = coalesce(value, 0) + (a->>'amount')::numeric,
             last_edited_by = 'system:contribution-engine',
             last_edited_at = now()
       where id = (a->>'holding_id')::uuid and account_id = p_account_id;
    end loop;
  end if;

  insert into wealth_os.contribution_runs (account_id, rule_id, run_date, month_key, total_amount,
                                           employee_amount, employer_amount, sacrifice_amount, relief_amount, allocations)
  values (p_account_id, p_rule_id, p_run_date, v_mk, (c->>'total')::numeric,
          (c->>'employee_gross')::numeric,
          (c->>'employer')::numeric + coalesce((c->>'employer_ni_passon')::numeric, 0),
          (c->>'sacrifice_amount')::numeric, (c->>'relief_amount')::numeric, c->'allocations')
  returning id into v_run;

  perform wealth_os.contribution_adjust_deposits(p_account_id, v_mk,
            (c->>'deposit_amount')::numeric, (c->>'deposit_sacrifice')::numeric, (c->>'deposit_relief')::numeric);
  return v_run;
end;
$function$;

create or replace function wealth_os.reverse_contribution_run(p_run_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to 'wealth_os', 'public'
as $function$
declare
  r wealth_os.contribution_runs; v_neg jsonb; v_kept jsonb;
  v_dep_sacr numeric; v_dep_relief numeric; v_balance boolean; v_bal_kept boolean := false; v_where text;
begin
  perform wealth_os.require_adviser();
  select * into r from wealth_os.contribution_runs where id = p_run_id for update;
  if r.id is null then raise exception 'Run not found'; end if;
  if r.status = 'reversed' then raise exception 'Run already reversed'; end if;

  v_balance := jsonb_array_length(coalesce(r.allocations, '[]'::jsonb)) = 0;
  v_where := case when exists (select 1 from wealth_os.holdings where account_id = r.account_id) then 'cash' else 'balance' end;
  if v_balance then
    v_kept := '[]'::jsonb;
    v_bal_kept := wealth_os.contribution_apply_balance_delta(r.account_id, r.run_date, -r.total_amount, true);
  else
    select jsonb_agg(jsonb_build_object('holding_id', a->>'holding_id', 'amount', -(a->>'amount')::numeric))
      into v_neg from jsonb_array_elements(r.allocations) a;
    v_kept := wealth_os.contribution_apply_alloc_delta(r.account_id, r.run_date, v_neg);
  end if;

  v_dep_sacr := coalesce(r.employer_amount, 0) + coalesce(r.sacrifice_amount, 0);
  v_dep_relief := coalesce(r.relief_amount, 0);
  perform wealth_os.contribution_adjust_deposits(r.account_id, r.month_key,
            -(r.total_amount - v_dep_sacr - v_dep_relief), -v_dep_sacr, -v_dep_relief);

  update wealth_os.contribution_runs
     set status = 'reversed', correction_note = p_note, corrected_by = coalesce(auth.uid()::text, 'adviser'), corrected_at = now()
   where id = r.id;

  return jsonb_build_object('status', 'reversed', 'value_kept', v_kept, 'balance_kept', v_bal_kept,
    'message', case
      when v_balance and v_bal_kept then 'Money paid in restored. ' || initcap(v_where) || ' left as the figure entered on or after ' || to_char(r.run_date, 'DD Mon YYYY') || '.'
      when v_balance then 'Money paid in and ' || v_where || ' restored.'
      when jsonb_array_length(v_kept) > 0
        then 'Cost basis restored. Value left as the statement figure for funds checked on or after ' || to_char(r.run_date, 'DD Mon YYYY') || '.'
      else 'Cost basis and value restored.' end);
end;
$function$;

-- p_allocations: per-fund amounts as before, or for a run that chose no
-- funds a single [{"amount": n}] with no holding_id.
create or replace function wealth_os.adjust_contribution_run(p_run_id uuid, p_allocations jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to 'wealth_os', 'public'
as $function$
declare
  r wealth_os.contribution_runs; v_new_total numeric; v_deltas jsonb; v_kept jsonb; v_f numeric;
  v_old_sacr numeric; v_old_relief numeric; v_old_amt numeric;
  v_new_emp numeric; v_new_er numeric; v_new_sacr numeric; v_new_relief numeric; v_bad int;
  v_balance boolean; v_bal_kept boolean := false; v_where text;
begin
  perform wealth_os.require_adviser();
  select * into r from wealth_os.contribution_runs where id = p_run_id for update;
  if r.id is null then raise exception 'Run not found'; end if;
  if r.status = 'reversed' then raise exception 'A reversed run cannot be adjusted'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a note explaining the adjustment'; end if;

  v_balance := jsonb_array_length(coalesce(r.allocations, '[]'::jsonb)) = 0;
  v_where := case when exists (select 1 from wealth_os.holdings where account_id = r.account_id) then 'cash' else 'balance' end;
  if v_balance then
    if jsonb_array_length(coalesce(p_allocations,'[]'::jsonb)) <> 1
       or coalesce(nullif(p_allocations->0->>'holding_id',''), '') <> ''
       or coalesce((p_allocations->0->>'amount')::numeric, -1) < 0 then
      raise exception 'Enter the corrected amount';
    end if;
    v_new_total := round((p_allocations->0->>'amount')::numeric, 2);
  else
    select count(*) into v_bad from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) a
      left join wealth_os.holdings h on h.id = (a->>'holding_id')::uuid and h.account_id = r.account_id
     where h.id is null or coalesce((a->>'amount')::numeric, -1) < 0;
    if v_bad > 0 or jsonb_array_length(coalesce(p_allocations,'[]'::jsonb)) = 0 then
      raise exception 'Allocations must be this account''s funds with amounts of £0 or more';
    end if;
    select round(sum((a->>'amount')::numeric), 2) into v_new_total from jsonb_array_elements(p_allocations) a;
  end if;
  if v_new_total <= 0 then raise exception 'Adjusted total must be above £0 -- reverse the run instead'; end if;

  if v_balance then
    v_kept := '[]'::jsonb;
    v_bal_kept := wealth_os.contribution_apply_balance_delta(r.account_id, r.run_date, v_new_total - r.total_amount, true);
  else
    select jsonb_agg(jsonb_build_object('holding_id', hid, 'amount', coalesce(n, 0) - coalesce(o, 0)))
      into v_deltas
      from (select coalesce(nn.hid, oo.hid) as hid, nn.amt as n, oo.amt as o
              from (select a->>'holding_id' hid, round((a->>'amount')::numeric, 2) amt from jsonb_array_elements(p_allocations) a) nn
              full join (select a->>'holding_id' hid, (a->>'amount')::numeric amt from jsonb_array_elements(r.allocations) a) oo
                on oo.hid = nn.hid) x;
    v_kept := wealth_os.contribution_apply_alloc_delta(r.account_id, r.run_date, v_deltas);
  end if;

  v_f := v_new_total / r.total_amount;
  v_new_emp := round(coalesce(r.employee_amount, 0) * v_f, 2);
  v_new_er := round(coalesce(r.employer_amount, 0) * v_f, 2);
  v_new_sacr := round(coalesce(r.sacrifice_amount, 0) * v_f, 2);
  v_new_relief := round(coalesce(r.relief_amount, 0) * v_f, 2);
  v_old_sacr := coalesce(r.employer_amount, 0) + coalesce(r.sacrifice_amount, 0);
  v_old_relief := coalesce(r.relief_amount, 0);
  v_old_amt := r.total_amount - v_old_sacr - v_old_relief;
  perform wealth_os.contribution_adjust_deposits(r.account_id, r.month_key,
            (v_new_total - v_new_er - v_new_sacr - v_new_relief) - v_old_amt,
            (v_new_er + v_new_sacr) - v_old_sacr,
            v_new_relief - v_old_relief);

  update wealth_os.contribution_runs
     set status = 'adjusted', total_amount = v_new_total,
         employee_amount = case when r.employee_amount is null then null else v_new_emp end,
         employer_amount = case when r.employer_amount is null then null else v_new_er end,
         sacrifice_amount = case when r.sacrifice_amount is null then null else v_new_sacr end,
         relief_amount = case when r.relief_amount is null then null else v_new_relief end,
         allocations = case when v_balance then '[]'::jsonb else
                         (select jsonb_agg(jsonb_build_object('holding_id', a->>'holding_id', 'amount', round((a->>'amount')::numeric, 2)))
                            from jsonb_array_elements(p_allocations) a) end,
         correction_note = p_note, corrected_by = coalesce(auth.uid()::text, 'adviser'), corrected_at = now()
   where id = r.id;

  return jsonb_build_object('status', 'adjusted', 'total', v_new_total, 'value_kept', v_kept, 'balance_kept', v_bal_kept,
    'message', case
      when v_balance and v_bal_kept then 'Money paid in adjusted. ' || initcap(v_where) || ' left as the figure entered on or after ' || to_char(r.run_date, 'DD Mon YYYY') || '.'
      when v_balance then 'Money paid in and ' || v_where || ' adjusted.'
      when jsonb_array_length(v_kept) > 0
        then 'Cost basis adjusted. Value left as the statement figure for funds checked on or after ' || to_char(r.run_date, 'DD Mon YYYY') || '.'
      else 'Cost basis and value adjusted.' end);
end;
$function$;
