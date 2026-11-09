window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

/* ================= UPDATE MODULE (both roles) =================
   The save code behind Wealth's Update balances panel (persistAccount-
   Balances, persistHoldingValues), the deposits log (Settings > Accounts >
   Money paid in) and the goal form (Goals panel). RLS already lets a
   client write their own rows, so no extra role gate is needed. */
(function(){
  const {fmtGBP} = TEI.data;
  /* Every month ever logged used to render in full below each "log this
     month" widget -- reported live as a "huge pointless list" once an
     account had a couple of years of history (Adviser Workspace's
     equivalent, see renderMonthHistory, got the identical fix). Caps to
     the most recent MONTH_HISTORY_CAP by default; each widget's expanded
     state lives on its own history container (el.dataset.expanded) so it
     survives the re-render every edit/save triggers. */
  const MONTH_HISTORY_CAP = 6;
  function monthHistoryToggleHtml(keys, expanded){
    return keys.length > MONTH_HISTORY_CAP
      ? `<button type="button" class="btn-ghost on-light" data-toggle-month-history style="margin-top:8px; width:100%;">${expanded ? 'Show fewer' : 'Show all ' + keys.length + ' months'}</button>`
      : '';
  }

  /* The save itself: [{id: accountId, v: value}] for month `key`, written
     to Supabase and then to the local client. Shared with the Wealth
     page's Update balances panel (spec B5). Throws if the write fails,
     before anything local changes. */
  async function persistAccountBalances(client, key, toSave){
    for(const item of toSave){ await TEI.wealthOS.saveAccountMonth(item.id, key, item.v, client.meta.role); }
    client.months = client.months || {};
    const entry = client.months[key] ? Object.assign({}, client.months[key]) : {};
    // A manual save always supersedes an auto-carried-forward figure --
    // clear the flag locally so the "carried forward" note drops immediately
    // rather than waiting on a reload from Supabase.
    client.monthsMeta = client.monthsMeta || {};
    const metaEntry = client.monthsMeta[key] ? Object.assign({}, client.monthsMeta[key]) : {};
    toSave.forEach(item=>{
      entry[item.id] = item.v;
      metaEntry[item.id] = false;
      const acc = client.accounts.find(a=>a.id===item.id);
      if(acc) TEI.calc.stampEdit(acc, client.meta.role);
    });
    client.months[key] = entry;
    client.monthsMeta[key] = metaEntry;
    // Keep each manual account's current value in step with its latest
    // logged month (TEI.calc.syncAccountValueFromMonth).
    for(const item of toSave){
      const acc = TEI.calc.syncAccountValueFromMonth(client, item.id, key, item.v);
      if(!acc) continue;
      try{ await TEI.wealthOS.saveAccount(client.meta.clientId, acc.id, acc); }
      catch(err){ console.error('Wealth OS: failed to sync account value from monthly balance', err); }
    }
  }

  /* Same split as persistAccountBalances: [{id: holdingId, v: value}] for
     month `key`. Shared with the Wealth page's Update balances panel. */
  async function persistHoldingValues(client, key, toSave){
    const isCurrent = key === TEI.data.currentMonthKey();
    for(const item of toSave){ await TEI.wealthOS.saveHoldingMonth(item.id, key, item.v, client.meta.role); }
    // Manual-priced accounts: a changed current-month figure is a statement
    // valuation -- replaces holdings.value and stamps value_checked_at
    // (record_holding_valuation; clients may do this for their own funds).
    const valued = {};
    if(isCurrent){
      const d = new Date();
      const today = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      for(const item of toSave){
        const h = client.holdings.find(x=>x.id===item.id);
        const acc = h && client.accounts.find(a=>a.id===h.accountId);
        if(!(acc && acc.isManualPriced && Number(item.v) !== Number(h.value))) continue;
        try{
          valued[h.id] = await TEI.wealthOS.contributionRules.recordHoldingValuation(h.id, item.v, today);
        } catch(err){
          console.error('Wealth OS: failed to record statement valuation', err);
          TEI.app.showToast("Saved, but the statement value for " + h.name + " was not recorded, " + (err.message || 'try again'));
        }
      }
    }
    client.holdingsMonths = client.holdingsMonths || {};
    const entry = client.holdingsMonths[key] ? Object.assign({}, client.holdingsMonths[key]) : {};
    // Same "manual save clears the auto-carried-forward flag immediately"
    // reasoning as saveBalancesMonthly above.
    client.holdingsMonthsMeta = client.holdingsMonthsMeta || {};
    const metaEntry = client.holdingsMonthsMeta[key] ? Object.assign({}, client.holdingsMonthsMeta[key]) : {};
    toSave.forEach(item=>{
      entry[item.id] = item.v;
      metaEntry[item.id] = false;
      const h = client.holdings.find(x=>x.id===item.id);
      if(h){
        // Only the current month should move the holding's live/displayed
        // value -- backfilling a past month must not overwrite today's number.
        if(isCurrent) h.value = item.v;
        if(valued[h.id]){ h.value = Number(valued[h.id].value); h.valueCheckedAt = valued[h.id].value_checked_at; }
        TEI.calc.stampEdit(h, client.meta.role);
      }
    });
    client.holdingsMonths[key] = entry;
    client.holdingsMonthsMeta[key] = metaEntry;
  }

  /* ---------- Deposits: money paid INTO an account, separate from its
     balance/value log above. Powers "total deposited vs current value" --
     how much of your growth is new money vs performance. ---------- */
  let depositsMonthKey = null;

  // Relief rule lives in TEI.calc (shared with the "before tracking
  // started" lump sum) -- see TEI.calc.RELIEF_RATE.
  const RELIEF_RATE = TEI.calc.RELIEF_RATE;
  const isReliefEligible = TEI.calc.isReliefEligible;

  function renderDepositsTotalSummary(client){
    const el = document.getElementById('depositsTotalSummary');
    if(!el) return;
    let totalDeposited = 0, totalRelief = 0;
    Object.values(client.contribLog||{}).forEach(monthEntry=>{
      Object.values(monthEntry||{}).forEach(e=>{
        totalDeposited += (Number(e && e.amount)||0) + (Number(e && e.sacrificeAmount)||0);
        totalRelief += Number(e && e.reliefAmount)||0;
      });
    });
    if(!totalDeposited && !totalRelief){ el.textContent = ''; return; }
    const currentValue = TEI.calc.latestNetWorth ? TEI.calc.latestNetWorth(client) : (client.accounts||[]).reduce((s,a)=>s+(Number(a.value)||0),0);
    // Growth = performance only -- relief is real money in the account but
    // not the client's own, and not investment growth either, so it is
    // excluded from both "deposited" and "growth".
    const growth = currentValue - totalDeposited - totalRelief;
    const growthColor = growth>=0 ? 'var(--k-up-ink, #2D7D52)' : 'var(--k-down-ink, #C0392B)';
    let html = `Total deposited: <b>${fmtGBP(totalDeposited)}</b>`;
    if(totalRelief) html += ` &middot; Tax relief/bonus received: <b>${fmtGBP(totalRelief)}</b>`;
    html += ` &middot; Current value: <b>${fmtGBP(currentValue)}</b> &middot; Growth: <b style="color:${growthColor};">${growth>=0?'+':''}${fmtGBP(growth)}</b>`;
    el.innerHTML = html;
  }

  function renderDepositsMonthlyHistory(client){
    const el = document.getElementById('depositsMonthlyHistory');
    if(!el) return;
    const monthsObj = client.contribLog || {};
    const keys = Object.keys(monthsObj).sort().reverse();
    if(!keys.length){ el.innerHTML = ''; return; }
    const expanded = el.dataset.expanded === '1';
    const visibleKeys = expanded ? keys : keys.slice(0, MONTH_HISTORY_CAP);
    const rows = visibleKeys.map(k=>{
      const isSelected = k === depositsMonthKey;
      return `<div class="list-row on-light"${isSelected ? ' style="background:var(--gold-bg,rgba(201,168,76,.1)); border-radius:8px; padding-left:10px; padding-right:10px;"' : ''}>
        <div class="lr-main"><b>${TEI.data.monthLabel(k)}</b></div>
        <button type="button" class="btn-ghost on-light" data-deposits-edit-month="${k}" style="padding:5px 12px; font-size:11px;">${isSelected ? 'Editing' : 'Edit'}</button>
      </div>`;
    }).join('');
    el.innerHTML = `<div class="sub2" style="margin:12px 0 6px;">Previously logged months</div>` + rows + monthHistoryToggleHtml(keys, expanded);
    el.querySelectorAll('[data-deposits-edit-month]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        depositsMonthKey = btn.dataset.depositsEditMonth;
        renderDepositsMonthlyWidget(TEI.app.state.client);
      });
    });
    const toggleBtn = el.querySelector('[data-toggle-month-history]');
    if(toggleBtn) toggleBtn.addEventListener('click', ()=>{ el.dataset.expanded = expanded ? '0' : '1'; renderDepositsMonthlyHistory(client); });
  }

  function reliefPreviewLabel(acc){ return (acc.type === 'lisa' || acc.type === 'cash_lisa') ? 'Government bonus added' : 'Tax relief added'; }

  function renderDepositsMonthlyWidget(client){
    if(!depositsMonthKey) depositsMonthKey = TEI.data.currentMonthKey();
    const picker = document.getElementById('depositsMonthPicker');
    if(picker) picker.value = depositsMonthKey;
    const wrap = document.getElementById('depositsMonthlyFields');
    const accounts = client.accounts || [];
    if(!accounts.length){
      wrap.innerHTML = `<div class="empty-state on-light" style="padding:10px 0; grid-column:1/-1;"><div class="small">No accounts yet.</div></div>`;
      renderDepositsMonthlyHistory(client);
      renderDepositsTotalSummary(client);
      return;
    }
    const existing = (client.contribLog && client.contribLog[depositsMonthKey]) || {};
    wrap.innerHTML = accounts.map(acc=>{
      const e = existing[acc.id] || {};
      const personalVal = e.amount!=null ? e.amount : '';
      const eligible = isReliefEligible(acc);
      const reliefText = eligible
        ? `<span class="note" data-deposits-relief-preview="${acc.id}" style="margin-top:2px;">${reliefPreviewLabel(acc)}: ${fmtGBP(e.reliefAmount!=null?e.reliefAmount:0)} (not counted in total deposited)</span>`
        : '';
      const personalLabel = acc.type === 'pension' ? `${TEI.data.acctLabel(acc)}, personal £` : TEI.data.acctLabel(acc);
      let html = `<label class="form-field on-light"><span>${personalLabel}</span><input type="number" step="0.01" data-deposits-personal="${acc.id}" value="${personalVal}" placeholder="0.00">${reliefText}</label>`;
      if(acc.type === 'pension'){
        const sacrificeVal = e.sacrificeAmount!=null ? e.sacrificeAmount : '';
        html += `<label class="form-field on-light"><span>${TEI.data.acctLabel(acc)}, employer / salary sacrifice £</span><input type="number" step="0.01" data-deposits-sacrifice="${acc.id}" value="${sacrificeVal}" placeholder="0.00"></label>`;
      }
      return html;
    }).join('');
    // Live relief preview as the client types the personal amount.
    wrap.querySelectorAll('[data-deposits-personal]').forEach(inp=>{
      const accId = inp.dataset.depositsPersonal;
      const acc = accounts.find(a=>a.id===accId);
      if(!isReliefEligible(acc)) return;
      inp.addEventListener('input', ()=>{
        const relief = (parseFloat(inp.value)||0) * RELIEF_RATE;
        const previewEl = wrap.querySelector(`[data-deposits-relief-preview="${accId}"]`);
        if(previewEl) previewEl.textContent = `${reliefPreviewLabel(acc)}: ${fmtGBP(relief)} (not counted in total deposited)`;
      });
    });
    renderDepositsMonthlyHistory(client);
    renderDepositsTotalSummary(client);
  }

  async function saveDepositsMonthly(){
    const client = TEI.app.state.client;
    const key = depositsMonthKey;
    const btn = document.getElementById('depositsMonthlySaveBtn');
    const toSave = [];
    document.querySelectorAll('[data-deposits-personal]').forEach(inp=>{
      const personal = parseFloat(inp.value);
      if(isNaN(personal)) return;
      const accId = inp.dataset.depositsPersonal;
      const acc = client.accounts.find(a=>a.id===accId);
      const sacrificeInp = document.querySelector(`[data-deposits-sacrifice="${accId}"]`);
      const sacrifice = sacrificeInp && sacrificeInp.value !== '' ? (parseFloat(sacrificeInp.value)||0) : null;
      const relief = isReliefEligible(acc) ? Math.round(personal * RELIEF_RATE * 100) / 100 : null;
      toSave.push({ id: accId, amount: personal, sacrificeAmount: sacrifice, reliefAmount: relief });
    });
    if(!toSave.length){ TEI.app.showToast('Nothing to save'); return; }
    btn.disabled = true;
    try{
      for(const item of toSave){ await TEI.wealthOS.saveAccountDeposit(item.id, key, item.amount, item.sacrificeAmount, item.reliefAmount, client.meta.role); }
    } catch(err){
      console.error('Wealth OS: failed to save monthly deposit', err);
      TEI.app.showToast('That did not save. ' + (err.message || 'Please try again.'));
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
    client.contribLog = client.contribLog || {};
    const entry = client.contribLog[key] ? Object.assign({}, client.contribLog[key]) : {};
    toSave.forEach(item=>{ entry[item.id] = { amount: item.amount, sacrificeAmount: item.sacrificeAmount, reliefAmount: item.reliefAmount }; });
    client.contribLog[key] = entry;
    renderDepositsMonthlyWidget(client);
    TEI.app.showToast('Saved ' + key);
  }

  /* ================= GOALS: add / edit / delete (both roles) =================
     Same validation as Adviser Workspace's version: a monetary goal needs
     at least one linked account, since TEI.calc.goalProgress only ever
     reads progress from linked accounts. Unlike the monthly log sections
     above, this is not month-keyed -- it is a plain list with Edit/Delete
     per goal, reusing the one add/edit form (same pattern as Adviser
     Workspace's Manual Entry goal form). */
  let editingGoalId = null;

  function toggleClGoalProgressFields(){
    const pt = document.getElementById('clNewGoalProgressType').value;
    document.getElementById('clGoalTargetAmountField').style.display = pt==='monetary' ? 'flex' : 'none';
    document.getElementById('clGoalTargetIncomeField').style.display = pt==='income' ? 'flex' : 'none';
    document.getElementById('clGoalLinkedIncomeField').style.display = pt==='income' ? 'flex' : 'none';
    document.getElementById('clGoalLinkedAccountsField').style.display = pt==='monetary' ? 'flex' : 'none';
    if(pt==='income') refreshClGoalLinkedIncomeOptions(TEI.app.state.client);
  }

  function refreshClGoalLinkedAccountOptions(client){
    const wrap = document.getElementById('clNewGoalLinkedAccounts');
    if(!wrap) return;
    const selectedIds = Array.from(wrap.querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value);
    if(!(client.accounts||[]).length){
      wrap.innerHTML = '<span>Add an account first to link a goal to it.</span>';
      wrap.classList.add('empty');
    } else {
      wrap.classList.remove('empty');
      wrap.innerHTML = client.accounts.map(a=>`<label><input type="checkbox" value="${a.id}" ${selectedIds.includes(a.id)?'checked':''}> ${TEI.data.acctLabel(a)}</label>`).join('');
    }
  }

  /* Single-income link for 'income' progress-type goals. A "Build a
     Business" goal only offers Self-Employed/Business Venture Income
     entries -- no "whole household" fallback, since tracking a business
     goal against total household income defeats the point. Any other goal
     category keeps the original "pick any income source, or leave it on
     the household total" choice. */
  function refreshClGoalLinkedIncomeOptions(client){
    const sel = document.getElementById('clNewGoalLinkedIncome');
    if(!sel) return;
    const selected = sel.value;
    const goalType = document.getElementById('clNewGoalType').value;
    const allIncome = client.cashflow.income || [];
    const opt = i=>`<option value="${i.id}">${i.type} · ${fmtGBP(TEI.calc.toMonthlyAmount(i.amount, i.frequency))}/mo</option>`;
    if(goalType === 'Build a Business'){
      const income = allIncome.filter(i=> i.type==='Self-Employed' || i.type==='Business Venture Income');
      if(!income.length){
        sel.innerHTML = '<option value="">Add a Self-Employed or Business Venture Income entry first</option>';
        sel.value = '';
        return;
      }
      sel.innerHTML = income.map(opt).join('');
      sel.value = income.some(i=>i.id===selected) ? selected : income[0].id;
    } else {
      sel.innerHTML = '<option value="">Whole household income</option>' + allIncome.map(opt).join('');
      sel.value = allIncome.some(i=>i.id===selected) ? selected : '';
    }
  }

  function cancelClGoalEdit(){
    editingGoalId = null;
    document.getElementById('clGoalFormTitle').textContent = 'Add a goal';
    document.getElementById('clAddGoalBtn').textContent = 'Add goal';
    document.getElementById('clCancelGoalEditBtn').style.display = 'none';
    const removeBtn = document.getElementById('glRemoveBtn');
    if(removeBtn) removeBtn.hidden = true;
    ['clNewGoalName','clNewGoalDate','clNewGoalTargetAmount','clNewGoalTargetIncome'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('clNewGoalProgressType').value = 'monetary';
    toggleClGoalProgressFields();
    refreshClGoalLinkedAccountOptions(TEI.app.state.client);
    refreshClGoalLinkedIncomeOptions(TEI.app.state.client);
  }

  function startClGoalEdit(client, goalId){
    const g = client.goals.find(x=>x.id===goalId);
    if(!g) return;
    editingGoalId = goalId;
    document.getElementById('clGoalFormTitle').textContent = 'Edit goal';
    document.getElementById('clNewGoalType').value = g.type;
    document.getElementById('clNewGoalName').value = g.name;
    document.getElementById('clNewGoalDate').value = (g.targetDate||'').slice(0,7);
    document.getElementById('clNewGoalProgressType').value = g.progressType;
    toggleClGoalProgressFields();
    document.getElementById('clNewGoalTargetAmount').value = g.targetAmount||'';
    document.getElementById('clNewGoalTargetIncome').value = g.targetIncome||'';
    refreshClGoalLinkedAccountOptions(client);
    const wrap = document.getElementById('clNewGoalLinkedAccounts');
    wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked = (g.linkedAccountIds||[]).includes(cb.value); });
    refreshClGoalLinkedIncomeOptions(client);
    document.getElementById('clNewGoalLinkedIncome').value = g.linkedIncomeId || '';
    document.getElementById('clAddGoalBtn').textContent = 'Save changes';
    const removeBtn = document.getElementById('glRemoveBtn');
    if(removeBtn) removeBtn.hidden = false;
  }

  function renderClGoalsList(client){
    const wrap = document.getElementById('clGoalsList');
    if(!wrap) return;
    const goals = client.goals || [];
    if(!goals.length){ wrap.innerHTML = ''; return; }
    wrap.innerHTML = `<div class="sub2" style="margin-bottom:6px;">Your goals</div>` + goals.map(g=>{
      const isSelected = g.id === editingGoalId;
      return `<div class="list-row on-light"${isSelected ? ' style="background:var(--gold-bg,rgba(201,168,76,.1)); border-radius:8px; padding-left:10px; padding-right:10px;"' : ''}>
        <div class="lr-main"><b>${g.name}</b><div class="lr-meta">${TEI.data.goalTypeLabel(g.type)}</div></div>
        <div style="display:flex; gap:8px; flex-none:1;">
          <button type="button" class="btn-ghost on-light" data-goal-edit="${g.id}" style="padding:5px 12px; font-size:11px;">${isSelected ? 'Editing' : 'Edit'}</button>
          <button type="button" class="btn-ghost on-light" data-goal-delete="${g.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-goal-edit]').forEach(btn=>{
      btn.addEventListener('click', ()=> startClGoalEdit(TEI.app.state.client, btn.dataset.goalEdit));
    });
    wrap.querySelectorAll('[data-goal-delete]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const client = TEI.app.state.client;
        const id = btn.dataset.goalDelete;
        btn.disabled = true;
        try{
          await TEI.wealthOS.deleteGoal(id);
        } catch(err){
          console.error('Wealth OS: failed to delete goal', err);
          TEI.app.showToast('That did not remove. ' + (err.message || 'Please try again.'));
          btn.disabled = false;
          return;
        }
        client.goals = client.goals.filter(g=>g.id!==id);
        if(editingGoalId === id) cancelClGoalEdit();
        TEI.app.showToast('Goal removed');
        TEI.app.rerenderCurrentPage();
      });
    });
  }

  async function addOrSaveClGoal(){
    const client = TEI.app.state.client;
    const type = document.getElementById('clNewGoalType').value;
    const name = document.getElementById('clNewGoalName').value.trim();
    if(!name){ TEI.app.showToast('Give the goal a name.'); return; }
    const targetDate = TEI.data.monthInputToDate(document.getElementById('clNewGoalDate').value);
    const progressType = document.getElementById('clNewGoalProgressType').value;
    const targetAmount = parseFloat(document.getElementById('clNewGoalTargetAmount').value) || null;
    const targetIncome = parseFloat(document.getElementById('clNewGoalTargetIncome').value) || null;
    const linkedAccountIds = Array.from(document.getElementById('clNewGoalLinkedAccounts').querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value);
    const linkedIncomeId = document.getElementById('clNewGoalLinkedIncome').value || null;
    if(progressType === 'monetary' && !linkedAccountIds.length){
      TEI.app.showToast('Link at least one account, so the goal has something to track.');
      return;
    }
    if(progressType === 'income' && type === 'Build a Business' && !linkedIncomeId){
      TEI.app.showToast('Add a Self-Employed or Business Venture Income entry, then link it here.');
      return;
    }
    const btn = document.getElementById('clAddGoalBtn');
    btn.disabled = true;
    if(editingGoalId){
      const existing = client.goals.find(g=>g.id===editingGoalId);
      if(!existing){ cancelClGoalEdit(); btn.disabled = false; return; }
      const merged = Object.assign({}, existing, {type, name, targetDate, progressType, targetAmount, targetIncome, linkedAccountIds, linkedIncomeId});
      TEI.calc.stampEdit(merged, client.meta.role);
      try{
        await TEI.wealthOS.saveGoal(client.meta.clientId, existing.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save goal', err);
        TEI.app.showToast('That did not save. Please try again.');
        btn.disabled = false;
        return;
      }
      Object.assign(existing, merged);
      btn.disabled = false;
      cancelClGoalEdit();
      TEI.app.showToast('Goal updated');
      if(TEI.goalForm.onDone) TEI.goalForm.onDone();
    } else {
      const g = TEI.calc.stampEdit({id: TEI.data.uid(), type, name, targetDate, progressType, targetAmount, targetIncome,
        completed:false, status:'active', linkedAccountIds, linkedIncomeId, statusHistory:[]}, client.meta.role);
      try{
        g.id = await TEI.wealthOS.saveGoal(client.meta.clientId, null, g);
      } catch(err){
        console.error('Wealth OS: failed to save goal', err);
        TEI.app.showToast('That did not save. Please try again.');
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.goals.push(g);
      ['clNewGoalName','clNewGoalDate','clNewGoalTargetAmount','clNewGoalTargetIncome'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('clNewGoalLinkedIncome').value = '';
      TEI.app.showToast('Goal added');
      if(TEI.goalForm.onDone) TEI.goalForm.onDone();
    }
    TEI.app.rerenderCurrentPage();
  }

  function wireClGoalForm(){
    const typeEl = document.getElementById('clNewGoalProgressType');
    if(typeEl && !typeEl.dataset.wired){
      typeEl.dataset.wired = '1';
      typeEl.addEventListener('change', toggleClGoalProgressFields);
    }
    const goalTypeEl = document.getElementById('clNewGoalType');
    if(goalTypeEl && !goalTypeEl.dataset.wired){
      goalTypeEl.dataset.wired = '1';
      // Re-run the same show/hide + linked-income refresh -- the "Which
      // income?" list is filtered by goal category (see
      // refreshClGoalLinkedIncomeOptions), so switching to/from "Build a
      // Business" needs to rebuild it even though visibility itself only
      // depends on progress type.
      goalTypeEl.addEventListener('change', toggleClGoalProgressFields);
    }
    const btn = document.getElementById('clAddGoalBtn');
    if(btn && !btn.dataset.wired){
      btn.dataset.wired = '1';
      btn.addEventListener('click', addOrSaveClGoal);
    }
    const cancelBtn = document.getElementById('clCancelGoalEditBtn');
    if(cancelBtn && !cancelBtn.dataset.wired){
      cancelBtn.dataset.wired = '1';
      cancelBtn.addEventListener('click', cancelClGoalEdit);
    }
  }

  function wireUpdatePage(){
    const wire = (id, handler) => {
      const el = document.getElementById(id);
      if(el && !el.dataset.wired){ el.dataset.wired = '1'; el.addEventListener('change', handler); }
    };
    const wireBtn = (id, handler) => {
      const el = document.getElementById(id);
      if(el && !el.dataset.wired){ el.dataset.wired = '1'; el.addEventListener('click', handler); }
    };
    wire('depositsMonthPicker', e=>{ if(!e.target.value) return; depositsMonthKey = e.target.value; renderDepositsMonthlyWidget(TEI.app.state.client); });
    wireBtn('depositsMonthlySaveBtn', saveDepositsMonthly);
    wireClGoalForm();
  }

  /* The old Update page is gone (clean-up, 20 Oct 2026): balances and
     holdings are in Wealth's Update balances panel (persist* below), the
     month's cashflow in Cashflow's panel, goals in the Goals panel. What
     stays here is the deposits log, shown in Settings > Accounts > Money
     paid in, and the goal form behind the Goals panel. */
  TEI.render.update = function(client){
    wireUpdatePage();
    renderDepositsMonthlyWidget(client);
    if(!editingGoalId) toggleClGoalProgressFields();
    refreshClGoalLinkedAccountOptions(client);
    refreshClGoalLinkedIncomeOptions(client);
    renderClGoalsList(client);
  };
  TEI.update = { persistAccountBalances, persistHoldingValues };

  /* The goal form now sits in the Goals page's panel (B12.6). open() fills
     it for a new goal (no id) or an existing one; remove() deletes the goal
     being edited. onDone is set by the Goals page to close its panel. */
  async function removeClGoal(){
    const client = TEI.app.state.client;
    const id = editingGoalId;
    if(!id) return;
    const btn = document.getElementById('glRemoveBtn');
    btn.disabled = true;
    try{
      await TEI.wealthOS.deleteGoal(id);
    } catch(err){
      console.error('Wealth OS: failed to delete goal', err);
      TEI.app.showToast('That did not remove. Please try again.');
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
    client.goals = client.goals.filter(g=>g.id!==id);
    cancelClGoalEdit();
    TEI.app.showToast('Goal removed');
    if(TEI.goalForm.onDone) TEI.goalForm.onDone();
    TEI.app.rerenderCurrentPage();
  }
  TEI.goalForm = {
    open(client, goalId){
      wireClGoalForm();
      const removeBtn = document.getElementById('glRemoveBtn');
      if(removeBtn && !removeBtn.dataset.wired){ removeBtn.dataset.wired = '1'; removeBtn.addEventListener('click', removeClGoal); }
      if(goalId) startClGoalEdit(client, goalId);
      else cancelClGoalEdit();
    },
    onDone:null
  };
})();

