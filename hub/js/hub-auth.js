/**
 * Shared hub auth UI: signed-in email display and sign-out handler.
 * Requires supabase-config.js and supabase-client.js loaded first.
 */
(function () {
  function safeRedirectAfterLogout() {
    window.location.href = "/hub/login.html";
  }

  window.TeiHubAuth = {
    signOut: function () {
      return TeiAuth.signOut().then(safeRedirectAfterLogout).catch(safeRedirectAfterLogout);
    },

  /**
   * Inject email + sign-out into hub nav (desktop list + mobile menu).
   * @param {Object} opts
   * @param {string} [opts.navLinksSelector] - CSS selector for desktop nav ul
   * @param {string} [opts.mobileMenuSelector] - CSS selector for mobile menu container
   */
    enhanceNav: function (opts) {
      opts = opts || {};
      var navLinks = document.querySelector(opts.navLinksSelector || ".nav-links");
      var mobileMenu = document.querySelector(opts.mobileMenuSelector || ".nav-mobile-menu");

      TeiAuth.getUser().then(function (result) {
        var user = result.data && result.data.user;
        if (!user) return;

        var email = user.email || "Signed in";
        var signOutDesktop =
          '<li class="hub-auth-item"><span class="hub-auth-email">' +
          email +
          '</span> <a href="#" class="hub-auth-signout" data-tei-signout>Sign out</a></li>';
        var signOutMobile =
          '<a href="#" class="hub-auth-signout-mobile" data-tei-signout>Sign out (' +
          email +
          ")</a>";

        if (navLinks) {
          navLinks.insertAdjacentHTML("beforeend", signOutDesktop);
        }
        if (mobileMenu) {
          mobileMenu.insertAdjacentHTML("beforeend", signOutMobile);
        }

        document.querySelectorAll("[data-tei-signout]").forEach(function (el) {
          el.addEventListener("click", function (e) {
            e.preventDefault();
            TeiHubAuth.signOut();
          });
        });
      });
    },

    /** Compact sign-out link for pages without shared nav (e.g. suite). */
    renderSignOutLink: function (container) {
      if (!container) return;
      container.innerHTML =
        '<a href="#" class="hub-suite-signout" data-tei-signout style="color:rgba(255,255,255,.45);font-size:10px;text-decoration:none;">Sign out</a>';
      container.querySelector("[data-tei-signout]").addEventListener("click", function (e) {
        e.preventDefault();
        TeiHubAuth.signOut();
      });
    },
  };
})();
