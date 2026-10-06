-- =====================================================================
-- 006 contribution_ni_savings
--
-- Salary sacrifice NI savings for salary-derived contribution rules:
--   * Employer NI saving: the employer pays less secondary Class 1 NI on
--     the sacrificed pay. employer_ni_passon_pct (0-100) of that saving is
--     added to the pension -- it goes into the funds like any employer
--     contribution (total, per-fund split, cost basis + value, the
--     employer/sacrifice column of account_deposits, legacy fields).
--   * Employee NI saving: shown in the breakdown for information only (it
--     stays in the client's take-home pay); never added to the funds.
-- Both are worked out on the rule's gross salary (entered from the fact
-- find), as NI(gross) - NI(gross - sacrifice), so thresholds are respected.
-- Rates/thresholds live in pension_config, not in the functions.
-- =====================================================================

alter table wealth_os.contribution_rules
  add column if not exists employer_ni_passon_pct numeric(5,2) not null default 0
    check (employer_ni_passon_pct between 0 and 100);

insert into wealth_os.pension_config (key, value, note) values
  ('ni_primary_threshold',    12570, 'Employee Class 1 NI primary threshold, £/yr'),
  ('ni_upper_earnings_limit', 50270, 'Employee Class 1 NI upper earnings limit, £/yr'),
  ('ni_employee_main_rate',   0.08,  'Employee Class 1 NI main rate (between PT and UEL)'),
  ('ni_employee_upper_rate',  0.02,  'Employee Class 1 NI rate above the UEL'),
  ('ni_secondary_threshold',  5000,  'Employer Class 1 NI secondary threshold, £/yr (from April 2025)'),
  ('ni_employer_rate',        0.15,  'Employer Class 1 NI rate (from April 2025)')
on conflict (key) do nothing;

