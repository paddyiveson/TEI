/* TEI content skin behaviour (Brand Content Design Spec, pilot).
   Pairs with /assets/content.css on legacy guides and tools:
   - the old floating "Back to ..." button becomes a breadcrumb in the hero;
   - opened from the Client Hub (?from=hub), a navy back bar returns there;
   - emoji used as icons are removed (no-emoji rule);
   - Chart.js charts pick up Geist, the muted axis colours and the new
     palette (legacy gold and navy series are mapped across);
   - motion: blocks rise in as they scroll into view, dark bands carry a
     slow rotating ring, charts draw in left to right and a line chart's
     latest value pulses. None of it runs under prefers-reduced-motion. */
(function () {
  'use strict';

  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var fromHub = /(?:^|[?&])from=hub(?:&|$)/.test(location.search) || location.pathname.indexOf('/hub/') === 0;

  function backLink() {
    var old = document.querySelector('a[style*="position:fixed"][href], a[style*="position: fixed"][href]');
    var hero = document.querySelector('.hero, .calc-header');
    if (!old) return;
    var href = old.getAttribute('href');
    var label = (old.textContent || '').replace(/^[\s←<-]+|[\s→>]+$/g, '').replace(/^Back to /i, '') || 'Guides & Tools';
    old.parentNode.removeChild(old);
    if (fromHub) return; // the Hub bar below carries the way back
    var a = document.createElement('a');
    a.className = 'tc-back' + (hero && hero.classList.contains('hero') ? '' : ' tc-back-light');
    a.href = href;
    a.textContent = '‹ ' + label;
    if (hero && hero.classList.contains('hero')) hero.insertBefore(a, hero.firstChild);
    else {
      var main = document.querySelector('.tei-hdr');
      var wrap = document.createElement('div');
      wrap.style.cssText = 'max-width:860px;margin:0 auto;padding:16px 32px 0;';
      wrap.appendChild(a);
      if (main && main.parentNode) main.parentNode.insertBefore(wrap, main.nextSibling);
    }
  }

  function hubBar() {
    if (!fromHub || document.querySelector('.tc-hubbar')) return;
    var bar = document.createElement('div');
    bar.className = 'tc-hubbar';
    bar.setAttribute('style', 'background:#0F1E36;color:#F7F4ED;font-size:14px;');
    bar.innerHTML = '<div style="max-width:1280px;margin:0 auto;padding:10px 32px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap">' +
      '<a href="/hub/guides.html" style="color:#E8D6A8;text-decoration:none;display:inline-flex;align-items:center;min-height:36px">‹ Client Hub guides and tools</a>' +
      '<a href="/hub/wealth-os.html" style="color:#AAB6C8;text-decoration:none;display:inline-flex;align-items:center;min-height:36px">Open Wealth OS</a></div>';
    var hdr = document.querySelector('.tei-hdr');
    if (hdr && hdr.parentNode) hdr.parentNode.insertBefore(bar, hdr.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  }

  /* Removes emoji characters; an element left empty (an icon span) goes too. */
  function stripEmoji() {
    var re;
    try { re = new RegExp('[\\p{Extended_Pictographic}\\uFE0F\\u200D]', 'gu'); } catch (e) { return; }
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var hits = [], n;
    while ((n = walker.nextNode())) { if (re.test(n.nodeValue)) hits.push(n); re.lastIndex = 0; }
    hits.forEach(function (t) {
      var p = t.parentNode;
      if (!p || p.closest('script, style, .tei-hdr, .tei-ftr')) return;
      t.nodeValue = t.nodeValue.replace(re, '').replace(/^\s+/, '');
      if (p.children.length === 0 && !p.textContent.trim() && p !== document.body) p.parentNode && p.parentNode.removeChild(p);
    });
  }

  /* Chart.js: shared defaults and the legacy palette mapped to the new one. */
  var MAP = {
    '#c9a84c': '#83661C', '#b8922d': '#83661C', '#1d3557': '#0F1E36', '#0f1e3a': '#0B1729', '#2b4c7e': '#B9CAE6',
    '#2d7d52': '#3D6B4F', '#c0392b': '#9A4A1F', '#e8d6a8': '#E8D6A8'
  };
  function mapColour(c) {
    if (typeof c !== 'string') return c;
    var k = c.trim().toLowerCase();
    if (MAP[k]) return MAP[k];
    var m = k.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (m) {
      var hex = '#' + [m[1], m[2], m[3]].map(function (x) { return ('0' + Number(x).toString(16)).slice(-2); }).join('');
      if (MAP[hex]) {
        var to = MAP[hex].slice(1), a = m[4] != null ? m[4] : 1;
        return 'rgba(' + parseInt(to.slice(0, 2), 16) + ',' + parseInt(to.slice(2, 4), 16) + ',' + parseInt(to.slice(4, 6), 16) + ',' + a + ')';
      }
    }
    return c;
  }
  function chartSkin() {
    var C = window.Chart;
    if (!C || C.__teiSkin) return;
    C.__teiSkin = true;
    C.defaults.font.family = "'Geist', system-ui, sans-serif";
    C.defaults.color = '#4E5B70';
    C.defaults.borderColor = 'rgba(19, 33, 58, 0.08)';
    if (calm) C.defaults.animation = false;
    else { C.defaults.animation.duration = 900; C.defaults.animation.easing = 'easeOutCubic'; }
    C.register({
      id: 'teiPalette',
      beforeUpdate: function (chart) {
        (chart.data.datasets || []).forEach(function (d) {
          ['borderColor', 'backgroundColor', 'pointBackgroundColor', 'pointBorderColor'].forEach(function (k) {
            if (Array.isArray(d[k])) d[k] = d[k].map(mapColour);
            else if (typeof d[k] === 'string') d[k] = mapColour(d[k]);
          });
        });
      }
    });
    if (!calm) C.register(drawIn);
  }

  /* Charts draw in left to right (1.1s), then the latest point of a line
     chart pulses, as on the Wealth OS wealth chart. */
  var drawIn = {
    id: 'teiDrawIn',
    beforeDatasetsDraw: function (chart) {
      var a = chart.chartArea, st = chart.$tei || (chart.$tei = {});
      if (!a) return;
      if (st.start == null && !st.waiting) {
        // Wait until the chart is on screen, so the draw-in is seen.
        st.waiting = true;
        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (en) {
            if (!en[0].isIntersecting) return;
            io.disconnect(); st.start = performance.now(); if (!st.gone) chart.draw();
          }, { threshold: 0.3 });
          io.observe(chart.canvas);
        } else st.start = performance.now();
      }
      var p = st.start == null ? 0 : Math.min(1, (performance.now() - st.start) / 1100);
      if (p >= 1) return;
      var e = 1 - Math.pow(1 - p, 3);
      chart.ctx.save();
      chart.ctx.beginPath();
      chart.ctx.rect(a.left - 4, a.top - 10, (a.width + 8) * e, a.height + 20);
      chart.ctx.clip();
      st.clipped = true;
      if (st.start != null) again(chart);
    },
    afterDatasetsDraw: function (chart) {
      var st = chart.$tei;
      if (!st) return;
      if (st.clipped) { chart.ctx.restore(); st.clipped = false; return; }
      if (chart.config.type !== 'line' || st.start == null) return;
      var meta = chart.getDatasetMeta(0);
      var pt = meta && !meta.hidden && meta.data && meta.data[meta.data.length - 1];
      if (!pt) return;
      var t = ((performance.now() - st.start) % 2200) / 2200, ctx = chart.ctx;
      ctx.save();
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 4 + t * 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(131, 102, 28, ' + (0.35 * (1 - t)).toFixed(3) + ')'; ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#83661C'; ctx.fill();
      ctx.restore();
      again(chart);
    },
    afterDestroy: function (chart) { var st = chart.$tei; if (st) { st.gone = true; if (st.raf) cancelAnimationFrame(st.raf); } }
  };
  function again(chart) {
    var st = chart.$tei;
    if (st.raf || st.gone) return;
    st.raf = requestAnimationFrame(function () { st.raf = null; if (!st.gone && chart.ctx) chart.draw(); });
  }

  /* Blocks rise in as they reach the viewport; siblings stagger slightly. */
  var REVEAL = '.section-title, .path-card, .vs-card, .wrapper-card, .stat-card, .metric-card, .result-card, .tei-card, .topic-item, .faq-item, .calc-wrapper, .compound-wrap, .visual, figure, table, [style*="border-left:4px solid var(--gold)"], [style*="border-left: 4px solid var(--gold)"]';
  function reveal() {
    if (calm || !('IntersectionObserver' in window)) return;
    var els = [].slice.call(document.querySelectorAll(REVEAL)).filter(function (el) {
      if (el.closest('.hero, .tei-hdr, .tei-ftr, .tc-hubbar')) return false;
      var up = el.parentElement && el.parentElement.closest(REVEAL);
      return !up; // the outer block carries the motion; nothing fades twice
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('tc-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (el) {
      var sibs = el.parentElement ? [].filter.call(el.parentElement.children, function (c) { return els.indexOf(c) > -1; }) : [];
      var i = Math.min(sibs.indexOf(el), 5);
      if (i > 0) el.style.setProperty('--tc-d', (i * 0.07).toFixed(2) + 's');
      el.classList.add('tc-reveal');
      io.observe(el);
    });
  }

  /* Canvas charts drawn by hand: each redraw resets canvas.width, so a
     change to that attribute replays the wipe. Chart.js canvases are left
     to the plugin above. */
  function canvasWipe() {
    if (calm || !('MutationObserver' in window)) return;
    var mo = new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        var c = r.target;
        if (window.Chart && window.Chart.getChart && window.Chart.getChart(c)) return;
        if (c.$teiT && Date.now() - c.$teiT < 1200) return; // one wipe per redraw burst
        c.$teiT = Date.now();
        c.classList.remove('tc-draw'); void c.offsetWidth; c.classList.add('tc-draw');
      });
    });
    [].forEach.call(document.querySelectorAll('canvas'), function (c) { mo.observe(c, { attributes: true, attributeFilter: ['width', 'height'] }); });
  }

  /* Slow rotating rings on dark bands. */
  var DARK = '.inflation-bg, .why-bg, .steps-bg, .machine-bg, .section-navy, .final-cta, .grad-box, .result-cta, .tei-banner, .diff-block';
  function rings() {
    [].forEach.call(document.querySelectorAll(DARK), function (el) {
      if (el.querySelector(':scope > .tc-ring') || el.offsetWidth < 320) return;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.classList.add('tc-ringhost');
      var r = document.createElement('span');
      r.className = 'tc-ring';
      r.setAttribute('aria-hidden', 'true');
      el.insertBefore(r, el.firstChild);
    });
  }

  /* House naming (spec content rules): "Growth Portfolio", never "TEI Growth Fund". */
  function names() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = walker.nextNode())) {
      if (/Growth Fund/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/TEI Growth Fund/gi, 'Growth Portfolio').replace(/Growth Fund/gi, 'Growth Portfolio');
    }
  }

  function run() { backLink(); hubBar(); stripEmoji(); names(); chartSkin(); rings(); reveal(); canvasWipe(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  // Charts created after load (on Calculate) still get the skin.
  window.addEventListener('load', chartSkin);
})();
