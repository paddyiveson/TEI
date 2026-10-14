/* TEI articles -- shared by the Articles list (/articles.html) and every
   article page. /articles.json is the single source for titles, categories,
   dates, read times, teasers, the featured article, related articles and
   series, so none of that is typed into the pages themselves.
     - article pages: fills the header line and builds "Keep reading"
     - a [data-ar-milestones] figure: the milestone toggle
   The list page has its own inline script and uses TeiArticles.load(). */
(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var loading = null;

  function load() {
    if (!loading) {
      loading = fetch('/articles.json').then(function (response) {
        if (!response.ok) throw new Error('articles.json: ' + response.status);
        return response.json();
      });
    }
    return loading;
  }

  // "2026-09-20" to "20 Sep 2026"
  function formatDate(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) return '';
    return Number(parts[2]) + ' ' + MONTHS[Number(parts[1]) - 1] + ' ' + parts[0];
  }

  function readTime(minutes) { return minutes + ' min read'; }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function urlFor(article) { return '/articles/' + article.slug + '.html'; }

  window.TeiArticles = { load: load, formatDate: formatDate, readTime: readTime, escapeHtml: escapeHtml, urlFor: urlFor };

  /* ---------------- article page ---------------- */
  function fillArticle(root, articles) {
    var slug = root.getAttribute('data-slug');
    var bySlug = {};
    articles.forEach(function (a) { bySlug[a.slug] = a; });
    var article = bySlug[slug];
    if (!article) return;

    var meta = root.querySelector('.ar-meta');
    if (meta) {
      var html = '<span class="ar-cat">' + escapeHtml(article.category) + '</span>' +
        '<span>' + escapeHtml(formatDate(article.date)) + ' &middot; ' + escapeHtml(readTime(article.readTime)) + '</span>';
      if (article.series) {
        html += '<span aria-hidden="true">&middot;</span><a class="ar-series" href="/articles.html?series=' +
          encodeURIComponent(article.series.slug) + '">' + escapeHtml(article.series.name) + ' series</a>';
      }
      meta.innerHTML = html;
    }

    var related = root.querySelector('.ar-related');
    if (related) {
      var cards = (article.related || []).map(function (s) { return bySlug[s]; }).filter(Boolean).slice(0, 3);
      related.innerHTML = cards.map(function (r) {
        return '<a href="' + urlFor(r) + '"><span class="ar-related-cat">' + escapeHtml(r.category) + '</span>' +
          '<h3>' + escapeHtml(r.title) + '</h3>' +
          '<span class="ar-related-time">' + escapeHtml(readTime(r.readTime)) + '</span></a>';
      }).join('');
      var section = root.querySelector('.ar-more-head');
      if (!cards.length && section) { section.hidden = true; related.hidden = true; }
    }
  }

  /* ---------------- milestone figure ---------------- */
  // What a regular monthly amount at a steady yearly rate takes to reach each
  // target: money put in, growth added, time taken and growth's share.
  function pounds(n) {
    return '£' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function milestone(target, monthly, yearlyRate) {
    var rate = yearlyRate / 100 / 12, pot = 0, months = 0;
    while (pot < target && months < 1200) { pot = pot * (1 + rate) + monthly; months++; }
    var paid = monthly * months;
    return { paid: paid, growth: pot - paid, pot: pot, months: months };
  }

  function setUpMilestones(figure) {
    var monthly = Number(figure.getAttribute('data-monthly'));
    var rate = Number(figure.getAttribute('data-rate'));
    var buttons = figure.querySelectorAll('.ar-seg button');
    var bar = figure.querySelector('.ar-bar');
    function out(name) { return figure.querySelector('[data-ar-out="' + name + '"]'); }

    function show(target) {
      var m = milestone(target, monthly, rate);
      Array.prototype.forEach.call(buttons, function (b) {
        b.setAttribute('aria-pressed', Number(b.getAttribute('data-target')) === target ? 'true' : 'false');
      });
      figure.querySelector('.ar-bar-you').style.width = (m.paid / m.pot * 100).toFixed(1) + '%';
      figure.querySelector('.ar-bar-growth').style.width = (m.growth / m.pot * 100).toFixed(1) + '%';
      bar.setAttribute('aria-label', 'You put in ' + pounds(m.paid) + ', growth added ' + pounds(m.growth));
      out('paid').textContent = pounds(m.paid);
      out('growth').textContent = pounds(m.growth);
      out('time').textContent = Math.floor(m.months / 12) + 'y ' + (m.months % 12) + 'm';
      out('share').textContent = Math.round(m.growth / m.pot * 100) + '%';
    }

    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener('click', function () { show(Number(b.getAttribute('data-target'))); });
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ar-milestones]'), setUpMilestones);
    var root = document.querySelector('.tei-article[data-slug]');
    if (root) load().then(function (articles) { fillArticle(root, articles); }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
