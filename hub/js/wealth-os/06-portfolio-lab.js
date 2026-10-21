window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

(function(){
  const {fmtGBP} = TEI.data;
  const INV_TYPES = ['isa','gia','lisa','pension','crypto'];
  const ACCT_TYPE_LABEL = {isa:'Stocks & Shares ISA', gia:'GIA', lisa:'Stocks & Shares LISA', cash_lisa:'Cash LISA', pension:'Pension', cash:'Current / Deposit Account', cash_isa:'Cash ISA', crypto:'Crypto'};

  function investmentAccounts(client){ return client.accounts.filter(a=> INV_TYPES.includes(a.type)); }

  /* ---------- Account-scoped analysis ----------
     Lets the adviser view Coach's Corner / Companies / Top Holdings /
     Performance Drivers / Portfolio Insights scoped to a single account
     instead of merged across the whole portfolio. Only offered once >=2
     accounts actually have holdings (see wireAnalysisScope) -- with 0 or 1
     such accounts an "All Portfolio" vs "this one account" split would
     just show identical numbers twice.
     Deliberately NOT scoped: Portfolio Overview (poTotal/perf stats/
     acctPillGrid -- already has its own per-account pills, see
     renderOverview) and Dividend income (client.dividendHoldings/
     dividendHistory carry no accountId in the data model at all). */
  let analysisScopeAccountId = null; // null = "All Portfolio"

  function scopedClientView(client, accountId){
    if(!accountId) return client;
    return Object.assign({}, client, {
      holdings: client.holdings.filter(h=>h.accountId===accountId),
      accounts: client.accounts.filter(a=>a.id===accountId)
    });
  }
  /* computeSignals() mixes holdings-composition facts (concentration,
     sector spread -- genuinely meaningful scoped to one account) with
     account-independent life-advice facts that would turn misleading if
     naively scoped -- e.g. filtering client.accounts down to one GIA would
     make pensionAccounts.length read as 0 and wrongly fire "no pension
     logged" on every non-pension account tab, even when the client's
     pension is fine elsewhere. pickTopSignal/pickSignals already support
     excludeIds (used today to de-dupe Coach's Corner against the Insights
     list below it) -- reuse that same mechanism rather than touching
     computeSignals itself. */
  const ACCOUNT_SCOPE_EXCLUDE_SIGNALS = ['pension-no-personal-contribution',
    'pension-contributing-well','no-pension-employed',
    'portfolio-monthly-contribution','strong-saving-high-concentration'];

  function acctHeadingSuffix(client, accountId){
    if(!accountId) return '';
    const acc = client.accounts.find(a=>a.id===accountId);
    return acc ? ', ' + TEI.data.acctLabel(acc) : '';
  }

  function investmentSeries(client, months, invAccts){
    const series = {};
    Object.keys(months).sort().forEach(key=>{
      let sum = 0, any = false;
      invAccts.forEach(a=>{ const v = months[key][a.id]; if(v!=null){ sum += Number(v)||0; any = true; } });
      if(any) series[key] = sum;
    });
    return series;
  }

  function pctReturn(first, last){ return first>0 ? (last-first)/first*100 : null; }
  function cagr(first, last, elapsedYears){ return (first>0 && elapsedYears>0) ? (Math.pow(last/first, 1/elapsedYears)-1)*100 : null; }

  function fmtPct(v){
    if(v==null || isNaN(v)) return '–';
    const s = v>=0 ? '+' : '';
    return s + v.toFixed(1) + '%';
  }
  function pctClass(v){ return v==null ? '' : (v>=0 ? 'accent-up' : 'accent-down'); }

  function accountReturn(client, months, accountId){
    const keys = Object.keys(months).sort().filter(k=> months[k][accountId]!=null);
    if(keys.length < 2) return null;
    const first = Number(months[keys[0]][accountId])||0;
    const last = Number(months[keys[keys.length-1]][accountId])||0;
    const [fy,fm]=keys[0].split('-').map(Number), [ly,lm]=keys[keys.length-1].split('-').map(Number);
    const elapsedYears = (ly-fy)+(lm-fm)/12;
    if(elapsedYears >= 1) return cagr(first, last, elapsedYears);
    return pctReturn(first, last);
  }

  /* Investment return -- deliberately separate from the calendar-based
     YTD/Annualised/All-time (money-weighted from monthly balances, see
     renderOverview) and accountReturn() (per-account, still mixes new money
     in): this one is a holdings-level check. Two possible bases, since neither alone covers
     everything: cost basis only exists for priced/cost-tracked holdings;
     deposits works for any account but only as accurate as what's actually
     been logged (opening lump sum + monthly Deposits widget). Resolved down
     to ONE displayed figure -- cost basis preferred where it exists (more
     precise, updates on every price refresh), deposits as fallback,
     confirmed with user 2026-08 after an earlier side-by-side version read
     as redundant. */
  function holdingsCostBasisReturn(holdings){
    const withCost = holdings.filter(h=>h.costBasis!=null && h.costBasis>0);
    if(!withCost.length) return null;
    const value = withCost.reduce((s,h)=>s+(Number(h.value)||0),0);
    const costBasis = withCost.reduce((s,h)=>s+(Number(h.costBasis)||0),0);
    const gain = value - costBasis;
    return { amount: gain, pct: costBasis>0 ? gain/costBasis*100 : null };
  }
  /* accountIds=null means "whole portfolio" (every account with a logged
     deposit, not just investment types). client.contribLog is keyed
     [monthKey][accountId] -- see TEI.wealthOS's account_deposits mapping.
     openingContributions is the one-off "total contributions to date" lump
     sum entered on the account itself (Adviser Workspace > Accounts) --
     added on top so this has something to work with immediately at account
     setup, before any monthly Deposits history has been logged. */
  function depositsReturn(client, accountIds, currentValue){
    // Same per-account totals as Account Details (incl. the lump sum's
    // bonus/relief), split so the % is on the client's own money.
    let totalDeposited = 0, totalRelief = 0;
    const idSet = accountIds ? new Set(accountIds) : null;
    (client.accounts||[]).forEach(a=>{
      if(idSet && !idSet.has(a.id)) return;
      const cb = TEI.calc.acctContributionBreakdown(client, a.id);
      totalDeposited += cb.opening + cb.paidIn + cb.sacrifice;
      totalRelief += cb.relief;
    });
    if(!totalDeposited && !totalRelief) return null;
    const growth = currentValue - totalDeposited - totalRelief;
    return { amount: growth, pct: totalDeposited>0 ? growth/totalDeposited*100 : null };
  }
  /* The one figure actually shown: cost basis when available, else
     deposits, else null (dash). Returned with `source` so callers can
     optionally note which basis produced it. */
  function investmentReturn(client, accountIds, holdings, currentValue){
    const costRet = holdingsCostBasisReturn(holdings);
    if(costRet && costRet.pct!=null) return Object.assign({source:'cost basis'}, costRet);
    const depRet = depositsReturn(client, accountIds, currentValue);
    if(depRet && depRet.pct!=null) return Object.assign({source:'deposits'}, depRet);
    return null;
  }
  function fmtInvestmentReturn(ret){
    if(!ret || ret.pct==null) return '–';
    const sign = ret.amount>=0 ? '+' : '';
    return `${sign}${fmtGBP(ret.amount)} (${fmtPct(ret.pct)} · ${ret.source})`;
  }

  // acctContributedTotal/contributionDiscrepancy/fmtDiscrepancy/RECON_TOLERANCE
  // moved to TEI.calc (see the calc-engine script block) so Adviser
  // Workspace's "Mark reviewed" control can share the exact same math
  // instead of a second, driftable copy -- called here as TEI.calc.*.

  /* The note under the Wealth page's holdings: investment accounts whose
     balance and money paid in differ (TEI.calc.contributionDiscrepancy;
     only the "unaccounted for" direction flags, and not once marked as
     looking right). The old Portfolio overview figures and account pills
     that were also drawn here went in the clean-up (20 Oct 2026). */
  function renderOverview(client){
    const discEl = document.getElementById('poDiscrepancy');
    if(!discEl) return;
    const acctDiscs = investmentAccounts(client)
      .map(a=>({a, d: TEI.calc.contributionDiscrepancy(client, [a.id])}))
      .filter(x=> TEI.calc.isDiscrepancyFlaggable(x.d) && !TEI.calc.isDiscrepancyDismissed(x.a, x.d.diff));
    if(!acctDiscs.length){ discEl.style.display = 'none'; return; }
    discEl.style.display = '';
    discEl.style.color = 'var(--k-emph-down)';
    const list = acctDiscs.map(x=>`${TEI.data.acctLabel(x.a)} (${fmtGBP(Math.abs(x.d.diff))})`).join(', ');
    discEl.textContent = 'Balance and money paid in differ for ' + list + '. Worth a check in Settings, under Accounts.';
  }

  /* Re-renders every account-scopable card for the current
     analysisScopeAccountId. Deliberately NOT renderOverview -- see the
     header comment on analysisScopeAccountId above for why. Called once
     up front by wireAnalysisScope and again on every switcher click. */
  function applyAnalysisScope(client){
    const scopeId = analysisScopeAccountId;
    if(TEI.render.portfolioLab) TEI.render.portfolioLab(client, scopeId); // Portfolio Analysis & Optimisation -- reads scope itself (needs both the full client, for groupedHoldings, and scopeId, to pick ungrouped-per-account holdings); Performance Drivers now lives inside its Analyse stage, see that file section
    renderPortfolioCoach(client, scopeId);
  }

  function wireAnalysisScope(client){
    const row = document.getElementById('analysisScopeRow');
    const toggle = document.getElementById('analysisScopeToggle');
    const eligible = client.accounts.filter(a=>TEI.calc.accountHasHoldings(client, a.id));
    analysisScopeAccountId = null; // reset to "All Portfolio" on every full render, same as other transient page-entry state in this app
    if(eligible.length < 2){
      row.style.display = 'none';
      applyAnalysisScope(client);
      return;
    }
    row.style.display = '';
    // Same holdings sum each pill's total scope will actually show once selected --
    // matches how the Lab itself totals a scope, not the account's own balance field
    // (which can include cash beyond what's in a priced holding).
    const holdingsTotal = accountId => client.holdings
      .filter(h=>!accountId || h.accountId===accountId)
      .reduce((s,h)=>s+(Number(h.value)||0), 0);
    toggle.innerHTML = `<button type="button" data-scope-account="" class="active">All Portfolio <span class="n">${fmtGBP(holdingsTotal())}</span></button>` +
      eligible.map(a=>`<button type="button" data-scope-account="${a.id}">${TEI.data.acctLabel(a)} <span class="n">${fmtGBP(holdingsTotal(a.id))}</span></button>`).join('');
    toggle.querySelectorAll('[data-scope-account]').forEach(btn=>{
      btn.addEventListener('click', function(){
        toggle.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
        this.classList.add('active');
        analysisScopeAccountId = this.dataset.scopeAccount || null;
        applyAnalysisScope(client);
      });
    });
    applyAnalysisScope(client);
  }

  function renderPortfolioCoach(client, scopeAccountId){
    document.getElementById('pfcHeading').textContent = 'Portfolio coach\'s corner' + acctHeadingSuffix(client, scopeAccountId);
    let pc;
    if(scopeAccountId){
      // Bypass TEI.calc.computePortfolioCoach on purpose: its
      // overrideKey:'portfolioCoach' surfaces a manual, adviser-authored
      // whole-portfolio note that should not be attributed to a single
      // account. computePortfolioCoach itself stays untouched -- it is
      // shared with Adviser Workspace's Insights tab.
      const scoped = scopedClientView(client, scopeAccountId);
      const s = TEI.calc.pickTopSignal(scoped, 'portfolio', {excludeIds: ACCOUNT_SCOPE_EXCLUDE_SIGNALS, fallbackActionLabel:'Review Portfolio', fallbackActionPage:'portfolio'});
      pc = s ? {message:s.message, actionLabel:s.actionLabel, actionPage:s.actionPage}
             : {message:'Holdings look reasonably spread for this account.', actionLabel:null};
    } else {
      pc = TEI.calc.computePortfolioCoach(client);
    }
    document.getElementById('pfcMessage').textContent = pc.message;
    const btn = document.getElementById('pfcActionBtn');
    if(pc.actionLabel){
      btn.textContent = pc.actionLabel + ' →';
      btn.style.display = 'inline-block';
      btn.onclick = (e)=>{ e.preventDefault(); TEI.app.showPage(pc.actionPage||'portfolio'); };
    } else {
      btn.style.display = 'none';
    }
  }

  /* Same as the Wealth page's renderWealthPricesAsOf. */
  function renderPortfolioPricesAsOf(client){
    const el = document.getElementById('poPricesStatus');
    if(el) el.textContent = TEI.calc.usPricesAsOfText(client);
  }

  TEI.render.portfolio = function(client){
    renderOverview(client);
    renderPortfolioPricesAsOf(client);
    wireAnalysisScope(client); // also renders the Portfolio Analysis & Optimisation Lab/Performance Drivers/Insights/Coach's Corner, scoped or not
  };
})();

/* ================= PORTFOLIO ANALYSIS & OPTIMISATION ("the Lab") =================
   Native rebuild of the standalone Portfolio Optimisation Lab, scaled down and wired
   directly into the Portfolio page -- see Portfolio_Lab_OS_Version.md and
   BUILD_HANDOFF.md (design docs, not shipped) for the full spec this follows, and
   wealth_os_lab_full_mockup.html for the clickable reference it was ported from.
   Deliberate departures from that reference, each noted inline where it matters:
     - Its own mutable `state` + template-string rendering DOES carry over here (the
       reference explicitly said not to copy its *code structure*, but this file's own
       established convention for every other page -- renderX(client) functions mutating
       a module-local object, re-rendering via innerHTML -- is the same shape already, so
       following that house convention already satisfies the spirit of that instruction).
     - Scope pills are not rebuilt separately -- this reuses the Portfolio page's existing
       analysisScopeToggle/analysisScopeAccountId mechanism (already scopes Coach's
       Corner, Performance Drivers and Portfolio Insights), called via
       TEI.render.portfolioLab(client, scopeId) from applyAnalysisScope above. That also
       means "All accounts" is TEI.calc.groupedHoldings(client) (ticker-merged) and a
       specific account is that account's own ungrouped holdings, exactly the
       aggregated-vs-per-account distinction flagged as outstanding when this was still
       the standalone Lab.
     - `vol` (illustrative volatility) does not exist in the schema -- reuses the same
       cash/fund/stock heuristic the standalone Lab's calc engine used, rather than
       adding a column for a figure that is labelled "Illustrative" everywhere it is shown.
     - No persistence ("Save scenario for review" is explicitly out of scope per the
       design docs) -- scenario state lives in memory only and resets on scope switch,
       same as the reference build.
     - SIPP-access detection uses each account's real `type` (checked against 'pension'),
       not a hardcoded 'SIPP' string match against the display label the way the
       reference mock did -- this app's account labels are formatted provider+type
       (e.g. "AJ Bell LISA"), which a literal 'SIPP' string would never match. */
