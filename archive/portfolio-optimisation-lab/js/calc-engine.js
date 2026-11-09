/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   calc-engine.js — ALL calculation and portfolio/scenario business logic in
   one file. Kept compliance-auditable as a single unit — do not split
   further even though it's long.
   ========================================================================= */

/* ---------------------------- calculation engine ---------------------------- */

// 1. Portfolio totals & weights (exact)
function computeTotals(holdings){
  const total = sum(holdings.map(h => h.value));
  return holdings.map(h => ({...h, weight: total>0 ? (h.value/total*100) : 0}));
}

// 2. Linear approximation: portfolio impact of a holding movement (weight-based, "all else equal")
function approxPortfolioImpact(weightPct, movementPct){
  return (weightPct/100) * movementPct;
}

// 2b. Required movement (approx) to reach a target portfolio impact
function approxRequiredMovement(weightPct, targetImpactPct){
  if (weightPct === 0) return null;
  return targetImpactPct / (weightPct/100);
}

// 3. Actual recalculation: apply a price movement to one holding and recompute exact resulting weights/total
function actualScenarioFromMovement(holdings, holdingId, movementPct){
  const next = holdings.map(h => h.id===holdingId ? {...h, value: h.value * (1 + movementPct/100)} : {...h});
  return computeTotals(next);
}

// Concentration summary — top1/top3/top5 actual weights
function concentrationSummary(weighted){
  const sorted = [...weighted].sort((a,b)=>b.weight-a.weight);
  const top = n => sum(sorted.slice(0,n).map(h=>h.weight));
  return {
    top1: top(1), top3: top(Math.min(3,sorted.length)), top5: top(Math.min(5,sorted.length)),
    sorted
  };
}

// Effective number of holdings — 10,000 / HHI, where HHI is the sum of squared weights (in %).
// A portfolio of N equally-weighted holdings always resolves to exactly N. Purely arithmetic,
// no threshold or judgement applied — reframes concentration as "behaves like X holdings".
function effectiveHoldingsCount(weighted){
  const hhi = sum(weighted.map(h => h.weight * h.weight));
  if (hhi <= 0) return 0;
  return 10000 / hhi;
}

// Heuristic asset-type classifier used only for the illustrative volatility blend below.
// Not a data feed — a simple pattern match on ticker/name so the tool can offer a mechanism
// without needing a live market-data dependency.
const KNOWN_FUND_TICKERS = new Set(['VWRL','VUSA','VOO','SPY','QQQ','VWCE','VEVE','VMID','VUKE','JEPQ','JEPI','SGLN','IUSA','ISF','VHYL','VGOV','AGGH']);
function assetTypeGuess(h){
  const ticker = (h.ticker||'').toUpperCase();
  const name = (h.name||'').toLowerCase();
  if (ticker === 'CASH' || name === 'cash') return 'cash';
  if (KNOWN_FUND_TICKERS.has(ticker) || /\b(etf|fund|trust|index|tracker)\b/.test(name)) return 'fund';
  return 'stock';
}

// Illustrative volatility blend — assigns a fixed indicative volatility per asset type
// (cash ~0%, fund/ETF ~12%, single stock ~28%) and blends by portfolio weight. This is a
// simplification (no correlation, no real price history) and must always be shown as
// illustrative, not a market-data-derived risk figure.
const ILLUSTRATIVE_VOL_BY_TYPE = { cash: 0.5, fund: 12, stock: 28 };
function illustrativeVolatility(weighted){
  return sum(weighted.map(h => (h.weight/100) * ILLUSTRATIVE_VOL_BY_TYPE[assetTypeGuess(h)]));
}

// Deterministic seeded pseudo-random, so the illustrative growth pattern is stable for a
// given portfolio composition rather than re-randomising on every render.
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

// Illustrative growth pattern — NOT a forecast or projection of returns. A volatility-scaled
// random walk, indexed to start at 100, used purely to give a visual sense of how a portfolio's
// blended volatility translates into path variability. Always paired with an "Illustrative" flag.
function illustrativeGrowthSeries(weighted, points=24){
  const vol = illustrativeVolatility(weighted);
  const seed = hashStr(weighted.map(h=>h.ticker+':'+Math.round(h.weight)).join('|')) || 1;
  const rnd = seededRandom(seed);
  const monthlyStep = vol / Math.sqrt(12) / 100; // rough monthly step size from annualised vol
  let v = 100;
  const series = [v];
  for (let i=1;i<points;i++){
    const shock = (rnd()*2 - 1) * monthlyStep * 1.8;
    v = v * (1 + shock);
    series.push(v);
  }
  return series;
}

