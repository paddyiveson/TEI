/* Read next on a guide's Next steps (TEI Principles, Five Stages).
   The card is written into the page so it reads with JS off; this refreshes
   its category, title, teaser, date and read time from /articles.json, the
   same way /guides/tax.js does for the Tax Wrapper Guide. */
(function () {
  'use strict';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var cards = document.querySelectorAll('[data-read-next][data-slug]');
  if (!cards.length || !window.fetch) return;
  fetch('/articles.json').then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
    Array.prototype.forEach.call(cards, function (card) {
      var a = (list || []).filter(function (x) { return x.slug === card.getAttribute('data-slug'); })[0];
      if (!a) return;
      var d = String(a.date || '').split('-');
      var q = function (n) { return card.querySelector('[data-out="' + n + '"]'); };
      if (q('rn-cat')) q('rn-cat').textContent = 'Read next · ' + a.category;
      if (q('rn-title')) q('rn-title').textContent = a.title;
      if (q('rn-teaser') && a.teaser) q('rn-teaser').textContent = a.teaser;
      if (q('rn-time')) q('rn-time').textContent = (d.length === 3 ? Number(d[2]) + ' ' + MONTHS[Number(d[1]) - 1] + ' ' + d[0] + ' · ' : '') + a.readTime + ' min read';
    });
  }).catch(function () {});
})();
