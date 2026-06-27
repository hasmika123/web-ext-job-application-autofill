import { NextResponse, type NextRequest } from "next/server";
import { apiUrl } from "@/lib/config";
import { ACCESS_COOKIE, REFRESH_COOKIE, sessionCookieOptions } from "@/lib/cookies";

/**
 * Transparent session refresh (Next 16 `proxy`, formerly middleware — Node runtime).
 *
 * The access token lives ~15 min; the refresh token ~90 days. Before each render we
 * check the access token: if it's expired (or absent) but a refresh token is present,
 * we exchange it for a fresh pair at the API and write the new cookies — both onto the
 * outgoing response (so the browser persists them) AND onto the current request (so the
 * page being rendered *right now* sees the new token). The result is a rolling 90-day
 * session: active users never get bounced to /login at the 15-min mark.
 *
 * This only *renews* a session; it does NOT gate. The `(app)` layout still validates via
 * `/api/account` and redirects on 401, so if the refresh token is gone/expired/revoked
 * (refresh fails → no new cookies here) the user still lands on /login. Network/API
 * errors are swallowed: a transient API blip must not log a valid user out.
 */
export async function proxy(request: NextRequest) {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  // Fast path: no refresh token, or the access token is still good → nothing to do.
  if (!refresh || !isExpired(access)) {
    return NextResponse.next();
  }

  const renewed = await tryRefresh(refresh);
  if (!renewed) {
    // Couldn't refresh (expired/revoked/unreachable). Leave cookies as-is and let the
    // app layout's /api/account gate decide (redirect to /login when truly signed out).
    return NextResponse.next();
  }

  // Make the new token visible to THIS request's render, then persist it to the browser.
  request.cookies.set(ACCESS_COOKIE, renewed.accessToken);
  if (renewed.refreshToken) request.cookies.set(REFRESH_COOKIE, renewed.refreshToken);

  const response = NextResponse.next({ request: { headers: request.headers } });
  const opts = sessionCookieOptions();
  response.cookies.set(ACCESS_COOKIE, renewed.accessToken, opts);
  if (renewed.refreshToken) response.cookies.set(REFRESH_COOKIE, renewed.refreshToken, opts);
  return response;
}

/** True if the JWT is missing or its `exp` is within 30s of now (treat as expired). */
function isExpired(jwt: string | undefined): boolean {
  if (!jwt) return true;
  const parts = jwt.split(".");
  if (parts.length < 2) return true;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    if (typeof exp !== "number") return true;
    return Date.now() >= (exp - 30) * 1000;
  } catch {
    return true; // unparseable token → force a refresh attempt
  }
}

/** Exchange a refresh token for a fresh access+refresh pair. Null on any failure. */
async function tryRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string } | null> {
  try {
    const res = await fetch(apiUrl("/api/refresh"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken) return null;
    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
  } catch {
    return null;
  }
}

export const config = {
  // Run on app pages and data routes, but NOT on the auth endpoints (login/logout/refresh
  // manage cookies themselves — refreshing there would be circular) or on static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|opengraph-image|api/auth).*)"],
};
