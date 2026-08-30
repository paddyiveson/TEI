/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   render-portfolio.js — Stage I: renderPortfolioView, renderHoldingsList,
   renderWeightPreview, and the CSV/XLSX upload handling.
   ========================================================================= */

/* =============================== VIEW: PORTFOLIO =============================== */
function renderPortfolioView(root){
  const weighted = computeTotals(state.portfolio.holdings);
  const total = sum(state.portfolio.holdings.map(h=>h.value));

  root.innerHTML = `
    <div class="view-head">
      <div class="view-eyebrow">Stage I</div>
      <h2 class="view-title">Portfolio</h2>
      <p class="view-desc">What do I currently own? Enter holdings manually, upload a CSV, or explore the demo portfolio loaded below.</p>
    </div>

    ${state.isDemo ? `<div class="notice notice-info mt16" style="margin-bottom:20px;">
      <span class="notice-icon">i</span>
      <span>You're viewing a <b>demo portfolio</b> — deliberately varied so concentration and optimisation scenarios are meaningful straight away. Edit it below, or clear it and enter your own.</span>
    </div>` : ''}

    <div class="grid-2" style="align-items:start;">
      <div class="card card-pad">
        <div class="section-title">Holdings</div>
        <p class="section-sub">Ticker, name (optional), value in £.</p>
        <div id="holdings-list"></div>
        <button class="btn btn-ghost btn-sm mt12" id="add-holding-btn">+ Add holding</button>
        <div id="ten-holding-nudge"></div>
        <hr class="rule">
        <div class="holdings-toolbar">
          <div class="holdings-total"><span class="label">Total portfolio value</span>${fmtGBP(total)}</div>
          <button class="btn btn-danger btn-sm" id="clear-portfolio-btn">Clear all</button>
        </div>
      </div>

      <div>
        <div class="card card-pad" style="margin-bottom:20px;">
          <div class="section-title">Upload a file</div>
          <p class="section-sub">CSV or Excel. We'll find the ticker, name and value columns automatically — headers like "Tickr" or "Symbol", and values like "$6,700.24" or "£1,234", are handled.</p>
          <div class="upload-zone" id="upload-zone">
            <div>Drop a CSV or Excel file here, or</div>
            <button class="btn btn-ghost btn-sm mt12" id="browse-csv-btn">Browse files</button>
            <input type="file" id="csv-input" accept=".csv,.xlsx,.xls" style="display:none;">
          </div>
          <div id="csv-feedback" class="small mt12"></div>
        </div>
        <div class="card card-pad">
          <div class="section-title">Weight preview</div>
          <p class="section-sub">A quick read before moving to full analysis.</p>
          <div id="weight-preview"></div>
        </div>
      </div>
    </div>

    ${renderDisclaimerStrip()}
  `;

  renderHoldingsList();
  renderWeightPreview();

  document.getElementById('add-holding-btn').onclick = () => {
    state.portfolio.holdings.push({id:uid('h'), ticker:'', name:'', value:0});
    state.isDemo = false;
    render();
  };
  document.getElementById('clear-portfolio-btn').onclick = () => {
    showConfirmModal('Clear all holdings?', 'This cannot be undone.', () => {
      state.portfolio.holdings = [];
      state.isDemo = false;
      render();
    });
  };
  document.getElementById('browse-csv-btn').onclick = () => document.getElementById('csv-input').click();
  document.getElementById('csv-input').onchange = handleCsvFile;
  const zone = document.getElementById('upload-zone');
  zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag'); };
  zone.ondragleave = () => zone.classList.remove('drag');
  zone.ondrop = e => {
    e.preventDefault(); zone.classList.remove('drag');
    if (e.dataTransfer.files.length) parseSpreadsheetFile(e.dataTransfer.files[0]);
  };
}

