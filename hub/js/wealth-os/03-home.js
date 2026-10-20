window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

/* ================================================================
   WEALTH OS -- HOME (redesign B12.3, spec B4)
   Ten tiles. Every figure comes from the client record through the
   shared TEI.calc helpers, so Home agrees with Wealth, Goals, Forecast
   and Cashflow (wealth conversion and the safety net use the exact
   functions the Cashflow page uses).
   ================================================================ */
TEI.render = TEI.render || {};

(function(){
  const {fmtGBP, monthLabel, acctLabel, currentMonthKey} = TEI.data;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function setText(id, text){ const el = document.getElementById(id); if(el) el.textContent = text; }
  function fmtDate(v, opts){
    if(!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', opts || {day:'numeric', month:'short', year:'numeric'});
  }
  function show(id, on){ const el = document.getElementById(id); if(el) el.hidden = !on; }

  /* financialFreedomPct, nextMilestone and journey stages live in TEI.calc --
     shared with the Wealth page so both read the same source of truth. */
  function financialFreedomPct(client){ return TEI.calc.financialFreedomPct(client); }
  function nextMilestone(client){ return TEI.calc.nextMilestone(client); }

  function passiveIncomeMonthly(client){
    return (client.dividendHoldings||[]).reduce((s,h)=> s + (Number(h.amount)||0)*(Number(h.yield)||0)/100/12, 0);
  }

  /* Shared ETA text used by Financial Freedom and Next Milestone.
     Caps long horizons so the message stays reassuring rather than jarring. */
  function estimateCompletionText(remaining, monthlyContrib){
    if(remaining<=0) return 'Reached';
    if(monthlyContrib<=0) return 'Add regular contributions to see an estimated date';
    const monthsNeeded = Math.ceil(remaining/monthlyContrib);
    if(monthsNeeded > 600) return 'A long-term horizon at current contributions. Increasing them will bring it closer';
    const d = new Date(); d.setMonth(d.getMonth()+monthsNeeded);
    return 'Estimated ' + d.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  }

  /* The goal the headline tracks: an explicit override, else a goal matching
     the override label, else the client's first active goal. */
  function northStarGoalRef(client){
    const ns = client.northStar || {};
    const goals = client.goals || [];
    if(ns.goalLabel){
      const match = goals.find(g=>g.name===ns.goalLabel);
      if(match) return match;
    }
    return goals.find(g=> g.status !== 'completed') || goals[0] || null;
  }
  // Shared with the Goals page, so both show the same headline goal.
  TEI.calc.northStarGoalRef = northStarGoalRef;

  function timeGreeting(){
    const h = new Date().getHours();
    if(h < 12) return 'Good morning';
    if(h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /* Settings > Accounts (B4.1, B9.1). */
  function openAccountsSettings(){
    if(TEI.settings) TEI.settings.open('accounts'); else TEI.app.showPage('mydetails');
  }

  /* Smooth path through points: a cubic per segment with its control
     points at the horizontal midpoint, so the line never overshoots. */
  function smoothPath(pts){
    if(!pts.length) return '';
    let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for(let i=1; i<pts.length; i++){
      const [x0,y0] = pts[i-1], [x1,y1] = pts[i], mx = (x0+x1)/2;
      d += ` C ${mx.toFixed(1)} ${y0.toFixed(1)}, ${mx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  }
  function addMonths(key, n){
    const [y,m] = key.split('-').map(Number);
    const d = new Date(y, m-1+n, 1);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }

  /* ---------------- Header and setup ---------------- */
  function renderHeader(client){
    const first = client.personal.firstName;
    document.getElementById('heroTitle').innerHTML = first
      ? `<span class="hm-greet-d">${timeGreeting()}, ${esc(first)}</span><span class="hm-greet-m">Hi, ${esc(first)}</span>`
      : 'Welcome to your Wealth OS';
    setText('whDate', fmtDate(new Date(), {weekday:'long', day:'numeric', month:'long', year:'numeric'}));
    document.getElementById('whUpdateBtn').onclick = (e)=>{ e.preventDefault(); openAccountsSettings(); };
  }

  /* "Finish setting up" sits first while there is something to finish: the
     coach's setup request, or the client's own gaps before setup is done.
     The button opens the set up flow (hub/js/wealth-setup.js). */
  function renderSideSetup(client){
    const btn = document.getElementById('sideSetupBtn');
    if(!btn) return;
    const n = TEI.setup ? TEI.setup.leftToDo(client) : 0;
    btn.hidden = !n;
    if(n){
      document.getElementById('sideSetupSub').textContent = n + (n === 1 ? ' thing left' : ' things left');
      btn.onclick = ()=> TEI.setup.open();
    }
  }
  TEI.render = TEI.render || {};
  TEI.render.sideSetup = renderSideSetup;
  function renderSetup(client){
    renderSideSetup(client);
    // A coach's setup request (B13) takes over the tile while it is open.
    if(TEI.setup && TEI.setup.homeTile(client, {
      show: v=> show('whSetup', v), title: t=> setText('whSetupTitle', t), text: t=> setText('whSetupText', t),
      bar: pct=> { document.getElementById('whSetupBar').style.width = pct + '%'; },
      button: fn=> { document.getElementById('whSetupBtn').onclick = (e)=>{ e.preventDefault(); fn(); }; }
    })) return;
    show('whSetup', false);
  }

  /* ---------------- Total wealth (feature) ---------------- */
  const COMP_GROUPS = [
    {key:'pension',  label:'Pensions',           col:'#E8D6A8', types:['pension']},
    {key:'isa',      label:'ISAs',               col:'#B9CAE6', types:['isa']},
    {key:'lisa',     label:'Lifetime ISA',       col:'#F7F4ED', types:['lisa','cash_lisa']},
    {key:'cash',     label:'Cash',               col:'#AAB6C8', types:['cash','cash_isa']},
    {key:'gia',      label:'General investment', col:'#6FB3AE', types:['gia']},
    {key:'crypto',   label:'Crypto',             col:'#9DB59F', types:['crypto']},
    {key:'property', label:'Property',           col:'#6F86A8', types:[]},
    {key:'other',    label:'Other',              col:'#D9C9A0', types:[]}
  ];
  function groupOfType(type){ return (COMP_GROUPS.find(g=> g.types.includes(type)) || COMP_GROUPS[COMP_GROUPS.length-1]).key; }

  function renderWealth(client){
    const months = TEI.calc.buildMergedMonths(client);
    const keys = Object.keys(months).sort();
    const total = TEI.calc.netWorth(client);
    setText('whWealthTotal', fmtGBP(total));

    const fact = TEI.calc.computeNetWorthFact(client);
    const change = document.getElementById('whWealthChange');
    if(fact.netWorthChange != null){
      const v = fact.netWorthChange;
      change.innerHTML = `<span class="hm-up">${v<0?'-':'+'}${fmtGBP(Math.abs(v))}</span> since last month`;
    } else {
      change.textContent = keys.length ? 'Log a second month to see the change' : 'Add your accounts to see your total';
    }
    setText('whWealthAsOf', fact.latestKey ? 'Updated ' + monthLabel(fact.latestKey) : '');

    // Sparkline: the last 12 logged months at the same basis as the headline
    // (accounts plus property and other assets, less debts -- those have no
    // history, so the same offset applies to every point, as on Wealth).
    const spark = document.getElementById('whSpark');
    const last = keys.slice(-12);
    if(last.length >= 2){
      const offset = total - TEI.calc.latestNetWorth(client);
      const vals = last.map(k=> months[k].total + offset);
      const lo = Math.min(...vals), hi = Math.max(...vals), span = (hi-lo) || Math.abs(hi) || 1;
      const pts = vals.map((v,i)=> [i*600/(vals.length-1), 118 - (v-lo)/span*104]);
      const line = smoothPath(pts);
      spark.innerHTML = `<path class="hm-spark-fill" d="${line} L 600 130 L 0 130 Z"></path>`
        + `<path class="hm-spark-line hm-draw" d="${line}" pathLength="900" vector-effect="non-scaling-stroke"></path>`;
      spark.style.display = '';
    } else {
      spark.innerHTML = '';
      spark.style.display = 'none';
    }

    // Composition of everything owned (debts are left out of the bar).
    const b = TEI.calc.latestBreakdown(months);
    const sums = {};
    (client.accounts||[]).forEach(a=>{ const v = Number(b[a.id])||0; if(v>0){ const g = groupOfType(a.type); sums[g] = (sums[g]||0) + v; } });
    ((client.wealth||{}).assets||[]).forEach(a=>{ const v = Number(a.value)||0; if(v>0){ const g = a.type==='property' ? 'property' : 'other'; sums[g] = (sums[g]||0) + v; } });
    const gross = Object.values(sums).reduce((s,v)=>s+v, 0);
    const parts = COMP_GROUPS.filter(g=> sums[g.key] > 0).map(g=>{
      const p = sums[g.key]/gross*100;
      return Object.assign({value:sums[g.key], pct: p < 1 ? 'under 1' : Math.round(p)}, g);
    });
    document.getElementById('whComp').innerHTML = parts.length
      ? `<div class="hm-comp-bar" role="img" aria-label="${esc(parts.map(p=>p.label+' '+p.pct+'%').join(', '))}">${parts.map(p=>`<span style="flex:${p.value} 1 0; background:${p.col};"></span>`).join('')}</div>`
        + `<div class="hm-comp-key">${parts.map(p=>`<span><i style="background:${p.col};"></i>${esc(p.label)} ${p.pct}%</span>`).join('')}</div>`
      : '';
  }

  /* ---------------- Next step from your coach ----------------
     computeNextBestAction honours the coach's own entry
     (client.insights.nextBestAction) before its automatic suggestion.
     Mark as done records the step as a win for this month on the client
     record (clients.monthly_wins), so the coach sees it too. */
  function stepId(text){ return 'step:' + String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

  /* The steps for this month, in order (Paddy, 20 Oct 2026: "Mark as done
     needs to actually do something"). The coach's own step comes first,
     then what the record shows is still to do. Each has a button that does
     it; Mark as done records it (clients.monthly_wins) and moves on to the
     next. A month carried forward by the auto-snapshot does not count as
     updated. */
  function homeSteps(client){
    const key = currentMonthKey(), out = [];
    const coach = client.insights && client.insights.nextBestAction;
    if(coach && coach.text) out.push(Object.assign({id: stepId(coach.text), coach: true}, coach));
    const accts = client.accounts || [];
    if(!accts.length){
      out.push({id:'step:first-account', text:'Add your first account', why:'Start with the account you check most often.',
        act:['Add an account', ()=> TEI.settings.open('accounts')]});
    } else {
      const m = (client.months||{})[key] || {}, meta = (client.monthsMeta||{})[key] || {};
      const stale = accts.filter(a=> m[a.id] == null || meta[a.id] === true);
      if(stale.length) out.push({id:'step:balances:' + key, text:"Update this month's balances",
        why: stale.length === accts.length ? 'Keeping the numbers current is what makes your projections worth trusting.'
          : stale.length + (stale.length === 1 ? ' account has' : ' accounts have') + ' not been updated this month.',
        act:['Update balances', ()=> TEI.app.showPage('update')]});
    }
    if(!(client.cashflowMonths||{})[key]) out.push({id:'step:cashflow:' + key, text:"Log this month's cashflow",
      why:'Take-home, essentials, lifestyle and what went into wealth. It keeps your wealth conversion rate up to date.',
      act:['Update this month', ()=>{ TEI.app.showPage('cashflow'); if(TEI.cashflowPage) TEI.cashflowPage.openUpdate(); }]});
    const sn = TEI.calc.safetyNet(client);
    if(!sn.linked && accts.some(a=> a.type === 'cash' || a.type === 'cash_isa')){
      out.push({id:'step:safety-account', text:'Choose where your safety net is kept',
        why:'Pick the cash account that holds it, so Home and Cashflow can track it.', act:['Choose the account', ()=> TEI.settings.open('plan')]});
    } else if(sn.linked && sn.stage !== 'full' && sn.monthlySpend > 0){
      const gap = Math.max(0, sn.fullMonths * sn.monthlySpend - sn.current);
      out.push({id:'step:safety:' + key, text:'Build your safety net',
        why: fmtGBP(gap) + ' more would cover ' + sn.fullMonths + ' months of spending.', act:['See your safety net', ()=> TEI.app.showPage('cashflow')]});
    }
    // Setting up is not repeated here: Home has its own Finish setting up tile.
    const behind = (client.goals||[]).filter(g=> g.status !== 'completed').find(g=> TEI.calc.goalStatus(client, g).key === 'behind');
    if(behind) out.push({id:'step:goal:' + behind.id + ':' + key, text:'Look at your ' + behind.name + ' goal',
      why:'It is behind for its target date. Goals shows what a month would close the gap.', act:['See Goals', ()=> TEI.app.showPage('goals')]});
    if(TEI.calc.computeBudgetAndFI(client).savings < 0) out.push({id:'step:budget:' + key, text:'Review your spending',
      why:'Spending and saving commitments are more than your take-home pay.', act:['Open Cashflow', ()=> TEI.app.showPage('cashflow')]});
    const doneIds = new Set((client.monthlyWins||[]).filter(w=> w && w.month === key).map(w=> w.id));
    return out.filter(s=> !doneIds.has(s.id));
  }

  TEI.homeSteps = homeSteps; // the Library's Agreed next steps (spec B10)

  function renderStep(client){
    const steps = homeSteps(client);
    const nba = steps[0] || {};
    const month = new Date().toLocaleDateString('en-GB', {month:'long'});
    const wins = (client.monthlyWins||[]).filter(w=> w && w.month === currentMonthKey()).length;
    setText('whStepLabel', !steps.length ? 'Next step' : (nba.coach ? 'Next step · from your coach' : 'Next step') + (steps.length > 1 ? ' · 1 of ' + steps.length : ''));
    setText('whStepTitle', nba.text || 'You are up to date for ' + month);
    const agreed = nba.agreedAt ? ' Agreed ' + fmtDate(nba.agreedAt, {day:'numeric', month:'long', year:'numeric'}) + '.' : '';
    setText('whStepWhy', steps.length ? (nba.why || '') + agreed
      : wins ? wins + (wins === 1 ? ' step' : ' steps') + ' done this month. Nothing else needs doing right now.' : 'Nothing needs doing right now.');
    const act = document.getElementById('whStepAct');
    if(nba.act){ act.textContent = nba.act[0]; act.onclick = nba.act[1]; act.hidden = false; }
    else { act.hidden = true; act.onclick = null; }

    const lesson = document.getElementById('whStepLesson');
    if(nba.lesson && nba.lesson.title){
      lesson.textContent = 'Read: ' + nba.lesson.title;
      lesson.href = nba.lesson.url || '/hub/education/index.html';
      lesson.hidden = false;
    } else {
      lesson.hidden = true;
    }

    // Read why opens the latest Wealth Plan document, where the reasoning lives.
    const plan = (client.documents||[]).filter(d=> d.type === 'forecast' && d.storagePath)
      .sort((a,b)=> String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')))[0];
    const read = document.getElementById('whStepRead');
    if(plan){ read.setAttribute('data-forecast-open', plan.id); read.hidden = false; }
    else { read.removeAttribute('data-forecast-open'); read.hidden = true; }

    const btn = document.getElementById('whStepDone');
    const id = nba.id || stepId(nba.text);
    const monthKey = currentMonthKey();
    btn.hidden = !nba.text;
    btn.disabled = false;
    btn.textContent = 'Mark as done';
    btn.classList.toggle('hm-btn-primary', !nba.act);
    btn.onclick = async ()=>{
      btn.disabled = true;
      const win = {id, label: nba.text, source: client.meta.role === 'adviser' ? 'adviser' : 'client', month: monthKey, doneAt: new Date().toISOString()};
      const next = (client.monthlyWins||[]).concat([win]);
      try{
        if(TEI.wealthOS && TEI.wealthOS.saveMonthlyWins && TEI.data.isRealId(client.meta.clientId)){
          await TEI.wealthOS.saveMonthlyWins(client.meta.clientId, next);
        }
        client.monthlyWins = next;
        renderStep(client);
        TEI.app.showToast(steps.length > 1 ? 'Done. Here is your next step.' : 'Done. You are up to date.');
      }catch(e){
        console.error('Wealth OS: could not save the done step', e);
        btn.disabled = false;
        TEI.app.showToast('That did not save. Please try again.');
      }
    };
  }

  /* ---------------- Headline goal ----------------
     Status comes from TEI.calc.goalStatus, the rule the Goals page uses. */
  function renderGoal(client){
    const g = northStarGoalRef(client);
    const ring = document.getElementById('whGoalRing');
    let pct = 0;
    if(!g){
      setText('whGoalName', 'No goals yet');
      setText('whGoalStatus', 'Your coach will set your first goal with you.');
    } else {
      const gp = TEI.calc.goalProgress(client, g);
      pct = Math.max(0, Math.min(100, gp.pct || (gp.isComplete ? 100 : 0)));
      const year = g.targetDate ? new Date(g.targetDate).getFullYear() : null;
      setText('whGoalName', g.name + (year ? ' by ' + year : ''));
      const st = TEI.calc.goalStatus(client, g);
      setText('whGoalStatus', st.key === 'complete' ? 'Reached' : st.past ? 'Past its target date' : st.label);
    }
    setText('whGoalPct', Math.round(pct) + '%');
    ring.setAttribute('stroke-dashoffset', (301.6 * (1 - pct/100)).toFixed(1));
    document.getElementById('whGoalRingSvg').setAttribute('aria-label', (g ? g.name : 'Headline goal') + ', ' + Math.round(pct) + ' percent complete');
  }

  /* ---------------- Wealth forecast: actual vs plan ----------------
     Accounts only, as on Forecast. Actual = each logged month. Plan = the
     first logged total growing at Forecast's middle growth rate (5%) plus
     the current monthly contributions, with accounts added to tracking later
     counted in the month they arrived (they are not growth). Runs 12 months
     ahead. Forecast's Save as my plan keeps only retirement age and yearly
     spending (B7.2), so it does not change this line. */
  function renderForecast(client){
    const svg = document.getElementById('whForecast');
    const axis = document.getElementById('whForecastAxis');
    const note = document.getElementById('whForecastNote');
    const months = TEI.calc.buildMergedMonths(client);
    const keys = Object.keys(months).sort();
    if(keys.length < 2){
      svg.innerHTML = '<line class="hm-fc-base" x1="0" y1="200" x2="640" y2="200"></line><text class="hm-fc-empty" x="0" y="110">The chart starts once two months are logged.</text>';
      svg.setAttribute('aria-label', 'Not enough history yet');
      axis.innerHTML = ''; note.textContent = '';
      return;
    }
    const rate = TEI.calc.EXPECTED_RATE || 0.05;
    const r = Math.pow(1+rate, 1/12) - 1;
    const contrib = TEI.calc.totalMonthlyContribution(client);
    const joined = TEI.calc.joinedByMonth(client, months);
    const all = keys.concat(Array.from({length:12}, (_,i)=> addMonths(keys[keys.length-1], i+1)));
    const actual = keys.map(k=> months[k].total);
    const plan = [actual[0]];
    for(let i=1; i<all.length; i++) plan.push(plan[i-1]*(1+r) + contrib + (joined[all[i]]||0));

    const maxV = Math.max(...plan, ...actual, 1) * 1.06;
    const n = all.length;
    const x = i=> 14 + i*(612/(n-1));
    const y = v=> 200 - Math.max(0, v)/maxV*184;
    const w = Math.max(4, Math.min(28, 612/(n-1)*0.6));
    const bars = actual.map((v,i)=> `<rect class="hm-fc-bar" x="${(x(i)-w/2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${(200-y(v)).toFixed(1)}" rx="${Math.min(6, w/2).toFixed(1)}" style="animation-delay:${(0.1+i*0.04).toFixed(2)}s"></rect>`).join('');
    const planD = smoothPath(plan.map((v,i)=> [x(i), y(v)]));
    const actD = smoothPath(actual.map((v,i)=> [x(i), y(v)]));
    const li = actual.length-1, dx = x(li).toFixed(1), dy = y(actual[li]).toFixed(1);
    svg.innerHTML = `<line class="hm-fc-base" x1="0" y1="200" x2="640" y2="200"></line>${bars}`
      + `<path class="hm-fc-plan" d="${planD}"></path>`
      + `<path class="hm-fc-actual hm-draw" d="${actD}" pathLength="900"></path>`
      + `<circle class="hm-fc-pulse" cx="${dx}" cy="${dy}" r="5"></circle><circle class="hm-fc-dot" cx="${dx}" cy="${dy}" r="5"></circle>`;
    const gap = actual[li] - plan[li];
    svg.setAttribute('aria-label', `${monthLabel(keys[li])}: actual ${fmtGBP(actual[li])}, plan ${fmtGBP(plan[li])}, ${gap>=0?'ahead by':'behind by'} ${fmtGBP(Math.abs(gap))}`);
    const ticks = [0, Math.round((n-1)/4), Math.round((n-1)/2), Math.round(3*(n-1)/4), n-1];
    axis.innerHTML = ticks.map(i=> `<span>${monthLabel(all[i])}</span>`).join('');
    note.textContent = `Accounts only. The plan line grows your first logged total at ${Math.round(rate*100)}% a year, the Forecast's expected case, plus ${fmtGBP(contrib)} a month.`;
  }

  /* ---------------- Safety net ----------------
     TEI.calc.safetyNet is the same calculation the Cashflow page shows. */
  const SAFETY_STAGE = {full:'Complete', stage2:'Stage 2', buffer:'Working buffer', none:'Building'};
  function renderSafety(client){
    const sn = TEI.calc.safetyNet(client);
    const pct = sn.months!=null ? Math.min(100, sn.months/sn.fullMonths*100) : 0;
    setText('whSafetyStage', sn.months==null ? 'Not measured yet' : SAFETY_STAGE[sn.stage]);
    show('whSafetyTick', sn.stage === 'full');
    document.getElementById('whSafetyBar').style.width = pct.toFixed(0) + '%';
    setText('whSafetyMonths', sn.months!=null
      ? `${sn.months.toFixed(1)} ${sn.months.toFixed(1)==='1.0'?'month':'months'} of spending covered`
      : 'Add your spending in Cashflow to measure this');
    // The three stages with their £ targets (as on Cashflow), where the cash
    // is held, and how much more reaches the next stage.
    const spend = sn.monthlySpend || 0;
    const stages = [['Working buffer', 1], ['Three months', 3], ['Full safety net', sn.fullMonths]];
    document.getElementById('whSafetyStages').innerHTML = spend > 0
      ? stages.map(([name, n])=>{ const ok = sn.months != null && sn.months >= n;
          return `<li class="${ok ? 'ok' : ''}"><i aria-hidden="true">${ok ? '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"></path></svg>' : ''}</i><span>${name}<small>${n} ${n === 1 ? 'month' : 'months'}</small></span><b>${fmtGBP(n * spend)}</b><span class="gl-sr">${ok ? 'reached' : 'not reached yet'}</span></li>`; }).join('')
      : '';
    const acc = (client.accounts||[]).find(a=> a.id === ((client.cashflow||{}).emergencyFund||{}).accountId);
    setText('whSafetyHeld', acc ? 'Held in ' + acctLabel(acc) : '');
    const more = n=> fmtGBP(Math.max(0, n * spend - sn.current));
    let noteText;
    if(!sn.linked) noteText = 'Choose the cash account that holds it in Settings, under Plan settings.';
    else if(sn.stage === 'full') noteText = 'Complete. New savings can now go to wealth building.';
    else if(sn.stage === 'stage2') noteText = `${more(sn.fullMonths)} more reaches the full ${sn.fullMonths} months.`;
    else if(sn.stage === 'buffer') noteText = `${more(3)} more reaches three months.`;
    else noteText = spend > 0 ? `${more(1)} more builds a working buffer of one month.` : 'Add your spending to measure this.';
    setText('whSafetyNote', noteText);
  }

  /* ---------------- Accounts: the five largest ---------------- */
  const ACCT_RING = {pension:'#E8D6A8', isa:'#B9CAE6', lisa:'var(--w-muted)', cash_lisa:'var(--w-muted)', cash:'#AAB6C8', cash_isa:'#AAB6C8', gia:'var(--w-acc-gia)', crypto:'#9DB59F'};
  function renderAccounts(client){
    const b = TEI.calc.latestBreakdown(TEI.calc.buildMergedMonths(client));
    const top = (client.accounts||[]).map(a=> ({a, v: Number(b[a.id])||0})).filter(x=> x.v > 0)
      .sort((p,q)=> q.v - p.v).slice(0,5);
    document.getElementById('whAccounts').innerHTML = top.length
      ? top.map(x=> `<li><i style="border-color:${ACCT_RING[x.a.type]||'var(--w-muted)'};"></i><span>${esc(acctLabel(x.a))}</span><b>${fmtGBP(x.v)}</b></li>`).join('')
      : '<li class="hm-empty">No accounts yet.</li>';
  }

  /* ---------------- Cashflow ----------------
     This month's figures come from TEI.calc.cashflowMonth and wealth
     conversion from TEI.calc.wealthConversionRate, exactly as on Cashflow. */
  function renderCashflow(client){
    const m = TEI.calc.cashflowMonth(client);
    const income = m.takeHome;
    const spend = m.essentials + m.lifestyle;
    const rate = TEI.calc.wealthConversionRate(client);
    const invested = m.wealthBuilding;
    setText('whCfIncome', income > 0 ? fmtGBP(income) : '–');
    setText('whCfSpend', spend > 0 ? fmtGBP(spend) : '–');
    setText('whCfRate', income > 0 ? Math.round(rate) + '%' : '–');
    document.getElementById('whCfBar').style.width = Math.max(0, Math.min(100, rate)).toFixed(0) + '%';
    setText('whCfNote', income > 0
      ? `${fmtGBP(invested)} a month turned into wealth`
      : 'Add your income in Cashflow to see this.');
  }

  /* ---------------- Continue learning (a shortcut to the Hub) ----------------
     Lesson progress belongs to the signed-in person, so it is only read for
     a client viewing their own Wealth OS, never for a coach. */
  let learnCount = null, learnAsked = false;
  function renderLearn(client){
    if(client.meta.role !== 'client'){ return; }
    if(learnCount != null){
      setText('whLearnMeta', learnCount ? `${learnCount} ${learnCount===1?'lesson':'lessons'} completed so far.` : 'Your first lesson is waiting in the Client Hub.');
      return;
    }
    if(learnAsked || !window.teiSupabase || !window.TeiAuth) return;
    learnAsked = true;
    TeiAuth.getUser().then(res=>{
      const user = res && res.data && res.data.user;
      if(!user) return null;
      return window.teiSupabase.from('education_progress').select('completed_lessons').eq('user_id', user.id).maybeSingle();
    }).then(res=>{
      if(!res || res.error) return;
      learnCount = Object.keys((res.data && res.data.completed_lessons) || {}).length;
      renderLearn(client);
    }).catch(()=>{});
  }

  /* ---------------- Latest meeting note (a shortcut) ---------------- */
  function renderNote(client){
    const notes = (client.documents||[]).filter(d=> d.type === 'note')
      .sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')));
    const open = document.getElementById('whNoteOpen');
    const n = notes[0];
    if(!n){
      setText('whNoteLabel', 'Latest meeting note');
      setText('whNoteTitle', 'No meeting notes yet');
      setText('whNoteText', 'Notes from each session appear here.');
      open.innerHTML = '';
      return;
    }
    setText('whNoteLabel', 'Latest meeting note' + (n.date ? ' · ' + fmtDate(n.date) : ''));
    setText('whNoteTitle', n.name || 'Meeting note');
    setText('whNoteText', notes.length > 1 ? `${notes.length} notes in your documents.` : 'Kept in your documents.');
    open.innerHTML = n.storagePath
      ? `<button type="button" class="hm-link hm-linkbtn" data-forecast-open="${esc(n.id)}">Open</button>`
      : `<a class="hm-link" href="${esc(n.url||'#')}" target="_blank" rel="noopener">Open</a>`;
  }

  TEI.render.home = function(client){
    renderHeader(client);
    renderSetup(client);
    renderWealth(client);
    renderStep(client);
    renderGoal(client);
    renderForecast(client);
    renderSafety(client);
    renderAccounts(client);
    renderCashflow(client);
    renderLearn(client);
    renderNote(client);
    document.querySelectorAll('#page-home [data-hm-page]').forEach(a=>{
      a.onclick = (e)=>{ e.preventDefault(); TEI.app.showPage(a.dataset.hmPage); };
    });
  };
})();

