/**
 * Clients controller — list + full workspace (Screen: Client List + Client
 * Workspace detail). Replaces the old, separate client-workspace.js and the
 * old narrow clients.js (Client Context only) -- Client Context is folded in
 * here as one card among several, not a separate screen. Requires
 * admin-auth.js, cortex-client.js, and wealth-os-client.js loaded first.
 */
(function () {
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtCurrency(n) { return '£' + Math.round(Number(n || 0)).toLocaleString('en-GB'); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB') : '—'; }
  function fmtDateTime(d) { return d ? new Date(d).toLocaleString('en-GB') : '—'; }
  function numOrNull(v) { return v === '' || v == null ? null : Number(v); }
  function clientName(c) { return ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Unnamed client'; }
  function ageFromDob(dob) {
    if (!dob) return null;
    var d = new Date(dob), now = new Date();
    var age = now.getFullYear() - d.getFullYear();
    var m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
  }

  // ================= LIST VIEW =================

  function initList(supabase) {
    var root = document.getElementById('pickerList');
    Promise.all([
      WealthOsClient.listClients(supabase),
      WealthOsClient.getPortfolioTotalsByClient(supabase),
    ]).then(function (results) {
      var clients = results[0], totals = results[1];
      if (!clients.length) {
        root.innerHTML = '<li class="pipeline-empty">No clients found.</li>';
        return;
      }
      root.innerHTML = clients.map(function (c) {
        return (
          '<li><a class="picker-row" href="/admin/clients.html?id=' + encodeURIComponent(c.id) + '">' +
            '<span class="picker-name">' + escapeHtml(clientName(c)) + '</span>' +
            '<span class="picker-meta">' +
              '<span>' + escapeHtml(c.risk_profile || '—') + '</span>' +
              '<span>' + fmtCurrency(totals[c.id] || 0) + '</span>' +
              '<span>' + fmtDate(c.last_updated) + '</span>' +
            '</span>' +
          '</a></li>'
        );
      }).join('');
    }).catch(function (err) {
      root.innerHTML = '<li class="pipeline-empty">Could not load clients: ' + escapeHtml(err.message || err) + '</li>';
    });
  }

  // ================= DETAIL VIEW =================

  function initDetail(supabase, clientId) {
    Promise.all([
      WealthOsClient.getClientSummary(supabase, clientId),
      WealthOsClient.getAccountsAndHoldings(supabase, clientId),
      WealthOsClient.getGoals(supabase, clientId),
      WealthOsClient.getInvestmentPlan(supabase, clientId),
      WealthOsClient.listPlanHistory(supabase, clientId),
      WealthOsClient.listDecisions(supabase, clientId),
      CortexClient.getClientContext(supabase, clientId),
      CortexClient.listClientNotes(supabase, clientId),
      CortexClient.listFollowUps(supabase, clientId),
      CortexClient.listClientDocuments(supabase, clientId),
    ]).then(function (results) {
      var client = results[0], accHold = results[1], goalsData = results[2],
        planData = results[3], planHistory = results[4], decisions = results[5],
        context = results[6], notes = results[7], followUps = results[8], documents = results[9];

      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('workspaceRoot').style.display = 'grid';

      renderSummary(client);
      renderPortfolio(accHold);
      renderGoals(goalsData.goals);
      renderContext(supabase, clientId, context);
      renderPlan(supabase, clientId, planData, planHistory, accHold.accounts);
      renderDecisions(supabase, clientId, decisions);
      renderDocuments(supabase, clientId, documents);
      renderNotes(supabase, clientId, notes);
      renderFollowUps(supabase, clientId, followUps, decisions);
    }).catch(function (err) {
      document.getElementById('loadingState').textContent = 'Could not load this client: ' + (err.message || err);
    });
  }

  // ---------- Client Summary ----------

  function renderSummary(client) {
    var name = clientName(client);
    document.getElementById('clientHeading').textContent = name;
    document.title = name + ' — TEI Cortex';
    var age = ageFromDob(client.dob);
    var rows = [
      ['Age', age != null ? age : '—'],
      ['Employment', client.employment_status || '—'],
      ['Risk profile', client.risk_profile || '—'],
    ];
    if (client.north_star && client.north_star.goalLabel) rows.push(['North Star goal', client.north_star.goalLabel]);
    document.getElementById('summaryCard').innerHTML =
      '<h2>Client Summary</h2><table class="data-table"><tbody>' +
      rows.map(function (r) {
        return '<tr><td style="width:160px;color:var(--ink-soft);">' + escapeHtml(r[0]) + '</td><td>' + escapeHtml(String(r[1])) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  // ---------- Portfolio Snapshot ----------

  function renderPortfolio(accHold) {
    var accounts = accHold.accounts, holdings = accHold.holdings;
    var total = accounts.reduce(function (s, a) { return s + Number(a.value || 0); }, 0);

    var byType = {};
    accounts.forEach(function (a) { byType[a.type] = (byType[a.type] || 0) + Number(a.value || 0); });
    var typeRows = Object.keys(byType).map(function (t) {
      var pct = total ? (byType[t] / total * 100) : 0;
      return '<tr><td>' + escapeHtml(t.toUpperCase()) + '</td><td>' + fmtCurrency(byType[t]) + '</td><td>' + pct.toFixed(1) + '%</td></tr>';
    }).join('');

    var holdingCountByAccount = {};
    holdings.forEach(function (h) { holdingCountByAccount[h.account_id] = (holdingCountByAccount[h.account_id] || 0) + 1; });
    var accRows = accounts.map(function (a) {
      return '<tr><td>' + escapeHtml(a.provider || '—') + '</td><td>' + escapeHtml(a.type) + '</td><td>' +
        fmtCurrency(a.value) + '</td><td>' + (holdingCountByAccount[a.id] || 0) + '</td><td>' + fmtDate(a.last_updated) + '</td></tr>';
    }).join('');

    document.getElementById('portfolioCard').innerHTML =
      '<h2>Portfolio Snapshot</h2>' +
      '<div class="stat-tile"><div class="stat-label">Total value</div><div class="stat-value">' + fmtCurrency(total) + '</div></div>' +
      '<table class="data-table"><thead><tr><th>Type</th><th>Value</th><th>%</th></tr></thead><tbody>' +
      (typeRows || '<tr><td colspan="3" class="pipeline-empty">No accounts</td></tr>') + '</tbody></table>' +
      '<table class="data-table" style="margin-top:14px;"><thead><tr><th>Provider</th><th>Type</th><th>Value</th><th>Holdings</th><th>Updated</th></tr></thead><tbody>' +
      (accRows || '<tr><td colspan="5" class="pipeline-empty">No accounts</td></tr>') + '</tbody></table>';
  }

  // ---------- Goals ----------

  function renderGoals(goals) {
    var rows = goals.map(function (g) {
      return '<tr><td>' + escapeHtml(g.name || '—') + '</td><td>' + escapeHtml(g.type || '—') + '</td><td>' +
        (g.target_value != null ? fmtCurrency(g.target_value) : '—') + '</td><td>' + fmtDate(g.target_date) + '</td><td>' + escapeHtml(g.status || '—') + '</td></tr>';
    }).join('');
    document.getElementById('goalsCard').innerHTML =
      '<h2>Goals</h2><table class="data-table"><thead><tr><th>Name</th><th>Type</th><th>Target</th><th>Target date</th><th>Status</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="pipeline-empty">No goals</td></tr>') + '</tbody></table>';
  }

  // ---------- Client Context (narrow 5-field coaching notes) ----------

  var CONTEXT_FIELDS = [
    ['objectives_notes', 'Objectives'],
    ['time_horizon_notes', 'Time horizon'],
    ['risk_comfort_notes', 'Risk comfort'],
    ['existing_holdings_notes', 'Existing holdings'],
    ['cash_flow_notes', 'Cash flow considerations'],
  ];

  function renderContext(supabase, clientId, context) {
    var card = document.getElementById('contextCard');
    card.innerHTML =
      '<h2>Client Context</h2>' +
      '<p style="font-size:12.5px;color:var(--ink-soft);margin-top:-8px;">Narrow coaching-context reference — never a score, never a match. Supports your thinking; never outputs a verdict.</p>' +
      CONTEXT_FIELDS.map(function (f) {
        return '<div class="field"><label>' + f[1] + '</label><textarea data-field="' + f[0] + '" style="min-height:50px;">' + escapeHtml((context && context[f[0]]) || '') + '</textarea></div>';
      }).join('') +
      '<div style="display:flex;justify-content:flex-end;"><button type="button" class="primary" id="saveContextBtn">Save context</button></div>';

    document.getElementById('saveContextBtn').addEventListener('click', function () {
      var btn = this;
      var fields = {};
      CONTEXT_FIELDS.forEach(function (f) {
        fields[f[0]] = card.querySelector('[data-field="' + f[0] + '"]').value.trim() || null;
      });
      btn.disabled = true;
      btn.textContent = 'Saving…';
      CortexClient.saveClientContext(supabase, clientId, fields).then(function () {
        btn.textContent = 'Saved';
        setTimeout(function () { btn.textContent = 'Save context'; btn.disabled = false; }, 1200);
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Save context';
        alert('Could not save: ' + (err.message || err));
      });
    });
  }

  // ---------- Investment Plan (3-level nested editor) ----------

  var ASSET_CLASSES = ['equity', 'bonds', 'cash', 'other'];
  var tempCounter = 0;

  function investmentCardHtml(inv, accounts) {
    var invId = inv.id || ('new-' + (++tempCounter));
    var accountOptions = accounts.map(function (a) {
      return '<option value="' + a.id + '">' + escapeHtml((a.provider || a.type) + ' (' + a.type.toUpperCase() + ')') + '</option>';
    }).join('');
    var accRows = (inv.accounts || []).map(function (acc) {
      return accountAllocationRowHtml(acc, accountOptions);
    }).join('');
    return (
      '<details class="section-card inv-card" data-inv-id="' + invId + '" open>' +
        '<summary>' + escapeHtml(inv.name || 'New investment') + '</summary>' +
        '<div class="section-body">' +
          '<div class="field-grid">' +
            '<div class="field"><label>Name</label><input type="text" data-field="name" value="' + escapeHtml(inv.name || '') + '"></div>' +
            '<div class="field"><label>Ticker</label><input type="text" data-field="ticker" value="' + escapeHtml(inv.ticker || '') + '"></div>' +
            '<div class="field"><label>Asset class</label><select data-field="asset_class">' +
              ASSET_CLASSES.map(function (ac) { return '<option value="' + ac + '"' + (inv.asset_class === ac ? ' selected' : '') + '>' + ac + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="field"><label>Target weight %</label><input type="number" step="0.1" data-field="target_weight_pct" value="' + (inv.target_weight_pct != null ? inv.target_weight_pct : '') + '"></div>' +
          '</div>' +
          '<div class="field"><label>Notes</label><textarea data-field="notes" style="min-height:60px;">' + escapeHtml(inv.notes || '') + '</textarea></div>' +
          '<div class="nested-list">' +
            '<div class="nested-list-label">Account allocation</div>' +
            '<div class="acc-rows">' + accRows + '</div>' +
            '<button type="button" class="add-account-btn" data-select-options="' + escapeHtml(accountOptions).replace(/"/g, '&quot;') + '">+ Add account allocation</button>' +
          '</div>' +
          '<div style="text-align:right;margin-top:10px;"><button type="button" class="remove-investment-btn">Remove investment</button></div>' +
        '</div>' +
      '</details>'
    );
  }

  function accountAllocationRowHtml(acc, accountOptions) {
    var accId = acc.id || ('new-' + (++tempCounter));
    var optsHtml = accountOptions.replace('value="' + acc.account_id + '"', 'value="' + acc.account_id + '" selected');
    return (
      '<div class="nested-row" data-acc-id="' + accId + '">' +
        '<select data-field="account_id">' + optsHtml + '</select>' +
        '<input type="number" step="0.1" placeholder="Alloc %" data-field="allocation_pct" value="' + (acc.allocation_pct != null ? acc.allocation_pct : '') + '">' +
        '<input type="text" placeholder="Notes" data-field="notes" value="' + escapeHtml(acc.notes || '') + '">' +
        '<button type="button" class="remove-account-btn">Remove</button>' +
      '</div>'
    );
  }

  function renderPlan(supabase, clientId, planData, planHistory, accounts) {
    var container = document.getElementById('planCard');
    var deletedInvestmentIds = [];
    var deletedAccountsByInvestment = {};

    function renderHistory() {
      var rows = planHistory.map(function (p) {
        return '<tr><td>' + escapeHtml(p.status) + '</td><td>' + escapeHtml(p.title || '—') + '</td>' +
          '<td>' + [p.target_equity_pct, p.target_bonds_pct, p.target_cash_pct, p.target_other_pct].map(function (v) { return v != null ? v + '%' : '-'; }).join(' / ') + '</td>' +
          '<td>' + fmtDate(p.review_date) + '</td><td>' + fmtDateTime(p.created_at) + '</td></tr>';
      }).join('');
      var histEl = document.getElementById('planHistoryTable');
      if (histEl) {
        histEl.innerHTML = planHistory.length
          ? '<table class="data-table"><thead><tr><th>Status</th><th>Title</th><th>Equity/Bonds/Cash/Other</th><th>Review date</th><th>Created</th></tr></thead><tbody>' + rows + '</tbody></table>'
          : '<p class="pipeline-empty">No past plans.</p>';
      }
    }

    if (!planData.plan) {
      container.innerHTML =
        '<h2>Investment Plan</h2>' +
        '<p class="pipeline-empty">No active plan yet.</p>' +
        '<button type="button" class="primary" id="createPlanBtn">Create plan</button>' +
        '<h3 style="margin:18px 0 10px;">Plan History</h3><div id="planHistoryTable"></div>';
      document.getElementById('createPlanBtn').addEventListener('click', function () {
        openCreatePlanForm(supabase, clientId, container);
      });
      renderHistory();
      return;
    }

    var p = planData.plan;
    var total = ['target_equity_pct', 'target_bonds_pct', 'target_cash_pct', 'target_other_pct']
      .reduce(function (s, k) { return s + Number(p[k] || 0); }, 0);

    container.innerHTML =
      '<h2>Investment Plan</h2>' +
      '<div class="visibility-note client-visible">Client-visible by design — write as if the client may see this.</div>' +
      '<div class="field-grid">' +
        '<div class="field"><label for="planTitle">Title</label><input type="text" id="planTitle" value="' + escapeHtml(p.title || '') + '"></div>' +
        '<div class="field"><label for="planReviewDate">Review date</label><input type="date" id="planReviewDate" value="' + (p.review_date || '') + '"></div>' +
      '</div>' +
      '<div class="conviction-grid">' +
        '<div class="field"><label for="planEquity">Equity %</label><input type="number" step="0.1" id="planEquity" value="' + (p.target_equity_pct != null ? p.target_equity_pct : '') + '"></div>' +
        '<div class="field"><label for="planBonds">Bonds %</label><input type="number" step="0.1" id="planBonds" value="' + (p.target_bonds_pct != null ? p.target_bonds_pct : '') + '"></div>' +
        '<div class="field"><label for="planCash">Cash %</label><input type="number" step="0.1" id="planCash" value="' + (p.target_cash_pct != null ? p.target_cash_pct : '') + '"></div>' +
        '<div class="field"><label for="planOther">Other %</label><input type="number" step="0.1" id="planOther" value="' + (p.target_other_pct != null ? p.target_other_pct : '') + '"></div>' +
      '</div>' +
      '<p style="font-size:12.5px;color:var(--ink-soft);margin:-8px 0 14px;">Total: <span id="planPctTotal">' + total.toFixed(1) + '</span>% (soft target — 100% recommended, not enforced)</p>' +
      '<div class="field"><label for="planNotes">Allocation notes</label><textarea id="planNotes">' + escapeHtml(p.allocation_notes || '') + '</textarea></div>' +
      '<h3 style="margin:18px 0 10px;">Investments</h3>' +
      '<div id="investmentsList">' + planData.investments.map(function (inv) { return investmentCardHtml(inv, accounts); }).join('') + '</div>' +
      '<button type="button" id="addInvestmentBtn">+ Add investment</button>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:16px;gap:10px;">' +
        '<button type="button" id="newPlanBtn">Create new plan (supersedes this one)</button>' +
        '<button type="button" class="primary" id="savePlanBtn">Save plan</button>' +
      '</div>' +
      '<p class="field-error" id="planError"></p>' +
      '<h3 style="margin:18px 0 10px;">Plan History</h3><div id="planHistoryTable"></div>';

    var investmentsList = document.getElementById('investmentsList');

    ['planEquity', 'planBonds', 'planCash', 'planOther'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', function () {
        var t = ['planEquity', 'planBonds', 'planCash', 'planOther']
          .reduce(function (s, i) { return s + Number(document.getElementById(i).value || 0); }, 0);
        document.getElementById('planPctTotal').textContent = t.toFixed(1);
      });
    });

    document.getElementById('addInvestmentBtn').addEventListener('click', function () {
      investmentsList.insertAdjacentHTML('beforeend', investmentCardHtml({ accounts: [] }, accounts));
      wireInvestmentCard(investmentsList.lastElementChild);
    });

    function wireInvestmentCard(card) {
      card.querySelector('.remove-investment-btn').addEventListener('click', function () {
        var invId = card.getAttribute('data-inv-id');
        if (invId.indexOf('new-') !== 0) deletedInvestmentIds.push(invId);
        card.remove();
      });
      card.querySelector('.add-account-btn').addEventListener('click', function () {
        var opts = this.getAttribute('data-select-options');
        var rowsDiv = card.querySelector('.acc-rows');
        rowsDiv.insertAdjacentHTML('beforeend', accountAllocationRowHtml({}, opts));
        wireAccountRow(rowsDiv.lastElementChild, card);
      });
      card.querySelectorAll('.nested-row').forEach(function (row) { wireAccountRow(row, card); });
    }

    function wireAccountRow(row, card) {
      row.querySelector('.remove-account-btn').addEventListener('click', function () {
        var accId = row.getAttribute('data-acc-id');
        var invId = card.getAttribute('data-inv-id');
        if (accId.indexOf('new-') !== 0 && invId.indexOf('new-') !== 0) {
          (deletedAccountsByInvestment[invId] = deletedAccountsByInvestment[invId] || []).push(accId);
        }
        row.remove();
      });
    }

    investmentsList.querySelectorAll('.inv-card').forEach(wireInvestmentCard);

    document.getElementById('newPlanBtn').addEventListener('click', function () {
      openCreatePlanForm(supabase, clientId, container);
    });

    document.getElementById('savePlanBtn').addEventListener('click', function () {
      var btn = this;
      var errorEl = document.getElementById('planError');
      errorEl.classList.remove('show');

      var planFields = {
        client_id: clientId,
        title: document.getElementById('planTitle').value.trim(),
        review_date: document.getElementById('planReviewDate').value || null,
        target_equity_pct: numOrNull(document.getElementById('planEquity').value),
        target_bonds_pct: numOrNull(document.getElementById('planBonds').value),
        target_cash_pct: numOrNull(document.getElementById('planCash').value),
        target_other_pct: numOrNull(document.getElementById('planOther').value),
        allocation_notes: document.getElementById('planNotes').value.trim() || null,
      };

      var investments = [];
      investmentsList.querySelectorAll('.inv-card').forEach(function (card) {
        var invId = card.getAttribute('data-inv-id');
        var isNew = invId.indexOf('new-') === 0;
        var inv = {
          id: isNew ? undefined : invId,
          name: card.querySelector('[data-field="name"]').value.trim(),
          ticker: card.querySelector('[data-field="ticker"]').value.trim(),
          asset_class: card.querySelector('[data-field="asset_class"]').value,
          target_weight_pct: numOrNull(card.querySelector('[data-field="target_weight_pct"]').value),
          notes: card.querySelector('[data-field="notes"]').value.trim(),
          accounts: [],
        };
        card.querySelectorAll('.nested-row[data-acc-id]').forEach(function (row) {
          var accId = row.getAttribute('data-acc-id');
          inv.accounts.push({
            id: accId.indexOf('new-') === 0 ? undefined : accId,
            account_id: row.querySelector('[data-field="account_id"]').value,
            allocation_pct: numOrNull(row.querySelector('[data-field="allocation_pct"]').value),
            notes: row.querySelector('[data-field="notes"]').value.trim(),
          });
        });
        if (!isNew && deletedAccountsByInvestment[invId]) {
          deletedAccountsByInvestment[invId].forEach(function (accId) { inv.accounts.push({ id: accId, _deleted: true }); });
        }
        investments.push(inv);
      });
      deletedInvestmentIds.forEach(function (id) { investments.push({ id: id, _deleted: true }); });

      btn.disabled = true;
      btn.textContent = 'Saving…';
      WealthOsClient.saveActivePlan(supabase, p.id, planFields, investments).then(function (fresh) {
        renderPlan(supabase, clientId, fresh, planHistory, accounts);
      }).catch(function (err) {
        errorEl.textContent = err.message || 'Could not save plan.';
        errorEl.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Save plan';
      });
    });

    renderHistory();
  }

  function openCreatePlanForm(supabase, clientId, container) {
    var backdrop = document.getElementById('newPlanBackdrop');
    backdrop.classList.add('show');
    document.getElementById('newPlanCancel').onclick = function () { backdrop.classList.remove('show'); };
    document.getElementById('newPlanForm').onsubmit = function (e) {
      e.preventDefault();
      var fields = {
        title: document.getElementById('npTitle').value.trim(),
        review_date: document.getElementById('npReviewDate').value || null,
        target_equity_pct: numOrNull(document.getElementById('npEquity').value),
        target_bonds_pct: numOrNull(document.getElementById('npBonds').value),
        target_cash_pct: numOrNull(document.getElementById('npCash').value),
        target_other_pct: numOrNull(document.getElementById('npOther').value),
        allocation_notes: document.getElementById('npNotes').value.trim() || null,
      };
      WealthOsClient.createNewPlan(supabase, clientId, fields).then(function () {
        backdrop.classList.remove('show');
        window.location.reload();
      }).catch(function (err) {
        document.getElementById('newPlanError').textContent = err.message || 'Could not create plan.';
        document.getElementById('newPlanError').classList.add('show');
      });
    };
  }

  // ---------- Decision History ----------

  var DECISION_TYPES = ['buy', 'sell', 'switch', 'rebalance', 'review'];

  function decisionRowHtml(d) {
    return (
      '<tr data-id="' + d.id + '">' +
        '<td>' + escapeHtml(d.entry_type) + '</td>' +
        '<td>' + fmtDate(d.entry_date) + '</td>' +
        '<td>' + escapeHtml(d.reason) + '</td>' +
        '<td>' + escapeHtml(d.notes || '—') + '</td>' +
        '<td><button type="button" class="edit-decision-btn">Edit</button> <button type="button" class="delete-decision-btn">Delete</button></td>' +
      '</tr>'
    );
  }

  function renderDecisions(supabase, clientId, decisions) {
    var card = document.getElementById('decisionsCard');
    card.innerHTML =
      '<h2>Decision History</h2>' +
      '<div class="visibility-note client-visible">Client-visible by design</div>' +
      '<form id="decisionForm">' +
        '<div class="field-grid">' +
          '<div class="field"><label for="dType">Type</label><select id="dType">' +
            DECISION_TYPES.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field"><label for="dDate">Date</label><input type="date" id="dDate"></div>' +
        '</div>' +
        '<div class="field"><label for="dReason">Reason</label><textarea id="dReason"></textarea></div>' +
        '<div class="field"><label for="dNotes">Notes</label><textarea id="dNotes"></textarea></div>' +
        '<p class="field-error" id="decisionError"></p>' +
        '<div style="display:flex;justify-content:flex-end;"><button type="submit" class="primary">Add entry</button></div>' +
      '</form>' +
      '<div id="decisionsTable" style="margin-top:16px;"></div>';

    var tableEl = document.getElementById('decisionsTable');
    function refresh(list) {
      tableEl.innerHTML = list.length
        ? '<table class="data-table"><thead><tr><th>Type</th><th>Date</th><th>Reason</th><th>Notes</th><th></th></tr></thead><tbody>' +
          list.map(decisionRowHtml).join('') + '</tbody></table>'
        : '<p class="pipeline-empty">No decisions logged yet.</p>';
      tableEl.querySelectorAll('.delete-decision-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.closest('tr').getAttribute('data-id');
          if (!confirm('Delete this decision entry?')) return;
          WealthOsClient.deleteDecision(supabase, id).then(function () {
            list = list.filter(function (d) { return d.id !== id; });
            refresh(list);
          });
        });
      });
      tableEl.querySelectorAll('.edit-decision-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = btn.closest('tr');
          var id = row.getAttribute('data-id');
          var d = list.filter(function (x) { return x.id === id; })[0];
          row.innerHTML =
            '<td><select class="e-type">' + DECISION_TYPES.map(function (t) { return '<option value="' + t + '"' + (t === d.entry_type ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></td>' +
            '<td><input type="date" class="e-date" value="' + (d.entry_date || '') + '"></td>' +
            '<td><input type="text" class="e-reason" value="' + escapeHtml(d.reason) + '"></td>' +
            '<td><input type="text" class="e-notes" value="' + escapeHtml(d.notes || '') + '"></td>' +
            '<td><button type="button" class="save-edit-btn">Save</button></td>';
          row.querySelector('.save-edit-btn').addEventListener('click', function () {
            WealthOsClient.updateDecision(supabase, id, {
              entry_type: row.querySelector('.e-type').value,
              entry_date: row.querySelector('.e-date').value,
              reason: row.querySelector('.e-reason').value.trim(),
              notes: row.querySelector('.e-notes').value.trim() || null,
            }).then(function (updated) {
              list = list.map(function (x) { return x.id === id ? updated : x; });
              refresh(list);
            });
          });
        });
      });
    }
    refresh(decisions);

    document.getElementById('decisionForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var errorEl = document.getElementById('decisionError');
      errorEl.classList.remove('show');
      var reason = document.getElementById('dReason').value.trim();
      if (!reason) {
        errorEl.textContent = 'A reason is required.';
        errorEl.classList.add('show');
        return;
      }
      WealthOsClient.addDecision(supabase, clientId, {
        entry_type: document.getElementById('dType').value,
        entry_date: document.getElementById('dDate').value || new Date().toISOString().slice(0, 10),
        reason: reason,
        notes: document.getElementById('dNotes').value.trim() || null,
      }).then(function (created) {
        decisions = [created].concat(decisions);
        refresh(decisions);
        document.getElementById('decisionForm').reset();
      }).catch(function (err) {
        errorEl.textContent = err.message || 'Could not log decision.';
        errorEl.classList.add('show');
      });
    });
  }

  // ---------- Documents (per-client) ----------

  var DOC_TYPES = [
    ['fact_find', 'Fact find'], ['meeting_notes', 'Meeting notes'], ['portfolio', 'Portfolio'],
    ['financial_info', 'Financial info'], ['planning', 'Planning'], ['research', 'Research'], ['other', 'Other'],
  ];
  var DOC_STATUSES = [
    ['uploaded', 'Uploaded'], ['reviewed', 'Reviewed'], ['info_added', 'Info added to client record'],
  ];

  function renderDocuments(supabase, clientId, documents) {
    var card = document.getElementById('documentsCard');
    card.innerHTML =
      '<h2>Documents</h2>' +
      '<p style="font-size:12.5px;color:var(--ink-soft);margin-top:-8px;">Extraction is manual — ask Claude Code in a session to read a document and help populate this record.</p>' +
      '<form id="docUploadForm">' +
        '<div class="doc-upload-form">' +
          '<div class="field"><label for="docTypeSel">Type</label><select id="docTypeSel">' +
            DOC_TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field"><label for="docFileInput">File</label><input type="file" id="docFileInput"></div>' +
        '</div>' +
        '<p class="field-error" id="docUploadError"></p>' +
        '<div style="display:flex;justify-content:flex-end;"><button type="submit" class="primary">Upload</button></div>' +
      '</form>' +
      '<div id="docList" style="margin-top:14px;"></div>';

    function refresh(list) {
      var listEl = document.getElementById('docList');
      listEl.innerHTML = list.length
        ? '<table class="data-table"><thead><tr><th>Name</th><th>Type</th><th>Uploaded</th><th>Status</th><th></th></tr></thead><tbody>' +
          list.map(function (d) {
            return '<tr data-id="' + d.id + '"><td>' + escapeHtml(d.name) + '</td>' +
              '<td>' + escapeHtml((DOC_TYPES.filter(function (t) { return t[0] === d.document_type; })[0] || [d.document_type, d.document_type])[1]) + '</td>' +
              '<td>' + fmtDateTime(d.uploaded_at) + '</td>' +
              '<td><select class="doc-status-sel">' + DOC_STATUSES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === d.status ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></td>' +
              '<td><button type="button" class="doc-view-btn">View</button> <button type="button" class="doc-delete-btn">Delete</button></td></tr>';
          }).join('') + '</tbody></table>'
        : '<p class="pipeline-empty">No documents uploaded for this client yet.</p>';

      listEl.querySelectorAll('.doc-status-sel').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var id = sel.closest('tr').getAttribute('data-id');
          CortexClient.updateDocument(supabase, id, { status: sel.value }).catch(function (err) {
            alert('Could not update status: ' + (err.message || err));
          });
        });
      });
      listEl.querySelectorAll('.doc-view-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.closest('tr').getAttribute('data-id');
          var doc = list.filter(function (d) { return d.id === id; })[0];
          CortexClient.getDocumentSignedUrl(supabase, doc.storage_path).then(function (url) { window.open(url, '_blank'); });
        });
      });
      listEl.querySelectorAll('.doc-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.closest('tr').getAttribute('data-id');
          var doc = list.filter(function (d) { return d.id === id; })[0];
          if (!confirm('Delete "' + doc.name + '"?')) return;
          CortexClient.deleteDocument(supabase, id, doc.storage_path).then(function () {
            list = list.filter(function (d) { return d.id !== id; });
            refresh(list);
          });
        });
      });
    }
    refresh(documents);

    document.getElementById('docUploadForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var errorEl = document.getElementById('docUploadError');
      errorEl.classList.remove('show');
      var file = document.getElementById('docFileInput').files[0];
      if (!file) {
        errorEl.textContent = 'Choose a file first.';
        errorEl.classList.add('show');
        return;
      }
      var docType = document.getElementById('docTypeSel').value;
      CortexClient.uploadDocument(supabase, clientId, file, docType, null).then(function () {
        document.getElementById('docUploadForm').reset();
        return CortexClient.listClientDocuments(supabase, clientId);
      }).then(function (list) {
        documents = list;
        refresh(documents);
      }).catch(function (err) {
        errorEl.textContent = err.message || 'Upload failed.';
        errorEl.classList.add('show');
      });
    });
  }

  // ---------- Notes (private) ----------

  function renderNotes(supabase, clientId, notes) {
    var card = document.getElementById('notesCard');
    card.innerHTML =
      '<h2>Notes</h2>' +
      '<div class="visibility-note private">Private — adviser-only.</div>' +
      '<form id="noteForm"><div class="field"><label for="noteBody">New note</label><textarea id="noteBody" style="min-height:60px;"></textarea></div>' +
      '<div style="display:flex;justify-content:flex-end;"><button type="submit" class="primary">Add note</button></div></form>' +
      '<div id="notesList" style="margin-top:16px;"></div>';

    var listEl = document.getElementById('notesList');
    function refresh(list) {
      listEl.innerHTML = list.length
        ? list.map(function (n) {
            return '<div class="card" data-id="' + n.id + '" style="margin-bottom:10px;">' +
              '<p style="white-space:pre-wrap;">' + escapeHtml(n.body) + '</p>' +
              '<p style="font-size:11.5px;color:var(--ink-soft);margin-top:6px;">' + fmtDateTime(n.updated_at) + ' <button type="button" class="delete-note-btn">Delete</button></p>' +
            '</div>';
          }).join('')
        : '<p class="pipeline-empty">No notes yet.</p>';
      listEl.querySelectorAll('.delete-note-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.closest('[data-id]').getAttribute('data-id');
          if (!confirm('Delete this note?')) return;
          CortexClient.deleteClientNote(supabase, id).then(function () {
            list = list.filter(function (n) { return n.id !== id; });
            refresh(list);
          });
        });
      });
    }
    refresh(notes);

    document.getElementById('noteForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var body = document.getElementById('noteBody').value.trim();
      if (!body) return;
      CortexClient.addClientNote(supabase, clientId, body).then(function (created) {
        notes = [created].concat(notes);
        refresh(notes);
        document.getElementById('noteForm').reset();
      });
    });
  }

  // ---------- Follow-ups ----------

  function renderFollowUps(supabase, clientId, followUps) {
    var card = document.getElementById('followUpsCard');
    card.innerHTML =
      '<h2>Follow-ups</h2>' +
      '<form id="followUpForm"><div class="field-grid">' +
        '<div class="field"><label for="fuTask">Task</label><input type="text" id="fuTask"></div>' +
        '<div class="field"><label for="fuDueDate">Due date</label><input type="date" id="fuDueDate"></div>' +
      '</div><div style="display:flex;justify-content:flex-end;"><button type="submit" class="primary">Add follow-up</button></div></form>' +
      '<div id="followUpsList" style="margin-top:16px;"></div>';

    var listEl = document.getElementById('followUpsList');
    function refresh(list) {
      listEl.innerHTML = list.length
        ? '<table class="data-table"><thead><tr><th>Task</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>' +
          list.map(function (f) {
            return '<tr data-id="' + f.id + '">' +
              '<td>' + escapeHtml(f.task) + '</td><td>' + fmtDate(f.due_date) + '</td><td>' + escapeHtml(f.status) + '</td>' +
              '<td><button type="button" class="toggle-status-btn">Mark ' + (f.status === 'open' ? 'done' : 'open') + '</button> <button type="button" class="delete-followup-btn">Delete</button></td></tr>';
          }).join('') + '</tbody></table>'
        : '<p class="pipeline-empty">No follow-ups.</p>';

      listEl.querySelectorAll('.toggle-status-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.closest('tr').getAttribute('data-id');
          var f = list.filter(function (x) { return x.id === id; })[0];
          CortexClient.updateFollowUp(supabase, id, { status: f.status === 'open' ? 'done' : 'open' }).then(function (updated) {
            list = list.map(function (x) { return x.id === id ? updated : x; });
            refresh(list);
          });
        });
      });
      listEl.querySelectorAll('.delete-followup-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.closest('tr').getAttribute('data-id');
          if (!confirm('Delete this follow-up?')) return;
          CortexClient.deleteFollowUp(supabase, id).then(function () {
            list = list.filter(function (x) { return x.id !== id; });
            refresh(list);
          });
        });
      });
    }
    refresh(followUps);

    document.getElementById('followUpForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var task = document.getElementById('fuTask').value.trim();
      if (!task) return;
      CortexClient.addFollowUp(supabase, clientId, {
        task: task,
        due_date: document.getElementById('fuDueDate').value || null,
      }).then(function (created) {
        followUps = followUps.concat([created]);
        refresh(followUps);
        document.getElementById('followUpForm').reset();
      });
    });
  }

  window.ClientsController = { initList: initList, initDetail: initDetail };
})();
