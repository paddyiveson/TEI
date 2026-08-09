/**
 * Data access for the `cortex` schema. Auth/role gating lives in
 * admin-auth.js -- this module only knows about Cortex tables, and assumes
 * the caller has already confirmed an adviser session via
 * TeiAdminAuth.requireAdviser(). Mirrors the wo() schema-helper pattern in
 * hub/wealth-os.html (cx() here, same shape, new schema).
 *
 * RLS on every cortex.* table scopes rows to adviser_id = current_adviser_id()
 * -- this module always sets adviser_id explicitly on writes rather than
 * relying on a DB default, since RLS's WITH CHECK compares against the
 * client-supplied value.
 */
(function () {
  function cx(supabase) { return supabase.schema('cortex'); }

  var adviserIdPromise = null;
  /** Resolves the current session's cortex.advisers.id, cached after first lookup. */
  function getCurrentAdviserId(supabase) {
    if (!adviserIdPromise) {
      adviserIdPromise = TeiAuth.getUser().then(function (result) {
        var user = result.data && result.data.user;
        if (!user) throw new Error('Not signed in.');
        return cx(supabase).from('advisers').select('id').eq('supabase_user_id', user.id).single();
      }).then(function (res) {
        if (res.error) throw res.error;
        return res.data.id;
      });
    }
    return adviserIdPromise;
  }

  function listInvestments(supabase) {
    return cx(supabase).from('investments').select('*').then(unwrap);
  }

  function getInvestment(supabase, id) {
    return cx(supabase).from('investments').select('*').eq('id', id).single().then(unwrap);
  }

  function createInvestment(supabase, fields) {
    return getCurrentAdviserId(supabase).then(function (adviserId) {
      var row = Object.assign({}, fields, { adviser_id: adviserId });
      return cx(supabase).from('investments').insert(row).select().single().then(unwrap);
    });
  }

  /** Always stamps updated_at -- no DB trigger does this automatically. */
  function updateInvestment(supabase, id, patch) {
    var row = Object.assign({}, patch, { updated_at: new Date().toISOString() });
    return cx(supabase).from('investments').update(row).eq('id', id).select().single().then(unwrap);
  }

  function listDecisions(supabase, investmentId) {
    return cx(supabase).from('investment_decisions').select('*')
      .eq('investment_id', investmentId)
      .order('created_at', { ascending: false })
      .then(unwrap);
  }

  /** Insert-only by design -- no update/delete function exists in this module,
   *  matching the DB (no UPDATE/DELETE RLS policy on investment_decisions). */
  function addDecision(supabase, investmentId, fields) {
    return getCurrentAdviserId(supabase).then(function (adviserId) {
      var row = Object.assign({}, fields, { investment_id: investmentId, adviser_id: adviserId });
      return cx(supabase).from('investment_decisions').insert(row).select().single().then(unwrap);
    });
  }

  /** Read-only cross-schema read of TEI coaching clients (wealth_os.clients). */
  function listClientsReadOnly(supabase) {
    return supabase.schema('wealth_os').from('clients')
      .select('id, first_name, last_name')
      .order('first_name', { ascending: true })
      .then(unwrap);
  }

  function getClientContext(supabase, clientReference) {
    return cx(supabase).from('client_context').select('*')
      .eq('client_reference', clientReference)
      .maybeSingle()
      .then(unwrap);
  }

  /** cortex.client_context has a real UNIQUE(adviser_id, client_reference)
   *  constraint, so this is a plain atomic upsert -- no select-then-branch
   *  needed (unlike cortex.investments, which has no such constraint). */
  function saveClientContext(supabase, clientReference, fields) {
    return getCurrentAdviserId(supabase).then(function (adviserId) {
      var row = Object.assign({}, fields, {
        adviser_id: adviserId,
        client_reference: clientReference,
        updated_at: new Date().toISOString(),
      });
      return cx(supabase).from('client_context')
        .upsert(row, { onConflict: 'adviser_id,client_reference' })
        .select().single().then(unwrap);
    });
  }

  // ---------- Client Workspace: client_notes / client_follow_ups ----------
  // Informal, editable adviser-private records (unlike investment_decisions'
  // append-only model) -- see admin/css/admin-tokens.css .visibility-note.private
  // and the plan's rationale for why these stay separate from client_context.

  function listClientNotes(supabase, clientReference) {
    return cx(supabase).from('client_notes').select('*')
      .eq('client_reference', clientReference)
      .order('created_at', { ascending: false })
      .then(unwrap);
  }

  function addClientNote(supabase, clientReference, body) {
    return getCurrentAdviserId(supabase).then(function (adviserId) {
      return cx(supabase).from('client_notes')
        .insert({ adviser_id: adviserId, client_reference: clientReference, body: body })
        .select().single().then(unwrap);
    });
  }

  function updateClientNote(supabase, id, body) {
    return cx(supabase).from('client_notes')
      .update({ body: body, updated_at: new Date().toISOString() })
      .eq('id', id).select().single().then(unwrap);
  }

  function deleteClientNote(supabase, id) {
    return cx(supabase).from('client_notes').delete().eq('id', id).then(unwrap);
  }

  /** Open follow-ups across every client, for the Home dashboard -- not
   *  scoped to one client_reference like listFollowUps(). */
  function listAllOpenFollowUps(supabase) {
    return cx(supabase).from('client_follow_ups').select('*')
      .eq('status', 'open')
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(unwrap);
  }

  /** Most recent Investment Intelligence decisions across every investment,
   *  for the Home dashboard -- not scoped to one investment_id like
   *  listDecisions(). */
  function listAllInvestmentDecisions(supabase, limit) {
    return cx(supabase).from('investment_decisions').select('*')
      .order('created_at', { ascending: false })
      .limit(limit || 5)
      .then(unwrap);
  }

  function listFollowUps(supabase, clientReference) {
    return cx(supabase).from('client_follow_ups').select('*')
      .eq('client_reference', clientReference)
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(unwrap);
  }

  function addFollowUp(supabase, clientReference, fields) {
    return getCurrentAdviserId(supabase).then(function (adviserId) {
      var row = Object.assign({}, fields, { adviser_id: adviserId, client_reference: clientReference });
      return cx(supabase).from('client_follow_ups').insert(row).select().single().then(unwrap);
    });
  }

  function updateFollowUp(supabase, id, fields) {
    var row = Object.assign({}, fields, { updated_at: new Date().toISOString() });
    return cx(supabase).from('client_follow_ups').update(row).eq('id', id).select().single().then(unwrap);
  }

  function deleteFollowUp(supabase, id) {
    return cx(supabase).from('client_follow_ups').delete().eq('id', id).then(unwrap);
  }

  // ---------- Documents ----------
  // Storage + cortex.client_documents. Extraction is deliberately manual --
  // upload here, then ask Claude Code in a session to read the file and help
  // populate the client record. No automated pipeline, no "proposed" staging
  // state -- status is a plain field the adviser sets by hand.

  var DOCUMENTS_BUCKET = 'client-documents';

  function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  function uploadDocument(supabase, clientReference, file, documentType, notes) {
    return getCurrentAdviserId(supabase).then(function (adviserId) {
      var path = clientReference + '/' + Date.now() + '-' + sanitizeFilename(file.name);
      return supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file).then(function (uploadRes) {
        if (uploadRes.error) throw uploadRes.error;
        return cx(supabase).from('client_documents').insert({
          adviser_id: adviserId,
          client_reference: clientReference,
          name: file.name,
          document_type: documentType,
          storage_path: path,
          notes: notes || null,
        }).select().single().then(unwrap);
      });
    });
  }

  function listClientDocuments(supabase, clientReference) {
    return cx(supabase).from('client_documents').select('*')
      .eq('client_reference', clientReference)
      .order('uploaded_at', { ascending: false })
      .then(unwrap);
  }

  /** All documents across every client, for the global Documents library. */
  function listAllDocuments(supabase) {
    return cx(supabase).from('client_documents').select('*')
      .order('uploaded_at', { ascending: false })
      .then(unwrap);
  }

  function updateDocument(supabase, id, fields) {
    var row = Object.assign({}, fields, { updated_at: new Date().toISOString() });
    return cx(supabase).from('client_documents').update(row).eq('id', id).select().single().then(unwrap);
  }

  function deleteDocument(supabase, id, storagePath) {
    return supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]).then(function () {
      return cx(supabase).from('client_documents').delete().eq('id', id).then(unwrap);
    });
  }

  function getDocumentSignedUrl(supabase, storagePath) {
    return supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, 300).then(function (res) {
      if (res.error) throw res.error;
      return res.data.signedUrl;
    });
  }

  function unwrap(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  window.CortexClient = {
    cx: cx,
    getCurrentAdviserId: getCurrentAdviserId,
    listInvestments: listInvestments,
    getInvestment: getInvestment,
    createInvestment: createInvestment,
    updateInvestment: updateInvestment,
    listDecisions: listDecisions,
    addDecision: addDecision,
    listClientsReadOnly: listClientsReadOnly,
    getClientContext: getClientContext,
    saveClientContext: saveClientContext,
    listClientNotes: listClientNotes,
    addClientNote: addClientNote,
    updateClientNote: updateClientNote,
    deleteClientNote: deleteClientNote,
    listFollowUps: listFollowUps,
    listAllOpenFollowUps: listAllOpenFollowUps,
    listAllInvestmentDecisions: listAllInvestmentDecisions,
    addFollowUp: addFollowUp,
    updateFollowUp: updateFollowUp,
    deleteFollowUp: deleteFollowUp,
    uploadDocument: uploadDocument,
    listClientDocuments: listClientDocuments,
    listAllDocuments: listAllDocuments,
    updateDocument: updateDocument,
    deleteDocument: deleteDocument,
    getDocumentSignedUrl: getDocumentSignedUrl,
  };
})();