// Move-needed table across fixed thresholds — required % move per holding to shift total portfolio value by each threshold
function moveNeededTable(weighted, thresholds){
  return weighted.map(h => ({
    ...h,
    moves: thresholds.map(t => ({ threshold:t, requiredMovePct: h.weight>0 ? approxRequiredMovement(h.weight, t) : null }))
  }));
}

/* ----- applying scenario edits (exact, sequential) ----- */
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

/* ---------------------------- scenario management ---------------------------- */
function createScenario(name, edits=[], meta={}){
  const sc = { id: uid('sc'), name, edits, editHistory:[], ...meta };
  state.scenarios.push(sc);
  if (state.activeScenarioIds.length < 3) state.activeScenarioIds.push(sc.id);
  return sc;
}
function getScenario(id){ return state.scenarios.find(s=>s.id===id); }
function getScenarioResult(sc){ return applyEdits(state.portfolio.holdings, sc.edits); }
function removeScenario(id){
  state.scenarios = state.scenarios.filter(s=>s.id!==id);
  state.activeScenarioIds = state.activeScenarioIds.filter(i=>i!==id);
  state.compareIds = state.compareIds.filter(i=>i!==id);
  if (state.currentScenarioTabId === id) state.currentScenarioTabId = 'current';
}
function duplicateScenario(id){
  const sc = getScenario(id);
  if (!sc) return;
  if (state.scenarios.length >= 3 + 1){ /* soft guard, UI already prevents beyond 3 active */ }
  const copy = createScenario(sc.name + ' (copy)', clone(sc.edits));
  return copy;
}
function addEditToScenario(scId, edit){
  const sc = getScenario(scId);
  if (!sc) return;
  sc.edits.push({...edit, id: uid('ed')});
}
function removeEditFromScenario(scId, editId){
  const sc = getScenario(scId);
  if (!sc) return;
  sc.edits = sc.edits.filter(e=>e.id!==editId);
}
function undoLastEdit(scId){
  const sc = getScenario(scId);
  if (!sc || sc.edits.length===0) return;
  sc.editHistory.push(sc.edits.pop());
}
function resetScenario(scId){
  const sc = getScenario(scId);
  if (!sc) return;
  sc.edits = [];
}

/* ---------------------------- presets (calculation side) ---------------------------- */
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
    const cashId = cashHolding ? cashHolding.id : '__NEWCASH__';
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
  // 'target' preset is handled separately via targetWeightResult() — not edit-list based for the raw calc,
  // but converted to fresh-cash/withdrawal edits when turned into a scenario (see targetsToEdits()).
  return edits;
}

// simple greedy matcher: holdings with negative diff (need to shed value) fund holdings with positive diff (need to gain value)
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

/* ---------------------------- target weights (pure arithmetic) ---------------------------- */
function targetWeightResult(holdings, targets){
  // targets: {holdingId: targetPct}
  const total = sum(holdings.map(h=>h.value));
  const rows = holdings.map(h => {
    const targetPct = targets[h.id] !== undefined ? targets[h.id] : null;
    if (targetPct === null) return {...h, targetPct:null, targetValue:null, diff:null};
    const targetValue = total * (targetPct/100);
    const diff = targetValue - h.value;
    return {...h, targetPct, targetValue, diff};
  });
  const targetSum = sum(Object.values(targets).filter(v=>v!==undefined && v!==null && v!==''));
  const resultingTotal = total; // pure arithmetic: total portfolio value held constant unless explicitly funded (see shortfall note)
  return { rows, targetSum, total, resultingTotal, mismatched: Math.abs(targetSum-100) > 0.05 };
}
function targetsToEdits(rows){
  // Convert per-holding diffs into fresh cash (positive) / withdrawal (negative) edits.
  // This is explicit external funding — not internally netted — matching "buy/sell amount required" framing.
  const edits = [];
  rows.forEach(r => {
    if (r.diff === null) return;
    if (r.diff > 0.5) edits.push({type:'freshCash', toId:r.id, amount: Math.round(r.diff*100)/100});
    else if (r.diff < -0.5) edits.push({type:'withdrawal', fromId:r.id, amount: Math.round(-r.diff*100)/100});
  });
  return edits;
}
