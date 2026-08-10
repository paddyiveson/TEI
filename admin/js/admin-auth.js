/**
 * Adviser auth/role gate, shared by every /admin page and by the public
 * homepage (for the conditional nav link). Requires supabase-config.js and
 * supabase-client.js loaded first.
 *
 * Adviser access reuses wealth_os.profiles.role (values: 'client' | 'adviser')
 * -- the same flag Wealth OS already gates its Adviser Workspace on -- rather
 * than a separate admin role. See hub/wealth-os.html's loadWealthOSClient()
 * for the precedent this mirrors.
 */
(function () {
  function wo(supabase) { return supabase.schema('wealth_os'); }

  /** Resolves { user, role } for the signed-in session, or null if signed out. */
  function getAdviserProfile() {
    return TeiAuth.getUser().then(function (result) {
      var user = result.data && result.data.user;
      if (!user) return null;

      var w = wo(window.teiSupabase);
      return w.from('profiles').select('role').eq('user_id', user.id).maybeSingle().then(function (res) {
        if (res.error) throw res.error;
        return { user: user, role: res.data ? res.data.role : null };
      });
    });
  }

  function isAdviser() {
    return getAdviserProfile().then(function (profile) {
      return !!profile && profile.role === 'adviser';
    });
  }

  /**
   * Gate for admin pages. Redirects to /admin/login.html if signed out.
   * If signed in but not an adviser, calls opts.onDenied(profile) if given,
   * otherwise redirects to /admin/login.html. Resolves the profile on success
   * (never resolves on redirect -- the page navigates away instead).
   */
  function requireAdviser(opts) {
    opts = opts || {};
    return getAdviserProfile().then(function (profile) {
      if (!profile) {
        var redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = '/admin/login.html?redirect=' + redirect;
        return null;
      }
      if (profile.role !== 'adviser') {
        if (typeof opts.onDenied === 'function') {
          opts.onDenied(profile);
          return null;
        }
        window.location.href = '/admin/login.html';
        return null;
      }
      return profile;
    });
  }

  /**
   * Injects an "Adviser" nav link into the public homepage nav when the
   * current session is an adviser -- mirrors hub/js/hub-auth.js's enhanceNav()
   * shape (same selector defaults, same insertAdjacentHTML technique). No-op,
   * silently, for anonymous or non-adviser visitors -- never surfaces an error
   * to a public page.
   */
  function enhancePublicNav(opts) {
    opts = opts || {};
    var navLinks = document.querySelector(opts.navLinksSelector || '.nav-links');
    var mobileMenu = document.querySelector(opts.mobileMenuSelector || '.nav-mobile-menu');

    isAdviser().then(function (adviser) {
      if (!adviser) return;
      var desktop = '<li><a href="/admin/index.html" class="nav-link--admin">Adviser</a></li>';
      var mobile = '<a href="/admin/index.html" class="nav-link--admin">Adviser</a>';
      if (navLinks) navLinks.insertAdjacentHTML('beforeend', desktop);
      if (mobileMenu) mobileMenu.insertAdjacentHTML('beforeend', mobile);
    }).catch(function () {
      // Config missing, network error, etc. -- a public page should never
      // show a broken state because of an opportunistic nav check.
    });
  }

  function signOut() {
    function goToLogin() { window.location.href = '/admin/login.html'; }
    return TeiAuth.signOut().then(goToLogin).catch(goToLogin);
  }

  window.TeiAdminAuth = {
    getAdviserProfile: getAdviserProfile,
    isAdviser: isAdviser,
    requireAdviser: requireAdviser,
    enhancePublicNav: enhancePublicNav,
    signOut: signOut,
  };
})();
