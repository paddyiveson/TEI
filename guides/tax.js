/* Tax Wrapper Guide.
     - The "I am" filter: each wrapper card lists the stages it suits in
       data-stages; picking a stage shows those cards and hides the rest, and a
       group with nothing left to show is hidden too (with its figure).
     - Read next: the card is written into the page; refresh it from /articles.json. */
(function () {
  'use strict';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

  function init() { filter(); readNext(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
