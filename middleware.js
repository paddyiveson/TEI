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
  if (!isHub && !isAdmin) {
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

  if (!user) {
    const loginPath = isAdmin ? "/admin/login.html" : "/hub/login.html";
    const loginUrl = new URL(loginPath, url.origin);
    loginUrl.searchParams.set("redirect", pathname + url.search);
    return Response.redirect(loginUrl.toString(), 302);
  }
}
