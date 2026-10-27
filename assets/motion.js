/* TEI motion patterns (article refresh, Oct 2026). Pairs with /assets/motion.css.
   Opt-in per page: <script src="/assets/motion.js" defer></script> before the
   page's own script. Lightweight: no libraries, one IntersectionObserver.

   Markup patterns
     data-m="scene"          figure that plays once it is 30% on screen: its
                             bars fill row by row, numbers count up, slices cut;
                             data-m-start="<selector>" plays it when that part
                             of it is 30% on screen instead (tall calculators)
     data-m="bar-fill"       an .m-bars group inside a scene (rows and segments
                             get their --r / --i order from here)
     data-m="count-up"       number element; data-to (value), data-format
                             ("gbp" default, "gbp2" with pence, "usd", "int"
                             or "pct"), data-suffix
     data-m="slice-cut"      bar segment that is cut away after its bar fills
     data-m="toggle-result"  figure whose page script calls TeiMotion.count,
                             TeiMotion.bar and TeiMotion.win as inputs change
     data-m="dot-field"      .m-dots box with a <canvas>; TeiMotion.dots draws
                             it, lit dots pop in when the scene plays (A2)
     data-m="line-draw"      .m-chart SVG; TeiMotion.line sets the series, the
                             lines wipe in when the scene plays, then morph
                             between series on later calls (A2)
     data-m="pair-link"      .m-strip SVG of daily moves; plays on its own
                             when it reaches the screen (CSS, A2)
     count-up extras         data-delay (ms after the scene plays) and
                             data-dur (ms) set the entrance timing only;
                             live updates always take 700ms

   Reduced motion (or no IntersectionObserver): nothing is armed, so the
   markup's end state shows as written, and live updates jump straight to
   their new values.

   Page scripts use window.TeiMotion:
     count(el, value)          tween a number to a new value
     bar(seg, value)           set a segment's --v (CSS animates the width)
     win(container, side)      mark [data-side=side] as .is-win; pulse on a flip
     dots(box, opts)           draw or update a dot-field
     line(chart, opts)         draw or update a line-draw chart
     pounds(n), pence(n)       "£12,345", "£19.24"
     dollars(n)                "$12,345" */
