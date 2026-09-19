/* TEI public site -- mobile bottom navigation (see assets/mobile-nav.css).
   Builds the bar from one route table, so nav content lives in this file only.
   Nothing here is visible above the 860px breakpoint (the CSS hides it). */
(function () {
  'use strict';

  var ICONS = {
    home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/>',
    book: '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/>',
    calculator: '<path d="M4 3m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M8 7m0 1a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1z"/><path d="M8 14l0 .01"/><path d="M12 14l0 .01"/><path d="M16 14l0 .01"/><path d="M8 17l0 .01"/><path d="M12 17l0 .01"/><path d="M16 17l0 .01"/>',
    news: '<path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"/><path d="M8 8l4 0"/><path d="M8 12l4 0"/><path d="M8 16l4 0"/>',
    menu: '<path d="M4 6l16 0"/><path d="M4 12l16 0"/><path d="M4 18l16 0"/>'
  };

  // Public-site bar. href === null marks the Menu button (opens the full-screen menu, Stage 3).
  var BAR = [
    { id: 'home',     label: 'Home',     icon: 'home',       href: '/index.html' },
    { id: 'guides',   label: 'Guides',   icon: 'book',       href: '/guides.html#guides' },
    { id: 'tools',    label: 'Tools',    icon: 'calculator', href: '/guides.html#tools' },
    { id: 'articles', label: 'Articles', icon: 'news',       href: '/articles.html' },
    { id: 'menu',     label: 'Menu',     icon: 'menu',       href: null }
  ];

  function svg(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
  }

  // Which bar item is active for the current URL. A data-active attribute on
  // the script tag overrides this.
  function detectActive() {
    var path = (location.pathname || '/').replace(/\/+$/, '').replace(/\.html$/, '') || '/';
    if (path === '/' || path === '/index') return 'home';
    if (path === '/guides') return (location.hash === '#tools') ? 'tools' : 'guides';
    if (path.indexOf('/guides/') === 0) return 'guides';
    if (path === '/articles') return 'articles';
    return 'menu'; // About (and anything else reachable only via Menu)
  }

  var script = document.currentScript || document.querySelector('script[src*="mobile-nav.js"]');
  var override = script && script.getAttribute('data-active');
  var bar, items = {};

  function setActive(id) {
    Object.keys(items).forEach(function (key) {
      if (key === id) items[key].setAttribute('aria-current', 'page');
      else items[key].removeAttribute('aria-current');
    });
  }

  function buildBar() {
    bar = document.createElement('div');
    bar.className = 'tei-mbar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Primary');
    BAR.forEach(function (item) {
      var el = document.createElement(item.href ? 'a' : 'button');
      el.className = 'tei-mbar-item';
      if (item.href) el.href = item.href; else el.type = 'button';
      el.innerHTML = svg(item.icon) + '<span class="tei-mbar-label">' + item.label + '</span>';
      items[item.id] = el;
      bar.appendChild(el);
    });
    document.body.appendChild(bar);
  }

  // guides.html holds both Guides and Tools: follow the hash and, while
  // scrolling, whichever section is in view.
  function followGuidesPage() {
    var toolsSection = document.getElementById('tools');
    function update() {
      if (toolsSection) {
        // Until the browser has jumped to the hash, trust the hash itself.
        var pendingJump = location.hash === '#tools' && (window.pageYOffset || 0) === 0;
        setActive(pendingJump || toolsSection.getBoundingClientRect().top <= window.innerHeight * 0.4 ? 'tools' : 'guides');
      } else {
        setActive(location.hash === '#tools' ? 'tools' : 'guides');
      }
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('hashchange', update);
    window.addEventListener('load', update);
    update();
  }

  function init() {
    buildBar();
    var hasFooter = false, i, kids = document.body.children;
    for (i = 0; i < kids.length; i++) if (kids[i].tagName === 'FOOTER') hasFooter = true;
    if (!hasFooter) document.documentElement.classList.add('tei-mbar-nofooter');

    setActive(override || detectActive());
    if (!override && /^\/guides(\.html)?\/?$/.test(location.pathname)) followGuidesPage();
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
