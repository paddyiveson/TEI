/* How wealth actually compounds: the two figures and the members' "With your
   own numbers" section. Drawing and motion come from /assets/motion.js
   (window.TeiMotion): this file works out the numbers and hands them over.
   The page holds the default example written in advance (lines, axis labels,
   bars and tiles), so it reads with JS off; keep the two in step if the
   example changes.

   The sums: a fixed amount paid in at the end of each month, growing at a
   steady yearly rate as a true yearly rate (monthly growth (1 + r)^(1/12) - 1),
   plus any starting pot.
     Figure 1  the pot against the money put in, 51 points from year 0 to the
               chosen number of years (the same length always, so the lines
               morph); the axis rescales to an even step as the sliders move
     Figure 2  the pot at 65 for a start at 25, 30, 35 and 40
   Outputs are found within each figure's section, so a key number moved
   beside the text still updates. */
(function () {
  'use strict';
  var INVEST_TYPES = ['isa', 'gia', 'lisa', 'pension', 'crypto']; // as Wealth OS counts them
  var POINTS = 51, STARTS = [25, 30, 35, 40], RETIRE = 65;
  var state = { monthly: 200, rate: 7, years: 40, pot0: 0, mine: false };
  var my = null; // the member's own figures, once loaded
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function M() { return window.TeiMotion || { count: function (el, v) { el.textContent = pounds(v); }, bar: function (s, v) { s.style.setProperty('--v', v); }, line: function () {} }; }
  function pounds(n) { return '£' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function short(n) {
    if (n >= 1e6) return '£' + String(Number((n / 1e6).toFixed(n >= 1e7 ? 0 : 1))) + 'm';
    if (n >= 1e3) return '£' + Math.round(n / 1e3) + 'k';
    return '£' + Math.round(n);
  }
  function pct(r) { return (r % 1 ? r.toFixed(1) : String(r)) + '%'; }
  // Pot after t months (t may be fractional, for the chart's evenly spaced points).
  function potAt(t, monthly, rate, pot0) {
    var g = Math.pow(1 + rate / 100, 1 / 12) - 1, f = Math.pow(1 + g, t);
    return (pot0 || 0) * f + monthly * (f - 1) / g;
  }
  // An even axis step (1, 2, 2.5 or 5 times a power of ten) for about four gridlines.
  function niceStep(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function set(name, text) { $all('[data-o="' + name + '"]').forEach(function (e) { e.textContent = text; }); }

  /* ---------- Figure 1: the curve ---------- */
  function drawCurve() {
    var fig = $('#fig-curve'), chart = fig && $('[data-m="line-draw"]', fig);
    if (!chart) return;
    var box = fig.closest('.ar-split') || fig, Y = state.years, pot = [], paid = [];
    for (var i = 0; i < POINTS; i++) {
      var t = i / (POINTS - 1) * Y * 12;
      pot.push(potAt(t, state.monthly, state.rate, state.pot0));
      paid.push(state.pot0 + state.monthly * t);
    }
    var end = pot[POINTS - 1], put = paid[POINTS - 1];
    var step = niceStep(end * 1.04 / 4), lines = Math.max(1, Math.ceil(end * 1.04 / step)), top = step * lines;
    // Gridlines in the SVG, labels as HTML so text keeps its size on a phone.
    var grid = $('.m-grid', chart), axis = $('.m-yaxis', chart), xs = $('.m-xaxis', chart);
    var g = '<line x1="0" x2="1000" y1="400" y2="400" class="m-base"/>', y = '';
    for (var k = 0; k <= lines; k++) {
      var yy = Math.round(400 - 400 * k / lines);
      if (k) g += '<line x1="0" x2="1000" y1="' + yy + '" y2="' + yy + '"/>';
      y += '<span style="--y:' + (100 - 100 * k / lines).toFixed(1) + '%">' + short(step * k) + '</span>';
    }
    grid.innerHTML = g; axis.innerHTML = y;
    xs.innerHTML = '<span style="--x:0%">Year 0</span><span style="--x:50%">' + Math.round(Y / 2) + '</span><span style="--x:96%">' + Y + '</span>';
    M().line(chart, { max: top, ref: paid, a: pot });
    chart.setAttribute('aria-label', 'Line chart: ' + (state.pot0 ? pounds(state.pot0) + ' invested today plus ' : '') + pounds(state.monthly) + ' a month at ' + pct(state.rate) +
      ' a year grows to ' + pounds(end) + ' after ' + Y + ' years, from ' + pounds(put) + ' put in.');
    M().count($('[data-o="paid"]', box), put);
    M().count($('[data-o="growth"]', box), end - put);
    M().count($('[data-o="pot"]', box), end);
  }

  /* ---------- Figure 2: start dates ---------- */
  function drawStart() {
    var fig = $('#fig-start'), bars = fig && $('.m-bars', fig);
    if (!bars) return;
    var vals = STARTS.map(function (a) { return potAt((RETIRE - a) * 12, state.monthly, state.rate, 0); });
    bars.style.setProperty('--max', vals[0]);
    $all('.m-row', bars).forEach(function (row, i) {
      var put = state.monthly * 12 * (RETIRE - STARTS[i]);
      M().bar($('.m-s1', row), put);
      M().bar($('.m-grow', row), vals[i] - put);
      M().count($('.m-v', row), vals[i]);
      $('.m-bar', row).setAttribute('aria-label', 'Start at ' + STARTS[i] + ': ' + pounds(put) + ' put in, ' + pounds(vals[i]) + ' at 65');
      var note = $('small', row);
      if (note) note.textContent = pounds(put) + ' put in';
    });
    var gap = $('[data-o="start-gap"]', fig.closest('.ar-split') || fig);
    if (gap) M().count(gap, vals[0] - vals[1]);
  }

  function render() {
    set('monthly', pounds(state.monthly));
    set('rate', pct(state.rate));
    set('years', String(state.years));
    set('sub', state.pot0 > 0
      ? 'Your ' + pounds(state.pot0) + ' invested today, plus ' + pounds(state.monthly) + ' every month, growing at ' + pct(state.rate) + ' a year.'
      : pounds(state.monthly) + ' invested every month, growing at ' + pct(state.rate) + ' a year.');
    drawCurve();
    drawStart();
    renderMine();
  }
  function bind() {
    var m = $('#cMonthly'), r = $('#cRate'), y = $('#cYears');
    if (!m) return;
    var queued = false;
    function read() {
      state.monthly = Number(m.value); state.rate = Number(r.value); state.years = Number(y.value);
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; render(); });
    }
    [m, r, y].forEach(function (i) { i.addEventListener('input', read); });
  }

  /* ---------- Members: their own figures ---------- */
  function renderMine() {
    var box = $('#your-numbers');
    if (!box || !my) return;
    $('[data-y="pot"]', box).textContent = pounds(my.pot);
    $('[data-y="monthly"]', box).textContent = pounds(my.monthly);
    $('[data-y="future"]', box).textContent = pounds(potAt(state.years * 12, my.monthly, state.rate, my.pot));
  }

  function members() {
    var box = $('#your-numbers');
    if (!box || !window.TeiMembers) return;
    window.TeiMembers.ready().then(function (who) {
      if (!who) return;
      var out = $('[data-members-out]', box), lock = $('.tc-members-lock', box);
      if (lock) lock.hidden = true;
      if (out) out.hidden = false;
      if (!who.client) {
        out.innerHTML = '<p class="tc-members-todo">You are signed in as the coach, so there are no personal accounts to show here.</p>';
        return;
      }
      who.sb.schema('wealth_os').from('accounts')
        .select('type, value, contribution, contribution_personal, contribution_sacrifice')
        .eq('client_id', who.client.id)
        .then(function (res) {
          var rows = (res && res.data || []).filter(function (a) { return INVEST_TYPES.indexOf(a.type) > -1; });
          my = {
            pot: rows.reduce(function (s, a) { return s + (Number(a.value) || 0); }, 0),
            // Same rule as Wealth OS: a pension counts personal plus salary sacrifice.
            monthly: rows.reduce(function (s, a) {
              return s + (a.type === 'pension' ? (Number(a.contribution_personal) || 0) + (Number(a.contribution_sacrifice) || 0) : (Number(a.contribution) || 0));
            }, 0)
          };
          renderMine();
          var btn = $('[data-y="apply"]', box);
          if (btn) btn.addEventListener('click', toggleMine);
        });
    });
  }

  function toggleMine() {
    var btn = $('#your-numbers [data-y="apply"]'), m = $('#cMonthly');
    state.mine = !state.mine;
    if (state.mine) {
      state.pot0 = my.pot;
      var monthly = Math.max(0, Math.round(my.monthly / 25) * 25);
      if (monthly > Number(m.max)) m.max = String(Math.ceil(monthly / 500) * 500);
      m.min = '0';
      m.value = String(monthly);
      state.monthly = monthly;
      btn.textContent = 'Back to the example';
    } else {
      state.pot0 = 0;
      m.min = '25'; m.value = '200'; state.monthly = 200;
      btn.textContent = 'Show my numbers in the chart';
    }
    render();
    $('#fig-curve').scrollIntoView({ behavior: window.TeiContent && window.TeiContent.calm ? 'auto' : 'smooth', block: 'start' });
  }

  function init() { render(); bind(); members(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
