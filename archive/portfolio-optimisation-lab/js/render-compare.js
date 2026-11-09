/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   render-compare.js — Stage IV: renderCompareView, buildCompareCol.
   ========================================================================= */

/* =============================== VIEW: COMPARE =============================== */
function renderCompareView(root){
  if (state.portfolio.holdings.length===0){
    root.innerHTML = `<div class="view-head"><div class="view-eyebrow">Stage IV</div><h2 class="view-title">Compare</h2></div>
    <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>Add holdings in Portfolio first.</div></div>`;
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

  const cols = document.getElementById('compare-cols');
  const weightedCurrent = computeTotals(state.portfolio.holdings);
  const totalCurrent = sum(state.portfolio.holdings.map(h=>h.value));

  cols.appendChild(buildCompareCol('Current portfolio', totalCurrent, weightedCurrent, true));

  const chartRows = [{label:'Current', weighted: weightedCurrent}];
  activeScenarios.forEach(sc => {
    const result = getScenarioResult(sc);
    cols.appendChild(buildCompareCol(sc.name, result.total, result.holdings, false));
    chartRows.push({label: sc.name, weighted: result.holdings});
  });

  const chartHost = document.getElementById('compare-eff-chart');
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
      <span>Show ${weighted.length} holdings</span><span class="chev">⌄</span>
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
