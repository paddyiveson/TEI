(function () {
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('navMobileMenu');

  function setMenuOpen(open) {
    if (!menu) return;
    menu.classList.toggle('open', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  window.toggleNav = function () {
    if (!menu) return;
    setMenuOpen(!menu.classList.contains('open'));
  };

  window.closeNav = function () {
    setMenuOpen(false);
  };

  if (toggle) {
    toggle.addEventListener('click', window.toggleNav);
  }

  if (menu) {
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', window.closeNav);
    });
  }
})();
