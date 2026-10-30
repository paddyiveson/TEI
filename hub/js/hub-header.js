/* Client Hub header (BUILD_Client_Hub_Lobby 3.1 and 8.1): one shared include
 * for every Hub page, so later pages reuse it instead of copying markup.
 *
 * Put an empty <div data-hub-header data-current="home"></div> where the
 * header goes and load this script straight after it (not deferred), so the
 * header is in place before the page paints. data-current names the nav item
 * to mark: home, learn, videos, guides, articles, suite, knowledge or website.
 *
 * Desktop: sticky glass bar with the brand, the pill nav and Open Wealth OS.
 * 960px and below: the pill nav hides; a theme button and a menu button open
 * a glass bottom sheet with the same items, Open Wealth OS and Sign out.
 *
 * Also wires every [data-hub-theme] button on the page (the header's own and
 * any the page adds): sun in dark, moon in light, and a click switches theme
 * through window.TeiTheme (/hub/js/tei-theme.js, loaded in <head>).
 * Sign out buttons carry data-hub-signout, which hub-gate.js wires up.
 *
 * window.TeiHubHeader:
 *   setWealthOsHref(href)  where every Open Wealth OS link goes
 *   onThemePick(fn)        fn(theme) after the person picks light or dark
 */
(function () {
  'use strict';

  var NAV = [
    { key: 'home', label: 'Home', href: '/hub/index.html' },
    // TODO(G6): Learn opens the stage index (E2) once it is built.
    { key: 'learn', label: 'Learn', href: '/hub/education/index.html' },
    { key: 'videos', label: 'Videos', href: '/hub/videos.html' },
    { key: 'guides', label: 'Guides & tools', href: '/hub/guides.html' },
    // TODO(G5): Articles opens members' articles (D7) once it is built.
    { key: 'articles', label: 'Articles', href: '/hub/articles.html' },
    { key: 'suite', label: 'Investment suite', href: '/hub/suite/index.html' },
    { key: 'knowledge', label: 'Knowledge library', href: '/hub/knowledge/index.html' },
    { key: 'website', label: 'Website', href: '/index.html' }
  ];
  var WOS = '/hub/wealth-os.html';

  var ICON_SUN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  var ICON_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h10"/></svg>';
  var ICON_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>';
  var MARK = '<svg class="hh-mark" viewBox="0 0 26 26" aria-hidden="true" focusable="false"><circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--w-gold)" stroke-width="1.4"/><circle cx="13" cy="13" r="6" fill="none" stroke="var(--w-gold)" stroke-opacity=".5" stroke-width="1.2"/><circle cx="13" cy="13" r="2.4" fill="var(--w-gold)"/></svg>';

  var CSS =
    '.hh-bar{position:sticky;top:0;z-index:40;min-height:64px;padding:0 32px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;background:var(--w-glass);border-bottom:1px solid var(--w-glass-line);-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);font-family:"Geist",system-ui,-apple-system,sans-serif;color:var(--w-text)}' +
    '.hh-brand{display:inline-flex;align-items:center;gap:10px;min-height:44px;text-decoration:none;color:var(--w-text);font-size:15px;font-weight:500}' +
    '.hh-mark{width:24px;height:24px;flex:none}' +
    '.hh-right{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '.hh-nav{display:flex;flex-wrap:wrap;gap:2px}' +
    '.hh-nav a{display:inline-flex;align-items:center;min-height:40px;padding:0 13px;border-radius:999px;text-decoration:none;font-size:13px;color:var(--w-muted)}' +
    '.hh-nav a:hover{color:var(--w-text);background:var(--w-chip)}' +
    '.hh-nav a[aria-current="page"]{background:var(--w-chip);color:var(--w-text)}' +
    '.hh-wos{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;margin-left:8px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:500;background:var(--w-nav-active);color:var(--w-nav-active-text);box-shadow:var(--w-btn-glow);transition:transform .18s ease}' +
    '.hh-wos:active{transform:scale(.985)}' +
    '.hh-icon{display:none;width:44px;height:44px;flex:none;border-radius:50%;align-items:center;justify-content:center;cursor:pointer;color:var(--w-text);background:transparent;border:0;padding:0}' +
    '.hh-icon svg,.hh-theme svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.hh-menu{border:1px solid var(--w-line);background:var(--w-tile)}' +
    '.hh-bar a:focus-visible,.hh-bar button:focus-visible,.hh-sheet a:focus-visible,.hh-sheet button:focus-visible,[data-hub-theme]:focus-visible{outline:2px solid var(--w-gold);outline-offset:2px}' +
    '.hh-sheet-wrap{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;justify-content:flex-end}' +
    '.hh-sheet-wrap[hidden]{display:none}' +
    '.hh-scrim{position:absolute;inset:0;border:0;padding:0;margin:0;background:rgba(8,17,31,0.55);cursor:pointer}' +
    '.hh-sheet{position:relative;display:flex;flex-direction:column;gap:2px;padding:10px 16px calc(24px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:var(--w-glass);border-top:1px solid var(--w-glass-line);-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);font-family:"Geist",system-ui,-apple-system,sans-serif;color:var(--w-text);animation:hh-sheet .3s cubic-bezier(.2,.8,.2,1) both}' +
    ':root[data-theme="light"] .hh-sheet{background:rgba(251,250,246,0.94)}' +
    ':root[data-theme="dark"] .hh-sheet{background:rgba(10,22,40,0.92)}' +
    '.hh-grab{align-self:center;width:36px;height:4px;border-radius:999px;background:var(--w-line);margin-bottom:8px}' +
    '.hh-sheet nav{display:flex;flex-direction:column;gap:2px}' +
    '.hh-sheet nav a{display:flex;align-items:center;justify-content:space-between;min-height:48px;padding:0 14px;border-radius:14px;text-decoration:none;font-size:15px;color:var(--w-muted)}' +
    '.hh-sheet nav a[aria-current="page"]{background:var(--w-chip);color:var(--w-text)}' +
    '.hh-sheet nav a svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}' +
    '.hh-sheet-acts{display:flex;gap:8px;margin-top:10px}' +
    '.hh-sheet-acts .hh-wos{flex:1;min-height:48px;margin:0;font-size:14px}' +
    '.hh-out{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:999px;border:1px solid var(--w-line);background:transparent;color:var(--w-muted);font-family:inherit;font-size:14px;cursor:pointer}' +
    '@keyframes hh-sheet{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}' +
    '@media (max-width:960px){.hh-bar{min-height:56px;padding:0 12px 0 16px;gap:8px;flex-wrap:nowrap}.hh-brand{margin-right:auto;gap:8px}.hh-mark{width:22px;height:22px}.hh-right{display:none}.hh-icon{display:inline-flex}}' +
    '@media (prefers-reduced-motion:reduce){.hh-sheet,.hh-wos{animation:none;transition:none}}';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var host = document.querySelector('[data-hub-header]');
  if (!host) return;
  var current = host.getAttribute('data-current') || 'home';
  var pickFns = [];

  if (!document.getElementById('hhStyle')) {
    var st = document.createElement('style');
    st.id = 'hhStyle';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function navLinks(withChevron) {
    return NAV.map(function (n) {
      return '<a href="' + esc(n.href) + '"' + (n.key === current ? ' aria-current="page"' : '') + '>' +
        esc(n.label) + (withChevron ? ICON_CHEV : '') + '</a>';
    }).join('');
  }

  host.outerHTML =
    '<header class="hh-bar" id="hubHeader">' +
      '<a class="hh-brand" href="/hub/index.html">' + MARK + 'Client Hub</a>' +
      '<div class="hh-right">' +
        '<nav class="hh-nav" aria-label="Client Hub">' + navLinks(false) + '</nav>' +
        '<a class="hh-wos" data-hub-wos href="' + WOS + '">Open Wealth OS</a>' +
      '</div>' +
      '<button type="button" class="hh-icon" data-hub-theme></button>' +
      '<button type="button" class="hh-icon hh-menu" id="hhMenuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="hhSheet">' + ICON_MENU + '</button>' +
    '</header>' +
    '<div class="hh-sheet-wrap" id="hhSheet" hidden>' +
      '<button type="button" class="hh-scrim" tabindex="-1" aria-label="Close menu" data-hh-close></button>' +
      '<div class="hh-sheet" role="dialog" aria-modal="true" aria-label="Client Hub menu">' +
        '<span class="hh-grab" aria-hidden="true"></span>' +
        '<nav aria-label="Client Hub">' + navLinks(true) + '</nav>' +
        '<div class="hh-sheet-acts">' +
          '<a class="hh-wos" data-hub-wos href="' + WOS + '">Open Wealth OS</a>' +
          '<button type="button" class="hh-out" data-hub-signout>Sign out</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  /* Menu sheet: Escape and the scrim close it; focus moves in on open, stays
     inside while open, and goes back to the menu button on close. */
  var menuBtn = document.getElementById('hhMenuBtn');
  var wrap = document.getElementById('hhSheet');
  function focusables() {
    return Array.prototype.slice.call(wrap.querySelectorAll('.hh-sheet a[href], .hh-sheet button'));
  }
  function openMenu() {
    wrap.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Close menu');
    var f = focusables();
    if (f.length) f[0].focus();
    document.addEventListener('keydown', onKey);
  }
  function closeMenu() {
    if (wrap.hidden) return;
    wrap.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Open menu');
    document.removeEventListener('keydown', onKey);
    menuBtn.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  menuBtn.addEventListener('click', function () { if (wrap.hidden) openMenu(); else closeMenu(); });
  wrap.addEventListener('click', function (e) { if (e.target.closest('[data-hh-close]')) closeMenu(); });
  // Back on a wide screen the sheet has no button to close it from.
  if (window.matchMedia) {
    var wide = window.matchMedia('(min-width: 961px)');
    var onWide = function () { if (wide.matches) closeMenu(); };
    if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
  }

  /* Theme buttons */
  function resolvedTheme() {
    if (window.TeiTheme) return window.TeiTheme.resolved();
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function paintButtons() {
    var dark = resolvedTheme() === 'dark';
    var btns = document.querySelectorAll('[data-hub-theme]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].innerHTML = dark ? ICON_SUN : ICON_MOON;
      btns[i].setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-hub-theme]');
    if (!b) return;
    var next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    if (window.TeiTheme) window.TeiTheme.set(next);
    else document.documentElement.setAttribute('data-theme', next);
    paintButtons();
    for (var i = 0; i < pickFns.length; i++) { try { pickFns[i](next); } catch (err) { console.error(err); } }
  });
  if (window.TeiTheme) window.TeiTheme.onChange(paintButtons);
  paintButtons();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintButtons);

  window.TeiHubHeader = {
    setWealthOsHref: function (href) {
      var links = document.querySelectorAll('[data-hub-wos]');
      for (var i = 0; i < links.length; i++) links[i].setAttribute('href', href);
    },
    onThemePick: function (fn) { pickFns.push(fn); },
    paintThemeButtons: paintButtons
  };
})();
