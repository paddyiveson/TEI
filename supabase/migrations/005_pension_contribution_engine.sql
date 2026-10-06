-- =====================================================================
-- 005 pension_contribution_engine
--
-- Recurring contribution rules for manual-priced accounts (typically a
-- workplace pension held in ISIN funds that no price API covers).
--
-- Two-stage valuation:
--   1. On the scheduled day the engine adds each fund's share of the
--      contribution to BOTH holdings.cost_basis and holdings.value (money
--      landed, no artificial gain/loss). No units are tracked.
--   2. A manual statement valuation (record_holding_valuation) overwrites
--      holdings.value outright and stamps value_checked_at. It never
--      touches cost_basis.
--
-- Rules are versioned (one current version per account, effective_to is
-- null). Nothing is back-dated: a rule starts from the day it is created,
-- and every edit is a new version effective today.
--
-- Salary inputs are typed in by the adviser from the fact find. The
-- linked income row is only a change trigger -- wealth_os.income.amount
-- may be net or gross, so it is never read as gross salary.
-- =====================================================================

-- ---------- 1. Account / holding flags ----------
alter table wealth_os.accounts
  add column if not exists is_manual_priced boolean not null default false,
  add column if not exists has_contribution_rule boolean not null default false;

-- Date the fund's value was last checked against a real statement
-- (manual entry only; the engine never sets it)
alter table wealth_os.holdings
  add column if not exists value_checked_at date;

-- ---------- 2. Tables ----------
create table wealth_os.contribution_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references wealth_os.accounts(id) on delete cascade,
  version int not null,
  effective_from date not null,
  effective_to date,
  basis text not null check (basis in ('fixed','salary_derived')),
  allocation_method text not null check (allocation_method in ('percentage','manual')),
  total_amount numeric(12,2),                 -- fixed + percentage only
  day_of_month smallint not null check (day_of_month between 1 and 28),
  annual_uplift_pct numeric(5,2) not null default 0,
  -- salary-derived (entered manually from the fact find)
  linked_income_id uuid references wealth_os.income(id) on delete set null,
  gross_annual_salary numeric(12,2),
  pensionable_basis text check (pensionable_basis in ('full_salary','qualifying_earnings')),
  employee_pct numeric(5,2),
  employer_pct numeric(5,2),
  employer_match_cap_pct numeric(5,2),
  contribution_method text check (contribution_method in ('salary_sacrifice','relief_at_source')),
  change_reason text,                         -- 'created','manual_edit','income_change','annual_uplift'
  created_at timestamptz not null default now(),
  created_by text,
  check (basis <> 'salary_derived' or allocation_method = 'percentage'),
  check (basis <> 'fixed' or allocation_method <> 'percentage' or total_amount is not null)
);
create unique index contribution_rules_one_current on wealth_os.contribution_rules(account_id) where effective_to is null;
create unique index contribution_rules_version on wealth_os.contribution_rules(account_id, version);

create table wealth_os.contribution_rule_allocations (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references wealth_os.contribution_rules(id) on delete cascade,
  -- NO ACTION rather than RESTRICT: still blocks deleting a fund that a
  -- rule allocates to, but the check runs at end of statement so deleting
  -- the whole account (which cascades to both holdings and rules) works.
  holding_id uuid not null references wealth_os.holdings(id),
  weight_pct numeric(6,3),
  amount numeric(12,2),
  sort_order smallint not null default 0,
  unique (rule_id, holding_id)
);
create index contribution_rule_allocations_holding on wealth_os.contribution_rule_allocations(holding_id);

-- Cycle state is per account (survives rule versions)
create table wealth_os.contribution_rule_state (
  account_id uuid primary key references wealth_os.accounts(id) on delete cascade,
  start_date date not null,                   -- day the first rule was created; nothing runs before it
  next_uplift_date date,                      -- start_date + 1 year, then rolls annually
  last_reviewed_at date,
  last_review_source text check (last_review_source in ('created','manual_edit','income_change','annual_uplift'))
);

create table wealth_os.contribution_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references wealth_os.accounts(id) on delete cascade,
  rule_id uuid not null references wealth_os.contribution_rules(id),
  run_date date not null,
  month_key text not null,
  total_amount numeric(12,2) not null,
  employee_amount numeric(12,2),
  employer_amount numeric(12,2),
  sacrifice_amount numeric(12,2),
  relief_amount numeric(12,2),
  allocations jsonb not null,                 -- [{holding_id, amount}]
  status text not null default 'applied' check (status in ('applied','reversed','adjusted')),
  correction_note text,
  corrected_by text,
  corrected_at timestamptz,
  applied_at timestamptz not null default now(),
  unique (account_id, run_date)
);
create index contribution_runs_account_month on wealth_os.contribution_runs(account_id, month_key);
create index contribution_runs_rule on wealth_os.contribution_runs(rule_id);

create table wealth_os.contribution_flags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references wealth_os.accounts(id) on delete cascade,
  rule_id uuid not null references wealth_os.contribution_rules(id),
  income_id uuid references wealth_os.income(id) on delete set null,
  old_amount numeric, old_frequency text,
  new_amount numeric, new_frequency text,
  suggested jsonb,                            -- {gross_annual_salary, employee_monthly, employer_monthly, total_monthly, approximate: true}
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by text
);
create unique index contribution_flags_one_pending on wealth_os.contribution_flags(rule_id) where status = 'pending';
create index contribution_flags_account on wealth_os.contribution_flags(account_id);

create table wealth_os.pension_config (key text primary key, value numeric not null, note text);
insert into wealth_os.pension_config (key, value, note) values
  ('qe_lower', 6240,  'Qualifying earnings lower threshold, £/yr (2025/26 and 2026/27, frozen)'),
  ('qe_upper', 50270, 'Qualifying earnings upper threshold, £/yr (2025/26 and 2026/27, frozen)'),
  ('ras_relief_gross_up', 0.25, 'Relief at source basic-rate gross-up on the net payment: pay £80, HMRC adds £20 (25% of net = 20% of gross)');

