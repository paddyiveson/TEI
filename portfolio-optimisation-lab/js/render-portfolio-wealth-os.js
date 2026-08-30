/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — Wealth OS (live data) integration
   The Everyday Investor

   render-portfolio-wealth-os.js — Stage I, display-only: holdings are
   synced from Supabase (wealth_os.holdings via accounts), not entered or
   uploaded here. Loaded in place of js/render-portfolio.js -- never load
   both, they both declare renderPortfolioView/renderHoldingsList/
   renderWeightPreview.

   Outstanding: this is still the flat, always-aggregated view -- no
   per-account/aggregated toggle and no duplicate-ticker merge yet (see
   INTEGRATION_NOTES.md). That's a separate, larger pass: it changes the
   fetch shape in data-wealth-os.js *and* this file's markup, not just this
   file alone.
   ========================================================================= */

/* =============================== VIEW: PORTFOLIO =============================== */
function renderPortfolioView(root){
  if (state.dataStatus === 'loading'){
    root.innerHTML = `
      <div class="view-head">
        <div class="view-eyebrow">Stage I</div>
        <h2 class="view-title">Portfolio</h2>
      </div>
      <div class="card card-pad"><div class="empty-state"><div class="glyph">…</div>Loading your holdings…</div></div>`;
    return;
  }
  if (state.dataStatus === 'error'){
    root.innerHTML = `
      <div class="view-head">
        <div class="view-eyebrow">Stage I</div>
        <h2 class="view-title">Portfolio</h2>
      </div>
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
  const list = document.getElementById('holdings-list');
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

  const nudge = document.getElementById('ten-holding-nudge');
  if (state.portfolio.holdings.length >= 10){
    nudge.innerHTML = `<div class="notice notice-warn mt12"><span class="notice-icon">!</span><span>You've got ${state.portfolio.holdings.length} holdings. The Lab works fine at this size — just flagging it, since very long holding lists can make concentration harder to read at a glance.</span></div>`;
  } else nudge.innerHTML = '';
}

function renderWeightPreview(){
  const el = document.getElementById('weight-preview');
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
