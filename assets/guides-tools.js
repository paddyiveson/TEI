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

   The page is the Guides & Tools look (illustrated cards). The flow:
     the featured card (Five Stages since Stage 2, 20 Nov 2026: the same card,
     larger, its illustration beside the text and the five stage names as a
     step line), then the live cards and a quieter Coming soon row. In the
     Hub, a Members band sits above the library. Filters: the Guides / Tools
     toggle and the search (topics stay in the JSON for the search).
   Every live card carries a "Use this when..." line (useWhen in the JSON).
   Card widths sit in data-w (from 1100px) and data-n (below 1100px), so the
   page needs no inline styles; every row fills and an odd last card spans
   its row. */
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

  /* ---------- Illustrations ----------
     The pictures live in /assets/tei-art.js (shared with the Articles page).
     The Hub page loads it before this file; the build script requires it. */
  function ART_SET() {
    return typeof module !== 'undefined' && module.exports ? require('./tei-art.js').ART : root.TeiArt.ART;
  }
  function art(it, big, mode) {
    return '<span class="gt-art ' + kindClass(it) + '" aria-hidden="true"><span class="gt-ring r1"></span><span class="gt-ring r2 t-s32"></span>' +
      (ART_SET()[it.art] ? ART_SET()[it.art](big) : '') + '</span>';
  }
  function tags(it, mode) {
    return '<span class="gt-tags">' + (mode === 'hub' && it.members ? '<span class="gt-tag is-m">Members</span>' : '') +
      '<span class="gt-tag ' + kindClass(it) + '">' + kindWord(it) + '</span></span>';
  }

  /* ---------- Which items show where ---------- */
  // "public": false keeps an item off the public page only (Pension vs LISA
  // is an article, listed on /articles.html; the Hub still shows it).
  GT.items = function (data, mode) {
    return data.items.filter(function (it) { return mode === 'hub' || (!it.members && it.public !== false); });
  };
  GT.parts = function (data, mode) {
    var list = GT.items(data, mode);
    return {
      members: list.filter(function (it) { return it.members; }),
      lead: list.filter(function (it) { return !it.members && it.tier === 'lead'; })[0] || null,
      tiles: list.filter(function (it) { return !it.members && it.tier === 'tile'; }),
      soon: list.filter(function (it) { return !it.members && it.tier === 'soon'; })
    };
  };

  /* ---------- Widths ---------- */
  // The Suite's spans(): n cards, cols a row, on 12 columns; full rows share
  // the width, and the cards of a short last row share its width.
  function spans(n, cols) {
    var out = [], full = n - (n % cols), w = 12 / cols;
    for (var i = 0; i < n; i++) out.push(i < full ? w : Math.floor(12 / (n - full)));
    return out;
  }
  GT.spans = spans;
  // From 1100px: the featured card takes two thirds of the first row beside
  // one card; the rest run three a row when they fill it, else two. With
  // exactly two other cards, the featured card takes the whole row and the
  // two share the next (else one would sit alone under it). Without a
  // featured card: three a row. Below 1100px: featured across, cards two a row.
  GT.layout = function (hasLead, n) {
    var wide;
    if (hasLead && n === 2) {
      return { lead: { w: 12 }, tiles: [{ w: 6, n: 6 }, { w: 6, n: 6 }] };
    }
    if (hasLead) {
      var rest = Math.max(n - 1, 0);
      wide = n ? [4].concat(spans(rest, rest % 3 === 0 ? 3 : 2)) : [];
    } else wide = spans(n, 3);
    // Below 1100px, two a row. With a featured card and an odd number of
    // cards, the first (the one beside the featured card on desktop) spans
    // the row under it, so the rest pair up as they do on desktop.
    var narrow = hasLead && n % 2 ? [12].concat(spans(n - 1, 2)) : spans(n, 2);
    return { lead: { w: n ? 8 : 12 }, tiles: wide.map(function (w, i) { return { w: w, n: narrow[i] }; }) };
  };

  /* ---------- Cards ---------- */
  // "Use this when...": shown in full on every width, under the description.
  function useWhen(it) { return it.useWhen ? '<span class="gt-use">' + esc(it.useWhen) + '</span>' : ''; }
  // The stage names as a step line (the Five Stages feature). A list inside
  // the card link is valid HTML; nothing in it is interactive.
  function steps(it) {
    return it.steps && it.steps.length ? '<ol class="gt-steps">' + it.steps.map(function (s) { return '<li><i aria-hidden="true"></i>' + esc(s) + '</li>'; }).join('') + '</ol>' : '';
  }
  // The featured card: the same card, larger, its illustration beside the
  // text, on the shared feature surface (g-feature is-lift: the one card in
  // the section that glows).
  GT.lead = function (it, mode, w, d) {
    var live = it.status === 'live' && hrefFor(it, mode);
    var tag = live ? 'a' : 'div';
    return '<' + tag + ' class="gt-card is-feat g-feature is-lift ' + kindClass(it) + (it.steps ? ' has-steps' : '') + (it.members ? ' is-members' : '') + ' gt-up press' + (live ? ' lift" href="' + esc(hrefFor(it, mode)) + '"' : ' is-soon" aria-disabled="true"') +
      attrs(it) + ' data-w="' + w + '" data-n="12" data-d="' + d + '">' + art(it, true, mode) +
      '<span class="gt-body">' + tags(it, mode) + '<h3 class="gt-h">' + esc(it.title) + '</h3><span class="gt-p">' + esc(it.desc) + '</span>' +
      useWhen(it) + steps(it) +
      '<span class="gt-foot"><span class="gt-btn">' + esc(it.cta) + (live ? CHEV : '') + '</span>' +
      (live && it.time ? '<span class="gt-time">' + esc(it.time) + '</span>' : '') + '</span></span></' + tag + '>';
  };
  // A live card: illustration panel on top, then the text.
  GT.tile = function (it, mode, lay, d) {
    return '<a class="gt-card ' + kindClass(it) + ' gt-up lift press" href="' + esc(hrefFor(it, mode)) + '"' + attrs(it) +
      ' data-w="' + lay.w + '" data-n="' + lay.n + '" data-d="' + d + '">' + art(it, false, mode) +
      '<span class="gt-body">' + tags(it, mode) + '<h3 class="gt-h">' + esc(it.title) + '</h3><span class="gt-p">' + esc(it.desc) + '</span>' + useWhen(it) +
      '<span class="gt-foot"><span class="gt-cta">' + esc(it.cta) + CHEV + '</span>' +
      (it.time ? '<span class="gt-time">' + esc(it.time) + '</span>' : '') + '</span></span></a>';
  };
  // A members' tool that is not live yet: the same card, quieter, not a link.
  GT.soonCard = function (it, mode, w, d) {
    return '<div class="gt-card is-soon ' + kindClass(it) + (it.members ? ' is-members' : '') + ' gt-up" aria-disabled="true"' + attrs(it) +
      ' data-w="' + w + '" data-n="12" data-d="' + d + '">' + art(it, false, mode) +
      '<span class="gt-body">' + tags(it, mode) + '<h3 class="gt-h">' + esc(it.title) + '</h3><span class="gt-p">' + esc(it.desc) + '</span>' +
      '<span class="gt-foot"><span class="gt-soon-k">Coming soon</span></span></span></div>';
  };
  // Coming soon: a compact chip, never a link, no read time.
  GT.soonChip = function (it, mode) {
    return '<li class="gt-sc ' + kindClass(it) + '" aria-disabled="true"' + attrs(it) + '>' +
      '<span class="gt-sc-k"><i aria-hidden="true"></i>' + kindWord(it) + '</span>' +
      '<span class="gt-sc-h">' + esc(it.title) + '</span><span class="gt-sc-p">' + esc(it.short || it.desc) + '</span></li>';
  };

  /* ---------- Page parts ---------- */
  GT.renderLibrary = function (data, mode) {
    var p = GT.parts(data, mode), lay = GT.layout(!!p.lead, p.tiles.length), html = '', d = 0;
    if (p.lead) html += GT.lead(p.lead, mode, lay.lead.w, d++);
    p.tiles.forEach(function (it, i) { html += GT.tile(it, mode, lay.tiles[i], Math.min(d++, 7)); });
    return html;
  };
  // The Members band: live tools as featured cards, then the ones coming soon.
  GT.renderMembers = function (data) {
    var m = GT.parts(data, 'hub').members, live = m.filter(function (it) { return it.status === 'live'; }), soon = m.filter(function (it) { return it.status !== 'live'; });
    var w = GT.membersLayout(live.length, soon.length), i = 0;
    return live.map(function (it) { return GT.lead(it, 'hub', w[i++], Math.min(i, 7)); }).join('') +
      soon.map(function (it) { return GT.soonCard(it, 'hub', w[i++], Math.min(i, 7)); }).join('');
  };
  // One live tool beside one coming soon: 8 and 4. Otherwise the row shares out.
  GT.membersLayout = function (live, soon) {
    var n = live + soon;
    if (live === 1 && soon === 1) return [8, 4];
    return n === 1 ? [12] : spans(n, n >= 3 ? 3 : 2);
  };
  GT.renderSoon = function (data, mode) {
    return GT.parts(data, mode).soon.map(function (it) { return GT.soonChip(it, mode); }).join('');
  };
  GT.countText = function (n) { return n + (n === 1 ? ' guide or tool' : ' guides and tools'); };
  GT.renderCount = function (data, mode) {
    var p = GT.parts(data, mode);
    return GT.countText((p.lead ? 1 : 0) + p.tiles.length + p.soon.length);
  };

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
    var lib = $('gt-lib'), soon = $('gt-soon'), mem = $('gt-members');
    var items = page.querySelectorAll('[data-kind][data-topics]');
    var kind = 'All';
    // What the search looks at: title, description, kind and topics.
    each(items, function (el) {
      el.gtText = (el.textContent + ' ' + el.getAttribute('data-kind') + ' ' + el.getAttribute('data-topics').split('|').join(' ')).toLowerCase();
    });

    function relayout() {
      var lead = lib.querySelector('.is-feat:not([hidden])');
      var tiles = lib.querySelectorAll('.gt-card:not(.is-feat):not([hidden])');
      var lay = GT.layout(!!lead, tiles.length);
      if (lead) lead.setAttribute('data-w', lay.lead.w);
      each(tiles, function (t, i) { t.setAttribute('data-w', lay.tiles[i].w); t.setAttribute('data-n', lay.tiles[i].n); });
      lib.hidden = !lead && !tiles.length;
      if (mem) {
        var live = mem.querySelectorAll('.gt-card:not(.is-soon):not([hidden])'), later = mem.querySelectorAll('.gt-card.is-soon:not([hidden])');
        var w = GT.membersLayout(live.length, later.length), i = 0;
        each(live, function (c) { c.setAttribute('data-w', w[i++]); });
        each(later, function (c) { c.setAttribute('data-w', w[i++]); });
        $('gt-members-sec').hidden = !(live.length + later.length);
      }
    }
    function apply() {
      var q = search ? search.value.trim().toLowerCase() : '', shown = 0;
      each(items, function (el) {
        var ok = (kind === 'All' || el.getAttribute('data-kind') === kind) && (!q || el.gtText.indexOf(q) > -1);
        el.hidden = !ok;
        // The library count covers the library and Coming soon; the Members band has its own heading.
        if (ok && !(mem && mem.contains(el))) shown++;
      });
      relayout();
      if (soon) soon.hidden = !soon.querySelector('[data-kind]:not([hidden])');
      count.textContent = GT.countText(shown);
      var any = shown || (mem && mem.querySelector('[data-kind]:not([hidden])'));
      empty.hidden = !!any;
    }
    function press(group, chosen) {
      each(group.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b === chosen ? 'true' : 'false'); });
    }
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
        $('gt-members').innerHTML = GT.renderMembers(data);
        $('gt-lib').innerHTML = GT.renderLibrary(data, 'hub');
        $('gt-soon-l').innerHTML = GT.renderSoon(data, 'hub');
        $('gt-count').textContent = GT.renderCount(data, 'hub');
        wire();
      })
      .catch(function () {
        $('gt-empty').textContent = 'The guides and tools did not load. Please refresh the page.';
        $('gt-empty').hidden = false;
      });
  } else wire();
})(typeof window !== 'undefined' ? window : this);
