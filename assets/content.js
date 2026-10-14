/* TEI content library behaviour (Brand Content Design Spec, rebuild).
   Pairs with /assets/content.css on rebuilt guides, tools and articles.
     - Shell: opened from the Client Hub (?from=hub), a navy back bar returns
       there, and links to other content pages keep ?from=hub. Article pages
       get their bar from /assets/article.js instead.
     - Contents: the rail (desktop) and Contents dropdown (phones) are built
       from each <section class="tc-part" data-toc="..."> and follow the
       reader down the page.
     - Expandable cards: inside [data-tc-one], opening one closes the others.
     - Tabs: [data-tc-tabs] holds role="tab" buttons and their panels.
     - Motion: blocks rise in as they reach the screen, bars grow, .tc-chart
       figures draw in once seen. None of it under prefers-reduced-motion.
     - Chart.js (tools): shared fonts, colours and a left-to-right draw-in.
   Exposes window.TeiContent for page scripts (replay a chart, read colours). */
(function () {
  'use strict';

  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var fromHub = /(?:^|[?&])from=hub(?:&|$)/.test(location.search);
  var each = function (sel, fn, root) { Array.prototype.forEach.call((root || document).querySelectorAll(sel), fn); };

  /* ---------- Shell ---------- */
  function hubShell() {
    if (!fromHub) return;
    // Links to other content pages stay inside the Hub shell.
    each('main a[href^="/guides/"], main a[href^="/articles/"]', function (a) {
      var h = a.getAttribute('href');
      if (h.indexOf('from=hub') < 0) a.setAttribute('href', h + (h.indexOf('?') < 0 ? '?' : '&') + 'from=hub');
    });
    if (document.querySelector('.tei-article[data-slug]') || document.querySelector('.tc-hubbar')) return;
    var back = document.body.getAttribute('data-hub-back') || '/hub/guides.html';
    var label = document.body.getAttribute('data-hub-label') || 'Client Hub guides and tools';
    var bar = document.createElement('div');
    bar.className = 'tc-hubbar';
    bar.setAttribute('style', 'background:#0F1E36;color:#F7F4ED;font-family:Geist,system-ui,sans-serif;font-size:14px;');
    bar.innerHTML = '<div style="max-width:1280px;margin:0 auto;padding:10px 32px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap">' +
      '<a href="' + back + '" style="color:#E8D6A8;text-decoration:none;display:inline-flex;align-items:center;min-height:36px">&lsaquo; ' + label + '</a>' +
      '<a href="/hub/wealth-os.html" style="color:#AAB6C8;text-decoration:none;display:inline-flex;align-items:center;min-height:36px">Open Wealth OS</a></div>';
    var hdr = document.querySelector('.tei-hdr');
    if (hdr && hdr.parentNode) hdr.parentNode.insertBefore(bar, hdr.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
    // The hero breadcrumb points back to the public list; in the Hub it points back here.
    each('.ar-back[data-public]', function (a) { a.setAttribute('href', back); a.lastChild.nodeValue = label; });
  }

  /* ---------- Contents rail ---------- */
  function contents() {
    var parts = document.querySelectorAll('.tc-part[data-toc]');
    if (!parts.length) return;
    var html = Array.prototype.map.call(parts, function (p, i) {
      var no = p.getAttribute('data-toc-no') || ('0' + (i + 1)).slice(-2);
      return '<li><a href="#' + p.id + '"><span>' + no + '</span>' + p.getAttribute('data-toc') + '</a></li>';
    }).join('');
    each('.tc-rail ol, .tc-toc-m ol', function (ol) { ol.innerHTML = html; });
    each('.tc-toc-m a', function (a) { a.addEventListener('click', function () { var d = a.closest('details'); if (d) d.open = false; }); });
    if (!('IntersectionObserver' in window)) return;
    var links = document.querySelectorAll('.tc-rail a');
    var current = null;
    function mark(id) {
      if (id === current) return;
      current = id;
      Array.prototype.forEach.call(links, function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#' + id ? 'true' : 'false'); });
      var label = document.querySelector('.tc-toc-m summary span');
      var part = document.getElementById(id);
      if (label && part) label.textContent = part.getAttribute('data-toc');
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) mark(en.target.id); });
    }, { rootMargin: '-30% 0px -60% 0px' });
    mark(parts[0].id);
    Array.prototype.forEach.call(parts, function (p) { io.observe(p); });
  }

  /* ---------- Expandable groups and tabs ---------- */
  function groups() {
    each('[data-tc-one]', function (g) {
      g.addEventListener('toggle', function (e) {
        var d = e.target;
        if (!d.open || d.tagName !== 'DETAILS') return;
        each('details', function (o) { if (o !== d && o.closest('[data-tc-one]') === g) o.open = false; }, g);
      }, true);
    });
    each('[data-tc-tabs]', function (box) {
      var tabs = box.querySelectorAll('[role="tab"]');
      function pick(t) {
        Array.prototype.forEach.call(tabs, function (b) {
          var on = b === t;
          b.setAttribute('aria-selected', on ? 'true' : 'false');
          b.tabIndex = on ? 0 : -1;
          var p = document.getElementById(b.getAttribute('aria-controls'));
          if (p) p.hidden = !on;
        });
      }
      Array.prototype.forEach.call(tabs, function (b, i) {
        b.addEventListener('click', function () { pick(b); });
        b.addEventListener('keydown', function (e) {
          var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!k) return;
          var n = tabs[(i + k + tabs.length) % tabs.length];
          pick(n); n.focus();
        });
      });
    });
  }

  /* ---------- Motion ---------- */
  var REVEAL = '.tc-tile, .tc-two, .tc-flow, .tc-steps, .tc-matrix, .tc-feature, .tc-sleeves, .tc-callout, .tc-icons, .tc-timeline, ' +
    '.tc-inline-link, .tc-related, .tc-cta, .tc-members, .visual-block, .ar-figure, .pull-quote, .ar-takeaways, .ar-not';
  function reveal() {
    if (calm || !('IntersectionObserver' in window)) return;
    var els = Array.prototype.filter.call(document.querySelectorAll(REVEAL), function (el) {
      return !(el.parentElement && el.parentElement.closest(REVEAL));
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('tc-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    els.forEach(function (el) { el.classList.add('tc-reveal'); io.observe(el); });
  }

  // SVG figures marked .tc-chart draw in the first time they are seen;
  // redrawn(el) runs it again after a page script redraws a seen figure.
  function replay(el) {
    if (calm || !el) return;
    each('.draw', function (p) { if (p.getTotalLength) p.style.setProperty('--len', Math.ceil(p.getTotalLength()) + 1); }, el);
    el.classList.remove('is-drawing'); void el.offsetWidth; el.classList.add('is-drawing');
  }
  function charts() {
    if (calm || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.setAttribute('data-seen', '1');
        replay(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.35 });
    each('.tc-chart', function (c) { io.observe(c); });
  }
  function redrawn(el) { if (el && el.getAttribute('data-seen')) replay(el); }

  /* ---------- Chart.js (tools) ---------- */
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  var drawIn = {
    id: 'teiDrawIn',
    beforeDatasetsDraw: function (chart) {
      var a = chart.chartArea, st = chart.$tei || (chart.$tei = {});
      if (!a) return;
      if (st.start == null) st.start = performance.now();
      var p = Math.min(1, (performance.now() - st.start) / 1100);
      if (p >= 1) return;
      chart.ctx.save();
      chart.ctx.beginPath();
      chart.ctx.rect(a.left - 4, a.top - 10, (a.width + 8) * (1 - Math.pow(1 - p, 3)), a.height + 20);
      chart.ctx.clip();
      st.clipped = true;
      requestAnimationFrame(function () { if (chart.ctx) chart.draw(); });
    },
    afterDatasetsDraw: function (chart) { var st = chart.$tei; if (st && st.clipped) { chart.ctx.restore(); st.clipped = false; } }
  };
  function chartSkin() {
    var C = window.Chart;
    if (!C || C.__teiSkin) return;
    C.__teiSkin = true;
    C.defaults.font.family = "'Geist', system-ui, sans-serif";
    C.defaults.color = cssVar('--c-muted') || '#4E5B70';
    C.defaults.borderColor = cssVar('--c-line-soft') || 'rgba(19, 33, 58, 0.08)';
    if (calm) C.defaults.animation = false;
    else C.register(drawIn);
  }

  function run() { hubShell(); contents(); groups(); reveal(); charts(); chartSkin(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  window.addEventListener('load', chartSkin);

  window.TeiContent = { calm: calm, fromHub: fromHub, replay: replay, redrawn: redrawn, cssVar: cssVar };
})();
