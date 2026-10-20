window.TEI = window.TEI || {};
(function(){
  const {fmtGBP, uid} = TEI.data;
  const {totalMonthlyIncome, totalFixedExpenses, totalVariableExpenses, completion} = TEI.calc;
  const TOTAL_STEPS = 9;
  const STEP_LABELS = ['Client Profile','Cashflow Foundation','Wealth Foundation','Investment Accounts','Holdings','Goals','Documents','Review & Launch','Complete'];
  let client = null;
  let clientId = 'preview-client';
  let step = 1;
  const ui = { ownsProperty:null, hasAccounts:null };
  const editing = {}; // per-section id of the record currently being edited, e.g. editing.income = '123'

  function showToast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(()=>el.classList.remove('show'), 2600);
  }
  function clearFields(ids){ ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); }

  /* ================= STEP NAV ================= */
  function isStepVisible(n){
    if(n===5) return ui.hasAccounts==='yes'; // Holdings only when investment accounts exist
    return true;
  }
  function nextVisibleStep(from, dir){
    let n = from + dir;
    while(n>=1 && n<=TOTAL_STEPS && !isStepVisible(n)) n += dir;
    return Math.max(1, Math.min(TOTAL_STEPS, n));
  }
  function renderDots(){
    const dots = document.getElementById('wizardDots');
    dots.innerHTML = '';
    for(let i=1;i<=TOTAL_STEPS;i++){
      if(!isStepVisible(i)) continue;
      const d = document.createElement('div');
      d.className = 'wizard-dot' + (i===step?' active':(i<step?' done':''));
      dots.appendChild(d);
    }
    document.getElementById('wizardStepLabel').textContent = 'Step ' + step + ' of ' + TOTAL_STEPS + ', ' + STEP_LABELS[step-1];
  }
  function goToStep(n){
    step = Math.max(1, Math.min(TOTAL_STEPS, n));
    if(!isStepVisible(step)) step = nextVisibleStep(step, step<=n?1:-1);
    document.querySelectorAll('.wizard-step').forEach(el=> el.classList.toggle('active', Number(el.dataset.step)===step));
    document.getElementById('wizardNav').style.display = step===TOTAL_STEPS ? 'none' : 'flex';
    document.getElementById('backBtn').style.visibility = step===1 ? 'hidden' : 'visible';
    document.getElementById('skipStepBtn').style.display = (step>=8) ? 'none' : 'inline';
    document.getElementById('nextBtn').textContent = step===7 ? 'Review your details' : (step===8 ? 'Create Client Dashboard' : 'Continue');
    if(step===8) renderReview();
    if(step===9) renderSummary();
    window.scrollTo({top:0, behavior:'auto'});
    renderDots();
  }

  /* ================= YES/NO TOGGLES (progressive disclosure) ================= */
  function setYn(key, val){
    ui[key] = val;
    document.querySelectorAll(`[data-yn="${key}"]`).forEach(btn=> btn.classList.toggle('active', btn.dataset.val===val));
    const blockId = key==='ownsProperty' ? 'obPropertyBlock' : (key==='hasAccounts' ? 'obAccountsBlock' : null);
    if(blockId) document.getElementById(blockId).classList.toggle('open', val==='yes');
    if(key==='hasAccounts') renderDots(); // holdings dot appears/disappears
  }
  function wireYnToggles(){
    document.querySelectorAll('[data-yn]').forEach(btn=>{
      btn.addEventListener('click', ()=> setYn(btn.dataset.yn, btn.dataset.val));
    });
  }

  /* ================= STEP 1: CLIENT PROFILE ================= */
  function fillPersonal(){
    const p = client.personal;
    document.getElementById('obFirstName').value = p.firstName||'';
    document.getElementById('obLastName').value = p.lastName||'';
    document.getElementById('obDob').value = p.dob||'';
    document.getElementById('obEmail').value = p.email||'';
    document.getElementById('obEmployment').value = p.employmentStatus||'';
    document.getElementById('obRelationship').value = p.relationshipStatus||'';
    document.getElementById('obRisk').value = p.riskProfile||'';
    document.getElementById('obPartnerName').value = (p.partner||{}).name||'';
    document.getElementById('obPartnerEmployment').value = (p.partner||{}).employmentStatus||'';
    togglePartnerBlock();
  }
  function togglePartnerBlock(){
    const show = ['Partnered','Married'].includes(client.personal.relationshipStatus);
    document.getElementById('obPartnerBlock').classList.toggle('open', show);
    refreshIncomeOwnerOptions();
  }
  function wirePersonal(){
    const stamp = ()=> TEI.calc.stampEdit(client.personal, 'client');
    document.getElementById('obFirstName').addEventListener('input', e=>{ client.personal.firstName = e.target.value.trim(); stamp(); });
    document.getElementById('obLastName').addEventListener('input', e=>{ client.personal.lastName = e.target.value.trim(); stamp(); });
    document.getElementById('obDob').addEventListener('input', e=>{ client.personal.dob = e.target.value; stamp(); });
    document.getElementById('obEmail').addEventListener('input', e=>{ client.personal.email = e.target.value.trim(); stamp(); });
    document.getElementById('obEmployment').addEventListener('change', e=>{ client.personal.employmentStatus = e.target.value; stamp(); });
    document.getElementById('obRelationship').addEventListener('change', e=>{ client.personal.relationshipStatus = e.target.value; togglePartnerBlock(); stamp(); });
    document.getElementById('obRisk').addEventListener('change', e=>{ client.personal.riskProfile = e.target.value; stamp(); });
    document.getElementById('obPartnerName').addEventListener('input', e=>{ client.personal.partner.name = e.target.value.trim(); stamp(); });
    document.getElementById('obPartnerEmployment').addEventListener('change', e=>{ client.personal.partner.employmentStatus = e.target.value; stamp(); });
  }

  /* ================= STEP 2: CASHFLOW FOUNDATION ================= */
  function refreshIncomeOwnerOptions(){
    const sel = document.getElementById('obNewIncomeOwner');
    const hasPartner = ['Partnered','Married'].includes(client.personal.relationshipStatus);
    const current = sel.value;
    sel.innerHTML = '<option value="client">Me</option>' + (hasPartner ? '<option value="partner">Partner</option>' : '');
    sel.value = (current==='partner' && hasPartner) ? 'partner' : 'client';
  }
  function renderEditableList(containerId, items, rowFn, emptyMsg){
    const list = document.getElementById(containerId);
    list.innerHTML = items.length ? '' : `<div class="empty-state on-light" style="padding:10px 0;"><div class="small">${emptyMsg}</div></div>`;
    items.forEach(item=>{
      const row = document.createElement('div');
      row.className = 'list-row on-light';
      row.innerHTML = rowFn(item);
      list.appendChild(row);
    });
  }

  function renderIncomeList(){
    renderEditableList('obIncomeList', client.cashflow.income, i=>{
      const ownerLabel = i.owner==='partner' ? (client.personal.partner.name||'Partner') : 'Me';
      return `<div class="lr-main"><b>${i.type}</b> <span class="tag-pill">${ownerLabel}</span><div class="lr-meta">${fmtGBP(i.amount)} · ${i.frequency}</div></div>
        <div class="lr-actions">
          <button type="button" class="btn-ghost on-light" data-edit-income="${i.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
          <button type="button" class="btn-ghost on-light" data-del-income="${i.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
        </div>`;
    }, 'Nothing added yet.');
    refreshGoalLinkedIncomeOptions();
    document.querySelectorAll('[data-del-income]').forEach(btn=> btn.addEventListener('click', async function(){
      const id = this.dataset.delIncome;
      this.disabled = true;
      try{
        await TEI.wealthOS.deleteIncome(id);
      } catch(err){
        console.error('Wealth OS: failed to delete income', err);
        showToast('That did not remove. ' + (err.message || 'Please try again.'));
        this.disabled = false;
        return;
      }
      client.cashflow.income = client.cashflow.income.filter(i=>i.id!==id); renderIncomeList();
    }));
    document.querySelectorAll('[data-edit-income]').forEach(btn=> btn.addEventListener('click', function(){
      const item = client.cashflow.income.find(i=>i.id===this.dataset.editIncome); if(!item) return;
      editing.income = item.id;
      document.getElementById('obNewIncomeOwner').value = item.owner;
      document.getElementById('obNewIncomeType').value = item.type;
      document.getElementById('obNewIncomeAmount').value = item.amount;
      document.getElementById('obNewIncomeFrequency').value = item.frequency;
      document.getElementById('obAddIncomeBtn').textContent = 'Save changes';
    }));
  }
  async function addOrSaveIncome(){
    const owner = document.getElementById('obNewIncomeOwner').value;
    const type = document.getElementById('obNewIncomeType').value;
    const amount = parseFloat(document.getElementById('obNewIncomeAmount').value);
    const frequency = document.getElementById('obNewIncomeFrequency').value;
    if(isNaN(amount)){ showToast('Add an amount'); return; }
    const btn = document.getElementById('obAddIncomeBtn');
    btn.disabled = true;
    if(editing.income){
      const item = client.cashflow.income.find(i=>i.id===editing.income);
      const merged = Object.assign({}, item, {owner, type, amount, frequency});
      TEI.calc.stampEdit(merged, 'client');
      try{
        await TEI.wealthOS.saveIncome(client.meta.clientId, item.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save income', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(item, merged);
      editing.income = null;
      document.getElementById('obAddIncomeBtn').textContent = 'Add';
    } else {
      const item = TEI.calc.stampEdit({id:uid(), owner, type, amount, frequency}, 'client');
      try{
        item.id = await TEI.wealthOS.saveIncome(client.meta.clientId, null, item);
      } catch(err){
        console.error('Wealth OS: failed to save income', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.cashflow.income.push(item);
    }
    clearFields(['obNewIncomeAmount']);
    renderIncomeList();
  }

  function renderExpenseList(kind){ // 'fixed' | 'variable'
    const containerId = kind==='fixed' ? 'obFixedList' : 'obVariableList';
    renderEditableList(containerId, client.cashflow.expenses[kind], e=>
      `<div class="lr-main"><b>${e.label}</b><div class="lr-meta">${fmtGBP(e.amount)}/mo</div></div>
       <div class="lr-actions">
         <button type="button" class="btn-ghost on-light" data-edit-exp="${kind}:${e.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
         <button type="button" class="btn-ghost on-light" data-del-exp="${kind}:${e.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
       </div>`, 'Nothing added yet.');
    document.querySelectorAll('[data-del-exp]').forEach(btn=> btn.addEventListener('click', async function(){
      const [k,id] = this.dataset.delExp.split(':');
      this.disabled = true;
      try{
        await TEI.wealthOS.deleteExpense(id);
      } catch(err){
        console.error('Wealth OS: failed to delete expense', err);
        showToast('That did not remove. ' + (err.message || 'Please try again.'));
        this.disabled = false;
        return;
      }
      client.cashflow.expenses[k] = client.cashflow.expenses[k].filter(e=>e.id!==id);
      renderExpenseList(k);
    }));
    document.querySelectorAll('[data-edit-exp]').forEach(btn=> btn.addEventListener('click', function(){
      const [k,id] = this.dataset.editExp.split(':');
      const item = client.cashflow.expenses[k].find(e=>e.id===id); if(!item) return;
      editing[k+'Exp'] = id;
      const labelId = k==='fixed' ? 'obNewFixedLabel' : 'obNewVariableLabel';
      const amtId = k==='fixed' ? 'obNewFixedAmount' : 'obNewVariableAmount';
      document.getElementById(labelId).value = item.label;
      document.getElementById(amtId).value = item.amount;
      document.getElementById(k==='fixed' ? 'obAddFixedBtn' : 'obAddVariableBtn').textContent = 'Save changes';
    }));
  }
  async function addOrSaveExpense(kind){
    const labelId = kind==='fixed' ? 'obNewFixedLabel' : 'obNewVariableLabel';
    const amtId = kind==='fixed' ? 'obNewFixedAmount' : 'obNewVariableAmount';
    const btnId = kind==='fixed' ? 'obAddFixedBtn' : 'obAddVariableBtn';
    const label = document.getElementById(labelId).value.trim();
    const amount = parseFloat(document.getElementById(amtId).value);
    if(!label || isNaN(amount)){ showToast('Give it a name and amount'); return; }
    const editKey = kind+'Exp';
    const btn = document.getElementById(btnId);
    btn.disabled = true;
    if(editing[editKey]){
      const item = client.cashflow.expenses[kind].find(e=>e.id===editing[editKey]);
      const merged = Object.assign({}, item, {label, amount});
      TEI.calc.stampEdit(merged, 'client');
      try{
        await TEI.wealthOS.saveExpense(client.meta.clientId, item.id, merged, kind);
      } catch(err){
        console.error('Wealth OS: failed to save expense', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(item, merged);
      editing[editKey] = null;
      document.getElementById(btnId).textContent = 'Add';
    } else {
      const item = TEI.calc.stampEdit({id:uid(), label, amount}, 'client');
      try{
        item.id = await TEI.wealthOS.saveExpense(client.meta.clientId, null, item, kind);
      } catch(err){
        console.error('Wealth OS: failed to save expense', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.cashflow.expenses[kind].push(item);
    }
    clearFields([labelId, amtId]);
    renderExpenseList(kind);
  }

  function fillCashflowBasics(){
    document.getElementById('obEfTarget').value = (client.cashflow.emergencyFund||{}).target||'';
  }
  function wireCashflowBasics(){
    document.getElementById('obEfTarget').addEventListener('input', e=>{ client.cashflow.emergencyFund.target = parseFloat(e.target.value)||0; TEI.calc.stampEdit(client.cashflow.emergencyFund,'client'); });
  }

  /* ================= STEP 3: WEALTH FOUNDATION ================= */
  function getPropertyAsset(){ return client.wealth.assets.find(a=>a.type==='property'); }
  function fillWealth(){
    ui.ownsProperty = getPropertyAsset() ? 'yes' : (ui.ownsProperty || 'no');
    setYn('ownsProperty', ui.ownsProperty);
    document.getElementById('obPropertyValue').value = getPropertyAsset() ? getPropertyAsset().value : '';
    renderAssetsList(); renderLiabilitiesList();
  }
  function wireWealth(){
    document.getElementById('obPropertyValue').addEventListener('input', e=>{
      const v = parseFloat(e.target.value)||0;
      let asset = getPropertyAsset();
      if(!asset){ asset = {id:uid(), type:'property', value:0, notes:''}; client.wealth.assets.push(asset); }
      asset.value = v;
      TEI.calc.stampEdit(asset, 'client');
    });
  }
  function renderAssetsList(){
    renderEditableList('obAssetsList', client.wealth.assets.filter(a=>a.type!=='property'), a=>
      `<div class="lr-main"><b>${a.notes || a.type}</b> <span class="tag-pill">${a.type}</span><div class="lr-meta">${fmtGBP(a.value)}</div></div>
       <div class="lr-actions">
         <button type="button" class="btn-ghost on-light" data-edit-asset="${a.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
         <button type="button" class="btn-ghost on-light" data-del-asset="${a.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
       </div>`, 'Nothing added yet.');
    document.querySelectorAll('[data-del-asset]').forEach(btn=> btn.addEventListener('click', async function(){
      const id = this.dataset.delAsset;
      this.disabled = true;
      try{
        await TEI.wealthOS.deleteWealthAsset(id);
      } catch(err){
        console.error('Wealth OS: failed to delete asset', err);
        showToast('That did not remove. ' + (err.message || 'Please try again.'));
        this.disabled = false;
        return;
      }
      client.wealth.assets = client.wealth.assets.filter(a=>a.id!==id);
      renderAssetsList(); refreshLiabilityLinkOptions();
    }));
    document.querySelectorAll('[data-edit-asset]').forEach(btn=> btn.addEventListener('click', function(){
      const item = client.wealth.assets.find(a=>a.id===this.dataset.editAsset); if(!item) return;
      editing.asset = item.id;
      document.getElementById('obNewAssetType').value = item.type;
      document.getElementById('obNewAssetValue').value = item.value;
      document.getElementById('obNewAssetNotes').value = item.notes||'';
      document.getElementById('obAddAssetBtn').textContent = 'Save changes';
    }));
  }
  async function addOrSaveAsset(){
    const type = document.getElementById('obNewAssetType').value;
    const value = parseFloat(document.getElementById('obNewAssetValue').value);
    const notes = document.getElementById('obNewAssetNotes').value.trim();
    if(isNaN(value)){ showToast('Add a value'); return; }
    const btn = document.getElementById('obAddAssetBtn');
    btn.disabled = true;
    if(editing.asset){
      const item = client.wealth.assets.find(a=>a.id===editing.asset);
      const merged = Object.assign({}, item, {type, value, notes});
      TEI.calc.stampEdit(merged, 'client');
      try{
        await TEI.wealthOS.saveWealthAsset(client.meta.clientId, item.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save asset', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(item, merged);
      editing.asset = null;
      document.getElementById('obAddAssetBtn').textContent = 'Add';
    } else {
      const item = TEI.calc.stampEdit({id:uid(), type, value, notes}, 'client');
      try{
        item.id = await TEI.wealthOS.saveWealthAsset(client.meta.clientId, null, item);
      } catch(err){
        console.error('Wealth OS: failed to save asset', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.wealth.assets.push(item);
    }
    clearFields(['obNewAssetValue','obNewAssetNotes']);
    renderAssetsList(); refreshLiabilityLinkOptions();
  }
  function refreshLiabilityLinkOptions(){
    const sel = document.getElementById('obNewLiabLinkedAsset');
    const current = sel.value;
    sel.innerHTML = '<option value="">None</option>' + client.wealth.assets.map(a=>`<option value="${a.id}">${a.type==='property'?'Property':(a.notes||a.type)}</option>`).join('');
    sel.value = current;
  }
  function renderLiabilitiesList(){
    renderEditableList('obLiabilitiesList', client.wealth.liabilities, l=>{
      const linked = client.wealth.assets.find(a=>a.id===l.linkedAssetId);
      return `<div class="lr-main"><b>${l.type}</b><div class="lr-meta">${fmtGBP(l.balance)}${linked?' · linked to '+(linked.type==='property'?'Property':(linked.notes||linked.type)):''}</div></div>
       <div class="lr-actions">
         <button type="button" class="btn-ghost on-light" data-edit-liab="${l.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
         <button type="button" class="btn-ghost on-light" data-del-liab="${l.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
       </div>`;
    }, 'Nothing added yet.');
    document.querySelectorAll('[data-del-liab]').forEach(btn=> btn.addEventListener('click', async function(){
      const id = this.dataset.delLiab;
      this.disabled = true;
      try{
        await TEI.wealthOS.deleteWealthLiability(id);
      } catch(err){
        console.error('Wealth OS: failed to delete liability', err);
        showToast('That did not remove. ' + (err.message || 'Please try again.'));
        this.disabled = false;
        return;
      }
      client.wealth.liabilities = client.wealth.liabilities.filter(l=>l.id!==id);
      renderLiabilitiesList();
    }));
    document.querySelectorAll('[data-edit-liab]').forEach(btn=> btn.addEventListener('click', function(){
      const item = client.wealth.liabilities.find(l=>l.id===this.dataset.editLiab); if(!item) return;
      editing.liability = item.id;
      document.getElementById('obNewLiabType').value = item.type;
      document.getElementById('obNewLiabBalance').value = item.balance;
      document.getElementById('obNewLiabLinkedAsset').value = item.linkedAssetId||'';
      document.getElementById('obAddLiabBtn').textContent = 'Save changes';
    }));
  }
  async function addOrSaveLiability(){
    const type = document.getElementById('obNewLiabType').value;
    const balance = parseFloat(document.getElementById('obNewLiabBalance').value);
    const linkedAssetId = document.getElementById('obNewLiabLinkedAsset').value || null;
    if(isNaN(balance)){ showToast('Add a balance'); return; }
    const btn = document.getElementById('obAddLiabBtn');
    btn.disabled = true;
    if(editing.liability){
      const item = client.wealth.liabilities.find(l=>l.id===editing.liability);
      const merged = Object.assign({}, item, {type, balance, linkedAssetId});
      TEI.calc.stampEdit(merged, 'client');
      try{
        await TEI.wealthOS.saveWealthLiability(client.meta.clientId, item.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save liability', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(item, merged);
      editing.liability = null;
      document.getElementById('obAddLiabBtn').textContent = 'Add';
    } else {
      const item = TEI.calc.stampEdit({id:uid(), type, balance, linkedAssetId}, 'client');
      try{
        item.id = await TEI.wealthOS.saveWealthLiability(client.meta.clientId, null, item);
      } catch(err){
        console.error('Wealth OS: failed to save liability', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.wealth.liabilities.push(item);
    }
    clearFields(['obNewLiabBalance']);
    renderLiabilitiesList();
  }

  /* ================= STEP 4: INVESTMENT ACCOUNTS ================= */
  function fillAccountsToggle(){
    ui.hasAccounts = client.accounts.length ? 'yes' : (ui.hasAccounts || 'no');
    setYn('hasAccounts', ui.hasAccounts);
  }
  function renderObAccounts(){
    renderEditableList('obAccountsList', client.accounts, acc=>
      `<div class="lr-main"><b>${acc.name || TEI.data.acctLabel(acc)}</b> <span class="tag-pill">${acc.type}</span><div class="lr-meta">${fmtGBP(acc.value)}${acc.contribution?' · '+fmtGBP(acc.contribution)+'/mo':''}</div></div>
       <div class="lr-actions">
         <button type="button" class="btn-ghost on-light" data-edit-acct="${acc.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
         <button type="button" class="btn-ghost on-light" data-del-ob-acct="${acc.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
       </div>`, 'Nothing added yet.');
    document.querySelectorAll('[data-del-ob-acct]').forEach(btn=> btn.addEventListener('click', async function(){
      const id = this.dataset.delObAcct;
      this.disabled = true;
      try{
        await TEI.wealthOS.deleteAccount(id);
      } catch(err){
        console.error('Wealth OS: failed to delete account', err);
        showToast('That did not remove. ' + (err.message || 'Please try again.'));
        this.disabled = false;
        return;
      }
      client.accounts = client.accounts.filter(a=>a.id!==id);
      renderObAccounts(); refreshHoldingAccountSelect(); refreshGoalLinkedAccountOptions();
    }));
    document.querySelectorAll('[data-edit-acct]').forEach(btn=> btn.addEventListener('click', function(){
      const item = client.accounts.find(a=>a.id===this.dataset.editAcct); if(!item) return;
      editing.account = item.id;
      document.getElementById('obNewAcctType').value = item.type;
      document.getElementById('obNewAcctProvider').value = item.provider||'';
      document.getElementById('obNewAcctBalance').value = item.value;
      document.getElementById('obNewAcctContrib').value = item.type==='pension' ? '' : (item.contribution||'');
      document.getElementById('obNewAcctContribPersonal').value = item.type==='pension' ? (item.contributionPersonal||'') : '';
      document.getElementById('obNewAcctContribEmployer').value = item.type==='pension' ? (item.contributionSacrifice||'') : '';
      document.getElementById('obNewAcctInterestRate').value = item.interestRate!=null ? item.interestRate : '';
      document.getElementById('obNewAcctRateType').value = item.rateType || 'variable';
      document.getElementById('obNewAcctMaturityDate').value = item.maturityDate || '';
      toggleAcctContribFields();
      document.getElementById('obAddAcctBtn').textContent = 'Save changes';
    }));
  }
  function toggleAcctContribFields(){
    const type = document.getElementById('obNewAcctType').value;
    const isPension = type === 'pension';
    document.getElementById('obAcctContribField').style.display = isPension ? 'none' : 'flex';
    document.getElementById('obAcctContribPersonalField').style.display = isPension ? 'flex' : 'none';
    document.getElementById('obAcctContribEmployerField').style.display = isPension ? 'flex' : 'none';
    const isCash = type === 'cash' || type === 'cash_isa' || type === 'cash_lisa';
    document.getElementById('obAcctInterestRateField').style.display = isCash ? 'flex' : 'none';
    document.getElementById('obAcctRateTypeField').style.display = isCash ? 'flex' : 'none';
    toggleAcctMaturityField();
  }
  function toggleAcctMaturityField(){
    const type = document.getElementById('obNewAcctType').value;
    const isCash = type === 'cash' || type === 'cash_isa' || type === 'cash_lisa';
    const isFixed = document.getElementById('obNewAcctRateType').value === 'fixed';
    document.getElementById('obAcctMaturityField').style.display = (isCash && isFixed) ? 'flex' : 'none';
  }
  function seedMonthBalance(accId, value){
    const key = TEI.data.currentMonthKey();
    client.months[key] = Object.assign({}, client.months[key], {[accId]: value});
  }
  async function addOrSaveAccount(){
    const type = document.getElementById('obNewAcctType').value;
    const provider = document.getElementById('obNewAcctProvider').value.trim();
    const value = parseFloat(document.getElementById('obNewAcctBalance').value)||0;
    const contrib = parseFloat(document.getElementById('obNewAcctContrib').value)||0;
    const contribPersonal = parseFloat(document.getElementById('obNewAcctContribPersonal').value)||0;
    const contribEmployer = parseFloat(document.getElementById('obNewAcctContribEmployer').value)||0;
    const isCashType = type === 'cash' || type === 'cash_isa' || type === 'cash_lisa';
    const interestRateInput = document.getElementById('obNewAcctInterestRate').value;
    const interestRate = isCashType && interestRateInput ? parseFloat(interestRateInput) : null;
    const rateType = isCashType && interestRate!=null ? document.getElementById('obNewAcctRateType').value : null;
    const maturityDateInput = document.getElementById('obNewAcctMaturityDate').value;
    const maturityDate = isCashType && rateType==='fixed' && maturityDateInput ? maturityDateInput : null;
    const btn = document.getElementById('obAddAcctBtn');
    btn.disabled = true;
    if(editing.account){
      const acc = client.accounts.find(a=>a.id===editing.account);
      const patch = {type, provider, value, interestRate, rateType, maturityDate};
      if(type==='pension'){ patch.contributionPersonal = contribPersonal; patch.contributionSacrifice = contribEmployer; }
      else { patch.contribution = contrib; }
      const merged = Object.assign({}, acc, patch);
      if(type==='pension') delete merged.contribution; else { delete merged.contributionPersonal; delete merged.contributionSacrifice; }
      TEI.calc.stampEdit(merged, 'client');
      try{
        await TEI.wealthOS.saveAccount(client.meta.clientId, acc.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save account', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(acc, merged);
      editing.account = null;
      document.getElementById('obAddAcctBtn').textContent = 'Add';
      seedMonthBalance(acc.id, value);
    } else {
      const acc = {id:uid(), type, provider, value, interestRate, rateType, maturityDate, returnPct:null, lastUpdated:new Date().toISOString().slice(0,10)};
      if(type==='pension'){ acc.contributionPersonal = contribPersonal; acc.contributionSacrifice = contribEmployer; } else { acc.contribution = contrib; }
      TEI.calc.stampEdit(acc, 'client');
      try{
        acc.id = await TEI.wealthOS.saveAccount(client.meta.clientId, null, acc);
      } catch(err){
        console.error('Wealth OS: failed to save account', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.accounts.push(acc);
      // Seed this month's balance so the account shows up correctly in the wealth
      // composition breakdown immediately, rather than reading as £0 there until
      // a monthly balance is logged separately.
      seedMonthBalance(acc.id, value);
    }
    clearFields(['obNewAcctProvider','obNewAcctBalance','obNewAcctContrib','obNewAcctContribPersonal','obNewAcctContribEmployer','obNewAcctInterestRate','obNewAcctMaturityDate']);
    document.getElementById('obNewAcctRateType').value = 'variable';
    toggleAcctContribFields();
    renderObAccounts(); refreshHoldingAccountSelect(); refreshGoalLinkedAccountOptions();
  }

  /* ================= STEP 5: HOLDINGS ================= */
  function refreshHoldingAccountSelect(){
    const sel = document.getElementById('obNewHoldingAccount');
    sel.innerHTML = client.accounts.map(a=>`<option value="${a.id}">${TEI.data.acctLabel(a)}</option>`).join('') || '<option value="">Add an account first</option>';
  }
  function renderObHoldings(){
    renderEditableList('obHoldingsList', client.holdings, h=>{
      const acct = client.accounts.find(a=>a.id===h.accountId);
      return `<div class="lr-main"><b>${h.name}</b>${h.ticker?' <span class="tag-pill">'+h.ticker+'</span>':''}<div class="lr-meta">${acct?TEI.data.acctLabel(acct):'Unknown account'} · ${fmtGBP(h.value)}${h.quantity?' · '+h.quantity+' units':''}${h.costBasis?' · cost '+fmtGBP(h.costBasis):''}</div></div>
       <div class="lr-actions">
         <button type="button" class="btn-ghost on-light" data-edit-holding="${h.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
         <button type="button" class="btn-ghost on-light" data-del-ob-holding="${h.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
       </div>`;
    }, 'Nothing added, totally fine to skip this.');
    document.querySelectorAll('[data-del-ob-holding]').forEach(btn=> btn.addEventListener('click', async function(){
      const id = this.dataset.delObHolding;
      this.disabled = true;
      try{
        await TEI.wealthOS.deleteHolding(id);
      } catch(err){
        console.error('Wealth OS: failed to delete holding', err);
        showToast('That did not remove. ' + (err.message || 'Please try again.'));
        this.disabled = false;
        return;
      }
      const removed = client.holdings.find(h=>h.id===id);
      client.holdings = client.holdings.filter(h=>h.id!==id);
      if(removed) TEI.calc.syncAccountValueFromHoldings(client, removed.accountId);
      renderObHoldings();
    }));
    document.querySelectorAll('[data-edit-holding]').forEach(btn=> btn.addEventListener('click', function(){
      const item = client.holdings.find(h=>h.id===this.dataset.editHolding); if(!item) return;
      editing.holding = item.id;
      document.getElementById('obNewHoldingAccount').value = item.accountId;
      document.getElementById('obNewHoldingName').value = item.name;
      document.getElementById('obNewHoldingTicker').value = item.ticker||'';
      document.getElementById('obNewHoldingQty').value = item.quantity||'';
      document.getElementById('obNewHoldingValue').value = item.value||'';
      document.getElementById('obNewHoldingCost').value = item.costBasis||'';
      document.getElementById('obAddHoldingBtn').textContent = 'Save changes';
    }));
  }
  function seedHoldingMonth(holdingId, value){
    TEI.calc.seedMonthlyValue(client.holdingsMonths, TEI.data.currentMonthKey(), holdingId, value);
  }
  async function addOrSaveHolding(){
    const accountId = document.getElementById('obNewHoldingAccount').value;
    const name = document.getElementById('obNewHoldingName').value.trim();
    const ticker = document.getElementById('obNewHoldingTicker').value.trim() || null;
    const quantity = parseFloat(document.getElementById('obNewHoldingQty').value) || null;
    const value = parseFloat(document.getElementById('obNewHoldingValue').value) || 0;
    const costBasis = parseFloat(document.getElementById('obNewHoldingCost').value) || null;
    if(!accountId){ showToast('Add an account first, on the previous step'); return; }
    if(!name){ showToast('Give it a name'); return; }
    const btn = document.getElementById('obAddHoldingBtn');
    btn.disabled = true;
    if(editing.holding){
      const item = client.holdings.find(h=>h.id===editing.holding);
      const oldAccountId = item.accountId;
      const merged = Object.assign({}, item, {accountId, name, ticker, quantity, value, costBasis});
      TEI.calc.stampEdit(merged, 'client');
      try{
        await TEI.wealthOS.saveHolding(accountId, item.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save holding', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(item, merged);
      editing.holding = null;
      document.getElementById('obAddHoldingBtn').textContent = 'Add';
      seedHoldingMonth(item.id, value);
      TEI.calc.syncAccountValueFromHoldings(client, oldAccountId);
      if(accountId !== oldAccountId) TEI.calc.syncAccountValueFromHoldings(client, accountId);
    } else {
      // Ticker-derived sector/theme, same lookup the adviser form uses --
      // fixes the previous dead stub (sector:null, theme:[]) that got
      // silently discarded on save. No sector/theme fields in this
      // onboarding form itself; the client just gets sensible defaults,
      // editable later by the adviser on the Portfolio page.
      const info = TEI.data.lookupTickerInfo(ticker);
      const h = TEI.calc.stampEdit({id:uid(), accountId, name, ticker, quantity, value, costBasis, sector: info.sector, theme: info.theme, geography:null, assetType:null}, 'client');
      try{
        h.id = await TEI.wealthOS.saveHolding(accountId, null, h);
      } catch(err){
        console.error('Wealth OS: failed to save holding', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.holdings.push(h);
      seedHoldingMonth(h.id, value);
      TEI.calc.syncAccountValueFromHoldings(client, accountId);
    }
    clearFields(['obNewHoldingName','obNewHoldingTicker','obNewHoldingQty','obNewHoldingValue','obNewHoldingCost']);
    renderObHoldings();
  }

  /* ================= STEP 6: GOALS ================= */
  function refreshGoalLinkedAccountOptions(){
    const wrap = document.getElementById('obNewGoalLinkedAccounts');
    const selectedIds = getCheckedLinkedAccounts(wrap);
    if(!client.accounts.length){
      wrap.innerHTML = '<span>Add an account first to link a goal to it.</span>';
      wrap.classList.add('empty');
      return;
    }
    wrap.classList.remove('empty');
    wrap.innerHTML = client.accounts.map(a=>`
      <label><input type="checkbox" value="${a.id}" ${selectedIds.includes(a.id)?'checked':''}> ${TEI.data.acctLabel(a)}</label>
    `).join('');
  }
  function getCheckedLinkedAccounts(wrap){
    return Array.from(wrap.querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value);
  }
  function setCheckedLinkedAccounts(wrap, ids){
    wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked = (ids||[]).includes(cb.value); });
  }
  function toggleGoalProgressFields(){
    const pt = document.getElementById('obNewGoalProgressType').value;
    document.getElementById('obGoalTargetAmountField').style.display = pt==='monetary' ? 'flex' : 'none';
    document.getElementById('obGoalTargetIncomeField').style.display = pt==='income' ? 'flex' : 'none';
    document.getElementById('obGoalLinkedIncomeField').style.display = pt==='income' ? 'flex' : 'none';
    document.getElementById('obGoalLinkedAccountsField').style.display = pt==='monetary' ? 'flex' : 'none';
    if(pt==='income') refreshGoalLinkedIncomeOptions();
  }
  /* Single-income link for 'income' progress-type goals. A "Build a
     Business" goal only offers Self-Employed/Business Venture Income
     entries -- no "whole household" fallback, since tracking a business
     goal against total household income defeats the point. Any other goal
     category keeps the original "pick any income source, or leave it on
     the household total" choice. */
  function refreshGoalLinkedIncomeOptions(){
    const sel = document.getElementById('obNewGoalLinkedIncome');
    if(!sel) return;
    const selected = sel.value;
    const goalType = document.getElementById('obNewGoalType').value;
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
  function renderObGoals(){
    renderEditableList('obGoalsList', client.goals, g=>{
      let progressLabel = '';
      if(g.progressType==='completion') progressLabel = g.completed ? 'Complete' : 'Not yet';
      else if(g.progressType==='income') progressLabel = 'Target ' + fmtGBP(g.targetIncome) + '/yr';
      else progressLabel = 'Target ' + fmtGBP(g.targetAmount);
      return `<div class="lr-main"><b>${g.name}</b> <span class="tag-pill">${TEI.data.goalTypeLabel(g.type)}</span><div class="lr-meta">${progressLabel}${g.targetDate?' · by '+g.targetDate:''}</div></div>
       <div class="lr-actions">
         <button type="button" class="btn-ghost on-light" data-edit-goal="${g.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
         <button type="button" class="btn-ghost on-light" data-del-ob-goal="${g.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
       </div>`;
    }, 'Nothing added yet.');
    document.querySelectorAll('[data-del-ob-goal]').forEach(btn=> btn.addEventListener('click', async function(){
      const id = this.dataset.delObGoal;
      this.disabled = true;
      try{
        await TEI.wealthOS.deleteGoal(id);
      } catch(err){
        console.error('Wealth OS: failed to delete goal', err);
        showToast('That did not remove. ' + (err.message || 'Please try again.'));
        this.disabled = false;
        return;
      }
      client.goals = client.goals.filter(g=>g.id!==id); renderObGoals();
    }));
    document.querySelectorAll('[data-edit-goal]').forEach(btn=> btn.addEventListener('click', function(){
      const item = client.goals.find(g=>g.id===this.dataset.editGoal); if(!item) return;
      editing.goal = item.id;
      document.getElementById('obNewGoalType').value = item.type;
      document.getElementById('obNewGoalName').value = item.name;
      document.getElementById('obNewGoalDate').value = (item.targetDate||'').slice(0,7);
      document.getElementById('obNewGoalProgressType').value = item.progressType;
      toggleGoalProgressFields();
      document.getElementById('obNewGoalTargetAmount').value = item.targetAmount||'';
      document.getElementById('obNewGoalTargetIncome').value = item.targetIncome||'';
      refreshGoalLinkedAccountOptions();
      setCheckedLinkedAccounts(document.getElementById('obNewGoalLinkedAccounts'), item.linkedAccountIds);
      refreshGoalLinkedIncomeOptions();
      document.getElementById('obNewGoalLinkedIncome').value = item.linkedIncomeId || '';
      document.getElementById('obAddGoalBtn').textContent = 'Save changes';
    }));
  }
  async function addOrSaveGoal(){
    const type = document.getElementById('obNewGoalType').value;
    const name = document.getElementById('obNewGoalName').value.trim();
    const targetDate = TEI.data.monthInputToDate(document.getElementById('obNewGoalDate').value);
    const progressType = document.getElementById('obNewGoalProgressType').value;
    const targetAmount = parseFloat(document.getElementById('obNewGoalTargetAmount').value) || null;
    const targetIncome = parseFloat(document.getElementById('obNewGoalTargetIncome').value) || null;
    const linkedAccountIds = getCheckedLinkedAccounts(document.getElementById('obNewGoalLinkedAccounts'));
    const linkedIncomeId = document.getElementById('obNewGoalLinkedIncome').value || null;
    if(!name){ showToast('Give the goal a name'); return; }
    // Monetary goals' progress is always the sum of their linked accounts
    // (see TEI.calc.goalProgress) -- with none linked it can only ever show
    // £0, so require at least one rather than silently saving a goal that
    // can never show real progress.
    if(progressType === 'monetary' && !linkedAccountIds.length){
      showToast('Link at least one account so this goal has something to track progress from');
      return;
    }
    if(progressType === 'income' && type === 'Build a Business' && !linkedIncomeId){
      showToast('Add a Self-Employed or Business Venture Income entry, then link it here');
      return;
    }
    const btn = document.getElementById('obAddGoalBtn');
    btn.disabled = true;
    let item;
    if(editing.goal){
      const existing = client.goals.find(g=>g.id===editing.goal);
      const merged = Object.assign({}, existing, {type, name, targetDate, progressType, targetAmount, targetIncome, linkedAccountIds, linkedIncomeId});
      TEI.calc.stampEdit(merged, 'client');
      try{
        await TEI.wealthOS.saveGoal(client.meta.clientId, existing.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save goal', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(existing, merged);
      item = existing;
      editing.goal = null;
      document.getElementById('obAddGoalBtn').textContent = 'Add';
    } else {
      item = TEI.calc.stampEdit({id:uid(), type, name, targetDate, progressType, targetAmount, targetIncome, completed:false, status:'active', linkedAccountIds, linkedIncomeId, statusHistory:[]}, 'client');
      try{
        item.id = await TEI.wealthOS.saveGoal(client.meta.clientId, null, item);
      } catch(err){
        console.error('Wealth OS: failed to save goal', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.goals.push(item);
    }
    clearFields(['obNewGoalName','obNewGoalDate','obNewGoalTargetAmount','obNewGoalTargetIncome']);
    refreshGoalLinkedAccountOptions();
    document.getElementById('obNewGoalLinkedIncome').value = '';
    renderObGoals();
  }

  /* ================= STEP 7: DOCUMENTS ================= */
  function renderObDocuments(){
    renderEditableList('obDocumentsList', client.documents, d=>
      `<div class="lr-main"><b>${d.name}</b> <span class="tag-pill">${d.type}</span><div class="lr-meta">${d.uploadedAt||''}</div></div>
       <div class="lr-actions">
         <button type="button" class="btn-ghost on-light" data-del-ob-doc="${d.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
       </div>`, 'Nothing added, entirely optional.');
    document.querySelectorAll('[data-del-ob-doc]').forEach(btn=> btn.addEventListener('click', function(){
      client.documents = client.documents.filter(d=>d.id!==this.dataset.delObDoc); renderObDocuments();
    }));
  }
  function addObDocument(){
    const name = document.getElementById('obNewDocName').value.trim();
    const type = document.getElementById('obNewDocType').value;
    const uploadedAt = document.getElementById('obNewDocDate').value || null;
    if(!name){ showToast('Give the document a name'); return; }
    client.documents.push(TEI.calc.stampEdit({id:uid(), name, uploadedAt, url:null}, 'client'));
    clearFields(['obNewDocName','obNewDocDate']);
    renderObDocuments();
  }

  /* ================= STEP 8: REVIEW & LAUNCH ================= */
  function renderReview(){
    const c = completion(client);
    document.getElementById('obCompletionPercent').textContent = c.percent + '%';
    document.getElementById('obCompletionFill').style.width = c.percent + '%';
    document.getElementById('obMissingList').innerHTML = c.missing.length
      ? c.missing.map(m=>`<li>${m.label}</li>`).join('')
      : '<li style="color:var(--sage);">Nothing missing, the Foundation is complete.</li>';
    document.getElementById('obMissingCard').style.display = c.missing.length ? 'block' : 'none';

    const sections = [
      {step:1, name:'Client Profile', done: !!(client.personal.firstName && client.personal.lastName)},
      {step:2, name:'Cashflow Foundation', done: client.cashflow.income.length>0},
      {step:3, name:'Wealth Foundation', done: client.wealth.assets.length>0},
      {step:4, name:'Investment Accounts', done: client.accounts.length>0},
      {step:5, name:'Holdings', done: client.holdings.length>0},
      {step:6, name:'Goals', done: client.goals.length>0},
      {step:7, name:'Documents', done: client.documents.length>0}
    ];
    document.getElementById('obReviewSections').innerHTML = sections.map(s=>
      `<div class="review-section">
        <div class="review-section-head">
          <h3>${s.name}</h3>
          <button type="button" data-review-edit="${s.step}">Edit</button>
        </div>
        <div class="rs-status ${s.done?'complete':''}">${s.done ? 'Complete' : 'Not started'}</div>
      </div>`
    ).join('');
    document.querySelectorAll('[data-review-edit]').forEach(btn=> btn.addEventListener('click', function(){
      goToStep(Number(this.dataset.reviewEdit));
    }));
  }

  /* ================= STEP 9: COMPLETE ================= */
  function renderSummary(){
    const income = totalMonthlyIncome(client);
    const spend = totalFixedExpenses(client) + totalVariableExpenses(client);
    document.getElementById('obSummaryStats').innerHTML = `
      <div class="range-stat"><span class="rs-label">Accounts added</span><b>${client.accounts.length}</b></div>
      <div class="range-stat"><span class="rs-label">Goals set</span><b>${client.goals.length}</b></div>
      <div class="range-stat accent-gold"><span class="rs-label">Monthly savings, roughly</span><b>${fmtGBP(income-spend)}</b></div>
    `;
  }
  async function finish(){
    client.settings.onboardingComplete = true;
    client.meta.lastUpdated = new Date().toISOString();
    client.meta.completion = completion(client);
    try{
      await TEI.wealthOS.setOnboardingComplete(client.meta.clientId);
    } catch(err){
      console.error('Wealth OS: failed to mark onboarding complete', err);
      showToast("Could not save that this step is complete, " + (err.message || 'try again') + '. Your entries so far are still saved individually.');
      return false;
    }
    // Reaching here from step 8's "Create Client Dashboard" button --
    // finish() itself never used to advance the wizard, so the click
    // saved everything but visibly left you stuck on the Review step.
    goToStep(TOTAL_STEPS);
    showToast('All done, saved to your TEI account');
    return true;
  }

  /* ================= INIT (shared client object, populated from Supabase by TEI.wealthOS) ================= */
  /* init() can run more than once per page load -- an adviser opening/
     creating a client goes through startClientView, which calls this every
     time (open client A, back to the list, open client B, or reopen the
     same client). All the addEventListener wiring below must only ever
     happen once, or every button ends up with N stacked listeners: each
     "Add" click then inserts the same new record N times (edits look fine,
     since re-running an update/Object.assign N times is harmless), and
     Next/Back fire their step transition N times per click, skipping steps.
     `wired` guards that; the fill/render calls above it stay unguarded
     since they just repaint the current `client` and are safe to repeat. */
  let wired = false;
  function wireOnboardingControls(){
    document.getElementById('skipOnboardingLink').addEventListener('click', ()=> TEI.app.setMode('client'));
    document.getElementById('goToDashboardLink').addEventListener('click', (e)=>{ e.preventDefault(); TEI.app.setMode('client'); });

    wireYnToggles();
    wirePersonal();
    wireCashflowBasics();
    wireWealth();

    document.getElementById('obAddIncomeBtn').addEventListener('click', addOrSaveIncome);
    document.getElementById('obAddFixedBtn').addEventListener('click', ()=>addOrSaveExpense('fixed'));
    document.getElementById('obAddVariableBtn').addEventListener('click', ()=>addOrSaveExpense('variable'));
    document.getElementById('obAddAssetBtn').addEventListener('click', addOrSaveAsset);
    document.getElementById('obAddLiabBtn').addEventListener('click', addOrSaveLiability);
    document.getElementById('obNewAcctType').addEventListener('change', toggleAcctContribFields);
    document.getElementById('obNewAcctRateType').addEventListener('change', toggleAcctMaturityField);
    document.getElementById('obAddAcctBtn').addEventListener('click', addOrSaveAccount);
    document.getElementById('obAddHoldingBtn').addEventListener('click', addOrSaveHolding);
    document.getElementById('obNewGoalProgressType').addEventListener('change', toggleGoalProgressFields);
    // The "Which income?" list is filtered by goal category (see
    // refreshGoalLinkedIncomeOptions) so switching to/from "Build a
    // Business" needs to rebuild it too, even though visibility itself
    // only depends on progress type.
    document.getElementById('obNewGoalType').addEventListener('change', toggleGoalProgressFields);
    document.getElementById('obAddGoalBtn').addEventListener('click', addOrSaveGoal);
    document.getElementById('obAddDocBtn').addEventListener('click', addObDocument);

    document.getElementById('backBtn').addEventListener('click', ()=>goToStep(nextVisibleStep(step,-1)));
    // Both handlers disable the button they were clicked on for their own
    // duration -- saveContinuousFieldsIfLeaving() only ever disables
    // nextBtn (see its comment), so a fast double-tap on "Skip this step"
    // was not blocked by anything: two overlapping saves could each resolve
    // and call goToStep(nextVisibleStep(...)) off a stale `step`, hopping
    // two steps forward on what looked like one click.
    document.getElementById('nextBtn').addEventListener('click', async function(){
      this.disabled = true;
      try{
        if(!(await saveContinuousFieldsIfLeaving())) return;
        if(step===8){ await finish(); return; }
        goToStep(nextVisibleStep(step,1));
      } finally {
        this.disabled = false;
      }
    });
    document.getElementById('skipStepBtn').addEventListener('click', async function(){
      this.disabled = true;
      try{
        if(!(await saveContinuousFieldsIfLeaving())) return;
        goToStep(nextVisibleStep(step,1));
      } finally {
        this.disabled = false;
      }
    });
    // finish() itself is shared with step 8's "Create Client Dashboard"
    // nextBtn (see its comment above), where landing on step 9 -- the
    // Complete/summary screen -- is the correct outcome. This button lives
    // on that same step 9, so its job is different: actually leave the
    // wizard for the client dashboard, matching what "View my dashboard →"
    // right next to it already does. Re-saving via finish() here is
    // harmless (same idempotent update), but skipping the mode switch on
    // failure -- rather than always navigating -- keeps this consistent
    // with every other Save-then-advance control in the wizard.
    document.getElementById('finishBtn').addEventListener('click', async function(){
      this.disabled = true;
      try{
        const ok = await finish();
        if(ok) TEI.app.setMode('client');
      } finally {
        this.disabled = false;
      }
    });
  }
  function init(sharedClient){
    client = sharedClient;
    clientId = client.meta.clientId || 'preview-client';

    fillPersonal();
    renderIncomeList(); renderExpenseList('fixed'); renderExpenseList('variable');
    fillCashflowBasics();
    fillWealth();
    fillAccountsToggle(); renderObAccounts();
    refreshHoldingAccountSelect(); renderObHoldings();
    refreshLiabilityLinkOptions();
    refreshGoalLinkedAccountOptions(); refreshGoalLinkedIncomeOptions(); toggleGoalProgressFields(); renderObGoals();
    renderObDocuments();

    if(!wired){ wired = true; wireOnboardingControls(); }

    goToStep(1);
  }

  /* Steps 1, 2 (cashflow basics) and 3 (property value) have fields with no
     per-field save button of their own -- they write straight to the local
     client object as you type (see wirePersonal / wireCashflowBasics /
     wireWealth), so the one moment to actually persist them to Supabase is
     when leaving the step via Next/Skip. Every other step (income, expenses,
     assets, liabilities, accounts, holdings, goals) already saves per-record
     through its own Add/Save button instead -- this only covers the three
     exceptions. */
  async function saveContinuousFieldsIfLeaving(){
    if(step !== 1 && step !== 2 && step !== 3) return true;
    const nextBtnEl = document.getElementById('nextBtn');
    nextBtnEl.disabled = true;
    try{
      if(step === 1){
        await TEI.wealthOS.saveClientPersonal(client.meta.clientId, client.personal);
      } else if(step === 2){
        await TEI.wealthOS.saveCashflowSettings(client.meta.clientId, client);
      } else if(step === 3){
        const property = getPropertyAsset();
        // property.id starts as a uid() string (see wireWealth) until it is
        // been saved once -- after that it is a real Supabase UUID, which
        // survives a page reload (unlike a local "already saved" flag would),
        // so that format check is what decides insert vs. update here.
        if(property){
          if(TEI.data.isRealId(property.id)){
            await TEI.wealthOS.saveWealthAsset(client.meta.clientId, property.id, property);
          } else {
            property.id = await TEI.wealthOS.saveWealthAsset(client.meta.clientId, null, property);
          }
        }
      }
    } catch(err){
      console.error('Wealth OS: failed to save', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
      nextBtnEl.disabled = false;
      return false;
    }
    nextBtnEl.disabled = false;
    return true;
  }

  function refresh(){
    clientId = client.meta.clientId || 'preview-client';
    fillPersonal();
    renderIncomeList(); renderExpenseList('fixed'); renderExpenseList('variable');
    fillCashflowBasics();
    fillWealth();
    fillAccountsToggle(); renderObAccounts();
    refreshHoldingAccountSelect(); renderObHoldings();
    refreshLiabilityLinkOptions();
    refreshGoalLinkedAccountOptions(); refreshGoalLinkedIncomeOptions(); renderObGoals();
    renderObDocuments();
    // setMode('onboarding') (via "Run onboarding" / "Redo onboarding") calls
    // this every time the wizard is (re-)entered, but `step` is left over
    // from whatever step it was on last -- for a client who has already
    // finished onboarding once, that is step 9 (Complete), where the whole
    // nav bar including Back/Skip/Continue is hidden by design. Redoing
    // onboarding should always start from the top.
    goToStep(1);
  }

  TEI.onboarding = { init, refresh };
})();

