window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

(function(){
  /* Forecast (redesign B12.7, spec B7, boards Forecast and ForecastMobile).
     One model: the chart, the headline, every tile and the range of
     outcomes all run TEI.calc.projectSeries month by month, with the same
     saving, yearly rise and one-offs (B7 "One model only").
     Locked assumptions, set by the coach and shown, not editable: growth
     2/5/8% a year, inflation 2.5% a year, FI number = 25 x yearly spending
     (fiMultiple / fiOverride respected). What-ifs live in `st` for the
     session only; Save as my plan writes retirement age and yearly
     spending to Plan settings, nothing else. */
  const {fmtGBP} = TEI.data;
  const EXPECTED_RATE = 0.05;           // the middle growth option (B7.1)
  TEI.calc.EXPECTED_RATE = EXPECTED_RATE; // Home's actual-vs-plan line uses the same middle case
  const RATES = [0.02, 0.05, 0.08];
  const INFLATION = 0.025;
  const DEFAULT_RETIRE_AGE = 60;        // Confirmed by Paddy (Oct 2026): 60 when no retirement age is set.
  const DEFAULT_YEARS = 25;             // horizon when there is no date of birth
  const MC_PATHS = 500, MC_SPREAD = 0.13, MC_SEED = 0x2F6B1D;
  const LONG_MONTHS = 600;
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const $ = id => document.getElementById(id);
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function setText(id, t){ const el = $(id); if(el) el.textContent = t; }
  function k(n){
    const a = Math.abs(n), sign = n < 0 ? '-' : '';
    if(a >= 1e6) return sign + '£' + (a/1e6).toFixed(2) + 'm';
    if(a >= 1000) return sign + '£' + Math.round(a/1000) + 'k';
    return sign + '£' + Math.round(a);
  }
  function round1000(n){ return Math.round(n/1000)*1000; }
  function monthLabel(offset){ const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth()+offset, 1); return MON[d.getMonth()] + ' ' + d.getFullYear(); }

  /* ---------- the client's own figures (Adjust defaults) ---------- */
  function ageNow(client){
    const dob = (client.personal||{}).dob;
    if(!dob) return null;
    const d = new Date(dob), n = new Date();
    if(isNaN(d)) return null;
    let a = n.getFullYear() - d.getFullYear();
    if(n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
    return a >= 0 && a < 110 ? a : null;
  }
  function myFigures(client){
    const prefs = client.preferences || {};
    const age = ageNow(client);
    const budget = TEI.calc.computeBudgetAndFI(client);
    let ret = prefs.retirementAge != null ? Number(prefs.retirementAge) : DEFAULT_RETIRE_AGE;
    if(age != null) ret = Math.max(ret, age + 1);
    return {
      pmt: Math.round(TEI.calc.actualTotalSavingInvesting(client)),
      p0: Math.round(TEI.calc.latestNetWorth(client)),
      ret,
      years: DEFAULT_YEARS,
      ys: prefs.yearlySpending != null ? Number(prefs.yearlySpending) : round1000(budget.annualSpend || 0),
      rise: 0
    };
  }

  /* What-if state: session only (B7.2 Persistence). */
  let st = null;
  function freshState(client){
    const f = myFigures(client);
    return {clientId: client.meta.clientId, base: f, pmt: f.pmt, p0: f.p0, ret: f.ret, years: f.years, ys: f.ys, rise: f.rise,
      oneOffs: [], g: EXPECTED_RATE, real: true, mode: 'plan', saved: false,
      ooAge: null, ooAmt: 20000, ooOut: false};
  }
  function changed(){
    const b = st.base;
    return st.pmt !== b.pmt || st.p0 !== b.p0 || st.ret !== b.ret || st.years !== b.years || st.ys !== b.ys || st.rise !== b.rise || st.oneOffs.length > 0;
  }

  /* ---------- the model ---------- */
  function model(client){
    const age = ageNow(client);
    const prefs = client.preferences || {};
    const years = age != null ? Math.max(1, st.ret - age) : Math.max(1, st.years);
    const N = years * 12;
    const mult = prefs.fiMultiple || 25;
    const FI = prefs.fiOverride != null ? Number(prefs.fiOverride) : st.ys * mult;
    const OO = {};
    st.oneOffs.forEach(o=>{
      const m = (age != null ? (o.at - age) : o.at) * 12;
      if(m > 0 && m <= LONG_MONTHS) OO[m] = (OO[m]||0) + o.amt;
    });
    const rise = st.rise / 100;
    const run = (rate, pmt, months, extra) => TEI.calc.projectSeries(st.p0, pmt, rate/12, months, Object.assign({rise, oneOffs: OO}, extra||{}));
    const dfl = m => st.real ? Math.pow(1+INFLATION, m/12) : 1;
    const fiAt = m => st.real ? FI : FI * Math.pow(1+INFLATION, m/12);
    const dv = a => a.map((v,m)=> v / dfl(m));
    const midN = run(st.g, st.pmt, N);
    const mid = dv(midN);
    const long = run(st.g, st.pmt, LONG_MONTHS);
    let fiM = -1;
    if(FI > 0) for(let m=0; m<=LONG_MONTHS; m++){ if(long[m] / dfl(m) >= fiAt(m)){ fiM = m; break; } }
    return {age, years, N, FI, mult, OO, rise, run, dfl, fiAt, dv, midN, mid, fiM, override: prefs.fiOverride != null};
  }
  // The label for a point `y` years from today: an age, or a year count.
  function atLabel(M, y){ return M.age != null ? String(M.age + y) : 'year ' + y; }
  function horizonLabel(M){ return M.age != null ? 'At ' + (M.age + M.years) : 'In ' + M.years + ' years'; }
  function byLabel(M){ return M.age != null ? 'by ' + (M.age + M.years) : 'in ' + M.years + ' years'; }

  /* ---------- hero chart ---------- */
  function renderHero(client, M){
    const gold = '#E8D6A8', pale = '#9DB4D8', grey = '#AAB6C8';
    const N = M.N;
    let S, lo = null, hi = null;
    if(st.mode === 'hyp'){
      S = [{a: M.mid, col: gold, dash: '', style: 'solid', label: 'Keep saving ' + fmtGBP(st.pmt) + ' a month'},
           {a: M.dv(M.run(st.g, st.pmt + 200, N)), col: pale, dash: '', style: 'solid', label: 'Save ' + fmtGBP(st.pmt + 200) + ' a month'},
           {a: M.dv(M.run(st.g, 0, N)), col: grey, dash: '5 6', style: 'dashed', label: 'Stop saving today'}];
    } else if(st.mode === 'order'){
      S = [{a: M.dv(M.run(st.g, st.pmt, N, {shocks: {12: 0.75}})), col: gold, dash: '', style: 'solid', label: '25% fall in your first year'},
           {a: M.dv(M.run(st.g, st.pmt, N, {shocks: {[N]: 0.75}})), col: grey, dash: '5 6', style: 'dashed', label: 'Same fall in your final year'}];
    } else {
      lo = M.dv(M.run(0.02, st.pmt, N)); hi = M.dv(M.run(0.08, st.pmt, N));
      S = [{a: M.mid, col: gold, dash: '', style: 'solid', label: 'Your path at ' + Math.round(st.g*100) + '% a year'}];
    }
    let mx = Math.max(M.fiAt(N) * 1.18, M.mid[N] * 1.22, 1);
    S.forEach(s=>{ mx = Math.max(mx, s.a[N] * 1.1); });
    const Y = v => 196 - Math.min(Math.max(v,0), mx*1.03) / mx * 186;
    const X = m => m / N * 600;
    const step = Math.max(1, Math.floor(N/200));
    const pth = a => { let p = ''; for(let m=0; m<=N; m+=step) p += (m ? 'L' : 'M') + X(m).toFixed(1) + ' ' + Y(a[m]).toFixed(1); if(N % step) p += 'L600 ' + Y(a[N]).toFixed(1); return p; };
    let band = '';
    if(hi){ band = pth(hi); for(let b=N - (N % step); b>=0; b-=step) band += 'L' + X(b).toFixed(1) + ' ' + Y(lo[b]).toFixed(1); band += ' Z'; }
    const fia = []; for(let f=0; f<=N; f++) fia.push(M.fiAt(f));
    $('fcSvg').innerHTML = (band ? `<path class="fc-band" d="${band}"></path>` : '') +
      (M.FI > 0 ? `<path class="fc-fi" d="${pth(fia)}"></path>` : '') +
      S.slice().reverse().map((s,i)=> `<path class="fc-line hm-draw${i === S.length-1 ? ' fc-line-main' : ''}" d="${pth(s.a)}" stroke="${s.col}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}></path>`).join('');
    $('fcSvg').setAttribute('aria-label', 'Projected wealth to ' + horizonLabel(M).toLowerCase().replace(/^at /, 'age ') + ', ending at ' + k(M.mid[N]) + (st.real ? ' in today\'s money' : ''));

    // y axis: about four steps
    const raw = mx/4, p10 = Math.pow(10, Math.floor(Math.log10(raw))), nn = raw/p10;
    const yStep = (nn <= 1 ? 1 : nn <= 2 ? 2 : nn <= 2.5 ? 2.5 : nn <= 5 ? 5 : 10) * p10;
    let yHtml = '', gHtml = '';
    for(let v=0; v<=mx; v+=yStep){
      const top = (Y(v)/2).toFixed(2) + '%';
      yHtml += `<span style="top:${top}">${v === 0 ? '£0' : k(v)}</span>`;
      gHtml += `<i style="top:${top}"></i>`;
    }
    $('fcYAxis').innerHTML = yHtml;
    $('fcGridLines').innerHTML = gHtml;

    // x axis: every five years, and the end
    const ticks = [];
    for(let y=0; y<M.years; y+=5) ticks.push(y);
    if(ticks.length > 1 && M.years - ticks[ticks.length-1] < 3) ticks.pop();
    ticks.push(M.years);
    const y0 = new Date().getFullYear();
    $('fcXAxis').innerHTML = ticks.map((y,i)=>{
      const last = i === ticks.length-1;
      const cls = i === 0 ? 'fc-x-first' : last ? 'fc-x-last' : '';
      const top = M.age != null ? (i === 0 ? 'Age ' + M.age : String(M.age + y)) : (i === 0 ? 'Today' : y + ' yrs');
      return `<span class="${cls}" style="left:${(y/M.years*100).toFixed(2)}%">${top}<small>${y0 + y}</small></span>`;
    }).join('');

    // FI marker and one-off markers
    let marks = '';
    if(st.mode === 'plan' && M.fiM >= 0 && M.fiM <= N){
      const left = (X(M.fiM)/6).toFixed(2) + '%', top = (Y(M.mid[M.fiM])/2).toFixed(2) + '%';
      marks += `<span class="fc-fi-dot" style="left:${left}; top:${top}"></span><span class="fc-fi-tag mono" style="left:${left}; top:${top}">FI ${M.age != null ? 'at ' + (M.age + Math.floor(M.fiM/12)) : 'in ' + Math.floor(M.fiM/12) + ' yrs'}</span>`;
    }
    Object.keys(M.OO).map(Number).filter(m=> m <= N).forEach(m=>{
      const amt = M.OO[m];
      marks += `<span class="fc-oo-line" style="left:${(m/N*100).toFixed(2)}%"></span><span class="fc-oo-tag mono" style="left:${(m/N*100).toFixed(2)}%">${amt < 0 ? '−' : '+'}${k(Math.abs(amt))}</span>`;
    });
    $('fcMarks').innerHTML = marks;

    $('fcLegend').innerHTML = S.map(s=> `<span><i style="border-top:2px ${s.style} ${s.col}"></i>${esc(s.label)}</span>`).join('') +
      (M.FI > 0 ? '<span><i class="fc-k-fi"></i>FI number</span>' : '');

    // headline
    const end = M.mid[N], diff = end - M.fiAt(N);
    setText('fcAt', horizonLabel(M) + ', you are on course for');
    setText('fcEnd', k(end));
    setText('fcAdjEnd', k(end));
    setText('fcMoneyNote', st.real ? 'In today\'s money' : 'In future money');
    setText('fcGap', M.FI > 0 ? fmtGBP(round1000(Math.abs(diff))) + (diff >= 0 ? ' above your FI number' : ' short of your FI number') : 'Add your yearly spending to see your FI number');
    $('fcDobNote').hidden = M.age != null;

    let insight;
    if(st.mode === 'hyp'){
      insight = 'Stopping today would leave you ' + k(end - S[2].a[N]) + ' lower ' + byLabel(M) + '. Another £200 a month would add ' + k(S[1].a[N] - end) + '.';
    } else if(st.mode === 'order'){
      insight = 'Same returns, different order. A fall just before you stop work costs ' + k(S[0].a[N] - S[1].a[N]) + ' more than the same fall early on, because there is more money in the pot when it lands.';
    } else if(M.FI <= 0){
      insight = 'Add your yearly spending in Adjust to see when you could reach financial independence. The shaded band shows 2% to 8% a year.';
    } else {
      const fiY = Math.floor(M.fiM/12);
      if(M.fiM < 0) insight = 'On your current path you do not reach your FI number in the next ' + (LONG_MONTHS/12) + ' years.';
      else if(M.fiM <= N) insight = 'On your current path you reach your FI number ' + (M.age != null ? 'at ' + (M.age + fiY) + ', ' + (M.years - fiY) + (M.years - fiY === 1 ? ' year' : ' years') + ' before your planned retirement.' : 'in ' + fiY + (fiY === 1 ? ' year.' : ' years.'));
      else insight = 'On your current path you reach your FI number ' + (M.age != null ? 'at ' + (M.age + fiY) + ', after your planned retirement at ' + (M.age + M.years) + '.' : 'in ' + fiY + ' years, after your planned retirement.');
      insight += ' The shaded band shows 2% to 8% a year.';
    }
    setText('fcInsight', insight);

    document.querySelectorAll('[data-fc-mode]').forEach(b=> b.setAttribute('aria-pressed', b.dataset.fcMode === st.mode ? 'true' : 'false'));
    document.querySelectorAll('[data-fc-rate]').forEach(b=> b.setAttribute('aria-pressed', Number(b.dataset.fcRate) === st.g ? 'true' : 'false'));
    document.querySelectorAll('[data-fc-real]').forEach(b=> b.setAttribute('aria-pressed', (b.dataset.fcReal === '1') === st.real ? 'true' : 'false'));
  }

  /* ---------- Adjust strip ---------- */
  function renderAdjust(client, M){
    const state = st.saved ? 'saved to Plan settings' : (changed() ? 'what-if, not saved' : 'your figures');
    setText('fcAdjState', 'Adjust · ' + state);
    setText('fcAdjStateM', state.charAt(0).toUpperCase() + state.slice(1));
    setText('fcAdjOpenLabel', 'Adjust · ' + state);
    const save = $('fcSave');
    save.textContent = st.saved ? 'Saved' : 'Save as my plan';
    const set = (id, v)=>{ const el = $(id); if(document.activeElement !== el) el.value = String(v); };
    set('fcInPmt', st.pmt); set('fcInP0', st.p0); set('fcInYs', st.ys); set('fcInRise', st.rise);
    const ret = $('fcInRet');
    if(M.age != null){
      setText('fcInRetLabel', 'Retire at');
      ret.min = String(Math.max(55, M.age + 1)); ret.max = String(Math.max(68, M.age + 1));
      set('fcInRet', st.ret);
    } else {
      setText('fcInRetLabel', 'Years to go');
      ret.min = '1'; ret.max = '50';
      set('fcInRet', st.years);
    }
    const ooAge = $('fcOoAge');
    setText('fcOoAgeLabel', M.age != null ? 'At age' : 'In years');
    const ooMin = M.age != null ? M.age + 1 : 1, ooMax = M.age != null ? M.age + M.years : M.years;
    ooAge.min = String(ooMin); ooAge.max = String(ooMax);
    if(st.ooAge == null || st.ooAge < ooMin || st.ooAge > ooMax) st.ooAge = Math.min(ooMax, ooMin + 4);
    set('fcOoAge', st.ooAge); set('fcOoAmt', st.ooAmt);
    document.querySelectorAll('[data-fc-dir]').forEach(b=> b.setAttribute('aria-pressed', (b.dataset.fcDir === 'out') === st.ooOut ? 'true' : 'false'));
    $('fcOoAdd').disabled = st.oneOffs.length >= 4;
    $('fcOoList').innerHTML = st.oneOffs.map((o,i)=>{
      const label = (o.amt < 0 ? '−' : '+') + k(Math.abs(o.amt)) + (M.age != null ? ' at ' + o.at : ' in ' + o.at + ' yrs');
      return `<span class="fc-oo-chip">${label}<button type="button" data-fc-oo-remove="${i}" aria-label="Remove ${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`;
    }).join('');
  }

  /* ---------- right column ---------- */
  function renderOverview(client, M){
    const onTrack = M.fiM >= 0 && M.fiM <= M.N;
    const chip = $('fcStatus');
    chip.textContent = M.FI > 0 ? (onTrack ? 'On track' : 'Behind plan') : 'No FI number yet';
    chip.className = 'fc-chip' + (onTrack ? ' fc-chip-on' : '');
    setText('fcFiNum', M.FI > 0 ? fmtGBP(M.FI) : '–');
    setText('fcFiHow', M.override ? 'Set by your coach' : (M.FI > 0 ? M.mult + ' × ' + fmtGBP(st.ys) + ' a year' : 'Add your yearly spending'));
    if(M.fiM >= 0){
      setText('fcFiAge', M.age != null ? 'Age ' + (M.age + Math.floor(M.fiM/12)) : 'In ' + Math.floor(M.fiM/12) + ' yrs');
      setText('fcFiWhen', monthLabel(M.fiM));
    } else {
      setText('fcFiAge', M.FI > 0 ? 'After ' + (M.age != null ? M.age + LONG_MONTHS/12 : LONG_MONTHS/12 + ' yrs') : '–');
      setText('fcFiWhen', '');
    }
    const range = $('fcRetRange');
    if(M.age != null){
      setText('fcRetRangeLabel', 'Planned retirement age');
      range.min = String(Math.max(55, M.age + 1)); range.max = String(Math.max(68, M.age + 1));
      range.value = String(st.ret);
      setText('fcRetVal', String(st.ret));
    } else {
      setText('fcRetRangeLabel', 'Years until you stop work');
      range.min = '1'; range.max = '50';
      range.value = String(st.years);
      setText('fcRetVal', String(st.years));
    }
    setText('fcRetMin', range.min); setText('fcRetMax', range.max);
    const pct = Math.round(st.g*100);
    setText('fcStatusNote', M.FI <= 0 ? 'Add your yearly spending in Adjust to see this.' :
      onTrack ? 'Your current saving reaches your FI number before you plan to stop work, at ' + pct + '% a year growth.'
              : 'At ' + pct + '% a year, your current saving reaches your FI number after you plan to stop work.');
  }

  function renderComposition(client, M){
    const N = M.N, tot = M.midN[N], end = M.mid[N];
    const grown = M.run(st.g, 0, N, {oneOffs: {}})[N];
    let paid = 0; for(let q=1; q<=N; q++) paid += st.pmt * Math.pow(1 + M.rise, Math.floor((q-1)/12));
    const growth = Math.max(0, tot - grown - paid);
    const parts = [[grown, 'Today\'s pot, grown', 'fc-c1'], [paid, 'New saving', 'fc-c2'], [growth, 'Growth on new saving', 'fc-c3']];
    const sum = parts.reduce((s,p)=> s + Math.max(0, p[0]), 0) || 1;
    setText('fcCompK', 'Where your ' + k(end) + ' comes from');
    setText('fcCompTitle', grown >= paid + growth ? 'Today\'s pot does most of the work' : 'Today\'s habits do most of the work');
    $('fcCompBar').innerHTML = parts.map(p=> `<span class="${p[2]}" style="width:${(Math.max(0,p[0])/sum*100).toFixed(1)}%"></span>`).join('');
    $('fcCompBar').setAttribute('aria-label', parts.map(p=> p[1] + ' ' + Math.round(Math.max(0,p[0])/sum*100) + '%').join(', '));
    $('fcCompKey').innerHTML = parts.map(p=> `<div><p><i class="${p[2]}"></i>${p[1]}</p><b>${k(Math.max(0,p[0])/sum*end)}</b><small class="mono">${Math.round(Math.max(0,p[0])/sum*100)}%</small></div>`).join('');
    const plus = (M.run(st.g, st.pmt + 100, N)[N] - tot) / M.dfl(N);
    setText('fcPlus100', '+' + k(plus));
    setText('fcPlusText', 'Every extra £100 a month from today adds roughly this ' + byLabel(M) + '.');
    return {paid, grown, growth, plus};
  }

  function renderIndependence(client, M){
    if(M.FI <= 0){
      ['fcFiPct','fcCoastPct'].forEach(id=> setText(id, '–'));
      $('fcFiBar').style.width = '0%'; $('fcCoastBar').style.width = '0%';
      setText('fcFiNote', 'Add your yearly spending to see your FI number.');
      setText('fcCoastLabel', 'Coast FI'); setText('fcCoastNote', '');
      return;
    }
    const fiPct = Math.min(100, st.p0 / M.FI * 100);
    setText('fcFiPct', Math.round(fiPct) + '%');
    $('fcFiBar').style.width = fiPct.toFixed(1) + '%';
    setText('fcFiNote', fmtGBP(st.p0) + ' of ' + fmtGBP(M.FI) + '. Enough to live on your investments without working.');
    // Coast FI: what today's pot would need to be to grow to the FI number by retirement with no more saving.
    const fiThen = M.FI * Math.pow(1+INFLATION, M.N/12);
    const need = fiThen / Math.pow(1 + st.g/12, M.N);
    const coast = Math.min(100, st.p0 / need * 100);
    setText('fcCoastLabel', 'Coast FI ' + byLabel(M));
    setText('fcCoastPct', Math.round(coast) + '%');
    $('fcCoastBar').style.width = coast.toFixed(1) + '%';
    setText('fcCoastNote', coast >= 100
      ? 'You have reached Coast FI. With no more saving at all, today\'s pot is projected to grow to your FI number ' + byLabel(M) + '.'
      : 'You would need ' + fmtGBP(round1000(need)) + ' invested today to coast to your FI number ' + byLabel(M) + ' with no more saving.');
  }

  /* Range of outcomes: 500 paths, fixed seed so results are stable. Each
     year draws one return (average = the chosen growth, spread 13%) and the
     path runs month by month through projectSeries with the same saving,
     rise and one-offs as the main line. */
  function renderOutcomes(client, M){
    let seed = MC_SEED;
    const rnd = ()=>{ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const N = M.N, Yr = M.years, fin = [];
    const tgt = M.fiAt(N), dd = M.dfl(N);
    let hit = 0;
    for(let p=0; p<MC_PATHS; p++){
      const yr = [];
      for(let y=0; y<Yr; y++){ const z = Math.sqrt(-2*Math.log(rnd() || 1e-9)) * Math.cos(2*Math.PI*rnd()); yr.push(Math.max(-0.5, st.g + MC_SPREAD*z)); }
      const v = M.run(st.g, st.pmt, N, {rateAt: m=> yr[Math.floor((m-1)/12)]/12})[N] / dd;
      fin.push(v);
      if(M.FI > 0 && v >= tgt) hit++;
    }
    fin.sort((a,b)=> a-b);
    const p10 = fin[Math.floor(MC_PATHS*0.1)], p50 = fin[Math.floor(MC_PATHS*0.5)], p90 = fin[Math.floor(MC_PATHS*0.9)];
    const tens = Math.round(hit / (MC_PATHS/10));
    setText('fcMcHead', M.FI > 0 ? tens + ' in 10 paths reach your FI number ' + byLabel(M) : 'Where 500 market paths could leave you ' + byLabel(M));
    $('fcMcDots').innerHTML = M.FI > 0 ? Array.from({length:10}, (_,i)=> `<i class="${i < tens ? 'on' : ''}"></i>`).join('') : '';
    const sc = Math.max(p90, tgt) * 1.08 || 1;
    const pc = x => (x/sc*100).toFixed(1) + '%';
    $('fcMcTrack').innerHTML = `<span class="fc-mc-base"></span><span class="fc-mc-range hm-grow" style="left:${pc(p10)}; width:${((p90-p10)/sc*100).toFixed(1)}%"></span><span class="fc-mc-med" style="left:${pc(p50)}"></span>` +
      (M.FI > 0 ? `<span class="fc-mc-fi" style="left:${pc(tgt)}"></span><span class="fc-mc-fi-tag mono" style="left:${pc(tgt)}">FI number</span>` : '');
    setText('fcP10', k(p10)); setText('fcP50', k(p50)); setText('fcP90', k(p90));
    setText('fcMcNote', MC_PATHS + ' simulated market paths at ' + Math.round(st.g*100) + '% average growth, with ups and downs like real markets. Value ' + byLabel(M) + ', ' + (st.real ? 'in today\'s money' : 'in future money') + '.');
  }

  function renderKnow(client, M){
    const items = [
      ['Growth is after charges.', 'Your chosen rate applies to everything you hold. Real returns vary year to year and can be negative.'],
      ['Inflation at 2.5% a year.', 'Today\'s money shows what future sums would buy now.'],
      st.rise ? ['Saving starts at ' + fmtGBP(st.pmt) + ' a month and rises ' + st.rise + '% a year.', 'Rises are your what-if, not a forecast of pay.']
              : ['Saving stays at ' + fmtGBP(st.pmt) + ' a month.', 'Pay rises and higher contributions are not assumed, so this leans cautious.'],
      M.override ? ['Your FI number is set by your coach.', 'It is ' + fmtGBP(M.FI) + '. A rule of thumb, not a guarantee.']
                 : ['FI number is ' + M.mult + ' times yearly spending.', 'Based on ' + fmtGBP(st.ys) + ' a year. A rule of thumb, not a guarantee.'],
      ['Tax, fees and pension access rules are simplified.', 'Your coach\'s forecast covers these in more detail.']
    ];
    $('fcKnow').innerHTML = items.map(i=> `<li><span class="fc-dotk" aria-hidden="true"></span><span><strong>${esc(i[0])}</strong> <span class="fc-muted">${esc(i[1])}</span></span></li>`).join('');
  }

  function renderSteps(client, M, comp){
    const newPct = Math.round(comp.paid / Math.max(1, comp.paid + comp.grown + comp.growth) * 100);
    const steps = [
      ['01', 'Keep ' + fmtGBP(st.pmt) + ' a month going in', 'New saving builds ' + newPct + '% of your pot ' + byLabel(M) + '.', ''],
      ['02', 'Test £100 more a month', 'Adds roughly ' + k(comp.plus) + ' ' + byLabel(M) + '. Try it in What if above.', ''],
      // TODO(B12.9): a step the coach sets for this client. Until there is a
      // field for it, this card points to the next session.
      ['03', 'Agree your next step with your coach', 'At your next session, pick the one change worth testing here.', 'fc-step-champ']
    ];
    $('fcSteps').innerHTML = steps.map(s=> `<li class="${s[3]}"><span class="mono fc-gold-t">${s[0]}</span><b>${esc(s[1])}</b><span class="fc-muted">${esc(s[2])}</span></li>`).join('');
  }

  /* Coach's corner: the coach's own note for Forecast when they wrote one,
     otherwise the top Forecast signal (the same engine as Wealth and Goals). */
  function computeForecastCoach(client){
    const fc = client.forecastCoach || {};
    if(fc.mode==='manual' && fc.message) return {message:fc.message};
    const s = TEI.calc.pickTopSignal(client, 'forecast');
    return {message: s ? s.message : 'Increasing your monthly investment, even by a small amount, could bring your financial independence target closer.'};
  }

  /* ---------- render ---------- */
  function renderAll(client){
    const M = model(client);
    renderHero(client, M);
    renderAdjust(client, M);
    renderOverview(client, M);
    const comp = renderComposition(client, M);
    renderIndependence(client, M);
    renderOutcomes(client, M);
    renderKnow(client, M);
    renderSteps(client, M, comp);
  }
  let pending = 0;
  function rerender(){
    const client = TEI.app.state.client;
    if(!client || !st) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(()=> renderAll(client));
  }

  /* ---------- Save as my plan (B7.2): retirement age and yearly spending only ---------- */
  async function savePlan(){
    const client = TEI.app.state.client;
    if(!client || !st) return;
    const btn = $('fcSave');
    const prefs = client.preferences = client.preferences || {};
    const before = {retirementAge: prefs.retirementAge, yearlySpending: prefs.yearlySpending};
    if(ageNow(client) != null) prefs.retirementAge = st.ret;
    prefs.yearlySpending = st.ys;
    btn.disabled = true;
    try{
      await TEI.wealthOS.saveCashflowSettings(client.meta.clientId, client);
    } catch(err){
      console.error('Wealth OS: could not save Plan settings', err);
      Object.assign(prefs, before);
      btn.disabled = false;
      TEI.app.showToast('That did not save. Please try again.');
      return;
    }
    btn.disabled = false;
    // The saved figures are now "your figures"; what-ifs other than these two stay as they are.
    st.base = Object.assign({}, st.base, {ret: st.ret, ys: st.ys});
    st.saved = true;
    TEI.app.showToast('Saved to Plan settings');
    rerender();
  }

  function num(el, lo, hi){
    let v = parseFloat(el.value);
    if(isNaN(v)) return null;
    if(lo != null) v = Math.max(lo, v);
    if(hi != null) v = Math.min(hi, v);
    return v;
  }

  /* ---------- phone Adjust sheet ---------- */
  let lastFocus = null;
  function openSheet(){
    lastFocus = document.activeElement;
    $('fcAdj').classList.add('open');
    $('fcAdjScrim').hidden = false;
    $('fcAdjOpen').setAttribute('aria-expanded', 'true');
    $('fcAdj').setAttribute('role', 'dialog');
    $('fcAdj').setAttribute('aria-modal', 'true');
    const f = $('fcInPmt'); if(f) f.focus();
  }
  function closeSheet(){
    if(!$('fcAdj').classList.contains('open')) return;
    $('fcAdj').classList.remove('open');
    $('fcAdjScrim').hidden = true;
    $('fcAdjOpen').setAttribute('aria-expanded', 'false');
    $('fcAdj').setAttribute('role', 'group');
    $('fcAdj').removeAttribute('aria-modal');
    if(lastFocus && lastFocus.offsetParent) lastFocus.focus();
  }

  let wired = false;
  function wireOnce(){
    if(wired) return;
    wired = true;
    const client = ()=> TEI.app.state.client;
    const age = ()=> ageNow(client());
    const onInput = (id, fn)=> $(id).addEventListener('input', ()=>{ fn(); st.saved = false; rerender(); });
    onInput('fcInPmt', ()=>{ const v = num($('fcInPmt'), 0); if(v != null) st.pmt = v; });
    onInput('fcInP0', ()=>{ const v = num($('fcInP0'), 0); if(v != null) st.p0 = v; });
    onInput('fcInYs', ()=>{ const v = num($('fcInYs'), 5000); if(v != null) st.ys = v; });
    onInput('fcInRise', ()=>{ const v = num($('fcInRise'), 0, 10); if(v != null) st.rise = v; });
    const setRet = el=>{
      const a = age();
      const v = a != null ? num(el, Math.max(55, a+1), Math.max(68, a+1)) : num(el, 1, 50);
      if(v == null) return;
      if(a != null) st.ret = Math.round(v); else st.years = Math.round(v);
    };
    onInput('fcInRet', ()=> setRet($('fcInRet')));
    onInput('fcRetRange', ()=> setRet($('fcRetRange')));
    // Typed values are tidied to their limits when the box is left.
    ['fcInPmt','fcInP0','fcInYs','fcInRise','fcInRet'].forEach(id=> $(id).addEventListener('change', rerender));
    $('fcOoAge').addEventListener('input', ()=>{ const v = parseInt($('fcOoAge').value, 10); if(!isNaN(v)) st.ooAge = v; });
    $('fcOoAmt').addEventListener('input', ()=>{ const v = num($('fcOoAmt'), 0); if(v != null) st.ooAmt = v; });
    document.querySelectorAll('[data-fc-dir]').forEach(b=> b.addEventListener('click', ()=>{ st.ooOut = b.dataset.fcDir === 'out'; rerender(); }));
    $('fcOoAdd').addEventListener('click', ()=>{
      const a = age(), years = a != null ? st.ret - a : st.years;
      const lo = a != null ? a+1 : 1, hi = a != null ? a + years : years;
      const at = Math.min(hi, Math.max(lo, Math.round(st.ooAge || lo)));
      if(!st.ooAmt || st.oneOffs.length >= 4) return;
      st.oneOffs.push({at, amt: st.ooOut ? -st.ooAmt : st.ooAmt});
      st.saved = false;
      rerender();
    });
    $('fcOoList').addEventListener('click', e=>{
      const b = e.target.closest('[data-fc-oo-remove]');
      if(!b) return;
      st.oneOffs.splice(Number(b.dataset.fcOoRemove), 1);
      rerender();
    });
    $('fcReset').addEventListener('click', ()=>{
      const base = st.base;
      Object.assign(st, {pmt: base.pmt, p0: base.p0, ret: base.ret, years: base.years, ys: base.ys, rise: base.rise, oneOffs: [], saved: false});
      rerender();
    });
    $('fcSave').addEventListener('click', savePlan);
    document.querySelectorAll('[data-fc-mode]').forEach(b=> b.addEventListener('click', ()=>{ st.mode = b.dataset.fcMode; rerender(); }));
    document.querySelectorAll('[data-fc-rate]').forEach(b=> b.addEventListener('click', ()=>{ st.g = Number(b.dataset.fcRate); rerender(); }));
    document.querySelectorAll('[data-fc-real]').forEach(b=> b.addEventListener('click', ()=>{ st.real = b.dataset.fcReal === '1'; rerender(); }));
    $('fcAdjOpen').addEventListener('click', openSheet);
    $('fcDone').addEventListener('click', closeSheet);
    $('fcAdjScrim').addEventListener('click', closeSheet);
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeSheet(); });
  }

  /* Forecast's model for other pages (Cashflow's Scenario corner, B8): the
     client's own figures, not this session's what-ifs, at 5% a year in
     today's money. monthly replaces the monthly saving. Returns the value at
     retirement, the months until the FI number and how to label them. */
  TEI.forecast = {
    project(client, monthly){
      const f = myFigures(client);
      const prefs = client.preferences || {};
      const age = ageNow(client);
      const years = age != null ? Math.max(1, f.ret - age) : f.years;
      const N = years*12;
      const FI = prefs.fiOverride != null ? Number(prefs.fiOverride) : f.ys * (prefs.fiMultiple || 25);
      const series = TEI.calc.projectSeries(f.p0, monthly, EXPECTED_RATE/12, LONG_MONTHS);
      const real = m => series[m] / Math.pow(1+INFLATION, m/12);
      let fiM = -1;
      if(FI > 0) for(let m=0; m<=LONG_MONTHS; m++){ if(real(m) >= FI){ fiM = m; break; } }
      return {age, years, retireAge: age != null ? f.ret : null, atRetire: real(N), fiMonth: fiM,
        fiLabel: fiM < 0 ? (FI > 0 ? 'Not within ' + (LONG_MONTHS/12) + ' years' : 'No FI number yet') : (age != null ? 'Age ' + (age + Math.floor(fiM/12)) : 'In ' + Math.floor(fiM/12) + ' yrs')};
    }
  };

  TEI.render.planning = function(client){
    wireOnce();
    if(!st || st.clientId !== client.meta.clientId) st = freshState(client);
    setText('fcMessage', computeForecastCoach(client).message);
    renderAll(client);
  };
})();

