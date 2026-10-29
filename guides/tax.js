/* Tax Wrapper Guide.
     - The "I am" filter: each wrapper card lists the stages it suits in
       data-stages; picking a stage shows those cards and hides the rest, and a
       row with nothing left to show is hidden too.
     - Wrapper rows: each .tc-wgrid gets data-n, the number of cards shown, so
       they fill the row. Tapping a card opens its More detail as a panel under
       the card's row (on phones the small cards show only the name and limit,
       so the panel carries their three rows too). With JS off, More detail
       opens inside the card.
     - Phones: every "What is changing" item starts closed, and the sources
       line folds into "Sources and dates".
     - Read next: the card is written into the page; refresh it from /articles.json. */
(function () {
  'use strict';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var phone = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  // Cards shown per row; on tablets and phones an odd last small card spans the row.
  function rows() {
    each('.tc-wgrid', function (g) {
      var shown = Array.prototype.filter.call(g.querySelectorAll('.tc-wcard'), function (c) { return !c.hidden; });
      g.setAttribute('data-n', Math.max(shown.length, 1));
      shown.forEach(function (c, i) { c.classList.toggle('is-span', i === shown.length - 1 && shown.length % 2 === 1); });
      var small = shown.filter(function (c) { return !c.classList.contains('is-lead'); });
      small.forEach(function (c, i) { c.classList.toggle('is-pspan', i === small.length - 1 && small.length % 2 === 1); });
    });
  }

  function closePanel() {
    each('.tc-wpanel', function (p) { p.parentNode.removeChild(p); });
    each('.tc-wcard.is-open', function (c) { c.classList.remove('is-open'); c.querySelector('summary').setAttribute('aria-expanded', 'false'); });
  }
  function openPanel(card) {
    var was = card.classList.contains('is-open');
    closePanel();
    if (was) return;
    // The panel goes after the last card on the same line, and spans the row.
    var last = card;
    Array.prototype.forEach.call(card.parentNode.querySelectorAll('.tc-wcard'), function (c) { if (!c.hidden && c.offsetTop === card.offsetTop) last = c; });
    var r = card.querySelector('.tc-wrows'), hidden = r && getComputedStyle(r).display === 'none';
    var p = document.createElement('div');
    p.className = 'tc-wpanel';
    p.innerHTML = '<div class="tc-wpanel-h"><b>' + card.querySelector('h4').innerHTML + '</b><button type="button" class="tc-wpanel-close">Close</button></div>' +
      (hidden ? r.outerHTML : '') + card.querySelector('.tc-pcard-more').outerHTML;
    last.insertAdjacentElement('afterend', p);
    card.classList.add('is-open');
    card.querySelector('summary').setAttribute('aria-expanded', 'true');
    p.querySelector('.tc-wpanel-close').addEventListener('click', function () { closePanel(); card.querySelector('summary').focus(); });
    if (p.getBoundingClientRect().bottom > window.innerHeight) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function cards() {
    each('.tc-wcard > details > summary', function (s) { s.setAttribute('aria-expanded', 'false'); });
    document.addEventListener('click', function (e) {
      var card = e.target.closest && e.target.closest('.tc-wcard');
      if (!card || e.target.closest('a')) return;
      e.preventDefault();
      openPanel(card);
    });
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { closePanel(); rows(); }, 150); });
  }

  function filter() {
    var buttons = document.querySelectorAll('.tc-filter [data-stage]');
    function pick(stage) {
      Array.prototype.forEach.call(buttons, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-stage') === stage ? 'true' : 'false'); });
      each('.tc-pcard[data-stages]', function (c) {
        c.hidden = c.getAttribute('data-stages').split(',').indexOf(stage) < 0;
        if (!c.hidden) c.classList.add('tc-in');
      });
      each('.tc-group', function (g) { g.hidden = !g.querySelector('.tc-pcard:not([hidden])'); });
      closePanel();
      rows();
    }
    Array.prototype.forEach.call(buttons, function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-stage')); }); });
  }

  function phoneTaps() {
    if (!phone || !phone.matches) return;
    each('.tc-timeline details[open]', function (d) { d.open = false; });
    var src = Array.prototype.filter.call(document.querySelectorAll('.tc-body > p.tc-na'), function (p) { return /^Sources:/.test(p.textContent); })[0];
    if (!src) return;
    var d = document.createElement('details');
    d.className = 'tc-src';
    d.innerHTML = '<summary>Sources and dates</summary>';
    src.parentNode.insertBefore(d, src);
    d.appendChild(src);
  }

  function readNext() {
    var card = document.getElementById('tax-read-next');
    if (!card || !window.fetch) return;
    fetch('/articles.json').then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      var a = (list || []).filter(function (x) { return x.slug === card.getAttribute('data-slug'); })[0];
      if (!a) return;
      var d = String(a.date || '').split('-');
      var q = function (n) { return card.querySelector('[data-out="' + n + '"]'); };
      q('rn-cat').textContent = 'Read next · ' + a.category;
      q('rn-title').textContent = a.title;
      q('rn-teaser').textContent = a.teaser;
      q('rn-time').textContent = (d.length === 3 ? Number(d[2]) + ' ' + MONTHS[Number(d[1]) - 1] + ' ' + d[0] + ' · ' : '') + a.readTime + ' min read';
    }).catch(function () {});
  }

  function init() {
    filter();
    rows();
    cards();
    phoneTaps();
    readNext();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
