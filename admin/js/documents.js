/**
 * Documents controller — global library (admin/documents.html) view of every
 * document across every client. Requires admin-auth.js, cortex-client.js,
 * wealth-os-client.js loaded first.
 *
 * Extraction is deliberately manual (see cortex-client.js header comment) --
 * this page has no "extract" button and no automated status transitions.
 * Status is a plain dropdown the adviser sets by hand after reading a file.
 */
(function () {
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDateTime(d) { return d ? new Date(d).toLocaleString('en-GB') : '—'; }
  function clientName(c) { return c ? ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Unnamed client' : 'Unknown client'; }

  var DOC_TYPES = [
    ['fact_find', 'Fact find'], ['meeting_notes', 'Meeting notes'], ['portfolio', 'Portfolio'],
    ['financial_info', 'Financial info'], ['planning', 'Planning'], ['research', 'Research'], ['other', 'Other'],
  ];
  var DOC_STATUSES = [
    ['uploaded', 'Uploaded'], ['reviewed', 'Reviewed'], ['info_added', 'Info added to client record'],
  ];

  function init(supabase) {
    var clientSelect = document.getElementById('docClientSelect');
    var typeSelect = document.getElementById('docTypeSelect');
    typeSelect.innerHTML = DOC_TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('');

    Promise.all([
      WealthOsClient.listClients(supabase),
      CortexClient.listAllDocuments(supabase),
    ]).then(function (results) {
      var clients = results[0], documents = results[1];
      var clientById = {};
      clients.forEach(function (c) { clientById[c.id] = c; });

      clientSelect.innerHTML = clients.map(function (c) {
        return '<option value="' + c.id + '">' + escapeHtml(clientName(c)) + '</option>';
      }).join('');

      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('documentsRoot').style.display = 'block';

      refresh(supabase, documents, clientById);
      wireUploadForm(supabase, clientById);
    }).catch(function (err) {
      document.getElementById('loadingState').textContent = 'Could not load documents: ' + (err.message || err);
    });
  }

  function refresh(supabase, documents, clientById) {
    var listEl = document.getElementById('documentsList');
    if (!documents.length) {
      listEl.innerHTML = '<p class="pipeline-empty">No documents uploaded yet.</p>';
      return;
    }
    listEl.innerHTML =
      '<table class="data-table"><thead><tr><th>Name</th><th>Client</th><th>Type</th><th>Uploaded</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>' +
      documents.map(function (d) {
        return (
          '<tr data-id="' + d.id + '">' +
            '<td>' + escapeHtml(d.name) + '</td>' +
            '<td><a href="/admin/clients.html?id=' + d.client_reference + '">' + escapeHtml(clientName(clientById[d.client_reference])) + '</a></td>' +
            '<td>' + escapeHtml((DOC_TYPES.filter(function (t) { return t[0] === d.document_type; })[0] || [d.document_type, d.document_type])[1]) + '</td>' +
            '<td>' + fmtDateTime(d.uploaded_at) + '</td>' +
            '<td><select class="status-select">' + DOC_STATUSES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === d.status ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></td>' +
            '<td>' + escapeHtml(d.notes || '—') + '</td>' +
            '<td><button type="button" class="view-btn">View</button> <button type="button" class="delete-btn">Delete</button></td>' +
          '</tr>'
        );
      }).join('') + '</tbody></table>';

    listEl.querySelectorAll('.status-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = sel.closest('tr').getAttribute('data-id');
        CortexClient.updateDocument(supabase, id, { status: sel.value }).catch(function (err) {
          alert('Could not update status: ' + (err.message || err));
        });
      });
    });
    listEl.querySelectorAll('.view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').getAttribute('data-id');
        var doc = documents.filter(function (d) { return d.id === id; })[0];
        CortexClient.getDocumentSignedUrl(supabase, doc.storage_path).then(function (url) {
          window.open(url, '_blank');
        }).catch(function (err) {
          alert('Could not open document: ' + (err.message || err));
        });
      });
    });
    listEl.querySelectorAll('.delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').getAttribute('data-id');
        var doc = documents.filter(function (d) { return d.id === id; })[0];
        if (!confirm('Delete "' + doc.name + '"? This removes the file permanently.')) return;
        CortexClient.deleteDocument(supabase, id, doc.storage_path).then(function () {
          documents = documents.filter(function (d) { return d.id !== id; });
          refresh(supabase, documents, clientById);
        }).catch(function (err) {
          alert('Could not delete: ' + (err.message || err));
        });
      });
    });
  }

  function wireUploadForm(supabase, clientById) {
    document.getElementById('uploadForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var errorEl = document.getElementById('uploadError');
      errorEl.classList.remove('show');
      var fileInput = document.getElementById('docFile');
      var file = fileInput.files[0];
      if (!file) {
        errorEl.textContent = 'Choose a file first.';
        errorEl.classList.add('show');
        return;
      }
      var clientId = document.getElementById('docClientSelect').value;
      var docType = document.getElementById('docTypeSelect').value;
      var notes = document.getElementById('docNotes').value.trim();

      var btn = document.getElementById('uploadSubmit');
      btn.disabled = true;
      btn.textContent = 'Uploading…';
      CortexClient.uploadDocument(supabase, clientId, file, docType, notes).then(function () {
        btn.disabled = false;
        btn.textContent = 'Upload';
        document.getElementById('uploadForm').reset();
        return CortexClient.listAllDocuments(supabase);
      }).then(function (documents) {
        refresh(supabase, documents, clientById);
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Upload';
        errorEl.textContent = err.message || 'Upload failed.';
        errorEl.classList.add('show');
      });
    });
  }

  window.DocumentsController = { init: init };
})();
