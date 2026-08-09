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
  };
})();
