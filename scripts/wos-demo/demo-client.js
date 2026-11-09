/* Test-only demo client for Wealth OS: sample figures, never a real
   client record. Read by scripts/wos-demo/fake-supabase.js. The page's
   ?demo= query picks a state, comma separated:
     nonote    no coach's notes written
     behind    a client behind plan (lower saving, higher spending)
     nodebts   no debts recorded
     noflags   no set-and-forget or earmarked accounts
     added     the Forecast and Cashflow topics are already added to the next session
     stale     the plan and this month were changed after the notes were written
     light     light theme
   Today is taken from the browser clock. */
(function(){
  'use strict';
  var q = new URLSearchParams(location.search).get('demo') || '';
  var has = function(k){ return q.split(',').indexOf(k) >= 0; };
  var behind = has('behind'), noDebts = has('nodebts'), noFlags = has('noflags');
  if(has('light')){ try{ localStorage.setItem('tei-theme', 'light'); }catch(e){} }

  var CID = '11111111-2222-4333-8444-555555555555', UID = '99999999-8888-4777-8666-555555555555';
  var now = new Date();
  var mk = function(back){ var d = new Date(now.getFullYear(), now.getMonth() - back, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  var iso = function(daysBack){ return new Date(now.getTime() - daysBack*864e5).toISOString(); };
  var dateIn = function(months){ var d = new Date(now.getFullYear(), now.getMonth() + months, 1); return d.toISOString().slice(0, 10); };
  var n = 0, id = function(){ n++; return 'aaaaaaaa-0000-4000-8000-' + String(100000000000 + n); };

  var acc = function(o){ return Object.assign({id: id(), client_id: CID, created_at: '2023-06-01T09:00:00Z', return_pct: null, contribution: 0,
    cash_balance: 0, opening_contributions: 0, is_joint: false, is_manual_priced: false, has_contribution_rule: false, set_and_forget: false, earmarked: false}, o); };
  var pension = acc({provider: 'Aviva', type: 'pension', value: behind ? 21400 : 48200, contribution: behind ? 180 : 420, set_and_forget: !noFlags});
  var isa = acc({provider: 'Trading 212', type: 'isa', value: behind ? 6100 : 18750, contribution: behind ? 100 : 300});
  var gia = acc({provider: 'eToro', type: 'gia', value: behind ? 2200 : 7400, cash_balance: behind ? 140 : 380});
  var lisa = acc({provider: 'Hargreaves Lansdown', type: 'lisa', value: behind ? 2600 : 5200, contribution: behind ? 50 : 100, set_and_forget: !noFlags});
  var cash = acc({provider: 'HSBC', type: 'cash', value: behind ? 1500 : 4200});
  var cisa = acc({provider: 'Trading 212', type: 'cash_isa', value: behind ? 600 : 3300, earmarked: !noFlags, interest_rate: 4.2});
  var accounts = [pension, isa, gia, lisa, cash, cisa];
  // Money paid in before tracking began, so returns look like a real history.
  [pension, isa, gia, lisa].forEach(function(a){ a.opening_contributions = Math.round(a.value*0.3); });

  var hold = function(a, o){ return Object.assign({id: id(), account_id: a.id, units: null, avg_open: null, created_at: '2023-06-01T09:00:00Z',
    price_source: 'manual', asset_class: null}, o); };
  var k = behind ? 0.34 : 1;
  var holdings = [
    hold(pension, {name: 'Global Equity Tracker', ticker: '', value: pension.value, cost_basis: Math.round(pension.value*0.82)}),
    hold(isa, {name: 'Vanguard FTSE All-World', ticker: 'VWRP', value: Math.round(9800*k), cost_basis: Math.round(8100*k)}),
    hold(isa, {name: 'iShares Core S&P 500', ticker: 'CSPX', value: Math.round(5200*k), cost_basis: Math.round(4300*k)}),
    hold(isa, {name: 'Nvidia', ticker: 'NVDA', value: Math.round(2150*k), cost_basis: Math.round(1300*k)}),
    hold(isa, {name: 'Vanguard FTSE Emerging Markets', ticker: 'VFEG', value: Math.round(1600*k), cost_basis: Math.round(1450*k)}),
    hold(gia, {name: 'Tesla', ticker: 'TSLA', value: Math.round(3100*k), cost_basis: Math.round(2800*k)}),
    hold(gia, {name: 'Aviva plc', ticker: 'AV.', value: Math.round(2400*k), cost_basis: Math.round(2050*k)}),
    hold(gia, {name: 'HSBC Holdings', ticker: 'HSBA', value: Math.round(1520*k), cost_basis: Math.round(1280*k)}),
    hold(lisa, {name: 'Global tracker fund', ticker: '', value: lisa.value, cost_basis: Math.round(lisa.value*0.88)})
  ];
  // Account values match their holdings plus uninvested cash.
  accounts.forEach(function(a){
    var hs = holdings.filter(function(h){ return h.account_id === a.id; });
    if(hs.length) a.value = hs.reduce(function(s, h){ return s + h.value; }, 0) + (Number(a.cash_balance) || 0);
  });

  // 36 months of history: steady saving plus growth with a little noise.
  var account_months = [], account_deposits = [];
  var seed = behind ? 11 : 7, rnd = function(){ seed = (seed*16807) % 2147483647; return seed/2147483647; };
  accounts.forEach(function(a){
    var monthly = Number(a.contribution) || (a.type === 'cash' ? 40 : a.type === 'cash_isa' ? 60 : 50);
    for(var b = 35; b >= 0; b--){
      var t = (35 - b)/35, wobble = 1 + 0.03*Math.sin(b/3.1) + (rnd() - 0.5)*0.02;
      var v = a.value*(0.42 + 0.58*t)*(b === 0 ? 1 : wobble);
      account_months.push({id: id(), account_id: a.id, month_key: mk(b), value: Math.round(v), carried_forward: false, last_edited_at: iso(b*30)});
      if(b < 35) account_deposits.push({id: id(), account_id: a.id, month_key: mk(b), amount: monthly, sacrifice_amount: 0, relief_amount: a.type === 'pension' ? Math.round(monthly*0.25) : 0});
    }
  });

  // Cashflow: twelve logged months of take-home, essentials, lifestyle and wealth building.
  var cashflow_months = [];
  for(var c = 11; c >= 0; c--){
    var th = behind ? 2600 : 3000, es = behind ? 1350 : 1200;
    var li = behind ? 960 + Math.round((rnd() - 0.4)*120) : 560 + (c < 4 ? (4 - c)*45 : Math.round(rnd()*80));
    var we = behind ? 210 + Math.round(rnd()*90) : 860 + Math.round(rnd()*110);
    cashflow_months.push({id: id(), client_id: CID, month_key: mk(c), actual_income: th, actual_expenses: es + li, essentials: es, lifestyle: li,
      wealth_building: we, last_edited_by: 'client', last_edited_at: c === 0 ? (has('stale') ? iso(1) : iso(9)) : iso(c*30 + 6)});
  }

  var noteDate = iso(7);
  var note = function(text){ return has('nonote') ? {mode: 'auto'} : {mode: 'manual', message: text, updatedAt: noteDate}; };
  var client = {
    id: CID, user_id: UID, first_name: 'Sam', last_name: 'Taylor', dob: '1992-03-14', employment_status: 'employed',
    relationship_status: 'single', risk_profile: 'balanced', email: 'demo@example.invalid', notes: null, currency: 'GBP',
    onboarding_complete: true, tier: 'momentum', member_since: '2023-06-01', theme: has('light') ? 'light' : 'dark',
    created_at: '2023-06-01T09:00:00Z', last_updated: iso(2), last_viewed_at: iso(1),
    coach_corner: {mode: 'auto'},
    portfolio_coach: note(behind
      ? 'A steady month. The thing worth talking about is the safety net: it is still under one month of spending, so new money goes there first for now. Bring your questions to our next session.'
      : 'Good month for the pension. The thing I want us to talk about is how much now rides on a few US names: they have done well, but it is a lot of eggs in one basket for money you might want for the house. Bring your questions to our next session.'),
    forecast_coach: note(behind
      ? 'At today\'s saving you reach your number a few years after you plan to stop. The quickest lever is the monthly amount: even £100 more makes a visible difference. Let us look at where it could come from.'
      : 'You are on course to be free before you plan to stop work. The order of returns view is the one to keep in mind: a bad few years just after you stop matters most, so we will plan the first years of drawing carefully.'),
    cashflow_coach: note(behind
      ? 'You are spending a little more than you can turn into wealth right now. Let us pick one lifestyle cost to trim and point it straight at the card.'
      : 'This month is solid, but lifestyle has crept up three months in a row. Let us set a lifestyle ceiling at our next session, and plan to clear the card before the 0% ends.'),
    wealth_insights: {mode: 'auto'}, wealth_next_steps: null, dividend_history: [{year: now.getFullYear() - 2, amount: behind ? 120 : 410}, {year: now.getFullYear() - 1, amount: behind ? 150 : 520}],
    investor_stage: null, north_star: null, monthly_wins: null, weekly_focus: null, journey_overrides: null, estate_planning: null,
    notification_prefs: null, dependants: null, state_pension: null, protection: null, investor_profile: null, setup_request: null
  };

  var liab = function(o){ return Object.assign({id: id(), client_id: CID, linked_asset_id: null, name: null, apr: null, min_pay: null, term_months: null,
    end_date: null, rate_type: null, change_date: null, new_apr: null}, o); };
  var home = {id: id(), client_id: CID, type: 'property', value: behind ? 0 : 250000, notes: 'Home'};
  var liabilities = noDebts ? [] : (behind ? [
    liab({type: 'loan', name: 'Car finance', balance: 9800, apr: 9.4, min_pay: 310, rate_type: 'fixed'}),
    liab({type: 'credit', name: 'Credit card', balance: 3200, apr: 22.9, min_pay: 96, rate_type: 'variable'}),
    liab({type: 'other', name: 'Overdraft', balance: 600, apr: 39.9, min_pay: 40, rate_type: 'variable'})
  ] : [
    liab({type: 'mortgage', name: 'Mortgage', balance: 160000, apr: 4.2, min_pay: 860, term_months: 276, rate_type: 'fixed', change_date: dateIn(16), new_apr: 4.9, linked_asset_id: home.id}),
    liab({type: 'loan', name: 'Car finance', balance: 6900, apr: 7.9, min_pay: 260, rate_type: 'fixed'}),
    liab({type: 'credit', name: 'Credit card', balance: 1500, apr: 0, min_pay: 45, rate_type: 'promo', change_date: dateIn(7), new_apr: 24.9})
  ]);

  var feedback = has('added') ? ['planning', 'cashflow'].map(function(p, i){
    return {id: id(), client_id: CID, area: 'session', page_context: p, message: 'Would like to talk about this at the next session.', status: 'new', submitted_by: 'client', created_at: iso(1 + i)};
  }) : [];

  window.WOS_DEMO = {
    user: {id: UID, email: 'demo@example.invalid'},
    tables: {
      profiles: [{user_id: UID, role: 'client', first_name: 'Sam'}],
      clients: [client],
      accounts: accounts, holdings: holdings, account_months: account_months, account_deposits: account_deposits, holding_months: [],
      goals: [{id: id(), client_id: CID, name: 'House deposit', type: 'savings', target_value: 30000, target_date: dateIn(30), status: 'active',
        progress_type: 'accounts', completed: false, status_history: []}],
      goal_accounts: [], goal_months: [],
      income: [{id: id(), client_id: CID, owner: 'client', type: 'salary', amount: behind ? 2600 : 3000, frequency: 'monthly'}],
      expenses: [
        {id: id(), client_id: CID, category: 'fixed', label: 'Rent or mortgage', amount: behind ? 750 : 860, owner: 'client', spend_category: 'essential'},
        {id: id(), client_id: CID, category: 'fixed', label: 'Bills', amount: behind ? 600 : 340, owner: 'client', spend_category: 'essential'},
        {id: id(), client_id: CID, category: 'variable', label: 'Lifestyle', amount: behind ? 950 : 600, owner: 'client', spend_category: 'lifestyle'}],
      cashflow_settings: [{client_id: CID, monthly_savings: 0, monthly_investing: 0, emergency_fund_target: null, emergency_fund_current: null,
        emergency_fund_account_id: cash.id, wealth_conversion_target: behind ? 20 : 25, retirement_age: 60, yearly_spending: behind ? 30000 : 21600,
        safety_net_months: 6, fi_multiple: null, fi_override: null, one_offs: null, savings_goals: null, monte_carlo: null,
        plan_saved_at: has('stale') ? iso(2) : null}],
      cashflow_months: cashflow_months,
      dividend_holdings: behind ? [] : [
        {id: id(), client_id: CID, name: 'Aviva plc', yield: 7.1, growth: 4, amount: 2400, frequency: 'semiannual'},
        {id: id(), client_id: CID, name: 'HSBC Holdings', yield: 6.2, growth: 3, amount: 1520, frequency: 'semiannual'},
        {id: id(), client_id: CID, name: 'Vanguard FTSE All-World', yield: 1.6, growth: 5, amount: 9800, frequency: 'quarterly'}],
      wealth_assets: behind ? [] : [home],
      wealth_liabilities: liabilities,
      insurance: [], documents: [], feedback: feedback, households: [],
      boundary_acknowledgements: [{user_id: UID, acknowledged_at: '2023-06-01T09:00:00Z'}],
      contribution_rules: [], contribution_rule_state: [], contribution_runs: [], contribution_flags: [],
      forecast_state: [], portfolio_scenarios: [], members_content: [], price_cache: [], education_progress: []
    }
  };
})();
