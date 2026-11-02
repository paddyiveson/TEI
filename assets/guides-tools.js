/* Guides & Tools: one list, two pages (V2, Nov 2026).
   The list is /assets/guides-tools.json. This file renders it and runs the
   search and filters, on the public page (/guides.html) and on the Client Hub
   copy (/hub/guides.html). Each page says which it is with
   data-gt-mode="public" or "hub" on its .gt wrapper.

   Public: the cards are already written into the page (for JS off and search
   engines) by scripts/build-guides-tools.js, which uses the render functions
   below, so the markup and this file cannot drift. This file only filters.
   Hub: the page holds empty containers; this file fills them from the JSON,
   then filters the same way.

   Three tiers (spec 1.7, Listing pages): the lead card (navy, the only glow in
   its section), the live tiles, then the Coming soon row (not links). Tile
   widths follow the Suite's spans(): every row beside the lead fills, and an
   odd last tile spans its row. Widths sit in data-w (from 1100px) and data-n
   (below 1100px, two a row), so the page needs no inline styles. */
(function (root) {
  'use strict';

  var GT = {};
  var CHEV = '<svg class="gt-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function kindClass(it) { return it.kind === 'Tools' ? 'is-tool' : 'is-guide'; }
  function kindWord(it) { return it.kind === 'Tools' ? 'Tool' : 'Guide'; }
  function hrefFor(it, mode) { return mode === 'hub' ? it.hubHref : it.href; }
  function attrs(it) {
    return ' data-id="' + esc(it.id) + '" data-kind="' + esc(it.kind) + '" data-topics="' + esc(it.topics.join('|')) + '"';
  }
  function tags(it, mode) {
    return '<span class="gt-tags"><span class="gt-tag ' + kindClass(it) + '"><i aria-hidden="true"></i>' + kindWord(it) + '</span>' +
      (mode === 'hub' && it.members ? '<span class="gt-tag is-m">Members</span>' : '') + '</span>';
  }

  /* ---------- Which items show on which page ---------- */
  GT.items = function (data, mode) {
    return data.items.filter(function (it) { return mode === 'hub' || !it.members; });
  };
  GT.parts = function (data, mode) {
    var list = GT.items(data, mode);
    return {
      members: list.filter(function (it) { return it.members && it.status === 'live'; }),
      lead: list.filter(function (it) { return !it.members && it.tier === 'lead'; })[0] || null,
      tiles: list.filter(function (it) { return !it.members && it.tier === 'tile'; }),
      soon: list.filter(function (it) { return it.tier === 'soon'; })
    };
  };

  /* ---------- Spans (the Suite's spans()) ---------- */
  // n cards, cols a row, on a 12-column grid: full rows share the width
  // equally, and the cards of a short last row share its width.
  function spans(n, cols) {
    var out = [], full = n - (n % cols), w = 12 / cols;
    for (var i = 0; i < n; i++) out.push(i < full ? w : Math.floor(12 / (n - full)));
    return out;
  }
  GT.spans = spans;
  // From 1100px: the lead takes half the width (two rows when it has up to
  // four tiles beside it, two a row); the rest run three a row. Below 1100px:
  // the lead spans the row and the tiles sit two a row.
  GT.layout = function (hasLead, n) {
    var wide = [], lead = null;
    if (hasLead) {
      var beside = Math.min(n, 4);
      lead = { w: beside ? 6 : 12, rows: beside > 2 ? 2 : 1 };
      spans(beside, 2).forEach(function (s) { wide.push(s / 2); });
      spans(n - beside, 3).forEach(function (s) { wide.push(s); });
    } else wide = spans(n, 3);
    var narrow = spans(n, 2);
    return { lead: lead, tiles: wide.map(function (w, i) { return { w: w, n: narrow[i] }; }) };
  };

  /* ---------- Cards ---------- */
  // The lead card: text on the left, its figures (or, for a members' tool,
  // three points) stacked on the right. The whole card is the link.
  GT.lead = function (it, mode, lay, d) {
    var side = '';
    if (it.figures) {
      side = '<span class="gt-figs">' + it.figures.items.slice(0, 3).map(function (f) {
        return '<span class="gt-fig"><b>' + esc(f.value) + '</b><span>' + esc(f.label) + '</span></span>';
      }).join('') + '<span class="gt-figs-k">Worked example: ' + esc(it.figures.note) + '</span></span>';
    } else if (it.points) {
      side = '<span class="gt-figs is-pts">' + it.points.slice(0, 3).map(function (p) {
        return '<span class="gt-fig"><b>' + esc(p.label) + '</b><span>' + esc(p.text) + '</span></span>';
      }).join('') + '</span>';
    }
    return '<a class="gt-lead gt-up press" href="' + esc(hrefFor(it, mode)) + '"' + attrs(it) +
      ' data-w="' + lay.w + '" data-rows="' + lay.rows + '" data-n="12" data-d="' + d + '">' +
      '<span class="gt-lead-t">' + tags(it, mode) +
      '<h3 class="gt-lead-h">' + esc(it.title) + '</h3><span class="gt-lead-p">' + esc(it.desc) + '</span>' +
      '<span class="gt-lead-go"><span class="gt-btn">' + esc(it.cta) + CHEV + '</span>' +
      (it.time ? '<span class="gt-time">' + esc(it.time) + '</span>' : '') + '</span></span>' + side + '</a>';
  };
  // A live tile: a coloured top edge and tag by kind (Tool gold, Guide powder blue).
  GT.tile = function (it, mode, lay, d) {
    return '<a class="gt-tile ' + kindClass(it) + ' gt-up lift press" href="' + esc(hrefFor(it, mode)) + '"' + attrs(it) +
      ' data-w="' + lay.w + '" data-n="' + lay.n + '" data-d="' + d + '">' + tags(it, mode) +
      '<h3 class="gt-tile-h">' + esc(it.title) + '</h3><span class="gt-tile-p">' + esc(it.desc) + '</span>' +
      '<span class="gt-tile-go"><span class="gt-cta">' + esc(it.cta) + CHEV + '</span>' +
      (it.time ? '<span class="gt-time">' + esc(it.time) + '</span>' : '') + '</span></a>';
  };
  // Coming soon: a compact chip, never a link, no read time.
  GT.soonChip = function (it, mode) {
    return '<li class="gt-sc ' + kindClass(it) + '" aria-disabled="true"' + attrs(it) + '>' +
      '<span class="gt-sc-top"><span class="gt-sc-k"><i aria-hidden="true"></i>' + kindWord(it) + '</span>' +
      (mode === 'hub' && it.members ? '<span class="gt-tag is-m">Members</span>' : '') + '</span>' +
      '<span class="gt-sc-h">' + esc(it.title) + '</span><span class="gt-sc-p">' + esc(it.short || it.desc) + '</span></li>';
  };

  /* ---------- Page parts ---------- */
  GT.renderLibrary = function (data, mode) {
    var p = GT.parts(data, mode), lay = GT.layout(!!p.lead, p.tiles.length), html = '', d = 0;
    if (p.lead) html += GT.lead(p.lead, mode, lay.lead, d++);
    p.tiles.forEach(function (it, i) { html += GT.tile(it, mode, lay.tiles[i], Math.min(d++, 7)); });
    return html;
  };
  GT.renderMembers = function (data) {
    return GT.parts(data, 'hub').members.map(function (it, i) {
      return GT.lead(it, 'hub', { w: 12, rows: 1 }, Math.min(i, 7));
    }).join('');
  };
  GT.renderSoon = function (data, mode) {
    return GT.parts(data, mode).soon.map(function (it) { return GT.soonChip(it, mode); }).join('');
  };
  GT.renderTopics = function (data) {
    return ['All topics'].concat(data.topics).map(function (t, i) {
      return '<button type="button" class="gt-topic press" aria-pressed="' + (i ? 'false' : 'true') + '">' + esc(t) + '</button>';
    }).join('');
  };
  GT.countText = function (n) { return n + (n === 1 ? ' guide or tool' : ' guides and tools'); };
  GT.renderCount = function (data, mode) { return GT.countText(GT.items(data, mode).length); };

  if (typeof module !== 'undefined' && module.exports) { module.exports = GT; return; }
  root.TeiGuidesTools = GT;

  /* ---------- In the browser: fill (Hub) and filter (both) ---------- */
  var page = document.querySelector('[data-gt-mode]');
  if (!page) return;
  var mode = page.getAttribute('data-gt-mode');
  function $(id) { return document.getElementById(id); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function wire() {
    var search = $('gt-search'), count = $('gt-count'), empty = $('gt-empty');
    var lib = $('gt-lib'), libSec = $('gt-lib-sec'), soon = $('gt-soon'), mem = $('gt-members');
    var items = page.querySelectorAll('[data-kind][data-topics]');
    var topic = 'All topics', kind = 'All';
    // What the search looks at: title, description, kind and topics.
    each(items, function (el) {
      el.gtText = (el.textContent + ' ' + el.getAttribute('data-kind') + ' ' + el.getAttribute('data-topics').split('|').join(' ')).toLowerCase();
    });

    function relayout() {
      var lead = lib.querySelector('.gt-lead:not([hidden])');
      var tiles = lib.querySelectorAll('.gt-tile:not([hidden])');
      var lay = GT.layout(!!lead, tiles.length);
      if (lead) { lead.setAttribute('data-w', lay.lead.w); lead.setAttribute('data-rows', lay.lead.rows); }
      each(tiles, function (t, i) { t.setAttribute('data-w', lay.tiles[i].w); t.setAttribute('data-n', lay.tiles[i].n); });
      lib.hidden = !lead && !tiles.length;
    }
    function apply() {
      var q = search ? search.value.trim().toLowerCase() : '', shown = 0;
      each(items, function (el) {
        var ok = (kind === 'All' || el.getAttribute('data-kind') === kind) &&
          (topic === 'All topics' || el.getAttribute('data-topics').split('|').indexOf(topic) > -1) &&
          (!q || el.gtText.indexOf(q) > -1);
        el.hidden = !ok;
        if (ok) shown++;
      });
      relayout();
      if (mem) $('gt-members-sec').hidden = !mem.querySelector('[data-kind]:not([hidden])');
      if (soon) soon.hidden = !soon.querySelector('[data-kind]:not([hidden])');
      if (libSec) libSec.classList.toggle('is-empty', lib.hidden);
      count.textContent = GT.countText(shown);
      empty.hidden = shown !== 0;
    }
    function press(group, chosen) {
      each(group.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b === chosen ? 'true' : 'false'); });
    }
    $('gt-topics').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      topic = b.textContent; press(this, b); apply();
    });
    $('gt-kinds').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      kind = b.getAttribute('data-v'); press(this, b); apply();
    });
    if (search) search.addEventListener('input', apply);
    // ?show=Guides or ?show=Tools (the Client Hub home's "All guides" and "All tools").
    var show = null;
    try { show = new URLSearchParams(location.search).get('show'); } catch (e) {}
    if (show === 'Guides' || show === 'Tools') $('gt-kinds').querySelector('[data-v="' + show + '"]').click();
    page.classList.add('gt-ready');
  }

  if (mode === 'hub') {
    fetch('/assets/guides-tools.json', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        $('gt-topics').innerHTML = GT.renderTopics(data);
        $('gt-members').innerHTML = GT.renderMembers(data);
        $('gt-lib').innerHTML = GT.renderLibrary(data, 'hub');
        $('gt-soon-l').innerHTML = GT.renderSoon(data, 'hub');
        $('gt-count').textContent = GT.renderCount(data, 'hub');
        wire();
      })
      .catch(function () {
        $('gt-lib').innerHTML = '';
        $('gt-empty').textContent = 'The guides and tools did not load. Please refresh the page.';
        $('gt-empty').hidden = false;
      });
  } else wire();
})(typeof window !== 'undefined' ? window : this);
