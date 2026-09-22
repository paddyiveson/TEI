/**
 * Client Hub access gate. Replaces the old shared-password ("TEI") gate --
 * every hub page now requires a real signed-in Supabase session (TeiAuth),
 * same login used by Wealth OS. Requires supabase-config.js and
 * supabase-client.js loaded first.
 *
 * Inserts a full-screen overlay as the first element in <body> (this script
 * tag must be placed there, right after <body> opens) so page content never
 * flashes before the auth check resolves, then either removes the overlay
 * (signed in) or redirects to /hub/login.html (not signed in).
 *
 * Once signed in, also injects a sign-out control so there's a way back out
 * without clearing cookies by hand: into the page's own nav (.nav-links /
 * .nav-mobile-menu) when one exists, or as a small floating pill otherwise --
 * every gated page gets the same control, regardless of layout.
 */
(function () {
  var overlay = document.createElement("div");
  overlay.id = "hubGate";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:5000;background:linear-gradient(160deg,#1D3557 0%,#0f1e3a 100%);" +
    "display:flex;align-items:center;justify-content:center;padding:24px;";
  overlay.innerHTML =
    '<div style="max-width:380px;width:100%;text-align:center;">' +
    '<div style="width:44px;height:44px;border-radius:50%;border:1.5px solid #C9A84C;display:flex;align-items:center;justify-content:center;font-size:20px;color:#C9A84C;margin:0 auto 24px;">&#10022;</div>' +
    '<p style="font-family:\'Playfair Display\',serif;font-size:24px;color:#F7F4ED;margin-bottom:10px;">Client Hub</p>' +
    '<p style="font-size:13px;color:rgba(247,244,237,.55);line-height:1.7;">Checking your sign-in&hellip;</p>' +
    "</div>";
  document.body.insertBefore(overlay, document.body.firstChild);

  function goToLogin() {
    var redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace("/hub/login.html?redirect=" + redirect);
  }

  function signOut() {
    TeiAuth.signOut().then(goToLogin).catch(goToLogin);
  }

  /** Small floating pill for pages with no shared .nav-links (tool pages, articles, suite.html). */
  function renderFloatingSignOut(email) {
    if (!document.getElementById("hubGatePillStyle")) {
      var style = document.createElement("style");
      style.id = "hubGatePillStyle";
      style.textContent =
        "@media(max-width:480px){#hubGateSignOutPill .hub-gate-pill-email{display:none}}";
      document.head.appendChild(style);
    }

    var pill = document.createElement("div");
    pill.id = "hubGateSignOutPill";
    pill.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:4000;display:flex;align-items:center;gap:8px;" +
      "background:#1D3557;border:1px solid rgba(201,168,76,.4);border-radius:20px;padding:6px 8px 6px 14px;" +
      "font-family:'Inter',sans-serif;font-size:11px;box-shadow:0 4px 16px rgba(0,0,0,.18);";

    var emailSpan = document.createElement("span");
    emailSpan.className = "hub-gate-pill-email";
    emailSpan.style.cssText =
      "color:rgba(247,244,237,.5);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    emailSpan.textContent = email;

    var link = document.createElement("a");
    link.href = "#";
    link.textContent = "Sign out";
    link.style.cssText = "color:#C9A84C;text-decoration:none;font-weight:600;padding:4px 8px;white-space:nowrap;";
    link.addEventListener("click", function (e) {
      e.preventDefault();
      signOut();
    });

    pill.appendChild(emailSpan);
    pill.appendChild(link);
    document.body.appendChild(pill);
  }

  /** Appends into the page's existing nav so sign-out looks like part of the site, not a bolt-on. */
  function renderNavSignOut(navLinks, mobileMenu, email) {
    var li = document.createElement("li");
    li.style.cssText =
      "display:flex;align-items:center;gap:10px;border-left:1px solid rgba(201,168,76,.25);padding-left:20px;list-style:none;";

    var emailSpan = document.createElement("span");
    emailSpan.style.cssText =
      "font-size:12px;color:rgba(247,244,237,.45);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    emailSpan.textContent = email;

    var link = document.createElement("a");
    link.href = "#";
    link.textContent = "Sign out";
    link.style.cssText = "color:rgba(247,244,237,.65);text-decoration:none;font-size:13px;font-weight:500;";
    link.addEventListener("click", function (e) {
      e.preventDefault();
      signOut();
    });

    li.appendChild(emailSpan);
    li.appendChild(link);
    navLinks.appendChild(li);

    if (mobileMenu) {
      var mLink = document.createElement("a");
      mLink.href = "#";
      mLink.textContent = "Sign out (" + email + ")";
      mLink.style.cssText =
        "color:rgba(247,244,237,.8);text-decoration:none;padding:14px 24px;font-size:15px;font-weight:500;" +
        "border-bottom:1px solid rgba(255,255,255,.06);display:block;";
      mLink.addEventListener("click", function (e) {
        e.preventDefault();
        signOut();
      });
      mobileMenu.appendChild(mLink);
    }
  }

  function injectSignedInUI(user) {
    var email = (user && user.email) || "Signed in";
    var navLinks = document.querySelector(".nav-links");
    if (navLinks) {
      renderNavSignOut(navLinks, document.querySelector(".nav-mobile-menu"), email);
    } else {
      renderFloatingSignOut(email);
    }
  }

  TeiAuth.waitForReady()
    .then(function () {
      return TeiAuth.getUser();
    })
    .then(function (result) {
      var user = result.data && result.data.user;
      if (result.error || !user) {
        goToLogin();
        return;
      }
      overlay.remove();
      injectSignedInUI(user);
    })
    .catch(goToLogin);
})();
