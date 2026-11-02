/* Knowledge library (Hub reskin, Nov 2026): one script for the index and the
   nine libraries.

   Each library's content lives in /hub/knowledge/data/<slug>.json, word for
   word as it was in the old pages, with a small config at the top: title,
   line, the noun, the layout (card, quote or row), the field that heads each
   entry, its summary and meta fields, the labelled sections and the category
   names. /hub/knowledge/data/modules.json names the curriculum modules.

   A page says what it is with data-kl on <main>: "index", or a library slug.
     Library: search, category chips, module and theme filters, Show more
       (24 at a time), tags that filter on click, related links, and deep links
       (#id opens and highlights an entry; ?q= fills the search, as the Hub
       home's search box does).
     Index: one search across every library, then the featured library (the
       Glossary) and the other eight in rows that fill.
   Styles: /hub/css/knowledge.css (the Hub tokens, light and dark). */
(function () {
  'use strict';

  var main = document.querySelector('[data-kl]');
  if (!main) return;
  var MODE = main.getAttribute('data-kl');
  var BASE = '/hub/knowledge/';
  var PAGE = 24;
  // The libraries in the order the index lists them; the Glossary is featured.
  var LIBS = ['glossary', 'quote-library', 'mental-models', 'book-library', 'investor-library', 'historical-market-events', 'business-case-studies', 'research-papers', 'frameworks-checklists'];
  var FEATURED_TERMS = ['compounding', 'diversification', 'inflation', 'volatility', 'price-to-earnings-ratio'];
  var CHEV = '<svg class="kl-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // *Title* in a source line reads as italics.
  function rich(s) { return esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>'); }
  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function plural(lib, n) { return n + ' ' + (n === 1 ? lib.noun[0] : lib.noun[1]); }
  // Every word an entry holds, for search.
  var SKIP = { id: 1, num: 1, type: 1, mp: 1, ms: 1, fit: 1 };
  function hay(it) {
    var out = [];
    (function walk(v, k) {
      if (k && SKIP[k]) return;
      if (v == null) return;
      if (Array.isArray(v)) v.forEach(function (x) { walk(x); });
      else if (typeof v === 'object') Object.keys(v).forEach(function (kk) { if (kk !== 'id' && kk !== 'page') walk(v[kk], kk); });
      else out.push(String(v));
    })(it);
    return out.join(' ').toLowerCase();
  }
  function headOf(lib, it) {
    if (lib.layout === 'card') return it[lib.card.head];
    if (lib.layout === 'quote') return it[lib.card.head];
    return it[lib.head];
  }
  function snippetOf(lib, it) {
    if (lib.layout === 'card') return it[lib.card.body];
    if (lib.layout === 'quote') return it[lib.card.by];
    return it[lib.summary];
  }

  if (MODE === 'index') return indexPage();
  libraryPage(MODE);

  /* =========================================================
     A library
     ========================================================= */
  function libraryPage(slug) {
    var lib, mods, all = [], list = [], shown = PAGE, opened = {};
    var f = { q: '', type: '', mod: '', theme: '' };

    Promise.all([getJSON(BASE + 'data/' + slug + '.json'), getJSON(BASE + 'data/modules.json')]).then(function (r) {
      lib = r[0]; mods = r[1];
      all = lib.items.map(function (it) { it._hay = hay(it); return it; });
      if (lib.sort === 'term') all.sort(function (a, b) { return a.term.localeCompare(b.term); });
      $('klCount').textContent = plural(lib, all.length);
      $('klLine').textContent = lib.line;
      controls();
      try { var q = new URLSearchParams(location.search).get('q'); if (q) { $('klSearch').value = q; f.q = q.trim().toLowerCase(); } } catch (e) {}
      apply(false);
      deepLink();
      window.addEventListener('hashchange', deepLink);
      main.classList.add('kl-ready');
    }).catch(function () {
      $('klList').innerHTML = '<p class="kl-empty">This library did not load. Please refresh the page.</p>';
    });

    function controls() {
      var used = {}, themes = {};
      all.forEach(function (it) {
        [it.mp, it.ms].forEach(function (m) { if (m) used[m] = 1; });
        (it.t || []).forEach(function (t) { themes[t] = (themes[t] || 0) + 1; });
      });
      $('klMod').innerHTML = '<option value="">All modules</option>' + Object.keys(used).sort(function (a, b) { return parseFloat(a) - parseFloat(b) || a.localeCompare(b); })
        .map(function (m) { return '<option value="' + esc(m) + '">' + esc(mods[m] || m) + '</option>'; }).join('');
      $('klTheme').innerHTML = '<option value="">All themes</option>' + Object.keys(themes).sort(function (a, b) { return themes[b] - themes[a] || a.localeCompare(b); })
        .map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + ' (' + themes[t] + ')</option>'; }).join('');
      if (lib.types) {
        var counts = {};
        all.forEach(function (it) { counts[it.type] = (counts[it.type] || 0) + 1; });
        $('klTypes').innerHTML = ['<button type="button" class="hb-chip" data-type="" aria-pressed="true">All</button>'].concat(Object.keys(lib.types).filter(function (k) { return counts[k]; }).map(function (k, i) {
          return '<button type="button" class="hb-chip kl-t' + (i + 1) + '" data-type="' + esc(k) + '" aria-pressed="false"><i aria-hidden="true"></i>' + esc(lib.types[k]) + '<span class="n">' + counts[k] + '</span></button>';
        })).join('');
        $('klTypes').hidden = false;
      }
      $('klSearch').addEventListener('input', function () { f.q = this.value.trim().toLowerCase(); apply(true); });
      $('klMod').addEventListener('change', function () { f.mod = this.value; apply(true); });
      $('klTheme').addEventListener('change', function () { f.theme = this.value; apply(true); });
      $('klTypes').addEventListener('click', function (e) {
        var b = e.target.closest('[data-type]'); if (!b) return;
        f.type = b.getAttribute('data-type'); apply(true);
      });
      $('klClear').addEventListener('click', function () {
        f = { q: '', type: '', mod: '', theme: '' };
        $('klSearch').value = ''; $('klMod').value = ''; $('klTheme').value = '';
        apply(true);
      });
      $('klMore').addEventListener('click', function () { shown += PAGE; render(); });
      // Tags filter on click; copy link copies the entry's address.
      $('klList').addEventListener('click', function (e) {
        var t = e.target.closest('[data-f]');
        if (t) {
          e.preventDefault();
          if (t.getAttribute('data-f') === 'mod') { f.mod = t.getAttribute('data-v'); $('klMod').value = f.mod; }
          else { f.theme = t.getAttribute('data-v'); $('klTheme').value = f.theme; }
          apply(true);
          $('klBar').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
          return;
        }
        var c = e.target.closest('[data-copy]');
        if (c) {
          var url = location.origin + location.pathname + '#' + c.getAttribute('data-copy');
          var done = function (ok) { c.textContent = ok ? 'Link copied' : url; setTimeout(function () { c.textContent = 'Copy link'; }, 1800); };
          if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
          else done(false);
        }
      });
      $('klList').addEventListener('toggle', function (e) {
        if (e.target.matches && e.target.matches('details')) opened[e.target.id] = e.target.open;
      }, true);
    }

    function apply(resetShown) {
      if (resetShown) shown = PAGE;
      list = all.filter(function (it) {
        if (f.type && it.type !== f.type) return false;
        if (f.mod && it.mp !== f.mod && it.ms !== f.mod) return false;
        if (f.theme && (it.t || []).indexOf(f.theme) < 0) return false;
        if (f.q && it._hay.indexOf(f.q) < 0) return false;
        return true;
      });
      Array.prototype.forEach.call($('klTypes').querySelectorAll('[data-type]'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-type') === f.type ? 'true' : 'false');
      });
      var filtering = f.q || f.type || f.mod || f.theme;
      $('klClear').hidden = !filtering;
      $('klResult').textContent = filtering ? (list.length ? plural(lib, list.length) + ' match' : '') : '';
      render();
    }

    function render() {
      if (!list.length) {
        $('klList').innerHTML = '<p class="kl-empty">Nothing matches those filters. Try another word, or clear the filters.</p>';
        $('klMore').hidden = true;
        return;
      }
      var cls = 'kl-list is-' + lib.layout;
      $('klList').className = cls;
      $('klList').innerHTML = list.slice(0, shown).map(entry).join('');
      $('klMore').hidden = list.length <= shown;
      $('klMore').textContent = 'Show more (' + (list.length - shown) + ' left)';
    }

    /* ---------- Entries ---------- */
    function tags(it) {
      var m = [it.mp, it.ms].filter(Boolean).map(function (id, i) {
        var soft = i > 0 || it.fit === 'soft';
        return '<button type="button" class="kl-tag is-mod' + (soft ? ' is-soft' : '') + '" data-f="mod" data-v="' + esc(id) + '" title="' + esc(mods[id] || id) + (soft ? ', a partial fit' : '') + '">' + esc(id) + '</button>';
      });
      var t = (it.t || []).slice(0, 4).map(function (th) {
        return '<button type="button" class="kl-tag" data-f="theme" data-v="' + esc(th) + '">' + esc(th) + '</button>';
      });
      return '<div class="kl-tags">' + m.concat(t).join('') + '</div>';
    }
    function copy(it) { return '<button type="button" class="kl-copy" data-copy="' + esc(it.id) + '">Copy link</button>'; }
    function body(v) {
      if (Array.isArray(v)) return '<ul>' + v.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      return v ? '<p>' + esc(v) + '</p>' : '';
    }
    function related(it) {
      if (!it.related || !it.related.length) return '';
      return '<p class="kl-rel"><span class="mono">Related</span>' + it.related.map(function (r) {
        if (typeof r === 'string') {
          var d = all.filter(function (x) { return x.id === r; })[0];
          return '<a href="#' + esc(r) + '">' + esc(d ? headOf(lib, d) : r) + '</a>';
        }
        return '<a href="' + esc(BASE + r.page + '#' + r.id) + '">' + esc(r.label) + '</a>';
      }).join('') + '</p>';
    }
    function entry(it) {
      if (lib.layout === 'card') {
        return '<article class="kl-card" id="' + esc(it.id) + '"><h2 class="kl-h">' + esc(it[lib.card.head]) + '</h2><p class="kl-def">' + esc(it[lib.card.body]) + '</p>' +
          lib.card.notes.map(function (n) { return it[n[1]] ? '<p class="kl-note"><b>' + esc(n[0]) + '</b> ' + esc(it[n[1]]) + '</p>' : ''; }).join('') +
          '<div class="kl-foot">' + tags(it) + copy(it) + '</div></article>';
      }
      if (lib.layout === 'quote') {
        return '<figure class="kl-card kl-quote" id="' + esc(it.id) + '"><blockquote><p>' + esc(it[lib.card.head]) + '</p></blockquote>' +
          '<figcaption><span class="kl-by">' + esc(it[lib.card.by]) + '</span>' + (it[lib.card.source] ? '<span class="kl-src">' + rich(it[lib.card.source]) + '</span>' : '') + '</figcaption>' +
          lib.card.notes.map(function (n) { return it[n[1]] ? '<p class="kl-note"><b>' + esc(n[0]) + '</b> ' + esc(it[n[1]]) + '</p>' : ''; }).join('') +
          '<div class="kl-foot">' + tags(it) + copy(it) + '</div></figure>';
      }
      var keys = lib.types ? Object.keys(lib.types) : [];
      var ti = keys.indexOf(it.type);
      var meta = (lib.meta || []).map(function (k) { return it[k]; }).filter(Boolean).join(' · ');
      var secs = lib.sections.map(function (s) {
        var v = it[s.field], inner;
        if (s.kind === 'stages') {
          inner = '<ol class="kl-stages">' + v.map(function (st) {
            return '<li><b>' + esc(st.label) + '</b>' + (st.question ? '<span class="kl-q">' + esc(st.question) + '</span>' : '') + body(st.items) + '</li>';
          }).join('') + '</ol>';
        } else if (s.kind === 'quote') {
          if (!v) return '';
          inner = '<blockquote class="kl-pull"><p>' + esc(v) + '</p></blockquote>';
        } else if (s.kind === 'pair') {
          inner = body(v) + body(it[s.field2]);
        } else {
          var v2 = s.field2 ? it[s.field2] : '';
          if (!v && !v2) return '';
          inner = Array.isArray(v) ? body(v) : body([v, v2].filter(Boolean).join(' '));
        }
        return '<section class="kl-sec' + (s.kind === 'stages' ? ' is-wide' : '') + '"><h3 class="mono">' + esc(s.label) + '</h3>' + inner + '</section>';
      }).join('');
      return '<details class="kl-row' + (ti > -1 ? ' kl-t' + (ti + 1) : '') + '" id="' + esc(it.id) + '"' + (opened[it.id] ? ' open' : '') + '>' +
        '<summary><span class="kl-sum">' +
          '<span class="kl-top">' + (it.num != null ? '<span class="kl-num mono">' + (it.num < 10 ? '0' : '') + it.num + '</span>' : '') +
            (ti > -1 ? '<span class="kl-type"><i aria-hidden="true"></i>' + esc(lib.types[it.type]) + '</span>' : '') + '</span>' +
          '<span class="kl-h">' + esc(it[lib.head]) + '</span>' +
          (meta ? '<span class="kl-meta">' + esc(meta) + '</span>' : '') +
          '<span class="kl-teaser">' + esc(it[lib.summary]) + '</span>' +
        '</span><span class="kl-open" aria-hidden="true">' + CHEV + '</span></summary>' +
        '<div class="kl-panel"><div class="kl-secs">' + secs + '</div>' + related(it) + '<div class="kl-foot">' + tags(it) + copy(it) + '</div></div></details>';
    }

    // #id: show it (past Show more and any filter), open it and bring it into view.
    function deepLink() {
      var id = decodeURIComponent(location.hash.replace('#', ''));
      if (!id) return;
      var at = list.map(function (x) { return x.id; }).indexOf(id);
      if (at < 0 && all.some(function (x) { return x.id === id; })) {
        f = { q: '', type: '', mod: '', theme: '' };
        $('klSearch').value = ''; $('klMod').value = ''; $('klTheme').value = '';
        apply(false);
        at = list.map(function (x) { return x.id; }).indexOf(id);
      }
      if (at < 0) return;
      if (at >= shown) { shown = Math.ceil((at + 1) / PAGE) * PAGE; }
      opened[id] = true;
      render();
      var el = $(id);
      if (!el) return;
      if (el.tagName === 'DETAILS') el.open = true;
      el.classList.add('is-hit');
      el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      setTimeout(function () { el.classList.remove('is-hit'); }, 2400);
    }
  }

  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  /* =========================================================
     The index
     ========================================================= */
  function indexPage() {
    var libs = {};
    Promise.all(LIBS.map(function (s) { return getJSON(BASE + 'data/' + s + '.json').then(function (d) { libs[s] = d; }); })).then(function () {
      LIBS.forEach(function (s) { libs[s].items.forEach(function (it) { it._hay = hay(it); }); });
      tiles();
      $('klAll').addEventListener('input', search);
      try { var q = new URLSearchParams(location.search).get('q'); if (q) { $('klAll').value = q; search.call($('klAll')); } } catch (e) {}
      main.classList.add('kl-ready');
    }).catch(function () {
      $('klLibs').innerHTML = '<p class="kl-empty">The Knowledge library did not load. Please refresh the page.</p>';
    });

    function tiles() {
      var g = libs.glossary;
      var byId = {}; g.items.forEach(function (it) { byId[it.id] = it; });
      var feat = '<a class="kl-feat kl-up" href="' + BASE + 'glossary.html" data-w="feat">' +
        '<span class="glow" aria-hidden="true"></span>' +
        '<span class="kl-k mono">Most used · ' + plural(g, g.items.length) + '</span>' +
        '<span class="kl-feat-h">' + esc(g.title) + '</span>' +
        '<span class="kl-feat-p">' + esc(g.line) + '</span>' +
        '<span class="kl-terms">' + FEATURED_TERMS.filter(function (id) { return byId[id]; }).slice(0, 3).map(function (id) {
          return '<span class="kl-term"><b>' + esc(byId[id].term) + '</b><span>' + esc(byId[id].def) + '</span></span>';
        }).join('') + '</span>' +
        '<span class="kl-btn">Open the glossary' + CHEV + '</span></a>';
      var rest = LIBS.slice(1).map(function (s, i) {
        var d = libs[s];
        return '<a class="kl-tile kl-up" href="' + BASE + s + '.html" data-d="' + Math.min(i + 1, 7) + '">' +
          '<span class="kl-k mono">' + plural(d, d.items.length) + '</span>' +
          '<span class="kl-tile-h">' + esc(d.title) + '</span>' +
          '<span class="kl-tile-p">' + esc(d.line) + '</span>' +
          '<span class="kl-go">Open' + CHEV + '</span></a>';
      }).join('');
      $('klLibs').innerHTML = feat + rest;
    }

    // One search across every library: the top three from each, then a link
    // to the rest in that library.
    function search() {
      var q = this.value.trim().toLowerCase();
      var box = $('klResults');
      $('klLibs').hidden = !!q;
      box.hidden = !q;
      if (!q) { box.innerHTML = ''; return; }
      var groups = LIBS.map(function (s) {
        var d = libs[s];
        var hits = d.items.filter(function (it) { return it._hay.indexOf(q) > -1; });
        return { s: s, d: d, hits: hits };
      }).filter(function (g) { return g.hits.length; });
      var total = groups.reduce(function (n, g) { return n + g.hits.length; }, 0);
      if (!total) {
        box.innerHTML = '<p class="kl-empty">Nothing in the library matches "' + esc(this.value.trim()) + '". Try a shorter word.</p>';
        return;
      }
      box.innerHTML = '<p class="kl-result mono" aria-live="polite">' + total + ' result' + (total === 1 ? '' : 's') + ' in ' + groups.length + ' librar' + (groups.length === 1 ? 'y' : 'ies') + '</p>' +
        '<div class="kl-groups">' + groups.map(function (g) {
          var url = BASE + g.s + '.html';
          return '<section class="kl-group"><header><h2>' + esc(g.d.title) + '</h2><span class="mono">' + g.hits.length + '</span></header><ul>' +
            g.hits.slice(0, 3).map(function (it) {
              var h = headOf(g.d, it), sn = snippetOf(g.d, it);
              if (g.d.layout === 'quote') h = '"' + h + '"';
              return '<li><a href="' + url + '#' + esc(it.id) + '"><b>' + esc(h) + '</b>' + (sn ? '<span>' + esc(sn) + '</span>' : '') + '</a></li>';
            }).join('') + '</ul>' +
            (g.hits.length > 3 ? '<a class="kl-all" href="' + url + '?q=' + encodeURIComponent(q) + '">See all ' + g.hits.length + ' in ' + esc(g.d.title) + CHEV + '</a>' : '') +
            '</section>';
        }).join('') + '</div>';
    }
  }
})();
