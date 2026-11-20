/* Membership mock-up (mock/membership), pass 2. The HTML is the static end
   state: with JS off or reduced motion, everything shows at once and
   nothing plays by itself.
   Motion: the hero (the one moment at the top); then, each in view: the
   coaching outputs arriving, the research walkthrough, Wealth OS playing
   like the homepage, the community chat (loops) and the tier strip. */
(function () {
  'use strict';
  var doc = document.documentElement, body = document.body;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return (r || document).querySelectorAll(s); };
  var q = new URLSearchParams(location.search);
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = window.matchMedia('(max-width: 860px)');

  /* Run fn once, when the element is on screen (threshold share). */
  function onView(el, fn, threshold) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (en) {
      if (en.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { threshold: threshold || 0.3 });
    io.observe(el);
  }
  /* Track whether an element is on screen, for things that pause. */
  function watch(el, cb, threshold) {
    if (!el || !('IntersectionObserver' in window)) { if (el) cb(true); return; }
    new IntersectionObserver(function (en) { cb(en[0].isIntersecting); }, { threshold: threshold || 0.25 }).observe(el);
  }
  function arrows(list, i, e, go) {
    var n = list.length, j = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % n;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + n) % n;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = n - 1;
    if (j !== null) { e.preventDefault(); go(j, true); }
  }

  /* ---- Review bar. ?shot hides it; ?hero=b, ?view=member and ?notes=off
     set the state from the link. ?rec is the chat recording. ---- */
  if (q.has('shot')) doc.classList.add('mm-shot');
  if (q.has('rec')) doc.classList.add('mm-rec', 'mm-shot');
  var state = { hero: 'a', view: 'visitor', notes: 'on' };
  ['hero', 'view', 'notes'].forEach(function (k) { if (q.get(k)) state[k] = q.get(k); });
  var six = $('.mm-six');
  function playHero() {
    if (!six) return;
    six.classList.remove('mm-go');
    void six.offsetWidth;
    six.classList.add('mm-go');
  }
  var opener = $('.mm-rv-open');
  function apply(replay) {
    body.classList.toggle('mm-hero-a', state.hero === 'a');
    body.classList.toggle('mm-hero-b', state.hero === 'b');
    body.classList.toggle('mm-member', state.view === 'member');
    body.classList.toggle('mm-notes', state.notes === 'on');
    each($$('.mm-seg'), function (seg) {
      each($$('button', seg), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === state[seg.getAttribute('data-k')] ? 'true' : 'false'); });
    });
    if (opener) $('i', opener).textContent = 'Hero ' + state.hero.toUpperCase() + ' · ' + (state.view === 'member' ? 'Member' : 'Visitor');
    setNoteLinks();
    if (replay) playHero();
  }
  each($$('.mm-seg'), function (seg) {
    var k = seg.getAttribute('data-k');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state[k] = b.getAttribute('data-v');
      apply(k === 'hero');
      if (k === 'hero') window.scrollTo({ top: 0 });
    });
  });
  if (opener) opener.addEventListener('click', function () {
    var open = opener.getAttribute('aria-expanded') !== 'true';
    opener.setAttribute('aria-expanded', open ? 'true' : 'false');
    opener.parentNode.classList.toggle('is-open', open);
  });

  /* ---- 03 Research: the latest notes, live, grouped by kind. Titles and
     tickers, date and read time; never the teaser sentence or any figure.
     Visitors go to the tiers, members to the note. ---- */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function ukDate(iso) { var d = iso.split('-'); return Number(d[2]) + ' ' + MONTHS[Number(d[1]) - 1] + ' ' + d[0]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function setNoteLinks() {
    each($$('#mm-notes a[data-slug]'), function (a) {
      a.href = state.view === 'member' ? '/hub/members/' + a.getAttribute('data-slug') + '.html' : '/membership.html#tiers';
    });
  }
  var notes = $('#mm-notes');
  if (notes && window.fetch) {
    fetch('/hub/members-articles.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (list) {
      if (!Array.isArray(list)) return;
      var ok = list.filter(function (a) { return a && a.slug && a.date && a.images && a.images.tease; })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      var groups = [['Earnings reviews', ok.filter(function (a) { return a.category === 'Earnings review'; }).slice(0, 3)],
        ['Deep dives', ok.filter(function (a) { return a.category === 'Companies'; }).slice(0, 2)]];
      if (!groups[0][1].length && !groups[1][1].length) return;
      var html = groups.filter(function (g) { return g[1].length; }).map(function (g) {
        return '<div class="mm-ng"><h3>' + g[0] + '</h3><ul>' + g[1].map(function (a) {
          var tag = a.ticker || (a.tickers ? a.tickers.length + ' companies' : '');
          return '<li><a href="/membership.html#tiers" data-slug="' + esc(a.slug) + '"><img src="' + esc(a.images.tease) + '" width="1600" height="900" alt="" loading="lazy">' +
            '<span><b>' + (tag ? '<i>' + esc(tag) + '</i>' : '') + esc(a.short || a.title) + '</b><small>' + ukDate(a.date) + (a.readTime ? ' · ' + Number(a.readTime) + ' min read' : '') + '</small></span></a></li>';
        }).join('') + '</ul></div>';
      }).join('');
      var more = $('.mm-more-soon', notes);
      notes.innerHTML = html;
      if (more) notes.appendChild(more);
      setNoteLinks();
    }).catch(function () {});
  }

  apply(false);

  /* ---- 01 Hero. ---- */
  if (!still) playHero();

  /* ---- 02 Coaching: the three outputs arrive in turn. ---- */
  var arts = $('.mm-arts');
  if (arts && !still) { arts.classList.add('mm-arm'); onView(arts, function () { arts.classList.add('mm-in'); }, 0.35); }

  /* ---- 03 Research walkthrough: plays while on screen. Reduced motion,
     or a browser that refuses: a Play button instead. ---- */
  var video = $('.mm-vid video'), vplay = $('.mm-vid-play');
  if (video) {
    var showPlay = function () { if (vplay) vplay.hidden = false; };
    if (vplay) vplay.addEventListener('click', function () { vplay.hidden = true; video.play().catch(showPlay); });
    if (still) showPlay();
    else watch(video, function (on) {
      if (on) { video.preload = 'auto'; var p = video.play(); if (p && p.catch) p.catch(showPlay); }
      else video.pause();
    }, 0.4);
  }

  /* ---- 04 Wealth OS: tabs change both screens at once. Once in view the
     tabs play like the homepage: each screen scrolls itself, then the next
     tab. Stops for good on a tap, a scroll, a key or a hover over the
     screens. Reduced motion: no autoplay. ---- */
  var wos = $('.mm-wos');
  var tabs = $$('.mm-tabs [role="tab"]');
  var panel = $('#wp');
  var cur = $('.mm-wos-cur');
  var auto = { on: false, stopped: still, i: 0, timer: 0, raf: 0, visible: false };
  function pick(i, focus) {
    var t = tabs[i], s = t.getAttribute('data-s');
    each(tabs, function (x) { var on = x === t; x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
    each($$('img[data-s]', panel), function (img) { img.hidden = img.getAttribute('data-s') !== s; });
    each($$('.mm-scroll', panel), function (sc) { sc.scrollTop = 0; });
    panel.setAttribute('aria-labelledby', t.id);
    if (cur) cur.textContent = $('span', t).textContent;
    if (focus) t.focus();
  }
  var DUR = 7000;
  function glide() {
    var scs = Array.prototype.filter.call($$('.mm-scroll', panel), function (sc) { return sc.offsetParent; });
    var t0 = performance.now() + 700, len = DUR - 1300;
    cancelAnimationFrame(auto.raf);
    (function step(now) {
      if (!auto.on) return;
      var k = Math.max(0, Math.min(1, (now - t0) / len));
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      scs.forEach(function (sc) { sc.scrollTop = (sc.scrollHeight - sc.clientHeight) * 0.8 * e; });
      if (k < 1) auto.raf = requestAnimationFrame(step);
    })(performance.now());
  }
  function tick() {
    if (!auto.on) return;
    pick(auto.i, false);
    // Restart the progress bar on the new tab.
    wos.classList.remove('is-auto'); void wos.offsetWidth; wos.classList.add('is-auto');
    glide();
    auto.timer = setTimeout(function () { auto.i = (auto.i + 1) % tabs.length; tick(); }, DUR);
  }
  function startAuto() { if (auto.stopped || auto.on || !auto.visible) return; auto.on = true; wos.style.setProperty('--mm-dur', DUR + 'ms'); tick(); }
  function pauseAuto() { auto.on = false; clearTimeout(auto.timer); cancelAnimationFrame(auto.raf); wos.classList.remove('is-auto'); }
  function stopAuto() { auto.stopped = true; pauseAuto(); }
  if (wos) {
    each(tabs, function (t, i) {
      t.addEventListener('click', function () { stopAuto(); pick(i, false); });
      t.addEventListener('keydown', function (e) { stopAuto(); arrows(tabs, i, e, pick); });
    });
    ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) { panel.addEventListener(ev, stopAuto, { passive: true }); });
    if (window.matchMedia('(hover: hover)').matches) panel.addEventListener('mouseenter', stopAuto);
    watch(wos, function (on) { auto.visible = on; if (on) startAuto(); else if (auto.on) { auto.i = (auto.i + 1) % tabs.length; pauseAuto(); } }, 0.5);
  }

  /* ---- 05 Tools: the tool switch, and the Lab as a stepper. ---- */
  var tt = $$('.mm-tsel [role="tab"]');
  function pickTool(i, focus) {
    each(tt, function (b, j) {
      var on = j === i;
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
      document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tt[i].focus();
  }
  each(tt, function (b, i) {
    b.addEventListener('click', function () { pickTool(i, false); });
    b.addEventListener('keydown', function (e) { arrows(tt, i, e, pickTool); });
  });
  var steps = $$('.mm-lab [role="tab"]');
  var labPanel = $('#tp-lab');
  function pickStage(i, focus) {
    var st = steps[i].getAttribute('data-st');
    each(steps, function (b, j) { var on = j === i; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    each($$('img[data-st]', labPanel), function (img) { img.hidden = img.getAttribute('data-st') !== st; if (!img.hidden) img.loading = 'eager'; });
    each($$('.mm-scroll', labPanel), function (sc) { sc.scrollTop = 0; });
    labPanel.classList.add('is-tried');
    if (focus) steps[i].focus();
  }
  each(steps, function (b, i) {
    b.addEventListener('click', function () { pickStage(i, false); });
    b.addEventListener('keydown', function (e) { arrows(steps, i, e, pickStage); });
  });

  /* ---- 06 Community: the chat plays in view and loops, about 30 seconds
     a pass: typing dots, then each message growing in at the bottom. ---- */
  var wa = $('.mm-wa');
  var chat = { visible: false, running: false };
  function playChat(loop) {
    var feed = $('.mm-wa-feed', wa);
    var items = Array.prototype.filter.call(feed.children, function (el) { return !el.classList.contains('mm-wa-typing'); });
    var typing = $('.mm-wa-typing', wa), sub = $('.mm-wa-sub', wa), group = sub.textContent;
    chat.running = true;
    wa.classList.add('is-arm');
    each(items, function (el) { el.classList.remove('is-on'); });
    var i = 0;
    function next() {
      if (i >= items.length) {
        window.__chatDone = true;
        if (!loop) { chat.running = false; return; }
        setTimeout(function () {
          wa.classList.add('is-fade');
          setTimeout(function () { wa.classList.remove('is-fade'); chat.running = false; if (chat.visible) playChat(true); }, 400);
        }, 3500);
        return;
      }
      var el = items[i++];
      var mine = el.getAttribute('data-who') === 'me' || el.classList.contains('mm-wa-day');
      var nameEl = el.querySelector(':scope > b');
      if (mine) { setTimeout(function () { el.classList.add('is-on'); setTimeout(next, 700); }, 400); return; }
      feed.insertBefore(typing, el);
      typing.hidden = false;
      sub.textContent = (nameEl ? nameEl.textContent : 'Someone') + ' is typing...';
      setTimeout(function () {
        typing.hidden = true; sub.textContent = group;
        el.classList.add('is-on');
        setTimeout(next, 1100 + Math.min(1200, el.textContent.length * 8));
      }, 1000);
    }
    next();
  }
  if (wa && doc.classList.contains('mm-rec')) {
    wa.classList.add('is-arm');
    window.startChat = function () { playChat(false); };
  } else if (wa && !still) {
    wa.classList.add('is-arm');
    watch(wa, function (on) { chat.visible = on; if (on && !chat.running) playChat(true); }, 0.4);
  }

  /* ---- 07 Tiers: year strips; the strip scene; the lit column. ---- */
  var grid = $('.mm-grid');
  each($$('.mm-strip'), function (s) {
    var r = (s.getAttribute('data-r') || '').split(',').filter(Boolean).map(Number);
    var c = (s.getAttribute('data-c') || '').split(',').filter(Boolean).map(Number);
    var html = '';
    for (var m = 0; m < 12; m++) html += '<i class="' + (r.indexOf(m) > -1 ? 'r' : (c.indexOf(m) > -1 ? 'c' : '')) + '" style="--m:' + m + '"></i>';
    $('.mm-strip-row', s).innerHTML = html;
  });
  if (grid) {
    if (!still) { grid.classList.add('mm-arm'); onView(grid, function () { grid.classList.add('mm-in'); }, 0.3); }
    var pinned = '0';
    var tsw = $$('.mm-tsw [role="tab"]');
    var setOn = function (c) { grid.setAttribute('data-on', c); };
    var phoneTier = '1';
    var tierMode = function () { setOn(phone.matches ? phoneTier : pinned); };
    each($$('.mm-tier', grid), function (card) {
      var c = card.getAttribute('data-c');
      card.addEventListener('mouseenter', function () { if (!phone.matches) setOn(c); });
      card.addEventListener('focus', function () { if (!phone.matches) setOn(c); });
      card.addEventListener('click', function (e) { if (phone.matches || e.target.closest('a')) return; pinned = c; setOn(c); });
      card.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); pinned = c; setOn(c); } });
    });
    grid.addEventListener('mouseover', function (e) {
      if (phone.matches) return;
      var td = e.target.closest('td');
      if (td) setOn(String(td.cellIndex));
    });
    grid.addEventListener('mouseleave', function () { if (!phone.matches) setOn(pinned); });
    grid.addEventListener('focusout', function () { setTimeout(function () { if (!phone.matches && !grid.contains(document.activeElement)) setOn(pinned); }, 0); });
    var pickTier = function (i, focus) {
      phoneTier = String(i + 1);
      each(tsw, function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); b.tabIndex = j === i ? 0 : -1; });
      setOn(phoneTier);
      var strip = $('.mm-tier[data-c="' + phoneTier + '"] .mm-strip', grid);
      if (!still && grid.classList.contains('mm-in')) { strip.classList.remove('is-quick'); void strip.offsetWidth; strip.classList.add('is-quick'); }
      if (focus) tsw[i].focus();
    };
    each(tsw, function (b, i) {
      b.addEventListener('click', function () { pickTier(i, false); });
      b.addEventListener('keydown', function (e) { arrows(tsw, i, e, pickTier); });
    });
    tierMode();
    if (phone.addEventListener) phone.addEventListener('change', tierMode);
  }

  /* ---- 08 Fit: the quick check, never gated, nothing stored. ---- */
  var qc = $('.mm-qc');
  if (qc) {
    var res = $('.mm-qc-res', qc);
    var ans = [null, null, null];
    res.innerHTML = '<p>Answer all three for a suggestion.</p>';
    each($$('.mm-yn', qc), function (g, i) {
      g.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        ans[i] = b.getAttribute('data-v') === '1';
        each($$('button', g), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        if (ans.indexOf(null) > -1) return;
        var yes = ans.filter(Boolean).length;
        res.innerHTML = yes >= 2
          ? '<p><b>Membership is built for this.</b> Start with a call.</p><a class="mm-lnk" href="/book" target="_blank" rel="noopener noreferrer">Book a call</a>'
          : '<p><b>Start with our free guides and tools first.</b></p><a class="mm-lnk" href="/guides.html">Guides &amp; Tools</a>';
      });
    });
  }
  // Phones: every question starts closed, so the section fits one screen.
  if (phone.matches) each($$('.mm-faq details'), function (d) { d.open = false; });
  var notfit = $('.mm-notfit');
  function foldMode() { if (notfit) notfit.open = !phone.matches; }
  foldMode();
  if (phone.addEventListener) phone.addEventListener('change', foldMode);
  if (notfit) $('summary', notfit).addEventListener('click', function (e) { if (!phone.matches) e.preventDefault(); });

  /* Fetch hidden screens once the page has settled, so a tab never waits. */
  window.addEventListener('load', function () {
    setTimeout(function () { each($$('#wp img[loading="lazy"], #tools img[loading="lazy"]'), function (img) { img.loading = 'eager'; }); }, 2000);
  });
})();
