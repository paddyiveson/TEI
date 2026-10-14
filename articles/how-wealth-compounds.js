/* How wealth actually compounds: the two interactive figures and the
   members' "With your own numbers" section.
   Same sums as the milestone figure in /assets/article.js: a fixed amount
   paid in each month, growing at a steady yearly rate compounded monthly.
   Colours come from the theme tokens through CSS classes in content.css,
   so the figures follow light and dark without redrawing. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var INVEST_TYPES = ['isa', 'gia', 'lisa', 'pension', 'crypto']; // as Wealth OS counts them
  var state = { monthly: 200, rate: 7, years: 40, pot0: 0, mine: false };
  var my = null; // the member's own figures, once loaded

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function pounds(n) { return '£' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function short(n) {
    if (n >= 1e6) return '£' + String(Number((n / 1e6).toFixed(n >= 1e7 ? 0 : 2))) + 'm';
    if (n >= 1e3) return '£' + Math.round(n / 1e3) + 'k';
    return '£' + Math.round(n);
  }
  function pct(r) { return (r % 1 ? r.toFixed(1) : String(r)) + '%'; }

  // Pot after m months: starting pot plus a monthly amount, monthly compounding.
  function potAt(m, monthly, rate, pot0) {
    var i = rate / 100 / 12, pot = pot0 || 0;
    for (var k = 0; k < m; k++) pot = pot * (1 + i) + monthly;
    return pot;
  }

  // An even axis step (1, 2, 2.5 or 5 times a power of ten) for about four gridlines.
  function niceStep(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  // Drawn at the width it has, so text stays at its real size on a phone.
  function width(svg) { return Math.round(Math.max(300, Math.min(680, svg.parentNode.clientWidth || 680))); }

  function el(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- Figure 1: the curve ---------- */
  function drawCurve() {
    var svg = $('[data-chart="curve"] svg');
    if (!svg) return;
    var W = width(svg), H = W < 520 ? 240 : 300, L = W < 520 ? 46 : 58, R = W - (W < 520 ? 70 : 90), T = 22, B = H - 38;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var Y = state.years, pts = [], paid = [];
    for (var y = 0; y <= Y; y++) {
      pts.push(potAt(y * 12, state.monthly, state.rate, state.pot0));
      paid.push(state.pot0 + state.monthly * 12 * y);
    }
    var stepV = niceStep(pts[Y] * 1.04 / 4), lines = Math.ceil(pts[Y] * 1.04 / stepV), top = stepV * lines;
    var x = function (yr) { return L + (R - L) * yr / Y; };
    var yv = function (v) { return B - (B - T) * v / top; };
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    for (var t = 0; t <= lines; t++) {
      var v = stepV * t, gy = yv(v);
      svg.appendChild(el('line', { 'class': 'grid', x1: L, x2: R, y1: gy, y2: gy }));
      svg.appendChild(el('text', { 'class': 'ax', x: L - 10, y: gy + 4, 'text-anchor': 'end' }, short(v)));
    }
    var step = Y <= 20 ? 5 : 10;
    for (var yr = 0; yr <= Y; yr += step) svg.appendChild(el('text', { 'class': 'ax', x: x(yr), y: B + 20, 'text-anchor': 'middle' }, 'Yr ' + yr));
    if (Y % step) svg.appendChild(el('text', { 'class': 'ax', x: x(Y), y: B + 20, 'text-anchor': 'middle' }, 'Yr ' + Y));

    var line = function (arr) { return arr.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yv(v).toFixed(1); }).join(' '); };
    var potLine = line(pts), paidLine = line(paid);
    svg.appendChild(el('path', { 'class': 'a1', d: potLine + ' L' + x(Y) + ' ' + B + ' L' + L + ' ' + B + ' Z' }));
    svg.appendChild(el('path', { 'class': 'a2', d: paidLine + ' L' + x(Y) + ' ' + B + ' L' + L + ' ' + B + ' Z' }));
    svg.appendChild(el('path', { 'class': 's2 draw', d: paidLine }));
    svg.appendChild(el('path', { 'class': 's1 draw', d: potLine }));

    var ex = x(Y), ey = yv(pts[Y]), py = yv(paid[Y]);
    svg.appendChild(el('circle', { 'class': 'd1 pulse', cx: ex, cy: ey, r: 4.5 }));
    svg.appendChild(el('circle', { 'class': 'd1', cx: ex, cy: ey, r: 4.5 }));
    svg.appendChild(el('text', { 'class': 'lbl', x: ex + 10, y: ey + 4 }, short(pts[Y])));
    svg.appendChild(el('text', { 'class': 'lbl-m', x: ex + 10, y: Math.max(py + 4, ey + 22) }, 'Put in ' + short(paid[Y])));
    if (W >= 520) { // no room for the notes on a phone
      svg.appendChild(el('text', { 'class': 'lbl-m', x: L + 12, y: B - 12 }, 'Same rate, smaller pot'));
      svg.appendChild(el('text', { 'class': 'lbl-m', x: x(Y * 0.62), y: Math.min(yv(pts[Math.round(Y * 0.8)]) - 14, B - 40), 'text-anchor': 'end' }, 'Same rate, larger pot'));
    }
    svg.setAttribute('aria-label', 'Line chart: ' + pounds(state.monthly) + ' a month at ' + pct(state.rate) + ' a year grows to about ' + short(pts[Y]) + ' after ' + Y + ' years, against ' + short(paid[Y]) + ' put in.');

    set('paid', pounds(paid[Y]));
    set('growth', pounds(pts[Y] - paid[Y]));
    set('pot', pounds(pts[Y]));
    return pts[Y];
  }

  /* ---------- Figure 2: start dates ---------- */
  function drawStart() {
    var svg = $('[data-chart="start"] svg');
    if (!svg) return;
    var starts = [25, 30, 35, 40], vals = starts.map(function (a) { return potAt((65 - a) * 12, state.monthly, state.rate, 0); });
    var W = width(svg), H = W < 520 ? 230 : 290, L = 8, R = W - 8, T = 34, B = H - 50, top = vals[0];
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.appendChild(el('line', { 'class': 'grid', x1: L, x2: R, y1: B, y2: B }));
    var slot = (R - L) / 4, bw = Math.min(96, slot - (W < 520 ? 16 : 34));
    starts.forEach(function (a, i) {
      var h = (B - T) * vals[i] / top, cx = L + slot * i + slot / 2;
      svg.appendChild(el('rect', { 'class': (i ? 'b2' : 'b1') + ' grow', x: cx - bw / 2, y: B - h, width: bw, height: h, rx: 6 }));
      svg.appendChild(el('text', { 'class': 'lbl', x: cx, y: B - h - 10, 'text-anchor': 'middle', style: 'font-size:15px' }, short(vals[i])));
      svg.appendChild(el('text', { 'class': 'ax', x: cx, y: B + 22, 'text-anchor': 'middle' }, 'Start ' + a));
    });
    svg.setAttribute('aria-label', 'Bar chart of the pot at 65: ' + starts.map(function (a, i) { return 'start ' + a + ', ' + short(vals[i]); }).join('; ') + '.');
  }

  function set(name, text) { $all('[data-o="' + name + '"]').forEach(function (e) { e.textContent = text; }); }

  function render() {
    set('monthly', pounds(state.monthly));
    set('rate', pct(state.rate));
    set('years', String(state.years));
    set('sub', state.pot0 > 0
      ? 'Your ' + pounds(state.pot0) + ' invested today, plus ' + pounds(state.monthly) + ' every month, growing at a steady ' + pct(state.rate) + ' a year'
      : pounds(state.monthly) + ' invested every month, growing at a steady ' + pct(state.rate) + ' a year');
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
    var lastW = 0;
    window.addEventListener('resize', function () {
      var w = width($('[data-chart="curve"] svg'));
      if (w !== lastW) { lastW = w; read(); }
    });
  }

  /* ---------- Members: their own figures ---------- */
  function renderMine() {
    var box = $('#your-numbers');
    if (!box || !my) return;
    $('[data-m="pot"]', box).textContent = pounds(my.pot);
    $('[data-m="monthly"]', box).textContent = pounds(my.monthly);
    $('[data-m="future"]', box).textContent = pounds(potAt(state.years * 12, my.monthly, state.rate, my.pot));
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
          var btn = $('[data-m="apply"]', box);
          if (btn) btn.addEventListener('click', toggleMine);
        });
    });
  }

  function toggleMine() {
    var btn = $('#your-numbers [data-m="apply"]'), m = $('#cMonthly');
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
    var fig = $('#fig-curve');
    fig.scrollIntoView({ behavior: window.TeiContent && window.TeiContent.calm ? 'auto' : 'smooth', block: 'start' });
    if (window.TeiContent) window.TeiContent.redrawn($('[data-chart="curve"]'));
  }

  function init() { render(); bind(); members(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
