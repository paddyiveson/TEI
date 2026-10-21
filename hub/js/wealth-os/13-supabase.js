/* ================================================================
   TEI.wealthOS, Phase 1 Supabase rewire (read-only)
   ================================================================
   New module, not ported from the original Wealth_OS_v2.html preview
   build. Replaces TEI.data.getEmbeddedClient() as the source of
   state.client: fetches the signed-in user's real client data from the
   `wealth_os` Supabase schema and adapts it into the exact nested shape
   TEI.data.mergeDefaults() / state.client already expect (see the data
   shape mapping in wealth_os_supabase_rewire_brief.md section 5.3).

   One assumption made where the brief's shorthand was ambiguous —
   flagged here rather than guessed silently:
     1. wealth_os.clients uses snake_case columns throughout
        (first_name, last_name, employment_status, relationship_status,
        risk_profile) even though the brief's prose listed these bare,
        without explicit "camelKey: snake_column" annotation the way
        it did for every other table. Every other column name in the
        brief that got an explicit annotation is snake_case, and
        partner_name / partner_employment_status IS explicitly
        annotated on the very same clients row -- so treating the
        unannotated sibling columns as camelCase would be a very odd
        inconsistency for one Postgres table. Assumed snake_case here.
   ================================================================ */
window.TEI = window.TEI || {};

