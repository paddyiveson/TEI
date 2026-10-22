/* TEI motion patterns (article refresh, Oct 2026). Pairs with /assets/motion.css.
   Opt-in per page: <script src="/assets/motion.js" defer></script> before the
   page's own script. Lightweight: no libraries, one IntersectionObserver.

   Markup patterns
     data-m="scene"          figure that plays once it is 30% on screen: its
                             bars fill row by row, numbers count up, slices cut
     data-m="bar-fill"       an .m-bars group inside a scene (rows and segments
                             get their --r / --i order from here)
     data-m="count-up"       number element; data-to (value), data-format
                             ("gbp" default, "usd", "int" or "pct"), data-suffix
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
  function dollars(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function format(el, v) {
    var f = el.getAttribute('data-format') || 'gbp';
    var text = f === 'int' ? String(Math.round(v)) : f === 'pct' ? (Math.round(v * 10) / 10) + '%' : f === 'usd' ? dollars(v) : pounds(v);
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

  /* ---------- dot-field (A2) ----------
     dots(box, { n, lit, low, bands }) draws n dots on the box's <canvas>,
     left to right, top to bottom. lit: indexes shown gold, low: indexes shown
     rust, bands: indexes where a new band (e.g. a calendar year) starts, so
     the base shade alternates band by band. Redraws itself on resize and on
     a light/dark switch. */
  function token(el, name, fallback) {
    var v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }
  function dots(box, opts) {
    var cv = box.querySelector('canvas');
    if (!cv || !cv.getContext) return;
    box._dots = opts = opts || box._dots;
    var w = box.clientWidth;
    if (!w) return;
    var pitch = w < 560 ? 4.6 : 7;
    var cols = Math.max(20, Math.floor(w / pitch));
    pitch = w / cols;
    var rows = Math.ceil(opts.n / cols);
    var h = Math.ceil(rows * pitch);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    var base = token(box, '--c-s4', '#8C96A6'), gold = token(box, '--c-gold', '#83661C'), warn = token(box, '--c-warn', '#9A4A1F');
    var bands = opts.bands || [0], band = 0, b = 0;
    var r = pitch * 0.3;
    for (var i = 0; i < opts.n; i++) {
      if (b + 1 < bands.length && i >= bands[b + 1]) { b++; band = b % 2; }
      c.globalAlpha = band ? 0.66 : 0.3;
      c.fillStyle = base;
      c.beginPath(); c.arc((i % cols + 0.5) * pitch, (Math.floor(i / cols) + 0.5) * pitch, r, 0, 6.2832); c.fill();
    }
    function mark(list, colour) {
      c.globalAlpha = 1; c.fillStyle = colour;
      (list || []).forEach(function (i) {
        var x = (i % cols + 0.5) * pitch, y = (Math.floor(i / cols) + 0.5) * pitch;
        c.globalAlpha = 0.22; c.beginPath(); c.arc(x, y, pitch * 1.15, 0, 6.2832); c.fill();
        c.globalAlpha = 1; c.beginPath(); c.arc(x, y, pitch * 0.55, 0, 6.2832); c.fill();
      });
    }
    mark(opts.low, warn);
    mark(opts.lit, gold);
    if (!box._dotsWatch) {
      box._dotsWatch = true;
      var t;
      window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { dots(box); }, 120); });
      if (window.MutationObserver) new MutationObserver(function () { dots(box); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
  }

  /* ---------- line-draw (A2; reused by the Cost of Waiting tool) ----------
     line(chart, { max, ref, a }) sets the paths of an .m-chart from plain
     number series (evenly spaced in time). ref: the reference line, a: the
     line being compared (omit or null to show the reference alone). The
     shaded .m-gap is the area between them. The SVG viewBox is 1000 x 400. */
  var VW = 1000, VH = 400;
  function pts(series, max) {
    var last = series.length - 1, out = [];
    for (var i = 0; i <= last; i++) out.push([Math.round(i / last * VW), Math.round(VH - Math.min(series[i], max) / max * VH)]);
    return out;
  }
  function toPath(p) { return 'M' + p.map(function (q) { return q[0] + ' ' + q[1]; }).join('L'); }
  function line(chart, o) {
    var ref = pts(o.ref, o.max), refEl = chart.querySelector('.m-ref'), aEl = chart.querySelector('.m-line-a'), gapEl = chart.querySelector('.m-gap');
    if (refEl) refEl.setAttribute('d', toPath(ref));
    if (!o.a) {
      if (aEl) aEl.setAttribute('d', '');
      if (gapEl) gapEl.setAttribute('d', '');
      return;
    }
    var a = pts(o.a, o.max);
    if (aEl) aEl.setAttribute('d', toPath(a));
    if (gapEl) gapEl.setAttribute('d', toPath(ref) + 'L' + a.slice().reverse().map(function (q) { return q[0] + ' ' + q[1]; }).join('L') + 'Z');
  }

  window.TeiMotion = { calm: calm, count: count, bar: bar, win: win, pounds: pounds, dollars: dollars, dots: dots, line: line };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
