/* Light or dark for the Client Hub, Sign in and Wealth OS (spec B1.5).
 *
 * One choice, saved on this device under "tei-theme": "light", "dark" or
 * "system". "system" follows the device. With no saved choice at all, the
 * members' pages (/hub/) open dark (Paddy, 20 Oct 2026); the public pages
 * that load this file keep following the device. Clients change it
 * in Wealth OS Settings > Appearance, or when they set up Wealth OS; that
 * choice is also kept on their record (clients.theme, null = follow device).
 *
 * Load it in <head> before the page styles paint. It sets data-theme on
 * <html> straight away, and on any element marked data-tei-theme (Wealth OS
 * scopes its tokens to #clientApp and friends).
 */
(function () {
  'use strict';
  var KEY = 'tei-theme';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var listeners = [];
  var DEFAULT = /^\/hub(\/|$)/.test(location.pathname) ? 'dark' : 'system';

  function pref() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) {}
    return v === 'light' || v === 'dark' || v === 'system' ? v : DEFAULT;
  }
  function resolved() {
    var p = pref();
    if (p !== 'system') return p;
    return mq && mq.matches ? 'dark' : 'light';
  }
  function paint() {
    var t = resolved();
    document.documentElement.setAttribute('data-theme', t);
    var els = document.querySelectorAll('[data-tei-theme]');
    for (var i = 0; i < els.length; i++) els[i].setAttribute('data-theme', t);
    for (var j = 0; j < listeners.length; j++) { try { listeners[j](t); } catch (e) {} }
    return t;
  }
  function set(p) {
    try {
      if (p === 'light' || p === 'dark') localStorage.setItem(KEY, p);
      else localStorage.setItem(KEY, 'system');
    } catch (e) {}
    return paint();
  }
  function onChange(fn) { listeners.push(fn); }

  if (mq) {
    var follow = function () { if (pref() === 'system') paint(); };
    if (mq.addEventListener) mq.addEventListener('change', follow);
    else if (mq.addListener) mq.addListener(follow);
  }

  /* The moon / sun button in the top bar (Paddy, 2 Nov 2026). Every page that
     loads this file gets one: in the public header (.tei-hdr-actions, before
     Book a call), at the right of the Client Hub bar (.hb-bar-in), and in the
     older phone header (.tei-mhead-actions, added by mobile-nav.js). Pages
     without a dark theme do not load this file, so they show no button.
     A press sets light or dark explicitly on this device. Its styles are
     added here, so it looks the same whatever else a page loads: on the
     navy public header, champagne lines; on the Hub bar, a tile with the
     Hub's line. */
  var CSS =
    '.tei-theme-btn{display:inline-flex;align-items:center;justify-content:center;flex:none;width:44px;height:44px;margin:0;padding:0;border-radius:50%;cursor:pointer;font:inherit;transition:border-color .2s ease,background-color .2s ease}' +
    '.tei-theme-btn svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}' +
    '.tei-theme-btn .tei-theme-sun,:root[data-theme="dark"] .tei-theme-btn .tei-theme-moon{display:none}' +
    ':root[data-theme="dark"] .tei-theme-btn .tei-theme-sun{display:block}' +
    '.tei-theme-btn:focus-visible{outline:2px solid #E8D6A8;outline-offset:2px}' +
    '.tei-hdr .tei-theme-btn,.tei-mhead .tei-theme-btn{margin-right:4px;color:#F7F4ED;background:transparent;border:1px solid rgba(232,214,168,0.22)}' +
    '.tei-hdr .tei-theme-btn:hover,.tei-mhead .tei-theme-btn:hover{border-color:#E8D6A8;background:rgba(232,214,168,0.08)}' +
    '.hb-bar .tei-theme-btn{color:var(--w-text);background:var(--w-tile);border:1px solid var(--w-line)}' +
    '.hb-bar .tei-theme-btn:hover{border-color:var(--w-gold)}' +
    '.hb-bar .tei-theme-btn:focus-visible{outline-color:var(--w-gold)}' +
    '@media (max-width:860px){.tei-theme-btn{width:40px;height:40px}.hb-bar .tei-theme-btn{margin-left:auto}}';
  function style() {
    if (document.getElementById('teiThemeBtnCss')) return;
    var el = document.createElement('style');
    el.id = 'teiThemeBtnCss';
    el.textContent = CSS;
    (document.head || document.documentElement).appendChild(el);
  }
  var ICONS = '<svg class="tei-theme-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>' +
    '<svg class="tei-theme-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
  function button() {
    style();
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tei-theme-btn';
    b.setAttribute('data-tei-theme-toggle', '');
    b.innerHTML = ICONS;
    return b;
  }
  function label() {
    var dark = resolved() === 'dark';
    var all = document.querySelectorAll('[data-tei-theme-toggle]');
    for (var i = 0; i < all.length; i++) {
      all[i].setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      all[i].setAttribute('aria-pressed', dark ? 'true' : 'false');
    }
  }
  function mount() {
    style();
    var pub = document.querySelector('.tei-hdr-actions');
    if (pub && !pub.querySelector('[data-tei-theme-toggle]')) pub.insertBefore(button(), pub.querySelector('.tei-hdr-book') || pub.firstChild);
    var hub = document.querySelector('.hb-bar-in');
    if (hub && !hub.querySelector('[data-tei-theme-toggle]')) hub.appendChild(button());
    label();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-tei-theme-toggle]');
    if (!b) return;
    set(resolved() === 'dark' ? 'light' : 'dark');
  });
  listeners.push(label);

  window.TeiTheme = { pref: pref, resolved: resolved, set: set, paint: paint, onChange: onChange, button: button, mount: mount };
  paint();
  // Elements marked data-tei-theme further down the page pick it up here too.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { paint(); mount(); });
  else mount();
})();
