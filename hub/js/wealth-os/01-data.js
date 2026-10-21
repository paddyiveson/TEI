/* TEI Wealth Dashboard v2, Data layer
   No ES modules (house rule), everything hangs off window.TEI.
   State lives in memory only; the source of truth is the client's JSON file.
   Adviser Workspace edits are held in memory + a local staging copy, then
   exported as a replacement JSON file (see adviser/adviser.js), there is no
   backend to write back to. */
window.TEI = window.TEI || {};

(function(){
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function defaultClient(){
    return {
      meta:{ clientId:'', displayName:'New Client', createdAt:new Date().toISOString().slice(0,10), lastUpdated:null,
        /* Client Foundation Builder v1.2, progressive completion. Recomputed by
           TEI.calc.completion(client), not hand-maintained. */
        completion:{ percent:0, missing:[] },
        /* Client Updates feed (Adviser Workspace) shows records edited since
           this timestamp, tagged by who edited them. Advancing it is an
           explicit adviser action ("mark reviewed"), not automatic. */
        lastAdviserReview:null },
      /* --- Client Foundation: PERSONAL --------------------------------------
         Client facts only. riskProfile here is self-reported (used to default
         the self-serve Portfolio Strategy tool + dashboard tone), NOT a
         suitability record. Adviser Workspace holds the regulated risk
         assessment separately once a client becomes a regulated advice client. */
      personal:{
        firstName:'', lastName:'', dob:'', employmentStatus:'', relationshipStatus:'',
        riskProfile:'', email:'', notes:'',
        /* partner is only ever populated/shown when relationshipStatus is
           Partnered/Married, Client Foundation Builder progressive disclosure. */
        partner:{ name:'', employmentStatus:'', incomeSources:[] } // incomeSources:[{id,type,amount,frequency}]
      },
      settings:{ currency:'GBP', onboardingComplete:false },
      accounts:[], months:{}, contribLog:{},
      /* holdingsMonths / goalsMonths, same monthly time-series pattern as
         accounts' `months`, extended per Paddy's request so holdings and
         goals are also trackable month to month, not just accounts.
         Shape: { 'YYYY-MM': { recordId: value } }. For completion-type goals
         (no meaningful numeric value), use goal.statusHistory instead, see
         goals below. */
      holdingsMonths:{}, goalsMonths:{},
      holdings:[], dividendHoldings:[], goals:[],
      /* --- Client Foundation: CASHFLOW ---------------------------------------
         Facts only: what comes in, what goes out, what gets saved/invested.
         Scenario planning knobs (fiMultiple, wealthConversionTarget, etc.) are
         NOT client facts, they live in `preferences` below. */
      cashflow:{
        income:[],                          // [{id, owner:'client'|'partner', type, amount, frequency}]
        expenses:{ fixed:[], variable:[] },  // each: [{id, label, amount}] (£/month)
        saving:{ monthlySavings:0, monthlyInvesting:0 },
        emergencyFund:{ target:0, current:0, accountId:null },
        scenario:'base', bestMult:0.85, worstMult:1.20, oneOffs:[], savingsGoals:[]
      },
      /* --- Client-adjustable settings, not facts and not derived, these are
         stored choices (e.g. the client dragging FI multiple from 25x to 30x). */
      preferences:{ fiMultiple:25, fiOverride:null, wealthConversionTarget:20 },
      monteCarlo:{ conservative:true, base:true, optimistic:false },
      /* --- Client Foundation: WEALTH ------------------------------------------
         Single source of truth for what the client owns/owes. Property is an
         asset (type:'property'), no separate property key, to avoid a second
         source of truth for net worth / composition. */
      wealth:{
        assets:[],       // [{id, type, value, notes}], type: cash|property|investments|pension|business|other
        liabilities:[]   // [{id, type, balance, linkedAssetId}], type: mortgage|loan|credit|other
      },
      documents:[], insights:{ nextBestAction:null, milestones:[] },
      insurance:[], estatePlanning:{},
      /* Wealth OS v3, homepage sections. Each is designed to be filled by an
         automated rule first, with an optional adviser/client override on top.
         See TEI.render.home (js/render-home.js in the real build) for the
         auto-generation logic, these fields only need to be set when a human
         override is wanted. */
      northStar:{ goalLabel:'', status:'', focusOverride:'' },
      coachCorner:{ message:'', actionLabel:'', actionPage:'', mode:'auto', updatedAt:null },
      /* Forecast page's own coaching slot, kept separate from the homepage
         coachCorner so the two never show the same message twice. Same
         auto-first, override-second pattern. */
      forecastCoach:{ message:'', actionLabel:'', actionPage:'', mode:'auto', updatedAt:null },
      /* Cashflow page's own coaching slot, same pattern, own purpose
         (behavioural reinforcement around income → wealth conversion). */
      cashflowCoach:{ message:'', actionLabel:'', actionPage:'', mode:'auto', updatedAt:null },
      /* Portfolio page's own coaching slot, did not exist before; added per
         Operating Model Refinement. Same auto-first, override-second pattern. */
      portfolioCoach:{ message:'', actionLabel:'', actionPage:'', mode:'auto', updatedAt:null },
      weeklyFocus:[], // [{id, label, done, source:'manual'|'auto', linkPage}]
      monthlyWins:[], // [{id, label, source:'adviser'|'client', month}]
      journeyOverrides:{}, // {stageId:{complete:true, source:'adviser'|'client'}}
      /* Wealth page (page-progress), same auto-first, override-second pattern. */
      wealthInsights:{ items:[], mode:'auto' }, // items:[string,...], adviser override list replaces the auto-generated one
      wealthNextSteps:[], // [{id, label, source:'manual'|'auto'}], independent from homepage's weeklyFocus
      /* Portfolio page. dividendHistory is adviser-entered actuals, required for
         the historical dividend chart and growth-rate stat. investorStage is the
         same auto-suggest + override pattern as northStar/coachCorner. */
      dividendHistory:[], // [{year:number, amount:number}]
      investorStage:{ override:null } // override: 'starting'|'building'|'confident'|null (null = use auto-suggestion)
    };
  }

  function mergeDefaults(loaded){
    const d = defaultClient();
    const merged = Object.assign({}, d, loaded||{});
    ['meta','settings','preferences'].forEach(k=>{ merged[k] = Object.assign({}, d[k], (loaded||{})[k]||{}); });
    merged.meta.completion = Object.assign({percent:0, missing:[]}, (loaded && loaded.meta && loaded.meta.completion) || {});
    // Same Object.assign-copies-a-present-but-undefined-key trap as
    // cashflow below -- adaptClientBundle always builds preferences as a
    // literal object ({fiMultiple: cf.fi_multiple, ...}), so for a client
    // with no cashflow_settings row yet, loaded.preferences.fiMultiple is
    // an explicit `undefined` that clobbers d.preferences' default instead
    // of being skipped. fiOverride is deliberately left alone -- null there
    // is a meaningful "no override" state, not a missing default.
    merged.preferences.fiMultiple = merged.preferences.fiMultiple != null ? merged.preferences.fiMultiple : d.preferences.fiMultiple;
    merged.preferences.wealthConversionTarget = merged.preferences.wealthConversionTarget != null ? merged.preferences.wealthConversionTarget : d.preferences.wealthConversionTarget;

    merged.personal = Object.assign({}, d.personal, (loaded||{}).personal||{});
    merged.personal.partner = Object.assign({name:'', employmentStatus:'', incomeSources:[]}, (loaded && loaded.personal && loaded.personal.partner) || {});
    merged.personal.partner.incomeSources = Array.isArray(merged.personal.partner.incomeSources) ? merged.personal.partner.incomeSources : [];

    merged.cashflow = Object.assign({}, d.cashflow, (loaded||{}).cashflow||{});
    merged.cashflow.income = Array.isArray((loaded && loaded.cashflow && loaded.cashflow.income)) ? loaded.cashflow.income : [];
    merged.cashflow.expenses = Object.assign({fixed:[], variable:[]}, (loaded && loaded.cashflow && loaded.cashflow.expenses) || {});
    merged.cashflow.expenses.fixed = Array.isArray(merged.cashflow.expenses.fixed) ? merged.cashflow.expenses.fixed : [];
    merged.cashflow.expenses.variable = Array.isArray(merged.cashflow.expenses.variable) ? merged.cashflow.expenses.variable : [];
    merged.cashflow.saving = Object.assign({monthlySavings:0, monthlyInvesting:0}, (loaded && loaded.cashflow && loaded.cashflow.saving) || {});
    merged.cashflow.emergencyFund = Object.assign({target:0,current:0,accountId:null}, (loaded && loaded.cashflow && loaded.cashflow.emergencyFund) || {});
    // adaptClientBundle always sets these keys on loaded.cashflow (as
    // `undefined` when the client has no cashflow_settings row yet, e.g.
    // brand-new onboarding) -- the Object.assign above copies a present-but-
    // undefined key over d.cashflow's default rather than skipping it, so
    // each needs its own null-coalesce back to the default here, same as
    // saving/emergencyFund above. Left unfixed, `scenario` in particular
    // reached saveCashflowSettings() as `null`, which the DB's NOT NULL
    // constraint on cashflow_settings.scenario rejects -- surfacing as the
    // onboarding wizard being stuck unable to leave Step 2.
    merged.cashflow.scenario = merged.cashflow.scenario != null ? merged.cashflow.scenario : d.cashflow.scenario;
    merged.cashflow.bestMult = merged.cashflow.bestMult != null ? merged.cashflow.bestMult : d.cashflow.bestMult;
    merged.cashflow.worstMult = merged.cashflow.worstMult != null ? merged.cashflow.worstMult : d.cashflow.worstMult;
    merged.cashflow.oneOffs = Array.isArray(merged.cashflow.oneOffs) ? merged.cashflow.oneOffs : d.cashflow.oneOffs;
    merged.cashflow.savingsGoals = Array.isArray(merged.cashflow.savingsGoals) ? merged.cashflow.savingsGoals : d.cashflow.savingsGoals;

    merged.monteCarlo = Object.assign({conservative:true,base:true,optimistic:false}, (loaded||{}).monteCarlo||{});
    merged.wealth = Object.assign({assets:[], liabilities:[]}, (loaded||{}).wealth||{});
    merged.wealth.assets = Array.isArray(merged.wealth.assets) ? merged.wealth.assets : [];
    merged.wealth.liabilities = Array.isArray(merged.wealth.liabilities) ? merged.wealth.liabilities : [];
    merged.insights = Object.assign({nextBestAction:null, milestones:[]}, (loaded||{}).insights||{});
    ['accounts','holdings','dividendHoldings','goals','documents','insurance','feedback'].forEach(k=>{
      merged[k] = Array.isArray((loaded||{})[k]) ? loaded[k] : [];
    });
    merged.months = (loaded && loaded.months) || {};
    merged.contribLog = (loaded && loaded.contribLog) || {};
    merged.holdingsMonths = (loaded && loaded.holdingsMonths) || {};
    merged.goalsMonths = (loaded && loaded.goalsMonths) || {};
    merged.cashflowMonths = (loaded && loaded.cashflowMonths) || {};
    merged.estatePlanning = (loaded && loaded.estatePlanning) || {};
    merged.northStar = Object.assign({goalLabel:'', status:'', focusOverride:''}, (loaded||{}).northStar||{});
    merged.coachCorner = Object.assign({message:'', actionLabel:'', actionPage:'', mode:'auto', updatedAt:null}, (loaded||{}).coachCorner||{});
    merged.forecastCoach = Object.assign({message:'', actionLabel:'', actionPage:'', mode:'auto', updatedAt:null}, (loaded||{}).forecastCoach||{});
    merged.cashflowCoach = Object.assign({message:'', actionLabel:'', actionPage:'', mode:'auto', updatedAt:null}, (loaded||{}).cashflowCoach||{});
    merged.portfolioCoach = Object.assign({message:'', actionLabel:'', actionPage:'', mode:'auto', updatedAt:null}, (loaded||{}).portfolioCoach||{});
    merged.weeklyFocus = Array.isArray((loaded||{}).weeklyFocus) ? loaded.weeklyFocus : [];
    merged.monthlyWins = Array.isArray((loaded||{}).monthlyWins) ? loaded.monthlyWins : [];
    merged.journeyOverrides = (loaded && loaded.journeyOverrides) || {};
    merged.wealthInsights = Object.assign({items:[], mode:'auto'}, (loaded||{}).wealthInsights||{});
    merged.wealthNextSteps = Array.isArray((loaded||{}).wealthNextSteps) ? loaded.wealthNextSteps : [];
    merged.dividendHistory = Array.isArray((loaded||{}).dividendHistory) ? loaded.dividendHistory : [];
    merged.investorStage = Object.assign({override:null}, (loaded||{}).investorStage||{});
    // Reconcile any account that has holdings logged so its value is the sum
    // of those holdings, not whatever manual figure was last saved -- this
    // covers freshly loaded data (demo client, an uploaded client file), not
    // just live edits made after this feature existed. See
    // syncAccountValueFromHoldings for why holdings always win.
    merged.accounts.forEach(a=> syncAccountValueFromHoldings(merged, a.id));
    // Emergency fund "current" is derived from its linked account -- same
    // reasoning as the holdings sync above: a hand-typed figure could drift
    // from the real balance shown everywhere else (Accounts, Portfolio, Home).
    // No linked account (not yet chosen, or the linked one was since deleted)
    // leaves current at 0 rather than trusting a stale manual figure.
    const efAcc = merged.accounts.find(a=> a.id === merged.cashflow.emergencyFund.accountId);
    merged.cashflow.emergencyFund.current = efAcc ? (Number(efAcc.value)||0) : 0;
    return merged;
  }

  /* Phase 1: no fetch of a JSON client file, the blank-template data is
     embedded directly. The real client data now comes from Supabase via
     TEI.wealthOS.loadWealthOSClient() (see the wealthos script block below),
     which builds a "loaded"-shaped object and runs it through mergeDefaults
     the same way this function does. getEmbeddedClient/BLANK_TEMPLATE stay
     here only as the fallback used before that fetch resolves. */
  const BLANK_TEMPLATE = {
    meta:{ clientId:'preview-client', displayName:'New Client', createdAt:'2026-07-27', lastUpdated:null,
      completion:{ percent:0, missing:[] } },
    personal:{
      firstName:'', lastName:'', dob:'', employmentStatus:'', relationshipStatus:'',
      riskProfile:'', email:'', notes:'',
      partner:{ name:'', employmentStatus:'', incomeSources:[] }
    },
    settings:{ currency:'GBP', onboardingComplete:false },
    accounts:[], months:{}, contribLog:{},
    holdings:[], dividendHoldings:[], goals:[],
    cashflow:{
      income:[], expenses:{ fixed:[], variable:[] }, saving:{ monthlySavings:0, monthlyInvesting:0 },
      scenario:'base', bestMult:0.85, worstMult:1.20, oneOffs:[], savingsGoals:[], emergencyFund:{target:0,current:0,accountId:null}
    },
    preferences:{ fiMultiple:25, fiOverride:null, wealthConversionTarget:20 },
    monteCarlo:{ conservative:true, base:true, optimistic:false },
    wealth:{ assets:[], liabilities:[] },
    documents:[], insights:{ nextBestAction:null, milestones:[] },
    insurance:[], estatePlanning:{}
  };
  function getEmbeddedClient(){ return mergeDefaults(JSON.parse(JSON.stringify(BLANK_TEMPLATE))); }

  function fmtGBP(v){ return '£' + Number(v||0).toLocaleString('en-GB', {maximumFractionDigits:0}); }
  function uid(){ return String(Date.now()) + Math.floor(Math.random()*1000); }
  /* Goal target-date fields are <input type="month">, which gives "YYYY-MM"
     -- but goals.target_date is a Postgres `date` column that rejects a
     bare year-month ("invalid input syntax for type date"), which is what
     surfaced to users as an add-goal failure. Day-of-month is never shown
     or used, so "-01" is just to satisfy the column type. */
  function monthInputToDate(monthValue){ return monthValue ? monthValue + '-01' : null; }
  /* uid() strings (timestamp+random digits) and real Postgres/Supabase UUIDs
     are never confusable formats -- used wherever code needs to tell "this
     record already exists in Supabase" from "this is still local-only"
     without tracking a separate saved/unsaved flag that would not survive a
     page reload. */
  function isRealId(id){ return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id); }
  /* Shared account display label, nickname is optional everywhere it is
     captured, so every dropdown/checkbox/list that references an account by
     name needs the same fallback (provider + type, or just type), otherwise
     accounts without a nickname show up blank or indistinguishable in some
     surfaces and correctly in others. */
  /* Account display name is always derived, never manually entered, the
     accounts table has no "name" column (see accountToRow's comment).
     Acronyms read fine uppercased as-is (ISA, GIA); words read as words --
     ACCT_TYPE_WORD only needs an entry where that is not true, e.g. a
     compound code like cash_isa which would otherwise show as "CASH_ISA". */
  const ACCT_TYPE_WORD = {cash_isa:'Cash ISA', lisa:'S&S LISA', cash_lisa:'Cash LISA', pension:'Pension', cash:'Cash', crypto:'Crypto', other:'Other'};
  function acctTypeWord(type){ return ACCT_TYPE_WORD[type] || String(type||'').toUpperCase(); }
  function acctLabel(a){ return a.provider ? a.provider+' '+acctTypeWord(a.type) : acctTypeWord(a.type); }
  /* Goal categories as clients read them. "Financial Independence" is shown
     as "Freedom fund" (Paddy, 20 Oct 2026) so it is not confused with
     Forecast's FI number; the stored value is unchanged, so the live site
     keeps working on the same records. */
  const GOAL_TYPE_WORD = {'Financial Independence':'Freedom fund'};
  function goalTypeLabel(t){ return GOAL_TYPE_WORD[t] || t || ''; }
  function monthLabel(key){ const [y,m] = key.split('-').map(Number); return MONTH_ABBR[m-1] + " '" + String(y).slice(2); }
  function currentMonthKey(){ const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); }
  function monthsBetweenInclusive(fromKey, toKey){
    const [fy,fm]=fromKey.split('-').map(Number), [ty,tm]=toKey.split('-').map(Number);
    return (ty-fy)*12+(tm-fm)+1;
  }

  /* ---------- calc engine (ported from v1, operates on a client object) ---------- */
  function accountTotal(client, entry){ return client.accounts.reduce((s,a)=> s + (Number(entry[a.id])||0), 0); }

  /* ---------- Holdings-derived account values ----------
     When an account has individual holdings logged, the account's value is
     derived by summing those holdings (plus any manually-tracked cash
     balance sitting alongside them, e.g. contributions not yet invested,
     dividends not yet reinvested -- see acc.cashBalance) rather than
     trusting a separately maintained manual balance -- so the two numbers
     can never silently disagree or double-count the same money. Manual
     entry remains the source of truth only for accounts with no holdings
     logged at all. syncAccountValueFromHoldings must be called after any
     holdings mutation (add/edit/delete/import) so the current month's
     balance -- and every net worth figure downstream of it -- stays in
     step immediately. Without a cash balance figure, an account's true
     value silently understates itself by however much of its
     contributions have not been put into a priced holding yet -- which
     also throws off the deposits-based Investment return (see
     depositsReturn()), since it reads as a loss rather than uninvested
     cash. */
  function accountHasHoldings(client, accountId){
    return client.holdings.some(h=>h.accountId===accountId);
  }
  function holdingsTotalForAccount(client, accountId){
    return client.holdings.filter(h=>h.accountId===accountId).reduce((s,h)=>s+(Number(h.value)||0),0);
  }
  function syncAccountValueFromHoldings(client, accountId){
    if(!accountHasHoldings(client, accountId)) return; // no holdings left -- leave the last value as an editable manual balance
    const acc = client.accounts.find(a=>a.id===accountId);
    const total = holdingsTotalForAccount(client, accountId) + (acc && Number(acc.cashBalance)||0);
    seedMonthlyValue(client.months, currentMonthKey(), accountId, total);
    if(acc) acc.value = total; // keep the account's own display value (used in list rows) in step too
  }

  /* Crypto has no live price feed, so a crypto account's value only ever
     moves when a holding is manually added/edited/removed -- "last updated"
     is stamped explicitly at those user-initiated call sites (not inside
     syncAccountValueFromHoldings itself, which also runs on every load via
     mergeDefaults to recompute the current month from holdings -- stamping
     there would show today's date on every page view, not just on an
     actual edit). No-op for any other account type. */
  function stampCryptoAccountUpdated(client, accountId){
    const acc = client.accounts.find(a=>a.id===accountId);
    if(acc && acc.type === 'crypto') acc.lastUpdated = new Date().toISOString().slice(0,10);
    return acc;
  }

  /* ---------- Cash ISA / Current-Deposit interest accrual ----------
     Cash-flavoured accounts (type 'cash' or 'cash_isa') can carry an
     interest_rate (annual %, AER). Interest is recomputed fresh every time
     the client bundle loads, monthly-compounded from the account's own
     lastUpdated date (the date its value was last confirmed/saved) up to
     today -- nothing is written back to the database by this function, the
     same "recompute in-memory, persist only on an explicit save" pattern
     syncAccountValueFromHoldings and live price refresh already use. That
     makes it safe to run on every load: it is a pure function of the saved
     value/date/rate, so it can never double-credit or drift, and the
     baseline only moves forward when the account is next explicitly saved
     (editing it, or logging a monthly balance) -- at which point the
     accrued value becomes the new starting point.
     Fixed-rate accounts stop accruing once maturityDate has passed --
     interestAccruedToDate/value are computed as of the maturity date, and
     acc.matured is set so the UI can prompt for a rate review, rather than
     silently assuming an indefinite rollover at the old rate. */
  function accrueCashInterest(client, accountId){
    const acc = client.accounts.find(a=>a.id===accountId);
    if(!acc) return;
    if(acc.type !== 'cash' && acc.type !== 'cash_isa' && acc.type !== 'cash_lisa') return;
    if(accountHasHoldings(client, accountId)) return; // priced holdings drive value instead
    const rate = Number(acc.interestRate);
    if(!rate || !acc.lastUpdated) return;
    const baseDate = new Date(acc.lastUpdated);
    if(isNaN(baseDate.getTime())) return;
    const today = new Date();
    let asOf = today;
    acc.matured = false;
    if(acc.rateType === 'fixed' && acc.maturityDate){
      const maturity = new Date(acc.maturityDate);
      if(!isNaN(maturity.getTime()) && maturity < today){ asOf = maturity; acc.matured = true; }
    }
    const wholeMonths = (asOf.getFullYear()-baseDate.getFullYear())*12 + (asOf.getMonth()-baseDate.getMonth()) - (asOf.getDate() < baseDate.getDate() ? 1 : 0);
    if(wholeMonths <= 0) return; // nothing has compounded yet
    const grown = acc.value * Math.pow(1 + (rate/100)/12, wholeMonths);
    const interestEarned = grown - acc.value;
    acc.interestAccruedToDate = (Number(acc.interestAccruedToDate)||0) + interestEarned;
    acc.value = grown;
    seedMonthlyValue(client.months, currentMonthKey(), accountId, grown);
  }

  /* Entries are sparse -- a month only has a value for an account if someone
     actually logged it that month. Carry each account's last known value
     forward across later months so a gap (e.g. skipped a month, or another
     account was updated but this one was not) reads as "unchanged since last
     update" rather than silently dropping to zero. Months before an
     account's first-ever entry correctly stay at 0 -- it did not exist yet. */
  function buildMergedMonths(client){
    const sortedKeys = Object.keys(client.months||{}).sort();
    const months = {};
    const carried = {};
    sortedKeys.forEach(key=>{
      const entry = client.months[key] || {};
      Object.keys(entry).forEach(id=>{ carried[id] = entry[id]; });
      months[key] = Object.assign({}, carried);
      months[key].total = accountTotal(client, months[key]);
    });
    return months;
  }
  function buildUnifiedTotals(months){ const u={}; Object.entries(months).forEach(([k,e])=>{ u[k]=e.total; }); return u; }
  function latestBreakdown(months){ const keys=Object.keys(months).sort(); const key=keys[keys.length-1]; return key ? months[key] : {}; }

  /* Single source of truth for "is this net worth change noteworthy" --
     month-over-month change plus whether the latest figure is an all-time
     high. Previously computed independently in three places (Home's Coach's
     Corner signal, Home's Hero/North Star monthlySummary, and this exact
     shape) with a real risk of the three disagreeing. Callers add their own
     page-specific fields (contributions, 12-month change, CAGR, etc.) on
     top of this rather than recomputing latestKey/prevKey/isHighest themselves. */
  function computeNetWorthFact(client){
    const months = buildMergedMonths(client);
    const keys = Object.keys(months).sort();
    const monthCount = keys.length;
    if(!monthCount) return {monthCount:0, latestKey:null, prevKey:null, latestVal:null, prevVal:null, netWorthChange:null, isHighest:false};
    const latestKey = keys[keys.length-1];
    const prevKey = monthCount>1 ? keys[keys.length-2] : null;
    const latestVal = months[latestKey].total;
    const prevVal = prevKey ? months[prevKey].total : null;
    // Balances of accounts newly added this month are not growth -- see
    // joinedByMonth. joinedThisMonth lets callers mention them separately.
    const joined = joinedByMonth(client, months);
    const joinedThisMonth = joined[latestKey] || 0;
    const netWorthChange = prevVal!=null ? latestVal-prevVal-joinedThisMonth : null;
    const highest = Math.max(...keys.map(k=>months[k].total));
    const isHighest = latestVal >= highest;
    return {monthCount, latestKey, prevKey, latestVal, prevVal, netWorthChange, joinedThisMonth, isHighest};
  }
  /* Year-to-date change: latest logged total vs. the first logged total of
     that same calendar year (not necessarily January -- if the client's
     first-ever entry was mid-year, that is the YTD baseline). Wealth assets/
     liabilities (property etc.) have no month-by-month history of their own,
     so they're left out here and cancel out of any headline-total comparison
     that assumes they've been flat since the baseline month -- this is the
     one source of truth for "this year" figures (Home hero + Wealth Overview
     pill), so they can no longer disagree the way netWorthChange/monthChange
     briefly did when Home mislabelled a month-over-month figure as YTD. */
  function computeYtdFact(client){
    const months = buildMergedMonths(client);
    const keys = Object.keys(months).sort();
    if(!keys.length) return {latestKey:null, yearStartKey:null, ytdChange:null, hasFullYear:false};
    const latestKey = keys[keys.length-1];
    const yearPrefix = String(new Date(latestKey+'-01').getFullYear());
    const yearKeys = keys.filter(k=>k.startsWith(yearPrefix));
    const hasFullYear = yearKeys.length > 1;
    const yearStartKey = yearKeys.length ? yearKeys[0] : latestKey;
    const joined = joinedByMonth(client, months);
    const ytdChange = hasFullYear ? netChange(buildUnifiedTotals(months), joined, yearStartKey, latestKey) : null;
    return {latestKey, yearStartKey, ytdChange, hasFullYear};
  }
  function latestNetWorth(client){
    const months = buildMergedMonths(client);
    const keys = Object.keys(months).sort();
    if(keys.length) return months[keys[keys.length-1]].total;
    return client.accounts.reduce((s,a)=>s+(Number(a.value)||0),0);
  }
  /* Money-weighted annual return over the last 12 months of history, so
     deposits (and accounts added mid-history) are not mistaken for growth --
     the projection adds contributions separately on top. Falls back to the
     8% default until there is a year of history -- a month or two
     extrapolated to a yearly rate (clamped at 60%) was driving projections
     for newly onboarded clients. */
  function trailingReturnPct(client, months){
    months = months || buildMergedMonths(client);
    const series = buildUnifiedTotals(months);
    const keys = Object.keys(series).sort();
    const last13 = keys.slice(-13);
    if(last13.length < 2) return 8;
    const fromKey = last13[0], toKey = last13[last13.length-1];
    if(monthsBetween(fromKey, toKey) < MIN_ANNUALISED_MONTHS) return 8;
    const r = moneyWeightedReturn(series, moneyInByMonth(client, months), fromKey, toKey);
    if(!r || r.annualPct == null) return 8;
    return Math.max(-50, Math.min(60, r.annualPct));
  }
  function acctContribTotal(acc){
    return acc.type==='pension' ? (Number(acc.contributionPersonal)||0)+(Number(acc.contributionSacrifice)||0) : (Number(acc.contribution)||0);
  }
  function totalMonthlyContribution(client){ return client.accounts.reduce((s,a)=>s+acctContribTotal(a),0); }

  /* ---------- Pension accessibility ----------
     A workplace/personal pension cannot be drawn before the Normal Minimum
     Pension Age (57 from April 2028 under current legislation). If someone's
     unrestricted-money FI date falls before they reach that age, the pension
     pot is not actually available to fund it, so it should not count toward
     the number, even though it is still growing for later. Configurable via
     client.preferences.pensionAccessAge for cases where a client already has
     a protected lower access age. */
  function pensionAccessAge(client){
    const p = (client.preferences||{}).pensionAccessAge;
    return p!=null ? Number(p) : 57;
  }
  function ageInYear(client, year){
    const dob = (client.personal||{}).dob;
    if(!dob) return null;
    const birthYear = new Date(dob).getFullYear();
    if(isNaN(birthYear)) return null;
    return year - birthYear;
  }
  function latestNonPensionNetWorth(client){
    // Per-account fallback to a.value (same idiom as goalProgress below) --
    // unlike latestNetWorth's all-or-nothing fallback, this matters here
    // because a client can have monthly history for some accounts but not
    // a brand-new one added since the last snapshot; without this an
    // un-snapshotted account silently contributed £0 instead of its entered
    // value, which could badly understate non-pension wealth in the pension-
    // exclusion path of the FI Dashboard.
    const b = latestBreakdown(buildMergedMonths(client));
    return client.accounts.filter(a=>a.type!=='pension').reduce((s,a)=> s + (b[a.id]!=null ? Number(b[a.id])||0 : (Number(a.value)||0)), 0);
  }
  function nonPensionMonthlyContribution(client){
    return client.accounts.filter(a=>a.type!=='pension').reduce((s,a)=>s+acctContribTotal(a),0);
  }

  /* ---------- Actual saving/investing, measured against take-home pay ----------
     Distinct from acctContribTotal/totalMonthlyContribution above, which are
     used for wealth-accumulation projections (FI year, net worth growth) and
     rightly include pension salary sacrifice, since that money is genuinely
     accumulating wealth regardless of how it arrived in the pension.
     These two functions instead measure saving/investing as a share of take-
     home pay, so salary sacrifice must be excluded, it is deducted before
     salary becomes take-home pay, so it was never part of the income figure
     these rates are divided by. Personal (post-tax) pension contributions DO
     leave take-home pay, so they count the same as any ISA/GIA contribution.
     This is the single source of truth for "actual" saving/investing figures
     across Cashflow, the wealth conversion rate, the cashflow health rate,
     and disposable income should all agree because they all call this. */
  const INVESTMENT_ACCOUNT_TYPES = ['isa','gia','lisa','pension','crypto'];
  function actualInvestmentMonthlyContribution(client){
    return client.accounts.filter(a=>INVESTMENT_ACCOUNT_TYPES.includes(a.type)).reduce((s,a)=>{
      if(a.type==='pension') return s + (Number(a.contributionPersonal)||0);
      return s + (Number(a.contribution)||0);
    }, 0);
  }
  function actualCashMonthlyContribution(client){
    // Account-derived only, no fallback to the stated "Monthly savings"
    // figure. That fallback used to substitute the self-reported figure
    // whenever no cash account had a contribution logged, on the assumption
    // it must represent saving happening somewhere untracked. In practice
    // there was no way to tell that apart from a client who was already
    // being counted via their ISA/pension contribution fields, so the stated
    // figure would get added a second time, see the 2026-08-10 nudge
    // review, which caught this doubling a genuine surplus into a fabricated
    // deficit. A client saving into a bank account they've never logged in
    // Wealth OS now shows £0 for that portion instead of a guess; the fix is
    // to log a cash account, not to infer one from a Cashflow-page total
    // that may or may not already be captured elsewhere.
    return client.accounts.filter(a=>a.type==='cash'||a.type==='cash_isa'||a.type==='cash_lisa').reduce((s,a)=>s+acctContribTotal(a),0);
  }
  function actualTotalSavingInvesting(client){
    return actualInvestmentMonthlyContribution(client) + actualCashMonthlyContribution(client);
  }

  /* ---------- Client Foundation derived helpers ----------
     The client object stores facts only (income sources, expense lines, assets,
     liabilities). Anything that requires arithmetic across those facts lives
     here, generated on demand, never stored back onto the client object. */

  function toMonthlyAmount(amount, frequency){
    const a = Number(amount)||0;
    switch(frequency){
      case 'annual':
      case 'yearly': return a/12;
      case 'weekly': return a*52/12;
      case 'fourweekly': return a*13/12;
      case 'monthly':
      default: return a;
    }
  }
  function totalMonthlyIncome(client){
    return (client.cashflow.income||[]).reduce((s,i)=> s + toMonthlyAmount(i.amount, i.frequency), 0);
  }
  function totalFixedExpenses(client){
    return (client.cashflow.expenses.fixed||[]).reduce((s,e)=> s + (Number(e.amount)||0), 0);
  }
  function totalVariableExpenses(client){
    return (client.cashflow.expenses.variable||[]).reduce((s,e)=> s + (Number(e.amount)||0), 0);
  }

  /* netWorth = account balances (from the existing months/contribLog time series)
     + other declared assets (wealth.assets, which now includes property)
    , liabilities (wealth.liabilities). latestNetWorth() above covers accounts
     only and stays as-is for the balance-history chart; this is the whole-of-
     wealth figure used for Wealth Foundation / dashboard net worth. */
  function netWorth(client){
    const accountsTotal = latestNetWorth(client);
    const otherAssetsTotal = (client.wealth.assets||[]).reduce((s,a)=> s + (Number(a.value)||0), 0);
    const liabilitiesTotal = (client.wealth.liabilities||[]).reduce((s,l)=> s + (Number(l.balance)||0), 0);
    return accountsTotal + otherAssetsTotal - liabilitiesTotal;
  }

  /* Household rollup = each member's own netWorth/income/expenditure,
     summed. Every member's accounts/income/expenses are still just that
     member's own flat client_id-scoped rows (see loadHouseholdSummary) --
     this is purely an additive total across bundles, not a merge, so
     nothing here can double-count a figure that only exists under one
     member's client_id. Joint items (Phase B) also live under exactly one
     member's client_id, so summing every member's own total already
     counts a joint item exactly once. */
  function householdTotals(bundles){
    return (bundles||[]).reduce((t, b)=>({
      netWorth: t.netWorth + netWorth(b),
      monthlyIncome: t.monthlyIncome + totalMonthlyIncome(b),
      monthlyExpenditure: t.monthlyExpenditure + totalFixedExpenses(b) + totalVariableExpenses(b)
    }), {netWorth:0, monthlyIncome:0, monthlyExpenditure:0});
  }

  /* goalProgress, one function, three progress models, matching goal.progressType.
     Returns {pct, current, target, isComplete}. pct is always 0-100. */
  function goalProgress(client, goal){
    if(goal.progressType === 'completion'){
      return {pct: goal.completed ? 100 : 0, current:null, target:null, isComplete: !!goal.completed};
    }
    if(goal.progressType === 'income'){
      // Household total by default, or, if linkedIncomeId is set (e.g. a
      // "Build a Business" goal tracking one Self-Employed/Business Venture
      // Income entry), just that one income stream. Falls back to the
      // household total if the linked entry has since been removed.
      const linked = goal.linkedIncomeId && (client.cashflow.income||[]).find(i=>i.id===goal.linkedIncomeId);
      const currentAnnualIncome = linked ? toMonthlyAmount(linked.amount, linked.frequency)*12 : totalMonthlyIncome(client)*12;
      const target = Number(goal.targetIncome)||0;
      const pct = target > 0 ? Math.min(100, (currentAnnualIncome/target)*100) : 0;
      return {pct, current:currentAnnualIncome, target, isComplete: target>0 && currentAnnualIncome>=target};
    }
    // monetary (default), sums current value of every linked account
    const months = buildMergedMonths(client);
    const b = latestBreakdown(months);
    const linkedTotal = (goal.linkedAccountIds||[]).reduce((s,accId)=>{
      const acc = client.accounts.find(a=>a.id===accId);
      if(!acc) return s;
      const current = b[accId] != null ? Number(b[accId])||0 : (Number(acc.value)||0);
      return s + current;
    }, 0);
    const target = Number(goal.targetAmount)||0;
    const pct = target > 0 ? Math.min(100, (linkedTotal/target)*100) : 0;
    return {pct, current:linkedTotal, target, isComplete: target>0 && linkedTotal>=target};
  }

  /* Keeps "monetary"/"income" goals' completion in step with their own
     progress, in both directions:
     - completes an active goal once its progress reaches target (a
       savings goal whose linked accounts now cover targetAmount, or an
       income goal like "Scale Business" whose tracked income clears
       targetIncome) -- goalProgress's own isComplete flag decides this,
       so a goal completes exactly when its progress bar would read 100%,
       no separate threshold to keep in sync.
     - reopens a goal the SYSTEM completed if its progress has since
       dropped back below target (a linked account balance falling, an
       income drop, ...) -- but only one the system completed. A goal a
       person explicitly marked complete (the Mark complete button) stays
       complete regardless of what the linked numbers do afterwards --
       that was a deliberate human call, not a threshold, and a dip
       should not silently overrule it. Told apart by checking whether the
       goal's own most recent statusHistory entry is a source:'auto'
       completion; a manual Mark complete never sets that.
     completion-type goals are untouched either way: those are an
     inherently manual "did this happen" call, not something a number
     crosses.
     Called wherever a number that could move a goal across its target
     gets saved (income, accounts, monthly balances, live prices) so this
     is immediate -- see e.g. addAdvIncome -- and also on every Goals page
     render, as a backstop for anything edited elsewhere in the session.
     Returns {completed, reopened}, the goals just moved each way, for a
     caller to toast. */
  async function checkGoalAutoComplete(client){
    const completed = [], reopened = [];
    for(const g of (client.goals||[])){
      if(g.progressType === 'completion') continue;
      const isComplete = goalProgress(client, g).isComplete;
      const history = g.statusHistory||[];
      const lastEntry = history[history.length-1];
      const wasAutoCompleted = g.status==='completed' && lastEntry && lastEntry.status==='completed' && lastEntry.source==='auto';
      let nextStatus = null;
      if(g.status !== 'completed' && isComplete) nextStatus = 'completed';
      else if(wasAutoCompleted && !isComplete) nextStatus = 'active';
      if(!nextStatus) continue;
      const nextHistory = history.concat([{date:new Date().toISOString(), status:nextStatus, source:'auto'}]);
      const merged = Object.assign({}, g, {status:nextStatus, statusHistory:nextHistory});
      stampEdit(merged, 'system');
      try{
        await TEI.wealthOS.saveGoal(client.meta.clientId, g.id, merged);
        Object.assign(g, merged);
        (nextStatus==='completed' ? completed : reopened).push(g);
      } catch(err){
        console.error('Wealth OS: failed to auto-update goal status', g.id, err);
      }
    }
    return {completed, reopened};
  }

  /* completion, progressive completion tracker for the Client Foundation.
     Deliberately loose ("has at least one entry") rather than exhaustive field
     checks, matches the spec's "do not block, just flag what's missing." */
  function completion(client){
    const checks = [
      {id:'profile',   section:'Client Profile',      label:'Add your name and basic details', done: !!(client.personal.firstName && client.personal.lastName)},
      {id:'cashflow',  section:'Cashflow Foundation',  label:'Add your income',                 done: (client.cashflow.income||[]).length > 0},
      {id:'wealth',    section:'Wealth Foundation',    label:'Add what you own',                done: (client.wealth.assets||[]).length > 0 || client.accounts.length > 0},
      {id:'accounts',  section:'Investment Accounts',  label:'Add an account',                  done: client.accounts.length > 0},
      {id:'holdings',  section:'Holdings',             label:'Add investment holdings',         done: client.holdings.length > 0},
      {id:'goals',     section:'Goals',                label:'Set a goal',                      done: (client.goals||[]).length > 0},
      {id:'documents', section:'Documents',            label:'Add a document',                  done: (client.documents||[]).length > 0}
    ];
    const doneCount = checks.filter(c=>c.done).length;
    const percent = Math.round((doneCount/checks.length)*100);
    const missing = checks.filter(c=>!c.done).map(c=>({id:c.id, label:c.label, section:c.section}));
    // 'profile' is pre-filled by the adviser at client creation (create-user.mjs /
    // the client-list "add client" flow), so it is done before a client has entered
    // a single number of their own. hasRealData looks past it, so callers can tell
    // "has not started" apart from "clicked through the wizard's non-blocking Finish
    // without adding anything" -- both currently read as onboardingComplete:true.
    const hasRealData = checks.some(c=>c.id!=='profile' && c.done);
    return {percent, missing, hasRealData};
  }

  /* ---------- Client Foundation: edit source-tagging & monthly history ----------
     Deliberately simple: this is a static site with one shared client object and
     no auth, so "who made this edit" can only ever be a tag written by whichever
     UI surface performed the edit (onboarding/Settings stamp 'client', Adviser
     Workspace stamps 'adviser'), not an enforced permission. See stampEdit(). */
  function stampEdit(record, source){
    if(!record) return record;
    record.lastEditedBy = source;
    record.lastEditedAt = new Date().toISOString();
    return record;
  }
  function seedMonthlyValue(monthsObj, monthKey, recordId, value){
    monthsObj[monthKey] = Object.assign({}, monthsObj[monthKey], {[recordId]: value});
  }

  /* "US prices as of 21:15, 5 Oct" -- latest lastPricedAt across holdings
     on scheduled auto-pricing (price_source 'auto_us', repriced four times
     each weekday by the refresh-us-prices Edge Function, see
     supabase/migrations/004_auto_us_pricing.sql). Clients no longer have a
     refresh button, so this is how they know how fresh the figures are.
     '' when the client has no auto-priced holdings. */
  function usPricesAsOfText(client){
    const latest = (client.holdings||[])
      .filter(h=>h.priceSource==='auto_us' && h.lastPricedAt)
      .reduce((max,h)=> Math.max(max, new Date(h.lastPricedAt).getTime()||0), 0);
    if(!latest) return '';
    const d = new Date(latest);
    const time = d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});
    const day = d.toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Europe/London'});
    return `US prices as of ${time}, ${day}`;
  }

  /* Client Updates feed, every record across the Foundation that carries a
     lastEditedBy/lastEditedAt tag, newest first. Adviser Workspace shows this
     filtered to "since last review" (client.meta.lastAdviserReview); the
     un-filtered list is available for completeness / debugging. */
  function collectClientUpdates(client){
    const items = [];
    const push = (section, label, record, goto)=>{
      if(record && record.lastEditedAt) items.push({section, label, source:record.lastEditedBy||'unknown', at:record.lastEditedAt, goto});
    };
    push('Client Profile', 'Personal details', client.personal, 'manual');
    (client.cashflow.income||[]).forEach(i=> push('Cashflow', i.type+' income', i, 'manual'));
    (client.cashflow.expenses.fixed||[]).forEach(e=> push('Cashflow', e.label, e, 'manual'));
    (client.cashflow.expenses.variable||[]).forEach(e=> push('Cashflow', e.label, e, 'manual'));
    (client.wealth.assets||[]).forEach(a=> push('Wealth', (a.notes||a.type), a, 'manual'));
    (client.wealth.liabilities||[]).forEach(l=> push('Wealth', l.type+' liability', l, 'manual'));
    (client.accounts||[]).forEach(a=> push('Accounts', TEI.data.acctLabel(a), a, 'manual'));
    (client.holdings||[]).forEach(h=> push('Holdings', h.name, h, 'manual'));
    (client.goals||[]).forEach(g=> push('Goals', g.name, g, 'manual'));
    (client.documents||[]).forEach(d=> push('Documents', d.name, d, 'manual'));
    items.sort((a,b)=> (b.at||'').localeCompare(a.at||''));
    return items;
  }

  function computeBudgetAndFI(client){
    const cf = client.cashflow;
    const prefs = client.preferences || {};
    const mult = cf.scenario === 'best' ? cf.bestMult : (cf.scenario === 'worst' ? cf.worstMult : 1.0);
    const oneOffTotal = (cf.oneOffs||[]).filter(o=>o.enabled).reduce((s,o)=>s+Number(o.amount||0),0);
    const pensionPersonalTotal = client.accounts.filter(a=>a.type==='pension').reduce((s,a)=>s+(Number(a.contributionPersonal)||0),0);
    const fixedTotal = totalFixedExpenses(client);
    const variableTotal = totalVariableExpenses(client);
    /* Living costs only, pension personal contributions are NOT a "spend" here.
       They're money being set aside, not consumed, so they do not belong in the
       25x-annual-spend FI target either (that target should reflect what you'd
       need replaced in retirement, and you stop contributing to a pension once
       retired). */
    const totalSpend = fixedTotal + variableTotal*mult + oneOffTotal;
    const income = totalMonthlyIncome(client);
    /* Pay-yourself-first: actual saving/investing (from account contribution
       fields, see actualTotalSavingInvesting) is treated as a committed
       outflow, same as rent or a bill, not left inside an undifferentiated
       "surplus". What's left after both living costs AND this commitment is
       the genuinely disposable amount, this is `savings` in the return
       object below, surfaced to users as "Disposable Income". Previously
       this used the self-reported Cashflow budget figure, which could drift
       from what accounts actually show (see contribution reconciliation) —
       using the same actual-accounts figure everywhere keeps every cashflow
       stat, from the headline rate down to disposable income, in agreement. */
    const committedSaving = actualTotalSavingInvesting(client);
    const savings = income - totalSpend - committedSaving;
    const annualSpend = totalSpend*12;
    /* The FI number is the multiple of yearly spending in independence:
       the client's own Plan settings figure once saved (Forecast's Save as
       my plan, B7.2 / B9.4), otherwise today's spending from Cashflow. */
    const fiSpend = prefs.yearlySpending != null ? Number(prefs.yearlySpending) : annualSpend;
    const fiTarget = prefs.fiOverride != null ? prefs.fiOverride : fiSpend*(prefs.fiMultiple||25);
    return {totalSpend, savings, committedSaving, annualSpend, fiTarget, mult, oneOffTotal, pensionPersonalTotal, income};
  }

  function computeEoyProjection(client){
    const months = buildMergedMonths(client);
    const b = latestBreakdown(months);
    const trailing = trailingReturnPct(client, months);
    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    let monthsRemaining = (endOfYear.getFullYear()-now.getFullYear())*12 + (endOfYear.getMonth()-now.getMonth());
    if(monthsRemaining < 0) monthsRemaining = 0;
    let eoyTotal = 0;
    client.accounts.forEach(acc=>{
      const current = Number(b[acc.id])||0;
      const contribution = acctContribTotal(acc);
      const riskPct = acc.returnPct != null && acc.returnPct !== '' ? Number(acc.returnPct) : trailing;
      const monthlyRate = Math.pow(1+riskPct/100, 1/12) - 1;
      let fv;
      if(monthsRemaining <= 0){ fv = current; }
      else if(Math.abs(monthlyRate) < 1e-9){ fv = current + contribution*monthsRemaining; }
      else{ fv = current*Math.pow(1+monthlyRate, monthsRemaining) + contribution*((Math.pow(1+monthlyRate, monthsRemaining)-1)/monthlyRate); }
      eoyTotal += fv;
    });
    return {eoyTotal, monthsRemaining, trailing};
  }

  function computeGoalState(client){
    const months = buildMergedMonths(client);
    const b = latestBreakdown(months);
    const netWorthTotal = accountTotal(client, b) || latestNetWorth(client);
    const liquidTotal = client.accounts.filter(a=>a.type==='isa'||a.type==='gia').reduce((s,a)=> s+(Number(b[a.id])||0), 0);
    if(netWorthTotal < 100000) return {active:true, label:'Race to £100k', sub:'Net worth', metric:netWorthTotal, target:100000};
    if(liquidTotal < 100000) return {active:true, label:'Race to £100k', sub:'Investment portfolio (ISA + GIA)', metric:liquidTotal, target:100000};
    return {active:false};
  }

  function computeSDLT(price, isFTB){
    let tax = 0;
    if(isFTB && price <= 500000){
      if(price > 300000) tax = (price-300000)*0.05;
    } else {
      const bands = [[0,125000,0],[125000,250000,0.02],[250000,925000,0.05],[925000,1500000,0.10],[1500000,Infinity,0.12]];
      bands.forEach(([lo,hi,r])=>{ if(price>lo){ tax += (Math.min(price,hi)-lo)*r; } });
    }
    return tax;
  }

  /* ---------- shared cross-page helpers (homepage + Wealth page both use these) ---------- */
  function financialFreedomPct(client){
    const budgetFi = computeBudgetAndFI(client);
    if(!budgetFi.fiTarget || budgetFi.fiTarget <= 0) return null;
    const nw = latestNetWorth(client);
    return Math.min(999, (nw/budgetFi.fiTarget)*100);
  }

  /* Round net-worth milestones. Close together early on (roughly 20-50% apart) so the next one
     is always within reach -- the old list jumped straight from nothing to £100k, then £250k.
     Beyond the list: every £500k. Also drives the "Passed £X net worth" milestones. */
  const ROUND_MILESTONES = [10000,25000,50000,75000,100000,150000,200000,250000,300000,400000,
    500000,600000,750000,1000000,1250000,1500000,2000000];
  function nextRoundMilestone(nw){
    return ROUND_MILESTONES.find(t=>t>nw) || (Math.ceil((nw+1)/500000)*500000);
  }
  function nextMilestone(client){
    const nw = latestNetWorth(client);
    // `current` is what progress is measured against: a goal's own linked accounts (same
    // figure as its goal card -- whole net worth here made "Liquid £100k" read 60% on this
    // card but 39% on the goal card), or net worth for a round number.
    const goals = (client.goals||[])
      .filter(g=>g.progressType==='monetary' || !g.progressType)
      .map(g=>({label:g.name, target:Number(g.targetAmount)||0, current:goalProgress(client, g).current}))
      .filter(g=>g.target > nw);
    const next = nextRoundMilestone(nw);
    // Name the figure itself ("£75,000 net worth"), not the vague "Next round number".
    const round = {label:'£'+next.toLocaleString('en-GB')+' net worth', target:next, current:nw, isRound:true};
    // Whichever is closest to being reached: a big goal (e.g. Liquid £100k) no longer hides a
    // round number that is much nearer (e.g. £75k); on a tie the client's own goal wins.
    return [...goals, round].reduce((best,m)=> (m.target-m.current) < (best.target-best.current) ? m : best);
  }

  /* Your Journey, the client's whole relationship with TEI, not just onboarding.
     `auto` returns true/false/null (null = not enough data to judge automatically).
     Single source of truth for both the homepage's full rail and the Wealth page's
     condensed summary. */
  const JOURNEY_STAGES = [
    {id:'build',         name:'Build your dashboard', sub:'Onboarding complete, accounts connected',
      auto:(c)=> c.settings.onboardingComplete && completion(c).hasRealData },
    {id:'foundations',   name:'Financial foundations', sub:'Budget set and emergency fund in place',
      auto:(c)=> { const ef=c.cashflow.emergencyFund||{}; if(!c.cashflow.income.length) return false; if(!ef.target) return null; return ef.current>=ef.target; } },
    {id:'growing',       name:'Growing wealth', sub:'Consistent investing, more than one account',
      auto:(c)=> c.accounts.length ? c.accounts.length>=2 && totalMonthlyContribution(c)>0 : false },
    {id:'acceleration',  name:'Acceleration', sub:'Contributions rising, goals on track',
      auto:(c)=> { const ff=financialFreedomPct(c); return ff==null ? null : ff>=25; } },
    {id:'work-optional', name:'Work optional', sub:'Passive income covers essential costs',
      auto:(c)=> { const ff=financialFreedomPct(c); return ff==null ? null : ff>=75; } },
    {id:'fi',            name:'Financial independence', sub:'Reached your financial freedom target',
      auto:(c)=> { const ff=financialFreedomPct(c); return ff==null ? null : ff>=100; } },
    {id:'legacy',        name:'Legacy', sub:'Estate planning and giving in place',
      auto:(c)=> null }, // no automatic signal for this yet, always adviser/client confirmed
  ];

  function computeJourney(client){
    let currentSet = false;
    return JOURNEY_STAGES.map(stage=>{
      const override = (client.journeyOverrides||{})[stage.id];
      const auto = stage.auto(client);
      const complete = override ? !!override.complete : (auto===true);
      const status = complete ? 'done' : (!currentSet ? 'current' : 'upcoming');
      if(!complete && !currentSet) currentSet = true;
      return Object.assign({}, stage, {complete, status});
    });
  }

  /* ---------- next best action (simple rule-based suggestion) ---------- */
  function computeNextBestAction(client){
    if(client.insights && client.insights.nextBestAction) return client.insights.nextBestAction;
    if(!client.accounts.length) return {text:'Add your first account', why:'Nothing to track yet, start with whatever you check most often.'};
    const budgetFi = computeBudgetAndFI(client);
    const cf = client.cashflow;
    const ef = cf.emergencyFund || {target:0,current:0};
    if(ef.target > 0 && ef.current < ef.target){
      return {text:'Top up your emergency fund', why:fmtGBP(ef.target-ef.current) + ' short of your ' + fmtGBP(ef.target) + ' target.'};
    }
    const isaAccounts = client.accounts.filter(a=>a.type==='isa');
    if(isaAccounts.length){
      const months = buildMergedMonths(client);
      const b = latestBreakdown(months);
      const isaTotal = isaAccounts.reduce((s,a)=>s+(Number(b[a.id])||0),0);
      if(isaTotal < 20000 && budgetFi.savings > 0){
        return {text:'Increase ISA contribution', why:'This year\'s allowance still has room, and you have ' + fmtGBP(budgetFi.savings) + '/mo of disposable income to put toward it.'};
      }
    }
    if(budgetFi.savings < 0){
      return {text:'Review your budget', why:'Spending and savings commitments are currently ' + fmtGBP(Math.abs(budgetFi.savings)) + '/mo more than income.'};
    }
    return {text:'Update this month\'s balances', why:'Keeping the numbers current is what makes the projections worth trusting.'};
  }

  /* Safety net (spec B8): the linked cash account, measured in months of
     spending (fixed + variable, i.e. essentials and lifestyle). One
     calculation for Home and Cashflow so the two always agree. Stages: a
     working buffer of one month, Stage 2 at three months, full at the
     plan's target (6 months unless preferences.safetyNetMonths says
     otherwise). */
  function safetyNet(client){
    const ef = (client.cashflow && client.cashflow.emergencyFund) || {target:0, current:0};
    const acc = (client.accounts||[]).find(a=> a.id === ef.accountId);
    const current = acc ? (Number(acc.value)||0) : 0;
    const monthlySpend = totalFixedExpenses(client) + totalVariableExpenses(client);
    const months = monthlySpend > 0 ? current/monthlySpend : null;
    const fullMonths = Number((client.preferences||{}).safetyNetMonths) || 6;
    let stage = 'none';
    if(months != null){
      if(months >= fullMonths) stage = 'full';
      else if(months >= 3) stage = 'stage2';
      else if(months >= 1) stage = 'buffer';
    }
    return {current, target:Number(ef.target)||0, monthlySpend, months, fullMonths, stage, linked:!!acc};
  }

  /* Essentials and lifestyle (spec B9.7): the standing expense lines summed
     by their tag. Lines with no tag count as essential. */
  function totalEssentialExpenses(client){
    const e = client.cashflow.expenses || {};
    return (e.fixed||[]).concat(e.variable||[]).filter(x=> x.category !== 'lifestyle').reduce((s,x)=> s + (Number(x.amount)||0), 0);
  }
  function totalLifestyleExpenses(client){
    const e = client.cashflow.expenses || {};
    return (e.fixed||[]).concat(e.variable||[]).filter(x=> x.category === 'lifestyle').reduce((s,x)=> s + (Number(x.amount)||0), 0);
  }

  /* One month's cashflow (spec B8): take-home, essentials, lifestyle and
     wealth building (everything saved or invested, cash included). What was
     logged for that month wins (Cashflow's Update this month, or the older
     Update page); anything not logged comes from the standing figures. An
     older log with one spending figure is split as the standing lines are.
     Home and Cashflow both read this, so they always agree. */
  function cashflowMonth(client, key){
    key = key || TEI.data.currentMonthKey();
    const std = {
      takeHome: totalMonthlyIncome(client),
      essentials: totalEssentialExpenses(client),
      lifestyle: totalLifestyleExpenses(client),
      wealthBuilding: actualTotalSavingInvesting(client)
    };
    const rec = (client.cashflowMonths||{})[key];
    if(!rec) return Object.assign({key, logged:false, split:false, lastEditedAt:null}, std);
    const takeHome = rec.actualIncome != null ? Number(rec.actualIncome)||0 : std.takeHome;
    let essentials = std.essentials, lifestyle = std.lifestyle, split = false;
    if(rec.essentials != null || rec.lifestyle != null){
      essentials = Number(rec.essentials)||0; lifestyle = Number(rec.lifestyle)||0; split = true;
    } else if(rec.actualExpenses != null){
      const tot = std.essentials + std.lifestyle, spent = Number(rec.actualExpenses)||0;
      const share = tot > 0 ? std.essentials/tot : 1;
      essentials = spent*share; lifestyle = spent - essentials;
    }
    const wealthBuilding = rec.wealthBuilding != null ? Number(rec.wealthBuilding)||0 : std.wealthBuilding;
    return {key, logged:true, split, lastEditedAt: rec.lastEditedAt || null, takeHome, essentials, lifestyle, wealthBuilding};
  }

  /* Wealth conversion: the share of this month's take-home that goes into
     wealth (saving and investing, cash included, as the Cashflow board
     defines it). Shown on Cashflow and Home; one formula for both. */
  function wealthConversionRate(client){
    const m = cashflowMonth(client);
    return m.takeHome > 0 ? m.wealthBuilding/m.takeHome*100 : 0;
  }

  /* ================= Shared signals engine =================
     Every Coach's Corner and Insights list across the app (Home, Cashflow,
     Portfolio, Forecast, Adviser Workspace) used to be its own hardcoded
     if/else chain, each recomputing things like savings rate or
     concentration with its own slightly different threshold. That is exactly
     the shape of bug this file has had repeatedly (39% vs 32%, double-
     counted pension, holdings vs account value). computeSignals() is the
     fix: compute every fact ONCE here, tag it with which page(s) it is
     relevant to and how urgent it is, and let each page just ask for its
     highest-priority signal(s) instead of maintaining its own logic.

     Signal shape:
       id           stable key (for future dismissal/memory tracking)
       domain       array of pages this belongs on: 'home'|'cashflow'|'portfolio'|'forecast'
       severity     0-100, higher = more urgent to surface first
       tier         'critical'|'warning'|'positive'|'neutral' -- coarse grouping
       message      the copy
       actionLabel / actionPage   for the CTA
       relevant     false = a "nothing to report yet" filler, only used if
                    nothing real exists for that domain

     This pass covers the single-message Coach's Corner slots and the two
     threshold-heavy insight lists (Cashflow, Portfolio). Wealth's insights
     (net worth trend narrative) and the Adviser Workspace Insights tab
     still run their own logic for now, different enough in shape (time-
     series narrative, not threshold checks) that folding them in was not
     worth the risk in this pass. */
  function computeSignals(client){
    const signals = [];
    const push = (s) => signals.push(Object.assign({relevant:true}, s));
    const income = totalMonthlyIncome(client);
    const budgetFi = computeBudgetAndFI(client);
    const hasIncome = income > 0;

    /* ---- Cashflow domain ---- */
    if(!hasIncome){
      push({id:'cf-no-data', domain:['cashflow','home'], severity:5, tier:'neutral', relevant:false,
        message:'Add your income and budget to see how effectively your money is converting into future wealth.',
        actionLabel:'Update in Adviser Workspace', actionPage:'cashflow'});
    } else {
      if(budgetFi.savings < 0){
        push({id:'cf-deficit', domain:['cashflow','home'], severity:95, tier:'critical',
          message:`Spending and savings commitments are currently ${fmtGBP(Math.abs(budgetFi.savings))}/mo more than income.`,
          actionLabel:'Review your budget', actionPage:'cashflow'});
      }
      const ef = (client.cashflow.emergencyFund)||{target:0,current:0};
      if(ef.target > 0){
        const pct = Math.min(100, ef.current/ef.target*100);
        if(pct < 25){
          push({id:'ef-critical', domain:['cashflow','home'], severity:90, tier:'critical',
            message:`Your emergency fund is only ${pct.toFixed(0)}% funded, ${fmtGBP(ef.target-ef.current)} short of your ${fmtGBP(ef.target)} target.`,
            actionLabel:'Top up your emergency fund', actionPage:'cashflow'});
        } else if(pct < 100){
          push({id:'ef-building', domain:['cashflow'], severity:45, tier:'warning',
            message:`Your emergency fund is ${pct.toFixed(0)}% of the way to target.`,
            actionLabel:'Review Cashflow', actionPage:'cashflow'});
        } else {
          push({id:'ef-funded', domain:['cashflow'], severity:15, tier:'positive',
            message:'Your emergency fund is fully funded, a strong foundation before further investing.',
            actionLabel:'Review Cashflow', actionPage:'cashflow'});
        }
      }
      const wcr = income ? (actualInvestmentMonthlyContribution(client)/income*100) : 0;
      const wcTarget = (client.preferences||{}).wealthConversionTarget || 20;
      if(wcr >= wcTarget){
        push({id:'wcr-strong', domain:['cashflow','home'], severity:20, tier:'positive',
          message:`You are converting ${wcr.toFixed(0)}p of every £1 into future wealth, at or above the ${wcTarget}% benchmark. Consistency here matters more than perfection.`,
          actionLabel:'See the impact in Forecast', actionPage:'planning'});
      } else {
        push({id:'wcr-below-target', domain:['cashflow','home'], severity:55, tier:'warning',
          message:`Your wealth conversion rate of ${wcr.toFixed(0)}% is below your ${wcTarget}% target, there is room to direct more of your income towards investing.`,
          actionLabel:'Explore the compounding effect', actionPage:'planning'});
      }
      const savingRate = income ? (budgetFi.committedSaving/income*100) : 0;
      push({id:'savings-rate', domain:['cashflow'], severity:10, tier:'neutral',
        message:`Your savings rate is ${savingRate.toFixed(0)}%, against a typical 15-20% benchmark.`,
        actionLabel:'Review Cashflow', actionPage:'cashflow'});
      if(budgetFi.savings > 0 && actualInvestmentMonthlyContribution(client) < budgetFi.savings){
        push({id:'undirected-surplus', domain:['cashflow'], severity:40, tier:'warning',
          message:`You have ${fmtGBP(budgetFi.savings)}/mo of disposable income that is not yet directed into investing. Paying yourself first, before discretionary spending, could accelerate your financial independence journey.`,
          actionLabel:'Try it in Scenario Corner', actionPage:'cashflow'});
      }
      const isaAccounts = client.accounts.filter(a=>a.type==='isa');
      if(isaAccounts.length){
        const months = buildMergedMonths(client);
        const b = latestBreakdown(months);
        const isaTotal = isaAccounts.reduce((s,a)=>s+(Number(b[a.id])||0),0);
        if(isaTotal < 20000 && budgetFi.savings > 0){
          push({id:'isa-headroom', domain:['cashflow','home'], severity:30, tier:'neutral',
            message:`This year's ISA allowance still has room, and you have ${fmtGBP(budgetFi.savings)}/mo of disposable income to put toward it.`,
            actionLabel:'Increase ISA contribution', actionPage:'cashflow'});
        }
      }
    }

    /* ---- Portfolio domain ---- */
    if(!client.holdings.length){
      push({id:'no-holdings', domain:['portfolio'], severity:5, tier:'neutral', relevant:false,
        message:'No individual holdings logged yet, once added, I can highlight concentration and diversification here.',
        actionLabel:'Add holdings', actionPage:'portfolio'});
    } else {
      const grouped = groupedHoldings(client);
      const holdingsTotal = grouped.reduce((s,g)=>s+g.value,0);
      if(holdingsTotal <= 0){
        push({id:'holdings-no-value', domain:['portfolio'], severity:5, tier:'neutral', relevant:false,
          message:'Holdings are logged but without values yet, add current values to unlock portfolio observations.',
          actionLabel:'Update holdings', actionPage:'portfolio'});
      } else {
        const top = [...grouped].sort((a,b)=>b.value-a.value)[0];
        const topPct = top.value/holdingsTotal*100;
        let flagged = false;
        if(topPct >= 40){
          const spread = top.accountNames.length>1 ? ` (spread across ${top.accountNames.join(', ')})` : '';
          push({id:'concentration-high', domain:['portfolio','home'], severity:75, tier:'warning',
            message:`${top.name} makes up ${topPct.toFixed(0)}% of your logged holdings${spread}, worth checking that concentration still matches your risk appetite.`,
            actionLabel:'Review Portfolio', actionPage:'portfolio'});
          flagged = true;
        }
        const sectorsTagged = client.holdings.filter(h=>h.sector);
        const sectorSet = new Set(sectorsTagged.map(h=>h.sector));
        if(sectorsTagged.length>=3 && sectorSet.size<=1){
          push({id:'sector-concentration', domain:['portfolio'], severity:50, tier:'warning',
            message:'Your logged holdings are concentrated in a single sector, diversifying across sectors can reduce single-industry risk.',
            actionLabel:'Review Portfolio', actionPage:'portfolio'});
          flagged = true;
        }
        if(!flagged){
          push({id:'portfolio-spread-ok', domain:['portfolio'], severity:10, tier:'positive',
            message:'Holdings look reasonably spread, no concentration flags right now.',
            actionLabel:'Review Portfolio', actionPage:'portfolio'});
        }
        const top5 = [...grouped].sort((a,b)=>b.value-a.value).slice(0,5).reduce((s,g)=>s+g.value,0);
        push({id:'top5-concentration', domain:['portfolio'], severity:8, tier:'neutral',
          message:`Your largest five holdings represent ${(top5/holdingsTotal*100).toFixed(0)}% of your portfolio.`,
          actionLabel:'Review Portfolio', actionPage:'portfolio'});

        /* Descriptive top-sector exposure -- distinct from 'sector-concentration'
           above, which only fires as a WARNING when tagged holdings sit in a
           single sector. This is a plain descriptive fact (which sector is
           largest) shown regardless of concentration level. Previously
           computed a second time, word-for-word differently, by Portfolio's
           own Insights list -- now a single signal both draw from. */
        if(sectorsTagged.length){
          const bySector = {};
          sectorsTagged.forEach(h=>{ bySector[h.sector] = (bySector[h.sector]||0)+(Number(h.value)||0); });
          const topSector = Object.entries(bySector).sort((a,b)=>b[1]-a[1])[0];
          if(!(sectorsTagged.length>=3 && sectorSet.size<=1)){
            push({id:'top-sector-exposure', domain:['portfolio'], severity:6, tier:'neutral',
              message:`Your portfolio has significant exposure to ${topSector[0].toLowerCase()} companies.`,
              actionLabel:'Review Portfolio', actionPage:'portfolio'});
          }
        }

        /* Descriptive monthly contribution across investment accounts --
           previously only shown by Portfolio's own Insights list, now part
           of the shared engine so it can be excluded/deduped like everything
           else on the page. */
        const portfolioMonthlyContrib = client.accounts
          .filter(a=>['isa','gia','lisa','pension','crypto'].includes(a.type))
          .reduce((s,a)=>s+acctContribTotal(a),0);
        if(portfolioMonthlyContrib>0){
          push({id:'portfolio-monthly-contribution', domain:['portfolio'], severity:6, tier:'neutral',
            message:`You are contributing ${fmtGBP(portfolioMonthlyContrib)} per month across your investment accounts.`,
            actionLabel:'Review Portfolio', actionPage:'portfolio'});
        }

        /* Cross-domain: a strong savings habit does not protect against
           concentration risk undermining those same gains -- nobody
           previously connected these two facts across pages. */
        if(hasIncome){
          const wcr = income ? (actualInvestmentMonthlyContribution(client)/income*100) : 0;
          const wcTarget = (client.preferences||{}).wealthConversionTarget || 20;
          if(wcr >= wcTarget && topPct >= 40){
            push({id:'strong-saving-high-concentration', domain:['home','portfolio'], severity:65, tier:'warning',
              message:`Your ${wcr.toFixed(0)}% wealth conversion rate is strong, but ${topPct.toFixed(0)}% of your portfolio sitting in ${top.name} means concentration risk could undermine those gains.`,
              actionLabel:'Review Portfolio', actionPage:'portfolio'});
          }
        }
      }
    }

    /* ---- Pension domain ----
       No employer-match-rate field exists in the data model, so these cannot
       calculate a precise "leaving free money on the table" figure -- kept
       deliberately conservative: flag the absence of ANY logged
       contribution (personal OR salary sacrifice -- the thing most likely
       to forfeit an employer match), not a specific shortfall amount that
       is not backed by real numbers.
       Checking contributionPersonal alone here used to false-positive for
       anyone contributing entirely via salary sacrifice (contributionEmployer
       in the Accounts form, contributionSacrifice in the data) -- a normal,
       often more tax-efficient way to fund a pension, not a missing
       contribution. Fixed 2026-09 to treat personal + sacrifice as one
       combined "is anything going in" total, same as acctContribTotal()
       already does for the account's own contribution display. The %-of-
       income rate below still uses take-home pay as its denominator (see
       actualInvestmentMonthlyContribution's comment on why sacrifice is
       excluded from THAT calc) -- for someone contributing heavily via
       sacrifice this will read a little generous relative to gross income,
       but it is the same income figure used consistently everywhere else in
       Cashflow, and still directionally correct at typical contribution
       levels. */
    const pensionAccounts = client.accounts.filter(a=>a.type==='pension');
    if(pensionAccounts.length){
      const pensionTotalContrib = a => (Number(a.contributionPersonal)||0) + (Number(a.contributionSacrifice)||0);
      const noContrib = pensionAccounts.filter(a=>!(pensionTotalContrib(a)>0));
      if(noContrib.length){
        push({id:'pension-no-contribution', domain:['portfolio'], severity:48, tier:'warning',
          message:`${noContrib.length>1?'Your pensions show':pensionAccounts.length>1?noContrib[0].name+' shows':'Your pension shows'} no monthly contribution logged (personal or salary sacrifice). If your employer offers to match contributions, a contribution is usually what unlocks it.`,
          actionLabel:'Review Pension', actionPage:'portfolio'});
      } else if(hasIncome){
        const totalContrib = pensionAccounts.reduce((s,a)=>s+pensionTotalContrib(a),0);
        const pensionRate = income ? (totalContrib/income*100) : 0;
        if(pensionRate >= 5){
          push({id:'pension-contributing-well', domain:['portfolio'], severity:14, tier:'positive',
            message:`You are contributing ${pensionRate.toFixed(0)}% of income to your pension (personal and/or salary sacrifice), on top of any further employer contribution, a strong long-term habit.`,
            actionLabel:'Review Pension', actionPage:'portfolio'});
        }
      }
    } else if(hasIncome && (client.personal.employmentStatus==='Employed' || client.personal.employmentStatus==='Business Owner')){
      push({id:'no-pension-employed', domain:['portfolio'], severity:42, tier:'warning',
        message:'No pension is logged yet. As an employee, workplace pension contributions (often matched by an employer) are usually one of the most efficient ways to build long-term wealth.',
        actionLabel:'Add a pension', actionPage:'portfolio'});
    }

    /* ---- Forecast domain ---- */
    const monthlyContrib = totalMonthlyContribution(client);
    const latestTotal = latestNetWorth(client);
    if(monthlyContrib<=0){
      push({id:'no-contribution', domain:['forecast','home'], severity:70, tier:'warning',
        message:'Set up a regular monthly contribution to start building future momentum, even small, consistent amounts compound significantly over time.',
        actionLabel:'Update Cashflow', actionPage:'cashflow'});
    } else if(latestTotal > monthlyContrib*12*5){
      push({id:'growth-outpacing', domain:['forecast'], severity:15, tier:'positive',
        message:'Your investment growth is beginning to outpace your contributions. Learn why compounding matters more than timing.',
        actionLabel:'Learn about compounding', actionPage:'learning'});
    } else if(budgetFi.fiTarget>0){
      push({id:'consistent-habit', domain:['forecast'], severity:12, tier:'positive',
        message:`Your consistent ${fmtGBP(monthlyContrib)} monthly investment habit is becoming a significant driver of your future wealth.`,
        actionLabel:'Explore your plan', actionPage:'planning'});
    } else {
      push({id:'increase-contribution-fi', domain:['forecast'], severity:25, tier:'neutral',
        message:'Increasing your monthly investment, even by a small amount, could bring your financial independence target closer.',
        actionLabel:'Try it in your plan', actionPage:'planning'});
    }

    /* ---- Goals domain ----
       A client's stated priorities -- previously invisible to every other
       domain, including Home. 'goal-off-track' is tagged 'home' (not just
       'goals') so a genuinely missed target date can surface on Home via
       pickTopSignal's minSeverity critical check, the same path Cashflow
       and Portfolio critical issues already use. Reuses TEI.calc.goalProgress
       (already shared with the Goals page) rather than duplicating its math. */
    const allGoals = client.goals || [];
    const activeGoals = allGoals.filter(g=>g.status!=='completed');
    if(!allGoals.length){
      push({id:'no-goals', domain:['goals'], severity:5, tier:'neutral', relevant:false,
        message:'No goals set yet. Add goals in Adviser Workspace, or via the client\'s onboarding.',
        actionLabel:'Set a goal', actionPage:'goals'});
    } else if(activeGoals.length){
      // On track / behind is goalStatus, the rule the Goals cards and
      // Home show (B12.6), so this never contradicts them.
      let offTrack = null, behind = null, nearComplete = null, onTrackCount = 0;
      activeGoals.forEach(g=>{
        const gp = goalProgress(client, g);
        const st = goalStatus(client, g);
        const pastDue = st.past;
        if(pastDue && (!offTrack || (g.targetDate < offTrack.targetDate))) offTrack = g;
        if(st.key === 'behind' && !pastDue && (!behind || g.targetDate < behind.g.targetDate)) behind = {g, st};
        if(st.key !== 'behind') onTrackCount++;
        if(!gp.isComplete && gp.pct>=90 && gp.pct<100 && !nearComplete) nearComplete = {g, pct:gp.pct};
      });
      if(offTrack){
        push({id:'goal-off-track', domain:['goals','home'], severity:82, tier:'critical',
          message:`${offTrack.name} has passed its target date and has not been marked complete. Worth reviewing whether the target or timeline needs to change.`,
          actionLabel:'Review Goals', actionPage:'goals'});
      }
      if(behind){
        const gap = Math.max(1, Math.round(behind.st.needed - behind.st.monthly));
        const by = new Date(behind.g.targetDate).toLocaleDateString('en-GB', {month:'long', year:'numeric'});
        push({id:'goal-behind', domain:['goals'], severity:55, tier:'warning',
          message:`${behind.g.name} needs about £${gap.toLocaleString('en-GB')} more a month to reach its target by ${by}. Worth deciding at your next session whether to add to it or move the date.`,
          actionLabel:'Review Goals', actionPage:'goals'});
      }
      if(nearComplete){
        push({id:'goal-near-complete', domain:['goals','home'], severity:38, tier:'positive',
          message:`${nearComplete.g.name} is ${nearComplete.pct.toFixed(0)}% funded, close to target.`,
          actionLabel:'Review Goals', actionPage:'goals'});
      }
      push({id:'goals-on-track-count', domain:['goals'], severity:10, tier:'neutral',
        message:`You are on track with ${onTrackCount} of ${activeGoals.length} active goals.`,
        actionLabel:'Review Goals', actionPage:'goals'});
    }

    /* ---- Home / general domain ----
       Tagged 'home-native' rather than 'home' deliberately: these are Home's
       own content, always available regardless of severity. The 'home' tag
       is reserved for signals from OTHER domains that are allowed to echo
       on Home when critical enough (see pickTopSignal's minSeverity, used
       by computeCoachMessage) -- that is what stops Home just mirroring
       whatever Cashflow or Portfolio would already say. */
    const nwFact = computeNetWorthFact(client);
    if(nwFact.monthCount===0){
      push({id:'welcome', domain:['home-native'], severity:5, tier:'neutral',
        message:'Welcome. As you add accounts and goals, we will check in here with guidance tailored to your progress.',
        actionLabel:'Add accounts', actionPage:'wealth'});
    } else {
      const {netWorthChange, isHighest} = nwFact;
      if(isHighest && netWorthChange>0){
        push({id:'highest-net-worth', domain:['home-native'], severity:22, tier:'positive',
          message:'Excellent work. You have just reached your highest net worth yet. Consistent investing like this is one of the strongest predictors of long-term success.',
          actionLabel:'View Wealth', actionPage:'wealth'});
      } else if(netWorthChange!=null && netWorthChange>=0){
        push({id:'steady-state', domain:['home-native'], severity:8, tier:'neutral',
          message:'Nothing needs changing right now. Continue following your current plan.',
          actionLabel:'View Wealth', actionPage:'wealth'});
      } else {
        push({id:'steady-state-down', domain:['home-native'], severity:8, tier:'neutral',
          message:'Markets move month to month, what matters is staying consistent.',
          actionLabel:'View Wealth', actionPage:'wealth'});
      }
    }

    return signals;
  }

  /* ---------- ATR (risk profile) overlay ----------
     Applies the same underlying message with framing tailored to the
     client's self-reported risk profile (client.personal.riskProfile:
     Cautious/Balanced/Growth/Aggressive) -- an overlay, not a rewrite: the
     core fact never changes, only the closing emphasis. Cautious skews
     toward protection/security language; Aggressive skews toward growth/
     opportunity language; Balanced/Growth sit between.
     Deliberately does NOT touch critical-tier signals -- a missing
     emergency fund or a cashflow deficit is a structural risk that blocks
     growth for every risk profile, so it always gets protection-first
     framing regardless of band, per Paddy's instruction that critical flags
     take priority even for an Aggressive client. Neutral-tier (filler) facts
     also are not framed -- they're plain descriptive statements, and forcing
     a tone onto "you have ISA headroom" would read as noise, not coaching. */
  const ATR_FRAME = {
    Cautious: {
      warning:  "Addressing this first helps protect what you have already built.",
      positive: "This kind of steady, protected progress is exactly what a cautious approach is built around."
    },
    Balanced: {
      warning:  "Worth weighing against your other priorities.",
      positive: "A solid balance of protecting what you have and building for the future."
    },
    Growth: {
      warning:  "Addressing this keeps your growth plans on solid ground.",
      positive: "This is exactly the kind of momentum that compounds over time."
    },
    Aggressive: {
      warning:  "Clearing this out of the way frees you up to focus on growth.",
      positive: "This is the kind of growth-focused progress worth building on."
    }
  };
  function applyATRFraming(signal, riskProfile){
    if(!signal || !riskProfile || signal.tier==='critical') return signal;
    const band = ATR_FRAME[riskProfile];
    const frame = band ? band[signal.tier] : null;
    if(!frame) return signal;
    return Object.assign({}, signal, {message: signal.message + ' ' + frame});
  }

  /* Highest-severity signal for a given page's domain. Checks that page's
     manual-override field first (unchanged behaviour, a pinned message
     always wins), then falls back to the shared engine. Prefers a
     `relevant:true` signal, but falls back to a filler ("no data yet")
     signal if that is genuinely all there is for this domain.
     opts.excludeIds -- skip specific signal ids (e.g. one this page's
       Coach's Corner already used, so its own Insights list underneath
       does not just repeat the same sentence).
     opts.minSeverity -- only return a signal if it clears this bar; used by
       Home so a page-specific issue only surfaces there when it is genuinely
       critical, not every time some other page has a minor warning. */
  function pickTopSignal(client, domain, opts){
    opts = opts || {};
    if(opts.overrideKey){
      const ov = client[opts.overrideKey] || {};
      if(ov.mode==='manual' && ov.message){
        return {message:ov.message, actionLabel:ov.actionLabel||opts.fallbackActionLabel||'Review', actionPage:ov.actionPage||opts.fallbackActionPage||domain};
      }
    }
    let all = computeSignals(client).filter(s=>s.domain.includes(domain));
    if(opts.excludeIds && opts.excludeIds.length) all = all.filter(s=>!opts.excludeIds.includes(s.id));
    const real = all.filter(s=>s.relevant!==false);
    const pool = real.length ? real : all;
    if(!pool.length) return null;
    pool.sort((a,b)=>b.severity-a.severity);
    if(opts.minSeverity!=null && pool[0].severity < opts.minSeverity) return null;
    return applyATRFraming(pool[0], (client.personal||{}).riskProfile);
  }

  /* Top N distinct signals for a domain, for list-style insight panels
     (Cashflow's behavioural insights, Portfolio's insight list) rather than
     a single Coach's Corner message. opts.excludeIds works as in
     pickTopSignal, pass the id of whatever this page's own Coach's Corner
     already said, so the list underneath adds to it rather than opening
     with the same line.
     Filler de-prioritisation: signals tagged tier:'neutral' are plain
     descriptive facts (ISA headroom, savings rate, top-5 concentration, top
     sector, monthly contribution) rather than something actionable or worth
     celebrating. These are useful when there is genuinely little else to say,
     but previously competed for the same slots as real warnings/positives on
     equal footing purely by severity number -- so a client with a critical
     emergency-fund shortfall could still see "you have ISA headroom" sitting
     alongside it. Neutral-tier signals now only fill remaining slots once
     critical/warning/positive signals run out. */
  function pickSignals(client, domain, n, opts){
    opts = opts || {};
    n = n || 4;
    let all = computeSignals(client).filter(s=>s.domain.includes(domain) && s.relevant!==false);
    if(opts.excludeIds && opts.excludeIds.length) all = all.filter(s=>!opts.excludeIds.includes(s.id));
    all.sort((a,b)=>b.severity-a.severity);
    const real = all.filter(s=>s.tier!=='neutral');
    const filler = all.filter(s=>s.tier==='neutral');
    const picked = real.slice(0, n).concat(filler.slice(0, Math.max(0, n - real.length)));
    const riskProfile = (client.personal||{}).riskProfile;
    return picked.map(s=>applyATRFraming(s, riskProfile));
  }


  /* ---------- Cross-account holding grouping ----------
     The same company can sit in more than one account (a stock bought in a
     GIA and again in an ISA, say). Treating each account's line item as a
     separate position understates real concentration risk -- a holding that is
     35% of total money split across three accounts would never trip a 40%
     single-line check. Grouped by ticker where present (case-insensitive),
     falling back to name for holdings with no ticker. Per-account holdings
     lists (Adviser Workspace, Onboarding) stay ungrouped on purpose -- that is
     where each position is actually edited. */
  function groupedHoldings(client){
    const groups = {};
    client.holdings.forEach(h=>{
      const key = (h.ticker && h.ticker.trim()) ? h.ticker.trim().toUpperCase() : 'name:'+h.name.trim().toLowerCase();
      if(!groups[key]) groups[key] = {key, name:h.name, ticker:h.ticker||null, value:0, accountIds:[], accountNames:[]};
      groups[key].value += Number(h.value)||0;
      groups[key].accountIds.push(h.accountId);
      const acc = client.accounts.find(a=>a.id===h.accountId);
      const accName = acc ? TEI.data.acctLabel(acc) : 'Unknown account';
      if(!groups[key].accountNames.includes(accName)) groups[key].accountNames.push(accName);
    });

    // A holding entered without a ticker groups by name alone above --
    // fine on its own, but a real bug the moment the *same* security also
    // has ticker'd rows elsewhere (someone logged one purchase with the
    // ticker and a later one without, say): those become two separate
    // groups with the same name instead of one, i.e. a fake duplicate
    // holding with the value split across both. Fold any name-only group
    // into a ticker'd group of the same name (case-insensitive) rather
    // than leave both to display as separate lines. Only ever merges a
    // *tickerless* group into an *existing ticker'd* one -- two distinct
    // ticker'd groups are never merged just because their names match.
    const byName = {};
    Object.values(groups).forEach(g=>{
      if(g.ticker && !byName[g.name.trim().toLowerCase()]) byName[g.name.trim().toLowerCase()] = g;
    });
    Object.keys(groups).forEach(key=>{
      if(!key.startsWith('name:')) return;
      const g = groups[key];
      const target = byName[g.name.trim().toLowerCase()];
      if(!target || target===g) return;
      target.value += g.value;
      g.accountIds.forEach(id=>target.accountIds.push(id));
      g.accountNames.forEach(n=>{ if(!target.accountNames.includes(n)) target.accountNames.push(n); });
      delete groups[key];
    });

    return Object.values(groups);
  }

  /* ---------- Portfolio's Coach's Corner, now a thin wrapper around the
     shared signals engine (see computeSignals above). Kept here, not in the
     Portfolio page module, so Adviser Workspace's Insights tab can reuse
     the exact same logic rather than duplicating it. */
  function computePortfolioCoach(client){
    const s = pickTopSignal(client, 'portfolio', {overrideKey:'portfolioCoach', fallbackActionLabel:'Review Portfolio', fallbackActionPage:'portfolio'});
    if(!s) return {message:'No individual holdings logged yet, once added, I can highlight concentration and diversification here.', actionLabel:'Add holdings', actionPage:'portfolio', relevant:false};
    return {message:s.message, actionLabel:s.actionLabel, actionPage:s.actionPage, relevant:s.relevant!==false};
  }

  /* Ticker -> {sector, theme[]} lookup, hardcoded per Paddy's decision (no
     new Supabase table for this -- only the *result* is stored, on
     holdings.sector / holdings.theme). Seeded from Paddy's actual clients'
     holdings, not generic examples. Sector strings here are the only
     allowed values in the Sector <select> (see SECTOR_OPTIONS) -- keep
     them in sync if either list changes. Unrecognized ticker ->
     {sector:null, theme:[]}, i.e. "Other"/blank; callers treat that as
     "leave it to the adviser", never force-select "Other". */
  const TICKER_INFO = {
    ONDS:{ sector:'Industrials', theme:['Defense','Drones & Autonomy'] },
    PLTR:{ sector:'Information Technology', theme:['AI Infrastructure','Defense'] },
    TSLA:{ sector:'Consumer Discretionary', theme:['Electric Vehicles','Robotics & Automation'] },
    ASTS:{ sector:'Communication Services', theme:['Space Connectivity'] },
    NBIS:{ sector:'Information Technology', theme:['AI Infrastructure'] },
    IQE: { sector:'Information Technology', theme:['Semiconductors'] },
    ZETA:{ sector:'Information Technology', theme:['AI Marketing','Data & Analytics'] },
    HIMS:{ sector:'Health Care', theme:['Digital Health'] },
    TEM: { sector:'Health Care', theme:['Healthcare AI','Genomics'] },
    HOOD:{ sector:'Financials', theme:['Digital Finance'] },
    MSFT:{ sector:'Information Technology', theme:['AI Infrastructure','Cloud Computing'] },
    NVDA:{ sector:'Information Technology', theme:['AI Infrastructure','Semiconductors'] },
    AMZN:{ sector:'Consumer Discretionary', theme:['Cloud Computing','E-commerce'] },
    GOOG:{ sector:'Communication Services', theme:['AI Infrastructure','Cloud Computing'] },
    MELI:{ sector:'Consumer Discretionary', theme:['E-commerce','Digital Finance'] },
    SIVE:{ sector:'Information Technology', theme:['Semiconductors'] },
    '2DG':{ sector:'Information Technology', theme:['Semiconductors'] }, // Sivers Semiconductors, gettex code
    XSOP:{ sector:null, theme:['Emerging Markets'] },
    JEQP:{ sector:null, theme:['Equity Income'] },
    NWG: { sector:'Financials', theme:[] },
    HSBA:{ sector:'Financials', theme:[] },
    GRAB:{ sector:'Industrials', theme:['Digital Finance'] },
    EOSE:{ sector:'Industrials', theme:['Energy Storage','Renewable Energy'] },
    NVTS:{ sector:'Information Technology', theme:['Semiconductors','AI Infrastructure'] },
    OSCR:{ sector:'Health Care', theme:['Digital Health'] },
    JOBY:{ sector:'Industrials', theme:['Advanced Air Mobility'] },
    RKLB:{ sector:'Industrials', theme:['Space Technology'] },
    SPCX:{ sector:'Industrials', theme:['Space Technology','Space Connectivity'] },
    KRKNF:{ sector:'Industrials', theme:['Marine Robotics','Defense'] },
    NU:  { sector:'Financials', theme:['Digital Finance'] }
  };
  // Sectors used by the seed tickers above only -- do not list GICS buckets
  // no seed ticker uses yet. Kept alphabetical; 'Other' stays last as the
  // manual-override / unrecognized-ticker catch-all.
  const SECTOR_OPTIONS = ['Communication Services','Consumer Discretionary','Financials',
    'Health Care','Industrials','Information Technology','Other'];

  /* Dividend payment frequency -- how many times a year a holding actually
     pays out matters for reinvestment compounding (a monthly payer like
     JEPQ reinvests, and so compounds, far more often per year than an
     annual payer at the same nominal yield). 'annual' is the default for
     holdings that predate this field, matching the compounding this app
     already assumed before frequency was tracked, so existing holdings'
     numbers do not silently change until someone sets their real schedule. */
  const DIVIDEND_FREQUENCY_OPTIONS = [
    {value:'annual', label:'Annually', periodsPerYear:1},
    {value:'semiannual', label:'Semi-annually', periodsPerYear:2},
    {value:'quarterly', label:'Quarterly', periodsPerYear:4},
    {value:'monthly', label:'Monthly', periodsPerYear:12}
  ];
  function dividendPeriodsPerYear(frequency){
    const match = DIVIDEND_FREQUENCY_OPTIONS.find(f=>f.value===frequency);
    return match ? match.periodsPerYear : 1;
  }
  function dividendFrequencyLabel(frequency){
    const match = DIVIDEND_FREQUENCY_OPTIONS.find(f=>f.value===frequency);
    return match ? match.label : 'Annually';
  }
  function lookupTickerInfo(ticker){
    const t = (ticker||'').trim().toUpperCase();
    return TICKER_INFO[t] || { sector:null, theme:[] };
  }

  const RECON_TOLERANCE = 1; // £ -- ignore sub-£1 rounding noise
  /* Flags money that is been stated as contributed (opening lump sum +
     logged Deposits) but is not showing up anywhere it should: neither in a
     holding's cost basis nor in the account's cash balance. Usually means
     one of: a holding is missing its Avg open price (so its cost basis is
     still null and does not count here), cash balance has not been updated,
     or a contribution/holding was mistyped. Deliberately worded as a
     nudge, not an alarm -- holdings with no cost-basis tracking at all are
     a normal, common case, not an error, so a discrepancy here is a
     prompt to check, not proof something's wrong. */
  /* One logged deposit (client.contribLog[month][accountId]) split into its
     parts, nulls as 0. The single place a deposit row gets summed -- the
     Wealth page's Contributions line (paidIn + sacrifice) and every
     per-account total below read through this so they cannot drift. */
  function depositParts(e){
    return {
      paidIn: Number(e && e.amount)||0,
      sacrifice: Number(e && e.sacrificeAmount)||0,
      relief: Number(e && e.reliefAmount)||0
    };
  }
  /* LISA and personal pension contributions attract basic-rate tax relief
     added by HMRC/provider -- both work out to 25% of the client's own
     (net) contribution: LISA's 25% government bonus, and pension
     relief-at-source (pay in £80, HMRC adds £20 -- 25% of the net amount).
     Deliberately simplified: basic rate only (higher/additional rate is not
     automatic, it is claimed separately via self-assessment), no LISA
     £4k/year cap enforcement. Shared by the monthly Deposits widget and the
     "before tracking started" lump sum below. */
  const RELIEF_RATE = 0.25;
  function isReliefEligible(acc){ return !!acc && (acc.type === 'lisa' || acc.type === 'cash_lisa' || acc.type === 'pension'); }
  /* The "before tracking started" lump sum is entered as NET deposits (the
     form says so for LISA/pension), so the bonus/relief is added on top at
     the same rate as monthly deposits. A salary-sacrifice-only pension
     (sacrifice set, no personal contribution) gets none -- sacrifice has no
     relief-at-source. */
  function openingReliefFor(acc){
    if(!isReliefEligible(acc)) return 0;
    if(acc.type === 'pension' && (Number(acc.contributionSacrifice)||0) > 0 && !(Number(acc.contributionPersonal)||0)) return 0;
    const opening = Number(acc.openingContributions)||0;
    return opening > 0 ? Math.round(opening * RELIEF_RATE * 100) / 100 : 0;
  }
  /* Bonus/relief is not in the account the moment a deposit is logged: a
     LISA bonus lands ~4-8 weeks later, relief-at-source pension relief up
     to ~11 weeks. Relief on a deposit whose month is within `months` of
     now (the current month counts as 1) is "pending" -- left out of the
     reconciliation check only, so a fresh deposit does not flag its own
     not-yet-arrived bonus. Contributions totals still count it in full.
     Once a deposit ages out of its window the relief is expected, and a
     cash balance/book cost that still lacks it flags as normal. Salary
     sacrifice arrives with payroll, so it is never pending. */
  const RELIEF_PENDING_WINDOW = {
    lisa:    { months: 2, label: 'LISA bonus',  note: 'usually lands 4–8 weeks after deposit' },
    cash_lisa: { months: 2, label: 'LISA bonus', note: 'usually lands 4 to 8 weeks after deposit' },
    pension: { months: 3, label: 'tax relief', note: 'usually lands within 11 weeks of the contribution' }
  };
  function isReliefPending(acc, monthKey, nowKey){
    const w = acc && RELIEF_PENDING_WINDOW[acc.type];
    if(!w || !monthKey) return false;
    return monthsBetween(monthKey, nowKey || currentMonthKey()) < w.months;
  }
  function fmtPendingRelief(acc, amount){
    const w = acc && RELIEF_PENDING_WINDOW[acc.type];
    if(!w || !(amount > 0)) return '';
    return `${fmtGBP(amount)} ${w.label} pending (${w.note})`;
  }
  /* Total contributions to date for one account = opening_contributions
     (money in before monthly tracking started) + its bonus/relief + every
     logged deposit's amount + sacrifice + relief (LISA bonus / pension tax
     relief is real money in the account, so it counts toward what holdings
     should reconcile against). Shown on Account Details, used by the
     reconciliation check and the Wealth chart, so they always agree. */
  function acctContributionBreakdown(client, accountId){
    const acct = (client.accounts||[]).find(a=>a.id===accountId);
    // monthsLogged/recorded let callers tell "nothing entered yet" apart
    // from a genuine £0 -- clients set up with only a lump sum, only
    // monthly history, both, or neither all go through here.
    const openingRelief = acct ? openingReliefFor(acct) : 0;
    // reliefPending is the part of `relief` still inside its landing window
    // (RELIEF_PENDING_WINDOW) -- already included in relief/total.
    const out = { opening: (acct && Number(acct.openingContributions))||0, openingRelief, paidIn:0, sacrifice:0, relief:openingRelief, reliefPending:0, total:0, monthsLogged:0, recorded:false };
    const nowKey = currentMonthKey();
    Object.entries(client.contribLog||{}).forEach(([mk, monthEntry])=>{
      const e = monthEntry && monthEntry[accountId];
      if(!e) return;
      out.monthsLogged++;
      const p = depositParts(e);
      out.paidIn += p.paidIn; out.sacrifice += p.sacrifice; out.relief += p.relief;
      if(p.relief && isReliefPending(acct, mk, nowKey)) out.reliefPending += p.relief;
    });
    out.total = out.opening + out.paidIn + out.sacrifice + out.relief;
    out.recorded = out.opening !== 0 || out.monthsLogged > 0;
    return out;
  }
  function acctContributedTotal(client, accountId){
    return acctContributionBreakdown(client, accountId).total;
  }

  /* Logging a month's balance used to leave accounts.value (the account's
     "current value") untouched, so it went stale -- and the Phase 22
     monthly snapshot carries accounts.value forward, writing that stale
     figure into the next month (e.g. IG logged £350 for Aug, snapshot wrote
     £150 for Sep). When the logged month is the account's latest (and not
     in the future), the current value follows it. Holdings-driven accounts
     are skipped -- their value is the live holdings total. Returns the
     account if it changed, for the caller to persist. */
  function syncAccountValueFromMonth(client, accountId, monthKey, value){
    const acc = (client.accounts||[]).find(a=>a.id===accountId);
    if(!acc || accountHasHoldings(client, accountId)) return null;
    if(monthKey > currentMonthKey()) return null;
    const later = Object.keys(client.months||{}).some(k=> k > monthKey && (client.months[k]||{})[accountId]!=null);
    if(later) return null;
    if(Number(acc.value) === Number(value)) return null;
    acc.value = value;
    acc.lastUpdated = new Date().toISOString().slice(0,10);
    return acc;
  }

  /* ---------- New money vs growth ----------
     An account that shows up partway through a client's history already
     holding money (typical at onboarding: one account logged in August, the
     rest added in September) would otherwise read as a huge month of
     "growth". Each account's first logged balance is classed as
     pre-existing when it has a "before tracking started" lump sum, has no
     contribution records at all, or its first balance is well above the
     deposits logged for it by then. An account opened from scratch inside
     the history (first balance explained by its own deposits) is not --
     that money is already counted as deposits. */
  const JOIN_MIN_GAP = 1000; // £ -- ignore small first-month growth/rounding
  function accountStartingBalances(client, months){
    months = months || buildMergedMonths(client);
    const keys = Object.keys(months).sort();
    const out = {};
    (client.accounts||[]).forEach(a=>{
      const firstKey = keys.find(k=> months[k][a.id]!=null);
      if(!firstKey) return;
      const value = Number(months[firstKey][a.id])||0;
      const cb = acctContributionBreakdown(client, a.id);
      let depositsToThen = 0;
      Object.entries(client.contribLog||{}).forEach(([mk, entry])=>{
        const e = entry && entry[a.id];
        if(!e || mk > firstKey) return;
        const p = depositParts(e);
        depositsToThen += p.paidIn + p.sacrifice + p.relief;
      });
      const gap = value - depositsToThen;
      const preExisting = cb.opening > 0 || (!cb.recorded && value !== 0) || gap > Math.max(JOIN_MIN_GAP, 0.25*Math.abs(value));
      out[a.id] = { key:firstKey, value, preExisting, noRecords: !cb.recorded };
    });
    return out;
  }
  /* {monthKey: £ of pre-existing balances arriving that month}, for the
     accounts in accountIds (null = all). Accounts already there in the
     series' own first month are the baseline, not arrivals. */
  function joinedByMonth(client, months, accountIds){
    const idSet = accountIds ? new Set(accountIds) : null;
    const keys = Object.keys(months).sort();
    const firstKey = keys.find(k=> Object.keys(months[k]).some(id=> id!=='total' && (!idSet || idSet.has(id))));
    const out = {};
    Object.entries(accountStartingBalances(client, months)).forEach(([id, s])=>{
      if(idSet && !idSet.has(id)) return;
      if(!s.preExisting || !firstKey || s.key <= firstKey) return;
      out[s.key] = (out[s.key]||0) + s.value;
    });
    return out;
  }
  /* series = {monthKey: total}. Change between two logged months with
     arriving balances taken out -- what actually grew (incl. new deposits),
     not what was newly added to tracking. */
  function netChange(series, joined, fromKey, toKey){
    let change = series[toKey] - series[fromKey];
    Object.entries(joined||{}).forEach(([k,v])=>{ if(k > fromKey && k <= toKey) change -= v; });
    return change;
  }
  function monthsBetween(fromKey, toKey){
    const [fy,fm] = fromKey.split('-').map(Number), [ty,tm] = toKey.split('-').map(Number);
    return (ty-fy)*12 + (tm-fm);
  }

  /* ---------- Money-weighted returns ----------
     Returns measure what the money earned, not how much the total grew --
     a regular saver's balance mostly grows from their own deposits, and a
     point-to-point figure (the old approach) read that as return (e.g.
     "+2,285% all-time" on £43k paid in). Money-weighted (the basis
     platforms like HL/Trading 212 show) allows for when each pound went in,
     and copes with messy monthly snapshots far better than time-weighted.

     "Money in" per month, for the accounts in scope: logged deposits (incl.
     bonus/relief) + pre-existing balances of accounts arriving mid-history
     (joinedByMonth). An arriving account's own deposits up to its arrival
     month are already inside that balance, so they're skipped. */
  function moneyInByMonth(client, months, accountIds){
    const idSet = new Set(accountIds || (client.accounts||[]).map(a=>a.id));
    const out = Object.assign({}, joinedByMonth(client, months, accountIds));
    const starts = accountStartingBalances(client, months);
    Object.entries(client.contribLog||{}).forEach(([mk, entry])=>{
      Object.entries(entry||{}).forEach(([id, e])=>{
        if(!idSet.has(id)) return;
        const s = starts[id];
        if(s && s.preExisting && mk <= s.key) return;
        const p = depositParts(e);
        out[mk] = (out[mk]||0) + p.paidIn + p.sacrifice + p.relief;
      });
    });
    return out;
  }
  /* Over [fromKey, toKey] of a {monthKey: total} series: the value at
     fromKey counts as already invested, money in lands in its month
     (end-of-month convention), measured against the value at toKey.
       growth    = end - start - paidIn (what the money earned, £)
       periodPct = Modified Dietz: growth / average capital employed
       annualPct = the money-weighted annual rate (IRR), solved by bisection
     Callers only show annualPct for 12+ months -- see MIN_ANNUALISED_MONTHS. */
  function moneyWeightedReturn(series, moneyIn, fromKey, toKey){
    if(!fromKey || !toKey || !(fromKey < toKey) || series[fromKey]==null || series[toKey]==null) return null;
    const start = series[fromKey], end = series[toKey];
    const span = monthsBetween(fromKey, toKey);
    const flows = Object.entries(moneyIn||{})
      .filter(([k])=> k > fromKey && k <= toKey)
      .map(([k, v])=> ({ t: monthsBetween(k, toKey), v }));
    const paidIn = flows.reduce((s,f)=> s + f.v, 0);
    const growth = end - start - paidIn;
    const avgCapital = start + flows.reduce((s,f)=> s + f.v * (f.t/span), 0);
    const periodPct = avgCapital > 0 ? growth / avgCapital * 100 : null;
    const fv = r => start*Math.pow(1+r, span/12) + flows.reduce((s,f)=> s + f.v*Math.pow(1+r, f.t/12), 0) - end;
    let annualPct = null, lo = -0.99, hi = 10;
    if(fv(lo) <= 0 && fv(hi) >= 0){
      for(let i=0; i<100; i++){ const mid = (lo+hi)/2; if(fv(mid) > 0) hi = mid; else lo = mid; }
      annualPct = (lo+hi)/2 * 100;
    }
    return { start, end, paidIn, growth, periodPct, annualPct, months: span };
  }
  /* Months to measure a calendar year over: from the last logged month of
     the previous December (so January's movement counts) -- or the year's
     first logged month if history starts mid-year -- to the year's last
     logged month. null if there is nothing to compare. */
  function calendarYearWindow(series, year){
    const keys = Object.keys(series).sort();
    const prevDec = (year-1) + '-12', thisDec = year + '-12';
    const before = keys.filter(k=> k <= prevDec);
    const fromKey = before.length ? before[before.length-1] : keys.find(k=> k.startsWith(String(year)));
    const within = keys.filter(k=> k <= thisDec && k.startsWith(String(year)));
    const toKey = within.length ? within[within.length-1] : null;
    return (fromKey && toKey && fromKey < toKey) ? { fromKey, toKey } : null;
  }
  /* Annualised figures need a full year of history -- extrapolating one or
     two months to a yearly rate produces nonsense (e.g. 122 trillion %). */
  const MIN_ANNUALISED_MONTHS = 12;
  function annualisedReturnPct(series, moneyIn){
    const keys = Object.keys(series).sort();
    if(keys.length < 2 || monthsBetween(keys[0], keys[keys.length-1]) < MIN_ANNUALISED_MONTHS) return null;
    const r = moneyWeightedReturn(series, moneyIn, keys[0], keys[keys.length-1]);
    return r ? r.annualPct : null;
  }
  function annualisedPendingText(series){
    const keys = Object.keys(series).sort();
    const span = keys.length ? monthsBetween(keys[0], keys[keys.length-1]) : 0;
    return `Available after ${MIN_ANNUALISED_MONTHS} months of history (${span} month${span===1?'':'s'} so far).`;
  }
  function contributionDiscrepancy(client, accountIds){
    const idSet = accountIds ? new Set(accountIds) : null;
    const scopedAccounts = (client.accounts||[]).filter(a=>!idSet || idSet.has(a.id));
    // Only pull an account into the comparison if IT has a stated
    // contribution baseline. Summing every account's real cost basis
    // against only the subset that happens to have a contributions figure
    // entered would make an untracked account's genuine holdings look like
    // a huge fake "discrepancy" against nothing -- each account has to be
    // its own apples-to-apples check before being added to the total.
    let contributed = 0, accountedFor = 0, uncostedHoldings = 0, anyStated = false;
    scopedAccounts.forEach(a=>{
      // Cash is meant to be spent: money paid into a cash account and later
      // used reads as "unaccounted for" against what is left, so cash and
      // Cash ISA accounts are never reconciled against contributions.
      if(a.type === 'cash' || a.type === 'cash_isa' || a.type === 'cash_lisa') return;
      // Bonus/relief still inside its landing window is not expected in the
      // account yet (see RELIEF_PENDING_WINDOW) -- checked on what should
      // have arrived by now, not everything contributed.
      const cb = acctContributionBreakdown(client, a.id);
      const acctContributed = cb.total - cb.reliefPending;
      if(!acctContributed) return;
      const acctHoldings = client.holdings.filter(h=>h.accountId===a.id);
      const hasCashBalance = (Number(a.cashBalance)||0) > 0;
      // An account with a contribution figure logged but literally no
      // holdings and no cash balance entered yet is mid-setup, not a
      // reconciliation problem -- without this guard the full contributed
      // amount reads as "unaccounted for" (e.g. a brand-new LISA showing
      // "£24,000 unaccounted for" the day it was added, before the client
      // has had a chance to log what's actually in it). Skip it from the
      // comparison until there is something to reconcile it against.
      if(!acctHoldings.length && !hasCashBalance) return;
      anyStated = true;
      contributed += acctContributed;
      accountedFor += Number(a.cashBalance)||0;
      acctHoldings.forEach(h=>{
        if(h.costBasis!=null && h.costBasis>0) accountedFor += Number(h.costBasis)||0;
        else if(h.ticker || h.units!=null) uncostedHoldings++;
      });
    });
    if(!anyStated) return null; // nothing stated anywhere in scope -- nothing to check against

    const diff = contributed - accountedFor;
    if(Math.abs(diff) <= RECON_TOLERANCE) return null;
    return { contributed, accountedFor, diff, uncostedHoldings };
  }
  function fmtDiscrepancy(d){
    if(!d) return '';
    const over = d.diff > 0; // contributed more than is accounted for
    const amount = fmtGBP(Math.abs(d.diff));
    const hint = d.uncostedHoldings
      ? `, check cash balance, or add an Avg open price to ${d.uncostedHoldings===1?'a holding':'holdings'} missing one`
      : ', check cash balance and contributions for typos';
    return `⚠ ${amount} ${over?'unaccounted for':'more accounted for than contributed'}${hint}`;
  }
  /* Only the "unaccounted for" direction (contributed > accounted, diff>0)
     is ever worth a red flag -- money genuinely cannot be traced to a
     holding or cash balance. The other direction (accounted for >
     contributed) almost always means something benign that is not tracked
     as a "contribution" by design -- LISA/pension tax relief, or trading
     gains reinvested without fresh deposits (see 2026-08 investigation on
     eToro GIA: withdrew ~£10k of gains, net deposits legitimately sit
     below cost basis). Flagging that direction as urgently as real missing
     money trained advisers to distrust a nudge that was usually just good
     news, so it is deliberately excluded from the flagged set entirely. */
  function isDiscrepancyFlaggable(d){
    return !!d && d.diff > RECON_TOLERANCE;
  }
  /* "Mark reviewed" (Adviser Workspace, Accounts list) stores the diff at
     the moment an adviser investigated and accepted a gap as explained
     (realized trading losses, FX-recompute drift -- see the same 2026-08
     investigation) so Portfolio Overview stops flagging it. Re-flags if the
     gap drifts meaningfully from what was accepted -- ordinary day-to-day
     FX/price wobble should not retrigger it, but a fresh, different-sized
     problem should. Deliberately not "dismiss forever": a static mute
     would hide a genuinely new issue behind an old, unrelated approval. */
  const DISMISS_DRIFT_FLOOR = 25; // £ -- minimum drift tolerated regardless of size
  const DISMISS_DRIFT_PCT = 0.1; // plus 10% of the accepted amount itself
  function isDiscrepancyDismissed(acc, diff){
    if(!acc || acc.discrepancyDismissedAmount == null) return false;
    // A gap that has shrunk from what was accepted is an improvement, not a
    // new problem -- it always stays dismissed, however far it is shrunk.
    // Only a gap that grows re-opens the flag, and only once it grows past
    // a drift tolerance (ordinary day-to-day FX/price wobble should not
    // retrigger it, but a materially bigger gap should). Previously this
    // check was symmetric, so an improving gap re-flagged exactly like a
    // worsening one -- reading as "still broken" when it had actually
    // gotten better.
    if(diff <= acc.discrepancyDismissedAmount) return true;
    const allowedDrift = Math.max(DISMISS_DRIFT_FLOOR, Math.abs(acc.discrepancyDismissedAmount) * DISMISS_DRIFT_PCT);
    return (diff - acc.discrepancyDismissedAmount) <= allowedDrift;
  }

  TEI.data = {
    defaultClient, mergeDefaults, getEmbeddedClient,
    fmtGBP, uid, isRealId, monthLabel, currentMonthKey, monthsBetweenInclusive,
    MONTH_ABBR, acctLabel, goalTypeLabel, monthInputToDate,
    lookupTickerInfo, SECTOR_OPTIONS,
    DIVIDEND_FREQUENCY_OPTIONS, dividendPeriodsPerYear, dividendFrequencyLabel
  };
  /* ---------- Projection (spec B11, B7) ----------
     The one compounding formula, shared by Forecast and Goals. Steps a
     starting value forward `steps` periods at `rate` a period, adding
     `delta` each period. Goals and Forecast step in months.
     opts (Forecast, B7.2), all optional:
       rise      -- yearly rise in `delta`: delta x (1 + rise)^(whole years)
       perYear   -- periods in a year for `rise` (default 12)
       oneOffs   -- {period: amount}, added after that period's growth; the
                    value never goes below 0
       shocks    -- {period: factor}, e.g. 0.75 for a 25% fall
       rateAt    -- function(period) returning that period's rate, in place
                    of `rate` (the range of outcomes uses this) */
  function projectSeries(startValue, delta, rate, steps, opts){
    const o = opts || {};
    const perYear = o.perYear || 12;
    const series = [startValue];
    let v = startValue;
    for(let i=1; i<=steps; i++){
      const r = o.rateAt ? o.rateAt(i) : rate;
      const add = o.rise ? delta * Math.pow(1 + o.rise, Math.floor((i-1)/perYear)) : delta;
      v = v*(1+r) + add;
      if(o.oneOffs && o.oneOffs[i]) v = Math.max(0, v + o.oneOffs[i]);
      if(o.shocks && o.shocks[i]) v *= o.shocks[i];
      series.push(v);
    }
    return series;
  }

  /* ---------- Goal status (spec B6) ----------
     One rule for Home's headline goal and the Goals page. Growth is the
     5% a year the Goals what-if states. A monetary goal with a target date
     is on track when what goes into its linked accounts each month is
     enough to reach the target by that date; past its date without being
     reached, any goal is behind. */
  const GOAL_GROWTH = 0.05;
  function monthsUntil(dateStr){
    if(!dateStr) return null;
    const d = new Date(dateStr), n = new Date();
    if(isNaN(d)) return null;
    return (d.getFullYear()-n.getFullYear())*12 + (d.getMonth()-n.getMonth());
  }
  function goalLinkedMonthly(client, goal){
    return (goal.linkedAccountIds||[]).reduce((s,id)=>{
      const a = client.accounts.find(x=>x.id===id);
      return s + (a ? acctContribTotal(a) : 0);
    }, 0);
  }
  /* Monthly amount that grows `start` to `target` in `months` at GOAL_GROWTH. */
  function goalMonthlyNeeded(start, target, months){
    if(months <= 0) return Math.max(0, target-start);
    const r = GOAL_GROWTH/12, f = Math.pow(1+r, months);
    return Math.max(0, (target - start*f) * r / (f-1));
  }
  /* Months until `start` reaches `target` at `monthly` a month, or null if
     not within `maxMonths`. */
  function goalMonthsToTarget(start, monthly, target, maxMonths){
    if(start >= target) return 0;
    const i = projectSeries(start, monthly, GOAL_GROWTH/12, maxMonths).findIndex(v=> v >= target);
    return i < 0 ? null : i;
  }
  function goalStatus(client, goal){
    const gp = goalProgress(client, goal);
    const monetary = !goal.progressType || goal.progressType === 'monetary';
    const out = {key:'on-track', label:'On track', gp, monetary, monthsLeft: monthsUntil(goal.targetDate), past:false, monthly:null, needed:null};
    if(goal.status === 'completed' || gp.isComplete){ out.key = 'complete'; out.label = 'Complete'; return out; }
    if(out.monthsLeft != null && out.monthsLeft < 0){ out.key = 'behind'; out.label = 'Behind'; out.past = true; return out; }
    if(monetary && out.monthsLeft != null && gp.target > 0){
      out.monthly = goalLinkedMonthly(client, goal);
      out.needed = goalMonthlyNeeded(gp.current||0, gp.target, out.monthsLeft);
      if(out.monthly + 0.5 < out.needed){ out.key = 'behind'; out.label = 'Behind'; }
    }
    return out;
  }
  /* When a goal was completed: the last 'completed' entry in its history. */
  function goalCompletedDate(goal){
    const h = (goal.statusHistory||[]).filter(e=> e.status === 'completed');
    return h.length ? h[h.length-1].date : null;
  }
  /* ISA allowance left (B5.2, migration 017): each ISA account can hold the
     allowance left, stamped with the UK tax year it belongs to. A tax year
     runs 6 April to 5 April and is written "2026-27". A figure from an
     earlier tax year is out of date: Settings greys it and asks for a
     reset, and Bed & ISA asks before using it. */
  const ISA_TYPES = ['isa', 'cash_isa', 'lisa', 'cash_lisa'];
  function taxYearLabel(date){
    const d = date || new Date();
    const y = (d.getMonth() > 3 || (d.getMonth() === 3 && d.getDate() >= 6)) ? d.getFullYear() : d.getFullYear() - 1;
    return y + '-' + String((y + 1) % 100).padStart(2, '0');
  }
  function isaAllowance(acc){
    const has = acc && acc.isaAllowanceLeft != null && acc.isaAllowanceLeft !== '';
    return { value: has ? Number(acc.isaAllowanceLeft) : null, taxYear: (acc && acc.isaAllowanceTaxYear) || null,
      current: has && acc.isaAllowanceTaxYear === taxYearLabel() };
  }

  TEI.calc = {
    accountTotal, buildMergedMonths, buildUnifiedTotals, latestBreakdown, latestNetWorth,
    trailingReturnPct, acctContribTotal, totalMonthlyContribution,
    pensionAccessAge, ageInYear, latestNonPensionNetWorth, nonPensionMonthlyContribution,
    actualInvestmentMonthlyContribution, actualCashMonthlyContribution, actualTotalSavingInvesting,
    accountHasHoldings, holdingsTotalForAccount, syncAccountValueFromHoldings, stampCryptoAccountUpdated, accrueCashInterest, groupedHoldings,
    computeSignals, pickTopSignal, pickSignals, computeNetWorthFact, computeYtdFact,
    computeBudgetAndFI, computeEoyProjection, computeGoalState, computeSDLT, computeNextBestAction,
    computePortfolioCoach, safetyNet, wealthConversionRate,
    totalEssentialExpenses, totalLifestyleExpenses, cashflowMonth,
    financialFreedomPct, nextMilestone, ROUND_MILESTONES, computeJourney, JOURNEY_STAGES,
    /* Phase 1, Client Foundation derived helpers */
    toMonthlyAmount, totalMonthlyIncome, totalFixedExpenses, totalVariableExpenses,
    netWorth, goalProgress, completion, householdTotals, checkGoalAutoComplete,
    /* Operating Model Refinement, source tagging, monthly history, updates feed */
    stampEdit, seedMonthlyValue, collectClientUpdates, usPricesAsOfText,
    /* Contribution-vs-holdings reconciliation (Portfolio Overview flags +
       Adviser Workspace "Mark reviewed") */
    RECON_TOLERANCE, depositParts, acctContributionBreakdown, acctContributedTotal, contributionDiscrepancy, fmtDiscrepancy,
    RELIEF_RATE, isReliefEligible, openingReliefFor, syncAccountValueFromMonth,
    RELIEF_PENDING_WINDOW, isReliefPending, fmtPendingRelief,
    /* New money vs growth (accounts added mid-history, annualised minimums) */
    accountStartingBalances, joinedByMonth, netChange, annualisedPendingText, MIN_ANNUALISED_MONTHS,
    /* Money-weighted returns */
    moneyInByMonth, moneyWeightedReturn, annualisedReturnPct, monthsBetween, calendarYearWindow,
    isDiscrepancyFlaggable, isDiscrepancyDismissed,
    /* Projection and goal status (Goals redesign, B12.6) */
    projectSeries, GOAL_GROWTH, monthsUntil, goalLinkedMonthly, goalMonthlyNeeded, goalMonthsToTarget, goalStatus, goalCompletedDate,
    /* ISA allowance left (B5.2) */
    ISA_TYPES, taxYearLabel, isaAllowance
  };
})();

