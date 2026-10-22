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

  /* ---------- Members: the verdict with their own Wealth OS figures ----------
     Reads (row-level security returns only the member's own rows):
       clients.dob                          age today
       cashflow_settings.retirement_age     when the money comes out (60 at least)
       contribution_rules (current, on a pension account)
                                            salary, employee %, employer %, match cap,
                                            method, pensionable basis, NI pass-on
       income (Salary / Self-Employed)      salary when there is no rule
       accounts.type                        whether they already hold a LISA
     The comparison is the article's: the next £4,000 of take-home pay. */
  var BANDS = [ // income tax and employee NI on the next pound, rUK rates 2026/27
    { upTo: 50270, tax: 0.20, ni: 0.08, name: 'basic' },
    { upTo: 125140, tax: 0.40, ni: 0.02, name: 'higher' },
    { upTo: Infinity, tax: 0.45, ni: 0.02, name: 'additional' }
  ];
  var EMPLOYER_NI = 0.15;
  function band(salary) { for (var i = 0; i < BANDS.length; i++) if (salary <= BANDS[i].upTo) return BANDS[i]; return BANDS[2]; }
  function ageOn(dob, today) {
    var d = new Date(dob + 'T00:00:00'); if (isNaN(d)) return null;
    var a = today.getFullYear() - d.getFullYear();
    if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) a--;
    return a;
  }
  function yearly(row) {
    var f = String(row.frequency || '').toLowerCase(), n = Number(row.amount) || 0;
    return f === 'monthly' ? n * 12 : f === 'weekly' ? n * 52 : f === 'fortnightly' ? n * 26 : n;
  }
  function pensionable(rule, salary) {
    if (rule && rule.pensionable_basis === 'qualifying_earnings') return Math.max(0, Math.min(salary, 50270) - 6240);
    return salary;
  }

  // The next £4,000 of take-home pay, for this person.
  function personal(me, route, employerPct) {
    var b = band(me.salary);
    var own = route === 'ss' ? EX.net / (1 - b.tax - b.ni) : EX.net / (1 - b.tax);
    var employer = me.salary * employerPct / 100 + (route === 'ss' ? own * EMPLOYER_NI * me.niPassOn : 0);
    var grow = Math.pow(1 + EX.growth, me.years);
    var penIn = own + employer;
    return { band: b, own: own, employer: employer, penIn: penIn, lisa60: EX.net * 1.25 * grow, pen60: penIn * grow * (1 - EX.taxOut) };
  }

  function members() {
    var box = document.getElementById('your-numbers');
    if (!box || !window.TeiMembers) return;
    var q = function (name) { return box.querySelector('[data-y="' + name + '"]'); };
    window.TeiMembers.ready().then(function (who) {
      if (!who) return;
      var out = box.querySelector('[data-members-out]'), lock = box.querySelector('.tc-members-lock');
      if (lock) lock.hidden = true;
      out.hidden = false;
      function empty(text) { q('empty').hidden = false; q('empty').textContent = text; }
      if (!who.client) { empty('You are signed in as the coach, so there are no personal figures to show here.'); return; }
      var w = who.sb.schema('wealth_os'), id = who.client.id;
      Promise.all([
        w.from('clients').select('dob').eq('id', id).maybeSingle(),
        w.from('cashflow_settings').select('retirement_age').eq('client_id', id).maybeSingle(),
        w.from('accounts').select('id, type').eq('client_id', id),
        w.from('income').select('type, amount, frequency, owner').eq('client_id', id)
      ]).then(function (r) {
        var accounts = (r[2] && r[2].data) || [];
        var pensionIds = accounts.filter(function (a) { return a.type === 'pension'; }).map(function (a) { return a.id; });
        var rules = pensionIds.length
          ? w.from('contribution_rules').select('*').in('account_id', pensionIds).is('effective_to', null).order('version', { ascending: false })
          : Promise.resolve({ data: [] });
        return rules.then(function (rr) { show(r, accounts, ((rr && rr.data) || [])[0] || null); });
      }).catch(function () { empty('Your figures could not be loaded just now. Try again in a moment.'); });
    });

    function show(r, accounts, rule) {
      var today = new Date();
      var dob = r[0] && r[0].data && r[0].data.dob;
      var ret = r[1] && r[1].data && Number(r[1].data.retirement_age);
      var income = ((r[3] && r[3].data) || []).filter(function (i) { return (i.owner || 'client') === 'client'; });
      var salaryRows = income.filter(function (i) { return /^salary$/i.test(i.type); });
      var selfRows = income.filter(function (i) { return /self-employed/i.test(i.type); });

      var me = { notes: [] };
      if (rule && Number(rule.gross_annual_salary) > 0) { me.salary = Number(rule.gross_annual_salary); me.salarySrc = 'Pension contribution rule'; }
      else if (salaryRows.length) { me.salary = salaryRows.reduce(function (s, i) { return s + yearly(i); }, 0); me.salarySrc = 'Income'; }
      else if (selfRows.length) { me.salary = selfRows.reduce(function (s, i) { return s + yearly(i); }, 0); me.salarySrc = 'Self-employed income'; me.selfEmployed = true; }
      if (!(me.salary > 0)) { q('empty').hidden = false; q('empty').textContent = 'Add your salary to Wealth OS (Income, or your pension contribution rule) and this section will run the verdict for you.'; return; }

      var age = dob ? ageOn(dob, today) : null;
      me.age = age != null ? age : 30;
      me.ageSrc = age != null ? 'Date of birth' : 'Example age: add your date of birth';
      me.out = Math.max(60, ret || 60);
      me.outSrc = ret ? (ret < 60 ? 'Retirement age ' + ret + ', but a LISA is free from 60' : 'Retirement age') : 'Default: LISA free from 60';
      me.years = Math.max(1, me.out - me.age);
      me.niPassOn = rule && rule.contribution_method === 'salary_sacrifice' ? (Number(rule.employer_ni_passon_pct) || 0) / 100 : 0;
      me.route = rule && rule.contribution_method === 'salary_sacrifice' ? 'ss' : 'ras';

      // Employer money on the NEXT £4,000, not what they already get.
      var employerPct = 0, employerText = '';
      if (me.selfEmployed) {
        employerText = 'Self-employed income has no employer contribution, so the comparison is your tax relief against the LISA bonus.';
      } else if (rule && rule.basis === 'salary_derived') {
        var e = Number(rule.employee_pct) || 0, E = Number(rule.employer_pct) || 0, cap = rule.employer_match_cap_pct != null ? Number(rule.employer_match_cap_pct) : null;
        var base = pensionable(rule, me.salary);
        if (cap != null && e < cap) {
          var room = (cap - e) / 100 * base;
          var ownGross = me.route === 'ss' ? EX.net / (1 - band(me.salary).tax - band(me.salary).ni) : EX.net / (1 - band(me.salary).tax);
          employerPct = Math.round(Math.min(room, ownGross) / me.salary * 200) / 2;
          employerText = 'You pay ' + pct(e) + ' and your employer matches up to ' + pct(cap) + '. Paying more into the pension would unlock up to ' + pounds(room) + ' a year of extra employer money, so it is counted here.';
        } else {
          employerText = 'You pay ' + pct(e) + ' and your employer pays ' + pct(E) + (cap != null ? ', and you already reach the ' + pct(cap) + ' match' : '') +
            '. That employer money arrives either way, so an extra £4,000 earns no more of it. The comparison starts with no extra employer money.';
        }
        if (me.niPassOn) employerText += ' Your employer also passes on ' + pct(me.niPassOn * 100) + ' of its NI saving on salary sacrifice, which is included.';
      } else {
        employerText = 'There is no pension contribution rule in Wealth OS yet, so the slider starts at no extra employer money. Set it to what your employer would add if you paid in more.';
      }

      var facts = [
        ['Salary', pounds(me.salary), me.salarySrc],
        ['Tax band', band(me.salary).name.charAt(0).toUpperCase() + band(me.salary).name.slice(1) + ' rate', me.selfEmployed ? 'From your income' : 'From your salary'],
        ['Age today', String(me.age), me.ageSrc],
        ['Money out at', String(me.out), me.outSrc],
        ['Pension paid by', me.route === 'ss' ? 'Salary sacrifice' : 'Relief at source', rule ? 'Pension contribution rule' : 'Assumed']
      ];
      q('facts').innerHTML = facts.map(function (f) {
        return '<div><dt>' + f[0] + '</dt><dd>' + f[1].replace(/</g, '&lt;') + '<small>' + f[2].replace(/</g, '&lt;') + '</small></dd></div>';
      }).join('');
      q('employer-note').hidden = false;
      q('employer-text').textContent = employerText;

      var hasLisa = accounts.some(function (a) { return a.type === 'lisa' || a.type === 'cash_lisa'; });
      var warn = me.age >= 50 ? 'At ' + me.age + ' you can no longer pay into a Lifetime ISA (contributions stop at 50), so this comparison is for illustration only.'
        : (me.age >= 40 && !hasLisa) ? 'A Lifetime ISA has to be opened before 40. Without an existing LISA, this comparison is for illustration only.'
        : '';
      if (warn) { q('lisa-warn').hidden = false; q('lisa-warn-text').textContent = warn; }

      var state = { route: me.route, match: employerPct };
      var slider = box.querySelector('#yMatch');
      var routeBtns = box.querySelectorAll('[data-yroute]');
      if (me.selfEmployed) { slider.closest('.tc-field').hidden = true; box.querySelector('[data-yroute="ss"]').disabled = true; }
      slider.value = String(employerPct);

      function render() {
        var res = personal(me, state.route, state.match);
        each(routeBtns, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-yroute') === state.route)); });
        q('match').textContent = pct(state.match);
        q('lisa-label').textContent = 'Lifetime ISA at ' + me.out;
        q('pen-label').textContent = 'Pension at ' + me.out + ', after tax';
        M().count(q('lisa-60'), res.lisa60);
        M().count(q('pen-60'), res.pen60);
        q('pen-note').textContent = pounds(res.penIn) + ' in, about 15% tax out';
        var gap = Math.round(res.pen60 - res.lisa60);
        q('line').innerHTML = Math.abs(gap) < 1 ? 'With your figures, the two end up <strong>level</strong>.'
          : 'With your figures, the ' + (gap > 0 ? 'pension' : 'LISA') + ' ends up <strong>' + pounds(Math.abs(gap)) + ' ahead</strong> by ' + me.out + '.';
        M().win(q('result'), Math.abs(gap) < 1 ? '' : gap > 0 ? 'pension' : 'lisa');
      }
      each(routeBtns, function (b) { b.addEventListener('click', function () { if (!b.disabled) { state.route = b.getAttribute('data-yroute'); render(); } }); });
      slider.addEventListener('input', function () { state.match = Number(slider.value); render(); });
      if (band(me.salary).name !== 'basic') {
        q('hint').textContent += ' At ' + band(me.salary).name + ' rate, relief at source assumes the extra relief above 20% is claimed back through Self Assessment, and salary sacrifice saves ' + Math.round(band(me.salary).tax * 100) + '% tax and 2% NI.';
      }
      q('body').hidden = false;
      render();
    }
  }

  function init() { sceneSame(); sceneVerdict(); figCharge(); members(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
