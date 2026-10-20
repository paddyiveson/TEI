window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

(function(){
  /* Goals (redesign B12.6, spec B6, boards Goals and GoalsMobile).
     Headline goal, What if?, one card per goal, Add a goal, Milestones and
     Coach's corner. Progress is TEI.calc.goalProgress, status is
     TEI.calc.goalStatus (shared with Home) and every projection is
     TEI.calc.projectSeries at 5% a year, as the What if? tile says. */
  const {fmtGBP} = TEI.data;
  const MAX_MONTHS = 600;
  const $ = id => document.getElementById(id);
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function setText(id, t){ const el = $(id); if(el) el.textContent = t; }

  function monthDate(offset){ const n = new Date(); return new Date(n.getFullYear(), n.getMonth()+offset, 1); }
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monLabel(d){ return MON[d.getMonth()] + ' ' + d.getFullYear(); }
  function dateLabel(str){ const d = new Date(str); return isNaN(d) ? '' : monLabel(d); }
  function span(n){
    if(n < 24) return n + (n === 1 ? ' month' : ' months');
    const y = Math.floor(n/12), m = n % 12;
    return y + ' years' + (m ? ' ' + m + (m === 1 ? ' month' : ' months') : '');
  }
  function hitLabel(hit){
    if(hit === 0) return 'Reached';
    return hit == null ? 'after ' + monthDate(MAX_MONTHS).getFullYear() : monLabel(monthDate(hit));
  }

  /* ---------------- Headline goal + What if? ----------------
     The slider starts at what goes into wealth each month
     (actualTotalSavingInvesting) and runs £500 to £2,500 in £50 steps; the
     top end stretches when the client already puts away more, so the
     starting point is always their real figure. The chart's length is set
     from the target date and today's pace, so it holds still while the
     slider moves. */
  /* pick: the goal chosen in What if? (Paddy, 20 Oct 2026: "what goal is
     that linking to? Can we select a goal?"). Empty means the headline goal.
     The slider starts at what goes into the goal's linked accounts each
     month (or everything put away, for a goal with no linked accounts) and
     its range is sized to the goal. */
  const whatIf = {goalId:null, pmt:null, actual:0, pick:null};
  function chartableGoal(client, g){
    const st = TEI.calc.goalStatus(client, g);
    return st.monetary && st.gp.target > 0 && st.key !== 'complete';
  }

  function headlineFigures(client, g, st){
    const gp = st.gp;
    const P = gp.current || 0, T = gp.target || 0;
    const r = TEI.calc.GOAL_GROWTH/12;
    const pmt = whatIf.pmt;
    const hit = TEI.calc.goalMonthsToTarget(P, pmt, T, MAX_MONTHS);
    const hitActual = TEI.calc.goalMonthsToTarget(P, whatIf.actual, T, MAX_MONTHS);
    const plan = st.monthsLeft != null && st.monthsLeft >= 0 ? st.monthsLeft : null;
    const base = Math.max(plan || 0, hitActual == null ? 120 : hitActual, 24);
    const M = Math.min(480, Math.ceil(base*1.1/12)*12);
    return {P, T, r, pmt, hit, hitActual, plan, M};
  }

  function drawHeadline(client, g, st){
    const f = headlineFigures(client, g, st);
    const pts = TEI.calc.projectSeries(f.P, f.pmt, f.r, f.M);
    const mx = Math.max(f.T*1.18, pts[f.M], 1);
    const Y = v => (196 - v/mx*186).toFixed(1);
    const X = m => (m/f.M*600).toFixed(1);
    const step = Math.max(1, Math.floor(f.M/120));
    let line = '';
    for(let m=0; m<=f.M; m+=step) line += (m ? ' L' : 'M') + X(m) + ' ' + Y(pts[m]);
    if(f.M % step) line += ' L600 ' + Y(pts[f.M]);
    const planLine = f.plan != null && f.plan <= f.M
      ? `<line class="gl-c-plan" x1="${X(f.plan)}" y1="0" x2="${X(f.plan)}" y2="200"></line>` : '';
    $('glChart').innerHTML =
      `<line class="gl-c-target" x1="0" y1="${Y(f.T)}" x2="600" y2="${Y(f.T)}"></line>` + planLine +
      `<path class="gl-c-area" d="${line} L600 200 L0 200 Z"></path>` +
      `<path class="gl-c-line hm-draw" d="${line}"></path>`;
    $('glChart').setAttribute('aria-label', 'Projected path from ' + fmtGBP(f.P) + ' to the ' + fmtGBP(f.T) + ' target at ' + fmtGBP(f.pmt) + ' a month: ' + hitLabel(f.hit));
    const ticks = [];
    for(let i=0; i<=5; i++) ticks.push(i ? String(monthDate(Math.round(f.M*i/5)).getFullYear()) : 'Today');
    $('glAxis').innerHTML = ticks.map(t=> `<span>${t}</span>`).join('');
    $('glLegend').innerHTML = `<span><i class="gl-k-target"></i>Target ${fmtGBP(f.T)}</span>` +
      (g.targetDate ? `<span><i class="gl-k-plan"></i>Plan date: ${esc(dateLabel(g.targetDate))}</span>` : '');

    const hl = hitLabel(f.hit);
    $('glHeroSub').innerHTML = `${fmtGBP(f.P)} of ${fmtGBP(f.T)} · projected <span class="gl-hl">${esc(hl)}</span>`;
    setText('glPmtFmt', fmtGBP(f.pmt));
    setText('glHit', hl);
    let diff = '';
    if(f.hit === 0) diff = 'Already there';
    else if(f.hit == null) diff = 'Not reached within ' + (MAX_MONTHS/12) + ' years';
    else if(f.plan != null){
      const d = f.plan - f.hit;
      diff = d > 0 ? span(d) + ' ahead of plan' : d < 0 ? span(-d) + ' behind plan' : 'Right on plan';
    } else if(f.hitActual != null){
      const d = f.hitActual - f.hit;
      diff = d > 0 ? span(d) + ' sooner than today' : d < 0 ? span(-d) + ' later than today' : 'The same as today';
    }
    setText('glDiff', diff);
  }

  function renderPicker(client, head, g){
    const opts = (client.goals||[]).filter(x=> chartableGoal(client, x));
    const sel = $('glPick');
    sel.innerHTML = opts.map(x=> `<option value="${esc(x.id)}">${esc(x.name)}${head && x.id === head.id ? ' (headline)' : ''}</option>`).join('');
    sel.value = g ? g.id : '';
    $('glPickWrap').hidden = opts.length < 2;
  }
  function renderHeadline(client){
    const head = TEI.calc.northStarGoalRef ? TEI.calc.northStarGoalRef(client) : null;
    const picked = whatIf.pick && (client.goals||[]).find(x=> x.id === whatIf.pick);
    const g = picked && chartableGoal(client, picked) ? picked : head;
    const hero = $('glHero'), wi = $('glWhatIf');
    setText('glHeroLabel', g && head && g.id !== head.id ? 'Goal' : 'Headline goal');
    const showChart = on => ['glChart','glAxis','glLegend'].forEach(id=> $(id).toggleAttribute('hidden', !on)); // the chart is an svg, which has no .hidden property
    const note = $('glHeroNote');
    let pct = 0;
    if(!g){
      setText('glHeroName', 'No goals yet');
      setText('glHeroSub', 'Add a goal and the path to it shows here.');
      showChart(false); note.hidden = true; wi.hidden = true;
    } else {
      const st = TEI.calc.goalStatus(client, g);
      const gp = st.gp;
      pct = Math.max(0, Math.min(100, gp.pct || (st.key === 'complete' ? 100 : 0)));
      const year = g.targetDate ? new Date(g.targetDate).getFullYear() : null;
      setText('glHeroName', g.name + (year ? ' by ' + year : ''));
      const chartable = st.monetary && gp.target > 0 && st.key !== 'complete';
      if(chartable){
        if(whatIf.goalId !== g.id){
          whatIf.goalId = g.id;
          const linked = (g.linkedAccountIds||[]).length ? TEI.calc.goalLinkedMonthly(client, g) : null;
          whatIf.actual = Math.max(0, linked != null ? linked : TEI.calc.actualTotalSavingInvesting(client));
          const base = Math.max(whatIf.actual, st.needed || 0, 50);
          whatIf.max = Math.max(500, Math.ceil(base*2/50)*50);
          whatIf.step = whatIf.max <= 1000 ? 10 : 50;
          whatIf.pmt = Math.round(whatIf.actual/whatIf.step)*whatIf.step;
        }
        const range = $('glPmt');
        range.max = String(whatIf.max);
        range.step = String(whatIf.step);
        $('glWhatIf').querySelector('.gl-ends span:last-child').textContent = fmtGBP(whatIf.max);
        range.value = String(whatIf.pmt);
        renderPicker(client, head, g);
        showChart(true); note.hidden = true; wi.hidden = false;
        drawHeadline(client, g, st);
      } else {
        showChart(false); wi.hidden = true;
        let sub = '';
        if(st.key === 'complete') sub = 'Reached' + (TEI.calc.goalCompletedDate(g) ? ' ' + dateLabel(TEI.calc.goalCompletedDate(g)) : '') + '. Well done.';
        else if(g.progressType === 'income') sub = fmtGBP(gp.current) + ' a year of ' + fmtGBP(gp.target) + ' a year';
        else if(g.progressType === 'completion') sub = 'Tracked as done or not done.';
        else sub = 'Add a target amount to see the path to it.';
        setText('glHeroSub', sub);
        note.hidden = true;
      }
    }
    setText('glRingPct', Math.round(pct) + '%');
    $('glRing').setAttribute('stroke-dashoffset', (301.6 * (1 - pct/100)).toFixed(1));
    $('glRingSvg').setAttribute('aria-label', (g ? g.name : 'Headline goal') + ', ' + Math.round(pct) + ' percent of target');
    hero.dataset.goalId = g ? g.id : '';
  }

  /* ---------------- Goal cards ----------------
     Complete first (as on the board), then by target date, undated last. */
  function cardNote(client, g, st){
    const gp = st.gp;
    if(st.key === 'complete') return g.progressType === 'completion' ? 'Done.' : (gp.isComplete ? 'Target reached.' : 'Marked complete.');
    if(st.past) return 'Past its target date. Worth a look at your next session.';
    if(g.progressType === 'completion') return 'Tracked as done or not done.';
    if(g.progressType === 'income'){
      const inc = g.linkedIncomeId && (client.cashflow.income||[]).find(i=> i.id === g.linkedIncomeId);
      return 'Tracks ' + (inc ? inc.type : 'household') + ' income.';
    }
    if(!(gp.target > 0)) return 'Add a target amount to track this.';
    if(st.needed != null){
      if(st.key === 'behind') return fmtGBP(Math.max(1, st.needed - st.monthly)) + ' more a month would close the gap by ' + dateLabel(g.targetDate) + '.';
      return st.needed < 1 ? 'Growth on what is there already gets this to target.' : fmtGBP(st.needed) + ' a month keeps this on track.';
    }
    const monthly = TEI.calc.goalLinkedMonthly(client, g);
    const hit = monthly > 0 ? TEI.calc.goalMonthsToTarget(gp.current||0, monthly, gp.target, MAX_MONTHS) : null;
    return hit != null ? 'At ' + fmtGBP(monthly) + ' a month, reached around ' + hitLabel(hit) + '.' : 'Add a target date to see what it needs each month.';
  }

  function renderCards(client, goals, sts){
    const order = goals.slice().sort((a,b)=>{
      const ca = sts[a.id].key === 'complete', cb = sts[b.id].key === 'complete';
      if(ca !== cb) return ca ? -1 : 1;
      if(ca) return String(TEI.calc.goalCompletedDate(a)||'').localeCompare(String(TEI.calc.goalCompletedDate(b)||''));
      return (a.targetDate||'9999').localeCompare(b.targetDate||'9999');
    });
    $('glCards').innerHTML = order.map((g,i)=>{
      const st = sts[g.id], gp = st.gp;
      const pct = Math.max(0, Math.min(100, gp.pct || (st.key === 'complete' ? 100 : 0)));
      let fig;
      if(g.progressType === 'completion') fig = st.key === 'complete' ? 'Done' : 'Not yet';
      else if(g.progressType === 'income') fig = `${fmtGBP(gp.current)} <span>of ${fmtGBP(gp.target)} a year</span>`;
      else fig = `${fmtGBP(gp.current)} <span>of ${fmtGBP(gp.target)}</span>`;
      const when = st.key === 'complete' ? 'Done' : (g.targetDate ? dateLabel(g.targetDate) : 'No date set');
      const accts = (g.linkedAccountIds||[]).map(id=> client.accounts.find(a=> a.id === id)).filter(Boolean)
        .map(a=> `<span class="gl-acct">${esc(TEI.data.acctLabel(a))}</span>`).join('');
      return `<section class="hm-tile gl-card gl-card--${st.key}" style="animation-delay:${(0.12 + i*0.06).toFixed(2)}s">
        <div class="hm-row"><span class="gl-when">${esc(when)}</span><span class="gl-chip gl-chip--${st.key}">${st.label}</span></div>
        <h3 class="gl-card-name">${esc(g.name)}</h3>
        <p class="gl-card-fig">${fig}</p>
        <div class="hm-bar"><span class="hm-grow" style="width:${pct.toFixed(1)}%"></span></div>
        <p class="hm-muted hm-small">${esc(cardNote(client, g, st))}</p>
        <div class="gl-card-foot"><div class="gl-accts">${accts}</div><button type="button" class="hm-link hm-linkbtn" data-gl-edit="${esc(g.id)}">Edit<span class="gl-sr"> ${esc(g.name)}</span></button></div>
      </section>`;
    }).join('');
    // Add a goal fills what is left of the last row of cards (four to a
    // row), and becomes a slim full-width bar when that row is full.
    $('glAddCard').dataset.fill = String(order.length % 4);
  }

  /* ---------------- Milestones ----------------
     Evenly spaced, not to scale (spec B6): the last two goals reached
     (filled navy), Today (gold ring), then dated goals still to come, the
     headline goal filled gold. Seven points at most; the headline goal is
     always kept. */
  function renderMilestones(client, goals, sts, head){
    const tile = $('glMiles');
    const done = goals.filter(g=> sts[g.id].key === 'complete' && TEI.calc.goalCompletedDate(g))
      .sort((a,b)=> String(TEI.calc.goalCompletedDate(a)).localeCompare(String(TEI.calc.goalCompletedDate(b))))
      .slice(-2).map(g=> ({d:dateLabel(TEI.calc.goalCompletedDate(g)), t:g.name, k:'done'}));
    const ahead = goals.filter(g=> sts[g.id].key !== 'complete' && g.targetDate && !sts[g.id].past)
      .sort((a,b)=> a.targetDate.localeCompare(b.targetDate))
      .map(g=> ({d:dateLabel(g.targetDate), t:g.name, k: head && g.id === head.id ? 'head' : (sts[g.id].key === 'behind' ? 'behind' : 'next'), id:g.id}));
    let next = ahead;
    const room = 7 - done.length - 1;
    if(next.length > room){
      const h = next.find(m=> m.k === 'head');
      next = next.slice(0, room);
      if(h && next.indexOf(h) < 0) next[room-1] = h;
    }
    const items = done.concat([{d:'Today', t:monLabel(new Date()), k:'today'}], next);
    if(!goals.length || items.length < 2){ tile.hidden = true; return; }
    tile.hidden = false;
    const headItem = items.find(m=> m.k === 'head');
    const headYear = head && head.targetDate ? new Date(head.targetDate).getFullYear() : null;
    setText('glMilesTitle', headItem && headYear ? 'The road to ' + headYear : 'The road ahead');
    const n = items.length, t = done.length;
    const tl = $('glTl');
    tl.style.setProperty('--gl-n', n);
    tl.style.setProperty('--gl-fill-x', (t/n*100).toFixed(2) + '%');
    tl.style.setProperty('--gl-fill-y', (n > 1 ? t/(n-1)*100 : 0).toFixed(2) + '%');
    $('glMilesList').innerHTML = items.map(m=>
      `<li class="gl-m gl-m--${m.k}"><span class="gl-dot" aria-hidden="true"></span><span class="gl-m-d">${esc(m.d)}</span><span class="gl-m-t">${esc(m.t)}</span></li>`
    ).join('');
  }

  /* ---------------- Coach's corner ----------------
     The top Goals signal from the shared engine (the same one Wealth and
     Forecast use), with a plain fallback. */
  function renderCoach(client){
    const s = TEI.calc.pickTopSignal(client, 'goals');
    setText('glCoachMsg', s && s.relevant !== false ? s.message : 'Bring your goals to your next session: what to focus on first, and what each one needs a month.');
  }

  /* ---------------- Goal panel ---------------- */
  let lastFocus = null;
  function openPanel(goalId){
    const client = TEI.app.state.client;
    if(!client || !TEI.goalForm) return;
    TEI.goalForm.open(client, goalId || null);
    lastFocus = document.activeElement;
    $('glPanelScrim').hidden = false;
    const panel = $('glPanel');
    panel.hidden = false;
    panel.scrollTop = 0;
    const first = $('clNewGoalName');
    if(first) first.focus();
  }
  function closePanel(){
    const panel = $('glPanel');
    if(panel.hidden) return;
    panel.hidden = true;
    $('glPanelScrim').hidden = true;
    if(lastFocus && document.body.contains(lastFocus) && lastFocus.offsetParent) lastFocus.focus(); else $('glAddBtn').focus();
  }

  let wired = false;
  function wireOnce(){
    if(wired) return;
    wired = true;
    $('glAddBtn').addEventListener('click', ()=> openPanel(null));
    $('glAddCard').addEventListener('click', ()=> openPanel(null));
    $('glCards').addEventListener('click', e=>{
      const b = e.target.closest('[data-gl-edit]');
      if(b) openPanel(b.dataset.glEdit);
    });
    $('glPanelClose').addEventListener('click', closePanel);
    $('glPanelScrim').addEventListener('click', closePanel);
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closePanel(); });
    $('glPanel').addEventListener('keydown', e=>{
      if(e.key !== 'Tab') return;
      const f = Array.from(e.currentTarget.querySelectorAll('input, select, button, a[href]')).filter(el=> !el.disabled && el.offsetParent);
      if(!f.length) return;
      if(e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length-1].focus(); }
      else if(!e.shiftKey && document.activeElement === f[f.length-1]){ e.preventDefault(); f[0].focus(); }
    });
    if(TEI.goalForm) TEI.goalForm.onDone = closePanel;
    $('glPick').addEventListener('change', e=>{
      const client = TEI.app.state.client; if(!client) return;
      whatIf.pick = e.target.value || null;
      whatIf.goalId = null;
      renderHeadline(client);
    });
    $('glPmt').addEventListener('input', e=>{
      const client = TEI.app.state.client;
      const g = client && (client.goals||[]).find(x=> x.id === whatIf.goalId);
      if(!g) return;
      whatIf.pmt = parseInt(e.target.value, 10) || 0;
      drawHeadline(client, g, TEI.calc.goalStatus(client, g));
    });
  }

  // Settings > Goals opens the same panel (B9.2).
  TEI.goalsPage = { open(goalId){ wireOnce(); openPanel(goalId || null); } };

  TEI.render.goals = async function(client){
    wireOnce();
    // Catches anything that crossed its target (either direction) via a
    // path that did not already call checkGoalAutoComplete itself (data
    // edited elsewhere in the session, or a fresh load). No-op fast when
    // nothing changed.
    const changes = await TEI.calc.checkGoalAutoComplete(client);
    changes.completed.forEach(g=> TEI.app.showToast('"' + g.name + '" reached. Well done.'));
    changes.reopened.forEach(g=> TEI.app.showToast('"' + g.name + '" is below its target again, so it is open again.'));

    const goals = client.goals || [];
    const sts = {};
    goals.forEach(g=>{ sts[g.id] = TEI.calc.goalStatus(client, g); });
    const head = TEI.calc.northStarGoalRef ? TEI.calc.northStarGoalRef(client) : null;
    renderHeadline(client);
    renderCards(client, goals, sts);
    renderMilestones(client, goals, sts, head && sts[head.id] && sts[head.id].key !== 'complete' ? head : null);
    renderCoach(client);
  };
})();