-- ---------- 3. RLS ----------
alter table wealth_os.contribution_rules            enable row level security;
alter table wealth_os.contribution_rule_allocations enable row level security;
alter table wealth_os.contribution_rule_state       enable row level security;
alter table wealth_os.contribution_runs             enable row level security;
alter table wealth_os.contribution_flags            enable row level security;
alter table wealth_os.pension_config                enable row level security;

create policy contribution_rules_adviser_all on wealth_os.contribution_rules
  for all using (wealth_os.is_adviser()) with check (wealth_os.is_adviser());
create policy contribution_rules_client_select on wealth_os.contribution_rules
  for select using (exists (select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
                            where a.id = contribution_rules.account_id and c.user_id = auth.uid()));

create policy contribution_rule_allocations_adviser_all on wealth_os.contribution_rule_allocations
  for all using (wealth_os.is_adviser()) with check (wealth_os.is_adviser());
create policy contribution_rule_allocations_client_select on wealth_os.contribution_rule_allocations
  for select using (exists (select 1 from wealth_os.contribution_rules r
                            join wealth_os.accounts a on a.id = r.account_id
                            join wealth_os.clients c on c.id = a.client_id
                            where r.id = contribution_rule_allocations.rule_id and c.user_id = auth.uid()));

create policy contribution_rule_state_adviser_all on wealth_os.contribution_rule_state
  for all using (wealth_os.is_adviser()) with check (wealth_os.is_adviser());
create policy contribution_rule_state_client_select on wealth_os.contribution_rule_state
  for select using (exists (select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
                            where a.id = contribution_rule_state.account_id and c.user_id = auth.uid()));

create policy contribution_runs_adviser_all on wealth_os.contribution_runs
  for all using (wealth_os.is_adviser()) with check (wealth_os.is_adviser());
create policy contribution_runs_client_select on wealth_os.contribution_runs
  for select using (exists (select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
                            where a.id = contribution_runs.account_id and c.user_id = auth.uid()));

create policy contribution_flags_adviser_all on wealth_os.contribution_flags
  for all using (wealth_os.is_adviser()) with check (wealth_os.is_adviser());
create policy contribution_flags_client_select on wealth_os.contribution_flags
  for select using (exists (select 1 from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id
                            where a.id = contribution_flags.account_id and c.user_id = auth.uid()));

-- Thresholds are public figures; everyone signed in may read them.
create policy pension_config_adviser_all on wealth_os.pension_config
  for all using (wealth_os.is_adviser()) with check (wealth_os.is_adviser());
create policy pension_config_select on wealth_os.pension_config
  for select to authenticated using (true);

grant select, insert, update, delete on
  wealth_os.contribution_rules, wealth_os.contribution_rule_allocations, wealth_os.contribution_rule_state,
  wealth_os.contribution_runs, wealth_os.contribution_flags, wealth_os.pension_config
  to authenticated;
revoke all on
  wealth_os.contribution_rules, wealth_os.contribution_rule_allocations, wealth_os.contribution_rule_state,
  wealth_os.contribution_runs, wealth_os.contribution_flags, wealth_os.pension_config
  from anon;

-- ---------- 4. Guard pricing: never touch a manual-priced account ----------
create or replace function wealth_os.apply_us_prices(p_prices jsonb, p_rate numeric, p_at timestamp with time zone default now())
 returns integer
 language plpgsql
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
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
    and not a.is_manual_priced
    and h.price_source = 'auto_us'
    and h.units is not null;
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- ---------- 5. Shared calculation ----------
-- calc_contribution_core: pure calculation from a rule-shaped jsonb plus
-- its allocations. Every caller (engine, preview, flag suggestion, legacy
-- sync) goes through this, so there is exactly one calculation path.
--
-- Returns:
--   total               monthly total into funds
--   employee_gross      employee contribution, gross (salary-derived, or
--                       a fixed rule with a contribution_method)
--   employer            employer contribution (salary-derived only)
--   employer_core_pct / employer_effective_pct / employer_match_applied
--   pensionable_pay     annual pensionable pay (salary-derived)
--   client_pays         what leaves the client's take-home pay
--   relief_amount       relief at source added by HMRC
--   sacrifice_amount    employee portion paid by salary sacrifice
--   deposit_amount / deposit_sacrifice / deposit_relief
--                       the split written to account_deposits (sacrifice
--                       column = employer + sacrifice, matching the
--                       existing "employer / salary sacrifice" meaning)
--   legacy_personal / legacy_sacrifice / legacy_contribution
--                       figures synced to accounts.contribution_*
--   allocations         [{holding_id, amount}] summing exactly to total
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
  v_lower numeric; v_upper numeric; v_gu numeric;
  v_pensionable numeric; v_eff numeric;
  v_total numeric := 0; v_emp numeric := 0; v_er numeric := 0;
  v_relief numeric := 0; v_sacr numeric := 0; v_client numeric := 0;
  v_out jsonb := '[]'::jsonb;
  v_running numeric := 0;
  v_n int; v_i int := 0; v_amt numeric;
  r record;
begin
  select value into v_lower from wealth_os.pension_config where key = 'qe_lower';
  select value into v_upper from wealth_os.pension_config where key = 'qe_upper';
  select value into v_gu    from wealth_os.pension_config where key = 'ras_relief_gross_up';

  if v_basis = 'salary_derived' then
    if coalesce(p_rule->>'pensionable_basis','full_salary') = 'qualifying_earnings' then
      v_pensionable := least(greatest(coalesce(v_gross,0) - v_lower, 0), v_upper - v_lower);
    else
      v_pensionable := coalesce(v_gross, 0);
    end if;
    v_eff := greatest(v_er_pct, least(v_emp_pct, v_cap));
    v_emp := round(v_pensionable * v_emp_pct / 100 / 12, 2);
    v_er  := round(v_pensionable * v_eff / 100 / 12, 2);
    v_total := v_emp + v_er;
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
    'pensionable_pay', v_pensionable,
    'client_pays', v_client,
    'relief_amount', v_relief,
    'sacrifice_amount', v_sacr,
    'deposit_amount', v_total - v_er - v_sacr - v_relief,
    'deposit_sacrifice', v_er + v_sacr,
    'deposit_relief', v_relief,
    'legacy_personal', case when p_account_type = 'pension' then v_client end,
    'legacy_sacrifice', case when p_account_type = 'pension' then v_total - v_client end,
    'legacy_contribution', case when p_account_type <> 'pension' then v_total end,
    'allocations', v_out
  );
