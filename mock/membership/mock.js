/* Membership mock-up (mock/membership). Review bar, hero motion, the plan
   line scene and the Wealth OS tabs. The HTML is the static end state:
   with JS off or reduced motion, everything shows at once. */
(function () {
  'use strict';
  var doc = document.documentElement, body = document.body;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var q = new URLSearchParams(location.search);
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Review bar. ?shot hides it; ?hero=b, ?view=member, ?notes=off
     set the state from the link, so a preview can be shared as is. ---- */
  if (q.has('shot')) doc.classList.add('mm-shot');
  var state = { hero: 'a', fit: 'a', view: 'visitor', notes: 'on' };
  ['hero', 'fit', 'view', 'notes'].forEach(function (k) { if (q.get(k)) state[k] = q.get(k); });

  var six = document.querySelector('.mm-six');
  function playHero() {
    if (!six) return;
    six.classList.remove('mm-go');
    void six.offsetWidth; // restart the animations
    six.classList.add('mm-go');
  }

  var opener = document.querySelector('.mm-rv-open');
  function apply(replay) {
    body.classList.toggle('mm-hero-a', state.hero === 'a');
    body.classList.toggle('mm-hero-b', state.hero === 'b');
    body.classList.toggle('mm-fit-a', state.fit === 'a');
    body.classList.toggle('mm-fit-b', state.fit === 'b');
    body.classList.toggle('mm-member', state.view === 'member');
    body.classList.toggle('mm-notes', state.notes === 'on');
    each(document.querySelectorAll('.mm-seg'), function (seg) {
      each(seg.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === state[seg.getAttribute('data-k')] ? 'true' : 'false'); });
    });
    if (opener) opener.querySelector('i').textContent = 'Hero ' + state.hero.toUpperCase() + ' · ' + (state.view === 'member' ? 'Member' : 'Visitor');
    if (replay) playHero();
  }
  each(document.querySelectorAll('.mm-seg'), function (seg) {
    var k = seg.getAttribute('data-k');
    if (k === 'fit') each(seg.querySelectorAll('button'), function (b) { b.disabled = true; b.title = 'Is it for you? is built in stage 3'; });
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled) return;
      state[k] = b.getAttribute('data-v');
      apply(k === 'hero');
      if (k === 'hero') window.scrollTo({ top: 0 });
    });
  });
  if (opener) opener.addEventListener('click', function () {
    var open = opener.getAttribute('aria-expanded') !== 'true';
    opener.setAttribute('aria-expanded', open ? 'true' : 'false');
    opener.parentNode.classList.toggle('is-open', open);
  });
  apply(false);

  /* ---- Hero: plays once on load. ---- */
  if (!still) playHero();

  /* ---- Plan line: one scene, once, when the card is 30% in view. ---- */
  var chart = document.querySelector('.mm-chart');
  if (chart && !still && 'IntersectionObserver' in window) {
    chart.classList.add('mm-arm');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { chart.classList.add('mm-in'); io.disconnect(); }
      });
    }, { threshold: 0.3 });
    io.observe(chart);
  }

  /* ---- Wealth OS tabs: both screens change at once, no animation. ---- */
  var tabs = document.querySelectorAll('.mm-tabs [role="tab"]');
  var panel = document.getElementById('wp');
  var cur = document.querySelector('.mm-wos-cur');
  function pick(i, focus) {
    var t = tabs[i], s = t.getAttribute('data-s');
    each(tabs, function (x) {
      var on = x === t;
      x.setAttribute('aria-selected', on ? 'true' : 'false');
      x.tabIndex = on ? 0 : -1;
    });
    each(panel.querySelectorAll('img'), function (img) { img.hidden = img.getAttribute('data-s') !== s; });
    panel.setAttribute('aria-labelledby', t.id);
    if (cur) cur.textContent = t.querySelector('span').textContent;
    if (focus) t.focus();
  }
  each(tabs, function (t, i) {
    t.addEventListener('click', function () { pick(i, false); });
    t.addEventListener('keydown', function (e) {
      var n = tabs.length, j = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % n;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + n) % n;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = n - 1;
      if (j !== null) { e.preventDefault(); pick(j, true); }
    });
  });
  // Fetch the other screens once the page has settled, so a tab never waits.
  window.addEventListener('load', function () {
    setTimeout(function () { each(panel.querySelectorAll('img[loading="lazy"]'), function (img) { img.loading = 'eager'; }); }, 1200);
  });
})();
