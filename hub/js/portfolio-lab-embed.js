/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — embedded live inside Wealth OS
   The Everyday Investor

   Everything in this file is wrapped in one IIFE so its ~40 top-level
   consts/functions (state, render, STAGES, computeTotals, fmtGBP, showModal,
   ...) never touch the global scope wealth-os.html's own IIFE blocks share
   window.TEI through -- avoids colliding with that file's own `state`,
   `render()` etc. (it has its own, unrelated to this one). Only
   TEI.render.portfolioLab is exposed, called from TEI.render.portfolio once
   per Portfolio-page render with the already-loaded client object -- no
   second holdings fetch, this reuses what wealth-os.html already has.

   Source: adapted from the standalone Lab (portfolio-optimisation-lab/),
   same calculation engine and every render-*.js view unchanged. Differs
   from that build in exactly four ways, each marked below:
     1. Holdings come from TEI.calc.groupedHoldings(client) instead of a
        demo list or a CSV/manual entry UI -- Stage I is display-only.
     2. Scenarios persist to wealth_os.portfolio_scenarios via
        window.teiSupabase directly (already loaded by this page) instead
        of a separate auth/fetch layer.
     3. Modal/toast/confirm dialogs mount inside the lab root element
        instead of document.body, and querySelectorAll calls that were
        unscoped in the standalone build are scoped to the lab root --
        needed here because this document holds many other pages' markup
        at once, not just this one.
     4. No page-level scrollTo on stage change (would yank the whole
        Wealth OS page back to its top every time someone switches Lab
        stages) and no outer topbar chrome (brand mark, back link) --
        this is a card within the Portfolio page, not its own page.

   Outstanding (see INTEGRATION_NOTES.md): no per-account/aggregated
   toggle yet, and TEI.calc.groupedHoldings already merges by ticker for
   the (only) aggregated view this shows -- so the "merge on ticker in
   aggregate view" requirement is incidentally satisfied, but the
   per-account view itself doesn't exist yet. Flagged, not built.
   ========================================================================= */
