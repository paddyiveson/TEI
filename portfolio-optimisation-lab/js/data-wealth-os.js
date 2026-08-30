/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — Wealth OS (live data) integration
   The Everyday Investor

   data-wealth-os.js — loads live holdings + scenarios from Supabase
   (wealth_os schema) via window.teiSupabase, and makes scenario edits
   persist there. Loaded AFTER calc-engine.js and BEFORE app-wealth-os.js.

   The seven scenario-management functions below (createScenario,
   getScenario, getScenarioResult, removeScenario, duplicateScenario,
   addEditToScenario, removeEditFromScenario, undoLastEdit, resetScenario)
   intentionally redeclare the ones calc-engine.js already defines. Classic
   (non-module) scripts share one global scope, so the last `function`
   declaration wins -- this file loading after calc-engine.js means these
   versions (calc-engine's logic plus a persist call) are what actually
   run, without editing calc-engine.js itself. Keeps the calc engine a
   single shared file between this page and the demo-data standalone Lab,
   rather than forking it.
   ========================================================================= */

async function getSupabaseClient(){
  await TeiAuth.waitForReady();
  if (!window.teiSupabase) throw new Error('Supabase client failed to initialise.');
  return window.teiSupabase;
}

async function resolveClientId(sb){
  const { data: { user } } = await sb.auth.getUser();
  if (!user){
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/hub/login.html?redirect=' + redirect;
    return null; // navigating away
  }
  // wealth_os.clients.user_id -- same lookup hub/wealth-os.html's
  // loadWealthOSClient() does. Client-facing only for now -- no adviser
  // "pick a client" flow, so an adviser login with no matching
  // clients.user_id row surfaces as the .single() error below.
  const { data, error } = await sb
    .from('clients')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (error) throw error;
  return data.id;
}

async function fetchHoldingsForClient(sb, clientId){
  const { data: accounts, error: aErr } = await sb
    .from('accounts')
    .select('id')
    .eq('client_id', clientId);
  if (aErr) throw aErr;
  const accountIds = (accounts || []).map(a => a.id);
  if (!accountIds.length) return [];

  const { data: holdings, error: hErr } = await sb
    .from('holdings')
    .select('id, name, ticker, value, last_price, sector')
    .in('account_id', accountIds);
  if (hErr) throw hErr;

  // The calc engine works on {id, ticker, name, value} -- map straight
  // across. NOTE: flat, always-aggregated, no per-account grouping and no
  // duplicate-ticker merging -- see INTEGRATION_NOTES.md's "Outstanding
  // from original scope". Needs its own pass, not a small edit here.
  return (holdings || []).map(h => ({
    id: h.id,
    ticker: h.ticker || '',
    name: h.name || h.ticker || 'Holding',
    value: Number(h.value) || 0,
  }));
}

async function fetchScenariosForClient(sb, clientId){
  const { data, error } = await sb
    .from('portfolio_scenarios')
    .select('id, name, edits, meta, created_at, updated_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    edits: row.edits || [],
    editHistory: [],
    createdFromPreset: (row.meta || {}).createdFromPreset || null,
    _persisted: true,
  }));
}

async function persistScenario(sc){
  if (!state.clientId) return;
  try {
    const sb = await getSupabaseClient();
    const payload = {
      client_id: state.clientId,
      name: sc.name,
      edits: sc.edits,
      meta: { createdFromPreset: sc.createdFromPreset || null },
      updated_at: new Date().toISOString(),
    };
    if (sc._persisted){
      const { error } = await sb.from('portfolio_scenarios').update(payload).eq('id', sc.id);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('portfolio_scenarios').insert(payload).select('id').single();
      if (error) throw error;
      sc.id = data.id;
      sc._persisted = true;
    }
  } catch (err){
    console.error('Failed to save scenario', err);
    showToast('Could not save scenario — check your connection and try again.');
  }
}

async function deleteScenarioRemote(scenarioId){
  try {
    const sb = await getSupabaseClient();
    const { error } = await sb.from('portfolio_scenarios').delete().eq('id', scenarioId);
    if (error) throw error;
  } catch (err){
    console.error('Failed to delete scenario', err);
    showToast('Could not delete scenario — check your connection and try again.');
  }
}

// Debounce so rapid edits (drag/slider interactions) don't fire a save per tick.
const _scenarioSaveTimers = {};
function saveScenarioDebounced(sc){
  clearTimeout(_scenarioSaveTimers[sc.id]);
  _scenarioSaveTimers[sc.id] = setTimeout(() => persistScenario(sc), 600);
}

async function bootFromWealthOS(){
  try {
    const sb = await getSupabaseClient();
    const clientId = await resolveClientId(sb);
    if (clientId === null) return; // resolveClientId already redirected to login
    state.clientId = clientId;
    const [holdings, scenarios] = await Promise.all([
      fetchHoldingsForClient(sb, clientId),
      fetchScenariosForClient(sb, clientId),
    ]);
    state.portfolio.holdings = holdings;
    state.scenarios = scenarios;
    state.dataStatus = holdings.length ? 'ready' : 'empty';
  } catch (err){
    console.error('Wealth OS Lab boot failed', err);
    state.dataStatus = 'error';
  }
  render();
}

/* ---------------------------- scenario management (persisted) ---------------------------- */
function createScenario(name, edits=[], meta={}){
  const sc = { id: uid('sc'), name, edits, editHistory:[], _persisted:false, ...meta };
  state.scenarios.push(sc);
  if (state.activeScenarioIds.length < 3) state.activeScenarioIds.push(sc.id);
  persistScenario(sc);
  return sc;
}
function getScenario(id){ return state.scenarios.find(s=>s.id===id); }
function getScenarioResult(sc){ return applyEdits(state.portfolio.holdings, sc.edits); }
function removeScenario(id){
  const sc = getScenario(id);
  state.scenarios = state.scenarios.filter(s=>s.id!==id);
  state.activeScenarioIds = state.activeScenarioIds.filter(i=>i!==id);
  state.compareIds = state.compareIds.filter(i=>i!==id);
  if (state.currentScenarioTabId === id) state.currentScenarioTabId = 'current';
  if (sc && sc._persisted) deleteScenarioRemote(id);
}
function duplicateScenario(id){
  const sc = getScenario(id);
  if (!sc) return;
  const copy = createScenario(sc.name + ' (copy)', clone(sc.edits));
  return copy;
}
function addEditToScenario(scId, edit){
  const sc = getScenario(scId);
  if (!sc) return;
  sc.edits.push({...edit, id: uid('ed')});
  saveScenarioDebounced(sc);
}
function removeEditFromScenario(scId, editId){
  const sc = getScenario(scId);
  if (!sc) return;
  sc.edits = sc.edits.filter(e=>e.id!==editId);
  saveScenarioDebounced(sc);
}
function undoLastEdit(scId){
  const sc = getScenario(scId);
  if (!sc || sc.edits.length===0) return;
  sc.editHistory.push(sc.edits.pop());
  saveScenarioDebounced(sc);
}
function resetScenario(scId){
  const sc = getScenario(scId);
  if (!sc) return;
  sc.edits = [];
  saveScenarioDebounced(sc);
}
