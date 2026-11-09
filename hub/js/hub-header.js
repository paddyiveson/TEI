/* Client Hub header: one shared include for every members' page (8a, Paddy
 * 2 Nov 2026). Hub pages, the deep dives, Learn, and guides, tools and
 * articles opened from the Hub (?from=hub, via /assets/content.js) all use it.
 *
 * Put an empty <div data-hub-header data-current="research"></div> where the
 * header goes and load this script straight after it (not deferred), so the
 * header is in place before the page paints. data-current names the section
 * to mark: learn, videos, guides, research or library (empty on Hub home).
 *
 * Desktop: Client Hub (logo, Hub home) · Home (the website) | Learn · Videos ·
 *   Guides & tools · Research · Library · Open Wealth OS · account menu.
 * 860px and below: logo · house (the website) · account in the header; the
 *   bottom bar has Learn · Guides · Research · Library · Wealth OS. Videos is
 *   a placeholder until it joins Learn, so on phones it sits in the account
 *   sheet.
 * Account menu: name, theme (light, dark, system; not on a page marked
 *   data-no-theme, such as Learn, which is light only), How we work, Sign out.
 *   Settings joins it once the Hub Settings page is built.
 *
 * Colours come from /hub/css/hub-tokens.css; the header loads it itself on a
 * page that has not. The bar height is --hh-h (64px, 56px on phones); sticky
 * elements below it offset by that. Sign out is a link to /hub/sign-out.html
 * marked data-hub-signout: hub-gate.js wires it on gated pages; elsewhere a
 * signed-in session ends through TeiAuth, or the link does it.
 *
 * window.TeiHubHeader:
 *   setWealthOsHref(href)  where every Open Wealth OS link goes
 *   setName(name)          the member's name for the account button
 *   onThemePick(fn)        fn(theme) after a pick: 'light', 'dark' or null
 *                          (null = follow the device)
 */
