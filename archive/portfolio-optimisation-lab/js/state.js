/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   state.js — global state, the demo portfolio, and the two identity/clone
   helpers the state object needs at construction time.
   ========================================================================= */

const uid = (() => { let n=0; return (p='id') => p + '_' + (++n) + '_' + Math.random().toString(36).slice(2,7); })();
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------------------------- demo portfolio ---------------------------- */
function demoHoldings(){
  return [
    {id: uid('h'), ticker:'AAPL', name:'Apple Inc.', value:42000},
    {id: uid('h'), ticker:'NVDA', name:'NVIDIA Corp.', value:37500},
    {id: uid('h'), ticker:'MSFT', name:'Microsoft Corp.', value:24800},
    {id: uid('h'), ticker:'VWRL', name:'Vanguard FTSE All-World ETF', value:18200},
    {id: uid('h'), ticker:'GOOGL', name:'Alphabet Inc.', value:11600},
    {id: uid('h'), ticker:'AMZN', name:'Amazon.com Inc.', value:8700},
    {id: uid('h'), ticker:'TSLA', name:'Tesla Inc.', value:4300},
    {id: uid('h'), ticker:'JEPQ', name:'JPM Nasdaq Equity Premium Income ETF', value:2650},
    {id: uid('h'), ticker:'CASH', name:'Cash', value:1850},
  ];
}

/* ---------------------------- state ---------------------------- */
const state = {
  view: 'portfolio',
  portfolio: { holdings: demoHoldings() },
  isDemo: true,
  scenarios: [],          // {id, name, edits:[], editHistory:[] (undone edits for redo-less undo), createdFromPreset}
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
