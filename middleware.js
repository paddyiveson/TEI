import { createServerClient } from "@supabase/ssr";

export const config = {
  matcher: ["/hub/:path*"],
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

  if (!PROTECTED_EXACT.has(pathname) || pathname.startsWith("/hub/js/")) {
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
    const loginUrl = new URL("/hub/login.html", url.origin);
    loginUrl.searchParams.set("redirect", pathname + url.search);
    return Response.redirect(loginUrl.toString(), 302);
  }
}
