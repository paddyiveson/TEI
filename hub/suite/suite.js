/* Investment suite: the notes list and the note view (/hub/suite/index.html).
 *
 * The list reads /hub/suite/notes/manifest.json and shows four sections:
 * Growth Portfolio, Foundations, Top Ideas and Watchlist (grouped by theme).
 * A note opens on the same page (?note=<slug>): the note file loads into an
 * iframe that grows to the note's full height, so the page scrolls as one.
 * The iframe is same-origin, so the page reads the note's headings for the
 * contents rail and, on the pilot notes (WIDE), lays the note out on the wide
 * grid (note-wide.css) by pairing each run of text with the figure after it.
 */
(function () {
  var CATS = ['Growth Portfolio', 'Foundations', 'Top Ideas', 'Watchlist'];
  // Section descriptions: [wider screens, phones].
  var INTRO = {
    'Growth Portfolio': ['Long-term holdings at the forefront of technology, each carefully selected by the team.', 'Long-term holdings at the forefront of technology.'],
    'Foundations': ['The base of the portfolio, adding income and geographic diversification.', 'The base: income and geographic reach.'],
    'Top Ideas': ['Developing ideas, not yet held, that the team is following closely.', 'Developing ideas, followed closely.'],
    'Watchlist': ['Other ideas on the radar, grouped by theme.', 'Other ideas on the radar.']
  };
  // Notes laid out on the wide grid (pilot, Paddy 29 Oct 2026).
  var WIDE = { onds: 1, jepq: 1 };
  var THEMES = ['AI infrastructure', 'Semiconductors and lasers', 'Space and air mobility', 'Defence and sensing', 'Consumer, health and energy'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var RECENT_DAYS = 100;
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  var all = [], articles = [], cat = 'All', q = '', current = null, listY = 0, loaded = false, fromList = false;
  var mqPhone = window.matchMedia('(max-width:860px)');
  var mqMid = window.matchMedia('(max-width:1099px)');
  // Four cards a row need about 1280px for the one-line descriptions.
  var mqFour = window.matchMedia('(min-width:1280px)');

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hex(c) { return /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#14376E'; }
  function noteUrl(slug) { return '/hub/suite/index.html?note=' + encodeURIComponent(slug); }
  function bySlug(slug) { for (var i = 0; i < all.length; i++) if (all[i].slug === slug) return all[i]; return null; }
  function inCat(c) { return all.filter(function (x) { return x.category === c; }); }
  function mark(n) { return '<span class="mk" aria-hidden="true" style="--b:' + hex(n.brand) + '">' + esc(n.mark || String(n.name).slice(0, 2)) + '</span>'; }

  // "Updated Sep 2026" only while a note is recent; older dates add noise.
  function recent(n) {
    var m = String(n.updatedOn || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    return (Date.now() - d.getTime()) / 864e5 <= RECENT_DAYS ? MON[d.getMonth()] + ' ' + m[1] : '';
  }
  function upd(n) { var r = recent(n); return r ? '<span class="upd">Updated ' + esc(r) + '</span>' : ''; }

  // Spans that fill every row: full rows of `cols`, then the last row's cards
  // share its width (an odd last card spans the row).
  function spans(n, cols) {
    var out = [], full = n - (n % cols), w = 12 / cols;
    for (var i = 0; i < n; i++) out.push(i < full ? w : Math.floor(12 / (n - full)));
    return out;
  }
  function colsFor(kind) {
    var phone = mqPhone.matches, mid = mqMid.matches;
    if (kind === 'growth' || kind === 'top') return mqFour.matches ? 4 : 2;
    if (kind === 'fdn') return 2;
    return phone ? 1 : mid ? 2 : 3; // watchlist theme tiles
  }

  /* ---------- Cards ---------- */
  // cls: '' | 'is-lead' | 'is-wide'; rows: how many grid rows it spans.
  function growthCard(n, span, cls, rows) {
    var lead = cls === 'is-lead', text =
      '<span class="top"><span class="tk">' + esc(n.ticker) + '</span>' + upd(n) + '</span>' +
      '<span class="nm">' + esc(n.name) + '</span><span class="th">' + esc(n.summary) + '</span>' +
      (n.line ? '<span class="ln">' + esc(n.line) + '</span>' : '') +
      '<span class="go">Read the note' + CHEV + '</span>';
    return '<a class="su-gc press' + (cls ? ' ' + cls : '') + '" style="--span:' + span + (rows ? ';--rows:' + rows : '') + '" href="' + noteUrl(n.slug) + '" data-note="' + esc(n.slug) + '">' +
      (lead ? '<span class="lt">' + text + '</span>' + figures(n) : text) + '</a>';
  }
  // The lead card's three headline figures, copied from its note and dated.
  function figures(n) {
    if (!n.figures || !n.figures.length) return '';
    return '<span class="figs">' + n.figures.slice(0, 3).map(function (f) {
      return '<span class="fig"><b>' + esc(f.value) + '</b><span>' + esc(f.label) + '</span></span>';
    }).join('') + '<span class="figs-k">From the note, ' + esc(n.updated || '') + '</span></span>';
  }
  // Foundations: a tinted tile with its line.
  function fdnCard(n, span, i) {
    return '<a class="su-fc press' + (i ? ' alt' : '') + '" style="--span:' + span + '" href="' + noteUrl(n.slug) + '" data-note="' + esc(n.slug) + '">' +
      '<span class="top">' + mark(n) + '<span class="tk">' + esc(n.ticker) + '</span></span>' +
      '<span class="nm">' + esc(n.name) + '</span><span class="th">' + esc(n.summary) + '</span>' +
      (n.line ? '<span class="ln">' + esc(n.line) + '</span>' : '') +
      '<span class="go">What it is, cost and risks' + CHEV + '</span></a>';
  }
  // Top Ideas: a small card, smaller than Growth's: ticker, name, theme.
  function ideaCard(n, span) {
    return '<a class="su-ic press" style="--span:' + span + '" href="' + noteUrl(n.slug) + '" data-note="' + esc(n.slug) + '">' +
      '<span class="tk">' + esc(n.ticker) + '</span><span class="nm">' + esc(n.name) + '</span><span class="th">' + esc(n.summary) + '</span></a>';
  }
  // Watchlist: each company as a pill inside its theme's tile.
  function pill(n) {
    return '<a class="su-pl press" href="' + noteUrl(n.slug) + '" data-note="' + esc(n.slug) + '" title="' + esc(n.ticker + ' · ' + n.summary) + '">' +
      '<span class="i" aria-hidden="true">' + esc(n.mark || String(n.name).slice(0, 2)) + '</span>' + esc(n.name) + '</a>';
  }
  // Growth sizes, like the Hub home: a lead card, then smaller ones. Wide
  // screens: the lead two rows deep beside four cards, then a row of three.
  // Narrower: the lead across the top, then pairs, an odd last one wide.
  function growthLayout(n) {
    if (n < 5) return spans(n, colsFor('growth')).map(function (sp) { return { span: sp, cls: sp >= 6 ? 'is-wide' : '' }; });
    var out = [];
    if (mqFour.matches) {
      out.push({ span: 6, cls: 'is-lead', rows: 2 });
      for (var i = 0; i < 4; i++) out.push({ span: 3, cls: '' });
      spans(n - 5, 3).forEach(function (sp) { out.push({ span: sp, cls: sp >= 6 ? 'is-wide' : '' }); });
    } else {
      out.push({ span: 12, cls: 'is-lead' });
      spans(n - 1, 2).forEach(function (sp) { out.push({ span: sp, cls: sp === 12 ? 'is-wide' : '' }); });
    }
    return out;
  }
  function row(n, meta) {
    return '<a class="su-wr press" href="' + noteUrl(n.slug) + '" data-note="' + esc(n.slug) + '"' + (current && current.slug === n.slug ? ' aria-current="true"' : '') + '>' + mark(n) +
      '<span class="b"><span class="n">' + esc(n.name) + '</span><span class="m">' + (meta ? esc(meta) : '<span class="mt">' + esc(n.ticker) + ' · </span>' + esc(n.summary)) + '</span></span>' + CHEV + '</a>';
  }

  /* ---------- The list ---------- */
  function matches(n) {
    return !q || (n.name + ' ' + n.ticker + ' ' + n.summary + ' ' + (n.theme || '') + ' ' + (n.line || '') + ' ' + n.category).toLowerCase().indexOf(q) >= 0;
  }
  function section(c, list) {
    var id = c.replace(/\W/g, '');
    var h = '<section class="su-sec" id="sec-' + id + '" data-sec="' + esc(c) + '" aria-labelledby="sh-' + id + '"><header class="su-sh"><h2 id="sh-' + id + '">' + esc(c) + '</h2><p>' + esc(INTRO[c][mqPhone.matches ? 1 : 0]) + '</p></header><div class="su-g">';
    if (c === 'Watchlist') {
      var groups = THEMES.map(function (t) { return { t: t, l: list.filter(function (n) { return n.theme === t; }) }; })
        .concat([{ t: 'Other', l: list.filter(function (n) { return THEMES.indexOf(n.theme) < 0; }) }])
        .filter(function (g) { return g.l.length; });
      var sp = spans(groups.length, colsFor('watch'));
      h += groups.map(function (g, i) {
        return '<div class="su-wt" style="--span:' + sp[i] + '"><div class="su-wt-h"><span class="lab">' + esc(g.t) + '</span><span class="c">' + g.l.length + '</span></div>' +
          '<div class="su-wt-l">' + g.l.map(pill).join('') + '</div></div>';
      }).join('');
    } else if (c === 'Growth Portfolio') {
      var lay = growthLayout(list.length);
      h += list.map(function (n, i) { return growthCard(n, lay[i].span, lay[i].cls, lay[i].rows); }).join('');
    } else if (c === 'Foundations') {
      var s2 = mqPhone.matches ? list.map(function () { return 12; }) : spans(list.length, 2);
      h += list.map(function (n, i) { return fdnCard(n, s2[i], i % 2); }).join('');
    } else {
      // Top Ideas: wide screens, a row of four then three a little wider;
      // phones, a row that swipes.
      if (mqPhone.matches) h += '<div class="su-sw" style="--span:12">' + list.map(function (n) { return ideaCard(n, 12); }).join('') + '</div>';
      else {
        var first = Math.min(4, list.length), sp4 = spans(first, 4).concat(spans(list.length - first, 3));
        if (list.length <= 4) sp4 = spans(list.length, Math.min(4, list.length));
        h += list.map(function (n, i) { return ideaCard(n, sp4[i]); }).join('');
      }
    }
    return h + '</div></section>';
  }
  // Phones: tabs that jump to each section and follow the scroll (every
  // section stays on the page). Wider screens: chips that filter.
  var TAB = { 'Growth Portfolio': 'Growth', 'Foundations': 'Foundations', 'Top Ideas': 'Top Ideas', 'Watchlist': 'Watchlist' };
  function renderList() {
    var tabs = mqPhone.matches;
    $('suCats').classList.toggle('is-tabs', tabs);
    $('suCats').setAttribute('aria-label', tabs ? 'Jump to a section' : 'Category');
    if (tabs) {
      $('suCats').innerHTML = CATS.map(function (k) { return '<button type="button" class="hb-chip" data-jump="' + esc(k) + '">' + esc(TAB[k]) + '</button>'; }).join('');
    } else $('suCats').innerHTML = ['All'].concat(CATS).map(function (k) {
      var n = k === 'All' ? all.length : inCat(k).length;
      return '<button type="button" class="hb-chip" data-cat="' + esc(k) + '" aria-pressed="' + (k === cat ? 'true' : 'false') + '">' + esc(k) + '<span class="n">' + n + '</span></button>';
    }).join('');
    if (!loaded) return;
    var show = tabs ? 'All' : cat;
    var html = CATS.filter(function (c) { return show === 'All' || show === c; }).map(function (c) {
      var list = inCat(c).filter(matches);
      return list.length ? section(c, list) : '';
    }).join('');
    $('suNotes').innerHTML = html || '<div class="su-empty">No notes match that yet. Try another word, or browse <a href="/hub/articles.html">members&#39; articles</a>.</div>';
  }

  /* ---------- Closing grid ---------- */
  function principlesCard() {
    return '<a class="su-cc champ press" href="/guides/principles.html?from=hub"><span class="k">Our principles</span><span class="h">The thinking behind every note</span>' +
      '<span class="s">Every note covers the same seven parts: what it does, thesis, the numbers, bull case, bear case, risks and valuation.</span><span class="go">Read our principles' + CHEV + '</span></a>';
  }
  function articleCard(a) {
    return '<a class="su-cc press" href="/hub/members/' + encodeURIComponent(a.slug) + '.html"><span class="k">Members&#39; article · ' + esc(a.readTime ? a.readTime + ' min read' : a.category) + '</span>' +
      '<span class="h">' + esc(a.short || a.title) + '</span><span class="s">' + esc(a.teaser || '') + '</span><span class="go">Read the article' + CHEV + '</span></a>';
  }
  function noteCard(n, label) {
    return '<a class="su-cc brand press" style="--b:' + hex(n.brand) + '" href="' + noteUrl(n.slug) + '" data-note="' + esc(n.slug) + '"><span class="k">' + esc(label) + '</span>' +
      '<span class="top">' + mark(n) + '<span class="h">' + esc(n.name) + '</span></span><span class="s">' + esc(n.line || n.summary) + '</span><span class="go">Read the note' + CHEV + '</span></a>';
  }
  function sessionCard(n) {
    return '<div class="su-cc feat"><span class="k">Your coach</span><span class="h">Raise it in your next session</span>' +
      '<span class="s">' + (n ? 'Questions this note leaves you with are a good place to start. Bring them to your next session and we will go through how ' + esc(n.name) + ' works together.' : 'Questions a note leaves you with are a good place to start. Bring them to your next session and we will go through how the business works together.') + '</span>' +
      // TODO(Paddy to confirm): link to the session question list once sessions carry questions.
      '<a class="btn press" href="/hub/index.html">Your sessions' + CHEV + '</a></div>';
  }
  // Desktop shows the principles in the header, so its third card is the
  // most recently updated note; phones show the principles card here instead.
  function latest() {
    return all.slice().sort(function (a, b) { return String(b.updatedOn || '').localeCompare(String(a.updatedOn || '')); })[0];
  }
  function renderListClose() {
    if (!loaded) return;
    var cards = articles.slice(0, 2).map(articleCard), l = latest();
    if (mqPhone.matches) cards.unshift(principlesCard());
    while (cards.length < 3 && l) { cards.push(noteCard(l, recent(l) ? 'Updated ' + recent(l) : 'Latest note')); l = null; }
    if (cards.length < 3) cards.push(principlesCard());
    $('suClose').innerHTML = '<h2 class="su-close-h" id="suCloseH">Keep going</h2><div class="su-cg">' + cards.join('') + sessionCard(null) + '</div>';
  }
  function nextOf(n) {
    var l = inCat(n.category), i = l.indexOf(n);
    if (i < l.length - 1) return { n: l[i + 1], label: 'Next in ' + n.category };
    var c = CATS[(CATS.indexOf(n.category) + 1) % CATS.length], nl = inCat(c);
    return nl.length ? { n: nl[0], label: 'Next: ' + c } : null;
  }
  function renderNoteClose(n) {
    var nx = nextOf(n), cards = [];
    if (nx) cards.push(noteCard(nx.n, nx.label));
    var rel = articles.filter(function (a) { return a.suiteNote === n.slug || a.ticker === n.ticker; })[0];
    cards.push(rel ? articleCard(rel) : (articles[0] ? articleCard(articles[0]) : noteCard(inCat(n.category)[0], 'From ' + n.category)));
    cards.push(principlesCard());
    $('nvClose').innerHTML = '<h2 class="su-close-h" id="nvCloseH">After ' + esc(n.name) + '</h2><div class="su-cg">' + cards.join('') + sessionCard(n) + '</div>';
  }

  /* ---------- The note view ---------- */
  function setTop() {
    var bar = $('hbBar'), top = mqPhone.matches ? 0 : bar.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--su-top', top + 'px');
    document.documentElement.style.setProperty('--nv-bar', $('nvBar').getBoundingClientRect().height + 'px');
  }
  function show(view) {
    $('suList').hidden = view !== 'list';
    $('suView').hidden = view !== 'note';
  }
  // how: 'push' from the list, 'replace' from note to note (so "All notes"
  // and the browser's back button both return to the list), or none.
  function openNote(slug, how) {
    var n = bySlug(slug);
    if (!n) { closeNote(false); return; }
    if (!current) listY = window.scrollY;
    current = n;
    if (how === 'push') { history.pushState({ note: slug }, '', noteUrl(slug)); fromList = true; }
    else if (how === 'replace') history.replaceState({ note: slug }, '', noteUrl(slug));
    document.title = n.name + ' -- Investment suite -- Client Hub';
    var l = inCat(n.category), i = l.indexOf(n);
    $('nvId').innerHTML = mark(n) + '<span class="b"><span class="n">' + esc(n.name) + '</span><span class="m">' + esc(n.ticker + ' · ' + n.category + (n.theme ? ' · ' + n.theme : '')) + '</span></span>';
    $('nvPos').textContent = (i + 1) + ' of ' + l.length;
    navBtn($('nvPrev'), l[i - 1], 'Previous note');
    navBtn($('nvNext'), l[i + 1], 'Next note');
    renderNoteClose(n);
    show('note');
    setTop();
    window.scrollTo(0, 0);
    loadFrame(n);
    $('nvId').focus({ preventScroll: true });
  }
  function navBtn(a, n, word) {
    if (n) { a.href = noteUrl(n.slug); a.setAttribute('data-note', n.slug); a.setAttribute('aria-label', word + ': ' + n.name); a.removeAttribute('aria-disabled'); a.title = n.name; }
    else { a.removeAttribute('href'); a.removeAttribute('data-note'); a.setAttribute('aria-label', word); a.setAttribute('aria-disabled', 'true'); a.title = ''; }
  }
  function closeNote(push) {
    var was = current;
    current = null; teardown();
    if (push) history.pushState({}, '', '/hub/suite/index.html' + (cat !== 'All' ? '?cat=' + encodeURIComponent(cat) : ''));
    document.title = 'Investment suite -- Client Hub';
    show('list');
    renderList();
    window.scrollTo(0, listY);
    if (was) { var el = document.querySelector('#suNotes [data-note="' + was.slug + '"]'); if (el) el.focus({ preventScroll: true }); }
  }

  /* ---------- The note frame ---------- */
  var frameRO = null, rows = [], heads = [], raf = 0;
  function teardown() {
    if (frameRO) { frameRO.disconnect(); frameRO = null; }
    rows = []; heads = [];
    $('nvToc').innerHTML = '';
  }
  function loadFrame(n) {
    teardown();
    var frame = $('nvFrame'), load = $('nvLoad');
    load.hidden = false; load.textContent = 'Opening the note';
    frame.style.height = '70vh';
    frame.title = n.name + ' investment note';
    frame.onload = function () {
      var doc;
      try { doc = frame.contentDocument; } catch (e) { doc = null; }
      if (!doc || !doc.body) { load.textContent = 'The note could not open. Check your connection and refresh the page.'; return; }
      try { wrapNoteAmpersands(doc); } catch (e) {}
      if (WIDE[n.slug]) { try { widen(doc); } catch (e) { console.error('Investment suite: wide layout', e); } }
      fit();
      if (window.ResizeObserver) { frameRO = new ResizeObserver(fit); frameRO.observe(doc.documentElement); frameRO.observe(doc.body); }
      buildToc(doc);
      load.hidden = true;
      // Fonts and images inside the note settle after load.
      setTimeout(fit, 400); setTimeout(fit, 1500);
    };
    // location.replace, not src: a new src adds a browser history entry, so
    // "back" would step through earlier notes inside the frame.
    var url = '/hub/suite/notes/' + encodeURIComponent(n.slug) + '.html';
    try { frame.contentWindow.location.replace(url); } catch (e) { frame.src = url; }
  }
  function fit() {
    var frame = $('nvFrame'), doc = frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    // The root's own box, not scrollHeight: scrollHeight never drops below the
    // frame's current height, so a note that gets shorter would leave a gap.
    var h = Math.ceil(doc.documentElement.getBoundingClientRect().height);
    if (Math.abs(frame.offsetHeight - h) > 1) frame.style.height = h + 'px';
    onScroll();
  }

  // Contents rail from the note's own headings.
  function buildToc(doc) {
    heads = Array.prototype.filter.call(doc.querySelectorAll('h2'), function (h) {
      return h.textContent.trim() && !h.closest('.tei-footer, .disclaimer, footer');
    });
    $('nvToc').innerHTML = heads.map(function (h, i) {
      return '<li><a href="#" data-h="' + i + '">' + esc(h.textContent.replace(/\s+/g, ' ').trim()) + '</a></li>';
    }).join('');
    onScroll();
  }
  function offsetTop() { return (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--su-top')) || 0) + $('nvBar').getBoundingClientRect().height; }
  function goHead(i) {
    var h = heads[i]; if (!h) return;
    var y = window.scrollY + $('nvFrame').getBoundingClientRect().top + h.getBoundingClientRect().top - offsetTop() - 16;
    window.scrollTo({ top: y, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var tools = $('suTools');
      if (!$('suList').hidden) {
        var tb = tools.getBoundingClientRect();
        tools.classList.toggle('is-stuck', tb.top <= offsetTopList() + 0.5);
        if (mqPhone.matches) {
          var on = null;
          Array.prototype.forEach.call(document.querySelectorAll('#suNotes .su-sec'), function (sec) { if (sec.getBoundingClientRect().top <= tb.bottom + 24) on = sec.getAttribute('data-sec'); });
          on = on || (document.querySelector('#suNotes .su-sec') || { getAttribute: function () { return null; } }).getAttribute('data-sec');
          Array.prototype.forEach.call($('suCats').querySelectorAll('[data-jump]'), function (b) { if (b.getAttribute('data-jump') === on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
        }
      }
      if (!current) return;
      var ft = $('nvFrame').getBoundingClientRect().top, top = offsetTop() + 24, act = 0;
      heads.forEach(function (h, i) { if (ft + h.getBoundingClientRect().top <= top + 40) act = i; });
      Array.prototype.forEach.call($('nvToc').querySelectorAll('a'), function (a, i) { if (i === act) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      stick(ft, top);
    });
  }
  function offsetTopList() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--su-top')) || 0; }

  /* ---------- Wide layout (pilot) ---------- */
  // Each section's text runs on the left and the figure that follows it on
  // the right. The order of the note never changes, so on narrow screens the
  // rows simply stack as before.
  var HEAD = /^(H2)$/;
  var PROSE = /^(P|H3|H4|H5|UL|OL|BLOCKQUOTE)$/;
  function isLabel(el) { return /section-label|explainer-label/.test(el.className || '') && el.nextElementSibling && HEAD.test(el.nextElementSibling.tagName); }
  function isFull(el) {
    if (/acq-grid|domain-nodes/.test(el.className || '')) return true;
    if (el.tagName === 'TABLE') { var r = el.querySelector('tr'); return !!r && r.children.length > 4; }
    return false;
  }
  // A box that is mostly words (a callout, a verdict) keeps a reading width.
  function isTexty(el) { return !el.querySelector('table, svg, canvas, img') && el.textContent.trim().length > 250; }
  function widen(doc) {
    var link = doc.createElement('link');
    link.rel = 'stylesheet'; link.href = '/hub/suite/note-wide.css';
    doc.head.appendChild(link);
    doc.documentElement.classList.add('tw');
    Array.prototype.forEach.call(doc.querySelectorAll('.page > section, div.section'), function (sec) {
      var kids = Array.prototype.slice.call(sec.children), lead = [];
      while (kids.length && (HEAD.test(kids[0].tagName) || isLabel(kids[0]))) lead.push(kids.shift());
      if (!kids.length) return;
      var groups = [], g = null;
      kids.forEach(function (k) {
        var prose = PROSE.test(k.tagName);
        if (!g || (prose && g.v.length)) { g = { t: [], v: [] }; groups.push(g); }
        (prose ? g.t : g.v).push(k);
      });
      groups.forEach(function (gr) {
        var r = doc.createElement('div'), full = gr.v.some(isFull);
        var texty = !gr.t.length && gr.v.every(isTexty);
        r.className = 'tw-row' + (!gr.v.length || texty ? ' is-text' : !gr.t.length ? ' is-vis' : '') + (full ? ' is-full' : '');
        var t = doc.createElement('div'); t.className = 'tw-t';
        var v = doc.createElement('div'); v.className = 'tw-v';
        gr.t.forEach(function (x) { t.appendChild(x); });
        gr.v.forEach(function (x) { v.appendChild(x); });
        if (gr.t.length) r.appendChild(t);
        if (gr.v.length) r.appendChild(v);
        sec.appendChild(r);
        if (gr.t.length && gr.v.length && !full) rows.push({ r: r, t: t, v: v });
      });
    });
  }
  // The shorter side of a row stays in view while the other scrolls past,
  // like .ar-stick on articles. The note frame does not scroll itself, so
  // the page moves the shorter side as it scrolls.
  function stick(ft, top) {
    if (!rows.length) return;
    var win = $('nvFrame').contentWindow;
    var on = win && win.matchMedia('(min-width:1000px)').matches;
    rows.forEach(function (x) {
      var short = x.v.offsetHeight < x.t.offsetHeight ? x.v : x.t, other = short === x.v ? x.t : x.v;
      other.style.transform = '';
      if (!on) { short.style.transform = ''; return; }
      var rt = ft + x.r.getBoundingClientRect().top, room = x.r.offsetHeight - short.offsetHeight;
      var y = Math.max(0, Math.min(room, top - rt));
      short.style.transform = y ? 'translateY(' + Math.round(y) + 'px)' : '';
    });
  }

  // Serif headings draw "&" as an ornate glyph. Inside a note, show it in the
  // note's own body font instead (the .amp treatment used across the site).
  function wrapNoteAmpersands(doc) {
    if (!doc || !doc.body || !doc.head) return;
    var view = doc.defaultView;
    var bodyFont = view.getComputedStyle(doc.body).fontFamily || 'sans-serif';
    var style = doc.createElement('style');
    style.textContent = '.amp{font-family:' + bodyFont + ';font-style:normal;font-weight:inherit;line-height:0;}';
    doc.head.appendChild(style);
    var hs = doc.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].textContent.indexOf('&') === -1) continue;
      if (!/(^|,)\s*serif\s*$/i.test(view.getComputedStyle(hs[i]).fontFamily)) continue;
      var walker = doc.createTreeWalker(hs[i], 4, null), texts = [], node;
      while ((node = walker.nextNode())) if (node.nodeValue.indexOf('&') !== -1 && node.parentNode.className !== 'amp') texts.push(node);
      for (var j = 0; j < texts.length; j++) {
        var parts = texts[j].nodeValue.split('&'), frag = doc.createDocumentFragment();
        for (var k = 0; k < parts.length; k++) {
          if (k > 0) { var span = doc.createElement('span'); span.className = 'amp'; span.appendChild(doc.createTextNode('&')); frag.appendChild(span); }
          if (parts[k]) frag.appendChild(doc.createTextNode(parts[k]));
        }
        texts[j].parentNode.replaceChild(frag, texts[j]);
      }
    }
  }

  /* ---------- Switch note sheet ---------- */
  function renderSheet() {
    var qq = $('nvSheetQ').value.trim().toLowerCase();
    var html = CATS.map(function (c) {
      var l = inCat(c).filter(function (n) { return !qq || (n.name + ' ' + n.ticker + ' ' + n.summary + ' ' + (n.theme || '')).toLowerCase().indexOf(qq) >= 0; });
      return l.length ? '<div class="nv-sheet-g"><span class="lab">' + esc(c) + ' · ' + l.length + '</span>' + l.map(function (n) { return row(n); }).join('') + '</div>' : '';
    }).join('');
    $('nvSheetB').innerHTML = html || '<p class="su-empty" style="margin-top:12px">No notes match that.</p>';
  }
  function openSheet() {
    var d = $('nvSheet');
    $('nvSheetQ').value = '';
    renderSheet();
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    var cur = d.querySelector('[aria-current="true"]');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }
  function closeSheet() { var d = $('nvSheet'); if (d.close) d.close(); else d.removeAttribute('open'); }

  /* ---------- Events ---------- */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a[data-note]');
    if (a && bySlug(a.getAttribute('data-note'))) {
      e.preventDefault();
      if ($('nvSheet').open) closeSheet();
      openNote(a.getAttribute('data-note'), current ? 'replace' : 'push');
      return;
    }
    var h = e.target.closest('#nvToc a');
    if (h) { e.preventDefault(); goHead(Number(h.getAttribute('data-h'))); return; }
    if (e.target.closest('#nvBack')) {
      e.preventDefault();
      if (fromList) history.back();
      else closeNote(true);
    }
  });
  document.addEventListener('click', function (e) {
    var j = e.target.closest('[data-jump]');
    if (!j) return;
    if ($('suTools').classList.contains('is-find')) closeFind();
    var sec = document.getElementById('sec-' + j.getAttribute('data-jump').replace(/\W/g, ''));
    if (sec) window.scrollTo({ top: window.scrollY + sec.getBoundingClientRect().top - $('suTools').offsetHeight - 8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  // Phones: search lives behind an icon, in the slim bar.
  var SEARCH_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>';
  var CLOSE_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function openFind() {
    var t = $('suTools'); t.classList.add('is-find');
    $('suFbtn').innerHTML = CLOSE_IC; $('suFbtn').setAttribute('aria-label', 'Close search'); $('suFbtn').setAttribute('aria-expanded', 'true');
    $('suSearch').focus();
  }
  function closeFind() {
    var t = $('suTools'); t.classList.remove('is-find');
    $('suFbtn').innerHTML = SEARCH_IC; $('suFbtn').setAttribute('aria-label', 'Search notes'); $('suFbtn').setAttribute('aria-expanded', 'false');
    if (q) { $('suSearch').value = ''; q = ''; renderList(); }
    onScroll();
  }
  $('suFbtn').addEventListener('click', function () { if ($('suTools').classList.contains('is-find')) closeFind(); else openFind(); });
  $('suCats').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]'); if (!b) return;
    cat = b.getAttribute('data-cat');
    history.replaceState(history.state, '', '/hub/suite/index.html' + (cat !== 'All' ? '?cat=' + encodeURIComponent(cat) : ''));
    renderList();
    var t = $('suTools'); if (t.getBoundingClientRect().top <= offsetTopList() + 1) window.scrollTo(0, window.scrollY + $('suNotes').getBoundingClientRect().top - offsetTopList() - t.offsetHeight - 12);
  });
  $('suSearch').addEventListener('input', function () { q = this.value.trim().toLowerCase(); renderList(); });
  $('suSearch').addEventListener('keydown', function (e) { if (e.key === 'Escape' && mqPhone.matches) { closeFind(); $('suFbtn').focus(); } });
  $('nvSwitch').addEventListener('click', openSheet);
  $('nvSheetX').addEventListener('click', closeSheet);
  $('nvSheet').addEventListener('click', function (e) { if (e.target === this) closeSheet(); });
  $('nvSheetQ').addEventListener('input', renderSheet);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { setTop(); onScroll(); });
  [mqPhone, mqMid, mqFour].forEach(function (m) { (m.addEventListener ? m.addEventListener.bind(m, 'change') : m.addListener.bind(m))(function () { if (!mqPhone.matches) $('suTools').classList.remove('is-find'); renderList(); renderListClose(); setTop(); }); });
  window.addEventListener('popstate', route);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function route() {
    var p = new URLSearchParams(location.search), note = p.get('note'), c0 = p.get('cat');
    cat = c0 && CATS.indexOf(c0) >= 0 ? c0 : 'All';
    if (note && bySlug(note)) openNote(note);
    else { fromList = false; if (current || $('suList').hidden) closeNote(false); }
  }

  try { var c1 = new URLSearchParams(location.search).get('cat'); if (CATS.indexOf(c1) >= 0) cat = c1; } catch (e) {}
  setTop();
  renderList();
  Promise.all([
    fetch('/hub/suite/notes/manifest.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch('/hub/members-articles.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
  ]).then(function (res) {
    all = (res[0] || []).filter(function (n) { return CATS.indexOf(n.category) >= 0; });
    articles = (res[1] || []).filter(function (a) { return a.type !== 'video'; }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    loaded = true;
    renderList();
    renderListClose();
    onScroll();
    var note = new URLSearchParams(location.search).get('note');
    if (note && bySlug(note)) { history.replaceState({ note: note }, '', location.href); openNote(note); }
  }).catch(function (err) {
    console.error('Investment suite: could not load the notes', err);
    $('suNotes').innerHTML = '<div class="su-empty">The notes could not load. Check your connection and refresh the page.</div>';
  });
})();
