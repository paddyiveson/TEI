/* TEI motion patterns (article refresh, Oct 2026). Pairs with /assets/motion.css.
   Opt-in per page: <script src="/assets/motion.js" defer></script> before the
   page's own script. Lightweight: no libraries, one IntersectionObserver.

   Markup patterns
     data-m="scene"          figure that plays once it is 30% on screen: its
                             bars fill row by row, numbers count up, slices cut
     data-m="bar-fill"       an .m-bars group inside a scene (rows and segments
                             get their --r / --i order from here)
     data-m="count-up"       number element; data-to (value), data-format
                             ("gbp" default, or "int"), data-suffix
     data-m="slice-cut"      bar segment that is cut away after its bar fills
     data-m="toggle-result"  figure whose page script calls TeiMotion.count,
                             TeiMotion.bar and TeiMotion.win as inputs change

   Reduced motion (or no IntersectionObserver): nothing is armed, so the
   markup's end state shows as written, and live updates jump straight to
   their new values.

   Page scripts use window.TeiMotion:
     count(el, value)          tween a number to a new value
     bar(seg, value)           set a segment's --v (CSS animates the width)
     win(container, side)      mark [data-side=side] as .is-win; pulse on a flip
     pounds(n)                 "£12,345" */
(function () {
  'use strict';

  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var each = function (sel, fn, root) { Array.prototype.forEach.call((root || document).querySelectorAll(sel), fn); };

  function pounds(n) { return '£' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function format(el, v) {
    var f = el.getAttribute('data-format') || 'gbp';
    var text = f === 'int' ? String(Math.round(v)) : f === 'pct' ? (Math.round(v * 10) / 10) + '%' : pounds(v);
    return text + (el.getAttribute('data-suffix') || '');
  }

  /* ---------- count-up ---------- */
  function count(el, to, from, delay) {
    to = Number(to);
    var start = from != null ? from : Number(el.getAttribute('data-now') || 0);
    el.setAttribute('data-to', to);
    el.setAttribute('data-now', to);
    if (calm || start === to) { el.textContent = format(el, to); return; }
    var dur = 700, t0 = null;
    if (el._raf) cancelAnimationFrame(el._raf);
    function step(t) {
      if (t0 == null) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(el, start + (to - start) * e);
      if (p < 1) el._raf = requestAnimationFrame(step);
    }
    var go = function () { el._raf = requestAnimationFrame(step); };
    if (delay) setTimeout(go, delay); else go();
  }

  /* ---------- bar-fill helpers ---------- */
  function bar(seg, v) { seg.style.setProperty('--v', v); }
  function order(scene) {
    each('.m-bars', function (group) {
      each('.m-row', function (row, r) {
        row.style.setProperty('--r', r);
        each('.m-bar i', function (seg, i) { seg.style.setProperty('--i', i); seg.style.setProperty('--r', r); }, row);
      }, group);
    }, scene);
    var rows = scene.querySelectorAll('.m-row').length;
    scene.style.setProperty('--m-after', (rows * 260 + 700) + 'ms');
  }

  /* ---------- toggle-result ---------- */
  function win(box, side) {
    each('[data-side]', function (tile) {
      var on = tile.getAttribute('data-side') === side;
      var was = tile.classList.contains('is-win');
      tile.classList.toggle('is-win', on);
      if (on && !was && !calm) { tile.classList.remove('is-flip'); void tile.offsetWidth; tile.classList.add('is-flip'); }
    }, box);
  }

  /* ---------- scenes ---------- */
  function play(scene) {
    scene.classList.add('m-on');
    each('[data-m="count-up"]', function (el) {
      var row = el.closest('.m-row');
      var delay = row ? Number(row.style.getPropertyValue('--r') || 0) * 260 + 150 : 900;
      count(el, el.getAttribute('data-to'), 0, delay);
    }, scene);
  }

  function init() {
    var scenes = document.querySelectorAll('[data-m="scene"]');
    each('[data-m="scene"]', order);
    // Numbers always start known, so live updates tween from the right place.
    each('[data-m="count-up"]', function (el) { el.setAttribute('data-now', el.getAttribute('data-to') || 0); });
    if (calm || !('IntersectionObserver' in window) || !scenes.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        play(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.3 });
    Array.prototype.forEach.call(scenes, function (s) {
      // A scene already past on load (deep link, refresh) shows its end state.
      if (s.getBoundingClientRect().bottom < 0) return;
      s.classList.add('m-armed');
      io.observe(s);
    });
  }

  window.TeiMotion = { calm: calm, count: count, bar: bar, win: win, pounds: pounds };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
