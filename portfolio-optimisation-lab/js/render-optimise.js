/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   render-optimise.js — Stage III: renderOptimiseView, renderPresetGrid,
   renderScenarioTabs, renderScenarioBody, renderLedger,
   renderTargetWeightsTool, preset modal logic, editBadge, editAmountLabel.
   ========================================================================= */

// Minimal single-colour line icons (stroke=currentColor) — one per preset, for quick visual scanning.
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

/* =============================== VIEW: OPTIMISE =============================== */
function renderOptimiseView(root){
  if (state.portfolio.holdings.length === 0){
    root.innerHTML = `<div class="view-head"><div class="view-eyebrow">Stage III</div><h2 class="view-title">Optimise</h2></div>
    <div class="card card-pad"><div class="empty-state"><div class="glyph">—</div>Add holdings in Portfolio first.</div></div>`;
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
  renderConversationPanel(document.getElementById('convo-host-optimise'));

  document.getElementById('new-blank-scenario-btn').onclick = () => {
    const sc = createScenario('Scenario ' + (state.scenarios.length+1));
    state.currentScenarioTabId = sc.id;
    renderOptimiseView(root);
  };
}

function renderPresetGrid(){
  const grid = document.getElementById('preset-grid');
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
  const tabs = document.getElementById('scenario-tabs');
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
  const el = document.getElementById('scenario-body');
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

  document.getElementById('sc-name-input').oninput = e => { sc.name = e.target.value; renderScenarioTabs(); };
  document.getElementById('sc-undo-btn').onclick = () => { undoLastEdit(sc.id); renderScenarioBody(); };
  document.getElementById('sc-reset-btn').onclick = () => {
    showConfirmModal('Reset this scenario?', 'It will go back to matching the current portfolio.', () => { resetScenario(sc.id); renderScenarioBody(); });
  };
  document.getElementById('sc-dup-btn').onclick = () => {
    if (state.activeScenarioIds.length>=3){ showToast('Up to 3 scenarios can be active at once. Close one first.'); return; }
    const copy = duplicateScenario(sc.id);
    state.currentScenarioTabId = copy.id;
    renderScenarioTabs(); renderScenarioBody();
  };
  document.getElementById('sc-add-edit-btn').onclick = () => openEditModal(sc.id);

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
  const el = document.getElementById('ledger-root');
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
  const el = document.getElementById('target-weights-root');
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

  // Updates only the derived cells (target value, diff, summary) — never touches the <input>
  // elements themselves, so the box being typed into keeps focus and cursor position.
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
    const summaryEl = document.getElementById('target-summary');
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

  document.getElementById('apply-target-btn').onclick = () => {
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
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val!==undefined && val!==null) el.value = val; };
  if (presetId==='cap') setVal('p-cap', prefill.capPct);
  if (presetId==='move'){ setVal('p-from', prefill.fromId); setVal('p-to', prefill.toId); setVal('p-amount', prefill.amount); }
  if (presetId==='freshcash' && prefill.toId){
    const cb = document.querySelector(`.fc-select[data-id="${prefill.toId}"]`);
    const amt = document.querySelector(`.fc-amount[data-id="${prefill.toId}"]`);
    if (cb) cb.checked = true;
    if (amt){ amt.disabled = false; amt.value = prefill.amount !== undefined ? prefill.amount : 1000; }
  }
  if (presetId==='raisecash') setVal('p-targetpct', prefill.targetPct);
  if (presetId==='consolidate'){
    if (prefill.sourceIds) prefill.sourceIds.forEach(id => { const cb = document.querySelector(`#p-sources input[value="${id}"]`); if (cb) cb.checked = true; });
    setVal('p-target', prefill.targetId);
  }
}

