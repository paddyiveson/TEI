/* TEI site -- mobile navigation (see assets/mobile-nav.css).
   Builds the header, bottom bar and full-screen menu from one route table per
   variant, so nav content lives in this file only. Two variants, picked from
   the URL: the public site, and the Client Hub (anything under /hub/).
   Nothing here is visible above the 860px breakpoint (the CSS hides it). */
(function () {
  'use strict';

  // Every "Book a call" button on the public site points at /book. Where that
  // goes is set in one place: the /book redirect in vercel.json.
  var BOOK_URL = '/book';
  // "Chat on WhatsApp first", the secondary link beside Book a call.
  var WHATSAPP_URL = 'https://wa.me/447843868245?text=Hi%2C%20I%20came%20across%20The%20Everyday%20Investor%20and%20I%27d%20love%20to%20find%20out%20more%20about%20how%20coaching%20could%20help%20me.%20Could%20we%20book%20in%20a%20quick%20call%3F';

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
    usercircle: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"/>',
    dashboard: '<path d="M4 4h6v8h-6z"/><path d="M4 16h6v4h-6z"/><path d="M14 12h6v8h-6z"/><path d="M14 4h6v4h-6z"/>',
    chartline: '<path d="M4 19l16 0"/><path d="M4 15l4 -6l4 2l4 -5l4 4"/>',
    school: '<path d="M22 9l-10 -4l-10 4l10 4l10 -4v6"/><path d="M6 10.6v5.4a6 3 0 0 0 12 0v-5.4"/>',
    books: '<path d="M5 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z"/><path d="M9 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z"/><path d="M5 8h4"/><path d="M9 16h4"/><path d="M13.803 4.56l2.184 -.53c.562 -.135 1.133 .19 1.282 .732l3.695 13.418a1.02 1.02 0 0 1 -.634 1.219l-.133 .041l-2.184 .53c-.562 .135 -1.133 -.19 -1.282 -.732l-3.695 -13.418a1.02 1.02 0 0 1 .634 -1.219l.133 -.041z"/><path d="M14 9l4 -1"/><path d="M16 16l3.923 -.98"/>',
    briefcase: '<path d="M3 7m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"/><path d="M12 12l0 .01"/><path d="M3 13a20 20 0 0 0 18 0"/>',
    world: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/>'
  };

  // href === null marks the Menu button (opens the full-screen menu). Bar ids
  // that aren't in the bar (e.g. About) light up Menu instead.
  var VARIANTS = {
    // Public site: bottom bar Home, Guides, Articles, Membership, Menu. The
    // Menu screen lists every page, so the whole site is reachable on a phone.
    // The header itself is static markup on each page (.tei-hdr, /style.css);
    // headerActions is only a fallback for a page that has none.
    site: {
      logoHref: '/index.html',
      logoLabel: 'The Everyday Investor, home',
      rings: true,     // ring-and-dot tab icons instead of the outline icons
      siteMenu: true,  // the Menu screen from buildSiteMenu(); the bar stays visible under it
      bar: [
        { id: 'home',       label: 'Home',       href: '/index.html' },
        { id: 'guides',     label: 'Guides',     href: '/guides.html' },
        { id: 'articles',   label: 'Articles',   href: '/articles.html' },
        { id: 'membership', label: 'Membership', href: '/membership.html' },
        { id: 'menu',       label: 'Menu',       href: null }
      ],
      links: [
        { id: 'home',       label: 'Home',               href: '/index.html' },
        { id: 'about',      label: 'About',              href: '/about.html' },
        { id: 'hww',        label: 'How we work',        href: '/about.html#how-we-work' },
        { id: 'guides',     label: 'Guides &amp; Tools', href: '/guides.html' },
        { id: 'articles',   label: 'Articles',           href: '/articles.html' },
        { id: 'membership', label: 'Membership',         href: '/membership.html' }
      ],
      headerActions:
        '<a class="tei-mhead-cta" href="' + BOOK_URL + '" target="_blank" rel="noopener noreferrer"><span>Book a call</span></a>' +
        '<a class="tei-mhead-hub" href="/hub/index.html" aria-label="Client Hub">@user@</a>',
      book: true,
      adviserLink: true
    },
    // Same destinations as the Hub's existing top nav.
    hub: {
      logoHref: '/hub/index.html',
      logoLabel: 'The Everyday Investor, Client Hub dashboard',
      bar: [
        { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/hub/index.html' },
        { id: 'wealth',    label: 'Wealth OS', icon: 'chartline', href: '/hub/wealth-os.html' },
        { id: 'education', label: 'Learn',     icon: 'school',    href: '/hub/education/index.html' },
        { id: 'library',   label: 'Library',   icon: 'books',     href: '/hub/knowledge/index.html' },
        { id: 'menu',      label: 'Menu',      icon: 'menu',      href: null }
      ],
      links: [
        { id: 'dashboard', label: 'Dashboard',          icon: 'dashboard', href: '/hub/index.html' },
        { id: 'wealth',    label: 'Wealth OS',          icon: 'chartline', href: '/hub/wealth-os.html' },
        { id: 'suite',     label: 'Investment Suite',   icon: 'briefcase', href: '/hub/suite.html' },
        { id: 'education', label: 'Education Platform', icon: 'school',    href: '/hub/education/index.html' },
        { id: 'guides',    label: 'Guides &amp; Tools', icon: 'book',      href: '/hub/guides.html' },
        { id: 'library',   label: 'Knowledge Library',  icon: 'books',     href: '/hub/knowledge/index.html' },
        { id: 'site',      label: 'Visit Website &#8599;', icon: 'world',  href: '/' }
      ],
      headerActions: '<a class="tei-mhead-cta tei-mhead-cta--ghost" href="/"><span>Visit website</span></a>',
      book: false,
      adviserLink: false
    }
  };

  var root = document.documentElement;
  var script = document.currentScript || document.querySelector('script[src*="mobile-nav.js"]');
  var pageOverride = script && script.getAttribute('data-active');
  var cleanPath = (location.pathname || '/').replace(/\/+$/, '').replace(/\.html$/, '') || '/';
  var isHub = cleanPath === '/hub' || cleanPath.indexOf('/hub/') === 0;
  var V = isHub ? VARIANTS.hub : VARIANTS.site;

  var barItems = {}, menuLinks = {};
  var menu, menuBtn, closeBtn, barEl;
  var currentPage = '';
  var isOpen = false, lastFocus = null, savedY = 0;
  var inerted = [];

  function svg(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
  }

  // Which page the visitor is on. A data-active attribute on the script tag
  // overrides this.
  function detectPage() {
    var p = cleanPath;
    if (isHub) {
      if (p === '/hub' || p === '/hub/index') return 'dashboard';
      if (p.indexOf('/hub/knowledge') === 0) return 'library';
      if (p.indexOf('/hub/education') === 0) return 'education';
      if (p === '/hub/wealth-os') return 'wealth';
      if (p === '/hub/suite') return 'suite';
      if (p === '/hub/guides' || p.indexOf('/hub/guides/') === 0) return 'guides';
      return '';
    }
    if (p === '/' || p === '/index') return 'home';
    if (p === '/guides' || p.indexOf('/guides/') === 0) return 'guides';
    if (p === '/articles' || p.indexOf('/articles/') === 0) return 'articles';
    if (p === '/membership') return 'membership';
    if (p === '/about') return 'about';
    return '';
  }

  // Public tool pages (guides/*) get a header that scrolls away.
  function isToolPage() {
    return !isHub && cleanPath.indexOf('/guides/') === 0;
  }

  /* ---------------- header ---------------- */
  function buildHeader() {
    var head = document.createElement('div');
    head.className = 'tei-mhead' + (isToolPage() ? ' tei-mhead--static' : '');
    head.innerHTML =
      '<a class="tei-mhead-logo" href="' + V.logoHref + '" aria-label="' + V.logoLabel + '">' +
        '<span class="tei-mhead-mark" aria-hidden="true">&#10022;</span>' +
        '<span class="tei-mhead-text">The Everyday<br>Investor</span>' +
      '</a>' +
      '<div class="tei-mhead-actions">' + V.headerActions.replace('@user@', svg('user')) + '</div>';
    // Appended (not inserted first): pages such as guides/stages.html style
    // body children with :nth-child, so anything placed before them would
    // change desktop rendering even while hidden.
    document.body.appendChild(head);
  }

  /* Line icons for the bottom bar, shared with Wealth OS and the Client Hub:
     each sits in a pill that fills when its tab is the current page. */
  var TAB_ICONS = {
    home: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9v10a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1V9"/>',
    guides: '<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H18v-3"/><path d="M9 8h5"/>',
    articles: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
    membership: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    menu: '<path d="M5 7.5h14M5 12h14M5 16.5h14"/>',
    dashboard: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9v10a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1V9"/>',
    wealth: '<path d="M4 19h16"/><path d="M5 15.5l4.5-4.5 3.5 3 6-6.5"/><path d="M15 7.5h4v4"/>',
    education: '<path d="M3 9.5 12 5l9 4.5-9 4.5z"/><path d="M7 11.5v4c1.4 1.4 3.1 2 5 2s3.6-.6 5-2v-4"/>',
    library: '<path d="M12 6.5C10.3 5 7.8 4.5 4 4.8v13.4c3.8-.3 6.3.2 8 1.6 1.7-1.4 4.2-1.9 8-1.6V4.8c-3.8-.3-6.3.2-8 1.7z"/><path d="M12 6.5v13.3"/>'
  };

  /* ---------------- bottom bar ---------------- */
  function buildBar() {
    var bar = document.createElement('div');
    bar.className = 'tei-mbar tei-mbar--' + V.bar.length;
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Primary');
    V.bar.forEach(function (item) {
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
      el.innerHTML = '<span class="tei-mbar-pill" aria-hidden="true">' + (TAB_ICONS[item.id] ? '<svg viewBox="0 0 24 24" focusable="false">' + TAB_ICONS[item.id] + '</svg>' : svg(item.icon)) + '</span>' +
        '<span class="tei-mbar-label">' + item.label + '</span>';
      barItems[item.id] = el;
      bar.appendChild(el);
    });
    document.body.appendChild(bar);
    barEl = bar;
  }

  /* ---------------- public site Menu screen ---------------- */
  // Pages, Members, Get started, then the short not-advice line.
  function buildSiteMenu() {
    var mark = '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false">' +
      '<circle cx="13" cy="13" r="11.5" fill="none" stroke="#E8D6A8" stroke-width="1.4"/>' +
      '<circle cx="13" cy="13" r="6" fill="none" stroke="#E8D6A8" stroke-opacity=".5" stroke-width="1.2"/>' +
      '<circle cx="13" cy="13" r="2.4" fill="#E8D6A8"/></svg>';
    var pages = V.links.map(function (item) {
      return '<li><a class="tei-smenu-page" data-id="' + item.id + '" href="' + item.href + '">' +
        '<span>' + item.label + '</span>' + svg('chevron') + '</a></li>';
    }).join('');
    return '<div class="tei-smenu-top">' +
        '<a class="tei-smenu-brand" href="' + V.logoHref + '">' + mark + '<span>The Everyday Investor</span></a>' +
        '<button type="button" class="tei-menu-close tei-smenu-close" aria-label="Close menu">' + svg('x') + '</button>' +
      '</div>' +
      '<div class="tei-smenu-body">' +
        '<div role="navigation" aria-label="Pages">' +
          '<p class="tei-smenu-label">Pages</p>' +
          '<ul class="tei-smenu-pages">' + pages + '</ul>' +
        '</div>' +
        '<div>' +
          '<p class="tei-smenu-label">Members</p>' +
          '<div class="tei-smenu-cards">' +
            '<a class="tei-smenu-card" href="/hub/index.html"><span class="tei-smenu-card-t">Log in</span><span class="tei-smenu-card-s">Client Hub and Wealth OS</span></a>' +
            '<a class="tei-smenu-card" href="/admin/login.html"><span class="tei-smenu-card-t">Adviser sign in</span><span class="tei-smenu-card-s">For TEI staff</span></a>' +
          '</div>' +
        '</div>' +
        '<div class="tei-smenu-start">' +
          '<a class="tei-smenu-book" href="' + BOOK_URL + '" target="_blank" rel="noopener noreferrer">Book a call</a>' +
          '<a class="tei-smenu-wa" href="' + WHATSAPP_URL + '" target="_blank" rel="noopener noreferrer">Chat on WhatsApp first</a>' +
          // TODO(copy sheet): the line about the free first call and the fact
          // find fee goes here once its wording is approved.
        '</div>' +
        '<p class="tei-smenu-note">Financial coaching and education, not regulated financial advice.</p>' +
      '</div>';
  }

  /* ---------------- full-screen menu ---------------- */
  function buildMenu() {
    menu = document.createElement('div');
    menu.className = 'tei-menu' + (V.siteMenu ? ' tei-menu--site' : '');
    menu.id = 'teiMenu';
    menu.setAttribute('role', 'dialog');
    menu.hidden = true;
    if (V.siteMenu) {
      // The bottom bar stays usable under this screen, so it is not modal.
      menu.setAttribute('aria-label', 'Menu');
      menu.innerHTML = buildSiteMenu();
    } else {
      menu.setAttribute('aria-modal', 'true');
      menu.setAttribute('aria-labelledby', 'teiMenuTitle');
      menu.innerHTML = hubMenuHTML();
    }
    document.body.appendChild(menu);

    closeBtn = menu.querySelector('.tei-menu-close');
    Array.prototype.forEach.call(menu.querySelectorAll('a[href]'), function (a) {
      if (a.hasAttribute('data-id')) menuLinks[a.getAttribute('data-id')] = a;
      // Same-tab navigation: close first so a bfcache "Back" doesn't restore an open menu.
      a.addEventListener('click', function () { closeMenu(false); });
    });
    closeBtn.addEventListener('click', function () { closeMenu(true); });
    // On the public site the Menu tab opens and closes the screen.
    menuBtn.addEventListener('click', function () {
      if (V.siteMenu && isOpen) closeMenu(true); else openMenu();
    });
  }

  function hubMenuHTML() {
    var links = V.links.map(function (item) {
      return '<li><a class="tei-menu-link" data-id="' + item.id + '" href="' + item.href + '">' +
        '<span class="tei-menu-link-icon">' + svg(item.icon) + '</span>' +
        '<span class="tei-menu-link-label">' + item.label + '</span>' +
        '<span class="tei-menu-link-chev">' + svg('chevron') + '</span>' +
      '</a></li>';
    }).join('');
    return (
      '<div class="tei-menu-top">' +
        '<h2 class="tei-menu-title" id="teiMenuTitle">Menu</h2>' +
        '<button type="button" class="tei-menu-close" aria-label="Close menu">' + svg('x') + '</button>' +
      '</div>' +
      '<div class="tei-menu-body">' +
        (V.book ? '<a class="tei-menu-book" href="' + BOOK_URL + '" target="_blank" rel="noopener noreferrer">Book a discovery call</a>' +
          '<div class="tei-menu-hww"><a href="/how-we-work">How we work</a></div>' : '') +
        '<ul class="tei-menu-list' + (V.book ? '' : ' tei-menu-list--first') + '">' + links + '</ul>' +
      '</div>' +
      (V.adviserLink ? '<div class="tei-menu-foot"><a href="/admin/login.html">Adviser sign in</a></div>' : '')
    );
  }

  // Tab order while the menu is open. On the public site the bar is part of it.
  function focusables() {
    var items = Array.prototype.slice.call(menu.querySelectorAll('a[href], button:not([disabled])'));
    if (V.siteMenu && barEl) {
      items = items.concat(Array.prototype.slice.call(barEl.querySelectorAll('a[href], button:not([disabled])')));
    }
    return items;
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
      if (V.siteMenu && el === barEl) return; // the bar stays live under the Menu screen
      el.inert = true;
      inerted.push(el);
    });
    menuBtn.setAttribute('aria-expanded', 'true');
    if (V.siteMenu) markBar('menu'); // the Menu tab is the active tab while it is open
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
    if (V.siteMenu) markBar(barItems[currentPage] ? currentPage : 'menu');
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
    if (items.indexOf(active) === -1) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- active state ---------------- */
  function markBar(barId) {
    Object.keys(barItems).forEach(function (key) {
      if (key === barId) barItems[key].setAttribute('aria-current', 'page');
      else barItems[key].removeAttribute('aria-current');
    });
  }

  function setActive(page) {
    currentPage = page;
    markBar(barItems[page] ? page : 'menu');
    Object.keys(menuLinks).forEach(function (key) {
      if (key === page) menuLinks[key].setAttribute('aria-current', 'page');
      else menuLinks[key].removeAttribute('aria-current');
    });
  }

  /* Signed in already? The Supabase session lives in an sb-...-auth-token
     cookie (hub/js/supabase-client.js), so the public header can say
     "Client Hub" instead of "Log in" without loading Supabase. Same link. */
  function markSignedIn() {
    if (isHub || !/(?:^|;\s*)sb-[^=;]+-auth-token(?:\.0)?=/.test(document.cookie || '')) return;
    var links = document.querySelectorAll('a[href="/hub/index.html"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.classList.contains('tei-hdr-link')) a.textContent = 'Client Hub';
      else if (a.classList.contains('tei-hdr-hub') || a.classList.contains('tei-mhead-hub')) a.setAttribute('aria-label', 'Open the Client Hub');
      else {
        var t = a.querySelector('.tei-smenu-card-t');
        if (t) t.textContent = 'Client Hub';
      }
    }
  }

  function init() {
    root.classList.add('tei-mnav');
    if (!isHub) root.classList.add('tei-site'); // scopes the public-site look in mobile-nav.css
    if (isToolPage()) root.classList.add('tei-mtool');
    var hasFooter = false, i, kids = document.body.children;
    for (i = 0; i < kids.length; i++) if (kids[i].tagName === 'FOOTER') hasFooter = true;
    if (!hasFooter) root.classList.add('tei-mbar-nofooter');

    // Public pages carry their own static header; only build one if it is missing.
    if (!document.querySelector('.tei-hdr')) buildHeader();
    buildBar();
    buildMenu();
    setActive(pageOverride || detectPage());
    markSignedIn();

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