(function(){
  window.TEI = window.TEI || {};
  TEI.render = TEI.render || {};

  const LAB_ROOT_ID = 'portfolioLabRoot';
  let LAB_ROOT = null; // set on mount

  /* ---------------------------- helpers ---------------------------- */
  const uid = (() => { let n=0; return (p='id') => p + '_' + (++n) + '_' + Math.random().toString(36).slice(2,7); })();
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmtGBP = (v, dp=0) => {
    const neg = v < 0;
    const abs = Math.abs(v);
    const s = '£' + abs.toLocaleString('en-GB', {minimumFractionDigits:dp, maximumFractionDigits:dp});
    return neg ? '-' + s : s;
  };
  const fmtPct = (v, dp=1) => (v>0?'+':'') + v.toFixed(dp) + '%';
  const fmtPctPlain = (v, dp=1) => v.toFixed(dp) + '%';
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const sum = arr => arr.reduce((a,b)=>a+b, 0);
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function beforeAfterBars(beforeVal, afterVal, scale, beforeLabel, afterLabel, align){
    const bW = clamp((beforeVal/scale)*100, 0, 100);
    const aW = clamp((afterVal/scale)*100, 0, 100);
    return `<div class="ba-cell${align==='right' ? ' ba-right' : ''}">
      <div class="ba-bars">
        <div class="ba-bar-track"><div class="ba-bar-fill ba-before" style="width:${bW}%"></div></div>
        <div class="ba-bar-track"><div class="ba-bar-fill ba-after" style="width:${aW}%"></div></div>
      </div>
      <div class="ba-nums"><div class="ba-before-n">${beforeLabel}</div><div class="num">${afterLabel}</div></div>
    </div>`;
  }

  function svgRing(pct, size=76, stroke=8, color){
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const dash = c * (clamp(pct, 0, 100) / 100);
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--cream-2)" stroke-width="${stroke}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color||'var(--gold)'}" stroke-width="${stroke}" stroke-dasharray="${dash} ${c-dash}" stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
    </svg>`;
  }

  function svgSparkline(series, width=560, height=86){
    const min = Math.min(...series), max = Math.max(...series);
    const span = (max - min) || 1;
    const pad = 6;
    const pts = series.map((v,i) => {
      const x = (i/(series.length-1)) * (width - pad*2) + pad;
      const y = height - pad - ((v - min)/span) * (height - pad*2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const lastUp = series[series.length-1] >= series[0];
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="${lastUp ? 'var(--rise)' : 'var(--fall)'}" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  /* ---------------------------- state ---------------------------- */
  const state = {
    view: 'portfolio',
    portfolio: { holdings: [] },
    dataStatus: 'loading', // 'loading' | 'ready' | 'empty' | 'error'
    clientId: null,
    scenarios: [],
    activeScenarioIds: [],
    currentScenarioTabId: null,
    resultsFocusId: null,
    compareIds: [],
    targetWeights: {},
    conversation: [],
    moveThresholds: [1],
    ui: {
      analyseSubview: 'treemap',
      modal: null,
    }
  };

  /* ---------------------------- calculation engine ---------------------------- */
  function computeTotals(holdings){
    const total = sum(holdings.map(h => h.value));
    return holdings.map(h => ({...h, weight: total>0 ? (h.value/total*100) : 0}));
  }
  function approxPortfolioImpact(weightPct, movementPct){
    return (weightPct/100) * movementPct;
  }
  function approxRequiredMovement(weightPct, targetImpactPct){
    if (weightPct === 0) return null;
    return targetImpactPct / (weightPct/100);
  }
  function actualScenarioFromMovement(holdings, holdingId, movementPct){
    const next = holdings.map(h => h.id===holdingId ? {...h, value: h.value * (1 + movementPct/100)} : {...h});
    return computeTotals(next);
  }
  function concentrationSummary(weighted){
    const sorted = [...weighted].sort((a,b)=>b.weight-a.weight);
    const top = n => sum(sorted.slice(0,n).map(h=>h.weight));
    return {
      top1: top(1), top3: top(Math.min(3,sorted.length)), top5: top(Math.min(5,sorted.length)),
      sorted
    };
  }
  function effectiveHoldingsCount(weighted){
    const hhi = sum(weighted.map(h => h.weight * h.weight));
    if (hhi <= 0) return 0;
    return 10000 / hhi;
  }
  const KNOWN_FUND_TICKERS = new Set(['VWRL','VUSA','VOO','SPY','QQQ','VWCE','VEVE','VMID','VUKE','JEPQ','JEPI','SGLN','IUSA','ISF','VHYL','VGOV','AGGH']);
  function assetTypeGuess(h){
    const ticker = (h.ticker||'').toUpperCase();
    const name = (h.name||'').toLowerCase();
    if (ticker === 'CASH' || name === 'cash') return 'cash';
    if (KNOWN_FUND_TICKERS.has(ticker) || /\b(etf|fund|trust|index|tracker)\b/.test(name)) return 'fund';
    return 'stock';
  }
  const ILLUSTRATIVE_VOL_BY_TYPE = { cash: 0.5, fund: 12, stock: 28 };
  function illustrativeVolatility(weighted){
    return sum(weighted.map(h => (h.weight/100) * ILLUSTRATIVE_VOL_BY_TYPE[assetTypeGuess(h)]));
  }
  function seededRandom(seed){
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function(){ s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function hashStr(str){
    let h = 0;
    for (let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) | 0; }
    return Math.abs(h) || 1;
  }
  function illustrativeGrowthSeries(weighted, points=24){
    const vol = illustrativeVolatility(weighted);
    const seed = hashStr(weighted.map(h=>h.ticker+':'+Math.round(h.weight)).join('|')) || 1;
    const rnd = seededRandom(seed);
    const monthlyStep = vol / Math.sqrt(12) / 100;
    let v = 100;
    const series = [v];
    for (let i=1;i<points;i++){
      const shock = (rnd()*2 - 1) * monthlyStep * 1.8;
      v = v * (1 + shock);
      series.push(v);
    }
    return series;
  }
  function moveNeededTable(weighted, thresholds){
    return weighted.map(h => ({
      ...h,
      moves: thresholds.map(t => ({ threshold:t, requiredMovePct: h.weight>0 ? approxRequiredMovement(h.weight, t) : null }))
    }));
  }
  function ensureCashHolding(holdings){
    let cash = holdings.find(h => h.ticker === 'CASH');
    if (!cash){
      cash = {id: uid('h'), ticker:'CASH', name:'Cash', value:0};
      holdings = [...holdings, cash];
    }
    return holdings;
  }
  function applyEdits(baseHoldings, edits){
    let holdings = clone(baseHoldings);
    let netNewCash = 0, netReallocated = 0, netWithdrawn = 0;
    edits.forEach(edit => {
      if (edit.type === 'reallocation'){
        const from = holdings.find(h=>h.id===edit.fromId);
        const to = holdings.find(h=>h.id===edit.toId);
        if (from && to){
          const amt = Math.min(edit.amount, from.value);
          from.value -= amt;
          to.value += amt;
          netReallocated += amt;
        }
      } else if (edit.type === 'freshCash'){
        const to = holdings.find(h=>h.id===edit.toId);
        if (to){ to.value += edit.amount; netNewCash += edit.amount; }
      } else if (edit.type === 'withdrawal'){
        const from = holdings.find(h=>h.id===edit.fromId);
        if (from){ const amt = Math.min(edit.amount, from.value); from.value -= amt; netWithdrawn += amt; }
      } else if (edit.type === 'priceMovement'){
        const h = holdings.find(h=>h.id===edit.holdingId);
        if (h){ h.value = h.value * (1 + edit.pct/100); }
      }
    });
    const weighted = computeTotals(holdings);
    const total = sum(holdings.map(h=>h.value));
    return { holdings: weighted, total, netNewCash, netReallocated, netWithdrawn };
  }

  /* ---------------------------- Supabase data layer ---------------------------- */
  // Holdings come from the already-loaded client object (see mount()), not
  // fetched here. Scenarios are the one thing this Lab owns in Supabase.
  // portfolio_scenarios lives in the wealth_os schema like every other
  // table this app touches -- .schema('wealth_os') is required, the same
  // way wealth-os.html's own wo(supabase) helper does it; without it these
  // calls hit the (empty, RLS-mismatched) public schema instead and fail.
  function labSupabase(){ return window.teiSupabase.schema('wealth_os'); }
  async function persistScenario(sc){
    if (!state.clientId || !window.teiSupabase) return;
    try {
      const sb = labSupabase();
      const payload = {
        client_id: state.clientId,
        name: sc.name,
        edits: sc.edits,
        meta: { createdFromPreset: sc.createdFromPreset || null },
        updated_at: new Date().toISOString(),
      };
      if (sc._persisted){
        const { error } = await sb.from('portfolio_scenarios').update(payload).eq('id', sc.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('portfolio_scenarios').insert(payload).select('id').single();
        if (error) throw error;
        sc.id = data.id;
        sc._persisted = true;
      }
    } catch (err){
      console.error('Portfolio Lab: failed to save scenario', err);
      showToast('Could not save scenario — check your connection and try again.');
    }
  }
  async function deleteScenarioRemote(scenarioId){
    if (!window.teiSupabase) return;
    try {
      const { error } = await labSupabase().from('portfolio_scenarios').delete().eq('id', scenarioId);
      if (error) throw error;
    } catch (err){
      console.error('Portfolio Lab: failed to delete scenario', err);
      showToast('Could not delete scenario — check your connection and try again.');
    }
  }
  async function fetchScenariosForClient(clientId){
    if (!window.teiSupabase) return [];
    const { data, error } = await labSupabase()
      .from('portfolio_scenarios')
      .select('id, name, edits, meta, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      edits: row.edits || [],
      editHistory: [],
      createdFromPreset: (row.meta || {}).createdFromPreset || null,
      _persisted: true,
    }));
  }
  const _scenarioSaveTimers = {};
  function saveScenarioDebounced(sc){
    clearTimeout(_scenarioSaveTimers[sc.id]);
    _scenarioSaveTimers[sc.id] = setTimeout(() => persistScenario(sc), 600);
  }

  /* ---------------------------- scenario management ---------------------------- */
  function createScenario(name, edits=[], meta={}){
    const sc = { id: uid('sc'), name, edits, editHistory:[], _persisted:false, ...meta };
    state.scenarios.push(sc);
    if (state.activeScenarioIds.length < 3) state.activeScenarioIds.push(sc.id);
    persistScenario(sc);
    return sc;
  }
  function getScenario(id){ return state.scenarios.find(s=>s.id===id); }
  function getScenarioResult(sc){ return applyEdits(state.portfolio.holdings, sc.edits); }
  function removeScenario(id){
    const sc = getScenario(id);
    state.scenarios = state.scenarios.filter(s=>s.id!==id);
    state.activeScenarioIds = state.activeScenarioIds.filter(i=>i!==id);
    state.compareIds = state.compareIds.filter(i=>i!==id);
    if (state.currentScenarioTabId === id) state.currentScenarioTabId = 'current';
    if (sc && sc._persisted) deleteScenarioRemote(id);
  }
  function duplicateScenario(id){
    const sc = getScenario(id);
    if (!sc) return;
    const copy = createScenario(sc.name + ' (copy)', clone(sc.edits));
    return copy;
  }
  function addEditToScenario(scId, edit){
    const sc = getScenario(scId);
    if (!sc) return;
    sc.edits.push({...edit, id: uid('ed')});
    saveScenarioDebounced(sc);
  }
  function removeEditFromScenario(scId, editId){
    const sc = getScenario(scId);
    if (!sc) return;
    sc.edits = sc.edits.filter(e=>e.id!==editId);
    saveScenarioDebounced(sc);
  }
  function undoLastEdit(scId){
    const sc = getScenario(scId);
    if (!sc || sc.edits.length===0) return;
    sc.editHistory.push(sc.edits.pop());
    saveScenarioDebounced(sc);
  }
  function resetScenario(scId){
    const sc = getScenario(scId);
    if (!sc) return;
    sc.edits = [];
    saveScenarioDebounced(sc);
  }

  /* ---------------------------- presets ---------------------------- */
  const PRESET_ICONS = {
    equal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="7" x2="6" y2="18"/><line x1="12" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="18" y2="18"/></svg>`,
    cap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="10" x2="6" y2="18"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="18" y1="12" x2="18" y2="18"/><line x1="4" y1="6" x2="20" y2="6" stroke-dasharray="2.5 2.5"/></svg>`,
    move: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/><line x1="9.2" y1="12" x2="14.8" y2="12"/><polyline points="12.3,9.3 15,12 12.3,14.7"/></svg>`,
    freshcash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    raisecash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="18" x2="6" y2="14"/><line x1="12" y1="18" x2="12" y2="10"/><line x1="18" y1="18" x2="18" y2="6"/><polyline points="15,8.5 18,5.5 21,8.5"/></svg>`,
    target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none"/></svg>`,
    consolidate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="6" x2="12" y2="12"/><line x1="19" y1="6" x2="12" y2="12"/><line x1="5" y1="18" x2="12" y2="12"/><line x1="19" y1="18" x2="12" y2="12"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/></svg>`,
  };
  const PRESETS = [
    {id:'equal', title:'Equal weight', desc:'Rebalance so every holding carries the same weight.'},
    {id:'cap', title:'Maximum holding size', desc:'Cap a holding at a chosen %, redistributing the excess.'},
    {id:'move', title:'Move £X from A to B', desc:'Reallocate a specific amount between two holdings.'},
    {id:'freshcash', title:'Allocate fresh cash', desc:'Model new capital being added to one or more holdings.'},
    {id:'raisecash', title:'Raise cash to X%', desc:'Withdraw proportionally from holdings until cash reaches a target %.'},
    {id:'target', title:'Target allocation', desc:'Enter target weights directly and see the trades required.'},
    {id:'consolidate', title:'Consolidate holdings', desc:'Merge selected holdings into a single chosen holding.'},
  ];
  function buildPresetEdits(presetId, params, holdings){
    const weighted = computeTotals(holdings);
    const total = sum(holdings.map(h=>h.value));
    const edits = [];
    if (presetId === 'equal'){
      const n = holdings.length;
      const targetEach = total / n;
      const diffs = holdings.map(h => ({id:h.id, diff: targetEach - h.value}));
      matchDiffsIntoReallocations(diffs, edits);
    }
    if (presetId === 'cap'){
      const capPct = params.capPct;
      const capValue = total * (capPct/100);
      const over = weighted.filter(h => h.value > capValue);
      const under = weighted.filter(h => h.value <= capValue);
      const underTotalWeight = sum(under.map(h=>h.value)) || 1;
      over.forEach(h => {
        const excess = h.value - capValue;
        under.forEach(u => {
          const share = (u.value/underTotalWeight) * excess;
          if (share > 0.5) edits.push({type:'reallocation', fromId:h.id, toId:u.id, amount: Math.round(share*100)/100});
        });
      });
    }
    if (presetId === 'move'){
      edits.push({type:'reallocation', fromId: params.fromId, toId: params.toId, amount: params.amount});
    }
    if (presetId === 'freshcash'){
      (params.allocations||[]).forEach(a => {
        if (a.amount > 0) edits.push({type:'freshCash', toId:a.toId, amount:a.amount});
      });
    }
    if (presetId === 'raisecash'){
      let cashHolding = holdings.find(h=>h.ticker==='CASH');
      const targetCashValue = total * (params.targetPct/100);
      const currentCashValue = cashHolding ? cashHolding.value : 0;
      const needed = targetCashValue - currentCashValue;
      if (needed > 0){
        const nonCash = weighted.filter(h => h.ticker !== 'CASH');
        const nonCashTotal = sum(nonCash.map(h=>h.value)) || 1;
        nonCash.forEach(h => {
          const share = (h.value/nonCashTotal) * needed;
          if (share > 0.5){
            if (cashHolding){
              edits.push({type:'withdrawal', fromId:h.id, amount: Math.round(share*100)/100});
              edits.push({type:'freshCash', toId: cashHolding.id, amount: Math.round(share*100)/100});
            } else {
              edits.push({type:'withdrawal', fromId:h.id, amount: Math.round(share*100)/100});
            }
          }
        });
      }
    }
    if (presetId === 'consolidate'){
      const {sourceIds, targetId} = params;
      sourceIds.filter(id=>id!==targetId).forEach(sid => {
        const h = holdings.find(x=>x.id===sid);
        if (h && h.value>0) edits.push({type:'reallocation', fromId:sid, toId:targetId, amount:h.value});
      });
    }
    return edits;
  }
  function matchDiffsIntoReallocations(diffs, edits){
    const givers = diffs.filter(d=>d.diff < -0.5).map(d=>({id:d.id, amt:-d.diff}));
    const takers = diffs.filter(d=>d.diff > 0.5).map(d=>({id:d.id, amt:d.diff}));
    let gi=0, ti=0;
    while (gi < givers.length && ti < takers.length){
      const g = givers[gi], t = takers[ti];
      const amt = Math.min(g.amt, t.amt);
      if (amt > 0.5) edits.push({type:'reallocation', fromId:g.id, toId:t.id, amount:Math.round(amt*100)/100});
      g.amt -= amt; t.amt -= amt;
      if (g.amt <= 0.5) gi++;
      if (t.amt <= 0.5) ti++;
    }
  }
  function targetWeightResult(holdings, targets){
    const total = sum(holdings.map(h=>h.value));
    const rows = holdings.map(h => {
      const targetPct = targets[h.id] !== undefined ? targets[h.id] : null;
      if (targetPct === null) return {...h, targetPct:null, targetValue:null, diff:null};
      const targetValue = total * (targetPct/100);
      const diff = targetValue - h.value;
      return {...h, targetPct, targetValue, diff};
    });
    const targetSum = sum(Object.values(targets).filter(v=>v!==undefined && v!==null && v!==''));
    const resultingTotal = total;
    return { rows, targetSum, total, resultingTotal, mismatched: Math.abs(targetSum-100) > 0.05 };
  }
  function targetsToEdits(rows){
    const edits = [];
    rows.forEach(r => {
      if (r.diff === null) return;
      if (r.diff > 0.5) edits.push({type:'freshCash', toId:r.id, amount: Math.round(r.diff*100)/100});
      else if (r.diff < -0.5) edits.push({type:'withdrawal', fromId:r.id, amount: Math.round(-r.diff*100)/100});
    });
    return edits;
  }

  /* ============================================================================
     CONVERSATION — rule-based intent routing (no AI call). Never resolves
     "what should I do" into a recommendation; only states facts already
     computed and routes to existing mechanisms.
     ============================================================================ */
  const INTENT_PATTERNS = {
    factual:   /\bwhat('|)s\b|\bhow much\b|\bhow big\b|\bhow large\b|\bweight\b|\bpercent\b|%|\bworth\b|\bhow does\b|\bcurrently\b/,
    increase:  /\bmore\b|\bincrease\b|\bgrow\b|\bbigger\b|\bhigher\b|\bprominence\b|\bboost\b|\badd to\b|\bconviction\b|\bup\b/,
    decrease:  /\bless\b|\bdecrease\b|\breduce\b|\blower\b|\bsmaller\b|\bcut\b|\btrim\b|\bdown\b|\bnervous about\b|\bworried about\b/,
    cap:       /\bcap\b|\blimit\b|\bmaximum\b|\bceiling\b|\bno more than\b/,
    equalize:  /\bequal\b|\beven(ly)?\b|\bbalance(d)?\b|\bsame weight\b/,
    consolidate:/\bconsolidat|\bmerge\b|\bcombine\b|\bsimplify\b|\btidy up\b/,
    cash:      /\bcash\b|\bliquidity\b|\braise cash\b/,
    target:    /\btarget\b|\ballocation\b/,
    adviceSeeking: /\bwhat should i do\b|\bshould i\b|\bwhat do you think\b|\bwhat would you do\b|\brecommend(ation)?\b|\badvice\b|\bwhat('|)s the best\b/,
  };
  function parseQuery(text, holdings){
    const lower = text.toLowerCase();
    const weighted = computeTotals(holdings).sort((a,b)=>b.weight-a.weight);
    let matched = [];
    weighted.forEach(h => {
      if (!h.ticker) return;
      const tickerRe = new RegExp('\\b'+escapeRegex(h.ticker.toLowerCase())+'\\b');
      const tm = lower.match(tickerRe);
      if (tm){ matched.push({...h, _idx: tm.index}); return; }
      if (h.name){
        const nameWords = h.name.toLowerCase().split(/\s+/).filter(w=>w.length>3);
        for (const w of nameWords){
          const wi = lower.indexOf(w);
          if (wi > -1){ matched.push({...h, _idx: wi}); return; }
        }
      }
    });
    const topPhrase = lower.match(/\b(top|biggest|largest|highest[- ]weighted)\s+(holding|position)\b/);
    if (topPhrase && weighted.length && !matched.some(m=>m.id===weighted[0].id)){
      matched.push({...weighted[0], _idx: topPhrase.index});
    }
    const bottomPhrase = lower.match(/\b(smallest|lowest[- ]weighted|least)\s+(holding|position)\b/);
    if (bottomPhrase && weighted.length && !matched.some(m=>m.id===weighted[weighted.length-1].id)){
      matched.push({...weighted[weighted.length-1], _idx: bottomPhrase.index});
    }
    matched.sort((a,b)=>a._idx-b._idx);
    const seen = new Set();
    matched = matched.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    const flags = {};
    Object.keys(INTENT_PATTERNS).forEach(k => flags[k] = INTENT_PATTERNS[k].test(lower));
    const pctMatch = lower.match(/(\d+(\.\d+)?)\s*%/);
    const explicitPct = pctMatch ? parseFloat(pctMatch[1]) : null;
    return { matched, flags, weighted, explicitPct };
  }
  function factLines(matched, weighted, flags){
    const lines = [];
    if (matched.length){
      matched.slice(0,3).forEach(h => {
        const rank = weighted.findIndex(w=>w.id===h.id) + 1;
        lines.push(`<span class="convo-fact-pill"><b>${escapeHtml(h.ticker)}</b> · ${fmtPctPlain(h.weight)} of the portfolio · ${fmtGBP(h.value)} · ranked ${rank} of ${weighted.length}</span>`);
      });
    } else if (flags.factual){
      const conc = concentrationSummary(weighted);
      lines.push(`<span class="convo-fact-pill">Top holding ${fmtPctPlain(conc.top1)}</span><span class="convo-fact-pill">Top 3 ${fmtPctPlain(conc.top3)}</span><span class="convo-fact-pill">Top 5 ${fmtPctPlain(conc.top5)}</span>`);
    }
    return lines;
  }
  function buildIncreaseCards(h, donor, explicitPct, mode){
    const cards = [];
    if (mode !== 'move'){
      cards.push({presetId:'freshcash', title:'Allocate fresh cash', desc:`Models new capital going into ${escapeHtml(h.ticker)} — nothing else moves.`, prefill:{toId:h.id, amount:1000}});
    }
    if (mode !== 'freshcash' && donor){
      cards.push({presetId:'move', title:'Move £X from A to B', desc:`Reallocates from ${escapeHtml(donor.ticker)} into ${escapeHtml(h.ticker)} — total stays the same.`, prefill:{fromId:donor.id, toId:h.id, amount:1000}});
    }
    return cards;
  }
  function buildDecreaseCards(h, dest, explicitPct, mode){
    const cards = [];
    const capPct = explicitPct !== null ? explicitPct : Math.max(1, Math.round(h.weight-5));
    if (mode !== 'move'){
      cards.push({presetId:'cap', title:'Maximum holding size', desc:`Caps ${escapeHtml(h.ticker)} at a chosen %, redistributing the excess — try starting near ${fmtPctPlain(capPct)}.`, prefill:{capPct}});
    }
    if (mode !== 'cap' && dest){
      cards.push({presetId:'move', title:'Move £X from A to B', desc:`Reallocates out of ${escapeHtml(h.ticker)} into ${escapeHtml(dest.ticker)} — adjust the amount in the form.`, prefill:{fromId:h.id, toId:dest.id, amount:1000}});
    }
    return cards;
  }
  function buildMechanismCards(flags, matched, weighted, explicitPct){
    const cards = [];
    if (flags.cash){
      const cashHolding = weighted.find(h=>h.ticker==='CASH');
      const currentCashWeight = cashHolding ? cashHolding.weight : 0;
      const targetPct = explicitPct !== null ? explicitPct : Math.round(currentCashWeight+5);
      cards.push({presetId:'raisecash', title:'Raise cash to X%', desc:'Withdraws proportionally from holdings until cash reaches a target %.', prefill:{targetPct}});
    }
    if (flags.equalize){
      cards.push({presetId:'equal', title:'Equal weight', desc:`Rebalances all ${weighted.length} holdings to ${fmtPctPlain(100/Math.max(weighted.length,1))} each.`, prefill:{}});
    }
    if (flags.consolidate && matched.length>=1){
      const targetH = matched[matched.length-1];
      const sourceIds = matched.filter(m=>m.id!==targetH.id).map(m=>m.id);
      if (sourceIds.length===0 && weighted.length>1){ sourceIds.push(...weighted.filter(w=>w.id!==targetH.id).slice(-2).map(w=>w.id)); }
      cards.push({presetId:'consolidate', title:'Consolidate holdings', desc:`Merges the mentioned holdings into ${escapeHtml(targetH.ticker)}.`, prefill:{sourceIds, targetId: targetH.id}});
    }
    if (flags.cap && matched.length){
      const h = matched[0];
      const capPct = explicitPct !== null ? explicitPct : Math.max(1, Math.round(h.weight-2));
      cards.push({presetId:'cap', title:'Maximum holding size', desc:`Caps holdings at a chosen %, redistributing the excess — try starting near ${fmtPctPlain(capPct)}.`, prefill:{capPct}});
    }
    if (flags.increase && matched.length>=2){
      cards.push(...buildIncreaseCards(matched[0], matched[1], explicitPct, 'both'));
    }
    if (flags.decrease && matched.length>=2){
      cards.push(...buildDecreaseCards(matched[0], matched[1], explicitPct, 'both'));
    }
    if (flags.target){
      cards.push({presetId:'target', title:'Target allocation', desc:'Enter target weights directly inside a scenario and see the exact trades required.', prefill:{}});
    }
    const seen = new Set();
    return cards.filter(c => { const k = c.presetId+JSON.stringify(c.prefill); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0,3);
  }
  function resolveClarification(resolver, optionKey, holdings, overrideOther){
    const weighted = computeTotals(holdings).sort((a,b)=>b.weight-a.weight);
    const h = weighted.find(w=>w.id===resolver.holdingId);
    if (!h) return { lines:[`That holding isn't in your portfolio anymore — try asking again.`], cards: [] };
    const other = overrideOther ? weighted.find(w=>w.id===overrideOther.id) : weighted.find(w=>w.id!==h.id);
    const cards = resolver.kind==='increase'
      ? buildIncreaseCards(h, other, resolver.explicitPct, optionKey)
      : buildDecreaseCards(h, other, resolver.explicitPct, optionKey);
    const lead = cards.length>1 ? `Both routes work for that:` : (cards.length===1 ? `Here's the mechanism for that:` : `I couldn't find another holding to route this through — try adding more holdings first.`);
    return { lines:[lead], cards };
  }
  function classifyAnswerToQuestion(text, question, holdings){
    const lower = text.toLowerCase();
    const weighted = computeTotals(holdings);
    let overrideOther = null;
    weighted.forEach(h => {
      if (h.id === question.resolver.holdingId || !h.ticker) return;
      const re = new RegExp('\\b'+escapeRegex(h.ticker.toLowerCase())+'\\b');
      if (re.test(lower)) overrideOther = h;
    });
    const bothRe = /\bnot sure\b|\bdon'?t know\b|\bboth\b|\beither\b|\bdoesn'?t matter\b|\bno preference\b|\bwhatever\b/;
    if (bothRe.test(lower)) return {optionKey:'both', overrideOther};
    if (question.resolver.kind === 'increase'){
      const freshRe = /\bnew money\b|\bfresh (cash|capital|money)\b|\bwithout touching\b|\badditional (cash|money)\b|\btop(ping)? up\b|\badd(ing)? (more )?cash\b|\bnew capital\b|\bnew cash\b/;
      const moveRe = /\bmake room\b|\btrim\b|\breallocat|\bmove (money|some|it)? ?from\b|\bfree up\b|\bswap\b|\bsell (something|another)\b|\bshift\b|\bother holding/;
      if (freshRe.test(lower) && !moveRe.test(lower)) return {optionKey:'freshcash', overrideOther};
      if (moveRe.test(lower) && !freshRe.test(lower)) return {optionKey:'move', overrideOther};
      if (overrideOther) return {optionKey:'move', overrideOther};
    } else {
      const capRe = /\btoo (large|big|much|heavy|dominant)\b|\bconcentrat|\brisky\b|\bnervous\b|\bworried\b/;
      const moveRe = /\b(specific|another|different) holding\b|\bmove it\b|\bswap\b|\breallocat/;
      if (moveRe.test(lower) || overrideOther) return {optionKey:'move', overrideOther};
      if (capRe.test(lower)) return {optionKey:'cap', overrideOther};
    }
    return null;
  }
  function handleUserMessage(text, holdings){
    const lastMsg = state.conversation[state.conversation.length-1];
    const pending = (lastMsg && lastMsg.role==='system' && lastMsg.question && !lastMsg.question.answered) ? lastMsg.question : null;
    if (pending){
      const cls = classifyAnswerToQuestion(text, pending, holdings);
      if (cls){
        pending.answered = true;
        return resolveClarification(pending.resolver, cls.optionKey, holdings, cls.overrideOther);
      }
    }
    const general = buildResponse(text, holdings);
    if (pending && general.cards.length===0 && !general.question){
      general.lines.push(`I couldn't tell how that answers the question above — you can tap one of those options directly, or try naming what you'd change more plainly (e.g. "new money" or "trim something else").`);
    }
    return general;
  }
  function buildResponse(text, holdings){
    const {matched, flags, weighted, explicitPct} = parseQuery(text, holdings);
    const mechanismFlags = ['increase','decrease','cap','equalize','consolidate','cash','target'];
    const hasMechanismIntent = mechanismFlags.some(f=>flags[f]);
    const lines = [];
    if (matched.length || flags.factual) lines.push(...factLines(matched, weighted, flags));
    const specificOtherIntent = flags.cap || flags.equalize || flags.consolidate || flags.cash || flags.target;
    const soloTarget = matched.length === 1;
    if (flags.increase && soloTarget && !specificOtherIntent){
      const h = matched[0];
      return {
        lines: [...lines, `Before pointing you anywhere — what's the goal in giving ${escapeHtml(h.ticker)} more prominence?`],
        cards: [],
        question: {
          options: [
            {key:'freshcash', label:'I want to add new money into it, without touching anything else'},
            {key:'move', label:'I want my other holdings to make room for it'},
            {key:'both', label:"Not sure yet — show me both routes"},
          ],
          resolver: {kind:'increase', holdingId:h.id, explicitPct},
        },
      };
    }
    if (flags.decrease && soloTarget && !specificOtherIntent){
      const h = matched[0];
      return {
        lines: [...lines, `What's driving the wish to reduce ${escapeHtml(h.ticker)}?`],
        cards: [],
        question: {
          options: [
            {key:'cap', label:"It's grown into too large a share of my portfolio"},
            {key:'move', label:'I want that money in a specific other holding'},
            {key:'both', label:"Not sure yet — show me both routes"},
          ],
          resolver: {kind:'decrease', holdingId:h.id, explicitPct},
        },
      };
    }
    let cards = [];
    if (hasMechanismIntent){
      cards = buildMechanismCards(flags, matched, weighted, explicitPct);
      if (cards.length === 0){
        lines.push(`I can see the direction, but not which holding — try naming it directly, e.g. "increase JEPQ" or "cap AAPL at 20%".`);
      } else if (flags.adviceSeeking){
        lines.push(`I can't tell you what to do — that's a decision for you, and for a regulated adviser if you want a recommendation on it. What I can do is show you the mechanisms that relate to what you've described:`);
      } else {
        lines.push(cards.length>1 ? `A few mechanisms relate to this:` : `This relates to a mechanism already in the Lab:`);
      }
    } else if (flags.adviceSeeking){
      lines.push(`I can't tell you what to do. Try describing the change you're weighing — e.g. "reduce my top holding" or "raise cash to 10%" — and I'll point you to the relevant mechanism.`);
    } else if (matched.length && !flags.factual){
      lines.push(`Noted on ${matched.map(m=>escapeHtml(m.ticker)).join(', ')}. If you want to explore a change, tell me what direction — more, less, capped, consolidated — and I'll surface the mechanism.`);
    } else if (!matched.length && !flags.factual){
      lines.push(`I couldn't tie that to a specific holding or mechanism. Try naming a holding directly (e.g. "JEPQ"), or describing a change (e.g. "cap my top holding at 15%", "raise cash to 10%", "equal weight everything").`);
    }
    return { lines, cards };
  }

  /* ============================================================================
     RENDERING
     ============================================================================ */
  const STAGES = [
    {id:'portfolio', num:'I', label:'Portfolio'},
    {id:'analyse', num:'II', label:'Analyse'},
    {id:'optimise', num:'III', label:'Optimise'},
    {id:'compare', num:'IV', label:'Compare'},
    {id:'implement', num:'V', label:'Implement'},
    {id:'results', num:'VI', label:'Results'},
  ];

  function render(){
    renderTopbar();
    const root = LAB_ROOT.querySelector('#view-root');
    root.innerHTML = '';
    if (state.view==='portfolio') renderPortfolioView(root);
    if (state.view==='analyse') renderAnalyseView(root);
    if (state.view==='optimise') renderOptimiseView(root);
    if (state.view==='compare') renderCompareView(root);
    if (state.view==='implement') renderImplementView(root);
    if (state.view==='results') renderResultsView(root);
    // Deliberately no window.scrollTo here -- this is a card mid-page in
    // Wealth OS's Portfolio page, not its own page; jumping the whole app
    // to the top on every stage click would be jarring.
  }

  function renderTopbar(){
    const weighted = computeTotals(state.portfolio.holdings);
    const total = sum(state.portfolio.holdings.map(h=>h.value));
    LAB_ROOT.querySelector('#portfolio-pill').innerHTML =
      `<span>Your portfolio</span><b>${fmtGBP(total)}</b><span>· ${weighted.length} holdings</span>`;
    const nav = LAB_ROOT.querySelector('#stage-nav');
    nav.innerHTML = '';
    STAGES.forEach((s) => {
      const btn = document.createElement('button');
      btn.className = 'stage-btn' + (state.view===s.id ? ' active' : '');
      btn.innerHTML = `<span class="num">${s.num}</span><span>${s.label}</span>`;
      btn.onclick = () => { state.view = s.id; render(); };
      nav.appendChild(btn);
    });
  }

  function renderDisclaimerStrip(){
    return `
      <div class="disclaimer-strip">
        <b>What this tool does and doesn't account for.</b> The Portfolio Optimisation Lab calculates and models the portfolios and scenarios you build. It does not account for tax consequences, dealing costs, future returns, suitability, liquidity, or your other personal circumstances unless you've explicitly modelled them yourself. Figures marked <span class="approx-flag" style="vertical-align:middle;">Approximate</span> use a linear, all-else-equal approximation; larger scenario changes are recalculated exactly. Figures marked <span class="illustrative-flag" style="vertical-align:middle;">Illustrative</span> — blended volatility and the growth pattern chart — are built from indicative, type-based assumptions rather than real market data or price history, and are not a forecast, projection, or expectation of actual returns. This tool models hypothetical outcomes — it does not recommend or imply a course of action for you specifically. For guidance on your own circumstances, speak with a regulated financial adviser.
      </div>
    `;
  }

  /* =============================== VIEW: PORTFOLIO (display-only) =============================== */
  function renderPortfolioView(root){
    if (state.dataStatus === 'error'){
      root.innerHTML = `
        <div class="view-head"><div class="view-eyebrow">Stage I</div><h2 class="view-title">Portfolio</h2></div>
        <div class="notice notice-warn mt16"><span class="notice-icon">!</span><span>We couldn't load your holdings just now. Refresh the page, or contact us if this keeps happening.</span></div>`;
      return;
    }
    const weighted = computeTotals(state.portfolio.holdings);
    const total = sum(state.portfolio.holdings.map(h=>h.value));
    root.innerHTML = `
      <div class="view-head">
        <div class="view-eyebrow">Stage I</div>
        <h2 class="view-title">Portfolio</h2>
        <p class="view-desc">What you currently own, synced automatically from your Wealth OS accounts.</p>
      </div>
      ${state.dataStatus === 'empty' ? `<div class="notice notice-info mt16" style="margin-bottom:20px;">
        <span class="notice-icon">i</span>
        <span>No holdings logged yet. Once your adviser adds holdings to your accounts, they'll appear here automatically.</span>
      </div>` : ''}
      <div class="grid-2" style="align-items:start;">
        <div class="card card-pad">
          <div class="section-title">Holdings</div>
          <p class="section-sub">Synced from your accounts — to correct a value, contact your adviser rather than editing here.</p>
          <div id="holdings-list"></div>
          <div id="ten-holding-nudge"></div>
          <hr class="rule">
          <div class="holdings-toolbar">
            <div class="holdings-total"><span class="label">Total portfolio value</span>${fmtGBP(total)}</div>
          </div>
        </div>
        <div class="card card-pad">
          <div class="section-title">Weight preview</div>
          <p class="section-sub">A quick read before moving to full analysis.</p>
          <div id="weight-preview"></div>
        </div>
      </div>
      ${renderDisclaimerStrip()}
    `;
    renderHoldingsList();
    renderWeightPreview();
  }
  function renderHoldingsList(){
    const list = LAB_ROOT.querySelector('#holdings-list');
    if (!list) return;
    list.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'holding-row-edit';
    header.style.marginBottom = '4px';
    header.innerHTML = `<label>Ticker</label><label>Name</label><label>Value £</label><span></span>`;
    list.appendChild(header);
    state.portfolio.holdings.forEach(h => {
      const row = document.createElement('div');
      row.className = 'holding-row-edit';
      row.innerHTML = `
        <span>${escapeHtml(h.ticker || '—')}</span>
        <span>${escapeHtml(h.name || '')}</span>
        <span>${fmtGBP(h.value)}</span>
        <span></span>
      `;
      list.appendChild(row);
    });
    const nudge = LAB_ROOT.querySelector('#ten-holding-nudge');
    if (state.portfolio.holdings.length >= 10){
      nudge.innerHTML = `<div class="notice notice-warn mt12"><span class="notice-icon">!</span><span>You've got ${state.portfolio.holdings.length} holdings. The Lab works fine at this size — just flagging it, since very long holding lists can make concentration harder to read at a glance.</span></div>`;
    } else nudge.innerHTML = '';
  }
  function renderWeightPreview(){
    const el = LAB_ROOT.querySelector('#weight-preview');
    if (!el) return;
    const weighted = computeTotals(state.portfolio.holdings).sort((a,b)=>b.weight-a.weight);
    if (weighted.length===0){ el.innerHTML = `<div class="muted small">No holdings yet.</div>`; return; }
    el.innerHTML = weighted.map(h => `
      <div style="margin-bottom:10px;">
        <div class="flex-between small" style="margin-bottom:4px;">
          <span><b>${escapeHtml(h.ticker || '—')}</b> ${h.name ? '· '+escapeHtml(h.name) : ''}</span>
          <span class="num">${fmtPctPlain(h.weight)}</span>
        </div>
        <div class="weight-bar-track"><div class="weight-bar-fill" style="width:${clamp(h.weight,0,100)}%"></div></div>
      </div>
    `).join('');
  }

  /* =============================== VIEW: ANALYSE =============================== */
  function renderAnalyseView(root){
    const weighted = computeTotals(state.portfolio.holdings);
    const conc = concentrationSummary(weighted);
    const moveTable = moveNeededTable(weighted, state.moveThresholds);
    const effHoldings = effectiveHoldingsCount(weighted);
    const illVol = illustrativeVolatility(weighted);
    const growthSeries = illustrativeGrowthSeries(weighted);
    if (weighted.length === 0){
      root.innerHTML = `
        <div class="view-head"><div class="view-eyebrow">Stage II</div><h2 class="view-title">Analyse</h2></div>
        <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>No holdings synced yet.</div></div>`;
      return;
    }
    root.innerHTML = `
      <div class="view-head">
        <div class="view-eyebrow">Stage II</div>
        <h2 class="view-title">Analyse</h2>
        <p class="view-desc">Where is your portfolio concentrated, and which holdings materially influence the overall outcome?</p>
      </div>
      <div id="convo-host-analyse"></div>
      <div class="grid-3" style="margin-bottom:22px;">
        <div class="card conc-stat">
          <div class="ring-wrap">${svgRing(conc.top1)}<div class="ring-center num">${fmtPctPlain(conc.top1)}</div></div>
          <div class="lbl">Top holding</div>
          <div class="holdings-list">${escapeHtml(conc.sorted[0]?.ticker || '—')}</div>
        </div>
        <div class="card conc-stat">
          <div class="ring-wrap">${svgRing(conc.top3)}<div class="ring-center num">${fmtPctPlain(conc.top3)}</div></div>
          <div class="lbl">Top 3 holdings</div>
          <div class="holdings-list">${conc.sorted.slice(0,3).map(h=>h.ticker).join(', ')}</div>
        </div>
        <div class="card conc-stat">
          <div class="ring-wrap">${svgRing(conc.top5)}<div class="ring-center num">${fmtPctPlain(conc.top5)}</div></div>
          <div class="lbl">Top 5 holdings</div>
          <div class="holdings-list">${conc.sorted.slice(0,Math.min(5,conc.sorted.length)).map(h=>h.ticker).join(', ')}</div>
        </div>
      </div>
      <div class="grid-2" style="margin-bottom:22px;">
        <div class="stat-card">
          <div class="stat-lbl">Effective number of holdings</div>
          <div class="stat-val">${effHoldings.toFixed(1)}</div>
          <div class="stat-sub">${weighted.length} holdings in the portfolio, arithmetically behaving like ${effHoldings.toFixed(1)} equally-sized ones. Calculated from each holding's squared weight — the more uneven the weights, the lower this number falls relative to the actual count.</div>
        </div>
        <div class="stat-card">
          <div class="stat-lbl">Blended volatility <span class="illustrative-flag">Illustrative</span></div>
          <div class="stat-val">${fmtPctPlain(illVol)}</div>
          <div class="stat-sub">A weighted blend of indicative volatility by holding type (cash, fund, single stock) — not derived from real price history, and excludes correlation between holdings.</div>
        </div>
      </div>
      <div class="card card-pad" style="margin-bottom:22px;">
        <div class="flex-between" style="margin-bottom:4px;">
          <div class="section-title mb0">Illustrative growth pattern <span class="illustrative-flag">Illustrative</span></div>
        </div>
        <p class="section-sub">A simulated path shaped by this portfolio's blended volatility — not a forecast, projection, or expectation of actual returns.</p>
        <div class="sparkline-wrap">${svgSparkline(growthSeries)}</div>
        <div class="sparkline-legend"><span>Month 1</span><span>Month ${growthSeries.length}</span></div>
      </div>
      <div class="card card-pad" style="margin-bottom:22px;">
        <div class="flex-between" style="margin-bottom:16px;">
          <div><div class="section-title mb0">Concentration view</div></div>
          <div class="view-toggle">
            <button data-v="treemap" class="${state.ui.analyseSubview==='treemap'?'active':''}">Treemap</button>
            <button data-v="bartable" class="${state.ui.analyseSubview==='bartable'?'active':''}">Bar + table</button>
          </div>
        </div>
        <div id="analyse-subview-root"></div>
      </div>
      <div class="card card-pad">
        <div class="section-title">Move needed for 1% portfolio impact</div>
        <p class="section-sub">The approximate single-holding move (all else equal) required to shift total portfolio value by 1%. <span class="approx-flag">Approximate</span></p>
        <div style="overflow-x:auto;">
        <table>
          <thead><tr>
            <th>Holding</th><th class="num-col">Weight</th>
            ${state.moveThresholds.map(t=>`<th class="num-col">Move for ${t}% impact</th>`).join('')}
          </tr></thead>
          <tbody>
            ${moveTable.sort((a,b)=>b.weight-a.weight).map(h => `
              <tr>
                <td><b>${escapeHtml(h.ticker)}</b> ${h.name?`<span class="muted small">· ${escapeHtml(h.name)}</span>`:''}</td>
                <td class="num-col"><div class="ba-cell ba-right"><div class="weight-bar-track" style="width:54px;"><div class="weight-bar-fill" style="width:${clamp(h.weight,0,100)}%"></div></div><span class="num">${fmtPctPlain(h.weight)}</span></div></td>
                ${h.moves.map(m => `<td class="num-col num move-table-thresh">${m.requiredMovePct!==null ? fmtPctPlain(m.requiredMovePct) : '—'}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      </div>
      ${renderDisclaimerStrip()}
    `;
    root.querySelectorAll('.view-toggle button').forEach(b => {
      b.onclick = () => { state.ui.analyseSubview = b.dataset.v; renderAnalyseView(root); };
    });
    renderAnalyseSubview(weighted);
    renderConversationPanel(root.querySelector('#convo-host-analyse'));
  }
  function renderAnalyseSubview(weighted){
    const el = LAB_ROOT.querySelector('#analyse-subview-root');
    if (!el) return;
    if (state.ui.analyseSubview === 'treemap'){
      el.innerHTML = `<div class="treemap-wrap"><div id="treemap-svg-host"></div><div class="tm-tooltip" id="tm-tooltip"></div></div>`;
      drawTreemap(el.querySelector('#treemap-svg-host'), weighted);
    } else {
      const sorted = [...weighted].sort((a,b)=>b.weight-a.weight);
      const maxW = Math.max(...sorted.map(h=>h.weight), 1);
      el.innerHTML = `
        <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Holding</th><th class="num-col">Value</th><th class="num-col">Weight</th><th style="width:35%;">Share</th></tr></thead>
          <tbody>
            ${sorted.map(h => `
              <tr>
                <td><b>${escapeHtml(h.ticker)}</b>${h.name?`<div class="muted small">${escapeHtml(h.name)}</div>`:''}</td>
                <td class="num-col num">${fmtGBP(h.value)}</td>
                <td class="num-col num">${fmtPctPlain(h.weight)}</td>
                <td><div class="weight-bar-track"><div class="weight-bar-fill" style="width:${(h.weight/maxW*100)}%"></div></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      `;
    }
  }
  function drawTreemap(host, weighted, opts={}){
    if (!host || !window.d3) return;
    const width = host.clientWidth || 800;
    const height = opts.height || 380;
    host.innerHTML = '';
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width','100%').attr('height',height);
    const root = d3.hierarchy({children: weighted}).sum(d => d.value || 0);
    d3.treemap().size([width,height]).paddingInner(2).paddingOuter(2).round(true)(root);
    const palette = ['#1D3557','#274674','#C9A84C','#8FA0C2','#B4923A','#3A5578','#DEC98A','#A9B9D6'];
    const tooltip = LAB_ROOT.querySelector('#tm-tooltip');
    const nodes = svg.selectAll('g').data(root.leaves()).enter().append('g')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);
    nodes.append('rect')
      .attr('class','tm-node')
      .attr('width', d => Math.max(0, d.x1-d.x0))
      .attr('height', d => Math.max(0, d.y1-d.y0))
      .attr('fill', (d,i) => palette[i % palette.length])
      .attr('rx', 4)
      .on('mousemove', function(event, d){
        if (!tooltip) return;
        const rect = host.getBoundingClientRect();
        tooltip.style.opacity = 1;
        tooltip.style.left = (event.clientX - rect.left + 14) + 'px';
        tooltip.style.top = (event.clientY - rect.top + 10) + 'px';
        tooltip.innerHTML = `<b>${escapeHtml(d.data.ticker)}</b>${d.data.name?' · '+escapeHtml(d.data.name):''}<br>${fmtGBP(d.data.value)} · ${fmtPctPlain(d.data.weight)} of portfolio`;
      })
      .on('mouseleave', () => { if (tooltip) tooltip.style.opacity = 0; });
    nodes.each(function(d){
      const w = d.x1-d.x0, h = d.y1-d.y0;
      if (w < 34 || h < 24) return;
      const g = d3.select(this);
      g.append('text').attr('class','tm-label').attr('x',8).attr('y',20)
        .attr('fill', '#F7F4ED').style('font-weight',700).style('font-size', Math.min(15, w/6)+'px')
        .text(d.data.ticker);
      if (h > 44){
        g.append('text').attr('class','tm-label').attr('x',8).attr('y',38)
          .attr('fill','rgba(247,244,237,0.85)').style('font-size','11.5px')
          .text(fmtPctPlain(d.data.weight));
      }
    });
  }

  /* =============================== VIEW: OPTIMISE =============================== */
  function renderOptimiseView(root){
    if (state.portfolio.holdings.length === 0){
      root.innerHTML = `<div class="view-head"><div class="view-eyebrow">Stage III</div><h2 class="view-title">Optimise</h2></div>
      <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>No holdings synced yet.</div></div>`;
      return;
    }
    if (!state.currentScenarioTabId) state.currentScenarioTabId = 'current';
    root.innerHTML = `
      <div class="view-head">
        <div class="view-eyebrow">Stage III</div>
        <h2 class="view-title">Optimise</h2>
        <p class="view-desc">You choose the objective. The Lab calculates and models what it takes to get there — it never tells you what to do.</p>
      </div>
      <div id="convo-host-optimise"></div>
      <div class="card card-pad" style="margin-bottom:22px;">
        <div class="section-title">Start from a preset</div>
        <p class="section-sub">Each preset is a mechanism, not a recommendation. Up to 3 scenarios can be active at once.</p>
        <div class="preset-grid" id="preset-grid"></div>
      </div>
      <div class="card card-pad" style="margin-bottom:22px;">
        <div class="flex-between" style="margin-bottom:4px;">
          <div class="section-title mb0">Scenarios</div>
          <button class="btn btn-ghost btn-sm" id="new-blank-scenario-btn" ${state.activeScenarioIds.length>=3?'disabled':''}>+ New blank scenario</button>
        </div>
        <p class="section-sub">Current portfolio is always shown and can't be edited out.</p>
        <div class="scenario-tabs" id="scenario-tabs"></div>
        <div id="scenario-body"></div>
      </div>
      ${renderDisclaimerStrip()}
    `;
    renderPresetGrid();
    renderScenarioTabs();
    renderScenarioBody();
    renderConversationPanel(root.querySelector('#convo-host-optimise'));
    root.querySelector('#new-blank-scenario-btn').onclick = () => {
      const sc = createScenario('Scenario ' + (state.scenarios.length+1));
      state.currentScenarioTabId = sc.id;
      renderOptimiseView(root);
    };
  }
  function renderPresetGrid(){
    const grid = LAB_ROOT.querySelector('#preset-grid');
    grid.innerHTML = PRESETS.map(p => `
      <button class="preset-card" data-preset="${p.id}">
        <div class="preset-icon">${PRESET_ICONS[p.id]||''}</div>
        <div class="p-title">${p.title}</div>
        <div class="p-desc">${p.desc}</div>
      </button>
    `).join('');
    grid.querySelectorAll('.preset-card').forEach(btn => {
      btn.onclick = () => openPresetModal(btn.dataset.preset);
    });
  }
  function renderScenarioTabs(){
    const tabs = LAB_ROOT.querySelector('#scenario-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    const curBtn = document.createElement('button');
    curBtn.className = 'scenario-chip' + (state.currentScenarioTabId==='current' ? ' active' : '');
    curBtn.innerHTML = `<span>Current portfolio</span>`;
    curBtn.onclick = () => { state.currentScenarioTabId='current'; renderScenarioBody(); renderScenarioTabs(); };
    tabs.appendChild(curBtn);
    state.activeScenarioIds.forEach(id => {
      const sc = getScenario(id);
      if (!sc) return;
      const chip = document.createElement('div');
      chip.className = 'scenario-chip' + (state.currentScenarioTabId===id ? ' active' : '');
      chip.innerHTML = `<span class="dot"></span><span class="sc-name-label">${escapeHtml(sc.name)}</span><button class="x" title="Remove scenario">×</button>`;
      chip.querySelector('.sc-name-label').onclick = () => { state.currentScenarioTabId=id; renderScenarioBody(); renderScenarioTabs(); };
      chip.querySelector('.x').onclick = (e) => { e.stopPropagation(); removeScenario(id); renderScenarioTabs(); renderScenarioBody(); };
      tabs.appendChild(chip);
    });
  }
  function renderScenarioBody(){
    const el = LAB_ROOT.querySelector('#scenario-body');
    if (!el) return;
    if (state.currentScenarioTabId === 'current'){
      const weighted = computeTotals(state.portfolio.holdings);
      el.innerHTML = `
        <div class="notice notice-info" style="margin-bottom:16px;">
          <span class="notice-icon">i</span>
          <span>This is your baseline. Create or select a scenario tab above to start modelling changes.</span>
        </div>
        <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Holding</th><th class="num-col">Value</th><th class="num-col">Weight</th></tr></thead>
          <tbody>
            ${weighted.sort((a,b)=>b.weight-a.weight).map(h=>`
              <tr><td><b>${escapeHtml(h.ticker)}</b></td><td class="num-col num">${fmtGBP(h.value)}</td><td class="num-col num">${fmtPctPlain(h.weight)}</td></tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      `;
      return;
    }
    const sc = getScenario(state.currentScenarioTabId);
    if (!sc){ el.innerHTML = `<div class="muted small">Scenario not found.</div>`; return; }
    const result = getScenarioResult(sc);
    el.innerHTML = `
      <div class="flex-between mt16" style="margin-bottom:14px;">
        <input type="text" value="${escapeHtml(sc.name)}" id="sc-name-input" style="max-width:280px;font-weight:600;">
        <div class="flex-gap">
          <button class="btn btn-ghost btn-sm" id="sc-undo-btn" ${sc.edits.length===0?'disabled':''}>Undo last edit</button>
          <button class="btn btn-ghost btn-sm" id="sc-reset-btn" ${sc.edits.length===0?'disabled':''}>Reset scenario</button>
          <button class="btn btn-ghost btn-sm" id="sc-dup-btn">Duplicate</button>
        </div>
      </div>
      <div class="scenario-summary-grid">
        <div class="sc-stat"><div class="v num pos">${fmtGBP(result.netNewCash)}</div><div class="l">Net new cash</div></div>
        <div class="sc-stat"><div class="v num">${fmtGBP(result.netReallocated)}</div><div class="l">Net reallocated</div></div>
        <div class="sc-stat"><div class="v num neg">${fmtGBP(result.netWithdrawn)}</div><div class="l">Withdrawn</div></div>
        <div class="sc-stat"><div class="v num">${fmtGBP(result.total)}</div><div class="l">Resulting total</div></div>
      </div>
      <div class="flex-between" style="margin-bottom:10px;">
        <div class="section-title mb0" style="font-size:15px;">Scenario recipe</div>
        <button class="btn btn-gold btn-sm" id="sc-add-edit-btn">+ Add edit</button>
      </div>
      <div id="ledger-root"></div>
      <hr class="rule">
      <div class="section-title" style="font-size:15px;">Target weights</div>
      <p class="section-sub">Enter target % per holding. Pure arithmetic — the Lab shows the shortfall, it doesn't solve around it.</p>
      <div id="target-weights-root"></div>
    `;
    el.querySelector('#sc-name-input').oninput = e => { sc.name = e.target.value; saveScenarioDebounced(sc); renderScenarioTabs(); };
    el.querySelector('#sc-undo-btn').onclick = () => { undoLastEdit(sc.id); renderScenarioBody(); };
    el.querySelector('#sc-reset-btn').onclick = () => {
      showConfirmModal('Reset this scenario?', 'It will go back to matching the current portfolio.', () => { resetScenario(sc.id); renderScenarioBody(); });
    };
    el.querySelector('#sc-dup-btn').onclick = () => {
      if (state.activeScenarioIds.length>=3){ showToast('Up to 3 scenarios can be active at once. Close one first.'); return; }
      const copy = duplicateScenario(sc.id);
      state.currentScenarioTabId = copy.id;
      renderScenarioTabs(); renderScenarioBody();
    };
    el.querySelector('#sc-add-edit-btn').onclick = () => openEditModal(sc.id);
    renderLedger(sc, result);
    renderTargetWeightsTool(sc);
  }
  function editBadge(edit){
    if (edit.type==='reallocation') return `<span class="badge badge-reallocated">Reallocated</span>`;
    if (edit.type==='freshCash') return `<span class="badge badge-cash">Fresh cash</span>`;
    if (edit.type==='withdrawal') return `<span class="badge badge-withdrawn">Withdrawn</span>`;
    if (edit.type==='priceMovement') return `<span class="badge badge-price">Price move</span>`;
    return '';
  }
  function editAmountLabel(edit, holdings){
    const nameOf = id => (holdings.find(h=>h.id===id)||{}).ticker || '—';
    if (edit.type==='reallocation') return `${nameOf(edit.fromId)} → ${nameOf(edit.toId)} · ${fmtGBP(edit.amount)}`;
    if (edit.type==='freshCash') return `Into ${nameOf(edit.toId)} · ${fmtGBP(edit.amount)}`;
    if (edit.type==='withdrawal') return `From ${nameOf(edit.fromId)} · ${fmtGBP(edit.amount)}`;
    if (edit.type==='priceMovement') return `${nameOf(edit.holdingId)} · ${fmtPct(edit.pct)}`;
    return '';
  }
  function renderLedger(sc, result){
    const el = LAB_ROOT.querySelector('#ledger-root');
    if (!el) return;
    if (sc.edits.length===0){
      el.innerHTML = `<div class="empty-state" style="padding:32px;"><div class="glyph">﹢</div>No edits yet. Add one, or apply a preset from above.</div>`;
      return;
    }
    const before = computeTotals(state.portfolio.holdings);
    const after = result.holdings;
    const beforeMap = Object.fromEntries(before.map(h=>[h.id,h]));
    const afterMap = Object.fromEntries(after.map(h=>[h.id,h]));
    el.innerHTML = sc.edits.map(edit => {
      const affectedIds = [edit.fromId, edit.toId, edit.holdingId].filter(Boolean);
      const primaryId = edit.toId || edit.holdingId || edit.fromId;
      const pb = beforeMap[primaryId], pa = afterMap[primaryId];
      const chipPreview = (pb && pa) ? `
        <div class="ledger-chip-preview">
          <div class="chip-bars">
            <div class="chip-bar-track"><div class="chip-bar-fill before" style="width:${clamp(pb.weight,0,100)}%"></div></div>
            <div class="chip-bar-track"><div class="chip-bar-fill after" style="width:${clamp(pa.weight,0,100)}%"></div></div>
          </div>
          <span class="small muted">${fmtPctPlain(pb.weight)} → ${fmtPctPlain(pa.weight)}</span>
        </div>` : '';
      const detailRows = affectedIds.map(id => {
        const b = beforeMap[id], a = afterMap[id];
        if (!b || !a) return '';
        const moveB = b.weight>0 ? approxRequiredMovement(b.weight,1) : null;
        const moveA = a.weight>0 ? approxRequiredMovement(a.weight,1) : null;
        const moveScale = Math.max(moveB||0, moveA||0, 5) * 1.15;
        return `
          <div class="ledger-detail-stat">
            <div class="l">${escapeHtml(a.ticker)} — weight before / after</div>
            ${beforeAfterBars(b.weight, a.weight, 100, fmtPctPlain(b.weight), fmtPctPlain(a.weight))}
          </div>
          <div class="ledger-detail-stat">
            <div class="l">${escapeHtml(a.ticker)} — move needed for 1% before / after</div>
            ${moveB!==null && moveA!==null ? beforeAfterBars(moveB, moveA, moveScale, fmtPctPlain(moveB), fmtPctPlain(moveA)) : '<div class="v">—</div>'}
          </div>
        `;
      }).join('');
      return `
        <div class="ledger-row" data-edit="${edit.id}">
          <div class="ledger-row-head">
            <div class="ledger-left">
              ${editBadge(edit)}
              <span>${editAmountLabel(edit, before)}</span>
            </div>
            <div class="flex-gap">
              ${chipPreview}
              <button class="btn-icon remove-edit-btn" data-edit="${edit.id}">Remove</button>
              <span class="chevron">▶</span>
            </div>
          </div>
          <div class="ledger-detail">
            <div class="ledger-detail-grid">${detailRows}</div>
          </div>
        </div>
      `;
    }).join('');
    el.querySelectorAll('.ledger-row-head').forEach(head => {
      head.onclick = (e) => {
        if (e.target.closest('.remove-edit-btn')) return;
        head.parentElement.classList.toggle('open');
      };
    });
    el.querySelectorAll('.remove-edit-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        removeEditFromScenario(sc.id, btn.dataset.edit);
        renderScenarioBody();
      };
    });
  }
  function renderTargetWeightsTool(sc){
    const el = LAB_ROOT.querySelector('#target-weights-root');
    if (!el) return;
    const holdings = computeTotals(state.portfolio.holdings);
    if (!state.targetWeights[sc.id]) state.targetWeights[sc.id] = {};
    const targets = state.targetWeights[sc.id];
    el.innerHTML = `
      <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Holding</th><th style="width:180px;">Current vs target</th><th style="width:110px;">Target %</th><th class="num-col">Target value</th><th class="num-col">Buy / sell</th></tr></thead>
        <tbody id="target-rows">
          ${holdings.map(r => `
            <tr data-row="${r.id}">
              <td><b>${escapeHtml(r.ticker)}</b></td>
              <td>
                <div class="target-weight-cell">
                  <div class="target-weight-track">
                    <div class="target-weight-current" style="width:${clamp(r.weight,0,100)}%"></div>
                    <div class="target-weight-target" data-role="target-marker" style="left:0%;display:none;"></div>
                    <span class="tw-num">${fmtPctPlain(r.weight)}</span>
                  </div>
                </div>
              </td>
              <td><input type="number" min="0" step="0.5" class="target-input" data-id="${r.id}" value="${targets[r.id] !== undefined ? targets[r.id] : ''}" placeholder="—" style="padding:6px 8px;"></td>
              <td class="num-col num" data-role="target-value">—</td>
              <td class="num-col num" data-role="diff">—</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>
      <div class="ba-legend" style="margin-top:4px;"><span><i class="ba-before-i"></i>Current weight</span><span style="display:inline-flex;align-items:center;gap:5px;"><i style="width:2px;height:10px;background:var(--navy-3);border-radius:0;"></i>Target</span></div>
      <div id="target-summary" class="mt12"></div>
      <button class="btn btn-gold btn-sm mt12" id="apply-target-btn">Turn into scenario edits</button>
    `;
    function updateDerived(){
      const result = targetWeightResult(holdings, targets);
      result.rows.forEach(r => {
        const row = el.querySelector(`tr[data-row="${r.id}"]`);
        if (!row) return;
        const valueCell = row.querySelector('[data-role="target-value"]');
        const diffCell = row.querySelector('[data-role="diff"]');
        const marker = row.querySelector('[data-role="target-marker"]');
        valueCell.textContent = r.targetValue!==null ? fmtGBP(r.targetValue) : '—';
        diffCell.textContent = r.diff!==null ? fmtGBP(r.diff) : '—';
        diffCell.className = 'num-col num ' + (r.diff>0?'pos':r.diff<0?'neg':'');
        const targetPct = targets[r.id];
        if (marker){
          if (targetPct !== undefined && !isNaN(targetPct)){
            marker.style.display = 'block';
            marker.style.left = clamp(targetPct,0,100) + '%';
          } else {
            marker.style.display = 'none';
          }
        }
      });
      const summaryEl = el.querySelector('#target-summary');
      if (result.targetSum > 0){
        summaryEl.innerHTML = result.mismatched
          ? `<div class="notice notice-warn"><span class="notice-icon">!</span><span>Targets sum to ${fmtPctPlain(result.targetSum)}, not 100%. The Lab shows the resulting shortfall or excess — it doesn't solve around it. Adjust targets to sum to 100% for a fully-funded scenario, or leave as-is to see the gap.</span></div>`
          : `<div class="notice notice-info"><span class="notice-icon">✓</span><span>Targets sum to 100%.</span></div>`;
      } else summaryEl.innerHTML = '';
    }
    updateDerived();
    el.querySelectorAll('.target-input').forEach(inp => {
      inp.oninput = () => {
        const v = inp.value === '' ? undefined : parseFloat(inp.value);
        if (v===undefined) delete targets[inp.dataset.id]; else targets[inp.dataset.id] = v;
        updateDerived();
      };
    });
    el.querySelector('#apply-target-btn').onclick = () => {
      const result = targetWeightResult(holdings, targets);
      const edits = targetsToEdits(result.rows);
      if (edits.length===0){ showToast('Set at least one target weight first.'); return; }
      edits.forEach(e => addEditToScenario(sc.id, e));
      renderScenarioBody();
    };
  }

  /* ----- preset modal ----- */
  function applyPresetPrefill(presetId, prefill){
    if (!prefill) return;
    const setVal = (id, val) => { const el = LAB_ROOT.querySelector('#'+id); if (el && val!==undefined && val!==null) el.value = val; };
    if (presetId==='cap') setVal('p-cap', prefill.capPct);
    if (presetId==='move'){ setVal('p-from', prefill.fromId); setVal('p-to', prefill.toId); setVal('p-amount', prefill.amount); }
    if (presetId==='freshcash' && prefill.toId){
      const cb = LAB_ROOT.querySelector(`.fc-select[data-id="${prefill.toId}"]`);
      const amt = LAB_ROOT.querySelector(`.fc-amount[data-id="${prefill.toId}"]`);
      if (cb) cb.checked = true;
      if (amt){ amt.disabled = false; amt.value = prefill.amount !== undefined ? prefill.amount : 1000; }
    }
    if (presetId==='raisecash') setVal('p-targetpct', prefill.targetPct);
    if (presetId==='consolidate'){
      if (prefill.sourceIds) prefill.sourceIds.forEach(id => { const cb = LAB_ROOT.querySelector(`#p-sources input[value="${id}"]`); if (cb) cb.checked = true; });
      setVal('p-target', prefill.targetId);
    }
  }
  function wireFreshCashAllocator(){
    function recomputeTotal(){
      let total = 0;
      LAB_ROOT.querySelectorAll('.fc-amount').forEach(inp => { if (!inp.disabled) total += parseFloat(inp.value)||0; });
      const totalEl = LAB_ROOT.querySelector('#fc-total');
      if (totalEl) totalEl.textContent = fmtGBP(total);
    }
    LAB_ROOT.querySelectorAll('.fc-select').forEach(cb => {
      cb.onchange = () => {
        const amt = LAB_ROOT.querySelector(`.fc-amount[data-id="${cb.dataset.id}"]`);
        if (amt){ amt.disabled = !cb.checked; if (!cb.checked) amt.value=''; }
        recomputeTotal();
      };
    });
    LAB_ROOT.querySelectorAll('.fc-amount').forEach(inp => { inp.oninput = recomputeTotal; });
    const splitBtn = LAB_ROOT.querySelector('#fc-split-evenly');
    if (splitBtn) splitBtn.onclick = () => {
      const checked = [...LAB_ROOT.querySelectorAll('.fc-select:checked')];
      if (checked.length===0){ showToast('Select at least one holding first.'); return; }
      const total = parseFloat(LAB_ROOT.querySelector('#p-freshcash-total').value)||0;
      const each = Math.round((total/checked.length)*100)/100;
      checked.forEach(cb => {
        const amt = LAB_ROOT.querySelector(`.fc-amount[data-id="${cb.dataset.id}"]`);
        if (amt) amt.value = each;
      });
      recomputeTotal();
    };
    recomputeTotal();
  }
  function openPresetModal(presetId, prefill){
    const preset = PRESETS.find(p=>p.id===presetId);
    const holdings = state.portfolio.holdings;
    const opts = holdings.map(h => `<option value="${h.id}">${escapeHtml(h.ticker)}</option>`).join('');
    let bodyHtml = '';
    if (presetId==='equal'){
      bodyHtml = `<p class="section-sub">Rebalances all ${holdings.length} holdings to an equal weight (${fmtPctPlain(100/holdings.length)} each).</p>`;
    }
    if (presetId==='cap'){
      bodyHtml = `<div class="field"><label>Maximum weight per holding (%)</label><input type="number" id="p-cap" value="20" min="1" max="100"></div>`;
    }
    if (presetId==='move'){
      bodyHtml = `
        <div class="field"><label>From</label><select id="p-from">${opts}</select></div>
        <div class="field"><label>To</label><select id="p-to">${opts}</select></div>
        <div class="field"><label>Amount (£)</label><input type="number" id="p-amount" value="1000" min="0"></div>
      `;
    }
    if (presetId==='freshcash'){
      bodyHtml = `
        <div class="field">
          <label>Allocate fresh cash across</label>
          <div class="freshcash-rows" id="p-freshcash-rows">
            ${holdings.map(h => `
              <div class="freshcash-row">
                <label class="fc-check"><input type="checkbox" class="fc-select" data-id="${h.id}">${escapeHtml(h.ticker)}</label>
                <input type="number" class="fc-amount" data-id="${h.id}" min="0" step="10" placeholder="£0" disabled>
              </div>
            `).join('')}
          </div>
          <div class="fc-totalrow"><span>Total allocated</span><b id="fc-total">£0</b></div>
        </div>
        <div class="field-row" style="grid-template-columns:1fr auto;align-items:end;">
          <div class="field mb0"><label>Split this evenly across selected</label><input type="number" id="p-freshcash-total" min="0" step="100" value="1000"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="fc-split-evenly">Split evenly</button>
        </div>
        <p class="small muted mt12">Select one or more holdings and enter amounts individually, or use the split button above.</p>
      `;
    }
    if (presetId==='raisecash'){
      bodyHtml = `<div class="field"><label>Target cash %</label><input type="number" id="p-targetpct" value="10" min="0" max="100"></div>
      <p class="small muted">Withdraws proportionally from non-cash holdings. If no Cash holding exists, this shows as withdrawals only.</p>`;
    }
    if (presetId==='target'){
      bodyHtml = `<p class="section-sub">Target allocation is built directly inside a scenario — use "New blank scenario", then the Target weights tool at the bottom of that tab.</p>`;
    }
    if (presetId==='consolidate'){
      bodyHtml = `
        <div class="field"><label>Holdings to consolidate</label>
          <div class="tag-row" id="p-sources">
            ${holdings.map(h=>`<label class="tag"><input type="checkbox" value="${h.id}" style="margin-right:6px;">${escapeHtml(h.ticker)}</label>`).join('')}
          </div>
        </div>
        <div class="field"><label>Into holding</label><select id="p-target">${opts}</select></div>
      `;
    }
    showModal(`
      <h3>${preset.title}</h3>
      <div class="modal-sub">${preset.desc}</div>
      ${bodyHtml}
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
        <button class="btn btn-gold" id="modal-apply" ${presetId==='target'?'style="display:none;"':''}>Create scenario</button>
      </div>
    `);
    applyPresetPrefill(presetId, prefill);
    if (presetId==='freshcash') wireFreshCashAllocator();
    LAB_ROOT.querySelector('#modal-cancel').onclick = closeModal;
    const applyBtn = LAB_ROOT.querySelector('#modal-apply');
    if (applyBtn) applyBtn.onclick = () => {
      if (state.activeScenarioIds.length>=3){ showToast('Up to 3 scenarios can be active at once. Close one first.'); return; }
      let params = {};
      if (presetId==='cap') params = {capPct: parseFloat(LAB_ROOT.querySelector('#p-cap').value)||20};
      if (presetId==='move') params = {fromId:LAB_ROOT.querySelector('#p-from').value, toId:LAB_ROOT.querySelector('#p-to').value, amount:parseFloat(LAB_ROOT.querySelector('#p-amount').value)||0};
      if (presetId==='freshcash'){
        const allocations = [...LAB_ROOT.querySelectorAll('.fc-select:checked')].map(cb => {
          const amtEl = LAB_ROOT.querySelector(`.fc-amount[data-id="${cb.dataset.id}"]`);
          return {toId: cb.dataset.id, amount: parseFloat(amtEl.value)||0};
        }).filter(a=>a.amount>0);
        if (allocations.length===0){ showToast('Select at least one holding and enter an amount.'); return; }
        params = {allocations};
      }
      if (presetId==='raisecash') params = {targetPct:parseFloat(LAB_ROOT.querySelector('#p-targetpct').value)||0};
      if (presetId==='consolidate'){
        const sourceIds = [...LAB_ROOT.querySelectorAll('#p-sources input:checked')].map(i=>i.value);
        params = {sourceIds, targetId: LAB_ROOT.querySelector('#p-target').value};
      }
      const edits = buildPresetEdits(presetId, params, state.portfolio.holdings);
      const sc = createScenario(preset.title, edits, {createdFromPreset:presetId});
      state.currentScenarioTabId = sc.id;
      closeModal();
      renderOptimiseView(LAB_ROOT.querySelector('#view-root'));
    };
  }
  function openEditModal(scId){
    const holdings = state.portfolio.holdings;
    const opts = holdings.map(h => `<option value="${h.id}">${escapeHtml(h.ticker)}</option>`).join('');
    let type = 'reallocation';
    function bodyFor(t){
      if (t==='reallocation') return `
        <div class="field"><label>From</label><select id="e-from">${opts}</select></div>
        <div class="field"><label>To</label><select id="e-to">${opts}</select></div>
        <div class="field"><label>Amount (£)</label><input type="number" id="e-amount" value="1000" min="0"></div>`;
      if (t==='freshCash') return `
        <div class="field"><label>Into holding</label><select id="e-to">${opts}</select></div>
        <div class="field"><label>Amount (£)</label><input type="number" id="e-amount" value="1000" min="0"></div>`;
      if (t==='withdrawal') return `
        <div class="field"><label>From holding</label><select id="e-from">${opts}</select></div>
        <div class="field"><label>Amount (£)</label><input type="number" id="e-amount" value="1000" min="0"></div>`;
      if (t==='priceMovement') return `
        <div class="field"><label>Holding</label><select id="e-holding">${opts}</select></div>
        <div class="field"><label>Movement (%)</label><input type="number" id="e-pct" value="10" step="0.5"></div>
        <p class="small muted">This models "what happens if this moves" — it is not a forecast of what it will do.</p>`;
      return '';
    }
    showModal(`
      <h3>Add edit</h3>
      <div class="modal-sub">Pick the kind of change to model.</div>
      <div class="edit-form-tabs" id="edit-type-tabs">
        <button class="edit-tab active" data-t="reallocation">Reallocation</button>
        <button class="edit-tab" data-t="freshCash">Fresh cash</button>
        <button class="edit-tab" data-t="withdrawal">Withdrawal</button>
        <button class="edit-tab" data-t="priceMovement">Price movement</button>
      </div>
      <div id="edit-form-body">${bodyFor(type)}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
        <button class="btn btn-gold" id="modal-apply">Add to scenario</button>
      </div>
    `);
    LAB_ROOT.querySelectorAll('#edit-type-tabs .edit-tab').forEach(btn => {
      btn.onclick = () => {
        type = btn.dataset.t;
        LAB_ROOT.querySelectorAll('#edit-type-tabs .edit-tab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        LAB_ROOT.querySelector('#edit-form-body').innerHTML = bodyFor(type);
      };
    });
    LAB_ROOT.querySelector('#modal-cancel').onclick = closeModal;
    LAB_ROOT.querySelector('#modal-apply').onclick = () => {
      let edit = {type};
      if (type==='reallocation') edit = {...edit, fromId:LAB_ROOT.querySelector('#e-from').value, toId:LAB_ROOT.querySelector('#e-to').value, amount:parseFloat(LAB_ROOT.querySelector('#e-amount').value)||0};
      if (type==='freshCash') edit = {...edit, toId:LAB_ROOT.querySelector('#e-to').value, amount:parseFloat(LAB_ROOT.querySelector('#e-amount').value)||0};
      if (type==='withdrawal') edit = {...edit, fromId:LAB_ROOT.querySelector('#e-from').value, amount:parseFloat(LAB_ROOT.querySelector('#e-amount').value)||0};
      if (type==='priceMovement') edit = {...edit, holdingId:LAB_ROOT.querySelector('#e-holding').value, pct:parseFloat(LAB_ROOT.querySelector('#e-pct').value)||0};
      addEditToScenario(scId, edit);
      closeModal();
      renderScenarioBody();
    };
  }

  // Toast/modal mount inside LAB_ROOT, not document.body -- keeps them
  // scoped to #portfolioLabRoot's CSS and out of the rest of the SPA's DOM.
  function showToast(message){
    const existing = LAB_ROOT.querySelector('#lab-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'lab-toast';
    toast.className = 'lab-toast';
    toast.textContent = message;
    LAB_ROOT.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 3200);
  }
  function showConfirmModal(title, message, onConfirm){
    showModal(`
      <h3>${escapeHtml(title)}</h3>
      <div class="modal-sub">${escapeHtml(message)}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
        <button class="btn btn-danger" id="confirm-ok">Confirm</button>
      </div>
    `);
    LAB_ROOT.querySelector('#confirm-cancel').onclick = closeModal;
    LAB_ROOT.querySelector('#confirm-ok').onclick = () => { closeModal(); onConfirm(); };
  }
  function showModal(innerHtml){
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal">${innerHtml}</div>`;
    backdrop.onclick = (e) => { if (e.target===backdrop) closeModal(); };
    LAB_ROOT.appendChild(backdrop);
  }
  function closeModal(){
    const b = LAB_ROOT.querySelector('#modal-backdrop');
    if (b) b.remove();
  }

  /* =============================== VIEW: COMPARE =============================== */
  function renderCompareView(root){
    if (state.portfolio.holdings.length===0){
      root.innerHTML = `<div class="view-head"><div class="view-eyebrow">Stage IV</div><h2 class="view-title">Compare</h2></div>
      <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>No holdings synced yet.</div></div>`;
      return;
    }
    const activeScenarios = state.activeScenarioIds.map(getScenario).filter(Boolean).slice(0,3);
    root.innerHTML = `
      <div class="view-head">
        <div class="view-eyebrow">Stage IV</div>
        <h2 class="view-title">Compare</h2>
        <p class="view-desc">Current portfolio and up to 3 active scenarios, side by side in full detail.</p>
      </div>
      ${activeScenarios.length===0 ? `<div class="notice notice-info" style="margin-bottom:20px;"><span class="notice-icon">i</span><span>No scenarios active yet. Create one in Optimise to compare it here.</span></div>` : ''}
      ${activeScenarios.length ? `<div class="card card-pad" style="margin-bottom:20px;">
        <div class="section-title mb0">Effective holdings across scenarios</div>
        <p class="section-sub">How many equally-sized holdings each version arithmetically behaves like.</p>
        <div id="compare-eff-chart"></div>
      </div>` : ''}
      ${activeScenarios.length>=3 ? `<div class="compare-scroll-hint">← Scroll to see all ${1+activeScenarios.length} scenarios</div>` : ''}
      <div class="compare-cols" id="compare-cols"></div>
      ${renderDisclaimerStrip()}
    `;
    const cols = root.querySelector('#compare-cols');
    const weightedCurrent = computeTotals(state.portfolio.holdings);
    const totalCurrent = sum(state.portfolio.holdings.map(h=>h.value));
    cols.appendChild(buildCompareCol('Current portfolio', totalCurrent, weightedCurrent, true));
    const chartRows = [{label:'Current', weighted: weightedCurrent}];
    activeScenarios.forEach(sc => {
      const result = getScenarioResult(sc);
      cols.appendChild(buildCompareCol(sc.name, result.total, result.holdings, false));
      chartRows.push({label: sc.name, weighted: result.holdings});
    });
    const chartHost = root.querySelector('#compare-eff-chart');
    if (chartHost){
      const effVals = chartRows.map(r => effectiveHoldingsCount(r.weighted));
      const maxEff = Math.max(...effVals, 1) * 1.15;
      chartHost.innerHTML = chartRows.map((r,i) => `
        <div class="txn-bar-row">
          <div class="txn-bar-label">${escapeHtml(r.label)}</div>
          <div class="txn-bar-track"><div class="txn-bar-fill buy" style="width:${clamp((effVals[i]/maxEff)*100,0,100)}%;border-radius:4px;"></div></div>
          <div class="txn-bar-amt">${effVals[i].toFixed(1)}</div>
        </div>
      `).join('');
    }
  }
  function buildCompareCol(name, total, weighted, isCurrent){
    const conc = concentrationSummary(weighted);
    const moveRows = moveNeededTable(weighted, state.moveThresholds).sort((a,b)=>b.weight-a.weight);
    const effHoldings = effectiveHoldingsCount(weighted);
    const illVol = illustrativeVolatility(weighted);
    const col = document.createElement('div');
    col.className = 'compare-col' + (isCurrent ? ' is-current-col' : '');
    col.innerHTML = `
      <div class="compare-col-head ${isCurrent?'is-current':''}">
        <div class="name">${escapeHtml(name)}</div>
        <div class="total num">${fmtGBP(total)}</div>
      </div>
      <div class="compare-col-body" style="padding-bottom:8px;">
        <div class="compare-mini-tm" data-role="mini-tm"></div>
        <div class="grid-3" style="gap:8px;">
          <div class="conc-stat" style="padding:8px 4px;"><div class="big num" style="font-size:19px;">${fmtPctPlain(conc.top1)}</div><div class="lbl" style="font-size:9.5px;">Top 1</div></div>
          <div class="conc-stat" style="padding:8px 4px;"><div class="big num" style="font-size:19px;">${fmtPctPlain(conc.top3)}</div><div class="lbl" style="font-size:9.5px;">Top 3</div></div>
          <div class="conc-stat" style="padding:8px 4px;"><div class="big num" style="font-size:19px;">${fmtPctPlain(conc.top5)}</div><div class="lbl" style="font-size:9.5px;">Top 5</div></div>
        </div>
        <div class="mini-chart-row">
          <div class="mini-chart-card"><div class="mc-lbl">Eff. holdings</div><div class="mc-val">${effHoldings.toFixed(1)}</div></div>
          <div class="mini-chart-card"><div class="mc-lbl">Volatility <span class="illustrative-flag" style="padding:1px 5px;font-size:8.5px;">Ill.</span></div><div class="mc-val">${fmtPctPlain(illVol)}</div></div>
        </div>
      </div>
      <button class="btn btn-ghost compare-toggle" type="button">
        <span>Show ${weighted.length} holdings</span><span class="chev">▾</span>
      </button>
      <div class="compare-table-wrap">
        <table>
          <thead><tr><th>Holding</th><th class="num-col">Weight</th><th class="num-col">Move (1%)</th></tr></thead>
          <tbody>
            ${moveRows.map(h=>`<tr><td>${escapeHtml(h.ticker)}</td><td class="num-col"><div class="ba-cell ba-right"><div class="weight-bar-track" style="width:48px;"><div class="weight-bar-fill" style="width:${clamp(h.weight,0,100)}%"></div></div><span class="num">${fmtPctPlain(h.weight)}</span></div></td><td class="num-col num">${h.moves[0].requiredMovePct!==null ? fmtPctPlain(h.moves[0].requiredMovePct) : '—'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    const toggleBtn = col.querySelector('.compare-toggle');
    const tableWrap = col.querySelector('.compare-table-wrap');
    toggleBtn.onclick = () => {
      const open = tableWrap.classList.toggle('open');
      toggleBtn.classList.toggle('open', open);
      toggleBtn.querySelector('span').textContent = open ? 'Hide holdings' : `Show ${weighted.length} holdings`;
    };
    setTimeout(() => {
      const host = col.querySelector('[data-role="mini-tm"]');
      if (host) drawTreemap(host, weighted, {height:120});
    }, 0);
    return col;
  }

  /* =============================== VIEW: IMPLEMENT =============================== */
  function renderImplementView(root){
    if (state.portfolio.holdings.length===0){
      root.innerHTML = `<div class="view-head"><div class="view-eyebrow">Stage V</div><h2 class="view-title">Implement</h2></div>
      <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>No holdings synced yet.</div></div>`;
      return;
    }
    const activeScenarios = state.activeScenarioIds.map(getScenario).filter(Boolean);
    root.innerHTML = `
      <div class="view-head">
        <div class="view-eyebrow">Stage V</div>
        <h2 class="view-title">Implement</h2>
        <p class="view-desc">The exact transactions that would move you from the current portfolio to a selected scenario.</p>
      </div>
      ${activeScenarios.length===0 ? `<div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>No scenarios yet — build one in Optimise.</div></div>` : `
      <div class="scenario-tabs" id="impl-tabs" style="margin-bottom:18px;"></div>
      <div id="impl-body"></div>
      `}
      ${renderDisclaimerStrip()}
    `;
    if (activeScenarios.length===0) return;
    let selected = activeScenarios[0].id;
    const tabs = root.querySelector('#impl-tabs');
    function renderTabs(){
      tabs.innerHTML = activeScenarios.map(sc => `<button class="scenario-chip ${sc.id===selected?'active':''}" data-id="${sc.id}"><span class="dot"></span>${escapeHtml(sc.name)}</button>`).join('');
      tabs.querySelectorAll('button').forEach(b => b.onclick = () => { selected = b.dataset.id; renderTabs(); renderBody(); });
    }
    function renderBody(){
      const sc = getScenario(selected);
      const before = Object.fromEntries(computeTotals(state.portfolio.holdings).map(h=>[h.id,h]));
      const result = getScenarioResult(sc);
      const after = Object.fromEntries(result.holdings.map(h=>[h.id,h]));
      const ids = Object.keys(after);
      const txns = ids.map(id => {
        const b = before[id] ? before[id].value : 0;
        const a = after[id].value;
        const delta = a - b;
        return {ticker: after[id].ticker, delta};
      }).filter(t => Math.abs(t.delta) > 0.5).sort((a,b)=>b.delta-a.delta);
      const maxAbs = Math.max(...txns.map(t=>Math.abs(t.delta)), 1);
      root.querySelector('#impl-body').innerHTML = `
        <div class="card card-pad" style="margin-bottom:18px;">
          <div class="section-title">Transactions required — ${escapeHtml(sc.name)}</div>
          <p class="section-sub">Buy = increase holding value. Sell = decrease holding value. Excludes dealing costs and tax.</p>
          ${txns.length===0 ? `<div class="empty-state" style="padding:24px;">No net change — this scenario has no edits yet.</div>` : `
          <div class="ba-legend"><span><i style="background:var(--rise);" class="ba-after-i"></i>Buy</span><span><i style="background:var(--fall);" class="ba-after-i"></i>Sell</span></div>
          <div class="txn-chart-wrap">
            ${txns.map(t => `
              <div class="txn-bar-row">
                <div class="txn-bar-label">${escapeHtml(t.ticker)}</div>
                <div class="txn-bar-track"><div class="txn-bar-fill ${t.delta>0?'buy':'sell'}" style="width:${clamp((Math.abs(t.delta)/maxAbs)*100,0,100)}%"></div></div>
                <div class="txn-bar-amt">${fmtGBP(Math.abs(t.delta))}</div>
              </div>
            `).join('')}
          </div>
          <div>
            ${txns.map(t => `
              <div class="txn-row">
                <div class="flex-gap"><span class="txn-side ${t.delta>0?'txn-buy':'txn-sell'}">${t.delta>0?'Buy':'Sell'}</span><b>${escapeHtml(t.ticker)}</b></div>
                <div class="num">${fmtGBP(Math.abs(t.delta))}</div>
              </div>
            `).join('')}
          </div>`}
        </div>
        <div class="card card-pad">
          <div class="section-title">Resulting portfolio</div>
          <div class="ba-legend"><span><i class="ba-before-i"></i>Before</span><span><i class="ba-after-i"></i>After</span></div>
          <div style="overflow-x:auto;">
          <table>
            <thead><tr>
              <th>Holding</th>
              <th class="num-col">Value before</th><th class="num-col">Value after</th>
              <th class="num-col">Weight</th>
              <th class="num-col">Move for 1%</th>
            </tr></thead>
            <tbody>
              ${(() => {
                const beforeMove = Object.fromEntries(moveNeededTable(Object.values(before), state.moveThresholds).map(h=>[h.id,h]));
                const afterMove = moveNeededTable(result.holdings, state.moveThresholds).sort((a,b)=>b.weight-a.weight);
                return afterMove.map(h => {
                  const b = before[h.id];
                  const bm = beforeMove[h.id];
                  const moveA = h.moves[0].requiredMovePct;
                  const moveB = bm ? bm.moves[0].requiredMovePct : null;
                  const moveScale = Math.max(moveB||0, moveA||0, 5) * 1.15;
                  return `
                  <tr>
                    <td><b>${escapeHtml(h.ticker)}</b></td>
                    <td class="num-col num muted">${fmtGBP(b?b.value:0)}</td>
                    <td class="num-col num">${fmtGBP(h.value)}</td>
                    <td class="num-col">${beforeAfterBars(b?b.weight:0, h.weight, 100, fmtPctPlain(b?b.weight:0), fmtPctPlain(h.weight), 'right')}</td>
                    <td class="num-col">${moveA!==null ? beforeAfterBars(moveB||0, moveA, moveScale, moveB!==null?fmtPctPlain(moveB):'—', fmtPctPlain(moveA), 'right') : '—'}</td>
                  </tr>`;
                }).join('');
              })()}
            </tbody>
          </table>
          </div>
        </div>
      `;
    }
    renderTabs();
    renderBody();
  }

  /* =============================== VIEW: RESULTS =============================== */
  function buildScenarioNarrative(totalCurrent, weightedCurrent, result){
    const concBefore = concentrationSummary(weightedCurrent);
    const concAfter = concentrationSummary(result.holdings);
    const lines = [];
    if (Math.abs(result.total - totalCurrent) > 0.5){
      lines.push(`Total portfolio value moves from ${fmtGBP(totalCurrent)} to ${fmtGBP(result.total)}.`);
    } else {
      lines.push(`Total portfolio value is unchanged at ${fmtGBP(totalCurrent)} — this scenario reallocates within the existing total.`);
    }
    lines.push(`Top-holding concentration moves from ${fmtPctPlain(concBefore.top1)} to ${fmtPctPlain(concAfter.top1)}.`);
    lines.push(`Top-3 concentration moves from ${fmtPctPlain(concBefore.top3)} to ${fmtPctPlain(concAfter.top3)}.`);
    lines.push(`Top-5 concentration moves from ${fmtPctPlain(concBefore.top5)} to ${fmtPctPlain(concAfter.top5)}.`);
    const beforeMap = Object.fromEntries(weightedCurrent.map(h=>[h.id,h]));
    const movers = result.holdings.map(h => {
      const beforeWeight = beforeMap[h.id] ? beforeMap[h.id].weight : 0;
      return {ticker:h.ticker, before:beforeWeight, after:h.weight, delta:h.weight-beforeWeight};
    }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).filter(m=>Math.abs(m.delta)>0.05).slice(0,3);
    if (movers.length){
      const moverText = movers.map(m => `${escapeHtml(m.ticker)} (${fmtPctPlain(m.before)} → ${fmtPctPlain(m.after)})`).join(', ');
      lines.push(`Largest weight changes: ${moverText}.`);
    }
    return lines;
  }
  function buildTxnSummary(beforeMap, result){
    const afterMap = Object.fromEntries(result.holdings.map(h=>[h.id,h]));
    const txns = Object.keys(afterMap).map(id => {
      const b = beforeMap[id] ? beforeMap[id].value : 0;
      return afterMap[id].value - b;
    }).filter(delta => Math.abs(delta) > 0.5);
    const buys = txns.filter(d=>d>0);
    const sells = txns.filter(d=>d<0);
    return { buys: buys.length, sells: sells.length, buyTotal: sum(buys), sellTotal: sum(sells.map(d=>-d)) };
  }
  function renderResultsView(root){
    if (state.portfolio.holdings.length===0){
      root.innerHTML = `<div class="view-head"><div class="view-eyebrow">Stage VI</div><h2 class="view-title">Results</h2></div>
      <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>No holdings synced yet.</div></div>`;
      return;
    }
    const activeScenarios = state.activeScenarioIds.map(getScenario).filter(Boolean);
    root.innerHTML = `
      <div class="view-head no-print">
        <div class="view-eyebrow">Stage VI</div>
        <h2 class="view-title">Results</h2>
        <p class="view-desc">A plain-English summary of what a scenario changes, and how it compares to your other active scenarios — built to read on screen or print.</p>
      </div>
      ${activeScenarios.length===0 ? `<div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>No scenarios yet — build one in Optimise.</div></div>` : `
      <div class="flex-between no-print" style="margin-bottom:16px;flex-wrap:wrap;gap:12px;">
        <div class="scenario-tabs" id="results-tabs"></div>
        <button class="btn btn-ghost btn-sm" id="results-print-btn">Print / Save as PDF</button>
      </div>
      <div id="results-body"></div>
      `}
    `;
    if (activeScenarios.length===0) return;
    if (!state.resultsFocusId || !activeScenarios.find(s=>s.id===state.resultsFocusId)) state.resultsFocusId = activeScenarios[0].id;
    const tabsEl = root.querySelector('#results-tabs');
    function renderTabs(){
      tabsEl.innerHTML = activeScenarios.map(sc => `<button class="scenario-chip ${sc.id===state.resultsFocusId?'active':''}" data-id="${sc.id}"><span class="dot"></span>${escapeHtml(sc.name)}</button>`).join('');
      tabsEl.querySelectorAll('button').forEach(b => b.onclick = () => { state.resultsFocusId = b.dataset.id; renderTabs(); renderBody(); });
    }
    function renderBody(){
      const sc = getScenario(state.resultsFocusId);
      const weightedCurrent = computeTotals(state.portfolio.holdings);
      const totalCurrent = sum(state.portfolio.holdings.map(h=>h.value));
      const beforeMap = Object.fromEntries(weightedCurrent.map(h=>[h.id,h]));
      const result = getScenarioResult(sc);
      const narrative = buildScenarioNarrative(totalCurrent, weightedCurrent, result);
      const txnSummary = buildTxnSummary(beforeMap, result);
      const concBefore = concentrationSummary(weightedCurrent);
      const concAfter = concentrationSummary(result.holdings);
      const effBefore = effectiveHoldingsCount(weightedCurrent);
      const effAfter = effectiveHoldingsCount(result.holdings);
      const volBefore = illustrativeVolatility(weightedCurrent);
      const volAfter = illustrativeVolatility(result.holdings);
      const effScale = Math.max(effBefore, effAfter, 1) * 1.15;
      const stackRows = [
        {label:'Current portfolio', total: totalCurrent, conc: concBefore, eff: effBefore, vol: volBefore, isFocus:false, isCurrent:true},
        ...activeScenarios.map(s => {
          const r = s.id===sc.id ? result : getScenarioResult(s);
          return {label:s.name, total:r.total, conc: concentrationSummary(r.holdings), eff: effectiveHoldingsCount(r.holdings), vol: illustrativeVolatility(r.holdings), isFocus: s.id===sc.id, isCurrent:false};
        }),
      ];
      root.querySelector('#results-body').innerHTML = `
        <div class="print-only" style="margin-bottom:16px;font-family:var(--font-body);font-size:12px;color:#555;">
          Portfolio Optimisation Lab — Results — ${escapeHtml(sc.name)} — ${new Date().toLocaleDateString('en-GB')}
        </div>
        <div class="card card-pad" style="margin-bottom:20px;">
          <div class="flex-between" style="margin-bottom:4px;align-items:flex-start;">
            <div>
              <div class="section-title mb0">${escapeHtml(sc.name)}</div>
              <p class="section-sub" style="margin-bottom:0;">Summary of changes vs. current portfolio</p>
            </div>
            <span class="badge badge-reallocated">Modelled scenario</span>
          </div>
          <hr class="rule">
          <ul class="results-narrative">
            ${narrative.map(l=>`<li>${l}</li>`).join('')}
            <li>Implementing this requires ${txnSummary.buys} bu${txnSummary.buys===1?'y':'ys'} totalling ${fmtGBP(txnSummary.buyTotal)} and ${txnSummary.sells} sell${txnSummary.sells===1?'':'s'} totalling ${fmtGBP(txnSummary.sellTotal)}.</li>
          </ul>
          <div class="ba-legend mt20" style="margin-bottom:6px;"><span><i class="ba-before-i"></i>Current</span><span><i class="ba-after-i"></i>${escapeHtml(sc.name)}</span></div>
          <div class="grid-3" style="gap:14px;">
            <div class="sc-stat">${beforeAfterBars(concBefore.top1, concAfter.top1, 100, fmtPctPlain(concBefore.top1), fmtPctPlain(concAfter.top1))}<div class="l mt8">Top 1 concentration</div></div>
            <div class="sc-stat">${beforeAfterBars(concBefore.top3, concAfter.top3, 100, fmtPctPlain(concBefore.top3), fmtPctPlain(concAfter.top3))}<div class="l mt8">Top 3 concentration</div></div>
            <div class="sc-stat">${beforeAfterBars(concBefore.top5, concAfter.top5, 100, fmtPctPlain(concBefore.top5), fmtPctPlain(concAfter.top5))}<div class="l mt8">Top 5 concentration</div></div>
          </div>
          <div class="grid-2" style="gap:14px;margin-top:14px;">
            <div class="sc-stat">${beforeAfterBars(effBefore, effAfter, effScale, effBefore.toFixed(1), effAfter.toFixed(1))}<div class="l mt8">Effective number of holdings</div></div>
            <div class="sc-stat">${beforeAfterBars(volBefore, volAfter, 40, fmtPctPlain(volBefore), fmtPctPlain(volAfter))}<div class="l mt8">Blended volatility <span class="illustrative-flag" style="padding:1px 5px;font-size:8.5px;">Ill.</span></div></div>
          </div>
        </div>
        <div class="card card-pad">
          <div class="section-title">How it stacks up</div>
          <p class="section-sub">Current portfolio and all active scenarios, for reference.</p>
          <div style="overflow-x:auto;">
          <table>
            <thead><tr><th>Scenario</th><th class="num-col">Total</th><th class="num-col">Eff. holdings</th><th class="num-col">Top 1</th><th class="num-col">Top 3</th><th class="num-col">Top 5</th></tr></thead>
            <tbody>
              ${stackRows.map(r => `
                <tr class="${r.isFocus?'results-focus-row':''}">
                  <td class="${r.isCurrent?'muted':''}">${escapeHtml(r.label)}${r.isFocus?' <span class="badge badge-reallocated" style="font-size:9.5px;">Focus</span>':''}</td>
                  <td class="num-col num">${fmtGBP(r.total)}</td>
                  <td class="num-col num">${r.eff.toFixed(1)}</td>
                  <td class="num-col num"><div class="stack-bar-cell"><div class="stack-bar-track"><div class="stack-bar-fill" style="width:${clamp(r.conc.top1,0,100)}%"></div></div>${fmtPctPlain(r.conc.top1)}</div></td>
                  <td class="num-col num"><div class="stack-bar-cell"><div class="stack-bar-track"><div class="stack-bar-fill" style="width:${clamp(r.conc.top3,0,100)}%"></div></div>${fmtPctPlain(r.conc.top3)}</div></td>
                  <td class="num-col num"><div class="stack-bar-cell"><div class="stack-bar-track"><div class="stack-bar-fill" style="width:${clamp(r.conc.top5,0,100)}%"></div></div>${fmtPctPlain(r.conc.top5)}</div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          </div>
        </div>
        ${renderDisclaimerStrip()}
      `;
    }
    renderTabs();
    renderBody();
    root.querySelector('#results-print-btn').onclick = () => window.print();
  }

  /* =============================== conversation panel =============================== */
  function renderConversationPanel(host){
    if (!host) return;
    host.innerHTML = `
      <div class="card card-pad convo-card">
        <div class="section-title">What's on your mind?</div>
        <p class="section-sub">Describe what you're thinking — a holding, a worry, a change you're weighing. This points you to facts already on the page or to relevant mechanisms. It never tells you what to do.</p>
        <div class="convo-feed" id="convo-feed"></div>
        <div class="convo-input-row">
          <textarea id="convo-input" placeholder="e.g. I want JEPQ to have more prominence, what should I do?"></textarea>
          <button class="btn btn-gold" id="convo-send">Ask</button>
        </div>
      </div>
    `;
    renderConvoFeed(host);
    const input = host.querySelector('#convo-input');
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      const result = handleUserMessage(text, state.portfolio.holdings);
      state.conversation.push({role:'user', text});
      state.conversation.push({role:'system', lines: result.lines, cards: result.cards, question: result.question});
      input.value = '';
      renderConvoFeed(host);
    };
    host.querySelector('#convo-send').onclick = send;
    input.onkeydown = e => { if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } };
  }
  function renderConvoFeed(host){
    const feed = host.querySelector('#convo-feed');
    if (!feed) return;
    if (state.conversation.length===0){
      feed.innerHTML = `<div class="convo-empty">No questions yet — try asking about a specific holding, or describe a change you're considering.</div>`;
      return;
    }
    feed.innerHTML = state.conversation.slice(-12).map(m => {
      if (m.role==='user'){
        return `<div class="convo-msg user"><div class="convo-bubble">${escapeHtml(m.text)}</div></div>`;
      }
      const cardsHtml = (m.cards && m.cards.length) ? `<div class="convo-cards">${m.cards.map((c,i) => `
        <button class="convo-card-item" data-card="${state.conversation.indexOf(m)}-${i}">
          <div class="ct">${escapeHtml(c.title)}</div>
          <div class="cd">${escapeHtml(c.desc)}</div>
          <span class="btn btn-ghost btn-sm" style="pointer-events:none;">Open this mechanism</span>
        </button>
      `).join('')}</div>` : '';
      const questionHtml = m.question ? `<div class="convo-question-options">${m.question.options.map(o => `
        <button class="convo-question-chip" data-qmsg="${state.conversation.indexOf(m)}" data-okey="${o.key}">${escapeHtml(o.label)}</button>
      `).join('')}</div>` : '';
      return `<div class="convo-msg system"><div class="convo-bubble">${m.lines.map(l=>`<p>${l}</p>`).join('')}${cardsHtml}${questionHtml}</div></div>`;
    }).join('');
    feed.querySelectorAll('.convo-card-item').forEach(btn => {
      btn.onclick = () => {
        const [msgIdx, cardIdx] = btn.dataset.card.split('-').map(Number);
        const msg = state.conversation[msgIdx];
        const card = msg.cards[cardIdx];
        routeToMechanism(card);
      };
    });
    feed.querySelectorAll('.convo-question-chip').forEach(btn => {
      btn.onclick = () => {
        const msgIdx = Number(btn.dataset.qmsg);
        const msg = state.conversation[msgIdx];
        msg.question.answered = true;
        const result = resolveClarification(msg.question.resolver, btn.dataset.okey, state.portfolio.holdings);
        state.conversation.push({role:'system', lines: result.lines, cards: result.cards});
        renderConvoFeed(host);
      };
    });
    feed.scrollTop = feed.scrollHeight;
  }
  function routeToMechanism(card){
    if (card.presetId === 'target'){
      state.view = 'optimise';
      render();
      let sc = state.currentScenarioTabId !== 'current' ? getScenario(state.currentScenarioTabId) : null;
      if (!sc){
        if (state.activeScenarioIds.length>=3){ showToast('Up to 3 scenarios can be active at once. Select an existing scenario tab, or close one first.'); return; }
        sc = createScenario('Scenario ' + (state.scenarios.length+1));
        state.currentScenarioTabId = sc.id;
        renderScenarioTabs(); renderScenarioBody();
      }
      LAB_ROOT.querySelector('#target-weights-root')?.scrollIntoView({behavior:'smooth', block:'center'});
      return;
    }
    if (state.view !== 'optimise'){ state.view = 'optimise'; render(); }
    openPresetModal(card.presetId, card.prefill);
  }

  /* =============================== mount =============================== */
  // Called by TEI.render.portfolio (hub/wealth-os.html) on every Portfolio-
  // page render, with the already-loaded client bundle. Idempotent: safe to
  // call again on a re-render (e.g. after a live-price refresh) -- it
  // re-reads holdings from `client` and re-renders whichever stage was
  // already showing, rather than resetting back to Stage I every time.
  TEI.render.portfolioLab = function(client){
    const mountEl = document.getElementById(LAB_ROOT_ID);
    if (!mountEl) return; // Portfolio page markup not present (shouldn't happen)
    LAB_ROOT = mountEl;

    if (!LAB_ROOT.dataset.mounted){
      LAB_ROOT.innerHTML = `
        <div class="topbar">
          <div class="topbar-inner">
            <div class="brand-row">
              <div class="brand"><h1>Portfolio Optimisation Lab</h1></div>
              <div id="portfolio-pill" class="portfolio-pill"></div>
            </div>
            <nav class="stage-nav" id="stage-nav"></nav>
          </div>
        </div>
        <main id="view-root"></main>
      `;
      LAB_ROOT.dataset.mounted = '1';
    }

    const clientId = client.meta && client.meta.clientId;
    const changedClient = state.clientId !== clientId;
    state.clientId = clientId;

    // TEI.calc.groupedHoldings already merges holdings by ticker across
    // every account -- incidentally satisfies "merge on ticker" for this
    // (only) aggregated view. See file header for the per-account gap.
    const grouped = (window.TEI.calc && TEI.calc.groupedHoldings) ? TEI.calc.groupedHoldings(client) : [];
    state.portfolio.holdings = grouped.map(g => ({ id: g.key, ticker: g.ticker || '', name: g.name, value: g.value }));
    state.dataStatus = state.portfolio.holdings.length ? 'ready' : 'empty';

    if (changedClient || !LAB_ROOT.dataset.scenariosLoaded){
      state.scenarios = [];
      state.activeScenarioIds = [];
      state.currentScenarioTabId = null;
      state.resultsFocusId = null;
      LAB_ROOT.dataset.scenariosLoaded = '1';
      if (clientId){
        fetchScenariosForClient(clientId).then(scenarios => {
          state.scenarios = scenarios;
          state.activeScenarioIds = scenarios.slice(0,3).map(s=>s.id);
          render();
        }).catch(err => {
          console.error('Portfolio Lab: failed to load scenarios', err);
        });
      }
    }

    render();
  };
})();