(function () {
  'use strict';

  var host = document.querySelector('[data-hub-header]');
  if (!host || document.getElementById('hubHeader')) return;

  var NAV = [
    { key: 'learn', label: 'Learn', href: '/hub/education/index.html', icon: 'learn' },
    // Placeholder until Videos joins Learn (Paddy, 2 Nov 2026).
    { key: 'videos', label: 'Videos', href: '/hub/videos.html', icon: 'videos', desktopOnly: true },
    { key: 'guides', label: 'Guides & tools', short: 'Guides', href: '/hub/guides.html', icon: 'guides' },
    { key: 'research', label: 'Research', href: '/hub/suite/index.html', icon: 'research' },
    { key: 'library', label: 'Library', href: '/hub/knowledge/index.html', icon: 'library' }
  ];
  var HOME = '/index.html';
  var WOS = '/hub/wealth-os.html';
  var SIGN_OUT = '/hub/sign-out.html';
  var HOW = '/about.html#how-we-work';

  var IC = {
    house: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9v10a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1V9"/>',
    learn: '<path d="M3 9.5 12 5l9 4.5-9 4.5z"/><path d="M7 11.5v4c1.4 1.4 3.1 2 5 2s3.6-.6 5-2v-4"/>',
    videos: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M10.5 9.5v5l4-2.5z"/>',
    guides: '<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H18v-3"/><path d="M9 8h5"/>',
    research: '<path d="M4 19h16"/><path d="M5 15.5l4.5-4.5 3.5 3 6-6.5"/><path d="M15 7.5h4v4"/>',
    library: '<path d="M12 6.5C10.3 5 7.8 4.5 4 4.8v13.4c3.8-.3 6.3.2 8 1.6 1.7-1.4 4.2-1.9 8-1.6V4.8c-3.8-.3-6.3.2-8 1.7z"/><path d="M12 6.5v13.3"/>',
    wos: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    out: '<path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h10"/><path d="M17 9l3 3-3 3"/>'
  };
  function ic(k) { return '<svg class="hh-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + IC[k] + '</svg>'; }
  var MARK = '<svg class="hh-mark" viewBox="0 0 26 26" aria-hidden="true" focusable="false"><circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--w-gold)" stroke-width="1.4"/><circle cx="13" cy="13" r="6" fill="none" stroke="var(--w-gold)" stroke-opacity=".5" stroke-width="1.2"/><circle cx="13" cy="13" r="2.4" fill="var(--w-gold)"/></svg>';

  var CSS =
    ':root{--hh-h:64px;--hh-bar:0px}' +
    '.hh-bar{position:sticky;top:0;z-index:40;box-sizing:border-box;height:var(--hh-h);padding:0 32px;display:flex;gap:16px;align-items:center;background:var(--w-glass);border-bottom:1px solid var(--w-glass-line);-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);font-family:"Geist",system-ui,-apple-system,sans-serif;color:var(--w-text);line-height:1.2}' +
    '.hh-bar *,.hh-menu *,.hh-tabs *{box-sizing:border-box}' +
    '.hh-brand{display:inline-flex;align-items:center;gap:10px;min-height:44px;text-decoration:none;color:var(--w-text);font-size:15px;font-weight:500;white-space:nowrap}' +
    '.hh-mark{width:24px;height:24px;flex:none}' +
    '.hh-nav{display:flex;align-items:center;gap:2px;margin-left:auto}' +
    '.hh-nav a{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 13px;border-radius:999px;text-decoration:none;font-size:14px;color:var(--w-muted);white-space:nowrap}' +
    '.hh-nav a[aria-current="page"]{background:var(--w-chip);color:var(--w-text)}' +
    '.hh-nav .hh-home .hh-ic{width:15px;height:15px}' +
    '.hh-sep{flex:none;width:1px;height:18px;margin:0 8px;background:var(--w-line)}' +
    '.hh-wos{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 18px;margin-left:10px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:500;white-space:nowrap;background:var(--w-nav-active);color:var(--w-nav-active-text);box-shadow:var(--w-btn-glow)}' +
    '.hh-wos:active,.hh-tabs a:active{transform:scale(.985)}' +
    '.hh-ic{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}' +
    '.hh-acct{flex:none;width:44px;height:44px;margin-left:6px;padding:0;border-radius:50%;border:1px solid var(--w-line);background:var(--w-tile);color:var(--w-text);font:500 13px/1 "Geist",system-ui,sans-serif;letter-spacing:.02em;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}' +
    '.hh-acct[aria-expanded="true"]{border-color:var(--w-gold)}' +
    '.hh-house{display:none;flex:none;width:44px;height:44px;margin-left:auto;border-radius:50%;align-items:center;justify-content:center;color:var(--w-text);text-decoration:none}' +
    /* The menu sits outside the bar: the bar's blur would trap a fixed child. */
    '.hh-menu{position:fixed;right:24px;top:calc(var(--hh-h) + 10px);z-index:60;width:290px;padding:8px;border-radius:20px;background:var(--w-raised);border:1px solid var(--w-line);box-shadow:var(--w-shadow-2);font-family:"Geist",system-ui,-apple-system,sans-serif;color:var(--w-text);line-height:1.3}' +
    '.hh-menu[hidden],.hh-scrim[hidden]{display:none}' +
    '.hh-who{display:flex;gap:12px;align-items:center;padding:10px 10px 14px;margin-bottom:6px;border-bottom:1px solid var(--w-line)}' +
    '.hh-who .hh-acct{margin:0;cursor:default}' +
    '.hh-who b{display:block;font-size:15px;font-weight:500}.hh-who small{display:block;margin-top:2px;font-size:12.5px;color:var(--w-muted);overflow-wrap:anywhere}' +
    '.hh-row{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:0 10px;border:0;border-radius:12px;background:none;font:400 14px "Geist",system-ui,sans-serif;color:var(--w-text);text-decoration:none;cursor:pointer;text-align:left}' +
    '.hh-row .hh-ic{color:var(--w-muted)}.hh-row.is-out{color:var(--w-muted)}' +
    '.hh-row.is-phone{display:none}' +
    '.hh-theme{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:0 10px;font-size:14px}' +
    '.hh-seg{display:inline-flex;padding:3px;border-radius:999px;background:var(--w-chip)}' +
    '.hh-seg button{min-height:32px;padding:0 10px;border:0;border-radius:999px;background:none;font:500 12px "Geist",system-ui,sans-serif;color:var(--w-muted);cursor:pointer}' +
    '.hh-seg button[aria-pressed="true"]{background:var(--w-tile);color:var(--w-text);box-shadow:var(--w-shadow-1)}' +
    '.hh-div{height:1px;margin:6px 4px;background:var(--w-line)}' +
    '.hh-tabs{display:none}' +
    '@media (hover:hover){.hh-nav a:hover,.hh-row:hover{color:var(--w-text);background:var(--w-chip)}.hh-acct:hover{border-color:var(--w-gold)}}' +
    '.hh-bar a:focus-visible,.hh-bar button:focus-visible,.hh-menu a:focus-visible,.hh-menu button:focus-visible,.hh-tabs a:focus-visible{outline:2px solid var(--w-gold);outline-offset:2px}' +
    '@media (max-width:1099px) and (min-width:861px){.hh-bar{padding:0 24px;gap:8px}.hh-nav a{padding:0 9px;font-size:13.5px}.hh-sep{margin:0 4px}.hh-wos{padding:0 14px;margin-left:6px}}' +
    '@media (max-width:960px) and (min-width:861px){.hh-nav a{padding:0 7px;font-size:13px}.hh-nav .hh-home .hh-ic{display:none}.hh-brand{font-size:14px}}' +
    '@media (max-width:860px){' +
      ':root{--hh-h:56px;--hh-bar:calc(68px + env(safe-area-inset-bottom,0px))}' +
      '.hh-bar{padding:0 10px 0 16px;gap:4px}.hh-nav,.hh-wos{display:none}.hh-house{display:inline-flex}.hh-acct{width:40px;height:40px}' +
      '.hh-scrim{position:fixed;inset:0;z-index:59;background:rgba(8,17,31,.5)}' +
      '.hh-menu{left:0;right:0;top:auto;bottom:0;width:auto;padding:12px 16px calc(20px + env(safe-area-inset-bottom,0px));border-radius:24px 24px 0 0}' +
      '.hh-row{min-height:48px;font-size:15px}.hh-row.is-phone{display:flex}' +
      /* A div, not a nav: /assets/mobile-nav.css hides any body > nav on phones. */
      '.hh-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));position:fixed;left:0;right:0;bottom:0;z-index:50;padding:6px 6px calc(8px + env(safe-area-inset-bottom,0px));background:var(--w-glass);border-top:1px solid var(--w-glass-line);-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);font-family:"Geist",system-ui,sans-serif}' +
      '.hh-tabs a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:54px;text-decoration:none;font-size:11px;font-weight:500;color:var(--w-muted)}' +
      '.hh-tabs .hh-pill{display:flex;align-items:center;justify-content:center;width:52px;height:30px;border-radius:999px}' +
      '.hh-tabs .hh-ic{width:21px;height:21px}' +
      '.hh-tabs a[aria-current="page"]{color:var(--w-text);font-weight:600}' +
      '.hh-tabs a[aria-current="page"] .hh-pill{background:var(--w-nav-active);color:var(--w-nav-active-text)}' +
      /* Room for the bar: in the footer where the page has one, else on the body. */
      'body{padding-bottom:var(--hh-bar)}' +
      'html.hh-footer body{padding-bottom:0}html.hh-footer body>footer{padding-bottom:calc(28px + var(--hh-bar)) !important}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.hh-wos,.hh-tabs a{transition:none}}';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var root = document.documentElement;
  // Colours: a page outside /hub/ (a guide or article opened from the Hub, a
  // deep dive) may not have loaded the members' tokens yet.
  if (!document.querySelector('link[href$="/hub/css/hub-tokens.css"]')) {
    var tk = document.createElement('link');
    tk.rel = 'stylesheet';
    tk.href = '/hub/css/hub-tokens.css';
    document.head.appendChild(tk);
  }
  var st = document.createElement('style');
  st.id = 'hhStyle';
  st.textContent = CSS;
  document.head.appendChild(st);

  var current = host.getAttribute('data-current') || '';
  // data-no-theme: a light-only page (Learn) shows no theme switch.
  var themable = !host.hasAttribute('data-no-theme');
  function cur(k) { return k === current ? ' aria-current="page"' : ''; }

  function themePref() {
    if (window.TeiTheme && window.TeiTheme.pref) return window.TeiTheme.pref();
    var v = null;
    try { v = localStorage.getItem('tei-theme'); } catch (e) {}
    return v === 'light' || v === 'dark' ? v : 'system';
  }
  var seg = ['light', 'dark', 'system'].map(function (t) {
    return '<button type="button" data-hh-theme="' + t + '" aria-pressed="' + (themePref() === t) + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</button>';
  }).join('');

  var nav = '<a class="hh-home" href="' + HOME + '">' + ic('house') + 'Home</a><span class="hh-sep" aria-hidden="true"></span>' +
    NAV.map(function (n) { return '<a href="' + n.href + '"' + cur(n.key) + '>' + esc(n.label) + '</a>'; }).join('');
  var tabs = NAV.filter(function (n) { return !n.desktopOnly; }).map(function (n) {
    return '<a href="' + n.href + '"' + cur(n.key) + '><span class="hh-pill">' + ic(n.icon) + '</span>' + esc(n.short || n.label) + '</a>';
  }).join('') + '<a href="' + WOS + '" data-hub-wos><span class="hh-pill">' + ic('wos') + '</span>Wealth OS</a>';
  var phoneOnly = NAV.filter(function (n) { return n.desktopOnly; }).map(function (n) {
    return '<a class="hh-row is-phone" href="' + n.href + '"' + cur(n.key) + '>' + ic(n.icon) + esc(n.label) + '</a>';
  }).join('');

  host.outerHTML =
    '<header class="hh-bar" id="hubHeader">' +
      '<a class="hh-brand" href="/hub/index.html">' + MARK + 'Client Hub</a>' +
      '<nav class="hh-nav" aria-label="Client Hub">' + nav + '</nav>' +
      '<a class="hh-wos" data-hub-wos href="' + WOS + '">Open Wealth OS</a>' +
      '<a class="hh-house" href="' + HOME + '" aria-label="Home: the website">' + ic('house') + '</a>' +
      '<button type="button" class="hh-acct" id="hhAcct" aria-haspopup="true" aria-expanded="false" aria-controls="hhMenu" aria-label="Your account">' + ic('user') + '</button>' +
    '</header>' +
    '<div class="hh-scrim" id="hhScrim" hidden></div>' +
    '<div class="hh-menu" id="hhMenu" role="dialog" aria-label="Your account" hidden>' +
      '<div class="hh-who"><span class="hh-acct" aria-hidden="true" data-hh-initials>' + ic('user') + '</span><span><b data-hh-name>Your account</b><small data-hh-email></small></span></div>' +
      phoneOnly + (phoneOnly ? '<div class="hh-div is-phone"></div>' : '') +
      (themable ? '<div class="hh-theme"><span id="hhThemeL">Theme</span><span class="hh-seg" role="group" aria-labelledby="hhThemeL">' + seg + '</span></div>' : '') +
      '<a class="hh-row" href="' + HOW + '">' + ic('info') + 'How we work</a>' +
      '<div class="hh-div"></div>' +
      '<a class="hh-row is-out" href="' + SIGN_OUT + '" data-hub-signout>' + ic('out') + 'Sign out</a>' +
    '</div>' +
    '<div class="hh-tabs" role="navigation" aria-label="Client Hub">' + tabs + '</div>';

  var btn = document.getElementById('hhAcct');
  var menu = document.getElementById('hhMenu');
  var scrim = document.getElementById('hhScrim');
  var footerCheck = function () { root.classList.toggle('hh-footer', !!document.querySelector('body > footer')); };
  footerCheck();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', footerCheck);

  /* ---------- Account menu ---------- */
  function focusables() { return Array.prototype.slice.call(menu.querySelectorAll('a[href], button')); }
  function openMenu() {
    menu.hidden = false; scrim.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    var f = focusables(); if (f.length) f[0].focus();
  }
  function closeMenu(refocus) {
    if (menu.hidden) return;
    menu.hidden = true; scrim.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  }
  btn.addEventListener('click', function () { if (menu.hidden) openMenu(); else closeMenu(true); });
  scrim.addEventListener('click', function () { closeMenu(true); });
  document.addEventListener('click', function (e) {
    if (!menu.hidden && !e.target.closest('#hhMenu') && !e.target.closest('#hhAcct')) closeMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (menu.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    if (e.key !== 'Tab') return;
    var f = focusables(), first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  if (window.matchMedia) {
    var phone = window.matchMedia('(max-width: 860px)');
    var onWidth = function () { closeMenu(false); };
    if (phone.addEventListener) phone.addEventListener('change', onWidth); else if (phone.addListener) phone.addListener(onWidth);
  }

  /* ---------- Theme ---------- */
  var pickFns = [];
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('[data-hh-theme]');
    if (!b) return;
    var t = b.getAttribute('data-hh-theme');
    if (window.TeiTheme && window.TeiTheme.set) window.TeiTheme.set(t);
    else {
      try { localStorage.setItem('tei-theme', t); } catch (err) {}
      var dark = t === 'dark' || (t === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
    Array.prototype.forEach.call(menu.querySelectorAll('[data-hh-theme]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    for (var i = 0; i < pickFns.length; i++) { try { pickFns[i](t === 'system' ? null : t); } catch (err) { console.error(err); } }
  });

  /* ---------- Sign out ----------
     Runs after any handler on the link itself (hub-gate.js), so it only acts
     when nothing else has. Without TeiAuth the link's own page ends it. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('#hhMenu [data-hub-signout]');
    if (!a || e.defaultPrevented || !window.TeiAuth || !window.TeiAuth.signOut) return;
    e.preventDefault();
    var go = function () { location.replace(HOME); };
    window.TeiAuth.signOut().then(go, go);
  });

  /* ---------- Name ---------- */
  function initials(name, email) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length) return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    return email ? String(email)[0].toUpperCase() : '';
  }
  var who = { name: '', email: '' };
  function paintWho() {
    var ini = initials(who.name, who.email);
    if (ini) {
      btn.textContent = ini;
      Array.prototype.forEach.call(menu.querySelectorAll('[data-hh-initials]'), function (el) { el.textContent = ini; });
    }
    var n = menu.querySelector('[data-hh-name]'), m = menu.querySelector('[data-hh-email]');
    if (who.name) n.textContent = who.name;
    else if (who.email) n.textContent = who.email.split('@')[0];
    m.textContent = who.email || '';
    btn.setAttribute('aria-label', 'Your account' + (who.name ? ': ' + who.name : ''));
  }
  if (window.TeiAuth && window.TeiAuth.getUser) {
    window.TeiAuth.getUser().then(function (r) {
      var u = r && r.data && r.data.user;
      if (!u) return;
      var md = u.user_metadata || {};
      who.email = u.email || '';
      if (!who.name) who.name = md.full_name || md.name || [md.first_name, md.last_name].filter(Boolean).join(' ');
      paintWho();
    }, function () {});
  }

  window.TeiHubHeader = {
    setWealthOsHref: function (href) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-hub-wos]'), function (a) { a.setAttribute('href', href); });
    },
    setName: function (name) { if (name) { who.name = String(name); paintWho(); } },
    onThemePick: function (fn) { pickFns.push(fn); },
    paintThemeButtons: function () {}
  };
})();
