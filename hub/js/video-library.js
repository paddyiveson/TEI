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
    { title: 'Your safety net', tier: 'client', format: 'explainer', stages: '1', topics: 'Foundations', description: 'How much to keep in cash before you invest, and where to hold it.' },
    { title: 'Staying invested', tier: 'client', format: 'explainer', stages: '1, 2', topics: 'Mindset', description: 'Why time in the market matters more than timing it.' },
    { title: 'Why volatility is normal', tier: 'public', format: 'explainer', stages: '3', topics: 'Investing, Mindset', description: 'What market swings actually look like, and how to sit through them.' },
    { title: 'Pension tax relief, explained', tier: 'public', format: 'explainer', stages: '2', topics: 'Pensions', description: 'Basic, higher and additional rate relief in plain English.' },
    { title: 'Monthly market commentary', tier: 'client', format: 'webinar', stages: '3, 4, 5', topics: 'Market Commentary', description: 'A recorded webinar each month: rates, UK equities and what moved the growth names.' },
    { title: 'Inside the Growth Portfolio', tier: 'client', format: 'deep-dive', stages: '4, 5', topics: 'Investing', description: 'How the growth portfolio is built, position by position.' },
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

  var CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  function stageText(v) {
    return v.stages.length ? v.stages.map(function (s) { return s === '0' ? 'Start here' : 'Stage ' + s; }).join(', ') : 'All stages';
  }

  /* Same card as the homepage teaser: tinted panel with rings, play button,
     duration, then format and topic, title and one line. Webinars and deep
     dives sit on champagne, explainers and Shorts on powder blue. */
  function cardHTML(v, i) {
    var soon = !v.id;
    var short = v.format === 'short';
    var champ = v.format === 'webinar' || v.format === 'deep-dive';
    var cls = 'vc' + (short ? ' vc--short' : '') + (champ ? ' vc--champ' : '') + (soon ? ' vc--soon' : '');
    var badges = '';
    if (v.tier === 'client') badges += '<span class="vc-b vc-b--client">Members</span>';
    if (v.isNew && !soon) badges += '<span class="vc-b vc-b--new">New</span>';
    var thumb = soon ? '' : '<img src="https://i.ytimg.com/vi/' + esc(v.id) + '/' + (short ? 'oardefault' : 'hqdefault') + '.jpg" alt="" loading="lazy" onerror="this.remove()">';
    var meta = FORMAT_LABEL[v.format] + (v.topics[0] ? ' \u00b7 ' + v.topics[0] : '') + (soon ? ' \u00b7 ' + stageText(v) : '');
    var inner =
      '<div class="vc-thumb"><span class="vc-ring r1"></span><span class="vc-ring r2"></span>' + thumb +
      (soon ? '<span class="vc-soon">' + CLOCK + 'Coming soon</span>' : '<span class="vc-fmt">' + esc(FORMAT_LABEL[v.format]) + '</span>') +
      '<div class="vc-badges">' + badges + '</div>' +
      '<span class="vc-play"' + (soon ? ' aria-hidden="true">' + CLOCK : '>' + PLAY) + '</span>' +
      (v.duration && !soon ? '<span class="vc-dur">' + esc(v.duration) + '</span>' : '') +
      '</div>' +
      '<div class="vc-body">' +
      (short ? '' : '<p class="vc-meta">' + esc(meta) + '</p>') +
      '<h3 class="vc-title">' + esc(v.title) + '</h3>' +
      (v.description && !short ? '<p class="vc-desc">' + esc(v.description) + '</p>' : '') +
      '</div>';
    var delay = ' style="animation-delay:' + Math.min(i, 8) * 40 + 'ms"';
    if (soon) return '<div class="' + cls + '"' + delay + ' aria-label="' + esc(v.title) + ', coming soon">' + inner + '</div>';
    return '<button type="button" class="' + cls + '"' + delay + ' data-v="' + esc(v.id) + '" aria-label="Play ' + esc(v.title) + '">' + inner + '</button>';
  }

  /* Top row: the newest video ("New this week") and up to three picked for
     the stage chosen below (Stage 1 when none is chosen). */
  function topHTML() {
    if (!videos || !videos.length) return '';
    var main = videos.filter(function (v) { return v.format !== 'short'; });
    var feat = main.filter(function (v) { return v.id; })[0] || main[0];
    if (!feat) return '';
    var soon = !feat.id;
    var st = filt.stage === 'all' ? '1' : filt.stage;
    var stage = STAGES.filter(function (x) { return x.id === st; })[0];
    var picks = main.filter(function (v) { return v !== feat && (!v.stages.length || v.stages.indexOf(st) >= 0); }).slice(0, 3);
    return '<section class="vl-feat"><div class="vl-feat-l"><p class="vl-feat-k mono">' + (soon ? 'Coming soon' : 'New this week') + '</p>' +
      '<h2>' + esc(feat.title) + '</h2><p class="vl-feat-m mono">' + esc(FORMAT_LABEL[feat.format] + (feat.duration ? ' \u00b7 ' + feat.duration : '') + ' \u00b7 ' + stageText(feat)) + '</p>' +
      (soon ? '<button type="button" class="vl-feat-btn" disabled>Coming soon</button>' : '<button type="button" class="vl-feat-btn" data-v="' + esc(feat.id) + '">Watch now</button>') + '</div>' +
      '<div class="vl-feat-r" aria-hidden="true">' + (soon ? '' : '<img src="https://i.ytimg.com/vi/' + esc(feat.id) + '/hqdefault.jpg" alt="" onerror="this.remove()">') +
      '<span class="vl-ring hb-spin"></span><span class="vl-feat-play' + (soon ? ' soon">' + CLOCK : '">' + PLAY) + '</span></div></section>' +
      '<section class="vl-pick"><p class="vl-pick-k mono">Picked for your stage</p><h2>' + esc(stage ? stage.label + (stage.name ? ': ' + stage.name : '') : 'Your stage') + '</h2>' +
      (picks.length ? '<ul>' + picks.map(function (v) {
        return '<li>' + (v.id ? '<button type="button" data-v="' + esc(v.id) + '">' + esc(v.title) + '</button>' : '<span>' + esc(v.title) + '</span>') +
          '<span>' + esc(v.id ? (v.duration || '') : 'Soon') + '</span></li>';
      }).join('') + '</ul>' : '<p class="vl-pick-empty">More for this stage soon.</p>') + '</section>';
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
    $('vlTop').innerHTML = topHTML();
    var grid = $('vlGrid');
    if (videos === null) {
      grid.innerHTML = skeletons(6);
      $('vlShortsSec').hidden = true;
      return;
    }
    var list = videos.filter(matches);
    var shorts = list.filter(function (v) { return v.format === 'short'; });
    var main = list.filter(function (v) { return v.format !== 'short'; });
    $('vlShortsSec').hidden = !shorts.length;
    $('vlShorts').innerHTML = shorts.map(cardHTML).join('');
    $('vlSourceNote').textContent = list.length + (list.length === 1 ? ' video' : ' videos') + (fromFallback ? ' \u00b7 first ones coming soon' : ' \u00b7 newest first');
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