// Wires the checkboxes, per-row amount fields and "split evenly" button in the fresh cash
// allocator modal. Checking a row enables its amount field; the split button divides the
// total across whichever rows are currently checked.
function wireFreshCashAllocator(){
  function recomputeTotal(){
    let total = 0;
    document.querySelectorAll('.fc-amount').forEach(inp => { if (!inp.disabled) total += parseFloat(inp.value)||0; });
    const totalEl = document.getElementById('fc-total');
    if (totalEl) totalEl.textContent = fmtGBP(total);
  }
  document.querySelectorAll('.fc-select').forEach(cb => {
    cb.onchange = () => {
      const amt = document.querySelector(`.fc-amount[data-id="${cb.dataset.id}"]`);
      if (amt){ amt.disabled = !cb.checked; if (!cb.checked) amt.value=''; }
      recomputeTotal();
    };
  });
  document.querySelectorAll('.fc-amount').forEach(inp => { inp.oninput = recomputeTotal; });
  const splitBtn = document.getElementById('fc-split-evenly');
  if (splitBtn) splitBtn.onclick = () => {
    const checked = [...document.querySelectorAll('.fc-select:checked')];
    if (checked.length===0){ showToast('Select at least one holding first.'); return; }
    const total = parseFloat(document.getElementById('p-freshcash-total').value)||0;
    const each = Math.round((total/checked.length)*100)/100;
    checked.forEach(cb => {
      const amt = document.querySelector(`.fc-amount[data-id="${cb.dataset.id}"]`);
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
  document.getElementById('modal-cancel').onclick = closeModal;
  const applyBtn = document.getElementById('modal-apply');
  if (applyBtn) applyBtn.onclick = () => {
    if (state.activeScenarioIds.length>=3){ showToast('Up to 3 scenarios can be active at once. Close one first.'); return; }
    let params = {};
    if (presetId==='cap') params = {capPct: parseFloat(document.getElementById('p-cap').value)||20};
    if (presetId==='move') params = {fromId:document.getElementById('p-from').value, toId:document.getElementById('p-to').value, amount:parseFloat(document.getElementById('p-amount').value)||0};
    if (presetId==='freshcash'){
      const allocations = [...document.querySelectorAll('.fc-select:checked')].map(cb => {
        const amtEl = document.querySelector(`.fc-amount[data-id="${cb.dataset.id}"]`);
        return {toId: cb.dataset.id, amount: parseFloat(amtEl.value)||0};
      }).filter(a=>a.amount>0);
      if (allocations.length===0){ showToast('Select at least one holding and enter an amount.'); return; }
      params = {allocations};
    }
    if (presetId==='raisecash') params = {targetPct:parseFloat(document.getElementById('p-targetpct').value)||0};
    if (presetId==='consolidate'){
      const sourceIds = [...document.querySelectorAll('#p-sources input:checked')].map(i=>i.value);
      params = {sourceIds, targetId: document.getElementById('p-target').value};
    }
    const edits = buildPresetEdits(presetId, params, state.portfolio.holdings);
    const sc = createScenario(preset.title, edits, {createdFromPreset:presetId});
    state.currentScenarioTabId = sc.id;
    closeModal();
    renderOptimiseView(document.getElementById('view-root'));
  };
}

/* ----- add-edit modal (manual edit types) ----- */
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

  document.querySelectorAll('#edit-type-tabs .edit-tab').forEach(btn => {
    btn.onclick = () => {
      type = btn.dataset.t;
      document.querySelectorAll('#edit-type-tabs .edit-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('edit-form-body').innerHTML = bodyFor(type);
    };
  });
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-apply').onclick = () => {
    let edit = {type};
    if (type==='reallocation') edit = {...edit, fromId:document.getElementById('e-from').value, toId:document.getElementById('e-to').value, amount:parseFloat(document.getElementById('e-amount').value)||0};
    if (type==='freshCash') edit = {...edit, toId:document.getElementById('e-to').value, amount:parseFloat(document.getElementById('e-amount').value)||0};
    if (type==='withdrawal') edit = {...edit, fromId:document.getElementById('e-from').value, amount:parseFloat(document.getElementById('e-amount').value)||0};
    if (type==='priceMovement') edit = {...edit, holdingId:document.getElementById('e-holding').value, pct:parseFloat(document.getElementById('e-pct').value)||0};
    addEditToScenario(scId, edit);
    closeModal();
    renderScenarioBody();
  };
}
