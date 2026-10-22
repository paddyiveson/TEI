/* Pension vs LISA: the article's maths. Motion comes from /assets/motion.js
   (window.TeiMotion); this file only works out the numbers and hands them over.

   Worked example (stated in the figure captions):
     £40,000 salary, basic-rate taxpayer, aged 30, money out at 60,
     5% a year growth on both wrappers, employer % of full salary.
     LISA: 25% bonus, tax-free out.
     Pension: relief at source (£4,000 / 0.8) or salary sacrifice
     (£4,000 / 0.72: 20% tax + 8% NI); out: 25% tax-free, 75% at 20%,
     so 15% of the pot (State Pension uses the personal allowance).
   Early withdrawal figure: a 25% charge on the whole LISA balance. */
(function () {
  'use strict';

  var EX = { salary: 40000, net: 4000, years: 30, growth: 0.05, taxOut: 0.15 };
  var GROW = Math.pow(1 + EX.growth, EX.years);

  function M() { return window.TeiMotion || { count: function (el, v) { el.textContent = pounds(v); }, bar: function (s, v) { s.style.setProperty('--v', v); }, win: function () {}, calm: true }; }
  function pounds(n) { return '£' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function all(root, name) { return root.querySelectorAll('[data-out="' + name + '"]'); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function pct(n) { return (n % 1 ? n.toFixed(1) : String(n)) + '%'; }

  // What one year's £4,000 of take-home pay becomes in each wrapper.
  function model(route, matchPct) {
    var employer = EX.salary * matchPct / 100;
    var own = route === 'ss' ? EX.net / 0.72 : EX.net / 0.8;
    var penIn = own + employer;
    var penPot = penIn * GROW;
    var lisa60 = EX.net * 1.25 * GROW;
    return {
      employer: employer, penIn: penIn, lisaIn: EX.net * 1.25,
      lisa60: lisa60, penPot: penPot,
      penFree: penPot * 0.25, penTax: penPot * EX.taxOut, penKept: penPot * 0.6,
      pen60: penPot * (1 - EX.taxOut)
    };
  }

  /* ---------- Scene 2: employer on or off ---------- */
  function sceneSame() {
    var fig = document.getElementById('scene-same');
    if (!fig) return;
    var buttons = fig.querySelectorAll('[data-employer]');
    function show(on) {
      var employer = on ? EX.salary * 0.03 : 0;
      each(buttons, function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-employer') === 'on') === on)); });
      each(fig.querySelectorAll('[data-employer-seg]'), function (seg) { M().bar(seg, employer); });
      each(all(fig, 'ras-in'), function (el) { M().count(el, EX.net / 0.8 + employer); });
      each(all(fig, 'ss-in'), function (el) { M().count(el, EX.net / 0.72 + employer); });
    }
    each(buttons, function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-employer') === 'on'); }); });
  }

  /* ---------- Scene 4: the verdict ---------- */
  function sceneVerdict() {
    var fig = document.getElementById('scene-verdict');
    if (!fig) return;
    var box = fig.querySelector('[data-m="toggle-result"]');
    var routeBtns = fig.querySelectorAll('[data-route]');
    var slider = fig.querySelector('#matchIn');
    var state = { route: 'ras', match: Number(slider.value) };

    function render() {
      var r = model(state.route, state.match);
      each(routeBtns, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-route') === state.route)); });
      each(all(fig, 'match'), function (el) { el.textContent = pct(state.match); });
      each(all(fig, 'lisa-60'), function (el) { M().count(el, r.lisa60); });
      each(all(fig, 'pen-60'), function (el) { M().count(el, r.pen60); });
      each(all(fig, 'lisa-free'), function (el) { M().bar(el, r.lisa60); });
      each(all(fig, 'pen-free'), function (el) { M().bar(el, r.penFree); });
      each(all(fig, 'pen-kept'), function (el) { M().bar(el, r.penKept); });
      each(all(fig, 'pen-tax'), function (el) { M().bar(el, r.penTax); });
      each(all(fig, 'lisa-bar-label'), function (el) { el.setAttribute('aria-label', 'Lifetime ISA at 60: ' + pounds(r.lisa60) + ', all tax-free'); });
      each(all(fig, 'pen-bar-label'), function (el) { el.setAttribute('aria-label', 'Pension at 60: ' + pounds(r.penPot) + ' pot, ' + pounds(r.pen60) + ' after tax'); });
      each(all(fig, 'pen-note'), function (el) { el.textContent = pounds(r.penIn) + ' in, about 15% tax out'; });

      var gap = Math.round(r.pen60 - r.lisa60);
      var who = state.match ? 'With a ' + pct(state.match) + ' employer contribution' : 'With no employer contribution';
      var line = Math.abs(gap) < 1
        ? who + ', the two end up <strong>level</strong>.'
        : who + ', the ' + (gap > 0 ? 'pension' : 'LISA') + ' ends up <strong>' + pounds(Math.abs(gap)) + ' ahead</strong>.';
      each(all(fig, 'line'), function (el) { el.innerHTML = line; });
      M().win(box, Math.abs(gap) < 1 ? '' : gap > 0 ? 'pension' : 'lisa');
    }

    each(routeBtns, function (b) { b.addEventListener('click', function () { state.route = b.getAttribute('data-route'); render(); }); });
    slider.addEventListener('input', function () { state.match = Number(slider.value); render(); });
    render();
  }

  /* ---------- Early withdrawal figure ---------- */
  function set(root, name, text) { each(root.querySelectorAll('[data-o="' + name + '"]'), function (e) { e.textContent = text; }); }
  function figCharge() {
    var fig = document.getElementById('fig-charge');
    var input = document.getElementById('lisaIn');
    if (!fig || !input) return;
    function render() {
      var paid = Number(input.value);
      var bonus = paid * 0.25, balance = paid + bonus, charge = balance * 0.25, back = balance - charge;
      set(fig, 'paid', pounds(paid));
      set(fig, 'bonus', '+' + pounds(bonus));
      set(fig, 'balance', pounds(balance));
      set(fig, 'charge', '-' + pounds(charge));
      set(fig, 'back', pounds(back));
      set(fig, 'lost', '-' + pounds(paid - back));
      set(fig, 'sub', paid === 4000
        ? 'Based on the maximum annual LISA contribution, withdrawn early for a reason other than a first home or reaching 60.'
        : 'Based on a ' + pounds(paid) + ' LISA contribution, withdrawn early for a reason other than a first home or reaching 60.');
      M().bar(fig.querySelector('[data-b="kept"]'), back);
      M().bar(fig.querySelector('[data-b="charge"]'), charge);
    }
    input.addEventListener('input', render);
    render();
  }

  function init() { sceneSame(); sceneVerdict(); figCharge(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
