window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

(function(){
  const {fmtGBP} = TEI.data;

  const DOC_TYPE_LABEL = {statement:'ST', report:'RP', note:'MN', forecast:'FC', other:'DOC'};
  // Uploaded files (forecasts and every other type) open in the full-screen
  // viewer (TEI.forecastView); only link-only entries are plain links.
  function docOpenHTML(d){
    if(d.storagePath) return `<button type="button" class="k-doc-open" data-forecast-open="${d.id}">Open</button>`;
    return `<a class="k-doc-open" href="${d.url||'#'}" target="_blank" rel="noopener">Open</a>`;
  }
  function docMetaText(d){
    if(d.type === 'forecast') return 'Wealth Plan forecast · ' + (TEI.forecastView ? TEI.forecastView.fmtDate(d.uploadedAt || d.date) : '');
    const kind = d.storagePath && TEI.docView ? TEI.docView.formatLabel(d) : '';
    const when = d.storagePath && TEI.forecastView ? TEI.forecastView.fmtDate(d.uploadedAt || d.date) : (d.date||'');
    return [kind, when].filter(Boolean).join(' · ');
  }

  function renderDocuments(client){
    const list = document.getElementById('documentsList');
    if(!client.documents.length){
      list.innerHTML = `<div class="line">No documents yet. Statements, reports and meeting notes added by your adviser will appear here.</div>`;
      return;
    }
    list.innerHTML = client.documents.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(d=>`
      <div class="k-doc-row" data-doctype="${d.type||''}">
        <div class="k-doc-icon">${DOC_TYPE_LABEL[d.type]||'DOC'}</div>
        <div class="k-doc-info"><div class="k-doc-name">${d.name}</div><div class="k-doc-meta">${docMetaText(d)}</div></div>
        ${docOpenHTML(d)}
      </div>
    `).join('');
  }

  /* ================= SETTINGS / ME (redesign B12.9, spec B9) =================
     Settings has a sub-nav with five groups. The My details sections hold
     the Manual Entry panels (the same forms and save code the coach uses):
     each #subtab-* panel is moved into its section here, and moved back for
     the Adviser Workspace by restoreMyDetailsPanel. On phones, Me lists the
     sections and each opens as its own screen with "‹ Me" (B9.1). */
  const ST_TITLES = {profile:'Profile', accounts:'Accounts', holdings:'Holdings', property:'Property and debts',
    income:'Income and spending', goals:'Goals', you:'You and investing', documents:'Documents', plan:'Plan settings',
    membership:'Membership', appearance:'Appearance', notifications:'Notifications', security:'Security and data', help:'Help and learning'};
  const ST_PANELS = {profile:'subtab-profile', accounts:'subtab-accounts', holdings:'subtab-holdings', property:'subtab-wealth', income:'subtab-cashflow'};
  const TIERS = [
    {id:'core', name:'Core', price:25, reply:'a week', suits:'You are confident with your plan and want help when you ask.',
      points:['Full review session twice a year', 'Wealth Plan and Forecast refreshed yearly', 'Message replies within a week', 'Extra full sessions £50 each']},
    {id:'momentum', name:'Momentum', price:40, reply:'2 working days', suits:'You want a regular check-in to stay on track.',
      points:['Full review session every quarter', 'Wealth Plan and Forecast refreshed twice a year', 'Message replies within 2 working days', 'One extra session free a year, then £30']},
    {id:'inner_circle', name:'Inner Circle', price:50, reply:'1 working day', suits:'You are making bigger changes or want the most support.',
      points:['Full review session every quarter', 'A 30-minute check-in every month, if needed', 'Plan refreshed quarterly and after any big life change', 'Message replies within 1 working day']}
  ];
  const NOTIFS = [
    {id:'monthly', t:'Monthly update reminder', d:'A nudge to update your balances and month.'},
    {id:'sessions', t:'Session reminders', d:'Before each session with your coach.'},
    {id:'documents', t:'New documents', d:'When your coach shares a plan, forecast or note.'},
    {id:'messages', t:'Messages from your coach', d:'When your coach replies to you.'}
  ];
  let stCurrent = 'accounts';
  const stHome = {}; // where each moved panel lives in the Adviser Workspace
  function $s(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function stDate(str){ const d = new Date(str); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}); }
  function isPhone(){ return window.matchMedia('(max-width:860px)').matches; }

  function renderMyDetails(client){
    mountMyDetailsPanel(client);
    const root = $s('stRoot');
    root.classList.toggle('st-client', client.meta.role !== 'adviser');
    root.classList.toggle('st-phone', isPhone());
    selectSection(client, stCurrent);
  }

  function mountMyDetailsPanel(client){
    Object.keys(ST_PANELS).forEach(sec=>{
      const panel = $s(ST_PANELS[sec]);
      const host = document.querySelector('[data-st-host="'+sec+'"]');
      if(!panel || !host) return;
      if(panel.parentNode !== host){
        if(!stHome[sec]) stHome[sec] = {parent: panel.parentNode, next: panel.nextElementSibling};
        host.appendChild(panel);
      }
      panel.classList.add('active');
    });
    if(TEI.adviser && TEI.adviser.init) TEI.adviser.init(client);
    // US pricing controls stay with the coach (clients never trigger price calls).
    document.querySelectorAll('#stRoot #subtab-holdings [data-adviser-only]').forEach(el=>{
      el.style.display = (client.meta.role === 'adviser') ? '' : 'none';
    });
    slPrepare();
  }

  /* Puts the panels back where the Adviser Workspace expects them, for an
     adviser who previewed the client dashboard and then went back. */
  function restoreMyDetailsPanel(){
    slClose();
    Object.keys(stHome).reverse().forEach(sec=>{
      const panel = $s(ST_PANELS[sec]), home = stHome[sec];
      if(!panel || !home) return;
      if(home.next && home.next.parentNode === home.parent) home.parent.insertBefore(panel, home.next);
      else home.parent.appendChild(panel);
      panel.classList.toggle('active', sec === 'profile');
      delete stHome[sec];
    });
    document.querySelectorAll('.adv-subtabs button').forEach(b=> b.classList.toggle('active', b.dataset.subtab === 'profile'));
  }

  function selectSection(client, sec){
    if(!ST_TITLES[sec]) sec = 'accounts';
    stCurrent = sec;
    document.querySelectorAll('#stRoot [data-st]').forEach(b=>{
      const on = b.dataset.st === sec;
      b.classList.toggle('on', on);
      if(on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('#stRoot [data-st-sec]').forEach(el=> el.hidden = el.dataset.stSec !== sec);
    $s('stTitle').textContent = ST_TITLES[sec];
    const fn = ST_RENDER[sec];
    if(fn) fn(client);
    slRender(client, sec);
    renderDocBadge(client);
  }

  /* ---------- section renderers ---------- */
  function renderAccountsSummary(client){
    const total = TEI.calc.latestNetWorth(client);
    const n = (client.accounts||[]).length;
    const monthly = TEI.calc.actualTotalSavingInvesting(client);
    $s('stAcctSummary').textContent = n + (n === 1 ? ' account' : ' accounts') + ' · ' + fmtGBP(total) + ' · ' + fmtGBP(monthly) + ' a month going in';
  }
  function renderSpendSummary(client){
    $s('stSpendSummary').textContent = 'Tag each spending line essential or lifestyle; it drives the split on Cashflow. Essentials ' +
      fmtGBP(TEI.calc.totalEssentialExpenses(client)) + ' · Lifestyle ' + fmtGBP(TEI.calc.totalLifestyleExpenses(client)) + ' a month.';
  }
  function renderGoalsList(client){
    const goals = client.goals || [];
    $s('stGoals').innerHTML = goals.length ? goals.map(g=>{
      const st = TEI.calc.goalStatus(client, g);
      const tgt = g.progressType === 'income' ? fmtGBP(g.targetIncome||0) + ' a year' : g.progressType === 'completion' ? 'Done or not done' : fmtGBP(g.targetAmount||0);
      return `<li><span><b>${esc(g.name)}</b><small>${esc(tgt)}${g.targetDate ? ' · ' + esc(stDate(g.targetDate)) : ''} · ${esc(st.label)}</small></span><button type="button" class="hm-link hm-linkbtn" data-st-goal="${esc(g.id)}">Edit<span class="gl-sr"> ${esc(g.name)}</span></button></li>`;
    }).join('') : '<li class="st-empty">No goals yet.</li>';
  }
  function stRenderDocuments(client){
    const docs = client.documents || [];
    $s('stUpAcct').innerHTML = '<option value="">Not about one account</option>' + (client.accounts||[]).map(a=> `<option value="${esc(a.id)}">${esc(TEI.data.acctLabel(a))}</option>`).join('');
    const ups = docs.filter(d=> d.reviewStatus).sort((a,b)=> String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')));
    $s('stUploads').innerHTML = ups.map(d=> `<li><span><b>${esc(d.name)}</b><small>Sent ${esc(stDate(d.uploadedAt))}</small></span><span class="st-status${d.reviewStatus === 'pending' ? ' st-pending' : ''}">${d.reviewStatus === 'pending' ? 'Waiting for review' : 'Added to your figures'}</span></li>`).join('');
    const shared = docs.filter(d=> !d.reviewStatus && ['forecast','note','report','plan'].indexOf(d.type) >= 0)
      .sort((a,b)=> String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')));
    const kind = t => t === 'forecast' ? 'Forecast' : t === 'note' ? 'Meeting note' : t === 'plan' ? 'Plan' : 'Report';
    $s('stShared').innerHTML = shared.length ? shared.map(d=> `<li><span><b>${esc(d.name)}</b><small>${kind(d.type)} · ${esc(stDate(d.uploadedAt))}</small></span>${d.storagePath ? `<button type="button" class="hm-link hm-linkbtn" data-forecast-open="${esc(d.id)}">Open</button>` : ''}</li>`).join('') : '<li class="st-empty">Nothing shared yet.</li>';
    $s('stLibLink').href = isPhone() ? '#' : '/hub/index.html';
  }
  function renderDocBadge(client){
    const n = (client.documents||[]).filter(d=> d.reviewStatus === 'pending').length;
    const b = $s('stDocBadge');
    b.hidden = !n;
    b.textContent = n ? n + ' pending' : '';
  }
  function renderPlan(client){
    const p = client.preferences || {};
    const f = TEI.forecast ? null : null; // Forecast's defaults live in its module; mirror them here.
    const ret = p.retirementAge != null ? p.retirementAge : 60;
    const budget = TEI.calc.computeBudgetAndFI(client);
    const ys = p.yearlySpending != null ? p.yearlySpending : Math.round((budget.annualSpend||0)/1000)*1000;
    const wc = p.wealthConversionTarget != null ? p.wealthConversionTarget : 20;
    const sn = p.safetyNetMonths != null ? p.safetyNetMonths : 6;
    const set = (id, v)=>{ if(document.activeElement !== $s(id)) $s(id).value = String(v); };
    set('stRet', Math.min(68, Math.max(55, ret))); set('stYs', Math.min(60000, Math.max(15000, ys || 15000)));
    set('stWc', wc); set('stSn', sn);
    planLabels(client);
    renderEfPicker(client);
  }
  function planLabels(client){
    const p = client.preferences || {};
    $s('stRetV').textContent = $s('stRet').value;
    $s('stYsV').textContent = fmtGBP(Number($s('stYs').value)) + ' a year';
    const mult = p.fiMultiple || 25;
    $s('stYsNote').textContent = p.fiOverride != null ? 'Your coach has set your FI number to ' + fmtGBP(p.fiOverride) + '.' : 'Your FI number is ' + mult + ' times this: ' + fmtGBP(Number($s('stYs').value) * mult) + '.';
    $s('stWcV').textContent = $s('stWc').value + '%';
    $s('stSnV').textContent = $s('stSn').value + ' months';
  }
  function tierOf(client){ return TIERS.find(t=> t.id === client.settings.tier) || null; }
  function renderMembership(client){
    const t = tierOf(client);
    $s('stTier').textContent = t ? t.name : 'Not set up yet';
    const since = client.settings.memberSince ? ' · member since ' + new Date(client.settings.memberSince).toLocaleDateString('en-GB', {month:'long', year:'numeric'}) : '';
    $s('stTierSub').textContent = t ? '£' + t.price + ' a month' + since : 'Your coach sets this up when you join.';
    $s('stTiers').innerHTML = TIERS.map(x=>{
      const on = t && x.id === t.id;
      return `<section class="hm-tile st-tier${on ? ' on' : ''}"><div class="hm-row"><b>${x.name}</b>${on ? '<span class="fc-chip fc-chip-on">Your tier</span>' : ''}</div>
        <p class="st-tier-price">£${x.price} <small>a month</small></p><p class="hm-muted hm-small">${esc(x.suits)}</p>
        <ul>${x.points.map(pt=> `<li>${esc(pt)}</li>`).join('')}</ul>
        ${on ? '' : `<button type="button" class="hm-btn st-tier-btn" data-st-tier="${x.id}">Ask to move to ${x.name}</button>`}</section>`;
    }).join('');
  }
  function notifPrefs(client){
    const e = ((client.settings.notifications||{}).email) || {};
    const out = {};
    NOTIFS.forEach(n=>{ out[n.id] = e[n.id] !== false; });
    return out;
  }
  function renderNotifications(client){
    const prefs = notifPrefs(client);
    $s('stNotif').innerHTML = NOTIFS.map(n=> `<li><span><b>${n.t}</b><small>${n.d}</small></span>
      <span><input type="checkbox" data-st-notif="${n.id}" ${prefs[n.id] ? 'checked' : ''} aria-label="${n.t} by email"></span>
      <span><input type="checkbox" disabled aria-label="${n.t} on your phone: not available yet"></span></li>`).join('');
  }
  const ST_RENDER = {
    accounts: renderAccountsSummary, income: renderSpendSummary, goals: renderGoalsList,
    documents: stRenderDocuments, plan: renderPlan, you: c=> { if(TEI.setup) TEI.setup.settingsRender(c); }, membership: renderMembership, notifications: renderNotifications
  };

  /* ---------- actions ---------- */
  function client(){ return TEI.app && TEI.app.state && TEI.app.state.client; }
  async function requestToCoach(area, message, stateId){
    const c = client(); if(!c) return false;
    try{
      await TEI.wealthOS.saveFeedback(c.meta.clientId, area, 'mydetails', message, c.meta.role);
      return true;
    } catch(err){
      console.error('Wealth OS: request not sent', err);
      if(stateId) $s(stateId).textContent = 'That did not send. Please try again.';
      return false;
    }
  }
  let planTimer = null;
  function onPlanInput(){
    const c = client(); if(!c) return;
    const p = c.preferences = c.preferences || {};
    p.retirementAge = Number($s('stRet').value);
    p.yearlySpending = Number($s('stYs').value);
    p.wealthConversionTarget = Number($s('stWc').value);
    p.safetyNetMonths = Number($s('stSn').value);
    planLabels(c);
    $s('stPlanState').textContent = 'Saving...';
    clearTimeout(planTimer);
    planTimer = setTimeout(async ()=>{
      try{ await TEI.wealthOS.saveCashflowSettings(c.meta.clientId, c); $s('stPlanState').textContent = 'Saved'; }
      catch(err){ console.error('Wealth OS: plan settings not saved', err); $s('stPlanState').textContent = 'That did not save. Please try again.'; }
    }, 600);
  }
  async function sendUpload(){
    const c = client(); if(!c) return;
    const file = $s('stUpFile').files && $s('stUpFile').files[0];
    const btn = $s('stUpSend'), state = $s('stUpState');
    if(!file){ state.textContent = 'Choose a file first.'; return; }
    btn.disabled = true;
    try{
      let prepared;
      try{ prepared = await TEI.docView.prepare(file, s=>{ state.textContent = s; }); }
      catch(err){ state.textContent = err && err.userMessage || 'That file could not be read.'; return; }
      state.textContent = 'Sending...';
      const name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      const saved = await TEI.wealthOS.uploadDocument(c.meta.clientId, file, name, $s('stUpType').value, prepared,
        {reviewStatus:'pending', accountId: $s('stUpAcct').value || null});
      c.documents.push(saved);
      $s('stUpFile').value = '';
      $s('stUpLabel').textContent = 'Choose a file';
      state.textContent = 'Sent. Your coach will check it before any figures change.';
      stRenderDocuments(c); renderDocBadge(c);
    } catch(err){
      console.error('Wealth OS: upload failed', err);
      state.textContent = 'That did not send. Please try again.';
    } finally { btn.disabled = false; }
  }
  function csvCell(v){ const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function downloadData(){
    const c = client(); if(!c) return;
    const rows = [];
    const add = r => rows.push(r.map(csvCell).join(','));
    add(['Accounts']); add(['Account','Type','Value £','Monthly contribution £']);
    (c.accounts||[]).forEach(a=> add([TEI.data.acctLabel(a), a.type, a.value, TEI.calc.acctContribTotal(a)]));
    add([]); add(['Holdings']); add(['Holding','Ticker','Account','Value £','Cost £']);
    (c.holdings||[]).forEach(h=>{ const a = (c.accounts||[]).find(x=> x.id === h.accountId); add([h.name, h.ticker||'', a ? TEI.data.acctLabel(a) : '', h.value, h.costBasis != null ? h.costBasis : '']); });
    add([]); add(['Income']); add(['Type','Amount £','Frequency']);
    (c.cashflow.income||[]).forEach(i=> add([i.type, i.amount, i.frequency]));
    add([]); add(['Spending']); add(['Line','Fixed or variable','Essential or lifestyle','Amount £ a month']);
    ['fixed','variable'].forEach(k=> (c.cashflow.expenses[k]||[]).forEach(e=> add([e.label, k, e.category === 'lifestyle' ? 'lifestyle' : 'essential', e.amount])));
    add([]); add(['Monthly cashflow']); add(['Month','Take-home £','Essentials £','Lifestyle £','Wealth building £']);
    Object.keys(c.cashflowMonths||{}).sort().forEach(k=>{ const m = TEI.calc.cashflowMonth(c, k); add([k, Math.round(m.takeHome), Math.round(m.essentials), Math.round(m.lifestyle), Math.round(m.wealthBuilding)]); });
    add([]); add(['Goals']); add(['Goal','Target','Target date','Progress %']);
    (c.goals||[]).forEach(g=>{ const gp = TEI.calc.goalProgress(c, g); add([g.name, g.progressType === 'income' ? g.targetIncome : g.targetAmount, g.targetDate||'', Math.round(gp.pct||0)]); });
    const blob = new Blob(['﻿' + rows.join('\r\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wealth-os-data-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
  }

  let stWired = false;
  function wireSettings(){
    if(stWired) return;
    stWired = true;
    document.querySelectorAll('#stRoot [data-st]').forEach(b=> b.addEventListener('click', ()=>{ const c = client(); if(c) selectSection(c, b.dataset.st); }));
    $s('stBack').addEventListener('click', ()=> TEI.app.showPage('menu'));
    $s('stGoalsLink').addEventListener('click', e=>{ e.preventDefault(); TEI.app.showPage('goals'); });
    $s('stGoalAdd').addEventListener('click', ()=>{ TEI.app.showPage('goals'); if(TEI.goalsPage) TEI.goalsPage.open(null); });
    $s('stGoals').addEventListener('click', e=>{ const b = e.target.closest('[data-st-goal]'); if(!b) return; TEI.app.showPage('goals'); if(TEI.goalsPage) TEI.goalsPage.open(b.dataset.stGoal); });
    $s('stLibLink').addEventListener('click', e=>{ if(isPhone()){ e.preventDefault(); TEI.app.showPage('documents'); } });
    $s('stUpFile').addEventListener('change', ()=>{ const f = $s('stUpFile').files[0]; $s('stUpLabel').textContent = f ? f.name + ' ready to send' : 'Choose a file'; $s('stUpState').textContent = ''; });
    $s('stUpSend').addEventListener('click', sendUpload);
    ['stRet','stYs','stWc','stSn'].forEach(id=> $s(id).addEventListener('input', onPlanInput));
    $s('stEf').addEventListener('change', onEfChange);
    $s('stTiers').addEventListener('click', async e=>{
      const b = e.target.closest('[data-st-tier]'); if(!b) return;
      const t = TIERS.find(x=> x.id === b.dataset.stTier), cur = tierOf(client());
      b.disabled = true;
      if(await requestToCoach('membership', 'Membership: asked to change tier' + (cur ? ' from ' + cur.name : '') + ' to ' + t.name + '.', 'stMemberState'))
        $s('stMemberState').textContent = 'Sent. We will be in touch within ' + (cur || t).reply + '.';
      b.disabled = false;
    });
    $s('stCancel').addEventListener('click', async ()=>{
      if(!confirm('Send a request to cancel your membership? Your coach will be in touch to arrange it.')) return;
      const cur = tierOf(client());
      if(await requestToCoach('membership', 'Membership: asked to cancel.', 'stMemberState'))
        $s('stMemberState').textContent = 'Sent. We will be in touch within ' + (cur ? cur.reply : 'a week') + '.';
    });
    $s('stNotif').addEventListener('change', async e=>{
      const box = e.target.closest('[data-st-notif]'); if(!box) return;
      const c = client(); if(!c) return;
      const prefs = notifPrefs(c); prefs[box.dataset.stNotif] = box.checked;
      c.settings.notifications = {email: prefs};
      $s('stNotifState').textContent = 'Saving...';
      try{ await TEI.wealthOS.saveClientSettings(c.meta.clientId, {notification_prefs: c.settings.notifications}); $s('stNotifState').textContent = 'Saved'; }
      catch(err){ console.error('Wealth OS: notification choices not saved', err); $s('stNotifState').textContent = 'That did not save. Please try again.'; }
    });
    $s('stA2hs').addEventListener('click', ()=>{ const t = $s('stA2hsText'); t.hidden = !t.hidden; $s('stA2hs').setAttribute('aria-expanded', t.hidden ? 'false' : 'true'); });
    $s('stPwSave').addEventListener('click', async ()=>{
      const a = $s('stPw1').value, b = $s('stPw2').value, st = $s('stPwState');
      if(a.length < 8){ st.textContent = 'Use at least 8 characters.'; return; }
      if(a !== b){ st.textContent = 'The two passwords do not match.'; return; }
      try{ const r = await window.teiSupabase.auth.updateUser({password: a}); if(r.error) throw r.error; st.textContent = 'Password changed.'; $s('stPw1').value = $s('stPw2').value = ''; }
      catch(err){ console.error('Wealth OS: password not changed', err); st.textContent = (err && err.message) || 'That did not work. Please try again.'; }
    });
    $s('stSignOutAll').addEventListener('click', async ()=>{
      if(!confirm('Sign out on every device, including this one?')) return;
      try{ await window.teiSupabase.auth.signOut({scope:'global'}); } catch(err){ console.error(err); }
      location.href = '/hub/login.html';
    });
    $s('stDownload').addEventListener('click', downloadData);
    $s('stClose').addEventListener('click', async ()=>{
      if(!confirm('Send a request to close your account? Your coach will be in touch before anything is closed.')) return;
      if(await requestToCoach('account', 'Account: asked to close my account.', 'stCloseState')) $s('stCloseState').textContent = 'Sent. Your coach will be in touch.';
    });
    $s('stMessage').addEventListener('click', ()=>{ const f = $s('feedbackFabBtn'); if(f) f.click(); });
    $s('stSetupOpen').addEventListener('click', ()=>{ if(TEI.setup) TEI.setup.open(); });
  }

  /* Opens Settings on a section (Home's Update balances lands on Accounts, B9.1). */
  function openSettings(sec){
    stCurrent = ST_TITLES[sec] ? sec : 'accounts';
    TEI.app.showPage('mydetails');
  }

  /* ---------- Me (phones, board MeMobile) ---------- */
  function renderMe(c){
    if(!c) return;
    const t = tierOf(c);
    $s('mMenuSub').textContent = (t ? t.name + ' member · ' : '') + 'coach Paddy Iveson';
    const total = TEI.calc.latestNetWorth(c), n = (c.accounts||[]).length;
    const liab = ((c.wealth||{}).liabilities||[]).length;
    const pending = (c.documents||[]).filter(d=> d.reviewStatus === 'pending').length;
    const prefs = notifPrefs(c);
    const groups = [
      ['Your money', [['accounts','Accounts', n + ' · ' + fmtGBP(total)], ['holdings','Holdings', String((c.holdings||[]).length)],
        ['property','Property and debts', liab ? liab + (liab === 1 ? ' debt' : ' debts') : 'Debt free'], ['income','Income and spending', fmtGBP(TEI.calc.totalMonthlyIncome(c)) + ' in'], ['goals','Goals', String((c.goals||[]).length)]]],
      ['About you', [['profile','Profile',''], ['you','You and investing','']]],
      ['Plan and documents', [['plan','Plan settings', 'Retire at ' + ((c.preferences||{}).retirementAge || 60)], ['documents','Documents', pending ? pending + ' pending' : '']]],
      ['Account', [['membership','Membership', t ? t.name + ' · £' + t.price : ''], ['notifications','Notifications', Object.values(prefs).some(Boolean) ? 'Email on' : 'Email off'], ['security','Security and data','']]],
      ['Help', [['help','Help and learning',''], ['_setup','Set up Wealth OS', TEI.setup ? (TEI.setup.leftToDo(c) ? TEI.setup.leftToDo(c) + ' to do' : 'All done') : ''], ['_message','Message your coach','']]],
      ['Elsewhere', [['_hub','Client Hub','Learning, guides and videos'], ['_site','Website','The Everyday Investor']]]
    ];
    $s('meGroups').innerHTML = groups.map(g=> `<section class="me-group"><p class="hm-label">${g[0]}</p><ul>${g[1].map(i=>
      `<li><button type="button" data-me="${i[0]}"><span>${i[1]}</span><span class="me-meta${/pending/.test(i[2]) ? ' me-hot' : ''}">${esc(i[2])}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></li>`).join('')}</ul></section>`).join('');
  }
  let meWired = false;
  function wireMe(){
    if(meWired) return;
    meWired = true;
    $s('page-menu').addEventListener('click', e=>{
      const b = e.target.closest('[data-me]'); if(!b) return;
      const k = b.dataset.me;
      if(k === '_message'){ const f = $s('feedbackFabBtn'); if(f) f.click(); }
      else if(k === '_setup'){ if(TEI.setup) TEI.setup.open(); }
      else if(k === '_hub') location.href = '/hub/index.html';
      else if(k === '_site') location.href = '/index.html';
      else openSettings(k);
    });
  }

  /* ---------- My details as plain lists (20 Oct 2026) ----------
     The Manual Entry forms showed every record and every field at once.
     Each My details section now shows a plain list; a row (or "Add") opens
     a side panel, a bottom sheet on phones, holding the same Manual Entry
     form, so saving still runs through the coach's code (TEI.adviser) and
     the Adviser Workspace is unchanged. Less common fields sit under
     "More detail". The coach's lists stay in the page, hidden, and their
     buttons do the editing and removing; when one re-renders after a save
     or a removal, the panel closes and the list here redraws. */
  const ACCT_TYPES = {isa:'Stocks and shares ISA', gia:'General investment account', pension:'Pension', lisa:'Stocks and shares LISA',
    cash:'Cash savings', cash_isa:'Cash ISA', cash_lisa:'Cash LISA', crypto:'Crypto', other:'Other account'};
  const ASSET_TYPES = {property:'Property', vehicle:'Vehicle', collectibles:'Collectibles', business:'Business interests', other:'Other asset'};
  const LIAB_TYPES = {mortgage:'Mortgage', loan:'Loan', credit:'Credit card', other:'Other debt'};
  const FREQ = {monthly:'a month', annual:'a year', weekly:'a week', fourweekly:'every 4 weeks'};
  const CHEV = '<svg class="sl-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const money = v=> fmtGBP(Number(v)||0);
  function acctMonthly(a){ return a.type === 'pension' ? (Number(a.contributionPersonal)||0) + (Number(a.contributionSacrifice)||0) : (Number(a.contribution)||0); }
  function acctTitle(a){ return a.provider ? a.provider + ' ' + (ACCT_TYPES[a.type] || '') : (ACCT_TYPES[a.type] || 'Account'); }
  function holdingReturn(h){
    const cost = Number(h.costBasis)||0;
    if(cost <= 0) return '';
    const r = ((Number(h.value)||0) - cost) / cost * 100;
    return (r >= 0 ? '+' : '') + r.toFixed(1) + '%';
  }

  /* One entry per list. btn: the coach form's save button (its form is what
     the panel holds). cancel: TEI.adviser.forms.cancel key. more: fields
     under "More detail". */
  const SL = {
    acct: { sec:'accounts', heading:'Your accounts', add:'Add account', btn:'addAcctBtn', list:'accountsList', cancel:'account', owns:true,
      items: c=> c.accounts || [],
      edit: x=> '[data-edit-acct="'+x.id+'"]', del: x=> '[data-del-acct="'+x.id+'"]',
      label: x=> acctTitle(x),
      row: x=> ({ title: x.provider || ACCT_TYPES[x.type] || 'Account',
        sub: [x.provider ? ACCT_TYPES[x.type] : '', acctMonthly(x) ? money(acctMonthly(x)) + ' a month in' : '', x.isJoint ? 'Joint' : '', x.setAndForget ? 'Set and forget' : '', x.earmarked ? 'Earmarked' : ''].filter(Boolean).join(' · '),
        value: money(x.value) }),
      more: ['newAcctOpeningContrib','newAcctCashBalance','advAcctInterestRateField','advAcctRateTypeField','advAcctMaturityField','advAcctJointField','acctMoreOptions'] },
    hold: { sec:'holdings', heading:'Your holdings', add:'Add holding', btn:'addHoldingBtn', list:'holdingsList', cancel:'holding',
      items: c=> c.holdings || [],
      edit: x=> '[data-edit-holding="'+x.id+'"]', del: x=> '[data-del-holding="'+x.id+'"]',
      label: x=> x.name || 'Holding',
      row: x=> ({ title: x.name || 'Holding', sub: [x.ticker || '', x.units != null ? x.units + ' units' : ''].filter(Boolean).join(' · '),
        value: money(x.value), extra: holdingReturn(x) }),
      more: ['newHoldingPriceSource','newHoldingUnits','newHoldingAvgOpen','newHoldingCostBasisField','newHoldingSector','newHoldingTheme'] },
    asset: { sec:'property', heading:'Property and other assets', add:'Add an asset', btn:'advAddAssetBtn', list:'advAssetsList', cancel:'asset',
      items: c=> (c.wealth && c.wealth.assets) || [],
      edit: x=> '[data-edit-asset="'+x.id+'"]', del: x=> '[data-del-asset="'+x.id+'"]',
      label: x=> x.notes || ASSET_TYPES[x.type] || 'Asset',
      row: x=> ({ title: x.notes || ASSET_TYPES[x.type] || 'Asset', sub: x.notes ? ASSET_TYPES[x.type] || '' : '', value: money(x.value) }) },
    liab: { sec:'property', heading:'Debts', add:'Add a debt', btn:'advAddLiabBtn', list:'advLiabilitiesList', cancel:'liability',
      items: c=> (c.wealth && c.wealth.liabilities) || [],
      edit: x=> '[data-edit-liab="'+x.id+'"]', del: x=> '[data-del-liab="'+x.id+'"]',
      label: x=> LIAB_TYPES[x.type] || 'Debt',
      row: (x, c)=>{ const a = ((c.wealth && c.wealth.assets) || []).find(y=> y.id === x.linkedAssetId);
        return { title: LIAB_TYPES[x.type] || 'Debt', sub: a ? 'Against ' + (a.notes || ASSET_TYPES[a.type] || 'an asset') : '', value: money(x.balance) }; },
      empty: 'No debts. Debt free.' },
    inc: { sec:'income', heading:'Income', add:'Add income', btn:'advAddIncomeBtn', list:'advIncomeList', cancel:'income',
      items: c=> (c.cashflow && c.cashflow.income) || [],
      edit: x=> '[data-edit-adv-income="'+x.id+'"]', del: x=> '[data-del-adv-income="'+x.id+'"]',
      label: x=> x.type || 'Income',
      row: x=> ({ title: x.type || 'Income', sub: x.owner === 'partner' ? 'Partner' : '', value: money(x.amount) + ' ' + (FREQ[x.frequency] || '') }) },
    spend: { sec:'income', heading:'Spending', add:'Add spending', list:'advFixedList', list2:'advVariableList', cancel:'expense',
      items: c=>{ const e = (c.cashflow && c.cashflow.expenses) || {};
        return (e.fixed||[]).map(x=> Object.assign({kind:'fixed'}, x)).concat((e.variable||[]).map(x=> Object.assign({kind:'variable'}, x))); },
      key: x=> x.kind + ':' + x.id,
      edit: x=> '[data-edit-adv-exp="'+x.kind+':'+x.id+'"]', del: x=> '[data-del-adv-exp="'+x.kind+':'+x.id+'"]',
      label: x=> x.label || 'Spending',
      row: x=> ({ title: x.label || 'Spending', sub: x.owner === 'joint' ? 'Joint' : '', value: money(x.amount) + ' a month', spend: x.category === 'lifestyle' ? 'lifestyle' : 'essential' }) }
  };
  const SL_SECS = { accounts:['acct'], holdings:['hold'], property:['asset','liab'], income:['inc','spend'] };
  /* Coach-only widgets kept under a fold: [section, fold id, label, hint]. */
  const SL_FOLDS = [
    ['accounts', 'months', 'Earlier months', 'Add or correct the balances for a past month.'],
    ['accounts', 'deposits', 'Money paid in', 'What you paid into each account each month.'],
    ['holdings', 'hmonths', 'Earlier months', 'Add or correct holding values for a past month.'],
    ['holdings', 'divs', 'Dividends', 'Dividends received each year, and holdings that pay them.'],
    ['income', 'oneoff', 'One-off costs', 'Irregular costs, such as a car repair, counted only in the month you choose.']
  ];
  const slKey = (g, x)=> String(g.key ? g.key(x) : x.id);
  const slSpendBtn = kind=> kind === 'fixed' ? 'advAddFixedBtn' : 'advAddVariableBtn';
  const slSpendSel = kind=> kind === 'fixed' ? 'advNewFixedSpend' : 'advNewVariableSpend';
  function slFormOf(btnId){ const b = $s(btnId); return b && b.closest('.mini-form'); }
  function slField(id){ const el = $s(id); if(!el) return null; return el.matches('.form-field, details') ? el : (el.closest('.form-field') || el); }

  /* Once: tag the coach widgets so CSS can hide them in Settings, set up the
     panel, and watch each coach list for the redraw that follows a save. */
  let slReady = false, sl = null;
  function slPrepare(){
    if(slReady) return;
    const root = $s('stRoot');
    if(!$s('accountsList') || !root.contains($s('accountsList'))) return;
    slReady = true;
    root.classList.add('st-v2');
    ['accountsList','holdingsList','advAssetsList','advLiabilitiesList','saveCashflowBtn'].forEach(id=>{ const c = $s(id) && $s(id).closest('.card'); if(c) c.setAttribute('data-sl-src', ''); });
    const cf = $s('subtab-cashflow');
    if(cf){
      for(const el of Array.from(cf.children)){ if(el.classList.contains('card')) break; el.setAttribute('data-sl-src', ''); }
      const exp = $s('advFixedList').closest('.card');
      exp.setAttribute('data-sl-card', 'oneoff');
      for(const el of Array.from(exp.children)){ if(el.contains($s('advOneOffList')) || el === $s('advOneOffList').previousElementSibling) break; el.setAttribute('data-sl-src', ''); }
    }
    const card = (id, fold)=>{ const c = $s(id) && $s(id).closest('.card'); if(c) c.setAttribute('data-sl-card', fold); };
    card('curMonthPicker', 'months'); card('curMonthPickerHoldings', 'hmonths'); card('dividendHistoryList', 'divs'); card('dividendList', 'divs');
    Object.keys(SL).forEach(k=>{
      (SL[k].more || []).forEach(id=>{ const f = slField(id); if(f) f.setAttribute('data-sl-more', ''); });
    });
    ['advNewFixedSpend','advNewVariableSpend'].forEach(id=>{ const f = slField(id); if(f) f.setAttribute('data-sl-hide', ''); });
    root.insertAdjacentHTML('beforeend', `<div class="wl-scrim" id="slScrim" hidden></div>
      <div class="wl-panel sl-drawer" id="slDrawer" role="dialog" aria-modal="true" aria-labelledby="slTitle" hidden>
        <div class="wl-panel-head"><div><p class="hm-label" id="slKicker"></p><h2 class="hm-h3" id="slTitle"></h2></div>
          <button type="button" class="wl-x" id="slClose" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg></button></div>
        <div class="hb-seg-me sl-seg" id="slSeg" role="group" aria-label="Essential or lifestyle" hidden><button type="button" data-sl-seg="essential">Essential</button><button type="button" data-sl-seg="lifestyle">Lifestyle</button></div>
        <div class="sl-sum hm-muted hm-small" id="slSum"></div>
        <div class="sl-body" id="slBody"></div>
        <button type="button" class="hm-btn sl-remove" id="slRemove" hidden>Remove</button>
      </div>`);
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'sl-more'; more.id = 'slMore'; more.setAttribute('aria-expanded', 'false'); more.textContent = 'More detail';
    more.addEventListener('click', ()=>{ const on = !$s('slDrawer').classList.contains('sl-more-on'); $s('slDrawer').classList.toggle('sl-more-on', on); more.setAttribute('aria-expanded', on ? 'true' : 'false'); more.textContent = on ? 'Fewer details' : 'More detail'; });
    sl = { more };
    $s('slClose').addEventListener('click', ()=> slClose());
    $s('slScrim').addEventListener('click', ()=> slClose());
    $s('slDrawer').addEventListener('keydown', e=>{ if(e.key === 'Escape') slClose(); });
    $s('slRemove').addEventListener('click', slRemove);
    $s('slSeg').addEventListener('click', e=>{ const b = e.target.closest('[data-sl-seg]'); if(b) slSetSpend(b.dataset.slSeg); });
    root.addEventListener('click', slClick);
    const watch = new MutationObserver(muts=>{
      const ids = new Set(muts.map(m=> m.target.id));
      if(slState && (ids.has(slState.g.list) || ids.has(slState.g.list2))) slClose();
      const c = client(); if(c && SL_SECS[stCurrent]) slRender(c, stCurrent);
    });
    Object.keys(SL).forEach(k=> [SL[k].list, SL[k].list2].forEach(id=>{ if(id && $s(id)) watch.observe($s(id), {childList:true}); }));
  }

  function slFlag(a, c){
    const d = TEI.calc.contributionDiscrepancy(c, [a.id]);
    if(!TEI.calc.isDiscrepancyFlaggable(d) || TEI.calc.isDiscrepancyDismissed(a, d.diff)) return '';
    return `<div class="sl-flag"><span>Your balance and what you have paid in differ by ${money(Math.abs(d.diff))}. Worth a check.</span><button type="button" class="hm-btn sl-ok" data-sl-ok="${esc(a.id)}">Looks right</button></div>`;
  }
  function slRowHTML(gid, g, x, c){
    const r = g.row(x, c), key = slKey(g, x);
    const chip = r.spend ? `<button type="button" class="sl-chip sl-chip-${r.spend}" data-sl-spend="${esc(key)}" aria-label="${r.spend === 'lifestyle' ? 'Lifestyle' : 'Essential'}. Change to ${r.spend === 'lifestyle' ? 'essential' : 'lifestyle'}">${r.spend === 'lifestyle' ? 'Lifestyle' : 'Essential'}</button>` : '';
    return `<li class="sl-item${chip ? ' sl-has-chip' : ''}"><button type="button" class="sl-row" data-sl-open="${gid}" data-sl-id="${esc(key)}">
      <span class="sl-main"><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
      <span class="sl-val">${esc(r.value)}${r.extra ? `<small class="${/^-/.test(r.extra) ? 'sl-down' : 'sl-up'}">${esc(r.extra)}</small>` : ''}</span>${CHEV}</button>${chip}${gid === 'acct' ? slFlag(x, c) : ''}</li>`;
  }
  /* Collapsible headings inside a list (Paddy, 20 Oct 2026): holdings by
     account, accounts by kind, spending by essential and lifestyle. Closed
     by default; what is open is remembered while Settings is in use. */
  const slOpenGrps = {};
  const SL_KINDS = [['cash', 'Cash savings', ['cash','cash_isa','cash_lisa']], ['invest', 'Investments', ['isa','gia','lisa','crypto','other']], ['pension', 'Pensions', ['pension']]];
  /* Marker colours: the account-type colours used on Wealth (B5). */
  const SL_DOT = {pension:'#E8D6A8', isa:'#B9CAE6', lisa:'#DFE6F2', cash_lisa:'#DFE6F2', gia:'var(--w-acc-gia)', cash:'#AAB6C8', cash_isa:'#AAB6C8', crypto:'#6F7F98', other:'#C9D3E3', invest:'#B9CAE6'};
  function slSubHTML(key, title, meta, total, rows, note, dot){
    const open = !!slOpenGrps[key];
    return `<div class="sl-grp${open ? ' open' : ''}"><button type="button" class="sl-grp-head" data-sl-grp="${esc(key)}" aria-expanded="${open}">
      <i class="sl-dot${dot && !/^(#|var\()/.test(dot) ? ' sl-dot-' + dot : ''}"${dot && /^(#|var\()/.test(dot) ? ` style="background:${dot}"` : ''} aria-hidden="true"></i><span class="sl-main"><b>${esc(title)}</b><small>${esc(meta)}${note ? ` · <span class="sl-grp-note">${esc(note)}</span>` : ''}</small></span>
      <span class="sl-val">${esc(total)}</span>${CHEV}</button><ul class="sl-list"${open ? '' : ' hidden'}>${rows}</ul></div>`;
  }
  const slCount = (n, one, many)=> n + ' ' + (n === 1 ? one : many);
  function slGroupHTML(gid, c){
    const g = SL[gid], items = g.items(c);
    const rows = list=> list.map(x=> slRowHTML(gid, g, x, c)).join('');
    let body;
    if(!items.length) body = `<p class="hm-muted hm-small sl-empty">${esc(g.empty || 'Nothing added yet.')}</p>`;
    else if(gid === 'hold'){
      const by = {};
      items.forEach(h=>{ (by[h.accountId || '_'] = by[h.accountId || '_'] || []).push(h); });
      body = Object.keys(by).map(k=>{
        const a = (c.accounts||[]).find(x=> x.id === k);
        const tot = by[k].reduce((s,h)=> s + (Number(h.value)||0), 0);
        return slSubHTML('hold:' + k, a ? acctTitle(a) : 'No account', slCount(by[k].length, 'holding', 'holdings'), money(tot), rows(by[k]), '', SL_DOT[a ? a.type : 'other'] || SL_DOT.other);
      }).join('');
    } else if(gid === 'acct'){
      const known = [].concat(...SL_KINDS.map(k=> k[2]));
      body = SL_KINDS.concat([['other', 'Other accounts', null]]).map(([k, title, types])=>{
        const list = items.filter(a=> types ? types.indexOf(a.type) >= 0 : known.indexOf(a.type) < 0);
        if(!list.length) return '';
        const tot = list.reduce((s,a)=> s + (Number(a.value)||0), 0);
        const flagged = list.filter(a=> slFlag(a, c)).length;
        return slSubHTML('acct:' + k, title, slCount(list.length, 'account', 'accounts'), money(tot), rows(list), flagged ? slCount(flagged, 'to check', 'to check') : '', SL_DOT[k] || SL_DOT.other);
      }).join('');
    } else if(gid === 'spend'){
      body = [['essential', 'Essential'], ['lifestyle', 'Lifestyle']].map(([k, title])=>{
        const list = items.filter(x=> (x.category === 'lifestyle' ? 'lifestyle' : 'essential') === k);
        const tot = list.reduce((s,x)=> s + (Number(x.amount)||0), 0);
        return slSubHTML('spend:' + k, title, slCount(list.length, 'line', 'lines'), money(tot) + ' a month', list.length ? rows(list) : '<li class="sl-none hm-muted hm-small">Nothing here yet.</li>', '', k);
      }).join('');
    } else body = `<ul class="sl-list">${rows(items)}</ul>`;
    const extra = gid === 'acct' ? `<button type="button" class="hm-btn" data-sl-update>Update balances</button>` : '';
    return `<section class="hm-tile st-card sl-group"><div class="sl-head"><h3 class="hm-h3">${esc(g.heading)}</h3><div class="sl-acts">${extra}<button type="button" class="hm-btn hm-btn-primary" data-sl-add="${gid}">${esc(g.add)}</button></div></div>${body}</section>`;
  }
  function slRender(c, sec){
    if(!slReady || !SL_SECS[sec]) return;
    if(sec === 'accounts' && TEI.render.update) TEI.render.update(c); // the Money paid in log
    const secEl = document.querySelector('#stRoot [data-st-sec="'+sec+'"]');
    let host = secEl.querySelector('.sl-host');
    if(!host){ host = document.createElement('div'); host.className = 'sl-host'; secEl.insertBefore(host, secEl.querySelector('[data-st-host]')); }
    const root = $s('stRoot');
    host.innerHTML = SL_SECS[sec].map(gid=> slGroupHTML(gid, c)).join('') +
      SL_FOLDS.filter(f=> f[0] === sec).map(f=>{ const on = root.classList.contains('sl-show-' + f[1]);
        return `<button type="button" class="sl-fold" data-sl-fold="${f[1]}" aria-expanded="${on}"><span><b>${f[2]}</b><small>${f[3]}</small></span>${CHEV}</button>`; }).join('');
  }

  let slState = null;
  function slCancel(g){
    const f = (TEI.adviser && TEI.adviser.forms && TEI.adviser.forms.cancel) || {};
    if(g.cancel === 'expense'){ if(f.expense){ f.expense('fixed'); f.expense('variable'); } }
    else if(f[g.cancel]) f[g.cancel]();
  }
  /* Plainer labels while a form is in the panel; the coach's wording comes
     back when it returns to the Adviser Workspace. */
  const SL_LABELS = {
    newAcctContrib:'Paid in each month £', newAcctContribPersonal:'You pay in each month £', newAcctContribEmployer:'Employer or salary sacrifice each month £',
    newAcctOpeningContrib:'Paid in before Wealth OS started £', newAcctCashBalance:'Cash not yet invested £',
    newHoldingTicker:'Ticker', newHoldingUnits:'Units', newHoldingValue:'Value £', newHoldingCostBasis:'What you paid £',
    newHoldingSector:'Sector', newHoldingTheme:'Themes', advNewAssetNotes:'Description', advNewLiabLinkedAsset:'Secured against',
    advNewIncomeOwner:'Whose income', advNewFixedLabel:'What is it?', advNewVariableLabel:'What is it?'
  };
  function slLabels(form, on){
    Object.keys(SL_LABELS).forEach(id=>{
      const f = form.contains($s(id)) && slField(id), span = f && f.querySelector(':scope > span');
      if(!span) return;
      if(on){ if(span.dataset.slOrig == null) span.dataset.slOrig = span.textContent; span.textContent = SL_LABELS[id]; }
      else if(span.dataset.slOrig != null){ span.textContent = span.dataset.slOrig; delete span.dataset.slOrig; }
    });
  }
  function slMount(btnId){
    const form = slFormOf(btnId); if(!form) return null;
    const ph = document.createComment('settings panel');
    form.parentNode.insertBefore(ph, form);
    $s('slBody').appendChild(form);
    form.appendChild(sl.more);
    sl.more.hidden = !form.querySelector('[data-sl-more]');
    slLabels(form, true);
    return {form, ph};
  }
  function slUnmount(s){
    if(!s || !s.form) return;
    slLabels(s.form, false);
    if(s.ph.parentNode) s.ph.parentNode.insertBefore(s.form, s.ph);
    s.ph.remove();
    if(sl.more.parentNode) sl.more.remove();
  }
  function slOpen(gid, key){
    const c = client(); if(!c) return;
    const g = SL[gid];
    const item = key == null ? null : g.items(c).find(x=> slKey(g, x) === key);
    if(slState) slClose(true);
    slCancel(g);
    const kind = gid === 'spend' ? (item ? item.kind : 'fixed') : null;
    if(item){ const eb = document.querySelector(g.edit(item)); if(eb) eb.click(); }
    const m = slMount(kind ? slSpendBtn(kind) : g.btn); if(!m) return;
    // The account's set-and-forget / earmarked switches sit in a <details>;
    // "More detail" shows or hides them, so it stays open in the panel.
    const det = m.form.querySelector('details.acct-more'); if(det) det.open = true;
    slState = Object.assign({g, gid, item, kind, opener: document.activeElement}, m);
    const d = $s('slDrawer');
    d.classList.remove('sl-more-on'); sl.more.setAttribute('aria-expanded', 'false'); sl.more.textContent = 'More detail';
    $s('slKicker').textContent = ST_TITLES[g.sec] || '';
    $s('slTitle').textContent = item ? g.label(item) : g.add;
    $s('slRemove').hidden = !item;
    $s('slSeg').hidden = gid !== 'spend';
    if(gid === 'spend') slSegState(item ? item.category === 'lifestyle' ? 'lifestyle' : 'essential' : 'essential');
    let sum = '';
    if(gid === 'acct' && item){
      const cb = TEI.calc.acctContributionBreakdown(c, item.id);
      sum = cb.recorded ? 'Paid in to date: ' + money(cb.total) + '.' : '';
      if(TEI.calc.accountHasHoldings(c, item.id)) sum += ' The value comes from your holdings; change it in Holdings.';
      if(item.hasContributionRule) sum += ' Your coach set the monthly amount with a contribution rule.';
    }
    $s('slSum').textContent = sum.trim();
    $s('slSum').hidden = !sum;
    $s('slScrim').hidden = false; d.hidden = false;
    const first = m.form.querySelector('input:not([type=hidden]):not(:disabled), select:not(:disabled)');
    (first || $s('slClose')).focus();
  }
  function slClose(){
    if(!slState) return;
    const s = slState; slState = null;
    slUnmount(s);
    slCancel(s.g);
    $s('slDrawer').hidden = true; $s('slScrim').hidden = true;
    if(s.opener && document.contains(s.opener)) s.opener.focus();
  }
  function slRemove(){
    const s = slState; if(!s || !s.item) return;
    if(!s.g.owns && !confirm('Remove ' + s.g.label(s.item) + '?')) return;
    const b = document.querySelector(s.g.del(s.item)); if(b) b.click();
  }
  function slSegState(v){ $s('slSeg').querySelectorAll('[data-sl-seg]').forEach(b=> b.setAttribute('aria-pressed', b.dataset.slSeg === v ? 'true' : 'false')); }
  /* Essential or lifestyle. A new line goes in the coach's Fixed list when
     essential and Variable when lifestyle (Paddy, 20 Oct 2026: variable
     spending is lifestyle); an existing line keeps its list, only its tag
     changes. */
  function slSetSpend(v){
    const s = slState; if(!s || s.gid !== 'spend') return;
    slSegState(v);
    if(!s.item){
      const want = v === 'lifestyle' ? 'variable' : 'fixed';
      if(want !== s.kind){
        const from = s.kind === 'fixed' ? ['advNewFixedLabel','advNewFixedAmount'] : ['advNewVariableLabel','advNewVariableAmount'];
        const to = want === 'fixed' ? ['advNewFixedLabel','advNewFixedAmount'] : ['advNewVariableLabel','advNewVariableAmount'];
        to.forEach((id, i)=> $s(id).value = $s(from[i]).value);
        slUnmount(s);
        Object.assign(s, slMount(slSpendBtn(want)), {kind: want});
      }
    }
    $s(slSpendSel(s.kind)).value = v;
  }
  /* The chip on a spending row: switches the tag and saves straight away. */
  function slToggleSpend(key){
    const c = client(); if(!c) return;
    const x = SL.spend.items(c).find(i=> slKey(SL.spend, i) === key); if(!x) return;
    slCancel(SL.spend);
    const eb = document.querySelector(SL.spend.edit(x)); if(!eb) return;
    eb.click();
    $s(slSpendSel(x.kind)).value = x.category === 'lifestyle' ? 'essential' : 'lifestyle';
    $s(slSpendBtn(x.kind)).click();
  }
  function slClick(e){
    const t = e.target;
    let b;
    if((b = t.closest('[data-sl-grp]'))){
      const open = !slOpenGrps[b.dataset.slGrp];
      slOpenGrps[b.dataset.slGrp] = open;
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.parentNode.classList.toggle('open', open);
      b.nextElementSibling.hidden = !open;
      return;
    }
    if((b = t.closest('[data-sl-open]'))) return slOpen(b.dataset.slOpen, b.dataset.slId);
    if((b = t.closest('[data-sl-add]'))) return slOpen(b.dataset.slAdd, null);
    if((b = t.closest('[data-sl-spend]'))) return slToggleSpend(b.dataset.slSpend);
    if((b = t.closest('[data-sl-ok]'))){ const m = document.querySelector('[data-mark-reviewed="'+b.dataset.slOk+'"]'); if(m) m.click(); return; }
    if(t.closest('[data-sl-update]')) return TEI.app.showPage('update');
    if((b = t.closest('[data-sl-fold]'))){
      const on = $s('stRoot').classList.toggle('sl-show-' + b.dataset.slFold);
      b.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
  }
  function renderEfPicker(c){
    const ef = (c.cashflow && c.cashflow.emergencyFund) || {};
    const cash = (c.accounts||[]).filter(a=> a.type === 'cash' || a.type === 'cash_isa');
    $s('stEf').innerHTML = '<option value="">Not chosen yet</option>' + cash.map(a=> `<option value="${esc(a.id)}">${esc(acctTitle(a))} · ${money(a.value)}</option>`).join('');
    $s('stEf').value = ef.accountId || '';
  }
  async function onEfChange(){
    const c = client(); if(!c) return;
    const id = $s('stEf').value || null;
    const acc = (c.accounts||[]).find(a=> a.id === id);
    const ef = (c.cashflow.emergencyFund || {});
    c.cashflow.emergencyFund = TEI.calc.stampEdit({target: Number(ef.target)||0, accountId: id, current: acc ? (Number(acc.value)||0) : 0}, c.meta.role);
    $s('stPlanState').textContent = 'Saving...';
    try{ await TEI.wealthOS.saveCashflowSettings(c.meta.clientId, c); $s('stPlanState').textContent = 'Saved'; }
    catch(err){ console.error('Wealth OS: safety net account not saved', err); $s('stPlanState').textContent = 'That did not save. Please try again.'; }
  }

  /* Request buttons outside Settings (Paddy, 20 Oct 2026: "any buttons which
     make a request need functionality"). Discuss next session on the
     coach's corners and Book a session on Home send the coach a request
     (wealth_os.feedback; its trigger emails Paddy with the client's name,
     email and a link, migration 016) instead of opening the booking link.
     A coach previewing a client's Wealth OS sends nothing. */
  const WO_REQUESTS = {
    session: b=>{
      const m = b.closest('section') && b.closest('section').querySelector('.gl-coach-msg, .wl-coach-msg');
      const said = m ? m.textContent.trim() : '';
      return {text: 'Would like to talk about this at the next session' + (said ? ': "' + said + '"' : '.'),
        sent: 'Sent. Your coach will bring this to your next session.'};
    },
    book: ()=> ({text: 'Asked to book a session.', sent: 'Sent. Your coach will be in touch to arrange a time.'})
  };
  document.addEventListener('click', async e=>{
    const b = e.target.closest('[data-wo-request]');
    if(!b || b.disabled || !WO_REQUESTS[b.dataset.woRequest]) return;
    e.preventDefault();
    const c = client(); if(!c) return;
    const r = WO_REQUESTS[b.dataset.woRequest](b);
    const book = b.dataset.woRequest === 'book';
    const tile = b.closest('section');
    const state = tile && tile.querySelector('.wo-req-state');
    const say = t=>{ if(book){ setTextIn('whSessionText', t); } else if(state) state.textContent = t; };
    if(c.meta.role === 'adviser'){ say('Clients send this to you. Nothing is sent while you preview.'); return; }
    const page = ((b.closest('.page') || {}).id || '').replace('page-', '');
    const btns = book ? [$s('whSessionBtn'), $s('whSessionCover')] : [b];
    btns.forEach(x=>{ if(x) x.disabled = true; });
    try{
      await TEI.wealthOS.saveFeedback(c.meta.clientId, 'session', page, r.text, c.meta.role);
      if(book){ setTextIn('whSessionTitle', 'Request sent'); $s('whSessionBtn').textContent = 'Sent to your coach'; }
      else b.textContent = 'Sent to your coach';
      say(r.sent);
    } catch(err){
      console.error('Wealth OS: request not sent', err);
      btns.forEach(x=>{ if(x) x.disabled = false; });
      say('That did not send. Please try again.');
    }
  });
  function setTextIn(id, t){ const el = $s(id); if(el) el.textContent = t; }

  TEI.settings = { open: openSettings, renderMe, wireMe, wire: wireSettings, select: sec=>{ const c = client(); if(c) selectSection(c, sec); },
    fold: f=> $s('stRoot').classList.add('sl-show-' + f) };

  /* ================= LIBRARY (phones, spec B10) =================
     Plan: the latest Wealth Plan (an uploaded forecast document) with Open
     plan and View forecast, this month's agreed next steps (Home's list),
     and earlier versions. Learn: continue learning and the shelves. Meeting
     notes: note documents, newest first, the latest marked; a chip shows
     every document. No summary field exists on documents yet, so a card
     shows the title and date. */
  let libDocs = 'notes', libSuiteLoaded = false;
  function libDate(d){ return TEI.forecastView ? TEI.forecastView.fmtDate(d.uploadedAt || d.date) : (d.date || ''); }
  function renderLibrary(client){
    const docs = (client.documents || []).slice().sort((a,b)=> String(b.uploadedAt || b.date || '').localeCompare(String(a.uploadedAt || a.date || '')));
    const plans = docs.filter(d=> d.type === 'forecast' && d.storagePath);
    const latest = plans[0];
    $s('libPlan').innerHTML = `<div class="hm-orbit hm-orbit-low" aria-hidden="true"></div>
      <p class="hm-label">Your plan</p><h2 class="lib-plan-t">Wealth Plan and Forecast</h2>
      <p class="lib-plan-s">${latest ? 'Updated ' + esc(libDate(latest)) : 'Your coach adds your Wealth Plan here after your plan session.'}</p>
      <div class="hm-actions">${latest ? `<button type="button" class="hm-btn lib-plan-open" data-forecast-open="${esc(latest.id)}">Open plan</button>` : ''}<button type="button" class="hm-btn lib-plan-fc" data-lib-page="planning">View forecast</button></div>`;
    const steps = TEI.homeSteps ? TEI.homeSteps(client) : [];
    $s('libSteps').innerHTML = steps.length ? steps.map((s, i)=> `<li><span><b>${esc(s.text)}</b><small>${s.coach ? 'Agreed with your coach' + (s.agreedAt ? ' · ' + esc(stDate(s.agreedAt)) : '') : esc(s.why || '')}</small></span>${s.act ? `<button type="button" class="hm-link hm-linkbtn" data-lib-step="${i}">${esc(s.act[0])}</button>` : ''}</li>`).join('')
      : '<li class="st-empty">Nothing to do right now.</li>';
    $s('libSteps').onclick = e=>{ const b = e.target.closest('[data-lib-step]'); if(b && steps[b.dataset.libStep]) steps[b.dataset.libStep].act[1](); };
    $s('libEarlierWrap').hidden = plans.length < 2;
    $s('libEarlier').innerHTML = plans.slice(1).map(d=> `<li><span><b>${esc(d.name || 'Wealth Plan')}</b><small>${esc(libDate(d))}</small></span>${docOpenHTML(d)}</li>`).join('');
    const meta = $s('whLearnMeta');
    $s('libLearnMeta').textContent = meta && meta.textContent ? meta.textContent : 'Lessons at your own pace, stage by stage.';
    if(!libSuiteLoaded){
      libSuiteLoaded = true;
      fetch('/hub/suite/notes/manifest.json').then(r=> r.ok ? r.json() : []).then(list=>{
        const top = (list || []).filter(n=> n.category === 'Growth Portfolio').slice(0, 3);
        $s('libSuite').insertAdjacentHTML('beforeend', top.map(n=> `<li><a href="/hub/suite.html?note=${encodeURIComponent(n.slug)}">${esc(n.name)}<small>${esc(n.summary || '')}</small></a></li>`).join(''));
      }).catch(()=>{});
    }
    renderLibNotes(docs);
  }
  function renderLibNotes(docs){
    const show = libDocs === 'all' ? docs : docs.filter(d=> d.type === 'note');
    document.querySelectorAll('[data-lib-docs]').forEach(b=> b.setAttribute('aria-pressed', b.dataset.libDocs === libDocs ? 'true' : 'false'));
    $s('libNotes').innerHTML = show.length ? show.map((d, i)=> `<li class="hm-tile lib-note${i === 0 && libDocs === 'notes' ? ' lib-latest' : ''}">
        <div class="hm-row"><span class="hm-label">${esc(libDate(d))}</span>${i === 0 && libDocs === 'notes' ? '<span class="lib-badge">Latest</span>' : ''}</div>
        <h3 class="hm-h3">${esc(d.name || 'Document')}</h3>
        <p class="hm-muted hm-small">${esc(docMetaText(d))}</p>${docOpenHTML(d)}</li>`).join('')
      : `<li class="hm-muted hm-small lib-empty">${libDocs === 'notes' ? 'Notes from each session appear here after it.' : 'No documents yet.'}</li>`;
  }
  document.addEventListener('click', e=>{
    const p = e.target.closest('[data-lib-page]');
    if(p){ e.preventDefault(); TEI.app.showPage(p.dataset.libPage); return; }
    const f = e.target.closest('[data-lib-docs]');
    if(f){ libDocs = f.dataset.libDocs; const c = client(); if(c) renderLibNotes((c.documents||[]).slice().sort((a,b)=> String(b.uploadedAt || b.date || '').localeCompare(String(a.uploadedAt || a.date || '')))); }
  });
  TEI.render.library = renderLibrary;

  TEI.render.documents = renderDocuments;
  TEI.render.mydetails = function(client){ wireSettings(); renderMyDetails(client); };
  TEI.myDetails = { restorePanel: restoreMyDetailsPanel };
})();

