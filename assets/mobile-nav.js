/* TEI public site -- mobile navigation (see assets/mobile-nav.css).
   Builds the header, bottom bar and full-screen menu from one route table, so
   nav content lives in this file only. Nothing here is visible above the
   860px breakpoint (the CSS hides it). */
(function () {
  'use strict';

  // Same link the site's existing "Book a discovery call" buttons use.
  var BOOK_URL = 'https://wa.me/447843868245?text=Hi%2C%20I%20came%20across%20The%20Everyday%20Investor%20and%20I%27d%20love%20to%20find%20out%20more%20about%20how%20coaching%20could%20help%20me.%20Could%20we%20book%20in%20a%20quick%20call%3F';

  // Tabler-style outline icons: 24px viewBox, stroke set in CSS.
  var ICONS = {
    home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/>',
    book: '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/>',
    news: '<path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"/><path d="M8 8l4 0"/><path d="M8 12l4 0"/><path d="M8 16l4 0"/>',
    menu: '<path d="M4 6l16 0"/><path d="M4 12l16 0"/><path d="M4 18l16 0"/>',
    x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
    chevron: '<path d="M9 6l6 6l-6 6"/>',
    info: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 9h.01"/><path d="M11 12h1v4h1"/>',
    user: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
    usercircle: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"/>'
  };

  // Guides and Tools are one page on the public site, so they share one item.
  // href === null marks the Menu button (opens the full-screen menu).
  var BAR = [
    { id: 'home',     label: 'Home',             icon: 'home', href: '/index.html' },
    { id: 'guides',   label: 'Guides &amp; Tools', icon: 'book', href: '/guides.html' },
    { id: 'articles', label: 'Articles',         icon: 'news', href: '/articles.html' },
    { id: 'menu',     label: 'Menu',             icon: 'menu', href: null }
  ];

  var MENU_LINKS = [
    { id: 'home',     label: 'Home',             icon: 'home',       href: '/index.html' },
    { id: 'about',    label: 'About',            icon: 'info',       href: '/about.html' },
    { id: 'guides',   label: 'Guides &amp; Tools', icon: 'book',       href: '/guides.html' },
    { id: 'articles', label: 'Articles',         icon: 'news',       href: '/articles.html' },
    { id: 'hub',      label: 'Client Hub',       icon: 'usercircle', href: '/hub/index.html' }
  ];

  var root = document.documentElement;
  var script = document.currentScript || document.querySelector('script[src*="mobile-nav.js"]');
  var pageOverride = script && script.getAttribute('data-active');

  var barItems = {}, menuLinks = {};
  var menu, menuBtn, closeBtn;
  var isOpen = false, lastFocus = null, savedY = 0;
  var inerted = [];

  function svg(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
  }

  // Which page the visitor is on. A data-active attribute on the script tag
  // overrides this.
  function detectPage() {
    var path = (location.pathname || '/').replace(/\/+$/, '').replace(/\.html$/, '') || '/';
    if (path === '/' || path === '/index') return 'home';
    if (path === '/guides' || path.indexOf('/guides/') === 0) return 'guides';
    if (path === '/articles') return 'articles';
    if (path === '/about') return 'about';
    return '';
  }

  function isToolPage() {
    return (location.pathname || '').indexOf('/guides/') === 0;
  }

  /* ---------------- header ---------------- */
  function buildHeader() {
    var head = document.createElement('div');
    head.className = 'tei-mhead' + (isToolPage() ? ' tei-mhead--static' : '');
    head.innerHTML =
      '<a class="tei-mhead-logo" href="/index.html" aria-label="The Everyday Investor, home">' +
        '<span class="tei-mhead-mark" aria-hidden="true">&#10022;</span>' +
        '<span class="tei-mhead-text">The Everyday<br>Investor</span>' +
      '</a>' +
      '<div class="tei-mhead-actions">' +
        '<a class="tei-mhead-cta" href="' + BOOK_URL + '" target="_blank" rel="noopener noreferrer"><span>Book a call</span></a>' +
        '<a class="tei-mhead-hub" href="/hub/index.html" aria-label="Client Hub">' + svg('user') + '</a>' +
      '</div>';
    // Appended (not inserted first): pages such as guides/stages.html style
    // body children with :nth-child, so anything placed before them would
    // change desktop rendering even while hidden.
    document.body.appendChild(head);
  }

  /* ---------------- bottom bar ---------------- */
  function buildBar() {
    var bar = document.createElement('div');
    bar.className = 'tei-mbar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Primary');
    BAR.forEach(function (item) {
      var el = document.createElement(item.href ? 'a' : 'button');
      el.className = 'tei-mbar-item';
      if (item.href) {
        el.href = item.href;
      } else {
        el.type = 'button';
        el.setAttribute('aria-haspopup', 'dialog');
        el.setAttribute('aria-expanded', 'false');
        el.setAttribute('aria-controls', 'teiMenu');
        menuBtn = el;
      }
      el.innerHTML = svg(item.icon) + '<span class="tei-mbar-label">' + item.label + '</span>';
      barItems[item.id] = el;
      bar.appendChild(el);
    });
    document.body.appendChild(bar);
  }

  /* ---------------- full-screen menu ---------------- */
  function buildMenu() {
    var links = MENU_LINKS.map(function (item) {
      return '<li><a class="tei-menu-link" data-id="' + item.id + '" href="' + item.href + '">' +
        '<span class="tei-menu-link-icon">' + svg(item.icon) + '</span>' +
        '<span class="tei-menu-link-label">' + item.label + '</span>' +
        '<span class="tei-menu-link-chev">' + svg('chevron') + '</span>' +
      '</a></li>';
    }).join('');

    menu = document.createElement('div');
    menu.className = 'tei-menu';
    menu.id = 'teiMenu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.setAttribute('aria-labelledby', 'teiMenuTitle');
    menu.hidden = true;
    menu.innerHTML =
      '<div class="tei-menu-top">' +
        '<h2 class="tei-menu-title" id="teiMenuTitle">Menu</h2>' +
        '<button type="button" class="tei-menu-close" aria-label="Close menu">' + svg('x') + '</button>' +
      '</div>' +
      '<div class="tei-menu-body">' +
        '<a class="tei-menu-book" href="' + BOOK_URL + '" target="_blank" rel="noopener noreferrer">Book a discovery call</a>' +
        '<ul class="tei-menu-list">' + links + '</ul>' +
      '</div>' +
      '<div class="tei-menu-foot"><a href="/admin/login.html">Adviser sign in</a></div>';
    document.body.appendChild(menu);

    closeBtn = menu.querySelector('.tei-menu-close');
    Array.prototype.forEach.call(menu.querySelectorAll('.tei-menu-link'), function (a) {
      menuLinks[a.getAttribute('data-id')] = a;
      // Same-tab navigation: close first so a bfcache "Back" doesn't restore an open menu.
      a.addEventListener('click', function () { closeMenu(false); });
    });
    menu.querySelector('.tei-menu-foot a').addEventListener('click', function () { closeMenu(false); });
    closeBtn.addEventListener('click', function () { closeMenu(true); });
    menuBtn.addEventListener('click', openMenu);
  }

  function focusables() {
    return Array.prototype.slice.call(menu.querySelectorAll('a[href], button:not([disabled])'));
  }

  function openMenu() {
    if (isOpen) return;
    isOpen = true;
    lastFocus = document.activeElement;
    savedY = window.pageYOffset || 0;
    menu.hidden = false;
    // Scroll lock: freeze the body in place (also stops iOS scroll-through).
    document.body.style.top = (-savedY) + 'px';
    root.classList.add('tei-menu-lock');
    // Everything behind the dialog becomes inert (unreachable by Tab / screen reader).
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === menu || el.tagName === 'SCRIPT' || el.inert) return;
      el.inert = true;
      inerted.push(el);
    });
    menuBtn.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
  }

  function closeMenu(restoreFocus) {
    if (!isOpen) return;
    isOpen = false;
    menu.hidden = true;
    inerted.forEach(function (el) { el.inert = false; });
    inerted = [];
    root.classList.remove('tei-menu-lock');
    document.body.style.top = '';
    try { window.scrollTo({ top: savedY, left: 0, behavior: 'instant' }); }
    catch (e) { window.scrollTo(0, savedY); }
    menuBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus !== false && lastFocus && lastFocus.focus) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { lastFocus.focus(); }
    }
  }

  function onKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      closeMenu(true);
      return;
    }
    if (e.key !== 'Tab') return;
    var items = focusables();
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1], active = document.activeElement;
    if (!menu.contains(active)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- active state ---------------- */
  function setActive(page) {
    var barId = barItems[page] ? page : 'menu';
    Object.keys(barItems).forEach(function (key) {
      if (key === barId) barItems[key].setAttribute('aria-current', 'page');
      else barItems[key].removeAttribute('aria-current');
    });
    Object.keys(menuLinks).forEach(function (key) {
      if (key === page) menuLinks[key].setAttribute('aria-current', 'page');
      else menuLinks[key].removeAttribute('aria-current');
    });
  }

  function init() {
    root.classList.add('tei-mnav');
    if (isToolPage()) root.classList.add('tei-mtool');
    var hasFooter = false, i, kids = document.body.children;
    for (i = 0; i < kids.length; i++) if (kids[i].tagName === 'FOOTER') hasFooter = true;
    if (!hasFooter) root.classList.add('tei-mbar-nofooter');

    buildHeader();
    buildBar();
    buildMenu();
    setActive(pageOverride || detectPage());

    document.addEventListener('keydown', onKeydown);
    // Leaving mobile width while the menu is open: put the page back.
    var mq = window.matchMedia('(max-width: 860px)');
    var onChange = function () { if (!mq.matches) closeMenu(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    window.addEventListener('pageshow', function (e) { if (e.persisted) closeMenu(false); });
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
