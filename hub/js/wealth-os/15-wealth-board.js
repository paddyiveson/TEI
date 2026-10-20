/* ================================================================
   WEALTH (redesign B12.4, spec B5)
   The Wealth page now carries the old Portfolio page too, so rendering
   Wealth also runs TEI.render.portfolio. This block adds what is new on
   the board: the holdings table, Portfolio health and the Update
   balances panel (which saves through TEI.update, the same code as the
   old Update page).
   ================================================================ */
window.TEI = window.TEI || {};
TEI.render = TEI.render || {};
(function(){
  const {fmtGBP, acctLabel, currentMonthKey} = TEI.data;
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function setText(id, text){ const el = document.getElementById(id); if(el) el.textContent = text; }
  // Account colours, the same as the Lab treemap (B5 board palette).
  const ACCT_RING = {pension:'#E8D6A8', isa:'#B9CAE6', lisa:'#DFE6F2', cash_lisa:'#DFE6F2', cash:'#AAB6C8', cash_isa:'#AAB6C8', gia:'#83661C', crypto:'#6F7F98'};
  const CASH_TYPES = ['cash', 'cash_isa', 'cash_lisa'];

  /* One row per holding; accounts without holdings appear as one row of
     their own, so the table adds up to every account. Cost is the cost
     basis for a holding; for an account row it is what was paid in, and
     its return leaves out tax relief and bonuses, as on the old Portfolio
     page (depositsReturn). */
  function holdingRows(client){
    const b = TEI.calc.latestBreakdown(TEI.calc.buildMergedMonths(client));
    const rows = [];
    (client.accounts||[]).forEach(a=>{
      const hs = (client.holdings||[]).filter(h=> h.accountId === a.id);
      if(hs.length){
        hs.forEach(h=>{
          const value = Number(h.value)||0;
          const cost = Number(h.costBasis) > 0 ? Number(h.costBasis) : null;
          rows.push({kind:'holding', id:h.id, name:h.name || h.ticker || 'Holding', ticker:h.ticker || '', acc:a, value,
            cost, ret: cost ? (value-cost)/cost*100 : null, manual:(h.priceSource || 'manual') === 'manual'});
        });
        const cash = Number(a.cashBalance)||0;
        if(cash > 0) rows.push({kind:'cash', id:a.id+'-cash', name:'Cash', ticker:'', acc:a, value:cash, cost:null, ret:null, manual:false});
      } else {
        const value = Number(b[a.id])||0;
        if(value <= 0) return;
        const cb = TEI.calc.acctContributionBreakdown(client, a.id);
        const deposited = cb.opening + cb.paidIn + cb.sacrifice;
        rows.push({kind:'account', id:a.id, name:acctLabel(a), ticker:'', acc:a, value,
          cost: deposited > 0 ? deposited : null, ret: deposited > 0 ? (value - deposited - cb.relief)/deposited*100 : null, manual:false});
      }
    });
    return rows.sort((x,y)=> y.value - x.value);
  }
  function fmtRet(p){ return p==null ? '–' : (p>=0?'+':'') + p.toFixed(1) + '%'; }

  /* ---------------- Holdings table ---------------- */
  let holdFilter = 'all';
  // Account groups open in the All view. Starts with every group open while
  // the list is short, and every group closed once it gets long.
  let holdOpen = null;
  function renderHoldings(client){
    const rows = holdingRows(client);
    const accounts = (client.accounts||[]).filter(a=> rows.some(r=> r.acc.id === a.id));
    if(holdFilter !== 'all' && !accounts.some(a=> a.id === holdFilter)) holdFilter = 'all';
    const sum = list=> list.reduce((s,r)=> s + r.value, 0);
    const chips = [{id:'all', label:'All', value:sum(rows)}].concat(accounts.map(a=> ({id:a.id, label:acctLabel(a), value:sum(rows.filter(r=> r.acc.id === a.id))})));
    const chipWrap = document.getElementById('wlHoldChips');
    chipWrap.innerHTML = chips.length > 2 ? chips.map(c=>
      `<button type="button" data-hold="${esc(c.id)}" aria-pressed="${c.id===holdFilter}"><span>${esc(c.label)}</span><small>${fmtGBP(c.value)}</small></button>`).join('') : '';
    chipWrap.querySelectorAll('[data-hold]').forEach(btn=> btn.onclick = ()=>{ holdFilter = btn.dataset.hold; renderHoldings(client); });

    const shown = holdFilter === 'all' ? rows : rows.filter(r=> r.acc.id === holdFilter);
    const chosen = chips.find(c=> c.id === holdFilter);
    setText('wlHoldTitle', (holdFilter === 'all' ? 'All holdings' : chosen.label) + ' · ' + fmtGBP(sum(shown)));
    const list = document.getElementById('wlHoldList');
    if(!shown.length){
      list.innerHTML = '<p class="hm-muted">No accounts or holdings recorded yet. Add them in Settings.</p>';
      return;
    }
    const rowHTML = (r, hidden)=>{
        const flags = [r.acc.setAndForget ? 'Set and forget' : '', r.acc.earmarked ? 'Earmarked' : '', r.kind === 'holding' && r.manual ? 'Manual price' : ''].filter(Boolean);
        const sub = acctLabel(r.acc) + (r.cost ? ' · paid ' + fmtGBP(r.cost) : '');
        return `<tr${hidden ? ' hidden' : ''}>
          <th scope="row" class="wl-h-name"><i style="background:${ACCT_RING[r.acc.type]||'#C9D3E3'};"></i><span><b>${esc(r.name)}</b><small>${esc(sub)}</small></span></th>
          <td class="wl-h-ticker">${esc(r.ticker || '–')}</td>
          <td class="wl-h-acct">${esc(acctLabel(r.acc))}</td>
          <td class="num wl-h-val">${fmtGBP(r.value)}</td>
          <td class="num wl-h-cost">${r.cost ? fmtGBP(r.cost) : '–'}</td>
          <td class="num wl-h-ret"><span class="wl-ret${r.ret==null?'':(r.ret>=0?' up':' down')}">${fmtRet(r.ret)}</span></td>
          <td class="wl-h-flags">${flags.map(f=> `<span class="wl-flag">${f}</span>`).join('')}</td>
        </tr>`;
    };
    const head = `<table class="wl-htable"><thead><tr><th scope="col">Holding</th><th scope="col">Ticker</th><th scope="col">Account</th><th scope="col" class="num">Value</th><th scope="col" class="num">Cost</th><th scope="col" class="num">Return</th><th scope="col">Flags</th></tr></thead>`;
    let body;
    if(holdFilter === 'all'){
      // Grouped by account, largest first; each account with holdings folds.
      const groups = accounts.map(a=> ({a, rows: shown.filter(r=> r.acc.id === a.id)})).sort((x,y)=> sum(y.rows) - sum(x.rows));
      if(holdOpen === null) holdOpen = new Set(shown.length > 8 ? [] : groups.map(g=> g.a.id));
      body = groups.map(g=>{
        if(g.rows.length === 1 && g.rows[0].kind === 'account') return '<tbody>' + rowHTML(g.rows[0], false) + '</tbody>';
        const open = holdOpen.has(g.a.id);
        const n = g.rows.filter(r=> r.kind === 'holding').length;
        return `<tbody class="wl-hgrp${open ? ' open' : ''}"><tr class="wl-hgrp-h"><th colspan="7" scope="rowgroup"><button type="button" data-hgrp="${esc(g.a.id)}" aria-expanded="${open}">`
          + `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg><i style="background:${ACCT_RING[g.a.type]||'#C9D3E3'};"></i>`
          + `<b>${esc(acctLabel(g.a))}</b><small>${n} ${n === 1 ? 'holding' : 'holdings'}</small><span class="wl-hgrp-v">${fmtGBP(sum(g.rows))}</span></button></th></tr>`
          + g.rows.map(r=> rowHTML(r, !open)).join('') + '</tbody>';
      }).join('');
    } else {
      body = '<tbody>' + shown.map(r=> rowHTML(r, false)).join('') + '</tbody>';
    }
    const groupable = holdFilter === 'all' && accounts.some(a=> shown.filter(r=> r.acc.id === a.id && r.kind !== 'account').length);
    list.innerHTML = (groupable ? `<div class="wl-hgrp-tools"><button type="button" class="hm-link hm-linkbtn" data-hgrp-all="open">Expand all</button><button type="button" class="hm-link hm-linkbtn" data-hgrp-all="close">Collapse all</button></div>` : '')
      + head + body + '</table>'
      + (shown.some(r=> r.kind === 'account' && r.cost) ? '<p class="hm-note">For an account without holdings, cost is what you paid in, and tax relief or bonuses are not counted as return.</p>' : '');
    list.querySelectorAll('[data-hgrp]').forEach(b=> b.onclick = ()=>{
      const id = b.dataset.hgrp;
      if(holdOpen.has(id)) holdOpen.delete(id); else holdOpen.add(id);
      renderHoldings(client);
    });
    list.querySelectorAll('[data-hgrp-all]').forEach(b=> b.onclick = ()=>{
      holdOpen = new Set(b.dataset.hgrpAll === 'open' ? accounts.map(a=> a.id) : []);
      renderHoldings(client);
    });
  }

  /* ---------------- Portfolio health ----------------
     Four mechanical checks on actively managed money (set-and-forget and
     earmarked accounts left out, as in the Lab). They describe; they do
     not recommend. */
  function renderHealth(client){
    const rows = holdingRows(client);
    const active = rows.filter(r=> !(r.acc.setAndForget || r.acc.earmarked));
    const total = active.reduce((s,r)=> s + r.value, 0);
    const checks = [];
    if(total > 0){
      const top = active.filter(r=> r.kind !== 'cash')[0];
      if(top){
        const share = top.value/total*100;
        checks.push({name:'Largest holding', state: share >= 20 ? 'look' : 'ok',
          text: `${top.name} is ${share.toFixed(0)}% of your actively managed money.` + (share >= 20 ? ' The Lab shows how a change would alter that.' : '')});
      }
      const n = active.filter(r=> r.kind === 'holding').length;
      const accts = new Set(active.map(r=> r.acc.id)).size;
      checks.push(n === 0
        ? {name:'Number of holdings', state:'none', text:'No individual holdings are recorded, so the spread inside each account cannot be checked.'}
        : {name:'Number of holdings', state: n <= 2 ? 'look' : 'ok', text:`${n} ${n===1?'holding':'holdings'} across ${accts} ${accts===1?'account':'accounts'}.`});
      const costed = active.filter(r=> r.kind === 'holding' && r.cost);
      const below = costed.filter(r=> r.value < r.cost*0.9).sort((x,y)=> x.ret - y.ret);
      if(!costed.length) checks.push({name:'Below what you paid', state:'none', text:'Add what you paid for each holding to see this.'});
      else if(below.length) checks.push({name:'Below what you paid', state:'look',
        text:`${below[0].name} is ${Math.abs(below[0].ret).toFixed(0)}% below what you paid.` + (below.length > 1 ? ` ${below.length-1} more ${below.length===2?'is':'are'} over 10% below.` : '')});
      else checks.push({name:'Below what you paid', state:'ok', text:'No holding is more than 10% below what you paid.'});
    }
    const sn = TEI.calc.safetyNet(client);
    const cash = rows.filter(r=> r.kind === 'cash' || CASH_TYPES.includes(r.acc.type)).reduce((s,r)=> s + r.value, 0);
    if(!sn.monthlySpend) checks.push({name:'Cash level', state:'none', text:'Add your spending in Cashflow to measure your cash level.'});
    else {
      const months = cash/sn.monthlySpend;
      const high = cash > sn.fullMonths*sn.monthlySpend*1.5;
      checks.push({name:'Cash level', state: high ? 'look' : 'ok',
        text:`Cash of ${fmtGBP(cash)} covers ${months.toFixed(1)} months of spending` + (high ? `, well above a ${sn.fullMonths}-month safety net.` : '.')});
    }
    const look = checks.filter(c=> c.state === 'look').length;
    setText('wlHealthTitle', !checks.length ? 'Nothing to check yet' : look ? `${look} of ${checks.length} checks to look at` : 'Nothing to look at right now');
    const LABEL = {look:'Look at', ok:'OK', none:'No data'};
    document.getElementById('wlHealthList').innerHTML = checks.map(c=>
      `<li class="wl-check wl-check-${c.state}"><i aria-hidden="true"></i><div><b>${esc(c.name)}</b><p>${esc(c.text)}</p></div><span>${LABEL[c.state]}</span></li>`).join('')
      || '<li class="wl-check"><div><p>Add accounts and holdings to see these checks.</p></div></li>';
  }

  /* ---------------- Update balances panel ----------------
     One row per account, or per holding where an account has holdings.
     Holdings priced automatically (US prices) are read-only. Each value
     saves on change for the current month; the page redraws on close. */
  let updDirty = false, lastFocus = null;
  function rowHtml(attr, id, label, value, hint){
    if(value !== '' && value != null) value = Math.round(Number(value)*100)/100; // pennies, not float noise
    return `<label class="wl-upd-row"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>`
      + `<input type="number" inputmode="decimal" step="0.01" ${attr}="${esc(id)}" value="${value===''||value==null ? '' : Number(value)}" data-orig="${value===''||value==null ? '' : Number(value)}">`
      + `<em class="wl-upd-state" aria-live="polite"></em></label>`;
  }
  function buildUpdateList(client){
    const key = currentMonthKey();
    const [y, m] = key.split('-').map(Number);
    setText('wlUpdMonth', new Date(y, m-1, 1).toLocaleDateString('en-GB', {month:'long', year:'numeric'}));
    const b = TEI.calc.latestBreakdown(TEI.calc.buildMergedMonths(client));
    const cur = (client.months||{})[key] || {};
    const accounts = client.accounts || [];
    const list = document.getElementById('wlUpdList');
    list.innerHTML = !accounts.length ? '<p class="hm-muted">No accounts yet. Add them in Settings, under Accounts.</p>'
      : accounts.map(a=>{
        const hs = (client.holdings||[]).filter(h=> h.accountId === a.id);
        if(hs.length){
          return `<div class="wl-upd-group"><p class="wl-upd-acct"><span>${esc(acctLabel(a))}</span><b>${fmtGBP(TEI.calc.holdingsTotalForAccount(client, a.id))}</b></p>`
            + hs.map(h=> (h.priceSource || 'manual') === 'manual'
              ? rowHtml('data-upd-holding', h.id, h.name || h.ticker || 'Holding', h.value, '')
              : `<div class="wl-upd-row wl-upd-ro"><span>${esc(h.name || h.ticker)}<small>Priced automatically</small></span><b>${fmtGBP(h.value)}</b></div>`).join('')
            + '</div>';
        }
        const v = cur[a.id] != null ? cur[a.id] : (b[a.id] != null ? b[a.id] : '');
        return `<div class="wl-upd-group">${rowHtml('data-upd-account', a.id, acctLabel(a), v, '')}</div>`;
      }).join('');
    setText('wlUpdPrices', TEI.calc.usPricesAsOfText(client));
    list.querySelectorAll('input').forEach(input=> input.addEventListener('change', ()=> saveRow(client, key, input)));
  }
  async function saveRow(client, key, input){
    const state = input.parentNode.querySelector('.wl-upd-state');
    const v = parseFloat(input.value);
    if(isNaN(v) || String(v) === String(parseFloat(input.dataset.orig))) return;
    state.textContent = 'Saving'; state.className = 'wl-upd-state';
    try{
      if(input.dataset.updAccount) await TEI.update.persistAccountBalances(client, key, [{id:input.dataset.updAccount, v}]);
      else await TEI.update.persistHoldingValues(client, key, [{id:input.dataset.updHolding, v}]);
      input.dataset.orig = String(v);
      state.textContent = 'Saved'; state.className = 'wl-upd-state ok';
      updDirty = true;
    }catch(err){
      console.error('Wealth OS: Update balances panel save failed', err);
      state.textContent = 'Not saved'; state.className = 'wl-upd-state bad';
      TEI.app.showToast('That did not save. Please try again.');
    }
  }
  function openUpdate(){
    const client = TEI.app.state.client;
    if(!client) return;
    buildUpdateList(client);
    lastFocus = document.activeElement;
    document.getElementById('wlUpdScrim').hidden = false;
    const panel = document.getElementById('wlUpdPanel');
    panel.hidden = false;
    const first = panel.querySelector('input, button');
    if(first) first.focus();
  }
  function closeUpdate(){
    const panel = document.getElementById('wlUpdPanel');
    if(panel.hidden) return;
    panel.hidden = true;
    document.getElementById('wlUpdScrim').hidden = true;
    if(updDirty){ updDirty = false; TEI.app.rerenderCurrentPage(); }
    const back = document.getElementById('wlUpdateBtn');
    if(lastFocus && document.body.contains(lastFocus) && lastFocus.offsetParent) lastFocus.focus(); else if(back) back.focus();
  }
  let wired = false;
  function wireOnce(){
    if(wired) return;
    wired = true;
    document.getElementById('wlUpdateBtn').addEventListener('click', openUpdate);
    document.getElementById('wlUpdClose').addEventListener('click', closeUpdate);
    document.getElementById('wlUpdScrim').addEventListener('click', closeUpdate);
    document.getElementById('wlUpdMore').addEventListener('click', (e)=>{ e.preventDefault(); closeUpdate(); TEI.settings.fold('deposits'); TEI.settings.fold('months'); TEI.settings.open('accounts'); });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeUpdate(); });
    // Keep keyboard focus inside the open panel.
    document.getElementById('wlUpdPanel').addEventListener('keydown', (e)=>{
      if(e.key !== 'Tab') return;
      const f = Array.from(e.currentTarget.querySelectorAll('input, button, a[href]')).filter(el=> !el.disabled && el.offsetParent);
      if(!f.length) return;
      if(e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length-1].focus(); }
      else if(!e.shiftKey && document.activeElement === f[f.length-1]){ e.preventDefault(); f[0].focus(); }
    });
  }

  const baseProgress = TEI.render.progress;
  TEI.render.progress = function(client){
    wireOnce();
    baseProgress(client);
    if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
    renderHoldings(client);
    renderHealth(client);
  };
  TEI.wealthPage = { openUpdate, closeUpdate };
})();
