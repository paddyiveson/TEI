window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

(function(){
  /* ================================================================
     CASHFLOW v3.3 (TEI Launch v2, brief 3.3), the live tile finish.
     Rows: hero (wealth conversion rate) + Safety net / Scenario corner +
     Your habits / Debts + Coach's corner / Spending categories (coming
     soon). Update this month is a drop-down on desktop and a bottom sheet
     on phones; it saves as you type. Phone fold (D44): Scenario corner,
     Your habits and Debts fold to eyebrow, heading, one peek line and a
     chevron. Figures: TEI.calc.cashflowMonth and TEI.calc.safetyNet (the
     same as Home), Forecast's model for the scenario, and the debts from
     Update balances (migration 019).
     ================================================================ */
  const V = TEI.v2;
  const {esc, fmt, fk, INFO, TICK, ARR, PHONE, bindInfo} = V;
  const {currentMonthKey} = TEI.data;
  const MON = V.MON, MON_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const $ = id=> document.getElementById(id);
  const root = ()=> document.querySelector('.wo2-cf');
  const q = s=> root().querySelector(s);
  const HORIZON = 120;
  const DCOL = ['var(--d1)', 'var(--d2)', 'var(--d3)'];
  const keyParts = key=>{ const [y, m] = key.split('-').map(Number); return {y, m}; };
  const monLong = key=> MON_LONG[keyParts(key).m - 1] + ' ' + keyParts(key).y;
  function target(client){ const t = Number((client.preferences||{}).wealthConversionTarget); return t > 0 ? t : 20; }

  /* Home's health chip (thresholds decided 13 Oct 2026): unchanged. */
  function health(client, m){
    const rate = m.takeHome > 0 ? m.wealthBuilding/m.takeHome*100 : 0;
    const t = target(client);
    if(m.essentials + m.lifestyle > m.takeHome && m.takeHome >= 0 && (m.essentials + m.lifestyle) > 0) return {key:'over', label:'Overspending'};
    if(rate >= t) return {key:'ok', label:'Healthy'};
    if(rate >= t - 5) return {key:'steady', label:'Steady'};
    return {key:'attn', label:'Needs attention'};
  }
  const CHIP = {over:'att', ok:'ok', steady:'steady', attn:'att'};

  /* The last twelve months, this month last: [take-home, essentials, lifestyle, wealth building]. */
  function hist(client){
    const out = [], n = new Date();
    for(let b=11; b>=0; b--){
      const d = new Date(n.getFullYear(), n.getMonth() - b, 1), key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const logged = (client.cashflowMonths||{})[key];
      if(!logged && b > 0) continue;
      const m = TEI.calc.cashflowMonth(client, key);
      out.push({key, v:[m.takeHome, m.essentials, m.lifestyle, m.wealthBuilding]});
    }
    return out;
  }
  const conv = h=> h[0] > 0 ? h[3]/h[0]*100 : 0;

  let mode = 'month', move = 150, open = null, over = {}, intro = true;
  const FOLD = new Set();
  const CHV = '<svg class="fchev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
  const FH = (id, eb, hd, pk)=> '<button type="button" class="fhead" data-f="' + id + '" aria-expanded="' + FOLD.has(id) + '"><span class="eb">' + eb + '</span><span class="hd">' + hd + '</span>' + (pk ? '<span class="peek">' + pk + '</span>' : '') + CHV + '</button>';
  function countUp(el, to, f, dur){ if(!intro){ el.textContent = f(to); return; } V.countUp(el, to, f, dur); }

  /* ---------- hero ---------- */
  function drawHero(client, H, m){
    const t = target(client), h = health(client, {takeHome:m[0], essentials:m[1], lifestyle:m[2], wealthBuilding:m[3]});
    const c = m[0] > 0 ? m[3]/m[0]*100 : 0, d = c - t, body = q('.x-hbody');
    const pts = Math.abs(Math.round(d));
    const gapTxt = h.key === 'over' ? 'Spending is more than you took home' : pts === 0 ? 'Right on your ' + t + '% target' : pts + ' point' + (pts > 1 ? 's' : '') + ' ' + (d >= 0 ? 'above' : 'below') + ' your ' + t + '% target';
    const nowKey = H[H.length - 1].key;
    if(mode === 'month' || H.length < 2){
      countUp(q('.x-big'), Math.round(c), v=> Math.round(v) + '%', 800);
      q('.x-bigsub').textContent = 'of take-home goes into wealth';
      q('.x-stat').innerHTML = m[0] > 0 ? '<span>' + gapTxt + '</span><span class="chip ' + CHIP[h.key] + '">' + h.label + '</span>' : '<span>Add your take-home in Update this month</span>';
      const u = m[0] - m[1] - m[2] - m[3], tot = Math.max(m[0], m[1] + m[2] + m[3], 1);
      let bar = [['w', m[3]], ['e', m[1]], ['l', m[2]]].filter(s=> s[1] > 0).map(s=> '<i class="' + s[0] + '" style="flex:' + s[1] + ' 1 0"></i>').join('');
      if(u > 0) bar += '<i class="u" style="flex:' + u + ' 1 0"></i>';
      const tl = Math.min(t/100*m[0]/tot*100, 100), pc = v=> m[0] ? Math.round(v/m[0]*100) : 0;
      body.innerHTML = '<div class="flow" role="img" aria-label="Wealth building ' + fmt(m[3]) + ', essentials ' + fmt(m[1]) + ', lifestyle ' + fmt(m[2]) + '">' + bar + '<span class="tgt" style="left:' + tl + '%"><span>Target ' + t + '%</span></span></div>' +
        '<div class="legend">' + [['Wealth building', 'var(--wlth)', m[3]], ['Essentials', 'var(--ess)', m[1]], ['Lifestyle', 'var(--life)', m[2]]].map(x=> '<div><span><i style="background:' + x[1] + '"></i>' + x[0] + '</span><b class="fig">' + fmt(x[2]) + '<small>' + pc(x[2]) + '%</small></b></div>').join('') +
        '<div><span><i style="background:repeating-linear-gradient(135deg,rgba(238,242,248,.55) 0 2px,transparent 2px 4px)"></i>' + (u < 0 ? 'Over by' : 'Not yet allocated') + '</span><b class="fig' + (u < 0 ? ' dn' : '') + '">' + fmt(Math.abs(u)) + '</b></div></div>';
      q('.x-hfoot').innerHTML = MON_LONG[keyParts(nowKey).m - 1] + ' · <span class="fig">' + fmt(m[0]) + '</span> take-home';
    } else {
      const cs = H.map(x=> conv(x.v)), tw = H.reduce((s, x)=> s + x.v[3], 0), tt = H.reduce((s, x)=> s + x.v[0], 0), avg = tt ? tw/tt*100 : 0, hit = cs.filter(x=> x >= t).length;
      countUp(q('.x-big'), Math.round(avg), v=> Math.round(v) + '%', 800);
      q('.x-bigsub').textContent = 'average over the last ' + (H.length === 12 ? '12 months' : H.length + ' months');
      q('.x-stat').innerHTML = '<span><span class="fig">' + hit + ' of ' + H.length + '</span> months at or above your ' + t + '% target</span>';
      const mx = Math.max(...cs, t)*1.15;
      body.innerHTML = '<div class="bars" style="grid-template-columns:repeat(' + H.length + ',minmax(0,1fr))">' + cs.map((x, i)=> '<div class="bar' + (x >= t ? ' hit' : '') + (i === H.length - 1 ? ' now' : '') + '" title="' + MON[keyParts(H[i].key).m - 1] + ': ' + Math.round(x) + '%, ' + fmt(H[i].v[3]) + ' into wealth"><span style="bottom:' + (x/mx*100) + '%">' + Math.round(x) + '%</span><i style="height:' + (x/mx*100) + '%"></i></div>').join('') +
        '<div class="tline" style="bottom:' + (t/mx*100) + '%"><span>Target ' + t + '%</span></div></div>' +
        '<div class="maxis" aria-hidden="true" style="grid-template-columns:repeat(' + H.length + ',minmax(0,1fr))">' + H.map(x=> '<span>' + MON[keyParts(x.key).m - 1] + '</span>').join('') + '</div>';
      q('.x-hfoot').textContent = MON[keyParts(H[0].key).m - 1] + ' ' + keyParts(H[0].key).y + ' to ' + MON[keyParts(nowKey).m - 1] + ' ' + keyParts(nowKey).y + ' · filled bars hit your target';
    }
    q('.x-updrate').textContent = Math.round(c) + '% into wealth';
    q('.x-updmonth').textContent = 'Update ' + MON_LONG[keyParts(nowKey).m - 1];
  }

  /* ---------- safety net: the two-stage framework already in Wealth OS ---------- */
  function drawSN(client, m){
    const sn = TEI.calc.safetyNet(client), sp = sn.monthlySpend, cash = sn.current, el = q('.x-sn');
    if(!sn.linked || !(sp > 0)){
      el.innerHTML = '<p class="eb">Safety net</p><p class="hd">' + (!sn.linked ? 'No safety net account linked' : 'Add your spending') + '</p>' +
        '<p class="sub">' + (!sn.linked ? 'Pick the account that holds your safety net cash in Settings, under Plan.' : 'Your monthly spending sets how many months your cash covers.') + '</p>';
      return;
    }
    const mo = cash/sp, u = Math.max(0, m[0] - m[1] - m[2] - m[3]);
    const S = [['Working buffer', 1], ['Stage 2', 3], ['Full', sn.fullMonths]], b = [0, 1, 3, sn.fullMonths];
    const nx = S.find(s=> cash < s[1]*sp);
    let nextH;
    if(nx){ const need = nx[1]*sp - cash, mths = u > 0 ? Math.ceil(need/u) : null;
      nextH = '<div class="next panel"><span>Next: ' + nx[0] + '</span><b class="fig">' + fmt(need) + ' to go</b><small>' + (mths ? 'About ' + mths + ' month' + (mths > 1 ? 's' : '') + ' at your <span class="fig">' + fmt(u) + '</span> not yet allocated' : 'Set aside part of each month to reach it') + '</small></div>'; }
    else nextH = '<div class="next panel"><span>All three stages</span><b>Complete</b><small>Spare cash can all go to wealth building</small></div>';
    el.innerHTML = '<p class="eb">Safety net</p><p class="hd"><span class="fig">' + mo.toFixed(1) + '</span> months covered' + INFO('Safety net cash divided by your monthly spending, essentials plus lifestyle.') + '</p>' +
      '<p class="sub"><span class="fig">' + fmt(cash) + '</span> cash · <span class="fig">' + fmt(sp) + '</span> a month of spending</p>' +
      '<div class="segs" aria-hidden="true">' + [0, 1, 2].map(i=>{ const f = Math.max(0, Math.min((mo - b[i])/(b[i+1] - b[i]), 1)); return '<i class="' + (f >= 1 ? 'full' : '') + '"><b style="width:' + (f*100) + '%"></b></i>'; }).join('') + '</div>' +
      '<div class="seglab">' + S.map(x=>{ const d = cash >= x[1]*sp; return '<div><b>' + (d ? TICK : '') + (x[0] === 'Working buffer' ? 'Buffer' : x[0]) + '</b><span class="fig">' + fmt(x[1]*sp) + '</span></div>'; }).join('') + '</div>' + nextH;
    bindInfo(el);
  }

  /* ---------- scenario corner ---------- */
  function scnRead(client, m){
    const mx = Math.max(0, Math.floor(m[2]/25)*25), mv = Math.min(move, mx);
    const a = TEI.forecast.project(client, m[3]), b2 = TEI.forecast.project(client, m[3] + mv);
    const c0 = m[0] ? m[3]/m[0]*100 : 0, nc = m[0] ? (m[3] + mv)/m[0]*100 : 0;
    const gap = a.fiAge != null && b2.fiAge != null ? a.fiAge - b2.fiAge : 0;
    const card = (k, o, v, x)=> '<div class="rd panel"><span>' + k + '</span><s class="fig"' + (mv > 0 ? '' : ' style="visibility:hidden"') + '>' + o + '</s><b class="fig">' + v + '</b><small>' + (mv > 0 && x ? x : '') + '</small></div>';
    return {mx, mv,
      peek: 'Move <b class="fig">' + fmt(mv) + '</b> a month: <b class="fig">' + Math.round(nc) + '%</b> into wealth' + (gap > 0 ? ', free ' + gap + ' year' + (gap > 1 ? 's' : '') + ' sooner' : ''),
      html: card('Conversion rate', Math.round(c0) + '%', Math.round(nc) + '%', '+' + Math.round(nc - c0) + ' points') + card('Wealth building', fmt(m[3]), fmt(m[3] + mv), '+' + fmt(mv) + ' a month') +
        card('Extra by ' + a.retireAge, '£0', '+' + fk(b2.atRetire - a.atRetire), "in today's money") +
        card('Independence', a.fiAge != null ? 'Free at ' + a.fiAge : 'Not by 80', b2.fiAge != null ? 'Free at ' + b2.fiAge : 'Not by 80', gap > 0 ? gap + ' year' + (gap > 1 ? 's' : '') + ' sooner' : a.fiAge == null && b2.fiAge != null ? 'Now within reach' : '')};
  }
  function drawScn(client, m){
    const s = scnRead(client, m), el = q('.x-scn');
    el.classList.toggle('open', FOLD.has('scn'));
    el.innerHTML = FH('scn', 'Scenario corner', 'What if you moved more into wealth?', s.peek) + '<div class="tb">' +
      '<p class="scq">Move <b class="fig x-mvv">' + fmt(s.mv) + '</b> a month from lifestyle into wealth building</p>' +
      '<input type="range" class="range x-mv" min="0" max="' + s.mx + '" step="25" value="' + s.mv + '" aria-label="Amount to move each month" style="--p:' + (s.mx ? s.mv/s.mx*100 : 0) + '%">' +
      '<div class="sc4 x-scnr">' + s.html + '</div>' +
      '<div class="scfoot"><p>Growth figures use 5% a year in today\'s money, as on Forecast.</p><button type="button" class="pill x-seefc">See it on Forecast' + ARR + '</button></div></div>';
    q('.x-mv').addEventListener('input', e=>{ move = +e.target.value; const t = scnRead(client, m); q('.x-mvv').textContent = fmt(t.mv); const pk = el.querySelector('.peek'); if(pk) pk.innerHTML = t.peek; q('.x-scnr').innerHTML = t.html; e.target.style.setProperty('--p', (t.mx ? t.mv/t.mx*100 : 0) + '%'); });
    q('.x-seefc').onclick = ()=> TEI.forecast.whatIf(Math.min(move, s.mx));
  }

  /* ---------- your habits ---------- */
  function drawHab(client, H, m){
    const el = q('.x-hab'), t = target(client);
    el.classList.toggle('open', FOLD.has('hab'));
    if(H.length < 2){
      el.innerHTML = FH('hab', 'Your habits', 'What the last year shows', 'Builds from your second month') + '<div class="tb"><div class="hrows"><div class="hr panel"><b class="fig">1</b><div><b>Month logged so far</b><span>Use Update this month each month and your habits show here.</span></div></div></div></div>';
      return;
    }
    const cs = H.map(x=> conv(x.v)), hit = cs.filter(c=> c >= t).length, L = H.map(x=> x.v[2]), l4 = L.slice(-4);
    const rising = l4.length === 4 && l4[1] > l4[0] && l4[2] > l4[1] && l4[3] > l4[2];
    const tw = H.reduce((s, x)=> s + x.v[3], 0), la = L.reduce((s, x)=> s + x, 0)/H.length;
    const prev = H[H.length - 2], prevName = MON_LONG[keyParts(prev.key).m - 1];
    const startName = l4.length === 4 ? MON_LONG[keyParts(H[H.length - 4].key).m - 1] : '';
    const rows = [
      rising ? ['+' + fmt(l4[3] - l4[0]), 'Lifestyle up three months running', fmt(l4[0]) + ' in ' + startName + ', ' + fmt(l4[3]) + ' now.']
        : [(m[2] >= prev.v[2] ? '+' : '−') + fmt(Math.abs(m[2] - prev.v[2])), 'Lifestyle against last month', fmt(prev.v[2]) + ' in ' + prevName + ', ' + fmt(m[2]) + ' now.'],
      [hit + ' of ' + H.length, 'Months at or above your ' + t + '% target', hit >= H.length/2 ? 'Consistency matters more than any single month.' : 'Small regular moves close the gap fastest.'],
      [fmt(tw), 'Moved into wealth in ' + H.length + ' months', 'Lifestyle averaged ' + fmt(la) + ' a month alongside it.']];
    el.innerHTML = FH('hab', 'Your habits', 'What the last year shows', '<b class="fig">' + hit + ' of ' + H.length + '</b> months at target' + (rising ? ' · lifestyle up 3 months running' : '')) +
      '<div class="tb"><div class="hrows">' + rows.map(r=> '<div class="hr panel"><b class="fig">' + r[0] + '</b><div><b>' + r[1] + '</b><span class="fig">' + r[2] + '</span></div></div>').join('') + '</div></div>';
  }

  /* ---------- debts (new, brief 3.3) ---------- */
  function drawDebts(client, m){
    const D = V.debts(client), el = q('.x-debts');
    el.classList.toggle('open', FOLD.has('debts'));
    if(!D.length){
      el.innerHTML = FH('debts', 'Debts', 'No debts recorded', 'Add them in Update balances') + '<div class="tb"><p class="sub">Add a mortgage, loan or card in Update balances on Wealth, and this shows what each one costs and when it clears.</p><div class="scfoot"><button type="button" class="pill x-adddebt">Add a debt' + ARR + '</button></div></div>';
      q('.x-adddebt').onclick = ()=>{ TEI.app.showPage('progress'); if(TEI.wealthPage) TEI.wealthPage.openUpdate('debts'); };
      return;
    }
    const pay = D.reduce((s, d)=> s + d.pay, 0), tot = D.reduce((s, d)=> s + d.bal, 0), share = m[0] ? pay/m[0]*100 : 0;
    const P = D.map(d=> Object.assign({d}, V.payoff(d)));
    const first = P.filter(p=> p.m != null).sort((a, b)=> a.m - b.m)[0];
    const newConv = first && m[0] ? (m[3] + first.d.pay)/m[0]*100 : 0, rest = Math.max(0, m[0] - pay);
    const say = first ? esc(first.d.name) + ' clears in <b class="fig">' + V.addM(first.m) + '</b>. Moving its <b class="fig">' + fmt(first.d.pay) + '</b> a month into wealth would lift your rate from ' + Math.round(m[0] ? m[3]/m[0]*100 : 0) + '% to <b class="fig">' + Math.round(newConv) + '%</b>.' : '';
    const pos = k=> Math.min(k/HORIZON*100, 100);
    const rows = P.map((p, i)=>{
      const d = p.d, o = open === d.id, long = p.m == null || p.m > HORIZON, w = long ? 100 : pos(p.m), col = DCOL[i % 3];
      let mk = '';
      if(d.promoM && d.promoM <= HORIZON) mk = '<span class="mk" style="left:' + pos(d.promoM) + '%"><span>0% ends</span></span>';
      if(d.fixM && d.fixM <= HORIZON) mk = '<span class="mk" style="left:' + pos(d.fixM) + '%"><span>Fix ends</span></span>';
      const end = long ? '' : '<span class="end" style="left:' + w + '%">' + V.addM(p.m).replace(' 20', " ’") + ' · <b class="fig">+' + fmt(d.pay) + '</b></span>';
      const endL = long && p.m != null ? '<span class="end" style="right:0;left:auto;padding:0;top:-12px;font-size:12px">to ' + V.addM(p.m).slice(-4) + ' →</span>' : '';
      return '<button type="button" class="tlrow" data-id="' + esc(d.id) + '" aria-expanded="' + o + '"><span class="nm"><b>' + esc(d.name) + '</b><span class="fig">' + fmt(d.bal) + '</span></span><span class="trk"><span class="ln"></span><span class="bd' + (long ? ' long' : '') + '" style="width:' + (long ? 96 : Math.max(w, 1.5)) + '%;background:' + col + '"></span>' + mk + end + endL + '</span></button>' + (o ? detail(d, p) : '');
    }).join('');
    const y0 = new Date().getFullYear(), ticks = [0, 48, 96, 120];
    el.innerHTML = FH('debts', 'Debts', 'Repayments take <span class="fig">' + fmt(pay) + '</span> of your <span class="fig">' + fmt(m[0]) + '</span> a month', '') +
      '<p class="sub"><span class="fig">' + Math.round(share) + '%</span> of take-home · <span class="fig">' + fmt(tot) + '</span> owed</p>' +
      '<div class="sbar" role="img" aria-label="Debt repayments are ' + Math.round(share) + '% of take-home">' + P.map((p, i)=> '<i style="flex:' + p.d.pay + ' 1 0;background:' + DCOL[i % 3] + '"></i>').join('') + '<i class="rest" style="flex:' + rest + ' 1 0"></i></div>' +
      '<div class="tb"><div class="slab">' + P.map((p, i)=> '<span><i style="background:' + DCOL[i % 3] + '"></i>' + esc(p.d.name) + ' <b class="fig">' + fmt(p.d.pay) + '</b></span>').join('') + '</div>' +
      (say ? '<p class="say">' + say + '</p>' : '') +
      '<div class="tl">' + rows + '<div class="taxis" aria-hidden="true">' + ticks.map(t=> '<span style="left:' + (t/HORIZON*100) + '%">' + (y0 + t/12) + '</span>').join('') + '</div></div></div>';
    el.querySelectorAll('.tlrow').forEach(b=> b.onclick = ()=>{ open = open === b.dataset.id ? null : b.dataset.id; drawDebts(client, m); const again = el.querySelector('.tlrow[data-id="' + b.dataset.id + '"]'); if(again) again.focus(); });
    el.querySelectorAll('.opts button').forEach(b=> b.onclick = ()=>{ over[open] = +b.dataset.x; drawDebts(client, m); });
  }
  function detail(d, p){
    const x = over[d.id] || (d.bal > 20000 ? 100 : 50), pn = V.payoff(d, x);
    const after = d.afterApr != null ? (d.afterApr*100).toFixed(1) + '%' : null;
    const rate = d.promoM ? '0% until ' + V.addM(d.promoM) + (after ? ', then ' + after : '') : (d.apr*100).toFixed(1) + '%' + (d.fixM ? ' fixed until ' + V.addM(d.fixM) + (after ? ', then about ' + after : '') : '');
    let res = '';
    if(p.m != null && pn.m != null) res = 'Clears <b class="fig">' + V.spanTxt(p.m - pn.m) + '</b> sooner, with <b class="fig">' + fmt(p.i - pn.i) + '</b> less interest.';
    if(d.promoM) res += ' To clear it before the 0% ends: <b class="fig">' + fmt(Math.ceil(d.bal/d.promoM)) + ' a month</b>.';
    // The link to the Debt vs Investment Lab stays hidden until the Lab is live (Paddy, 9 Nov).
    return '<div class="det panel"><p><span class="fig">' + rate + '</span> · <span class="fig">' + fmt(d.pay) + '</span> a month · clears <span class="fig">' + (p.m != null ? V.addM(p.m) : 'never at this payment') + '</span></p>' +
      '<div class="row"><span>Pay more each month</span><div class="opts" role="group" aria-label="Extra each month">' + [50, 100, 250].map(v=> '<button type="button" data-x="' + v + '" aria-pressed="' + (v === x) + '">+£' + v + '</button>').join('') + '</div></div>' +
      '<p class="res">' + res + '</p></div>';
  }

  /* ---------- coach's corner ---------- */
  function drawNote(client){
    const n = V.note(client, 'cashflow');
    const rec = (client.cashflowMonths||{})[currentMonthKey()];
    const stale = n && rec ? V.staleLine(n, rec.lastEditedAt) : '';
    const added = V.added(client, 'cashflow');
    const btn = added ? '<button type="button" class="pill done" aria-disabled="true">' + TICK + 'Added to your next session</button>' : '<button type="button" class="pill x-disc">Add to next session</button>';
    const el = q('.x-noteslot');
    el.innerHTML = '<p class="eb">Coach\'s corner</p>' + (n ? '<blockquote>“' + esc(n.text) + '”</blockquote><p class="sig"><i></i>' + V.coachName() + (n.dateTxt ? ' · ' + n.dateTxt : '') + '</p>' + (stale ? '<p class="stale">' + stale + '</p>' : '')
      : '<p class="nonote">Your coach adds a note here after your next cashflow check-in.</p>') + '<div class="cl">' + btn + '</div>';
    const b = el.querySelector('.x-disc'); if(b) b.onclick = async ()=>{ b.disabled = true; if(await V.addToSession(client, 'cashflow', 'my cashflow')) drawNote(client); else b.disabled = false; };
  }

  /* ---------- Update this month: saves as you type ---------- */
  let SAVED = null, saveTimer = null, saving = Promise.resolve();
  const IDS = [['x-inth', 0], ['x-ines', 1], ['x-inli', 2], ['x-inwe', 3]];
  function current(client){ const m = TEI.calc.cashflowMonth(client); return [m.takeHome, m.essentials, m.lifestyle, m.wealthBuilding].map(v=> Math.round(v)); }
  function openUpd(o){
    const upd = q('.upd'), ub = q('.upbtn'), scrim = q('.scrim');
    upd.hidden = !o; ub.setAttribute('aria-expanded', o ? 'true' : 'false'); scrim.hidden = !(o && PHONE());
    const client = TEI.app.state.client;
    if(o && client){ if(!SAVED) SAVED = current(client); fillUpd(client); if(PHONE()) q('.x-inth').focus(); }
    if(!o) flush();
  }
  function fillUpd(client){ const m = current(client); IDS.forEach(([c, k])=> q('.' + c).value = m[k]); calcU(client); }
  function calcU(client){ const m = current(client), u = m[0] - m[1] - m[2] - m[3], el = q('.x-calcu'); el.textContent = fmt(u); el.className = 'fig x-calcu' + (u < 0 ? ' dn' : ''); }
  function onInput(e){
    const client = TEI.app.state.client; if(!client) return;
    const v = parseFloat(e.target.value), err = q('.x-upderr');
    if(isNaN(v) || v < 0){ err.textContent = 'Enter an amount of £0 or more.'; err.hidden = false; return; }
    err.hidden = true;
    const vals = IDS.map(([c])=> Math.max(0, parseFloat(q('.' + c).value) || 0));
    put(client, vals);
    renderAll(client);
    calcU(client);
  }
  function put(client, vals){
    const key = currentMonthKey();
    client.cashflowMonths = client.cashflowMonths || {};
    const prev = client.cashflowMonths[key] || {};
    client.cashflowMonths[key] = Object.assign({}, prev, {actualIncome: vals[0], actualExpenses: vals[1] + vals[2], essentials: vals[1], lifestyle: vals[2], wealthBuilding: vals[3], lastEditedAt: new Date().toISOString()});
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=> save(client, key, vals), 700);
  }
  function save(client, key, v){
    saveTimer = null;
    saving = saving.then(async ()=>{
      try{ await TEI.wealthOS.saveCashflowMonth(client.meta.clientId, key, v[0], v[1] + v[2], client.meta.role, {essentials: v[1], lifestyle: v[2], wealthBuilding: v[3]}); }
      catch(err){ console.error('Wealth OS: could not save this month', err); TEI.app.showToast('That did not save. Please try again.'); }
    });
    return saving;
  }
  function flush(){
    if(!saveTimer) return;
    clearTimeout(saveTimer); saveTimer = null;
    const client = TEI.app.state.client; if(!client) return;
    const rec = client.cashflowMonths[currentMonthKey()];
    if(rec) save(client, currentMonthKey(), [rec.actualIncome, rec.essentials, rec.lifestyle, rec.wealthBuilding]);
  }

  /* ---------- render ---------- */
  function renderAll(client){
    const H = hist(client), m = H[H.length - 1].v;
    q('.x-dirty').hidden = !(SAVED && JSON.stringify(SAVED) !== JSON.stringify(current(client)));
    drawHero(client, H, m); drawSN(client, m); drawScn(client, m); drawHab(client, H, m); drawDebts(client, m); drawNote(client);
  }
  let wired = false;
  function wireOnce(){
    if(wired) return; wired = true;
    q('.modes').querySelectorAll('button').forEach(b=> b.onclick = ()=>{ mode = b.dataset.m; q('.modes').querySelectorAll('button').forEach(x=> x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); intro = true; const c = TEI.app.state.client; if(c) renderAll(c); intro = false; });
    q('.upbtn').onclick = ()=> openUpd(q('.upd').hidden);
    q('.scrim').onclick = ()=> openUpd(false);
    q('.x-done').onclick = ()=> openUpd(false);
    IDS.forEach(([c])=> q('.' + c).addEventListener('input', onInput));
    q('.x-undo').onclick = ()=>{ const c = TEI.app.state.client; if(c && SAVED){ put(c, SAVED.slice()); fillUpd(c); renderAll(c); TEI.app.showToast('Back to your saved figures'); } };
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && root() && !q('.upd').hidden) openUpd(false); });
    window.addEventListener('resize', ()=>{ if(root()) q('.scrim').hidden = !(PHONE() && !q('.upd').hidden); });
    root().addEventListener('click', e=>{
      const h = e.target.closest('.fhead'); if(!h || !PHONE()) return;
      const id = h.dataset.f; FOLD.has(id) ? FOLD.delete(id) : FOLD.add(id);
      h.parentElement.classList.toggle('open', FOLD.has(id)); h.setAttribute('aria-expanded', FOLD.has(id) ? 'true' : 'false');
    });
  }
  /* From Wealth's Debts row: open the Debts tile and bring it into view. */
  function focusDebts(){
    FOLD.add('debts');
    const el = q('.x-debts'); if(!el) return;
    el.classList.add('open'); const h = el.querySelector('.fhead'); if(h) h.setAttribute('aria-expanded', 'true');
    el.scrollIntoView({behavior: V.RM() ? 'auto' : 'smooth', block:'start'});
  }

  // Home's Cashflow tile reads the same target and health rule.
  TEI.cashflowPage = { openUpdate: ()=>{ TEI.app.showPage('cashflow'); openUpd(true); }, target, health, focusDebts };
  TEI.render.cashflow = function(client){
    wireOnce();
    V.syncEye();
    renderAll(client);
    intro = false;
  };
})();