(function(){

  /* Two possible error surfaces: #loadError inside #clientApp (client-role
     load failures, or an adviser's client dashboard failing to open), and
     #clientListError on the client-list landing page (adviser's client
     list failing to load). Only one is ever visible at a time since the
     pages themselves are mutually exclusive, so it is simplest to just keep
     both in sync rather than have every caller know which one applies. */
  function hideBoot(){
    const el = document.getElementById('woBoot');
    if(!el || el.classList.contains('wb-done')) return;
    el.classList.add('wb-done');
    setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); }, 250);
  }
  function showLoadError(detail){
    hideBoot();
    const el = document.getElementById('loadError');
    const detailEl = document.getElementById('loadErrorDetail');
    if(detailEl) detailEl.textContent = detail || '';
    if(el) el.style.display = 'block';
    const listEl = document.getElementById('clientListError');
    if(listEl){ listEl.textContent = detail || 'Something went wrong.'; listEl.style.display = 'block'; }
  }
  function hideLoadError(){
    const el = document.getElementById('loadError');
    if(el) el.style.display = 'none';
    const listEl = document.getElementById('clientListError');
    if(listEl) listEl.style.display = 'none';
  }

  function wo(supabase){ return supabase.schema('wealth_os'); }

  /* Recurring contribution rules (supabase/migrations/005_pension_
     contribution_engine.sql). Read-only here -- every write goes through
     the RPCs below, and every figure comes from the shared SQL
     calc_contribution, so the browser never does its own contribution
     maths. Fails soft: an error (e.g. the migration not applied yet)
     leaves the feature empty instead of blocking the whole client load. */
  async function fetchContributionBundle(w, accountIds){
    const empty = { rules:[], state:[], runs:[], flags:[] };
    if(!accountIds.length) return empty;
    try{
      const [rulesRes, stateRes, runsRes, flagsRes] = await Promise.all([
        w.from('contribution_rules').select('*, contribution_rule_allocations(*)').in('account_id', accountIds).order('version'),
        w.from('contribution_rule_state').select('*').in('account_id', accountIds),
        w.from('contribution_runs').select('*').in('account_id', accountIds).order('run_date', {ascending:false}),
        w.from('contribution_flags').select('*').in('account_id', accountIds).order('created_at', {ascending:false}),
      ]);
      const err = [rulesRes, stateRes, runsRes, flagsRes].map(r=>r.error).find(Boolean);
      if(err) throw err;
      return { rules: rulesRes.data||[], state: stateRes.data||[], runs: runsRes.data||[], flags: flagsRes.data||[] };
    } catch(err){
      console.warn('Wealth OS: contribution rules unavailable', err);
      return empty;
    }
  }

  /* ---------- fetch: one client's full relational bundle ---------- */
  async function fetchClientBundle(supabase, clientId){
    const w = wo(supabase);
    const [
      clientRes, accountsRes, goalsRes, incomeRes, expensesRes,
      cashflowRes, dividendHoldingsRes, wealthAssetsRes, wealthLiabilitiesRes,
      insuranceRes, documentsRes, cashflowMonthsRes, feedbackRes
    ] = await Promise.all([
      w.from('clients').select('*').eq('id', clientId).single(),
      w.from('accounts').select('*').eq('client_id', clientId),
      w.from('goals').select('*').eq('client_id', clientId),
      w.from('income').select('*').eq('client_id', clientId),
      w.from('expenses').select('*').eq('client_id', clientId),
      w.from('cashflow_settings').select('*').eq('client_id', clientId).maybeSingle(),
      w.from('dividend_holdings').select('*').eq('client_id', clientId),
      w.from('wealth_assets').select('*').eq('client_id', clientId),
      w.from('wealth_liabilities').select('*').eq('client_id', clientId),
      w.from('insurance').select('*').eq('client_id', clientId),
      w.from('documents').select('*').eq('client_id', clientId),
      w.from('cashflow_months').select('*').eq('client_id', clientId),
      w.from('feedback').select('*').eq('client_id', clientId).order('created_at', {ascending:false}),
    ]);

    const firstError = [clientRes, accountsRes, goalsRes, incomeRes, expensesRes, cashflowRes,
      dividendHoldingsRes, wealthAssetsRes, wealthLiabilitiesRes, insuranceRes, documentsRes, cashflowMonthsRes, feedbackRes]
      .map(r=>r.error).find(Boolean);
    if(firstError) throw firstError;

    const accountIds = (accountsRes.data||[]).map(a=>a.id);
    const goalIds = (goalsRes.data||[]).map(g=>g.id);
    const [holdingsRes, goalAccountsRes, accountMonthsRes, goalMonthsRes, accountDepositsRes] = await Promise.all([
      accountIds.length ? w.from('holdings').select('*').in('account_id', accountIds) : Promise.resolve({data:[], error:null}),
      goalIds.length ? w.from('goal_accounts').select('*').in('goal_id', goalIds) : Promise.resolve({data:[], error:null}),
      accountIds.length ? w.from('account_months').select('*').in('account_id', accountIds) : Promise.resolve({data:[], error:null}),
      goalIds.length ? w.from('goal_months').select('*').in('goal_id', goalIds) : Promise.resolve({data:[], error:null}),
      accountIds.length ? w.from('account_deposits').select('*').in('account_id', accountIds) : Promise.resolve({data:[], error:null}),
    ]);
    if(holdingsRes.error) throw holdingsRes.error;
    if(goalAccountsRes.error) throw goalAccountsRes.error;
    if(accountMonthsRes.error) throw accountMonthsRes.error;
    if(goalMonthsRes.error) throw goalMonthsRes.error;
    if(accountDepositsRes.error) throw accountDepositsRes.error;

    // holding_months needs holdingIds, only known once holdingsRes above resolves.
    const holdingIds = (holdingsRes.data||[]).map(h=>h.id);
    const holdingMonthsRes = holdingIds.length
      ? await w.from('holding_months').select('*').in('holding_id', holdingIds)
      : {data:[], error:null};
    if(holdingMonthsRes.error) throw holdingMonthsRes.error;

    const contrib = await fetchContributionBundle(w, accountIds);

    return {
      contrib,
      client: clientRes.data,
      accounts: accountsRes.data||[],
      holdings: holdingsRes.data||[],
      goals: goalsRes.data||[],
      goalAccounts: goalAccountsRes.data||[],
      income: incomeRes.data||[],
      expenses: expensesRes.data||[],
      cashflowSettings: cashflowRes.data||null,
      dividendHoldings: dividendHoldingsRes.data||[],
      wealthAssets: wealthAssetsRes.data||[],
      wealthLiabilities: wealthLiabilitiesRes.data||[],
      insurance: insuranceRes.data||[],
      documents: documentsRes.data||[],
      accountMonths: accountMonthsRes.data||[],
      holdingMonths: holdingMonthsRes.data||[],
      goalMonths: goalMonthsRes.data||[],
      accountDeposits: accountDepositsRes.data||[],
      cashflowMonths: cashflowMonthsRes.data||[],
      feedback: feedbackRes.data||[],
    };
  }

  /* ---------- adapt: raw relational rows -> the state.client shape ----------
     Builds a "loaded"-shaped object exactly like the one TEI.data.mergeDefaults
     already accepts from the "Load client file…" JSON picker, then runs it
     through that same function so every default-filling rule (jsonb columns
     with no row yet, empty arrays, etc.) is handled in one place rather than
     re-implemented here. */
  function normaliseContrib(raw){
    raw = raw || {};
    const state = {};
    (raw.state||[]).forEach(s=>{ state[s.account_id] = s; });
    return {
      rules: (raw.rules||[]).map(r=>Object.assign({}, r, {
        allocations: (r.contribution_rule_allocations||[]).slice().sort((a,b)=>a.sort_order-b.sort_order)
      })),
      state, runs: raw.runs||[], flags: raw.flags||[]
    };
  }
  function expenseRowToLocal(e){
    return {id:e.id, label:e.label, amount:e.amount, owner:e.owner||'client',
      category: e.spend_category === 'lifestyle' ? 'lifestyle' : 'essential', hasSpendCategory: e.spend_category != null};
  }
  function adaptClientBundle(bundle, role){
    const c = bundle.client || {};
    const cf = bundle.cashflowSettings || {};

    const goalAccountsByGoal = {};
    (bundle.goalAccounts||[]).forEach(ga=>{
      (goalAccountsByGoal[ga.goal_id] = goalAccountsByGoal[ga.goal_id] || []).push(ga.account_id);
    });

    /* Reshape flat "one row per record per month" tables back into the
       { 'YYYY-MM': { recordId: value } } nested shape client.months /
       holdingsMonths / goalsMonths already expect -- nothing downstream
       (TEI.calc.buildMergedMonths, charts) needs to know this now comes
       from Supabase instead of the local-only object it used to be. */
    function groupMonths(rows, idField, valueField){
      const out = {};
      (rows||[]).forEach(row=>{
        const key = row.month_key;
        (out[key] = out[key] || {})[row[idField]] = row[valueField||'value'];
      });
      return out;
    }
    const months = groupMonths(bundle.accountMonths, 'account_id');
    const holdingsMonths = groupMonths(bundle.holdingMonths, 'holding_id');
    const goalsMonths = groupMonths(bundle.goalMonths, 'goal_id');
    // Same shape as months/holdingsMonths but holding carried_forward
    // instead of value -- Phase 22's monthly auto-snapshot flags any row it
    // wrote itself so the Update page can tell "carried forward" apart from
    // "someone actually confirmed this figure" (see wealth_os_phase22_auto_
    // monthly_snapshot.sql). Passes through mergeDefaults untouched since
    // it is not one of the keys that function explicitly overwrites.
    const monthsMeta = groupMonths(bundle.accountMonths, 'account_id', 'carried_forward');
    const holdingsMonthsMeta = groupMonths(bundle.holdingMonths, 'holding_id', 'carried_forward');
    // contribLog needs three figures per account per month (personal
    // amount, sacrifice portion, relief), not the single value the other
    // monthly tables use -- grouped separately rather than through
    // groupMonths().
    const contribLog = {};
    (bundle.accountDeposits||[]).forEach(row=>{
      (contribLog[row.month_key] = contribLog[row.month_key] || {})[row.account_id] = {
        amount: row.amount, sacrificeAmount: row.sacrifice_amount, reliefAmount: row.relief_amount
      };
    });
    // cashflow_months is client-level (one row per month, not per record) --
    // { 'YYYY-MM': {actualIncome, actualExpenses} } rather than the
    // recordId-keyed shape the other monthly tables use.
    const cashflowMonths = {};
    (bundle.cashflowMonths||[]).forEach(row=>{
      cashflowMonths[row.month_key] = { actualIncome: row.actual_income, actualExpenses: row.actual_expenses,
        // Update this month (B8, migration 010): the split, when logged.
        essentials: row.essentials != null ? Number(row.essentials) : null,
        lifestyle: row.lifestyle != null ? Number(row.lifestyle) : null,
        wealthBuilding: row.wealth_building != null ? Number(row.wealth_building) : null,
        lastEditedAt: row.last_edited_at || null };
    });

    const loaded = {
      meta:{
        clientId: c.id,
        householdId: c.household_id || null,
        displayName: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client',
        createdAt: c.created_at,
        lastUpdated: c.last_updated,
        completion:{ percent:0, missing:[] }, // not tracked in DB yet
        lastAdviserReview: null,
        // 'adviser' or 'client' -- who is currently viewing this bundle, not
        // who owns it. Render functions use this to decide whether to show
        // edit affordances. Not an enforced permission on its own (RLS is);
        // see TEI.calc.stampEdit's comment for the same caveat.
        role: role || 'client'
      },
      personal:{
        firstName: c.first_name, lastName: c.last_name, dob: c.dob,
        employmentStatus: c.employment_status, relationshipStatus: c.relationship_status,
        riskProfile: c.risk_profile, email: c.email, notes: c.notes,
        partner:{ name: c.partner_name, employmentStatus: c.partner_employment_status, incomeSources:[] },
        // Set up Wealth OS (B13, migration 013). Null until answered.
        dependants: c.dependants || null,
        lastEditedBy: c.last_edited_by, lastEditedAt: c.last_edited_at
      },
      pensions:{ statePension: c.state_pension || null },
      protection: c.protection || {},
      profile: c.investor_profile || {},
      setupRequest: c.setup_request || null,
      settings:{ currency: c.currency, onboardingComplete: c.onboarding_complete,
        // Redesign B9 (migration 011). Undefined until set.
        theme: c.theme || undefined,
        notifications: c.notification_prefs || undefined,
        tier: c.tier || undefined,
        memberSince: c.member_since || undefined },
      estatePlanning: c.estate_planning || {},

      accounts: (bundle.accounts||[]).map(a=>({
        id: a.id,
        name: TEI.data.acctLabel({provider: a.provider, type: a.type}),
        type: a.type, value: a.value, provider: a.provider,
        returnPct: a.return_pct, lastUpdated: a.last_updated,
        lastEditedBy: a.last_edited_by, lastEditedAt: a.last_edited_at,
        contribution: a.contribution, contributionPersonal: a.contribution_personal,
        contributionSacrifice: a.contribution_sacrifice,
        openingContributions: a.opening_contributions, cashBalance: a.cash_balance,
        interestRate: a.interest_rate, rateType: a.rate_type, maturityDate: a.maturity_date,
        interestAccruedToDate: a.interest_accrued_to_date, lastAccruedAt: a.last_accrued_at,
        isJoint: !!a.is_joint,
        isManualPriced: !!a.is_manual_priced, hasContributionRule: !!a.has_contribution_rule,
        setAndForget: !!a.set_and_forget, earmarked: !!a.earmarked,
        isaAllowanceLeft: a.isa_allowance_left != null ? Number(a.isa_allowance_left) : null, isaAllowanceTaxYear: a.isa_allowance_tax_year || null,
        discrepancyDismissedAmount: a.discrepancy_dismissed_amount, discrepancyDismissedAt: a.discrepancy_dismissed_at
      })),

      holdings: (bundle.holdings||[]).map(h=>({
        id: h.id, accountId: h.account_id, name: h.name, ticker: h.ticker, units: h.units,
        avgOpen: h.avg_open, costBasis: h.cost_basis, sector: h.sector, theme: h.theme || [], value: h.value,
        lastPrice: h.last_price, lastPricedAt: h.last_priced_at, priceSource: h.price_source || 'manual',
        valueCheckedAt: h.value_checked_at || null, assetClass: h.asset_class || null,
        lastEditedBy: h.last_edited_by, lastEditedAt: h.last_edited_at
      })),

      goals: (bundle.goals||[]).map(g=>({
        id: g.id, type: g.type, name: g.name, targetDate: g.target_date,
        progressType: g.progress_type, targetAmount: g.target_value, targetIncome: g.target_income,
        completed: g.completed, status: g.status,
        linkedAccountIds: goalAccountsByGoal[g.id] || [],
        linkedIncomeId: g.linked_income_id,
        statusHistory: g.status_history, lastEditedBy: g.last_edited_by, lastEditedAt: g.last_edited_at
      })),

      cashflow:{
        income: (bundle.income||[]).map(i=>({
          id: i.id, owner: i.owner, type: i.type, amount: i.amount, frequency: i.frequency,
          lastEditedBy: i.last_edited_by, lastEditedAt: i.last_edited_at
        })),
        expenses:{
          // category: 'essential' | 'lifestyle' (spec B9.7, migration 010's
          // spend_category). The expenses table's own `category` column is the
          // fixed/variable split, hence the different column name.
          fixed: (bundle.expenses||[]).filter(e=>e.category==='fixed').map(expenseRowToLocal),
          variable: (bundle.expenses||[]).filter(e=>e.category==='variable').map(expenseRowToLocal)
        },
        saving:{ monthlySavings: cf.monthly_savings, monthlyInvesting: cf.monthly_investing },
        emergencyFund:{ target: cf.emergency_fund_target, current: cf.emergency_fund_current, accountId: cf.emergency_fund_account_id },
        scenario: cf.scenario, bestMult: cf.best_mult, worstMult: cf.worst_mult,
        oneOffs: cf.one_offs, savingsGoals: cf.savings_goals
      },
      preferences:{
        fiMultiple: cf.fi_multiple, fiOverride: cf.fi_override,
        wealthConversionTarget: cf.wealth_conversion_target,
        // Plan settings (B9.4, migration 009). Undefined until first saved.
        retirementAge: cf.retirement_age != null ? cf.retirement_age : undefined,
        yearlySpending: cf.yearly_spending != null ? Number(cf.yearly_spending) : undefined,
        // Plan settings safety net target in months (migration 011); safetyNet() reads it.
        safetyNetMonths: cf.safety_net_months != null ? Number(cf.safety_net_months) : undefined
      },
      monteCarlo: cf.monte_carlo,

      dividendHoldings: (bundle.dividendHoldings||[]).map(h=>({id:h.id, name:h.name, yield:h.yield, growth:h.growth, amount:h.amount, frequency:h.frequency||'annual'})),

      wealth:{
        assets: (bundle.wealthAssets||[]).map(a=>({id:a.id, type:a.type, value:a.value, notes:a.notes})),
        liabilities: (bundle.wealthLiabilities||[]).map(l=>({id:l.id, type:l.type, balance:l.balance, linkedAssetId:l.linked_asset_id}))
      },

      insurance: (bundle.insurance||[]).map(i=>({id:i.id, type:i.type, provider:i.provider, details:i.details})),

      /* documents: brief's 5.3 mapping gives storagePath/uploadedAt (Supabase
         Storage path, not a public URL -- signed-URL generation is Phase 2/
         out of scope here). date/url are adapter-side convenience aliases so
         the existing render code (TEI.render.documents, which reads d.date
         and d.url and was told not to change) has something sane to show
         rather than blank fields. */
      documents: (bundle.documents||[]).map(docRowToLocal),

      // feedback: the client's own bug-report/feedback widget submissions,
      // newest first (already ordered server-side). Adviser-side triage
      // (status changes) happens through TEI.wealthOS.updateFeedbackStatus,
      // not here -- this is just what the client sees of their own history.
      feedback: (bundle.feedback||[]).map(f=>({
        id:f.id, area:f.area, pageContext:f.page_context, message:f.message,
        status:f.status, submittedBy:f.submitted_by, createdAt:f.created_at,
        statusUpdatedAt:f.status_updated_at, statusUpdatedBy:f.status_updated_by
      })),

      coachCorner: c.coach_corner, forecastCoach: c.forecast_coach, cashflowCoach: c.cashflow_coach,
      portfolioCoach: c.portfolio_coach, weeklyFocus: c.weekly_focus, monthlyWins: c.monthly_wins,
      journeyOverrides: c.journey_overrides, wealthInsights: c.wealth_insights, wealthNextSteps: c.wealth_next_steps,
      dividendHistory: c.dividend_history, investorStage: c.investor_stage, northStar: c.north_star,

      months, holdingsMonths, goalsMonths, contribLog, cashflowMonths, monthsMeta, holdingsMonthsMeta,

      // Recurring contribution rules -- kept as the raw DB rows (snake_case)
      // because they're only ever read for display; all writes are RPCs.
      contrib: normaliseContrib(bundle.contrib)
    };

    const merged = TEI.data.mergeDefaults(loaded);
    // Bring interest-bearing cash accounts up to date for this session -- see
    // accrueCashInterest's own comment for why this is safe to run on every load.
    (merged.accounts||[]).forEach(a=> TEI.calc.accrueCashInterest(merged, a.id));
    return merged;
  }

  /* ---------- top-level orchestration ---------- */
  async function loadClientById(supabase, clientId, role){
    const bundle = await fetchClientBundle(supabase, clientId);
    return adaptClientBundle(bundle, role);
  }

  /* Household rollup: loads every member's full client bundle (reusing
     loadClientById so net worth/income/expenditure are computed by the
     exact same TEI.calc functions as each member's own dashboard, rather
     than a second parallel calc that could drift) and hands them to
     TEI.calc.householdTotals for summing. Households are small (almost
     always 2 people), so N full loads is cheap in practice; returns null
     if the household has fewer than 2 members left (e.g. the other person
     was just unlinked) since there is nothing to roll up. */
  async function loadHouseholdSummary(supabase, householdId){
    const w = wo(supabase);
    const { data: members, error } = await w.from('clients').select('id, first_name, last_name').eq('household_id', householdId);
    if(error) throw error;
    if(!members || members.length < 2) return null;
    const bundles = await Promise.all(members.map(m=> loadClientById(supabase, m.id, 'adviser')));
    return { members, bundles };
  }

  /* Adviser opening a specific client from the client-list landing page --
     stamps last_viewed_at so the list can sort by most-recently-viewed next
     time it is shown. Only opening counts as a view (this only ever fires
     from openClient()/the "Open" button), not hovering/scrolling. Stamped
     before the (potentially slow) full bundle load so the write has landed
     by the time the adviser navigates back, and awaited so a failure here
     surfaces rather than silently leaving the list unsorted -- but it is
     still non-fatal to the actual client load if it does fail. */
  async function openClientAsAdviser(clientId){
    try{ await updateRow('clients', 'id', clientId, {last_viewed_at: new Date().toISOString()}); }
    catch(e){ console.error('Wealth OS: failed to stamp last_viewed_at', e); }
    return await loadClientById(window.teiSupabase, clientId, 'adviser');
  }

  /* Creates a brand-new clients row and hands back its id, ready to drop
     straight into the Onboarding Wizard. user_id is deliberately left null
     -- the client is not linked to a Supabase auth account yet (that happens
     separately when they're invited/sign up); existing RLS ownership checks
     already tolerate user_id IS NULL by falling through to the adviser
     branch, so this does not need any RLS changes of its own. */
  async function createClient(initialFields){
    const row = Object.assign({
      first_name: (initialFields && initialFields.firstName) || 'New',
      last_name: (initialFields && initialFields.lastName) || 'Client',
      onboarding_complete: false,
      last_updated: new Date().toISOString()
    }, initialFields && initialFields.extra ? initialFields.extra : {});
    return await insertRow('clients', row);
  }

  /* Links two existing clients (e.g. spouses/partners) into one household.
     If clientB already belongs to a household, clientA joins it -- so
     linking a third person later just means picking any existing member,
     not tracking who was "first". If neither has one, a new household row
     is created. Adviser-only by RLS (households_write_adviser_only). */
  async function linkHousehold(clientIdA, clientIdB){
    const w = wo(window.teiSupabase);
    const { data: rows, error: readErr } = await w.from('clients').select('id, household_id').in('id', [clientIdA, clientIdB]);
    if(readErr) throw readErr;
    const a = rows.find(r=>r.id===clientIdA), b = rows.find(r=>r.id===clientIdB);
    let householdId = (b && b.household_id) || (a && a.household_id);
    if(!householdId){
      const household = await insertRow('households', {});
      householdId = household.id;
    }
    const { error: updateErr } = await w.from('clients').update({household_id: householdId}).in('id', [clientIdA, clientIdB]);
    if(updateErr) throw updateErr;
    return householdId;
  }
  /* Removes just this one client from its household -- other members stay
     linked. Does not delete the households row even if it is now empty; an
     orphaned household with no members is harmless and adviser tooling
     does not currently need to clean those up. */
  async function unlinkHousehold(clientId){
    await updateRow('clients', 'id', clientId, {household_id: null});
  }

  /* Returns { role:'client', client } for a client-role login (their own
     dashboard, loaded immediately), or { role:'adviser', clients } for an
     adviser -- the adviser's client list, with nothing client-shaped loaded
     yet. TEI.app.init() renders the client-list landing page for the latter
     and only calls openClientAsAdviser() once one is actually picked. */
  async function loadWealthOSClient(){
    hideLoadError();
    try{
      await TeiAuth.waitForReady();
      const { data: userData, error: userErr } = await TeiAuth.getUser();
      if(userErr) throw userErr;
      const user = userData && userData.user;
      if(!user){
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = '/hub/login.html?redirect=' + redirect;
        return null; // navigating away
      }

      const supabase = window.teiSupabase;
      const w = wo(supabase);

      // wealth_os.profiles is keyed by user_id (confirmed against the live
      // schema 2026-08-05, no separate id column) -- this query is correct.
      // A null result here means no profiles row exists for this login, not
      // a wrong column name: provisioning it is a manual step done via
      // scripts/create-user.mjs (or a matching insert) when the account is
      // created, and it is easy to skip for a client set up before that.
      const { data: profile, error: profileErr } = await w.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
      if(profileErr) throw profileErr;
      if(!profile || !profile.role){
        showLoadError('No profile found for your account. Contact TEI to have your access set up.');
        return null;
      }

      if(profile.role === 'adviser'){
        const { data: clients, error: clientsErr } = await w.from('clients').select('id, first_name, last_name, user_id, last_updated, household_id, last_viewed_at').order('first_name', {ascending:true});
        if(clientsErr) throw clientsErr;
        // Cross-client feedback inbox: RLS already grants advisers unrestricted
        // select on this table (see wealth_os_phase5_feedback.sql), so no
        // client_id filter is needed here -- this is genuinely everyone's
        // feedback in one query, capped at the 200 most recent so the landing
        // page never has to page through history.
        const { data: feedback, error: feedbackErr } = await w.from('feedback').select('*').order('created_at', {ascending:false}).limit(200);
        if(feedbackErr) throw feedbackErr;
        // Households: just id/label, membership is read off each client's
        // household_id above -- this is only fetched to resolve a household's
        // label if one was ever set (most are unlabelled, grouping falls back
        // to member names).
        const { data: households, error: householdsErr } = await w.from('households').select('*');
        if(householdsErr) throw householdsErr;
        return { role:'adviser', clients: clients || [], feedback: feedback || [], households: households || [] };
      }

      // client role: exactly one clients row, linked via user_id
      const { data: own, error: ownErr } = await w.from('clients').select('id').eq('user_id', user.id).maybeSingle();
      if(ownErr) throw ownErr;
      if(!own){
        showLoadError('No client record is linked to your account yet. Contact TEI for help.');
        return null;
      }
      return { role:'client', client: await loadClientById(supabase, own.id, 'client') };
    } catch(err){
      console.error('Wealth OS: failed to load client data', err);
      showLoadError((err && err.message) || 'Unexpected error.');
      return null;
    }
  }

  /* ============================================================
     PHASE 2: write-back helpers.
     Generic insert/update/delete primitives, then a snake_case row
     mapper per table (the inverse of adaptClientBundle's mapping
     above), then one high-level save/delete function per entity --
     these are what the UI (adviser manual entry, onboarding wizard,
     CSV import) actually calls. Every save is "explicit": the caller
     awaits it and only touches local state once Supabase confirms,
     rather than optimistic local-first updates.
     ============================================================ */

  async function insertRow(table, row){
    const { data, error } = await wo(window.teiSupabase).from(table).insert(row).select().single();
    if(error) throw error;
    return data;
  }
  async function updateRow(table, idColumn, idValue, row){
    const { data, error } = await wo(window.teiSupabase).from(table).update(row).eq(idColumn, idValue).select().single();
    if(error) throw error;
    return data;
  }
  async function deleteRow(table, idColumn, idValue){
    const { error } = await wo(window.teiSupabase).from(table).delete().eq(idColumn, idValue);
    if(error) throw error;
  }

  /* ---------- per-table row mappers (local camelCase -> DB snake_case) ---------- */

  function accountToRow(clientId, a){
    return {
      client_id: clientId,
      provider: a.provider || null,
      type: a.type,
      value: a.value,
      return_pct: a.returnPct != null ? a.returnPct : null,
      contribution: a.contribution != null ? a.contribution : null,
      contribution_personal: a.contributionPersonal != null ? a.contributionPersonal : null,
      contribution_sacrifice: a.contributionSacrifice != null ? a.contributionSacrifice : null,
      opening_contributions: a.openingContributions != null ? a.openingContributions : null,
      cash_balance: a.cashBalance != null ? a.cashBalance : null,
      interest_rate: a.interestRate != null ? a.interestRate : null,
      rate_type: a.rateType || null,
      maturity_date: a.maturityDate || null,
      interest_accrued_to_date: a.interestAccruedToDate != null ? a.interestAccruedToDate : null,
      last_accrued_at: a.lastAccruedAt || null,
      is_joint: !!a.isJoint,
      // Portfolio-treemap settings (Manual Entry -> Accounts -> More options).
      // Every saveAccount caller passes the full account object, so these
      // carry through unrelated saves unchanged.
      set_and_forget: !!a.setAndForget,
      earmarked: !!a.earmarked,
      // ISA allowance left and its tax year (migration 017, B5.2).
      isa_allowance_left: a.isaAllowanceLeft != null ? a.isaAllowanceLeft : null,
      isa_allowance_tax_year: a.isaAllowanceTaxYear || null,
      discrepancy_dismissed_amount: a.discrepancyDismissedAmount != null ? a.discrepancyDismissedAmount : null,
      discrepancy_dismissed_at: a.discrepancyDismissedAt || null,
      last_updated: a.lastUpdated || new Date().toISOString().slice(0,10),
      last_edited_by: a.lastEditedBy || null,
      last_edited_at: a.lastEditedAt || null
    };
    // deliberately no "name" -- accounts.name is generated client-side from
    // provider+type (see adaptClientBundle above), not a stored column.
  }

  function holdingToRow(accountId, h){
    return {
      account_id: accountId,
      name: h.name,
      ticker: h.ticker || null,
      // onboarding-created holdings use h.quantity, adviser/CSV-created use
      // h.units -- both map onto the one real DB column so either entry
      // path persists correctly.
      units: h.quantity != null ? h.quantity : (h.units != null ? h.units : null),
      avg_open: h.avgOpen != null ? h.avgOpen : null,
      cost_basis: h.costBasis != null ? h.costBasis : null,
      value: h.value,
      sector: h.sector || null,
      theme: (h.theme && h.theme.length) ? h.theme : null,
      last_priced_at: h.lastPricedAt || null,
      last_price: h.lastPrice != null ? h.lastPrice : null,
      // 'auto_us' = repriced on a schedule by the refresh-us-prices Edge
      // Function (supabase/migrations/004_auto_us_pricing.sql); anything
      // else, including every holding created before that existed, is
      // 'manual'. Only the adviser can change it (holding editor toggle).
      price_source: h.priceSource === 'auto_us' ? 'auto_us' : 'manual',
      // Asset class (migration 018): only sent when the caller has one, so
      // a save from a partial holding object never clears it.
      ...(h.assetClass !== undefined ? {asset_class: h.assetClass || null} : {})
    };
    // holdings has no last_edited_by/last_edited_at column (confirmed via
    // information_schema) -- deliberately omitted. last_priced_at is
    // different: a dedicated "when was this last live-priced" timestamp
    // added specifically for the "skip holdings priced in the last hour"
    // refresh option, only ever set by applyLivePriceToHolding(). last_price
    // is the raw per-share figure Twelve Data returned at that same
    // moment, native currency (USD for every ticker this app prices --
    // see the USD->GBP conversion note elsewhere), same source, not
    // derived from value/units -- added specifically so the Holdings
    // card can show "what a share is actually worth" rather than only
    // the position's total value.
  }

  function goalToRow(clientId, g){
    return {
      client_id: clientId,
      name: g.name,
      type: g.type,
      target_value: g.targetAmount != null ? g.targetAmount : null,
      target_date: g.targetDate || null,
      status: g.status || 'active',
      progress_type: g.progressType,
      target_income: g.targetIncome != null ? g.targetIncome : null,
      linked_income_id: g.linkedIncomeId || null,
      completed: !!g.completed,
      status_history: g.statusHistory || [],
      last_edited_by: g.lastEditedBy || null,
      last_edited_at: g.lastEditedAt || null
    };
  }

  function dividendHoldingToRow(clientId, d){
    return { client_id: clientId, name: d.name, yield: d.yield, growth: d.growth, amount: d.amount, frequency: d.frequency || 'annual' };
  }

  // income/wealth_assets/wealth_liabilities column names assumed from the
  // brief's mapping (matches every other client_id-keyed table's pattern)
  // pending final confirmation -- see chat for the introspection query
  // covering these three specifically. Adjust here if that comes back
  // different.
  function incomeToRow(clientId, i){
    return {
      client_id: clientId, owner: i.owner || null, type: i.type, amount: i.amount, frequency: i.frequency,
      last_edited_by: i.lastEditedBy || null, last_edited_at: i.lastEditedAt || null
    };
  }
  function wealthAssetToRow(clientId, a){
    return { client_id: clientId, type: a.type, value: a.value, notes: a.notes || null };
  }
  function wealthLiabilityToRow(clientId, l){
    return { client_id: clientId, type: l.type, balance: l.balance, linked_asset_id: l.linkedAssetId || null };
  }

  function cashflowSettingsToRow(clientId, client){
    const cf = client.cashflow || {};
    const pref = client.preferences || {};
    return {
      client_id: clientId,
      monthly_savings: cf.saving ? cf.saving.monthlySavings : null,
      monthly_investing: cf.saving ? cf.saving.monthlyInvesting : null,
      emergency_fund_target: cf.emergencyFund ? cf.emergencyFund.target : null,
      emergency_fund_current: cf.emergencyFund ? cf.emergencyFund.current : null,
      emergency_fund_account_id: cf.emergencyFund ? cf.emergencyFund.accountId : null,
      scenario: cf.scenario != null ? cf.scenario : null,
      best_mult: cf.bestMult != null ? cf.bestMult : null,
      worst_mult: cf.worstMult != null ? cf.worstMult : null,
      one_offs: cf.oneOffs || null,
      savings_goals: cf.savingsGoals || null,
      fi_multiple: pref.fiMultiple != null ? pref.fiMultiple : null,
      fi_override: pref.fiOverride != null ? pref.fiOverride : null,
      wealth_conversion_target: pref.wealthConversionTarget != null ? pref.wealthConversionTarget : null,
      monte_carlo: client.monteCarlo || null,
      // Plan settings (migration 009): only sent once set, so saving the rest
      // of this row keeps working on a database without those columns yet.
      ...(pref.retirementAge != null ? {retirement_age: pref.retirementAge} : {}),
      ...(pref.yearlySpending != null ? {yearly_spending: pref.yearlySpending} : {}),
      ...(pref.safetyNetMonths != null ? {safety_net_months: pref.safetyNetMonths} : {})
    };
  }

  function clientPersonalToRow(personal){
    return {
      first_name: personal.firstName, last_name: personal.lastName, dob: personal.dob || null,
      employment_status: personal.employmentStatus || null, relationship_status: personal.relationshipStatus || null,
      risk_profile: personal.riskProfile || null, email: personal.email || null, notes: personal.notes || null,
      partner_name: personal.partner ? personal.partner.name : null,
      partner_employment_status: personal.partner ? personal.partner.employmentStatus : null,
      last_updated: new Date().toISOString(),
      last_edited_by: personal.lastEditedBy || null, last_edited_at: personal.lastEditedAt || null
    };
  }

  /* goal_accounts has no single-row id of its own -- every goal save
     replaces its full linked-accounts set rather than diffing it. */
  async function syncGoalAccounts(goalId, accountIds){
    const supabase = window.teiSupabase;
    const { error: delErr } = await wo(supabase).from('goal_accounts').delete().eq('goal_id', goalId);
    if(delErr) throw delErr;
    if(accountIds && accountIds.length){
      const rows = accountIds.map(accId=>({ goal_id: goalId, account_id: accId }));
      const { error: insErr } = await wo(supabase).from('goal_accounts').insert(rows);
      if(insErr) throw insErr;
    }
  }

  /* ---------- high-level per-entity save/delete (what the UI calls) ---------- */

  async function saveAccount(clientId, existingId, local){
    const row = accountToRow(clientId, local);
    const saved = existingId ? await updateRow('accounts','id',existingId,row) : await insertRow('accounts', row);
    return saved.id;
  }
  async function deleteAccount(id){ await deleteRow('accounts','id',id); }

  async function saveHolding(accountId, existingId, local){
    const row = holdingToRow(accountId, local);
    const saved = existingId ? await updateRow('holdings','id',existingId,row) : await insertRow('holdings', row);
    return saved.id;
  }
  async function deleteHolding(id){ await deleteRow('holdings','id',id); }

  /* Live pricing (Twelve Data, via the /api/prices proxy -- the API key
     cannot live in this client-side app). Manual refresh only, never
     auto-fetched on page load: the free-tier quota is shared across every
     adviser/client session, and a silent background call per page view
     would burn through it fast for no benefit. Returns {prices, errors,
     usdGbpRate} in the same shape the endpoint gives back so callers can
     report partial failures (e.g. one bad ticker) without losing the rest
     of the batch. usdGbpRate is null if the FX lookup itself failed --
     callers must not fall back to treating the raw price as GBP in that
     case (see api/prices.js header comment re: the USD-only assumption). */
  async function fetchLivePrices(tickers){
    const symbols = [...new Set((tickers||[]).map(t=>String(t||'').trim().toUpperCase()).filter(Boolean))];
    if(!symbols.length) return {prices:{}, errors:{}, usdGbpRate:null};
    const { data:{session} } = await window.teiSupabase.auth.getSession();
    const token = session ? session.access_token : null;
    if(!token) throw new Error('Not signed in');
    const res = await fetch('/api/prices?symbols='+encodeURIComponent(symbols.join(',')), {
      headers: { Authorization: 'Bearer '+token }
    });
    const body = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(body.error || 'Price feed unavailable');
    return { prices: body.prices||{}, errors: body.errors||{}, usdGbpRate: body.usdGbpRate!=null ? body.usdGbpRate : null };
  }

  async function saveGoal(clientId, existingId, local){
    const row = goalToRow(clientId, local);
    const saved = existingId ? await updateRow('goals','id',existingId,row) : await insertRow('goals', row);
    await syncGoalAccounts(saved.id, local.linkedAccountIds || []);
    return saved.id;
  }
  async function deleteGoal(id){
    const supabase = window.teiSupabase;
    await wo(supabase).from('goal_accounts').delete().eq('goal_id', id);
    await deleteRow('goals','id',id);
  }

  async function saveIncome(clientId, existingId, local){
    const row = incomeToRow(clientId, local);
    const saved = existingId ? await updateRow('income','id',existingId,row) : await insertRow('income', row);
    return saved.id;
  }
  async function deleteIncome(id){ await deleteRow('income','id',id); }

  /* spend_category is only sent when it is 'lifestyle' or the row already
     had one, so saving expenses keeps working before migration 010 is
     applied (every row reads as essential until then). */
  async function saveExpense(clientId, existingId, local, category){
    const row = { client_id: clientId, category: category, label: local.label, amount: local.amount, owner: local.owner || 'client' };
    if(local.category === 'lifestyle' || local.hasSpendCategory){
      row.spend_category = local.category === 'lifestyle' ? 'lifestyle' : 'essential';
      local.hasSpendCategory = true;
    }
    const saved = existingId ? await updateRow('expenses','id',existingId,row) : await insertRow('expenses', row);
    return saved.id;
  }
  async function deleteExpense(id){ await deleteRow('expenses','id',id); }

  async function saveWealthAsset(clientId, existingId, local){
    const row = wealthAssetToRow(clientId, local);
    const saved = existingId ? await updateRow('wealth_assets','id',existingId,row) : await insertRow('wealth_assets', row);
    return saved.id;
  }
  async function deleteWealthAsset(id){ await deleteRow('wealth_assets','id',id); }

  async function saveWealthLiability(clientId, existingId, local){
    const row = wealthLiabilityToRow(clientId, local);
    const saved = existingId ? await updateRow('wealth_liabilities','id',existingId,row) : await insertRow('wealth_liabilities', row);
    return saved.id;
  }
  async function deleteWealthLiability(id){ await deleteRow('wealth_liabilities','id',id); }

  async function saveDividendHolding(clientId, existingId, local){
    const row = dividendHoldingToRow(clientId, local);
    const saved = existingId ? await updateRow('dividend_holdings','id',existingId,row) : await insertRow('dividend_holdings', row);
    return saved.id;
  }
  async function deleteDividendHolding(id){ await deleteRow('dividend_holdings','id',id); }

  async function saveCashflowSettings(clientId, client){
    const row = cashflowSettingsToRow(clientId, client);
    const { data, error } = await wo(window.teiSupabase).from('cashflow_settings')
      .upsert(row, { onConflict: 'client_id' }).select().single();
    if(error) throw error;
    return data;
  }

  async function saveClientPersonal(clientId, personal){
    return await updateRow('clients','id',clientId, clientPersonalToRow(personal));
  }

  async function setOnboardingComplete(clientId){
    return await updateRow('clients','id',clientId, { onboarding_complete:true, last_updated:new Date().toISOString() });
  }

  /* dividendHistory lives as a jsonb array directly on the clients row
     (clients.dividend_history), not its own table -- every edit writes the
     whole array back. */
  async function saveDividendHistory(clientId, historyArray){
    return await updateRow('clients','id',clientId, { dividend_history: historyArray, last_updated: new Date().toISOString() });
  }
  /* monthlyWins is a jsonb array on the clients row (clients.monthly_wins);
     Home's "Mark as done" appends to it. Writes the whole array back. */
  async function saveMonthlyWins(clientId, winsArray){
    return await updateRow('clients','id',clientId, { monthly_wins: winsArray, last_updated: new Date().toISOString() });
  }

  async function importHoldingsRows(accountId, localHoldings){
    const rows = localHoldings.map(h=>holdingToRow(accountId, h));
    const { data, error } = await wo(window.teiSupabase).from('holdings').insert(rows).select();
    if(error) throw error;
    return data;
  }

  /* CSV import replaces an account's whole holdings list -- matches the
     confirm() prompt's "replace the N existing holdings" semantics exactly,
     so delete-then-bulk-insert rather than trying to diff old vs new rows. */
  async function replaceHoldingsForAccount(accountId, localHoldings){
    await deleteRow('holdings', 'account_id', accountId);
    if(!localHoldings.length) return [];
    return await importHoldingsRows(accountId, localHoldings);
  }

  /* ---------- monthly history: one row per record per month, upserted by
     (record_id, month_key). Both client and adviser roles call these --
     RLS (wealth_os_phase3_monthly_history.sql) already lets a client write
     their own rows, so there is no server-side month restriction to add. */
  async function saveAccountMonth(accountId, monthKey, value, source){
    const row = { account_id: accountId, month_key: monthKey, value,
      last_edited_by: source || 'adviser', last_edited_at: new Date().toISOString() };
    const { data, error } = await wo(window.teiSupabase).from('account_months')
      .upsert(row, { onConflict: 'account_id,month_key' }).select().single();
    if(error) throw error;
    return data;
  }
  async function saveHoldingMonth(holdingId, monthKey, value, source){
    const row = { holding_id: holdingId, month_key: monthKey, value,
      last_edited_by: source || 'adviser', last_edited_at: new Date().toISOString() };
    const { data, error } = await wo(window.teiSupabase).from('holding_months')
      .upsert(row, { onConflict: 'holding_id,month_key' }).select().single();
    if(error) throw error;
    return data;
  }
  async function saveGoalMonth(goalId, monthKey, value, source){
    const row = { goal_id: goalId, month_key: monthKey, value,
      last_edited_by: source || 'adviser', last_edited_at: new Date().toISOString() };
    const { data, error } = await wo(window.teiSupabase).from('goal_months')
      .upsert(row, { onConflict: 'goal_id,month_key' }).select().single();
    if(error) throw error;
    return data;
  }

  /* ---------- client self-service logging: deposits + cashflow actuals ----------
     Same "both roles, no server-side restriction beyond RLS" pattern as the
     Phase 3 monthly-history tables. account_deposits tracks money paid INTO
     an account during a month (distinct from account_months, which is the
     balance/value AT month-end) -- lets "total deposited vs current value"
     be worked out later without guessing how much of a balance change was
     new money vs growth. cashflow_months is one row per client per month
     (not per income-source/expense-line) -- a quick "how did this month
     actually go" log against the stated regular income/expense figures. */
  /* amount = personal deposit, sacrificeAmount = pension employer/salary
     sacrifice portion (null for non-pensions), reliefAmount = auto-
     calculated LISA/pension government top-up on the personal amount
     (basic rate, no annual cap) -- see the schema comment in
     wealth_os_phase4_client_logging.sql for the reasoning. */
  async function saveAccountDeposit(accountId, monthKey, amount, sacrificeAmount, reliefAmount, source){
    const row = { account_id: accountId, month_key: monthKey, amount,
      sacrifice_amount: sacrificeAmount!=null ? sacrificeAmount : null,
      relief_amount: reliefAmount!=null ? reliefAmount : null,
      last_edited_by: source || 'adviser', last_edited_at: new Date().toISOString() };
    const { data, error } = await wo(window.teiSupabase).from('account_deposits')
      .upsert(row, { onConflict: 'account_id,month_key' }).select().single();
    if(error) throw error;
    return data;
  }

  /* ---------- recurring contribution rules (005_pension_contribution_engine) ----------
     All calculation lives in SQL (calc_contribution); these just call the
     RPCs. Everything except recordHoldingValuation is adviser-only and is
     refused server-side for anyone else. */
  async function rpc(name, args){
    const { data, error } = await wo(window.teiSupabase).rpc(name, args);
    if(error) throw error;
    return data;
  }
  const contributionRules = {
    preview: (payload)=> rpc('preview_contribution', { p_payload: payload }),
    save: (accountId, payload)=> rpc('save_contribution_rule', { p_account_id: accountId, p_payload: payload }),
    end: (accountId)=> rpc('end_contribution_rule', { p_account_id: accountId }),
    resolveFlag: (flagId, action, grossOverride)=> rpc('resolve_contribution_flag', { p_flag_id: flagId, p_action: action, p_gross_override: grossOverride!=null ? grossOverride : null }),
    reverseRun: (runId, note)=> rpc('reverse_contribution_run', { p_run_id: runId, p_note: note }),
    adjustRun: (runId, allocations, note)=> rpc('adjust_contribution_run', { p_run_id: runId, p_allocations: allocations, p_note: note }),
    setManualPriced: (accountId, value)=> rpc('set_manual_priced', { p_account_id: accountId, p_value: !!value }),
    // Statement valuation: replaces the holding's value (never adds to it)
    // and stamps value_checked_at. Adviser or the client themselves.
    recordHoldingValuation: (holdingId, value, asAt)=> rpc('record_holding_valuation', { p_holding_id: holdingId, p_value: value, p_as_at: asAt }),
    // Re-read one client's rule tables + the affected account/holding rows
    // after an RPC, so the in-memory client matches what the server did.
    reload: async (accountIds)=>{
      const w = wo(window.teiSupabase);
      const contrib = await fetchContributionBundle(w, accountIds);
      const [accRes, holdRes] = await Promise.all([
        accountIds.length ? w.from('accounts').select('id,value,last_updated,contribution,contribution_personal,contribution_sacrifice,is_manual_priced,has_contribution_rule').in('id', accountIds) : Promise.resolve({data:[]}),
        accountIds.length ? w.from('holdings').select('id,account_id,value,cost_basis,price_source,value_checked_at').in('account_id', accountIds) : Promise.resolve({data:[]}),
      ]);
      if(accRes.error) throw accRes.error;
      if(holdRes.error) throw holdRes.error;
      return { contrib: normaliseContrib(contrib), accounts: accRes.data||[], holdings: holdRes.data||[] };
    },
    // Adviser-level list: every pending flag across all clients (RLS lets
    // only an adviser see other clients' rows).
    pendingFlagsAllClients: async ()=>{
      const { data, error } = await wo(window.teiSupabase).from('contribution_flags')
        .select('id, created_at, suggested, account_id, accounts(provider, type, client_id, clients(first_name, last_name))')
        .eq('status', 'pending').order('created_at', {ascending:false});
      if(error) throw error;
      return data || [];
    }
  };

  /* split (optional): {essentials, lifestyle, wealthBuilding} from Cashflow's
     Update this month panel (B8, migration 010). actual_expenses is kept as
     essentials + lifestyle so older readers still see the month's spending. */
  async function saveCashflowMonth(clientId, monthKey, actualIncome, actualExpenses, source, split){
    const row = { client_id: clientId, month_key: monthKey,
      actual_income: actualIncome, actual_expenses: actualExpenses,
      last_edited_by: source || 'adviser', last_edited_at: new Date().toISOString() };
    if(split){
      row.essentials = split.essentials;
      row.lifestyle = split.lifestyle;
      row.wealth_building = split.wealthBuilding;
    }
    const { data, error } = await wo(window.teiSupabase).from('cashflow_months')
      .upsert(row, { onConflict: 'client_id,month_key' }).select().single();
    if(error) throw error;
    return data;
  }

  /* feedback: a fire-and-forget bug-report/feedback note, not a chat thread
     -- plain insert (no upsert/onConflict, there is no natural dedupe key
     like the monthly logs have). Triage happens via updateFeedbackStatus,
     which only ever changes `status`, never the message itself. */
  async function saveFeedback(clientId, area, pageContext, message, source){
    return await insertRow('feedback', {
      client_id: clientId, area: area || null, page_context: pageContext || null,
      message, submitted_by: source || 'client'
    });
  }
  /* ---------- Portfolio Lab saved scenarios (wealth_os.portfolio_scenarios) ----------
     Rows the Lab saves carry meta.version 2: {version, preset, label,
     summary:[lines], scope}; edits holds the moves [{type:'sell'|'buy',
     name, account, amount}]. Rows from the August 2026 Lab have no version
     and are left alone. last_edited_by is 'client' or 'adviser'. */
  function scenarioRowToLocal(r){
    return { id:r.id, name:r.name, moves:r.edits || [], meta:r.meta || {}, createdAt:r.created_at, savedBy:r.last_edited_by || null };
  }
  async function listScenarios(clientId){
    const { data, error } = await wo(window.teiSupabase).from('portfolio_scenarios').select('*').eq('client_id', clientId).order('created_at', {ascending:false});
    if(error) throw error;
    return (data||[]).filter(r=> r.meta && r.meta.version === 2).map(scenarioRowToLocal);
  }
  async function saveScenario(clientId, scenario, savedBy){
    const row = await insertRow('portfolio_scenarios', {
      client_id: clientId, name: scenario.name, edits: scenario.moves,
      meta: Object.assign({}, scenario.meta, {version:2}), last_edited_by: savedBy
    });
    return scenarioRowToLocal(row);
  }
  async function deleteScenario(id){ await deleteRow('portfolio_scenarios', 'id', id); }
  async function updateFeedbackStatus(feedbackId, status, updatedBy){
    return await updateRow('feedback', 'id', feedbackId, {
      status, status_updated_at: new Date().toISOString(), status_updated_by: updatedBy || 'adviser'
    });
  }

  /* ---------- documents: real files in the private client-documents bucket ----------
     Path convention: <client_id>/<timestamp>-<safe filename>, the first folder
     being the client id is what the bucket's SELECT policy keys on. Uploads,
     edits and deletes are adviser-only (RLS + storage policies).
     Word/CSV/Excel files also get a converted, sanitised HTML copy at
     <path>.view.html (prepared by TEI.docView.prepare before upload); it sits
     in the same <client_id>/ folder so the same policies cover it. */
  const DOCS_BUCKET = 'client-documents';
  function docRowToLocal(d){
    return { id:d.id, name:d.name, type:d.type, storagePath:d.storage_path, uploadedAt:d.uploaded_at,
             date: d.uploaded_at, url: d.storage_path || null, format:d.format || null, viewPath:d.view_path || null,
             // Client uploads (migration 012): 'pending' until the coach adds the figures, then 'added'.
             reviewStatus: d.review_status || null, accountId: d.account_id || null };
  }
  function cleanDocPath(path){ return String(path||'').replace(/^\/+/, '').replace(/^client-documents\//, ''); }
  // prepared: { format, viewHtml|null } from TEI.docView.prepare(file).
  /* extra (client uploads, migration 012): {reviewStatus, accountId}. */
  async function uploadDocument(clientId, file, name, type, prepared, extra){
    const safe = String(file.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = clientId + '/' + Date.now() + '-' + safe;
    const format = prepared && prepared.format || null;
    // HTML (the original or a converted copy) is stored as plain text so a
    // signed URL can never render it as a page; it is only ever shown through
    // the sandboxed viewer.
    const isHtml = /\.html?$/i.test(file.name || '') || /html/i.test(file.type || '');
    const bucket = window.teiSupabase.storage.from(DOCS_BUCKET);
    const up = await bucket.upload(path, file, { contentType: isHtml ? 'text/plain;charset=utf-8' : (file.type || 'application/octet-stream'), upsert:false });
    if(up.error) throw up.error;
    const uploaded = [path];
    let viewPath = null;
    try{
      if(prepared && prepared.viewHtml != null){
        viewPath = path + '.view.html';
        const vup = await bucket.upload(viewPath, new Blob([prepared.viewHtml], {type:'text/plain'}), { contentType:'text/plain;charset=utf-8', upsert:false });
        if(vup.error) throw vup.error;
        uploaded.push(viewPath);
      }
      const row = { client_id:clientId, name, type, storage_path:path, format, view_path:viewPath };
      if(extra && extra.reviewStatus) row.review_status = extra.reviewStatus;
      if(extra && extra.accountId) row.account_id = extra.accountId;
      return docRowToLocal(await insertRow('documents', row));
    } catch(err){
      await bucket.remove(uploaded).catch(()=>{});
      throw err;
    }
  }
  /* Client-level settings on the clients row (theme, notification prefs,
     membership tier and start date, migration 011). Only the fields passed
     are written. */
  async function saveClientSettings(clientId, fields){
    return await updateRow('clients','id',clientId, fields);
  }
  /* Set up Wealth OS (B13, migration 013): dependants, state_pension,
     protection, investor_profile and setup_request on the clients row. Only
     the keys passed are written, so nothing else on the row changes. */
  async function saveSetupFields(clientId, fields){
    const row = {};
    ['dependants','state_pension','protection','investor_profile','setup_request','dob','employment_status','relationship_status','risk_profile']
      .forEach(k=>{ if(fields[k] !== undefined) row[k] = fields[k]; });
    if(!Object.keys(row).length) return null;
    row.last_updated = new Date().toISOString();
    return await updateRow('clients','id',clientId, row);
  }
  async function setDocumentReviewStatus(documentId, status){
    return docRowToLocal(await updateRow('documents', 'id', documentId, { review_status: status }));
  }
  async function updateDocument(documentId, fields){
    return docRowToLocal(await updateRow('documents', 'id', documentId, { name:fields.name, type:fields.type }));
  }
  async function deleteDocument(doc){
    await deleteRow('documents', 'id', doc.id); // forecast_state rows go with it (on delete cascade)
    if(doc.storagePath){
      const paths = [doc.storagePath, doc.viewPath].filter(Boolean).map(cleanDocPath);
      const res = await window.teiSupabase.storage.from(DOCS_BUCKET).remove(paths);
      if(res.error) console.warn('Wealth OS: document row deleted but file removal failed', res.error);
    }
  }
  async function downloadDocumentText(path){
    const { data, error } = await window.teiSupabase.storage.from(DOCS_BUCKET).download(cleanDocPath(path));
    if(error) throw error;
    return await data.text();
  }
  async function downloadDocumentBlob(path){
    const { data, error } = await window.teiSupabase.storage.from(DOCS_BUCKET).download(cleanDocPath(path));
    if(error) throw error;
    return data;
  }
  // Short-lived link to the original: downloads it under fileName, or opens
  // it in the browser when fileName is false (PDFs on a phone).
  async function documentSignedUrl(path, fileName){
    const opts = fileName === false ? undefined : { download: fileName || true };
    const { data, error } = await window.teiSupabase.storage.from(DOCS_BUCKET).createSignedUrl(cleanDocPath(path), 120, opts);
    if(error || !data || !data.signedUrl) throw (error || new Error('No URL'));
    return data.signedUrl;
  }

  /* ---------- forecast_state: settings changed inside a forecast document ---------- */
  async function loadForecastState(documentId){
    const { data, error } = await wo(window.teiSupabase).from('forecast_state').select('*').eq('document_id', documentId).maybeSingle();
    if(error) throw error;
    return data;
  }
  async function loadForecastStates(clientId){
    const { data, error } = await wo(window.teiSupabase).from('forecast_state').select('*').eq('client_id', clientId);
    if(error) throw error;
    return data || [];
  }
  async function saveForecastState(documentId, clientId, stamp, stateObj){
    const { error } = await wo(window.teiSupabase).from('forecast_state')
      .upsert({ document_id:documentId, client_id:clientId, stamp, state:stateObj, updated_at:new Date().toISOString() }, { onConflict:'document_id' });
    if(error) throw error;
  }
  async function deleteForecastState(documentId){
    await deleteRow('forecast_state', 'document_id', documentId);
  }

  TEI.wealthOS = {
    loadWealthOSClient, loadClientById, openClientAsAdviser, createClient,
    uploadDocument, updateDocument, deleteDocument, downloadDocumentText, downloadDocumentBlob, documentSignedUrl,
    loadForecastState, loadForecastStates, saveForecastState, deleteForecastState,
    linkHousehold, unlinkHousehold, loadHouseholdSummary,
    showLoadError, hideLoadError, hideBoot, saveSetupFields,
    saveAccount, deleteAccount, saveHolding, deleteHolding, saveGoal, deleteGoal,
    saveIncome, deleteIncome, saveExpense, deleteExpense,
    saveAccountMonth, saveHoldingMonth, saveGoalMonth, saveAccountDeposit, saveCashflowMonth,
    saveWealthAsset, deleteWealthAsset, saveWealthLiability, deleteWealthLiability,
    saveDividendHolding, deleteDividendHolding, saveCashflowSettings, saveDividendHistory, saveMonthlyWins,
    saveClientPersonal, setOnboardingComplete, importHoldingsRows, replaceHoldingsForAccount,
    saveClientSettings, setDocumentReviewStatus,
    saveFeedback, updateFeedbackStatus, fetchLivePrices, contributionRules,
    listScenarios, saveScenario, deleteScenario
  };
})();

