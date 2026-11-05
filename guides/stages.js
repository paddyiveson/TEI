/* Five Stages to the Seasoned Investor: the members' layer.

   The public page shows the five stages only. For a signed-in member, or a
   coach (Wealth OS profile role "adviser"), this script adds:
     - "Start here" before Stage 1 in the progression: the Investor Learning
       Commitment in the education platform;
     - under each stage, that stage's education modules with their lesson
       counts, linked to the module pages, and "x of N complete" where the
       member has a progress row; Stages 3 to 5 show "Lessons coming".
   Nothing members-only is in the page markup: module names, lesson counts and
   links come from the education content store (/hub/education/js/embedded-data.js,
   loaded only for members and coaches), and progress from the member's own
   education_progress row, read the same way the Client Hub home reads it.
   Members and coaches are detected as on the Cost of Waiting gate
   (/assets/lead-gate.js): TeiMembers.ready() from /assets/members.js, then
   the "adviser" profile role. No stage is suggested to the member (E4). */
(function () {
  'use strict';

  var MODULE = '/hub/education/module.html?module=';
  var LIBRARY = '/hub/knowledge/glossary.html';
  var STAGES = 5;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error(src)); };
      document.head.appendChild(s);
    });
  }

  // A coach is signed in to the Client Hub with the "adviser" profile role (as lead-gate.js).
  function coach() {
    if (!window.TeiAuth || !window.teiSupabase) return null;
    return window.TeiAuth.getUser().then(function (res) {
      var user = res && res.data ? res.data.user : (res && res.user) || res;
      if (!user || !user.id) return null;
      return window.teiSupabase.schema('wealth_os').from('profiles').select('role').eq('user_id', user.id).maybeSingle()
        .then(function (r) { return r && r.data && r.data.role === 'adviser' ? { role: 'coach', user: user } : null; });
    }).catch(function () { return null; });
  }

  function viewer() {
    if (!window.TeiMembers) return Promise.resolve(null);
    return window.TeiMembers.ready().then(function (who) { return who ? { role: 'member', user: who.user } : coach(); });
  }

  function content() {
    return window.TEI_DATA ? Promise.resolve(window.TEI_DATA)
      : loadScript('/hub/education/js/embedded-data.js').then(function () { return window.TEI_DATA; });
  }

  // The signed-in person's own lesson progress (the Client Hub home's query). Null if none.
  function progress(user) {
    if (!window.teiSupabase) return Promise.resolve(null);
    return window.teiSupabase.from('education_progress').select('completed_lessons, commitment_completed_at').eq('user_id', user.id).maybeSingle()
      .then(function (r) { return r && !r.error ? r.data : null; }, function () { return null; });
  }

  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
  var BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5z"/><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19v3H7.5"/></svg>';
  var LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function row(m, done) {
    var n = m.lessonSequence.length;
    var count = done ? m.lessonSequence.filter(function (id) { return done[id]; }).length : null;
    return '<li><a href="' + MODULE + encodeURIComponent(m.id) + '">' +
      '<span class="tc-edu-k">Module ' + esc(m.id) + '</span>' +
      '<b>' + esc(m.name) + '</b>' +
      '<span class="tc-edu-n">' + n + ' lesson' + (n === 1 ? '' : 's') + (count === null ? '' : ' &middot; <em>' + count + ' of ' + n + ' complete</em>') + '</span>' +
      ARROW + '</a></li>';
  }

  function render(who, data, prog) {
    var mods = (data && data.MODULES) || [];
    var commit = mods.filter(function (m) { return m.type === 'commitment'; })[0];
    var done = prog ? (prog.completed_lessons || {}) : null;
    var label = who.role === 'coach' ? 'Coach view' : 'Members';
    document.body.setAttribute('data-edu', who.role);

    // "Start here" before Stage 1 in the progression.
    var list = document.querySelector('.tc-journey-l');
    if (list && commit) {
      var li = document.createElement('li');
      li.className = 'is-start';
      li.innerHTML = '<a href="' + MODULE + encodeURIComponent(commit.id) + '"><span class="tc-journey-dot" aria-hidden="true"></span>' +
        '<span class="tc-journey-k">Start here</span><b>' + esc(commit.name) + '</b>' +
        '<span class="tc-journey-p">' + esc(commit.purpose) + (prog && prog.commitment_completed_at ? ' <em>Completed</em>' : '') + '</span></a>';
      list.insertBefore(li, list.firstChild);
      list.closest('.tc-journey').classList.add('has-start');
    }

    for (var s = 1; s <= STAGES; s++) {
      var part = document.querySelector('.tc-part[data-stage="' + s + '"]');
      if (!part) continue;
      var inStage = mods.filter(function (m) { return m.stage === s && m.lessonSequence && m.lessonSequence.length; });
      var items = '';
      if (s === 1 && commit) {
        items += '<li class="is-start"><a href="' + MODULE + encodeURIComponent(commit.id) + '"><span class="tc-edu-k">Start here</span><b>' + esc(commit.name) + '</b>' +
          '<span class="tc-edu-n">' + esc(commit.estimatedMinutes ? 'About ' + commit.estimatedMinutes + ' minutes' : 'A short reflection') +
          (prog ? ' &middot; <em>' + (prog.commitment_completed_at ? 'Completed' : 'Not started') + '</em>' : '') + '</span>' + ARROW + '</a></li>';
      }
      items += inStage.map(function (m) { return row(m, done); }).join('');
      if (!inStage.length) {
        items += '<li class="is-locked"><span class="tc-edu-lock">' + LOCK + '</span><span class="tc-edu-k">Stage ' + s + '</span><b>Lessons coming</b><span class="tc-edu-n">Locked</span></li>';
      }
      var box = document.createElement('section');
      box.className = 'tc-edu' + (inStage.length ? '' : ' is-soon');
      box.setAttribute('aria-label', 'Lessons for this stage in the Client Hub');
      box.innerHTML = '<div class="tc-edu-h">' + BOOK + '<b>' + (inStage.length ? 'Lessons for this stage' : 'Lessons for this stage are coming') + '</b><small>' + label + '</small></div>' +
        '<ul class="tc-edu-l' + ((inStage.length + (s === 1 && commit ? 1 : 0)) % 2 ? ' is-odd' : '') + '">' + items + '</ul>' +
        '<p class="tc-edu-foot"><a href="' + LIBRARY + '">Look up the key terms in the Knowledge Library</a></p>';
      var after = part.querySelector('.ar-split');
      if (after && after.nextSibling) part.insertBefore(box, after.nextSibling); else part.appendChild(box);
    }
  }

  viewer().then(function (who) {
    if (!who) return;
    return Promise.all([content(), progress(who.user)]).then(function (r) { render(who, r[0], r[1]); });
  }).catch(function () {});
})();
