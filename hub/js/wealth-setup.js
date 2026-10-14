/* Set up Wealth OS: the gap flow (redesign spec B13, boards Setup,
 * SetupMobile, SetupConfirm and SetupCoach).
 *
 * After the fact find the coach fills the record (B13.2). The coach then
 * sends a setup request from the adviser workspace (Setup tab): the gaps
 * found below, minus any the coach unticks, plus any questions the coach
 * adds. The client sees only those, plus "You and investing", which they
 * always answer. Prefilled figures are read-only here; they change in
 * Settings.
 *
 * Storage: clients.setup_request and the B13 columns (migration 013), through
 * TEI.wealthOS.saveSetupFields, plus the existing income, expense and
 * cashflow settings saves. Loaded after the main Wealth OS script.
 */
window.TEI = window.TEI || {};
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function gbp(n) { return '£' + Math.round(Number(n) || 0).toLocaleString('en-GB'); }
  function dateText(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function nowIso() { return new Date().toISOString(); }
  function uid() { return 'q' + Math.random().toString(36).slice(2, 8); }
  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }

  var SECTIONS = [
    { id: 'about', name: 'About you and family' },
    { id: 'moneyin', name: 'Money in' },
    { id: 'moneyout', name: 'Money out' },
    { id: 'accounts', name: 'Accounts and pensions' },
    { id: 'property', name: 'Property and debts' },
    { id: 'protection', name: 'Protection' },
    { id: 'goals', name: 'Goals' },
    { id: 'plan', name: 'Your plan' },
    { id: 'you', name: 'You and investing' },
    { id: 'documents', name: 'Documents' }
  ];
  function sectionName(id) {
    var s = SECTIONS.filter(function (x) { return x.id === id; })[0];
    return s ? s.name : id;
  }

  var EMPLOYMENT = ['Employed', 'Self-employed', 'Retired', 'Business Owner', 'Student', 'Not Currently Working'];
  var RELATIONSHIP = ['Single', 'Partnered', 'Married'];
  var PROTECTION = [['life', 'Life cover'], ['income', 'Income protection'], ['critical', 'Critical illness cover'], ['will', 'A will']];
  var YNU = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']];
  var DEPENDANTS = [['none', 'None'], ['1', '1'], ['2', '2'], ['3+', '3 or more']];
  var ATTITUDES = [
    ['wants', 'What do you want your money to do for you?', 'For example: buy a home, work four days a week by 45', false],
    ['worries', 'What worries you most about money?', '', false],
    ['past', 'Anything in your past that shapes how you feel about money?', '', true]
  ];
  var PROFILE_Q = [
    ['experience', 'What have you invested in before?', ['Nothing yet', 'Cash savings only', 'Funds or ETFs', 'Individual shares', 'Crypto or other']],
    ['knowledge', 'How confident do you feel about investing?', ['New to it', 'Know the basics', 'Fairly confident', 'Very confident']],
    ['horizon', 'When might you need most of this money?', ['Under 5 years', '5 to 10 years', '10 to 20 years', 'Over 20 years']],
    ['fall', 'If your investments fell 20% in a few months, you would most likely', ['Sell to stop the loss', 'Worry, but hold', 'Hold and wait', 'Buy more']],
    ['style', 'How hands-on do you want to be?', ['Hands-on', 'A mix', 'Set and forget']],
    ['risk', 'Which word fits you best?', ['Cautious', 'Balanced', 'Growth', 'Adventurous', 'Not sure yet']]
  ];
  // "Adventurous" is stored as the existing risk_profile value.
  function riskToStore(v) { return v === 'Adventurous' ? 'Aggressive' : (v === 'Not sure yet' ? null : v); }
  function riskFromStore(v) { return v === 'Aggressive' ? 'Adventurous' : v; }
  var NOT_ADVICE = 'TEI provides financial coaching and education, not regulated financial advice.';
  var PROFILE_NOTE = 'For how your coach and Wealth OS talk to you. Not a formal risk assessment.';

  /* ---------------- gaps ---------------- */
  function allExpenses(c) {
    var e = (c.cashflow && c.cashflow.expenses) || {};
    return (e.fixed || []).map(function (x) { return { kind: 'fixed', e: x }; })
      .concat((e.variable || []).map(function (x) { return { kind: 'variable', e: x }; }));
  }

  /* Every empty field the client could fill, by section (B13.4: "every empty
     field is listed automatically"). */
  function gapsFor(c) {
    var p = c.personal || {}, out = [];
    function add(section, id, label) { out.push({ section: section, id: id, label: label, kind: 'field' }); }
    if (!p.dob) add('about', 'about.dob', 'Date of birth');
    if (!p.employmentStatus) add('about', 'about.employment', 'Employment');
    if (!p.relationshipStatus) add('about', 'about.relationship', 'Relationship');
    if (!p.dependants) add('about', 'about.dependants', 'Dependants');
    if (!((c.cashflow && c.cashflow.income) || []).length) add('moneyin', 'moneyin.takehome', 'Take-home pay');
    allExpenses(c).forEach(function (x) {
      if (!x.e.hasSpendCategory) add('moneyout', 'moneyout.tag.' + x.e.id, 'Tag: ' + (x.e.label || 'Spending line'));
    });
    if (!(c.pensions && c.pensions.statePension)) add('accounts', 'accounts.statePension', 'State Pension forecast');
    var prot = c.protection || {};
    PROTECTION.forEach(function (k) { if (!prot[k[0]]) add('protection', 'protection.' + k[0], k[1]); });
    var pref = c.preferences || {};
    if (pref.retirementAge == null) add('plan', 'plan.retire', 'Planned retirement age');
    if (pref.yearlySpending == null) add('plan', 'plan.spend', 'Yearly spending in independence');
    if (pref.safetyNetMonths == null) add('plan', 'plan.safety', 'Safety net months');
    return out;
  }

  function request(c) { return c.setupRequest || null; }
  function isActive(c) {
    var r = request(c);
    return !!(r && (r.status === 'sent' || r.status === 'in_progress'));
  }

  /* What the client is asked: the request's live gaps (still empty now, and
     not unticked by the coach) and the coach's own questions. */
  function itemsFor(c, req) {
    req = req || request(c) || {};
    var off = req.off || {};
    var gaps = gapsFor(c).filter(function (g) { return !off[g.id]; });
    var qs = (req.questions || []).map(function (q) {
      return { section: q.section, id: 'question.' + q.id, qid: q.id, label: q.text, kind: 'question' };
    });
    return gaps.concat(qs);
  }
  function leftCount(c, req) {
    req = req || request(c) || {};
    var answers = req.answers || {};
    return itemsFor(c, req).filter(function (it) { return it.kind !== 'question' || !answers[it.qid]; }).length;
  }
  function profileAnswered(c) {
    var pr = c.profile || {};
    return PROFILE_Q.filter(function (q) { return q[0] === 'risk' ? !!(c.personal && c.personal.riskProfile) : !!pr[q[0]]; }).length;
  }

  /* ---------------- prefilled summary ("From your session") ---------------- */
  function fromRows(c, section) {
    var p = c.personal || {}, rows = [];
    if (section === 'about') {
      var name = [p.firstName, p.lastName].filter(Boolean).join(' ');
      if (name) rows.push(['Name', name]);
      if (p.dob) rows.push(['Date of birth', dateText(p.dob)]);
      if (p.employmentStatus) rows.push(['Employment', p.employmentStatus]);
      if (p.relationshipStatus) rows.push(['Relationship', p.relationshipStatus]);
      if (p.dependants) rows.push(['Dependants', dependantsText(p.dependants)]);
    } else if (section === 'moneyin') {
      ((c.cashflow && c.cashflow.income) || []).forEach(function (i) {
        rows.push([i.type || 'Income', gbp(i.amount) + ' ' + freqText(i.frequency)]);
      });
    } else if (section === 'moneyout') {
      allExpenses(c).forEach(function (x) {
        rows.push([x.e.label || 'Spending', gbp(x.e.amount) + (x.e.hasSpendCategory ? ' · ' + (x.e.category === 'lifestyle' ? 'Lifestyle' : 'Essential') : ' · not tagged yet')]);
      });
    } else if (section === 'accounts') {
      var latest = {};
      try { latest = TEI.calc.latestBreakdown(TEI.calc.buildMergedMonths(c)) || {}; } catch (e) {}
      (c.accounts || []).forEach(function (a) { rows.push([a.name || a.type || 'Account', gbp(latest[a.id] != null ? latest[a.id] : a.value)]); });
      var sp = c.pensions && c.pensions.statePension;
      if (sp) rows.push(['State Pension', statePensionText(sp)]);
    } else if (section === 'protection') {
      var pr = c.protection || {};
      PROTECTION.forEach(function (k) { if (pr[k[0]]) rows.push([k[1], ynuText(pr[k[0]])]); });
    } else if (section === 'plan') {
      var pref = c.preferences || {};
      if (pref.retirementAge != null) rows.push(['Planned retirement age', String(pref.retirementAge)]);
      if (pref.yearlySpending != null) rows.push(['Yearly spending in independence', gbp(pref.yearlySpending)]);
      if (pref.safetyNetMonths != null) rows.push(['Safety net', pref.safetyNetMonths + ' months']);
    } else if (section === 'goals') {
      (c.goals || []).forEach(function (g) { rows.push([g.name || 'Goal', g.targetAmount ? gbp(g.targetAmount) : '']); });
    } else if (section === 'property') {
      ((c.wealth && c.wealth.assets) || []).forEach(function (a) { rows.push([a.type || 'Asset', gbp(a.value)]); });
      ((c.wealth && c.wealth.liabilities) || []).forEach(function (l) { rows.push([l.type || 'Debt', gbp(l.balance)]); });
    }
    return rows;
  }
  function freqText(f) { return { monthly: 'a month', annual: 'a year', weekly: 'a week', fourweekly: 'every 4 weeks' }[f] || ''; }
  function ynuText(v) { return { yes: 'Yes', no: 'No', unsure: 'Not sure' }[v] || ''; }
  function dependantsText(d) {
    if (!d) return '';
    var n = { none: 'None', '1': '1', '2': '2', '3+': '3 or more' }[d.count] || '';
    return n + (d.ages ? ', ages ' + d.ages : '') + (d.others ? '. Also: ' + d.others : '');
  }
  function statePensionText(sp) {
    if (!sp) return '';
    if (sp.notChecked) return 'Not checked yet';
    return gbp(sp.weekly) + ' a week from ' + (sp.age || '?');
  }

  /* ---------------- field renderers ---------------- */
  /* Each returns HTML for one item. Values come from draft (typed this
     session) first, then the record (Settings mode shows current values). */
  function chips(name, opts, val) {
    return '<div class="su-chips" role="group" data-chips="' + esc(name) + '">' + opts.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
      return '<button type="button" class="su-chip" data-v="' + esc(v) + '" aria-pressed="' + (val === v ? 'true' : 'false') + '">' + esc(l) + '</button>';
    }).join('') + '</div>';
  }
  function select(name, opts, val, label) {
    return '<label class="su-lab">' + esc(label) + '<select class="su-in" data-f="' + esc(name) + '"><option value="">Choose</option>' +
      opts.map(function (o) { return '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
  }
  function input(name, label, val, opts) {
    opts = opts || {};
    return '<label class="su-lab"><span>' + esc(label) + (opts.optional ? ' <span class="su-opt">Optional</span>' : '') + '</span>' +
      '<input class="su-in' + (opts.mono ? ' su-mono' : '') + '" data-f="' + esc(name) + '" type="' + (opts.type || 'text') + '"' +
      (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      ' value="' + esc(val == null ? '' : val) + '"></label>';
  }
  function textarea(name, label, val, opts) {
    opts = opts || {};
    return '<label class="su-lab"><span>' + esc(label) + (opts.optional ? ' <span class="su-opt">Optional</span>' : '') + '</span>' +
      '<textarea class="su-in su-ta" data-f="' + esc(name) + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '>' + esc(val || '') + '</textarea></label>';
  }
  function box(tag, inner, cls) {
    return '<div class="su-box' + (cls ? ' ' + cls : '') + '">' + (tag ? '<span class="su-tag">' + esc(tag) + '</span>' : '') + inner + '</div>';
  }

  function fieldHTML(c, it, d, mode) {
    var p = c.personal || {};
    var tag = mode === 'settings' ? '' : (it.kind === 'question' ? 'From your coach' : 'Still needed');
    var id = it.id;
    if (id === 'about.dob') return box(tag, input('dob', 'Date of birth', d.dob || p.dob, { type: 'date' }));
    if (id === 'about.employment') return box(tag, select('employment', EMPLOYMENT, d.employment || p.employmentStatus, 'Employment'));
    if (id === 'about.relationship') return box(tag, select('relationship', RELATIONSHIP, d.relationship || p.relationshipStatus, 'Relationship'));
    if (id === 'about.dependants') {
      var dep = d.dependants || p.dependants || {};
      return box(tag, '<p class="su-q">Children or other dependants</p>' + chips('dep.count', DEPENDANTS, dep.count) +
        '<div class="su-dep-ages"' + (dep.count && dep.count !== 'none' ? '' : ' hidden') + '>' + input('dep.ages', 'Their ages', dep.ages, { placeholder: 'For example 4 and 7' }) + '</div>' +
        input('dep.others', 'Anyone else who relies on you for money?', dep.others, { optional: true, placeholder: 'For example a parent you help out' }));
    }
    if (id === 'moneyin.takehome') {
      return box(tag, '<p class="su-q">Your take-home pay</p><p class="su-help">After tax and pension, as it lands in your account.</p>' +
        '<div class="su-two">' + input('takehome.amount', 'Amount £', d.takehomeAmount, { inputmode: 'decimal', mono: true, placeholder: '0' }) +
        '<label class="su-lab">How often<select class="su-in" data-f="takehome.freq">' +
        [['monthly', 'A month'], ['fourweekly', 'Every 4 weeks'], ['weekly', 'A week'], ['annual', 'A year']].map(function (o) {
          return '<option value="' + o[0] + '"' + ((d.takehomeFreq || 'monthly') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></label></div>');
    }
    if (id.indexOf('moneyout.tag.') === 0) {
      var eid = id.slice('moneyout.tag.'.length);
      var line = allExpenses(c).filter(function (x) { return String(x.e.id) === eid; })[0];
      if (!line) return '';
      var cur = (d.tags || {})[eid] || '';
      return '<div class="su-line"><span><b>' + esc(line.e.label || 'Spending line') + '</b><small>' + esc(gbp(line.e.amount)) + ' a month</small></span>' +
        chips('tag.' + eid, [['essential', 'Essential'], ['lifestyle', 'Lifestyle']], cur) + '</div>';
    }
    if (id === 'accounts.statePension') {
      var sp = d.statePension || (c.pensions && c.pensions.statePension) || {};
      return box(tag, '<p class="su-q">Your State Pension forecast</p>' +
        '<p class="su-help">Check it free on the government <a href="https://www.gov.uk/check-state-pension" target="_blank" rel="noopener noreferrer">Check your State Pension forecast</a> service. It takes about five minutes.</p>' +
        '<div class="su-two">' + input('sp.weekly', 'Weekly amount £', sp.weekly, { inputmode: 'decimal', mono: true, placeholder: '0.00' }) +
        input('sp.age', 'From age', sp.age, { inputmode: 'numeric', mono: true, placeholder: '68' }) + '</div>' +
        '<label class="su-check"><input type="checkbox" data-f="sp.not"' + (sp.notChecked ? ' checked' : '') + '>I have not checked it yet</label>');
    }
    if (id.indexOf('protection.') === 0) {
      var k = id.slice('protection.'.length);
      var nm = PROTECTION.filter(function (x) { return x[0] === k; })[0];
      var v = (d.protection || {})[k] || (c.protection || {})[k];
      return '<div class="su-line"><span><b>' + esc(nm ? nm[1] : k) + '</b></span>' + chips('prot.' + k, YNU, v) + '</div>';
    }
    if (id === 'plan.retire') return box(tag, input('plan.retire', 'At what age would you like work to become optional?', d.retire, { inputmode: 'numeric', mono: true, placeholder: '60' }));
    if (id === 'plan.spend') return box(tag, input('plan.spend', 'Roughly what would you spend each year once you stop? £', d.spend, { inputmode: 'numeric', mono: true, placeholder: '30000' }) + "<p class=\"su-help\">In today's money. A rough figure is fine; your coach refines it with you.</p>");
    if (id === 'plan.safety') {
      return box(tag, '<p class="su-q">How many months of spending would you like to keep in cash?</p>' + chips('plan.safety', ['3', '4', '6', '9', '12'], d.safety) + '<p class="su-help">The TEI default is 6.</p>');
    }
    if (it.kind === 'question') {
      var saved = ((request(c) || {}).answers || {})[it.qid];
      return box(tag, textarea('q.' + it.qid, it.label, (d.answers || {})[it.qid] != null ? d.answers[it.qid] : saved, { placeholder: 'A sentence or two is plenty' }));
    }
    return '';
  }

  /* The protection and money-out items render as rows inside one tile. */
  function groupedHTML(c, items, d, mode) {
    var rows = items.filter(function (it) { return it.id.indexOf('protection.') === 0 || it.id.indexOf('moneyout.tag.') === 0; });
    var rest = items.filter(function (it) { return rows.indexOf(it) < 0; });
    var html = rest.map(function (it) { return fieldHTML(c, it, d, mode); }).join('');
    if (rows.length) html += '<div class="su-rows">' + rows.map(function (it) { return fieldHTML(c, it, d, mode); }).join('') + '</div>';
    return html;
  }

  function youHTML(c, d) {
    var pr = Object.assign({}, c.profile || {}, d.profile || {});
    var risk = (d.profile && d.profile.risk) || riskFromStore(c.personal && c.personal.riskProfile);
    return '<div class="su-card"><p class="su-k">What matters to you</p>' +
      ATTITUDES.map(function (a) { return textarea('pf.' + a[0], a[1], pr[a[0]], { optional: a[3], placeholder: a[2] }); }).join('') + '</div>' +
      '<div class="su-card"><p class="su-k">Your investing</p>' +
      PROFILE_Q.map(function (q) {
        var v = q[0] === 'risk' ? risk : pr[q[0]];
        return '<fieldset class="su-fs"><legend>' + esc(q[1]) + '</legend>' + chips('pf.' + q[0], q[2], v) + '</fieldset>';
      }).join('') + '<p class="su-note">' + esc(PROFILE_NOTE) + '</p></div>';
  }

  /* ---------------- reading answers out of the form ---------------- */
  function readInto(root, d) {
    function val(f) { var el = root.querySelector('[data-f="' + f + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : undefined; }
    function chip(n) { var g = root.querySelector('[data-chips="' + n + '"] [aria-pressed="true"]'); return g ? g.getAttribute('data-v') : undefined; }
    var v;
    if ((v = val('dob')) !== undefined) d.dob = v;
    if ((v = val('employment')) !== undefined) d.employment = v;
    if ((v = val('relationship')) !== undefined) d.relationship = v;
    if (root.querySelector('[data-chips="dep.count"]')) {
      d.dependants = { count: chip('dep.count') || '', ages: val('dep.ages') || '', others: val('dep.others') || '' };
    }
    if ((v = val('takehome.amount')) !== undefined) { d.takehomeAmount = v; d.takehomeFreq = val('takehome.freq'); }
    Array.prototype.forEach.call(root.querySelectorAll('[data-chips^="tag."]'), function (g) {
      var on = g.querySelector('[aria-pressed="true"]');
      d.tags = d.tags || {};
      if (on) d.tags[g.getAttribute('data-chips').slice(4)] = on.getAttribute('data-v');
    });
    if (root.querySelector('[data-f="sp.weekly"]')) {
      d.statePension = { weekly: val('sp.weekly'), age: val('sp.age'), notChecked: !!val('sp.not') };
    }
    Array.prototype.forEach.call(root.querySelectorAll('[data-chips^="prot."]'), function (g) {
      var on = g.querySelector('[aria-pressed="true"]');
      d.protection = d.protection || {};
      if (on) d.protection[g.getAttribute('data-chips').slice(5)] = on.getAttribute('data-v');
    });
    if ((v = val('plan.retire')) !== undefined) d.retire = v;
    if ((v = val('plan.spend')) !== undefined) d.spend = v;
    if ((v = chip('plan.safety')) !== undefined) d.safety = v;
    Array.prototype.forEach.call(root.querySelectorAll('[data-f^="q."]'), function (el) {
      d.answers = d.answers || {};
      d.answers[el.getAttribute('data-f').slice(2)] = el.value.trim();
    });
    if (root.querySelector('[data-f^="pf."], [data-chips^="pf."]')) {
      d.profile = d.profile || {};
      ATTITUDES.forEach(function (a) { var x = val('pf.' + a[0]); if (x !== undefined) d.profile[a[0]] = x; });
      PROFILE_Q.forEach(function (q) { var x = chip('pf.' + q[0]); if (x !== undefined) d.profile[q[0]] = x; });
    }
    return d;
  }

  function wireChips(root) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('.su-chip'); if (!b) return;
      var g = b.parentNode;
      Array.prototype.forEach.call(g.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      if (g.getAttribute('data-chips') === 'dep.count') {
        var ages = root.querySelector('.su-dep-ages');
        if (ages) ages.hidden = b.getAttribute('data-v') === 'none';
      }
    });
  }

  /* ---------------- saving ---------------- */
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isFinite(n) && String(v).trim() !== '' ? n : null; }

  /* Writes whatever the draft holds for the given items, then returns the
     list of field names newly answered (for the coach's "new" highlights). */
  async function saveDraft(c, items, d, opts) {
    opts = opts || {};
    var W = TEI.wealthOS, id = c.meta.clientId, fields = {}, fresh = [];
    var ids = {}; items.forEach(function (it) { ids[it.id] = it; });
    var p = c.personal;
    if (ids['about.dob'] && d.dob) { fields.dob = d.dob; p.dob = d.dob; fresh.push('dob'); }
    if (ids['about.employment'] && d.employment) { fields.employment_status = d.employment; p.employmentStatus = d.employment; fresh.push('employment'); }
    if (ids['about.relationship'] && d.relationship) { fields.relationship_status = d.relationship; p.relationshipStatus = d.relationship; fresh.push('relationship'); }
    if ((ids['about.dependants'] || opts.all) && d.dependants && d.dependants.count) {
      fields.dependants = d.dependants; p.dependants = d.dependants; fresh.push('dependants');
    }
    if ((ids['accounts.statePension'] || opts.all) && d.statePension && (d.statePension.notChecked || num(d.statePension.weekly) != null)) {
      var sp = d.statePension.notChecked ? { notChecked: true } : { weekly: num(d.statePension.weekly), age: num(d.statePension.age) };
      fields.state_pension = sp; c.pensions = c.pensions || {}; c.pensions.statePension = sp; fresh.push('statePension');
    }
    if (d.protection && Object.keys(d.protection).length) {
      var prot = Object.assign({}, c.protection || {}, d.protection);
      fields.protection = prot; c.protection = prot; fresh.push('protection');
    }
    if (d.profile && Object.keys(d.profile).length) {
      var pf = Object.assign({}, c.profile || {}, d.profile);
      var risk = pf.risk; delete pf.risk;
      fields.investor_profile = pf; c.profile = pf; fresh.push('profile');
      if (risk) { fields.risk_profile = riskToStore(risk); p.riskProfile = fields.risk_profile; }
    }
    if (Object.keys(fields).length) await W.saveSetupFields(id, fields);

    // Money in: one take-home line.
    if (ids['moneyin.takehome'] && num(d.takehomeAmount)) {
      var inc = { owner: 'client', type: 'Salary', amount: num(d.takehomeAmount), frequency: d.takehomeFreq || 'monthly', lastEditedBy: 'client', lastEditedAt: nowIso() };
      inc.id = await W.saveIncome(id, null, inc);
      c.cashflow.income.push(inc); fresh.push('income');
    }
    // Money out: Essential or Lifestyle tags.
    var tags = d.tags || {};
    var tagJobs = allExpenses(c).filter(function (x) { return tags[x.e.id] && ids['moneyout.tag.' + x.e.id]; }).map(function (x) {
      x.e.category = tags[x.e.id]; x.e.hasSpendCategory = true;
      return W.saveExpense(id, x.e.id, x.e, x.kind);
    });
    if (tagJobs.length) { await Promise.all(tagJobs); fresh.push('spending tags'); }
    // Your plan.
    var pref = c.preferences, planTouched = false;
    if (ids['plan.retire'] && num(d.retire)) { pref.retirementAge = num(d.retire); planTouched = true; }
    if (ids['plan.spend'] && num(d.spend)) { pref.yearlySpending = num(d.spend); planTouched = true; }
    if (ids['plan.safety'] && num(d.safety)) { pref.safetyNetMonths = num(d.safety); planTouched = true; }
    if (planTouched) { await W.saveCashflowSettings(id, c); fresh.push('plan'); }
    return fresh;
  }

  async function saveRequest(c, patch, preview) {
    var req = Object.assign({}, c.setupRequest || {}, patch);
    c.setupRequest = req;
    if (!preview) await TEI.wealthOS.saveSetupFields(c.meta.clientId, { setup_request: req });
    return req;
  }

  /* ================= Client wizard ================= */
  var W = { c: null, steps: [], i: 0, d: {}, preview: false, fromOpen: false, busy: false };

  function buildSteps(c) {
    var items = itemsFor(c);
    if (!items.length) return profileAnswered(c) < PROFILE_Q.length ? ['welcome', 'you', 'review', 'done'] : ['confirm'];
    var secs = SECTIONS.map(function (s) { return s.id; }).filter(function (s) {
      return s !== 'you' && items.some(function (it) { return it.section === s; });
    });
    return ['welcome'].concat(secs, ['you', 'review', 'done']);
  }
  function stepItems(sec) { return itemsFor(W.c).filter(function (it) { return it.section === sec; }); }

  function shellTheme() {
    var app = $('clientApp');
    return app && app.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  /* Without a coach request the client can still run it themselves from
     "Continue setup" (Home), Me or Settings > Help: every empty field, no
     coach questions. It is saved as a request of their own as they go. */
  /* Shown until there is nothing left: any empty field, or the You and
     investing answers not given yet. Not tied to the old onboarding flag,
     which most existing clients already have set. */
  function canSelfServe(c) {
    return !!(c && c.meta.role === 'client' && !isActive(c) && leftToDo(c) > 0);
  }
  function leftToDo(c) {
    if (!c) return 0;
    if (isActive(c)) return Math.max(leftCount(c), 1);
    return gapsFor(c).length + (profileAnswered(c) < PROFILE_Q.length ? 1 : 0);
  }

  function open(opts) {
    opts = opts || {};
    var c = opts.client || (TEI.app && TEI.app.state && TEI.app.state.client);
    if (!c) return;
    if (!opts.preview && !isActive(c)) {
      c.setupRequest = { status: 'in_progress', self: true, off: {}, questions: [], answers: {}, startedAt: nowIso(), total: gapsFor(c).length };
    }
    W.c = c; W.preview = !!opts.preview; W.d = {}; W.fromOpen = false; W.askedBy = {};
    W.steps = buildSteps(c);
    var req = request(c) || {};
    W.total = Math.max(req.total || 0, itemsFor(c).length);
    var at = W.steps.indexOf(req.step);
    W.i = opts.step ? Math.max(0, W.steps.indexOf(opts.step)) : (at > 0 && !W.preview ? at : 0);
    var root = $('setupApp');
    root.setAttribute('data-theme', shellTheme());
    root.hidden = false;
    document.documentElement.classList.add('su-open');
    render();
    root.scrollTop = 0;
  }
  function close() {
    var root = $('setupApp');
    if (!root) return;
    root.hidden = true;
    document.documentElement.classList.remove('su-open');
    if (TEI.app && TEI.app.rerenderCurrentPage) TEI.app.rerenderCurrentPage();
    if (TEI.render && TEI.render.sideSetup && W.c) TEI.render.sideSetup(W.c);
  }
  function later() {
    try { sessionStorage.setItem('tei-setup-later', '1'); } catch (e) {}
    close();
  }

  function railHTML() {
    var c = W.c, req = request(c) || {}, answers = req.answers || {};
    var total = W.total, left = leftCount(c);
    var pct = total ? Math.round((total - left) / total * 100) : 100;
    var list = W.steps.filter(function (s) { return s !== 'welcome' && s !== 'done' && s !== 'confirm'; });
    return '<aside class="su-rail" aria-label="Steps"><span class="su-orbit" aria-hidden="true"></span>' +
      '<div><p class="su-mono su-champ">' + ((request(c) || {}).self ? 'Still to set up' : 'Filled in by your coach') + '</p><p class="su-rail-n">' + left + ' of ' + total + ' left</p>' +
      '<div class="su-bar su-bar--dark"><span style="width:' + pct + '%"></span></div></div>' +
      '<nav class="su-steps">' + list.map(function (s) {
        var idx = W.steps.indexOf(s), cur = idx === W.i, done = idx < W.i;
        var n = s === 'you' ? 'All' : (s === 'review' ? '' : String(stepItems(s).filter(function (it) { return it.kind !== 'question' || !answers[it.qid]; }).length || ''));
        return '<button type="button" data-go="' + idx + '"' + (cur ? ' aria-current="step"' : '') + ' class="' + (cur ? 'cur' : '') + (done ? ' done' : '') + '">' +
          '<span class="su-dot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></span><span class="su-sl">' + esc(s === 'review' ? 'Review' : sectionName(s)) + '</span>' +
          '<span class="su-mono su-sn">' + (done ? '' : esc(n)) + '</span></button>';
      }).join('') + '</nav>' +
      '<p class="su-rail-foot">Only the things we did not get in your session are here. Everything saves as you go.</p></aside>';
  }

  function pictureHTML() {
    var c = W.c, C = TEI.calc;
    var nw = C.latestNetWorth ? C.latestNetWorth(c) : 0;
    var inc = C.totalMonthlyIncome ? C.totalMonthlyIncome(c) : 0;
    var out = (C.totalFixedExpenses ? C.totalFixedExpenses(c) : 0) + (C.totalVariableExpenses ? C.totalVariableExpenses(c) : 0);
    var rows = [['Money in', gbp(inc) + '/mo'], ['Money out', gbp(out) + '/mo'], ['Left over each month', gbp(inc - out)], ['Accounts', String((c.accounts || []).length)], ['Goals', String((c.goals || []).length)]];
    return '<aside class="su-side" aria-label="Your picture so far"><div class="su-card su-pic"><p class="su-k">Your picture so far</p><p class="su-pic-n">' + esc(gbp(nw)) + '</p><p class="su-help">Net worth</p>' +
      '<div class="su-pic-rows">' + rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>' +
      '<p class="su-help">From your fact find session.</p></div></aside>';
  }

  function fromHTML(sec) {
    var rows = fromRows(W.c, sec);
    if (!rows.length) return '';
    var line = rows.length + (rows.length === 1 ? ' thing' : ' things') + ' already in your Wealth OS';
    return '<section class="su-from">' +
      '<button type="button" class="su-from-h" aria-expanded="' + (W.fromOpen ? 'true' : 'false') + '" data-act="from"><span class="su-tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></span>' +
      '<span class="su-grow"><b>From your session</b><small>' + esc(line) + '</small></span><svg class="su-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (W.fromOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6') + '"/></svg></button>' +
      (W.fromOpen ? '<div class="su-from-b">' + rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>'; }).join('') +
        '<p class="su-help">Something not right? You can change these in Settings once setup is done.</p></div>' : '') +
      '</section>';
  }

  var STEP_TITLES = {
    about: 'A little more about you.', moneyin: 'What comes in.', moneyout: 'A few lines to tag.', accounts: 'Accounts and pensions.',
    property: 'Property and debts.', protection: 'Do you have any of these?', goals: 'Your goals.', plan: 'Your plan.', documents: 'Documents.'
  };
  var STEP_INTROS = {
    moneyout: 'Essentials are the costs you cannot easily cut. Lifestyle is what you choose to spend on.',
    protection: 'Just yes or no, so the picture is complete. We do not comment on cover.',
    plan: 'Rough figures are fine. Your coach works these through with you.'
  };

  /* Light or dark, chosen once here (B1.5). Clicks go to TEI.theme via the
     document-wide [data-w-theme] handler in Wealth OS, which saves it. */
  function appearanceHTML() {
    var pref = window.TeiTheme ? window.TeiTheme.pref() : 'system';
    return '<div class="su-card"><p class="su-k">How should Wealth OS look?</p>' +
      '<div class="su-chips" role="group" aria-label="Theme">' +
      [['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" class="su-chip" data-w-theme="' + o[0] + '" aria-pressed="' + (pref === o[0] ? 'true' : 'false') + '">' + o[1] + '</button>';
      }).join('') + '</div><p class="su-help">You can change this any time in Settings.</p></div>';
  }

  function stepHTML() {
    var c = W.c, key = W.steps[W.i], first = (c.personal && c.personal.firstName) || '';
    var total = leftCount(c);
    if (key === 'welcome') {
      var mins = Math.max(5, Math.round(total * 0.8 + 4));
      return '<section class="su-hero"><span class="su-orbit" aria-hidden="true"></span><p class="su-mono su-champ">Welcome' + (first ? ', ' + esc(first) : '') + '</p>' +
        ((request(c) || {}).self
          ? '<h1>Let us finish setting up your Wealth OS.</h1><p>There ' + (total === 1 ? 'is 1 thing' : 'are ' + total + ' things') + ' still missing, plus a few questions about you and investing that are best in your own words.</p></section>'
          : '<h1>Your coach has done most of this already.</h1><p>We filled in your Wealth OS from your fact find session. There ' + (total === 1 ? 'is 1 thing' : 'are ' + total + ' things') + ' left, plus a few questions about you and investing that are best in your own words.</p></section>') +
        '<div class="su-three"><div class="su-card"><p class="su-k">Time</p><p class="su-big">About ' + mins + ' minutes</p></div>' +
        '<div class="su-card"><p class="su-k">Gaps</p><p class="su-big">Skip anything you do not know</p></div>' +
        '<div class="su-card"><p class="su-k">Changes</p><p class="su-big">Edit anything later in Settings</p></div></div>' +
        appearanceHTML();
    }
    if (key === 'confirm') {
      var rows = SECTIONS.filter(function (s) { return s.id !== 'you' && s.id !== 'documents'; }).map(function (s) {
        var r = fromRows(c, s.id);
        return r.length ? '<div><b>' + esc(s.name) + '</b><span>' + esc(r.slice(0, 3).map(function (x) { return x[1] ? x[0] + ' ' + x[1] : x[0]; }).join(' · ')) + (r.length > 3 ? ' and more' : '') + '</span></div>' : '';
      }).join('');
      return '<section class="su-hero"><span class="su-orbit" aria-hidden="true"></span><p class="su-mono su-champ">Welcome' + (first ? ', ' + esc(first) : '') + '</p>' +
        '<h1>Here is what we have from your session.</h1><p>Nothing is missing. Have a look, then head into Wealth OS.</p></section>' +
        '<div class="su-card su-confirm">' + rows + '</div><p class="su-help">Something not right? Change it in Settings, or tell your coach.</p>';
    }
    if (key === 'you') {
      return '<div><p class="su-mono su-gold">You and investing</p><h1 class="su-h1">In your own words.</h1><p class="su-intro">There are no right answers. This helps your coach understand you, and you can change it any time in Settings.</p></div>' + youHTML(c, W.d);
    }
    if (key === 'review') {
      var req = request(c) || {}, answers = req.answers || {};
      var secs = W.steps.filter(function (s) { return s !== 'welcome' && s !== 'review' && s !== 'done'; });
      return '<div><p class="su-mono su-gold">Review</p><h1 class="su-h1">Nearly there.</h1><p class="su-intro">Anything you skipped, your coach can pick up with you.</p></div>' +
        '<div class="su-card su-review">' + secs.map(function (s) {
          var status, sum;
          if (s === 'you') {
            var n = profileAnswered(c);
            status = n >= PROFILE_Q.length ? 'Done' : (n ? 'Partly done' : 'Skipped');
            sum = n + ' of ' + PROFILE_Q.length + ' questions answered';
          } else {
            var its = stepItems(s), open_ = its.filter(function (it) { return it.kind !== 'question' || !answers[it.qid]; }).length;
            var asked = (W.askedBy && W.askedBy[s]) || its.length;
            status = open_ === 0 ? 'Done' : (open_ < asked ? 'Partly done' : 'Skipped');
            sum = open_ === 0 ? 'All answered' : open_ + ' still to answer';
          }
          return '<div class="su-rv"><span class="su-grow"><b>' + esc(sectionName(s)) + '</b><small>' + esc(sum) + '</small></span>' +
            '<span class="su-st' + (status === 'Done' ? ' ok' : '') + '">' + status + '</span><button type="button" class="su-link" data-go="' + W.steps.indexOf(s) + '" aria-label="Edit ' + esc(sectionName(s)) + '">Edit</button></div>';
        }).join('') + '</div>';
    }
    if (key === 'done') {
      return '<section class="su-hero su-done"><span class="su-orbit" aria-hidden="true"></span><span class="su-done-tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></span>' +
        '<h1>Thank you' + (first ? ', ' + esc(first) : '') + '. You are all set.</h1><p>Your answers are saved to Wealth OS. You can change any of them in Settings.</p></section>' +
        '<div class="su-card"><p class="su-k">What happens next</p><ol class="su-ol"><li>We let your coach know you have finished.</li><li>Your coach reads your answers before your next setup session.</li><li>Together you build your Wealth Plan and Forecast.</li></ol></div>' +
        '<div class="su-actions"><button type="button" class="su-btn su-btn--primary" data-act="home">Open Wealth OS</button><a class="su-btn" href="/hub/index.html">Back to Client Hub</a></div>';
    }
    var items = stepItems(key);
    return '<div><p class="su-mono su-gold">' + esc(sectionName(key)) + '</p><h1 class="su-h1">' + esc(STEP_TITLES[key] || sectionName(key)) + '</h1>' +
      (STEP_INTROS[key] ? '<p class="su-intro">' + esc(STEP_INTROS[key]) + '</p>' : '') + '</div>' +
      groupedHTML(c, items, W.d, 'wizard');
  }

  function render() {
    var root = $('setupApp'), c = W.c, key = W.steps[W.i];
    var showSteps = ['welcome', 'done', 'confirm'].indexOf(key) < 0;
    var list = W.steps.filter(function (s) { return s !== 'welcome' && s !== 'done' && s !== 'confirm'; });
    var stepNo = list.indexOf(key) + 1;
    var total = W.total, left = leftCount(c);
    var pct = total ? Math.round((total - left) / total * 100) : 100;
    var nextLabel = key === 'welcome' ? 'Start' : (key === 'review' ? 'Finish' : 'Continue');
    var nav = key === 'done' ? '' : '<div class="su-nav">' +
      (showSteps && key !== 'review' ? '<button type="button" class="su-skip" data-act="skip">Skip for now</button>' : '<span></span>') +
      '<div class="su-nav-r">' + (W.i > 0 && key !== 'confirm' ? '<button type="button" class="su-btn" data-act="back">Back</button>' : '') +
      (key === 'confirm' ? '<button type="button" class="su-btn su-btn--primary" data-act="confirm">Looks right, open Wealth OS</button>'
        : '<button type="button" class="su-btn su-btn--primary" data-act="next">' + nextLabel + '</button>') + '</div></div>';

    root.innerHTML =
      '<header class="su-top"><span class="su-brand"><svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="11.5"/><circle cx="13" cy="13" r="6" opacity=".5"/><circle cx="13" cy="13" r="2.4" class="f"/></svg>Finish setting up' +
      (W.preview ? ' <span class="su-pv">Preview</span>' : '') + '</span>' +
      (key !== 'done' ? '<button type="button" class="su-later" data-act="later">' + (W.preview ? 'Close preview' : (key === 'confirm' ? 'Skip to Wealth OS' : 'Save and finish later')) + '</button>' : '') + '</header>' +
      (showSteps ? '<div class="su-mprog"><div><span>Step ' + stepNo + ' of ' + list.length + '</span><span>' + left + ' of ' + total + ' left</span></div><div class="su-bar"><span style="width:' + pct + '%"></span></div></div>' : '') +
      '<div class="su-body">' + (key !== 'confirm' ? railHTML() : '') +
      '<main class="su-main"><div class="su-stack" id="suStack">' + (showSteps && key !== 'you' && key !== 'review' ? fromHTML(key) : '') + stepHTML() + '</div>' +
      nav + '<p class="su-na">' + esc(NOT_ADVICE) + '</p></main>' +
      (showSteps ? pictureHTML() : '') + '</div>';
  }

  async function persistStep(nextIndex) {
    var key = W.steps[W.i], c = W.c, stack = $('suStack');
    if (stack) readInto(stack, W.d);
    var items = key === 'you' ? [] : stepItems(key);
    W.askedBy = W.askedBy || {};
    if (key !== 'you' && W.askedBy[key] == null) W.askedBy[key] = items.length;
    if (W.preview) return true; // a coach preview never writes
    try {
      await saveDraft(c, items, W.d);
      var req = request(c) || {};
      var patch = { step: W.steps[nextIndex] || key };
      if (W.d.answers) patch.answers = Object.assign({}, req.answers || {}, W.d.answers);
      if (req.status === 'sent') { patch.status = 'in_progress'; patch.startedAt = nowIso(); }
      if (request(c)) {
        c.setupRequest = Object.assign({}, req, patch);
        patch.left = leftCount(c);
        // Progress only; the answers above are already saved.
        await saveRequest(c, patch).catch(function (err) { console.warn('Set up Wealth OS: progress not saved', err); });
      }
      W.d = {}; // saved; the record now holds these values
    } catch (err) {
      console.error('Set up Wealth OS: could not save this step', err);
      if (TEI.app && TEI.app.showToast) TEI.app.showToast('Could not save. Check your connection and try again.');
      return false;
    }
    return true;
  }

  async function finish() {
    var c = W.c, W_ = TEI.wealthOS;
    if (!(await persistStep(W.steps.indexOf('done')))) return;
    if (W.preview) { W.i = W.steps.indexOf('done'); render(); return; }
    try {
      var left = leftCount(c);
      await saveRequest(c, { status: 'finished', finishedAt: nowIso(), left: left, step: 'done' }).catch(function (err) { console.warn('Set up Wealth OS: progress not saved', err); });
      if (!c.settings.onboardingComplete) { await W_.setOnboardingComplete(c.meta.clientId); c.settings.onboardingComplete = true; }
      // Let the coach know through the existing feedback alert route.
      var name = [c.personal.firstName, c.personal.lastName].filter(Boolean).join(' ') || 'A client';
      W_.saveFeedback(c.meta.clientId, 'general', 'setup', name + ' finished setting up Wealth OS. ' + (left ? left + ' left unanswered.' : 'Everything answered.'), 'client')
        .catch(function (err) { console.error('Set up Wealth OS: coach alert failed', err); });
    } catch (err) {
      console.error('Set up Wealth OS: could not finish', err);
      if (TEI.app && TEI.app.showToast) TEI.app.showToast('Could not save. Check your connection and try again.');
      return;
    }
    W.i = W.steps.indexOf('done');
    render();
  }

  function wireShell() {
    var root = $('setupApp');
    if (!root || root.dataset.wired) return;
    root.dataset.wired = '1';
    wireChips(root);
    root.addEventListener('click', async function (e) {
      var go = e.target.closest('[data-go]');
      var act = e.target.closest('[data-act]');
      if (W.busy) return;
      if (go) {
        var to = Number(go.getAttribute('data-go'));
        W.busy = true; var ok = await persistStep(to); W.busy = false;
        if (ok) { W.i = to; W.fromOpen = false; render(); root.scrollTop = 0; }
        return;
      }
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'from') { var st = $('suStack'); if (st) readInto(st, W.d); W.fromOpen = !W.fromOpen; render(); return; }
      if (a === 'later') {
        if (W.steps[W.i] === 'confirm' || W.preview) { close(); return; }
        W.busy = true; await persistStep(W.i); W.busy = false; later(); return;
      }
      if (a === 'home') { close(); if (TEI.app) TEI.app.showPage('home'); return; }
      if (a === 'confirm') {
        if (!W.preview && request(W.c)) {
          try { await saveRequest(W.c, { status: 'finished', finishedAt: nowIso(), left: 0 }); } catch (err) { console.error(err); }
        }
        close(); return;
      }
      if (a === 'back') { W.busy = true; var okb = await persistStep(W.i - 1); W.busy = false; if (okb) { W.i--; W.fromOpen = false; render(); root.scrollTop = 0; } return; }
      if (a === 'next' || a === 'skip') {
        if (W.steps[W.i] === 'review') { W.busy = true; act.disabled = true; await finish(); W.busy = false; root.scrollTop = 0; return; }
        W.busy = true; act.disabled = true;
        var okn = await persistStep(W.i + 1);
        W.busy = false;
        if (okn) { W.i++; W.fromOpen = false; render(); root.scrollTop = 0; } else act.disabled = false;
      }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !root.hidden && W.preview) close(); });
  }

  /* ================= Settings: "You and investing" (B13.3) ================= */
  function settingsRender(c) {
    var host = $('stYouHost');
    if (!host) return;
    var items = [{ id: 'about.dependants' }, { id: 'accounts.statePension' }];
    host.innerHTML =
      '<section class="hm-tile st-card su-settings"><h3 class="hm-h3">Family</h3>' + fieldHTML(c, items[0], {}, 'settings') + '</section>' +
      '<section class="hm-tile st-card su-settings"><h3 class="hm-h3">State Pension</h3>' + fieldHTML(c, items[1], {}, 'settings') + '</section>' +
      '<section class="hm-tile st-card su-settings"><h3 class="hm-h3">Protection</h3><p class="hm-muted hm-small">Recorded as fact only. We do not comment on cover.</p><div class="su-rows">' +
      PROTECTION.map(function (k) { return fieldHTML(c, { id: 'protection.' + k[0] }, {}, 'settings'); }).join('') + '</div></section>' +
      '<section class="su-settings su-settings-you">' + youHTML(c, {}) + '</section>' +
      '<button type="button" class="hm-btn hm-btn-primary" id="stYouSave">Save</button><p class="hm-note" id="stYouState" aria-live="polite"></p>';
    if (!host.dataset.wired) {
      host.dataset.wired = '1';
      wireChips(host);
      host.addEventListener('click', async function (e) {
        if (!e.target.closest('#stYouSave')) return;
        var cc = TEI.app.state.client, d = readInto(host, {});
        var btn = $('stYouSave'); btn.disabled = true;
        $('stYouState').textContent = 'Saving';
        try {
          await saveDraft(cc, [], d, { all: true });
          $('stYouState').textContent = 'Saved.';
        } catch (err) {
          console.error('Settings: You and investing save failed', err);
          $('stYouState').textContent = 'Could not save. Try again.';
        }
        btn.disabled = false;
      });
    }
  }

  /* ================= Coach view: Setup panel (B13.4) ================= */
  var coachDraft = null; // { off, questions } while the request is not sent yet

  function coachRender(c) {
    var host = $('advSetupHost');
    if (!host || !c) return;
    var req = request(c);
    var sent = !!(req && req.status);
    if (!coachDraft || coachDraft.clientId !== c.meta.clientId) {
      coachDraft = { clientId: c.meta.clientId, off: clone(req && req.off), questions: clone((req && req.questions) || []) };
    }
    var src = sent ? req : coachDraft;
    var gaps = gapsFor(c);
    var name = c.personal.firstName || 'the client';
    var bySec = SECTIONS.map(function (s) {
      var g = gaps.filter(function (x) { return x.section === s.id; });
      var q = (src.questions || []).filter(function (x) { return x.section === s.id; });
      var live = g.filter(function (x) { return !(src.off || {})[x.id]; }).length + q.length;
      var tag = s.id === 'you' ? 'Client answers' : (!g.length && !q.length ? 'Filled from notes' : live + ' to send');
      var summary = fromRows(c, s.id).slice(0, 3).map(function (r) { return r[1] ? r[0] + ' ' + r[1] : r[0]; }).join(' · ');
      return '<div class="card cs-sec"><div class="cs-head"><span class="cs-dot' + (g.length || q.length ? ' on' : '') + '"></span>' +
        '<span class="cs-grow"><b>' + esc(s.name) + '</b><small>' + esc(s.id === 'you' ? 'Always answered by ' + name : (summary || 'Nothing recorded yet')) + '</small></span><span class="tag-pill">' + esc(tag) + '</span></div>' +
        (g.length || q.length ? '<div class="cs-gaps">' + g.map(function (x) {
          var on = !(src.off || {})[x.id];
          return '<label class="cs-gap"><input type="checkbox" data-gap="' + esc(x.id) + '"' + (on ? ' checked' : '') + (sent ? ' disabled' : '') + '><span' + (on ? '' : ' class="cs-off"') + '>' + esc(x.label) + '</span><small>Field</small></label>';
        }).join('') + q.map(function (x) {
          var ans = req && req.answers && req.answers[x.id];
          return '<div class="cs-gap cs-q"><span>' + esc(x.text) + (ans ? '<em>' + esc(ans) + '</em>' : '') + '</span><small>Your question</small>' +
            (sent ? '' : '<button type="button" class="btn-ghost" data-rmq="' + esc(x.id) + '">Remove</button>') + '</div>';
        }).join('') + '</div>' : '') + '</div>';
    }).join('');

    var count = gaps.filter(function (x) { return !(src.off || {})[x.id]; }).length + (src.questions || []).length;
    var steps = SECTIONS.filter(function (s) {
      return s.id !== 'you' && (gaps.some(function (x) { return x.section === s.id && !(src.off || {})[x.id]; }) || (src.questions || []).some(function (x) { return x.section === s.id; }));
    }).length + 1;
    var mins = Math.max(5, Math.round(count * 0.8 + 4));
    var st = req ? req.status : '';
    var tl = [['Prefilled from notes', ''], ['Sent', req && req.sentAt], ['In progress', req && req.startedAt], ['Finished', req && req.finishedAt]];

    var answersHTML = '';
    if (st === 'finished' || st === 'in_progress') {
      var pr = c.profile || {};
      var lines = [];
      if (c.personal.dependants) lines.push(['Dependants', dependantsText(c.personal.dependants)]);
      if (c.pensions && c.pensions.statePension) lines.push(['State Pension', statePensionText(c.pensions.statePension)]);
      PROTECTION.forEach(function (k) { if ((c.protection || {})[k[0]]) lines.push([k[1], ynuText(c.protection[k[0]])]); });
      ATTITUDES.forEach(function (a) { if (pr[a[0]]) lines.push([a[1], pr[a[0]]]); });
      PROFILE_Q.forEach(function (q) { if (q[0] !== 'risk' && pr[q[0]]) lines.push([q[1], pr[q[0]]]); });
      if (c.personal.riskProfile) lines.push(['Risk word', riskFromStore(c.personal.riskProfile)]);
      answersHTML = '<div class="card cs-answers"><h3>Answers from ' + esc(name) + '</h3>' +
        (lines.length ? lines.map(function (l) { return '<div class="cs-ans"><span>' + esc(l[0]) + '</span><b>' + esc(l[1]) + '</b></div>'; }).join('') : '<p class="note">Nothing answered yet.</p>') +
        '<p class="note">' + esc(PROFILE_NOTE) + '</p></div>';
    }

    host.innerHTML =
      '<div class="cs-top"><div><p class="cs-k">Setup</p><p class="note" style="margin:4px 0 0;">Prefilled from your fact find notes. Pick what ' + esc(name) + ' still needs to answer, then send.</p></div>' +
      '<span class="tag-pill">' + esc(st === 'finished' ? 'Finished ' + dateText(req.finishedAt) : st === 'in_progress' ? 'In progress' : st === 'sent' ? 'Sent ' + dateText(req.sentAt) : 'Ready to send') + '</span></div>' +
      '<div class="cs-grid"><div class="cs-main">' + answersHTML + bySec + '</div>' +
      '<aside class="cs-side"><div class="card cs-send"><p class="cs-k">' + esc(name) + ' will see</p><p class="cs-n">' + count + '</p>' +
      '<p class="note">questions across ' + steps + ' steps, about ' + mins + ' minutes, plus You and investing</p>' +
      (sent ? '<button type="button" class="btn-ghost" id="csResend">Send again</button>' : '<button type="button" class="btn-primary" id="csSend">Send to ' + esc(name) + '</button>') +
      '<button type="button" class="btn-ghost" id="csPreview">Preview as ' + esc(name) + '</button></div>' +
      (sent ? '' : '<div class="card cs-add"><p class="cs-k">Add a question</p>' +
        '<label class="form-field"><span>Section</span><select id="csQSec">' + SECTIONS.filter(function (s) { return s.id !== 'you'; }).map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('') + '</select></label>' +
        '<label class="form-field"><span>Your question</span><input type="text" id="csQText" placeholder="Short question in plain English"></label>' +
        '<button type="button" class="btn-ghost" id="csQAdd">Add</button></div>') +
      '<div class="card"><p class="cs-k">Progress</p><ol class="cs-tl">' + tl.map(function (t, i) {
        var on = i === 0 || !!t[1];
        return '<li class="' + (on ? 'on' : '') + '"><span></span>' + esc(t[0]) + '<small>' + esc(dateText(t[1])) + '</small></li>';
      }).join('') + '</ol></div>' +
      '<div class="card"><p class="cs-k">Email ' + esc(name) + ' gets</p><p><b>A few things to finish your Wealth OS</b></p><p class="note">Thanks for your fact find session. We have filled in most of your Wealth OS. There are a few things left, about ' + mins + ' minutes. Sign in to finish.</p></div>' +
      '</aside></div>';
  }

  async function coachSend(resend) {
    var c = TEI.app.state.client;
    var req = request(c);
    var patch = resend ? { sentAt: nowIso() } : {
      status: 'sent', sentAt: nowIso(), off: coachDraft.off || {}, questions: coachDraft.questions || [], answers: {}, step: null, startedAt: null, finishedAt: null
    };
    try {
      c.setupRequest = Object.assign({}, req || {}, patch);
      c.setupRequest.left = leftCount(c);
      if (!resend) c.setupRequest.total = c.setupRequest.left;
      await TEI.wealthOS.saveSetupFields(c.meta.clientId, { setup_request: c.setupRequest });
    } catch (err) {
      console.error('Setup: could not save the request', err);
      TEI.app.showToast('Could not send. Has migration 013 been run?');
      return;
    }
    // Email (best effort): /api/setup-invite checks the coach is signed in.
    var mailed = false;
    try {
      var sess = await window.teiSupabase.auth.getSession();
      var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
      if (token) {
        var res = await fetch('/api/setup-invite', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ clientId: c.meta.clientId }) });
        mailed = res.ok;
      }
    } catch (err) { console.error('Setup: invite email failed', err); }
    TEI.app.showToast(mailed ? 'Sent. Email and Hub tile are on.' : 'Saved. The Hub tile is on; the email did not send.');
    coachRender(c);
  }

  function wireCoach() {
    var host = $('advSetupHost');
    if (!host || host.dataset.wired) return;
    host.dataset.wired = '1';
    host.addEventListener('change', function (e) {
      var cb = e.target.closest('[data-gap]'); if (!cb || !coachDraft) return;
      coachDraft.off = coachDraft.off || {};
      if (cb.checked) delete coachDraft.off[cb.getAttribute('data-gap')]; else coachDraft.off[cb.getAttribute('data-gap')] = true;
      coachRender(TEI.app.state.client);
    });
    host.addEventListener('click', function (e) {
      var c = TEI.app.state.client;
      if (e.target.closest('#csSend')) { e.target.disabled = true; coachSend(false); return; }
      if (e.target.closest('#csResend')) { e.target.disabled = true; coachSend(true); return; }
      if (e.target.closest('#csPreview')) {
        // Preview shows the draft list on a copy, and never saves.
        var real = c.setupRequest;
        var pv = (real && real.status) ? clone(real) : { off: clone(coachDraft.off), questions: clone(coachDraft.questions), answers: {} };
        open({ preview: true, client: Object.assign({}, c, { setupRequest: pv }) });
        return;
      }
      if (e.target.closest('#csQAdd')) {
        var t = $('csQText').value.trim(); if (!t) return;
        coachDraft.questions.push({ id: uid(), section: $('csQSec').value, text: t });
        coachRender(c);
        return;
      }
      var rm = e.target.closest('[data-rmq]');
      if (rm) {
        coachDraft.questions = coachDraft.questions.filter(function (q) { return q.id !== rm.getAttribute('data-rmq'); });
        coachRender(c);
      }
    });
  }

  /* ================= Home tile and auto-open ================= */
  /* Called from Home's renderSetup. Returns true when it took over the tile. */
  function homeTile(c, els) {
    if (!isActive(c)) {
      if (!canSelfServe(c)) return false;
      var n = leftToDo(c);
      els.show(true);
      els.title(n + (n === 1 ? ' thing' : ' things') + ' left to set up');
      els.text('A few details, then some questions about you and investing. Skip anything you do not know.');
      els.bar(20);
      els.button(function () { open(); });
      return true;
    }
    var left = leftCount(c);
    els.show(true);
    els.title(left ? left + (left === 1 ? ' thing' : ' things') + ' left from your session' : 'Nearly there');
    els.text('Your coach filled in most of this. ' + (left ? 'Answer what is left, plus a few questions about you and investing.' : 'A few questions about you and investing, then you are done.'));
    var total = Math.max((request(c) || {}).total || 0, itemsFor(c).length);
    els.bar(total ? Math.round((total - left) / total * 100) : 50);
    els.button(function () { open(); });
    return true;
  }

  /* Phones open the flow at sign-in until it is finished or put off (B13.5). */
  function maybeAutoOpen(c) {
    if (!c || c.meta.role !== 'client' || !isActive(c)) return;
    var later_ = false;
    try { later_ = sessionStorage.getItem('tei-setup-later') === '1'; } catch (e) {}
    if (later_ || !window.matchMedia('(max-width: 860px)').matches) return;
    open();
  }

  document.addEventListener('DOMContentLoaded', function () { wireShell(); wireCoach(); });

  TEI.setup = {
    open: open, close: close, gapsFor: gapsFor, itemsFor: itemsFor, leftCount: leftCount, isActive: isActive,
    homeTile: homeTile, canSelfServe: canSelfServe, leftToDo: leftToDo, maybeAutoOpen: maybeAutoOpen, coachRender: coachRender, settingsRender: settingsRender
  };
})();
