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
     the featured card (the same card, larger, with its illustration beside
     the text), then the live cards, the five stages and a quieter Coming soon
     row. In the Hub, a Members band sits above the library.
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
     Drawn with classes only (colours come from each page's skin). No text in
     SVG: the wrapper guide's labels are HTML. */
  var SVG = '<svg class="gt-svg" viewBox="0 0 300 100" preserveAspectRatio="xMidYMax meet" focusable="false">';
  var ART = {
    lines: function (big) {
      if (big) return '<svg class="gt-svg" viewBox="0 0 400 150" preserveAspectRatio="xMidYMax meet" focusable="false">' +
        '<line class="s-pale" x1="10" y1="146" x2="390" y2="146"/>' +
        '<path class="f-pale t-fade" d="M10 144 C 140 132, 250 92, 378 18 L 378 70 C 290 108, 200 132, 120 145 Z"/>' +
        '<path class="s-main w3 t-draw2" d="M10 144 C 140 132, 250 92, 378 18"/>' +
        '<path class="s-main w2 dash o5 t-draw2 d2" d="M120 145 C 200 132, 290 108, 378 70"/>' +
        '<circle class="f-acc t-blink" cx="378" cy="18" r="6"/><circle class="f-main o5" cx="378" cy="70" r="4.5"/></svg>';
      return SVG + '<line class="s-pale" x1="10" y1="96" x2="290" y2="96"/>' +
        '<path class="s-main w3 t-draw2" d="M10 94 C 100 86, 180 58, 280 12"/>' +
        '<path class="s-main w2 dash o5 t-draw2 d2" d="M90 95 C 170 90, 220 74, 280 50"/>' +
        '<circle class="f-acc t-blink" cx="280" cy="12" r="4.5"/></svg>';
    },
    rings: function () {
      return SVG + '<circle class="s-pale w2" cx="150" cy="54" r="34"/>' +
        '<circle class="f-acc t-blink" cx="150" cy="54" r="8"/>' +
        '<circle class="f-main" cx="150" cy="20" r="5"/><circle class="f-main" cx="184" cy="54" r="5"/>' +
        '<circle class="f-main" cx="150" cy="88" r="5"/><circle class="f-main" cx="116" cy="54" r="5"/></svg>';
    },
    bars: function () {
      return '<span class="gt-bars">' + [['ISA', 'b1'], ['Pension', 'b2'], ['LISA', 'b3']].map(function (b, i) {
        return '<span class="gt-bar"><b>' + (i + 1) + ' &middot; ' + b[0] + '</b><i><s class="' + b[1] + ' t-fillL' + (i ? ' d' + (i * 2) : '') + '"></s></i></span>';
      }).join('') + '</span>';
    },
    lab: function () {
      return SVG + '<line class="s-pale" x1="10" y1="96" x2="290" y2="96"/>' +
        '<line class="s-acc w2 dash" x1="10" y1="40" x2="290" y2="40"/>' +
        '<rect class="f-soft t-riseL" x="40" y="20" width="30" height="76" rx="5"/>' +
        '<rect class="f-soft t-riseL d1" x="86" y="58" width="30" height="38" rx="5"/>' +
        '<rect class="f-soft t-riseL d2" x="132" y="72" width="30" height="24" rx="5"/>' +
        '<rect class="f-acc t-riseL d3" x="184" y="40" width="30" height="56" rx="5"/>' +
        '<rect class="f-acc t-riseL d4" x="230" y="40" width="30" height="56" rx="5"/></svg>';
    },
    fan: function () {
      return SVG + '<line class="s-pale" x1="10" y1="96" x2="290" y2="96"/>' +
        '<path class="f-pale t-fade" d="M20 80 C 120 70, 200 40, 280 8 L 280 70 C 200 70, 120 76, 20 80 Z"/>' +
        '<path class="s-main w3 t-draw2" d="M20 80 C 120 66, 200 52, 280 38"/>' +
        '<circle class="f-acc t-blink" cx="280" cy="38" r="4.5"/></svg>';
    },
    house: function () {
      return SVG + '<line class="s-pale" x1="10" y1="96" x2="290" y2="96"/>' +
        '<path class="s-main w2 t-draw2" d="M30 96 V50 L82 14 L134 50 V96 Z M68 96 V70 H96 V96"/>' +
        '<rect class="f-tile t-riseL" x="176" y="70" width="20" height="26" rx="4"/>' +
        '<rect class="f-tile t-riseL d1" x="206" y="54" width="20" height="42" rx="4"/>' +
        '<rect class="f-main t-riseL d2" x="236" y="38" width="20" height="58" rx="4"/>' +
        '<rect class="f-acc t-riseL d3" x="266" y="20" width="20" height="76" rx="4"/></svg>';
    },
    steps: function () {
      return SVG + [78, 62, 46, 30, 14].map(function (y, i) {
        return '<rect class="' + (i === 4 ? 'f-acc' : i > 1 ? 'f-main' : 'f-tile') + ' t-riseL' + (i ? ' d' + i : '') + '" x="' + (22 + i * 54) + '" y="' + y + '" width="38" height="' + (96 - y) + '" rx="6"/>';
      }).join('') + '</svg>';
    }
  };
  function art(it, big, mode) {
    return '<span class="gt-art ' + kindClass(it) + '" aria-hidden="true"><span class="gt-ring r1"></span><span class="gt-ring r2 t-s32"></span>' +
      (ART[it.art] ? ART[it.art](big) : '') + '</span>';
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
  // one card; the rest run three a row when they fill it, else two. Without a
  // featured card: three a row. Below 1100px: featured across, cards two a row.
  GT.layout = function (hasLead, n) {
    var wide;
    if (hasLead) {
      var rest = Math.max(n - 1, 0);
      wide = n ? [4].concat(spans(rest, rest % 3 === 0 ? 3 : 2)) : [];
    } else wide = spans(n, 3);
    var narrow = spans(n, 2);
    return { lead: { w: n ? 8 : 12 }, tiles: wide.map(function (w, i) { return { w: w, n: narrow[i] }; }) };
  };

  /* ---------- Cards ---------- */
  // The featured card: the same card, larger, its illustration beside the text.
  GT.lead = function (it, mode, w, d) {
    var live = it.status === 'live' && hrefFor(it, mode);
    var tag = live ? 'a' : 'div';
    return '<' + tag + ' class="gt-card is-feat ' + kindClass(it) + (it.members ? ' is-members' : '') + ' gt-up press' + (live ? ' lift" href="' + esc(hrefFor(it, mode)) + '"' : ' is-soon" aria-disabled="true"') +
      attrs(it) + ' data-w="' + w + '" data-n="12" data-d="' + d + '">' + art(it, true, mode) +
      '<span class="gt-body">' + tags(it, mode) + '<h3 class="gt-h">' + esc(it.title) + '</h3><span class="gt-p">' + esc(it.desc) + '</span>' +
      '<span class="gt-foot"><span class="gt-btn">' + esc(it.cta) + (live ? CHEV : '') + '</span>' +
      (live && it.time ? '<span class="gt-time">' + esc(it.time) + '</span>' : '') + '</span></span></' + tag + '>';
  };
  // A live card: illustration panel on top, then the text.
  GT.tile = function (it, mode, lay, d) {
    return '<a class="gt-card ' + kindClass(it) + ' gt-up lift press" href="' + esc(hrefFor(it, mode)) + '"' + attrs(it) +
      ' data-w="' + lay.w + '" data-n="' + lay.n + '" data-d="' + d + '">' + art(it, false, mode) +
      '<span class="gt-body">' + tags(it, mode) + '<h3 class="gt-h">' + esc(it.title) + '</h3><span class="gt-p">' + esc(it.desc) + '</span>' +
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
  GT.renderTopics = function (data) {
    return ['All topics'].concat(data.topics).map(function (t, i) {
      return '<button type="button" class="gt-topic press" aria-pressed="' + (i ? 'false' : 'true') + '">' + esc(t) + '</button>';
    }).join('');
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
    var topic = 'All topics', kind = 'All';
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
        var ok = (kind === 'All' || el.getAttribute('data-kind') === kind) &&
          (topic === 'All topics' || el.getAttribute('data-topics').split('|').indexOf(topic) > -1) &&
          (!q || el.gtText.indexOf(q) > -1);
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
        $('gt-empty').textContent = 'The guides and tools did not load. Please refresh the page.';
        $('gt-empty').hidden = false;
      });
  } else wire();
})(typeof window !== 'undefined' ? window : this);
