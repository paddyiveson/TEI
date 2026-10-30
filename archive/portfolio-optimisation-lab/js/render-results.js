/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   render-results.js — Stage VI: renderResultsView, buildScenarioNarrative,
   buildTxnSummary.
   ========================================================================= */

/* =============================== VIEW: RESULTS =============================== */

// Plain-English, factual-only summary of what a scenario changes vs. the current portfolio.
// Describes mechanics ("moves from X to Y") — never evaluates them ("improves", "reduces risk").
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
    <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>Add holdings in Portfolio first.</div></div>`;
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

  const tabsEl = document.getElementById('results-tabs');
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

    document.getElementById('results-body').innerHTML = `
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
  document.getElementById('results-print-btn').onclick = () => window.print();
}
