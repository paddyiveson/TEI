/**
 * Home dashboard controller. Requires admin-auth.js, cortex-client.js, and
 * wealth-os-client.js loaded first. Pure aggregation of data that already
 * exists elsewhere -- no new intelligence, no observations synthesis (that
 * needs the deferred Observation engine).
 */
(function () {
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtCurrency(n) { return '£' + Math.round(Number(n || 0)).toLocaleString('en-GB'); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB') : '—'; }
  function clientName(c) { return ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Unnamed client'; }

  var STATUS_LABELS = {
    idea: 'Idea', research: 'Research', watch: 'Watch', approved: 'Approved',
    portfolio_candidate: 'Portfolio Candidate', held: 'Held', archived: 'Archived', rejected: 'Rejected',
  };

  function init(supabase) {
    Promise.all([
      WealthOsClient.listClients(supabase),
      WealthOsClient.getPortfolioTotalsByClient(supabase),
      CortexClient.listInvestments(supabase),
      CortexClient.listAllOpenFollowUps(supabase),
      CortexClient.listAllInvestmentDecisions(supabase, 5),
      WealthOsClient.listRecentDecisionsAllClients(supabase, 5),
    ]).then(function (results) {
      var clients = results[0], totals = results[1], investments = results[2],
        followUps = results[3], invDecisions = results[4], clientDecisions = results[5];

      var clientById = {};
      clients.forEach(function (c) { clientById[c.id] = c; });
      var investmentById = {};
      investments.forEach(function (i) { investmentById[i.id] = i; });

      renderClientsCard(clients, totals);
      renderPipelineCard(investments);
      renderFollowUpsCard(followUps, clientById);
      renderDecisionsCard(invDecisions, clientDecisions, investmentById, clientById);

      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('homeGrid').style.display = 'grid';
    }).catch(function (err) {
      document.getElementById('loadingState').textContent = 'Could not load Home: ' + (err.message || err);
    });
  }

  function renderClientsCard(clients, totals) {
    var sorted = clients.slice().sort(function (a, b) { return (totals[b.id] || 0) - (totals[a.id] || 0); });
    var rows = sorted.slice(0, 6).map(function (c) {
      return '<li><a href="/admin/clients.html?id=' + c.id + '">' + escapeHtml(clientName(c)) +
        '</a> <span style="color:var(--ink-soft);font-size:12.5px;">' + fmtCurrency(totals[c.id] || 0) + '</span></li>';
    }).join('');
    document.getElementById('clientsCard').innerHTML =
      '<h2>Clients <span style="font-weight:400;color:var(--ink-soft);font-size:14px;">(' + clients.length + ')</span></h2>' +
      '<ul style="list-style:none;padding:0;margin:0 0 12px;">' + (rows || '<li class="pipeline-empty">No clients yet.</li>') + '</ul>' +
      '<a href="/admin/clients.html">View all clients →</a>';
  }

  function renderPipelineCard(investments) {
    var counts = {};
    investments.forEach(function (i) { counts[i.lifecycle_status] = (counts[i.lifecycle_status] || 0) + 1; });
    var badges = Object.keys(STATUS_LABELS).map(function (key) {
      var n = counts[key] || 0;
      if (!n) return '';
      return '<span class="badge band-developing" style="margin:0 6px 6px 0;">' + STATUS_LABELS[key] + ' · ' + n + '</span>';
    }).join('');
    document.getElementById('pipelineCard').innerHTML =
      '<h2>Investment Intelligence <span style="font-weight:400;color:var(--ink-soft);font-size:14px;">(' + investments.length + ')</span></h2>' +
      '<div style="margin-bottom:12px;">' + (badges || '<p class="pipeline-empty">No investments yet.</p>') + '</div>' +
      '<a href="/admin/investments.html">Open pipeline →</a>';
  }

  function renderFollowUpsCard(followUps, clientById) {
    var rows = followUps.slice(0, 8).map(function (f) {
      var c = clientById[f.client_reference];
      return '<li><a href="/admin/clients.html?id=' + f.client_reference + '">' + escapeHtml(c ? clientName(c) : 'Unknown client') + '</a>: ' +
        escapeHtml(f.task) + ' <span style="color:var(--ink-soft);font-size:12px;">' + fmtDate(f.due_date) + '</span></li>';
    }).join('');
    document.getElementById('followUpsCard').innerHTML =
      '<h2>Open Follow-ups <span style="font-weight:400;color:var(--ink-soft);font-size:14px;">(' + followUps.length + ')</span></h2>' +
      '<ul style="list-style:none;padding:0;margin:0;">' + (rows || '<li class="pipeline-empty">Nothing open.</li>') + '</ul>';
  }

  function renderDecisionsCard(invDecisions, clientDecisions, investmentById, clientById) {
    var merged = invDecisions.map(function (d) {
      var inv = investmentById[d.investment_id];
      return { date: d.created_at, label: inv ? inv.ticker : 'Investment', reason: d.reason, kind: 'Investment', href: inv ? '/admin/investment.html?id=' + inv.id : '/admin/investments.html' };
    }).concat(clientDecisions.map(function (d) {
      var c = clientById[d.client_id];
      return { date: d.entry_date, label: c ? clientName(c) : 'Client', reason: d.reason, kind: 'Client', href: '/admin/clients.html?id=' + d.client_id };
    })).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 8);

    var rows = merged.map(function (d) {
      return '<li><span class="doc-status-badge uploaded" style="margin-right:6px;">' + d.kind + '</span>' +
        '<a href="' + d.href + '">' + escapeHtml(d.label) + '</a>: ' + escapeHtml(d.reason) + '</li>';
    }).join('');
    document.getElementById('decisionsCard').innerHTML =
      '<h2>Recent Decisions</h2>' +
      '<ul style="list-style:none;padding:0;margin:0;">' + (rows || '<li class="pipeline-empty">No decisions logged yet.</li>') + '</ul>' +
      '<p style="margin-top:12px;"><a href="/admin/decisions.html">View all →</a></p>';
  }

  window.HomeController = { init: init };
})();
