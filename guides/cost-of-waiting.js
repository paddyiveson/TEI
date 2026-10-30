/* Cost of Waiting calculator (V2 refresh, REF-Calculator, Oct 2026).
   Pairs with /guides/cost-of-waiting.html and /assets/tool.css. This file holds
   the maths and the inputs; the chart is drawn by TeiMotion.line from
   /assets/motion.js. The page's HTML already shows the default worked example,
   so it reads the same with JS off.

   Model (signed off 27 Oct 2026):
     monthly rate g = (1 + rate)^(1/12) - 1; level payments M at each month end
     N = (retirement age - age) x 12 months; Nw = N - 12 x wait
     pot now = M((1+g)^N - 1)/g; pot if waiting = M((1+g)^Nw - 1)/g
     gap = pot now - pot if waiting
     today's money: divide by 1.025^(retirement age - age)
   Results:
     pots, gap, chart, per month and per day waited: today's money
     catch-up a month = pot now / (((1+g)^Nw - 1)/g) - M     pounds at the time
     lump sum at the end of the wait = gap / (1+g)^Nw         pounds at the time
     catch-up left after a lump sum L = max(0, gap - L(1+g)^Nw) g / ((1+g)^Nw - 1) */
(function () {
  'use strict';

  var INFLATION = 0.025;    // a year
  var POINTS = 61;          // samples per chart line; fixed, so lines morph rather than swap
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var fig = document.getElementById('calculator');
  if (!fig) return;
  var chart = fig.querySelector('[data-m="line-draw"]');
  var inputs = {
    monthly: document.getElementById('cow-monthly'),
    age: document.getElementById('cow-age'),
    retire: document.getElementById('cow-retire'),
    lump: document.getElementById('cow-lump')
  };
  var waitSelect = document.getElementById('cow-wait');   // phones: the dropdown in place of the wait buttons
  var waitButtons = fig.querySelectorAll('[data-wait]');
  var rateButtons = fig.querySelectorAll('[data-rate]');
  var state = { monthly: 300, age: 28, retire: 60, wait: 1, rate: 5, lump: 0 };

  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  function out(name) { return fig.querySelector('[data-out="' + name + '"]'); }
  function set(name, text) { var el = out(name); if (el) el.textContent = text; }
  function commas(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function pounds(n) { return '£' + commas(String(Math.round(n))); }
  function pence(n) { return '£' + commas(n.toFixed(2)); }
  function years(n) { return n + (n === 1 ? ' year' : ' years'); }
  // "the year you missed" / "the 2 years you missed"; "a year later" / "2 years later"
  function missed(n) { return n === 1 ? 'the year' : 'the ' + n + ' years'; }
  function later(n) { return n === 1 ? 'a year' : years(n); }

  /* ---------- the maths ---------- */
  function model(s) {
    var g = Math.pow(1 + s.rate / 100, 1 / 12) - 1;
    var n = (s.retire - s.age) * 12, nw = n - 12 * s.wait;
    var grow = function (k) { return (Math.pow(1 + g, k) - 1) / g; };
    var potNow = s.monthly * grow(n), potWait = s.monthly * grow(nw);
    var gap = potNow - potWait;
    var toToday = Math.pow(1 + INFLATION, s.retire - s.age);
    var m = {
      potNow: potNow / toToday,
      potWait: potWait / toToday,
      gap: gap / toToday,
      catchUp: potNow / grow(nw) - s.monthly,
      lump: gap / Math.pow(1 + g, nw),
      left: s.lump > 0 ? Math.max(0, gap - s.lump * Math.pow(1 + g, nw)) * g / (Math.pow(1 + g, nw) - 1) : null,
      now: [], wait: []
    };
    m.perMonth = m.gap / (12 * s.wait);
    m.perDay = m.gap / (365 * s.wait);
    // Both paths in today's money, sampled at the same POINTS ages.
    for (var i = 0; i < POINTS; i++) {
      var t = i / (POINTS - 1) * n, d = Math.pow(1 + INFLATION, t / 12), tw = t - 12 * s.wait;
      m.now.push(s.monthly * grow(t) / d);
      m.wait.push(tw > 0 ? s.monthly * grow(tw) / d : 0);
    }
    return m;
  }

  // A round top for the money axis: at most six steps of 1, 2, 2.5 or 5 x 10^k.
  // The axis holds still while the top line still fits it well (the wait alone
  // never moves it), so the lines visibly rise and fall; it rescales only when
  // the line outgrows it or shrinks below 40% of it.
  function fitScale(top) {
    if (shownScale && top * 1.02 <= shownScale.max && top >= shownScale.max * 0.4) return shownScale;
    return scale(top);
  }
  function scale(top) {
    var v = top * 1.08;
    for (var k = 0; k < 10; k++) {
      var c = [1, 2, 2.5, 5];
      for (var j = 0; j < c.length; j++) {
        var step = c[j] * Math.pow(10, k);
        if (Math.ceil(v / step) <= 6) return { max: Math.ceil(v / step) * step, step: step };
      }
    }
    return { max: v, step: v / 4 };
  }
  function short(v) {
    var trim = function (x) { return String(Math.round(x * 10) / 10); };
    return v >= 1e6 ? '£' + trim(v / 1e6) + 'm' : v >= 1000 ? '£' + trim(v / 1000) + 'k' : '£' + Math.round(v);
  }

  // Ages along the bottom: both ends, and round ages in between that do not crowd them.
  function ageTicks(s) {
    var every = s.retire - s.age > 35 ? 10 : 5, ages = [s.age];
    for (var a = Math.ceil((s.age + 1) / every) * every; a < s.retire; a += every) {
      if (a - s.age >= 3 && s.retire - a >= 3) ages.push(a);
    }
    ages.push(s.retire);
    return ages;
  }

  /* ---------- the chart ---------- */
  var shownScale = null;
  function drawAxes(s, sc) {
    if (!shownScale || shownScale.max !== sc.max) {
      var grid = '', labels = '';
      for (var v = 0; v <= sc.max + 1e-6; v += sc.step) {
        var y = 400 - v / sc.max * 400;
        grid += '<line x1="0" x2="1000" y1="' + Math.round(y) + '" y2="' + Math.round(y) + '"' + (v === 0 ? ' class="m-base"' : '') + '/>';
        labels += '<span style="--y:' + (Math.round(y / 4 * 10) / 10) + '%">' + short(v) + '</span>';
      }
      out('grid').innerHTML = grid;
      out('yaxis').innerHTML = labels;
      shownScale = sc;
    }
    var span = s.retire - s.age;
    out('xaxis').innerHTML = ageTicks(s).map(function (a) {
      return '<span style="--x:' + (Math.round((a - s.age) / span * 1000) / 10) + '%">' + a + '</span>';
    }).join('');
    // Where the wait ends. Moved with transforms, so tool.css can glide it.
    var x = s.wait / span * 1000;
    var line = out('start-line'), mark = out('start-mark');
    line.style.transform = 'translateX(' + Math.round(x) + 'px)';
    mark.style.setProperty('--x', (Math.round(x) / 10) + '%');
    mark.classList.toggle('is-flip', x > 700);
    mark.textContent = 'You start, ' + (s.age + s.wait);
  }

  // The end value of each line pinned at the right-hand edge (.is-bold chart):
  // starting now is always the higher line, so its label sits above its dot.
  function drawPins(m, sc) {
    var box = out('pins');
    if (!box) return;
    var a = m.now[m.now.length - 1], b = m.wait[m.wait.length - 1];
    var y = function (v) { return (Math.round((100 - v / sc.max * 100) * 10) / 10) + '%'; };
    box.innerHTML = '<i class="m-pin is-ref" style="--y:' + y(a) + '"></i><span class="m-pin-v is-up" style="--y:' + y(a) + '">' + pounds(a) + '</span>' +
      '<i class="m-pin is-a" style="--y:' + y(b) + '"></i><span class="m-pin-v is-down" style="--y:' + y(b) + '">' + pounds(b) + '</span>';
  }

  /* ---------- the page ---------- */
  // Numbers count to their new value (motion.js); plain text without it.
  function num(name, v) {
    var el = out(name);
    if (!el) return;
    if (window.TeiMotion) window.TeiMotion.count(el, v);
    else el.textContent = el.getAttribute('data-format') === 'gbp2' ? pence(v) : pounds(v);
  }

  function render() {
    var s = state, m = model(s), sc = fitScale(m.potNow);
    var start = s.age + s.wait;

    drawAxes(s, sc);
    if (window.TeiMotion && chart) window.TeiMotion.line(chart, { max: sc.max, ref: m.now, a: m.wait });
    drawPins(m, sc);
    chart.setAttribute('aria-label', 'Line chart from age ' + s.age + ' to ' + s.retire + ", in today's money. Starting now at " + s.age +
      ' with ' + pounds(s.monthly) + ' a month grows to ' + pounds(m.potNow) + '. Starting at ' + start + ' grows to ' + pounds(m.potWait) + '.');

    set('key-now', 'Start now');
    set('key-wait', 'Start at ' + start);
    set('end-now-label', 'Start now, at ' + s.age);
    set('end-wait-label', 'Start at ' + start);
    var name = fig.querySelector('[data-rate="' + s.rate + '"] span');
    set('rate-name', name ? ': ' + name.textContent : '');

    // The headline, above the gate: the cost, the two pots as bars, and a summary that ties them together.
    set('head-k', 'Start ' + years(s.wait) + ' later and your pot at ' + s.retire + ' is');
    num('gap', m.gap);
    num('pot-now', m.potNow);
    num('pot-wait', m.potWait);
    out('bar-wait').style.setProperty('--w', (Math.round(m.potWait / m.potNow * 1000) / 10) + '%');
    out('bars-label').setAttribute('aria-label', 'Pot at ' + s.retire + ", in today's money: starting now at " + s.age + ', ' + pounds(m.potNow) +
      '; starting at ' + start + ', ' + pounds(m.potWait) + '.');
    set('summary', 'Investing ' + pounds(s.monthly) + ' a month from ' + s.age + ' could grow to ' + pounds(m.potNow) + ' by ' + s.retire + '. Start ' +
      later(s.wait) + ' later, at ' + start + ', and it could grow to ' + pounds(m.potWait) + '. ' + (s.wait === 1 ? 'That year of waiting costs ' : 'Those ' + years(s.wait) + ' of waiting cost ') + pounds(m.gap) + '.');

    // Behind the gate: the catch-up leads; one sentence and one small line back it up.
    set('catch-k', 'To catch up on ' + missed(s.wait) + ' you missed, pay');
    num('catch', m.catchUp);
    set('catch-sub', 'That is ' + pence(s.monthly + m.catchUp) + ' a month from ' + start + ' to ' + s.retire + ', not ' + pounds(s.monthly) +
      '. Or put in ' + pounds(m.lump) + ' once, when you start at ' + start + '.');
    set('per', 'Each month of waiting costs about ' + pounds(m.perMonth) + ' by ' + s.retire + ', or about ' + pounds(m.perDay) + " a day, in today's money.");
    set('lump-left', m.left == null ? 'Type an amount to see your new monthly catch-up.'
      : m.left > 0 ? 'With ' + pounds(s.lump) + ' at ' + start + ', the catch-up drops to ' + pence(m.left) + ' a month.'
      : pounds(s.lump) + ' at ' + start + ' covers the whole catch-up.');

    out('pension-note').hidden = s.retire >= 57;

    window.TeiCow = window.TeiCow || {};       // read by the checks
    window.TeiCow.state = s; window.TeiCow.result = m;
  }

  /* ---------- inputs ----------
     Typing updates the result as soon as a value is valid; leaving a box puts
     an out-of-range value back inside its range. The retirement age always
     stays at least two years after the age, and a wait that would run past it
     is switched off. */
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function limits() {
    return {
      monthly: [50, 10000],
      age: [18, Math.max(18, state.retire - 2)],
      retire: [Math.max(45, state.age + 2), 70]
    };
  }
  function syncControls() {
    var lim = limits();
    inputs.age.max = lim.age[1];
    inputs.retire.min = lim.retire[0];
    each(waitButtons, function (b) {
      var w = Number(b.getAttribute('data-wait'));
      b.disabled = state.age + w >= state.retire;
      b.setAttribute('aria-pressed', w === state.wait ? 'true' : 'false');
    });
    if (waitSelect) {
      each(waitSelect.options, function (o) { o.disabled = state.age + Number(o.value) >= state.retire; });
      waitSelect.value = String(state.wait);
    }
    each(rateButtons, function (b) { b.setAttribute('aria-pressed', Number(b.getAttribute('data-rate')) === state.rate ? 'true' : 'false'); });
  }
  function fitWait() { state.wait = clamp(state.wait, 1, Math.min(5, state.retire - state.age - 1)); }

  function onType(key) {
    var v = Number(inputs[key].value), lim = limits()[key];
    var ok = inputs[key].value !== '' && isFinite(v) && v >= lim[0] && v <= lim[1];
    inputs[key].setAttribute('aria-invalid', ok ? 'false' : 'true');
    if (!ok) return;
    state[key] = key === 'monthly' ? v : Math.round(v);
    fitWait(); syncControls(); render();
  }
  function onLeave(key) {
    var v = Number(inputs[key].value);
    if (inputs[key].value === '' || !isFinite(v)) v = state[key];
    if (key === 'age') {
      state.age = clamp(Math.round(v), 18, 68);
      if (state.retire < state.age + 2) { state.retire = Math.min(70, state.age + 2); inputs.retire.value = state.retire; }
    } else if (key === 'retire') {
      state.retire = clamp(Math.round(v), Math.max(45, state.age + 2), 70);
    } else {
      state.monthly = clamp(v, 50, 10000);
    }
    inputs[key].value = state[key];
    inputs[key].setAttribute('aria-invalid', 'false');
    fitWait(); syncControls(); render();
  }
  ['monthly', 'age', 'retire'].forEach(function (key) {
    inputs[key].addEventListener('input', function () { onType(key); });
    inputs[key].addEventListener('change', function () { onLeave(key); });
  });
  inputs.lump.addEventListener('input', function () {
    var v = Number(inputs.lump.value);
    state.lump = inputs.lump.value !== '' && isFinite(v) && v > 0 ? v : 0;
    render();
  });
  each(waitButtons, function (b) {
    b.addEventListener('click', function () { if (b.disabled) return; state.wait = Number(b.getAttribute('data-wait')); syncControls(); render(); });
  });
  if (waitSelect) waitSelect.addEventListener('change', function () { state.wait = Number(waitSelect.value); syncControls(); render(); });
  each(rateButtons, function (b) {
    b.addEventListener('click', function () { state.rate = Number(b.getAttribute('data-rate')); syncControls(); render(); });
  });

  /* ---------- around the tool ---------- */
  // "Log in" on the gate brings a member back to the calculator.
  each(document.querySelectorAll('#cow-lock [data-login]'), function (a) {
    a.setAttribute('href', '/hub/login.html?redirect=' + encodeURIComponent(location.pathname + location.search + '#calculator'));
  });

  // Read next: the card is written into the page; refresh it from /articles.json.
  var card = document.getElementById('cow-read-next');
  if (card && window.fetch) {
    fetch('/articles.json').then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      var a = (list || []).filter(function (x) { return x.slug === card.getAttribute('data-slug'); })[0];
      if (!a) return;
      var d = String(a.date || '').split('-');
      var q = function (n) { return card.querySelector('[data-out="' + n + '"]'); };
      q('rn-cat').textContent = 'Read next · ' + a.category;
      q('rn-title').textContent = a.title;
      q('rn-teaser').textContent = a.teaser;
      q('rn-time').textContent = (d.length === 3 ? Number(d[2]) + ' ' + MONTHS[Number(d[1]) - 1] + ' ' + d[0] + ' · ' : '') + a.readTime + ' min read';
    }).catch(function () {});
  }

  /* ---------- the gate ----------
     /assets/lead-gate.js opens it; the chart draws in again and the results
     count up from zero. */
  var gate = document.getElementById('cow-gate');
  if (gate) gate.addEventListener('tei:gate-open', function () {
    if (!window.TeiMotion) return;
    window.TeiMotion.redraw(chart);
    each(gate.querySelectorAll('[data-m="count-up"]'), function (el, i) {
      window.TeiMotion.count(el, Number(el.getAttribute('data-to')), 0, 150 + i * 120, 900);
    });
  });

  /* ---------- print summary ----------
     A one-page sheet in the V2 style (print rules in /assets/tool.css): the
     inputs, every result with its money label, a vector chart, the
     assumptions and the not-advice line. Only when the results are open. */
  var NAVY = '#0F1E36', GOLD = '#83661C', CHAMP = '#E8D6A8', MUTED = '#4E5B70', LINE = '#DEDAD0';
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function printChart(s, m) {
    var W = 640, H = 248, L = 52, R = 552, T = 12, B = 212, sc = scale(m.potNow);
    var x = function (i) { return L + i / (POINTS - 1) * (R - L); };
    var y = function (v) { return B - Math.min(v, sc.max) / sc.max * (B - T); };
    var path = function (series) { return series.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(''); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="Geist, system-ui, sans-serif" role="img" aria-label="Chart of both pots by age">';
    for (var v = 0; v <= sc.max + 1e-6; v += sc.step) {
      svg += '<line x1="' + L + '" x2="' + R + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="' + LINE + '" stroke-width="' + (v ? 0.6 : 1) + '"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 3).toFixed(1) + '" font-size="9" fill="' + MUTED + '" text-anchor="end">' + short(v) + '</text>';
    }
    ageTicks(s).forEach(function (a) {
      svg += '<text x="' + (L + (a - s.age) / (s.retire - s.age) * (R - L)).toFixed(1) + '" y="' + (B + 16) + '" font-size="9" fill="' + MUTED + '" text-anchor="middle">' + a + '</text>';
    });
    svg += '<text x="' + R + '" y="' + (B + 30) + '" font-size="8.5" fill="' + MUTED + '" text-anchor="end">Age</text>';
    var wx = L + s.wait / (s.retire - s.age) * (R - L);
    svg += '<line x1="' + wx.toFixed(1) + '" x2="' + wx.toFixed(1) + '" y1="' + T + '" y2="' + B + '" stroke="' + GOLD + '" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.6"/>';
    svg += '<path d="' + path(m.now) + m.wait.slice().reverse().map(function (v, i) { return 'L' + x(POINTS - 1 - i).toFixed(1) + ' ' + y(v).toFixed(1); }).join('') + 'Z" fill="' + CHAMP + '" opacity="0.7"/>';
    svg += '<path d="' + path(m.now) + '" fill="none" stroke="' + NAVY + '" stroke-width="2.4" stroke-linejoin="round"/>';
    svg += '<path d="' + path(m.wait) + '" fill="none" stroke="' + GOLD + '" stroke-width="2" stroke-linejoin="round"/>';
    // Both end values, kept apart when the lines finish close together.
    var yn = y(m.potNow), yw = y(m.potWait);
    if (yw - yn < 14) { var mid = (yn + yw) / 2; yn = mid - 7; yw = mid + 7; }
    svg += '<circle cx="' + R + '" cy="' + y(m.potNow).toFixed(1) + '" r="3" fill="' + NAVY + '"/><circle cx="' + R + '" cy="' + y(m.potWait).toFixed(1) + '" r="3" fill="' + GOLD + '"/>' +
      '<text x="' + (R + 8) + '" y="' + (yn + 3.5).toFixed(1) + '" font-size="11" font-weight="500" fill="' + NAVY + '">' + pounds(m.potNow) + '</text>' +
      '<text x="' + (R + 8) + '" y="' + (yw + 3.5).toFixed(1) + '" font-size="11" font-weight="500" fill="' + GOLD + '">' + pounds(m.potWait) + '</text>';
    return svg + '</svg>';
  }

  function summary() {
    var s = state, m = model(s), start = s.age + s.wait, d = new Date();
    var rate = fig.querySelector('[data-rate="' + s.rate + '"] span');
    var today = '<span class="tl-tag is-today">In today\'s money</span>', atTime = '<span class="tl-tag">In pounds at the time</span>';
    var tile = function (cls, label, value, text, tag) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><small>' + label + '</small><b>' + value + '</b><p>' + text + '</p>' + tag + '</div>'; };
    var mark = '<svg width="22" height="22" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="11.5" fill="none" stroke="' + GOLD + '" stroke-width="1.4"/><circle cx="13" cy="13" r="6" fill="none" stroke="' + GOLD + '" stroke-opacity=".5" stroke-width="1.2"/><circle cx="13" cy="13" r="2.4" fill="' + GOLD + '"/></svg>';
    var input = function (k, v) { return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>'; };
    return '<div class="tl-print-head">' + mark + '<b>The Everyday Investor</b><span>Cost of Waiting Calculator &middot; ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear() + '</span></div>' +
      '<h1>The cost of waiting: your summary</h1>' +
      '<p class="tl-print-sub">Investing ' + pounds(s.monthly) + ' a month from ' + s.age + ', against starting after a wait of ' + years(s.wait) + '.</p>' +
      '<dl class="tl-print-inputs">' + input('Monthly amount', pounds(s.monthly)) + input('Age now', s.age) + input('Retirement age', s.retire) +
        input('Wait', years(s.wait)) + input('Growth a year', (rate ? rate.textContent + ', ' : '') + s.rate + '%') + '</dl>' +
      '<div class="tl-print-chart"><div class="tl-print-key"><span><i style="background:' + NAVY + '"></i>Start now, at ' + s.age + '</span><span><i style="background:' + GOLD + '"></i>Start at ' + start + '</span><span>Pots in today\'s money</span></div>' + printChart(s, m) + '</div>' +
      '<div class="tl-print-results">' +
        tile('is-head', 'Start now, at ' + s.age, pounds(m.potNow), 'The pot at ' + s.retire + '.', today) +
        tile('is-head', 'Start at ' + start, pounds(m.potWait), 'The pot at ' + s.retire + ' after the wait.', today) +
        tile('is-head', 'Cost of waiting', pounds(m.gap), 'How much smaller the pot is at ' + s.retire + ' after waiting ' + years(s.wait) + '.', today) +
        tile('', 'To catch up, a month more', pence(m.catchUp), 'So ' + pence(s.monthly + m.catchUp) + ' a month from ' + start + ' to ' + s.retire + ', to end up with the same pot as starting now.', atTime) +
        tile('', 'Or one lump sum', pounds(m.lump), 'Put in once, when you start at ' + start + '.' + (m.left != null ? ' With ' + pounds(s.lump) + ' at ' + start + ', the catch-up is ' + pence(m.left) + ' a month.' : ''), atTime) +
        tile('', 'Each month and day waited', pounds(m.perMonth) + ' &middot; ' + pence(m.perDay), 'The difference split across the ' + 12 * s.wait + ' months, or ' + commas(String(365 * s.wait)) + ' days, of the wait.', today) +
      '</div>' +
      '<p class="tl-print-notes"><b>Assumptions.</b> ' + pounds(s.monthly) + ' a month, paid at the end of each month and kept level (it does not rise with inflation), growing at ' + s.rate +
        '% a year with monthly compounding, before fees and tax. Pots and the difference are in today\'s money, using inflation of 2.5% a year; the catch-up and the lump sum are in pounds at the time they are paid.' +
        (s.retire < 57 ? ' Pension money cannot usually be taken before 57 from 6 April 2028, so money for an earlier retirement would need to sit outside a pension, for example in an ISA.' : '') + '</p>' +
      '<p class="tl-print-notes is-advice">Education, not personal financial advice. The Everyday Investor is not authorised or regulated by the FCA, and nothing here is a personal recommendation. ' +
        'Investments can fall as well as rise and you may get back less than you put in. Worked example figures are illustrations based on the stated assumptions, not forecasts. ' +
        'www.theeverydayinvestor.uk/guides/cost-of-waiting.html</p>';
  }

  var sheet = document.getElementById('cow-print-sheet');
  function preparePrint() {
    if (!sheet || !gate || gate.getAttribute('data-gate') !== 'open') return false;
    sheet.innerHTML = summary();
    document.body.classList.add('tl-printing');
    return true;
  }
  var printButton = document.getElementById('cow-print');
  if (printButton) printButton.addEventListener('click', function () { if (preparePrint()) window.print(); });
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', function () { document.body.classList.remove('tl-printing'); });

  syncControls();
  render();
  window.TeiCow.preparePrint = preparePrint;
})();
