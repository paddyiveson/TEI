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
  // Loading screen in the redesign style (spec B1.2): the page background,
  // the ring mark and Geist, light or dark from the shared "tei-theme" key, so
  // the hand-off to the sign-in page or the Hub never flashes the old look.
  // Light, dark, or follow the device; dark when nothing is saved, as in
  // hub/js/tei-theme.js (which normally loads first and decides).
  var dark = false;
  if (window.TeiTheme) dark = window.TeiTheme.resolved() === "dark";
  else {
    var pref = null;
    try { pref = localStorage.getItem("tei-theme"); } catch (e) {}
    dark = pref === "dark" || (pref !== "light" && (pref !== "system" || !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)));
  }
  var bg = dark ? "#08111F" : "#EEEAE1";
  var ink = dark ? "#F7F4ED" : "#13213A";
  var muted = dark ? "#AAB6C8" : "#4E5B70";
  var gold = dark ? "#E8D6A8" : "#14376E";
  var overlay = document.createElement("div");
  overlay.id = "hubGate";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:5000;background:" + bg + ";color:" + ink + ";" +
    "display:flex;align-items:center;justify-content:center;padding:24px;" +
    "font-family:'Geist',system-ui,-apple-system,'Segoe UI',sans-serif;";
  overlay.innerHTML =
    "<style>@keyframes hubGateSpin{to{transform:rotate(360deg)}}" +
    "@media (prefers-reduced-motion:reduce){#hubGate .hg-spin{animation:none!important}}</style>" +
    '<div style="text-align:center;">' +
    '<div style="position:relative;width:56px;height:56px;margin:0 auto 22px;">' +
    '<svg width="56" height="56" viewBox="0 0 26 26" aria-hidden="true" focusable="false">' +
    '<circle cx="13" cy="13" r="11.5" fill="none" stroke="' + gold + '" stroke-opacity=".35" stroke-width="1"/>' +
    '<circle cx="13" cy="13" r="6" fill="none" stroke="' + gold + '" stroke-opacity=".5" stroke-width="1"/>' +
    '<circle cx="13" cy="13" r="2.4" fill="' + gold + '"/></svg>' +
    '<svg class="hg-spin" width="56" height="56" viewBox="0 0 26 26" aria-hidden="true" focusable="false" ' +
    'style="position:absolute;inset:0;animation:hubGateSpin 1.4s linear infinite;">' +
    '<path d="M13 1.5a11.5 11.5 0 0 1 11.5 11.5" fill="none" stroke="' + gold + '" stroke-width="1.4" stroke-linecap="round"/></svg>' +
    "</div>" +
    '<p style="margin:0;font-size:15px;font-weight:400;letter-spacing:-0.01em;">The Everyday Investor</p>' +
    '<p style="margin:6px 0 0;font-size:13px;font-weight:300;color:' + muted + ';">Checking your sign-in&hellip;</p>' +
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
    // A page with its own Sign out control (the redesigned Client Hub) just
    // has it wired up; nothing is added to the page.
    var own = document.querySelectorAll("[data-hub-signout]");
    if (own.length) {
      Array.prototype.forEach.call(own, function (el) {
        el.addEventListener("click", function (e) { e.preventDefault(); signOut(); });
      });
      return;
    }
    var navLinks = document.querySelector(".nav-links");
    if (navLinks) {
      renderNavSignOut(navLinks, document.querySelector(".nav-mobile-menu"), email);
    } else {
      renderFloatingSignOut(email);
    }
  }

  /** Footer wording, tool risk warning and first-login notice: see hub-boundary.js. */
  function loadBoundaryWording() {
    if (window.TeiBoundary) return;
    var script = document.createElement("script");
    script.src = "/hub/js/hub-boundary.js";
    document.body.appendChild(script);
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
      // This script sits at the top of <body>, so wait for the rest of the
      // page before looking for its nav or its own Sign out control.
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { injectSignedInUI(user); });
      } else {
        injectSignedInUI(user);
      }
      loadBoundaryWording();
    })
    .catch(goToLogin);
})();
