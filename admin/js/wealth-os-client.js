/**
 * Cross-schema read/write for wealth_os client data, used by the Cortex
 * Client Workspace. Kept separate from cortex-client.js since it's a
 * different schema and a different read/write posture -- most functions
 * here are read-only (canonical Wealth OS data; editing stays in Wealth
 * OS's own adviser Manual Entry UI), with investment_plans/*/decision_log_entries
 * being the deliberate exception (see header comments on those functions).
 *
 * Every function here involves at least one dependent follow-up query (an
 * id list from one fetch feeding a .in() filter on the next), so this file
 * uses async/await throughout rather than the .then() chains used in
 * cortex-client.js -- clearer for this file's shape of work, matching how
 * hub/wealth-os.html's own fetchClientBundle() handles the same kind of
 * multi-step dependent fetch.
 */
(function () {
  function wo(supabase) { return supabase.schema('wealth_os'); }

  function unwrap(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  // ---------- Read-only: canonical Wealth OS data ----------

  async function listClients(supabase) {
    const res = await wo(supabase)
      .from('clients')
      .select('id, first_name, last_name, risk_profile, last_updated')
      .order('first_name', { ascending: true });
    return unwrap(res);
  }

  async function getClientSummary(supabase, clientId) {
    const res = await wo(supabase).from('clients').select('*').eq('id', clientId).single();
    return unwrap(res);
  }

  async function getAccountsAndHoldings(supabase, clientId) {
    const accounts = unwrap(
      await wo(supabase).from('accounts').select('*').eq('client_id', clientId)
    );
    const accountIds = accounts.map((a) => a.id);
    const holdings = accountIds.length
      ? unwrap(await wo(supabase).from('holdings').select('*').in('account_id', accountIds))
      : [];
    return { accounts, holdings };
  }

  async function getGoals(supabase, clientId) {
    const goals = unwrap(
      await wo(supabase).from('goals').select('*').eq('client_id', clientId)
    );
    const goalIds = goals.map((g) => g.id);
    const goalAccounts = goalIds.length
      ? unwrap(await wo(supabase).from('goal_accounts').select('*').in('goal_id', goalIds))
      : [];
    return { goals, goalAccounts };
  }

  /** One query covering every client's accounts, summed client-side into a
   *  { clientId: totalValue } map -- used by the client picker list so it
   *  doesn't need one round-trip per client just to show a portfolio total. */
  async function getPortfolioTotalsByClient(supabase) {
    const rows = unwrap(await wo(supabase).from('accounts').select('client_id, value'));
    const totals = {};
    for (const r of rows) {
      totals[r.client_id] = (totals[r.client_id] || 0) + Number(r.value || 0);
    }
    return totals;
  }

  // ---------- Read/write: investment_plans / decision_log_entries ----------
  // Confirmed intended home for Cortex's client-level planning/decisions
  // (schema-only until this module, zero prior application references).
  // RLS on these tables is client-OR-adviser -- client-visible by design,
  // unlike cortex.client_context / cortex.investment_decisions. Callers
  // should treat content written here as potentially client-facing.

  /** Returns the client's current active plan (nested with its investments
   *  and each investment's account allocations), or { plan: null, investments: [] }
   *  if no active plan exists yet. */
  async function getInvestmentPlan(supabase, clientId) {
    const plan = unwrap(
      await wo(supabase)
        .from('investment_plans')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .maybeSingle()
    );
    if (!plan) return { plan: null, investments: [] };

    const planInvestments = unwrap(
      await wo(supabase).from('plan_investments').select('*').eq('plan_id', plan.id)
    );
    const investmentIds = planInvestments.map((pi) => pi.id);
    const accountRows = investmentIds.length
      ? unwrap(
          await wo(supabase)
            .from('plan_investment_accounts')
            .select('*')
            .in('plan_investment_id', investmentIds)
        )
      : [];

    const investments = planInvestments.map((pi) => ({
      ...pi,
      accounts: accountRows.filter((a) => a.plan_investment_id === pi.id),
    }));

    return { plan, investments };
  }

  /** Metadata-only history of past plans (any status) for the Plan History
   *  list -- does not fetch nested investments, kept intentionally light. */
  async function listPlanHistory(supabase, clientId) {
    const res = await wo(supabase)
      .from('investment_plans')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    return unwrap(res);
  }

  /**
   * Saves edits to the given plan IN PLACE (no status change) -- editing an
   * active plan is not the same as replacing it, see createNewPlan() for that.
   * `investments` is the full current-state array the UI is holding, each
   * item shaped { id?, name, ticker, asset_class, target_weight_pct, notes,
   * accounts: [{ id?, account_id, allocation_pct, notes, _deleted? }], _deleted? }.
   * Rows without an `id` are inserted; rows with `_deleted: true` are removed
   * (and, for an investment being removed, its account rows are removed
   * first to satisfy the FK); everything else is updated.
   */
  async function saveActivePlan(supabase, planId, planFields, investments) {
    const w = wo(supabase);

    unwrap(await w.from('investment_plans').update(planFields).eq('id', planId));

    for (const inv of investments) {
      if (inv._deleted) {
        if (inv.id) {
          unwrap(await w.from('plan_investment_accounts').delete().eq('plan_investment_id', inv.id));
          unwrap(await w.from('plan_investments').delete().eq('id', inv.id));
        }
        continue;
      }

      const invFields = {
        plan_id: planId,
        name: inv.name,
        ticker: inv.ticker || null,
        asset_class: inv.asset_class || null,
        target_weight_pct: inv.target_weight_pct,
        notes: inv.notes || null,
      };
      let investmentId = inv.id;
      if (investmentId) {
        unwrap(await w.from('plan_investments').update(invFields).eq('id', investmentId));
      } else {
        const created = unwrap(
          await w.from('plan_investments').insert(invFields).select().single()
        );
        investmentId = created.id;
      }

      for (const acc of inv.accounts || []) {
        if (acc._deleted) {
          if (acc.id) unwrap(await w.from('plan_investment_accounts').delete().eq('id', acc.id));
          continue;
        }
        const accFields = {
          plan_investment_id: investmentId,
          account_id: acc.account_id,
          allocation_pct: acc.allocation_pct,
          notes: acc.notes || null,
        };
        if (acc.id) {
          unwrap(await w.from('plan_investment_accounts').update(accFields).eq('id', acc.id));
        } else {
          unwrap(await w.from('plan_investment_accounts').insert(accFields));
        }
      }
    }

    return getInvestmentPlan(supabase, planFields.client_id);
  }

  /** Creates a new plan. If an active plan already exists for this client,
   *  it is superseded (status='superseded', superseded_by_plan_id set) --
   *  the new plan becomes 'active' immediately (no separate draft/activate
   *  step in V1). */
  async function createNewPlan(supabase, clientId, planFields) {
    const w = wo(supabase);
    const existingActive = unwrap(
      await w.from('investment_plans').select('id').eq('client_id', clientId).eq('status', 'active').maybeSingle()
    );

    const created = unwrap(
      await w
        .from('investment_plans')
        .insert({ ...planFields, client_id: clientId, status: 'active' })
        .select()
        .single()
    );

    if (existingActive) {
      unwrap(
        await w
          .from('investment_plans')
          .update({ status: 'superseded', superseded_by_plan_id: created.id })
          .eq('id', existingActive.id)
      );
    }

    return created;
  }

  async function listDecisions(supabase, clientId) {
    const res = await wo(supabase)
      .from('decision_log_entries')
      .select('*')
      .eq('client_id', clientId)
      .order('entry_date', { ascending: false });
    return unwrap(res);
  }

  async function addDecision(supabase, clientId, fields) {
    const res = await wo(supabase)
      .from('decision_log_entries')
      .insert({ ...fields, client_id: clientId })
      .select()
      .single();
    return unwrap(res);
  }

  async function updateDecision(supabase, id, fields) {
    const res = await wo(supabase).from('decision_log_entries').update(fields).eq('id', id).select().single();
    return unwrap(res);
  }

  async function deleteDecision(supabase, id) {
    const res = await wo(supabase).from('decision_log_entries').delete().eq('id', id);
    return unwrap(res);
  }

  window.WealthOsClient = {
    wo,
    listClients,
    getPortfolioTotalsByClient,
    getClientSummary,
    getAccountsAndHoldings,
    getGoals,
    getInvestmentPlan,
    listPlanHistory,
    saveActivePlan,
    createNewPlan,
    listDecisions,
    addDecision,
    updateDecision,
    deleteDecision,
  };
})();
