/**
 * Client Context Reference controller (Screen 4). Requires admin-auth.js and
 * cortex-client.js loaded first.
 *
 * Explicit guardrail reflected in this file, not just in behaviour: it reads
 * wealth_os.clients as id/first_name/last_name only (no join into
 * cortex.investments is ever constructed here), and the only write path
 * targets cortex.client_context. No score, rating, or "relevant investments"
 * concept exists anywhere in this controller -- see BUILD_INSTRUCTIONS.md.
 */
(function () {
  var FIELDS = [
    ['objectives_notes', 'Objectives'],
    ['time_horizon_notes', 'Time horizon'],
    ['risk_comfort_notes', 'Risk comfort'],
    ['existing_holdings_notes', 'Existing holdings'],
    ['cash_flow_notes', 'Cash flow considerations'],
  ];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function clientRowHtml(client) {
    var name = (client.first_name || '') + ' ' + (client.last_name || '');
    var fieldsHtml = FIELDS.map(function (f) {
      return '<div class="field"><label for="cc_' + client.id + '_' + f[0] + '">' + f[1] + '</label>' +
        '<textarea id="cc_' + client.id + '_' + f[0] + '" data-field="' + f[0] + '"></textarea></div>';
    }).join('');
    return (
      '<details class="client-row" data-client-id="' + client.id + '">' +
        '<summary>' + escapeHtml(name.trim() || 'Unnamed client') + '</summary>' +
        '<div class="client-body">' +
          fieldsHtml +
          '<p class="field-error" data-save-error></p>' +
          '<div style="display:flex; justify-content:flex-end;">' +
            '<button type="button" class="primary" data-save-btn>Save notes</button>' +
          '</div>' +
        '</div>' +
      '</details>'
    );
  }

  function init(supabase) {
    var list = document.getElementById('clientList');

    CortexClient.listClientsReadOnly(supabase).then(function (clients) {
      if (!clients.length) {
        list.innerHTML = '<p class="pipeline-empty">No TEI coaching clients found.</p>';
        return;
      }
      list.innerHTML = clients.map(clientRowHtml).join('');
      list.querySelectorAll('details.client-row').forEach(function (row) {
        wireRow(supabase, row);
      });
    }).catch(function (err) {
      list.innerHTML = '<p class="pipeline-empty">Could not load clients: ' + escapeHtml(err.message || err) + '</p>';
    });
  }

  function wireRow(supabase, row) {
    var clientId = row.getAttribute('data-client-id');
    var loaded = false;

    row.addEventListener('toggle', function () {
      if (!row.open || loaded) return;
      loaded = true;
      CortexClient.getClientContext(supabase, clientId).then(function (context) {
        if (!context) return; // no row yet -- fields stay blank
        FIELDS.forEach(function (f) {
          var el = row.querySelector('[data-field="' + f[0] + '"]');
          el.value = context[f[0]] || '';
        });
      }).catch(function (err) {
        row.querySelector('[data-save-error]').textContent = 'Could not load notes: ' + (err.message || err);
        row.querySelector('[data-save-error]').classList.add('show');
      });
    });

    row.querySelector('[data-save-btn]').addEventListener('click', function () {
      var btn = this;
      var errorEl = row.querySelector('[data-save-error]');
      errorEl.classList.remove('show');
      var fields = {};
      FIELDS.forEach(function (f) {
        var v = row.querySelector('[data-field="' + f[0] + '"]').value.trim();
        fields[f[0]] = v || null;
      });
      btn.disabled = true;
      btn.textContent = 'Saving…';
      CortexClient.saveClientContext(supabase, clientId, fields).then(function () {
        btn.textContent = 'Saved';
        setTimeout(function () { btn.textContent = 'Save notes'; btn.disabled = false; }, 1200);
      }).catch(function (err) {
        btn.textContent = 'Save notes';
        btn.disabled = false;
        errorEl.textContent = err.message || 'Could not save.';
        errorEl.classList.add('show');
      });
    });
  }

  window.ClientsController = { init: init };
})();
