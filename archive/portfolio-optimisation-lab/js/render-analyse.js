/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   render-analyse.js — Stage II: renderAnalyseView, renderAnalyseSubview.
   ========================================================================= */

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
      <div class="view-head">
        <div class="view-eyebrow">Stage II</div>
        <h2 class="view-title">Analyse</h2>
      </div>
      <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>Add holdings in Portfolio first.</div></div>`;
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
        <div>
          <div class="section-title mb0">Concentration view</div>
        </div>
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
  renderConversationPanel(document.getElementById('convo-host-analyse'));
}

function renderAnalyseSubview(weighted){
  const el = document.getElementById('analyse-subview-root');
  if (!el) return;
  if (state.ui.analyseSubview === 'treemap'){
    el.innerHTML = `<div class="treemap-wrap"><div id="treemap-svg-host"></div><div class="tm-tooltip" id="tm-tooltip"></div></div>`;
    drawTreemap(document.getElementById('treemap-svg-host'), weighted);
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
