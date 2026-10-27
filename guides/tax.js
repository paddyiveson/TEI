/* Tax Wrapper Guide.
     - The "I am" filter: each wrapper card lists the stages it suits in
       data-stages; picking a stage shows those cards and hides the rest, and a
       group with nothing left to show is hidden too (with its figure).
     - Wide cards: a card alone in its group spreads across on desktop.
     - Read next: the card is written into the page; refresh it from /articles.json. */
(function () {
  'use strict';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // A card left alone in its group goes wide on desktop: its "More detail"
  // opens beside the main facts. On phones the cards stack and keep the button.
  var desktop = window.matchMedia ? window.matchMedia('(min-width: 861px)') : null;
  function layout() {
    Array.prototype.forEach.call(document.querySelectorAll('.tc-cards'), function (box) {
      var shown = Array.prototype.filter.call(box.querySelectorAll('.tc-pcard'), function (c) { return !c.hidden; });
      Array.prototype.forEach.call(box.querySelectorAll('.tc-pcard'), function (c) {
        var wide = !!(desktop && desktop.matches) && shown.length === 1 && shown[0] === c;
        var d = c.querySelector('details');
        if (wide && !c.classList.contains('is-wide')) {
          c.classList.add('is-wide');
          if (d && !d.open) { d.open = true; d.setAttribute('data-auto-open', ''); }
        } else if (!wide && c.classList.contains('is-wide')) {
          c.classList.remove('is-wide');
          if (d && d.hasAttribute('data-auto-open')) { d.open = false; d.removeAttribute('data-auto-open'); }
        }
      });
    });
  }

  function filter() {
    var buttons = document.querySelectorAll('.tc-filter [data-stage]');
    function pick(stage) {
      Array.prototype.forEach.call(buttons, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-stage') === stage ? 'true' : 'false'); });
      Array.prototype.forEach.call(document.querySelectorAll('.tc-pcard[data-stages]'), function (c) {
        c.hidden = c.getAttribute('data-stages').split(',').indexOf(stage) < 0;
        if (!c.hidden) c.classList.add('tc-in');
      });
      Array.prototype.forEach.call(document.querySelectorAll('.tc-group'), function (g) {
        g.hidden = !g.querySelector('.tc-pcard:not([hidden])');
      });
      layout();
    }
    Array.prototype.forEach.call(buttons, function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-stage')); }); });
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
    layout();
    if (desktop) { if (desktop.addEventListener) desktop.addEventListener('change', layout); else if (desktop.addListener) desktop.addListener(layout); }
    readNext();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
