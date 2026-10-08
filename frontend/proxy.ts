import { NextResponse, type NextRequest } from "next/server";

const LOCALE_COOKIE = "locale";
const ADMIN_COOKIE = "ja_admin_session";

/**
 * - `?lang=he|en` on any page stores the language preference and redirects
 *   to the clean URL (useful for shareable links).
 * - Admin pages require the session cookie; the API still verifies the token
 *   on every request, this only avoids rendering the panel for visitors.
 */
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const lang = searchParams.get("lang");
  if (lang === "he" || lang === "en") {
    const url = request.nextUrl.clone();
    url.searchParams.delete("lang");
    const response = NextResponse.redirect(url);
    response.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return response;
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !request.cookies.has(ADMIN_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip API proxying, uploads, Next internals and static files.
  matcher: ["/((?!api|health|uploads|_next/static|_next/image|images|favicon|robots.txt|sitemap.xml).*)"],
};
