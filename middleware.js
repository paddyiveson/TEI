import { createServerClient } from "@supabase/ssr";

export const config = {
  matcher: ["/hub/:path*", "/admin/:path*"],
};

// Only these hub pages require a real Supabase login. Everything else under
// /hub/* is public by default (fronted instead by a shared client-side
// password gate on the pages themselves, for pilot-cohort convenience) --
// Wealth OS gates real per-client financial data, and the education platform
// gates per-user lesson progress (CompletionStore has no guest fallback).
const PROTECTED_EXACT = new Set([
  "/hub/wealth-os.html",
  "/hub/education/index.html",
  "/hub/education/lesson.html",
  "/hub/education/module.html",
]);

// Everything under /admin/ requires a session, except the login page itself
// and the static assets it needs to load before that check can even run.
// Role verification (adviser vs. client) happens client-side on each admin
// page via TeiAdminAuth.requireAdviser() -- this middleware only confirms a
// session exists, same division of responsibility as the hub check above.
function isProtectedAdminPath(pathname) {
  if (pathname === "/admin/login.html") return false;
  if (pathname.startsWith("/admin/js/") || pathname.startsWith("/admin/css/")) return false;
  return pathname.startsWith("/admin/");
}

// Members' articles (/hub/members/<slug>.html) are members only: the page is
// served only with a signed-in session (Paddy, 10 Nov 2026). Everyone else,
// link-preview robots included, gets a stub that carries the article's link
// preview (words-only og image, from /hub/members-articles.json) and sends
// people on to sign in. The article's text and figures never leave the server.
const MEMBERS_ARTICLE = /^\/hub\/members\/([a-z0-9-]+)\.html$/;
const SITE = "https://www.theeverydayinvestor.uk";

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function membersStub(url, slug) {
  let a = null;
  try {
    const r = await fetch(new URL("/hub/members-articles.json", url.origin));
    if (r.ok) a = (await r.json()).find((x) => x && x.slug === slug) || null;
  } catch (e) {}
  const login = "/hub/login.html?redirect=" + encodeURIComponent(url.pathname + url.search);
  const title = a ? a.title : "Members' article";
  const desc = a ? a.teaser : "A members' article from The Everyday Investor.";
  const img = a && a.images && a.images.og ? SITE + a.images.og : "";
  const alt = a && a.images ? a.images.alt : "";
  const meta = [
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="The Everyday Investor">',
    '<meta property="og:title" content="' + escHtml(title) + '">',
    '<meta property="og:description" content="' + escHtml(desc) + '">',
    '<meta property="og:url" content="' + escHtml(SITE + url.pathname) + '">',
    img ? '<meta property="og:image" content="' + escHtml(img) + '">' : "",
    img ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : "",
    alt ? '<meta property="og:image:alt" content="' + escHtml(alt) + '">' : "",
    '<meta name="twitter:card" content="' + (img ? "summary_large_image" : "summary") + '">',
    '<meta name="twitter:title" content="' + escHtml(title) + '">',
    '<meta name="twitter:description" content="' + escHtml(desc) + '">',
    img ? '<meta name="twitter:image" content="' + escHtml(img) + '">' : "",
  ].filter(Boolean).join("\n");
  const html = '<!doctype html><html lang="en-GB"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>" + escHtml(title) + " | The Everyday Investor</title>" +
    '<meta name="description" content="' + escHtml(desc) + '"><meta name="robots" content="noindex">\n' + meta +
    '\n<meta http-equiv="refresh" content="0;url=' + escHtml(login) + '">' +
    "</head><body style=\"margin:0;background:#0B1729;color:#F7F4ED;font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center\">" +
    "<p>This article is for members. <a style=\"color:#E8D6A8\" href=\"" + escHtml(login) + "\">Sign in</a> or <a style=\"color:#E8D6A8\" href=\"/membership.html\">see membership</a>.</p>" +
    "<script>location.replace(" + JSON.stringify(login) + ");</script></body></html>";
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" },
  });
}

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return [];
  return cookieHeader.split(";").map((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return { name: part.trim(), value: "" };
    return {
      name: part.slice(0, idx).trim(),
      value: part.slice(idx + 1).trim(),
    };
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const { pathname } = url;

  const isHub = PROTECTED_EXACT.has(pathname) && !pathname.startsWith("/hub/js/");
  const isAdmin = isProtectedAdminPath(pathname);
  const member = pathname.match(MEMBERS_ARTICLE);
  if (!isHub && !isAdmin && !member) {
    return;
  }

  const supabase = createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("cookie") || "");
        },
        // Session refresh happens client-side via teiSupabase.auth.getUser().
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && member) return membersStub(url, member[1]);
  if (!user) {
    const loginPath = isAdmin ? "/admin/login.html" : "/hub/login.html";
    const loginUrl = new URL(loginPath, url.origin);
    loginUrl.searchParams.set("redirect", pathname + url.search);
    return Response.redirect(loginUrl.toString(), 302);
  }
}
