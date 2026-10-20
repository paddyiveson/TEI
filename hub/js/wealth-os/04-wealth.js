window.TEI = window.TEI || {};
TEI.render = TEI.render || {};

(function(){
  const {fmtGBP, monthLabel} = TEI.data;

  /* Shared ETA text, local copy; Home's version lives in a separate IIFE scope. */
  function estimateCompletionText(remaining, monthlyContrib){
    if(remaining<=0) return 'Reached';
    if(monthlyContrib<=0) return 'add regular contributions to see an estimated date';
    const monthsNeeded = Math.ceil(remaining/monthlyContrib);
    if(monthsNeeded > 600) return 'a long-term horizon at current contributions';
    const d = new Date(); d.setMonth(d.getMonth()+monthsNeeded);
    return 'est. ' + d.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  }

  /* ---------- asset / liability / composition math, shared across this page's sections ---------- */
  function investTotal(client, b){ return client.accounts.filter(a=>['isa','gia','lisa'].includes(a.type)).reduce((s,a)=>s+(Number(b[a.id])||0),0); }
  function pensionTotal(client, b){ return client.accounts.filter(a=>a.type==='pension').reduce((s,a)=>s+(Number(b[a.id])||0),0); }
  function cashAcctTotal(client, b){ return client.accounts.filter(a=>a.type==='cash'||a.type==='cash_isa'||a.type==='cash_lisa').reduce((s,a)=>s+(Number(b[a.id])||0),0); }
  function cryptoTotal(client, b){ return client.accounts.filter(a=>a.type==='crypto').reduce((s,a)=>s+(Number(b[a.id])||0),0); }
  function otherAssetsTotal(client){ return (client.wealth.assets||[]).filter(a=>a.type!=='property').reduce((s,a)=>s+(Number(a.value)||0),0); }
  function propertyValue(client){ return (client.wealth.assets||[]).filter(a=>a.type==='property').reduce((s,a)=>s+(Number(a.value)||0),0); }

  function liabilityGroups(client){
    const groups = {mortgage:{label:'Mortgage', total:0, items:[]}, loan:{label:'Loans', total:0, items:[]}, credit:{label:'Credit', total:0, items:[]}, other:{label:'Other liabilities', total:0, items:[]}};
    (client.wealth.liabilities||[]).forEach(l=>{
      const key = groups[l.type] ? l.type : 'other';
      groups[key].total += Number(l.balance)||0;
      groups[key].items.push(l);
    });
    return groups;
  }
  function liabilitiesTotal(client){
    const g = liabilityGroups(client);
    return g.mortgage.total + g.loan.total + g.credit.total + g.other.total;
  }
  function grossAssetsTotal(client, b){
    return investTotal(client,b) + pensionTotal(client,b) + cashAcctTotal(client,b) + cryptoTotal(client,b) + propertyValue(client) + otherAssetsTotal(client);
  }

  /* Total net worth for THIS page = investable net worth (accounts) + property + other assets
     minus liabilities. Deliberately broader than TEI.calc.latestNetWorth, which stays
     accounts-only, FI / Coast FI / retirement maths should not treat illiquid assets like
     property as spendable, so those calculations (homepage, Goals) keep using the narrower figure. */
  function totalNetWorth(client){
    return TEI.calc.latestNetWorth(client) + propertyValue(client) + otherAssetsTotal(client) - liabilitiesTotal(client);
  }

  /* Timeline at total-net-worth basis: property/other/liabilities have no history yet, so the
     constant offset is applied uniformly across every point, a known simplification, same
     approach as the homepage's Assets breakdown. */
  function totalNetWorthSeries(client){
    const months = TEI.calc.buildMergedMonths(client);
    const unified = TEI.calc.buildUnifiedTotals(months);
    const offset = propertyValue(client) + otherAssetsTotal(client) - liabilitiesTotal(client);
    const out = {};
    Object.keys(unified).forEach(k=> out[k] = unified[k] + offset);
    return out;
  }

  /* Balances are logged monthly. 1W and 1M therefore show the latest logged
     month against the one before it; the others are calendar ranges, each
     starting from the month before the range so the first move is shown. */
  function filterKeysByRange(keys, range){
    if(range==='all' || !keys.length) return keys;
    if(range==='1w' || range==='1m') return keys.slice(-2);
    const now = new Date();
    const back = {'3m':3, '1y':12, '3y':36, '5y':60}[range];
    const cutoff = range==='ytd' ? new Date(now.getFullYear()-1, 11, 1) : new Date(now.getFullYear(), now.getMonth()-(back||12), 1);
    const cutoffKey = cutoff.getFullYear() + '-' + String(cutoff.getMonth()+1).padStart(2,'0');
    const out = keys.filter(k=>k>=cutoffKey);
    return out.length >= 2 ? out : keys.slice(-2);
  }

  function accountLastUpdated(client, acc){
    const months = client.months||{};
    const keys = Object.keys(months).filter(k=> months[k] && months[k][acc.id]!==undefined).sort();
    return keys.length ? keys[keys.length-1] : null;
  }

  function initials(text){
    const parts = (text||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return '–';
    return (parts[0][0] + (parts[1]?parts[1][0]:'')).toUpperCase();
  }

  const ACCOUNT_TYPE_LABEL = {isa:'ISA', gia:'GIA', pension:'Pension', lisa:'S&S LISA', cash_lisa:'Cash LISA', cash:'Current / Deposit Account', cash_isa:'Cash ISA', crypto:'Crypto'};

  /* ---------------- 1. Net worth hero: total, as-of chip, annual return ----------------
     The total counts up (TEI.ui.countUp, in the Wealth board wrapper). The
     stats line (B5.1) is gain and return for the selected range (set in
     renderTimeline) and the annualised return, which always covers all time. */
  function renderOverview(client){
    const months = TEI.calc.buildMergedMonths(client);
    const keys = Object.keys(months).sort();
    const netEl = document.getElementById('whNet');
    if(TEI.ui && TEI.ui.countUp) TEI.ui.countUp(netEl, totalNetWorth(client), v=> fmtGBP(Math.round(v)));
    else netEl.textContent = fmtGBP(totalNetWorth(client));
    document.getElementById('whUpdated').textContent = keys.length ? 'Your figures · ' + monthLabel(keys[keys.length-1]) : '';

    // Money-weighted on investable money (accounts only -- property and
    // debts have no history): deposits and newly added accounts are money
    // in, not return (TEI.calc.moneyWeightedReturn).
    const series = TEI.calc.buildUnifiedTotals(months);
    const moneyIn = TEI.calc.moneyInByMonth(client, months);
    const annEl = document.getElementById('wlStatAnn');
    const ann = keys.length > 1 ? TEI.calc.annualisedReturnPct(series, moneyIn) : null;
    annEl.textContent = ann != null ? ann.toFixed(1) + '% a year'
      : keys.length < 2 ? 'Annual return once two months are logged' : 'Annual return ' + TEI.calc.annualisedPendingText(series).charAt(0).toLowerCase() + TEI.calc.annualisedPendingText(series).slice(1);
    annEl.className = ann == null ? 'wl-st-wait' : '';
  }

  /* ---------------- 3. Net Worth Timeline ---------------- */
  let currentRange = null;

  // All is the default range (B5.1).
  function defaultRange(){ return 'all'; }
  // The period the stats line names (B5.1).
  const RANGE_WORDS = {'1m':'over 1M', '3m':'over 3M', 'ytd':'this year', '1y':'over 1Y', '3y':'over 3Y', '5y':'over 5Y'};

  /* Cumulative "new money in" line for the timeline chart -- lets the gap
     between it and the Net worth line read as growth from performance
     rather than fresh contributions. Built from client.contribLog (the
     monthly Deposits log), summed running total in chronological order
     across every month ever logged (not just the visible range) so a 3Y/1Y
     view still starts from the right baseline. Deposits include bonus/tax
     relief (not growth), so the line matches Account Details' totals.
     Money that predates monthly tracking lands in the month its account
     first appears in the history (not the chart's first month -- an
     account added in September mustn't lift August's line above August's
     net worth):
       - a "before tracking started" lump sum (+ its bonus/relief);
       - for an account with no contribution records at all, its first
         logged balance, so the gap between the lines only shows growth
         since tracking began (flagged under the chart via assumedCount). */
  function cumulativeContributionsSeries(client, allKeys){
    const monthlyTotals = {};
    const add = (k, v)=>{ monthlyTotals[k] = (monthlyTotals[k]||0) + v; };
    Object.entries(client.contribLog||{}).forEach(([monthKey, entry])=>{
      Object.values(entry||{}).forEach(e=>{ const p = TEI.calc.depositParts(e); add(monthKey, p.paidIn + p.sacrifice + p.relief); });
    });
    let assumedCount = 0;
    Object.entries(TEI.calc.accountStartingBalances(client)).forEach(([id, s])=>{
      const cb = TEI.calc.acctContributionBreakdown(client, id);
      if(cb.opening) add(s.key, cb.opening + cb.openingRelief);
      else if(s.noRecords && s.value){ add(s.key, s.value); assumedCount++; }
    });
    // Walk every contribution month, not just allKeys (net-worth snapshot
    // months) -- money logged in a month with no snapshot must still land
    // in the next point's running total, not silently drop out.
    const contribKeys = Object.keys(monthlyTotals).sort();
    let running = 0, i = 0;
    const series = {};
    allKeys.forEach(k=>{
      while(i < contribKeys.length && contribKeys[i] <= k){ running += monthlyTotals[contribKeys[i]]; i++; }
      series[k] = running;
    });
    return { series, assumedCount };
  }

  /* Investable (default) = accounts only, the like-for-like comparison
     with the Contributions line. Total stacks property/other assets less
     debts on top as its own band -- those have no monthly history, so
     they're a flat offset and would otherwise make the gap between the
     lines read as growth (e.g. £202k of house equity). Percentages are
     always on investable money. */
  let currentView = 'investable';

  function renderTimeline(client){
    const months = TEI.calc.buildMergedMonths(client);
    const series = TEI.calc.buildUnifiedTotals(months);   // investable (accounts)
    const totalSeries = totalNetWorthSeries(client);        // + property/other - debts
    const allKeys = Object.keys(series).sort();
    const {GRID, makeChart} = TEI.charts;
    const hasOther = allKeys.some(k=> Math.abs(totalSeries[k] - series[k]) >= 0.5);
    const view = hasOther ? currentView : 'investable';
    const viewToggle = document.getElementById('timelineViewToggle');
    viewToggle.style.display = hasOther ? '' : 'none';
    viewToggle.querySelectorAll('button').forEach(btn=> btn.classList.toggle('active', btn.dataset.view===view));

    if(!currentRange) currentRange = defaultRange(allKeys);
    document.querySelectorAll('#timelineRangeToggle button').forEach(btn=> btn.classList.toggle('active', btn.dataset.range===currentRange));

    const gainEl = document.getElementById('wlStatGain');
    const periodEl = document.getElementById('wlStatPeriod');

    if(!allKeys.length){
      makeChart('chartWealthTimeline', {type:'line', data:{labels:[],datasets:[]}, options:{maintainAspectRatio:false}});
      document.getElementById('timelineEmpty').style.display = 'block';
      gainEl.textContent = '–'; gainEl.className = '';
      periodEl.textContent = 'No history yet'; periodEl.className = 'wl-st-wait';
      return;
    }
    document.getElementById('timelineEmpty').style.display = 'none';

    const filteredKeys = filterKeysByRange(allKeys, currentRange);
    const contrib = cumulativeContributionsSeries(client, allKeys);
    const contribSeries = contrib.series;
    const hasContributions = allKeys.some(k=>contribSeries[k]>0);
    const showContrib = hasContributions && view === 'investable';
    const contribNoteEl = document.getElementById('whContribNote');
    if(contribNoteEl){
      const n = contrib.assumedCount;
      contribNoteEl.style.display = (showContrib && n) ? 'block' : 'none';
      contribNoteEl.textContent = n ? `Contributions include the starting balance of ${n} account${n===1?'':'s'} with no contribution data yet, so the gap shows growth since tracking began. Add their contributions before tracking started (Settings, under Accounts) for the full picture.` : '';
    }
    // Gold fade under the line (strong at the top, clear at the baseline) rather than a flat
    // 14% gold wash, which read as a muddy grey block over the navy card.
    // Board palette (B5): champagne value line, pale blue "money paid in".
    const netWorthFill = ({chart})=>{
      const area = chart.chartArea;
      if(!area) return 'rgba(232,214,168,0.12)';
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, 'rgba(232,214,168,0.36)');
      g.addColorStop(1, 'rgba(232,214,168,0)');
      return g;
    };
    // Value against paid in (B5.1): a champagne line with a gradient under
    // it, and paid in as a dashed pale-blue stepped line. No plan line.
    const hover = c=> ({pointHoverRadius:5, pointHoverBackgroundColor:c, pointHoverBorderColor:'#14376E', pointHoverBorderWidth:2});
    const datasets = [Object.assign({label: hasOther ? 'Investable' : 'Value', data:filteredKeys.map(k=>series[k]), borderColor:'#E8D6A8', backgroundColor:netWorthFill, fill:true, tension:0.3, pointRadius:0, borderWidth:2.6}, hover('#E8D6A8'))];
    if(view === 'total'){
      datasets.push(Object.assign({label:'Total incl. property and debts', data:filteredKeys.map(k=>totalSeries[k]), borderColor:'rgba(247,244,237,0.6)', backgroundColor:'rgba(247,244,237,0.08)', fill:'-1', tension:0.3, pointRadius:0, borderWidth:2}, hover('#F7F4ED')));
    }
    if(showContrib){
      datasets.push(Object.assign({label:'Paid in', data:filteredKeys.map(k=>contribSeries[k]), borderColor:'#B9CAE6', borderDash:[5,5], fill:false, stepped:'before', pointRadius:0, borderWidth:1.6}, hover('#B9CAE6')));
    }
    // Scrubbing (B5.1): a crosshair, a dot on each line and a glass readout
    // with the month, value and paid in. Leaving restores the today point.
    const scrub = document.getElementById('wlScrub');
    const scrubTo = ({chart, tooltip})=>{
      if(!scrub) return;
      const pts = tooltip && tooltip.opacity !== 0 ? (tooltip.dataPoints || []) : [];
      if(!pts.length){ scrub.hidden = true; return; }
      scrub.innerHTML = `<b class="wl-scrub-m">${monthLabel(filteredKeys[pts[0].dataIndex])}</b>`
        + pts.map(p=> `<span><i style="background:${p.dataset.borderColor}"></i>${p.dataset.label}<b>${fmtGBP(p.raw)}</b></span>`).join('');
      scrub.hidden = false;
      const w = scrub.offsetWidth;
      scrub.style.left = Math.max(0, Math.min(chart.width - w, tooltip.caretX - w/2)) + 'px';
    };
    const crosshair = {id:'wlCrosshair', afterDatasetsDraw(chart){
      const act = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
      if(!act.length) return;
      const x = act[0].element.x, a = chart.chartArea, ctx = chart.ctx;
      ctx.save(); ctx.strokeStyle = 'rgba(247,244,237,0.38)'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke(); ctx.restore();
    }};
    // Axis: the first, middle and last month only (B5.1).
    const lastI = filteredKeys.length - 1, midI = Math.round(lastI/2);
    const shortNote = document.getElementById('whRangeNote');
    if(shortNote){
      shortNote.hidden = !(currentRange==='1w' || currentRange==='1m');
      shortNote.textContent = 'Balances are logged once a month, so ' + (currentRange==='1w' ? '1W' : '1M') + ' shows your latest logged month against the one before.';
    }
    // Motion: the line draws in from the left and the latest value pulses.
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Phones: fewer, flat date labels (not ~7 labels rotated 45°, which ate the plot's height)
    // and a tooltip wherever you touch the plot, not only right on the line.
    const narrow = !!(window.matchMedia && window.matchMedia('(max-width:860px)').matches);
    const tlChart = makeChart('chartWealthTimeline', {
      type:'line',
      data:{labels:filteredKeys.map(k=>monthLabel(k)), datasets},
      plugins:[wipeInPlugin(reduceMotion), crosshair],
      options:{maintainAspectRatio:false,
        animation: reduceMotion ? false : {duration:700, easing:'easeOutCubic'},
        interaction:{mode:'index', intersect:false},
        plugins:{
          // The hero is brand navy in both themes, so the chart's colours are
          // the fixed on-navy ones. Legend and readout are HTML (B5.1).
          legend:{display:false},
          tooltip:{enabled:false, external:scrubTo}
        },
        scales:{
          y:{border:{display:false}, ticks:{display:false}, grid:{color:'rgba(247,244,237,0.10)'}},
          x:{border:{display:false}, grid:{display:false}, ticks:{color:'rgba(247,244,237,0.66)', font:{size:11, family:"'Geist Mono', ui-monospace, monospace"}, autoSkip:false, maxRotation:0,
            callback:(v, i)=> (i === 0 || i === midI || i === lastI) ? monthLabel(filteredKeys[i]) : ''}}
        }
      }
    });
    if(scrub) scrub.hidden = true;

    // Return for the selected period, computed live from this chart's own
    // start/end, not hardcoded per range. Money-weighted on investable money
    // in either view: deposits and newly added accounts are money in, not
    // return (TEI.calc.moneyWeightedReturn).
    if(filteredKeys.length>1){
      const startKey = filteredKeys[0], endKey = filteredKeys[filteredKeys.length-1];
      const r = TEI.calc.moneyWeightedReturn(series, TEI.calc.moneyInByMonth(client, months), startKey, endKey);
      const pct = r.periodPct || 0;
      // Gain or loss: end value minus start value minus net money paid in.
      gainEl.textContent = (r.growth<0?'-':'+') + fmtGBP(Math.abs(r.growth)) + (r.growth<0 ? ' loss' : ' gain');
      gainEl.className = r.growth<0 ? 'wl-neg' : 'wl-pos';
      periodEl.textContent = (pct<0?'-':'') + Math.abs(pct).toFixed(1) + '% ' + (currentRange === 'all' ? 'since ' + monthLabel(startKey) : RANGE_WORDS[currentRange] || '');
      periodEl.className = '';
    } else {
      gainEl.textContent = '–'; gainEl.className = '';
      periodEl.textContent = 'Not enough history for this range yet'; periodEl.className = 'wl-st-wait';
    }
  }

  /* Reveals the chart left to right, then pulses the last point of the
     first line. Runs once per chart (a range change makes a new chart). */
  function wipeInPlugin(reduceMotion){
    let start = null, clipped = false, raf = null, gone = false;
    const again = chart=>{ if(!raf && !gone) raf = requestAnimationFrame(()=>{ raf = null; if(!gone && chart.ctx) chart.draw(); }); };
    return {
      id:'wipeIn',
      beforeDatasetsDraw(chart){
        if(reduceMotion) return;
        const a = chart.chartArea; if(!a) return;
        if(start === null) start = performance.now();
        const p = Math.min(1, (performance.now() - start) / 1100);
        if(p >= 1) return;
        const e = 1 - Math.pow(1 - p, 3);
        chart.ctx.save();
        chart.ctx.beginPath();
        chart.ctx.rect(a.left - 4, a.top - 10, (a.width + 8) * e, a.height + 20);
        chart.ctx.clip();
        clipped = true;
        again(chart);
      },
      afterDatasetsDraw(chart){
        if(clipped){ chart.ctx.restore(); clipped = false; return; }
        if(reduceMotion || start === null) return;
        // While scrubbing, the readout takes over; leaving brings the pulse back.
        if(chart.tooltip && chart.tooltip.getActiveElements && chart.tooltip.getActiveElements().length){ again(chart); return; }
        // After the reveal: a slow pulse on the latest value.
        const meta = chart.getDatasetMeta(0);
        const pt = meta && meta.data && meta.data[meta.data.length - 1];
        if(!pt) return;
        const t = ((performance.now() - start) % 2000) / 2000;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4 + t * 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,214,168,' + (0.4 * (1 - t)).toFixed(3) + ')'; ctx.fill();
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#E8D6A8'; ctx.fill();
        ctx.restore();
        again(chart);
      },
      afterDestroy(){ gone = true; if(raf) cancelAnimationFrame(raf); raf = null; }
    };
  }

  function wireTimelineToggle(client){
    const wrap = document.getElementById('timelineRangeToggle');
    if(wrap.dataset.wired) return;
    wrap.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{ currentRange = btn.dataset.range; renderTimeline(client); });
    });
    document.querySelectorAll('#timelineViewToggle button').forEach(btn=>{
      btn.addEventListener('click', ()=>{ currentView = btn.dataset.view; renderTimeline(client); });
    });
    wrap.dataset.wired = '1';
  }

  /* No client-side refresh any more -- US holdings are repriced on a
     schedule server-side (see usPricesAsOfText), so this page just reports
     how fresh they are. */
  function renderWealthPricesAsOf(client){
    const el = document.getElementById('whPricesStatus');
    if(el) el.textContent = TEI.calc.usPricesAsOfText(client);
  }

  /* ---------------- 4. Wealth Composition (assets + liabilities, merged) & Accounts ----------------
     Palette follows the data-viz rule: no navy in categorical segments (it is the app's own
     surface color and reads flat/invisible against navy cards).
     Deliberate: 'cash_isa' joins the Cash bucket here (and every other type==='cash' filter
     across the app), not Investments -- it behaves like cash for growth/composition purposes
     even though it is technically an ISA wrapper. It is also left out of the isa-specific ISA-
     allowance nudges (isaAccounts, "Race to £100k" liquidTotal, INV_TYPES/CF_INV_TYPES) since
     those track Stocks & Shares ISA holdings specifically -- worth revisiting with the adviser
     if Cash ISA should also count toward the annual ISA allowance headline. */
  // Account colours (B1.2), with their light-ground variants in light so
  // every segment and dot stays visible on a white tile; property, crypto
  // and other take the remaining palette tones.
  const COMP_PALETTE = { property:'#6F7F98', investments:'var(--w-acc-isa)', pension:'var(--w-acc-pension)', cash:'var(--w-acc-cash)', crypto:'#9DB59F', other:'#C9D3E3' };
  function renderComposition(client){
    const months = TEI.calc.buildMergedMonths(client);
    const b = TEI.calc.latestBreakdown(months);
    const gross = grossAssetsTotal(client, b);
    const otherLabels = (client.wealth.assets||[]).filter(a=>a.type!=='property').map(a=>a.notes||a.type).join(', ');
    const categories = [
      {key:'property', label:'Property', value:propertyValue(client), color:COMP_PALETTE.property, accounts:[]},
      {key:'investments', label:'Investments', value:investTotal(client,b), color:COMP_PALETTE.investments, accounts:client.accounts.filter(a=>['isa','gia','lisa'].includes(a.type))},
      {key:'pension', label:'Pension', value:pensionTotal(client,b), color:COMP_PALETTE.pension, accounts:client.accounts.filter(a=>a.type==='pension')},
      {key:'cash', label:'Cash', value:cashAcctTotal(client,b), color:COMP_PALETTE.cash, accounts:client.accounts.filter(a=>a.type==='cash'||a.type==='cash_isa'||a.type==='cash_lisa')},
      // Crypto is deliberately its own category, never folded into Investments or
      // Other -- unlike GIA/ISA/LISA it is not a tax wrapper around equities, and
      // lumping it into "Other" (which is manually-declared assets, not accounts)
      // would hide it from the accounts-driven composition entirely.
      {key:'crypto', label:'Crypto', value:cryptoTotal(client,b), color:COMP_PALETTE.crypto, accounts:client.accounts.filter(a=>a.type==='crypto')},
      {key:'other', label:'Other', value:otherAssetsTotal(client), color:COMP_PALETTE.other, sub:otherLabels, accounts:[]},
    ].filter(c=>c.value>0);

    const bar = document.getElementById('compBar');
    const legend = document.getElementById('compLegend');
    const note = document.getElementById('compNote');
    const acctGrid = document.getElementById('compAccountsGrid');
    const liabWrap = document.getElementById('compLiabilities');
    const debtFreePill = document.getElementById('compDebtFreePill');

    if(!gross || !categories.length){
      bar.innerHTML = '';
      legend.innerHTML = `<div class="line">Add accounts, property or other assets to see your wealth composition.</div>`;
      if(acctGrid) acctGrid.innerHTML = '';
      if(note) note.textContent = '';
      liabWrap.innerHTML = '';
      debtFreePill.style.display = 'none';
      return;
    }

    const sorted = categories.slice().sort((a,b)=>b.value-a.value);

    bar.innerHTML = sorted.map(c=> `<span style="width:${(c.value/gross*100)}%; background:${c.color};"></span>`).join('');
    legend.innerHTML = sorted.map(c=>{
      const pct = (c.value/gross*100);
      return `<div class="lg"><span class="sw" style="background:${c.color};"></span>${c.label} · ${pct.toFixed(0)}%</div>`;
    }).join('');

    // Wealth now lists accounts grouped by type (15-wealth-board.js); the
    // category rows and note below stay for any page that still has them.
    if(acctGrid) acctGrid.innerHTML = sorted.map(c=>{
      const rows = c.accounts.length
        ? c.accounts.map(acc=>{
            const value = Number(b[acc.id])||0;
            return `<div class="k-ac-sub"><span>${TEI.data.acctLabel(acc)}</span><b>${fmtGBP(value)}</b></div>`;
          }).join('')
        : (c.sub ? `<div class="k-ac-sub"><span>${c.sub}</span><b>${fmtGBP(c.value)}</b></div>` : '');
      const pct = c.value/gross*100;
      return `
        <details class="wl-cat"${rows ? '' : ' data-empty'}>
          <summary><i style="background:${c.color};"></i><span>${c.label}</span><em>${pct < 1 ? '<1' : pct.toFixed(0)}%</em><b>${fmtGBP(c.value)}</b></summary>
          ${rows}
        </details>`;
    }).join('');

    const top = sorted[0];
    const topPct = (top.value/gross*100);
    if(note) note.textContent = topPct>=50
      ? `Your wealth is currently concentrated in ${top.label.toLowerCase()}.`
      : `Your wealth is spread across ${categories.length} categories, with ${top.label.toLowerCase()} the largest at ${topPct.toFixed(0)}%.`;

    const groups = liabilityGroups(client);
    const liabRows = Object.values(groups).filter(g=>g.items.length);
    if(!liabRows.length){
      liabWrap.innerHTML = '<p class="hm-note">No mortgage, loans or cards recorded.</p>';
      debtFreePill.style.display = 'inline-flex';
    } else {
      debtFreePill.style.display = 'none';
      liabWrap.innerHTML = liabRows.map(g=>{
        const linked = g.items.some(i=>{
          const asset = client.wealth.assets.find(a=>a.id===i.linkedAssetId);
          return asset && asset.type==='property';
        });
        return `<div class="k-cliab-row">${g.label}${linked ? ` <span class="k-cliab-tag">Linked to property</span>` : ''}<span class="cliab-val">${fmtGBP(g.total)}</span></div>`;
      }).join('');
    }
  }

  /* ---------------- 5. Wealth Guidance ---------------- */
  /* The Wealth insight sentences: the coach's own list when set, otherwise
     the net worth narrative below. Wealth's "What this means" cards read
     them through TEI.render.wealthInsightItems (B5.1). */
  function wealthInsightItems(client){
    const wi = client.wealthInsights || {};
    if(wi.mode==='manual' && wi.items && wi.items.length) return wi.items.slice();

    const months = TEI.calc.buildMergedMonths(client);
    const b = TEI.calc.latestBreakdown(months);
    const keys = Object.keys(months).sort();
    const items = [];

    if(keys.length>=2){
      const latestKey = keys[keys.length-1];
      const now = new Date(latestKey+'-01');
      const yearAgo = new Date(now.getFullYear()-1, now.getMonth(), 1);
      const yearAgoKey = yearAgo.getFullYear()+'-'+String(yearAgo.getMonth()+1).padStart(2,'0');
      const baseKey = keys.find(k=>k>=yearAgoKey) || keys[0];
      // Same money-weighted split as the Wealth Overview stats.
      const series = TEI.calc.buildUnifiedTotals(months);
      const moneyIn = TEI.calc.moneyInByMonth(client, months);
      const r = TEI.calc.moneyWeightedReturn(series, moneyIn, baseKey, latestKey);
      const signed = v => (v<0?'-':'+')+fmtGBP(Math.abs(v));
      const when = baseKey===yearAgoKey ? 'Over the last 12 months' : 'Since '+monthLabel(baseKey);
      items.push(`${when} your accounts have changed by ${signed(r.end - r.start)}: ${signed(r.paidIn)} new money and ${signed(r.growth)} growth.`);

      const ann = TEI.calc.annualisedReturnPct(series, moneyIn);
      if(ann!=null) items.push(`Your money has earned ${ann.toFixed(1)}% a year, allowing for when you paid it in.`);
    } else {
      items.push(`You have been tracking your wealth for ${keys.length} month${keys.length===1?'':'s'} so far, trends will appear here as more history builds up.`);
    }

    const gross = grossAssetsTotal(client, b);
    if(gross>0){
      items.push(`Your investment accounts represent ${(investTotal(client,b)/gross*100).toFixed(0)}% of your total assets.`);
      items.push(`Your cash represents ${(cashAcctTotal(client,b)/gross*100).toFixed(0)}% of your total wealth.`);
    }
    const liabTotal = liabilitiesTotal(client);
    if(gross>0 && liabTotal===0) items.push(`You are debt free, which frees up capacity most people at your stage do not have yet.`);
    return items;
  }
  TEI.render.wealthInsightItems = wealthInsightItems;
  function renderWealthInsights(client){
    const list = document.getElementById('wealthInsightsList');
    if(!list) return;
    list.innerHTML = wealthInsightItems(client).map(t=>
      `<div class="insight-item" style="display:flex; gap:8px; font-size:12.5px; line-height:1.55; margin-bottom:8px; color:var(--k-ink);"><div style="width:5px; height:5px; border-radius:50%; background:var(--k-ink-softer); flex:none; margin-top:6px;"></div>${t}</div>`
    ).join('');
  }

  TEI.render.progress = function(client){
    renderOverview(client);
    wireTimelineToggle(client);
    renderWealthPricesAsOf(client);
    renderTimeline(client);
    renderComposition(client);
    renderWealthInsights(client);
  };
})();

