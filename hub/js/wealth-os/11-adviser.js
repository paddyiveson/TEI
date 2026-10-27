window.TEI = window.TEI || {};
(function(){
  const {fmtGBP, uid, currentMonthKey} = TEI.data;
  let client = null;
  let clientId = 'preview-client';
  const uploadQueue = [];
  const editing = {}; // per-section id of the record currently being edited, e.g. editing.account = '123'
  // Which month each of the three "log this month" widgets is currently
  // pointed at -- defaults to the current month, but can be moved to any
  // past month via the picker to backfill or correct history.
  const selectedMonth = { accounts: currentMonthKey(), holdings: currentMonthKey() };
  // Which account groups are expanded on Holdings -- keyed by account id
  // ('_unknown' for holdings whose account was since deleted). Lives here
  // rather than on the DOM (dataset.expanded) because the whole group list
  // gets rebuilt from scratch on every renderHoldings() call, same reason
  // selectedMonth/editing above are plain module state rather than DOM state.
  const holdingsGroupExpanded = {};
  function clearFieldsAdv(ids){ ids.forEach(id=>{ const el = document.getElementById(id); if(el) el.value=''; }); }

  function showToast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(()=>el.classList.remove('show'), 2600);
  }

  /* ================= TABS ================= */
  function wireTabs(){
    document.querySelectorAll('.adv-tabs button').forEach(btn=>{
      btn.addEventListener('click', function(){
        document.querySelectorAll('.adv-tabs button').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('tab-'+this.dataset.tab).classList.add('active');
        if(this.dataset.tab === 'tools') renderExportSummary();
        if(this.dataset.tab === 'overview') renderOverview();
        if(this.dataset.tab === 'updates') renderUpdates();
        if(this.dataset.tab === 'setup' && TEI.setup) TEI.setup.coachRender(TEI.app.state.client);
      });
    });
  }
  /* Manual Entry was one long scroll through 16 stacked sections -- the
     sub-tab markup already existed (Profile/Accounts/Holdings/Wealth/
     Goals/Cashflow/Documents) but was never wired up: no CSS to hide
     inactive panels, no click handler. This is that wiring. */
  function wireSubtabs(){
    document.querySelectorAll('.adv-subtabs button').forEach(btn=>{
      btn.addEventListener('click', function(){
        document.querySelectorAll('.adv-subtabs button').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.subtab-panel').forEach(p=>p.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('subtab-'+this.dataset.subtab).classList.add('active');
        document.getElementById('tab-manual').scrollIntoView({behavior:'instant', block:'start'});
      });
    });
  }

  /* ================= PERSONAL ================= */
  function fillPersonalForm(){
    document.getElementById('mFirstName').value = client.personal.firstName||'';
    document.getElementById('mLastName').value = client.personal.lastName||'';
    document.getElementById('mEmail').value = client.personal.email||'';
    document.getElementById('mDob').value = (client.personal.dob||'').slice(0,10);
    document.getElementById('mTier').value = client.settings.tier || '';
    document.getElementById('mMemberSince').value = (client.settings.memberSince||'').slice(0,10);
    document.getElementById('mEmployment').value = client.personal.employmentStatus||'';
    document.getElementById('mRelationship').value = client.personal.relationshipStatus||'';
    document.getElementById('mRisk').value = client.personal.riskProfile||'';
    document.getElementById('mOnboarding').value = String(!!client.settings.onboardingComplete);
    document.getElementById('mNotes').value = client.personal.notes||'';
    // fillPersonalForm() runs on every init/refresh (new client opened,
    // any field saved elsewhere re-rendering the workspace, My Details
    // remounting) -- guard so re-wiring does not stack a fresh 'change'
    // listener on top of the last one each time (same double-fire bug
    // the module-level `wired` flag exists to avoid for the Add buttons).
    const personalForm = document.getElementById('subtab-profile');
    if(personalForm && !personalForm.dataset.wired){
      ['mFirstName','mLastName','mEmail','mDob','mEmployment','mRelationship','mRisk','mOnboarding','mNotes','mTier','mMemberSince'].forEach(id=>{
        document.getElementById(id).addEventListener('change', savePersonal);
      });
      personalForm.dataset.wired = '1';
    }
  }
  /* Was in-memory only until 2026-08-29 -- typing into Profile changed
     client.personal locally but nothing wrote it back to Supabase; the only
     way it actually persisted was downloading the JSON export and
     re-importing it by hand. Every other Manual Entry section (accounts,
     holdings, goals, cashflow) already saves for real -- this brings
     Profile in line with that, and is what makes the client-facing "My
     Details" page (which reuses this exact form/handler) actually work. */
  async function savePersonal(){
    client.personal.firstName = document.getElementById('mFirstName').value.trim();
    client.personal.lastName = document.getElementById('mLastName').value.trim();
    client.personal.email = document.getElementById('mEmail').value.trim();
    // Date of birth (spec B9.2): client-editable, drives Forecast's ages.
    client.personal.dob = document.getElementById('mDob').value || '';
    client.personal.employmentStatus = document.getElementById('mEmployment').value;
    client.personal.relationshipStatus = document.getElementById('mRelationship').value;
    // Self-reported risk is client-editable (spec B9.2).
    client.personal.riskProfile = document.getElementById('mRisk').value;
    // Onboarding status and notes are adviser-only (spec B0): hidden from a
    // client session, and never written from one.
    if(client.meta.role === 'adviser'){
      client.settings.onboardingComplete = document.getElementById('mOnboarding').value === 'true';
      client.personal.notes = document.getElementById('mNotes').value.trim();
      // Membership tier and start date (migration 011): set by the coach only.
      const tier = document.getElementById('mTier').value || null;
      const since = document.getElementById('mMemberSince').value || null;
      if(tier !== (client.settings.tier || null) || since !== ((client.settings.memberSince||'').slice(0,10) || null)){
        TEI.wealthOS.saveClientSettings(client.meta.clientId, {tier, member_since: since}).then(()=>{
          client.settings.tier = tier || undefined; client.settings.memberSince = since || undefined;
        }).catch(err=>{ console.error('Wealth OS: membership not saved', err); showToast('That did not save. Please try again.'); });
      }
    }
    TEI.calc.stampEdit(client.personal, client.meta.role);
    const fullName = [client.personal.firstName, client.personal.lastName].filter(Boolean).join(' ');
    document.getElementById('advClientName').textContent = fullName || client.meta.displayName;
    try{
      await TEI.wealthOS.saveClientPersonal(client.meta.clientId, client.personal);
    } catch(err){
      console.error('Wealth OS: failed to save personal details', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
    }
  }

  /* ================= ACCOUNTS ================= */
  function renderAccounts(){
    const list = document.getElementById('accountsList');
    list.className = 'entity-pill-grid';
    list.innerHTML = client.accounts.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">No accounts yet, add one below.</div></div>`;
    client.accounts.forEach(acc=>{
      const row = document.createElement('div');
      row.className = 'entity-pill';
      const isPension = acc.type === 'pension';
      const isCrypto = acc.type === 'crypto';
      const hasHoldings = TEI.calc.accountHasHoldings(client, acc.id);
      // Contribution-vs-holdings check, adviser-side: same math and same
      // "only the unaccounted-for direction counts" rule Portfolio Overview
      // uses (see TEI.calc.isDiscrepancyFlaggable) -- this is where an
      // adviser actually investigates and either fixes the underlying
      // figures or, once satisfied a gap is explained (realized losses,
      // FX-recompute drift, tax relief...), marks it reviewed so it stops
      // flagging on the client-facing Portfolio page too.
      const disc = TEI.calc.contributionDiscrepancy(client, [acc.id]);
      const flaggable = TEI.calc.isDiscrepancyFlaggable(disc);
      const dismissed = flaggable && TEI.calc.isDiscrepancyDismissed(acc, disc.diff);
      let discRow = '';
      if(flaggable && !dismissed){
        discRow = `<div class="ep-warn" style="color:var(--k-emph-down);">${TEI.calc.fmtDiscrepancy(disc)}
          <button type="button" class="btn-ghost" data-mark-reviewed="${acc.id}" style="padding:2px 8px; font-size:10px; margin-left:6px;">Mark reviewed</button></div>`;
      } else if(flaggable && dismissed){
        discRow = `<div class="ep-warn" style="color:var(--cream-soft2);">Reviewed, accepting a ${fmtGBP(Math.abs(disc.diff))} gap as explained (as of ${new Date(acc.discrepancyDismissedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}).
          <button type="button" class="btn-ghost" data-clear-reviewed="${acc.id}" style="padding:2px 8px; font-size:10px; margin-left:6px;">Clear</button></div>`;
      }
      // Calculated, not stored: opening_contributions + every logged
      // deposit (TEI.calc.acctContributionBreakdown -- same total the
      // reconciliation check above uses).
      const cb = TEI.calc.acctContributionBreakdown(client, acc.id);
      const pendingText = TEI.calc.fmtPendingRelief(acc, cb.reliefPending);
      if(pendingText) discRow += `<div class="ep-warn" data-relief-pending="${acc.id}" style="color:var(--cream-soft2);">${pendingText}</div>`;
      const cbPaidIn = cb.opening + cb.paidIn;
      let cbDetail = '';
      if(cb.relief > 0){
        const parts = [];
        if(cbPaidIn) parts.push(fmtGBP(cbPaidIn)+' paid in');
        if(cb.sacrifice) parts.push(fmtGBP(cb.sacrifice)+' via salary sacrifice');
        parts.push(fmtGBP(cb.relief)+((acc.type==='lisa'||acc.type==='cash_lisa') ? ' bonus' : ' tax relief'));
        cbDetail = parts.join(' + ');
      } else if(cb.sacrifice){
        cbDetail = cbPaidIn ? fmtGBP(cbPaidIn)+' paid in + '+fmtGBP(cb.sacrifice)+' via salary sacrifice' : 'via salary sacrifice';
      } else if(cb.opening && !cb.monthsLogged){
        cbDetail = 'entered as a lump sum, no monthly history yet';
      }
      const contribRow = cb.recorded
        ? `<div class="ep-contrib" data-acct-contrib-total="${acc.id}">Total contributions to date <strong>${cb.total<0?'-':''}${fmtGBP(Math.abs(cb.total))}</strong>${cbDetail ? `<div class="ep-contrib-sub">${cbDetail}</div>` : ''}</div>`
        : `<div class="ep-contrib" data-acct-contrib-total="${acc.id}">Total contributions to date <strong>not recorded yet</strong><div class="ep-contrib-sub">Log monthly deposits, or add contributions before tracking started</div></div>`;
      const acctTags = (hasHoldings || acc.isJoint) ? `<div class="ep-tags">${hasHoldings?'<span class="tag-pill" style="opacity:0.7;">from holdings</span>':''}${acc.isJoint?'<span class="tag-pill">Joint</span>':''}</div>` : '';
      row.innerHTML = `
        <div class="ep-top">
          <div class="ep-heading"><span class="ep-name">${TEI.data.acctLabel(acc)}</span></div>
          <span class="tag-pill">${acc.type}</span>
        </div>
        <div class="ep-value">${fmtGBP(acc.value)}</div>
        <div class="ep-meta">${acc.provider||'No provider set'}${acc.hasContributionRule ? '' : (isPension ? ' · personal '+fmtGBP(acc.contributionPersonal)+'/mo · sacrifice '+fmtGBP(acc.contributionSacrifice)+'/mo' : ' · '+fmtGBP(acc.contribution)+'/mo')}${isCrypto && acc.lastUpdated ? ' · Last updated '+new Date(acc.lastUpdated).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : ''}</div>
        ${contribRuleSummaryHtml(acc)}
        ${acc.isManualPriced ? accountCheckedHtml(acc) : ''}
        ${contribRow}
        ${acctTags}
        ${discRow}
        ${contribTogglesHtml(acc)}
        <div class="ep-actions">
          <button type="button" class="btn-ghost" data-edit-acct="${acc.id}">Edit</button>
          <button type="button" class="btn-ghost" data-del-acct="${acc.id}">Remove</button>
        </div>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-del-acct]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        if(!confirm('Remove this account? Its holdings and monthly history will stay orphaned in the file.')) return;
        const id = this.dataset.delAcct;
        this.disabled = true;
        try{
          await TEI.wealthOS.deleteAccount(id);
        } catch(err){
          console.error('Wealth OS: failed to delete account', err);
          showToast('That did not remove. ' + (err.message || 'Please try again.'));
          this.disabled = false;
          return;
        }
        client.accounts = client.accounts.filter(a=>a.id !== id);
        if(editing.account === id) cancelAcctEdit();
        renderAccounts(); renderMonthlyBalanceFields(); refreshAccountSelects(); renderCalculatedSavingStats();
      });
    });
    wireContribAccountControls(list);
    list.querySelectorAll('[data-mark-reviewed]').forEach(btn=>{
      btn.addEventListener('click', ()=> setDiscrepancyReviewed(btn.dataset.markReviewed, true));
    });
    list.querySelectorAll('[data-clear-reviewed]').forEach(btn=>{
      btn.addEventListener('click', ()=> setDiscrepancyReviewed(btn.dataset.clearReviewed, false));
    });
    list.querySelectorAll('[data-edit-acct]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const acc = client.accounts.find(a=>a.id===this.dataset.editAcct); if(!acc) return;
        editing.account = acc.id;
        document.getElementById('newAcctType').value = acc.type;
        document.getElementById('newAcctProvider').value = acc.provider||'';
        const balanceEl = document.getElementById('newAcctBalance');
        const hasHoldings = TEI.calc.accountHasHoldings(client, acc.id);
        balanceEl.value = acc.value;
        balanceEl.disabled = hasHoldings;
        balanceEl.title = hasHoldings ? 'Calculated from logged holdings, edit holdings below instead' : '';
        document.getElementById('newAcctContrib').value = acc.type==='pension' ? '' : (acc.contribution||'');
        document.getElementById('newAcctContribPersonal').value = acc.type==='pension' ? (acc.contributionPersonal||'') : '';
        document.getElementById('newAcctContribEmployer').value = acc.type==='pension' ? (acc.contributionSacrifice||'') : '';
        document.getElementById('newAcctOpeningContrib').value = acc.openingContributions!=null ? acc.openingContributions : '';
        document.getElementById('newAcctCashBalance').value = acc.cashBalance!=null ? acc.cashBalance : '';
        document.getElementById('newAcctInterestRate').value = acc.interestRate!=null ? acc.interestRate : '';
        document.getElementById('newAcctRateType').value = acc.rateType || 'variable';
        document.getElementById('newAcctMaturityDate').value = acc.maturityDate || '';
        document.getElementById('newAcctIsJoint').checked = !!acc.isJoint;
        setAcctMoreOptions(acc);
        setIsaAllowanceField(acc);
        setAcctContribFieldsRuleOwned(!!acc.hasContributionRule);
        toggleAdvAcctContribFields();
        document.getElementById('addAcctBtn').textContent = 'Save changes';
        document.getElementById('newAcctType').scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
  }
  /* "Mark reviewed" / "Clear" for the contribution-discrepancy check above --
     stores (or clears) the diff at review time on the account itself so
     Portfolio Overview's flag (see TEI.calc.isDiscrepancyDismissed) tracks
     what was actually investigated, not just whatever the gap happens to be
     today. Re-renders the client-facing Portfolio page too (same cross-shell
     gap as refreshLivePrices/addAccount -- adviserApp and clientApp are
     separate DOM shells sharing one client object). */
  async function setDiscrepancyReviewed(accountId, mark){
    const acc = client.accounts.find(a=>a.id===accountId);
    if(!acc) return;
    let patch;
    if(mark){
      const disc = TEI.calc.contributionDiscrepancy(client, [accountId]);
      if(!TEI.calc.isDiscrepancyFlaggable(disc)) return; // nothing currently flagged to review
      patch = { discrepancyDismissedAmount: disc.diff, discrepancyDismissedAt: new Date().toISOString() };
    } else {
      patch = { discrepancyDismissedAmount: null, discrepancyDismissedAt: null };
    }
    const merged = Object.assign({}, acc, patch);
    TEI.calc.stampEdit(merged, 'adviser');
    try{
      await TEI.wealthOS.saveAccount(client.meta.clientId, acc.id, merged);
    } catch(err){
      console.error('Wealth OS: failed to save discrepancy review', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
      return;
    }
    Object.assign(acc, merged);
    renderAccounts();
    if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
    showToast(mark ? 'Marked reviewed' : 'Cleared');
  }
  function cancelAcctEdit(){
    editing.account = null;
    document.getElementById('addAcctBtn').textContent = 'Add account';
    ['newAcctBalance','newAcctContrib','newAcctContribPersonal','newAcctContribEmployer','newAcctProvider','newAcctOpeningContrib','newAcctCashBalance','newAcctInterestRate','newAcctMaturityDate'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('newAcctRateType').value = 'variable';
    document.getElementById('newAcctIsJoint').checked = false;
    setAcctMoreOptions(null);
    setIsaAllowanceField(null);
    const balanceEl = document.getElementById('newAcctBalance');
    balanceEl.disabled = false;
    balanceEl.title = '';
    setAcctContribFieldsRuleOwned(false);
  }
  /* "More options" (set-and-forget / earmarked / safety net): optional,
     collapsed by default, and opened on edit only when the account already
     has one switched on so its current state is visible. null = blank add
     form. */
  function setAcctMoreOptions(acc){
    const sf = !!(acc && acc.setAndForget), em = !!(acc && acc.earmarked);
    const sn = !!(acc && ((client.cashflow||{}).emergencyFund||{}).accountId === acc.id);
    document.getElementById('newAcctSetAndForget').checked = sf;
    document.getElementById('newAcctEarmarked').checked = em;
    document.getElementById('newAcctSafetyNet').checked = sn;
    document.getElementById('acctMoreOptions').open = sf || em || sn;
  }
  /* "Is this your safety net?" (cash and cash ISA only): sets or clears
     cashflow_settings.emergency_fund_account_id, the same link Settings >
     Plan settings chooses. Only one account holds it, so ticking it on
     another account moves it there. */
  async function saveSafetyNetLink(accId, on){
    const ef = client.cashflow.emergencyFund || {};
    if(on === (ef.accountId === accId)) return;
    const acc = client.accounts.find(a=> a.id === accId);
    client.cashflow.emergencyFund = TEI.calc.stampEdit({target: Number(ef.target)||0, accountId: on ? accId : null,
      current: on && acc ? (Number(acc.value)||0) : 0}, (client.meta && client.meta.role) || 'adviser');
    try{
      await TEI.wealthOS.saveCashflowSettings(client.meta.clientId, client);
    } catch(err){
      client.cashflow.emergencyFund = ef;
      console.error('Wealth OS: safety net link not saved', err);
      showToast('The safety net link did not save. Please try again.');
    }
    fillEfAccountSelect();
  }
  /* ISA allowance left (B5.2): shown on ISA accounts, stamped with the tax
     year when saved. A figure from an earlier tax year shows greyed with a
     reset prompt, and is kept as it was unless it is changed. */
  function setIsaAllowanceField(acc){
    const input = document.getElementById('newAcctIsaAllowance'), help = document.getElementById('newAcctIsaAllowanceHelp');
    const a = TEI.calc.isaAllowance(acc), ty = TEI.calc.taxYearLabel();
    const end = Number(ty.slice(0, 4)) + 1;
    const stale = a.value != null && !a.current;
    input.value = a.value != null ? a.value : '';
    input.classList.toggle('is-stale', stale);
    input.dataset.stale = stale ? '1' : '';
    help.textContent = stale
      ? 'This was for ' + (a.taxYear || 'an earlier tax year') + '. The allowance resets on 6 April, so enter what is left for ' + ty + '.'
      : 'For the ' + ty + ' tax year, to 5 April ' + end + '. Bed & ISA in the Portfolio Lab uses it.';
  }
  function readIsaAllowance(type, acc){
    if(TEI.calc.ISA_TYPES.indexOf(type) < 0) return {isaAllowanceLeft:null, isaAllowanceTaxYear:null};
    const input = document.getElementById('newAcctIsaAllowance');
    if(input.dataset.stale && acc) return {isaAllowanceLeft:acc.isaAllowanceLeft, isaAllowanceTaxYear:acc.isaAllowanceTaxYear};
    if(input.value === '') return {isaAllowanceLeft:null, isaAllowanceTaxYear:null};
    return {isaAllowanceLeft:Math.max(0, parseFloat(input.value)||0), isaAllowanceTaxYear:TEI.calc.taxYearLabel()};
  }
  function setAcctContribFieldsRuleOwned(owned){
    ['newAcctContrib','newAcctContribPersonal','newAcctContribEmployer'].forEach(id=>{
      const el = document.getElementById(id);
      el.disabled = owned;
      el.title = owned ? 'Set by the recurring contribution rule, edit the rule instead' : '';
    });
  }
  function toggleAdvAcctContribFields(){
    const type = document.getElementById('newAcctType').value;
    const isPension = type === 'pension';
    document.getElementById('advAcctContribField').style.display = isPension ? 'none' : 'flex';
    document.getElementById('advAcctContribPersonalField').style.display = isPension ? 'flex' : 'none';
    document.getElementById('advAcctContribEmployerField').style.display = isPension ? 'flex' : 'none';
    document.getElementById('advAcctPensionNote').style.display = isPension ? 'inline' : 'none';
    // Lump sum is net deposits for LISA/pension -- TEI.calc.openingReliefFor
    // adds the bonus/relief on top, so the wording has to say so.
    const openingHelp = {
      cash_lisa: "Net deposits only, before the 25% government bonus. The bonus is added on top. Only needed if monthly history does not go back to the start.",
      lisa: "Net deposits only, before the 25% government bonus. The bonus is added on top. Only needed if monthly history does not go back to the start.",
      pension: "Your own net contributions, before 20% tax relief. Relief is added on top (not for salary-sacrifice-only pensions). Only needed if monthly history does not go back to the start."
    };
    document.getElementById('newAcctOpeningHelp').textContent = openingHelp[type] || "Only needed if monthly history does not go back to the start.";
    const isCash = type === 'cash' || type === 'cash_isa' || type === 'cash_lisa';
    document.getElementById('advAcctInterestRateField').style.display = isCash ? 'flex' : 'none';
    document.getElementById('advAcctRateTypeField').style.display = isCash ? 'flex' : 'none';
    document.getElementById('advAcctIsaAllowanceField').style.display = TEI.calc.ISA_TYPES.indexOf(type) >= 0 ? 'flex' : 'none';
    document.getElementById('advAcctSafetyNetField').style.display = (type === 'cash' || type === 'cash_isa') ? '' : 'none';
    document.getElementById('advAcctJointField').style.display = client.meta.householdId ? 'flex' : 'none';
    toggleAdvAcctMaturityField();
  }
  function toggleAdvAcctMaturityField(){
    const type = document.getElementById('newAcctType').value;
    const isCash = type === 'cash' || type === 'cash_isa' || type === 'cash_lisa';
    const isFixed = document.getElementById('newAcctRateType').value === 'fixed';
    document.getElementById('advAcctMaturityField').style.display = (isCash && isFixed) ? 'flex' : 'none';
  }
  async function addAccount(){
    const type = document.getElementById('newAcctType').value;
    const value = parseFloat(document.getElementById('newAcctBalance').value)||0;
    const contrib = parseFloat(document.getElementById('newAcctContrib').value)||0;
    const contribPersonal = parseFloat(document.getElementById('newAcctContribPersonal').value)||0;
    const contribEmployer = parseFloat(document.getElementById('newAcctContribEmployer').value)||0;
    const provider = document.getElementById('newAcctProvider').value.trim();
    const openingContribInput = document.getElementById('newAcctOpeningContrib').value;
    const openingContributions = openingContribInput ? parseFloat(openingContribInput) : null;
    const cashBalanceInput = document.getElementById('newAcctCashBalance').value;
    const cashBalance = cashBalanceInput ? parseFloat(cashBalanceInput) : null;
    const isCashType = type === 'cash' || type === 'cash_isa' || type === 'cash_lisa';
    const interestRateInput = document.getElementById('newAcctInterestRate').value;
    const interestRate = isCashType && interestRateInput ? parseFloat(interestRateInput) : null;
    const rateType = isCashType && interestRate!=null ? document.getElementById('newAcctRateType').value : null;
    const maturityDateInput = document.getElementById('newAcctMaturityDate').value;
    const maturityDate = isCashType && rateType==='fixed' && maturityDateInput ? maturityDateInput : null;
    // The Joint checkbox is only visible (and meaningful) once this client has
    // a household -- for everyone else it stays false regardless of the
    // (hidden) checkbox's DOM state, same guard as the expense owner field.
    const isJoint = !!client.meta.householdId && document.getElementById('newAcctIsJoint').checked;
    const setAndForget = document.getElementById('newAcctSetAndForget').checked;
    const earmarked = document.getElementById('newAcctEarmarked').checked;
    const safetyNet = (type === 'cash' || type === 'cash_isa') && document.getElementById('newAcctSafetyNet').checked;
    const key = currentMonthKey();
    const btn = document.getElementById('addAcctBtn');
    if(editing.account){
      const acc = client.accounts.find(a=>a.id===editing.account);
      if(!acc){ cancelAcctEdit(); return; }
      const hasHoldings = TEI.calc.accountHasHoldings(client, acc.id);
      const patch = {type, provider, value: hasHoldings ? acc.value : value, openingContributions, cashBalance, interestRate, rateType, maturityDate, isJoint, setAndForget, earmarked};
      Object.assign(patch, readIsaAllowance(type, acc));
      // Crypto's value is normally holdings-driven (stamped in persistCryptoLastUpdated
      // instead, see addHolding) -- this only covers a crypto account still being
      // manually balanced before its first holding is logged.
      if(type==='crypto' && !hasHoldings) patch.lastUpdated = new Date().toISOString().slice(0,10);
      // A recurring contribution rule owns the monthly contribution fields
      // (synced server-side from calc_contribution on every rule version) --
      // the form shows them disabled, and they're carried over unchanged.
      const ruleOwned = !!acc.hasContributionRule;
      if(ruleOwned){ /* keep acc's contribution fields as they are */ }
      else if(type==='pension'){ patch.contributionPersonal = contribPersonal; patch.contributionSacrifice = contribEmployer; }
      else { patch.contribution = contrib; }
      const merged = Object.assign({}, acc, patch);
      if(!ruleOwned){ if(type==='pension') delete merged.contribution; else { delete merged.contributionPersonal; delete merged.contributionSacrifice; } }
      TEI.calc.stampEdit(merged, 'adviser');
      btn.disabled = true;
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
      // This account's balance is derived from its logged holdings, the manually
      // typed value is ignored for the balance itself, so holdings stay the one
      // source of truth rather than silently being overridden by a stale number.
      if(hasHoldings) TEI.calc.syncAccountValueFromHoldings(client, acc.id);
      else client.months[key] = Object.assign({}, client.months[key], {[acc.id]: value});
      await saveSafetyNetLink(acc.id, safetyNet);
      cancelAcctEdit();
      showToast('Account updated');
    } else {
      const acc = {id:uid(), type, value, provider, openingContributions, cashBalance, interestRate, rateType, maturityDate, isJoint, setAndForget, earmarked, returnPct:null, lastUpdated:new Date().toISOString().slice(0,10)};
      Object.assign(acc, readIsaAllowance(type, null));
      if(type==='pension'){ acc.contributionPersonal = contribPersonal; acc.contributionSacrifice = contribEmployer; }
      else { acc.contribution = contrib; }
      TEI.calc.stampEdit(acc, 'adviser');
      btn.disabled = true;
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
      // Seed this month's balance so the account shows up in net worth immediately,
      // rather than reading as £0 until someone visits "Log this month's balances".
      client.months[key] = Object.assign({}, client.months[key], {[acc.id]: value});
      await saveSafetyNetLink(acc.id, safetyNet);
      ['newAcctBalance','newAcctContrib','newAcctContribPersonal','newAcctContribEmployer','newAcctProvider','newAcctOpeningContrib','newAcctCashBalance','newAcctInterestRate','newAcctMaturityDate'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('newAcctRateType').value = 'variable';
      document.getElementById('newAcctIsJoint').checked = false;
      setAcctMoreOptions(null);
      setIsaAllowanceField(null);
      toggleAdvAcctContribFields();
      showToast('Account added');
    }
    renderAccounts(); renderMonthlyBalanceFields(); refreshAccountSelects(); renderCalculatedSavingStats();
    // See the matching comment in refreshLivePrices -- account edits (e.g.
    // opening contributions, cash balance) feed the Portfolio Overview
    // discrepancy check too, so it needs the same immediate cross-shell
    // re-render, not just on next visit to the client dashboard.
    if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
    // A balance change can be exactly what completes a "monetary" goal
    // linked to this account -- check right away, same reasoning as the
    // income check in addAdvIncome.
    {
      const r = await TEI.calc.checkGoalAutoComplete(client);
      r.completed.forEach(g=> showToast(`🎉 "${g.name}" completed!`));
      r.reopened.forEach(g=> showToast(`"${g.name}" dropped back below target, reopened`));
    }
  }

  /* ================= MONTHLY BALANCES / HOLDINGS / GOALS ================
     All three "log this month" widgets share one pattern: a month picker
     (defaults to current month, but can move to any past month to backfill
     or correct history), a form of current values for the picked month, a
     Save button that upserts to Supabase via TEI.wealthOS, and a history
     list of previously-logged months with an Edit action that just moves
     the picker. Both client and adviser roles get full read/write here --
     this is the one edit surface both roles share equally. ---------- */
  const MONTH_WIDGET = {
    accounts:{ picker:'curMonthPicker', history:'monthlyBalanceHistory', source:()=>client.months },
    holdings:{ picker:'curMonthPickerHoldings', history:'monthlyHoldingHistory', source:()=>client.holdingsMonths }
  };
  /* Every month ever logged used to render in full -- reported live
     against a screenshot as "huge pointless list" once an account had a
     couple of years of history. Caps to the most recent MONTH_HISTORY_CAP
     by default, with a "Show all" toggle that remembers its expanded
     state on the container itself (el.dataset.expanded) so it survives
     the re-render every edit/save triggers. */
  const MONTH_HISTORY_CAP = 6;
  function renderMonthHistory(kind){
    const cfg = MONTH_WIDGET[kind];
    const el = document.getElementById(cfg.history);
    if(!el) return;
    const monthsObj = cfg.source() || {};
    const keys = Object.keys(monthsObj).sort().reverse();
    if(!keys.length){ el.innerHTML = ''; return; }
    const expanded = el.dataset.expanded === '1';
    const visibleKeys = expanded ? keys : keys.slice(0, MONTH_HISTORY_CAP);
    const rows = visibleKeys.map(k=>{
      const isSelected = k === selectedMonth[kind];
      return `<div class="list-row"${isSelected ? ' style="border-color:var(--gold);"' : ''}>
        <div class="lr-main"><b>${TEI.data.monthLabel(k)}</b></div>
        <button type="button" class="btn-ghost" data-edit-month="${kind}" data-month-key="${k}" style="padding:5px 12px; font-size:11px;">${isSelected ? 'Editing' : 'Edit'}</button>
      </div>`;
    }).join('');
    const toggle = keys.length > MONTH_HISTORY_CAP
      ? `<button type="button" class="btn-ghost" data-toggle-month-history style="margin-top:8px; width:100%;">${expanded ? 'Show fewer' : 'Show all ' + keys.length + ' months'}</button>`
      : '';
    el.innerHTML = `<div class="note" style="margin:12px 0 6px;">Previously logged months</div>` + rows + toggle;
    el.querySelectorAll('[data-edit-month]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        selectedMonth[btn.dataset.editMonth] = btn.dataset.monthKey;
        if(btn.dataset.editMonth === 'accounts') renderMonthlyBalanceFields();
        else renderMonthlyHoldingFields();
      });
    });
    const toggleBtn = el.querySelector('[data-toggle-month-history]');
    if(toggleBtn) toggleBtn.addEventListener('click', ()=>{ el.dataset.expanded = expanded ? '0' : '1'; renderMonthHistory(kind); });
  }
  function wireMonthPickers(){
    const wire = (id, kind, renderFn) => {
      const el = document.getElementById(id);
      if(!el || el.dataset.wired) return;
      el.dataset.wired = '1';
      el.addEventListener('change', e=>{
        if(!e.target.value) return;
        selectedMonth[kind] = e.target.value;
        renderFn();
      });
    };
    wire(MONTH_WIDGET.accounts.picker, 'accounts', renderMonthlyBalanceFields);
    wire(MONTH_WIDGET.holdings.picker, 'holdings', renderMonthlyHoldingFields);
  }

  function renderMonthlyBalanceFields(){
    const key = selectedMonth.accounts;
    document.getElementById(MONTH_WIDGET.accounts.picker).value = key;
    const wrap = document.getElementById('monthlyBalanceFields');
    if(!client.accounts.length){ wrap.innerHTML = `<div class="empty-state" style="padding:10px 0; grid-column:1/-1;"><div class="small">Add accounts first.</div></div>`; renderMonthHistory('accounts'); return; }
    const existing = client.months[key] || {};
    const meta = (client.monthsMeta && client.monthsMeta[key]) || {};
    // Holdings-linked accounts stay locked to the live holdings total only
    // for the CURRENT month (that is the one figure other pages/net-worth
    // read as "now", so it cannot silently diverge from the holdings list).
    // Any other month is real history -- editable like any other account,
    // since holdings were not necessarily logged that granularly back then.
    const isCurrent = key === currentMonthKey();
    wrap.innerHTML = client.accounts.map(acc=>{
      const hasHoldings = TEI.calc.accountHasHoldings(client, acc.id);
      if(hasHoldings && isCurrent){
        const total = TEI.calc.holdingsTotalForAccount(client, acc.id);
        return `<label class="form-field"><span>${TEI.data.acctLabel(acc)}</span>
          <input type="text" disabled value="${fmtGBP(total)}" style="opacity:0.6;" title="Calculated from logged holdings">
          <span class="note" style="margin-top:2px;">From holdings, edit in Portfolio</span></label>`;
      }
      // Phase 22: auto-carried-forward by the monthly snapshot job, not
      // typed in or confirmed -- same flag as the client-facing Update page.
      const autoNote = meta[acc.id] ? `<span class="note" style="margin-top:2px; color:var(--gold);">Carried forward automatically, confirm or correct if it is changed</span>` : '';
      const hint = hasHoldings ? `<span class="note" style="margin-top:2px;">Historical value, the current month is calculated from holdings instead</span>` : autoNote;
      return `<label class="form-field"><span>${TEI.data.acctLabel(acc)}</span><input type="number" step="0.01" data-month-acct="${acc.id}" value="${existing[acc.id]!=null?existing[acc.id]:''}" placeholder="0.00">${hint}</label>`;
    }).join('');
    renderMonthHistory('accounts');
  }
  async function saveMonth(){
    const key = selectedMonth.accounts;
    const btn = document.getElementById('saveMonthBtn');
    const toSave = Array.from(document.querySelectorAll('[data-month-acct]'))
      .map(el=>({id:el.dataset.monthAcct, v:parseFloat(el.value)}))
      .filter(x=>!isNaN(x.v));
    if(!toSave.length){ showToast('Nothing to save'); return; }
    btn.disabled = true;
    try{
      for(const item of toSave){ await TEI.wealthOS.saveAccountMonth(item.id, key, item.v); }
    } catch(err){
      console.error('Wealth OS: failed to save monthly balance', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
    const entry = client.months[key] ? Object.assign({}, client.months[key]) : {};
    client.monthsMeta = client.monthsMeta || {};
    const metaEntry = client.monthsMeta[key] ? Object.assign({}, client.monthsMeta[key]) : {};
    toSave.forEach(item=>{
      entry[item.id] = item.v;
      metaEntry[item.id] = false;
      const acc = client.accounts.find(a=>a.id===item.id);
      if(acc) TEI.calc.stampEdit(acc, 'adviser');
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
    renderAccounts();
    renderMonthHistory('accounts');
    showToast('Saved ' + key);
    // A logged balance can be exactly what completes a "monetary" goal
    // linked to this account -- same reasoning as addAccount's check.
    {
      const r = await TEI.calc.checkGoalAutoComplete(client);
      r.completed.forEach(g=> showToast(`🎉 "${g.name}" completed!`));
      r.reopened.forEach(g=> showToast(`"${g.name}" dropped back below target, reopened`));
    }
  }

  /* ---------- monthly holdings & goal progress, same pattern as accounts,
     extended per Paddy's request that everything be updatable monthly ---------- */
  function renderMonthlyHoldingFields(){
    const key = selectedMonth.holdings;
    document.getElementById(MONTH_WIDGET.holdings.picker).value = key;
    const wrap = document.getElementById('monthlyHoldingFields');
    if(!client.holdings.length){ wrap.innerHTML = `<div class="empty-state" style="padding:10px 0; grid-column:1/-1;"><div class="small">Add holdings first.</div></div>`; renderMonthHistory('holdings'); return; }
    const existing = client.holdingsMonths[key] || {};
    const meta = (client.holdingsMonthsMeta && client.holdingsMonthsMeta[key]) || {};
    const isCurrent = key === currentMonthKey();
    wrap.innerHTML = client.holdings.map(h=>{
      const fallback = existing[h.id]!=null ? existing[h.id] : (isCurrent && h.value!=null ? h.value : '');
      const autoNote = meta[h.id] ? `<span class="note" style="margin-top:2px; color:var(--gold);">Carried forward automatically, refresh live prices or confirm if it is changed</span>` : '';
      return `<label class="form-field"><span>${h.name}</span><input type="number" step="0.01" data-month-holding="${h.id}" value="${fallback}" placeholder="0.00">${autoNote}</label>`;
    }).join('');
    renderMonthHistory('holdings');
  }
  async function saveHoldingMonth(){
    const key = selectedMonth.holdings;
    const isCurrent = key === currentMonthKey();
    const btn = document.getElementById('saveHoldingMonthBtn');
    const toSave = Array.from(document.querySelectorAll('[data-month-holding]'))
      .map(el=>({id:el.dataset.monthHolding, v:parseFloat(el.value)}))
      .filter(x=>!isNaN(x.v));
    if(!toSave.length){ showToast('Nothing to save'); return; }
    btn.disabled = true;
    try{
      for(const item of toSave){ await TEI.wealthOS.saveHoldingMonth(item.id, key, item.v); }
    } catch(err){
      console.error('Wealth OS: failed to save monthly holding value', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
    // Manual-priced accounts: a changed figure for the current month is a
    // statement valuation -- it replaces holdings.value server-side and
    // stamps value_checked_at (the month log alone never touched
    // holdings.value).
    if(isCurrent){
      for(const item of toSave){
        const h = client.holdings.find(x=>x.id===item.id);
        const acc = h && client.accounts.find(a=>a.id===h.accountId);
        if(acc && acc.isManualPriced && Number(item.v) !== Number(h.value)) await recordValuationSafely(h, item.v, todayISO());
      }
    }
    const entry = client.holdingsMonths[key] ? Object.assign({}, client.holdingsMonths[key]) : {};
    client.holdingsMonthsMeta = client.holdingsMonthsMeta || {};
    const metaEntry = client.holdingsMonthsMeta[key] ? Object.assign({}, client.holdingsMonthsMeta[key]) : {};
    toSave.forEach(item=>{
      entry[item.id] = item.v;
      metaEntry[item.id] = false;
      const h = client.holdings.find(x=>x.id===item.id);
      if(h){
        // Only the current month should move the holding's live/displayed
        // value -- backfilling a past month must not overwrite today's
        // number with a historical one.
        if(isCurrent) h.value = item.v;
        TEI.calc.stampEdit(h, 'adviser');
      }
    });
    client.holdingsMonths[key] = entry;
    client.holdingsMonthsMeta[key] = metaEntry;
    renderHoldings();
    renderMonthHistory('holdings');
    showToast('Saved ' + key);
  }

  /* ================= WEALTH: ASSETS & LIABILITIES ================= */
  function renderAssets(){
    const list = document.getElementById('advAssetsList');
    list.innerHTML = client.wealth.assets.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">No assets yet.</div></div>`;
    client.wealth.assets.forEach(a=>{
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="lr-main"><b>${a.notes || a.type}</b> <span class="tag-pill">${a.type}</span><div class="lr-meta">${fmtGBP(a.value)}</div></div>
        <div style="display:flex; gap:8px; flex-none:1;">
          <button type="button" class="btn-ghost" data-edit-asset="${a.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
          <button type="button" class="btn-ghost" data-del-asset="${a.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
        </div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-del-asset]').forEach(btn=>{
      btn.addEventListener('click', async function(){
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
        if(editing.asset === id) cancelAssetEdit();
        renderAssets(); refreshAccountSelects();
      });
    });
    list.querySelectorAll('[data-edit-asset]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const a = client.wealth.assets.find(x=>x.id===this.dataset.editAsset); if(!a) return;
        editing.asset = a.id;
        document.getElementById('advNewAssetType').value = a.type;
        document.getElementById('advNewAssetValue').value = a.value;
        document.getElementById('advNewAssetNotes').value = a.notes||'';
        document.getElementById('advAddAssetBtn').textContent = 'Save changes';
        document.getElementById('advNewAssetValue').scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
  }
  function cancelAssetEdit(){
    editing.asset = null;
    document.getElementById('advAddAssetBtn').textContent = 'Add';
    ['advNewAssetValue','advNewAssetNotes'].forEach(id=>document.getElementById(id).value='');
  }
  async function addAsset(){
    const type = document.getElementById('advNewAssetType').value;
    const value = parseFloat(document.getElementById('advNewAssetValue').value);
    if(isNaN(value)){ showToast('Give the asset a value'); return; }
    const notes = document.getElementById('advNewAssetNotes').value.trim();
    const btn = document.getElementById('advAddAssetBtn');
    btn.disabled = true;
    if(editing.asset){
      const a = client.wealth.assets.find(x=>x.id===editing.asset);
      if(!a){ cancelAssetEdit(); btn.disabled = false; return; }
      const merged = Object.assign({}, a, {type, value, notes});
      TEI.calc.stampEdit(merged, 'adviser');
      try{
        await TEI.wealthOS.saveWealthAsset(client.meta.clientId, a.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save asset', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(a, merged);
      cancelAssetEdit();
      showToast('Asset updated');
    } else {
      const a = TEI.calc.stampEdit({id:uid(), type, value, notes}, 'adviser');
      try{
        a.id = await TEI.wealthOS.saveWealthAsset(client.meta.clientId, null, a);
      } catch(err){
        console.error('Wealth OS: failed to save asset', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.wealth.assets.push(a);
      ['advNewAssetValue','advNewAssetNotes'].forEach(id=>document.getElementById(id).value='');
      showToast('Asset added');
    }
    renderAssets(); refreshAccountSelects();
  }
  function renderLiabilities(){
    const list = document.getElementById('advLiabilitiesList');
    list.innerHTML = client.wealth.liabilities.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">No liabilities yet.</div></div>`;
    client.wealth.liabilities.forEach(l=>{
      const linked = client.wealth.assets.find(a=>a.id===l.linkedAssetId);
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="lr-main"><b>${l.type}</b><div class="lr-meta">${fmtGBP(l.balance)}${linked?' · linked to '+(linked.type==='property'?'Property':(linked.notes||linked.type)):''}</div></div>
        <div style="display:flex; gap:8px; flex-none:1;">
          <button type="button" class="btn-ghost" data-edit-liab="${l.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
          <button type="button" class="btn-ghost" data-del-liab="${l.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
        </div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-del-liab]').forEach(btn=>{
      btn.addEventListener('click', async function(){
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
        if(editing.liability === id) cancelLiabEdit();
        renderLiabilities();
      });
    });
    list.querySelectorAll('[data-edit-liab]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const l = client.wealth.liabilities.find(x=>x.id===this.dataset.editLiab); if(!l) return;
        editing.liability = l.id;
        document.getElementById('advNewLiabType').value = l.type;
        document.getElementById('advNewLiabBalance').value = l.balance;
        document.getElementById('advNewLiabLinkedAsset').value = l.linkedAssetId||'';
        document.getElementById('advAddLiabBtn').textContent = 'Save changes';
        document.getElementById('advNewLiabBalance').scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
  }
  function cancelLiabEdit(){
    editing.liability = null;
    document.getElementById('advAddLiabBtn').textContent = 'Add';
    document.getElementById('advNewLiabBalance').value = '';
  }
  async function addLiability(){
    const type = document.getElementById('advNewLiabType').value;
    const balance = parseFloat(document.getElementById('advNewLiabBalance').value);
    if(isNaN(balance)){ showToast('Give the liability a balance'); return; }
    const linkedAssetId = document.getElementById('advNewLiabLinkedAsset').value || null;
    const btn = document.getElementById('advAddLiabBtn');
    btn.disabled = true;
    if(editing.liability){
      const l = client.wealth.liabilities.find(x=>x.id===editing.liability);
      if(!l){ cancelLiabEdit(); btn.disabled = false; return; }
      const merged = Object.assign({}, l, {type, balance, linkedAssetId});
      TEI.calc.stampEdit(merged, 'adviser');
      try{
        await TEI.wealthOS.saveWealthLiability(client.meta.clientId, l.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save liability', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(l, merged);
      cancelLiabEdit();
      showToast('Liability updated');
    } else {
      const l = TEI.calc.stampEdit({id:uid(), type, balance, linkedAssetId}, 'adviser');
      try{
        l.id = await TEI.wealthOS.saveWealthLiability(client.meta.clientId, null, l);
      } catch(err){
        console.error('Wealth OS: failed to save liability', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.wealth.liabilities.push(l);
      document.getElementById('advNewLiabBalance').value = '';
      showToast('Liability added');
    }
    renderLiabilities();
  }

  /* ================= GOALS ================= */
  function renderGoals(){
    const list = document.getElementById('goalsList');
    list.className = 'entity-pill-grid';
    list.innerHTML = client.goals.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">No goals yet.</div></div>`;
    client.goals.forEach(g=>{
      const linkedNames = (g.linkedAccountIds||[]).map(id=>{ const a=client.accounts.find(x=>x.id===id); return a?TEI.data.acctLabel(a):null; }).filter(Boolean).join(', ');
      let targetText = '';
      if(g.progressType==='income') targetText = fmtGBP(g.targetIncome)+'/yr';
      else if(g.progressType==='completion') targetText = g.completed ? 'Complete' : 'Not yet';
      else targetText = fmtGBP(g.targetAmount);
      const row = document.createElement('div');
      row.className = 'entity-pill';
      row.innerHTML = `
        <div class="ep-top">
          <div class="ep-heading"><span class="ep-name">${g.name}</span></div>
          <span class="tag-pill">${g.status}</span>
        </div>
        <div class="ep-value">${targetText}</div>
        <div class="ep-meta">${TEI.data.goalTypeLabel(g.type)}${linkedNames?' · tracks '+linkedNames:''}${g.targetDate?' · by '+g.targetDate:''}</div>
        <div class="ep-actions">
          <button type="button" class="btn-ghost" data-edit-goal="${g.id}">Edit</button>
          <button type="button" class="btn-ghost" data-toggle-complete-goal="${g.id}">${g.status==='completed'?'Reopen':'Mark complete'}</button>
          <button type="button" class="btn-ghost" data-del-goal="${g.id}">Remove</button>
        </div>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-del-goal]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const id = this.dataset.delGoal;
        this.disabled = true;
        try{
          await TEI.wealthOS.deleteGoal(id);
        } catch(err){
          console.error('Wealth OS: failed to delete goal', err);
          showToast('That did not remove. ' + (err.message || 'Please try again.'));
          this.disabled = false;
          return;
        }
        client.goals = client.goals.filter(g=>g.id!==id);
        if(editing.goal === id) cancelGoalEdit();
        renderGoals();
      });
    });
    list.querySelectorAll('[data-toggle-complete-goal]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const g = client.goals.find(g=>g.id===this.dataset.toggleCompleteGoal);
        if(!g) return;
        const nextStatus = g.status==='completed' ? 'active' : 'completed';
        const nextHistory = (g.statusHistory||[]).concat([{date:new Date().toISOString(), status:nextStatus}]);
        const merged = Object.assign({}, g, {
          status: nextStatus,
          completed: g.progressType==='completion' ? nextStatus==='completed' : g.completed,
          statusHistory: nextHistory
        });
        TEI.calc.stampEdit(merged, 'adviser');
        this.disabled = true;
        try{
          await TEI.wealthOS.saveGoal(client.meta.clientId, g.id, merged);
        } catch(err){
          console.error('Wealth OS: failed to update goal status', err);
          showToast('That did not save. ' + (err.message || 'Please try again.'));
          this.disabled = false;
          return;
        }
        this.disabled = false;
        Object.assign(g, merged);
        renderGoals(); showToast(g.status==='completed' ? 'Goal marked complete' : 'Goal reopened');
      });
    });
    list.querySelectorAll('[data-edit-goal]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const g = client.goals.find(x=>x.id===this.dataset.editGoal); if(!g) return;
        editing.goal = g.id;
        document.getElementById('newGoalType').value = g.type;
        document.getElementById('newGoalName').value = g.name;
        document.getElementById('newGoalDate').value = (g.targetDate||'').slice(0,7);
        document.getElementById('newGoalProgressType').value = g.progressType;
        toggleAdvGoalProgressFields();
        document.getElementById('newGoalTargetAmount').value = g.targetAmount||'';
        document.getElementById('newGoalTargetIncome').value = g.targetIncome||'';
        document.getElementById('newGoalStatus').value = g.status;
        refreshAccountSelects();
        const wrap = document.getElementById('newGoalLinkedAccounts');
        wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked = (g.linkedAccountIds||[]).includes(cb.value); });
        refreshAdvGoalLinkedIncomeOptions();
        document.getElementById('newGoalLinkedIncome').value = g.linkedIncomeId || '';
        document.getElementById('addGoalBtn').textContent = 'Save changes';
        document.getElementById('newGoalName').scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
  }
  function cancelGoalEdit(){
    editing.goal = null;
    document.getElementById('addGoalBtn').textContent = 'Add goal';
    ['newGoalName','newGoalDate','newGoalTargetAmount','newGoalTargetIncome'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('newGoalLinkedIncome').value = '';
  }
  function toggleAdvGoalProgressFields(){
    const pt = document.getElementById('newGoalProgressType').value;
    document.getElementById('advGoalTargetAmountField').style.display = pt==='monetary' ? 'flex' : 'none';
    document.getElementById('advGoalTargetIncomeField').style.display = pt==='income' ? 'flex' : 'none';
    document.getElementById('advGoalLinkedIncomeField').style.display = pt==='income' ? 'flex' : 'none';
    document.getElementById('advGoalLinkedAccountsField').style.display = pt==='monetary' ? 'flex' : 'none';
    if(pt==='income') refreshAdvGoalLinkedIncomeOptions();
  }
  /* Single-income link for 'income' progress-type goals. A "Build a
     Business" goal only offers Self-Employed/Business Venture Income
     entries -- no "whole household" fallback, since tracking a business
     goal against total household income defeats the point. Any other goal
     category keeps the original "pick any income source, or leave it on
     the household total" choice. */
  function refreshAdvGoalLinkedIncomeOptions(){
    const sel = document.getElementById('newGoalLinkedIncome');
    if(!sel) return;
    const selected = sel.value;
    const goalType = document.getElementById('newGoalType').value;
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
  async function addGoal(){
    const type = document.getElementById('newGoalType').value;
    const name = document.getElementById('newGoalName').value.trim();
    if(!name){ showToast('Give the goal a name'); return; }
    const targetDate = TEI.data.monthInputToDate(document.getElementById('newGoalDate').value);
    const progressType = document.getElementById('newGoalProgressType').value;
    const targetAmount = parseFloat(document.getElementById('newGoalTargetAmount').value) || null;
    const targetIncome = parseFloat(document.getElementById('newGoalTargetIncome').value) || null;
    const linkedAccountIds = Array.from(document.getElementById('newGoalLinkedAccounts').querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value);
    const linkedIncomeId = document.getElementById('newGoalLinkedIncome').value || null;
    const status = document.getElementById('newGoalStatus').value;
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
    const btn = document.getElementById('addGoalBtn');
    btn.disabled = true;
    let g;
    if(editing.goal){
      g = client.goals.find(x=>x.id===editing.goal);
      if(!g){ cancelGoalEdit(); btn.disabled = false; return; }
      const merged = Object.assign({}, g, {type, name, targetDate, progressType, targetAmount, targetIncome, linkedAccountIds, linkedIncomeId, status, completed: progressType==='completion' ? status==='completed' : g.completed});
      TEI.calc.stampEdit(merged, 'adviser');
      try{
        await TEI.wealthOS.saveGoal(client.meta.clientId, g.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save goal', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(g, merged);
      cancelGoalEdit();
      showToast('Goal updated');
    } else {
      g = TEI.calc.stampEdit({id:uid(), type, name, targetDate, progressType, targetAmount, targetIncome, completed:status==='completed', status, linkedAccountIds, linkedIncomeId, statusHistory:[]}, 'adviser');
      try{
        g.id = await TEI.wealthOS.saveGoal(client.meta.clientId, null, g);
      } catch(err){
        console.error('Wealth OS: failed to save goal', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.goals.push(g);
      ['newGoalName','newGoalDate','newGoalTargetAmount','newGoalTargetIncome'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('newGoalLinkedIncome').value = '';
      showToast('Goal added');
    }
    renderGoals();
  }

  /* ================= HOLDINGS ================= */
  /* Live price row -- h.lastPrice is the raw per-share figure Twelve Data
     returned at the last refresh (native currency, USD for every ticker
     this app prices), separate from h.value (the position's total, in
     GBP). Was previously discarded right after being used to compute
     value; now persisted (see applyLivePriceToHolding, wealth_os_phase21)
     specifically so a card can show what a share is actually worth, not
     just the position total. Only ever set for ticker'd holdings that
     have actually been refreshed at least once -- a brand new ticker'd
     holding, or one added before this existed, shows nothing here until
     its next refresh. */
  function holdingPriceRowHtml(h){
    if(h.lastPrice == null) return '';
    const asOf = h.lastPricedAt ? new Date(h.lastPricedAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
    // Supabase can return a numeric column as a string -- Number() first
    // since .toFixed() (unlike fmtGBP, which already does this) would
    // throw on one instead of just formatting it.
    return `<div class="ep-price"><span class="ep-price-dot"></span>$${Number(h.lastPrice).toFixed(2)}${asOf?` <span class="ep-price-as-of">as of ${asOf}</span>`:''}</div>`;
  }
  function holdingPillHtml(h){
    // Crypto is manual-valuation only (no price API) -- never offer the
    // live-price refresh affordance for a holding under a crypto account,
    // even if it happens to have a ticker + units set.
    const acctForHolding = client.accounts.find(a=>a.id===h.accountId);
    // Adviser only -- this list is also shown to clients on My Details, and
    // clients never trigger Twelve Data calls themselves.
    const canLivePrice = ((client.meta && client.meta.role) || 'adviser') === 'adviser' && h.ticker && h.units!=null && (!acctForHolding || (acctForHolding.type!=='crypto' && !acctForHolding.isManualPriced));
    return `
      <div class="entity-pill">
        <div class="ep-top">
          <div class="ep-heading">
            <span class="ep-name">${h.name}</span>
            ${h.ticker?`<span class="ep-ticker">${h.ticker}</span>`:''}
          </div>
          ${canLivePrice ? `<button type="button" class="ep-icon-btn" data-refresh-holding="${h.id}" title="Refresh live price" aria-label="Refresh live price">⟳</button>` : ''}
        </div>
        ${holdingPriceRowHtml(h)}
        <div class="ep-value">${fmtGBP(h.value)}</div>
        <div class="ep-meta">${h.units!=null?h.units+' units'+(h.priceSource==='auto_us'?' (auto-priced, US)':''):''}${h.sector?' · '+h.sector:''}${h.costBasis?' · cost '+fmtGBP(h.costBasis):''}</div>
        ${acctForHolding && acctForHolding.isManualPriced ? holdingCheckedHtml(h) : ''}
        ${(h.theme&&h.theme.length)?`<div class="ep-tags">${h.theme.map(t=>`<span class="tag-pill" style="opacity:0.85;">${t}</span>`).join('')}</div>`:''}
        <div class="ep-actions">
          <button type="button" class="btn-ghost" data-edit-holding="${h.id}">Edit</button>
          <button type="button" class="btn-ghost" data-del-holding="${h.id}">Remove</button>
        </div>
      </div>`;
  }
  /* Grouped by account, collapsed by default -- a flat grid of every
     holding across every account (the original layout) read as too
     dense once there were more than a handful, reported live against a
     screenshot. Each group's own header carries the holding count and
     account subtotal so that is visible without opening anything; the
     account's own name/provider/type already live on its Accounts card,
     so is not repeated per-holding inside here any more. */
  function renderHoldings(){
    const list = document.getElementById('holdingsList');
    list.className = 'holdings-groups';
    if(!client.holdings.length){
      list.innerHTML = `<div class="empty-state" style="padding:14px 0;"><div class="small">No holdings yet.</div></div>`;
    } else {
      const byAccount = {};
      client.holdings.forEach(h=>{ const key = h.accountId || '_unknown'; (byAccount[key] = byAccount[key] || []).push(h); });
      const groupKeys = Object.keys(byAccount).sort((a,b)=>{
        const an = a==='_unknown' ? 'Unknown account' : TEI.data.acctLabel(client.accounts.find(x=>x.id===a) || {});
        const bn = b==='_unknown' ? 'Unknown account' : TEI.data.acctLabel(client.accounts.find(x=>x.id===b) || {});
        return an.localeCompare(bn);
      });
      list.innerHTML = groupKeys.map(key=>{
        const holdings = byAccount[key];
        const acct = key==='_unknown' ? null : client.accounts.find(x=>x.id===key);
        const name = acct ? TEI.data.acctLabel(acct) : 'Unknown account';
        const total = holdings.reduce((s,h)=>s+(Number(h.value)||0), 0);
        const open = !!holdingsGroupExpanded[key];
        return `<div class="holdings-group${open?' open':''}" data-holdings-group="${key}">
          <div class="hg-head">
            <div><div class="hg-name">${name}</div><div class="hg-meta">${holdings.length} holding${holdings.length===1?'':'s'} · ${fmtGBP(total)}</div></div>
            <span class="hg-chev">▸</span>
          </div>
          <div class="hg-body"><div class="entity-pill-grid">${holdings.map(holdingPillHtml).join('')}</div></div>
        </div>`;
      }).join('');
      list.querySelectorAll('[data-holdings-group]').forEach(group=>{
        group.querySelector('.hg-head').addEventListener('click', ()=>{
          const key = group.dataset.holdingsGroup;
          holdingsGroupExpanded[key] = !holdingsGroupExpanded[key];
          group.classList.toggle('open', holdingsGroupExpanded[key]);
        });
      });
    }
    list.querySelectorAll('[data-refresh-holding]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const h = client.holdings.find(x=>x.id===this.dataset.refreshHolding); if(!h) return;
        refreshOneHolding(h, this);
      });
    });
    list.querySelectorAll('[data-del-holding]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const id = this.dataset.delHolding;
        this.disabled = true;
        try{
          await TEI.wealthOS.deleteHolding(id);
        } catch(err){
          console.error('Wealth OS: failed to delete holding', err);
          // FK from contribution_rule_allocations (any rule version, kept for history)
          showToast(err && err.code === '23503'
            ? "Could not remove, this fund is part of a recurring contribution rule (current or past version)"
            : 'That did not remove. ' + (err.message || 'Please try again.'));
          this.disabled = false;
          return;
        }
        const removed = client.holdings.find(h=>h.id===id);
        client.holdings = client.holdings.filter(h=>h.id!==id);
        if(removed){
          TEI.calc.syncAccountValueFromHoldings(client, removed.accountId);
          await persistCryptoLastUpdated(removed.accountId);
        }
        if(editing.holding === id) cancelHoldingEdit();
        renderHoldings(); renderMonthlyHoldingFields(); renderMonthlyBalanceFields(); renderAccounts();
      });
    });
    list.querySelectorAll('[data-edit-holding]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const h = client.holdings.find(x=>x.id===this.dataset.editHolding); if(!h) return;
        editing.holding = h.id;
        document.getElementById('newHoldingAccount').value = h.accountId;
        document.getElementById('newHoldingName').value = h.name;
        document.getElementById('newHoldingTicker').value = h.ticker||'';
        document.getElementById('newHoldingUnits').value = h.units!=null ? h.units : '';
        // Legacy-data backfill, ticker-gated: a tickerless holding's cost
        // basis was never currency-converted, so reverse-deriving avgOpen
        // from it is always safe. A ticker'd holding's costBasis is GBP
        // (already converted by a past refresh, or about to be) while
        // avgOpen is USD-native -- backfilling one into the other would get
        // silently re-multiplied by the FX rate on the next refresh.
        const backfillAvgOpen = (!h.ticker && h.avgOpen==null && h.costBasis!=null && h.units)
          ? h.costBasis / h.units : null;
        document.getElementById('newHoldingAvgOpen').value = h.avgOpen!=null ? h.avgOpen : (backfillAvgOpen!=null ? backfillAvgOpen : '');
        document.getElementById('newHoldingValue').value = h.value;
        document.getElementById('newHoldingCostBasis').value = h.costBasis||'';
        // Legacy sector values (e.g. old "Technology"/"Consumer" buckets)
        // may no longer match a current <option> now that the list has
        // been narrowed/renamed -- setting .value to an unmatched string
        // silently resolves to "", which would blank the sector on the
        // next save if the adviser does not touch this field. Inject it as
        // an extra option so it round-trips unchanged until deliberately
        // changed.
        const sectorSel = document.getElementById('newHoldingSector');
        if(h.sector && ![...sectorSel.options].some(o=>o.value===h.sector)){
          sectorSel.add(new Option(h.sector, h.sector));
        }
        sectorSel.value = h.sector||'';
        document.getElementById('newHoldingAssetClass').value = h.assetClass || '';
        document.getElementById('newHoldingTheme').value = (h.theme && h.theme.length) ? h.theme.join(', ') : '';
        document.getElementById('newHoldingPriceSource').value = h.priceSource === 'auto_us' ? 'auto_us' : 'manual';
        document.getElementById('addHoldingBtn').textContent = 'Save changes';
        document.getElementById('newHoldingAsAt').value = todayISO();
        updateHoldingFormForTicker();
        updateHoldingFormForManualPriced();
        document.getElementById('newHoldingName').scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
  }
  function cancelHoldingEdit(){
    editing.holding = null;
    document.getElementById('addHoldingBtn').textContent = 'Add holding';
    ['newHoldingName','newHoldingTicker','newHoldingUnits','newHoldingAvgOpen','newHoldingValue','newHoldingCostBasis'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('newHoldingSector').value = '';
    document.getElementById('newHoldingAssetClass').value = '';
    document.getElementById('newHoldingTheme').value = '';
    document.getElementById('newHoldingPriceSource').value = 'manual';
    document.getElementById('newHoldingAsAt').value = todayISO();
    updateHoldingFormForTicker();
    updateHoldingFormForManualPriced();
  }
  /* Manual-priced accounts (005_pension_contribution_engine): the value
     typed here is a statement figure "as at" a date -- it replaces the
     holding's value (via record_holding_valuation, which also stamps
     value_checked_at) rather than being added to it, and the holding can
     only be manually priced. */
  function updateHoldingFormForManualPriced(){
    const acc = client.accounts.find(a=>a.id===document.getElementById('newHoldingAccount').value);
    const manual = !!(acc && acc.isManualPriced);
    document.getElementById('newHoldingAsAtField').hidden = !manual;
    document.getElementById('newHoldingValueHelp').hidden = !manual;
    const asAt = document.getElementById('newHoldingAsAt');
    if(manual && !asAt.value) asAt.value = todayISO();
    asAt.max = todayISO();
    const ps = document.getElementById('newHoldingPriceSource');
    if(manual) ps.value = 'manual';
    ps.disabled = manual;
    ps.title = manual ? 'This account is manual-priced' : '';
  }
  // Statement valuation for a manual-priced holding. Mutates h on success;
  // on failure the rest of the save has already gone through, so say so.
  async function recordValuationSafely(h, value, asAt){
    try{
      const res = await TEI.wealthOS.contributionRules.recordHoldingValuation(h.id, value, asAt || todayISO());
      h.value = Number(res.value);
      h.valueCheckedAt = res.value_checked_at;
      if(Number(res.contributions_since) > 0){
        showToast(`Statement value recorded, plus ${fmtGBP2(res.contributions_since)} of contributions applied after ${fmtDateShort(asAt)}`);
      }
      return true;
    } catch(err){
      console.error('Wealth OS: failed to record statement valuation', err);
      showToast("Saved, but the statement value was not recorded, " + (err.message || 'try again'));
      return false;
    }
  }
  function todayISO(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  /* Ticker-gated form chrome: a ticker'd holding's cost basis is always
     derived (see addHolding's costBasis logic below and refreshOneHolding's
     conversion), so the manual input only makes sense -- and is only shown
     -- for holdings with no ticker. Avg Open's label/placeholder flips
     between £ and $ for the same reason (native-currency convention, see
     api/prices.js). Called on every ticker-field keystroke and whenever the
     form is populated/reset programmatically. */
  function updateHoldingFormForTicker(){
    const ticker = document.getElementById('newHoldingTicker').value.trim();
    const label = document.getElementById('newHoldingAvgOpenLabel');
    const avgOpenInput = document.getElementById('newHoldingAvgOpen');
    const costField = document.getElementById('newHoldingCostBasisField');
    if(ticker){
      label.textContent = 'Avg open price $ (optional, native currency, converted to £ automatically)';
      avgOpenInput.placeholder = 'e.g. 250 (USD)';
      costField.style.display = 'none';
    } else {
      label.textContent = 'Avg open price £ (optional)';
      avgOpenInput.placeholder = '0';
      costField.style.display = '';
    }
    // Auto-fill sector/theme from the ticker lookup, but only into blank
    // fields -- never clobber a manual override the adviser already typed
    // (this also covers the edit-populate case, since that call happens
    // after the real stored sector/theme are already set into the form).
    const info = TEI.data.lookupTickerInfo(ticker);
    const sectorField = document.getElementById('newHoldingSector');
    const themeField = document.getElementById('newHoldingTheme');
    if(sectorField.value.trim()==='' && info.sector) sectorField.value = info.sector;
    if(themeField.value.trim()==='' && info.theme.length) themeField.value = info.theme.join(', ');
  }
  /* Crypto accounts have no live price feed, so an account's own "last
     updated" (accounts.last_updated) only ever moves when a holding under
     it is added, edited or removed -- stamped in-memory by
     TEI.calc.stampCryptoAccountUpdated, then explicitly persisted here
     since the holdings save path otherwise never re-saves the account row
     (unlike a manual account-level edit, which already goes through
     saveAccount). No-op for any other account type. */
  async function persistCryptoLastUpdated(accountId){
    const acc = TEI.calc.stampCryptoAccountUpdated(client, accountId);
    if(!acc) return;
    try{
      await TEI.wealthOS.saveAccount(client.meta.clientId, acc.id, acc);
    } catch(err){
      console.error('Wealth OS: failed to stamp crypto account last-updated', err);
    }
  }
  async function addHolding(){
    const accountId = document.getElementById('newHoldingAccount').value;
    const name = document.getElementById('newHoldingName').value.trim();
    const ticker = document.getElementById('newHoldingTicker').value.trim().toUpperCase() || null;
    const unitsInput = document.getElementById('newHoldingUnits').value;
    const units = unitsInput ? parseFloat(unitsInput) : null;
    const avgOpenInput = document.getElementById('newHoldingAvgOpen').value;
    const avgOpen = avgOpenInput ? parseFloat(avgOpenInput) : null;
    const valueInput = document.getElementById('newHoldingValue').value;
    let value = valueInput ? parseFloat(valueInput) : null;
    // Value can be typed directly, derived from units*avg-open (same
    // fallback CSV import already uses), or -- for a ticker+units holding
    // meant to be live-priced -- left at 0 until "Refresh live prices" fills
    // it in. Only reject the save if none of those give us a number.
    if(value==null && units!=null && avgOpen!=null) value = units*avgOpen;
    if(value==null && ticker && units!=null) value = 0;
    if(!accountId){ showToast('Add an account first'); return; }
    if(!name || value==null || isNaN(value)){ showToast('Give the holding a name, and either a value, units + avg open, or a ticker + units to live-price'); return; }
    // Cost basis: for a ticker'd holding this form never sets it -- it is
    // always derived from avgOpen*units*usdGbpRate by refreshLivePrices()/
    // refreshOneHolding() instead, and the input is hidden (see
    // updateHoldingFormForTicker). For a tickerless holding, a typed value
    // wins; otherwise fall back to avgOpen*units (same immediacy as the
    // value fallback above, no FX involved since it is already GBP-native).
    const costBasisInput = document.getElementById('newHoldingCostBasis').value;
    const manualCostBasis = costBasisInput ? parseFloat(costBasisInput) : null;
    const sector = document.getElementById('newHoldingSector').value || null;
    const assetClass = document.getElementById('newHoldingAssetClass').value || null;
    const theme = parseThemeInput(document.getElementById('newHoldingTheme').value);
    // Auto (US) only means anything with a ticker + units outside a crypto
    // account (the scheduled job ignores anything else) -- store 'manual'
    // rather than a flag that silently never prices.
    const targetAcct = client.accounts.find(a=>a.id===accountId) || {};
    const acctType = targetAcct.type;
    const manualPriced = !!targetAcct.isManualPriced;
    const asAt = document.getElementById('newHoldingAsAt').value || todayISO();
    if(manualPriced && asAt > todayISO()){ showToast('The "as at" date cannot be in the future'); return; }
    const priceSource = !manualPriced && document.getElementById('newHoldingPriceSource').value === 'auto_us'
      && ticker && units!=null && acctType !== 'crypto' ? 'auto_us' : 'manual';
    if(document.getElementById('newHoldingPriceSource').value === 'auto_us' && priceSource !== 'auto_us'){
      showToast('Auto (US) needs a ticker and units, and not a crypto account, saved as Manual');
    }
    const btn = document.getElementById('addHoldingBtn');
    btn.disabled = true;
    if(editing.holding){
      const h = client.holdings.find(x=>x.id===editing.holding);
      if(!h){ cancelHoldingEdit(); btn.disabled = false; return; }
      const oldAccountId = h.accountId;
      const costBasis = ticker ? h.costBasis
        : (manualCostBasis!=null ? manualCostBasis : (avgOpen!=null && units!=null ? avgOpen*units : null));
      // Manual-priced: a changed value is a statement valuation -- the row
      // save keeps the current value and record_holding_valuation then
      // replaces it (never adds), stamping value_checked_at.
      const isValuation = manualPriced && accountId === h.accountId && Number(value) !== Number(h.value);
      const merged = Object.assign({}, h, {accountId, name, ticker, units, avgOpen, value: isValuation ? h.value : value, costBasis, sector, assetClass, theme, priceSource});
      TEI.calc.stampEdit(merged, 'adviser');
      try{
        await TEI.wealthOS.saveHolding(accountId, h.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save holding', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(h, merged);
      if(isValuation) await recordValuationSafely(h, value, asAt);
      TEI.calc.seedMonthlyValue(client.holdingsMonths, currentMonthKey(), h.id, h.value);
      TEI.calc.syncAccountValueFromHoldings(client, oldAccountId);
      if(accountId !== oldAccountId) TEI.calc.syncAccountValueFromHoldings(client, accountId);
      await persistCryptoLastUpdated(oldAccountId);
      if(accountId !== oldAccountId) await persistCryptoLastUpdated(accountId);
      cancelHoldingEdit();
      showToast('Holding updated');
    } else {
      const costBasis = ticker ? null
        : (manualCostBasis!=null ? manualCostBasis : (avgOpen!=null && units!=null ? avgOpen*units : null));
      const h = TEI.calc.stampEdit({id:uid(), accountId, name, ticker, units, avgOpen, costBasis, sector, assetClass, theme, value, priceSource}, 'adviser');
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
      // A new fund in a manual-priced account starts from a statement value.
      if(manualPriced && valueInput) await recordValuationSafely(h, value, asAt);
      TEI.calc.seedMonthlyValue(client.holdingsMonths, currentMonthKey(), h.id, h.value);
      TEI.calc.syncAccountValueFromHoldings(client, accountId);
      await persistCryptoLastUpdated(accountId);
      ['newHoldingName','newHoldingTicker','newHoldingUnits','newHoldingAvgOpen','newHoldingValue','newHoldingCostBasis'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('newHoldingSector').value = '';
      document.getElementById('newHoldingAssetClass').value = '';
      document.getElementById('newHoldingTheme').value = '';
      document.getElementById('newHoldingPriceSource').value = 'manual';
      updateHoldingFormForTicker();
      showToast(ticker && units!=null && !valueInput ? 'Holding added, use its ⟳ button to price it now' : 'Holding added');
    }
    holdingsGroupExpanded[accountId] = true; // so the account you just added/edited a holding in does not collapse the moment it re-renders
    renderHoldings(); renderMonthlyHoldingFields(); renderMonthlyBalanceFields(); renderAccounts();
  }

  function sleep(ms){ return new Promise(resolve=>setTimeout(resolve, ms)); }

  /* Shared by the batch refresh and the per-row "Refresh price" button, so
     the two paths can never drift (e.g. one gaining a cost-basis conversion
     the other forgets). value = price * usdGbpRate * units, always;
     costBasis is only touched when avgOpen is set (native-currency avg
     open, same rate, same units) -- a ticker'd holding with no avgOpen yet
     just keeps whatever costBasis it already had (null for a brand new
     one). lastPricedAt is stamped for the "skip recently refreshed" batch
     option. Isolated try/catch per holding -- a single bad write here must
     not strand the rest of a multi-holding batch mid-refresh. Returns
     {ok:true} or {ok:false, error} rather than throwing. */
  async function applyLivePriceToHolding(h, price, usdGbpRate){
    try{
      const value = price * usdGbpRate * h.units;
      const patch = { value, lastPrice: price, lastPricedAt: new Date().toISOString() };
      if(h.avgOpen != null) patch.costBasis = h.avgOpen * usdGbpRate * h.units;
      const merged = Object.assign({}, h, patch);
      // Role-derived rather than hardcoded 'adviser' -- clients could once
      // trigger this from Wealth/Portfolio (since replaced by the scheduled
      // refresh-us-prices job); kept as the safe default.
      TEI.calc.stampEdit(merged, (client.meta && client.meta.role) || 'adviser');
      await TEI.wealthOS.saveHolding(h.accountId, h.id, merged);
      Object.assign(h, merged);
      TEI.calc.seedMonthlyValue(client.holdingsMonths, currentMonthKey(), h.id, value);
      return {ok:true};
    } catch(err){
      console.error('Wealth OS: failed to apply live price to holding', h.ticker, err);
      return {ok:false, error: err.message || 'save failed'};
    }
  }

  const RECENTLY_PRICED_WINDOW_MS = 60*60*1000; // 1 hour -- see "skip holdings priced in the last hour" checkbox
  function pricedRecently(h){
    return h.lastPricedAt && (Date.now() - new Date(h.lastPricedAt).getTime()) < RECENTLY_PRICED_WINDOW_MS;
  }

  /* Live prices: value = price * units for every holding that has both a
     ticker and a unit count -- overwrites the manual "Value £" entry rather
     than just suggesting it (decided 2026-08 off pilot feedback that manual
     entry was the hassle). Holdings with no ticker, or a ticker but no
     units, are left alone -- there is nothing to multiply.

     Twelve Data's free tier charges 1 credit per symbol per request (plus 1
     for the exchange-rate call) against an 8/minute cap -- a portfolio with
     more than a handful of live-priced holdings can exceed that in a single
     click regardless of how often you refresh, since the whole batch is
     costed at once. Chunk unique tickers into groups of <=7 (leaving
     headroom for the FX credit) and pace a request per chunk a little over
     a minute apart -- fine for the "refresh a couple of times a day" use
     case this is actually needed for, just slower for a big portfolio. The
     "skip recently priced" checkbox and the per-row refresh button (see
     refreshOneHolding) exist specifically to avoid needing this at all
     while tagging one new ticker at a time during setup.

     Exposed on TEI.adviser (below); opts.btn/status/skipRecent let a
     caller point it at its own elements (the client Wealth/Portfolio
     buttons that used to do this are gone -- US holdings now reprice on a
     schedule via the refresh-us-prices Edge Function). Called with no
     args (the original wiring, `addEventListener('click', refreshLivePrices)`)
     opts is the raw click Event, whose irrelevant fields all fall through to
     the Adviser Workspace defaults below exactly as before. */
  async function refreshLivePrices(opts){
    opts = opts && typeof opts === 'object' ? opts : {};
    const btn = opts.btn || document.getElementById('refreshLivePricesBtn');
    const status = opts.status || document.getElementById('livePricesStatus');
    const skipRecent = opts.skipRecent != null ? opts.skipRecent : !!document.getElementById('skipRecentlyPricedCheckbox')?.checked;
    // Crypto holdings are manual-valuation only (no price API) -- excluded
    // from the batch sweep even if a ticker+units happen to be set, same
    // guard as the per-holding refresh button (see holdingPillHtml).
    // Auto (US) holdings only -- the same set the weekday schedule prices,
    // so this is a "run it now" fallback. Manual holdings with a ticker
    // (e.g. a UK listing Twelve Data would mis-price as USD) are left alone;
    // the per-holding ⟳ button still prices any one of them on demand.
    let priceable = client.holdings.filter(h=>{
      if(h.priceSource !== 'auto_us') return false;
      if(!(h.ticker && h.units!=null)) return false;
      const acct = client.accounts.find(a=>a.id===h.accountId);
      return !acct || acct.type!=='crypto';
    });
    if(skipRecent) priceable = priceable.filter(h=>!pricedRecently(h));
    if(!priceable.length){
      status.textContent = skipRecent
        ? 'Nothing to refresh -- every Auto (US) holding was priced in the last hour.'
        : 'No Auto (US) holdings with a ticker and units yet.';
      return;
    }
    const CHUNK_SIZE = 7;
    const WAIT_MS = 65000; // a little over a minute, so Twelve Data's per-minute window has genuinely rolled over
    const uniqueTickers = [...new Set(priceable.map(h=>h.ticker.toUpperCase()))];
    const chunks = [];
    for(let i=0;i<uniqueTickers.length;i+=CHUNK_SIZE) chunks.push(uniqueTickers.slice(i,i+CHUNK_SIZE));

    btn.disabled = true;
    const prices = {}, errors = {};
    let usdGbpRate = null;
    try{
      for(let i=0;i<chunks.length;i++){
        if(i>0){
          status.textContent = `Pacing around Twelve Data's rate limit, waiting before batch ${i+1} of ${chunks.length}…`;
          await sleep(WAIT_MS);
        }
        status.textContent = chunks.length>1 ? `Fetching live prices (batch ${i+1} of ${chunks.length})…` : 'Fetching live prices…';
        const res = await TEI.wealthOS.fetchLivePrices(chunks[i]);
        Object.assign(prices, res.prices||{});
        Object.assign(errors, res.errors||{});
        if(res.usdGbpRate != null) usdGbpRate = res.usdGbpRate;
      }
      // Twelve Data prices come back in USD (it does not cover LSE-listed
      // tickers at all, so every ticker priced here is assumed US-listed --
      // see api/prices.js). Refuse to convert if the FX rate itself failed
      // to come back, rather than silently storing a dollar figure as GBP.
      if(usdGbpRate == null){
        status.textContent = "Could not fetch the USD/GBP exchange rate, try again.";
        showToast("Could not refresh prices");
        return;
      }
      const touchedAccounts = new Set();
      let updated = 0;
      const failedHoldings = [];
      for(const h of priceable){
        const price = prices[h.ticker.toUpperCase()];
        if(price == null) continue;
        const res = await applyLivePriceToHolding(h, price, usdGbpRate);
        if(res.ok){ touchedAccounts.add(h.accountId); updated++; }
        else failedHoldings.push(h.ticker);
      }
      touchedAccounts.forEach(accId=>TEI.calc.syncAccountValueFromHoldings(client, accId));
      const failed = [...new Set([...Object.keys(errors), ...failedHoldings])];
      status.textContent = `Updated ${updated} of ${priceable.length} priced holding${priceable.length===1?'':'s'}` +
        ` (1 USD = £${usdGbpRate.toFixed(4)})` +
        (failed.length ? `, could not price ${failed.join(', ')}` : '') +
        ` · ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
      renderHoldings(); renderMonthlyHoldingFields(); renderMonthlyBalanceFields(); renderAccounts();
      // Portfolio Overview (poTotal/acctPillGrid) and Wealth's net worth
      // figure both live on pages other than wherever this refresh was
      // triggered from -- their DOM stays in the document (just class-
      // hidden) so it is safe, and necessary, to re-render both here too.
      // Without this the pills/net-worth kept showing whatever manual
      // figure was on screen the last time that page itself was rendered,
      // until someone happened to navigate away and back.
      if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
      if(typeof TEI.render.progress === 'function') TEI.render.progress(client);
      showToast(updated ? `Refreshed ${updated} live price${updated===1?'':'s'}` : "Could not refresh prices");
      // Market growth alone can complete a "monetary" goal linked to one of
      // the accounts just repriced -- same reasoning as addAccount's check.
      {
        const r = await TEI.calc.checkGoalAutoComplete(client);
        r.completed.forEach(g=> showToast(`🎉 "${g.name}" completed!`));
        r.reopened.forEach(g=> showToast(`"${g.name}" dropped back below target, reopened`));
      }
    } catch(err){
      console.error('Wealth OS: failed to refresh live prices', err);
      status.textContent = "Could not fetch live prices, " + (err.message || 'try again');
    } finally {
      btn.disabled = false;
    }
  }

  /* C-i: refresh a single holding's price without re-batching the whole
     portfolio -- 2 Twelve Data credits (1 price + 1 FX), no chunking/pacing
     needed. Exists specifically for tagging one new ticker at a time during
     setup, where the big batch button would otherwise re-fetch everything
     already fresh just to check the one new holding. */
  async function refreshOneHolding(h, btnEl){
    const status = document.getElementById('livePricesStatus');
    if(btnEl) btnEl.disabled = true;
    status.textContent = `Fetching live price for ${h.ticker}…`;
    try{
      const { prices, errors, usdGbpRate } = await TEI.wealthOS.fetchLivePrices([h.ticker]);
      if(usdGbpRate == null){
        status.textContent = "Could not fetch the USD/GBP exchange rate, try again.";
        showToast("Could not refresh price");
        return;
      }
      const price = prices[h.ticker.toUpperCase()];
      if(price == null){
        status.textContent = `Could not price ${h.ticker}` + (errors[h.ticker.toUpperCase()] ? `, ${errors[h.ticker.toUpperCase()]}` : '');
        showToast("Could not refresh price");
        return;
      }
      const res = await applyLivePriceToHolding(h, price, usdGbpRate);
      if(!res.ok){
        status.textContent = `Could not save ${h.ticker}'s refreshed price, ${res.error}`;
        showToast("Could not refresh price");
        return;
      }
      TEI.calc.syncAccountValueFromHoldings(client, h.accountId);
      status.textContent = `Refreshed ${h.ticker} (1 USD = £${usdGbpRate.toFixed(4)}) · ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
      renderHoldings(); renderMonthlyHoldingFields(); renderMonthlyBalanceFields(); renderAccounts();
      // See the matching comment in refreshLivePrices -- keep Portfolio
      // Overview's account cards in step immediately, not just on next visit.
      if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
      showToast(`Refreshed ${h.ticker}`);
    } catch(err){
      console.error('Wealth OS: failed to refresh one holding', h.ticker, err);
      status.textContent = "Could not fetch live price, " + (err.message || 'try again');
    } finally {
      if(btnEl) btnEl.disabled = false;
    }
  }

  /* ================= DIVIDEND HISTORY ================= */
  function renderDividendHistory(){
    const list = document.getElementById('dividendHistoryList');
    const sorted = [...client.dividendHistory].sort((a,b)=> b.year-a.year);
    list.innerHTML = sorted.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">No dividend history logged yet.</div></div>`;
    sorted.forEach(y=>{
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div class="lr-main"><b>${y.year}</b><div class="lr-meta">${fmtGBP(y.amount)}</div></div>
        <div style="display:flex; gap:8px; flex-none:1;">
          <button type="button" class="btn-ghost" data-edit-div-hist="${y.year}" style="padding:5px 12px; font-size:11px;">Edit</button>
          <button type="button" class="btn-ghost" data-del-div-hist="${y.year}" style="padding:5px 12px; font-size:11px;">Remove</button>
        </div>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-del-div-hist]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const yearStr = this.dataset.delDivHist;
        const nextHistory = client.dividendHistory.filter(y=>String(y.year)!==yearStr);
        this.disabled = true;
        try{
          await TEI.wealthOS.saveDividendHistory(client.meta.clientId, nextHistory);
        } catch(err){
          console.error('Wealth OS: failed to save dividend history', err);
          showToast('That did not save. ' + (err.message || 'Please try again.'));
          this.disabled = false;
          return;
        }
        this.disabled = false;
        client.dividendHistory = nextHistory;
        renderDividendHistory();
      });
    });
    list.querySelectorAll('[data-edit-div-hist]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const y = client.dividendHistory.find(x=>String(x.year)===this.dataset.editDivHist); if(!y) return;
        document.getElementById('newDivHistYear').value = y.year;
        document.getElementById('newDivHistAmount').value = y.amount;
        // Adding with the same year replaces it (see addDividendHistory's upsert-by-year) —
        // no separate "Save changes" state needed, just re-submit with the year pre-filled.
        document.getElementById('newDivHistYear').scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
  }
  async function addDividendHistory(){
    const year = parseInt(document.getElementById('newDivHistYear').value);
    const amount = parseFloat(document.getElementById('newDivHistAmount').value);
    if(isNaN(year) || isNaN(amount)){ showToast('Give a year and amount'); return; }
    const existed = client.dividendHistory.some(y=>y.year===year);
    const nextHistory = client.dividendHistory.filter(y=>y.year!==year).concat([{year, amount}]);
    // no dedicated "add" button id in this section's markup -- disable the inputs instead
    document.getElementById('newDivHistYear').disabled = true;
    document.getElementById('newDivHistAmount').disabled = true;
    try{
      await TEI.wealthOS.saveDividendHistory(client.meta.clientId, nextHistory);
    } catch(err){
      console.error('Wealth OS: failed to save dividend history', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
      document.getElementById('newDivHistYear').disabled = false;
      document.getElementById('newDivHistAmount').disabled = false;
      return;
    }
    document.getElementById('newDivHistYear').disabled = false;
    document.getElementById('newDivHistAmount').disabled = false;
    client.dividendHistory = nextHistory;
    ['newDivHistYear','newDivHistAmount'].forEach(id=>document.getElementById(id).value='');
    renderDividendHistory(); showToast(existed ? 'Dividend year updated' : 'Dividend year added');
  }

  /* ================= INVESTOR STAGE ================= */
  function wireInvestorStage(){
    const sel = document.getElementById('investorStageOverride');
    sel.value = client.investorStage.override || '';
    if(!sel.dataset.wired){
      sel.addEventListener('change', function(){ client.investorStage.override = this.value || null; showToast('Investor stage updated'); });
      sel.dataset.wired = '1';
    }
  }

  /* ================= DIVIDEND HOLDINGS ================= */
  function renderDividends(){
    const list = document.getElementById('dividendList');
    list.innerHTML = client.dividendHoldings.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">No dividend holdings yet.</div></div>`;
    client.dividendHoldings.forEach(h=>{
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="lr-main"><b>${h.name}</b><div class="lr-meta">${h.yield}% yield · ${h.growth}% growth · ${fmtGBP(h.amount||0)} invested · pays ${TEI.data.dividendFrequencyLabel(h.frequency).toLowerCase()}</div></div>
        <div style="display:flex; gap:8px; flex-none:1;">
          <button type="button" class="btn-ghost" data-edit-div="${h.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
          <button type="button" class="btn-ghost" data-del-div="${h.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
        </div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-del-div]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const id = this.dataset.delDiv;
        this.disabled = true;
        try{
          await TEI.wealthOS.deleteDividendHolding(id);
        } catch(err){
          console.error('Wealth OS: failed to delete dividend holding', err);
          showToast('That did not remove. ' + (err.message || 'Please try again.'));
          this.disabled = false;
          return;
        }
        client.dividendHoldings = client.dividendHoldings.filter(h=>h.id!==id);
        if(editing.dividend === id) cancelDividendEdit();
        renderDividends();
      });
    });
    list.querySelectorAll('[data-edit-div]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const h = client.dividendHoldings.find(x=>x.id===this.dataset.editDiv); if(!h) return;
        editing.dividend = h.id;
        document.getElementById('newDivName').value = h.name;
        document.getElementById('newDivYield').value = h.yield;
        document.getElementById('newDivGrowth').value = h.growth;
        document.getElementById('newDivAmount').value = h.amount;
        document.getElementById('newDivFrequency').value = h.frequency || 'annual';
        document.getElementById('addDivBtn').textContent = 'Save changes';
        document.getElementById('newDivName').scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
  }
  function cancelDividendEdit(){
    editing.dividend = null;
    document.getElementById('addDivBtn').textContent = 'Add holding';
    ['newDivName','newDivYield','newDivGrowth','newDivAmount'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('newDivFrequency').value = 'annual';
  }
  async function addDividend(){
    const name = document.getElementById('newDivName').value.trim();
    const yieldPct = parseFloat(document.getElementById('newDivYield').value);
    const growth = parseFloat(document.getElementById('newDivGrowth').value)||0;
    const amount = parseFloat(document.getElementById('newDivAmount').value)||0;
    const frequency = document.getElementById('newDivFrequency').value || 'annual';
    if(!name || isNaN(yieldPct)){ showToast('Give the holding a name and yield'); return; }
    const btn = document.getElementById('addDivBtn');
    btn.disabled = true;
    if(editing.dividend){
      const h = client.dividendHoldings.find(x=>x.id===editing.dividend);
      if(!h){ cancelDividendEdit(); btn.disabled = false; return; }
      const merged = Object.assign({}, h, {name, yield:yieldPct, growth, amount, frequency});
      try{
        await TEI.wealthOS.saveDividendHolding(client.meta.clientId, h.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save dividend holding', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(h, merged);
      cancelDividendEdit();
      showToast('Dividend holding updated');
    } else {
      const h = {id:uid(), name, yield:yieldPct, growth, amount, frequency};
      try{
        h.id = await TEI.wealthOS.saveDividendHolding(client.meta.clientId, null, h);
      } catch(err){
        console.error('Wealth OS: failed to save dividend holding', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.dividendHoldings.push(h);
      ['newDivName','newDivYield','newDivGrowth','newDivAmount'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('newDivFrequency').value = 'annual';
      showToast('Dividend holding added');
    }
    renderDividends();
  }

  /* ================= CASHFLOW ================= */
  /* ================= CASHFLOW: INCOME & EXPENSES ================= */
  function renderAdvIncomeList(){
    const list = document.getElementById('advIncomeList');
    list.className = 'entity-pill-grid';
    list.innerHTML = client.cashflow.income.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">No income sources yet.</div></div>`;
    refreshAdvGoalLinkedIncomeOptions();
    client.cashflow.income.forEach(i=>{
      const row = document.createElement('div');
      row.className = 'entity-pill';
      row.innerHTML = `
        <div class="ep-top">
          <div class="ep-heading"><span class="ep-name">${i.type}</span></div>
          <span class="tag-pill">${i.owner}</span>
        </div>
        <div class="ep-value">${fmtGBP(i.amount)}</div>
        <div class="ep-meta">${i.frequency}</div>
        <div class="ep-actions">
          <button type="button" class="btn-ghost" data-edit-adv-income="${i.id}">Edit</button>
          <button type="button" class="btn-ghost" data-del-adv-income="${i.id}">Remove</button>
        </div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-del-adv-income]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const id = this.dataset.delAdvIncome;
        this.disabled = true;
        try{
          await TEI.wealthOS.deleteIncome(id);
        } catch(err){
          console.error('Wealth OS: failed to delete income', err);
          showToast('That did not remove. ' + (err.message || 'Please try again.'));
          this.disabled = false;
          return;
        }
        client.cashflow.income = client.cashflow.income.filter(i=>i.id!==id);
        if(editing.advIncome === id) cancelAdvIncomeEdit();
        renderAdvIncomeList();
      });
    });
    list.querySelectorAll('[data-edit-adv-income]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const i = client.cashflow.income.find(x=>x.id===this.dataset.editAdvIncome); if(!i) return;
        editing.advIncome = i.id;
        document.getElementById('advNewIncomeOwner').value = i.owner;
        document.getElementById('advNewIncomeType').value = i.type;
        document.getElementById('advNewIncomeAmount').value = i.amount;
        document.getElementById('advNewIncomeFrequency').value = i.frequency;
        document.getElementById('advAddIncomeBtn').textContent = 'Save changes';
        document.getElementById('advNewIncomeAmount').scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
  }
  function cancelAdvIncomeEdit(){
    editing.advIncome = null;
    document.getElementById('advAddIncomeBtn').textContent = 'Add';
    document.getElementById('advNewIncomeAmount').value = '';
  }
  async function addAdvIncome(){
    const owner = document.getElementById('advNewIncomeOwner').value;
    const type = document.getElementById('advNewIncomeType').value;
    const amount = parseFloat(document.getElementById('advNewIncomeAmount').value);
    if(isNaN(amount)){ showToast('Give an amount'); return; }
    const frequency = document.getElementById('advNewIncomeFrequency').value;
    const btn = document.getElementById('advAddIncomeBtn');
    btn.disabled = true;
    if(editing.advIncome){
      const i = client.cashflow.income.find(x=>x.id===editing.advIncome);
      if(!i){ cancelAdvIncomeEdit(); btn.disabled = false; return; }
      const merged = Object.assign({}, i, {owner, type, amount, frequency});
      TEI.calc.stampEdit(merged, 'adviser');
      try{
        await TEI.wealthOS.saveIncome(client.meta.clientId, i.id, merged);
      } catch(err){
        console.error('Wealth OS: failed to save income', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(i, merged);
      cancelAdvIncomeEdit();
      showToast('Income updated');
      // The income trigger (trg_income_contribution_flag) raises a flag on
      // any salary-derived rule linked to this income -- ask right here.
      if(contribState().rules.some(r=>!r.effective_to && r.linked_income_id === i.id)){
        await reloadContrib();
        renderIncomeFlagPrompt(i.id);
      }
    } else {
      const i = TEI.calc.stampEdit({id:uid(), owner, type, amount, frequency}, 'adviser');
      try{
        i.id = await TEI.wealthOS.saveIncome(client.meta.clientId, null, i);
      } catch(err){
        console.error('Wealth OS: failed to save income', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.cashflow.income.push(i);
      document.getElementById('advNewIncomeAmount').value = '';
      showToast('Income added');
    }
    renderAdvIncomeList();
    // An income change can be exactly what completes an "income"-type goal
    // (e.g. a business-income target) -- check right away rather than
    // waiting for the Goals page's own check on next visit.
    {
      const r = await TEI.calc.checkGoalAutoComplete(client);
      r.completed.forEach(g=> showToast(`🎉 "${g.name}" completed!`));
      r.reopened.forEach(g=> showToast(`"${g.name}" dropped back below target, reopened`));
    }
  }
  function renderAdvExpenseList(kind){
    const containerId = kind==='fixed' ? 'advFixedList' : 'advVariableList';
    const list = document.getElementById(containerId);
    const items = client.cashflow.expenses[kind];
    const btnId = kind==='fixed' ? 'advAddFixedBtn' : 'advAddVariableBtn';
    list.innerHTML = items.length ? '' : `<div class="empty-state" style="padding:10px 0;"><div class="small">Nothing added yet.</div></div>`;
    items.forEach(e=>{
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="lr-main"><b>${e.label}</b>${e.owner==='joint' ? ' <span class="tag-pill">Joint</span>' : ''}<div class="lr-meta">${fmtGBP(e.amount)}/mo · ${e.category==='lifestyle' ? 'Lifestyle' : 'Essential'}</div></div>
        <div style="display:flex; gap:8px; flex-none:1;">
          <button type="button" class="btn-ghost" data-edit-adv-exp="${kind}:${e.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
          <button type="button" class="btn-ghost" data-del-adv-exp="${kind}:${e.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
        </div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-del-adv-exp]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const [k,id] = this.dataset.delAdvExp.split(':');
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
        if(editing['advExp'+k] === id) cancelAdvExpenseEdit(k);
        renderAdvExpenseList(k);
      });
    });
    list.querySelectorAll('[data-edit-adv-exp]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const [k,id] = this.dataset.editAdvExp.split(':');
        const e = client.cashflow.expenses[k].find(x=>x.id===id); if(!e) return;
        editing['advExp'+k] = id;
        const labelId = k==='fixed' ? 'advNewFixedLabel' : 'advNewVariableLabel';
        const amtId = k==='fixed' ? 'advNewFixedAmount' : 'advNewVariableAmount';
        document.getElementById(labelId).value = e.label;
        document.getElementById(amtId).value = e.amount;
        document.getElementById(k==='fixed' ? 'advNewFixedOwner' : 'advNewVariableOwner').value = e.owner || 'client';
        document.getElementById(k==='fixed' ? 'advNewFixedSpend' : 'advNewVariableSpend').value = e.category === 'lifestyle' ? 'lifestyle' : 'essential';
        document.getElementById(k==='fixed' ? 'advAddFixedBtn' : 'advAddVariableBtn').textContent = 'Save changes';
        document.getElementById(amtId).scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
  }
  /* The Joint/shared owner toggle only makes sense once this client is
     actually linked into a household (see the Overview household card) --
     otherwise "joint" has nothing to be joint with. Hidden for everyone
     else so the common case (no household) never sees an irrelevant field. */
  function toggleAdvExpenseOwnerFields(){
    const show = !!client.meta.householdId;
    document.getElementById('advNewFixedOwnerField').style.display = show ? 'flex' : 'none';
    document.getElementById('advNewVariableOwnerField').style.display = show ? 'flex' : 'none';
  }
  function cancelAdvExpenseEdit(kind){
    editing['advExp'+kind] = null;
    const labelId = kind==='fixed' ? 'advNewFixedLabel' : 'advNewVariableLabel';
    const amtId = kind==='fixed' ? 'advNewFixedAmount' : 'advNewVariableAmount';
    document.getElementById(kind==='fixed' ? 'advAddFixedBtn' : 'advAddVariableBtn').textContent = 'Add';
    clearFieldsAdv([labelId, amtId]);
    document.getElementById(kind==='fixed' ? 'advNewFixedOwner' : 'advNewVariableOwner').value = 'client';
    document.getElementById(kind==='fixed' ? 'advNewFixedSpend' : 'advNewVariableSpend').value = kind==='fixed' ? 'essential' : 'lifestyle';
  }
  async function addAdvExpense(kind){
    const labelId = kind==='fixed' ? 'advNewFixedLabel' : 'advNewVariableLabel';
    const amtId = kind==='fixed' ? 'advNewFixedAmount' : 'advNewVariableAmount';
    const label = document.getElementById(labelId).value.trim();
    const amount = parseFloat(document.getElementById(amtId).value);
    if(!label || isNaN(amount)){ showToast('Give it a name and amount'); return; }
    // Owner only comes from the form when this client is actually linked into
    // a household (the field's hidden otherwise) -- everyone else's expenses
    // stay implicitly individual, same as before this feature existed.
    const owner = client.meta.householdId ? document.getElementById(kind==='fixed' ? 'advNewFixedOwner' : 'advNewVariableOwner').value : 'client';
    // Essential or lifestyle (spec B9.7): sums into Cashflow's two spending totals.
    const category = document.getElementById(kind==='fixed' ? 'advNewFixedSpend' : 'advNewVariableSpend').value === 'lifestyle' ? 'lifestyle' : 'essential';
    const editKey = 'advExp'+kind;
    const btn = document.getElementById(kind==='fixed' ? 'advAddFixedBtn' : 'advAddVariableBtn');
    btn.disabled = true;
    if(editing[editKey]){
      const e = client.cashflow.expenses[kind].find(x=>x.id===editing[editKey]);
      if(!e){ cancelAdvExpenseEdit(kind); btn.disabled = false; return; }
      const merged = Object.assign({}, e, {label, amount, owner, category});
      TEI.calc.stampEdit(merged, 'adviser');
      try{
        await TEI.wealthOS.saveExpense(client.meta.clientId, e.id, merged, kind);
      } catch(err){
        console.error('Wealth OS: failed to save expense', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Object.assign(e, merged);
      cancelAdvExpenseEdit(kind);
      showToast('Expense updated');
    } else {
      const e = TEI.calc.stampEdit({id:uid(), label, amount, owner, category}, 'adviser');
      try{
        e.id = await TEI.wealthOS.saveExpense(client.meta.clientId, null, e, kind);
      } catch(err){
        console.error('Wealth OS: failed to save expense', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.cashflow.expenses[kind].push(e);
      clearFieldsAdv([labelId, amtId]);
      document.getElementById(kind==='fixed' ? 'advNewFixedSpend' : 'advNewVariableSpend').value = kind==='fixed' ? 'essential' : 'lifestyle';
      showToast('Expense added');
    }
    renderAdvExpenseList(kind);
  }

  function renderAdvOneOffList(){
    const list = document.getElementById('advOneOffList');
    const items = client.cashflow.oneOffs||[];
    list.innerHTML = items.length ? '' : `<div class="empty-state" style="padding:10px 0;"><div class="small">No one-off costs added.</div></div>`;
    items.forEach(o=>{
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="lr-main"><b>${o.label}</b> <span class="tag-pill">${o.enabled?'Included':'Excluded'}</span><div class="lr-meta">${fmtGBP(o.amount)}</div></div>
        <div style="display:flex; gap:8px; flex-none:1;">
          <button type="button" class="btn-ghost" data-edit-oneoff="${o.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
          <button type="button" class="btn-ghost" data-toggle-oneoff="${o.id}" style="padding:5px 12px; font-size:11px;">${o.enabled?'Exclude':'Include'}</button>
          <button type="button" class="btn-ghost" data-del-oneoff="${o.id}" style="padding:5px 12px; font-size:11px;">Remove</button>
        </div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-del-oneoff]').forEach(btn=> btn.addEventListener('click', async function(){
      const id = this.dataset.delOneoff;
      const nextOneOffs = client.cashflow.oneOffs.filter(o=>o.id!==id);
      this.disabled = true;
      try{
        await saveOneOffs(nextOneOffs);
      } catch(err){
        console.error('Wealth OS: failed to save one-offs', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        this.disabled = false;
        return;
      }
      this.disabled = false;
      client.cashflow.oneOffs = nextOneOffs;
      if(editing.oneOff === id) cancelOneOffEdit();
      renderAdvOneOffList(); fillCashflowForm();
    }));
    list.querySelectorAll('[data-toggle-oneoff]').forEach(btn=> btn.addEventListener('click', async function(){
      const o = client.cashflow.oneOffs.find(o=>o.id===this.dataset.toggleOneoff);
      if(!o) return;
      const merged = Object.assign({}, o, {enabled: !o.enabled});
      TEI.calc.stampEdit(merged, 'adviser');
      const nextOneOffs = client.cashflow.oneOffs.map(x=>x.id===o.id?merged:x);
      this.disabled = true;
      try{
        await saveOneOffs(nextOneOffs);
      } catch(err){
        console.error('Wealth OS: failed to save one-offs', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        this.disabled = false;
        return;
      }
      this.disabled = false;
      client.cashflow.oneOffs = nextOneOffs;
      renderAdvOneOffList(); fillCashflowForm();
    }));
    list.querySelectorAll('[data-edit-oneoff]').forEach(btn=> btn.addEventListener('click', function(){
      const o = client.cashflow.oneOffs.find(x=>x.id===this.dataset.editOneoff); if(!o) return;
      editing.oneOff = o.id;
      document.getElementById('advNewOneOffLabel').value = o.label;
      document.getElementById('advNewOneOffAmount').value = o.amount;
      document.getElementById('advNewOneOffEnabled').checked = !!o.enabled;
      document.getElementById('advAddOneOffBtn').textContent = 'Save changes';
      document.getElementById('advNewOneOffAmount').scrollIntoView({behavior:'smooth', block:'center'});
    }));
  }
  function cancelOneOffEdit(){
    editing.oneOff = null;
    document.getElementById('advAddOneOffBtn').textContent = 'Add';
    clearFieldsAdv(['advNewOneOffLabel','advNewOneOffAmount']);
    document.getElementById('advNewOneOffEnabled').checked = true;
  }
  /* every one-off edit writes the whole cashflow_settings row (one_offs is
     a jsonb array column there, not its own table) -- build the settings
     payload against a throwaway clone with the new array substituted in,
     save it, and only then commit the array to the real client object. */
  async function saveOneOffs(nextOneOffs){
    const tempClient = Object.assign({}, client, { cashflow: Object.assign({}, client.cashflow, { oneOffs: nextOneOffs }) });
    await TEI.wealthOS.saveCashflowSettings(client.meta.clientId, tempClient);
  }

  async function addAdvOneOff(){
    const label = document.getElementById('advNewOneOffLabel').value.trim();
    const amount = parseFloat(document.getElementById('advNewOneOffAmount').value);
    if(!label || isNaN(amount)){ showToast('Give it a name and amount'); return; }
    const enabled = document.getElementById('advNewOneOffEnabled').checked;
    const existingOneOffs = client.cashflow.oneOffs || [];
    const btn = document.getElementById('advAddOneOffBtn');
    btn.disabled = true;
    let nextOneOffs;
    if(editing.oneOff){
      const o = existingOneOffs.find(x=>x.id===editing.oneOff);
      if(!o){ cancelOneOffEdit(); btn.disabled = false; return; }
      const merged = Object.assign({}, o, {label, amount, enabled});
      TEI.calc.stampEdit(merged, 'adviser');
      nextOneOffs = existingOneOffs.map(x=>x.id===o.id?merged:x);
      try{
        await saveOneOffs(nextOneOffs);
      } catch(err){
        console.error('Wealth OS: failed to save one-offs', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.cashflow.oneOffs = nextOneOffs;
      cancelOneOffEdit();
      showToast('One-off updated');
    } else {
      const o = TEI.calc.stampEdit({id:uid(), label, amount, enabled}, 'adviser');
      nextOneOffs = existingOneOffs.concat([o]);
      try{
        await saveOneOffs(nextOneOffs);
      } catch(err){
        console.error('Wealth OS: failed to save one-offs', err);
        showToast('That did not save. ' + (err.message || 'Please try again.'));
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      client.cashflow.oneOffs = nextOneOffs;
      clearFieldsAdv(['advNewOneOffLabel','advNewOneOffAmount']);
      document.getElementById('advNewOneOffEnabled').checked = true;
      showToast('One-off added');
    }
    renderAdvOneOffList();
    fillCashflowForm();
  }

  /* Cash / Cash ISA only -- an emergency fund is meant to be instantly
     accessible, not invested. Shared by the dropdown here and saveCashflow's
     validation below. */
  function emergencyFundAccounts(){
    return client.accounts.filter(a=> a.type==='cash' || a.type==='cash_isa');
  }
  function fillCashflowForm(){
    document.getElementById('cfFiMultiple').value = client.preferences.fiMultiple||25;
    document.getElementById('cfEfTarget').value = (client.cashflow.emergencyFund||{}).target||0;
    fillEfAccountSelect();
    document.getElementById('cfWcTarget').value = client.preferences.wealthConversionTarget||20;
    renderCalculatedSavingStats();
  }
  // Also refilled when the account form's safety net switch changes the link,
  // so Save here never writes back a stale choice.
  function fillEfAccountSelect(){
    const efSelect = document.getElementById('cfEfAccount');
    efSelect.innerHTML = '<option value="">Select a cash account…</option>' +
      emergencyFundAccounts().map(a=>`<option value="${a.id}">${TEI.data.acctLabel(a)}</option>`).join('');
    efSelect.value = (client.cashflow.emergencyFund||{}).accountId || '';
  }
  /* Monthly savings/investing, and now emergency fund "current", used to be
     typed here and compared against accounts via a separate "contribution
     reconciliation" check -- all self-reported, so they could drift from
     accounts (and from each other) with nothing to catch it. Now purely
     account-derived, same source the rest of the app already treats as
     ground truth, so there is nothing left to reconcile against -- just the
     calculated figures themselves, read-only. */
  function renderCalculatedSavingStats(){
    const el = document.getElementById('cfCalculatedSavingStats');
    if(!el) return;
    const investing = TEI.calc.actualInvestmentMonthlyContribution(client);
    const savings = TEI.calc.actualCashMonthlyContribution(client);
    const efAccountId = document.getElementById('cfEfAccount').value;
    const efAcc = client.accounts.find(a=>a.id===efAccountId);
    el.innerHTML = `
      <div class="range-stat"><span class="rs-label">Monthly savings (cash accounts)</span><b>${fmtGBP(savings)}</b></div>
      <div class="range-stat"><span class="rs-label">Monthly investing (ISA/GIA/LISA/pension personal)</span><b>${fmtGBP(investing)}</b></div>
      <div class="range-stat"><span class="rs-label">Emergency fund current (from linked account)</span><b>${efAcc ? fmtGBP(efAcc.value) : 'No account linked'}</b></div>
    `;
  }
  /* Writes the row as well: this used to change the figures in memory only,
     so they were lost on reload unless something else saved the row. */
  async function saveCashflow(){
    client.preferences.fiMultiple = parseFloat(document.getElementById('cfFiMultiple').value)||25;
    const efAccountId = document.getElementById('cfEfAccount').value || null;
    const efAcc = client.accounts.find(a=>a.id===efAccountId);
    client.cashflow.emergencyFund = TEI.calc.stampEdit({
      target: parseFloat(document.getElementById('cfEfTarget').value)||0,
      accountId: efAccountId,
      current: efAcc ? (Number(efAcc.value)||0) : 0
    }, 'adviser');
    client.preferences.wealthConversionTarget = parseFloat(document.getElementById('cfWcTarget').value)||20;
    renderCalculatedSavingStats();
    const btn = document.getElementById('saveCashflowBtn');
    btn.disabled = true;
    try{
      await TEI.wealthOS.saveCashflowSettings(client.meta.clientId, client);
      showToast('Cashflow saved');
    } catch(err){
      console.error('Wealth OS: failed to save cashflow settings', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
    } finally { btn.disabled = false; }
  }

  /* ================= DOCUMENTS ================= */
  /* Documents with a storagePath are real rows in wealth_os.documents with a
     file in the client-documents bucket (uploaded here via the File field);
     edits/removals of those go to Supabase. Link-only entries without a file
     keep the original in-memory behaviour. Only an adviser session can
     upload/edit/remove stored files (RLS enforces it; the controls are hidden
     for a client viewing this panel through My Details). */
  const isAdviserSession = ()=> client && client.meta && client.meta.role === 'adviser';
  function renderDocuments(){
    const list = document.getElementById('documentsListAdv');
    const adviser = isAdviserSession();
    document.querySelectorAll('#subtab-documents [data-adviser-only]').forEach(el=>{ el.hidden = !adviser; });
    toggleDocFileFields();
    list.innerHTML = client.documents.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">No documents yet.</div></div>`;
    client.documents.forEach(d=>{
      const stored = !!d.storagePath;
      const canEdit = !stored || adviser;
      const isForecast = d.type === 'forecast';
      const when = stored && TEI.forecastView ? TEI.forecastView.fmtDate(d.uploadedAt) : (d.date||'no date');
      const row = document.createElement('div');
      row.className = 'list-row';
      const kind = stored && !isForecast && TEI.docView ? ' · ' + TEI.docView.formatLabel(d) : (stored ? ' · uploaded file' : '');
      // Sent by the client (Settings > Documents): pending until the figures are keyed in.
      const review = d.reviewStatus === 'pending' ? ' · <b style="color:var(--gold);">Sent by client, waiting for review</b>' : d.reviewStatus === 'added' ? ' · sent by client, figures added' : '';
      row.innerHTML = `<div class="lr-main"><b>${d.name}</b><div class="lr-meta">${isForecast ? 'Wealth Plan forecast' : d.type} · ${when}${kind}${review}</div>${isForecast && stored ? `<div class="fc-state" data-fc-state="${d.id}"></div>` : ''}</div>
        <div style="display:flex; gap:8px; flex-none:1;">
          ${stored ? `<button type="button" class="btn-ghost" data-forecast-open="${d.id}" style="padding:5px 12px; font-size:11px;">Open</button>` : ''}
          ${adviser && d.reviewStatus === 'pending' ? `<button type="button" class="btn-ghost" data-doc-added="${d.id}" style="padding:5px 12px; font-size:11px;">Mark figures added</button>` : ''}
          ${canEdit ? `<button type="button" class="btn-ghost" data-edit-doc="${d.id}" style="padding:5px 12px; font-size:11px;">Edit</button>
          <button type="button" class="btn-ghost" data-del-doc="${d.id}" style="padding:5px 12px; font-size:11px;">Remove</button>` : ''}
        </div>`;
      list.appendChild(row);
    });
    // [data-forecast-open] buttons are handled by TEI.forecastView's single delegated click listener.
    list.querySelectorAll('[data-doc-added]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const d = client.documents.find(x=>x.id===this.dataset.docAdded); if(!d) return;
        this.disabled = true;
        try{ await TEI.wealthOS.setDocumentReviewStatus(d.id, 'added'); }
        catch(err){ console.error('Wealth OS: could not update the upload', err); showToast('That did not save. Please try again.'); this.disabled = false; return; }
        d.reviewStatus = 'added';
        renderDocuments();
      });
    });
    list.querySelectorAll('[data-del-doc]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const id = this.dataset.delDoc;
        const d = client.documents.find(x=>x.id===id); if(!d) return;
        if(d.storagePath){
          if(!confirm(`Remove "${d.name}" and its file for this client? Any saved forecast settings for it are removed too.`)) return;
          try{ await TEI.wealthOS.deleteDocument(d); }
          catch(err){ console.error('Wealth OS: delete document failed', err); showToast("Could not remove the document."); return; }
        }
        client.documents = client.documents.filter(x=>x.id!==id);
        if(editing.document === id) cancelDocEdit();
        renderDocuments();
      });
    });
    list.querySelectorAll('[data-edit-doc]').forEach(btn=>{
      btn.addEventListener('click', function(){
        const d = client.documents.find(x=>x.id===this.dataset.editDoc); if(!d) return;
        editing.document = d.id;
        document.getElementById('newDocName').value = d.name;
        document.getElementById('newDocType').value = d.type;
        document.getElementById('newDocDate').value = d.storagePath ? '' : (d.date||'');
        document.getElementById('newDocUrl').value = d.storagePath ? '' : (d.url||'');
        document.getElementById('newDocFile').value = '';
        toggleDocFileFields();
        document.getElementById('addDocBtn').textContent = 'Save changes';
        document.getElementById('newDocName').scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
    if(adviser && TEI.forecastView) TEI.forecastView.fillAdviserStates(list, client.meta.clientId);
  }
  /* A stored file has its own upload date and no link, so Date/Link are hidden
     while a file is chosen or a stored document is being edited (and the file
     picker is hidden while editing: a stored file is not replaced in place --
     upload a new one, older forecasts are kept). */
  function toggleDocFileFields(){
    const fileInput = document.getElementById('newDocFile');
    const editingDoc = editing.document ? client.documents.find(x=>x.id===editing.document) : null;
    const stored = !!(editingDoc && editingDoc.storagePath);
    const hasFile = !!(fileInput && fileInput.files && fileInput.files.length);
    const fileField = document.getElementById('newDocFileField');
    if(fileField && isAdviserSession()) fileField.hidden = !!editingDoc;
    ['newDocDateField','newDocUrlField'].forEach(id=>{ const el = document.getElementById(id); if(el) el.hidden = hasFile || stored; });
  }
  function cancelDocEdit(){
    editing.document = null;
    document.getElementById('addDocBtn').textContent = 'Add document';
    ['newDocName','newDocDate','newDocUrl','newDocFile'].forEach(id=>document.getElementById(id).value='');
    toggleDocFileFields();
  }
  let docBusy = false;
  async function addDocument(){
    if(docBusy) return;
    const name = document.getElementById('newDocName').value.trim();
    const type = document.getElementById('newDocType').value;
    const fileInput = document.getElementById('newDocFile');
    const file = fileInput.files && fileInput.files[0];
    if(!name && !file){ showToast('Give the document a name'); return; }
    const date = document.getElementById('newDocDate').value || null;
    const url = document.getElementById('newDocUrl').value.trim() || null;
    const btn = document.getElementById('addDocBtn');

    if(editing.document){
      const d = client.documents.find(x=>x.id===editing.document);
      if(!d){ cancelDocEdit(); return; }
      if(!name){ showToast('Give the document a name'); return; }
      if(d.storagePath){
        if(type === 'forecast' && !/\.html?$/i.test(d.storagePath)){ showToast('Only an .html file can be a Wealth Plan forecast'); return; }
        docBusy = true; btn.disabled = true;
        try{ Object.assign(d, await TEI.wealthOS.updateDocument(d.id, {name, type})); }
        catch(err){ console.error('Wealth OS: update document failed', err); showToast("Could not save the document."); return; }
        finally{ docBusy = false; btn.disabled = false; }
      } else {
        Object.assign(d, {name, type, date, url});
        TEI.calc.stampEdit(d, 'adviser');
      }
      cancelDocEdit();
      showToast('Document updated');
      renderDocuments();
      return;
    }

    if(file){
      if(!isAdviserSession()){ showToast('Only your adviser can upload files'); return; }
      if(type === 'forecast' && !/\.html?$/i.test(file.name)){ showToast('A Wealth Plan forecast must be an .html file'); return; }
      const docName = name || file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      docBusy = true; btn.disabled = true; btn.textContent = 'Checking file…';
      try{
        // Validates type/size/contents and converts Word/CSV/Excel to HTML;
        // a rejection carries a message meant for the adviser.
        let prepared;
        try{ prepared = await TEI.docView.prepare(file, s=>{ btn.textContent = s; }); }
        catch(err){ console.warn('Wealth OS: document rejected', err); showToast(err && err.userMessage || "Could not read that file."); return; }
        btn.textContent = 'Uploading…';
        const saved = await TEI.wealthOS.uploadDocument(client.meta.clientId, file, docName, type, prepared);
        client.documents.push(saved);
        cancelDocEdit();
        showToast(type === 'forecast' ? 'Forecast uploaded' : 'Document uploaded');
        if(TEI.app && TEI.app.rerenderCurrentPage) TEI.app.rerenderCurrentPage();
      } catch(err){
        console.error('Wealth OS: upload document failed', err);
        showToast("Could not upload the file.");
      } finally {
        docBusy = false; btn.disabled = false; btn.textContent = editing.document ? 'Save changes' : 'Add document';
      }
      renderDocuments();
      return;
    }

    if(type === 'forecast'){ showToast('Choose the forecast .html file to upload'); return; }
    client.documents.push(TEI.calc.stampEdit({id:uid(), name, type, date, url}, 'adviser'));
    ['newDocName','newDocDate','newDocUrl'].forEach(id=>document.getElementById(id).value='');
    showToast('Document added');
    renderDocuments();
  }

  /* ================= dropdown refresh ================= */
  function refreshAccountSelects(){
    const opts = client.accounts.map(a=>`<option value="${a.id}">${TEI.data.acctLabel(a)}</option>`).join('');
    document.getElementById('newHoldingAccount').innerHTML = opts || '<option value="">Add an account first</option>';
    document.getElementById('csvAccountSelect').innerHTML = opts || '<option value="">Add an account first</option>';
    const goalAcctWrap = document.getElementById('newGoalLinkedAccounts');
    const selectedIds = Array.from(goalAcctWrap.querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value);
    if(!client.accounts.length){
      goalAcctWrap.innerHTML = '<span>Add an account first to link a goal to it.</span>';
      goalAcctWrap.classList.add('empty');
    } else {
      goalAcctWrap.classList.remove('empty');
      goalAcctWrap.innerHTML = client.accounts.map(a=>`<label><input type="checkbox" value="${a.id}" ${selectedIds.includes(a.id)?'checked':''}> ${TEI.data.acctLabel(a)}</label>`).join('');
    }
    const liabAssetSel = document.getElementById('advNewLiabLinkedAsset');
    const liabCurrent = liabAssetSel.value;
    liabAssetSel.innerHTML = '<option value="">None</option>' + client.wealth.assets.map(a=>`<option value="${a.id}">${a.type==='property'?'Property':(a.notes||a.type)}</option>`).join('');
    liabAssetSel.value = liabCurrent;
  }

  /* ================= CSV IMPORT (ported from v1) ================= */
  function parseHoldingsCsvRows(text){
    const rows = []; let row=[], field='', inQuotes=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], next=text[i+1];
      if(inQuotes){
        if(c==='"'){ if(next==='"'){ field+='"'; i++; } else inQuotes=false; }
        else field+=c;
      } else {
        if(c==='"') inQuotes=true;
        else if(c===','){ row.push(field); field=''; }
        else if(c==='\r'){ /* skip */ }
        else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
        else field+=c;
      }
    }
    if(field.length||row.length){ row.push(field); rows.push(row); }
    return rows.filter(r=>r.some(c=>c && c.trim()!==''));
  }
  function parseHoldingNumber(raw){
    if(raw==null) return null;
    let s=String(raw).trim(); if(!s) return null;
    let neg=false;
    if(/^\(.*\)$/.test(s)){ neg=true; s=s.slice(1,-1); }
    s=s.replace(/[£$,%\s]/g,'');
    if(s===''||isNaN(parseFloat(s))) return null;
    const v=parseFloat(s); return neg?-v:v;
  }
  function parseThemeInput(raw){
    return (raw||'').split(',').map(s=>s.trim()).filter(Boolean);
  }
  const HOLDING_COLUMN_ALIASES = {
    ticker:['ticker','symbol','code','stock'],
    name:['name','security','description','instrument','fund','holding'],
    units:['units','quantity','qty','shares','no. of shares','number of shares'],
    avgOpen:['average price','avg price','average cost','avg cost','average open price','avg open','open price','cost per share','average purchase price'],
    costBasis:['book cost','total cost','cost basis','amount invested','total invested','contributions','total contributions'],
    value:['value','market value','current value','total value','holding value']
  };
  function matchHoldingColumn(header, key){
    const h = header.trim().toLowerCase().replace(/[^a-z0-9. ]/g,'');
    return HOLDING_COLUMN_ALIASES[key].some(alias=> h===alias || h.indexOf(alias)!==-1);
  }
  function importHoldingsCsv(){
    const accountId = document.getElementById('csvAccountSelect').value;
    const fileInput = document.getElementById('csvFileInput');
    const resultEl = document.getElementById('csvImportResult');
    if(!accountId){ resultEl.textContent = 'Add an account first.'; return; }
    const file = fileInput.files[0];
    if(!file){ resultEl.textContent = 'Choose a CSV file first.'; return; }
    const reader = new FileReader();
    reader.onload = async function(e){
      const rows = parseHoldingsCsvRows(String(e.target.result));
      if(!rows.length){ resultEl.textContent = 'That file looks empty.'; return; }
      const header = rows[0]; const col = {};
      Object.keys(HOLDING_COLUMN_ALIASES).forEach(key=>{ col[key] = header.findIndex(h=>matchHoldingColumn(h,key)); });
      if(col.units===-1 && col.avgOpen===-1 && col.value===-1 && col.costBasis===-1){
        resultEl.textContent = "Could not find recognisable columns, needs Ticker/Units/Average price (or Value) headers.";
        return;
      }
      let skipped = 0;
      const parsed = rows.slice(1).map(cols=>{
        const ticker = col.ticker>=0 ? (cols[col.ticker]||'').trim().toUpperCase() : '';
        const rawName = col.name>=0 ? (cols[col.name]||'').trim() : '';
        const name = rawName || ticker;
        const units = col.units>=0 ? parseHoldingNumber(cols[col.units]) : null;
        const avgOpen = col.avgOpen>=0 ? parseHoldingNumber(cols[col.avgOpen]) : null;
        let costBasis = col.costBasis>=0 ? parseHoldingNumber(cols[col.costBasis]) : null;
        let value = col.value>=0 ? parseHoldingNumber(cols[col.value]) : null;
        if(ticker){
          // Ticker'd rows are live-priced going forward: avgOpen is
          // native-currency (USD) and any raw value/cost-basis column
          // would be treated as GBP here despite not being converted yet
          // -- same deferred-to-refresh convention addHolding() uses for a
          // manually-added ticker+units holding (value=0 pending refresh,
          // costBasis left unset until avgOpen*rate can be computed).
          if(value==null && units!=null) value = 0;
          costBasis = null;
        } else {
          if(value==null && units!=null && avgOpen!=null) value = units*avgOpen;
          if(value==null && costBasis!=null) value = costBasis;
        }
        if(!name || value==null){ skipped++; return null; }
        return {id:uid(), accountId, name, ticker:ticker||null, units, avgOpen, costBasis, value};
      }).filter(Boolean);
      if(!parsed.length){ resultEl.textContent = 'No usable holding rows found in that file.'; return; }
      const existingCount = client.holdings.filter(h=>h.accountId===accountId).length;
      if(existingCount && !confirm(`Replace the ${existingCount} existing holding(s) for this account with ${parsed.length} from the file?`)) return;
      resultEl.textContent = 'Importing…';
      let saved;
      try{
        saved = await TEI.wealthOS.replaceHoldingsForAccount(accountId, parsed);
      } catch(err){
        console.error('Wealth OS: failed to import holdings', err);
        resultEl.textContent = "Import failed, " + (err.message || 'try again') + '. Nothing was changed.';
        return;
      }
      // Map the returned DB rows straight back to local shape (rather than
      // correlating by array position against `parsed`, which would depend
      // on insert-order being preserved) so every row's id is the real one
      // Supabase generated.
      const savedWithLocalShape = saved.map(row=>({
        id: row.id, accountId: row.account_id, name: row.name, ticker: row.ticker,
        units: row.units, avgOpen: row.avg_open, costBasis: row.cost_basis,
        value: row.value, sector: row.sector
      }));
      client.holdings = client.holdings.filter(h=>h.accountId!==accountId).concat(savedWithLocalShape);
      TEI.calc.syncAccountValueFromHoldings(client, accountId);
      renderHoldings();
      renderMonthlyHoldingFields();
      renderMonthlyBalanceFields();
      renderAccounts();
      resultEl.textContent = `Imported ${savedWithLocalShape.length} holding${savedWithLocalShape.length===1?'':'s'}${skipped?', skipped '+skipped+' row'+(skipped===1?'':'s'):''}.`;
      showToast('Holdings imported');
    };
    reader.readAsText(file);
  }

  /* ================= UPLOAD QUEUE (no OCR, honest manual-review flow) ================= */
  function guessType(filename){
    const ext = (filename.split('.').pop()||'').toLowerCase();
    if(ext==='csv') return 'CSV';
    if(['xlsx','xls'].includes(ext)) return 'Spreadsheet';
    if(ext==='pdf') return 'PDF';
    if(['png','jpg','jpeg'].includes(ext)) return 'Screenshot / image';
    return 'File';
  }
  function addFilesToQueue(fileList){
    Array.from(fileList).forEach(file=>{
      uploadQueue.push({
        id: uid(), file, name: file.name, size: file.size, kind: guessType(file.name),
        objectUrl: URL.createObjectURL(file), status: 'pending', note: ''
      });
    });
    renderUploadQueue();
    showToast(fileList.length + ' file' + (fileList.length===1?'':'s') + ' queued');
  }
  function renderUploadQueue(){
    const list = document.getElementById('uploadQueueList');
    if(!uploadQueue.length){ list.innerHTML = `<div class="empty-state" style="padding:14px 0;"><div class="small">Nothing queued yet.</div></div>`; return; }
    list.innerHTML = '';
    uploadQueue.slice().reverse().forEach(item=>{
      const div = document.createElement('div');
      div.className = 'queue-item';
      div.innerHTML = `
        <div class="qi-top">
          <div>
            <div class="qi-name">${item.name} <span class="status-pill ${item.status}">${item.status}</span></div>
            <div class="qi-meta">${item.kind} · ${(item.size/1024).toFixed(0)} KB</div>
          </div>
          <a href="${item.objectUrl}" target="_blank" rel="noopener" class="btn-ghost" style="text-decoration:none; padding:6px 14px; font-size:11.5px;">Open file</a>
        </div>
        <label class="form-field" style="margin-top:10px;"><span>Review note (what did you key in from this file, if anything)</span>
          <input type="text" data-queue-note="${item.id}" value="${item.note}" placeholder="e.g. Updated ISA balance to £14,200 from this statement">
        </label>
        <div class="qi-actions">
          <button type="button" class="approve" data-queue-approve="${item.id}">Mark reviewed &amp; approved</button>
          <button type="button" class="reject" data-queue-reject="${item.id}">Reject</button>
        </div>
      `;
      list.appendChild(div);
    });
    list.querySelectorAll('[data-queue-note]').forEach(el=>{
      el.addEventListener('change', function(){
        const item = uploadQueue.find(q=>q.id===this.dataset.queueNote);
        if(item) item.note = this.value;
      });
    });
    list.querySelectorAll('[data-queue-approve]').forEach(el=>{
      el.addEventListener('click', function(){ setQueueStatus(this.dataset.queueApprove, 'approved'); });
    });
    list.querySelectorAll('[data-queue-reject]').forEach(el=>{
      el.addEventListener('click', function(){ setQueueStatus(this.dataset.queueReject, 'rejected'); });
    });
  }
  function setQueueStatus(id, status){
    const item = uploadQueue.find(q=>q.id===id);
    if(item) item.status = status;
    renderUploadQueue();
  }
  function wireUpload(){
    const zone = document.getElementById('uploadZone');
    const input = document.getElementById('uploadInput');
    input.addEventListener('change', ()=>{ if(input.files.length) addFilesToQueue(input.files); input.value=''; });
    ['dragover','dragenter'].forEach(ev=> zone.addEventListener(ev, e=>{ e.preventDefault(); zone.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(ev=> zone.addEventListener(ev, e=>{ e.preventDefault(); zone.classList.remove('dragover'); }));
    zone.addEventListener('drop', e=>{ if(e.dataTransfer.files.length) addFilesToQueue(e.dataTransfer.files); });
  }

  /* ================= EXPORT ================= */
  /* ================= OVERVIEW ================= */
  function computeKeyOpportunities(client){
    const items = [];
    const nba = TEI.calc.computeNextBestAction(client);
    if(nba && nba.text) items.push(nba.text + (nba.why ? ', ' + nba.why : ''));
    const ef = client.cashflow.emergencyFund || {target:0, current:0};
    if(ef.target > 0 && ef.current < ef.target){
      items.push('Emergency fund is ' + Math.round((ef.current/ef.target)*100) + '% funded, ' + fmtGBP(ef.target-ef.current) + ' short of target.');
    }
    const budgetFi = TEI.calc.computeBudgetAndFI(client);
    if(budgetFi.savings > 0){
      items.push(fmtGBP(budgetFi.savings) + '/month of disposable income is not yet directed toward a specific goal or account.');
    }
    const overdue = (client.goals||[]).filter(g=> g.status!=='completed' && g.targetDate && new Date(g.targetDate) < new Date());
    if(overdue.length){
      items.push(overdue.length + ' goal' + (overdue.length===1?'':'s') + ' past target date without being marked complete, worth a review.');
    }
    const pc = TEI.calc.computePortfolioCoach(client);
    if(pc.relevant) items.push(pc.message);
    // de-dupe against near-identical missing-info wording is not needed, opportunities and
    // gaps are deliberately different lists (what's missing vs what to act on next).
    return items.slice(0, 5);
  }
  function renderOverview(){
    const fullName = [client.personal.firstName, client.personal.lastName].filter(Boolean).join(' ');
    document.getElementById('ovClientName').textContent = fullName || client.meta.displayName || 'New Client';
    document.getElementById('ovLastUpdated').textContent = client.meta.lastUpdated
      ? 'Last exported ' + new Date(client.meta.lastUpdated).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : 'Not yet exported';
    const c = TEI.calc.completion(client);
    document.getElementById('ovCompletionPercent').textContent = c.percent + '%';
    document.getElementById('ovCompletionFill').style.width = c.percent + '%';
    document.getElementById('ovMissingList').innerHTML = c.missing.length
      ? c.missing.map(m=>`<li>${m.label} <span style="color:var(--cream-soft2);">(${m.section})</span></li>`).join('')
      : '<li style="color:var(--sage);">Nothing missing, the Foundation is complete.</li>';
    const opportunities = computeKeyOpportunities(client);
    document.getElementById('ovOpportunitiesList').innerHTML = opportunities.length
      ? opportunities.map(o=>`<li>${o}</li>`).join('')
      : '<li style="color:var(--cream-soft2);">Nothing flagged right now.</li>';
    renderHouseholdCard();
    renderInsightsTab(); // Insights was its own tab -- now just the last card on Overview.
  }
  /* Fetches and renders the household rollup card, only when this client is
     actually linked -- otherwise the card just stays hidden (its default
     state in the markup) so unlinked clients (most of them) render exactly
     as before. A stale request guard (householdRenderToken) stops an
     earlier, still-in-flight load from overwriting a newer client's card
     if the adviser switches clients quickly, since this is async and
     renderOverview does not await it. */
  let householdRenderToken = 0;
  async function renderHouseholdCard(){
    const card = document.getElementById('advHouseholdCard');
    const householdId = client.meta.householdId;
    if(!householdId){ card.style.display = 'none'; return; }
    const token = ++householdRenderToken;
    try{
      const summary = await TEI.wealthOS.loadHouseholdSummary(window.teiSupabase, householdId);
      if(token !== householdRenderToken) return; // a newer client's card has since started loading
      if(!summary){ card.style.display = 'none'; return; }
      const totals = TEI.calc.householdTotals(summary.bundles);
      document.getElementById('advHouseholdMembers').textContent = summary.members.map(m=>[m.first_name,m.last_name].filter(Boolean).join(' ').trim()||'Client').join(' & ');
      document.getElementById('advHouseholdNetWorth').textContent = fmtGBP(totals.netWorth);
      document.getElementById('advHouseholdIncome').textContent = fmtGBP(totals.monthlyIncome);
      document.getElementById('advHouseholdExpenditure').textContent = fmtGBP(totals.monthlyExpenditure);
      // Joint accounts across every member, read from each member's own bundle
      // (already loaded above) rather than a second query -- accounts stay
      // owned/edited on the member who added them (see accounts_select_joint_
      // household RLS), this is a read-only combined listing.
      const jointRows = [];
      summary.members.forEach((m,i)=>{
        (summary.bundles[i].accounts||[]).filter(a=>a.isJoint).forEach(a=>{
          jointRows.push(`<div class="lr-meta">${TEI.data.acctLabel(a)} · ${fmtGBP(a.value)} <span style="color:var(--cream-soft2);">(${[m.first_name,m.last_name].filter(Boolean).join(' ').trim()||'Client'})</span></div>`);
        });
      });
      document.getElementById('advHouseholdJointAccounts').innerHTML = jointRows.length
        ? `<div class="wizard-sub" style="margin:0 0 4px; color:var(--cream-soft);">Joint accounts</div>${jointRows.join('')}`
        : '';
      card.style.display = 'block';
    } catch(err){
      console.error('Wealth OS: failed to load household summary', err);
      if(token === householdRenderToken) card.style.display = 'none';
    }
  }

  /* ================= CLIENT UPDATES ================= */
  function renderUpdates(){
    const all = TEI.calc.collectClientUpdates(client);
    const since = client.meta.lastAdviserReview;
    const items = since ? all.filter(u=> u.at > since) : all;
    document.getElementById('upSinceLabel').textContent = since
      ? 'Showing changes since ' + new Date(since).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
      : 'Showing everything on file, nothing has been marked reviewed yet.';
    const list = document.getElementById('updatesList');
    list.innerHTML = items.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">Nothing new since last review.</div></div>`;
    items.slice(0, 40).forEach(u=>{
      const row = document.createElement('div');
      row.className = 'list-row';
      const when = new Date(u.at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      row.innerHTML = `<div class="lr-main"><b>${u.label}</b> <span class="tag-pill">${u.source}</span><div class="lr-meta">${u.section} · ${when}</div></div>`;
      list.appendChild(row);
    });
  }
  function markUpdatesReviewed(){
    client.meta.lastAdviserReview = new Date().toISOString();
    renderUpdates();
    showToast('Marked reviewed');
  }

  /* ================= INSIGHTS ================= */
  function renderInsightsTab(){
    const cards = [];
    const nba = TEI.calc.computeNextBestAction(client);
    if(client.accounts.length && nba && nba.text){
      cards.push({section:'Home', message: nba.text + (nba.why ? ', ' + nba.why : '')});
    }
    const budgetFi = TEI.calc.computeBudgetAndFI(client);
    const income = TEI.calc.totalMonthlyIncome(client);
    if(income > 0){
      const rate = (budgetFi.committedSaving/income*100);
      if(rate < 15) cards.push({section:'Cashflow', message: `Savings rate is ${rate.toFixed(0)}%, below the typical 15-20% benchmark.`});
    }
    const monthKeys = Object.keys(client.months||{}).sort();
    if(monthKeys.length >= 2){
      const latest = client.months[monthKeys[monthKeys.length-1]];
      const prev = client.months[monthKeys[monthKeys.length-2]];
      const latestTotal = TEI.calc.accountTotal(client, latest);
      const prevTotal = TEI.calc.accountTotal(client, prev);
      if(prevTotal > 0){
        const change = latestTotal - prevTotal;
        if(Math.abs(change) > 0) cards.push({section:'Wealth', message: `Net worth ${change>=0?'increased':'decreased'} by ${fmtGBP(Math.abs(change))} since last month's update.`});
      }
    }
    (client.goals||[]).forEach(g=>{
      if(g.status==='completed') return;
      const gp = TEI.calc.goalProgress(client, g);
      if(gp.pct >= 90 && gp.pct < 100) cards.push({section:'Goals', message: `${g.name} is ${gp.pct.toFixed(0)}% of the way there, close to target.`});
      if(g.targetDate && new Date(g.targetDate) < new Date()) cards.push({section:'Goals', message: `${g.name} has passed its target date (${g.targetDate}) without being marked complete.`});
    });
    const pc = TEI.calc.computePortfolioCoach(client);
    if(pc.relevant) cards.push({section:'Portfolio', message: pc.message});

    const list = document.getElementById('insightsList');
    list.innerHTML = cards.length ? '' : `<div class="empty-state" style="padding:14px 0;"><div class="small">Nothing worth flagging right now, insights appear here as the Foundation fills in and changes over time.</div></div>`;
    cards.forEach(c=>{
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="lr-main"><span class="tag-pill">${c.section}</span><div class="lr-meta" style="color:var(--cream); font-size:13px; margin-top:4px;">${c.message}</div></div>`;
      list.appendChild(row);
    });
  }

  function renderExportSummary(){
    document.getElementById('exportSummaryStats').innerHTML = `
      <div class="range-stat"><span class="rs-label">Accounts</span><b>${client.accounts.length}</b></div>
      <div class="range-stat"><span class="rs-label">Holdings</span><b>${client.holdings.length}</b></div>
      <div class="range-stat"><span class="rs-label">Goals</span><b>${client.goals.length}</b></div>
      <div class="range-stat"><span class="rs-label">Months logged</span><b>${Object.keys(client.months).length}</b></div>
      <div class="range-stat ${uploadQueue.some(q=>q.status==='pending')?'accent-down':'accent-up'}"><span class="rs-label">Upload queue pending</span><b>${uploadQueue.filter(q=>q.status==='pending').length}</b></div>
    `;
  }
  function exportClient(){
    client.meta.lastUpdated = new Date().toISOString();
    const blob = new Blob([JSON.stringify(client, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = clientId + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    document.getElementById('exportLastAction').textContent = 'Downloaded ' + clientId + '.json at ' + new Date().toLocaleTimeString('en-GB');
    showToast('Exported, this is a local snapshot, not saved back to your TEI account yet');
  }

  /* ================= INIT (shared client object, populated from Supabase by TEI.wealthOS) ================= */
  /* init(sharedClient) can run more than once per page load -- an adviser
     opening/creating clients from the client list goes through
     startClientView, which calls this every time. All the addEventListener
     wiring below must only ever run once, or every Add button ends up with
     N stacked listeners and a single click inserts the same new record N
     times (see the identical guard in the Onboarding and Feedback
     modules). `wired` guards that; everything above it just repaints the
     current `client` and is safe to repeat. */
  let wired = false;
  function wireAdviserControls(){
    wireTabs();
    wireSubtabs();
    document.getElementById('newGoalProgressType').addEventListener('change', toggleAdvGoalProgressFields);
    // The "Which income?" list is filtered by goal category (see
    // refreshAdvGoalLinkedIncomeOptions) so switching to/from "Build a
    // Business" needs to rebuild it too, even though visibility itself
    // only depends on progress type.
    document.getElementById('newGoalType').addEventListener('change', toggleAdvGoalProgressFields);
    wireUpload();

    document.getElementById('newAcctType').addEventListener('change', toggleAdvAcctContribFields);
    document.getElementById('newAcctRateType').addEventListener('change', toggleAdvAcctMaturityField);
    // Typing a new ISA allowance figure replaces an out-of-date one.
    document.getElementById('newAcctIsaAllowance').addEventListener('input', function(){ this.dataset.stale = ''; this.classList.remove('is-stale'); });
    setIsaAllowanceField(null);
    document.getElementById('addAcctBtn').addEventListener('click', addAccount);
    document.getElementById('saveMonthBtn').addEventListener('click', saveMonth);
    document.getElementById('saveHoldingMonthBtn').addEventListener('click', saveHoldingMonth);
    document.getElementById('advAddAssetBtn').addEventListener('click', addAsset);
    document.getElementById('advAddLiabBtn').addEventListener('click', addLiability);
    document.getElementById('addGoalBtn').addEventListener('click', addGoal);
    document.getElementById('addHoldingBtn').addEventListener('click', addHolding);
    document.getElementById('refreshLivePricesBtn').addEventListener('click', refreshLivePrices);
    document.getElementById('newHoldingTicker').addEventListener('input', updateHoldingFormForTicker);
    document.getElementById('addDivBtn').addEventListener('click', addDividend);
    document.getElementById('addDivHistBtn').addEventListener('click', addDividendHistory);
    document.getElementById('advAddIncomeBtn').addEventListener('click', addAdvIncome);
    document.getElementById('advAddFixedBtn').addEventListener('click', ()=>addAdvExpense('fixed'));
    document.getElementById('advAddVariableBtn').addEventListener('click', ()=>addAdvExpense('variable'));
    document.getElementById('advAddOneOffBtn').addEventListener('click', addAdvOneOff);
    document.getElementById('saveCashflowBtn').addEventListener('click', saveCashflow);
    document.getElementById('cfEfAccount').addEventListener('change', renderCalculatedSavingStats);
    document.getElementById('addDocBtn').addEventListener('click', addDocument);
    document.getElementById('newDocFile').addEventListener('change', toggleDocFileFields);
    document.getElementById('csvImportBtn').addEventListener('click', importHoldingsCsv);
    document.getElementById('exportBtn').addEventListener('click', exportClient);
    document.getElementById('markReviewedBtn').addEventListener('click', markUpdatesReviewed);
    wireContribEditor();
  }
  function init(sharedClient){
    client = sharedClient;
    clientId = client.meta.clientId || 'preview-client';
    const fullName = [client.personal.firstName, client.personal.lastName].filter(Boolean).join(' ');
    document.getElementById('advClientName').textContent = fullName || client.meta.displayName || clientId;
    document.getElementById('exportFilename').textContent = clientId + '.json';

    renderOverview();
    fillPersonalForm();
    renderAccounts();
    renderMonthlyBalanceFields();
    renderAssets();
    renderLiabilities();
    renderGoals();
    toggleAdvGoalProgressFields();
    renderHoldings();
    renderMonthlyHoldingFields();
    renderDividends();
    renderDividendHistory();
    wireInvestorStage();
    renderAdvIncomeList();
    renderAdvExpenseList('fixed');
    renderAdvExpenseList('variable');
    toggleAdvExpenseOwnerFields();
    toggleAdvAcctContribFields();
    renderAdvOneOffList();
    fillCashflowForm();
    renderDocuments();
    refreshAccountSelects();
    refreshAdvGoalLinkedIncomeOptions();
    renderUploadQueue();
    wireMonthPickers();
    updateHoldingFormForTicker();

    if(!wired){ wired = true; wireAdviserControls(); }
    resetContribUi();
    enhanceMobileCollapse();
  }

  /* Adviser Workspace on a phone was one continuous scroll through every
     card in whichever tab/subtab was open (Overview's four cards, each
     Manual Entry subtab's form-then-list-then-history stack, ...) --
     nothing to jump to, no way to see just the one thing you came for.
     Rather than restructuring the markup of every individual section
     (dozens of cards, several different section authors over time), this
     turns every top-level `.card` that has a leading <h3> into a
     collapsible one generically, phone-width only: the h3 becomes a tap
     target, everything else in the card gets moved into one wrapper div
     (same reparent-without-touching-ids trick #tab-manual itself uses)
     so it can be hidden/shown as a unit without disturbing any of the
     ids/handlers inside. Only ever wraps a given card once
     (data-mcollapse-done guard) -- safe to call again on every re-render,
     since renderXxx() functions replace a specific list/field container's
     innerHTML, never the static card shell itself. Desktop is untouched
     for most cards: this only wraps them below the 860px breakpoint the
     CSS collapse rules use. The exception is a card marked
     data-collapse-always (e.g. "Log a month's holdings") -- those get
     wrapped and start collapsed at ANY width, since an always-open
     history/log form buried mid-page was a request independent of screen
     size. First card in each tab/subtab panel opens expanded by default
     on mobile; the rest (and every data-collapse-always card, at any
     width) start collapsed. */
  function enhanceMobileCollapse(){
    const atMobile = window.innerWidth <= 860;
    // Deliberately document-wide, not scoped to #advBody: My Details (see
    // mountMyDetailsPanel in the client-app module) reparents #tab-manual
    // and its subtab-panels out of #advBody into the client page's own
    // host div, so scoping this query to #advBody would silently miss
    // every card in a client-role session's My Details page. .tab-panel/
    // .subtab-panel are only ever used by this workspace either way.
    document.querySelectorAll('.tab-panel, .subtab-panel').forEach(panel=>{
      let opened = false;
      panel.querySelectorAll(':scope > .card').forEach(card=>{
        if(card.dataset.mcollapseDone) return;
        const alwaysCollapse = card.hasAttribute('data-collapse-always');
        if(!atMobile && !alwaysCollapse) return; // desktop: only opted-in cards get wrapped
        // Most cards have a bare <h3> as their first child, but several
        // (anything with a month picker or extra controls next to the
        // title -- "Log a month's balances", "Holdings", ...) wrap the
        // <h3> in a flex-row <div> alongside those controls instead. Use
        // whichever is actually there as the tap target, so those do not
        // silently fall through as non-collapsible.
        const header = card.querySelector(':scope > h3') || card.querySelector(':scope > div:has(> h3)');
        if(!header) return; // no heading to tap -- leave this one alone
        card.classList.add('mcollapse');
        card.dataset.mcollapseDone = '1';
        header.classList.add('mcollapse-header');
        const chevron = document.createElement('span');
        chevron.className = 'mcollapse-chevron';
        chevron.textContent = '▸';
        header.appendChild(chevron);
        const body = document.createElement('div');
        body.className = 'mcollapse-body';
        let node = header.nextSibling;
        while(node){ const next = node.nextSibling; body.appendChild(node); node = next; }
        card.appendChild(body);
        if(atMobile && !alwaysCollapse && !opened){ card.classList.add('expanded'); opened = true; }
        header.addEventListener('click', (e)=>{
          // A header row can contain a real control (month picker, etc.) --
          // let taps on those work normally instead of also toggling the card.
          if(e.target.closest('input, select, button, a, textarea')) return;
          card.classList.toggle('expanded');
        });
      });
    });
  }

  /* ================= RECURRING CONTRIBUTION RULES =================
     005_pension_contribution_engine. The browser never calculates a
     contribution: the editor previews through preview_contribution, saves
     through save_contribution_rule, and everything shown afterwards is
     read back from the rule tables -- or, for the monthly total, from the
     legacy accounts.contribution_* fields the server syncs from that same
     calc_contribution on every rule version. */
  let crAccountId = null;   // account whose rule editor is open
  let crPreviewTimer = null;
  let crPreviewSeq = 0;
  let incomePromptId = null; // income row the inline "Income changed" prompt is for
  const REASON_LABEL = { created:'created', manual_edit:'edited', income_change:'income change', annual_uplift:'annual uplift' };

  function isAdviserView(){ return ((client.meta && client.meta.role) || 'adviser') === 'adviser'; }
  function contribState(){
    if(!client.contrib) client.contrib = { rules:[], state:{}, runs:[], flags:[] };
    return client.contrib;
  }
  function currentRule(accountId){ return contribState().rules.find(r=>r.account_id===accountId && !r.effective_to) || null; }
  function pendingFlags(accountId){ return contribState().flags.filter(f=>f.status==='pending' && (!accountId || f.account_id===accountId)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtGBP2(v){ const n = Number(v)||0; return (n<0?'-':'') + '£' + Math.abs(n).toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}); }
  function fmtPct(v){ return (Number(v)||0).toLocaleString('en-GB',{maximumFractionDigits:2}) + '%'; }
  function fmtDateShort(iso){
    if(!iso) return '';
    const d = new Date(String(iso).slice(0,10)+'T00:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  }
  function holdingName(id){ const h = client.holdings.find(x=>x.id===id); return h ? h.name : 'Removed fund'; }

  /* Automatic contributions credited to a fund after its last statement
     check -- a sum of the engine's run records, not a recalculation. */
  function contributionsSinceCheck(h){
    let total = 0;
    contribState().runs.forEach(run=>{
      if(run.status === 'reversed') return;
      if(h.valueCheckedAt && run.run_date <= h.valueCheckedAt) return;
      (run.allocations||[]).forEach(a=>{ if(a.holding_id === h.id) total += Number(a.amount)||0; });
    });
    return Math.round(total*100)/100;
  }
  function holdingCheckedHtml(h){
    if(!h.valueCheckedAt) return `<div class="ep-checked unchecked">Value not yet checked against a statement.</div>`;
    const since = contributionsSinceCheck(h);
    return `<div class="ep-checked">Value last checked ${fmtDateShort(h.valueCheckedAt)}.${since>0 ? ` Includes ${fmtGBP2(since)} of automatic contributions since.` : ''}</div>`;
  }
  function accountCheckedHtml(acc){
    const hs = client.holdings.filter(h=>h.accountId===acc.id);
    if(!hs.length) return `<div class="ep-checked">Manual-priced, add its funds under Holdings.</div>`;
    const checked = hs.filter(h=>h.valueCheckedAt);
    if(!checked.length) return `<div class="ep-checked unchecked">Manual-priced · value not yet checked against a statement.</div>`;
    const dates = checked.map(h=>h.valueCheckedAt).sort();
    const when = dates[0] === dates[dates.length-1] ? fmtDateShort(dates[0]) : `between ${fmtDateShort(dates[0])} and ${fmtDateShort(dates[dates.length-1])}`;
    const since = checked.reduce((s,h)=>s+contributionsSinceCheck(h), 0);
    const unchecked = hs.length - checked.length;
    return `<div class="ep-checked${unchecked?' unchecked':''}">Manual-priced · value last checked ${when}.${since>0 ? ` Includes ${fmtGBP2(since)} of automatic contributions since.` : ''}${unchecked ? ` ${unchecked} fund${unchecked>1?'s':''} not yet checked against a statement.` : ''}</div>`;
  }
  function contribRuleSummaryHtml(acc){
    if(!acc.hasContributionRule) return '';
    const rule = currentRule(acc.id);
    if(!rule) return '';
    const monthly = TEI.calc.acctContribTotal(acc);
    const flags = pendingFlags(acc.id);
    const basis = rule.basis === 'salary_derived' ? `salary-derived (${fmtGBP(rule.gross_annual_salary)} gross)` : 'fixed';
    return `<div class="ep-rule">Recurring contribution <strong>${fmtGBP2(monthly)}/mo</strong> on day ${rule.day_of_month} · ${basis}${Number(rule.annual_uplift_pct)>0 ? ' · uplift '+fmtPct(rule.annual_uplift_pct)+'/yr' : ''}${flags.length ? ` <span class="flag-badge" title="Income changed, review the contribution">${flags.length} pending flag${flags.length>1?'s':''}</span>` : ''}</div>`;
  }
  function contribTogglesHtml(acc){
    if(!isAdviserView()) return '';
    const hasHistory = contribState().rules.some(r=>r.account_id===acc.id);
    return `<div class="ep-toggles">
      <label><input type="checkbox" data-cr-manual="${acc.id}" ${acc.isManualPriced?'checked':''}> Manual-priced</label>
      <label><input type="checkbox" data-cr-rule="${acc.id}" ${acc.hasContributionRule?'checked':''}> Recurring contribution rule</label>
      ${acc.hasContributionRule || hasHistory ? `<button type="button" class="btn-ghost" data-cr-open="${acc.id}" style="padding:2px 9px; font-size:10.5px;">${acc.hasContributionRule?'Edit rule':'History'}</button>` : ''}
    </div>`;
  }
  function wireContribAccountControls(list){
    list.querySelectorAll('[data-cr-manual]').forEach(cb=> cb.addEventListener('change', ()=> toggleManualPriced(cb.dataset.crManual, cb.checked, cb)));
    list.querySelectorAll('[data-cr-rule]').forEach(cb=> cb.addEventListener('change', ()=> toggleContributionRule(cb.dataset.crRule, cb.checked, cb)));
    list.querySelectorAll('[data-cr-open]').forEach(b=> b.addEventListener('click', ()=> openRuleEditor(b.dataset.crOpen)));
  }

  async function toggleManualPriced(accountId, on, cb){
    const acc = client.accounts.find(a=>a.id===accountId);
    if(!acc) return;
    const autoCount = client.holdings.filter(h=>h.accountId===accountId && h.priceSource==='auto_us').length;
    const msg = on
      ? `Mark ${TEI.data.acctLabel(acc)} as manual-priced?\n\nFund values are entered by hand from statements, and scheduled pricing never touches this account.`
        + (autoCount ? `\n\n${autoCount} holding${autoCount>1?'s':''} currently on Auto (US) pricing will be switched to Manual.` : '')
      : `Turn off manual pricing for ${TEI.data.acctLabel(acc)}?\n\nHoldings stay on Manual pricing until you change them individually.`;
    if(!confirm(msg)){ cb.checked = !on; return; }
    cb.disabled = true;
    try{
      await TEI.wealthOS.contributionRules.setManualPriced(accountId, on);
    } catch(err){
      console.error('Wealth OS: failed to set manual pricing', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
      cb.checked = !on; cb.disabled = false;
      return;
    }
    await reloadContrib();
    showToast(on ? 'Account is now manual-priced' : 'Manual pricing turned off');
  }
  async function toggleContributionRule(accountId, on, cb){
    // Switching on just opens the editor -- the account's flag is only set
    // once a rule is actually saved.
    if(on){ if(cb) cb.checked = false; openRuleEditor(accountId); return; }
    const acc = client.accounts.find(a=>a.id===accountId);
    if(!acc) return;
    if(!confirm(`End the recurring contribution on ${TEI.data.acctLabel(acc)}?\n\nNo further contributions will be applied. Past contributions and the rule's history are kept.`)){
      if(cb) cb.checked = true;
      return;
    }
    try{
      await TEI.wealthOS.contributionRules.end(accountId);
    } catch(err){
      console.error('Wealth OS: failed to end contribution rule', err);
      showToast("Could not end the rule, " + (err.message || 'try again'));
      if(cb) cb.checked = true;
      return;
    }
    await reloadContrib();
    if(crAccountId === accountId) openRuleEditor(accountId);
    showToast('Rule ended, history kept');
  }

  /* Re-read the rule tables plus the account/holding rows an RPC may have
     changed (values, cost basis, legacy contribution fields, flags), so
     the in-memory client matches the server, then re-render. */
  async function reloadContrib(){
    let res;
    try{
      res = await TEI.wealthOS.contributionRules.reload(client.accounts.map(a=>a.id));
    } catch(err){
      console.error('Wealth OS: failed to refresh contribution data', err);
      showToast("Could not refresh contribution data, reload the page");
      return;
    }
    client.contrib = res.contrib;
    res.accounts.forEach(row=>{
      const acc = client.accounts.find(a=>a.id===row.id);
      if(!acc) return;
      Object.assign(acc, {
        value: row.value, lastUpdated: row.last_updated,
        contribution: row.contribution, contributionPersonal: row.contribution_personal, contributionSacrifice: row.contribution_sacrifice,
        isManualPriced: !!row.is_manual_priced, hasContributionRule: !!row.has_contribution_rule
      });
    });
    res.holdings.forEach(row=>{
      const h = client.holdings.find(x=>x.id===row.id);
      if(!h) return;
      Object.assign(h, { value: row.value, costBasis: row.cost_basis, priceSource: row.price_source || 'manual', valueCheckedAt: row.value_checked_at || null });
    });
    renderAccounts(); renderHoldings(); renderMonthlyHoldingFields(); renderMonthlyBalanceFields();
    updateHoldingFormForManualPriced();
    if(crAccountId) renderRuleEditorAux();
    renderIncomeFlagPrompt();
    if(typeof TEI.render.portfolio === 'function') TEI.render.portfolio(client);
  }

  /* ---------- rule editor ---------- */
  function crEl(id){ return document.getElementById(id); }
  function closeRuleEditor(){
    crAccountId = null;
    crEl('contribRuleCard').hidden = true;
  }
  function openRuleEditor(accountId){
    const acc = client.accounts.find(a=>a.id===accountId);
    if(!acc || !isAdviserView()) return;
    crAccountId = accountId;
    const card = crEl('contribRuleCard');
    card.hidden = false;
    card.classList.add('expanded');
    crEl('crAcctName').textContent = TEI.data.acctLabel(acc);
    const rule = currentRule(accountId);
    const salary = rule && rule.basis === 'salary_derived';
    const v = (x)=> x==null ? '' : x;
    crEl('crBasis').value = rule ? rule.basis : 'fixed';
    crEl('crMethod').value = rule ? rule.allocation_method : 'percentage';
    crEl('crTotal').value = rule ? v(rule.total_amount) : '';
    crEl('crDay').value = rule ? rule.day_of_month : Math.min(new Date().getDate(), 28);
    crEl('crUplift').value = rule ? (Number(rule.annual_uplift_pct)||0) : 0;
    crEl('crPersonalMethod').value = rule && !salary ? (rule.contribution_method || '') : '';
    crEl('crGross').value = salary ? v(rule.gross_annual_salary) : '';
    crEl('crPensionable').value = salary && rule.pensionable_basis ? rule.pensionable_basis : 'full_salary';
    crEl('crEmployeePct').value = salary ? v(rule.employee_pct) : '';
    crEl('crEmployerPct').value = salary ? v(rule.employer_pct) : '';
    crEl('crMatchCap').value = salary ? v(rule.employer_match_cap_pct) : '';
    crEl('crSalaryMethod').value = salary && rule.contribution_method ? rule.contribution_method : 'relief_at_source';
    crEl('crNiPasson').value = salary && rule.employer_ni_passon_pct != null ? Number(rule.employer_ni_passon_pct) : 0;
    const incSel = crEl('crLinkedIncome');
    incSel.innerHTML = '<option value="">Not linked</option>' + client.cashflow.income.map(i=>
      `<option value="${i.id}">${esc(i.type||'Income')} (${i.owner==='partner'?'partner':'client'}), ${fmtGBP(i.amount)} ${esc(i.frequency||'')}</option>`).join('');
    incSel.value = salary && rule.linked_income_id ? rule.linked_income_id : '';
    renderRuleFunds(rule);
    crEl('crEndBtn').hidden = !rule;
    crEl('crSaveBtn').textContent = rule ? 'Save as new version' : 'Save rule';
    syncRuleEditorChrome();
    renderRuleEditorAux();
    schedulePreview(0);
    card.scrollIntoView({behavior:'smooth', block:'start'});
  }
  function syncRuleEditorChrome(){
    const salary = crEl('crBasis').value === 'salary_derived';
    if(salary) crEl('crMethod').value = 'percentage';
    crEl('crMethod').disabled = salary;
    crEl('crMethod').title = salary ? 'Salary-derived rules always split by percentage' : '';
    crEl('crSalaryFields').hidden = !salary;
    crEl('crTotalField').hidden = salary || crEl('crMethod').value !== 'percentage';
    const acc = client.accounts.find(a=>a.id===crAccountId);
    crEl('crPersonalMethodField').hidden = salary || !(acc && acc.type === 'pension');
    crEl('crNiPassonField').hidden = !salary || crEl('crSalaryMethod').value !== 'salary_sacrifice';
    fillFundInputs();
  }
  /* One input per fund; the weight and the £ amount are both remembered
     (data-w / data-amt) so flipping Percentage <-> Manual does not lose
     what was typed. Only manually priced funds can take contributions --
     the engine never adds to a fund a price feed would overwrite. */
  function renderRuleFunds(rule){
    const wrap = crEl('crFunds');
    const hs = client.holdings.filter(h=>h.accountId===crAccountId);
    const allocs = {};
    (rule ? rule.allocations : []).forEach(a=>{ allocs[a.holding_id] = a; });
    if(!hs.length){
      wrap.innerHTML = `<div class="small" style="color:var(--cream-soft2);">No funds in this account yet, add them under Holdings first.</div>`;
      return;
    }
    wrap.innerHTML = hs.map(h=>{
      const manual = h.priceSource !== 'auto_us';
      const a = allocs[h.id];
      return `<div class="cr-fund${manual?'':' disabled'}">
        <span>${esc(h.name)}${h.ticker?` <span style="color:var(--cream-soft2); font-size:11px;">${esc(h.ticker)}</span>`:''}</span>
        <input type="number" step="0.01" min="0" data-cr-fund="${h.id}" data-w="${a && a.weight_pct!=null ? Number(a.weight_pct) : ''}" data-amt="${a && a.amount!=null ? Number(a.amount) : ''}" ${manual?'':'disabled'} aria-label="${esc(h.name)}">
        ${manual ? '' : `<span class="cr-why">Auto-priced (US), contributions only go into manually priced funds, since a price feed would overwrite them. Set this fund to Manual pricing (or mark the account manual-priced) to include it.</span>`}
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-cr-fund]').forEach(inp=> inp.addEventListener('input', ()=>{
      if(crEl('crMethod').value === 'percentage') inp.dataset.w = inp.value; else inp.dataset.amt = inp.value;
      schedulePreview();
    }));
    fillFundInputs();
  }
  function fillFundInputs(){
    const pct = crEl('crMethod').value === 'percentage';
    crEl('crFunds').querySelectorAll('[data-cr-fund]').forEach(inp=>{
      inp.value = pct ? inp.dataset.w : inp.dataset.amt;
      inp.placeholder = pct ? '% of total' : '£ per month';
    });
  }
  function rulePayload(){
    const num = id=>{ const x = crEl(id).value; return x === '' ? null : parseFloat(x); };
    const salary = crEl('crBasis').value === 'salary_derived';
    const method = salary ? 'percentage' : crEl('crMethod').value;
    const allocations = Array.from(crEl('crFunds').querySelectorAll('[data-cr-fund]:not([disabled])'))
      .map(inp=>({ holding_id: inp.dataset.crFund, w: parseFloat(inp.dataset.w), amt: parseFloat(inp.dataset.amt) }))
      .filter(x=> method === 'percentage' ? x.w > 0 : x.amt > 0)
      .map(x=> method === 'percentage' ? { holding_id: x.holding_id, weight_pct: x.w } : { holding_id: x.holding_id, amount: x.amt });
    const p = {
      account_id: crAccountId, basis: salary ? 'salary_derived' : 'fixed', allocation_method: method,
      day_of_month: num('crDay'), annual_uplift_pct: num('crUplift') || 0, allocations
    };
    if(salary){
      Object.assign(p, {
        gross_annual_salary: num('crGross'), pensionable_basis: crEl('crPensionable').value,
        employee_pct: num('crEmployeePct'), employer_pct: num('crEmployerPct') || 0, employer_match_cap_pct: num('crMatchCap') || 0,
        contribution_method: crEl('crSalaryMethod').value, linked_income_id: crEl('crLinkedIncome').value || null,
        employer_ni_passon_pct: crEl('crSalaryMethod').value === 'salary_sacrifice' ? (num('crNiPasson') || 0) : 0
      });
    } else {
      const acc = client.accounts.find(a=>a.id===crAccountId);
      p.total_amount = method === 'percentage' ? num('crTotal') : null;
      p.contribution_method = acc && acc.type === 'pension' ? (crEl('crPersonalMethod').value || null) : null;
    }
    return p;
  }
  function schedulePreview(delay){
    clearTimeout(crPreviewTimer);
    crPreviewTimer = setTimeout(runPreview, delay==null ? 300 : delay);
  }
  async function runPreview(){
    if(!crAccountId) return;
    const seq = ++crPreviewSeq;
    const p = rulePayload();
    // Entry feedback only (not a contribution figure): do the weights add up?
    const help = crEl('crFundsTotal');
    if(p.allocation_method === 'percentage'){
      const w = p.allocations.reduce((s,a)=>s+a.weight_pct, 0);
      help.textContent = `Weights total ${fmtPct(w)}${Math.abs(w-100) > 0.0005 ? ', must add up to 100%' : ''}`;
    } else {
      help.textContent = 'Each fund receives the amount entered.';
    }
    let res;
    try{
      res = await TEI.wealthOS.contributionRules.preview(p);
    } catch(err){
      if(seq === crPreviewSeq) crEl('crBreakdown').textContent = "Could not calculate, " + (err.message || 'try again');
      return;
    }
    if(seq !== crPreviewSeq || !crAccountId) return;
    renderBreakdown(res, p);
  }
  function renderBreakdown(res, p){
    const rows = [];
    if(res.basis === 'salary_derived'){
      rows.push(['Pensionable pay', fmtGBP(res.pensionable_pay) + '/yr' + (p.pensionable_basis === 'qualifying_earnings' ? ' (qualifying earnings)' : '')]);
      rows.push([`Employee ${fmtPct(p.employee_pct)} (gross)`, fmtGBP2(res.employee_gross)]);
      const core = Number(res.employer_core_pct)||0, eff = Number(res.employer_effective_pct)||0;
      rows.push([res.employer_match_applied
        ? `Employer ${fmtPct(eff)}, matching the employee (core is ${fmtPct(core)})`
        : `Employer ${fmtPct(core)} core`, fmtGBP2(res.employer)]);
    }
    if(res.contribution_method === 'relief_at_source'){
      rows.push(['Client pays from take-home pay', fmtGBP2(res.client_pays)]);
      rows.push(['Basic-rate relief added (relief at source)', fmtGBP2(res.relief_amount)]);
    } else if(res.contribution_method === 'salary_sacrifice'){
      if(Number(res.employer_ni_passon) > 0){
        rows.push([`Employer NI saving passed on (${fmtPct(res.employer_ni_passon_pct)} of ${fmtGBP2(res.employer_ni_saving)})`, fmtGBP2(res.employer_ni_passon)]);
      }
      rows.push(['Salary sacrificed (from gross pay)', fmtGBP2(res.sacrifice_amount)]);
    }
    // Information only -- the client's own NI saving stays in take-home pay.
    const info = [];
    if(res.contribution_method === 'salary_sacrifice' && Number(res.employee_ni_saving) > 0){
      info.push(['Client\'s NI saving (stays in take-home pay, not added to funds)', fmtGBP2(res.employee_ni_saving)]);
    }
    if(res.contribution_method === 'salary_sacrifice' && Number(res.employer_ni_saving) > 0 && !(Number(res.employer_ni_passon) > 0)){
      info.push(['Employer\'s NI saving (kept by the employer)', fmtGBP2(res.employer_ni_saving)]);
    }
    const split = (res.allocations||[]).map(a=>[`→ ${esc(holdingName(a.holding_id))}`, fmtGBP2(a.amount)]);
    crEl('crBreakdown').innerHTML = `<table>
      ${rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}
      <tr class="total"><td>Total into funds each month</td><td>${fmtGBP2(res.total)}</td></tr>
      ${split.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}
      ${info.map(r=>`<tr style="opacity:.75; font-size:12px;"><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}
    </table>`;
    crEl('crAppliesFrom').textContent = res.next_run_date
      ? `Applies from ${fmtDateShort(res.next_run_date)}. No back-dating.`
      : 'No back-dating, applies from the next scheduled day.';
  }
  async function saveRule(){
    if(!crAccountId) return;
    const btn = crEl('crSaveBtn');
    btn.disabled = true;
    let res;
    try{
      res = await TEI.wealthOS.contributionRules.save(crAccountId, rulePayload());
    } catch(err){
      console.error('Wealth OS: failed to save contribution rule', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
    await reloadContrib();
    openRuleEditor(crAccountId);
    showToast(`Rule saved (version ${res.version}), applies from ${fmtDateShort(res.next_run_date)}. No back-dating.`);
  }

  /* ---------- history, versions, flags inside the editor ---------- */
  function describeRule(r){
    if(r.basis === 'salary_derived'){
      const method = r.contribution_method === 'salary_sacrifice' ? 'salary sacrifice' : 'relief at source';
      return `${fmtGBP(r.gross_annual_salary)} gross · employee ${fmtPct(r.employee_pct)} · employer ${fmtPct(r.employer_pct)}${Number(r.employer_match_cap_pct)>0 ? ` (matches to ${fmtPct(r.employer_match_cap_pct)})` : ''} · ${method}${Number(r.employer_ni_passon_pct)>0 ? ` + ${fmtPct(r.employer_ni_passon_pct)} employer NI saving` : ''}`;
    }
    if(r.allocation_method === 'percentage') return `${fmtGBP2(r.total_amount)}/mo fixed`;
    return 'fixed, manual amounts per fund';
  }
  function renderRuleEditorAux(){
    if(!crAccountId) return;
    const flagsBox = crEl('crFlags');
    flagsBox.innerHTML = pendingFlags(crAccountId).map(flagPanelHtml).join('');
    wireFlagPanels(flagsBox);

    const runs = contribState().runs.filter(r=>r.account_id===crAccountId);
    const runsBox = crEl('crRuns');
    runsBox.innerHTML = runs.length ? runs.map(run=>{
      const parts = [];
      if(Number(run.employer_amount) > 0) parts.push('employer ' + fmtGBP2(run.employer_amount));
      if(Number(run.sacrifice_amount) > 0) parts.push('salary sacrifice ' + fmtGBP2(run.sacrifice_amount));
      if(Number(run.relief_amount) > 0) parts.push('tax relief ' + fmtGBP2(run.relief_amount));
      const split = (run.allocations||[]).map(a=>`${esc(holdingName(a.holding_id))} ${fmtGBP2(a.amount)}`).join(' · ');
      return `<div class="cr-run ${run.status}">
        <div class="cr-run-head"><span>${fmtDateShort(run.run_date)}${run.status !== 'applied' ? ` <span class="tag-pill">${run.status}</span>` : ''}</span><strong>${fmtGBP2(run.total_amount)}</strong></div>
        <div>${split}${parts.length ? ', incl. ' + parts.join(', ') : ''}</div>
        ${run.correction_note ? `<div class="small" style="margin-top:3px;">Note: ${esc(run.correction_note)}${run.corrected_at ? ' (' + fmtDateShort(run.corrected_at) + ')' : ''}</div>` : ''}
        ${run.status !== 'reversed' ? `<div class="cr-run-actions"><button type="button" class="btn-ghost" data-run-reverse="${run.id}">Reverse</button><button type="button" class="btn-ghost" data-run-adjust="${run.id}">Adjust</button></div>` : ''}
        <div data-run-adjust-box="${run.id}"></div>
      </div>`;
    }).join('') : `<div class="small" style="color:var(--cream-soft2);">No contributions applied yet.</div>`;
    runsBox.querySelectorAll('[data-run-reverse]').forEach(b=> b.addEventListener('click', ()=> reverseRun(b.dataset.runReverse)));
    runsBox.querySelectorAll('[data-run-adjust]').forEach(b=> b.addEventListener('click', ()=> openAdjustRun(b.dataset.runAdjust)));

    const versions = contribState().rules.filter(r=>r.account_id===crAccountId).sort((a,b)=>b.version-a.version);
    crEl('crVersions').innerHTML = versions.length ? versions.map(r=>
      `<div>v${r.version} · ${fmtDateShort(r.effective_from)}${r.effective_to ? (r.effective_to < r.effective_from ? ' (replaced same day)' : ' – ' + fmtDateShort(r.effective_to)) : ' onwards <b style="color:var(--cream);">(current)</b>'} · ${REASON_LABEL[r.change_reason] || esc(r.change_reason || '')} · ${describeRule(r)} · day ${r.day_of_month}</div>`
    ).join('') : 'No rule yet.';
  }
  async function reverseRun(runId){
    const run = contribState().runs.find(r=>r.id===runId);
    if(!run) return;
    const note = prompt(`Reverse the ${fmtGBP2(run.total_amount)} contribution of ${fmtDateShort(run.run_date)}?\n\nCost basis and that month's deposits are reduced. Fund values are reduced too, unless a statement value has been entered since (then the statement stands).\n\nReason (saved with the run):`);
    if(note === null) return;
    try{
      const res = await TEI.wealthOS.contributionRules.reverseRun(runId, note.trim() || 'Reversed');
      showToast(res.message || 'Reversed');
    } catch(err){
      console.error('Wealth OS: failed to reverse contribution', err);
      showToast("Could not reverse, " + (err.message || 'try again'));
      return;
    }
    await reloadContrib();
  }
  function openAdjustRun(runId){
    const run = contribState().runs.find(r=>r.id===runId);
    const box = document.querySelector(`[data-run-adjust-box="${runId}"]`);
    if(!run || !box) return;
    box.innerHTML = `<div class="cr-funds" style="margin-top:8px;">
      ${(run.allocations||[]).map(a=>`<div class="cr-fund"><span>${esc(holdingName(a.holding_id))}</span><input type="number" step="0.01" min="0" data-adj-fund="${a.holding_id}" value="${Number(a.amount)}"></div>`).join('')}
      <label class="form-field"><span>Note (required)</span><input type="text" data-adj-note placeholder="e.g. payslip showed £280"></label>
      <div class="cr-run-actions"><button type="button" class="btn-primary" data-adj-apply>Apply adjustment</button><button type="button" class="btn-ghost" data-adj-cancel>Cancel</button></div>
    </div>`;
    box.querySelector('[data-adj-cancel]').addEventListener('click', ()=>{ box.innerHTML = ''; });
    box.querySelector('[data-adj-apply]').addEventListener('click', async ()=>{
      const allocations = Array.from(box.querySelectorAll('[data-adj-fund]')).map(inp=>({ holding_id: inp.dataset.adjFund, amount: parseFloat(inp.value)||0 }));
      const note = box.querySelector('[data-adj-note]').value.trim();
      if(!note){ showToast('Add a note explaining the adjustment'); return; }
      try{
        const res = await TEI.wealthOS.contributionRules.adjustRun(runId, allocations, note);
        showToast(res.message || 'Adjusted');
      } catch(err){
        console.error('Wealth OS: failed to adjust contribution', err);
        showToast("Could not adjust, " + (err.message || 'try again'));
        return;
      }
      await reloadContrib();
    });
  }

  /* ---------- income-change flags ---------- */
  function flagPanelHtml(f){
    const acc = client.accounts.find(a=>a.id===f.account_id);
    const s = f.suggested;
    const inc = `${fmtGBP(f.old_amount)} ${esc(f.old_frequency||'')} → ${fmtGBP(f.new_amount)} ${esc(f.new_frequency||'')}`;
    return `<div class="cr-flag" data-flag="${f.id}">
      <b>Income changed, does this affect the pension contribution?</b>
      <div>${esc(acc ? TEI.data.acctLabel(acc) : 'Account')} · linked income ${inc}</div>
      ${s
        ? `<div>Suggested gross salary <b>${fmtGBP(s.gross_annual_salary)}</b> <span style="color:var(--gold);">(estimate, confirm from payslip or fact find)</span> → new total <b>${fmtGBP2(s.total_monthly)}/mo</b>${s.current_total_monthly != null ? ` (currently ${fmtGBP2(s.current_total_monthly)}/mo)` : ''}</div>`
        : `<div>No estimate available for this income, enter the new gross salary from the payslip or fact find.</div>`}
      <div class="cr-flag-actions">
        ${s ? `<button type="button" class="btn-primary" data-flag-accept="${f.id}">Accept</button>` : ''}
        <button type="button" class="btn-ghost" data-flag-edit="${f.id}">Edit figure</button>
        <span data-flag-edit-box="${f.id}" hidden><input type="number" step="0.01" min="0" placeholder="Gross salary £" data-flag-gross="${f.id}" value="${s ? Number(s.gross_annual_salary) : ''}"> <button type="button" class="btn-primary" data-flag-accept-edited="${f.id}">Accept figure</button></span>
        <button type="button" class="btn-ghost" data-flag-dismiss="${f.id}">Not affected</button>
      </div>
    </div>`;
  }
  function wireFlagPanels(container){
    container.querySelectorAll('[data-flag-accept]').forEach(b=> b.addEventListener('click', ()=> resolveFlag(b.dataset.flagAccept, 'accept', null)));
    container.querySelectorAll('[data-flag-dismiss]').forEach(b=> b.addEventListener('click', ()=> resolveFlag(b.dataset.flagDismiss, 'dismiss', null)));
    container.querySelectorAll('[data-flag-edit]').forEach(b=> b.addEventListener('click', ()=>{
      const box = container.querySelector(`[data-flag-edit-box="${b.dataset.flagEdit}"]`);
      if(box){ box.hidden = false; box.style.display = 'inline-flex'; box.style.gap = '8px'; }
    }));
    container.querySelectorAll('[data-flag-accept-edited]').forEach(b=> b.addEventListener('click', ()=>{
      const id = b.dataset.flagAcceptEdited;
      const gross = parseFloat((container.querySelector(`[data-flag-gross="${id}"]`)||{}).value);
      if(!(gross > 0)){ showToast('Enter the gross annual salary'); return; }
      resolveFlag(id, 'accept', gross);
    }));
  }
  async function resolveFlag(flagId, action, gross){
    let res;
    try{
      res = await TEI.wealthOS.contributionRules.resolveFlag(flagId, action, gross);
    } catch(err){
      console.error('Wealth OS: failed to resolve contribution flag', err);
      showToast('That did not save. ' + (err.message || 'Please try again.'));
      return;
    }
    showToast(action === 'accept'
      ? `New rule version, ${fmtGBP2(res.calc && res.calc.total)}/mo, applies from ${fmtDateShort(res.next_run_date)}`
      : 'Marked not affected, no change to the contribution');
    await reloadContrib();
    refreshAllClientFlags();
  }
  // Inline under the Cashflow income form, right after an income edit.
  function renderIncomeFlagPrompt(incomeId){
    if(incomeId !== undefined) incomePromptId = incomeId;
    const box = document.getElementById('advIncomeFlagPrompt');
    if(!box) return;
    const flags = incomePromptId && isAdviserView() ? pendingFlags().filter(f=>f.income_id === incomePromptId) : [];
    box.innerHTML = flags.map(flagPanelHtml).join('');
    wireFlagPanels(box);
  }
  // Adviser-level list: pending flags across every client.
  async function refreshAllClientFlags(){
    const card = document.getElementById('contribFlagsCard');
    if(!card) return;
    if(!isAdviserView()){ card.hidden = true; return; }
    let rows;
    try{
      rows = await TEI.wealthOS.contributionRules.pendingFlagsAllClients();
    } catch(err){
      console.warn('Wealth OS: could not load contribution flags', err);
      card.hidden = true;
      return;
    }
    card.hidden = !rows.length;
    const list = document.getElementById('contribFlagsAll');
    list.innerHTML = rows.map(r=>{
      const a = r.accounts || {};
      const c = a.clients || {};
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client';
      const isThis = a.client_id === client.meta.clientId;
      return `<div class="list-row"><div class="lr-main"><b>${esc(name)}</b><div class="lr-meta">${esc(TEI.data.acctLabel({provider:a.provider, type:a.type}))} · flagged ${fmtDateShort(r.created_at)}${r.suggested ? ` · suggested ${fmtGBP(r.suggested.gross_annual_salary)} gross (estimate)` : ''}</div></div>
        <div class="lr-actions">${isThis
          ? `<button type="button" class="btn-ghost" data-cr-open="${r.account_id}" style="padding:5px 12px; font-size:11px;">Review</button>`
          : `<a class="btn-ghost" href="?client=${encodeURIComponent(a.client_id)}" style="padding:5px 12px; font-size:11px;">Open client</a>`}</div></div>`;
    }).join('');
    list.querySelectorAll('[data-cr-open]').forEach(b=> b.addEventListener('click', ()=> openRuleEditor(b.dataset.crOpen)));
  }
  function wireContribEditor(){
    ['crBasis','crMethod'].forEach(id=> crEl(id).addEventListener('change', ()=>{ syncRuleEditorChrome(); schedulePreview(); }));
    ['crTotal','crDay','crUplift','crGross','crEmployeePct','crEmployerPct','crMatchCap'].forEach(id=> crEl(id).addEventListener('input', ()=> schedulePreview()));
    ['crPersonalMethod','crPensionable','crLinkedIncome'].forEach(id=> crEl(id).addEventListener('change', ()=> schedulePreview()));
    crEl('crSalaryMethod').addEventListener('change', ()=>{ syncRuleEditorChrome(); schedulePreview(); });
    crEl('crNiPasson').addEventListener('input', ()=> schedulePreview());
    crEl('crSaveBtn').addEventListener('click', saveRule);
    crEl('crCancelBtn').addEventListener('click', closeRuleEditor);
    crEl('crEndBtn').addEventListener('click', ()=>{ if(crAccountId) toggleContributionRule(crAccountId, false, null); });
    document.getElementById('newHoldingAccount').addEventListener('change', updateHoldingFormForManualPriced);
  }
  function resetContribUi(){
    closeRuleEditor();
    renderIncomeFlagPrompt(null);
    updateHoldingFormForManualPriced();
    refreshAllClientFlags();
  }

  function refresh(){
    clientId = client.meta.clientId || 'preview-client';
    renderOverview();
    const fullName = [client.personal.firstName, client.personal.lastName].filter(Boolean).join(' ');
    document.getElementById('advClientName').textContent = fullName || client.meta.displayName || clientId;
    document.getElementById('exportFilename').textContent = clientId + '.json';
    fillPersonalForm();
    renderAccounts();
    renderMonthlyBalanceFields();
    renderAssets();
    renderLiabilities();
    renderGoals();
    renderHoldings();
    renderMonthlyHoldingFields();
    renderDividends();
    renderDividendHistory();
    wireInvestorStage();
    renderAdvIncomeList();
    renderAdvExpenseList('fixed');
    renderAdvExpenseList('variable');
    toggleAdvExpenseOwnerFields();
    toggleAdvAcctContribFields();
    renderAdvOneOffList();
    fillCashflowForm();
    renderDocuments();
    refreshAccountSelects();
    refreshAdvGoalLinkedIncomeOptions();
    resetContribUi();
    enhanceMobileCollapse();
  }

  /* Settings shows these forms to clients one record at a time in a side
     panel (TEI.settings): it resets a form before filling or adding, so an
     abandoned edit never makes "Add" overwrite the record being edited. */
  const forms = {
    cancel: { account: cancelAcctEdit, holding: cancelHoldingEdit, asset: cancelAssetEdit, liability: cancelLiabEdit,
      income: cancelAdvIncomeEdit, expense: cancelAdvExpenseEdit }
  };
  TEI.adviser = { init, refresh, refreshLivePrices, forms };
})();