(function () {
  'use strict';

  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var each = function (sel, fn, root) { Array.prototype.forEach.call((root || document).querySelectorAll(sel), fn); };

  function pounds(n) { return '£' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function pence(n) { return '£' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function dollars(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function format(el, v) {
    var f = el.getAttribute('data-format') || 'gbp';
    var text = f === 'int' ? String(Math.round(v)) : f === 'pct' ? (Math.round(v * 10) / 10) + '%' : f === 'usd' ? dollars(v) : f === 'gbp2' ? pence(v) : pounds(v);
    return text + (el.getAttribute('data-suffix') || '');
  }

  /* ---------- count-up ---------- */
  function count(el, to, from, delay, dur) {
    to = Number(to);
    var start = from != null ? from : Number(el.getAttribute('data-now') || 0);
    el.setAttribute('data-to', to);
    el.setAttribute('data-now', to);
    if (calm || start === to) { el.textContent = format(el, to); return; }
    dur = dur || 700;
    var t0 = null;
    if (el._raf) cancelAnimationFrame(el._raf);
    function step(t) {
      if (t0 == null) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(el, start + (to - start) * e);
      if (p < 1) el._raf = requestAnimationFrame(step);
    }
    var go = function () { el._raf = requestAnimationFrame(step); };
    // A delayed count shows where it starts from while it waits, not its end value.
    if (delay) { el.textContent = format(el, start); setTimeout(go, delay); } else go();
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
    if (scene.classList.contains('m-on')) return;   // once only
    scene.classList.add('m-on');
    each('[data-m="count-up"]', function (el) {
      var row = el.closest('.m-row');
      var delay = el.hasAttribute('data-delay') ? Number(el.getAttribute('data-delay'))
        : row ? Number(row.style.getPropertyValue('--r') || 0) * 260 + 150 : 900;
      count(el, el.getAttribute('data-to'), 0, delay, Number(el.getAttribute('data-dur')) || 0);
    }, scene);
    // Canvas and SVG patterns in the scene play their own entrance.
    each('[data-m="line-draw"], [data-m="dot-field"]', function (el) { if (el._play) el._play(); }, scene);
  }

  function init() {
    var scenes = document.querySelectorAll('[data-m="scene"]');
    each('[data-m="scene"]', order);
    // Numbers always start known, so live updates tween from the right place.
    each('[data-m="count-up"]', function (el) { el.setAttribute('data-now', el.getAttribute('data-to') || 0); });
    if (calm || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        if (en.target.getAttribute('data-m') === 'pair-link') en.target.classList.add('m-on');
        else play(en.target._scene || en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.3 });
    // A scene with a start point also plays once the reader is below that
    // point without it ever being 30% on screen (a jump down the page).
    var waiting = [], ticking = false;
    function catchUp() {
      ticking = false;
      waiting = waiting.filter(function (s) {
        if (s.classList.contains('m-on')) return false;
        if (s._start.getBoundingClientRect().top < 0) { play(s); return false; }
        return true;
      });
      if (!waiting.length) window.removeEventListener('scroll', onScroll);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(catchUp); } }
    Array.prototype.forEach.call(scenes, function (s) {
      // A tall scene (a calculator: inputs above the chart) can wait for one
      // part of it instead: data-m-start="<selector inside the scene>".
      var from = s.getAttribute('data-m-start'), t = (from && s.querySelector(from)) || s;
      // A scene (or its start point) already past on load (deep link, refresh) shows its end state.
      if (s.getBoundingClientRect().bottom < 0 || t.getBoundingClientRect().bottom < 0) return;
      s.classList.add('m-armed');
      // Canvas and SVG patterns wait for the scene to play.
      each('[data-m="line-draw"], [data-m="dot-field"]', function (el) { el._armed = true; }, s);
      t._scene = s;
      io.observe(t);
      if (t !== s) { s._start = t; waiting.push(s); }
    });
    if (waiting.length) window.addEventListener('scroll', onScroll, { passive: true });
    // pair-link strips play on their own, as each one reaches the screen.
    each('[data-m="pair-link"]', function (strip) {
      if (strip.getBoundingClientRect().bottom < 0) return;
      strip.classList.add('m-armed');
      io.observe(strip);
    });
  }

  function ease(p) { return 1 - Math.pow(1 - p, 3); }
  function now() { return window.performance ? performance.now() : Date.now(); }

  /* ---------- dot-field (A2) ----------
     dots(box, { n, lit, low, bands }) draws n dots on the box's <canvas>,
     left to right, top to bottom. lit: indexes shown gold (in the order they
     should light up), low: indexes shown rust, bands: indexes where a new
     band (e.g. a calendar year) starts, so the base shade alternates band by
     band. Redraws itself on resize and on a light/dark switch.
     Motion: inside an armed scene the lit dots wait for the scene, then pop
     in one after another (best first). Later calls pop in only the dots that
     are new. Under reduced motion everything is drawn at once. */
  function token(el, name, fallback) {
    var v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }
  function dotsLayout(box) {
    var st = box._dots, cv = box.querySelector('canvas'), w = box.clientWidth;
    if (!w) return false;
    var pitch = w < 560 ? 4.6 : 7;
    var cols = Math.max(20, Math.floor(w / pitch));
    pitch = w / cols;
    var h = Math.ceil(Math.ceil(st.opts.n / cols) * pitch);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    // The ordinary days never change, so they are drawn once to a layer.
    var base = document.createElement('canvas');
    base.width = cv.width; base.height = cv.height;
    var c = base.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var shade = token(box, '--c-s4', '#8C96A6');
    var bands = st.opts.bands || [0], band = 0, b = 0, r = pitch * 0.3;
    c.fillStyle = shade;
    for (var i = 0; i < st.opts.n; i++) {
      if (b + 1 < bands.length && i >= bands[b + 1]) { b++; band = b % 2; }
      c.globalAlpha = band ? 0.66 : 0.3;
      c.beginPath(); c.arc((i % cols + 0.5) * pitch, (Math.floor(i / cols) + 0.5) * pitch, r, 0, 6.2832); c.fill();
    }
    st.w = w; st.h = h; st.dpr = dpr; st.cols = cols; st.pitch = pitch; st.base = base;
    st.gold = token(box, '--c-gold', '#83661C'); st.warn = token(box, '--c-warn', '#9A4A1F');
    return true;
  }
  function dotsPaint(box) {
    var st = box._dots, cv = box.querySelector('canvas'), c = cv.getContext('2d');
    var t = now(), busy = false;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(st.base, 0, 0);
    c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    function mark(list, colour) {
      c.fillStyle = colour;
      list.forEach(function (i) {
        var start = st.at[i];
        if (start == null) return;                 // waiting for the scene
        var p = Math.max(0, Math.min(1, (t - start) / 520));
        if (p < 1) busy = true;
        if (p <= 0) return;
        // Pops slightly past full size, then settles; the halo flares and fades.
        var s = p < 0.6 ? ease(p / 0.6) * 1.35 : 1.35 - 0.35 * ease((p - 0.6) / 0.4);
        var x = (i % st.cols + 0.5) * st.pitch, y = (Math.floor(i / st.cols) + 0.5) * st.pitch;
        c.globalAlpha = 0.22 + 0.25 * (1 - p); c.beginPath(); c.arc(x, y, st.pitch * (1.15 + 0.9 * (1 - p)) * Math.min(1, s), 0, 6.2832); c.fill();
        c.globalAlpha = 1; c.beginPath(); c.arc(x, y, st.pitch * 0.55 * s, 0, 6.2832); c.fill();
      });
    }
    mark(st.opts.low || [], st.warn);
    mark(st.opts.lit || [], st.gold);
    if (busy) { cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(function () { dotsPaint(box); }); }
  }
  function dotsSchedule(box, list, gap) {
    var st = box._dots, t = now(), k = 0;
    list.forEach(function (i) { if (st.at[i] == null) st.at[i] = calm ? -1e9 : t + (k++) * gap; });
  }
  function dots(box, opts) {
    var cv = box.querySelector('canvas');
    if (!cv || !cv.getContext) return;
    var st = box._dots;
    if (!st) {
      st = box._dots = { at: {}, shown: !box._armed || calm };
      box._play = function () {
        if (st.shown) return;
        st.shown = true;
        dotsSchedule(box, (st.opts.low || []).concat(st.opts.lit || []), 110);
        dotsPaint(box);
      };
      var timer;
      window.addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(function () { if (dotsLayout(box)) dotsPaint(box); }, 120); });
      if (window.MutationObserver) new MutationObserver(function () { if (dotsLayout(box)) dotsPaint(box); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    if (opts) {
      // Forget dots that are no longer lit, so they pop again if they return.
      var keep = {};
      (opts.lit || []).concat(opts.low || []).forEach(function (i) { keep[i] = true; });
      Object.keys(st.at).forEach(function (i) { if (!keep[i]) delete st.at[i]; });
      st.opts = opts;
      if (st.shown) dotsSchedule(box, (opts.low || []).concat(opts.lit || []), 45);
    }
    if (!st.base || box.clientWidth !== st.w) { if (!dotsLayout(box)) return; }
    dotsPaint(box);
  }

  /* ---------- line-draw (A2; reused by the Cost of Waiting tool) ----------
     line(chart, { max, ref, a }) sets the paths of an .m-chart from plain
     number series (evenly spaced in time). ref: the reference line, a: the
     line being compared (omit or null to show the reference alone). The
     shaded .m-gap is the area between them. The SVG viewBox is 1000 x 400.
     Motion: inside an armed scene the chart starts empty; when the scene
     plays the reference line draws left to right, then the compared line and
     its gap follow. After that, a new series morphs from the old one (650ms),
     so the line visibly drops or rises; the reference morphs too when it
     changes (a calculator's inputs move both lines, and a new max rescales
     them). Reduced motion: drawn at once. */
  var VW = 1000, VH = 400, SVGNS = 'http://www.w3.org/2000/svg', clipN = 0;
  function pts(series, max) {
    var last = series.length - 1, out = [];
    for (var i = 0; i <= last; i++) out.push([i / last * VW, VH - Math.min(series[i], max) / max * VH]);
    return out;
  }
  function toPath(p) { return 'M' + p.map(function (q) { return Math.round(q[0]) + ' ' + Math.round(q[1]); }).join('L'); }
  function gapPath(r, a) { return toPath(r) + 'L' + a.slice().reverse().map(function (q) { return Math.round(q[0]) + ' ' + Math.round(q[1]); }).join('L') + 'Z'; }
  function clips(chart) {
    if (chart._clips) return chart._clips;
    var svg = chart.querySelector('svg'), defs = document.createElementNS(SVGNS, 'defs'), made = {};
    ['ref', 'a'].forEach(function (k) {
      var id = 'm-clip-' + (++clipN), cp = document.createElementNS(SVGNS, 'clipPath'), rect = document.createElementNS(SVGNS, 'rect');
      cp.setAttribute('id', id);
      // A little room above and below so strokes at the edges are not cut.
      rect.setAttribute('x', -10); rect.setAttribute('y', -20); rect.setAttribute('height', VH + 40);
      rect.setAttribute('width', chart._armed && !calm ? 0 : VW + 20);
      cp.appendChild(rect); defs.appendChild(cp); made[k] = rect;
      var targets = k === 'ref' ? chart.querySelectorAll('.m-ref') : chart.querySelectorAll('.m-line-a, .m-gap');
      Array.prototype.forEach.call(targets, function (el) { el.setAttribute('clip-path', 'url(#' + id + ')'); });
    });
    svg.insertBefore(defs, svg.firstChild);
    return (chart._clips = made);
  }
  function wipe(rect, delay, dur) {
    var t0 = null;
    setTimeout(function () {
      requestAnimationFrame(function step(t) {
        if (t0 == null) t0 = t;
        var p = Math.min(1, (t - t0) / dur);
        // Even pace through the middle, so the line reads as being drawn.
        rect.setAttribute('width', (VW + 20) * (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2));
        if (p < 1) requestAnimationFrame(step);
      });
    }, delay);
  }
  function lineSet(chart, ref, a) {
    var refEl = chart.querySelector('.m-ref'), aEl = chart.querySelector('.m-line-a'), gapEl = chart.querySelector('.m-gap');
    if (refEl) refEl.setAttribute('d', toPath(ref));
    if (aEl) aEl.setAttribute('d', a ? toPath(a) : '');
    if (gapEl) gapEl.setAttribute('d', a ? gapPath(ref, a) : '');
  }
  function line(chart, o) {
    var cl = clips(chart);
    if (!chart._play) {
      chart._shown = !chart._armed || calm;
      chart._play = function () {
        if (chart._shown) return;
        chart._shown = true;
        wipe(cl.ref, 150, 1500);
        wipe(cl.a, 1100, 1500);
      };
    }
    var ref = pts(o.ref, o.max), to = o.a ? pts(o.a, o.max) : null;
    var fromRef = chart._ref || ref, from = chart._a || ref;
    chart._ref = ref; chart._a = to;
    if (calm || !chart._shown || from.length !== (to || ref).length || fromRef.length !== ref.length) { lineSet(chart, ref, to); return; }
    // Morph from the current lines to the new ones; "no line" morphs into the reference, then clears.
    var target = to || ref, t0 = null;
    var tween = function (a, b, e) { return a.map(function (q, i) { return [q[0], q[1] + (b[i][1] - q[1]) * e]; }); };
    cancelAnimationFrame(chart._raf);
    chart._raf = requestAnimationFrame(function step(t) {
      if (t0 == null) t0 = t;
      var p = Math.min(1, (t - t0) / 650), e = ease(p);
      var mid = tween(from, target, e);
      lineSet(chart, tween(fromRef, ref, e), p < 1 || to ? mid : null);
      if (p < 1) chart._raf = requestAnimationFrame(step);
    });
  }

  window.TeiMotion = { calm: calm, count: count, bar: bar, win: win, pounds: pounds, pence: pence, dollars: dollars, dots: dots, line: line };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