end;
$function$;

-- Rule row (+ its allocations) -> jsonb, the shape calc_contribution_core takes.
create or replace function wealth_os.contribution_rule_json(p_rule_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'wealth_os', 'public'
as $function$
  select to_jsonb(r) || jsonb_build_object('allocations', coalesce((
           select jsonb_agg(jsonb_build_object('holding_id', a.holding_id, 'weight_pct', a.weight_pct,
                                               'amount', a.amount, 'sort_order', a.sort_order)
                            order by a.sort_order, a.holding_id)
           from wealth_os.contribution_rule_allocations a where a.rule_id = r.id), '[]'::jsonb))
  from wealth_os.contribution_rules r where r.id = p_rule_id;
$function$;

create or replace function wealth_os.calc_contribution(p_rule_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'wealth_os', 'public'
as $function$
  select wealth_os.calc_contribution_core(j, j->'allocations', a.type)
  from (select wealth_os.contribution_rule_json(p_rule_id) as j) x
  join wealth_os.contribution_rules r on r.id = p_rule_id
  join wealth_os.accounts a on a.id = r.account_id;
$function$;

-- weekly x52, fourweekly x13, monthly x12, annual x1; unknown -> null
create or replace function wealth_os.annualise_income(p_amount numeric, p_frequency text)
 returns numeric
 language sql
 immutable
as $function$
  select p_amount * case p_frequency when 'weekly' then 52 when 'fourweekly' then 13
                                     when 'monthly' then 12 when 'annual' then 1 end;
$function$;

-- ---------- 6. Internal helpers ----------
-- Next date the engine would apply a contribution for this account, given
-- its current rule (one run per account per month).
create or replace function wealth_os.contribution_next_run_date(p_account_id uuid, p_today date default current_date)
 returns date
 language plpgsql
 stable
 set search_path to 'wealth_os', 'public'
as $function$
declare
  v_day int; v_start date; v_from date; d date; i int;
begin
  select r.day_of_month, r.effective_from into v_day, v_from
  from wealth_os.contribution_rules r where r.account_id = p_account_id and r.effective_to is null;
  if v_day is null then return null; end if;
  select start_date into v_start from wealth_os.contribution_rule_state where account_id = p_account_id;
  for i in 0..2 loop
    d := (date_trunc('month', p_today) + make_interval(months => i))::date + (v_day - 1);
    if d >= p_today and d >= coalesce(v_start, p_today) and d >= v_from
       and not exists (select 1 from wealth_os.contribution_runs x
                       where x.account_id = p_account_id and x.month_key = to_char(d, 'YYYY-MM')) then
      return d;
    end if;
  end loop;
  return null;
end;
$function$;

-- Write the current rule's monthly figures into the legacy
-- accounts.contribution_* fields that forecasts already read:
--   pension:  contribution_personal  = what leaves take-home pay
--             contribution_sacrifice = everything else into the pot
--                                      (employer + sacrifice + RAS relief)
--   other:    contribution           = total into funds
create or replace function wealth_os.sync_legacy_contribution(p_account_id uuid)
 returns void
 language plpgsql
 set search_path to 'wealth_os', 'public'
as $function$
declare
  v_rule uuid; c jsonb; v_type text;
begin
  select id into v_rule from wealth_os.contribution_rules where account_id = p_account_id and effective_to is null;
  if v_rule is null then return; end if;
  select type into v_type from wealth_os.accounts where id = p_account_id;
  c := wealth_os.calc_contribution(v_rule);
  if v_type = 'pension' then
    update wealth_os.accounts
       set contribution_personal = (c->>'legacy_personal')::numeric,
           contribution_sacrifice = (c->>'legacy_sacrifice')::numeric,
           last_edited_by = 'system:contribution-rule', last_edited_at = now()
     where id = p_account_id;
  else
    update wealth_os.accounts
       set contribution = (c->>'legacy_contribution')::numeric,
           last_edited_by = 'system:contribution-rule', last_edited_at = now()
     where id = p_account_id;
  end if;
end;
$function$;

-- Close the current version and insert version+1 effective p_today with
-- p_patch applied (rule columns) and, when given, p_allocs replacing the
-- allocations (otherwise they are copied). Pending flags follow the new
-- version. Syncs the legacy fields. Returns the new rule id.
create or replace function wealth_os.contribution_new_version(p_account_id uuid, p_patch jsonb, p_allocs jsonb,
                                                              p_reason text, p_by text, p_today date default current_date)
 returns uuid
 language plpgsql
 set search_path to 'wealth_os', 'public'
as $function$
declare
  cur wealth_os.contribution_rules;
  nr wealth_os.contribution_rules;
  v_ver int;
begin
  select * into cur from wealth_os.contribution_rules where account_id = p_account_id and effective_to is null for update;
  select coalesce(max(version), 0) + 1 into v_ver from wealth_os.contribution_rules where account_id = p_account_id;

  if cur.id is not null then
    nr := jsonb_populate_record(cur, coalesce(p_patch, '{}'::jsonb));
    update wealth_os.contribution_rules set effective_to = p_today - 1 where id = cur.id;
  else
    nr := jsonb_populate_record(null::wealth_os.contribution_rules, coalesce(p_patch, '{}'::jsonb));
  end if;
  nr.id := gen_random_uuid();
  nr.account_id := p_account_id;
  nr.version := v_ver;
  nr.effective_from := p_today;
  nr.effective_to := null;
  nr.change_reason := p_reason;
  nr.created_at := now();
  nr.created_by := p_by;
  nr.annual_uplift_pct := coalesce(nr.annual_uplift_pct, 0);
  insert into wealth_os.contribution_rules select nr.*;

  if p_allocs is not null then
    insert into wealth_os.contribution_rule_allocations (rule_id, holding_id, weight_pct, amount, sort_order)
    select nr.id, (a->>'holding_id')::uuid, nullif(a->>'weight_pct','')::numeric, nullif(a->>'amount','')::numeric,
           coalesce(nullif(a->>'sort_order','')::int, (ord - 1)::int)
    from jsonb_array_elements(p_allocs) with ordinality as t(a, ord);
  elsif cur.id is not null then
    insert into wealth_os.contribution_rule_allocations (rule_id, holding_id, weight_pct, amount, sort_order)
    select nr.id, holding_id, weight_pct, amount, sort_order
    from wealth_os.contribution_rule_allocations where rule_id = cur.id;
  end if;

  if cur.id is not null then
    update wealth_os.contribution_flags set rule_id = nr.id where rule_id = cur.id and status = 'pending';
  end if;

  perform wealth_os.sync_legacy_contribution(p_account_id);
  return nr.id;
end;
$function$;

-- Apply one contribution: same figure onto cost_basis and value of each
-- fund, record the run, add to that month's account_deposits. The
-- holdings trigger then recalculates accounts.value / last_updated.
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
          (c->>'employee_gross')::numeric, (c->>'employer')::numeric,
          (c->>'sacrifice_amount')::numeric, (c->>'relief_amount')::numeric, c->'allocations')
  returning id into v_run;

  perform wealth_os.contribution_adjust_deposits(p_account_id, v_mk,
            (c->>'deposit_amount')::numeric, (c->>'deposit_sacrifice')::numeric, (c->>'deposit_relief')::numeric);
  return v_run;
end;
$function$;

-- Add (or with negative figures, subtract) to a month's account_deposits row.
create or replace function wealth_os.contribution_adjust_deposits(p_account_id uuid, p_month_key text,
                                                                  p_amount numeric, p_sacrifice numeric, p_relief numeric)
 returns void
 language plpgsql
 set search_path to 'wealth_os', 'public'
as $function$
begin
  insert into wealth_os.account_deposits (account_id, month_key, amount, sacrifice_amount, relief_amount, last_edited_by, last_edited_at)
  values (p_account_id, p_month_key, coalesce(p_amount, 0), nullif(coalesce(p_sacrifice, 0), 0), nullif(coalesce(p_relief, 0), 0),
          'system:contribution-engine', now())
  on conflict (account_id, month_key) do update
    set amount = wealth_os.account_deposits.amount + coalesce(p_amount, 0),
        sacrifice_amount = case when coalesce(p_sacrifice, 0) = 0 then wealth_os.account_deposits.sacrifice_amount
                                else coalesce(wealth_os.account_deposits.sacrifice_amount, 0) + p_sacrifice end,
        relief_amount = case when coalesce(p_relief, 0) = 0 then wealth_os.account_deposits.relief_amount
                             else coalesce(wealth_os.account_deposits.relief_amount, 0) + p_relief end,
        last_edited_by = 'system:contribution-engine',
        last_edited_at = now();
end;
$function$;

-- Undo (p_sign = -1) or apply a delta of allocations to cost_basis, and to
-- value only where no statement valuation has been entered on/after the
-- run date (a statement figure is the truth). Returns the holdings whose
-- value was left alone.
create or replace function wealth_os.contribution_apply_alloc_delta(p_account_id uuid, p_run_date date, p_deltas jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'wealth_os', 'public'
as $function$
declare
  d jsonb; v_amt numeric; v_checked date; v_kept jsonb := '[]'::jsonb; v_name text;
begin
  for d in select * from jsonb_array_elements(coalesce(p_deltas, '[]'::jsonb)) loop
    v_amt := (d->>'amount')::numeric;
    continue when coalesce(v_amt, 0) = 0;
    select value_checked_at, name into v_checked, v_name from wealth_os.holdings
     where id = (d->>'holding_id')::uuid and account_id = p_account_id;
    if v_checked is not null and v_checked >= p_run_date then
      update wealth_os.holdings
         set cost_basis = coalesce(cost_basis, 0) + v_amt,
             last_edited_by = 'system:contribution-engine', last_edited_at = now()
       where id = (d->>'holding_id')::uuid and account_id = p_account_id;
      v_kept := v_kept || jsonb_build_object('holding_id', d->>'holding_id', 'name', v_name, 'value_checked_at', v_checked);
    else
      update wealth_os.holdings
         set cost_basis = coalesce(cost_basis, 0) + v_amt,
             value = coalesce(value, 0) + v_amt,
             last_edited_by = 'system:contribution-engine', last_edited_at = now()
       where id = (d->>'holding_id')::uuid and account_id = p_account_id;
    end if;
  end loop;
  return v_kept;
end;
$function$;

-- ---------- 7. Engine ----------
create or replace function wealth_os.run_contribution_engine(p_today date default current_date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
declare
  acc record; st wealth_os.contribution_rule_state; cur wealth_os.contribution_rules;
  v_runs int := 0; v_uplifts int := 0; v_rolled int := 0; v_held int := 0; v_errors jsonb := '[]'::jsonb;
  m date; d date; v_rule uuid; v_factor numeric; v_patch jsonb; v_allocs jsonb;
begin
  -- serialise concurrent runs (cron + manual)
  perform pg_advisory_xact_lock(hashtext('wealth_os.run_contribution_engine'));

  for acc in
    select a.id from wealth_os.accounts a
    where a.has_contribution_rule
      and exists (select 1 from wealth_os.contribution_rules r where r.account_id = a.id and r.effective_to is null)
  loop
    begin
      select * into st from wealth_os.contribution_rule_state where account_id = acc.id for update;
      if st.account_id is null then continue; end if;
      select * into cur from wealth_os.contribution_rules where account_id = acc.id and effective_to is null;

      -- A. Uplift check -- one per cycle, income-driven review wins.
      if st.next_uplift_date is not null and st.next_uplift_date <= p_today then
        if exists (select 1 from wealth_os.contribution_flags f where f.account_id = acc.id and f.status = 'pending') then
          v_held := v_held + 1;                          -- held until the flag is resolved
        elsif st.last_reviewed_at > (st.next_uplift_date - interval '1 year')::date
              and st.last_review_source in ('income_change','manual_edit') then
          update wealth_os.contribution_rule_state
             set next_uplift_date = (next_uplift_date + interval '1 year')::date
           where account_id = acc.id;
          v_rolled := v_rolled + 1;
        elsif cur.annual_uplift_pct > 0 then
          v_factor := 1 + cur.annual_uplift_pct / 100;
          v_allocs := null;
          if cur.basis = 'salary_derived' then
            v_patch := jsonb_build_object('gross_annual_salary', round(cur.gross_annual_salary * v_factor, 2));
          elsif cur.allocation_method = 'percentage' then
            v_patch := jsonb_build_object('total_amount', round(cur.total_amount * v_factor, 2));
          else
            v_patch := '{}'::jsonb;
            select jsonb_agg(jsonb_build_object('holding_id', holding_id, 'weight_pct', weight_pct,
                                                'amount', round(amount * v_factor, 2), 'sort_order', sort_order)
                             order by sort_order)
              into v_allocs
              from wealth_os.contribution_rule_allocations where rule_id = cur.id;
          end if;
          perform wealth_os.contribution_new_version(acc.id, v_patch, v_allocs, 'annual_uplift', 'system:contribution-engine', p_today);
          update wealth_os.contribution_rule_state
             set next_uplift_date = (next_uplift_date + interval '1 year')::date,
                 last_reviewed_at = p_today, last_review_source = 'annual_uplift'
           where account_id = acc.id;
          v_uplifts := v_uplifts + 1;
        else
          update wealth_os.contribution_rule_state
             set next_uplift_date = (next_uplift_date + interval '1 year')::date
           where account_id = acc.id;
          v_rolled := v_rolled + 1;
        end if;
      end if;

      -- B. Contributions, with catch-up for missed days. One run per
      -- account per month, on the day set by the version active that day.
      for m in select generate_series(date_trunc('month', st.start_date), date_trunc('month', p_today), interval '1 month')::date loop
        continue when exists (select 1 from wealth_os.contribution_runs x
                              where x.account_id = acc.id and x.month_key = to_char(m, 'YYYY-MM'));
        v_rule := null;
        select r.id, m + (r.day_of_month - 1) into v_rule, d
          from wealth_os.contribution_rules r
         where r.account_id = acc.id
           and m + (r.day_of_month - 1) >= r.effective_from
           and (r.effective_to is null or m + (r.day_of_month - 1) <= r.effective_to)
           and m + (r.day_of_month - 1) >= st.start_date
           and m + (r.day_of_month - 1) <= p_today
         order by r.version desc
         limit 1;
        if v_rule is not null then
          if wealth_os.contribution_apply_run(acc.id, v_rule, d) is not null then
            v_runs := v_runs + 1;
          end if;
        end if;
      end loop;
    exception when others then
      v_errors := v_errors || jsonb_build_object('account_id', acc.id, 'error', sqlerrm);
      raise warning 'contribution engine: account % failed: %', acc.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('runs', v_runs, 'uplifts', v_uplifts, 'rolled', v_rolled, 'held', v_held, 'errors', v_errors);
end;
$function$;

-- ---------- 8. Income-change flag ----------
create or replace function wealth_os.trg_income_contribution_flag()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
declare
  r wealth_os.contribution_rules; f wealth_os.contribution_flags;
  v_old_amt numeric; v_old_freq text; v_old_ann numeric; v_new_ann numeric;
  v_gross numeric; v_sugg jsonb; c jsonb; j jsonb; v_type text;
begin
  if new.amount is not distinct from old.amount and new.frequency is not distinct from old.frequency then
    return null;
  end if;
  for r in
    select cr.* from wealth_os.contribution_rules cr
    join wealth_os.accounts a on a.id = cr.account_id
    where cr.linked_income_id = new.id and cr.effective_to is null and a.has_contribution_rule
  loop
    select * into f from wealth_os.contribution_flags where rule_id = r.id and status = 'pending';
    -- compare against the figure the rule was last reviewed at, not an
    -- intermediate edit
    v_old_amt := coalesce(f.old_amount, old.amount);
    v_old_freq := case when f.id is not null then f.old_frequency else old.frequency end;
    v_old_ann := wealth_os.annualise_income(v_old_amt, v_old_freq);
    v_new_ann := wealth_os.annualise_income(new.amount, new.frequency);

    if v_old_ann is not null and v_new_ann = v_old_ann then
      -- same annual income (e.g. monthly -> annual restated, or changed
      -- back): nothing to review
      if f.id is not null then delete from wealth_os.contribution_flags where id = f.id; end if;
      continue;
    end if;

    v_sugg := null;
    if r.basis = 'salary_derived' and r.gross_annual_salary is not null
       and v_old_ann is not null and v_old_ann > 0 and v_new_ann is not null then
      v_gross := round(r.gross_annual_salary * v_new_ann / v_old_ann, 2);
      select type into v_type from wealth_os.accounts where id = r.account_id;
      j := wealth_os.contribution_rule_json(r.id);
      c := wealth_os.calc_contribution_core(j || jsonb_build_object('gross_annual_salary', v_gross), j->'allocations', v_type);
      v_sugg := jsonb_build_object('gross_annual_salary', v_gross,
                                   'employee_monthly', c->'employee_gross',
                                   'employer_monthly', c->'employer',
                                   'total_monthly', c->'total',
                                   'current_total_monthly', (wealth_os.calc_contribution(r.id))->'total',
                                   'approximate', true);
    end if;

    if f.id is not null then
      update wealth_os.contribution_flags
         set new_amount = new.amount, new_frequency = new.frequency, suggested = v_sugg, created_at = now()
       where id = f.id;
    else
      insert into wealth_os.contribution_flags (account_id, rule_id, income_id, old_amount, old_frequency, new_amount, new_frequency, suggested)
      values (r.account_id, r.id, new.id, old.amount, old.frequency, new.amount, new.frequency, v_sugg);
    end if;
  end loop;
  return null;
end;
$function$;

create trigger income_contribution_flag
  after update of amount, frequency on wealth_os.income
  for each row execute function wealth_os.trg_income_contribution_flag();

-- ---------- 9. Adviser RPCs ----------
create or replace function wealth_os.require_adviser()
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
begin
  if not wealth_os.is_adviser() then
    raise exception 'Adviser access required' using errcode = '42501';
  end if;
end;
$function$;

-- Validates a rule payload against an account. Raises on the first problem.
create or replace function wealth_os.validate_contribution_payload(p_account_id uuid, p jsonb)
 returns void
 language plpgsql
 stable
 set search_path to 'wealth_os', 'public'
as $function$
declare
  v_basis text := p->>'basis';
  v_method text := p->>'allocation_method';
  v_n int; v_bad int; v_sum numeric; v_dupes int; v_client uuid; v_day int;
begin
  select client_id into v_client from wealth_os.accounts where id = p_account_id;
  if v_client is null then raise exception 'Account not found'; end if;
  if v_basis not in ('fixed','salary_derived') or v_basis is null then raise exception 'Basis must be fixed or salary_derived'; end if;
  if v_method not in ('percentage','manual') or v_method is null then raise exception 'Allocation method must be percentage or manual'; end if;
  if v_basis = 'salary_derived' and v_method <> 'percentage' then raise exception 'Salary-derived rules split by percentage'; end if;
  v_day := nullif(p->>'day_of_month','')::int;
  if v_day is null or v_day not between 1 and 28 then raise exception 'Day of month must be 1-28'; end if;
  if coalesce(nullif(p->>'annual_uplift_pct','')::numeric, 0) < 0 then raise exception 'Annual uplift cannot be negative'; end if;

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

-- payload -> the rule columns contribution_new_version patches in
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
    'contribution_method', nullif(p->>'contribution_method','')
  );
$function$;

create or replace function wealth_os.save_contribution_rule(p_account_id uuid, p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
declare
  cur wealth_os.contribution_rules; v_rule uuid; v_old jsonb; v_new jsonb; v_today date := current_date;
  v_allocs jsonb;
begin
  perform wealth_os.require_adviser();
  perform wealth_os.validate_contribution_payload(p_account_id, p_payload);
  select * into cur from wealth_os.contribution_rules where account_id = p_account_id and effective_to is null;

  select jsonb_agg(jsonb_build_object('holding_id', a->>'holding_id',
                                      'weight_pct', case when p_payload->>'allocation_method' = 'percentage' then a->>'weight_pct' end,
                                      'amount', case when p_payload->>'allocation_method' = 'manual' then a->>'amount' end,
                                      'sort_order', ord - 1) order by ord)
    into v_allocs
    from jsonb_array_elements(p_payload->'allocations') with ordinality as t(a, ord);

  if cur.id is null then
    -- First rule (or re-enabling an ended one): the cycle starts today.
    insert into wealth_os.contribution_rule_state (account_id, start_date, next_uplift_date, last_reviewed_at, last_review_source)
    values (p_account_id, v_today, (v_today + interval '1 year')::date, v_today, 'created')
    on conflict (account_id) do update
      set start_date = excluded.start_date, next_uplift_date = excluded.next_uplift_date,
          last_reviewed_at = excluded.last_reviewed_at, last_review_source = excluded.last_review_source;
    v_rule := wealth_os.contribution_new_version(p_account_id, wealth_os.contribution_payload_patch(p_payload), v_allocs,
                                                 'created', coalesce(auth.uid()::text, 'adviser'), v_today);
  else
    v_old := wealth_os.calc_contribution(cur.id);
    v_rule := wealth_os.contribution_new_version(p_account_id, wealth_os.contribution_payload_patch(p_payload), v_allocs,
                                                 'manual_edit', coalesce(auth.uid()::text, 'adviser'), v_today);
    v_new := wealth_os.calc_contribution(v_rule);
    if (v_old->>'total')::numeric is distinct from (v_new->>'total')::numeric
       or cur.gross_annual_salary is distinct from (select gross_annual_salary from wealth_os.contribution_rules where id = v_rule) then
      update wealth_os.contribution_rule_state
         set last_reviewed_at = v_today, last_review_source = 'manual_edit'
       where account_id = p_account_id;
    end if;
  end if;

  update wealth_os.accounts set has_contribution_rule = true where id = p_account_id;

  return jsonb_build_object('rule_id', v_rule,
                            'version', (select version from wealth_os.contribution_rules where id = v_rule),
                            'next_run_date', wealth_os.contribution_next_run_date(p_account_id, v_today),
                            'calc', wealth_os.calc_contribution(v_rule),
                            'account', (select jsonb_build_object('contribution', contribution, 'contribution_personal', contribution_personal,
                                                                  'contribution_sacrifice', contribution_sacrifice)
                                        from wealth_os.accounts where id = p_account_id));
end;
$function$;

create or replace function wealth_os.end_contribution_rule(p_account_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
begin
  perform wealth_os.require_adviser();
  update wealth_os.contribution_rules set effective_to = current_date - 1
   where account_id = p_account_id and effective_to is null;
  update wealth_os.contribution_flags set status = 'dismissed', resolved_at = now(), resolved_by = coalesce(auth.uid()::text, 'adviser')
   where account_id = p_account_id and status = 'pending';
  update wealth_os.accounts set has_contribution_rule = false where id = p_account_id;
  return jsonb_build_object('ended', true);
end;
$function$;

create or replace function wealth_os.resolve_contribution_flag(p_flag_id uuid, p_action text, p_gross_override numeric default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
declare
  f wealth_os.contribution_flags; v_gross numeric; v_rule uuid; v_today date := current_date;
begin
  perform wealth_os.require_adviser();
  if p_action not in ('accept','dismiss') then raise exception 'Action must be accept or dismiss'; end if;
  select * into f from wealth_os.contribution_flags where id = p_flag_id for update;
  if f.id is null then raise exception 'Flag not found'; end if;
  if f.status <> 'pending' then raise exception 'Flag already resolved'; end if;

  if p_action = 'accept' then
    v_gross := coalesce(p_gross_override, (f.suggested->>'gross_annual_salary')::numeric);
    if v_gross is null or v_gross <= 0 then raise exception 'Enter the new gross salary'; end if;
    if not exists (select 1 from wealth_os.contribution_rules where account_id = f.account_id and effective_to is null and basis = 'salary_derived') then
      raise exception 'The account no longer has a salary-derived rule';
    end if;
    v_rule := wealth_os.contribution_new_version(f.account_id, jsonb_build_object('gross_annual_salary', round(v_gross, 2)), null,
                                                 'income_change', coalesce(auth.uid()::text, 'adviser'), v_today);
  end if;

  update wealth_os.contribution_flags
     set status = case when p_action = 'accept' then 'accepted' else 'dismissed' end,
         resolved_at = now(), resolved_by = coalesce(auth.uid()::text, 'adviser'),
         rule_id = coalesce(v_rule, rule_id)
   where id = f.id;
  update wealth_os.contribution_rule_state
     set last_reviewed_at = v_today, last_review_source = 'income_change'
   where account_id = f.account_id;

  return jsonb_build_object('status', case when p_action = 'accept' then 'accepted' else 'dismissed' end,
                            'rule_id', v_rule,
                            'calc', case when v_rule is not null then wealth_os.calc_contribution(v_rule) end,
                            'next_run_date', wealth_os.contribution_next_run_date(f.account_id, v_today),
                            'account', (select jsonb_build_object('contribution', contribution, 'contribution_personal', contribution_personal,
                                                                  'contribution_sacrifice', contribution_sacrifice)
                                        from wealth_os.accounts where id = f.account_id));
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
  v_dep_sacr numeric; v_dep_relief numeric;
begin
  perform wealth_os.require_adviser();
  select * into r from wealth_os.contribution_runs where id = p_run_id for update;
  if r.id is null then raise exception 'Run not found'; end if;
  if r.status = 'reversed' then raise exception 'Run already reversed'; end if;

  select jsonb_agg(jsonb_build_object('holding_id', a->>'holding_id', 'amount', -(a->>'amount')::numeric))
    into v_neg from jsonb_array_elements(r.allocations) a;
  v_kept := wealth_os.contribution_apply_alloc_delta(r.account_id, r.run_date, v_neg);

  v_dep_sacr := coalesce(r.employer_amount, 0) + coalesce(r.sacrifice_amount, 0);
  v_dep_relief := coalesce(r.relief_amount, 0);
  perform wealth_os.contribution_adjust_deposits(r.account_id, r.month_key,
            -(r.total_amount - v_dep_sacr - v_dep_relief), -v_dep_sacr, -v_dep_relief);

  update wealth_os.contribution_runs
     set status = 'reversed', correction_note = p_note, corrected_by = coalesce(auth.uid()::text, 'adviser'), corrected_at = now()
   where id = r.id;

  return jsonb_build_object('status', 'reversed', 'value_kept', v_kept,
    'message', case when jsonb_array_length(v_kept) > 0
                    then 'Cost basis restored. Value left as the statement figure for funds checked on or after ' || to_char(r.run_date, 'DD Mon YYYY') || '.'
                    else 'Cost basis and value restored.' end);
end;
$function$;

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
begin
  perform wealth_os.require_adviser();
  select * into r from wealth_os.contribution_runs where id = p_run_id for update;
  if r.id is null then raise exception 'Run not found'; end if;
  if r.status = 'reversed' then raise exception 'A reversed run cannot be adjusted'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a note explaining the adjustment'; end if;

  select count(*) into v_bad from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) a
    left join wealth_os.holdings h on h.id = (a->>'holding_id')::uuid and h.account_id = r.account_id
   where h.id is null or coalesce((a->>'amount')::numeric, -1) < 0;
  if v_bad > 0 or jsonb_array_length(coalesce(p_allocations,'[]'::jsonb)) = 0 then
    raise exception 'Allocations must be this account''s funds with amounts of £0 or more';
  end if;
  select round(sum((a->>'amount')::numeric), 2) into v_new_total from jsonb_array_elements(p_allocations) a;
  if v_new_total <= 0 then raise exception 'Adjusted total must be above £0 -- reverse the run instead'; end if;

  -- per-holding delta = new - old (holdings in either set)
  select jsonb_agg(jsonb_build_object('holding_id', hid, 'amount', coalesce(n, 0) - coalesce(o, 0)))
    into v_deltas
    from (select coalesce(nn.hid, oo.hid) as hid, nn.amt as n, oo.amt as o
            from (select a->>'holding_id' hid, round((a->>'amount')::numeric, 2) amt from jsonb_array_elements(p_allocations) a) nn
            full join (select a->>'holding_id' hid, (a->>'amount')::numeric amt from jsonb_array_elements(r.allocations) a) oo
              on oo.hid = nn.hid) x;
  v_kept := wealth_os.contribution_apply_alloc_delta(r.account_id, r.run_date, v_deltas);

  -- scale the run's components proportionally to the new total
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
         allocations = (select jsonb_agg(jsonb_build_object('holding_id', a->>'holding_id', 'amount', round((a->>'amount')::numeric, 2)))
                          from jsonb_array_elements(p_allocations) a),
         correction_note = p_note, corrected_by = coalesce(auth.uid()::text, 'adviser'), corrected_at = now()
   where id = r.id;

  return jsonb_build_object('status', 'adjusted', 'total', v_new_total, 'value_kept', v_kept,
    'message', case when jsonb_array_length(v_kept) > 0
                    then 'Cost basis adjusted. Value left as the statement figure for funds checked on or after ' || to_char(r.run_date, 'DD Mon YYYY') || '.'
                    else 'Cost basis and value adjusted.' end);
end;
$function$;

-- Live calculation for the editor. No writes, no validation beyond what
-- the maths needs, so a half-filled form still previews.
create or replace function wealth_os.preview_contribution(p_payload jsonb)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
declare
  v_account uuid := nullif(p_payload->>'account_id','')::uuid; v_type text; v_next date; v_day int; d date; i int;
begin
  perform wealth_os.require_adviser();
  select type into v_type from wealth_os.accounts where id = v_account;
  -- next run date for the payload's day, as if saved today
  v_day := nullif(p_payload->>'day_of_month','')::int;
  if v_day between 1 and 28 then
    for i in 0..2 loop
      d := (date_trunc('month', current_date) + make_interval(months => i))::date + (v_day - 1);
      if d >= current_date and (v_account is null or not exists (
            select 1 from wealth_os.contribution_runs x where x.account_id = v_account and x.month_key = to_char(d, 'YYYY-MM'))) then
        v_next := d; exit;
      end if;
    end loop;
  end if;
  return wealth_os.calc_contribution_core(p_payload, p_payload->'allocations', coalesce(v_type, 'pension'))
         || jsonb_build_object('next_run_date', v_next);
end;
$function$;

create or replace function wealth_os.set_manual_priced(p_account_id uuid, p_value boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
declare n int := 0;
begin
  perform wealth_os.require_adviser();
  update wealth_os.accounts set is_manual_priced = p_value where id = p_account_id;
  if not found then raise exception 'Account not found'; end if;
  if p_value then
    update wealth_os.holdings set price_source = 'manual' where account_id = p_account_id and price_source <> 'manual';
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('is_manual_priced', p_value, 'holdings_switched_to_manual', n);
end;
$function$;

-- ---------- 10. Manual statement valuation (adviser or the client) ----------
-- Overwrites value with the statement figure as at p_as_at and stamps
-- value_checked_at. Never touches cost_basis. Contributions the engine has
-- applied AFTER p_as_at are not in that statement, so they are carried
-- on top (none when the statement is dated today).
create or replace function wealth_os.record_holding_valuation(p_holding_id uuid, p_value numeric, p_as_at date default current_date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'wealth_os', 'public'
as $function$
declare
  h wealth_os.holdings; v_manual boolean; v_owner uuid; v_since numeric; v_by text;
begin
  select * into h from wealth_os.holdings where id = p_holding_id for update;
  if h.id is null then raise exception 'Holding not found'; end if;
  select a.is_manual_priced, c.user_id into v_manual, v_owner
    from wealth_os.accounts a join wealth_os.clients c on c.id = a.client_id where a.id = h.account_id;
  if wealth_os.is_adviser() then v_by := 'adviser';
  elsif v_owner = auth.uid() then v_by := 'client';
  else raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not v_manual then raise exception 'Statement valuations are for manual-priced accounts'; end if;
  if p_value is null or p_value < 0 then raise exception 'Enter the statement value'; end if;
  if p_as_at is null or p_as_at > current_date then raise exception 'The "as at" date cannot be in the future'; end if;
  if h.value_checked_at is not null and p_as_at < h.value_checked_at then
    raise exception 'A more recent statement value (as at %) is already recorded', to_char(h.value_checked_at, 'DD Mon YYYY');
  end if;

  select coalesce(sum((a->>'amount')::numeric), 0) into v_since
    from wealth_os.contribution_runs r, jsonb_array_elements(r.allocations) a
   where r.account_id = h.account_id and r.status <> 'reversed'
     and r.run_date > p_as_at and a->>'holding_id' = p_holding_id::text;

  update wealth_os.holdings
     set value = round(p_value + v_since, 2), value_checked_at = p_as_at,
         last_edited_by = v_by, last_edited_at = now()
   where id = p_holding_id;

  return jsonb_build_object('value', round(p_value + v_since, 2), 'value_checked_at', p_as_at, 'contributions_since', v_since);
end;
$function$;

-- ---------- 11. Grants ----------
revoke execute on function
  wealth_os.calc_contribution_core(jsonb, jsonb, text), wealth_os.contribution_rule_json(uuid), wealth_os.calc_contribution(uuid),
  wealth_os.annualise_income(numeric, text), wealth_os.contribution_next_run_date(uuid, date),
  wealth_os.sync_legacy_contribution(uuid), wealth_os.contribution_new_version(uuid, jsonb, jsonb, text, text, date),
  wealth_os.contribution_apply_run(uuid, uuid, date), wealth_os.contribution_adjust_deposits(uuid, text, numeric, numeric, numeric),
  wealth_os.contribution_apply_alloc_delta(uuid, date, jsonb), wealth_os.run_contribution_engine(date),
  wealth_os.trg_income_contribution_flag(), wealth_os.require_adviser(),
  wealth_os.validate_contribution_payload(uuid, jsonb), wealth_os.contribution_payload_patch(jsonb),
  wealth_os.save_contribution_rule(uuid, jsonb), wealth_os.end_contribution_rule(uuid),
  wealth_os.resolve_contribution_flag(uuid, text, numeric), wealth_os.reverse_contribution_run(uuid, text),
  wealth_os.adjust_contribution_run(uuid, jsonb, text), wealth_os.preview_contribution(jsonb),
  wealth_os.set_manual_priced(uuid, boolean), wealth_os.record_holding_valuation(uuid, numeric, date)
  from public, anon;

-- Callable from the app. Adviser-only ones check is_adviser() themselves.
grant execute on function
  wealth_os.save_contribution_rule(uuid, jsonb), wealth_os.end_contribution_rule(uuid),
  wealth_os.resolve_contribution_flag(uuid, text, numeric), wealth_os.reverse_contribution_run(uuid, text),
  wealth_os.adjust_contribution_run(uuid, jsonb, text), wealth_os.preview_contribution(jsonb),
  wealth_os.set_manual_priced(uuid, boolean), wealth_os.record_holding_valuation(uuid, numeric, date),
  wealth_os.calc_contribution(uuid), wealth_os.calc_contribution_core(jsonb, jsonb, text),
  wealth_os.contribution_rule_json(uuid), wealth_os.annualise_income(numeric, text),
  wealth_os.contribution_next_run_date(uuid, date), wealth_os.require_adviser()
  to authenticated;
-- The engine and the write helpers are not callable from the app at all
-- (helpers run inside the SECURITY DEFINER RPCs / engine as the owner).

-- ---------- 12. Schedule ----------
select cron.schedule('wealth_os_contribution_engine', '30 5 * * *', $$select wealth_os.run_contribution_engine();$$);
