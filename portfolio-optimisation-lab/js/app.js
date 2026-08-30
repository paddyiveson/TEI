/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   app.js — render() dispatcher, renderTopbar, renderDisclaimerStrip, and
   boot. Loaded last, after every other module.
   ========================================================================= */

const STAGES = [
  {id:'portfolio', num:'I', label:'Portfolio'},
  {id:'analyse', num:'II', label:'Analyse'},
  {id:'optimise', num:'III', label:'Optimise'},
  {id:'compare', num:'IV', label:'Compare'},
  {id:'implement', num:'V', label:'Implement'},
  {id:'results', num:'VI', label:'Results'},
];

function render(){
  renderTopbar();
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  if (state.view==='portfolio') renderPortfolioView(root);
  if (state.view==='analyse') renderAnalyseView(root);
  if (state.view==='optimise') renderOptimiseView(root);
  if (state.view==='compare') renderCompareView(root);
  if (state.view==='implement') renderImplementView(root);
  if (state.view==='results') renderResultsView(root);
  window.scrollTo({top:0, behavior:'instant'});
}

function renderTopbar(){
  const weighted = computeTotals(state.portfolio.holdings);
  const total = sum(state.portfolio.holdings.map(h=>h.value));
  document.getElementById('portfolio-pill').innerHTML =
    `<span>${state.isDemo ? 'Demo portfolio' : 'Your portfolio'}</span><b>${fmtGBP(total)}</b><span>· ${weighted.length} holdings</span>`;

  const nav = document.getElementById('stage-nav');
  nav.innerHTML = '';
  STAGES.forEach((s,i) => {
    const btn = document.createElement('button');
    btn.className = 'stage-btn' + (state.view===s.id ? ' active' : '');
    btn.innerHTML = `<span class="num">${s.num}</span><span>${s.label}</span>`;
    btn.onclick = () => { state.view = s.id; render(); };
    nav.appendChild(btn);
  });
}

/* =============================== disclaimers =============================== */
function renderDisclaimerStrip(){
  return `
    <div class="disclaimer-strip">
      <b>What this tool does and doesn't account for.</b> The Portfolio Optimisation Lab calculates and models the portfolios and scenarios you build. It does not account for tax consequences, dealing costs, future returns, suitability, liquidity, or your other personal circumstances unless you've explicitly modelled them yourself. Figures marked <span class="approx-flag" style="vertical-align:middle;">Approximate</span> use a linear, all-else-equal approximation; larger scenario changes are recalculated exactly. Figures marked <span class="illustrative-flag" style="vertical-align:middle;">Illustrative</span> — blended volatility and the growth pattern chart — are built from indicative, type-based assumptions rather than real market data or price history, and are not a forecast, projection, or expectation of actual returns. This tool models hypothetical outcomes — it does not recommend or imply a course of action for you specifically. For guidance on your own circumstances, speak with a regulated financial adviser.
    </div>
  `;
}

/* =============================== boot =============================== */
render();
