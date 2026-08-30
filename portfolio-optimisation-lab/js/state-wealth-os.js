/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — Wealth OS (live data) integration
   The Everyday Investor

   state-wealth-os.js — same state shape as js/state.js, but holdings start
   empty and load live from Supabase (see data-wealth-os.js) instead of a
   hardcoded demo portfolio. Loaded in place of state.js -- never load both
   on the same page, they both declare `const state`.
   ========================================================================= */

const uid = (() => { let n=0; return (p='id') => p + '_' + (++n) + '_' + Math.random().toString(36).slice(2,7); })();
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------------------------- state ---------------------------- */
const state = {
  view: 'portfolio',
  portfolio: { holdings: [] },
  isDemo: false,
  dataStatus: 'loading', // 'loading' | 'ready' | 'empty' | 'error' -- see data-wealth-os.js bootFromWealthOS()
  clientId: null,
  scenarios: [],          // {id, name, edits:[], editHistory:[], createdFromPreset, _persisted} -- loaded from wealth_os.portfolio_scenarios
  activeScenarioIds: [],  // up to 3, order matters (tabs)
  currentScenarioTabId: null, // which scenario tab is showing in Optimise view ('current' or scenario id)
  resultsFocusId: null,       // which scenario the Results page narrative is built around
  compareIds: [],         // scenario ids selected for Compare (current always included)
  targetWeights: {},      // holdingId -> target % (draft, in Optimise > Target allocation tool)
  conversation: [],       // {role:'user'|'system', text?, lines?, cards?} — shared feed across Analyse & Optimise
  moveThresholds: [1],
  ui: {
    analyseSubview: 'treemap', // 'treemap' | 'bartable'
    modal: null, // {type, ...}
  }
};
