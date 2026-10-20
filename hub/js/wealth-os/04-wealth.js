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

  /* Milestones: auto-detected round net-worth figures reached, plus adviser-added custom ones
     from client.insights.milestones (same field the previous build of this page used). Feeds
     both the timeline strip and the Wealth Journey card's completed-milestones list. */
  function computeMilestones(client){
    const series = totalNetWorthSeries(client);
    const keys = Object.keys(series).sort();
    const auto = [];
    const roundMarks = TEI.calc.ROUND_MILESTONES; // same steps as the Next Milestone card
    let seen = new Set();
    keys.forEach(k=>{
      const total = series[k];
      roundMarks.forEach(mark=>{ if(total>=mark && !seen.has(mark)){ seen.add(mark); auto.push({label:'Passed '+fmtGBP(mark)+' net worth', date:k}); } });
    });
    const manual = (client.insights.milestones||[]).map(m=>({label:m.label, date:m.date, amount:m.amount}));
    return auto.concat(manual).sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  }

  /* ---------------- 1. Wealth Overview ---------------- */
  function renderOverview(client){
    const months = TEI.calc.buildMergedMonths(client);
    const keys = Object.keys(months).sort();
    document.getElementById('whNet').textContent = fmtGBP(totalNetWorth(client));

    const ytdEl = document.getElementById('whYtdChange');
    const moEl = document.getElementById('whMonthChange');
    const updatedEl = document.getElementById('whUpdated');

    if(!keys.length){
      ytdEl.textContent = 'No history yet'; ytdEl.className = 'k-pill neutral';
      moEl.style.display = 'none';
      updatedEl.textContent = 'Not yet logged';
    } else {
      moEl.style.display = 'inline-flex';
      const latestKey = keys[keys.length-1];
      const nwFact = TEI.calc.computeNetWorthFact(client);
      const monthChange = nwFact.netWorthChange;
      const flat = v => Math.abs(v) < 0.5; // e.g. a month where the only movement was accounts being added
      moEl.textContent = monthChange==null ? 'First month logged' : flat(monthChange) ? 'No change this month' : (monthChange>=0?'▲ ':'▼ ')+fmtGBP(Math.abs(monthChange))+' this month';
      moEl.className = 'k-pill ' + (monthChange==null||flat(monthChange)?'neutral':(monthChange>=0?'up':'down'));

      const ytd = TEI.calc.computeYtdFact(client);
      ytdEl.textContent = !ytd.hasFullYear ? 'First year of history' : flat(ytd.ytdChange) ? 'No change this year' : (ytd.ytdChange>=0?'▲ ':'▼ ')+fmtGBP(Math.abs(ytd.ytdChange))+' this year';
      ytdEl.className = 'k-pill ' + (!ytd.hasFullYear||flat(ytd.ytdChange)?'neutral':(ytd.ytdChange>=0?'up':'down'));

      updatedEl.textContent = 'Last updated ' + monthLabel(latestKey)
        + (nwFact.joinedThisMonth ? ' · plus '+fmtGBP(nwFact.joinedThisMonth)+' from accounts added this month (not counted as growth)' : '');
    }
    // Performance stats are money-weighted on investable money (accounts
    // only -- property/debts have no history, see renderTimeline): growth
    // is what the money earned, with deposits and newly added accounts
    // counted as money in rather than return (TEI.calc.moneyWeightedReturn).
    const series = TEI.calc.buildUnifiedTotals(months);
    const moneyIn = TEI.calc.moneyInByMonth(client, months);

    // Calendar years, not a trailing 12 months -- "last year" read as the
    // previous calendar year, but a trailing window in September is mostly
    // the current year (a good 2025 and a down 2026 netted to a loss).
    const lastYearValueEl = document.getElementById('whLastYearValue');
    const lastYearSubEl = document.getElementById('whLastYearSub');
    const prevYearEl = document.getElementById('whPrevYearSub');
    const pctText = p => p!=null ? (p>=0?'+':'')+p.toFixed(1)+'%' : '';
    const gbpSigned = v => (v<0?'-':'+')+fmtGBP(Math.abs(v));
    const latestYear = keys.length ? Number(keys[keys.length-1].slice(0,4)) : null;
    const ytdWin = latestYear ? TEI.calc.calendarYearWindow(series, latestYear) : null;
    if(!ytdWin){
      lastYearValueEl.textContent = '–';
      lastYearValueEl.className = 'v';
      lastYearSubEl.textContent = keys.length<2 ? 'Log at least two months to see this.' : 'Log another month this year to see this.';
    } else {
      const r = TEI.calc.moneyWeightedReturn(series, moneyIn, ytdWin.fromKey, ytdWin.toKey);
      lastYearValueEl.textContent = gbpSigned(r.growth);
      lastYearValueEl.className = 'v ' + (r.growth>=0?'traj-up':'traj-down');
      lastYearSubEl.textContent = (r.periodPct!=null ? pctText(r.periodPct)+' growth · ' : '')
        + (Math.abs(r.paidIn)>=0.5 ? 'plus '+(r.paidIn<0?'-':'')+fmtGBP(Math.abs(r.paidIn))+' new money · ' : '')
        + 'since '+monthLabel(ytdWin.fromKey);
    }
    const prevWin = latestYear ? TEI.calc.calendarYearWindow(series, latestYear-1) : null;
    if(prevWin){
      const p = TEI.calc.moneyWeightedReturn(series, moneyIn, prevWin.fromKey, prevWin.toKey);
      const partial = !prevWin.fromKey.startsWith(String(latestYear-2)) || !prevWin.toKey.endsWith('-12');
      prevYearEl.style.display = 'block';
      prevYearEl.textContent = `${latestYear-1}${partial?' (part year)':''}: ${gbpSigned(p.growth)} growth${p.periodPct!=null ? ' ('+pctText(p.periodPct)+')' : ''}`;
    } else {
      prevYearEl.style.display = 'none';
    }

    const cagrValueEl = document.getElementById('whCagrValue');
    const cagrSubEl = document.getElementById('whCagrSub');
    const ann = TEI.calc.annualisedReturnPct(series, moneyIn);
    const span = keys.length>1 ? TEI.calc.monthsBetween(keys[0], keys[keys.length-1]) : 0;
    if(keys.length<2){
      cagrValueEl.textContent = '–';
      cagrValueEl.className = 'v';
      cagrSubEl.textContent = 'Log at least two months to see this.';
    } else if(ann==null){
      cagrValueEl.textContent = '–';
      cagrValueEl.className = 'v';
      cagrSubEl.textContent = span < TEI.calc.MIN_ANNUALISED_MONTHS ? TEI.calc.annualisedPendingText(series) : "Cannot be worked out from this history yet.";
    } else {
      cagrValueEl.textContent = ann.toFixed(1)+'% a year';
      cagrValueEl.className = 'v ' + (ann>=0?'traj-up':'traj-down');
      cagrSubEl.textContent = 'What your money has earned, allowing for when you paid it in (money-weighted).';
    }
  }

  /* ---------------- 3. Net Worth Timeline ---------------- */
  let currentRange = null;

  function defaultRange(keys){
    if(keys.length<2) return '1y';
    const [sy,sm] = keys[0].split('-').map(Number);
    const [ly,lm] = keys[keys.length-1].split('-').map(Number);
    return ((ly-sy)*12+(lm-sm)) >= 12 ? 'all' : '1y';
  }

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

    const periodValueEl = document.getElementById('whPeriodReturn');
    const periodSubEl = document.getElementById('whPeriodSub');

    if(!allKeys.length){
      document.getElementById('timelineMilestones').innerHTML = '';
      makeChart('chartWealthTimeline', {type:'line', data:{labels:[],datasets:[]}, options:{maintainAspectRatio:false}});
      document.getElementById('timelineEmpty').style.display = 'block';
      periodValueEl.textContent = '–'; periodValueEl.className = 'v';
      periodSubEl.textContent = 'No history yet.';
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
      contribNoteEl.textContent = n ? `Contributions include the starting balance of ${n} account${n===1?'':'s'} with no contribution data yet, so the gap shows growth since tracking began. Add their contributions before tracking started (My Details → Accounts) for the full picture.` : '';
    }
    // Gold fade under the line (strong at the top, clear at the baseline) rather than a flat
    // 14% gold wash, which read as a muddy grey block over the navy card.
    // Board palette (B5): champagne value line, pale blue "money paid in".
    const netWorthFill = ({chart})=>{
      const area = chart.chartArea;
      if(!area) return 'rgba(232,214,168,0.12)';
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, 'rgba(232,214,168,0.26)');
      g.addColorStop(1, 'rgba(232,214,168,0)');
      return g;
    };
    const datasets = [{label: hasOther ? 'Investable' : 'Value', data:filteredKeys.map(k=>series[k]), borderColor:'#E8D6A8', backgroundColor:netWorthFill, fill:true, tension:0.3, pointRadius:0, pointHoverRadius:5, borderWidth:2.6}];
    if(view === 'total'){
      datasets.push({label:'Total incl. property & debts', data:filteredKeys.map(k=>totalSeries[k]), borderColor:'rgba(247,244,237,0.6)', backgroundColor:'rgba(247,244,237,0.08)', fill:'-1', tension:0.3, pointRadius:0, pointHoverRadius:5, borderWidth:2});
    }
    if(showContrib){
      datasets.push({label:'Money paid in', data:filteredKeys.map(k=>contribSeries[k]), borderColor:'#B9CAE6', backgroundColor:'rgba(185,202,230,0.16)', borderDash:[5,5], fill:'origin', tension:0.3, pointRadius:0, borderWidth:1.6});
    }
    const showLegend = datasets.length > 1;
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
      plugins:[wipeInPlugin(reduceMotion)],
      options:{maintainAspectRatio:false,
        animation: reduceMotion ? false : {duration:700, easing:'easeOutCubic'},
        interaction:{mode:'index', intersect:false},
        plugins:{
          /* Fixed light-cream, not currentInk() -- this chart lives in a
             .dcard.emphasis card, which stays dark navy in both themes (see
             the .dcard.emphasis comment), so the theme-flipping ink token
             was unreadable (dark-on-dark) in light theme. Matches the axis
             ticks' own fixed rgba(247,244,237,...) a few lines below. */
          legend:{display:showLegend, position:'top', align:'end', labels:{boxWidth:10, font:{size:11}, color:'rgba(247,244,237,0.75)'}},
          tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmtGBP(c.raw)}}
        },
        scales:{
          y:{ticks:{color:'rgba(247,244,237,0.6)', font:{size:10}, maxTicksLimit: narrow?5:undefined, callback:v=>'£'+(v/1000)+'k'}, grid:{color:'rgba(247,244,237,0.12)'}},
          x:{grid:{display:false}, ticks:{color:'rgba(247,244,237,0.6)', font:{size:10}, maxTicksLimit: narrow?4:10, maxRotation: narrow?0:50, autoSkipPadding:8}}
        }
      }
    });

    // Return for the selected period, computed live from this chart's own
    // start/end, not hardcoded per range. Money-weighted on investable money
    // in either view: deposits and newly added accounts are money in, not
    // return (TEI.calc.moneyWeightedReturn).
    if(filteredKeys.length>1){
      const startKey = filteredKeys[0], endKey = filteredKeys[filteredKeys.length-1];
      const r = TEI.calc.moneyWeightedReturn(series, TEI.calc.moneyInByMonth(client, months), startKey, endKey);
      const pct = r.periodPct || 0;
      const signed = v => (v<0?'-':'+')+fmtGBP(Math.abs(v));
      periodValueEl.textContent = (pct>=0?'+':'')+pct.toFixed(1)+'%';
      periodValueEl.className = 'v ' + (pct>=0?'traj-up':'traj-down');
      periodSubEl.textContent = `${fmtGBP(r.start)} → ${fmtGBP(r.end)}: ${signed(r.growth)} growth${Math.abs(r.paidIn)>=0.5 ? ', '+signed(r.paidIn)+' new money' : ''}`;
    } else {
      periodValueEl.textContent = '–'; periodValueEl.className = 'v';
      periodSubEl.textContent = 'Not enough history for this range yet.';
    }

    document.getElementById('timelineMilestones').innerHTML = computeMilestones(client).slice(0,6).map(m=>
      `<div class="tm-chip"><b>${m.label}</b> · ${m.date ? monthLabel(m.date.length>7?m.date.slice(0,7):m.date) : ''}</div>`
    ).join('');
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
  // Board palette (B5): pension champagne, investments pale blue, cash gold;
  // property, crypto and other take the remaining palette tones.
  const COMP_PALETTE = { property:'#6F7F98', investments:'#B9CAE6', pension:'#E8D6A8', cash:'#83661C', crypto:'#AAB6C8', other:'#D9C9A0' };
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
      acctGrid.innerHTML = '';
      note.textContent = '';
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

    // One row per category (B5.1); each opens to show the accounts in it.
    // Categories without individual accounts (property, other) show their
    // description instead, if there is one.
    acctGrid.innerHTML = sorted.map(c=>{
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
    note.textContent = topPct>=50
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
  function renderWealthInsights(client){
    const wi = client.wealthInsights || {};
    const list = document.getElementById('wealthInsightsList');
    const renderItems = items => list.innerHTML = items.map(t=>
      `<div class="insight-item" style="display:flex; gap:8px; font-size:12.5px; line-height:1.55; margin-bottom:8px; color:var(--k-ink);"><div style="width:5px; height:5px; border-radius:50%; background:var(--k-ink-softer); flex:none; margin-top:6px;"></div>${t}</div>`
    ).join('');

    if(wi.mode==='manual' && wi.items && wi.items.length){ renderItems(wi.items); return; }

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

    renderItems(items);
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

