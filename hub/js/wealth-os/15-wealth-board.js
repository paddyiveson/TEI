/* ================================================================
   WEALTH (redesign B12.4, spec B5)
   Rendering Wealth also runs TEI.render.portfolio (coach's corner, the
   price notes and the Portfolio Lab, now on its own screen). This block
   adds the Bold board's sections (B5.1): Your accounts, the four health
   signals, What this means, the read-only Your portfolio and Dividends,
   plus the Update balances panel (which saves through TEI.update).
   ================================================================ */
window.TEI = window.TEI || {};
TEI.render = TEI.render || {};
(function(){
  const {fmtGBP, acctLabel, currentMonthKey} = TEI.data;
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function setText(id, text){ const el = document.getElementById(id); if(el) el.textContent = text; }
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

  /* ---------------- Your accounts (B5.1) ----------------
     Grouped under Pensions, ISAs, Investment accounts and Cash, each with
     its total and share. An account opens to its holdings (name, value and
     % return from cost); a holding opens to its ticker, cost and flags.
     Uninvested cash shows under the holdings. */
  const GROUPS = [
    {label:'Pensions', types:['pension']},
    {label:'ISAs', types:['isa', 'lisa']},
    {label:'Investment accounts', types:['gia', 'crypto']},
    {label:'Cash', types:CASH_TYPES}
  ];
  const OTHER_GROUP = {label:'Other accounts', types:[]};
  const TYPE_WORD = {pension:'Pension', isa:'Stocks and shares ISA', lisa:'Lifetime ISA', cash_lisa:'Cash Lifetime ISA', gia:'Investment account', cash:'Cash', cash_isa:'Cash ISA', crypto:'Crypto'};
  // Account colours with their light-ground variants (B1.2).
  const ACC_VAR = {pension:'--w-acc-pension', isa:'--w-acc-isa', lisa:'--w-acc-lisa', cash_lisa:'--w-acc-lisa', gia:'--w-acc-gia', cash:'--w-acc-cash', cash_isa:'--w-acc-cash'};
  function accColour(type){ return ACC_VAR[type] ? 'var(' + ACC_VAR[type] + ')' : '#6F7F98'; }
  const CHEV = '<svg class="wl-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function pctTxt(p){ return p < 1 ? 'under 1%' : Math.round(p) + '%'; }
  function holdingItem(a, h){
    const value = Number(h.value)||0;
    const cost = Number(h.costBasis) > 0 ? Number(h.costBasis) : null;
    const ret = cost ? (value - cost)/cost*100 : null;
    const facts = [h.ticker ? 'Ticker ' + h.ticker : '', cost ? 'Cost ' + fmtGBP(cost) : 'Cost not recorded',
      (h.priceSource || 'manual') === 'manual' ? 'Manual price' : 'Live US price',
      a.setAndForget ? 'Set and forget' : '', a.earmarked ? 'Earmarked' : ''].filter(Boolean);
    return `<li><details class="wl-hold"><summary><span class="wl-hold-n">${esc(h.name || h.ticker || 'Holding')}</span><b>${fmtGBP(value)}</b><em class="wl-ret${ret == null ? '' : (ret >= 0 ? ' up' : ' down')}">${fmtRet(ret)}</em></summary><p>${esc(facts.join(' · '))}</p></details></li>`;
  }
  function accountRow(client, a, value){
    const hs = (client.holdings||[]).filter(h=> h.accountId === a.id).sort((x,y)=> (Number(y.value)||0) - (Number(x.value)||0));
    const flags = [a.setAndForget ? 'Set and forget' : '', a.earmarked ? 'Earmarked' : ''].filter(Boolean).map(f=> `<span class="wl-flag">${f}</span>`).join('');
    const sub = esc(TYPE_WORD[a.type] || 'Account') + (hs.length ? ' · ' + hs.length + (hs.length === 1 ? ' holding' : ' holdings') : '');
    const head = `<i class="wl-dot" style="background:${accColour(a.type)}"></i><span class="wl-acc-n"><b>${esc(acctLabel(a))}</b><small>${sub}</small>${flags ? '<span class="wl-flags">' + flags + '</span>' : ''}</span><span class="wl-acc-v">${fmtGBP(value)}</span>`;
    if(!hs.length) return `<div class="wl-acc wl-acc-flat">${head}</div>`;
    const cash = Number(a.cashBalance)||0;
    return `<details class="wl-acc"><summary>${head}${CHEV}</summary><ul class="wl-holds">${hs.map(h=> holdingItem(a, h)).join('')}`
      + (cash > 0 ? `<li class="wl-hold-cash"><span>Uninvested cash</span><b>${fmtGBP(cash)}</b></li>` : '') + '</ul></details>';
  }
  function renderAccountGroups(client){
    const b = TEI.calc.latestBreakdown(TEI.calc.buildMergedMonths(client));
    const accts = (client.accounts||[]).map(a=> ({a, v: Number(b[a.id])||0})).filter(x=> x.v > 0);
    const total = accts.reduce((s,x)=> s + x.v, 0);
    setText('wlAcctTitle', accts.length ? `${accts.length} ${accts.length === 1 ? 'account' : 'accounts'} · ${fmtGBP(total)}` : 'No accounts yet');
    const host = document.getElementById('wlAcctGroups');
    if(!accts.length){ host.innerHTML = '<p class="hm-muted">Add your accounts in Settings, under Accounts.</p>'; return; }
    const groupOf = t=> GROUPS.find(g=> g.types.includes(t)) || OTHER_GROUP;
    host.innerHTML = GROUPS.concat([OTHER_GROUP]).map(g=>{
      const rows = accts.filter(x=> groupOf(x.a.type) === g).sort((p,q)=> q.v - p.v);
      if(!rows.length) return '';
      const sum = rows.reduce((s,x)=> s + x.v, 0);
      return `<div class="wl-grp"><p class="wl-grp-h"><b>${g.label}</b><span>${fmtGBP(sum)}<em>${pctTxt(sum/total*100)}</em></span></p>`
        + rows.map(x=> accountRow(client, x.a, x.v)).join('') + '</div>';
    }).join('');
  }

  /* ---------------- Health: four simple signals (B5.1) ----------------
     Concentration, cash drag, safety net and spread, each with a value, a
     thin bar, a coloured dot and a word, so colour is never the only cue.
     They describe; they do not recommend. Actively managed money only
     (set-and-forget and earmarked accounts left out, as in the Lab).
     TODO(H2 #7): thresholds and wording from the insight engine session. */
  const STATE_WORD = {ok:'Fine', look:'Worth knowing', warn:'Needs attention', none:'No data yet'};
  function renderHealth(client){
    const rows = holdingRows(client);
    const active = rows.filter(r=> !(r.acc.setAndForget || r.acc.earmarked));
    const total = active.reduce((s,r)=> s + r.value, 0);
    const all = rows.reduce((s,r)=> s + r.value, 0);
    const sn = TEI.calc.safetyNet(client);
    const sig = [];
    const top = active.filter(r=> r.kind !== 'cash')[0];
    if(top && total > 0){
      const p = top.value/total*100;
      sig.push({name:'Concentration', value:Math.round(p) + '%', bar:p, state: p >= 20 ? 'look' : 'ok', note:`${top.name} is your largest share of actively managed money.`});
    } else sig.push({name:'Concentration', value:'–', bar:0, state:'none', note:'Add holdings to see how concentrated your money is.'});
    const cash = rows.filter(r=> r.kind === 'cash' || CASH_TYPES.includes(r.acc.type)).reduce((s,r)=> s + r.value, 0);
    if(all > 0 && sn.monthlySpend){
      const spare = Math.max(0, cash - sn.fullMonths*sn.monthlySpend), p = spare/all*100;
      sig.push({name:'Cash drag', value:Math.round(p) + '%', bar:p, state: p >= 10 ? 'look' : 'ok',
        note: spare > 0 ? `${fmtGBP(spare)} of cash sits above your ${sn.fullMonths}-month safety net.` : 'No cash sits above your safety net.'});
    } else sig.push({name:'Cash drag', value:'–', bar:0, state:'none', note:'Add your spending in Cashflow to measure this.'});
    if(sn.months != null){
      sig.push({name:'Safety net', value:sn.months.toFixed(1) + ' months', bar:Math.min(100, sn.months/sn.fullMonths*100),
        state: sn.months >= sn.fullMonths ? 'ok' : (sn.months >= 1 ? 'look' : 'warn'),
        note: sn.months >= sn.fullMonths ? 'Complete.' : `Building towards ${sn.fullMonths} months of spending.`});
    } else sig.push({name:'Safety net', value:'–', bar:0, state:'none', note:'Add your spending in Cashflow to measure this.'});
    const n = active.filter(r=> r.kind === 'holding').length, accts = new Set(active.map(r=> r.acc.id)).size;
    sig.push(n ? {name:'Spread', value:n + (n === 1 ? ' holding' : ' holdings'), bar:Math.min(100, n/12*100), state: n <= 2 ? 'look' : 'ok', note:`Across ${accts} ${accts === 1 ? 'account' : 'accounts'}.`}
      : {name:'Spread', value:'–', bar:0, state:'none', note:'No individual holdings are recorded yet.'});
    document.getElementById('wlHealthList').innerHTML = sig.map(s=>
      `<li class="wl-sig wl-sig-${s.state}"><p class="wl-sig-k">${s.name}</p><p class="wl-sig-v">${esc(s.value)}</p>`
      + `<span class="wl-sig-bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, s.bar)).toFixed(0)}%"></span></span>`
      + `<p class="wl-sig-st"><i aria-hidden="true"></i>${STATE_WORD[s.state]}</p><p class="wl-sig-note">${esc(s.note)}</p></li>`).join('');
  }

  /* ---------------- What this means (B5.1) ----------------
     Coach's corner leads (TEI.render.portfolio fills it). Without a note
     from the coach, the top insight takes the lead slot on a raised tile.
     Up to three insight cards follow, highest priority first, each marked
     Needs attention, Worth knowing or Good news; with fewer, they share the
     space. Wired to the signals engine and renderWealthInsights' sentences.
     TODO(H2 #7): rules, wording and priority from the insight engine session. */
  const TIER = {critical:['warn', 'Needs attention'], warning:['warn', 'Needs attention'], positive:['pos', 'Good news'], neutral:['muted', 'Worth knowing']};
  function markHTML(tier){ const t = TIER[tier] || TIER.neutral; return `<span class="wl-mark wl-mark-${t[0]}"><i aria-hidden="true"></i>${t[1]}</span>`; }
  function renderMeaning(client){
    const pc = client.portfolioCoach || {};
    const hasNote = pc.mode === 'manual' && !!pc.message;
    const items = [];
    const seen = new Set();
    const add = (tier, text)=>{ const k = String(text||'').trim(); if(k && !seen.has(k)){ seen.add(k); items.push({tier, text:k}); } };
    TEI.calc.pickSignals(client, 'portfolio', 4).forEach(s=> add(s.tier, s.message));
    (TEI.render.wealthInsightItems ? TEI.render.wealthInsightItems(client) : []).forEach(t=> add('neutral', t));
    const order = {critical:0, warning:1, positive:2, neutral:3};
    items.sort((a,b)=> order[a.tier] - order[b.tier]);
    document.getElementById('pfcCard').hidden = !hasNote;
    document.getElementById('wlCoachFrom').hidden = !hasNote;
    const lead = document.getElementById('wlLead');
    let cards = items;
    if(!hasNote && items.length){
      lead.innerHTML = `<p class="hm-label">What stands out</p>${markHTML(items[0].tier)}<p class="wl-lead-msg">${esc(items[0].text)}</p>`;
      cards = items.slice(1);
    }
    lead.hidden = hasNote || !items.length;
    cards = cards.slice(0, 3);
    const host = document.getElementById('wlInsights');
    host.style.setProperty('--wl-cards', Math.max(1, cards.length));
    host.innerHTML = cards.map(c=> `<article class="hm-tile wl-card">${markHTML(c.tier)}<p>${esc(c.text)}</p></article>`).join('');
    host.hidden = !cards.length;
  }

  /* ---------------- Your portfolio, read only (B5.1) ----------------
     A treemap by holding across accounts, coloured by size in navy steps
     (never by account type); the largest has a gold ring. Set-and-forget
     and earmarked money stays out unless its switch is on (both off by
     default). Beside it, the six largest holdings and the move each would
     need to change the view by 1% (the Lab's moveNeededFor1Pct). */
  const NAVY_STEPS = [['#14376E', '#F7F4ED'], ['#1E4A86', '#F7F4ED'], ['#2D5D9C', '#F7F4ED'], ['#4774AE', '#F7F4ED'], ['#6F89B4', '#0F1E36'], ['#94A9CC', '#0F1E36'], ['#B9CAE6', '#0F1E36'], ['#DCE5F3', '#0F1E36']];
  const pfInclude = {setAndForget:false, earmarked:false};
  const svgEsc = s=> esc(s);
  function portfolioItems(client){
    const groups = {};
    holdingRows(client).forEach(r=>{
      if((r.acc.setAndForget && !pfInclude.setAndForget) || (r.acc.earmarked && !pfInclude.earmarked)) return;
      const key = r.kind === 'holding' ? (r.ticker ? 'T:' + r.ticker.trim().toUpperCase() : 'N:' + r.name.trim().toLowerCase())
        : r.kind === 'cash' ? 'CASH' : 'A:' + r.acc.id;
      const g = groups[key] || (groups[key] = {key, name: r.kind === 'cash' ? 'Cash' : r.name, ticker: r.kind === 'holding' ? r.ticker : '', value:0, holding: r.kind === 'holding'});
      g.value += r.value;
    });
    const list = Object.values(groups).filter(g=> g.value > 0).sort((a,b)=> b.value - a.value);
    const total = list.reduce((s,g)=> s + g.value, 0);
    list.forEach(g=> g.weight = total ? g.value/total*100 : 0);
    return {list, total};
  }
  function renderPortfolioView(client){
    const avail = {setAndForget:(client.accounts||[]).some(a=> a.setAndForget), earmarked:(client.accounts||[]).some(a=> a.earmarked)};
    const sw = document.getElementById('wlPfSwitches');
    sw.innerHTML = [['setAndForget', 'Set and forget'], ['earmarked', 'Earmarked']].filter(x=> avail[x[0]]).map(x=>
      `<button type="button" class="wl-switch" role="switch" aria-checked="${pfInclude[x[0]]}" data-pf="${x[0]}"><span class="wl-switch-track" aria-hidden="true"><span></span></span>${x[1]}</button>`).join('');
    sw.querySelectorAll('[data-pf]').forEach(btn=> btn.onclick = ()=>{
      pfInclude[btn.dataset.pf] = !pfInclude[btn.dataset.pf];
      renderPortfolioView(client);
      const again = sw.querySelector(`[data-pf="${btn.dataset.pf}"]`);
      if(again) again.focus();
    });
    const shown = Object.keys(avail).filter(k=> avail[k]);
    const off = shown.filter(k=> !pfInclude[k]).length;
    const {list, total} = portfolioItems(client);
    setText('wlPfTitle', (!off ? 'Everything you own' : off === shown.length ? 'Actively managed money' : 'Filtered view') + (total ? ' · ' + fmtGBP(total) : ''));
    const host = document.getElementById('wlTreemap');
    if(!list.length || !TEI.lab){
      host.innerHTML = '<p class="hm-muted">Your holdings show here once they are recorded.</p>';
      document.getElementById('wlMoveList').innerHTML = '';
      return;
    }
    // Up to 14 tiles; anything smaller folds into one "Other" tile.
    let items = list.slice(0, 14);
    if(list.length > 14){
      const rest = list.slice(14), v = rest.reduce((s,g)=> s + g.value, 0);
      items = items.concat([{key:'OTHER', name:rest.length + ' smaller', ticker:'', value:v, weight: v/total*100, isOther:true}]);
    }
    const width = host.clientWidth || 640, height = window.matchMedia('(max-width:860px)').matches ? 260 : 320;
    const tiles = TEI.lab.layoutTreemap(TEI.lab.treemapOrder(items), 0, 0, width, height);
    host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc('Portfolio by holding: ' + items.slice(0, 6).map(t=> (t.ticker || t.name) + ' ' + t.weight.toFixed(0) + '%').join(', '))}">`
      + tiles.map((t, i)=>{
        const rank = t.isOther ? NAVY_STEPS.length - 1 : Math.min(i, NAVY_STEPS.length - 1);
        const [fill, ink] = NAVY_STEPS[rank];
        const x = t.x0 + 2, y = t.y0 + 2, w = Math.max(0, t.x1 - t.x0 - 4), h = Math.max(0, t.y1 - t.y0 - 4);
        const ring = i === 0 && !t.isOther ? ' stroke="#E8D6A8" stroke-width="2"' : '';
        const label = w >= 46 && h >= 34
          ? `<text x="${x + 10}" y="${y + 20}" fill="${ink}" font-size="${Math.min(13, w/6).toFixed(1)}" font-weight="500" font-family="Geist, system-ui, sans-serif">${svgEsc(t.ticker || t.name)}</text>`
            + (h >= 52 ? `<text x="${x + 10}" y="${y + h - 10}" fill="${ink}" font-size="${(h >= 80 && w >= 70 ? Math.min(20, w/5) : 12).toFixed(1)}" font-weight="300" font-family="Geist, system-ui, sans-serif">${t.weight.toFixed(1)}%</text>` : '')
          : '';
        return `<g><title>${svgEsc((t.ticker ? t.ticker + ', ' : '') + t.name + ': ' + fmtGBP(t.value) + ', ' + t.weight.toFixed(1) + '%')}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}"${ring}></rect>${label}</g>`;
      }).join('') + '</svg>';
    const six = list.filter(g=> g.holding).slice(0, 6);
    document.getElementById('wlMoveList').innerHTML = six.length ? six.map(g=>{
      const m = TEI.lab.moveNeededFor1Pct(g.weight);
      return `<li><span class="wl-mv-n"><b>${esc(g.ticker || g.name)}</b><small>${g.weight.toFixed(1)}% of the view</small></span><span class="wl-mv-v">${m == null ? '–' : 'a ' + (m >= 100 ? Math.round(m) : m.toFixed(1)) + '% move'}</span></li>`;
    }).join('') : '<li class="wl-mv-empty">No individual holdings are recorded yet.</li>';
  }

  /* ---------------- Dividends (B5.1) ----------------
     Only when there are dividend-paying holdings. TODO(H2 #12): the tax
     year so far, the next expected date and each payer's account need
     dated payments linked to accounts; for now, the expected income a year
     from the dividend holdings on record, with how often each pays. */
  function renderDividends(client){
    const tile = document.getElementById('wlDividends');
    const hs = (client.dividendHoldings||[]).map(h=> ({name:h.name, freq:h.frequency, income:(Number(h.amount)||0)*(Number(h.yield)||0)/100}))
      .filter(h=> h.income > 0).sort((a,b)=> b.income - a.income);
    tile.hidden = !hs.length;
    if(!hs.length) return;
    const total = hs.reduce((s,h)=> s + h.income, 0);
    setText('wlDivTotal', fmtGBP(total));
    setText('wlDivMonthly', fmtGBP(total/12));
    document.getElementById('wlDivList').innerHTML = hs.map(h=>
      `<li><span><b>${esc(h.name)}</b><small>${esc(TEI.calc.dividendFrequencyLabel ? TEI.calc.dividendFrequencyLabel(h.freq) : (h.freq || 'Annually'))}</small></span><b>${fmtGBP(h.income)}</b></li>`).join('');
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
    // Wealth and the Portfolio Lab screen link to each other (B5.4).
    document.addEventListener('click', (e)=>{
      const lab = e.target.closest('[data-wl-lab]'), back = e.target.closest('[data-wl-back]');
      if(lab){ e.preventDefault(); TEI.app.showPage('lab'); }
      else if(back){ e.preventDefault(); TEI.app.showPage('progress'); }
      // Info symbols open on tap (phones have no hover); one open at a time.
      const info = e.target.closest('.wl-i-btn');
      document.querySelectorAll('.wl-i.open').forEach(w=>{ if(!info || w !== info.parentNode) w.classList.remove('open'); });
      if(info) info.parentNode.classList.toggle('open');
    });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') document.querySelectorAll('.wl-i.open').forEach(w=> w.classList.remove('open')); });
    // The read-only treemap is laid out for its width, so redraw it on resize.
    let resizeT = null;
    window.addEventListener('resize', ()=>{
      clearTimeout(resizeT);
      resizeT = setTimeout(()=>{ const c = TEI.app.state.client; if(c && TEI.app.state.currentPage === 'progress') renderPortfolioView(c); }, 200);
    });
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
    // Fills coach's corner, the price and balance notes and the Lab, which
    // now lives on its own screen (B5.4) but shares this code.
    if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
    renderAccountGroups(client);
    renderHealth(client);
    renderMeaning(client);
    renderPortfolioView(client);
    renderDividends(client);
  };
  // The Portfolio Lab screen (B5.4): the same Portfolio code, working as before.
  TEI.render.lab = function(client){
    wireOnce();
    if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
  };
  TEI.wealthPage = { openUpdate, closeUpdate };
})();