window.TEI = window.TEI || {};
TEI.render = TEI.render || {};
(function(){
  const {fmtGBP} = TEI.data;
  function fmtPct(v){ return v==null ? '–' : v.toFixed(1)+'%'; }
  function showToast(msg){
    const el = document.getElementById('toast');
    if(!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(()=>el.classList.remove('show'), 2600);
  }

  const OTHER_THRESHOLD = 3; // % -- below this, a holding folds into "Other" on the small Compare treemaps (the main one folds to fit)
  const CASH_TICKER = 'CASH';

  // Illustrative-volatility heuristic -- ports the standalone Lab's calc-engine assumption
  // (cash ~0%, fund/ETF ~12%, single stock ~28%) rather than a real risk model. Always
  // shown with an "Illustrative" label wherever it appears.
  const KNOWN_FUND_TICKERS = new Set(['VWRL','VUSA','VOO','SPY','QQQ','VWCE','VEVE','VMID','VUKE','JEPQ','JEPI','SGLN','IUSA','ISF','VHYL','VGOV','AGGH','IVV']);
  const ILLUSTRATIVE_VOL_BY_TYPE = {cash:0.5, fund:12, stock:28};
  function illustrativeVolFor(h){
    const ticker = (h.ticker||'').toUpperCase();
    const name = (h.name||'').toLowerCase();
    if(ticker===CASH_TICKER || name==='cash') return ILLUSTRATIVE_VOL_BY_TYPE.cash;
    if(KNOWN_FUND_TICKERS.has(ticker) || /\b(etf|fund|trust|index|tracker)\b/.test(name)) return ILLUSTRATIVE_VOL_BY_TYPE.fund;
    return ILLUSTRATIVE_VOL_BY_TYPE.stock;
  }

  const STAGES = [
    {id:'analyse', label:'Analyse'},
    {id:'optimise', label:'Optimise'},
    {id:'compare', label:'Compare'},
    {id:'implement', label:'Implement'},
    {id:'results', label:'Results'}
  ];
  function stageIndex(id){ return STAGES.findIndex(s=>s.id===id); }

  const state = {
    holdings: [],       // this render's scoped holdings -- {id,ticker,name,value,account,accountPension,vol}
    driverRows: [],     // Performance-drivers rows -- {name,gain}, only holdings with a cost basis
    driverEmptyNote: '',
    scopeKey: undefined, // tracks the last scopeId rendered, so a genuine scope switch resets scenario state
    expanded:false, stage:'analyse',
    scenarioActive:false, presetType:null,
    capPct:20,
    moveUnit:'£', moveSourceIds:new Set(), moveSourceAmounts:{}, moveDestMode:'prorata', moveDestIds:new Set(), moveDestAmounts:{},
    cashAmount:10000, raiseCashTargetPct:10,
    selectedIds:new Set(), consolidateTargetId:null,
    targetWeights:{},
    ledgerOpen:false, implementOpen:false,
    // Treemap switches -- in memory only. hide:true = switch off, that money left out.
    // Off by default, so the Lab opens on actively managed money (B5.1 board).
    hide:{setAndForget:true, earmarked:true},
    filterAvail:{}, filterKey:'', fullTotal:null,
    client:null, scopeId:null // last render's inputs, so a chip click can re-render itself
  };

  function resetScenarioState(){
    state.expanded = false; state.stage = 'analyse';
    // Reallocate capital is the default selection (B5.2): by amount, nothing ticked yet.
    state.scenarioActive = true; state.presetType = 'move'; state.reallocMode = 'amount';
    state.capPct = 20; state.moveUnit = '£';
    state.moveSourceIds = new Set(); state.moveSourceAmounts = {};
    state.moveDestMode = 'prorata'; state.moveDestIds = new Set(); state.moveDestAmounts = {};
    state.cashAmount = 10000; state.raiseCashTargetPct = 10;
    state.freshMode = 'lump'; state.freshLump = '10000'; state.freshMonthly = '500'; state.freshMonths = '12';
    state.raiseUnit = '£'; state.raiseValue = '5000';
    state.bed = {holdingId:null, isaId:null, amount:'', allowance:''};
    state.selectedIds = new Set(); state.consolidateTargetId = null;
    state.targetWeights = {}; state.ledgerOpen = false; state.implementOpen = false;
    state.targetMode = 'holding'; state.classWeights = {};
  }

  /* Target allocation by asset class (B5.2, migration 018): one share for
     each asset class in this view; the holdings in a class keep their mix
     within it. Only classes that hold money here are offered. */
  function labClasses(){
    const total = state.holdings.reduce((s,h)=> s + h.value, 0);
    const by = {};
    state.holdings.forEach(h=>{ const k = h.assetClass || 'shares'; by[k] = (by[k]||0) + h.value; });
    return Object.keys(TEI.calc.ASSET_CLASSES).filter(k=> by[k] > 0)
      .map(k=> ({key:k, label:TEI.calc.ASSET_CLASSES[k], value:by[k], weight: total ? by[k]/total*100 : 0}));
  }
  function targetByClass(){ return state.targetMode === 'class' && labClasses().length > 1; }
  function targetSum(){
    return targetByClass()
      ? labClasses().reduce((s,c)=> s + (Number(state.classWeights[c.key])||0), 0)
      : state.holdings.reduce((s,h)=> s + (Number(state.targetWeights[h.id])||0), 0);
  }

  /* "Hide set-and-forget" / "Hide earmarked" chips above the treemap, driven by
     the account settings in Manual Entry -> Accounts -> More options. Filtering
     is per account and happens before ticker-grouping, so a ticker held in both
     an earmarked LISA and an ordinary ISA keeps its ISA part. The Lab models
     whatever the chips leave (state.holdings), so every weight, scenario and
     Performance-drivers row is against the filtered total. "All accounts" scope
     only -- a single-account scope ignores the chips (they'd just empty it).
     A chip only appears when some account with that setting actually has
     holdings, i.e. when it would change the treemap. Nothing outside the Lab
     (net worth, Overview, Coach's Corner, Insights, forecast...) is filtered. */
  const FILTERS = [
    {key:'setAndForget', label:'Hide set-and-forget'},
    {key:'earmarked', label:'Hide earmarked'}
  ];
  function filterAvailability(client, scopeId){
    const avail = {};
    FILTERS.forEach(f=>{
      avail[f.key] = !scopeId && client.accounts.some(a=> a[f.key] && client.holdings.some(h=>h.accountId===a.id));
    });
    return avail;
  }
  function anyFilterOn(){ return FILTERS.some(f=> state.hide[f.key] && state.filterAvail[f.key]); }
  function filteredClient(client){
    const hidden = new Set(client.accounts
      .filter(a=> FILTERS.some(f=> state.hide[f.key] && state.filterAvail[f.key] && a[f.key]))
      .map(a=>a.id));
    if(!hidden.size) return client;
    return Object.assign({}, client, {holdings: client.holdings.filter(h=>!hidden.has(h.accountId))});
  }

  /* All accounts -> TEI.calc.groupedHoldings(client), ticker-merged (a holding split
     across an ISA and a GIA is one line, summed) -- accountPension is true if ANY
     contributing account is a pension, since a merged holding can span several wrappers.
     A specific account -> that account's own holdings, ungrouped (each is already a
     distinct position; account is trivially that one account's own label throughout, so
     cross-wrapper detection correctly never fires within a single-account scope). */
  function buildLabHoldings(client, scopeId){
    if(scopeId){
      const acc = client.accounts.find(a=>a.id===scopeId);
      const label = acc ? TEI.data.acctLabel(acc) : 'This account';
      const isPension = !!(acc && acc.type==='pension');
      return client.holdings.filter(h=>h.accountId===scopeId).map(h=>({
        id:h.id, ticker:(h.ticker||'').toUpperCase(), name:h.name, value:Number(h.value)||0,
        account:label, accountPension:isPension, accountType: acc ? acc.type : null, vol: illustrativeVolFor(h),
        assetClass: TEI.calc.holdingAssetClass(h)
      }));
    }
    const grouped = TEI.calc.groupedHoldings(client);
    return grouped.map(g=>{
      const involved = (g.accountIds||[]).map(id=>client.accounts.find(a=>a.id===id)).filter(Boolean);
      const anyPension = involved.some(a=>a.type==='pension');
      // Tile colour follows the account type (B5 palette); a holding held in
      // several accounts takes the type of the account holding most of it.
      const byAcct = {};
      client.holdings.forEach(h=>{
        const key = (h.ticker && h.ticker.trim()) ? h.ticker.trim().toUpperCase() : 'name:'+h.name.trim().toLowerCase();
        if(key === g.key) byAcct[h.accountId] = (byAcct[h.accountId]||0) + (Number(h.value)||0);
      });
      const mainId = Object.keys(byAcct).sort((a,b)=> byAcct[b]-byAcct[a])[0];
      const mainAcc = client.accounts.find(a=>a.id===mainId);
      // Asset class: the largest holding in the group that has one set.
      const classed = client.holdings.filter(h=>{
        const key = (h.ticker && h.ticker.trim()) ? h.ticker.trim().toUpperCase() : 'name:'+h.name.trim().toLowerCase();
        return key === g.key && h.assetClass;
      }).sort((a,b)=> (Number(b.value)||0) - (Number(a.value)||0))[0];
      return {
        id:g.key, ticker:(g.ticker||'').toUpperCase(), name:g.name, value:g.value,
        account: (g.accountNames||[]).length>1 ? `${g.accountNames.length} accounts` : ((g.accountNames||[])[0]||'–'),
        accountPension:anyPension, accountType: mainAcc ? mainAcc.type : null, vol: illustrativeVolFor(g),
        assetClass: TEI.calc.holdingAssetClass(classed || {ticker:g.ticker, name:g.name})
      };
    });
  }

  // Performance drivers -- unrealised gain/loss vs. cost basis. Genuinely different
  // from the concentration/weight figures above it (this is P&L, not exposure), so
  // folded into Analyse rather than dropped when its old standalone card came out --
  // redesigned as a shared-scale diverging bar list, not a straight port of that
  // card's plain two-column text layout. Same aggregation rule as buildLabHoldings:
  // "All accounts" sums both value and cost basis per ticker/name group, a specific
  // account uses its own holdings' cost basis individually.
  function buildDriverRows(client, scopeId){
    if(scopeId){
      return client.holdings
        .filter(h=>h.accountId===scopeId && h.costBasis!=null && h.costBasis>0)
        .map(h=>({name:h.name, gain:(Number(h.value)||0) - Number(h.costBasis)}));
    }
    const groups = {};
    client.holdings.forEach(h=>{
      if(h.costBasis==null || h.costBasis<=0) return;
      const key = (h.ticker && h.ticker.trim()) ? h.ticker.trim().toUpperCase() : 'name:'+h.name.trim().toLowerCase();
      if(!groups[key]) groups[key] = {name:h.name, value:0, costBasis:0};
      groups[key].value += Number(h.value)||0;
      groups[key].costBasis += Number(h.costBasis)||0;
    });
    return Object.values(groups).map(g=>({name:g.name, gain:g.value-g.costBasis}));
  }
  // Cost basis comes from two different places depending on the holding: a manual
  // "Cost basis £" entry for tickerless holdings, or avgOpen + a live-price refresh
  // for ticker'd ones (the manual field is hidden for those). Point at whichever
  // actually applies rather than a single blanket message -- same distinction the
  // old standalone card's empty-state copy made.
  function driverEmptyNote(client, scopeId){
    const holdings = scopeId ? client.holdings.filter(h=>h.accountId===scopeId) : client.holdings;
    const tips = [];
    if(holdings.some(h=>h.ticker)) tips.push('for a holding with a ticker, add its average opening price in Settings, under Holdings');
    if(holdings.some(h=>!h.ticker)) tips.push('for others, add a cost basis in Settings, under Holdings');
    return `Add cost basis to your holdings to see performance drivers${tips.length?', '+tips.join(', or '):''}.`;
  }

  /* ---------------------------- calculation engine ---------------------------- */
  function grandTotal(){ return state.holdings.reduce((s,h)=>s+h.value,0); }
  function withWeights(list){
    const total = list.reduce((s,h)=>s+h.value,0);
    return list.map(h=>({...h, weight: total? h.value/total*100 : 0})).sort((a,b)=>b.value-a.value);
  }
  function foldOther(weighted){
    const main = weighted.filter(h=>h.weight>=OTHER_THRESHOLD);
    const folded = weighted.filter(h=>h.weight<OTHER_THRESHOLD);
    const out = [...main];
    if(folded.length){
      const otherValue = folded.reduce((s,h)=>s+h.value,0);
      const total = weighted.reduce((s,h)=>s+h.value,0);
      out.push({ticker:'Other', name:`${folded.length} smaller holdings`, value:otherValue, weight: total? otherValue/total*100:0, isOther:true, members:folded});
    }
    return out;
  }
  function concentrationSummary(weighted){
    const sorted=[...weighted].sort((a,b)=>b.weight-a.weight);
    const top=n=>sorted.slice(0,n).reduce((s,h)=>s+h.weight,0);
    return {top1:top(1), top3:top(3), top5:top(5)};
  }
  function effectiveHoldings(weighted){
    const s = weighted.reduce((s,h)=> s+Math.pow(h.weight/100,2), 0);
    return s>0 ? 1/s : 0;
  }
  function illustrativeVol(weighted){
    return weighted.reduce((s,h)=> s+(h.weight/100)*(h.vol||0), 0);
  }
  // The approximate single-holding move (all else equal) required to shift total portfolio
  // value by 1% -- smaller for larger holdings, i.e. "how small a wobble in this one thing
  // moves my whole portfolio."
  function moveNeededFor1Pct(weightPct){
    if(!weightPct || weightPct===0) return null;
    return 1/(weightPct/100);
  }

  /* ---------------------------- scenario engine ---------------------------- */
  function findCash(){ return state.holdings.find(h=>h.ticker===CASH_TICKER); }

  function moveSourceGBP(h){
    const rawStr = state.moveSourceAmounts[h.id];
    const raw = Number(rawStr)||0;
    if(state.moveUnit==='£') return Math.min(raw, h.value);
    if(state.moveUnit==='share'){
      // Reallocate by new share (B5.2): sell down to the share entered, of the scope total.
      if(rawStr===undefined || rawStr==='') return 0;
      const total = state.holdings.reduce((s,x)=>s+x.value,0);
      return Math.max(0, h.value - total*Math.min(raw,100)/100);
    }
    return Math.min(raw,100)/100 * h.value;
  }

  /* Allocate fresh capital (B5.2): the new money, a lump sum or a monthly
     amount over a number of months, goes to the ticked holdings furthest
     below an equal share of them first. Nothing is sold. */
  function freshTotal(){
    if(state.freshMode==='monthly') return (Number(state.freshMonthly)||0) * (Number(state.freshMonths)||0);
    return Number(state.freshLump)||0;
  }
  function freshAllocations(){
    const selected = scenarioPool().filter(h=>state.selectedIds.has(h.id));
    const C = freshTotal(), out = {};
    if(!selected.length || C<=0) return out;
    const S = selected.reduce((s,h)=>s+h.value,0);
    const goal = (S + C)/selected.length;
    const deficits = selected.map(h=> Math.max(0, goal - h.value));
    const D = deficits.reduce((s,d)=>s+d,0);
    selected.forEach((h,i)=>{ out[h.id] = D>0 ? C*deficits[i]/D : C/selected.length; });
    return out;
  }

  /* Raise cash (B5.2): a set amount, in £ or as a % of the money in scope,
     taken in proportion from the holdings ticked. */
  function raiseAmount(){
    const total = state.holdings.reduce((s,h)=>s+h.value,0);
    const v = Number(state.raiseValue)||0;
    const want = state.raiseUnit==='%' ? total*Math.min(v,100)/100 : v;
    const avail = scenarioPool().filter(h=>state.selectedIds.has(h.id)).reduce((s,h)=>s+h.value,0);
    return Math.max(0, Math.min(want, avail));
  }

  /* Bed & ISA (B5.2): sell a GIA holding and buy the same holding in an ISA,
     up to the ISA allowance left. Works on the real account holdings, not
     the ticker-grouped treemap tiles, since the money only changes wrapper. */
  function bedSourcePool(){
    const c = state.client; if(!c) return [];
    const gia = c.accounts.filter(a=> a.type==='gia' && (!state.scopeId || a.id===state.scopeId)).map(a=>a.id);
    return c.holdings.filter(h=> gia.includes(h.accountId) && (Number(h.value)||0) > 0);
  }
  function bedIsaPool(){ const c = state.client; return c ? c.accounts.filter(a=> a.type==='isa') : []; }
  function bedSource(){ return bedSourcePool().find(h=> h.id===state.bed.holdingId) || null; }
  function bedIsa(){ const pool = bedIsaPool(); return pool.find(a=> a.id===state.bed.isaId) || (pool.length===1 ? pool[0] : null); }
  /* The allowance left: what was typed for this scenario, otherwise the
     figure saved on the chosen ISA in Settings (migration 017) when it is
     for this tax year. An out-of-date or missing figure means asking. */
  function bedSaved(){ return TEI.calc.isaAllowance(bedIsa()); }
  function bedAllowance(){
    if(state.bed.allowance !== '') return Number(state.bed.allowance)||0;
    const s = bedSaved();
    return s.current ? s.value : null;
  }
  function bedCap(){
    const h = bedSource();
    const allowance = bedAllowance();
    if(!h || allowance==null) return 0;
    return Math.min(allowance, Number(h.value)||0);
  }
  function bedAmount(){ return Math.max(0, Math.min(Number(state.bed.amount)||0, bedCap())); }
  function bedGain(){
    const h = bedSource(); const amt = bedAmount();
    if(!h || !amt || !(Number(h.costBasis)>0) || !(Number(h.value)>0)) return null;
    return (Number(h.value) - Number(h.costBasis)) * amt / Number(h.value);
  }
  function taxYearLabel(){
    const d = new Date(); const y = d.getFullYear();
    const start = (d.getMonth() > 3 || (d.getMonth()===3 && d.getDate()>=6)) ? y : y-1;
    return start + ' to ' + (start+1);
  }
  function moveTotalRaised(){
    return [...state.moveSourceIds].reduce((s,id)=>{
      const h = state.holdings.find(x=>x.id===id); return h ? s+moveSourceGBP(h) : s;
    },0);
  }
  function moveDestGBP(h, totalRaised){
    const raw = Number(state.moveDestAmounts[h.id])||0;
    if(state.moveUnit==='£') return raw;
    return raw/100 * totalRaised;
  }
  function moveAllocatedTotal(){
    const totalRaised = moveTotalRaised();
    return [...state.moveDestIds].reduce((s,id)=>{
      const h = state.holdings.find(x=>x.id===id); return h ? s+moveDestGBP(h, totalRaised) : s;
    },0);
  }

  function scenarioPool(){
    const base = state.holdings;
    if(state.presetType==='cap'){
      const total = base.reduce((s,h)=>s+h.value,0);
      const capValue = total * state.capPct/100;
      return base.filter(h=>h.value <= capValue);
    }
    if(state.presetType==='raisecash' || state.presetType==='freshcash') return base.filter(h=>h.ticker!==CASH_TICKER);
    return base;
  }
  function moveSourcePool(){ return state.holdings.filter(h=>!state.moveDestIds.has(h.id)); }
  function moveDestPool(){ return state.holdings.filter(h=>!state.moveSourceIds.has(h.id)); }

  function scenarioCanProceed(){
    if(!state.scenarioActive) return false;
    const base = state.holdings;
    if(state.presetType==='equal') return scenarioPool().filter(h=>state.selectedIds.has(h.id)).length >= 2;
    if(state.presetType==='bedisa') return !!bedSource() && !!bedIsa() && bedAmount() > 0.5;
    if(state.presetType==='cap'){
      const total = base.reduce((s,h)=>s+h.value,0);
      const capValue = total * state.capPct/100;
      const overCap = base.filter(h=>h.value > capValue);
      if(overCap.length===0) return false;
      return scenarioPool().filter(h=>state.selectedIds.has(h.id)).length > 0;
    }
    if(state.presetType==='move'){
      const totalRaised = moveTotalRaised();
      const sourcesOk = state.moveSourceIds.size>0 && totalRaised>0.5;
      let destOk = state.moveDestIds.size>0;
      if(destOk && state.moveDestMode==='manual') destOk = Math.abs(moveAllocatedTotal()-totalRaised) < 0.5;
      return sourcesOk && destOk;
    }
    if(state.presetType==='freshcash') return freshTotal() > 0.5 && scenarioPool().filter(h=>state.selectedIds.has(h.id)).length > 0;
    if(state.presetType==='raisecash') return raiseAmount() > 0.5;
    if(state.presetType==='target') return Math.abs(targetSum()-100) < 0.5;
    if(state.presetType==='consolidate') return state.selectedIds.size>0 && !!state.consolidateTargetId;
    return false;
  }

  // Every preset's only job: produce a scenario holdings array in the same shape as
  // state.holdings, just with different values. Implement/Results/the move-needed table
  // derive everything else generically from the before/after diff -- see scenarioMoves().
  function getScenarioHoldings(){
    const base = state.holdings;
    if(!state.scenarioActive) return base;
    const scopeTotal = base.reduce((s,h)=>s+h.value,0);

    if(state.presetType==='equal'){
      // Equal shares across the holdings picked; the rest are left alone.
      const picked = base.filter(h=>state.selectedIds.has(h.id));
      if(picked.length < 2) return base;
      const per = picked.reduce((s,h)=>s+h.value,0) / picked.length;
      return base.map(h=> state.selectedIds.has(h.id) ? {...h, value: per} : h);
    }
    if(state.presetType==='bedisa') return base; // the mix is unchanged; only the wrapper moves
    if(state.presetType==='cap'){
      const capValue = scopeTotal * state.capPct/100;
      const overCap = base.filter(h=>h.value > capValue);
      const excess = overCap.reduce((s,h)=>s+(h.value-capValue),0);
      const selected = scenarioPool().filter(h=>state.selectedIds.has(h.id));
      const selectedTotal = selected.reduce((s,h)=>s+h.value,0);
      const out = base.map(h=>{
        if(overCap.find(o=>o.id===h.id)) return {...h, value: capValue};
        if(selected.find(s=>s.id===h.id)){
          const share = selectedTotal>0 ? h.value/selectedTotal : 0;
          return {...h, value: h.value + excess*share};
        }
        return h;
      });
      if(selected.length===0 && overCap.length>0) out.push({id:'_pending', ticker:'Pending', name:'Uncommitted, pick where the excess lands', value:excess, account:'–', accountPension:false, vol:0, isPending:true});
      return out;
    }
    if(state.presetType==='move'){
      const totalRaised = moveTotalRaised();
      let out = base.map(h=> state.moveSourceIds.has(h.id) ? {...h, value: Math.max(0, h.value - moveSourceGBP(h))} : h);
      if(state.moveDestMode==='prorata'){
        const destPoolBase = base.filter(h=>state.moveDestIds.has(h.id));
        const selectedTotal = destPoolBase.reduce((s,h)=>s+h.value,0);
        if(destPoolBase.length===0){
          if(totalRaised>0.5) out.push({id:'_pending', ticker:'Pending', name:'Unallocated proceeds', value:totalRaised, account:'–', accountPension:false, vol:0, isPending:true});
        } else {
          out = out.map(h=>{
            if(state.moveDestIds.has(h.id)){
              const share = selectedTotal>0 ? h.value/selectedTotal : 1/destPoolBase.length;
              return {...h, value: h.value + totalRaised*share};
            }
            return h;
          });
        }
      } else {
        out = out.map(h=> state.moveDestIds.has(h.id) ? {...h, value: h.value + moveDestGBP(h, totalRaised)} : h);
        const allocated = moveAllocatedTotal();
        if(allocated < totalRaised - 0.5) out.push({id:'_pending', ticker:'Pending', name:'Unallocated proceeds', value:totalRaised-allocated, account:'–', accountPension:false, vol:0, isPending:true});
      }
      return out;
    }
    if(state.presetType==='freshcash'){
      const alloc = freshAllocations();
      const out = base.map(h=> alloc[h.id] ? {...h, value: h.value + alloc[h.id]} : h);
      if(!Object.keys(alloc).length && freshTotal()>0) out.push({id:'_pending', ticker:'Pending', name:'New money, not placed yet', value:freshTotal(), account:'-', accountPension:false, vol:0, isPending:true});
      return out;
    }
    if(state.presetType==='raisecash'){
      const amount = raiseAmount();
      const selected = scenarioPool().filter(h=>state.selectedIds.has(h.id));
      const selectedTotal = selected.reduce((s,h)=>s+h.value,0);
      const cash = findCash();
      const out = base.map(h=>{
        if(cash && h.id===cash.id) return {...h, value: h.value + amount};
        if(selected.find(s=>s.id===h.id)){
          const share = selectedTotal>0 ? h.value/selectedTotal : 0;
          return {...h, value: Math.max(0, h.value - amount*share)};
        }
        return h;
      });
      if(!cash && amount>0.5) out.push({id:'_cash', ticker:CASH_TICKER, name:'Cash raised', value:amount, account:'Cash', accountPension:false, accountType:'cash', vol:0});
      return out;
    }
    if(state.presetType==='target'){
      if(targetByClass()){
        const byKey = {};
        labClasses().forEach(c=> byKey[c.key] = c);
        return base.map(h=>{
          const k = h.assetClass || 'shares', c = byKey[k];
          const classTarget = scopeTotal * (Number(state.classWeights[k])||0)/100;
          return {...h, value: c && c.value ? classTarget * h.value / c.value : 0};
        });
      }
      return base.map(h=>({...h, value: scopeTotal * (Number(state.targetWeights[h.id])||0)/100}));
    }
    if(state.presetType==='consolidate'){
      const sources = base.filter(h=>state.selectedIds.has(h.id));
      const sumSources = sources.reduce((s,h)=>s+h.value,0);
      return base.map(h=>{
        if(state.selectedIds.has(h.id)) return {...h, value:0};
        if(h.id===state.consolidateTargetId) return {...h, value: h.value+sumSources};
        return h;
      });
    }
    return base;
  }

  // Works identically for all 7 presets -- a holding that shrinks is a sell, one that
  // grows is a buy. No preset-specific listing logic (see BUILD_HANDOFF.md's warning
  // about why that is the mistake to avoid if a new preset gets added later).
  function scenarioMoves(){
    if(state.presetType==='bedisa'){
      // The holding is the same before and after, so the moves come from the preset itself.
      const h = bedSource(), isa = bedIsa(), amt = bedAmount();
      if(!h || !isa || !amt) return {sells:[], buys:[], netFlow:0};
      const gia = state.client.accounts.find(a=>a.id===h.accountId);
      return {
        sells:[{name:h.name, account: gia ? TEI.data.acctLabel(gia) : 'GIA', accountPension:false, accountType:'gia', amount:amt}],
        buys:[{name:h.name, account: TEI.data.acctLabel(isa), accountPension:false, accountType:'isa', amount:amt}],
        netFlow:0
      };
    }
    const base = state.holdings;
    const scenario = getScenarioHoldings().filter(h=>!h.isPending);
    const sells = [], buys = [];
    base.forEach(b=>{
      const after = scenario.find(h=>h.id===b.id);
      if(!after) return;
      const diff = after.value - b.value;
      if(diff < -0.5) sells.push({name:b.name, account:b.account, accountPension:b.accountPension, accountType:b.accountType, amount:-diff});
      else if(diff > 0.5) buys.push({name:b.name, account:b.account, accountPension:b.accountPension, accountType:b.accountType, amount:diff});
    });
    // Raise cash with no cash holding in scope: the freed money shows as cash.
    const raised = scenario.find(h=>h.id==='_cash');
    if(raised) buys.push({name:'Cash', account:'Cash', accountPension:false, accountType:'cash', amount:raised.value});
    const baseTotal = base.reduce((s,h)=>s+h.value,0);
    const scenarioTotal = scenario.reduce((s,h)=>s+h.value,0);
    return {sells, buys, netFlow: scenarioTotal - baseTotal};
  }
  // Nets sells against buys *per account*, not "did this account get any buy at all" --
  // a £5,060 sale from a GIA holding that funds £4,807 back into another GIA holding plus
  // £253 into an ISA is still a cross-wrapper move for that £253; checking "did GIA get
  // any buy" would miss it.
  function crossWrapperFlags(sells, buys){
    const net = {}, pensionByAccount = {}, typeByAccount = {};
    sells.forEach(s=>{ net[s.account]=(net[s.account]||0)-s.amount; pensionByAccount[s.account]=pensionByAccount[s.account]||s.accountPension; typeByAccount[s.account]=typeByAccount[s.account]||s.accountType; });
    buys.forEach(b=>{ net[b.account]=(net[b.account]||0)+b.amount; pensionByAccount[b.account]=pensionByAccount[b.account]||b.accountPension; typeByAccount[b.account]=typeByAccount[b.account]||b.accountType; });
    const leftWrapper = Object.keys(net).filter(a=> net[a] < -0.5);
    const intoAccounts = Object.keys(net).filter(a=> net[a] > 0.5);
    return {
      leftWrapper, intoAccounts,
      sippLeft: leftWrapper.some(a=>pensionByAccount[a]),
      isaLeft: leftWrapper.some(a=> ['isa','lisa','cash_isa','cash_lisa'].includes(typeByAccount[a])),
      otherLeft: leftWrapper.filter(a=> !pensionByAccount[a] && !['isa','lisa','cash_isa','cash_lisa'].includes(typeByAccount[a]))
    };
  }
  /* Cross-wrapper wording (B5.1), shared by Implement and Results. Stated as
     mechanics, never as advice. */
  function crossFlagsHTML(flags){
    let html = '';
    if(flags.isaLeft) html += `<div class="lab-cross-flag">Once it leaves the ISA wrapper, that allowance cannot be used again this tax year.</div>`;
    if(flags.otherLeft.length) html += `<div class="lab-cross-flag">Selling in ${flags.otherLeft.join(', ')} is a sale for tax purposes, which can have consequences of its own. Shown for illustration only.</div>`;
    if(flags.sippLeft) html += `<div class="lab-cross-flag">This takes money out of a pension, where access rules and tax apply. Shown for illustration only.</div>`;
    return html;
  }
  // "moves from [account] to [account]" (B5.1)
  function movesSummaryHTML(sells, buys){
    const flags = crossWrapperFlags(sells, buys);
    if(!flags.leftWrapper.length || !flags.intoAccounts.length) return '';
    const out = sells.filter(s=> flags.leftWrapper.includes(s.account)).reduce((s,x)=>s+x.amount,0);
    return `<p class="lab-moves-summary">${fmtGBP(out)} moves from ${flags.leftWrapper.join(', ')} to ${flags.intoAccounts.join(', ')}.</p>`;
  }

  /* ---------------------------- treemap (plain SVG, no chart library) ---------------------------- */
  /* Largest-first, but "Other" always goes last. layoutTreemap fills from the top-left and
     always leaves the remaining space in the bottom-right, so the last item lands in the
     bottom-right corner. */
  function treemapOrder(items){
    const named = items.filter(d=>!d.isOther).sort((a,b)=>b.value-a.value);
    return [...named, ...items.filter(d=>d.isOther)];
  }
  /* Squarified treemap (Bruls, Huizing & van Wijk): lays items out in rows along the
     shorter side, adding to a row only while that keeps its tiles closer to square. The
     old half-and-half split made long thin strips on a narrow phone screen, which then
     failed foldToFit's minimum size and got pushed into "Other". Keeps the given order. */
  function layoutTreemap(items, x0,y0,x1,y1){
    const out = [];
    const total = items.reduce((s,d)=>s+d.value,0);
    if(!items.length) return out;
    if(!(total>0)) return items.map(d=>({...d, x0,y0,x1:x0,y1:y0}));
    const scale = (x1-x0)*(y1-y0)/total;
    const worst = (row, side)=>{
      const sum = row.reduce((s,d)=>s+d.value*scale,0);
      let w = 0;
      row.forEach(d=>{ const a = d.value*scale; if(a>0) w = Math.max(w, side*side*a/(sum*sum), sum*sum/(side*side*a)); });
      return w;
    };
    let i = 0;
    while(i < items.length){
      const w = x1-x0, h = y1-y0, side = Math.min(w,h);
      let row = [items[i++]];
      while(i < items.length && worst([...row, items[i]], side) <= worst(row, side)) row.push(items[i++]);
      const rowSum = row.reduce((s,d)=>s+d.value,0);
      const remaining = items.slice(i).reduce((s,d)=>s+d.value,0);
      const frac = (rowSum+remaining) ? rowSum/(rowSum+remaining) : 1;
      if(w >= h){
        const xm = i===items.length ? x1 : x0 + w*frac;
        let y = y0;
        row.forEach((d,k)=>{ const yEnd = k===row.length-1 ? y1 : y + h*(rowSum? d.value/rowSum : 1/row.length); out.push({...d, x0, y0:y, x1:xm, y1:yEnd}); y = yEnd; });
        x0 = xm;
      } else {
        const ym = i===items.length ? y1 : y0 + h*frac;
        let x = x0;
        row.forEach((d,k)=>{ const xEnd = k===row.length-1 ? x1 : x + w*(rowSum? d.value/rowSum : 1/row.length); out.push({...d, x0:x, y0, x1:xEnd, y1:ym}); x = xEnd; });
        y0 = ym;
      }
    }
    return out;
  }
  /* Main treemap grouping (desktop and mobile). A fixed % cut-off hides too much on a single
     account like an ISA: a dozen 2-4% holdings all fold into one big "Other" even when there is
     room to show them. Instead: start with every holding on its own tile, then fold the
     smallest into "Other" until every named tile is big enough to carry a readable label.
     So a holding only goes into "Other" when it genuinely cannot be labelled. */
  function foldToFit(weighted, width, height, minW, minH){
    const sorted = [...weighted].sort((a,b)=>b.value-a.value);
    const total = sorted.reduce((s,h)=>s+h.value,0);
    let keep = sorted, fold = [];
    const build = ()=>{
      if(fold.length < 2) return [...keep, ...fold];
      const v = fold.reduce((s,h)=>s+h.value,0);
      return [...keep, {ticker:'Other', name:`${fold.length} smaller holdings`, value:v, weight: total? v/total*100 : 0, isOther:true, members:fold}];
    };
    for(let guard=0; guard<sorted.length; guard++){
      const items = build();
      if(items.length <= 2) break;
      const tiles = layoutTreemap(treemapOrder(items), 0,0,width,height);
      const bad = tiles.filter(t=> !t.isOther && ((t.x1-t.x0) < minW-0.5 || (t.y1-t.y0) < minH-0.5));
      if(!bad.length || keep.length <= 2) break;
      const smallest = keep[keep.length-1];
      keep = keep.slice(0,-1);
      fold = [...fold, smallest];
    }
    return build();
  }
  /* Colour tiles so touching tiles look different. The palette's two navies and two golds
     are near-identical side by side, so neighbours avoid the same colour *family* where
     possible (else just the exact colour), and ties go to the least-used colour so the
     treemap does not end up mostly navy. Index-only colouring put e.g. two gold tiles together. */
  /* Tiles are coloured by account type, as on the Wealth board (B5): the
     same colour means the same kind of account. Each entry is [fill, text].
     The 3px gap between tiles keeps neighbours of one type apart. */
  const TYPE_TILE = {
    pension:['#E8D6A8','#13213A'], isa:['#B9CAE6','#13213A'], lisa:['#DFE6F2','#13213A'],
    gia:['#2E7F7B','#FFFFFF'], cash:['#AAB6C8','#13213A'], cash_isa:['#AAB6C8','#13213A'], cash_lisa:['#AAB6C8','#13213A'],
    crypto:['#6F7F98','#FFFFFF'], other:['#C9D3E3','#13213A']
  };
  const TYPE_LABEL = {pension:'Pension', isa:'S&S ISA', lisa:'Lifetime ISA', gia:'GIA', cash:'Cash', cash_isa:'Cash', cash_lisa:'Cash', crypto:'Crypto', other:'Other accounts'};
  const OTHER_TILE = ['#E9E5DA','#13213A'];
  function tileTypeOf(d){
    if(d.isOther) return null;
    const t = (d.accountType === 'cash_isa' || d.accountType === 'cash_lisa') ? 'cash' : d.accountType;
    return TYPE_TILE[t] ? t : 'other';
  }
  function treemapColors(tiles){
    return tiles.map(d=> d.isOther ? OTHER_TILE[0] : TYPE_TILE[tileTypeOf(d)][0]);
  }
  function tileInk(d){ return d.isOther ? OTHER_TILE[1] : TYPE_TILE[tileTypeOf(d)][1]; }
  function renderTreemapInto(hostEl, tooltipEl, weighted, opts={}){
    if(!hostEl) return [];
    hostEl.querySelectorAll('svg').forEach(s=>s.remove());
    const width = hostEl.clientWidth || 300, height = opts.height || hostEl.clientHeight || 200;
    // Main treemap folds to fit (min tile sizes are what each layout needs for a legible ticker);
    // the small Compare-stage minis keep the plain OTHER_THRESHOLD cut-off.
    const folded = opts.fitTiles
      ? (opts.mobileTiles ? foldToFit(weighted, width, height, 40, 30) : foldToFit(weighted, width, height, 64, 34))
      : foldOther(weighted);
    const laidOut = layoutTreemap(treemapOrder(folded), 0,0,width,height);
    const colors = treemapColors(laidOut);
    const svgNS='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(svgNS,'svg');
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`); svg.setAttribute('width','100%'); svg.setAttribute('height',height);
    hostEl.insertBefore(svg, hostEl.firstChild);
    const small = opts.small;
    laidOut.forEach((d,i)=>{
      const pad=small?1:3;
      const ink = tileInk(d);
      const rx=d.x0+pad, ry=d.y0+pad, rw=Math.max(0,(d.x1-d.x0)-pad*2), rh=Math.max(0,(d.y1-d.y0)-pad*2);
      const g=document.createElementNS(svgNS,'g');
      const rect=document.createElementNS(svgNS,'rect');
      rect.setAttribute('x',rx); rect.setAttribute('y',ry); rect.setAttribute('width',rw); rect.setAttribute('height',rh);
      rect.setAttribute('rx',small?3:12); rect.setAttribute('fill', colors[i]);
      g.appendChild(rect);
      const minLabelW = small?24:34, minLabelH = small?18:24;
      if(rw>=minLabelW && rh>=minLabelH){
        const t1=document.createElementNS(svgNS,'text');
        t1.setAttribute('x',rx+(small?5:12)); t1.setAttribute('y', ry+(small?13:22));
        t1.setAttribute('fill', ink); t1.setAttribute('font-weight', small ? '600' : '500');
        const t1Size = small? Math.min(10,rw/6) : (opts.mobileTiles ? Math.max(11, Math.min(13,rw/6)) : Math.min(13,rw/6));
        t1.setAttribute('font-size', t1Size+'px'); t1.setAttribute('font-family',"Geist,system-ui,sans-serif");
        let inlinePct = null;
        let t1Text = d.ticker || d.name; // some holdings genuinely have no ticker on file -- fall back to name rather than a blank tile
        if(opts.mobileTiles){
          // Mobile treemap only: "Other (n)", and shorten any label that would overrun its tile with an ellipsis.
          const maxChars = Math.floor((rw-12)/(t1Size*0.6));
          if(d.isOther) t1Text = `Other (${d.members.length})`.length <= maxChars ? `Other (${d.members.length})` : 'Other';
          if(t1Text.length > maxChars) t1Text = t1Text.slice(0, Math.max(1, maxChars-1)) + '…';
          // Too short for the % on its own line (e.g. a 40px-high tile): put it after the ticker if it fits.
          if(rh<=44 && (t1Text + ' ' + fmtPct(d.weight)).length <= maxChars) inlinePct = fmtPct(d.weight);
        }
        t1.textContent = t1Text;
        if(inlinePct){
          const ts=document.createElementNS(svgNS,'tspan');
          ts.setAttribute('font-weight','300'); ts.setAttribute('fill', ink);
          ts.textContent = ' ' + inlinePct;
          t1.appendChild(ts);
        }
        g.appendChild(t1);
        if(!small && rh>44){
          // Share at the foot of the tile, large and light (B5 board); short tiles keep it under the name.
          const big = rh >= 72 && rw >= 56;
          const t2=document.createElementNS(svgNS,'text');
          t2.setAttribute('x',rx+12); t2.setAttribute('y', big ? ry+rh-12 : ry+40);
          t2.setAttribute('fill', ink); t2.setAttribute('font-weight','300');
          t2.setAttribute('font-size', big ? Math.min(20, rw/4)+'px' : '12px'); t2.setAttribute('font-family',"Geist,system-ui,sans-serif");
          t2.textContent = fmtPct(d.weight);
          g.appendChild(t2);
        }
        if(small && rh>=30){
          const t2=document.createElementNS(svgNS,'text');
          t2.setAttribute('x',rx+5); t2.setAttribute('y',ry+25);
          t2.setAttribute('fill', ink); t2.setAttribute('font-size','9px'); t2.setAttribute('font-family',"Geist,system-ui,sans-serif");
          t2.textContent = fmtPct(d.weight);
          g.appendChild(t2);
        }
      }
      if(tooltipEl){
        g.addEventListener('mousemove',(e)=>{
          const hostRect = hostEl.getBoundingClientRect();
          tooltipEl.style.opacity=1;
          tooltipEl.style.left=(e.clientX-hostRect.left+14)+'px';
          tooltipEl.style.top=(e.clientY-hostRect.top+10)+'px';
          tooltipEl.innerHTML = d.isOther
            ? `<b>Other · ${fmtPct(d.weight)}</b>` + d.members.map(m=>`<div class="row"><span>${m.name}</span><span>${fmtPct(m.weight)}</span></div>`).join('')
            : `<b>${d.ticker || d.name}</b>${d.ticker?`<div class="row"><span>${d.name}</span></div>`:''}<div class="row"><span>${d.account||''}</span><span>${fmtPct(d.weight)}</span></div>`;
        });
        g.addEventListener('mouseleave',()=>{ tooltipEl.style.opacity=0; });
      }
      svg.appendChild(g);
    });
    return laidOut.map((d,i)=>({...d, color:colors[i]})); // same order as the tiles, with the colour each one got
  }

  /* ---------------------------- top-level render ---------------------------- */
  function renderTreemapSection(){
    const host = document.getElementById('labTreemapHost');
    const tooltip = document.getElementById('labTmTooltip');
    const legendEl = document.getElementById('labTmLegend');
    const emptyEl = document.getElementById('labTreemapEmpty');
    if(!host) return;
    if(!state.holdings.length){
      host.style.display = 'none';
      legendEl.innerHTML = '';
      emptyEl.innerHTML = `<div class="line" style="text-align:center; padding:24px 0;">${anyFilterOn() ? 'Everything here is hidden by the filters above.' : 'No holdings logged yet.'}</div>`;
      document.getElementById('labCta').style.display = 'none';
      return;
    }
    host.style.display = '';
    document.getElementById('labCta').style.display = '';
    emptyEl.innerHTML = '';
    const weighted = withWeights(state.holdings);
    // Only holdings too small to label fold into "Other" (see foldToFit); mobile also gets "Other (n)" labels.
    const folded = renderTreemapInto(host, tooltip, weighted, isMobileWidth() ? {fitTiles:true, mobileTiles:true} : {fitTiles:true});
    // Legend by account type (B5 board), in the order the types first appear.
    const types = [];
    folded.forEach(d=>{ const t = d.isOther ? 'folded' : tileTypeOf(d); if(!types.includes(t)) types.push(t); });
    legendEl.innerHTML = types.map(t=> t === 'folded'
      ? `<div class="lg"><span class="sw" style="background:${OTHER_TILE[0]}"></span>Smaller holdings</div>`
      : `<div class="lg"><span class="sw" style="background:${TYPE_TILE[t][0]}"></span>${TYPE_LABEL[t]}</div>`).join('');
  }

  function isMobileWidth(){ return !!(window.matchMedia && window.matchMedia('(max-width:860px)').matches); }

  function renderStepper(){
    const el = document.getElementById('labStepper');
    const curIdx = stageIndex(state.stage);
    el.innerHTML = STAGES.map((s,i)=>{
      const cls = i<curIdx ? 'done' : (i===curIdx ? 'active' : '');
      const num = String(i+1).padStart(2,'0');
      return `<button type="button" class="lab-step ${cls}" data-stage="${s.id}"${i===curIdx?' aria-current="step"':''}><span class="lab-step-num">${num}</span><span class="lab-step-label">${s.label}</span></button>`;
    }).join('');
    el.querySelectorAll('.lab-step').forEach(st=>st.addEventListener('click', ()=>{ goStage(st.dataset.stage); }));
  }
  function goStage(id){ state.stage=id; renderStageBody(); renderStepper(); }
  /* "Show all" for lists that only show what changes (Wealth OS scoping). */
  function foldBtn(n, what){
    if(!n) return '';
    return `<button type="button" class="hm-link hm-linkbtn lab-fold-btn" aria-expanded="false" onclick="var f=this.closest('.lab-fold'); var open=this.getAttribute('aria-expanded')!=='true'; f.querySelectorAll('.lab-same').forEach(function(r){ r.hidden=!open; }); this.setAttribute('aria-expanded', open); this.textContent = open ? 'Show only what changes' : 'Show ${n} unchanged ${what}';">Show ${n} unchanged ${what}</button>`;
  }
  function renderStageBody(){
    const el = document.getElementById('labStageBody');
    if(!el) return;
    const labTile = document.getElementById('wlLab');
    if(labTile) labTile.dataset.stage = state.stage;
    const WIZ = ['analyse','optimise','compare','implement','results'];
    const wi = WIZ.indexOf(state.stage);
    const stepEl = document.getElementById('labWizStep'), barEl = document.getElementById('labWizBar');
    if(stepEl) stepEl.textContent = 'Step ' + (wi + 1) + ' of ' + WIZ.length + ' · ' + state.stage.charAt(0).toUpperCase() + state.stage.slice(1);
    if(barEl) barEl.style.width = ((wi + 1) / WIZ.length * 100) + '%';
    const wizWrap = document.getElementById('labStepperWrap');
    if(wizWrap && wizWrap.classList.contains('open') && renderStageBody.lastStage !== state.stage) wizWrap.scrollTop = 0;
    renderStageBody.lastStage = state.stage;

    // Every amount/target/cap field re-renders this whole section on each keystroke
    // (the derived totals below it need to react live), which recreates every <input>
    // including the one being typed into -- dropping focus and the cursor position.
    // Left alone, the browser's default response to a focused element vanishing mid-
    // layout is to fall back to scrolling the page to the top, which is what "jumps to
    // the top after one character" was: not a page reload, a focus loss. Capture the
    // active field (and its cursor, where the input type supports it) and the scroll
    // position before the rebuild, then restore both after re-wiring events. Number
    // inputs do not support selectionStart/selectionEnd in every browser, hence the guard.
    const active = document.activeElement;
    let refocusSelector = null, selStart = null, selEnd = null;
    if(active && el.contains(active)){
      if(active.dataset && active.dataset.amtval) refocusSelector = `[data-amtval="${CSS.escape(active.dataset.amtval)}"]`;
      else if(active.dataset && active.dataset.targetid) refocusSelector = `[data-targetid="${CSS.escape(active.dataset.targetid)}"]`;
      else if(active.dataset && active.dataset.classid) refocusSelector = `[data-classid="${CSS.escape(active.dataset.classid)}"]`;
      else if(active.id) refocusSelector = '#'+CSS.escape(active.id);
      if(refocusSelector){
        try { selStart = active.selectionStart; selEnd = active.selectionEnd; } catch(e){ /* type=number: no selection API */ }
      }
    }
    const scrollY = window.scrollY;

    if(state.stage==='analyse') el.innerHTML = analyseHTML();
    else if(state.stage==='optimise') el.innerHTML = optimiseHTML();
    else if(state.stage==='compare') el.innerHTML = compareHTML();
    else if(state.stage==='implement') el.innerHTML = implementHTML();
    else if(state.stage==='results') el.innerHTML = resultsHTML();
    wireStageEvents();

    if(refocusSelector){
      const toFocus = el.querySelector(refocusSelector);
      if(toFocus){
        toFocus.focus({preventScroll:true});
        if(selStart!=null){ try { toFocus.setSelectionRange(selStart, selEnd); } catch(e){} }
      }
    }
    window.scrollTo({top:scrollY, behavior:'auto'});
  }

  /* ---- Stage I: Analyse ---- */
  function driversSectionHTML(){
    if(!state.driverRows.length){
      return `
        <div class="lab-subhead">Performance drivers</div>
        <div class="lab-subhead-note">${state.driverEmptyNote}</div>
      `;
    }
    const positive = state.driverRows.filter(x=>x.gain>0).sort((a,b)=>b.gain-a.gain).slice(0,3);
    const negative = state.driverRows.filter(x=>x.gain<0).sort((a,b)=>a.gain-b.gain).slice(0,3);
    const maxAbsGain = Math.max(...positive.map(x=>x.gain), ...negative.map(x=>-x.gain), 1);
    const row = x => {
      const isUp = x.gain>0;
      const barWidth = Math.min(100, Math.abs(x.gain)/maxAbsGain*100);
      return `<div class="lab-driver-row">
        <span class="lab-driver-name">${x.name}</span>
        <span class="lab-driver-bar-track"><span class="lab-driver-bar-fill ${isUp?'up':'down'}" style="width:${barWidth}%"></span></span>
        <span class="lab-driver-amt ${isUp?'up':'down'}">${isUp?'+':''}${fmtGBP(x.gain)}</span>
      </div>`;
    };
    return `
      <div class="lab-subhead">Performance drivers</div>
      <div class="lab-subhead-note">Unrealised gain or loss vs. cost basis, not a time-windowed return.</div>
      <div class="lab-drivers-grid">
        <div>
          <div class="lab-drivers-col-label up">Largest positive contributors</div>
          ${positive.length ? positive.map(row).join('') : `<div class="lab-driver-empty">None yet.</div>`}
        </div>
        <div>
          <div class="lab-drivers-col-label down">Largest negative contributors</div>
          ${negative.length ? negative.map(row).join('') : `<div class="lab-driver-empty">None yet.</div>`}
        </div>
      </div>
    `;
  }

  function analyseHTML(){
    const weighted = withWeights(state.holdings);
    const conc = concentrationSummary(weighted);
    const eff = effectiveHoldings(weighted);
    const vol = illustrativeVol(weighted);
    const maxWeight = Math.max(...weighted.map(x=>x.weight), 1);
    return `
      <div class="lab-eyebrow">Stage I</div>
      <h4 class="lab-stage-title">Analyse</h4>
      <div class="lab-stage-desc">A closer look at concentration and risk shape than the treemap above shows on its own.</div>
      <div class="lab-stat-grid">
        <div class="lab-stat-card"><div class="v">${fmtPct(conc.top1)}</div><div class="l">Top 1</div></div>
        <div class="lab-stat-card"><div class="v">${fmtPct(conc.top3)}</div><div class="l">Top 3</div></div>
        <div class="lab-stat-card"><div class="v">${fmtPct(conc.top5)}</div><div class="l">Top 5</div></div>
        <div class="lab-stat-card"><div class="v">${eff.toFixed(1)}</div><div class="l">Eff. holdings</div></div>
        <div class="lab-stat-card"><div class="v">${fmtPct(vol)}</div><div class="l">Illustrative vol</div></div>
      </div>
      <div class="lab-two"><div>
      <div class="lab-subhead">Move needed for 1% portfolio impact<span class="lab-approx-flag">Approximate</span></div>
      <div class="lab-subhead-note">The approximate single-holding move (all else equal) required to shift total portfolio value by 1%.</div>
      <div style="overflow-x:auto;">
      <table class="k-table">
        <thead><tr><th>Holding</th><th style="text-align:right;">Weight</th><th style="text-align:right;" title="Move for 1% impact">1% move</th></tr></thead>
        <tbody>
          ${weighted.map((h, i)=>{
            const move = moveNeededFor1Pct(h.weight);
            const barWidth = maxWeight>0 ? (h.weight/maxWeight*100) : 0;
            return `<tr${i >= 5 ? ' class="lab-more-row" hidden' : ''}>
              <td class="lab-holding-cell"><b>${h.ticker||h.name}</b><span class="hc-name">· ${h.name} (${h.account})</span></td>
              <td class="num"><span class="lab-wt-mini"><span class="lab-wt-mini-track"><span class="lab-wt-mini-fill" style="width:${barWidth}%"></span></span>${fmtPct(h.weight)}</span></td>
              <td class="num lab-move-figure">${move!==null?fmtPct(move):'–'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      ${weighted.length > 5 ? `<button type="button" class="hm-link hm-linkbtn lab-more-btn" aria-expanded="false" onclick="var t=this.previousElementSibling; var open=this.getAttribute('aria-expanded')!=='true'; t.querySelectorAll('.lab-more-row').forEach(function(r){ r.hidden=!open; }); this.setAttribute('aria-expanded', open); this.textContent = open ? 'Show the top 5' : 'Show all ${weighted.length} holdings';">Show all ${weighted.length} holdings</button>` : ''}
      </div><div>
      ${driversSectionHTML()}
      </div></div>
      <div class="lab-stage-actions">
        <div></div>
        <button type="button" class="btn-primary" data-goto="optimise">Optimise →</button>
      </div>
    `;
  }

  /* ---- Stage II: Optimise ---- */
  const PRESET_META = {
    equal: {label:'Equal weight', badge:'Rebalanced', badgeClass:'lab-badge-realloc'},
    cap: {label:'Reallocate capital', badge:'Reallocated', badgeClass:'lab-badge-realloc'},
    move: {label:'Reallocate capital', badge:'Reallocated', badgeClass:'lab-badge-realloc'},
    freshcash: {label:'Allocate fresh capital', badge:'New money', badgeClass:'lab-badge-cash'},
    raisecash: {label:'Raise cash', badge:'Cash raised', badgeClass:'lab-badge-withdrawn'},
    target: {label:'Target allocation', badge:'Reallocated', badgeClass:'lab-badge-realloc'},
    bedisa: {label:'Bed & ISA', badge:'GIA to ISA', badgeClass:'lab-badge-realloc'},
    consolidate: {label:'Consolidate holdings', badge:'Consolidated', badgeClass:'lab-badge-realloc'}
  };
  /* The six presets, locked names and order (spec B5.2). Reallocate capital
     merges the old Move value and Maximum holding size: its engine type is
     'move' (by amount or new share) or 'cap' (by maximum weight). Consolidate
     stays for the adviser view only (decided 13 Oct 2026). */
  const PRESET_LIST = [
    {id:'equal', title:'Equal weight', desc:'Gives each holding you pick the same share, and shows what to buy and sell to get there.'},
    {id:'freshcash', title:'Allocate fresh capital', desc:'Puts new money, a lump sum or a monthly amount, into the holdings furthest below target. Nothing is sold.'},
    {id:'realloc', title:'Reallocate capital', desc:'Moves money from one holding to others. Pick the source, the amount or new share, and where it goes.'},
    {id:'target', title:'Target allocation', desc:'Set the share you want for each holding or asset class, and see the moves that get you there.'},
    {id:'raisecash', title:'Raise cash', desc:'Frees up a set amount of cash from the holdings you choose, and shows what it does to your mix.'},
    {id:'bedisa', title:'Bed & ISA', desc:'Moves money from your general account into your ISA, within this year\'s allowance. Flags the sale and any gain.'},
    {id:'consolidate', title:'Consolidate holdings', desc:'Merges selected holdings into a single chosen holding.', adviserOnly:true}
  ];
  function presetCardId(type){ return (type==='move' || type==='cap') ? 'realloc' : type; }
  function visiblePresets(){
    const adviser = state.client && state.client.meta && state.client.meta.role === 'adviser';
    return PRESET_LIST.filter(p=> !p.adviserOnly || adviser);
  }
  /* "You set: ..." under the chosen card (B5.2), in Geist Mono. */
  function youSetText(){
    const t = state.presetType;
    const picked = state.selectedIds ? state.selectedIds.size : 0;
    if(t==='equal') return picked >= 2 ? `${picked} holdings, equal shares` : 'pick at least two holdings';
    if(t==='cap') return `maximum ${state.capPct}% per holding, excess to ${picked} ${picked===1?'holding':'holdings'}`;
    if(t==='move'){
      const raised = moveTotalRaised();
      const by = state.moveUnit==='share' ? 'new share' : '£ amount';
      return raised > 0.5 ? `${fmtGBP(raised)} by ${by} from ${state.moveSourceIds.size}, into ${state.moveDestIds.size}` : `by ${by}, nothing chosen yet`;
    }
    if(t==='freshcash') return (state.freshMode==='monthly' ? `${fmtGBP(Number(state.freshMonthly)||0)} a month for ${Number(state.freshMonths)||0} months` : `${fmtGBP(Number(state.freshLump)||0)} lump sum`) + `, into ${picked}`;
    if(t==='raisecash') return `${state.raiseUnit==='%' ? (Number(state.raiseValue)||0)+'% of the portfolio' : fmtGBP(Number(state.raiseValue)||0)} from ${picked} ${picked===1?'holding':'holdings'}`;
    if(t==='target') return 'a share for each holding';
    if(t==='bedisa'){
      const h = bedSource();
      return h ? `${fmtGBP(bedAmount())} of ${h.name}, allowance left ${bedAllowance()==null?'not entered':fmtGBP(bedAllowance())}` : 'choose a GIA holding';
    }
    if(t==='consolidate') return `${picked} into one holding`;
    return '';
  }

  function amountChecklistHTML(pool, selectedIds, amounts, idPrefix, headline, note, placeholderFor){
    const allSelected = pool.length>0 && pool.every(h=>selectedIds.has(h.id));
    const noneSelected = pool.every(h=>!selectedIds.has(h.id));
    return `
      ${headline?`<div class="lab-subhead">${headline}</div>`:''}
      <div class="lab-subhead-note">${note}</div>
      <div class="lab-checklist-head">
        <span></span>
        <div class="lab-checklist-tools">
          <button type="button" data-amtcheckall="${idPrefix}:1" ${allSelected?'disabled':''}>Select all</button>
          <button type="button" data-amtcheckall="${idPrefix}:0" ${noneSelected?'disabled':''}>Clear all</button>
        </div>
      </div>
      <div class="lab-checklist">
        ${pool.map(h=>`
          <label class="lab-checklist-row">
            <input type="checkbox" data-amtcheck="${idPrefix}:${h.id}" ${selectedIds.has(h.id)?'checked':''}>
            <span class="cl-name">${h.name}</span>
            <span class="cl-meta">${h.account}</span>
            ${selectedIds.has(h.id) ? `<input type="text" inputmode="decimal" class="amt-input" data-amtval="${idPrefix}:${h.id}" value="${amounts[h.id]!==undefined?amounts[h.id]:''}" placeholder="${placeholderFor(h)}" onclick="event.stopPropagation()">` : ''}
          </label>
        `).join('')}
      </div>
      ${pool.length===0 ? `<div class="lab-checklist-empty-note">No eligible holdings, check the other side is not using all of them.</div>` :
        noneSelected ? `<div class="lab-checklist-empty-note">Select at least one holding to continue, nothing is chosen automatically.</div>` : ''}
    `;
  }
  function checklistHTML(headline, note){
    const pool = scenarioPool();
    const allSelected = pool.every(h=>state.selectedIds.has(h.id));
    const noneSelected = pool.every(h=>!state.selectedIds.has(h.id));
    return `
      <div class="lab-subhead">${headline}</div>
      <div class="lab-subhead-note">${note}</div>
      <div class="lab-checklist-head">
        <span></span>
        <div class="lab-checklist-tools">
          <button type="button" data-checkall="1" ${allSelected?'disabled':''}>Select all</button>
          <button type="button" data-checkall="0" ${noneSelected?'disabled':''}>Clear all</button>
        </div>
      </div>
      <div class="lab-checklist">
        ${pool.map(h=>`
          <label class="lab-checklist-row">
            <input type="checkbox" data-checkid="${h.id}" ${state.selectedIds.has(h.id)?'checked':''}>
            <span class="cl-name">${h.name}</span>
            <span class="cl-meta">${h.account}</span>
          </label>
        `).join('')}
      </div>
      ${pool.length===0 ? `<div class="lab-checklist-empty-note">No eligible holdings for this preset in the current scope.</div>` :
        noneSelected ? `<div class="lab-checklist-empty-note">Select at least one holding to continue, nothing is chosen automatically.</div>` : ''}
    `;
  }
  function moveDestChecklistHTML(){
    const pool = moveDestPool();
    const allSelected = pool.length>0 && pool.every(h=>state.moveDestIds.has(h.id));
    const noneSelected = pool.every(h=>!state.moveDestIds.has(h.id));
    return `
      <div class="lab-checklist-head">
        <span></span>
        <div class="lab-checklist-tools">
          <button type="button" data-movedestcheckall="1" ${allSelected?'disabled':''}>Select all</button>
          <button type="button" data-movedestcheckall="0" ${noneSelected?'disabled':''}>Clear all</button>
        </div>
      </div>
      <div class="lab-checklist">
        ${pool.map(h=>`
          <label class="lab-checklist-row">
            <input type="checkbox" data-movedestcheck="${h.id}" ${state.moveDestIds.has(h.id)?'checked':''}>
            <span class="cl-name">${h.name}</span>
            <span class="cl-meta">${h.account}</span>
          </label>
        `).join('')}
      </div>
      ${pool.length===0 ? `<div class="lab-checklist-empty-note">No eligible holdings, check the source side is not using all of them.</div>` :
        noneSelected ? `<div class="lab-checklist-empty-note">Select at least one holding to continue, nothing is chosen automatically.</div>` : ''}
    `;
  }

  function targetWeightsTable(scenarioHoldings, base){
    if(state.presetType==='target' && targetByClass()){
      return labClasses().map(c=>`<div class="lab-tw-row"><span class="tw-name">${c.label}</span><span class="tw-cur">${fmtPct(c.weight)}</span><span class="tw-arrow">→</span><span class="lab-tw-val">${fmtPct(Number(state.classWeights[c.key])||0)}</span></div>`).join('');
    }
    if(state.presetType==='target'){
      return base.map(h=>`<div class="lab-tw-row"><span class="tw-name">${h.name}</span><span class="tw-cur">${fmtPct(withWeights(base).find(b=>b.id===h.id).weight)}</span><span class="tw-arrow">→</span><span class="lab-tw-val">${fmtPct(Number(state.targetWeights[h.id])||0)}</span></div>`).join('');
    }
    const weighted = withWeights(scenarioHoldings);
    const baseWeighted = withWeights(base);
    let same = 0;
    return `<div class="lab-fold">
      ${weighted.filter(h=>!h.isPending).map(h=>{
        const isZero = h.value===0 && state.presetType==='consolidate' && state.selectedIds.has(h.id);
        const before = baseWeighted.find(b=>b.id===h.id); // absent for "Cash raised", which is new
        const unchanged = before && Math.abs(before.weight - h.weight) < 0.05;
        if(unchanged) same++;
        return `<div class="lab-tw-row${unchanged ? ' lab-same' : ''}"${unchanged ? ' hidden' : ''}><span class="tw-name" style="${isZero?'color:var(--k-ink-softer);text-decoration:line-through;':''}">${h.name}</span><span class="tw-cur">${fmtPct(before ? before.weight : 0)}</span><span class="tw-arrow">→</span><span class="lab-tw-val" style="${isZero?'color:var(--k-ink-softer);':''}">${fmtPct(h.weight)}</span></div>`;
      }).join('')}
      ${weighted.find(h=>h.isPending) ? `<div class="lab-tw-row"><span class="tw-name" style="color:var(--k-ink-softer);">Uncommitted</span><span class="tw-cur"></span><span class="tw-arrow"></span><span class="lab-tw-val" style="color:var(--k-ink-softer);">${fmtPct(weighted.find(h=>h.isPending).weight)}</span></div>` : ''}
      ${same === weighted.filter(h=>!h.isPending).length ? '<p class="lab-subhead-note lab-nochange">Nothing changes yet. Pick holdings above.</p>' : ''}
      ${foldBtn(same, same === 1 ? 'holding' : 'holdings')}
    </div>`;
  }

  function ledgerHTML(){
    const meta = PRESET_META[state.presetType];
    const base = state.holdings;
    const scopeTotal = base.reduce((s,h)=>s+h.value,0);

    if(state.presetType==='equal'){
      const picked = base.filter(h=>state.selectedIds.has(h.id));
      const pickedShare = picked.reduce((s,h)=>s+h.value,0) / (scopeTotal||1) * 100;
      return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge ${meta.badgeClass}">${meta.badge}</span>${picked.length>=2 ? `${picked.length} holdings, ${fmtPct(pickedShare/picked.length)} each` : 'Pick at least two holdings below'}</span><span class="lab-ledger-amt">-</span></div>`;
    }
    if(state.presetType==='bedisa'){
      const h = bedSource(), isa = bedIsa(), amt = bedAmount();
      if(!h || !isa || !amt) return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge lab-badge-pending">Not set yet</span>Choose a GIA holding, the ISA and an amount above</span><span class="lab-ledger-amt">-</span></div>`;
      const gia = state.client.accounts.find(a=>a.id===h.accountId);
      return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge ${meta.badgeClass}">${meta.badge}</span>${h.name}: ${gia?TEI.data.acctLabel(gia):'GIA'} to ${TEI.data.acctLabel(isa)}</span><span class="lab-ledger-amt">${fmtGBP(amt)}</span></div>`;
    }
    if(state.presetType==='cap'){
      const capValue = scopeTotal * state.capPct/100;
      const overCap = base.filter(h=>h.value > capValue);
      const excess = overCap.reduce((s,h)=>s+(h.value-capValue),0);
      if(overCap.length===0) return `<div class="lab-no-match-note">No holdings currently exceed ${state.capPct}%, nothing to cap.</div>`;
      const selected = scenarioPool().filter(h=>state.selectedIds.has(h.id));
      const selectedTotal = selected.reduce((s,h)=>s+h.value,0);
      const sourceLabel = overCap.length===1 ? overCap[0].name : `${overCap.length} holdings over ${state.capPct}%`;
      if(selected.length===0){
        return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge lab-badge-pending">Uncommitted</span>${sourceLabel}, select holdings below</span><span class="lab-ledger-amt">${fmtGBP(excess)}</span></div>`;
      }
      const destLabel = selected.length===1 ? `${selected[0].name} (${selected[0].account})` : `spread across ${selected.length} holdings (pro-rata)`;
      const crossAccounts = [...new Set(overCap.flatMap(o=>selected.filter(h=>h.account!==o.account).map(h=>h.account)))];
      return `
        <div class="lab-ledger-row clickable" id="labLedgerToggle">
          <span><span class="lab-ledger-badge ${meta.badgeClass}">${meta.badge}</span>${sourceLabel} → ${destLabel}${crossAccounts.length?`<span class="lab-ledger-badge lab-badge-cross">Cross-wrapper</span>`:''}${selected.length>1?`<span class="lab-ledger-chev">${state.ledgerOpen?'▲':'▼'}</span>`:''}</span>
          <span class="lab-ledger-amt">${fmtGBP(excess)}</span>
        </div>
        ${state.ledgerOpen && selected.length>1 ? `<div class="lab-ledger-breakdown">${selected.map(h=>{
          const share = selectedTotal>0 ? h.value/selectedTotal : 0;
          return `<div class="br"><span>${h.name} (${h.account})</span><span>+${fmtGBP(excess*share)}</span></div>`;
        }).join('')}</div>` : ''}
      `;
    }
    if(state.presetType==='move'){
      const totalRaised = moveTotalRaised();
      const sources = base.filter(h=>state.moveSourceIds.has(h.id));
      const dests = base.filter(h=>state.moveDestIds.has(h.id));
      if(sources.length===0 || dests.length===0 || totalRaised<0.5){
        return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge lab-badge-pending">Uncommitted</span>Choose sources and destinations above</span><span class="lab-ledger-amt">${totalRaised>0.5?fmtGBP(totalRaised):'–'}</span></div>`;
      }
      const allocated = moveAllocatedTotal();
      const unbalanced = state.moveDestMode==='manual' && Math.abs(allocated-totalRaised)>=0.5;
      const sourceLabel = sources.length===1 ? `${sources[0].name} (${sources[0].account})` : `${sources.length} holdings`;
      const destLabel = dests.length===1 ? `${dests[0].name} (${dests[0].account})` : (state.moveDestMode==='prorata' ? `spread across ${dests.length} holdings (pro-rata)` : `${dests.length} holdings (custom split)`);
      const crossAccounts = [...new Set(sources.flatMap(s=>dests.filter(d=>d.account!==s.account).map(d=>d.account)))];
      return `
        <div class="lab-ledger-row clickable" id="labLedgerToggle">
          <span><span class="lab-ledger-badge ${meta.badgeClass}">${meta.badge}</span>${sourceLabel} → ${destLabel}${crossAccounts.length?`<span class="lab-ledger-badge lab-badge-cross">Cross-wrapper</span>`:''}${unbalanced?`<span class="lab-ledger-badge lab-badge-pending">Not fully allocated</span>`:''}<span class="lab-ledger-chev">${state.ledgerOpen?'▲':'▼'}</span></span>
          <span class="lab-ledger-amt">${fmtGBP(totalRaised)}</span>
        </div>
        ${state.ledgerOpen ? `<div class="lab-ledger-breakdown">
          <div style="font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--k-ink-softer);margin-bottom:4px;">From</div>
          ${sources.map(h=>`<div class="br"><span>${h.name} (${h.account})</span><span>−${fmtGBP(moveSourceGBP(h))}</span></div>`).join('')}
          <div style="font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--k-ink-softer);margin:8px 0 4px;">Into</div>
          ${dests.map(h=>{
            const amt = state.moveDestMode==='prorata' ? totalRaised*(h.value/(dests.reduce((s,x)=>s+x.value,0)||1)) : moveDestGBP(h, totalRaised);
            return `<div class="br"><span>${h.name} (${h.account})</span><span>+${fmtGBP(amt)}</span></div>`;
          }).join('')}
        </div>` : ''}
      `;
    }
    if(state.presetType==='freshcash'){
      const selected = scenarioPool().filter(h=>state.selectedIds.has(h.id));
      const alloc = freshAllocations();
      const C = freshTotal();
      if(selected.length===0){
        return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge lab-badge-pending">Not placed yet</span>New money: tick holdings below</span><span class="lab-ledger-amt">${fmtGBP(C)}</span></div>`;
      }
      const destLabel = selected.length===1 ? `${selected[0].name} (${selected[0].account})` : `${selected.length} holdings, furthest below an equal share first`;
      return `
        <div class="lab-ledger-row clickable" id="labLedgerToggle">
          <span><span class="lab-ledger-badge ${meta.badgeClass}">${meta.badge}</span>New money to ${destLabel}${selected.length>1?`<span class="lab-ledger-chev">${state.ledgerOpen?'▲':'▼'}</span>`:''}</span>
          <span class="lab-ledger-amt">${fmtGBP(C)}</span>
        </div>
        ${state.ledgerOpen && selected.length>1 ? `<div class="lab-ledger-breakdown">${selected.map(h=>`<div class="br"><span>${h.name} (${h.account})</span><span>+${fmtGBP(alloc[h.id]||0)}</span></div>`).join('')}</div>` : ''}
      `;
    }
    if(state.presetType==='raisecash'){
      const amount = raiseAmount();
      if(amount <= 0.5) return `<div class="lab-no-match-note">Enter an amount and tick the holdings it comes from.</div>`;
      const selected = scenarioPool().filter(h=>state.selectedIds.has(h.id));
      const selectedTotal = selected.reduce((s,h)=>s+h.value,0);
      if(selected.length===0){
        return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge lab-badge-pending">Uncommitted</span>Withdrawal, select source holdings below</span><span class="lab-ledger-amt">${fmtGBP(amount)}</span></div>`;
      }
      const sourceLabel = selected.length===1 ? `${selected[0].name} (${selected[0].account})` : `spread across ${selected.length} holdings (pro-rata)`;
      const sipp = selected.some(h=>h.accountPension);
      return `
        <div class="lab-ledger-row clickable" id="labLedgerToggle">
          <span><span class="lab-ledger-badge ${meta.badgeClass}">${meta.badge}</span>${sourceLabel} → Cash${sipp?`<span class="lab-ledger-badge lab-badge-cross">SIPP access rules</span>`:''}${selected.length>1?`<span class="lab-ledger-chev">${state.ledgerOpen?'▲':'▼'}</span>`:''}</span>
          <span class="lab-ledger-amt">${fmtGBP(amount)}</span>
        </div>
        ${state.ledgerOpen && selected.length>1 ? `<div class="lab-ledger-breakdown">${selected.map(h=>{
          const share = selectedTotal>0 ? h.value/selectedTotal : 0;
          return `<div class="br"><span>${h.name} (${h.account})</span><span>−${fmtGBP(amount*share)}</span></div>`;
        }).join('')}</div>` : ''}
      `;
    }
    if(state.presetType==='target'){
      const ok = Math.abs(targetSum()-100)<0.5;
      return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge ${meta.badgeClass}">${meta.badge}</span>${targetByClass() ? 'Each asset class moves to the weight entered below' : 'Every holding moves to the weight entered below'}</span><span class="lab-ledger-amt">${ok?'Balanced':'Unbalanced'}</span></div>`;
    }
    if(state.presetType==='consolidate'){
      const sources = base.filter(h=>state.selectedIds.has(h.id));
      const target = base.find(h=>h.id===state.consolidateTargetId);
      const sumSources = sources.reduce((s,h)=>s+h.value,0);
      if(sources.length===0 || !target){
        return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge lab-badge-pending">Uncommitted</span>Choose holdings to merge and a destination below</span><span class="lab-ledger-amt">–</span></div>`;
      }
      const sourceLabel = sources.length===1 ? sources[0].name : `${sources.length} holdings`;
      const crossAccounts = [...new Set(sources.filter(h=>h.account!==target.account).map(h=>h.account))];
      return `<div class="lab-ledger-row"><span><span class="lab-ledger-badge ${meta.badgeClass}">${meta.badge}</span>${sourceLabel} → ${target.name} (${target.account})${crossAccounts.length?`<span class="lab-ledger-badge lab-badge-cross">Cross-wrapper</span>`:''}</span><span class="lab-ledger-amt">${fmtGBP(sumSources)}</span></div>`;
    }
    return '';
  }

  function presetControlsHTML(){
    const base = state.holdings;
    const scopeTotal = base.reduce((s,h)=>s+h.value,0);
    const numInput = (id, value, label, suffix) => `
      <label class="lab-field"><span class="lab-field-label">${label}</span>
        <span class="lab-field-input">${suffix==='£'?'<em>£</em>':''}<input type="text" inputmode="decimal" class="lab-num-input" id="${id}" value="${value}">${suffix==='%'?'<em>%</em>':''}</span>
      </label>`;
    const seg = (attr, options, current) => `<div class="lab-seg" role="group">${options.map(o=>`<button type="button" ${attr}="${o[0]}" aria-pressed="${o[0]===current}" class="${o[0]===current?'active':''}">${o[1]}</button>`).join('')}</div>`;

    if(state.presetType==='equal'){
      return checklistHTML('Which holdings?', 'Each holding you tick ends up with the same share of their combined value. Holdings you leave unticked stay as they are.');
    }
    if(state.presetType==='cap' || state.presetType==='move'){
      const modeSeg = seg('data-reallocmode', [['amount','£ amount'],['share','New share'],['cap','Maximum weight']], state.reallocMode);
      if(state.presetType==='cap'){
        return `
          ${modeSeg}
          <div class="lab-field-row">${numInput('labCapInput', state.capPct, 'No holding above', '%')}</div>
          ${checklistHTML('Where does the excess go?', 'Tick the holdings it goes to; it is split in proportion to their size. Holdings already over the limit cannot receive it.')}
        `;
      }
      const totalRaised = moveTotalRaised();
      const byShare = state.moveUnit==='share';
      return `
        ${modeSeg}
        <div class="lab-two"><div>
        ${amountChecklistHTML(moveSourcePool(), state.moveSourceIds, state.moveSourceAmounts, 'src', 'Move from',
          byShare ? 'Tick a holding and enter the share you want it to have afterwards.' : 'Tick a holding and enter how much to move from it.',
          h=> byShare ? 'now '+fmtPct(h.value/(scopeTotal||1)*100) : '£0')}
        <div class="lab-raised-note">Total to move<b>${fmtGBP(totalRaised)}</b></div>
        </div><div>
        <div class="lab-subhead">Move it to</div>
        <div class="lab-subhead-note">Tick where it goes; it is split in proportion to their size.</div>
        ${moveDestChecklistHTML()}
        </div></div>
      `;
    }
    if(state.presetType==='freshcash'){
      const modeSeg = seg('data-freshmode', [['lump','Lump sum'],['monthly','Monthly']], state.freshMode);
      const fields = state.freshMode==='monthly'
        ? `${numInput('labFreshMonthly', state.freshMonthly, 'Each month', '£')}${numInput('labFreshMonths', state.freshMonths, 'For how many months', '')}`
        : numInput('labFreshLump', state.freshLump, 'Amount', '£');
      return `
        ${modeSeg}
        <div class="lab-field-row">${fields}</div>
        <div class="lab-auto-note">${fmtGBP(freshTotal())} of new money in total. It goes first to the ticked holdings furthest below an equal share of them. Nothing is sold.</div>
        ${checklistHTML('Which holdings can it go to?', 'Tick the holdings the new money can go into.')}
      `;
    }
    if(state.presetType==='raisecash'){
      const modeSeg = seg('data-raiseunit', [['£','£ amount'],['%','% of portfolio']], state.raiseUnit);
      const amount = raiseAmount();
      return `
        ${modeSeg}
        <div class="lab-field-row">${numInput('labRaiseInput', state.raiseValue, state.raiseUnit==='%' ? 'Share of the portfolio' : 'Amount', state.raiseUnit)}</div>
        <div class="lab-auto-note">That frees ${fmtGBP(amount)}, ${fmtPct(amount/(scopeTotal||1)*100)} of the money in scope, taken in proportion from the holdings ticked.</div>
        ${checklistHTML('Which holdings does it come from?', 'Tick the holdings to sell from. Cash itself is not a source.')}
      `;
    }
    if(state.presetType==='bedisa'){
      const pool = bedSourcePool(), isas = bedIsaPool();
      if(!pool.length) return `<div class="lab-no-match-note">There are no holdings in a general investment account (GIA) in this view, so there is nothing to move into an ISA.</div>`;
      if(!isas.length) return `<div class="lab-no-match-note">There is no stocks and shares ISA on record to move money into. Add one in Settings, under Accounts.</div>`;
      const h = bedSource();
      const cap = bedCap();
      const gain = bedGain();
      const isa = bedIsa();
      const saved = bedSaved(), typed = state.bed.allowance !== '';
      const allowanceNote = typed ? 'Used for this scenario only. To keep a new figure, change it on the ISA in Settings, under Accounts.'
        : saved.current ? 'From your ISA in Settings, for ' + TEI.calc.taxYearLabel() + '. Change it here for this scenario only.'
        : saved.value != null ? 'The figure in Settings (' + fmtGBP(saved.value) + ') is for ' + (saved.taxYear || 'an earlier tax year') + '. Enter what is left for ' + TEI.calc.taxYearLabel() + ' to run this, and update it in Settings.'
        : 'Enter what is left of this tax year\'s allowance to run this. Save it on the ISA in Settings, under Accounts, to keep it.';
      return `
        <div class="lab-field-row">${numInput('labBedAllowance', typed ? state.bed.allowance : (saved.current ? String(saved.value) : ''), 'ISA allowance left, '+taxYearLabel(), '£')}</div>
        <div class="lab-subhead-note">${allowanceNote}</div>
        <div class="lab-subhead">Sell from your GIA</div>
        <div class="lab-checklist">
          ${pool.map(x=>{
            const acc = state.client.accounts.find(a=>a.id===x.accountId);
            return `<label class="lab-checklist-row"><input type="radio" name="labBedSrc" data-bedsrc="${x.id}" ${state.bed.holdingId===x.id?'checked':''}><span class="cl-name">${x.name}</span><span class="cl-meta">${acc?TEI.data.acctLabel(acc):''} · ${fmtGBP(Number(x.value)||0)}</span></label>`;
          }).join('')}
        </div>
        ${isas.length>1 ? `<label class="lab-field"><span class="lab-field-label">Into ISA</span><select class="lab-num-input" id="labBedIsa"><option value="">Choose</option>${isas.map(a=>`<option value="${a.id}" ${state.bed.isaId===a.id?'selected':''}>${TEI.data.acctLabel(a)}</option>`).join('')}</select></label>` : `<div class="lab-subhead-note">Into ${TEI.data.acctLabel(isas[0])}.</div>`}
        ${h ? `<div class="lab-field-row">${numInput('labBedAmount', state.bed.amount, 'Amount to move', '£')}</div>
          <div class="lab-subhead-note">${cap>0 ? 'Up to '+fmtGBP(cap)+', the smaller of the allowance left and the holding\'s value.' : 'Enter the allowance left first.'}</div>
          ${bedAmount()>0.5 ? `<div class="lab-auto-note">${gain==null ? 'There is no cost recorded for this holding, so any gain cannot be shown.' : gain>=0 ? `Selling realises a gain of about ${fmtGBP(gain)}. Gains above the annual exempt amount may be taxable.` : `Selling realises a loss of about ${fmtGBP(-gain)}.`}</div>` : ''}` : ''}
        ${!isa && isas.length>1 ? '<div class="lab-subhead-note">Choose which ISA it goes into.</div>' : ''}
      `;
    }
    if(state.presetType==='target'){
      const sum = targetSum();
      const ok = Math.abs(sum-100)<0.5;
      const classes = labClasses();
      const modeSeg = classes.length > 1 ? seg('data-target-mode', [['holding','By holding'],['class','By asset class']], state.targetMode) : '';
      if(targetByClass()) return `
        ${modeSeg}
        <div class="lab-subhead">Enter target weights</div>
        <div class="lab-subhead-note">Type a share for each asset class. Holdings keep their mix within each class. The Lab shows the moves needed; it does not suggest the split.</div>
        ${classes.map(c=>`<div class="lab-target-row"><span class="tg-name">${c.label}</span><span class="tg-cur">${fmtPct(c.weight)}</span><span class="tg-arrow">→</span><input type="text" inputmode="decimal" class="lab-target-input" data-classid="${c.key}" value="${state.classWeights[c.key]!=null ? state.classWeights[c.key] : ''}" aria-label="Target share for ${c.label}"></div>`).join('')}
        <div class="lab-target-total-row ${ok?'ok':'warn'}"><span>Total</span><span>${fmtPct(sum)}${ok?' ✓':', must add up to 100%'}</span></div>
      `;
      return `
        ${modeSeg}
        ${classes.length === 1 ? `<div class="lab-subhead-note">Everything here is ${classes[0].label.toLowerCase()}. Set an asset class on your holdings in Settings, under Holdings, to plan by class.</div>` : ''}
        <div class="lab-subhead">Enter target weights</div>
        <div class="lab-subhead-note">Type a share for each holding. The Lab shows the moves needed; it does not suggest the split.</div>
        ${base.map(h=>`<div class="lab-target-row"><span class="tg-name">${h.name}</span><span class="tg-cur">${fmtPct(withWeights(base).find(b=>b.id===h.id).weight)}</span><span class="tg-arrow">→</span><input type="text" inputmode="decimal" class="lab-target-input" data-targetid="${h.id}" value="${state.targetWeights[h.id]!==undefined?state.targetWeights[h.id]:''}" placeholder="0.0"></div>`).join('')}
        <div class="lab-target-total-row ${ok?'ok':'warn'}"><span>Total</span><span>${fmtPct(sum)}${ok?' ✓':', must add up to 100%'}</span></div>
      `;
    }
    if(state.presetType==='consolidate'){
      const targetOpts = base.map(h=>`<option value="${h.id}" ${state.consolidateTargetId===h.id?'selected':''}>${h.name} (${h.account})</option>`).join('');
      return `
        ${checklistHTML('Holdings to consolidate', 'Tick every holding to merge fully into the one chosen below.')}
        <div class="lab-field-row">
          <div><span class="lab-field-label">Into holding</span><select class="lab-num-input" id="labConsolidateTarget"><option value="">Select</option>${targetOpts}</select></div>
        </div>
      `;
    }
    return '';
  }

  function statsRowHTML(){
    const base = state.holdings;
    const scopeTotal = base.reduce((s,h)=>s+h.value,0);
    let netNew=0, netRealloc=0, withdrawn=0, resulting=scopeTotal;
    if(state.presetType==='freshcash'){ netNew = freshTotal(); resulting = scopeTotal+netNew; }
    else if(state.presetType==='raisecash'){ withdrawn = raiseAmount(); resulting = scopeTotal; }
    else if(state.presetType==='bedisa'){ netRealloc = bedAmount(); }
    else if(state.presetType==='cap'){
      const capValue = scopeTotal*state.capPct/100;
      netRealloc = base.filter(h=>h.value>capValue).reduce((s,h)=>s+(h.value-capValue),0);
    }
    else if(state.presetType==='move'){ netRealloc = moveTotalRaised(); }
    else if(state.presetType==='consolidate'){ netRealloc = base.filter(h=>state.selectedIds.has(h.id)).reduce((s,h)=>s+h.value,0); }
    return `
      <div class="lab-sc-stats">
        <div class="lab-sc-stat"><div class="v pos">${fmtGBP(netNew)}</div><div class="l">Net new cash</div></div>
        <div class="lab-sc-stat"><div class="v">${fmtGBP(netRealloc)}</div><div class="l">Net reallocated</div></div>
        <div class="lab-sc-stat"><div class="v">${fmtGBP(withdrawn)}</div><div class="l">Cash raised</div></div>
        <div class="lab-sc-stat"><div class="v">${fmtGBP(resulting)}</div><div class="l">Resulting total</div></div>
      </div>
    `;
  }

  function scenarioLabel(){
    const meta = PRESET_LIST.find(p=>p.id===presetCardId(state.presetType));
    if(!meta) return 'Scenario';
    if(state.presetType==='equal') return 'Equal weight';
    if(state.presetType==='cap') return `No holding above ${state.capPct}%`;
    if(state.presetType==='move'){ const t=moveTotalRaised(); return t>0.5 ? `Reallocate ${fmtGBP(t)}` : 'Reallocate capital'; }
    if(state.presetType==='freshcash') return `Add ${fmtGBP(freshTotal())}`;
    if(state.presetType==='raisecash') return `Raise ${fmtGBP(raiseAmount())} cash`;
    if(state.presetType==='bedisa') return `Bed & ISA ${fmtGBP(bedAmount())}`;
    if(state.presetType==='target') return 'Target allocation';
    if(state.presetType==='consolidate'){
      const target = state.holdings.find(h=>h.id===state.consolidateTargetId);
      return target ? `Consolidate into ${target.name}` : 'Consolidate holdings';
    }
    return meta.title;
  }

  function optimiseHTML(){
    const base = state.holdings;
    const canProceed = scenarioCanProceed();
    const chosen = presetCardId(state.presetType);
    const chosenMeta = PRESET_LIST.find(p=>p.id===chosen);
    const presetGrid = `
      <div class="lab-preset-grid" role="group" aria-label="Presets">
        ${visiblePresets().map(p=>`<button type="button" class="lab-preset-card ${chosen===p.id?'selected':''}" data-preset="${p.id}" aria-pressed="${chosen===p.id}"><span class="pt">${p.title}</span></button>`).join('')}
      </div>
      ${chosenMeta ? `<div class="lab-preset-detail"><p class="pt">${chosenMeta.title}</p><p class="pd">${chosenMeta.desc}</p><p class="lab-you-set">You set: ${youSetText()}</p></div>` : ''}
    `;
    let scenarioSection = '';
    if(state.scenarioActive){
      const showLedger = state.presetType!=='target';
      scenarioSection = `
        <div class="lab-scenario-tabs">
          <div class="lab-sc-chip" data-goscenario="0">Current portfolio</div>
          <div class="lab-sc-chip active">${scenarioLabel()}</div>
        </div>
        ${presetControlsHTML()}
        ${statsRowHTML()}
        ${showLedger ? `<div class="lab-subhead">Scenario recipe</div>${ledgerHTML()}` : ''}
        <div class="lab-subhead">Target weights</div>
        <div class="lab-subhead-note">Pure arithmetic, the Lab shows the shortfall, it does not solve around it.</div>
        ${targetWeightsTable(getScenarioHoldings(), base)}
      `;
    }
    return `
      <div class="lab-eyebrow">Stage II</div>
      <h4 class="lab-stage-title">Optimise</h4>
      <div class="lab-stage-desc">You choose the objective. The Lab works out what it takes to get there; it never tells you what to do.</div>
      <div class="lab-subhead">Start from a preset</div>
      <div class="lab-subhead-note">Each preset is a mechanism, not a recommendation.</div>
      ${presetGrid}
      ${scenarioSection}
      <div class="lab-stage-actions">
        <button type="button" class="btn-ghost" data-goto="analyse">← Analyse</button>
        <button type="button" class="btn-primary" data-goto="compare" ${canProceed?'':'disabled'}>Compare scenario →</button>
      </div>
    `;
  }

  /* ---- Stage III: Compare ---- */
  function compareHTML(){
    const base = withWeights(state.holdings);
    const scenario = withWeights(getScenarioHoldings());
    const col = (label, weighted, isScenario) => {
      const conc = concentrationSummary(weighted);
      const eff = effectiveHoldings(weighted);
      const vol = illustrativeVol(weighted);
      const total = weighted.reduce((s,h)=>s+h.value,0);
      return `
        <div class="lab-compare-col">
          <div class="lab-compare-head ${isScenario?'is-scenario':''}"><span class="name">${label}</span><span class="total">${fmtGBP(total)}</span></div>
          <div class="lab-compare-body">
            <div class="lab-mini-tm" data-mini="${isScenario?'scenario':'base'}"></div>
            <div class="lab-compare-stats">
              <div class="lab-compare-stat"><div class="v">${fmtPct(conc.top1)}</div><div class="l">Top 1</div></div>
              <div class="lab-compare-stat"><div class="v">${eff.toFixed(1)}</div><div class="l">Eff. hold.</div></div>
              <div class="lab-compare-stat"><div class="v">${fmtPct(vol)}</div><div class="l">Ill. vol</div></div>
            </div>
          </div>
        </div>`;
    };
    return `
      <div class="lab-eyebrow">Stage III</div>
      <h4 class="lab-stage-title">Compare</h4>
      <div class="lab-stage-desc">Current portfolio and the active scenario, side by side.</div>
      <div class="lab-compare-cols">
        ${col('Current portfolio', base, false)}
        ${state.scenarioActive ? col(scenarioLabel(), scenario, true) : `<div class="line">No scenario active, build one in Optimise first.</div>`}
      </div>
      <div class="lab-stage-actions">
        <button type="button" class="btn-ghost" data-goto="optimise">← Optimise</button>
        <button type="button" class="btn-primary" data-goto="implement" ${scenarioCanProceed()?'':'disabled'}>Implement →</button>
      </div>
    `;
  }

  /* ---- Stage IV: Implement ---- */
  function implementHTML(){
    const {sells, buys, netFlow} = scenarioMoves();
    const flags = crossWrapperFlags(sells, buys);
    // Board (B5.1): SELL / BUY rows with the account name under the holding.
    const moveRow = (icon, verb, name, acct, amt) => `
      <div class="lab-move-row">
        <span class="lab-move-tag ${icon}">${icon==='sell'?'SELL':'BUY'}</span>
        <div class="lab-move-text"><span>${name}</span><small>${acct}</small></div>
        <div class="lab-move-amt">${fmtGBP(amt)}</div>
      </div>`;
    const groupRows = (list, icon, verb, toggleId, open) => list.length<=4
      ? list.map(x=> moveRow(icon, verb, x.name, x.account, x.amount)).join('')
      : `
        <button type="button" class="lab-move-row clickable" id="${toggleId}" aria-expanded="${open}">
          <span class="lab-move-tag ${icon}">${icon==='sell'?'SELL':'BUY'}</span>
          <span class="lab-move-text"><span>${list.length} holdings</span><small>${open?'Hide':'Show'} each one</small></span>
          <span class="lab-move-amt">${fmtGBP(list.reduce((s,x)=>s+x.amount,0))}</span>
        </button>
        ${open ? list.map(x=> moveRow(icon, verb, x.name, x.account, x.amount)).join('') : ''}
      `;
    let sellRows = sells.length ? groupRows(sells, 'sell', 'Sell', 'labImplementToggleSell', state.implementOpen) : '';
    let buyRows = buys.length ? groupRows(buys, 'buy', 'Buy', 'labImplementToggleBuy', state.implementOpen) : '';
    if(netFlow > 0.5 && sells.length===0){
      sellRows = `<div class="lab-move-row"><span class="lab-move-tag buy">NEW</span><div class="lab-move-text"><span>New money into the portfolio</span><small>Not from an existing holding</small></div><div class="lab-move-amt">${fmtGBP(netFlow)}</div></div>`;
    }
    if(netFlow < -0.5 && buys.length===0){
      buyRows = `<div class="lab-move-row"><span class="lab-move-tag sell">OUT</span><div class="lab-move-text"><span>Money leaves the portfolio</span><small>Not reinvested</small></div><div class="lab-move-amt">${fmtGBP(-netFlow)}</div></div>`;
    }
    return `
      <div class="lab-eyebrow">Stage IV</div>
      <h4 class="lab-stage-title">Implement</h4>
      <div class="lab-stage-desc">What the scenario means in practice, set out as moves. Nothing here places a trade.</div>
      ${sellRows}
      ${buyRows}
      ${movesSummaryHTML(sells, buys)}
      ${crossFlagsHTML(flags)}
      <div class="lab-stage-actions">
        <button type="button" class="btn-ghost" data-goto="compare">← Compare</button>
        <button type="button" class="btn-primary" data-goto="results">Results →</button>
      </div>
    `;
  }

  function beforeAfterBars(beforeVal, afterVal, scale, beforeLabel, afterLabel){
    const bW = Math.max(0, Math.min(100, (beforeVal/scale)*100));
    const aW = Math.max(0, Math.min(100, (afterVal/scale)*100));
    return `<div class="lab-ba-bars">
      <div class="lab-ba-bar-track"><div class="lab-ba-bar-fill ba-before" style="width:${bW}%"></div></div>
      <div class="lab-ba-bar-track"><div class="lab-ba-bar-fill ba-after" style="width:${aW}%"></div></div>
    </div>
    <div class="lab-ba-nums"><span>${beforeLabel}</span><span class="after-n">${afterLabel}</span></div>`;
  }

  /* ---- Stage V: Results ---- */
  function resultsHTML(){
    const base = withWeights(state.holdings);
    const scenario = withWeights(getScenarioHoldings());
    const concBefore = concentrationSummary(base);
    const concAfter = concentrationSummary(scenario);
    const effBefore = effectiveHoldings(base);
    const effAfter = effectiveHoldings(scenario);
    const volBefore = illustrativeVol(base);
    const volAfter = illustrativeVol(scenario);
    const effScale = Math.max(effBefore, effAfter, 1) * 1.15;
    const {sells, buys, netFlow} = scenarioMoves();
    const flags = crossWrapperFlags(sells, buys);
    const totalMoved = Math.max(sells.reduce((s,x)=>s+x.amount,0), buys.reduce((s,x)=>s+x.amount,0), Math.abs(netFlow));
    const n = (k, one, many) => `${k} ${k===1?one:many}`;
    // Three points (B5.1): what moves, what it does to the mix, what it takes.
    const mixLine = `Your largest holding goes from ${fmtPct(concBefore.top1)} to ${fmtPct(concAfter.top1)} of the total, and the mix behaves like ${effAfter.toFixed(1)} equal holdings instead of ${effBefore.toFixed(1)}.`;
    const takesLine = `It takes ${n(sells.length,'sale','sales')} and ${n(buys.length,'purchase','purchases')}${totalMoved>0.5 ? ', '+fmtGBP(totalMoved)+' in all' : ''}.`;

    let narrative = [];
    if(state.presetType==='equal'){
      narrative = [`${n(state.selectedIds.size,'holding','holdings')} move to equal shares of their combined value.`, mixLine, takesLine];
    } else if(state.presetType==='cap'){
      narrative = [`Holdings over ${state.capPct}% are brought back to ${state.capPct}%, and the excess goes to ${n(buys.length,'holding','holdings')}.`, mixLine, takesLine];
    } else if(state.presetType==='move'){
      narrative = [`${fmtGBP(totalMoved)} moves from ${n(sells.length,'holding','holdings')} into ${n(buys.length,'holding','holdings')}.`, mixLine, takesLine];
    } else if(state.presetType==='freshcash'){
      narrative = [`${fmtGBP(freshTotal())} of new money goes into ${n(buys.length,'holding','holdings')}${state.freshMode==='monthly' ? ', '+fmtGBP(Number(state.freshMonthly)||0)+' a month for '+(Number(state.freshMonths)||0)+' months' : ''}. Nothing is sold.`, mixLine, takesLine];
    } else if(state.presetType==='raisecash'){
      narrative = [`${fmtGBP(raiseAmount())} of cash is freed from ${n(sells.length,'holding','holdings')}.`, mixLine, takesLine];
    } else if(state.presetType==='target'){
      narrative = [targetByClass() ? 'Each asset class moves to the share you entered; holdings keep their mix within each class.' : 'Every holding moves to the share you entered.', mixLine, takesLine];
    } else if(state.presetType==='bedisa'){
      const h = bedSource(), gain = bedGain();
      narrative = [
        `${fmtGBP(bedAmount())} of ${h ? h.name : 'the holding'} moves from ${sells[0] ? sells[0].account : 'your GIA'} to ${buys[0] ? buys[0].account : 'your ISA'}.`,
        'Your mix of holdings stays the same; only the account it sits in changes.',
        gain==null ? 'There is no cost recorded for this holding, so any gain on the sale cannot be shown.' : gain>=0 ? `Selling realises a gain of about ${fmtGBP(gain)}. Gains above the annual exempt amount may be taxable.` : `Selling realises a loss of about ${fmtGBP(-gain)}.`
      ];
    } else if(state.presetType==='consolidate'){
      narrative = [`${n(sells.length,'holding','holdings')} merge fully into one.`, mixLine, takesLine];
    }

    return `
      <div class="lab-eyebrow">Stage V</div>
      <h4 class="lab-stage-title">Results</h4>
      <div class="lab-stage-desc">What this scenario changes, in plain words.</div>
      <ul class="lab-results-narrative">${narrative.map(l=>`<li>${l}</li>`).join('')}</ul>
      ${crossFlagsHTML(flags)}
      <p class="lab-not-advice">Scenarios show the mechanics of a change, not a recommendation to make it.</p>
      <div class="lab-ba-legend"><span><i class="ba-before-i"></i>Current</span><span><i class="ba-after-i"></i>${scenarioLabel()}</span></div>
      <div class="lab-ba-stat-grid">
        <div class="lab-ba-stat">${beforeAfterBars(concBefore.top1, concAfter.top1, 100, fmtPct(concBefore.top1), fmtPct(concAfter.top1))}<div class="l">Top 1 concentration</div></div>
        <div class="lab-ba-stat">${beforeAfterBars(concBefore.top3, concAfter.top3, 100, fmtPct(concBefore.top3), fmtPct(concAfter.top3))}<div class="l">Top 3 concentration</div></div>
        <div class="lab-ba-stat">${beforeAfterBars(concBefore.top5, concAfter.top5, 100, fmtPct(concBefore.top5), fmtPct(concAfter.top5))}<div class="l">Top 5 concentration</div></div>
      </div>
      <div class="lab-ba-stat-grid two">
        <div class="lab-ba-stat">${beforeAfterBars(effBefore, effAfter, effScale, effBefore.toFixed(1), effAfter.toFixed(1))}<div class="l">Effective number of holdings</div></div>
        <div class="lab-ba-stat">${beforeAfterBars(volBefore, volAfter, 100, fmtPct(volBefore), fmtPct(volAfter))}<div class="l">Illustrative volatility</div></div>
      </div>
      <div class="lab-subhead">Move needed for 1% portfolio impact, before / after<span class="lab-approx-flag">Approximate</span></div>
      <div class="lab-subhead-note">The approximate single-holding move required to shift total portfolio value by 1%, before and after this scenario.</div>
      <div class="lab-fold"><div style="overflow-x:auto;">
      <table class="lab-detail-table">
        <thead><tr><th>Holding</th><th>Value</th><th>Weight</th><th>Move for 1%</th></tr></thead>
        <tbody>
          ${[...base].sort((a,b)=>b.weight-a.weight).map(b=>{
            const after = scenario.find(x=>x.id===b.id);
            const afterVal = after ? after.value : 0;
            const afterWeight = after ? after.weight : 0;
            const moveBefore = moveNeededFor1Pct(b.weight);
            const moveAfter = afterWeight>0 ? moveNeededFor1Pct(afterWeight) : null;
            const isZero = afterWeight===0 && b.weight>0;
            const unchanged = Math.abs(afterVal - b.value) < 0.5;
            return `<tr${unchanged ? ' class="lab-same" hidden' : ''}>
              <td>${b.name}</td>
              <td><span class="lab-ba-pair"><span class="before">${fmtGBP(b.value)}</span><span class="arrow">→</span><span class="after ${isZero?'strike':''}">${fmtGBP(afterVal)}</span></span></td>
              <td><span class="lab-ba-pair"><span class="before">${fmtPct(b.weight)}</span><span class="arrow">→</span><span class="after">${fmtPct(afterWeight)}</span></span></td>
              <td><span class="lab-ba-pair"><span class="before">${moveBefore!==null?fmtPct(moveBefore):'–'}</span><span class="arrow">→</span><span class="after lab-move-figure">${moveAfter!==null?fmtPct(moveAfter):'–'}</span></span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      ${(()=>{ const n = base.filter(b=>{ const af = scenario.find(x=>x.id===b.id); return Math.abs((af ? af.value : 0) - b.value) < 0.5; }).length; return foldBtn(n, n === 1 ? 'holding' : 'holdings'); })()}
      </div>
      <label class="lab-field lab-save-name"><span class="lab-field-label">Name this scenario</span><input type="text" class="lab-num-input" id="labScenarioName" maxlength="80" value="${svEsc(scenarioLabel())}"></label>
      <div class="lab-stage-actions">
        <button type="button" class="btn-ghost" data-goto="implement">← Implement</button>
        <span class="lab-result-btns">
          <button type="button" class="btn-ghost" id="labDiscussBtn">Discuss with your coach</button>
          <button type="button" class="btn-primary" id="labSaveScenarioBtn">Save scenario</button>
        </span>
      </div>
    `;
  }

  /* ---------------------------- events ---------------------------- */
  // The amount/cap/target fields are type="text" (not type="number") specifically so the
  // cursor can be preserved across renderStageBody()'s per-keystroke re-render above --
  // Chrome throws on selectionStart/setSelectionRange for type="number", which otherwise
  // resets the caret to 0 on every character and reverses whatever's typed. Since a plain
  // text field accepts any character, strip anything that is not part of a number here,
  // fixing the cursor to the end of the field on the (rare) occasion a stray character
  // needed removing rather than trying to track exactly where it was deleted from.
  function sanitizeNumericInput(e){
    const raw = e.target.value;
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    if(cleaned !== raw){ e.target.value = cleaned; e.target.setSelectionRange(cleaned.length, cleaned.length); }
    return cleaned;
  }
  function wireStageEvents(){
    document.querySelectorAll('#labStageBody [data-goto]').forEach(b=>b.addEventListener('click', ()=>{ if(!b.disabled) goStage(b.dataset.goto); }));
    document.querySelectorAll('#labStageBody [data-preset]').forEach(b=>b.addEventListener('click', ()=>{
      // Reallocate capital runs on the 'move' engine (amount, new share) or 'cap' (maximum weight).
      const preset = b.dataset.preset==='realloc' ? (state.reallocMode==='cap' ? 'cap' : 'move') : b.dataset.preset;
      state.scenarioActive = true;
      state.presetType = preset;
      if(preset==='move') state.reallocMode = state.reallocMode==='share' ? 'share' : 'amount';
      state.freshMode = 'lump'; state.freshLump = '10000'; state.freshMonthly = '500'; state.freshMonths = '12';
      state.raiseUnit = '£'; state.raiseValue = '5000';
      state.bed = {holdingId:null, isaId:null, amount:'', allowance: state.bed ? state.bed.allowance : ''};
      state.capPct = 20;
      state.moveUnit = '£';
      state.moveSourceIds = new Set(); state.moveSourceAmounts = {};
      state.moveDestMode = 'prorata'; state.moveDestIds = new Set(); state.moveDestAmounts = {};
      state.cashAmount = 10000; state.raiseCashTargetPct = 10;
      state.consolidateTargetId = null;
      state.ledgerOpen = false; state.implementOpen = false;
      state.selectedIds = new Set(scenarioPool().map(h=>h.id));
      if(preset==='target'){
        const w = withWeights(state.holdings);
        state.targetWeights = {};
        state.holdings.forEach(h=> state.targetWeights[h.id] = Number(w.find(x=>x.id===h.id).weight.toFixed(1)));
        state.classWeights = {};
        labClasses().forEach(c=> state.classWeights[c.key] = Number(c.weight.toFixed(1)));
      } else { state.targetWeights = {}; state.classWeights = {}; }
      if(preset==='consolidate') state.selectedIds = new Set();
      if(preset==='move' && state.reallocMode==='share') state.moveUnit = 'share';
      renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-reallocmode]').forEach(b=>b.addEventListener('click', ()=>{
      const mode = b.dataset.reallocmode;
      state.reallocMode = mode;
      state.presetType = mode==='cap' ? 'cap' : 'move';
      state.moveUnit = mode==='share' ? 'share' : '£';
      state.moveSourceIds = new Set(); state.moveSourceAmounts = {};
      state.moveDestMode = 'prorata'; state.moveDestIds = new Set(); state.moveDestAmounts = {};
      state.ledgerOpen = false;
      state.selectedIds = new Set(mode==='cap' ? scenarioPool().map(h=>h.id) : []);
      renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-freshmode]').forEach(b=>b.addEventListener('click', ()=>{ state.freshMode = b.dataset.freshmode; renderStageBody(); }));
    document.querySelectorAll('#labStageBody [data-raiseunit]').forEach(b=>b.addEventListener('click', ()=>{
      state.raiseUnit = b.dataset.raiseunit; state.raiseValue = state.raiseUnit==='%' ? '10' : '5000'; renderStageBody();
    }));
    const textField = (id, set)=>{ const el = document.getElementById(id); if(el) el.addEventListener('input', (e)=>{ set(sanitizeNumericInput(e)); renderStageBody(); }); };
    textField('labFreshLump', v=> state.freshLump = v);
    textField('labFreshMonthly', v=> state.freshMonthly = v);
    textField('labFreshMonths', v=> state.freshMonths = v);
    textField('labRaiseInput', v=> state.raiseValue = v);
    textField('labBedAllowance', v=> state.bed.allowance = v);
    textField('labBedAmount', v=> state.bed.amount = v);
    document.querySelectorAll('#labStageBody [data-bedsrc]').forEach(r=>r.addEventListener('change', ()=>{ state.bed.holdingId = r.dataset.bedsrc; renderStageBody(); }));
    const bedIsaSel = document.getElementById('labBedIsa');
    if(bedIsaSel) bedIsaSel.addEventListener('change', (e)=>{ state.bed.isaId = e.target.value || null; renderStageBody(); });
    const discussBtn = document.getElementById('labDiscussBtn');
    if(discussBtn) discussBtn.addEventListener('click', async ()=>{
      // Sends the scenario to the coach as a message (the feedback channel,
      // which emails the coach), like the request buttons elsewhere. The
      // coach previewing a client copies it instead: nothing is sent.
      const text = [scenarioLabel()].concat(Array.from(document.querySelectorAll('#labStageBody .lab-results-narrative li')).map(li=> '- ' + li.textContent)).join('\n');
      const c = state.client;
      if(!c || !c.meta || c.meta.role === 'adviser'){
        const done = ()=> showToast('Summary copied. Clients send this to you; nothing is sent while you preview.');
        if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, ()=> showToast('Could not copy.'));
        return;
      }
      discussBtn.disabled = true;
      try{
        await TEI.wealthOS.saveFeedback(c.meta.clientId, 'general', 'lab', 'Portfolio Lab scenario to discuss:\n' + text, c.meta.role);
        discussBtn.textContent = 'Sent to your coach';
        showToast('Sent. Your coach will go through it with you.');
      } catch(err){
        console.error('Portfolio Lab: scenario not sent', err);
        discussBtn.disabled = false;
        showToast('That did not send. Please try again.');
      }
    });
    const capInput = document.getElementById('labCapInput');
    if(capInput) capInput.addEventListener('input', (e)=>{
      state.capPct = Number(sanitizeNumericInput(e))||0;
      state.selectedIds = new Set(scenarioPool().map(h=>h.id));
      renderStageBody();
    });
    document.querySelectorAll('#labStageBody [data-moveunit]').forEach(b=>b.addEventListener('click', ()=>{
      state.moveUnit = b.dataset.moveunit; state.moveSourceAmounts = {}; state.moveDestAmounts = {}; renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-movedestmode]').forEach(b=>b.addEventListener('click', ()=>{
      state.moveDestMode = b.dataset.movedestmode; state.ledgerOpen = false; renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-amtcheck^="src:"]').forEach(cb=>cb.addEventListener('change', (e)=>{
      const id = cb.dataset.amtcheck.split(':')[1];
      if(e.target.checked) state.moveSourceIds.add(id); else { state.moveSourceIds.delete(id); delete state.moveSourceAmounts[id]; }
      state.ledgerOpen = false; renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-amtval^="src:"]').forEach(inp=>inp.addEventListener('input', (e)=>{
      state.moveSourceAmounts[inp.dataset.amtval.split(':')[1]] = sanitizeNumericInput(e); renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-amtcheckall^="src:"]').forEach(b=>b.addEventListener('click', ()=>{
      state.moveSourceIds = b.dataset.amtcheckall.split(':')[1]==='1' ? new Set(moveSourcePool().map(h=>h.id)) : new Set();
      renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-amtcheck^="dst:"]').forEach(cb=>cb.addEventListener('change', (e)=>{
      const id = cb.dataset.amtcheck.split(':')[1];
      if(e.target.checked) state.moveDestIds.add(id); else { state.moveDestIds.delete(id); delete state.moveDestAmounts[id]; }
      state.ledgerOpen = false; renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-amtval^="dst:"]').forEach(inp=>inp.addEventListener('input', (e)=>{
      state.moveDestAmounts[inp.dataset.amtval.split(':')[1]] = sanitizeNumericInput(e); renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-amtcheckall^="dst:"]').forEach(b=>b.addEventListener('click', ()=>{
      state.moveDestIds = b.dataset.amtcheckall.split(':')[1]==='1' ? new Set(moveDestPool().map(h=>h.id)) : new Set();
      renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-movedestcheck]').forEach(cb=>cb.addEventListener('change', (e)=>{
      const id = cb.dataset.movedestcheck;
      if(e.target.checked) state.moveDestIds.add(id); else state.moveDestIds.delete(id);
      state.ledgerOpen = false; renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-movedestcheckall]').forEach(b=>b.addEventListener('click', ()=>{
      state.moveDestIds = b.dataset.movedestcheckall==='1' ? new Set(moveDestPool().map(h=>h.id)) : new Set();
      renderStageBody();
    }));
    const cashSlider = document.getElementById('labCashSlider');
    if(cashSlider) cashSlider.addEventListener('input', (e)=>{ state.cashAmount = Number(e.target.value); renderStageBody(); });
    const raiseCashSlider = document.getElementById('labRaiseCashSlider');
    if(raiseCashSlider) raiseCashSlider.addEventListener('input', (e)=>{ state.raiseCashTargetPct = Number(e.target.value); renderStageBody(); });
    document.querySelectorAll('#labStageBody [data-targetid]').forEach(inp=>inp.addEventListener('input', (e)=>{
      state.targetWeights[inp.dataset.targetid] = sanitizeNumericInput(e); renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-classid]').forEach(inp=>inp.addEventListener('input', (e)=>{
      state.classWeights[inp.dataset.classid] = sanitizeNumericInput(e); renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-target-mode]').forEach(b=>b.addEventListener('click', ()=>{
      state.targetMode = b.dataset.targetMode; renderStageBody();
    }));
    const consolidateTarget = document.getElementById('labConsolidateTarget');
    if(consolidateTarget) consolidateTarget.addEventListener('change', (e)=>{ state.consolidateTargetId = e.target.value||null; renderStageBody(); });
    document.querySelectorAll('#labStageBody [data-checkid]').forEach(cb=>cb.addEventListener('change', (e)=>{
      const id = cb.dataset.checkid;
      if(e.target.checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
      state.ledgerOpen = false; renderStageBody();
    }));
    document.querySelectorAll('#labStageBody [data-checkall]').forEach(b=>b.addEventListener('click', ()=>{
      const pool = scenarioPool();
      state.selectedIds = b.dataset.checkall==='1' ? new Set(pool.map(h=>h.id)) : new Set();
      state.ledgerOpen = false; renderStageBody();
    }));
    const ledgerToggle = document.getElementById('labLedgerToggle');
    if(ledgerToggle) ledgerToggle.addEventListener('click', ()=>{ state.ledgerOpen = !state.ledgerOpen; renderStageBody(); });
    const implToggleSell = document.getElementById('labImplementToggleSell');
    if(implToggleSell) implToggleSell.addEventListener('click', ()=>{ state.implementOpen = !state.implementOpen; renderStageBody(); });
    const implToggleBuy = document.getElementById('labImplementToggleBuy');
    if(implToggleBuy) implToggleBuy.addEventListener('click', ()=>{ state.implementOpen = !state.implementOpen; renderStageBody(); });
    const saveBtn = document.getElementById('labSaveScenarioBtn');
    if(saveBtn) saveBtn.addEventListener('click', ()=> saveCurrentScenario(saveBtn));

    const base = withWeights(state.holdings);
    const scenario = withWeights(getScenarioHoldings());
    document.querySelectorAll('#labStageBody [data-mini="base"]').forEach(el=> renderTreemapInto(el, null, base, {small:true, height:130}));
    document.querySelectorAll('#labStageBody [data-mini="scenario"]').forEach(el=> renderTreemapInto(el, null, scenario, {small:true, height:130}));
  }

  /* Board (B5.1): two switches, on = that money is included in the treemap
     and the Lab. Shown only when an account in scope has the setting. The
     treemap title follows them: "Everything you own", "Actively managed
     money" (both off) or "Filtered view" (one of two off). */
  const SWITCH_LABEL = {setAndForget:'Set-and-forget', earmarked:'Earmarked'};
  function renderLabFilters(){
    const row = document.getElementById('labFilterRow');
    if(!row) return;
    const shown = FILTERS.filter(f=> state.filterAvail[f.key]);
    row.hidden = !shown.length;
    const off = shown.filter(f=> state.hide[f.key]).length;
    const title = document.getElementById('wlTmTitle');
    if(title) title.textContent = !off ? 'Everything you own' : (off === shown.length ? 'Actively managed money' : 'Filtered view');
    const chips = document.getElementById('labFilterChips');
    chips.innerHTML = shown.map(f=>{
      const included = !state.hide[f.key];
      return `<button type="button" class="wl-switch" role="switch" data-lab-filter="${f.key}" aria-checked="${included}"><span class="wl-switch-track" aria-hidden="true"><span></span></span>${SWITCH_LABEL[f.key] || f.label}</button>`;
    }).join('');
    chips.querySelectorAll('[data-lab-filter]').forEach(b=> b.addEventListener('click', ()=>{
      const key = b.dataset.labFilter;
      state.hide[key] = !state.hide[key];
      TEI.render.portfolioLab(state.client, state.scopeId);
      const again = document.querySelector(`#labFilterChips [data-lab-filter="${key}"]`); // innerHTML rebuilt -- keep keyboard focus on the chip
      if(again) again.focus();
    }));
    document.getElementById('labFilterNote').textContent = state.fullTotal!=null
      ? `Showing ${fmtGBP(grandTotal())} of ${fmtGBP(state.fullTotal)} Holistic Portfolio`
      : '';
  }

  function renderLabAll(){
    renderLabFilters();
    renderTreemapSection();
    // The stepper and stage panel are always shown now (B5.1 board), beside
    // the treemap on desktop and under it on phones; no full-screen mode.
    const wrap = document.getElementById('labStepperWrap');
    if(!wrap) return;
    const phone = window.matchMedia('(max-width:860px)').matches;
    wrap.classList.toggle('open', phone && !!state.expanded);
    document.documentElement.classList.toggle('lab-wiz-open', phone && !!state.expanded);
    const cta = document.getElementById('labCta');
    if(cta){ cta.hidden = !phone || !state.holdings.length; if(!state.expanded) cta.textContent = 'Open the Lab: model a change'; }
    if(!state.holdings.length){ document.getElementById('labStepper').innerHTML = ''; document.getElementById('labStageBody').innerHTML = ''; return; }
    renderStepper(); renderStageBody();
  }

  /* ---------------------------- saved scenarios ----------------------------
     "Save scenario" on Results stores the name, the plain-words summary and
     the moves (TEI.wealthOS.saveScenario). When a client saves, a message
     also goes to the coach through the feedback channel, which emails the
     coach (the same route as "Discuss with your coach"). The coach saving
     while previewing a client sends nothing. The list sits under the Lab. */
  function svEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  let svLoadingFor = null;
  async function loadSaved(client){
    if(!client || !client.meta || !TEI.wealthOS || !TEI.wealthOS.listScenarios) return;
    if(client.scenarios || svLoadingFor === client.meta.clientId){ renderSaved(); return; }
    svLoadingFor = client.meta.clientId;
    try{ client.scenarios = await TEI.wealthOS.listScenarios(client.meta.clientId); }
    catch(err){ console.error('Portfolio Lab: saved scenarios not loaded', err); client.scenarios = []; }
    svLoadingFor = null;
    if(state.client === client) renderSaved();
  }
  function renderSaved(){
    const tile = document.getElementById('labSaved'), list = document.getElementById('labSavedList');
    const c = state.client;
    if(!tile || !list || !c) return;
    const items = c.scenarios || [];
    tile.hidden = !items.length;
    const viewer = c.meta && c.meta.role === 'adviser' ? 'adviser' : 'client';
    const who = s => s.savedBy === viewer ? 'by you' : s.savedBy === 'adviser' ? 'by your coach' : 'by ' + (c.personal && c.personal.firstName || 'the client');
    const when = s => { const d = new Date(s.createdAt); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}); };
    list.innerHTML = items.map(s=>{
      const moves = s.moves || [];
      return `<li class="wl-sv">
        <div class="wl-sv-head"><span><b>${svEsc(s.name)}</b><small>Saved ${svEsc(when(s))} ${svEsc(who(s))}</small></span>
          <button type="button" class="hm-link hm-linkbtn" data-sv-del="${svEsc(s.id)}">Delete<span class="gl-sr"> ${svEsc(s.name)}</span></button></div>
        ${(s.meta.summary||[]).length ? `<ul class="wl-sv-sum">${s.meta.summary.map(l=> `<li>${svEsc(l)}</li>`).join('')}</ul>` : ''}
        ${moves.length ? `<details class="wl-sv-moves"><summary>${moves.length} ${moves.length === 1 ? 'move' : 'moves'}</summary><ul>${moves.map(m=>
          `<li><span><i class="wl-sv-${m.type === 'sell' ? 'sell' : 'buy'}">${m.type === 'sell' ? 'Sell' : 'Buy'}</i>${svEsc(m.name)}<small>${svEsc(m.account)}</small></span><b>${fmtGBP(m.amount)}</b></li>`).join('')}</ul></details>` : ''}
      </li>`;
    }).join('');
    if(!list.dataset.wired){
      list.dataset.wired = '1';
      list.addEventListener('click', async e=>{
        const b = e.target.closest('[data-sv-del]');
        if(!b || !state.client) return;
        if(!window.confirm('Delete this saved scenario?')) return;
        b.disabled = true;
        try{
          await TEI.wealthOS.deleteScenario(b.dataset.svDel);
          state.client.scenarios = (state.client.scenarios||[]).filter(s=> s.id !== b.dataset.svDel);
          renderSaved();
          showToast('Scenario deleted');
        } catch(err){
          console.error('Portfolio Lab: scenario not deleted', err);
          b.disabled = false;
          showToast('That did not delete. Please try again.');
        }
      });
    }
  }
  async function saveCurrentScenario(btn){
    const c = state.client;
    if(!c || !c.meta) return;
    const nameEl = document.getElementById('labScenarioName');
    const name = ((nameEl && nameEl.value) || '').trim() || scenarioLabel();
    const {sells, buys} = scenarioMoves();
    const moves = sells.map(m=> ({type:'sell', name:m.name, account:m.account, amount:Math.round(m.amount)}))
      .concat(buys.map(m=> ({type:'buy', name:m.name, account:m.account, amount:Math.round(m.amount)})));
    const summary = Array.from(document.querySelectorAll('#labStageBody .lab-results-narrative li')).map(li=> li.textContent.trim()).filter(Boolean);
    const savedBy = c.meta.role === 'adviser' ? 'adviser' : 'client';
    btn.disabled = true;
    let saved;
    try{
      saved = await TEI.wealthOS.saveScenario(c.meta.clientId, {name, moves, meta:{preset:state.presetType, label:scenarioLabel(), summary, scope:state.scopeId || null}}, savedBy);
    } catch(err){
      console.error('Portfolio Lab: scenario not saved', err);
      btn.disabled = false;
      showToast('That did not save. Please try again.');
      return;
    }
    c.scenarios = [saved].concat(c.scenarios || []);
    renderSaved();
    btn.textContent = 'Saved';
    if(savedBy !== 'client'){ showToast('Saved to this client\'s Lab.'); return; }
    const text = 'Saved a Portfolio Lab scenario: ' + name + '\n' + summary.map(l=> '- ' + l).join('\n') +
      (moves.length ? '\n\nMoves:\n' + moves.map(m=> (m.type === 'sell' ? 'Sell ' : 'Buy ') + fmtGBP(m.amount) + ' ' + m.name + ' (' + m.account + ')').join('\n') : '');
    try{
      await TEI.wealthOS.saveFeedback(c.meta.clientId, 'scenario', 'lab', text, 'client');
      showToast('Saved. Your coach has been sent a copy.');
    } catch(err){
      console.error('Portfolio Lab: coach not told about the saved scenario', err);
      showToast('Saved. Your coach could not be told just now.');
    }
  }

  // The read-only "Your portfolio" treemap on Wealth (B5.1) uses the same layout.
  TEI.lab = { layoutTreemap, treemapOrder, moveNeededFor1Pct };

  /* ---------------------------- mount ---------------------------- */
  // Called from applyAnalysisScope on every full render and every scope-pill switch.
  // A genuine scope change resets in-progress scenario state (same as the reference
  // build's own scope-switch behaviour); re-rendering the *same* scope (e.g. after a
  // live-price refresh) keeps whatever stage/scenario was already in progress.
  TEI.render.portfolioLab = function(client, scopeId){
    const scopeKey = scopeId || 'all';
    state.client = client; state.scopeId = scopeId;
    state.filterAvail = filterAvailability(client, scopeId);
    // A setting no account has any more resets its switch to the default (off), so
    // it comes back in the default state if the setting is turned on again later.
    if(!scopeId) FILTERS.forEach(f=>{ if(!state.filterAvail[f.key]) state.hide[f.key] = true; });
    const filterKey = FILTERS.map(f=> state.hide[f.key] && state.filterAvail[f.key] ? 1 : 0).join('');
    if(state.scopeKey !== scopeKey) resetScenarioState();
    else if(state.filterKey !== filterKey){
      // Toggling a chip changes which holdings are being modelled, so any scenario in
      // progress is reset like a scope switch -- but the Lab stays open if it was.
      const wasExpanded = state.expanded;
      resetScenarioState();
      state.expanded = wasExpanded;
    }
    state.scopeKey = scopeKey;
    state.filterKey = filterKey;
    const source = filteredClient(client);
    state.holdings = buildLabHoldings(source, scopeId);
    state.driverRows = buildDriverRows(source, scopeId);
    state.driverEmptyNote = driverEmptyNote(source, scopeId);
    state.fullTotal = anyFilterOn() ? client.holdings.reduce((s,h)=>s+(Number(h.value)||0),0) : null;
    if(state.expanded){
      const cta = document.getElementById('labCta');
      if(cta) cta.textContent = 'Close the Lab';
    }
    renderLabAll();
    loadSaved(client);
    const cta = document.getElementById('labCta');
    if(cta && !cta.dataset.wired){
      cta.addEventListener('click', ()=>{
        state.expanded = !state.expanded;
        cta.textContent = state.expanded ? 'Close the Lab' : 'Open the Lab: model a change';
        renderLabAll();
        // Mobile: the Lab is a full-screen panel, so always open it at the top.
        const lw = document.getElementById('labStepperWrap');
        if(state.expanded && lw) lw.scrollTop = 0;
      });
      cta.dataset.wired = '1';
    }
    const closeBtn = document.getElementById('labCloseBtn');
    if(closeBtn && !closeBtn.dataset.wired){
      closeBtn.addEventListener('click', ()=>{ if(state.expanded && cta) cta.click(); });
      closeBtn.dataset.wired = '1';
    }
  };
})();

