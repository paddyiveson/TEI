/* Client Hub video library (TEI Video Library Spec, "Hub library").
 *
 * Reads one Google Sheet, published to the web as CSV (SHEET_CSV_URL). Each
 * live row is a video; see the spec's content model for the columns. Until
 * the Sheet is published, or whenever the fetch fails, the built-in FALLBACK
 * list is shown instead, so the page is never empty. FALLBACK rows carry no
 * video_id, so they render as "Coming soon" tiles and never play.
 *
 * House rules for this file: no contractions or curly quotes in strings, and
 * HTML is built by string concatenation with esc(), never template literals.
 */
(function () {
  'use strict';

  // TODO(videos): paste the Sheet's "Publish to web" CSV link here once it exists.
  var SHEET_CSV_URL = '';

  var STAGES = [
    { id: 'all', label: 'All stages', desc: '' },
    { id: '0', label: 'Start here', desc: 'New to TEI. How the five stages work and where to begin.' },
    { id: '1', label: 'Stage 1', name: 'The Foundations', desc: 'Never invested. Starting from scratch.' },
    { id: '2', label: 'Stage 2', name: 'Building the Base', desc: 'First investment made. Now structuring the portfolio properly.' },
    { id: '3', label: 'Stage 3', name: 'Growing with Confidence', desc: 'Invested and structured. Now developing market understanding and conviction.' },
    { id: '4', label: 'Stage 4', name: 'Investment Philosophy', desc: 'Developing a personal approach. Going beyond passive.' },
    { id: '5', label: 'Stage 5', name: 'The Seasoned Investor', desc: 'Advanced portfolio construction, life planning and long-term wealth management.' }
  ];
  var TOPICS = ['Foundations', 'Investing', 'Pensions', 'Mindset', 'Market Commentary', 'Company Deep Dives'];
  var FORMAT_LABEL = { explainer: 'Explainer', 'deep-dive': 'Deep dive', short: 'Short', webinar: 'Webinar' };

  var DISCLAIMER = 'These videos are education, not personal financial advice. The Everyday Investor is not authorised or regulated by the FCA and does not make personal recommendations. The decisions you make are yours.';
  var EXTRA_LINE = 'This is not a recommendation to buy or sell. Past performance is not a guide to the future.';

  /* Teaser list: the planned first videos, shown as Coming soon tiles. The
     titles match the homepage teaser. No video_id, so nothing plays. */
  var FALLBACK = [
    { title: 'How the five stages work', tier: 'public', format: 'explainer', stages: '0', topics: 'Foundations', description: 'Five stages, how they fit together, and where most people start.' },
    { title: 'Why volatility is normal', tier: 'public', format: 'explainer', stages: '3', topics: 'Investing, Mindset', description: 'What market swings look like over time, and how to sit through them.' },
    { title: 'Your safety net', tier: 'client', format: 'explainer', stages: '1', topics: 'Foundations', description: 'How much to keep in cash before you invest, and where to hold it.' },
    { title: 'Staying invested', tier: 'client', format: 'explainer', stages: '1, 2', topics: 'Mindset', description: 'Why time in the market matters more than timing it.' },
    { title: 'Pensions, explained', tier: 'client', format: 'deep-dive', stages: '2', topics: 'Pensions', description: 'Tax relief, workplace schemes and SIPPs, in one longer session.' },
    { title: 'Member Q and A', tier: 'client', format: 'webinar', stages: '', topics: 'Investing', description: 'A recorded session answering questions from members.' },
    { title: 'One idea in sixty seconds', tier: 'public', format: 'short', stages: '', topics: 'Mindset', description: '' }
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function splitList(s, sep) {
    return String(s || '').split(sep).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function today() { var d = new Date(); return d.toISOString().slice(0, 10); }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    return rows.slice(1).filter(function (r) { return r.some(function (x) { return x.trim(); }); }).map(function (r) {
      var o = {};
      head.forEach(function (h, j) { o[h] = (r[j] || '').trim(); });
      return o;
    });
  }

  /* ---------- Normalise a Sheet row ---------- */
  function secondsOf(t) {
    var p = String(t || '').split(':').map(Number);
    if (p.some(isNaN)) return 0;
    return p.reduce(function (a, b) { return a * 60 + b; }, 0);
  }
  function normalise(r) {
    var format = String(r.format || 'explainer').toLowerCase().replace(/\s+/g, '-');
    if (!FORMAT_LABEL[format]) format = 'explainer';
    var long = format === 'deep-dive' || format === 'webinar';
    var id = String(r.video_id || '').trim();
    return {
      id: /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : '',
      title: r.title || 'Untitled',
      tier: String(r.tier || '').toLowerCase() === 'client' ? 'client' : 'public',
      format: format,
      stages: splitList(r.stages, ',').filter(function (s) { return /^[0-5]$/.test(s); }),
      topics: splitList(r.topics, ',').filter(function (t) { return TOPICS.indexOf(t) >= 0; }),
      description: r.description || '',
      duration: r.duration || '',
      published: r.published || '',
      isNew: !!(r.new_until && r.new_until >= today()),
      related: splitList(r.related, ';').map(function (x) {
        var m = x.match(/^(note|tool):\s*([a-z0-9-]+)$/i);
        return m ? { kind: m[1].toLowerCase(), key: m[2].toLowerCase() } : null;
      }).filter(Boolean),
      chapters: long ? splitList(r.chapters, ';').map(function (x) {
        var m = x.match(/^(\d{1,2}(?::\d{2}){1,2})\s+(.+)$/);
        return m ? { at: m[1], s: secondsOf(m[1]), title: m[2] } : null;
      }).filter(Boolean) : [],
      status: String(r.status || 'live').toLowerCase()
    };
  }

  /* ---------- State ---------- */
  var videos = null; // null while loading
  var fromFallback = false;
  var filt = { stage: 'all', topic: 'all', q: '' };
  var lastCard = null;
  var current = null; // the video open in the player

  function matches(v) {
    if (filt.stage !== 'all' && v.stages.length && v.stages.indexOf(filt.stage) < 0) return false;
    if (filt.topic !== 'all' && v.topics.indexOf(filt.topic) < 0) return false;
    if (filt.q) {
      var hay = [v.title, v.description, v.topics.join(' '), v.chapters.map(function (c) { return c.title; }).join(' ')].join(' ').toLowerCase();
      if (hay.indexOf(filt.q) < 0) return false;
    }
    return true;
  }

  /* ---------- Rendering ---------- */
  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>';

  function cardHTML(v, i) {
    var soon = !v.id;
    var short = v.format === 'short';
    var cls = 'vc' + (short ? ' vc--short' : '') + (soon ? ' vc--soon' : '');
    var badges = '';
    if (soon) badges += '<span class="vc-b vc-b--soon">Coming soon</span>';
    else if (!short) badges += '<span class="vc-b">' + esc(FORMAT_LABEL[v.format]) + '</span>';
    if (v.tier === 'client') badges += '<span class="vc-b vc-b--client">Client</span>';
    if (v.isNew && !soon) badges += '<span class="vc-b vc-b--new">New</span>';
    var thumb = soon ? '' : '<img src="https://i.ytimg.com/vi/' + esc(v.id) + '/' + (short ? 'oardefault' : 'hqdefault') + '.jpg" alt="" loading="lazy" onerror="this.remove()">';
    var stageTxt = v.stages.length ? v.stages.map(function (s) { return s === '0' ? 'Start here' : 'Stage ' + s; }).join(', ') : 'All stages';
    var meta = (v.topics[0] || FORMAT_LABEL[v.format]) + ' · ' + stageTxt;
    var inner =
      '<div class="vc-thumb"><span class="vc-ring r1"></span><span class="vc-ring r2"></span>' + thumb +
      '<div class="vc-badges">' + badges + '</div>' +
      (soon ? '<span class="vc-play" aria-hidden="true"></span>' : '<span class="vc-play">' + PLAY + '</span>') +
      (v.duration && !soon ? '<span class="vc-dur mono">' + esc(v.duration) + '</span>' : '') +
      '</div>' +
      '<div class="vc-body">' +
      (short ? '' : '<p class="vc-meta mono">' + esc(meta) + '</p>') +
      '<h3 class="vc-title">' + esc(v.title) + '</h3>' +
      (v.description && !short ? '<p class="vc-desc">' + esc(v.description) + '</p>' : '') +
      '</div>';
    var delay = ' style="animation-delay:' + Math.min(i, 8) * 40 + 'ms"';
    if (soon) return '<div class="' + cls + '"' + delay + ' aria-label="' + esc(v.title) + ', coming soon">' + inner + '</div>';
    return '<button type="button" class="' + cls + '"' + delay + ' data-v="' + esc(v.id) + '" aria-label="Play ' + esc(v.title) + '">' + inner + '</button>';
  }

  function skeletons(n) {
    var out = '';
    for (var i = 0; i < n; i++) {
      out += '<div class="vc vc--skel" aria-hidden="true"><div class="vc-thumb"></div><div class="vc-body"><span class="sk" style="width:40%"></span><span class="sk" style="width:85%;height:16px"></span><span class="sk" style="width:70%"></span></div></div>';
    }
    return out;
  }

  function chipHTML(val, label, on) {
    return '<button type="button" class="vl-chip" data-val="' + esc(val) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  function renderFilters() {
    $('vlStages').innerHTML = STAGES.map(function (s) { return chipHTML(s.id, s.label, filt.stage === s.id); }).join('');
    $('vlTopics').innerHTML = chipHTML('all', 'All topics', filt.topic === 'all') +
      TOPICS.map(function (t) { return chipHTML(t, t, filt.topic === t); }).join('');
    var st = STAGES.filter(function (s) { return s.id === filt.stage; })[0];
    $('vlStageDesc').textContent = st && st.desc ? (st.name ? st.label + ': ' + st.name + '. ' : '') + st.desc : '';
  }

  function render() {
    renderFilters();
    var grid = $('vlGrid');
    if (videos === null) {
      grid.innerHTML = skeletons(6);
      $('vlShortsSec').hidden = true;
      $('vlCount').textContent = '';
      return;
    }
    var list = videos.filter(matches);
    var shorts = list.filter(function (v) { return v.format === 'short'; });
    var main = list.filter(function (v) { return v.format !== 'short'; });
    $('vlShortsSec').hidden = !shorts.length;
    $('vlShorts').innerHTML = shorts.map(cardHTML).join('');
    $('vlCount').textContent = list.length + (list.length === 1 ? ' video' : ' videos');
    $('vlSourceNote').textContent = fromFallback ? 'First videos coming soon' : 'Newest first';
    if (!main.length) {
      grid.innerHTML = shorts.length ? '' : '<div class="vl-empty" style="grid-column:1/-1"><b>No videos match these filters</b><p>Try another stage or topic, or clear the search.</p><button type="button" class="vl-btn" id="vlClear">Clear filters</button></div>';
      var clr = $('vlClear');
      if (clr) clr.addEventListener('click', function () { filt = { stage: 'all', topic: 'all', q: '' }; $('vlSearch').value = ''; render(); });
      return;
    }
    grid.innerHTML = main.map(cardHTML).join('');
  }

  /* ---------- Player ---------- */
  function relatedHref(r) {
    if (r.kind === 'note') return '/hub/suite.html?note=' + encodeURIComponent(r.key);
    return '/hub/guides/' + r.key.replace(/-/g, '') + '.html';
  }
  function relatedLabel(r) {
    var words = r.key.replace(/-/g, ' ');
    return (r.kind === 'note' ? 'Note: ' : 'Tool: ') + words.charAt(0).toUpperCase() + words.slice(1);
  }

  function setEmbed(v, start) {
    var src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v.id) + '?autoplay=1&rel=0&modestbranding=1' + (start ? '&start=' + start : '');
    var old = $('vpFrame').querySelector('iframe');
    if (old) old.remove();
    var f = document.createElement('iframe');
    f.src = src;
    f.title = v.title;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    $('vpFrame').appendChild(f);
  }

  function openPlayer(v, card) {
    lastCard = card || null;
    current = v;
    $('vpBox').classList.toggle('short', v.format === 'short');
    $('vpTopics').textContent = [FORMAT_LABEL[v.format]].concat(v.topics).join(' · ');
    $('vpTitle').textContent = v.title;
    $('vpDesc').textContent = v.description;
    $('vpDesc').hidden = !v.description;
    $('vpChaptersWrap').hidden = !v.chapters.length;
    $('vpChapters').innerHTML = v.chapters.map(function (c) {
      return '<li><button type="button" data-s="' + c.s + '"><span class="t">' + esc(c.at) + '</span><span>' + esc(c.title) + '</span></button></li>';
    }).join('');
    $('vpRelatedWrap').hidden = !v.related.length;
    $('vpRelated').innerHTML = v.related.map(function (r) {
      return '<a href="' + esc(relatedHref(r)) + '">' + esc(relatedLabel(r)) + '</a>';
    }).join('');
    var extra = v.topics.indexOf('Company Deep Dives') >= 0 || v.topics.indexOf('Market Commentary') >= 0;
    $('vpDisc').textContent = DISCLAIMER + (extra ? ' ' + EXTRA_LINE : '');
    setEmbed(v, 0);
    $('vp').classList.add('open');
    document.body.style.overflow = 'hidden';
    $('vpClose').focus();
  }

  function closePlayer() {
    if (!$('vp').classList.contains('open')) return;
    var f = $('vpFrame').querySelector('iframe');
    if (f) f.remove(); // stops playback
    $('vp').classList.remove('open');
    document.body.style.overflow = '';
    if (lastCard && document.body.contains(lastCard)) lastCard.focus();
  }

  /* ---------- Wiring ---------- */
  function wire() {
    $('vlStages').addEventListener('click', function (e) {
      var b = e.target.closest('[data-val]'); if (!b) return;
      filt.stage = b.getAttribute('data-val');
      try { localStorage.setItem('tei-video-stage', filt.stage); } catch (err) {}
      render();
    });
    $('vlTopics').addEventListener('click', function (e) {
      var b = e.target.closest('[data-val]'); if (!b) return;
      filt.topic = b.getAttribute('data-val');
      render();
    });
    $('vlSearch').addEventListener('input', function () {
      filt.q = this.value.trim().toLowerCase();
      render();
    });
    document.addEventListener('click', function (e) {
      var card = e.target.closest('[data-v]');
      if (!card || !videos) return;
      var id = card.getAttribute('data-v');
      var v = videos.filter(function (x) { return x.id === id; })[0];
      if (v) openPlayer(v, card);
    });
    $('vpClose').addEventListener('click', closePlayer);
    $('vp').addEventListener('click', function (e) { if (e.target === this) closePlayer(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePlayer(); });
    $('vpChapters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-s]'); if (!b) return;
      if (!current) return;
      setEmbed(current, Number(b.getAttribute('data-s')));
      Array.prototype.forEach.call($('vpChapters').querySelectorAll('button'), function (x) { x.setAttribute('aria-current', x === b ? 'true' : 'false'); });
    });
  }

  function useRows(rows, fallback) {
    fromFallback = fallback;
    videos = rows.map(normalise)
      .filter(function (v) { return v.status === 'live'; })
      .sort(function (a, b) { return String(b.published).localeCompare(String(a.published)); });
    render();
  }

  function load() {
    if (!SHEET_CSV_URL) { useRows(FALLBACK, true); return; }
    fetch(SHEET_CSV_URL, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('Sheet ' + r.status); return r.text(); })
      .then(function (txt) {
        var rows = parseCSV(txt);
        if (!rows.length) throw new Error('Sheet is empty');
        useRows(rows, false);
      })
      .catch(function (err) {
        console.error('Video library: could not read the Sheet, showing the built-in list', err);
        useRows(FALLBACK, true);
      });
  }

  function init() {
    // Opens on the last stage chosen on this device (spec open question; easy to drop).
    try {
      var saved = localStorage.getItem('tei-video-stage');
      if (saved && STAGES.some(function (s) { return s.id === saved; })) filt.stage = saved;
    } catch (err) {}
    $('vlDisc').textContent = DISCLAIMER + ' Company Deep Dives and Market Commentary: ' + EXTRA_LINE.charAt(0).toLowerCase() + EXTRA_LINE.slice(1);
    wire();
    render();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
