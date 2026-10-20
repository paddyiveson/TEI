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

  window.TeiTheme = { pref: pref, resolved: resolved, set: set, paint: paint, onChange: onChange };
  paint();
  // Elements marked data-tei-theme further down the page pick it up here too.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
})();
