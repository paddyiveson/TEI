/**
 * Decisions & History controller — read-only aggregate view across every
 * client's decision_log_entries and every investment's investment_decisions.
 * No new intelligence -- the data already exists, this just merges it into
 * one chronological list. Requires admin-auth.js, cortex-client.js, and
 * wealth-os-client.js loaded first.
 */
(function () {
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB') : '—'; }
  function clientName(c) { return c ? ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Unnamed client' : 'Unknown client'; }

  function init(supabase) {
    Promise.all([
      WealthOsClient.listClients(supabase),
      WealthOsClient.listRecentDecisionsAllClients(supabase, 200),
      CortexClient.listInvestments(supabase),
      CortexClient.listAllInvestmentDecisions(supabase, 200),
    ]).then(function (results) {
      var clients = results[0], clientDecisions = results[1], investments = results[2], invDecisions = results[3];
      var clientById = {};
      clients.forEach(function (c) { clientById[c.id] = c; });
      var investmentById = {};
      investments.forEach(function (i) { investmentById[i.id] = i; });

      var merged = invDecisions.map(function (d) {
        var inv = investmentById[d.investment_id];
        return {
          date: d.created_at, kind: 'Investment',
          subject: inv ? (inv.ticker + ' — ' + inv.company_name) : 'Investment',
          what: d.what_changed, reason: d.reason, next: d.what_would_change_mind_next,
          href: inv ? '/admin/investment.html?id=' + inv.id : '/admin/investments.html',
        };
      }).concat(clientDecisions.map(function (d) {
        return {
          date: d.entry_date, kind: 'Client',
          subject: clientName(clientById[d.client_id]),
          what: d.entry_type, reason: d.reason, next: d.notes,
          href: '/admin/clients.html?id=' + d.client_id,
        };
      })).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

      document.getElementById('loadingState').style.display = 'none';
      var listEl = document.getElementById('decisionsList');
      listEl.style.display = 'block';
      listEl.innerHTML = merged.length
        ? '<table class="data-table"><thead><tr><th>Date</th><th>Kind</th><th>Subject</th><th>What</th><th>Reason</th><th>Notes / what would change my mind</th></tr></thead><tbody>' +
          merged.map(function (d) {
            return '<tr><td>' + fmtDate(d.date) + '</td>' +
              '<td><span class="doc-status-badge uploaded">' + escapeHtml(d.kind) + '</span></td>' +
              '<td><a href="' + d.href + '">' + escapeHtml(d.subject) + '</a></td>' +
              '<td>' + escapeHtml(d.what) + '</td>' +
              '<td>' + escapeHtml(d.reason) + '</td>' +
              '<td>' + escapeHtml(d.next || '—') + '</td></tr>';
          }).join('') + '</tbody></table>'
        : '<p class="pipeline-empty">No decisions logged yet, across any client or investment.</p>';
    }).catch(function (err) {
      document.getElementById('loadingState').textContent = 'Could not load decisions: ' + (err.message || err);
    });
  }

  window.DecisionsController = { init: init };
})();
