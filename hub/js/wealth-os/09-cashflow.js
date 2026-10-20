window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

(function(){
  /* Cashflow (redesign B12.8, spec B8, boards Cashflow and CashflowMobile).
     Behavioural coaching around the wealth conversion rate. Every figure is
     TEI.calc.cashflowMonth (this month: logged figures win over the standing
     ones) and TEI.calc.safetyNet, which Home reads too. */
  const {fmtGBP, currentMonthKey} = TEI.data;
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MON_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const $ = id => document.getElementById(id);
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function setText(id, t){ const el = $(id); if(el) el.textContent = t; }
  function money(n){ return (n < 0 ? '-' : '') + fmtGBP(Math.abs(Math.round(n))); }
  function k(n){ const a = Math.abs(n); return (n < 0 ? '-' : '') + (a >= 1e6 ? '£' + (a/1e6).toFixed(2) + 'm' : a >= 1000 ? '£' + Math.round(a/1000) + 'k' : '£' + Math.round(a)); }
  function pct(x){ return Math.round(x*100) + '%'; }
  function keyParts(key){ const [y,m] = key.split('-').map(Number); return {y, m}; }
  function monShort(key){ return MON[keyParts(key).m - 1]; }
  function monLong(key){ const p = keyParts(key); return MON_LONG[p.m - 1] + ' ' + p.y; }
  function target(client){ const t = Number((client.preferences||{}).wealthConversionTarget); return t > 0 ? t : 20; }

  /* Health chip (thresholds decided 13 Oct 2026), against the client's own
     wealth conversion target. Overspending overrides the rest. */
  function health(client, m){
    const rate = m.takeHome > 0 ? m.wealthBuilding/m.takeHome*100 : 0;
    const t = target(client);
    if(m.essentials + m.lifestyle > m.takeHome && m.takeHome >= 0 && (m.essentials + m.lifestyle) > 0) return {key:'over', label:'Overspending'};
    if(rate >= t) return {key:'ok', label:'Healthy'};
    if(rate >= t - 5) return {key:'steady', label:'Steady'};
    return {key:'attn', label:'Needs attention'};
  }

  /* ---------- snapshot and this month ---------- */
  function renderSnapshot(client, m){
    const rate = m.takeHome > 0 ? m.wealthBuilding/m.takeHome : 0;
    setText('cfConv', m.takeHome > 0 ? pct(rate) : '–');
    setText('cfSnapMonth', MON_LONG[keyParts(m.key).m - 1] + ' · ' + money(m.takeHome) + ' take-home');
    const h = health(client, m);
    const chip = $('cfHealth');
    chip.textContent = m.takeHome > 0 ? h.label : 'Add your take-home';
    chip.className = 'cf-health cf-health--' + (m.takeHome > 0 ? h.key : 'none');
    const tot = Math.max(m.takeHome, m.essentials + m.lifestyle + m.wealthBuilding, 1);
    const parts = [[m.essentials, 'Essentials', 'cf-e'], [m.lifestyle, 'Lifestyle', 'cf-l'], [m.wealthBuilding, 'Wealth building', 'cf-w']];
    $('cfFlow').innerHTML = parts.map(p=> `<span class="${p[2]}" style="width:${(Math.max(0,p[0])/tot*100).toFixed(1)}%"></span>`).join('');
    $('cfFlow').setAttribute('aria-label', parts.map(p=> p[1] + ' ' + money(p[0])).join(', '));
    $('cfFlowKey').innerHTML = parts.map(p=> `<div><p><i class="${p[2]}"></i>${p[1]}</p><b>${money(p[0])} <small>${pct(Math.max(0,p[0])/tot)}</small></b></div>`).join('');
  }
  function renderThisMonth(client, m){
    const left = m.takeHome - m.essentials - m.lifestyle - m.wealthBuilding;
    const rows = [
      ['Money in', money(m.takeHome), ''],
      ['Essentials', money(-m.essentials), ''],
      ['Lifestyle', money(-m.lifestyle), ''],
      ['Wealth building', money(m.wealthBuilding), 'cf-gold'],
      [left >= 0 ? 'Not yet allocated' : (m.essentials + m.lifestyle > m.takeHome ? 'Overspent' : 'Over take-home'), money(left), left < 0 ? 'cf-warn' : '']
    ];
    $('cfRows').innerHTML = rows.map(r=> `<div class="${r[2]}"><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');
    if(m.logged && m.lastEditedAt){
      const d = new Date(m.lastEditedAt);
      setText('cfUpdated', isNaN(d) ? 'Updated' : 'Updated ' + d.getDate() + ' ' + MON[d.getMonth()]);
    } else setText('cfUpdated', m.logged ? 'Updated' : 'Your usual figures');
  }

  /* ---------- 12-month trend: logged months, plus this month ---------- */
  function trendMonths(client){
    const now = currentMonthKey();
    const n = new Date(); const from = new Date(n.getFullYear(), n.getMonth()-11, 1);
    const fromKey = from.getFullYear() + '-' + String(from.getMonth()+1).padStart(2,'0');
    const keys = Object.keys(client.cashflowMonths||{}).filter(x=> x >= fromKey && x <= now).sort();
    if(keys.indexOf(now) < 0) keys.push(now);
    return keys.map(x=> TEI.calc.cashflowMonth(client, x));
  }
  function renderTrend(client, months){
    const bars = $('cfBars');
    if(months.length < 2){
      setText('cfTrendHead', 'Your trend starts with your second month');
      bars.innerHTML = '<p class="cf-empty">Use Update this month each month and the last year builds up here.</p>';
      bars.setAttribute('aria-label', 'Not enough months logged yet');
      return;
    }
    const conv = x => x.takeHome > 0 ? x.wealthBuilding/x.takeHome : 0;
    const first = conv(months[0]), last = conv(months[months.length-1]);
    const pts = Math.round((last - first)*100);
    const since = ' since ' + monLong(months[0].key);
    setText('cfTrendHead', pts === 0 ? 'Conversion steady' + since
      : 'Conversion ' + (pts > 0 ? 'up ' : 'down ') + Math.abs(pts) + (Math.abs(pts) === 1 ? ' point' : ' points') + since);
    const hmax = Math.max(...months.map(x=> x.essentials + x.lifestyle + x.wealthBuilding), 1);
    bars.innerHTML = months.map((x,i)=>{
      const used = x.essentials + x.lifestyle + x.wealthBuilding || 1;
      const lastBar = i === months.length-1;
      return `<div class="cf-bar${lastBar ? ' cf-bar-now' : ''}"><span class="mono">${pct(conv(x))}</span><div class="cf-stack" style="height:${(used/hmax*100).toFixed(1)}%; animation-delay:${(i*0.04).toFixed(2)}s"><i class="cf-w" style="height:${(x.wealthBuilding/used*100).toFixed(1)}%"></i><i class="cf-l" style="height:${(x.lifestyle/used*100).toFixed(1)}%"></i><i class="cf-e" style="height:${(x.essentials/used*100).toFixed(1)}%"></i></div><small class="mono">${monShort(x.key)}</small></div>`;
    }).join('');
    bars.setAttribute('aria-label', 'Monthly spending and wealth building, ' + monLong(months[0].key) + ' to ' + monLong(months[months.length-1].key) + '. Conversion rate from ' + pct(first) + ' to ' + pct(last) + '.');
  }

  /* ---------- safety net: three stages, months of spending ---------- */
  function renderSafetyNet(client){
    const sn = TEI.calc.safetyNet(client);
    const spend = sn.monthlySpend;
    if(!sn.linked){
      setText('cfNetHead', 'No safety net account linked');
      setText('cfNetSub', 'Choose which cash account holds your safety net in Settings.');
    } else {
      setText('cfNetHead', sn.months != null ? sn.months.toFixed(1) + ' months covered' : 'Add your spending');
      setText('cfNetSub', money(sn.current) + ' cash · ' + money(spend) + ' a month of spending');
    }
    const months = sn.months || 0;
    const defs = [['Working buffer', 1], ['Stage 2', 3], ['Full', sn.fullMonths]];
    let prev = 0;
    const st = defs.map(d=>{ const span = Math.max(0.0001, d[1]-prev), f = Math.max(0, Math.min(1, (months-prev)/span)); prev = d[1]; return {name:d[0], months:d[1], span, f, done: sn.linked && f >= 1}; });
    $('cfNetBar').innerHTML = st.map(s=> `<span style="flex:${s.span}"><i class="hm-grow${s.done ? ' done' : ''}" style="width:${(s.f*100).toFixed(0)}%"></i></span>`).join('');
    $('cfNetBar').setAttribute('aria-label', (sn.months != null ? sn.months.toFixed(1) : '0') + ' months of spending covered across three stages');
    $('cfStages').innerHTML = st.map(s=> `<li class="${s.done ? 'done' : ''}"><span class="cf-tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></span><span><b>${s.name}</b> · ${s.months} ${s.months === 1 ? 'month' : 'months'}${s.done ? '<span class="gl-sr"> (done)</span>' : ''}</span><span class="mono">${spend > 0 ? money(spend*s.months) : '–'}</span></li>`).join('');
    let note;
    if(!sn.linked) note = 'Savings goals stay on Goals; this tile is the cash you keep for the unexpected.';
    else if(months >= sn.fullMonths) note = 'Complete. Cash above ' + money(spend*sn.fullMonths) + ' could be redirected into wealth building.';
    else if(months >= 3) note = 'Stage 2 done. Keep a small top-up going while most new money goes to wealth.';
    else note = 'Building the buffer comes first. Most spare cash goes here until Stage 2.';
    setText('cfNetNote', note);
  }

  /* ---------- scenario corner: Forecast's model ---------- */
  let scenInc = 150;
  function renderScenario(client, m){
    const inc = Math.min(scenInc, Math.max(0, Math.floor(m.lifestyle/25)*25));
    setText('cfScenIncFmt', money(inc));
    const before = TEI.forecast ? TEI.forecast.project(client, m.wealthBuilding) : null;
    const after = TEI.forecast ? TEI.forecast.project(client, m.wealthBuilding + inc) : null;
    const rate = w => m.takeHome > 0 ? pct(w/m.takeHome) : '–';
    const byWhat = before && before.retireAge != null ? 'Extra by ' + before.retireAge : 'Extra at retirement';
    let fiTo = after ? after.fiLabel : '–';
    if(before && after && before.fiMonth >= 0 && after.fiMonth >= 0 && before.fiMonth > after.fiMonth) fiTo += ' (' + (before.fiMonth - after.fiMonth) + ' mo sooner)';
    const cells = [
      ['Conversion rate', rate(m.wealthBuilding), rate(m.wealthBuilding + inc)],
      ['Wealth building', money(m.wealthBuilding), money(m.wealthBuilding + inc)],
      [byWhat, '£0', before && after ? '+' + k(after.atRetire - before.atRetire) : '–'],
      ['Financial independence', before ? before.fiLabel : '–', fiTo]
    ];
    $('cfScenGrid').innerHTML = cells.map(c=> `<div><p>${esc(c[0])}</p><s>${esc(c[1])}</s><b>${esc(c[2])}</b></div>`).join('');
    if(inc < scenInc && document.activeElement !== $('cfScenInc')) $('cfScenInc').value = String(inc);
  }

  /* ---------- your habits ---------- */
  function renderHabits(client, months){
    const rows = [];
    const conv = x => x.takeHome > 0 ? x.wealthBuilding/x.takeHome : 0;
    if(months.length >= 2){
      const first = conv(months[0]), last = conv(months[months.length-1]);
      const pts = Math.round((last-first)*100);
      rows.push([(pts > 0 ? '+' : '') + pts + ' pts', pts > 0 ? 'Conversion rate is climbing.' : pts < 0 ? 'Conversion rate has slipped.' : 'Conversion rate is holding steady.', 'From ' + pct(first) + ' in ' + monLong(months[0].key) + ' to ' + pct(last) + ' now.']);
      const t = target(client)/100;
      let streak = 0; for(let i=months.length-1; i>=0; i--){ if(conv(months[i]) >= t) streak++; else break; }
      rows.push([streak + ' mo', 'Months in a row at your ' + Math.round(t*100) + '% target or more.', 'Consistency matters more than any single month.']);
      const wTot = months.reduce((s,x)=> s + x.wealthBuilding, 0);
      const lifeAvg = months.reduce((s,x)=> s + x.lifestyle, 0) / months.length;
      const half = Math.floor(months.length/2);
      const a = months.slice(0, half).reduce((s,x)=> s + x.lifestyle, 0) / Math.max(1, half);
      const b = months.slice(half).reduce((s,x)=> s + x.lifestyle, 0) / Math.max(1, months.length - half);
      const drift = b < a*0.97 ? ' and is drifting down.' : b > a*1.03 ? ' and is creeping up.' : ' and is holding steady.';
      rows.push([money(wTot), months.length >= 12 ? 'Moved into wealth this year.' : 'Moved into wealth in ' + months.length + ' months.', 'Lifestyle averaged ' + money(lifeAvg) + ' a month' + drift]);
    } else {
      // Too early for a trend: the Cashflow signals from the shared engine.
      TEI.calc.pickSignals(client, 'cashflow', 3).forEach(s=> rows.push(['', s.message, '']));
      if(!rows.length) rows.push(['', 'Add your take-home and spending to see your habits here.', '']);
    }
    $('cfHabits').innerHTML = rows.map(r=> `<li>${r[0] ? `<span class="cf-big">${esc(r[0])}</span>` : ''}<span><strong>${esc(r[1])}</strong>${r[2] ? `<br><span class="fc-muted">${esc(r[2])}</span>` : ''}</span></li>`).join('');
  }

  /* ---------- coach's corner ---------- */
  function computeCashflowCoach(client){
    const cc = client.cashflowCoach || {};
    if(cc.mode==='manual' && cc.message) return cc.message;
    const s = TEI.calc.pickTopSignal(client, 'cashflow');
    return s ? s.message : 'Add your income and spending to see how your money is turning into future wealth.';
  }

  function renderAll(client){
    const m = TEI.calc.cashflowMonth(client);
    const months = trendMonths(client);
    renderSnapshot(client, m);
    renderThisMonth(client, m);
    renderTrend(client, months);
    renderSafetyNet(client);
    renderScenario(client, m);
    renderHabits(client, months);
    setText('cfcMessage', computeCashflowCoach(client));
  }

  /* ---------- Update this month: live, saves as you go ---------- */
  let saveTimer = null, saving = Promise.resolve(), lastFocus = null;
  function panelValues(){
    const v = id => { const x = parseFloat($(id).value); return isNaN(x) ? 0 : Math.max(0, x); };
    return {T: v('cfInT'), E: v('cfInE'), L: v('cfInL'), W: v('cfInW')};
  }
  function renderPanelSums(){
    const p = panelValues();
    setText('cfPanelConv', p.T > 0 ? pct(p.W/p.T) : '–');
    const left = p.T - p.E - p.L - p.W;
    setText('cfPanelLeftK', left >= 0 ? 'Not yet allocated' : (p.E + p.L > p.T ? 'Overspent' : 'Over take-home'));
    setText('cfPanelLeft', money(left));
    $('cfPanelLeft').className = left < 0 ? 'cf-warn' : '';
  }
  function onPanelInput(){
    const client = TEI.app.state.client;
    if(!client) return;
    const p = panelValues(), key = currentMonthKey();
    client.cashflowMonths = client.cashflowMonths || {};
    const prev = client.cashflowMonths[key] || {};
    client.cashflowMonths[key] = Object.assign({}, prev, {actualIncome: p.T, actualExpenses: p.E + p.L, essentials: p.E, lifestyle: p.L, wealthBuilding: p.W, lastEditedAt: new Date().toISOString()});
    renderPanelSums();
    renderAll(client);
    setText('cfPanelState', 'Saving...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=> save(client, key, p), 700);
  }
  function save(client, key, p){
    saving = saving.then(async ()=>{
      try{
        await TEI.wealthOS.saveCashflowMonth(client.meta.clientId, key, p.T, p.E + p.L, client.meta.role, {essentials: p.E, lifestyle: p.L, wealthBuilding: p.W});
        setText('cfPanelState', 'Saved');
      } catch(err){
        console.error('Wealth OS: could not save this month', err);
        setText('cfPanelState', 'That did not save. Please try again.');
        TEI.app.showToast('That did not save. Please try again.');
      }
    });
    return saving;
  }
  function flush(){
    if(!saveTimer) return;
    clearTimeout(saveTimer); saveTimer = null;
    const client = TEI.app.state.client;
    if(client) save(client, currentMonthKey(), panelValues());
  }
  function openPanel(){
    const client = TEI.app.state.client;
    if(!client) return;
    const m = TEI.calc.cashflowMonth(client);
    setText('cfPanelMonth', monLong(m.key));
    $('cfInT').value = String(Math.round(m.takeHome));
    $('cfInE').value = String(Math.round(m.essentials));
    $('cfInL').value = String(Math.round(m.lifestyle));
    $('cfInW').value = String(Math.round(m.wealthBuilding));
    setText('cfPanelState', m.logged ? '' : 'These are your usual figures. Change any that were different this month.');
    renderPanelSums();
    lastFocus = document.activeElement;
    $('cfPanelScrim').hidden = false;
    $('cfPanel').hidden = false;
    $('cfInT').focus();
  }
  function closePanel(){
    if($('cfPanel').hidden) return;
    flush();
    $('cfPanel').hidden = true;
    $('cfPanelScrim').hidden = true;
    if(lastFocus && document.body.contains(lastFocus) && lastFocus.offsetParent) lastFocus.focus(); else $('cfUpdateBtn').focus();
  }

  let wired = false;
  function wireOnce(){
    if(wired) return;
    wired = true;
    $('cfUpdateBtn').addEventListener('click', openPanel);
    $('cfPanelClose').addEventListener('click', closePanel);
    $('cfPanelDone').addEventListener('click', closePanel);
    $('cfPanelScrim').addEventListener('click', closePanel);
    ['cfInT','cfInE','cfInL','cfInW'].forEach(id=> $(id).addEventListener('input', onPanelInput));
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closePanel(); });
    $('cfPanel').addEventListener('keydown', e=>{
      if(e.key !== 'Tab') return;
      const f = Array.from(e.currentTarget.querySelectorAll('input, button')).filter(el=> !el.disabled && el.offsetParent);
      if(!f.length) return;
      if(e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length-1].focus(); }
      else if(!e.shiftKey && document.activeElement === f[f.length-1]){ e.preventDefault(); f[0].focus(); }
    });
    $('cfScenInc').addEventListener('input', e=>{
      scenInc = parseInt(e.target.value, 10) || 0;
      const client = TEI.app.state.client;
      if(client) renderScenario(client, TEI.calc.cashflowMonth(client));
    });
    $('cfScenLink').addEventListener('click', e=>{ e.preventDefault(); TEI.app.showPage('planning'); });
  }

  TEI.cashflowPage = { openUpdate: openPanel };
  TEI.render.cashflow = function(client){
    wireOnce();
    $('cfScenInc').value = String(scenInc);
    renderAll(client);
  };
})();

