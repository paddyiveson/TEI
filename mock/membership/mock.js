/* Membership mock-up (mock/membership). The HTML is the static end state:
   with JS off or reduced motion, everything shows at once.
   Motion: the hero (one moment at the top), then three scenes further down,
   each once: the plan line, the community chat and the tier strip. */
(function () {
  'use strict';
  var doc = document.documentElement, body = document.body;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var q = new URLSearchParams(location.search);
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = window.matchMedia('(max-width: 860px)');

  /* Play a scene once, when 30% of it is on screen. */
  function onView(el, fn, threshold) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (en) {
      if (en.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { threshold: threshold || 0.3 });
    io.observe(el);
  }

  /* ---- Review bar. ?shot hides it; ?hero=b, ?fit=b, ?view=member and
     ?notes=off set the state from the link. ?rec is the chat recording. ---- */
  if (q.has('shot')) doc.classList.add('mm-shot');
  if (q.has('rec')) doc.classList.add('mm-rec', 'mm-shot');
  var state = { hero: 'a', fit: 'a', view: 'visitor', notes: 'on' };
  ['hero', 'fit', 'view', 'notes'].forEach(function (k) { if (q.get(k)) state[k] = q.get(k); });

  var six = $('.mm-six');
  function playHero() {
    if (!six) return;
    six.classList.remove('mm-go');
    void six.offsetWidth;
    six.classList.add('mm-go');
  }

  var opener = $('.mm-rv-open');
  function apply(replay) {
    body.classList.toggle('mm-hero-a', state.hero === 'a');
    body.classList.toggle('mm-hero-b', state.hero === 'b');
    body.classList.toggle('mm-fa', state.fit === 'a');
    body.classList.toggle('mm-fb', state.fit === 'b');
    body.classList.toggle('mm-member', state.view === 'member');
    body.classList.toggle('mm-notes', state.notes === 'on');
    each(document.querySelectorAll('.mm-seg'), function (seg) {
      each(seg.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === state[seg.getAttribute('data-k')] ? 'true' : 'false'); });
    });
    if (opener) opener.querySelector('i').textContent = 'Hero ' + state.hero.toUpperCase() + ' · Fit ' + state.fit.toUpperCase() + ' · ' + (state.view === 'member' ? 'Member' : 'Visitor');
    setTeaserLinks();
    if (replay) playHero();
  }
  each(document.querySelectorAll('.mm-seg'), function (seg) {
    var k = seg.getAttribute('data-k');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state[k] = b.getAttribute('data-v');
      apply(k === 'hero');
      if (k === 'hero') window.scrollTo({ top: 0 });
      if (k === 'fit') { var f = $('#fit'); if (f) f.scrollIntoView({ block: 'start' }); }
    });
  });
  if (opener) opener.addEventListener('click', function () {
    var open = opener.getAttribute('aria-expanded') !== 'true';
    opener.setAttribute('aria-expanded', open ? 'true' : 'false');
    opener.parentNode.classList.toggle('is-open', open);
  });

  /* ---- 05 Research: the three newest members' articles, live. Public
     tease image, category, date and read time only. Visitors go to the
     tiers (members sign in there); in the member view, to the article. ---- */
  var CAT = { 'Companies': 'Deep dive', 'Earnings review': 'Earnings review' };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function ukDate(iso) { var d = iso.split('-'); return Number(d[2]) + ' ' + MONTHS[Number(d[1]) - 1] + ' ' + d[0]; }
  function setTeaserLinks() {
    each(document.querySelectorAll('.mm-tease'), function (a) {
      a.href = state.view === 'member' ? '/hub/members/' + a.getAttribute('data-slug') + '.html' : '/membership.html#tiers';
      var lock = a.querySelector('.mm-lock');
      if (lock) lock.lastChild.textContent = state.view === 'member' ? 'In your membership' : 'Members only';
    });
  }
  var teasers = $('#mm-teasers');
  if (teasers && window.fetch) {
    fetch('/hub/members-articles.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (list) {
      if (!Array.isArray(list)) return;
      var top = list.filter(function (a) { return a && a.slug && a.date && a.images && a.images.tease && CAT[a.category]; })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 3);
      if (top.length < 3) return;
      teasers.innerHTML = top.map(function (a) {
        var kind = CAT[a.category];
        return '<a class="mm-tease" href="/membership.html#tiers" data-slug="' + encodeURIComponent(a.slug) + '">' +
          '<span class="mm-tease-img"><img src="' + a.images.tease + '" width="1600" height="900" loading="lazy" alt="A members\' ' + kind.toLowerCase() + ': the questions it answers are shown, the answers are blurred."></span>' +
          '<span class="mm-tease-meta"><span><span class="mm-tease-cat">' + kind + '</span><span class="mm-tease-d">' + ukDate(a.date) + (a.readTime ? ' · ' + Number(a.readTime) + ' min read' : '') + '</span></span>' +
          '<span class="mm-lock">' + LOCK + 'Members only</span></span></a>';
      }).join('');
      setTeaserLinks();
    }).catch(function () {});
  }

  apply(false);

  /* ---- 01 Hero: plays once on load. ---- */
  if (!still) playHero();

  /* ---- 02 Plan line: one scene, once in view. ---- */
  var chart = $('.mm-chart');
  if (chart && !still) {
    chart.classList.add('mm-arm');
    onView(chart, function () { chart.classList.add('mm-in'); });
  }

  /* ---- 03 Wealth OS tabs: both screens change at once, no animation;
     each screen goes back to its top. ---- */
  var tabs = document.querySelectorAll('.mm-tabs [role="tab"]');
  var panel = $('#wp');
  var cur = $('.mm-wos-cur');
  function pick(i, focus) {
    var t = tabs[i], s = t.getAttribute('data-s');
    each(tabs, function (x) { var on = x === t; x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
    each(panel.querySelectorAll('img[data-s]'), function (img) { img.hidden = img.getAttribute('data-s') !== s; });
    each(panel.querySelectorAll('.mm-scroll'), function (sc) { sc.scrollTop = 0; });
    panel.setAttribute('aria-labelledby', t.id);
    if (cur) cur.textContent = t.querySelector('span').textContent;
    if (focus) t.focus();
  }
  function arrows(list, i, e, go) {
    var n = list.length, j = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % n;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + n) % n;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = n - 1;
    if (j !== null) { e.preventDefault(); go(j, true); }
  }
  each(tabs, function (t, i) {
    t.addEventListener('click', function () { pick(i, false); });
    t.addEventListener('keydown', function (e) { arrows(tabs, i, e, pick); });
  });
  window.addEventListener('load', function () {
    setTimeout(function () { each(document.querySelectorAll('#wp img[loading="lazy"]'), function (img) { img.loading = 'eager'; }); }, 1500);
  });

  /* ---- 04 Learn: the library is open on desktop and folds on phones. ---- */
  var lib = $('.mm-lib');
  function libMode() { if (lib) lib.open = !phone.matches; }
  libMode();
  if (phone.addEventListener) phone.addEventListener('change', libMode);
  if (lib) lib.querySelector('summary').addEventListener('click', function (e) { if (!phone.matches) e.preventDefault(); });

  /* ---- 07 Community: the chat plays once in view, about 12 seconds:
     typing dots, then each message. Alex is the viewer, so no dots. ---- */
  var wa = $('.mm-wa');
  function playChat(done) {
    var msgs = wa.querySelectorAll('.mm-wa-m');
    var typing = $('.mm-wa-typing', wa), sub = $('.mm-wa-sub', wa);
    var group = sub.textContent, t = 400;
    wa.classList.add('is-arm');
    each(msgs, function (m) {
      var mine = m.getAttribute('data-who') === 'me';
      var name = mine ? '' : m.querySelector('b').textContent;
      if (!mine) {
        setTimeout(function () { typing.hidden = false; m.parentNode.insertBefore(typing, m); sub.textContent = name + ' is typing...'; }, t);
        t += 1100;
      } else t += 500;
      setTimeout(function () { typing.hidden = true; sub.textContent = group; m.classList.add('is-on'); }, t);
      t += 950;
    });
    setTimeout(function () { window.__chatDone = true; if (done) done(); }, t + 300);
  }
  if (wa && doc.classList.contains('mm-rec')) {
    // The recording page starts as soon as the window is ready; the
    // recorder waits for window.__chatReady to trim the start.
    wa.classList.add('is-arm');
    window.__chatReady = false;
    window.startChat = function () { window.__chatReady = true; playChat(); };
  } else if (wa && !still) {
    wa.classList.add('is-arm');
    onView(wa, function () { playChat(); }, 0.5);
  }

  /* ---- 08 Tiers: the year strips, the strip scene and the phone switch. ---- */
  var tiersBox = $('.mm-tiers');
  each(document.querySelectorAll('.mm-strip'), function (s) {
    var r = (s.getAttribute('data-r') || '').split(',').filter(Boolean).map(Number);
    var c = (s.getAttribute('data-c') || '').split(',').filter(Boolean).map(Number);
    var row = $('.mm-strip-row', s), html = '';
    for (var m = 0; m < 12; m++) html += '<i class="' + (r.indexOf(m) > -1 ? 'r' : (c.indexOf(m) > -1 ? 'c' : '')) + '" style="--m:' + m + '"></i>';
    row.innerHTML = html;
  });
  if (tiersBox && !still) {
    tiersBox.classList.add('mm-arm');
    onView(tiersBox, function () { tiersBox.classList.add('mm-in'); }, 0.4);
  }
  var tsw = document.querySelectorAll('.mm-tsw [role="tab"]');
  var tierCards = document.querySelectorAll('.mm-tier');
  function pickTier(i, focus) {
    each(tsw, function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); b.tabIndex = j === i ? 0 : -1; });
    each(tierCards, function (card, j) { card.classList.toggle('is-cur', j === i); });
    // The strip replays quickly (under 300ms) for the tier now shown.
    var strip = $('.mm-strip', tierCards[i]);
    if (!still && tiersBox.classList.contains('mm-in')) { strip.classList.remove('is-quick'); void strip.offsetWidth; strip.classList.add('is-quick'); }
    if (focus) tsw[i].focus();
  }
  each(tsw, function (b, i) {
    b.addEventListener('click', function () { pickTier(i, false); });
    b.addEventListener('keydown', function (e) { arrows(tsw, i, e, pickTier); });
  });

  /* ---- 09 Fit A, the quick check: never gated, nothing stored. ---- */
  var qc = $('.mm-qc');
  if (qc) {
    var res = $('.mm-qc-res', qc);
    var ans = [null, null, null];
    var groups = qc.querySelectorAll('.mm-yn');
    var hint = '<p>Answer all three to see where to start.</p>';
    res.innerHTML = hint;
    each(groups, function (g, i) {
      g.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        ans[i] = b.getAttribute('data-v') === '1';
        each(g.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        if (ans.indexOf(null) > -1) return;
        var yes = ans.filter(Boolean).length;
        res.innerHTML = yes >= 2
          ? '<p><b>Membership is built for this.</b> Start with a call.</p><a class="mm-lnk" href="/book" target="_blank" rel="noopener noreferrer">Book a call</a>'
          : '<p><b>Start with our free guides and tools first.</b></p><a class="mm-lnk" href="/guides.html">Guides &amp; Tools</a>';
      });
    });
  }
})();
