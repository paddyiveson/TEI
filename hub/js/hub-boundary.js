/**
 * Client Hub boundary wording ("coaching, not advice"). The wording lives in
 * this file (Wealth OS also has it written into its own "Important" bar), and
 * is shown three ways on signed-in pages:
 *
 *   1. Footer: the boundary block with a "How we work" link, on every page.
 *   2. Short risk warning: beneath the tool, on tool and calculator pages.
 *   3. First-login notice: the boundary block with an "I understand" button,
 *      until the client acknowledges it. The acknowledgement is one row per
 *      login in wealth_os.boundary_acknowledgements (migration 008), so it is
 *      remembered on every device. Advisers are not shown the notice.
 *
 * Loaded by hub-gate.js once the visitor is known to be signed in, so every
 * gated page gets it with no change to the page. Pages that do their own
 * session check (Wealth OS, the education platform) and the Investment Suite
 * include it with a script tag. Requires supabase-config.js and
 * supabase-client.js loaded first. Styles: /hub/css/hub-boundary.css.
 *
 * Where the footer goes: a [data-tei-boundary-footer] element if the page has
 * one, otherwise the end of the page's own footer, otherwise a new footer at
 * the end of the page. Where the warning goes: every [data-tei-risk-warning]
 * element, or on the tool pages listed below, just above the footer. Either
 * attribute may be set to "inherit" to use the page's own text colour tokens
 * (for pages with a light and a dark theme). data-footer="manual" on the script
 * tag means the page shows the footer wording itself (Investment Suite: at the
 * end of each note; Wealth OS: in its "Important" bar).
 */
