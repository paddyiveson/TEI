/* ================================================================
   WEALTH OS v2 (TEI Launch v2): shared helpers for Wealth, Forecast
   and Cashflow. Formatting, count-ups, info bubbles, the hide-figures
   eye, the coach's note per page (D38), "Add to next session", and the
   debt model both the Wealth Debts row and the Cashflow Debts tile read.
   ================================================================ */
window.TEI = window.TEI || {};
(function(){
  'use strict';
  const RM = ()=> !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const PHONE = ()=> !!(window.matchMedia && matchMedia('(max-width:860px)').matches);
  const esc = s=> String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = n=> (n < 0 ? '−' : '') + '£' + Math.abs(Math.round(n)).toLocaleString('en-GB');
  const fk = n=> fmt(Math.round(n/1000)*1000);
  const sk = n=>{ const a = Math.abs(n); return (n < 0 ? '−' : '') + '£' + (a >= 1e6 ? (a/1e6).toFixed(2) + 'm' : a >= 1000 ? Math.round(a/1000) + 'k' : Math.round(a)); };
  const sgn = n=> n > 0 ? '+' + fmt(n) : n < 0 ? fmt(n) : 'No change';
  const pc = n=> (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%';
  const cls = n=> n > 0 ? 'up' : n < 0 ? 'dn' : 'flat';
  const store = {get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }};
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const CHEV = '<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>';
  const TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  const ARR = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
  const INFO = (t, c)=> '<button type="button" class="info' + (c ? ' ' + c : '') + '" aria-label="More about this"><span aria-hidden="true">i</span><span class="bub" role="tooltip">' + t + '</span></button>';

  function hidden(){ return document.documentElement.classList.contains('wo-hide-figs'); }
  function countUp(el, to, f, dur){
    if(!el) return;
    if(RM() || hidden()){ el.textContent = f(to); el.style.filter = ''; return; }
    const t0 = performance.now(); dur = dur || 800;
    (function step(t){
      const p = Math.min(Math.max((t - t0)/dur, 0), 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = f(to*e); el.style.filter = p < 1 ? 'blur(' + (4*(1 - e)).toFixed(2) + 'px)' : '';
      if(p < 1) requestAnimationFrame(step); else el.textContent = f(to);
    })(t0);
  }
  function onView(el, fn, th){
    if(!el) return;
    if(!('IntersectionObserver' in window)){ fn(); return; }
    const io = new IntersectionObserver(es=>{ if(es.some(e=> e.isIntersecting)){ io.disconnect(); fn(); } }, {threshold: th || .35});
    io.observe(el);
  }
  function bindInfo(root){
    if(!root) return;
    root.querySelectorAll('.info').forEach(b=> b.onclick = e=>{
      e.stopPropagation();
      const o = b.classList.contains('open');
      document.querySelectorAll('.info.open').forEach(x=> x.classList.remove('open'));
      if(!o) b.classList.add('open');
    });
  }
  document.addEventListener('click', ()=> document.querySelectorAll('.wo2 .info.open').forEach(x=> x.classList.remove('open')));
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') document.querySelectorAll('.wo2 .info.open').forEach(x=> x.classList.remove('open')); });

  /* The eye: hides every figure on the three pages, remembered on this device. */
  function setHide(h){
    document.documentElement.classList.toggle('wo-hide-figs', h);
    document.querySelectorAll('.wo2').forEach(r=> r.classList.toggle('hide-figs', h));
    document.querySelectorAll('[data-wo2-eye]').forEach(b=>{
      b.setAttribute('aria-pressed', h ? 'true' : 'false');
      b.setAttribute('aria-label', h ? 'Show figures' : 'Hide figures');
      const sl = b.querySelector('.eye-slash'); if(sl) sl.style.display = h ? '' : 'none';
    });
    store.set('wo-hide', h ? '1' : '0');
  }
  document.addEventListener('click', e=>{ const b = e.target.closest('[data-wo2-eye]'); if(b) setHide(!hidden()); });
  const EYE = '<button class="icb" type="button" data-wo2-eye aria-pressed="false" aria-label="Hide figures"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="M4 4l16 16" style="display:none"/></svg></button>';
  function syncEye(){ setHide(store.get('wo-hide') === '1'); }

  /* ---------- coach's note per page (D38) ---------- */
  const NOTE_KEY = {wealth:'portfolioCoach', forecast:'forecastCoach', cashflow:'cashflowCoach'};
  function shortDate(d){ return d.getDate() + ' ' + MON[d.getMonth()]; }
  /* {text, date: Date|null, dateTxt} when the coach wrote one, else null. */
  function note(client, page){
    const n = client[NOTE_KEY[page]] || {};
    if(n.mode !== 'manual' || !n.message) return null;
    const d = n.updatedAt ? new Date(n.updatedAt) : null;
    return {text: String(n.message), date: d && !isNaN(d) ? d : null, dateTxt: d && !isNaN(d) ? shortDate(d) : ''};
  }
  /* "Written before your changes on [date]." when the change came after the note. */
  function staleLine(n, changedAt){
    if(!n || !n.date || !changedAt) return '';
    const c = new Date(changedAt);
    if(isNaN(c) || c <= n.date) return '';
    return 'Written before your changes on ' + shortDate(c) + '.';
  }
  function coachName(){ return 'Paddy Iveson, your coach'; }

  /* ---------- Add to next session ----------
     Bookings are made on Cal.com, so Wealth OS treats every client as
     having a next session to add to (logged in the PR). Adding writes the
     existing session request (wealth_os.feedback, area 'session', which
     emails the coach) and the button stays "Added" while that request is
     open. A coach previewing a client sends nothing. */
  const OPEN = s=> !s || ['new', 'open', 'seen', 'in_progress'].indexOf(String(s)) >= 0;
  function added(client, page){
    return (client.feedback||[]).some(f=> f.area === 'session' && f.pageContext === page && OPEN(f.status));
  }
  async function addToSession(client, page, topic){
    if(client.meta.role === 'adviser'){ TEI.app.showToast('Clients send this to you. Nothing is sent while you preview.'); return false; }
    const text = 'Would like to talk about ' + topic + ' at the next session.';
    try{
      await TEI.wealthOS.saveFeedback(client.meta.clientId, 'session', page, text, client.meta.role);
      client.feedback = [{id:'local-' + Date.now(), area:'session', pageContext:page, message:text, status:'new', submittedBy:'client', createdAt:new Date().toISOString()}].concat(client.feedback||[]);
      return true;
    } catch(err){
      console.error('Wealth OS: session request not sent', err);
      TEI.app.showToast('That did not send. Please try again.');
      return false;
    }
  }

  /* ---------- debts (migration 019) ----------
     Each liability with its details, in the shape the Cashflow mock-up
     uses: monthly payment, rate as a fraction, and the months until a fix
     or a 0% period ends. A missing payment is worked out from the term
     (or end date) as a level repayment; with neither, interest only. */
  const monthsTo = iso=>{ if(!iso) return null; const d = new Date(iso), n = new Date(); if(isNaN(d)) return null; return Math.max(0, (d.getFullYear() - n.getFullYear())*12 + d.getMonth() - n.getMonth()); };
  const TYPE_NAME = {mortgage:'Mortgage', loan:'Loan', credit:'Credit card', other:'Debt'};
  function debts(client){
    return ((client.wealth||{}).liabilities||[]).filter(l=> Number(l.balance) > 0).map(l=>{
      const bal = Number(l.balance), apr = l.apr != null ? Number(l.apr)/100 : null;
      const term = l.termMonths != null ? Number(l.termMonths) : monthsTo(l.endDate);
      let pay = l.minPay != null ? Number(l.minPay) : null;
      if(pay == null && apr != null && term){ const r = apr/12; pay = r ? bal*r/(1 - Math.pow(1 + r, -term)) : bal/term; }
      if(pay == null && apr != null) pay = bal*apr/12;
      const cm = monthsTo(l.changeDate);
      const promo = l.rateType === 'promo' || (apr === 0 && cm != null);
      return {id:l.id, type:l.type, name:l.name || TYPE_NAME[l.type] || 'Debt', bal, apr: apr || 0, hasRate: apr != null, pay: pay || 0,
        promoM: promo && cm ? cm : null, fixM: !promo && cm ? cm : null, afterApr: l.newApr != null ? Number(l.newApr)/100 : null};
    }).sort((a, b)=> b.bal - a.bal);
  }
  function payoff(d, extra){
    let b = d.bal, i = 0, m = 0; const pay = d.pay + (extra || 0);
    while(b > 0.5 && m < 720){
      const at = d.promoM || d.fixM;
      const apr = at && m >= at && d.afterApr != null ? d.afterApr : d.apr;
      const int = b*apr/12;
      if(pay <= int + 0.01) return {m:null, i:null};
      i += int; b = b + int - pay; m++;
    }
    return {m, i};
  }
  function addM(k){ const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth() + k, 1); return MON[d.getMonth()] + ' ' + d.getFullYear(); }
  const spanTxt = m=>{ const y = Math.floor(m/12), r = m%12; return (y ? y + ' year' + (y > 1 ? 's' : '') : '') + (y && r ? ' ' : '') + (r ? r + ' month' + (r > 1 ? 's' : '') : '') || '0 months'; };

  /* Whole years from the date of birth; null without one. */
  function ageNow(client){
    const dob = (client.personal||{}).dob;
    if(!dob) return null;
    const d = new Date(dob), n = new Date();
    if(isNaN(d)) return null;
    let a = n.getFullYear() - d.getFullYear();
    if(n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
    return a >= 0 && a < 110 ? a : null;
  }

  TEI.v2 = {RM, PHONE, esc, fmt, fk, sk, sgn, pc, cls, store, MON, CHEV, TICK, ARR, INFO, EYE,
    countUp, onView, bindInfo, setHide, syncEye, note, staleLine, coachName, added, addToSession,
    debts, payoff, addM, spanTxt, ageNow, shortDate};
})();
