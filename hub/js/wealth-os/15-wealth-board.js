/* ================================================================
   WEALTH v13.2 (TEI Launch v2, brief 3.1)
   The net worth hero is the one framed object; beside it the donut and
   one row per group (D22, D24) with a quiet Debts row; a group opens its
   accounts full width under the top row and an account opens its
   holdings in place. One lighter band holds "What it holds" (treemap,
   chips, holdings with the 1% move) and the dividend strip. The review
   band closes the page: the coach's note as a letter beside the summary
   line, talking points as the briefing list, On track folded.
   Figures come from TEI.calc and TEI.wealthCalc, as before. Also runs
   the Update balances panel (now with debts) and the price refresh.
   ================================================================ */
window.TEI = window.TEI || {};
TEI.render = TEI.render || {};
(function(){
  const V = TEI.v2;
  const {esc, fmt, sgn, pc, cls, CHEV, INFO, RM, PHONE, countUp, onView, bindInfo} = V;
  const {fmtGBP, acctLabel, currentMonthKey, monthLabel} = TEI.data;
  const W = ()=> TEI.wealthCalc;
  const $ = id=> document.getElementById(id);
  const root = ()=> document.querySelector('.wo2-wealth');
  const q = s=> root().querySelector(s);
  function setText(id, text){ const el = $(id); if(el) el.textContent = text; }
  const CASH_TYPES = ['cash', 'cash_isa', 'cash_lisa'];
  const TYPE_WORD = {pension:'Pension', isa:'Stocks and shares ISA', lisa:'Lifetime ISA', cash_lisa:'Cash Lifetime ISA', gia:'General investment account', cash:'Current account', cash_isa:'Cash ISA', crypto:'Crypto'};
  const ICON = {
    sf:'<svg class="flag" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><title>Set and forget</title><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5" stroke-linecap="round"/></svg>',
    em:'<svg class="flag" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><title>Earmarked</title><path d="M4 14V2.5h7.5L10 5.5l1.5 3H4" stroke-linejoin="round"/></svg>'};
  let intro = true;

  /* ---------- data ---------- */
  function months(client){ return TEI.calc.buildMergedMonths(client); }
  function latest(client){ return TEI.calc.latestBreakdown(months(client)); }
  /* Change this month: the latest logged balance against the month before. */
  function monthChange(client, accId){
    const m = months(client), keys = Object.keys(m).sort();
    if(keys.length < 2) return 0;
    const a = m[keys[keys.length-1]] || {}, b = m[keys[keys.length-2]] || {};
    if(a[accId] == null || b[accId] == null) return 0;
    return (Number(a[accId])||0) - (Number(b[accId])||0);
  }
  /* Return on money paid in: value less what went in (bonuses and relief count as growth on the pension, as on the old page). */
  function accReturn(client, a, value){
    const cb = TEI.calc.acctContributionBreakdown(client, a.id);
    const dep = cb.opening + cb.paidIn + cb.sacrifice;
    return dep > 0 ? (value - dep)/dep*100 : null;
  }
  function holdingsOf(client, a){
    return (client.holdings||[]).filter(h=> h.accountId === a.id).sort((x, y)=> (Number(y.value)||0) - (Number(x.value)||0)).map(h=>{
      const v = Number(h.value)||0, cost = Number(h.costBasis) > 0 ? Number(h.costBasis) : null;
      return {t: h.ticker || h.name || 'Holding', d: h.ticker ? (h.name || '') : '', v, r: cost ? (v - cost)/cost*100 : null};
    });
  }
  const GROUPS = [
    {id:'prop', name:'Property', sat:'var(--gs-prop)'},
    {id:'pen', name:'Pensions', sat:'var(--gs-pen)', types:['pension']},
    {id:'inv', name:'Investments', sat:'var(--gs-inv)', types:['isa', 'gia', 'lisa', 'crypto']},
    {id:'cash', name:'Cash', sat:'var(--gs-cash)', types:CASH_TYPES},
    {id:'oth', name:'Other', sat:'var(--gs-oth)'}
  ];
  function groups(client){
    const b = latest(client);
    return GROUPS.map(g=>{
      let accs = [];
      if(g.types){
        accs = (client.accounts||[]).filter(a=> g.types.includes(a.type)).map(a=>{
          const v = Number(b[a.id])||0;
          const hs = holdingsOf(client, a);
          const cash = Number(a.cashBalance)||0;
          if(hs.length && cash > 0) hs.push({t:'Cash', d:'Uninvested', v:cash, r:null});
          return {id:a.id, n:a.provider || acctLabel(a), w:TYPE_WORD[a.type] || 'Account', v, c:monthChange(client, a.id), r:accReturn(client, a, v),
            f: a.setAndForget ? 'sf' : a.earmarked ? 'em' : null, h: hs.length ? hs : null};
        }).filter(a=> a.v > 0);
      } else {
        const assets = ((client.wealth||{}).assets||[]).filter(x=> g.id === 'prop' ? x.type === 'property' : x.type !== 'property');
        accs = assets.filter(x=> Number(x.value) > 0).map(x=> ({id:x.id, n:x.notes || (g.id === 'prop' ? 'Home' : x.type), w: g.id === 'prop' ? 'Your estimate' : 'Your estimate', v:Number(x.value), c:0, r:null}));
      }
      const v = accs.reduce((s, a)=> s + a.v, 0), c = accs.reduce((s, a)=> s + a.c, 0);
      let ret = null;
      if(g.types){
        let dep = 0, val = 0;
        (client.accounts||[]).filter(a=> g.types.includes(a.type)).forEach(a=>{ const cb = TEI.calc.acctContributionBreakdown(client, a.id); const d = cb.opening + cb.paidIn + cb.sacrifice; if(d > 0){ dep += d; val += Number(b[a.id])||0; } });
        ret = dep > 0 && g.id !== 'cash' ? (val - dep)/dep*100 : null;
      }
      return Object.assign({}, g, {accs, v, c, ret});
    }).filter(g=> g.v > 0).sort((a, b)=> b.v - a.v);
  }
  const hasFlags = client=> (client.accounts||[]).some(a=> a.setAndForget || a.earmarked);

  /* ---------- hero: net worth over time ---------- */
  const RANGES = {'1M':'1m', '3M':'3m', 'YTD':'ytd', '1Y':'1y', '3Y':'3y', '5Y':'5y', 'All':'all'};
  const MAIN4 = ['1Y', '3Y', '5Y', 'All'], MORE = ['1M', '3M', 'YTD'];
  let range = V.store.get('wo-range') || 'All'; if(!RANGES[range]) range = 'All';
  let cd = null;
  function shortMonth(k){ const [y, m] = k.split('-').map(Number); return V.MON[m-1] + " '" + String(y).slice(2); }
  function drawHero(client){
    const m = months(client), invest = TEI.calc.buildUnifiedTotals(m), total = W().totalNetWorthSeries(client);
    const all = Object.keys(invest).sort();
    const T = W().totalNetWorth(client);
    const nw = q('.x-nw');
    if(intro) countUp(nw, T, fmt, 900); else nw.textContent = fmt(T);
    syncRange();
    const svgLine = q('.x-line'), area = q('.x-area'), paidP = q('.x-paid'), ep = q('.endpt');
    if(all.length < 2){
      svgLine.setAttribute('d', ''); area.setAttribute('d', ''); paidP.setAttribute('d', ''); ep.hidden = true;
      q('.x-axis').innerHTML = '';
      q('.x-stats').innerHTML = '<span class="flat">Your history builds from your second month of balances.</span>';
      cd = null; return;
    }
    ep.hidden = false;
    const keys = W().filterKeysByRange(all, RANGES[range]);
    // Paid in: money into the accounts, plus property and other assets less debts at
    // today's value, so the gap between the lines is growth (logged in the PR).
    const offset = total[all[0]] - invest[all[0]];
    const contrib = W().cumulativeContributionsSeries(client, all).series;
    const v = keys.map(k=> total[k]), p = keys.map(k=> (contrib[k]||0) + offset), L = keys.map(shortMonth), n = keys.length;
    const lo = Math.min(...v, ...p), hi = Math.max(...v, ...p), pad = (hi - lo)*.08 || 1;
    const X = i=> i/(n-1)*800, Y = x=> 200 - ((x - lo + pad)/(hi - lo + 2*pad))*190;
    let d = ''; v.forEach((x, i)=>{ d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1); });
    svgLine.setAttribute('d', d); area.setAttribute('d', d + 'L800 200L0 200Z');
    let pd = ''; p.forEach((x, i)=>{ pd += (i ? 'H' + X(i).toFixed(1) + 'V' : 'M0 ') + Y(x).toFixed(1); });
    paidP.setAttribute('d', pd);
    ep.style.left = '100%'; ep.style.top = (Y(v[n-1])/2) + '%';
    q('.x-axis').innerHTML = '<span>' + L[0] + '</span>' + (n > 6 ? '<span>' + L[Math.floor(n/2)] + '</span>' : '') + '<span>' + L[n-1] + '</span>';
    if(intro && !RM()){ const c = q('.chart'); c.classList.remove('drawin'); void c.offsetWidth; c.classList.add('drawin'); }
    const r = TEI.calc.moneyWeightedReturn(invest, TEI.calc.moneyInByMonth(client, m), keys[0], keys[n-1]);
    const gain = r.growth, pct = r.periodPct || 0, yrs = (n - 1)/12;
    const ann = TEI.calc.annualisedReturnPct(invest, TEI.calc.moneyInByMonth(client, m));
    const since = range === 'All' ? 'since ' + L[0] : range === 'YTD' ? 'this year' : 'over ' + ({'1M':'the last month', '3M':'3 months', '1Y':'the last year', '3Y':'3 years', '5Y':'5 years'})[range];
    q('.x-stats').innerHTML = '<span class="st1"><span class="' + (gain >= 0 ? 'g' : 'dn') + ' fig">' + (gain >= 0 ? '+' : '') + fmt(gain) + ' growth</span>' + INFO('Growth on top of what you paid in.') + '</span><span class="dot">·</span><span>' + pc(pct) + '<span class="since"> ' + since + '</span></span>' + (ann != null && yrs >= 1 ? '<span class="dot">·</span><span>' + ann.toFixed(1) + '% a year</span>' : '');
    bindInfo(q('.x-stats'));
    cd = {v, p, L, n};
  }
  function syncRange(){
    root().querySelectorAll('.ranges [data-r], .rng2 [data-r]').forEach(x=> x.setAttribute('aria-pressed', x.dataset.r === range ? 'true' : 'false'));
    const rmb = q('.rmb'); if(!rmb) return;
    const m = MORE.includes(range);
    rmb.setAttribute('aria-pressed', m ? 'true' : 'false');
    q('.x-rmbl').textContent = m ? range : '';
    rmb.setAttribute('aria-label', m ? range + ', more ranges' : 'More ranges');
  }
  function wireHero(){
    const rb = q('.ranges');
    rb.innerHTML = Object.keys(RANGES).map(r=> '<button type="button" data-r="' + r + '">' + r + '</button>').join('');
    const r2 = q('.rng2');
    r2.innerHTML = MAIN4.map(r=> '<button type="button" data-r="' + r + '">' + r + '</button>').join('') +
      '<span class="rmore"><button type="button" class="rmb" aria-haspopup="true" aria-expanded="false"><span class="x-rmbl"></span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>' +
      '<span class="rmenu" role="menu">' + MORE.map(r=> '<button type="button" role="menuitem" data-r="' + r + '">' + ({'1M':'1 month', '3M':'3 months', 'YTD':'This year'})[r] + '</button>').join('') + '</span></span>';
    const closeMore = ()=>{ const b = q('.rmb'); if(b){ b.setAttribute('aria-expanded', 'false'); r2.classList.remove('open'); } };
    root().querySelectorAll('.ranges [data-r], .rng2 [data-r]').forEach(b=> b.onclick = e=>{ e.stopPropagation(); range = b.dataset.r; V.store.set('wo-range', range); closeMore(); const c = TEI.app.state.client; if(c) drawHero(c); });
    q('.rmb').onclick = e=>{ e.stopPropagation(); const b = q('.rmb'), o = b.getAttribute('aria-expanded') === 'true'; b.setAttribute('aria-expanded', !o); r2.classList.toggle('open', !o); };
    document.addEventListener('click', closeMore);
    const ch = q('.chart'), tip = q('.tip'), vl = q('.vline');
    ch.addEventListener('pointermove', e=>{
      if(!cd) return;
      const r = ch.getBoundingClientRect(); let i = Math.round((e.clientX - r.left)/r.width*(cd.n - 1)); i = Math.max(0, Math.min(cd.n - 1, i));
      const x = i/(cd.n - 1)*100; vl.style.display = tip.style.display = 'block'; vl.style.left = x + '%'; tip.style.left = Math.min(Math.max(x, 14), 86) + '%';
      tip.innerHTML = '<span>' + cd.L[i] + '</span>&nbsp; <b class="fig num">' + fmt(cd.v[i]) + '</b>&nbsp; <span>paid in</span> <span class="fig num">' + fmt(cd.p[i]) + '</span>';
    });
    ch.addEventListener('pointerleave', ()=>{ vl.style.display = tip.style.display = 'none'; });
  }
  function drawAsOf(client){
    const latestAt = (client.holdings||[]).filter(h=> h.priceSource === 'auto_us' && h.lastPricedAt).reduce((mx, h)=> Math.max(mx, new Date(h.lastPricedAt).getTime()||0), 0);
    const el = q('.asof');
    if(latestAt){ const d = new Date(latestAt); el.textContent = 'Prices ' + d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', timeZone:'Europe/London'}); el.title = TEI.calc.usPricesAsOfText(client); }
    else { const keys = Object.keys(months(client)).sort(); el.textContent = keys.length ? monthLabel(keys[keys.length-1]) : ''; el.title = ''; }
  }

  /* ---------- where it is: donut + group rows ---------- */
  let openG = null, openA = {}, hovG = null;
  const share = (v, T)=>{ const s = v/T*100; return s < 1 ? '<1%' : Math.round(s) + '%'; };
  function drawMix(client){
    const gs = groups(client), A = gs.reduce((s, g)=> s + g.v, 0); let a = 0;
    const sv = q('.x-donut');
    if(!A){ sv.innerHTML = '<g transform="rotate(-90 21 21)"><circle r="15.9155" cx="21" cy="21" fill="none" stroke="rgba(190,208,236,.07)" stroke-width="2.4"/></g><text class="dc2" x="21" y="22" text-anchor="middle">No assets yet</text>'; return; }
    const sweep = intro && !RM();
    let h = '<g transform="rotate(-90 21 21)"><circle r="15.9155" cx="21" cy="21" fill="none" stroke="rgba(190,208,236,.07)" stroke-width="2.4"/>';
    gs.forEach((g, i)=>{ const s = g.v/A*100, Lx = Math.max(s - 1.6, .05);
      h += '<circle class="seg-c" data-g="' + g.id + '" data-d="' + Lx + ' ' + (100 - Lx) + '" r="15.9155" cx="21" cy="21" fill="none" stroke="' + g.sat + '" stroke-linecap="round" style="stroke-dasharray:' + (sweep ? '0 100' : Lx + ' ' + (100 - Lx)) + ';transition-delay:' + (sweep ? i*140 : 0) + 'ms" stroke-dashoffset="' + (-a - .8) + '"><title>' + esc(g.name) + ' ' + share(g.v, A) + '</title></circle>';
      a += s; });
    h += '</g><text class="dc1" x="21" y="20.2" text-anchor="middle"></text><text class="dc2" x="21" y="26.4" text-anchor="middle"></text>';
    sv.innerHTML = h;
    sv.setAttribute('aria-label', 'Share of your assets by group: ' + gs.map(g=> g.name + ' ' + share(g.v, A)).join(', '));
    if(sweep) requestAnimationFrame(()=> requestAnimationFrame(()=> sv.querySelectorAll('.seg-c').forEach(c=> c.style.strokeDasharray = c.dataset.d)));
    sv.querySelectorAll('.seg-c').forEach(c=>{ c.addEventListener('click', ()=> jump(client, c.dataset.g));
      c.addEventListener('mouseenter', ()=>{ hovG = c.dataset.g; paintSel(client); }); c.addEventListener('mouseleave', ()=>{ hovG = null; paintSel(client); }); });
    paintSel(client);
  }
  function paintSel(client){
    const gs = groups(client); if(!gs.length) return;
    const A = gs.reduce((s, g)=> s + g.v, 0), id = hovG || openG || gs[0].id, g = gs.find(x=> x.id === id) || gs[0];
    root().querySelectorAll('.x-donut .seg-c').forEach(c=> c.classList.toggle('on', c.dataset.g === g.id));
    const t1 = q('.x-donut .dc1'), t2 = q('.x-donut .dc2');
    if(t1){ t1.textContent = share(g.v, A); t2.textContent = g.name; }
  }
  function setWhere(o){ q('.where').classList.toggle('open', o); q('.wtog').setAttribute('aria-expanded', o ? 'true' : 'false'); }
  function jump(client, id){
    openG = id; openA = {}; if(PHONE()) setWhere(true); drawAccounts(client);
    const t = PHONE() ? q('.grow[data-g="' + id + '"]') : q('.x-panel');
    if(t) t.scrollIntoView({behavior: RM() ? 'auto' : 'smooth', block: PHONE() ? 'start' : 'nearest'});
  }
  function drawAccounts(client){
    const gs = groups(client), box = q('.grows'), flags = hasFlags(client);
    const ds = V.debts(client), owed = ds.reduce((s, d)=> s + d.bal, 0);
    box.innerHTML = gs.map(g=>{
      const fl = flags ? [...new Set(g.accs.map(a=> a.f).filter(Boolean))].map(f=> ICON[f]).join('') : '';
      const ex = openG === g.id;
      return '<button type="button" class="grow" data-g="' + g.id + '" aria-expanded="' + ex + '" style="--gc:' + g.sat + '">' +
        '<span class="gn"><i></i>' + esc(g.name) + (fl ? '<span class="fls">' + fl + '</span>' : '') + '</span>' +
        '<span class="gv num fig" data-v="' + g.v + '">' + fmt(g.v) + '</span>' +
        '<span class="gs num"><span class="' + cls(g.c) + ' fig" title="Change this month">' + (g.c ? sgn(g.c) : 'No change') + '</span>' +
        (g.ret != null ? '<span class="gr"><span class="' + cls(g.ret) + '">' + pc(g.ret) + '</span> return</span>' : '') + '</span>' + CHEV + '</button>';
    }).join('') +
      (ds.length
        ? '<button type="button" class="grow debt" data-debts><span class="gn"><i></i>Debts</span><span class="gv num fig">' + fmt(-owed) + '</span><span class="gs"><span>' + esc(ds.map(d=> d.name).join(', ')) + ' · details in Cashflow</span></span>' + CHEV + '</button>'
        : '<button type="button" class="grow debt" data-debts-add><span class="gn"><i></i>Debts</span><span class="gv">None recorded</span><span class="gs"><span>Add a mortgage, loan or card in Update balances</span></span>' + CHEV + '</button>');
    box.querySelectorAll('.grow[data-g]').forEach(b=>{
      b.onclick = ()=>{ openG = openG === b.dataset.g ? null : b.dataset.g; openA = {}; drawAccounts(client); };
      ['mouseenter', 'focus'].forEach(ev=> b.addEventListener(ev, ()=>{ hovG = b.dataset.g; paintSel(client); }));
      ['mouseleave', 'blur'].forEach(ev=> b.addEventListener(ev, ()=>{ hovG = null; paintSel(client); }));
    });
    const dr = box.querySelector('[data-debts]'); if(dr) dr.onclick = ()=> TEI.app.showPage('cashflow', 'debts');
    const da = box.querySelector('[data-debts-add]'); if(da) da.onclick = ()=> openUpdate('debts');
    paintSel(client);
    if(intro) onView(box, ()=> box.querySelectorAll('.gv[data-v]').forEach((el, i)=> setTimeout(()=> countUp(el, +el.dataset.v, fmt, 750), 80 + i*90)));
    const slot = q('.x-panelslot'), g = gs.find(x=> x.id === openG);
    if(!g){ slot.innerHTML = ''; return; }
    const hasH = g.accs.some(a=> a.h);
    let h = '<div class="panel p13 x-panel" style="--pc:' + g.sat + '">';
    g.accs.forEach(a=>{
      const key = a.id, ex = !!openA[key], can = !!a.h;
      h += (can ? '<button type="button" class="arow" data-a="' + key + '" aria-expanded="' + ex + '">' : '<div class="arow">') +
        '<span class="an"><b>' + esc(a.n) + (a.f && flags ? ICON[a.f] : '') + '</b><small>' + esc(a.w) + (can ? ' · ' + a.h.length + ' holding' + (a.h.length > 1 ? 's' : '') : '') + '</small></span>' +
        '<span class="c num fig">' + fmt(a.v) + '</span>' +
        '<span class="c num"><span class="' + cls(a.c) + ' fig">' + (a.c ? sgn(a.c) : 'No change') + '</span><small>this month</small></span>' +
        '<span class="c num">' + (a.r != null ? '<span class="' + cls(a.r) + '">' + pc(a.r) + '</span><small>return</small>' : '') + '</span>' +
        '<span class="c m num"><span class="fig">' + fmt(a.v) + '</span><small><span class="' + cls(a.c) + ' fig">' + (a.c ? sgn(a.c) : 'No change') + '</span>' + (a.r != null ? ' · <span class="' + cls(a.r) + '">' + pc(a.r) + '</span>' : '') + '</small></span>' +
        (can ? CHEV + '</button>' : '<i></i></div>');
      if(ex) h += '<div class="hold">' + a.h.map(x=> '<div class="hrow"><span class="hn">' + esc(x.t) + (x.d ? '<small>' + esc(x.d) + '</small>' : '') + '</span>' +
        '<span class="c num fig">' + fmt(x.v) + '</span><span class="c num" style="color:var(--soft)">' + Math.round(x.v/(a.v||1)*100) + '%<small>of account</small></span>' +
        '<span class="c num">' + (x.r != null ? '<span class="' + cls(x.r) + '">' + pc(x.r) + '</span><small>return</small>' : '') + '</span>' +
        '<span class="c m num"><span class="fig">' + fmt(x.v) + '</span><small>' + (x.r != null ? '<span class="' + cls(x.r) + '">' + pc(x.r) + '</span>' : Math.round(x.v/(a.v||1)*100) + '% of account') + '</small></span><i></i></div>').join('') + '</div>';
    });
    if(hasH) h += '<div class="pfoot"><span>Return is growth on money paid in.</span></div>';
    h += '</div>';
    slot.innerHTML = h;
    if(PHONE()){ const row = box.querySelector('.grow[data-g="' + g.id + '"]'), pn = slot.firstElementChild; if(row && pn) row.after(pn); }
    root().querySelectorAll('.x-panel button.arow').forEach(b=> b.onclick = ()=>{ openA[b.dataset.a] = !openA[b.dataset.a]; drawAccounts(client); });
  }

  /* ---------- what it holds ---------- */
  let incSF = false, incEM = false, showAll = false, hl = null, pin = null;
  const SHADES = ['#173F2F', '#1F5440', '#2A6A51', '#3A8264', '#529A79', '#6EB08F', '#8CC4A6', '#A9D6BD', '#C4E5D2', '#DCF0E4'];
  function hItems(client){
    const groups = {};
    (client.accounts||[]).forEach(a=>{
      if(CASH_TYPES.includes(a.type)) return;
      const flagged = a.setAndForget ? 'sf' : a.earmarked ? 'em' : null;
      if((flagged === 'sf' && !incSF) || (flagged === 'em' && !incEM)) return;
      const hs = (client.holdings||[]).filter(h=> h.accountId === a.id);
      const add = (key, id, nm, sub, v)=>{ if(!(v > 0)) return; const g = groups[key] || (groups[key] = {id, nm, sub, v:0, sf: !!flagged}); g.v += v; };
      if(hs.length){
        hs.forEach(h=>{ const nm = h.name || h.ticker || 'Holding'; add(h.ticker ? 'T:' + h.ticker.trim().toUpperCase() : 'N:' + nm.trim().toLowerCase(), h.ticker || nm, nm, flagged ? (a.provider || acctLabel(a)) : '', Number(h.value)||0); });
        const cash = Number(a.cashBalance)||0; if(cash > 0) add('CASH:' + a.id, 'Cash', 'Cash', 'Uninvested, ' + (a.provider || acctLabel(a)), cash);
      } else if(a.type !== 'pension'){
        const v = Number(latest(client)[a.id])||0; add('A:' + a.id, a.provider || acctLabel(a), acctLabel(a), TYPE_WORD[a.type] || '', v);
      }
    });
    const list = Object.values(groups).sort((x, y)=> y.v - x.v), T = list.reduce((s, x)=> s + x.v, 0);
    list.forEach((x, i)=>{ x.s = x.v/T*100; x.col = SHADES[Math.min(i, SHADES.length-1)]; });
    return {a:list, T};
  }
  function split(items, x, y, w, h, out){
    if(items.length === 1){ out.push(Object.assign({}, items[0], {x, y, w, h})); return; }
    const tot = items.reduce((s, i)=> s + i.v, 0); let acc = 0, k = 1, best = 1e9;
    for(let i=0; i<items.length-1; i++){ acc += items[i].v; const d = Math.abs(acc - tot/2); if(d < best){ best = d; k = i + 1; } }
    const A = items.slice(0, k), B = items.slice(k), f = A.reduce((s, i)=> s + i.v, 0)/tot;
    if(w*1.6 >= h){ split(A, x, y, w*f, h, out); split(B, x + w*f, y, w*(1 - f), h, out); } else { split(A, x, y, w, h*f, out); split(B, x, y + h*f, w, h*(1 - f), out); }
  }
  function drawHold(client){
    const flags = hasFlags(client);
    if(!flags){ incSF = incEM = false; }
    const {a, T} = hItems(client);
    const mode = incSF && incEM ? 'across all your investments' : incSF ? 'including set and forget' : incEM ? 'including earmarked' : 'actively managed';
    q('.hsub').innerHTML = a.length ? '<b class="fig num">' + fmt(T) + '</b> ' + mode : 'Your holdings show here once they are recorded.';
    const CK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const sfOn = (client.accounts||[]).some(x=> x.setAndForget), emOn = (client.accounts||[]).some(x=> x.earmarked);
    const tog = q('.htog');
    tog.innerHTML = (sfOn ? '<button type="button" class="tchip" data-t="sf" aria-pressed="' + incSF + '">' + CK + 'Set and forget</button>' : '') + (emOn ? '<button type="button" class="tchip" data-t="em" aria-pressed="' + incEM + '">' + CK + 'Earmarked</button>' : '');
    tog.querySelectorAll('.tchip').forEach(b=> b.onclick = ()=>{ if(b.dataset.t === 'sf') incSF = !incSF; else incEM = !incEM; pin = hl = null; drawHold(client); const again = tog.querySelector('[data-t="' + b.dataset.t + '"]'); if(again) again.focus(); });
    const tree = q('.tree2'), list = q('.x-hlist');
    if(!a.length){ tree.innerHTML = ''; list.innerHTML = ''; q('.hmore').hidden = true; tree.hidden = true; return; }
    tree.hidden = false;
    const small = a.filter(x=> x.s < 3), big = a.filter(x=> x.s >= 3);
    if(small.length > 1){ const v = small.reduce((s, x)=> s + x.v, 0); big.push({id:'Other', nm:small.length + ' smaller holdings', v, s:v/T*100, col:SHADES[Math.min(big.length, SHADES.length-1)], other:small.map(x=> x.id)}); } else big.push(...small);
    const out = []; split(big, 0, 0, 100, 100, out);
    tree.innerHTML = out.map(t=>{ const bg = t.w*t.h > 420, mid = t.w*t.h > 90 && t.w > 7;
      return '<div class="tt' + (t.sf ? ' sf' : '') + (t.other ? ' oth' : '') + '" ' + (t.other ? 'data-oth="' + esc(t.other.join('|')) + '"' : 'data-h="' + esc(t.id) + '"') + ' style="left:' + t.x + '%;top:' + t.y + '%;width:' + t.w + '%;height:' + t.h + '%" title="' + esc(t.nm) + ' ' + t.s.toFixed(1) + '%"><div style="background:' + t.col + (t.col > '#4' ? ';color:#0A1F17' : '') + '">' + (mid ? '<span>' + esc(t.id) + '</span>' : '') + (bg || t.other ? '<em class="num">' + t.s.toFixed(1) + '%</em>' : '') + '</div></div>'; }).join('');
    tree.setAttribute('role', 'img');
    tree.setAttribute('aria-label', 'Holdings by share: ' + a.slice(0, 6).map(x=> x.nm + ' ' + x.s.toFixed(1) + '%').join(', '));
    const ot = tree.querySelector('.oth');
    if(ot) ot.onclick = ()=>{ const ids = ot.dataset.oth.split('|'); if(!showAll && a.findIndex(x=> x.id === ids[0]) >= 6){ showAll = true; drawHold(client); }
      root().querySelectorAll('.x-hlist .hli').forEach(r=> r.classList.toggle('hl', ids.includes(r.dataset.h)));
      const r = Array.from(root().querySelectorAll('.x-hlist .hli')).find(x=> x.dataset.h === ids[0]); if(r) r.scrollIntoView({block:'nearest', behavior: RM() ? 'auto' : 'smooth'}); };
    const lim = showAll ? a.length : 6;
    list.innerHTML = a.slice(0, lim).map(x=> '<li><div class="hli" data-h="' + esc(x.id) + '" tabindex="0" title="' + esc(x.nm + (x.sub ? ', ' + x.sub : '') + ' · ' + x.s.toFixed(1) + '% of this view') + '"><span class="hn"><i style="background:' + x.col + '"></i><b>' + esc(x.nm) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span><span class="mv num">' + (100/x.s).toFixed(1) + '%</span></div></li>').join('');
    const mb = q('.hmore'); mb.hidden = a.length <= 6; mb.setAttribute('aria-expanded', showAll ? 'true' : 'false'); mb.innerHTML = (showAll ? 'Show top 6' : 'Show all ' + a.length) + CHEV; mb.onclick = ()=>{ showAll = !showAll; drawHold(client); };
    root().querySelectorAll('.x-holds [data-h]').forEach(el=>{
      el.addEventListener('mouseenter', ()=>{ hl = el.dataset.h; mark(); }); el.addEventListener('mouseleave', ()=>{ hl = null; mark(); });
      el.addEventListener('focus', ()=>{ hl = el.dataset.h; mark(); }); el.addEventListener('blur', ()=>{ hl = null; mark(); });
      el.addEventListener('click', ()=>{ pin = pin === el.dataset.h ? null : el.dataset.h; mark(); });
      el.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pin = pin === el.dataset.h ? null : el.dataset.h; mark(); } });
    });
    bindInfo(q('.hlh'));
    mark();
  }
  function mark(){ const on = hl || pin; root().querySelectorAll('.x-holds [data-h]').forEach(el=> el.classList.toggle('hl', el.dataset.h === on)); }

  /* ---------- dividend income ----------
     From the coach's dividend list (amount, yield, growth, frequency) and
     the yearly totals the coach logs. Received this year, the month dots
     and the next payment need dated payments, which Wealth OS does not hold
     yet (TODO(H2 #12)), so the strip shows the yearly and monthly figures
     and the bars (asked in the PR). */
  let divOpen = false, reinv = false, animNext = false, divArm = true;
  const PCOL = ['#E8D3A2', '#9FC7AE', '#9DBBE6', '#C6B7E0', '#8E9DB8', '#F0B38E'];
  function divModel(client){
    const hold = (client.dividendHoldings||[]).filter(h=> (Number(h.amount)||0)*(Number(h.yield)||0) > 0);
    const hist = [...(client.dividendHistory||[])].filter(y=> Number(y.amount) > 0).sort((a, b)=> a.year - b.year);
    if(!hold.length && !hist.length) return null;
    const y0 = new Date().getFullYear();
    const payers = hold.map((h, i)=> ({n:h.name, f:TEI.data.dividendFrequencyLabel(h.frequency), freq:h.frequency, col:PCOL[i % PCOL.length], amt:Number(h.amount)||0, yld:(Number(h.yield)||0)/100, g:(Number(h.growth)||0)/100}));
    const est = (p, k)=> p.amt*p.yld*Math.pow(1 + p.g, k);
    const reinvAt = (p, k)=>{ const m = TEI.data.dividendPeriodsPerYear(p.freq); return p.amt*Math.pow(1 + p.g, k)*Math.pow(1 + p.yld/m, m*k)*p.yld; };
    const start = hist.length ? Math.max(hist[0].year, y0 - 6) : y0;
    const YRS = []; for(let y=start; y<=y0+3; y++) YRS.push(y);
    // Logged payments (migration 021) count as received; the coach's yearly
    // totals cover years with no logged payments.
    const pays = (client.dividendPayments||[]).filter(p=> p.paidOn && p.amount > 0);
    const paidIn = y=> pays.filter(p=> new Date(p.paidOn).getFullYear() === y).reduce((s, p)=> s + p.amount, 0);
    const rec = YRS.map(y=>{ const logged = paidIn(y); if(y === y0) return logged; const h = hist.find(x=> x.year === y); return logged || (h ? Number(h.amount) : 0); });
    const mNow = new Date().getMonth() + 1;
    const paidMonths = new Set(pays.filter(p=> new Date(p.paidOn).getFullYear() === y0).map(p=> new Date(p.paidOn).getMonth() + 1));
    // The next expected payment: the soonest pay month still to come, this month included if nothing has arrived yet.
    let next = null;
    hold.forEach((h, i)=>{
      const months = (h.payMonths||[]).slice().sort((a, b)=> a - b); if(!months.length) return;
      const each = (Number(h.amount)||0)*(Number(h.yield)||0)/100/months.length;
      const due = months.map(m=> m > mNow || (m === mNow && !paidMonths.has(m)) ? m - mNow : m + 12 - mNow).sort((a, b)=> a - b)[0];
      if(next == null || due < next.in) next = {in:due, month:((mNow - 1 + due) % 12) + 1, name:h.name, amount:each, col:PCOL[i % PCOL.length]};
    });
    const hasSchedule = hold.some(h=> (h.payMonths||[]).length) || pays.length > 0;
    const byPayer = payers.map(p=> YRS.map(y=> y >= y0 ? est(p, y - y0) : 0));
    // This year: what has arrived counts as received, the rest of the estimate is still due.
    const recThisYear = (client.dividendPayments||[]).filter(p=> p.paidOn && new Date(p.paidOn).getFullYear() === y0).reduce((s, p)=> s + (p.amount||0), 0);
    if(recThisYear){ const tot0 = byPayer.reduce((s, a)=> s + a[YRS.indexOf(y0)], 0); const k = tot0 ? Math.max(0, tot0 - recThisYear)/tot0 : 0; byPayer.forEach(a=>{ a[YRS.indexOf(y0)] *= k; }); }
    const extra = YRS.map(y=> y > y0 ? Math.max(0, payers.reduce((s, p)=> s + reinvAt(p, y - y0) - est(p, y - y0), 0)) : 0);
    const yr = payers.reduce((s, p)=> s + est(p, 0), 0);
    const invested = payers.reduce((s, p)=> s + p.amt, 0);
    const growth = invested ? payers.reduce((s, p)=> s + p.g*p.amt, 0)/invested*100 : null;
    return {payers, YRS, NOWI: YRS.indexOf(y0), rec, byPayer, extra, next, paidMonths, mNow, hasSchedule, recNow: paidIn(y0), yr: yr || (hist.length ? hist[hist.length-1].amount : 0), invested, growth, y0,
      cash4: payers.reduce((s, p)=> s + est(p, 3), 0), reinv4: payers.reduce((s, p)=> s + reinvAt(p, 3), 0)};
  }
  function drawDiv(client){
    const slot = q('.x-divslot'), D = divModel(client);
    if(!D){ slot.innerHTML = ''; return; }
    const tot = i=> D.rec[i] + D.byPayer.reduce((s, a)=> s + a[i], 0);
    const mmx = Math.max(1, ...D.YRS.map((_, i)=> tot(i)));
    const mini = D.YRS.map((_, i)=>{ const r = D.rec[i], e = tot(i) - r;
      if(i === D.NOWI) return '<i class="now"><b class="due" style="height:' + (e/mmx*100) + '%"></b>' + (r ? '<b style="height:' + (r/mmx*100) + '%"></b>' : '') + '</i>';
      return '<i><b class="' + (e ? 'e' : '') + '" style="height:' + Math.max((r + e)/mmx*100, 3) + '%"></b></i>'; }).join('');
    let h = '<div class="divcard' + (divOpen ? ' open' : '') + ' x-divcard"><div class="dhead">' +
      '<span class="ttl"><span class="lbl">Dividend income</span></span>' +
      '<span class="v v1 hd num fig">' + fmt(D.yr) + '<small class="u">p/a</small></span>' +
      (D.hasSchedule ? '<span class="prog' + (divArm && !RM() ? ' arm' : '') + '"><span class="pb"><i style="width:' + Math.min(100, D.recNow/(D.yr||1)*100) + '%"></i></span><span class="fig num">' + fmt(D.recNow) + ' received</span></span>' : '') +
      '<span class="dv d1"></span><span class="dv d2"></span>' +
      '<span class="v v2 num fig">' + fmt(D.yr/12) + '<small class="u">p/m</small></span>' +
      (D.hasSchedule ? '<span class="x2"><span class="mdots" title="Months that have paid this year">' + V.MON.map((m, i)=> '<i class="' + (D.paidMonths.has(i + 1) ? 'on' : D.next && D.next.month === i + 1 ? 'nx' : '') + '" title="' + m + '"></i>').join('') + '</span></span>' : '') +
      (D.next ? '<span class="k k3">Next payment</span><span class="v v3 num fig">c. ' + fmt(D.next.amount) + '</span><span class="x3"><span class="chip"><i style="background:' + D.next.col + '"></i>' + V.MON[D.next.month - 1] + ' · ' + esc(D.next.name) + '</span></span>'
        : D.invested ? '<span class="k k3">Yield</span><span class="v v3 num">' + (D.yr/D.invested*100).toFixed(1) + '%</span>' : '') +
      '<span class="mini2' + (divArm && !RM() ? ' arm' : '') + '" aria-hidden="true">' + mini + '</span></div>' +
      (D.payers.length ? '<button type="button" class="dmore" aria-expanded="' + divOpen + '">' + (divOpen ? 'Hide details' : 'Show details') + CHEV + '</button>' : '');
    if(divOpen && D.payers.length){
      const Hh = PHONE() ? 124 : 186, mx = Math.max(1, ...D.YRS.map((_, i)=> tot(i) + (reinv ? D.extra[i] : 0)))*1.04;
      const yAt = D.y0 + 3;
      h += '<div class="dbody"><div class="dlead">' +
        '<div class="dl-card lead"><span class="k">By ' + yAt + ', if you reinvest' + INFO('Putting each payment back in buys more of what pays you, so the income grows on itself. Based on today\'s holdings and each payer\'s own growth.') + '</span><p class="big num fig">' + fmt(D.reinv4) + '<small>a year</small></p>' +
          '<div class="cmp num"><div><span>Reinvested</span><em><i style="width:100%;background:var(--gain)"></i></em><span class="fig">' + fmt(D.reinv4) + '</span></div>' +
          '<div><span>Taken as cash</span><em><i style="width:' + (D.cash4/(D.reinv4||1)*100) + '%;background:var(--champ)"></i></em><span class="fig">' + fmt(D.cash4) + '</span></div></div></div>' +
        (D.invested ? '<div class="dl-card"><span class="k">How it compares' + INFO('Yearly dividends divided by the value of the holdings that pay them. Easy-access savings shown for context only. Dividends can be cut or paused; savings interest is not at risk in the same way.') + '</span><p class="big num">' + (D.yr/D.invested*100).toFixed(1) + '%</p>' +
          '<div class="cmp num"><div><span>Dividend yield</span><em><i style="width:' + Math.min(100, D.yr/D.invested*100/12*100) + '%;background:var(--champ)"></i></em><span>' + (D.yr/D.invested*100).toFixed(1) + '%</span></div>' +
          '<div><span>Easy-access saving</span><em><i style="width:33%;background:var(--soft)"></i></em><span>4%</span></div></div>' +
          '<p>On <span class="fig">' + fmt(D.invested) + '</span> that pays. Dividends can be cut.</p></div>' : '') +
        (D.growth != null ? '<div class="dl-card"><span class="k">Dividend increases' + INFO('How much your payers raise what they pay each year, as your coach has recorded it. This is separate from income you add by buying more.') + '</span><p class="big num">' + (D.growth >= 0 ? '+' : '') + D.growth.toFixed(1) + '% a year</p><p>Per payer, as recorded.</p></div>' : '') +
        '</div>';
      h += '<div class="dchart-top"><div class="dkey">' + D.payers.map(p=> '<span><i style="background:' + p.col + '"></i>' + esc(p.n) + '</span>').join('') +
        '<span class="sep kx"></span><span class="kx"><i style="background:var(--soft)"></i>Received</span><span class="kx"><i style="border:1.3px dashed var(--soft)"></i>Estimate</span>' + (reinv ? '<span><i style="background:rgba(159,208,168,.7)"></i>Extra if reinvested</span>' : '') + '</div>' +
        '<button type="button" class="sw x-reinv" aria-pressed="' + reinv + '"><i></i>Show if reinvested</button></div>';
      h += '<div class="bars2 x-bars2">' + D.YRS.map((y, i)=>{
        const r = D.rec[i], x = reinv ? D.extra[i] : 0, t = tot(i) + x; let segs = '';
        if(x) segs += '<div class="x" style="height:' + (x/mx*Hh) + 'px"></div>';
        D.payers.slice().reverse().forEach((p, j)=>{ const e = D.byPayer[D.payers.length - 1 - j][i]; if(e) segs += '<div class="e" style="height:' + (e/mx*Hh) + 'px;background:repeating-linear-gradient(135deg,' + p.col + '88 0 3px,' + p.col + '22 3px 7px)"></div>'; });
        if(r) segs += '<div class="r" style="height:' + (r/mx*Hh) + 'px;background:linear-gradient(to top,#E8D3A2aa,#E8D3A2)"></div>';
        return '<div class="b2' + (i === D.NOWI ? ' now' : '') + '" data-i="' + i + '"><span class="val num fig" style="bottom:' + (t/mx*Hh) + 'px">' + fmt(t) + '</span><div class="stk" style="animation-delay:' + (i*40) + 'ms">' + segs + '</div></div>';
      }).join('') + '<div class="btip x-btip"></div></div>';
      h += '<div class="yrs num">' + D.YRS.map((y, i)=> '<span' + (i === D.NOWI ? ' class="now"' : '') + '>' + y + '</span>').join('') + '</div>';
      h += '<p class="dnote"><span class="kxp">Solid bars are received, hatched are estimates. </span>Received is what your coach has logged for each year. Estimates assume today\'s holdings and each payer raising its payout at its own rate. Illustrative, not a guarantee.</p>';
      h += '<div class="payers"><h3>Your payers</h3>' + D.payers.map(p=>{ const v = p.amt*p.yld; return '<div class="prow num"><span class="pn"><i style="background:' + p.col + '"></i>' + esc(p.n) + '</span><span class="bar2"><i style="width:' + (v/(D.yr||1)*100) + '%;background:' + p.col + '"></i></span><span class="c f" style="color:var(--soft)">' + esc(p.f) + '</span><span class="c fig">' + fmt(v) + '</span></div>'; }).join('') + '</div>';
      h += '</div>';
    }
    h += '</div>';
    slot.innerHTML = h;
    if(divArm && !RM()){ const m = slot.querySelector('.mini2'), pg = slot.querySelector('.prog');
      if(pg) onView(m, ()=> requestAnimationFrame(()=> pg.classList.remove('arm')), .5);
      m.querySelectorAll('i').forEach((col, i)=> col.querySelectorAll('b').forEach(b=> b.style.transitionDelay = (i*60) + 'ms'));
      onView(m, ()=> requestAnimationFrame(()=>{ m.classList.remove('arm'); m.classList.add('go'); }), .5); }
    divArm = false;
    const bz = slot.querySelector('.x-bars2'); if(bz && animNext) onView(bz, ()=> bz.classList.add('anim'), .3);
    animNext = false;
    const dm = slot.querySelector('.dmore'); if(dm) dm.onclick = ()=>{ divOpen = !divOpen; animNext = divOpen && !RM(); drawDiv(client); };
    const rb = slot.querySelector('.x-reinv'); if(rb) rb.onclick = ()=>{ reinv = !reinv; drawDiv(client); };
    bindInfo(slot);
    const tipEl = slot.querySelector('.x-btip');
    slot.querySelectorAll('.b2').forEach(b=>{
      b.addEventListener('mouseenter', ()=>{ const i = +b.dataset.i, box = bz.getBoundingClientRect(), r = b.getBoundingClientRect();
        const rows = (D.rec[i] ? '<div><span><i style="background:#E8D3A2"></i>Received</span><span class="fig num">' + fmt(D.rec[i]) + '</span></div>' : '') +
          D.payers.map((p, j)=> D.byPayer[j][i] ? '<div><span><i style="background:' + p.col + '"></i>' + esc(p.n) + '</span><span class="fig num">' + fmt(D.byPayer[j][i]) + '</span></div>' : '').join('') +
          (reinv && D.extra[i] ? '<div><span><i style="background:rgba(159,208,168,.7)"></i>Reinvested</span><span class="fig num">' + fmt(D.extra[i]) + '</span></div>' : '');
        tipEl.innerHTML = '<b>' + D.YRS[i] + (i === D.NOWI ? ' · this year' : i > D.NOWI ? ' · estimate' : '') + '</b>' + rows;
        tipEl.style.display = 'block'; tipEl.style.left = Math.min(Math.max(r.left - box.left + r.width/2, 80), box.width - 80) + 'px'; tipEl.style.top = '18px'; });
      b.addEventListener('mouseleave', ()=>{ tipEl.style.display = 'none'; });
    });
  }

  /* ---------- review: coach's note + health ---------- */
  let wellOpen = false, rvArm = true;
  const STW = {att:'Priority', eye:'Worth watching', ok:'On track'};
  const RANK = {att:0, eye:1, ok:2};
  const PT_NAME = {'no-holdings':'Holdings', 'holdings-no-value':'Holdings', 'concentration-high':'Concentration', 'top5-concentration':'Concentration',
    'strong-saving-high-concentration':'Concentration', 'sector-concentration':'Sectors', 'top-sector-exposure':'Sectors', 'portfolio-spread-ok':'Spread',
    'portfolio-monthly-contribution':'Money paid in', 'pension-no-contribution':'Pension', 'pension-contributing-well':'Pension', 'no-pension-employed':'Pension'};
  const TIER = {critical:'att', warning:'eye', neutral:'eye', positive:'ok'};
  function items(client){
    const out = [];
    const all = hItems(client).a, tot = all.reduce((s, x)=> s + x.v, 0), top = all.filter(x=> x.id !== 'Cash')[0];
    const sn = TEI.calc.safetyNet(client);
    if(sn.months != null){
      const s = sn.months >= sn.fullMonths ? 'ok' : sn.months < 3 ? 'att' : 'eye';
      out.push({id:'safety', n:'Safety net', rv:sn.months.toFixed(1).replace(/\.0$/, ''), ru:'of ' + sn.fullMonths + ' months', s, l: s === 'ok' ? 'Complete.' : 'Building towards ' + sn.fullMonths + ' months of spending.', go:'cashflow', gl:'Cashflow', viz:{t:'ticks', n:sn.fullMonths, v:sn.months}, vc:'var(--gs-cash)'});
    }
    if(top && tot > 0){
      const p = top.v/tot*100;
      out.push({id:'conc', n:'Concentration', rv:p.toFixed(1) + '%', ru:'in ' + top.nm, s: p >= 20 ? 'eye' : 'ok', l: top.nm + ' is your largest share of actively managed money.', go:'holds', gl:'What it holds', viz:{t:'ticks', n:4, v:p/25}, vc:'var(--gs-inv)'});
    }
    if(sn.monthlySpend && tot > 0){
      const cash = (client.accounts||[]).filter(a=> CASH_TYPES.includes(a.type)).reduce((s, a)=> s + (Number(latest(client)[a.id])||0), 0);
      const spare = Math.max(0, cash - sn.fullMonths*sn.monthlySpend);
      out.push({id:'drag', n:'Cash drag', rv: spare > 0 ? fmt(spare) : 'None', ru: spare > 0 ? 'above your net' : '', s: spare > 0 && spare/(tot + cash) >= .1 ? 'eye' : 'ok', l: spare > 0 ? fmt(spare) + ' of cash sits above your ' + sn.fullMonths + '-month safety net.' : 'No cash sits above your safety net.'});
    }
    const nh = all.filter(x=> x.id !== 'Cash').length;
    if(nh) out.push({id:'spread', n:'Spread', rv:String(nh), ru: nh === 1 ? 'holding' : 'holdings', s: nh <= 2 ? 'eye' : 'ok', l:'Across ' + new Set((client.accounts||[]).filter(a=> !CASH_TYPES.includes(a.type)).map(a=> a.id)).size + ' accounts.'});
    const ds = V.debts(client);
    if(ds.length){
      const costly = ds.filter(d=> d.apr >= .1), soon = ds.find(d=> d.promoM != null && d.promoM <= 12);
      out.push({id:'debt', n:'Debts', rv: costly.length ? costly.length + ' costly' : ds.length === 1 ? ds[0].name : ds.length + ' debts', ru: costly.length ? '' : ds.length === 1 ? 'only' : '',
        s: costly.length ? 'att' : soon ? 'eye' : 'ok',
        l: costly.length ? costly.map(d=> d.name + ' at ' + (d.apr*100).toFixed(1) + '%').join(', ') + '. Details live in Cashflow.' : soon ? 'The 0% on the ' + soon.name.toLowerCase() + ' ends in ' + V.addM(soon.promoM) + '. Details live in Cashflow.' : 'Nothing costly. Details live in Cashflow.',
        go:'cashflow', gl:'Cashflow'});
    }
    const seen = new Set(out.map(x=> x.n));
    TEI.calc.pickSignals(client, 'portfolio', 4).forEach(sg=>{
      const nm = PT_NAME[sg.id] || 'Your portfolio';
      const s = TIER[sg.tier] || 'eye';
      const same = out.find(x=> x.n === nm);
      if(same){ same.l = sg.message; return; }
      if(seen.has(nm + sg.message)) return;
      seen.add(nm + sg.message);
      out.push({id:'pt-' + sg.id, n:nm, s, l:sg.message});
    });
    return out.sort((a, b)=> RANK[a.s] - RANK[b.s]);
  }
  function viz(x){
    if(!x.viz) return '';
    const z = x.viz, arm = rvArm && !RM();
    const w = Math.min(z.v/z.n*100, 100);
    return '<span class="inst" aria-hidden="true"><span class="tr"></span><span class="tk">' + Array.from({length:z.n + 1}, ()=> '<i></i>').join('') + '</span><span class="fl" data-w="' + w + '" style="width:' + (arm ? 0 : w) + '%"></span></span>';
  }
  function rvRow(x, i, lead){
    return (x.go ? '<button type="button"' : '<div') + ' class="bf' + (lead ? ' lead' : '') + ' s-' + x.s + (x.go ? ' link' : '') + '"' + (x.vc ? ' style="--vc:' + x.vc + '"' : '') + (x.go ? ' data-go="' + x.go + '" aria-label="' + esc(x.n + ', go to ' + x.gl) + '"' : '') + '>' +
      (i != null ? '<span class="bn"><i title="' + STW[x.s] + '" aria-label="' + STW[x.s] + '"></i>' + (i + 1) + '</span>' : '<span class="bn ok"><i title="On track" aria-label="On track"></i></span>') +
      '<span class="bt"><b>' + esc(x.n) + '</b><span>' + esc(x.l) + '</span></span>' +
      '<span class="br"><span class="rd num"><span class="fig">' + esc(x.rv || '') + '</span>' + (x.ru ? '<small>' + esc(x.ru) + '</small>' : '') + '</span>' + viz(x) + '</span>' +
      (x.go ? CHEV + '</button>' : '<i></i></div>');
  }
  function drawReview(client){
    const all = items(client), look = all.filter(x=> x.s !== 'ok'), well = all.filter(x=> x.s === 'ok');
    const n = V.note(client, 'wealth'), next = V.nextSession(client);
    const segs = '<span class="segbar" aria-hidden="true">' + all.map(x=> '<i class="g-' + x.s + '"></i>').join('') + '</span>';
    const att = look.filter(x=> x.s === 'att').length;
    const sum = '<div class="sumline' + (n ? ' beside' : ' lead') + '">' + segs + '<span class="sumtxt"><span class="s1"><b class="num">' + look.length + '</b> talking point' + (look.length === 1 ? '' : 's') + (att ? ', ' + att + ' priority' : '') + '</span><span class="sdot d1">·</span><span class="s2"><b class="num">' + well.length + '</b> on track</span>' + (next ? '<span class="sdot d2">·</span><span class="s3">Next session ' + V.sessionWhen(next) + '</span>' : '') + '</span></div>';
    let h = '';
    if(n) h += '<div class="rvtop"><figure class="letter f-newsreader"><span class="qm" aria-hidden="true">“</span><blockquote>' + esc(n.text) + '”<span class="sig"><span class="rule"></span>' + V.coachName() + (n.dateTxt ? ' · ' + n.dateTxt : '') + '</span></blockquote></figure>' + sum + '</div>';
    else h += sum + '<p class="nonote">Your coach will add a note after your next session.</p>';
    h += '<div class="brief">' + look.map((x, i)=> rvRow(x, i, i === 0)).join('') + '</div>';
    if(well.length) h += '<div class="brief well"><button type="button" class="wellbtn" aria-expanded="' + wellOpen + '">On track<span class="cnt num">' + well.length + '</span>' + CHEV + '</button>' + (wellOpen ? well.map(x=> rvRow(x, null, false)).join('') : '') + '</div>';
    const slot = q('.x-rvslot');
    slot.innerHTML = h;
    if(rvArm && !RM()){
      const els = [...slot.querySelectorAll('[data-w]')], fill = el=>{ el.style.width = el.dataset.w + '%'; };
      if('IntersectionObserver' in window){ const io = new IntersectionObserver(es=> es.forEach(e=>{ if(e.isIntersecting){ fill(e.target); io.unobserve(e.target); } }), {threshold:.6}); els.forEach(el=> io.observe(el)); } else els.forEach(fill);
    }
    rvArm = false;
    const wb = slot.querySelector('.wellbtn'); if(wb) wb.onclick = ()=>{ wellOpen = !wellOpen; drawReview(client); };
    slot.querySelectorAll('[data-go]').forEach(x=> x.onclick = ()=> go(client, x.dataset.go));
  }
  function scrollTo(el){ if(el) el.scrollIntoView({behavior: RM() ? 'auto' : 'smooth', block:'start'}); }
  function go(client, t){
    const [k, a] = t.split(':');
    if(k === 'accounts'){ jump(client, a); return; }
    if(k === 'holds'){ scrollTo(q('.x-holds')); return; }
    if(k === 'div'){ if(!divOpen){ divOpen = true; drawDiv(client); } scrollTo(q('.x-divcard')); return; }
    if(k === 'cashflow'){ TEI.app.showPage('cashflow', 'debts'); }
  }

  /* ---------------- Update balances panel (with debts) ----------------
     One row per account, or per holding where an account has holdings,
     then the debts (brief 3.5): balance, rate, monthly payment, term or
     end date, and when a fix or a 0% period ends with the rate after.
     Each figure saves when the box is left. */
  let updDirty = false, lastFocus = null;
  function rowHtml(attr, id, label, value, hint){
    if(value !== '' && value != null) value = Math.round(Number(value)*100)/100;
    return `<label class="wl-upd-row"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>`
      + `<input type="number" inputmode="decimal" step="0.01" ${attr}="${esc(id)}" value="${value===''||value==null ? '' : Number(value)}" data-orig="${value===''||value==null ? '' : Number(value)}">`
      + `<em class="wl-upd-state" aria-live="polite"></em></label>`;
  }
  const DEBT_TYPES = [['mortgage', 'Mortgage'], ['loan', 'Loan or car finance'], ['credit', 'Credit card'], ['other', 'Other debt']];
  function debtForm(l){
    const v = x=> x == null ? '' : esc(x);
    const f = (k, label, type, val, extra)=> `<label class="wl-dbt-f"><span>${label}</span><input data-dk="${k}" type="${type}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} value="${v(val)}" ${extra||''}></label>`;
    return `<div class="wl-dbt" data-debt="${esc(l.id || 'new')}">`
      + `<div class="wl-dbt-grid">`
      + f('name', 'Name', 'text', l.name, 'maxlength="40" placeholder="Mortgage"')
      + `<label class="wl-dbt-f"><span>Type</span><select data-dk="type">${DEBT_TYPES.map(t=> `<option value="${t[0]}"${(l.type||'loan') === t[0] ? ' selected' : ''}>${t[1]}</option>`).join('')}</select></label>`
      + f('balance', 'Balance (£)', 'number', l.balance)
      + f('apr', 'Rate (% a year)', 'number', l.apr)
      + f('minPay', 'Monthly payment (£)', 'number', l.minPay)
      + f('termMonths', 'Months left', 'number', l.termMonths, 'placeholder="or an end date"')
      + f('endDate', 'Ends', 'date', l.endDate)
      + `<label class="wl-dbt-f"><span>Rate</span><select data-dk="rateType"><option value="">Not set</option><option value="fixed"${l.rateType === 'fixed' ? ' selected' : ''}>Fixed</option><option value="variable"${l.rateType === 'variable' ? ' selected' : ''}>Variable</option><option value="promo"${l.rateType === 'promo' ? ' selected' : ''}>0% offer</option></select></label>`
      + f('changeDate', 'Fix or 0% ends', 'date', l.changeDate)
      + f('newApr', 'Rate after that (%)', 'number', l.newApr)
      + `</div><div class="wl-dbt-acts"><em class="wl-upd-state" aria-live="polite"></em>${l.id ? '<button type="button" class="wl-dbt-del">Remove</button>' : '<button type="button" class="hm-btn wl-dbt-save">Add this debt</button>'}</div></div>`;
  }
  function buildUpdateList(client){
    const key = currentMonthKey();
    const [y, m] = key.split('-').map(Number);
    setText('wlUpdMonth', new Date(y, m-1, 1).toLocaleDateString('en-GB', {month:'long', year:'numeric'}));
    const b = latest(client);
    const cur = (client.months||{})[key] || {};
    const accounts = client.accounts || [];
    const list = $('wlUpdList');
    list.innerHTML = (!accounts.length ? '<p class="hm-muted">No accounts yet. Add them in Settings, under Accounts.</p>'
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
      }).join(''))
      + `<div class="wl-upd-debts" id="wlUpdDebts"><p class="wl-upd-acct"><span>Debts</span><b>${fmtGBP(V.debts(client).reduce((s, d)=> s + d.bal, 0))}</b></p>`
      + `<p class="hm-note">Your mortgage, loans and cards. Cashflow uses these to show what each one costs and when it clears.</p>`
      + ((client.wealth||{}).liabilities||[]).map(debtForm).join('')
      + `<button type="button" class="wl-dbt-addbtn" id="wlDbtAdd">Add a debt</button></div>`
      + divSection(client);
    setText('wlUpdPrices', TEI.calc.usPricesAsOfText(client));
    showRefresh(client);
    list.querySelectorAll('input[data-upd-account], input[data-upd-holding]').forEach(input=> input.addEventListener('change', ()=> saveRow(client, key, input)));
    list.querySelectorAll('.wl-dbt[data-debt]:not([data-debt="new"]) [data-dk]').forEach(el=> el.addEventListener('change', ()=> saveDebt(client, el.closest('.wl-dbt'))));
    list.querySelectorAll('.wl-dbt[data-debt] .wl-dbt-del').forEach(b=> b.addEventListener('click', ()=> removeDebt(client, b.closest('.wl-dbt'))));
    wireDivSection(client, list);
    $('wlDbtAdd').addEventListener('click', ()=>{
      if(list.querySelector('.wl-dbt[data-debt="new"]')) return;
      $('wlDbtAdd').insertAdjacentHTML('beforebegin', debtForm({}));
      const box = list.querySelector('.wl-dbt[data-debt="new"]');
      box.querySelector('.wl-dbt-save').addEventListener('click', ()=> saveDebt(client, box));
      box.querySelector('input').focus();
    });
  }
  /* Dividends in Update balances (migration 021): the months each payer
     usually pays, and the payments that arrived. Shown when the coach has
     set up dividend payers. */
  function divSection(client){
    const hold = client.dividendHoldings || [];
    if(!hold.length) return '';
    const y0 = new Date().getFullYear();
    const pays = (client.dividendPayments||[]).filter(p=> p.paidOn && new Date(p.paidOn).getFullYear() === y0).sort((a, b)=> a.paidOn < b.paidOn ? 1 : -1);
    const nameOf = id=> (hold.find(h=> h.id === id) || {}).name || 'Dividend';
    const today = new Date().toISOString().slice(0, 10);
    return `<div class="wl-upd-debts wl-upd-divs" id="wlUpdDivs"><p class="wl-upd-acct"><span>Dividends</span><b>${fmtGBP(pays.reduce((s, p)=> s + p.amount, 0))} this year</b></p>`
      + `<p class="hm-note">Which months each one usually pays, and each payment as it arrives.</p>`
      + hold.map(h=> `<div class="wl-dbt" data-divh="${esc(h.id)}"><p class="wl-div-n">${esc(h.name)}</p><div class="wl-months" role="group" aria-label="${esc(h.name)} usually pays in">`
        + V.MON.map((m, i)=> `<button type="button" data-m="${i + 1}" aria-pressed="${(h.payMonths||[]).includes(i + 1)}">${m}</button>`).join('') + `</div><em class="wl-upd-state" aria-live="polite"></em></div>`).join('')
      + `<div class="wl-dbt wl-pay"><div class="wl-dbt-grid">`
      + `<label class="wl-dbt-f"><span>Payer</span><select data-pk="holding">${hold.map(h=> `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('')}</select></label>`
      + `<label class="wl-dbt-f"><span>Paid on</span><input data-pk="date" type="date" value="${today}" max="${today}"></label>`
      + `<label class="wl-dbt-f"><span>Amount (£)</span><input data-pk="amount" type="number" inputmode="decimal" step="0.01" min="0"></label>`
      + `</div><div class="wl-dbt-acts"><em class="wl-upd-state" aria-live="polite"></em><button type="button" class="hm-btn wl-pay-add">Log this payment</button></div></div>`
      + (pays.length ? `<ul class="wl-pays">` + pays.map(p=> `<li data-pay="${esc(p.id)}"><span>${esc(nameOf(p.holdingId))}<small>${new Date(p.paidOn).toLocaleDateString('en-GB', {day:'numeric', month:'short'})}</small></span><b>${fmtGBP(p.amount)}</b><button type="button" class="wl-dbt-del">Remove</button></li>`).join('') + `</ul>` : '')
      + `</div>`;
  }
  function wireDivSection(client, list){
    list.querySelectorAll('[data-divh] .wl-months button').forEach(b=> b.addEventListener('click', async ()=>{
      const box = b.closest('[data-divh]'), h = (client.dividendHoldings||[]).find(x=> x.id === box.dataset.divh), state = box.querySelector('.wl-upd-state');
      if(!h) return;
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      const months = Array.from(box.querySelectorAll('.wl-months button[aria-pressed="true"]')).map(x=> Number(x.dataset.m));
      state.textContent = 'Saving'; state.className = 'wl-upd-state';
      try{ await TEI.wealthOS.saveDividendPayMonths(h.id, months); h.payMonths = months; state.textContent = 'Saved'; state.className = 'wl-upd-state ok'; updDirty = true; }
      catch(err){ console.error('Wealth OS: pay months not saved', err); state.textContent = 'Not saved'; state.className = 'wl-upd-state bad'; }
    }));
    const add = list.querySelector('.wl-pay-add');
    if(add) add.addEventListener('click', async ()=>{
      const box = add.closest('.wl-pay'), state = box.querySelector('.wl-upd-state');
      const v = k=> box.querySelector('[data-pk="' + k + '"]').value;
      const amount = parseFloat(v('amount')), date = v('date');
      if(!(amount > 0) || !date){ state.textContent = 'Add the date and amount'; state.className = 'wl-upd-state bad'; return; }
      add.disabled = true; state.textContent = 'Saving'; state.className = 'wl-upd-state';
      try{
        const p = await TEI.wealthOS.saveDividendPayment(client.meta.clientId, {holdingId: v('holding'), paidOn: date, amount}, client.meta.role);
        client.dividendPayments = [p].concat(client.dividendPayments||[]);
        updDirty = true; buildUpdateList(client); const d = $('wlUpdDivs'); if(d) d.scrollIntoView({block:'nearest'});
      } catch(err){ console.error('Wealth OS: payment not saved', err); state.textContent = 'Not saved'; state.className = 'wl-upd-state bad'; add.disabled = false; }
    });
    list.querySelectorAll('[data-pay] .wl-dbt-del').forEach(b=> b.addEventListener('click', async ()=>{
      const id = b.closest('[data-pay]').dataset.pay;
      try{ await TEI.wealthOS.deleteDividendPayment(id); client.dividendPayments = (client.dividendPayments||[]).filter(p=> p.id !== id); updDirty = true; buildUpdateList(client); }
      catch(err){ console.error('Wealth OS: payment not removed', err); TEI.app.showToast('That did not save. Please try again.'); }
    }));
  }
  function readDebt(box){
    const o = {};
    box.querySelectorAll('[data-dk]').forEach(el=>{ const k = el.dataset.dk, v = el.value.trim(); o[k] = el.type === 'number' ? (v === '' ? null : Number(v)) : (v || null); });
    return o;
  }
  async function saveDebt(client, box){
    const state = box.querySelector('.wl-upd-state');
    const o = readDebt(box);
    if(!(o.balance >= 0) || o.balance == null){ state.textContent = 'Add the balance'; state.className = 'wl-upd-state bad'; return; }
    const id = box.dataset.debt === 'new' ? null : box.dataset.debt;
    const list = client.wealth.liabilities = client.wealth.liabilities || [];
    const existing = id ? list.find(l=> l.id === id) : null;
    const local = Object.assign({}, existing || {type:'loan'}, o, {type: o.type || (existing && existing.type) || 'loan'});
    state.textContent = 'Saving'; state.className = 'wl-upd-state';
    try{
      const newId = await TEI.wealthOS.saveWealthLiability(client.meta.clientId, id, local);
      if(existing) Object.assign(existing, local); else list.push(Object.assign(local, {id:newId}));
      updDirty = true;
      if(!id){ buildUpdateList(client); const d = $('wlUpdDebts'); if(d) d.scrollIntoView({block:'nearest'}); }
      else { state.textContent = 'Saved'; state.className = 'wl-upd-state ok'; }
    } catch(err){
      console.error('Wealth OS: debt not saved', err);
      state.textContent = 'Not saved'; state.className = 'wl-upd-state bad';
      TEI.app.showToast('That did not save. Please try again.');
    }
  }
  async function removeDebt(client, box){
    const id = box.dataset.debt;
    try{
      await TEI.wealthOS.deleteWealthLiability(id);
      client.wealth.liabilities = (client.wealth.liabilities||[]).filter(l=> l.id !== id);
      updDirty = true; buildUpdateList(client);
    } catch(err){
      console.error('Wealth OS: debt not removed', err);
      TEI.app.showToast('That did not save. Please try again.');
    }
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
  function openUpdate(focus){
    const client = TEI.app.state.client;
    if(!client) return;
    buildUpdateList(client);
    lastFocus = document.activeElement;
    $('wlUpdScrim').hidden = false;
    const panel = $('wlUpdPanel');
    panel.hidden = false;
    if(focus === 'debts'){ const d = $('wlUpdDebts'); if(d){ d.scrollIntoView({block:'start'}); $('wlDbtAdd').focus(); return; } }
    const first = panel.querySelector('input, button'); if(first) first.focus();
  }
  function closeUpdate(){
    const panel = $('wlUpdPanel');
    if(!panel || panel.hidden) return;
    panel.hidden = true;
    $('wlUpdScrim').hidden = true;
    if(updDirty){ updDirty = false; TEI.app.rerenderCurrentPage(); }
    const back = $('wlUpdateBtn');
    if(lastFocus && document.body.contains(lastFocus) && lastFocus.offsetParent) lastFocus.focus(); else if(back) back.focus();
  }
  /* Ad hoc price refresh (unchanged): the coach's TEI.adviser.refreshLivePrices,
     skipping holdings priced in the last hour. Shown only when it could price something. */
  function canRefreshPrices(client){
    return (client.holdings||[]).some(h=> h.priceSource === 'auto_us' && h.ticker && h.units != null
      && ((client.accounts||[]).find(a=> a.id === h.accountId) || {}).type !== 'crypto');
  }
  function showRefresh(client){
    const on = !!(TEI.adviser && TEI.adviser.refreshLivePrices) && canRefreshPrices(client);
    ['whRefreshPricesBtn', 'wlUpdRefreshBtn'].forEach(id=>{ const b = $(id); if(b) b.hidden = !on; });
  }
  async function refreshPrices(btn, statusId){
    const client = TEI.app.state.client;
    if(!client || !TEI.adviser || !TEI.adviser.refreshLivePrices) return;
    btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin');
    const status = $(statusId);
    await TEI.adviser.refreshLivePrices({btn, status, skipRecent:true});
    if(!$('wlUpdPanel').hidden){ const msg = status.textContent; buildUpdateList(client); status.textContent = msg; }
    else { drawAsOf(client); TEI.app.showToast(status.textContent || 'Prices updated'); }
  }
  let wired = false;
  function wireOnce(){
    if(wired) return;
    wired = true;
    wireHero();
    const heroBtn = $('whRefreshPricesBtn'), panelBtn = $('wlUpdRefreshBtn');
    heroBtn.addEventListener('click', ()=> refreshPrices(heroBtn, 'whPricesStatus'));
    panelBtn.addEventListener('click', ()=> refreshPrices(panelBtn, 'wlUpdPrices'));
    $('wlUpdateBtn').addEventListener('click', ()=> openUpdate());
    $('wlUpdClose').addEventListener('click', closeUpdate);
    $('wlUpdScrim').addEventListener('click', closeUpdate);
    $('wlUpdMore').addEventListener('click', e=>{ e.preventDefault(); closeUpdate(); TEI.settings.fold('deposits'); TEI.settings.fold('months'); TEI.settings.open('accounts'); });
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeUpdate(); });
    q('.wtog').addEventListener('click', ()=> setWhere(!q('.where').classList.contains('open')));
    document.addEventListener('click', e=>{
      const lab = e.target.closest('[data-wl-lab]'), back = e.target.closest('[data-wl-back]');
      if(lab){ e.preventDefault(); TEI.app.showPage('lab'); }
      else if(back){ e.preventDefault(); TEI.app.showPage('progress'); }
    });
    $('wlUpdPanel').addEventListener('keydown', e=>{
      if(e.key !== 'Tab') return;
      const f = Array.from(e.currentTarget.querySelectorAll('input, button, select, a[href]')).filter(el=> !el.disabled && el.offsetParent);
      if(!f.length) return;
      if(e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length-1].focus(); }
      else if(!e.shiftKey && document.activeElement === f[f.length-1]){ e.preventDefault(); f[0].focus(); }
    });
    let wasPhone = PHONE();
    if(window.matchMedia) matchMedia('(max-width:860px)').addEventListener('change', ()=>{ if(PHONE() !== wasPhone){ wasPhone = PHONE(); const c = TEI.app.state.client; if(c && TEI.app.state.currentPage === 'progress'){ drawAccounts(c); drawDiv(c); } } });
  }

  TEI.render.progress = function(client){
    wireOnce();
    V.syncEye();
    // The Portfolio Lab shares the price and discrepancy notes (B5.4).
    if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
    showRefresh(client);
    drawAsOf(client);
    drawHero(client);
    drawMix(client);
    drawAccounts(client);
    drawHold(client);
    drawDiv(client);
    drawReview(client);
    intro = false;
  };
  TEI.render.lab = function(client){
    if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
  };
  TEI.wealthPage = { openUpdate, closeUpdate };
})();
