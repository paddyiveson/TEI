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
    // Ages along the bottom: both ends, and round ages in between that do not crowd them.
    var span = s.retire - s.age, every = span > 35 ? 10 : 5, ages = [s.age];
    for (var a = Math.ceil((s.age + 1) / every) * every; a < s.retire; a += every) {
      if (a - s.age >= 3 && s.retire - a >= 3) ages.push(a);
    }
    ages.push(s.retire);
    out('xaxis').innerHTML = ages.map(function (a) {
      return '<span style="--x:' + (Math.round((a - s.age) / span * 1000) / 10) + '%">' + a + '</span>';
    }).join('');
    // Where the wait ends.
    var x = s.wait / span * 1000;
    var line = out('start-line'), mark = out('start-mark');
    line.setAttribute('x1', Math.round(x)); line.setAttribute('x2', Math.round(x));
    mark.style.setProperty('--x', (Math.round(x) / 10) + '%');
    mark.classList.toggle('is-flip', x > 700);
    mark.textContent = 'Wait ends, ' + (s.age + s.wait);
  }

  /* ---------- the page ---------- */
  function render() {
    var s = state, m = model(s), sc = scale(m.potNow);
    var start = s.age + s.wait, at = 'At ' + s.retire + ", in today's money";

    drawAxes(s, sc);
    if (window.TeiMotion && chart) window.TeiMotion.line(chart, { max: sc.max, ref: m.now, a: m.wait });
    chart.setAttribute('aria-label', 'Line chart from age ' + s.age + ' to ' + s.retire + ", in today's money. Starting now at " + s.age +
      ' with ' + pounds(s.monthly) + ' a month grows to ' + pounds(m.potNow) + '. Starting at ' + start + ' grows to ' + pounds(m.potWait) + '.');

    set('key-now', 'Start now, at ' + s.age);
    set('key-wait', 'Start at ' + start);
    set('end-now-label', 'Start now, at ' + s.age);
    set('end-wait-label', 'Start at ' + start);
    set('end-now-sub', at);
    set('end-wait-sub', at);
    set('pot-now', pounds(m.potNow));
    set('pot-wait', pounds(m.potWait));
    set('gap', pounds(m.gap));
    set('gap-line', 'less at ' + s.retire + ", in today's money, from waiting " + years(s.wait) + ' to start ' + pounds(s.monthly) + ' a month.');

    set('catch', pence(m.catchUp));
    set('catch-sub', 'Paid on top of ' + pounds(s.monthly) + ' a month from ' + start + ' to ' + s.retire + ', to finish level with starting now.');
    set('lump', pounds(m.lump));
    set('lump-sub', 'Paid at ' + start + '. It is what the missed ' + (s.wait === 1 ? "year's" : "years'") + ' saving would have grown to by then.');
    set('per-month', pounds(m.perMonth));
    set('per-month-sub', 'The difference at ' + s.retire + ', split across the ' + (12 * s.wait) + ' months of the wait.');
    set('per-day', pence(m.perDay));
    set('per-day-sub', 'The same difference, split across the ' + commas(String(365 * s.wait)) + ' days of the wait.');
    set('lump-in-label', 'A lump sum at ' + start + ' (optional)');
    set('lump-left', m.left == null ? 'Type an amount to see how much monthly catch-up it still leaves.'
      : m.left > 0 ? 'With ' + pounds(s.lump) + ' at ' + start + ', the catch-up falls to ' + pence(m.left) + ' a month.'
      : pounds(s.lump) + ' at ' + start + ' closes the gap on its own, with no monthly catch-up needed.');

    set('caption', pounds(s.monthly) + ' a month, paid at the end of each month and kept level (it does not rise with inflation), growing at ' +
      s.rate + '% a year with monthly compounding, before fees and tax.');
    out('pension-note').hidden = s.retire >= 57;

    window.TeiCow = { state: s, result: m };   // read by the print summary and the checks
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

  syncControls();
  render();
})();
