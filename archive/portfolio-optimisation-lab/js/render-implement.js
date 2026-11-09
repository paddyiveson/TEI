/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   render-implement.js — Stage V: renderImplementView.
   ========================================================================= */

/* =============================== VIEW: IMPLEMENT =============================== */
function renderImplementView(root){
  if (state.portfolio.holdings.length===0){
    root.innerHTML = `<div class="view-head"><div class="view-eyebrow">Stage V</div><h2 class="view-title">Implement</h2></div>
    <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>Add holdings in Portfolio first.</div></div>`;
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
  const tabs = document.getElementById('impl-tabs');
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
    document.getElementById('impl-body').innerHTML = `
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