-- ---------- shared calculation (replaces the 005 version) ----------
-- New outputs: employer_ni_saving (monthly, the employer's whole saving),
-- employer_ni_passon (the part added to the pension; included in total),
-- employee_ni_saving (monthly, information only).
create or replace function wealth_os.calc_contribution_core(p_rule jsonb, p_allocs jsonb, p_account_type text default 'pension')
 returns jsonb
 language plpgsql
 stable
 set search_path to 'wealth_os', 'public'
as $function$
declare
  v_basis text := p_rule->>'basis';
  v_method text := p_rule->>'allocation_method';
  v_cm text := nullif(p_rule->>'contribution_method','');
  v_gross numeric := nullif(p_rule->>'gross_annual_salary','')::numeric;
  v_emp_pct numeric := coalesce(nullif(p_rule->>'employee_pct','')::numeric, 0);
  v_er_pct numeric := coalesce(nullif(p_rule->>'employer_pct','')::numeric, 0);
  v_cap numeric := coalesce(nullif(p_rule->>'employer_match_cap_pct','')::numeric, 0);
  v_passon_pct numeric := least(greatest(coalesce(nullif(p_rule->>'employer_ni_passon_pct','')::numeric, 0), 0), 100);
  v_lower numeric; v_upper numeric; v_gu numeric;
  v_pt numeric; v_uel numeric; v_ni_main numeric; v_ni_upper numeric; v_st numeric; v_ni_er numeric;
  v_pensionable numeric; v_eff numeric; v_sacr_annual numeric; v_g numeric; v_g2 numeric;
  v_total numeric := 0; v_emp numeric := 0; v_er numeric := 0;
  v_relief numeric := 0; v_sacr numeric := 0; v_client numeric := 0;
  v_ee_ni numeric := 0; v_er_ni numeric := 0; v_passon numeric := 0;
  v_out jsonb := '[]'::jsonb;
  v_running numeric := 0;
  v_n int; v_i int := 0; v_amt numeric;
  r record;
begin
  select value into v_lower    from wealth_os.pension_config where key = 'qe_lower';
  select value into v_upper    from wealth_os.pension_config where key = 'qe_upper';
  select value into v_gu       from wealth_os.pension_config where key = 'ras_relief_gross_up';
  select value into v_pt       from wealth_os.pension_config where key = 'ni_primary_threshold';
  select value into v_uel      from wealth_os.pension_config where key = 'ni_upper_earnings_limit';
  select value into v_ni_main  from wealth_os.pension_config where key = 'ni_employee_main_rate';
  select value into v_ni_upper from wealth_os.pension_config where key = 'ni_employee_upper_rate';
  select value into v_st       from wealth_os.pension_config where key = 'ni_secondary_threshold';
  select value into v_ni_er    from wealth_os.pension_config where key = 'ni_employer_rate';

  if v_basis = 'salary_derived' then
    if coalesce(p_rule->>'pensionable_basis','full_salary') = 'qualifying_earnings' then
      v_pensionable := least(greatest(coalesce(v_gross,0) - v_lower, 0), v_upper - v_lower);
    else
      v_pensionable := coalesce(v_gross, 0);
    end if;
    v_eff := greatest(v_er_pct, least(v_emp_pct, v_cap));
    v_emp := round(v_pensionable * v_emp_pct / 100 / 12, 2);
    v_er  := round(v_pensionable * v_eff / 100 / 12, 2);

    -- Salary sacrifice NI savings, on the actual gross salary:
    -- saving = NI(gross) - NI(gross - sacrificed pay), annual, then /12.
    if v_cm = 'salary_sacrifice' then
      v_sacr_annual := v_pensionable * v_emp_pct / 100;
      v_g := coalesce(v_gross, 0);
      v_g2 := greatest(v_g - v_sacr_annual, 0);
      v_ee_ni := round((
          (v_ni_main * least(greatest(v_g - v_pt, 0), v_uel - v_pt) + v_ni_upper * greatest(v_g - v_uel, 0))
        - (v_ni_main * least(greatest(v_g2 - v_pt, 0), v_uel - v_pt) + v_ni_upper * greatest(v_g2 - v_uel, 0))
        ) / 12, 2);
      v_er_ni := round((v_ni_er * greatest(v_g - v_st, 0) - v_ni_er * greatest(v_g2 - v_st, 0)) / 12, 2);
      v_passon := round(v_er_ni * v_passon_pct / 100, 2);
    end if;
    v_total := v_emp + v_er + v_passon;
  elsif v_method = 'manual' then
    select coalesce(sum(round(coalesce(nullif(a->>'amount','')::numeric,0), 2)), 0) into v_total
    from jsonb_array_elements(coalesce(p_allocs,'[]'::jsonb)) a;
    v_emp := v_total;
  else
    v_total := round(coalesce(nullif(p_rule->>'total_amount','')::numeric, 0), 2);
    v_emp := v_total;
  end if;

  -- How the employee portion reaches the pension. A fixed rule with no
  -- contribution_method is plain money paid in by the client.
  if v_cm = 'relief_at_source' then
    v_relief := round(v_emp * v_gu / (1 + v_gu), 2);
    v_client := v_emp - v_relief;
  elsif v_cm = 'salary_sacrifice' then
    v_sacr := v_emp;
    v_client := 0;
  else
    v_client := v_emp;
  end if;

  -- Per-fund split. Each fund rounds to 2dp; the last (by sort_order)
  -- absorbs the remainder so the split sums exactly to the total.
  select count(*) into v_n from jsonb_array_elements(coalesce(p_allocs,'[]'::jsonb));
  for r in
    select a->>'holding_id' as holding_id,
           coalesce(nullif(a->>'weight_pct','')::numeric, 0) as w,
           round(coalesce(nullif(a->>'amount','')::numeric, 0), 2) as amt,
           coalesce(nullif(a->>'sort_order','')::int, ord::int) as so
    from jsonb_array_elements(coalesce(p_allocs,'[]'::jsonb)) with ordinality as t(a, ord)
    order by 4, 1
  loop
    v_i := v_i + 1;
    if v_method = 'manual' and v_basis <> 'salary_derived' then
      v_amt := r.amt;
    elsif v_i = v_n then
      v_amt := v_total - v_running;
    else
      v_amt := round(v_total * r.w / 100, 2);
    end if;
    v_running := v_running + v_amt;
    v_out := v_out || jsonb_build_object('holding_id', r.holding_id, 'amount', v_amt);
  end loop;

  return jsonb_build_object(
    'basis', v_basis,
    'allocation_method', v_method,
    'contribution_method', v_cm,
    'total', v_total,
    'employee_gross', case when v_basis = 'salary_derived' or v_cm is not null then v_emp else null end,
    'employer', v_er,
    'employer_core_pct', case when v_basis = 'salary_derived' then v_er_pct end,
    'employer_effective_pct', case when v_basis = 'salary_derived' then v_eff end,
    'employer_match_applied', case when v_basis = 'salary_derived' then v_eff > v_er_pct end,
    'employer_ni_saving', v_er_ni,
    'employer_ni_passon_pct', v_passon_pct,
    'employer_ni_passon', v_passon,
    'employee_ni_saving', v_ee_ni,
    'pensionable_pay', v_pensionable,
    'client_pays', v_client,
    'relief_amount', v_relief,
    'sacrifice_amount', v_sacr,
    'deposit_amount', v_total - v_er - v_passon - v_sacr - v_relief,
    'deposit_sacrifice', v_er + v_passon + v_sacr,
    'deposit_relief', v_relief,
    'legacy_personal', case when p_account_type = 'pension' then v_client end,
    'legacy_sacrifice', case when p_account_type = 'pension' then v_total - v_client end,
    'legacy_contribution', case when p_account_type <> 'pension' then v_total end,
    'allocations', v_out
  );
end;
$function$;

-- ---------- engine run: employer_amount now includes the NI pass-on ----------
-- (reverse/adjust already treat employer_amount + sacrifice_amount as the
-- deposits' employer/sacrifice column, so they stay consistent.)
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

  for a in select * from jsonb_array_elements(c->'allocations') loop
    update wealth_os.holdings
       set cost_basis = coalesce(cost_basis, 0) + (a->>'amount')::numeric,
           value = coalesce(value, 0) + (a->>'amount')::numeric,
           last_edited_by = 'system:contribution-engine',
           last_edited_at = now()
     where id = (a->>'holding_id')::uuid and account_id = p_account_id;
  end loop;

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

-- ---------- validation + payload: accept employer_ni_passon_pct ----------
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
  if v_n = 0 then raise exception 'Choose at least one fund'; end if;
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

create or replace function wealth_os.contribution_payload_patch(p jsonb)
 returns jsonb
 language sql
 immutable
as $function$
  select jsonb_build_object(
    'basis', p->>'basis',
    'allocation_method', p->>'allocation_method',
    'total_amount', case when p->>'basis' = 'fixed' and p->>'allocation_method' = 'percentage' then round(nullif(p->>'total_amount','')::numeric, 2) end,
    'day_of_month', (p->>'day_of_month')::int,
    'annual_uplift_pct', coalesce(nullif(p->>'annual_uplift_pct','')::numeric, 0),
    'linked_income_id', case when p->>'basis' = 'salary_derived' then nullif(p->>'linked_income_id','') end,
    'gross_annual_salary', case when p->>'basis' = 'salary_derived' then nullif(p->>'gross_annual_salary','')::numeric end,
    'pensionable_basis', case when p->>'basis' = 'salary_derived' then nullif(p->>'pensionable_basis','') end,
    'employee_pct', case when p->>'basis' = 'salary_derived' then nullif(p->>'employee_pct','')::numeric end,
    'employer_pct', case when p->>'basis' = 'salary_derived' then coalesce(nullif(p->>'employer_pct','')::numeric, 0) end,
    'employer_match_cap_pct', case when p->>'basis' = 'salary_derived' then coalesce(nullif(p->>'employer_match_cap_pct','')::numeric, 0) end,
    'contribution_method', nullif(p->>'contribution_method',''),
    -- only meaningful for salary-derived salary sacrifice
    'employer_ni_passon_pct', case when p->>'basis' = 'salary_derived' and p->>'contribution_method' = 'salary_sacrifice'
                                   then coalesce(nullif(p->>'employer_ni_passon_pct','')::numeric, 0) else 0 end
  );
$function$;

-- create or replace keeps existing grants; restate the revoke for the
-- internal helpers in case this runs on a fresh database
revoke execute on function
  wealth_os.contribution_apply_run(uuid, uuid, date), wealth_os.validate_contribution_payload(uuid, jsonb),
  wealth_os.contribution_payload_patch(jsonb)
  from public, anon, authenticated;