(function () {
  if (window.TeiBoundary) return;

  var script = document.currentScript;
  var manualFooter = !!script && script.getAttribute("data-footer") === "manual";

  var HOW_URL = "https://theeverydayinvestor.uk/how-we-work";
  var TEXT =
    "The Everyday Investor provides financial coaching and education, not regulated financial advice. " +
    "We are not authorised or regulated by the Financial Conduct Authority and do not make personal recommendations. " +
    "Everything here is educational. The decisions you make are yours.";
  var WARNING =
    "Education, not advice. The Everyday Investor is not authorised or regulated by the FCA, and nothing here is a personal recommendation. " +
    "Investments can fall as well as rise and you may get back less than you put in. " +
    "Forecasts and examples are illustrations based on stated assumptions, not guarantees.";

  // The "Client tools" on /hub/guides.html. Wealth OS marks its own tool pages.
  var TOOL_PATHS = [
    "/hub/guides/wealthforecast",
    "/hub/guides/wealthforecast_mobile",
    "/hub/guides/portfolio",
    "/hub/guides/taxscenario",
    "/hub/guides/property",
    "/hub/guides/portfolio-optimisation-lab",
    "/hub/guides/costofwaiting"
  ];

  function linkHtml(style) {
    return '<a href="' + HOW_URL + '" target="_blank" rel="noopener noreferrer"' +
      (style ? ' style="' + style + '"' : "") + ">How we work</a>";
  }

  window.TeiBoundary = { TEXT: TEXT, WARNING: WARNING, HOW_URL: HOW_URL, linkHtml: linkHtml };

  function make(tag, className, html) {
    var node = document.createElement(tag);
    node.className = className;
    if (html) node.innerHTML = html;
    return node;
  }

  /** True when the element sits on a dark background (its own or an ancestor's). */
  function isDark(node) {
    for (; node && node.nodeType === 1; node = node.parentNode) {
      var m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(node).backgroundColor);
      if (!m) continue;
      var c = m[1].split(",").map(parseFloat);
      if (c.length > 3 && c[3] < 0.5) continue;
      return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 < 0.45;
    }
    return false;
  }

  function theme(node, slot) {
    if (slot && slot.getAttribute("data-tei-boundary-footer") === "inherit") return "inherit";
    if (slot && slot.getAttribute("data-tei-risk-warning") === "inherit") return "inherit";
    return isDark(node) ? "dark" : "light";
  }

  /* ---------------- footer ---------------- */
  /** Returns the page-level element the footer ended up in (or null). */
  function placeFooter() {
    if (manualFooter) return null;
    var block = make("div", "tei-boundary", "<p>" + TEXT + " " + linkHtml() + "</p>");
    var slot = document.querySelector("[data-tei-boundary-footer]");
    var host, anchor;

    if (slot) {
      host = anchor = slot;
    } else {
      var existing = null;
      Array.prototype.forEach.call(document.body.children, function (child) {
        if (child.tagName === "FOOTER") existing = child;
      });
      if (existing) {
        anchor = existing;
        host = existing.querySelector(".footer-inner") || existing;
        block.classList.add("tei-boundary--joined");
        // A footer laid out as a row: let the block wrap onto a row of its own.
        var cs = getComputedStyle(host);
        if (cs.display.indexOf("flex") !== -1 && cs.flexDirection.indexOf("row") === 0) host.style.flexWrap = "wrap";
      } else {
        host = anchor = make("div", "tei-boundary-footer");
        host.setAttribute("role", "contentinfo");
        document.body.appendChild(host);
      }
    }
    host.appendChild(block);
    block.classList.add("tei-boundary--" + theme(host, slot));
    return slot ? null : anchor;
  }

  /* ---------------- short risk warning ---------------- */
  function placeWarnings(footerAnchor) {
    var slots = document.querySelectorAll("[data-tei-risk-warning]");
    if (slots.length) {
      Array.prototype.forEach.call(slots, function (slot) {
        var p = make("p", "tei-risk-warning");
        p.textContent = WARNING;
        slot.appendChild(p);
        p.classList.add("tei-risk-warning--" + theme(slot, slot));
      });
      return;
    }
    var path = (location.pathname || "/").replace(/\/+$/, "").replace(/\.html$/, "");
    if (TOOL_PATHS.indexOf(path) === -1) return;
    var p = make("p", "tei-risk-warning");
    p.textContent = WARNING;
    if (footerAnchor && footerAnchor.parentNode) footerAnchor.parentNode.insertBefore(p, footerAnchor);
    else document.body.appendChild(p);
    p.classList.add("tei-risk-warning--" + theme(p.parentNode));
  }

  /* ---------------- first-login notice ---------------- */
  function showNotice(save) {
    var lastFocus = document.activeElement;
    var notice = make("div", "tei-boundary-notice");
    notice.setAttribute("role", "dialog");
    notice.setAttribute("aria-modal", "true");
    notice.setAttribute("aria-label", "How we work");
    notice.innerHTML =
      '<div class="tei-boundary-notice-card">' +
        '<div class="tei-boundary-notice-mark" aria-hidden="true">&#10022;</div>' +
        '<p class="tei-boundary-notice-text">' + TEXT + " " + linkHtml() + "</p>" +
        '<button type="button" class="tei-boundary-notice-btn">I understand</button>' +
      "</div>";
    document.body.appendChild(notice);

    var button = notice.querySelector("button");
    var link = notice.querySelector("a");

    // Keep keyboard focus inside the notice while it is open.
    function onKeydown(e) {
      if (e.key !== "Tab") return;
      var active = document.activeElement;
      if (!notice.contains(active)) { e.preventDefault(); button.focus(); }
      else if (e.shiftKey && active === link) { e.preventDefault(); button.focus(); }
      else if (!e.shiftKey && active === button) { e.preventDefault(); link.focus(); }
    }
    function close() {
      document.removeEventListener("keydown", onKeydown, true);
      notice.remove();
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    }
    document.addEventListener("keydown", onKeydown, true);

    button.addEventListener("click", function () {
      button.disabled = true;
      save().then(function (res) {
        // 23505: already acknowledged on another device or tab, which is fine.
        if (res && res.error && res.error.code !== "23505") {
          console.warn("Boundary acknowledgement was not saved; the notice will show again.", res.error);
        }
        close();
      }, function (err) {
        console.warn("Boundary acknowledgement was not saved; the notice will show again.", err);
        close();
      });
    });
    button.focus();
  }

  function checkAcknowledgement(client, user) {
    var db = client.schema("wealth_os");
    return db.from("boundary_acknowledgements").select("acknowledged_at").eq("user_id", user.id).maybeSingle()
      .then(function (ack) {
        // Already acknowledged, or the table is not there yet (migration 008): no notice.
        if (ack.error || ack.data) return;
        return db.from("profiles").select("role").eq("user_id", user.id).maybeSingle().then(function (profile) {
          if (profile.data && profile.data.role === "adviser") return;
          showNotice(function () {
            // acknowledged_at is set by the database, not sent from here.
            return db.from("boundary_acknowledgements").insert({ user_id: user.id });
          });
        });
      });
  }

  /* ---------------- start ---------------- */
  function whenDomReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function loadStyles(done) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/hub/css/hub-boundary.css";
    link.onload = link.onerror = done;
    document.head.appendChild(link);
  }

  if (!window.TeiAuth) return;
  TeiAuth.waitForReady()
    .then(function (client) {
      return client.auth.getUser().then(function (result) {
        var user = result.data && result.data.user;
        if (result.error || !user) return;
        loadStyles(function () {
          whenDomReady(function () {
            placeWarnings(placeFooter());
            checkAcknowledgement(client, user).catch(function (err) {
              console.warn("Boundary acknowledgement check failed.", err);
            });
          });
        });
      });
    })
    .catch(function () {});
})();