function renderHoldingsList(){
  const list = document.getElementById('holdings-list');
  if (!list) return;
  list.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'holding-row-edit';
  header.style.marginBottom = '4px';
  header.innerHTML = `<label>Ticker</label><label>Name (optional)</label><label>Value £</label><span></span>`;
  list.appendChild(header);

  state.portfolio.holdings.forEach(h => {
    const row = document.createElement('div');
    row.className = 'holding-row-edit';
    row.innerHTML = `
      <input type="text" value="${escapeHtml(h.ticker)}" placeholder="AAPL" data-field="ticker">
      <input type="text" value="${escapeHtml(h.name||'')}" placeholder="Optional" data-field="name">
      <input type="number" value="${h.value}" min="0" step="1" data-field="value">
      <button class="remove-x" title="Remove holding">×</button>
    `;
    row.querySelectorAll('input').forEach(inp => {
      inp.oninput = () => {
        const field = inp.dataset.field;
        h[field] = field==='value' ? (parseFloat(inp.value)||0) : inp.value.toUpperCase !== undefined && field==='ticker' ? inp.value.toUpperCase() : inp.value;
        state.isDemo = false;
        renderTopbar();
        renderWeightPreview();
      };
    });
    row.querySelector('.remove-x').onclick = () => {
      state.portfolio.holdings = state.portfolio.holdings.filter(x=>x.id!==h.id);
      state.isDemo = false;
      render();
    };
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

// header aliases — first match wins, checked in order
const HEADER_ALIASES = {
  ticker: ['ticker','tickr','tkr','symbol','sym','code'],
  name: ['name','holding','holding name','description','security','instrument'],
  value: ['value','amount','market value','current value','value (gbp)','value (£)','value ($)','worth'],
};
function findHeaderIndex(headerRow, kind){
  const norm = headerRow.map(h => String(h||'').trim().toLowerCase());
  for (const alias of HEADER_ALIASES[kind]){
    const idx = norm.indexOf(alias);
    if (idx > -1) return idx;
  }
  return -1;
}
// strips currency symbols, thousands separators and whitespace: "$6,700.24 " / "£1,234" / "(500)" -> number
function parseCurrencyValue(raw){
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return raw;
  let s = String(raw).trim();
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  s = s.replace(/[£$€,\s]/g, '');
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return negative ? -n : n;
}

function rowsToHoldings(headerRow, dataRows){
  const tIdx = findHeaderIndex(headerRow, 'ticker');
  const nIdx = findHeaderIndex(headerRow, 'name');
  const vIdx = findHeaderIndex(headerRow, 'value');
  if (tIdx===-1 || vIdx===-1) return {error:`Couldn't find a ticker and value column. Found headers: ${headerRow.map(h=>String(h||'').trim()).filter(Boolean).join(', ') || '(none)'}`};
  const rows = dataRows
    .map(cells => ({
      id: uid('h'),
      ticker: String(cells[tIdx]||'').trim().toUpperCase(),
      name: nIdx>-1 ? String(cells[nIdx]||'').trim() : '',
      value: parseCurrencyValue(cells[vIdx]),
    }))
    .filter(r => r.ticker);
  if (rows.length===0) return {error:'No rows with a ticker were found.'};
  return {rows};
}

function parseSpreadsheetFile(file){
  const isExcel = /\.xlsx?$/i.test(file.name);
  const feedback = document.getElementById('csv-feedback');

  if (isExcel){
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const wb = XLSX.read(e.target.result, {type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:''});
        const [headerRow, ...dataRows] = grid;
        const result = rowsToHoldings(headerRow||[], dataRows.filter(r=>r.some(c=>c!=='')));
        if (result.error){ feedback.innerHTML = `<span class="neg">${escapeHtml(result.error)}</span>`; return; }
        state.portfolio.holdings = result.rows;
        state.isDemo = false;
        feedback.innerHTML = `<span class="pos">Imported ${result.rows.length} holdings from ${escapeHtml(wb.SheetNames[0])}.</span>`;
        render();
      } catch(err){
        feedback.innerHTML = `<span class="neg">Couldn't read that Excel file (${escapeHtml(err.message||'unknown error')}).</span>`;
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = e => {
      const lines = e.target.result.split(/\r?\n/).filter(l=>l.trim().length);
      if (lines.length < 2){ feedback.innerHTML = `<span class="neg">No data rows found.</span>`; return; }
      const grid = lines.map(l => l.split(',').map(c=>c.trim().replace(/^"|"$/g,'')));
      const [headerRow, ...dataRows] = grid;
      const result = rowsToHoldings(headerRow, dataRows);
      if (result.error){ feedback.innerHTML = `<span class="neg">${escapeHtml(result.error)}</span>`; return; }
      state.portfolio.holdings = result.rows;
      state.isDemo = false;
      feedback.innerHTML = `<span class="pos">Imported ${result.rows.length} holdings.</span>`;
      render();
    };
    reader.readAsText(file);
  }
}
function handleCsvFile(e){ if (e.target.files.length) parseSpreadsheetFile(e.target.files[0]); }
