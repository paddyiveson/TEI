/**
 * Pipeline / Dashboard controller (Screen 1). Requires admin-auth.js and
 * cortex-client.js loaded first.
 */
(function () {
  var STATUS_COLUMNS = [
    { key: 'idea', label: 'Idea' },
    { key: 'research', label: 'Research' },
    { key: 'watch', label: 'Watch' },
    { key: 'approved', label: 'Approved' },
    { key: 'portfolio_candidate', label: 'Portfolio Candidate' },
    { key: 'held', label: 'Held' },
    { key: 'archived', label: 'Archived' },
    { key: 'rejected', label: 'Rejected' },
  ];

  function relativeTime(isoString) {
    if (!isoString) return '';
    var diffMs = Date.now() - new Date(isoString).getTime();
    var mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.round(hours / 24);
    if (days < 30) return days + 'd ago';
    var months = Math.round(days / 30);
    if (months < 12) return months + 'mo ago';
    return Math.round(months / 12) + 'y ago';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cardHtml(inv) {
    var band = inv.conviction_band
      ? '<span class="badge band-' + inv.conviction_band + '">' + inv.conviction_band + '</span>'
      : '<span></span>';
    return (
      '<a class="pipeline-card" href="/admin/investment.html?id=' + encodeURIComponent(inv.id) + '">' +
        '<span class="company">' + escapeHtml(inv.company_name) + '</span>' +
        '<span class="ticker">' + escapeHtml(inv.ticker) + '</span>' +
        '<div class="meta-row">' + band +
          '<span class="updated">' + relativeTime(inv.updated_at) + '</span>' +
        '</div>' +
      '</a>'
    );
  }

  function renderBoard(board, investments) {
    var byStatus = {};
    STATUS_COLUMNS.forEach(function (c) { byStatus[c.key] = []; });
    investments.forEach(function (inv) {
      (byStatus[inv.lifecycle_status] || (byStatus[inv.lifecycle_status] = [])).push(inv);
    });
    Object.keys(byStatus).forEach(function (key) {
      byStatus[key].sort(function (a, b) { return new Date(b.updated_at) - new Date(a.updated_at); });
    });

    board.innerHTML = STATUS_COLUMNS.map(function (col) {
      var rows = byStatus[col.key] || [];
      var cards = rows.length
        ? rows.map(cardHtml).join('')
        : '<p class="pipeline-empty">Nothing here</p>';
      return (
        '<section class="pipeline-column" data-status="' + col.key + '">' +
          '<div class="pipeline-column-head">' +
            '<span class="name">' + col.label + '</span>' +
            '<span class="count">' + rows.length + '</span>' +
          '</div>' +
          cards +
        '</section>'
      );
    }).join('');
  }

  function openModal() { document.getElementById('newIdeaBackdrop').classList.add('show'); }
  function closeModal() {
    document.getElementById('newIdeaBackdrop').classList.remove('show');
    document.getElementById('newIdeaForm').reset();
    document.getElementById('newIdeaError').classList.remove('show');
  }

  function init(supabase) {
    var board = document.getElementById('pipelineBoard');

    function refresh() {
      return CortexClient.listInvestments(supabase).then(function (investments) {
        renderBoard(board, investments);
      });
    }

    refresh().catch(function (err) {
      board.innerHTML = '<p class="pipeline-empty">Could not load investments: ' + escapeHtml(err.message || err) + '</p>';
    });

    document.getElementById('newIdeaBtn').addEventListener('click', openModal);
    document.getElementById('newIdeaCancel').addEventListener('click', closeModal);

    document.getElementById('newIdeaForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var errorEl = document.getElementById('newIdeaError');
      errorEl.classList.remove('show');

      var ticker = document.getElementById('ideaTicker').value.trim().toUpperCase();
      var companyName = document.getElementById('ideaCompany').value.trim();
      var sector = document.getElementById('ideaSector').value.trim();
      var theme = document.getElementById('ideaTheme').value.trim();
      var why = document.getElementById('ideaWhy').value.trim();

      if (!ticker || !companyName) {
        errorEl.textContent = 'Ticker and company name are required.';
        errorEl.classList.add('show');
        return;
      }

      var submitBtn = document.getElementById('newIdeaSubmit');
      submitBtn.disabled = true;

      // investment_role has no DB default and is required -- the quick-add
      // form deliberately doesn't ask for it (keeps this under 30 seconds,
      // per the spec's workflow); growth_opportunity is a placeholder the
      // adviser corrects on the full Investment Record.
      CortexClient.createInvestment(supabase, {
        ticker: ticker,
        company_name: companyName,
        sector: sector || null,
        theme: theme || null,
        story_opportunity: why || null,
        investment_role: 'growth_opportunity',
        lifecycle_status: 'idea',
      }).then(function (inv) {
        window.location.href = '/admin/investment.html?id=' + encodeURIComponent(inv.id);
      }).catch(function (err) {
        errorEl.textContent = err.message || 'Could not create idea.';
        errorEl.classList.add('show');
        submitBtn.disabled = false;
      });
    });
  }

  window.PipelineController = { init: init };
})();
