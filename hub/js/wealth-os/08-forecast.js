window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

(function(){
  /* ================================================================
     FORECAST v3.1 with the v3.2 range-labels fix (TEI Launch v2, brief 3.2)
     The framed hero (Your plan, What if, Order of returns) to age 90;
     beside it, unboxed, Free at N, Of the way, Coasting from, Your number
     and the retirement slider; Adjust as a framed drop-down (a bottom
     sheet on phones); a lighter band with the range of outcomes, Things to
     know and next steps; the coach's note as a letter to close.
     The maths follows the locked mock-up: yearly steps, growth "a year
     after costs and inflation" (so today's money needs no deflating;
     future money adds 2.5% a year back), 500 market paths with a 13%
     spread, your number = 25 times yearly spending in retirement (or the
     coach's own figure). Saved plan: retirement age and yearly spending
     (migration 009) plus saving rise, one-offs and money view (020).
     ================================================================ */
  const V = TEI.v2;
  const {esc, fmt, fk, sk, INFO, CHEV, TICK, ARR, RM, PHONE, countUp, bindInfo} = V;
  const EXPECTED_RATE = 0.05;
  TEI.calc.EXPECTED_RATE = EXPECTED_RATE; // Home's actual-vs-plan line uses the same middle case
  const END = 90, INFL = 0.025, DEFAULT_RETIRE_AGE = 60, NO_DOB_AGE = 40;
  const $ = id=> document.getElementById(id);
  const root = ()=> document.querySelector('.wo2-fc');
  const q = s=> root().querySelector(s);
  const r1k = n=> Math.round(n/1000)*1000;
  const clone = o=> JSON.parse(JSON.stringify(o));
  const same = (a, b)=> JSON.stringify(a) === JSON.stringify(b);

  /* ---------- the client's plan ---------- */
  function planOf(client){
    const prefs = client.preferences || {};
    const age = V.ageNow(client);
    const AGE0 = age != null ? age : NO_DOB_AGE;
    const budget = TEI.calc.computeBudgetAndFI(client);
    let R = prefs.retirementAge != null ? Number(prefs.retirementAge) : DEFAULT_RETIRE_AGE;
    R = Math.min(Math.max(R, Math.max(55, AGE0 + 1)), Math.max(68, AGE0 + 1));
    return {AGE0, hasAge: age != null,
      plan: {p0: Math.round(TEI.calc.latestNetWorth(client)), pmt: Math.round(TEI.calc.actualTotalSavingInvesting(client)),
        rise: prefs.planSavingRise != null ? Number(prefs.planSavingRise)/100 : 0, R,
        ys: prefs.yearlySpending != null ? Number(prefs.yearlySpending) : r1k(budget.annualSpend || 0),
        oo: (prefs.planOneOffs || []).map(o=> ({age: Number(o.at != null ? o.at : o.age), amt: Number(o.amt)})).filter(o=> o.age > AGE0 && o.amt)},
      real: prefs.planReal !== false,
      fiOverride: prefs.fiOverride != null ? Number(prefs.fiOverride) : null, mult: Number(prefs.fiMultiple) || 25};
  }

  /* ---------- the model (as the mock-up) ---------- */
  let S = null; // session state: {clientId, AGE0, PLAN, draft, mode, rate, real, ...}
  const cur = ()=> S.mode === 'whatif' ? S.draft : S.PLAN;
  const contrib = (p, a)=> a < p.R ? p.pmt*12*Math.pow(1 + p.rise, a - S.AGE0) : 0;
  const ooAt = (p, a)=> p.oo.filter(o=> o.age === a).reduce((s, o)=> s + o.amt, 0);
  function proj(p, r){
    const out = [p.p0]; let v = p.p0;
    for(let a=S.AGE0; a<END; a++){ v = v*(1 + r) + contrib(p, a) - (a >= p.R ? p.ys : 0) + ooAt(p, a + 1); if(v < 0) v = 0; out.push(v); }
    return out;
  }
  const atR = (p, r)=> proj(p, r)[p.R - S.AGE0];
  const fiNum = p=> S.fiOverride != null ? S.fiOverride : S.mult*p.ys;
  function fiAge(p, r){
    const F = fiNum(p); if(!(F > 0)) return null;
    let v = p.p0; const q2 = Object.assign({}, p, {R:99});
    for(let a=S.AGE0; a<=80; a++){ if(v >= F) return a; v = v*(1 + r) + contrib(q2, a) + ooAt(q2, a + 1); }
    return null;
  }
  function coastAge(p, r){
    const F = fiNum(p); if(!(F > 0)) return null;
    let v = p.p0;
    for(let a=S.AGE0; a<=p.R; a++){ if(v*Math.pow(1 + r, p.R - a) >= F) return a; v = v*(1 + r) + contrib(p, a) + ooAt(p, a + 1); }
    return null;
  }
  function mc(p, r){
    let s = 11; const rnd = ()=>{ s = (s*16807) % 2147483647; return s/2147483647; };
    const res = [];
    for(let i=0; i<500; i++){
      let v = p.p0;
      for(let a=S.AGE0; a<p.R; a++){ const z = Math.sqrt(-2*Math.log(rnd()))*Math.cos(2*Math.PI*rnd()); v = Math.max(0, v*(1 + r + 0.13*z) + contrib(p, a) + ooAt(p, a + 1)); }
      res.push(v);
    }
    res.sort((a, b)=> a - b);
    return {p10:res[49], p50:res[249], p90:res[449], res};
  }
  const SEQ = [-.20, -.12, -.04, .04, .08, .10, .12, .06, 0, -.04];
  function orderPaths(p, r){
    const base = proj(p, r);
    const run = offs=>{ const out = []; let v = base[p.R - S.AGE0];
      for(let a=p.R; a<=END; a++){ out.push(v); const k = a - p.R, ret = r + (k < offs.length ? offs[k] : 0); v = Math.max(0, v*(1 + ret) - p.ys); }
      return out; };
    return {bad: run(SEQ), good: run(SEQ.slice().reverse())};
  }
  const dv = (v, age)=> S.real ? v : v*Math.pow(1 + INFL, age - S.AGE0);
  const moneyWord = ()=> S.real ? "in today's money" : 'in future money';

  /* ---------- hero ---------- */
  let cd = null, intro = true;
  function drawHero(){
    const p = cur(), big = q('.x-big'), stats = q('.x-stats');
    let labels = '', keyH = '', ins = '';
    if(S.mode !== 'order'){
      const m = proj(p, S.rate), pl = proj(S.PLAN, S.rate);
      const ages = m.map((_, i)=> S.AGE0 + i);
      const series = [{v: m.map((x, i)=> dv(x, S.AGE0 + i)), main:1}];
      if(S.mode === 'whatif') series.push({v: pl.map((x, i)=> dv(x, S.AGE0 + i)), ghost:1});
      const F = fiNum(p), vR = dv(m[p.R - S.AGE0], p.R);
      big.innerHTML = '<span class="fig x-bign"></span><small>at ' + p.R + '</small>';
      if(intro) countUp(q('.x-bign'), r1k(vR), fmt, 900); else q('.x-bign').textContent = fk(vR);
      if(S.mode === 'plan'){
        const gap = m[p.R - S.AGE0] - F;
        stats.innerHTML = F > 0 ? '<span class="' + (gap >= 0 ? 'up' : 'dn') + ' fig">' + (gap >= 0 ? fk(gap) + ' above' : fk(-gap) + ' short of') + ' your number</span><span class="dot">·</span><span>' + moneyWord() + '</span>'
          : '<span>Add your yearly spending in retirement to see your number</span>';
      } else {
        const d = dv(m[p.R - S.AGE0], p.R) - dv(pl[S.PLAN.R - S.AGE0], S.PLAN.R);
        stats.innerHTML = '<span class="' + (d >= 0 ? 'up' : 'dn') + ' fig">' + (d >= 0 ? '+' : '−') + fk(Math.abs(d)) + ' on your plan</span><span class="dot">·</span><span>' + moneyWord() + '</span>';
        keyH = '<div class="ckey"><span><i style="background:var(--champ)"></i>What if</span><span><i class="dash"></i>Your plan</span></div>';
      }
      cd = {ages, series, F: F > 0 ? dv(F, p.R) : null, R: p.R};
    } else {
      const o = orderPaths(p, S.rate), ages = o.bad.map((_, i)=> p.R + i);
      const series = [{v: o.bad.map((x, i)=> dv(x, ages[i])), col:'var(--loss)'}, {v: o.good.map((x, i)=> dv(x, ages[i])), col:'var(--gain)'}];
      const ob = o.bad.findIndex(x=> x <= 0), og = o.good.findIndex(x=> x <= 0);
      if(ob >= 0 && og < 0){ big.innerHTML = '<span class="fig">Runs out at ' + ages[ob] + '</span>'; stats.innerHTML = '<span>Bad years first</span><span class="dot">·</span><span>Good years first lasts past ' + END + '</span>'; }
      else { const i75 = Math.max(0, Math.min(ages.length - 1, 75 - p.R)), d = Math.abs(o.good[i75] - o.bad[i75]);
        big.innerHTML = '<span class="fig">' + fk(dv(d, 75)) + '</span><small>apart at 75</small>';
        stats.innerHTML = '<span>Same ' + Math.round(S.rate*100) + '% average</span><span class="dot">·</span><span>different order</span>'; }
      keyH = '<div class="ckey"><span><i style="background:var(--loss)"></i>Bad years first</span><span><i style="background:var(--gain)"></i>Good years first</span></div>';
      ins = '<p class="insight">Same returns, in a different order. Losses just after you stop saving do the most damage, because you are selling to live while prices are low.</p>';
      cd = {ages, series, R: p.R, order:1};
    }
    const all = cd.series.flatMap(s=> s.v).concat(cd.F ? [cd.F] : []), mx = Math.max(...all)*1.08 || 1, n = cd.ages.length;
    const X = i=> i/(n - 1)*800, Y = v=> 214 - v/mx*204;
    const path = v=> v.map((x, i)=> (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1)).join('');
    let h = '<defs><linearGradient id="fc2ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8D3A2" stop-opacity=".46"/><stop offset="1" stop-color="#E8D3A2" stop-opacity="0"/></linearGradient></defs>';
    h += '<g stroke="rgba(190,208,236,.08)">' + [60, 110, 160].map(y=> '<line x1="0" y1="' + y + '" x2="800" y2="' + y + '" vector-effect="non-scaling-stroke"/>').join('') + '</g>';
    const ri = cd.ages.indexOf(cd.R), ep = q('.endpt');
    if(!cd.order){
      h += '<line x1="' + X(ri) + '" y1="0" x2="' + X(ri) + '" y2="214" stroke="rgba(190,208,236,.3)" vector-effect="non-scaling-stroke"/>';
      if(cd.F) h += '<line x1="0" y1="' + Y(cd.F) + '" x2="800" y2="' + Y(cd.F) + '" stroke="rgba(190,208,236,.45)" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/>';
      cd.series.forEach(s=>{ if(s.ghost) h += '<path d="' + path(s.v) + '" fill="none" stroke="#AEBBD0" stroke-opacity=".7" stroke-width="1.4" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>'; });
      const m = cd.series[0].v;
      h += '<path d="' + path(m) + 'L800 214L0 214Z" fill="url(#fc2ar)"/><path d="' + path(m) + '" fill="none" stroke="#E8D3A2" stroke-width="2" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 6px rgba(232,211,162,.6)) drop-shadow(0 0 16px rgba(232,211,162,.28))"/>';
      ep.hidden = false; ep.style.left = (X(ri)/8) + '%'; ep.style.top = (Y(m[ri])/2.2) + '%';
      const fi = cd.F ? m.findIndex(x=> x >= cd.F) : -1;
      labels = (fi > 0 && fi < ri ? '<span class="fipt" style="left:' + (X(fi)/8) + '%;top:' + (Y(m[fi])/2.2) + '%"></span><span class="filab" style="left:' + (X(fi)/8) + '%;top:' + (Y(m[fi])/2.2) + '%">Free at ' + cd.ages[fi] + '</span>' : '') +
        (cd.F ? '<span class="clab" style="right:0;top:calc(' + (Y(cd.F)/2.2) + '% - 20px)">Your number <b class="fig">' + sk(cd.F) + '</b></span>' : '') +
        '<span class="clab" style="left:calc(' + (X(ri)/8) + '% + 6px);top:0">Retire at ' + cd.R + '</span>';
    } else {
      cd.series.forEach(s=> h += '<path d="' + path(s.v) + '" fill="none" stroke="' + (s.col === 'var(--loss)' ? '#EBA48E' : '#9FD0A8') + '" stroke-width="2" vector-effect="non-scaling-stroke"/>');
      ep.hidden = true;
      labels = '<span class="clab" style="left:6px;top:0">Retire at ' + cd.R + '</span>';
    }
    q('.x-csvg').innerHTML = h; q('.x-clabs').innerHTML = labels; q('.x-ckey').innerHTML = keyH + ins;
    let ticks = cd.order ? [cd.R, cd.R + 10, 75, END] : [S.AGE0, Math.round((S.AGE0 + cd.R)/2), cd.R, 75, END];
    ticks = ticks.filter(t=> t >= cd.ages[0] && t <= END && (t === cd.R || t === cd.ages[0] || t === END || Math.abs(t - cd.R) > 5)).filter((t, i, a)=> a.indexOf(t) === i).sort((a, b)=> a - b);
    q('.x-axis').innerHTML = ticks.map(t=> '<span style="left:' + ((t - cd.ages[0])/(n - 1)*100) + '%">' + t + '</span>').join('');
    const chart = q('.chart');
    if(intro && !RM()){ chart.classList.remove('drawin'); void chart.offsetWidth; chart.classList.add('drawin'); }
    q('.x-csvg').setAttribute('aria-label', 'Projected wealth from age ' + cd.ages[0] + ' to ' + END + (S.real ? ", in today's money" : ', in future money'));
    q('.x-adjend').textContent = fk(dv(atR(S.draft, S.rate), S.draft.R)) + ' at ' + S.draft.R;
  }

  /* ---------- beside the hero ---------- */
  function drawClose(){
    const p = cur(), F = fiNum(p), fa = fiAge(p, S.rate), ca = coastAge(p, S.rate);
    const ok = fa != null && fa <= p.R;
    q('.x-fiage').innerHTML = !(F > 0) ? '<small>Add your spending</small>' : fa != null ? '<small>Free at</small>' + fa : '<small>Not free by</small>80';
    const mk = q('.mark'); mk.className = 'mark' + (ok ? '' : ' att'); mk.title = ok ? 'On track' : 'Priority'; mk.setAttribute('aria-label', ok ? 'On track' : 'Priority');
    const d = fa != null ? p.R - fa : null;
    q('.x-fisub').textContent = !(F > 0) ? 'Set your yearly spending in Adjust' : d == null ? "At today's saving the pot does not reach your number" : d > 0 ? d + ' year' + (d > 1 ? 's' : '') + ' before you plan to retire' : d === 0 ? 'The year you plan to retire' : (-d) + ' year' + (-d > 1 ? 's' : '') + ' after you plan to retire';
    const fp = F > 0 ? Math.min(p.p0/F, 1) : 0;
    q('.x-fipct').textContent = Math.round(fp*100) + '%'; q('.x-fibar').style.width = (fp*100) + '%';
    q('.x-fiinfo').innerHTML = INFO('How much of your number you already have: <span class="fig">' + fmt(p.p0) + '</span> of <span class="fig">' + fmt(F) + '</span>.');
    const cp = F > 0 ? Math.min(p.p0*Math.pow(1 + S.rate, p.R - S.AGE0)/F, 1) : 0;
    q('.x-coastk').textContent = ca != null ? 'Coasting from' : 'Not coasting by'; q('.x-coastv').textContent = ca != null ? ca : p.R;
    q('.x-coastbar').style.width = (cp*100) + '%';
    q('.x-coastinfo').innerHTML = INFO('The age when, if you stopped saving, your pot would still grow to your number by ' + p.R + ' at ' + Math.round(S.rate*100) + '% a year. The line shows how far today\'s pot gets you on its own.', 'rt');
    q('.x-finum').innerHTML = '<span class="lg">' + fmt(F) + '</span><span class="sh">' + sk(F) + '</span>';
    q('.x-numinfo').innerHTML = INFO(S.fiOverride != null ? 'Set by your coach for your plan.' : S.mult + ' times your yearly spending in retirement (<span class="fig">' + fmt(p.ys) + '</span>). A pot this size can pay that spending for life in most past markets, the 4% rule.', 'rt');
    const rg = q('.x-ret'); rg.min = String(Math.max(55, S.AGE0 + 1)); rg.max = String(Math.max(68, S.AGE0 + 1)); rg.value = p.R;
    rg.style.setProperty('--p', ((p.R - rg.min)/Math.max(1, rg.max - rg.min)*100) + '%'); q('.x-retval').textContent = p.R;
    q('.x-ends').innerHTML = '<span>' + rg.min + '</span><span>' + rg.max + '</span>';
    bindInfo(q('.close'));
  }

  /* ---------- the lighter band ---------- */
  const STEPS = [
    {n:'Save £100 more a month', t:R=> 'Every month for the next ' + (R - S.AGE0) + ' years, rising with your saving.', f:x=>{ x.pmt += 100; }},
    {n:'Let your saving rise with your pay', t:()=> 'Raise it 1% more each year than you do now.', f:x=>{ x.rise = Math.round((x.rise + 0.01)*1000)/1000; }},
    {n:'Put a £5,000 bonus in at 40', t:()=> 'One lump sum early does more than the same sum later.', f:x=>{ x.oo.push({age: Math.max(40, S.AGE0 + 1), amt:5000}); }, label:()=> 'Put a £5,000 bonus in at ' + Math.max(40, S.AGE0 + 1)}];
  function drawBand(){
    const p = cur(), R = p.R, F = fiNum(p), qq = mc(p, S.rate);
    const P10 = dv(qq.p10, R), P50 = dv(qq.p50, R), P90 = dv(qq.p90, R), Fd = dv(F, R);
    q('.x-rnglead').innerHTML = '9 in 10 paths reach <span class="fig">' + fk(P10) + '</span>';
    q('.x-rngsub').textContent = !(F > 0) ? 'Add your yearly spending to compare with your number.' : qq.p10 >= F ? 'Even a tough run of markets clears your number.' : qq.p50 >= F ? 'The middle path clears your number. A tough run would not.' : 'Most paths fall short of your number at ' + R + '.';
    const vals = qq.res.map(v=> dv(v, R)), mx = Math.max(vals[484], Fd*1.08, 1), pcx = v=> (Math.min(v, mx)/mx*100).toFixed(2) + '%';
    const NB = 40, bins = new Array(NB).fill(0); vals.forEach(v=>{ if(v > mx) return; const i = Math.min(NB - 1, Math.floor(v/mx*NB)); bins[i]++; });
    const sm = bins.map((_, i)=> (bins[i-1]||0)*.25 + bins[i]*.5 + (bins[i+1]||0)*.25), bm = Math.max(...sm, 1);
    const pts = sm.map((c, i)=> [((i + .5)/NB*600), 118 - c/bm*108]);
    const d = 'M0 118 ' + pts.map(pp=> 'L' + pp[0].toFixed(1) + ' ' + pp[1].toFixed(1)).join(' ') + ' L600 118 Z';
    const x10 = Math.min(P10, mx)/mx*600, x90 = Math.min(P90, mx)/mx*600;
    q('.x-dens').innerHTML = '<svg viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="fc2mid"><rect x="' + x10 + '" y="0" width="' + (x90 - x10) + '" height="120"/></clipPath></defs>' +
      '<path d="' + d + '" fill="rgba(238,242,248,.07)"/><path d="' + d + '" fill="rgba(232,211,162,.26)" clip-path="url(#fc2mid)"/>' +
      '<path d="' + pts.map((pp, i)=> (i ? 'L' : 'M') + pp[0].toFixed(1) + ' ' + pp[1].toFixed(1)).join(' ') + '" fill="none" stroke="rgba(238,242,248,.55)" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>' +
      (F > 0 ? '<span class="tgt' + (Math.min(Fd, mx)/mx > .7 ? ' flip' : '') + '" style="left:' + pcx(Fd) + '"><span>Your number</span></span>' : '');
    q('.x-dmk').innerHTML = '<span class="pt" style="left:' + pcx(P10) + '"></span><span class="pt mid" style="left:' + pcx(P50) + '"></span><span class="pt" style="left:' + pcx(P90) + '"></span>' +
      '<div class="drow"><span><b class="fig">' + sk(P10) + '</b>1 in 10 do worse</span><span class="mid"><b class="fig">' + sk(P50) + '</b>Middle path</span><span><b class="fig">' + sk(P90) + '</b>1 in 10 do better</span></div>';
    q('.x-know').innerHTML = [
      ['Growth a year, after costs and inflation', Math.round(S.rate*100) + '%'],
      ["Inflation taken out for today's money", '2.5% a year'],
      ['Spending in retirement', 'Flat each year'],
      ['Range of outcomes', '500 market paths'],
      ['State Pension', 'Not included']].map(k=> '<li><span>' + k[0] + '</span><b>' + k[1] + '</b></li>').join('');
    const base = atR(p, S.rate), tot = base, share = tot > 0 ? 1 - p.p0*Math.pow(1 + S.rate, R - S.AGE0)/tot : 0;
    const line = share >= .5 ? 'Most of your <span class="fig">' + fk(dv(tot, R)) + '</span> at ' + R + ' comes from what you save from here.' : 'Most of your pot at ' + R + ' comes from what you already have.';
    q('.x-steps').innerHTML = '<div class="stepsh" style="padding:22px 4px 8px"><p class="stepline">' + line + '</p><p>What would move it, at ' + Math.round(S.rate*100) + '% a year</p></div>' + STEPS.map((s, i)=>{
      const q2 = clone(p); s.f(q2); const dd = dv(atR(q2, S.rate), R) - dv(base, R);
      return '<button type="button" class="st" data-i="' + i + '"><span class="n">' + (i + 1) + '</span><span class="t"><b>' + (s.label ? s.label() : s.n) + '</b><span>' + s.t(R) + '</span></span><span class="r"><b class="fig">+' + fk(dd) + '</b><small>at ' + R + '</small></span>' + CHEV + '</button>'; }).join('');
    q('.x-steps').querySelectorAll('.st').forEach(b=> b.onclick = ()=>{
      S.draft = clone(cur()); STEPS[+b.dataset.i].f(S.draft); setMode('whatif', true); openAdj(true);
      q('.hero').scrollIntoView({behavior: RM() ? 'auto' : 'smooth', block:'start'}); TEI.app.showToast('Showing it as a what if'); });
  }

  /* ---------- the close ---------- */
  function drawNote(client){
    const n = V.note(client, 'forecast');
    const doc = TEI.forecastView && TEI.forecastView.latest ? TEI.forecastView.latest(client) : null;
    const saved = (client.preferences||{}).planSavedAt || S.savedAt;
    const stale = n ? V.staleLine(n, saved) : '';
    const [label, done] = V.sessionButton(client, 'planning');
    const disc = done ? '<button type="button" class="lk2 done-s" aria-disabled="true">' + TICK + label + '</button>' : '<button type="button" class="lk2 x-disc">' + label + '</button>';
    let h;
    if(n && doc) h = '<figure class="letter"><span class="qm" aria-hidden="true">“</span><blockquote>' + esc(n.text) + '”<span class="sig"><i></i>' + V.coachName() + (n.dateTxt ? ' · ' + n.dateTxt : '') + '</span>' + (stale ? '<span class="stale">' + stale + '</span>' : '') + '</blockquote></figure>' +
      '<div class="links"><button type="button" class="lk1 x-opendoc">Open your detailed forecast' + ARR + '</button>' + disc + '</div>';
    else if(n) h = '<figure class="letter"><span class="qm" aria-hidden="true">“</span><blockquote>' + esc(n.text) + '”<span class="sig"><i></i>' + V.coachName() + (n.dateTxt ? ' · ' + n.dateTxt : '') + '</span>' + (stale ? '<span class="stale">' + stale + '</span>' : '') + '</blockquote></figure>' +
      '<div class="links"><p class="nonote">Your coach adds a detailed forecast after your plan session.</p>' + disc + '</div>';
    else h = '<p class="nonote">Your coach adds a detailed forecast after your plan session.</p><div class="links" style="margin-left:0">' + disc + '</div>';
    const slot = q('.x-noteslot'); slot.innerHTML = h;
    const od = slot.querySelector('.x-opendoc'); if(od) od.onclick = ()=> TEI.forecastView.open(doc.id, 'planning');
    const db = slot.querySelector('.x-disc'); if(db) db.onclick = async ()=>{ db.disabled = true; if(await V.addToSession(client, 'planning', 'my forecast')) drawNote(client); else db.disabled = false; };
  }

  /* ---------- controls ---------- */
  function setMode(m, keep){
    S.mode = m;
    q('.modes').querySelectorAll('button').forEach(b=> b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false'));
    if(m === 'whatif' && !keep && same(S.draft, S.PLAN)) openAdj(true);
    render();
  }
  function openAdj(o){
    const adj = q('.adj'), ab = q('.adjbtn'), scrim = q('.scrim');
    adj.hidden = !o; ab.setAttribute('aria-expanded', o ? 'true' : 'false'); scrim.hidden = !(o && PHONE()); root().classList.toggle('sheet-open', !!(o && PHONE()));
    if(o){ fillAdj(); if(PHONE()){ const f = adj.querySelector('input'); if(f) f.focus(); } }
  }
  function fillAdj(){
    q('.x-inpmt').value = S.draft.pmt; q('.x-inp0').value = S.draft.p0; q('.x-inys').value = S.draft.ys; q('.x-inrise').value = +(S.draft.rise*100).toFixed(1);
    q('.vals').querySelectorAll('button').forEach(x=> x.setAttribute('aria-pressed', (x.dataset.v === '1') === S.real ? 'true' : 'false'));
    const ooAge = q('.x-ooage'); ooAge.min = String(S.AGE0 + 1); ooAge.max = String(END - 1); if(!ooAge.value) ooAge.value = String(Math.min(END - 1, S.AGE0 + 6));
    q('.x-oolist').innerHTML = S.draft.oo.map((o, i)=> '<span class="oo"><span class="fig">' + (o.amt < 0 ? '−' : '+') + fmt(Math.abs(o.amt)) + '</span> at ' + o.age + '<button type="button" data-i="' + i + '" aria-label="Remove this one-off"><svg viewBox="0 0 12 12" width="10" height="10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg></button></span>').join('');
    q('.x-oolist').querySelectorAll('button').forEach(b=> b.onclick = ()=>{ S.draft.oo.splice(+b.dataset.i, 1); edited(); });
  }
  function edited(){ if(S.mode !== 'whatif'){ S.mode = 'whatif'; q('.modes').querySelectorAll('button').forEach(b=> b.setAttribute('aria-pressed', b.dataset.m === 'whatif' ? 'true' : 'false')); } fillAdj(); render(); }
  async function savePlan(){
    const client = TEI.app.state.client; if(!client) return;
    const prefs = client.preferences = client.preferences || {};
    const before = Object.assign({}, prefs);
    if(S.hasAge) prefs.retirementAge = S.draft.R;
    prefs.yearlySpending = S.draft.ys;
    prefs.planSavingRise = Math.round(S.draft.rise*1000)/10;
    prefs.planOneOffs = S.draft.oo.map(o=> ({at:o.age, amt:o.amt}));
    prefs.planReal = S.real;
    prefs.planSavedAt = new Date().toISOString();
    const btn = q('.x-save'); btn.disabled = true;
    try{ await TEI.wealthOS.saveCashflowSettings(client.meta.clientId, client); }
    catch(err){
      console.error('Wealth OS: could not save the plan', err);
      Object.keys(prefs).forEach(k=> delete prefs[k]); Object.assign(prefs, before);
      btn.disabled = false; TEI.app.showToast('That did not save. Please try again.'); return;
    }
    btn.disabled = false;
    S.savedAt = prefs.planSavedAt;
    S.PLAN = clone(S.draft);
    drawNote(client); setMode('plan', true); openAdj(false); TEI.app.showToast('Saved as your plan');
  }
  function render(){
    q('.x-dirty').hidden = same(S.draft, S.PLAN);
    drawHero(); drawClose(); drawBand();
  }

  let wired = false;
  function wireOnce(){
    if(wired) return; wired = true;
    q('.modes').querySelectorAll('button').forEach(b=> b.onclick = ()=> setMode(b.dataset.m));
    q('.rates').querySelectorAll('button').forEach(b=> b.onclick = ()=>{ S.rate = +b.dataset.r; q('.rates').querySelectorAll('button').forEach(x=> x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); render(); });
    q('.x-ret').addEventListener('input', e=>{ const v = +e.target.value; if(S.mode === 'whatif') S.draft.R = v; else { S.PLAN.R = v; S.draft.R = v; } render(); });
    q('.adjbtn').onclick = ()=> openAdj(q('.adj').hidden);
    q('.scrim').onclick = ()=> openAdj(false);
    q('.x-done').onclick = ()=> openAdj(false);
    [['x-inpmt', 'pmt', 1], ['x-inp0', 'p0', 1], ['x-inys', 'ys', 1], ['x-inrise', 'rise', .01]].forEach(([c, k, m])=> q('.' + c).addEventListener('input', e=>{
      const v = parseFloat(e.target.value); if(isNaN(v) || v < 0) return;
      S.draft[k] = Math.round(v*m*10000)/10000;
      if(S.mode !== 'whatif'){ S.mode = 'whatif'; q('.modes').querySelectorAll('button').forEach(b=> b.setAttribute('aria-pressed', b.dataset.m === 'whatif' ? 'true' : 'false')); }
      render(); }));
    let ooDir = 'out';
    q('.dir').querySelectorAll('button').forEach(b=> b.onclick = ()=>{ ooDir = b.dataset.d; q('.dir').querySelectorAll('button').forEach(x=> x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); });
    q('.x-ooadd').onclick = ()=>{
      const a = parseInt(q('.x-ooage').value, 10), m = parseFloat(q('.x-ooamt').value);
      if(!(a > S.AGE0 && a < END) || !(m > 0)){ TEI.app.showToast('Enter an age from ' + (S.AGE0 + 1) + ' to ' + (END - 1) + ' and an amount'); return; }
      S.draft.oo.push({age:a, amt: ooDir === 'out' ? -m : m}); edited(); };
    q('.vals').querySelectorAll('button').forEach(b=> b.onclick = ()=>{ S.real = b.dataset.v === '1'; q('.vals').querySelectorAll('button').forEach(x=> x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); render(); });
    q('.x-reset').onclick = ()=>{ S.draft = clone(S.PLAN); fillAdj(); render(); TEI.app.showToast('Back to your figures'); };
    q('.x-save').onclick = savePlan;
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && root() && !q('.adj').hidden && PHONE()) openAdj(false); });
    const chart = q('.chart'), tip = q('.tip'), vl = q('.vline');
    chart.addEventListener('pointermove', e=>{
      if(!cd) return;
      const r = chart.getBoundingClientRect(), n = cd.ages.length; let i = Math.round((e.clientX - r.left)/r.width*(n - 1)); i = Math.max(0, Math.min(n - 1, i));
      const x = i/(n - 1)*100; vl.style.display = tip.style.display = 'block'; vl.style.left = x + '%'; tip.style.left = Math.min(Math.max(x, 16), 84) + '%';
      tip.innerHTML = '<span>Age ' + cd.ages[i] + '</span>' + cd.series.map(s=> '<i style="background:' + (s.ghost ? '#AEBBD0' : s.col || 'var(--champ)') + '"></i><b class="fig" style="font-weight:500">' + fk(s.v[i]) + '</b>').join('');
    });
    chart.addEventListener('pointerleave', ()=>{ vl.style.display = tip.style.display = 'none'; });
    window.addEventListener('resize', ()=>{ if(root() && !q('.adj').hidden) q('.scrim').hidden = !PHONE(); });
  }

  /* Forecast's model for other pages (Cashflow's Scenario corner): the
     client's own plan at 5% a year after inflation, with a different
     monthly saving. Same maths as this page. */
  function withPlan(client, fn){
    const keep = S;
    const P = planOf(client);
    S = {AGE0:P.AGE0, fiOverride:P.fiOverride, mult:P.mult, real:true, PLAN:P.plan, draft:P.plan, mode:'plan', rate:EXPECTED_RATE};
    try{ return fn(P); } finally { S = keep; }
  }
  TEI.forecast = {
    project(client, monthly){
      return withPlan(client, P=>{
        const p = Object.assign({}, P.plan, {pmt: monthly});
        const fa = fiAge(p, EXPECTED_RATE);
        return {age:P.AGE0, retireAge:p.R, atRetire: atR(p, EXPECTED_RATE), fiAge: fa, fiLabel: fa != null ? 'Free at ' + fa : 'Not by 80'};
      });
    },
    /* Opens Forecast in What if with the monthly saving raised (Cashflow's "See it on Forecast"). */
    whatIf(extraMonthly){ pendingWhatIf = extraMonthly; TEI.app.showPage('planning'); }
  };
  let pendingWhatIf = null;

  TEI.render.planning = function(client){
    if(!S || S.clientId !== client.meta.clientId){
      const P = planOf(client);
      S = {clientId: client.meta.clientId, AGE0:P.AGE0, hasAge:P.hasAge, fiOverride:P.fiOverride, mult:P.mult, real:P.real,
        PLAN: clone(P.plan), draft: clone(P.plan), mode:'plan', rate:EXPECTED_RATE, savedAt:null};
    }
    wireOnce();
    V.syncEye();
    q('.x-noage').hidden = S.hasAge;
    if(pendingWhatIf){ S.draft = clone(S.PLAN); S.draft.pmt += pendingWhatIf; pendingWhatIf = null; setMode('whatif', true); openAdj(true); }
    else render();
    drawNote(client);
    intro = false;
  };
})();
