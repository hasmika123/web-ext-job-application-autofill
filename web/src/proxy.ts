import { NextResponse, type NextRequest } from "next/server";
import { apiUrl } from "@/lib/config";
import { SURFACE_HEADER, isRewriteExempt, isTenantRoutePath, isTenantPublicPath, requestHost, TENANT_HOST_HEADER, TENANT_ROUTE_PREFIX, tenantApiHeaders } from "@/lib/tenant-host";
import { resolveHost } from "@/lib/tenant";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { ACCESS_COOKIE, REFRESH_COOKIE, sessionCookieNames, sessionCookieOptions, sessionCookieOptionsFor } from "@/lib/cookies";
import { hasTenantClaim, isExpired, passwordChangeRequired } from "@/lib/jwt-claims";
import { sameOriginForUnsafe } from "@/lib/origin-check";
import { loginRedirectPath } from "@/lib/tenant-urls";

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
 *
 * Tenant hosts (X2.6) are different and are handled by `tenantRequest`: login-first (a signed-out visitor to any tenant path
 * but the public ones is sent to the tenant's /login with a safe return-to), tid-bound `__Host-` session cookies refreshed with
 * the host header (the API refuses a tid/host mismatch), same-origin enforcement for state-changing requests, and the tenant
 * response headers. The platform path below is the same code it always was.
 */
export async function proxy(request: NextRequest) {
  // X1.4: every request carries the host it was addressed to as an internal header (always overwritten, so a
  // browser-supplied x-kiwiply-host is never believed). Server components and serverApiFetch read it.
  const host = requestHost(request.headers);
  const pathname = request.nextUrl.pathname;

  const resolution = await resolveHost(host, clientIpFromHeaders(request.headers));
  if (resolution.kind !== "PLATFORM") return tenantRequest(request, host, pathname, resolution.kind === "TENANT");
  // The auth endpoints manage their own cookies: on the platform the proxy stays out of them exactly as before X2.6.
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return NextResponse.next();
  // A platform host never serves the tenant tree: /_t/* is a plain 404 there.
  if (isTenantRoutePath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/_not-a-tenant-host";
    return NextResponse.rewrite(url, { request: { headers: withHost(request, host, "platform") } });
  }
  return platformSession(request, host);
}

function withHost(request: NextRequest, host: string, surface: "platform" | "tenant"): Headers {
  const h = new Headers(request.headers);
  h.set(TENANT_HOST_HEADER, host);
  h.set(SURFACE_HEADER, surface); // always overwritten: the root layout trusts it to decide whether Kiwiply's own chrome mounts
  return h;
}

// ---- tenant hosts (X2.6) ----------------------------------------------------------------------------------------------

/** Security headers every tenant response carries (the full CSP set is X3.7; these four are the ones with no downside now). */
function tenantHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

type TenantSession = { authed: boolean; hadCookies: boolean; renewed?: { accessToken: string; refreshToken?: string }; /** The account holds an administrator-issued temporary password: only the change-password screen works. */ mustChangePassword?: boolean };

/**
 * Cheap session read on a tenant host: a still-valid tid-bound access token, else one refresh attempt that carries the host
 * (the API refuses a session of another tenant). This does not prove the token belongs to THIS tenant (the proxy does not know
 * the org id; the API checks `tid` against the host on every call and answers 401): pages that need it re-validate through
 * `GET /api/me/tenant` (`lib/ent/tenant-session.ts`).
 */
async function tenantSession(request: NextRequest, host: string): Promise<TenantSession> {
  const names = sessionCookieNames(true);
  const access = request.cookies.get(names.access)?.value;
  const refresh = request.cookies.get(names.refresh)?.value;
  const hadCookies = Boolean(access || refresh);
  if (access && !isExpired(access) && hasTenantClaim(access)) {
    // A token that says "change the temporary password" keeps the person on the change-password screen. No refresh is attempted here
    // (a refresh rotates the token, and parallel requests would trip reuse detection): the change itself swaps the cookies.
    return { authed: true, hadCookies, mustChangePassword: passwordChangeRequired(access) };
  }
  if (!refresh) return { authed: false, hadCookies };
  const renewed = await tryRefresh(refresh, tenantApiHeaders(host, clientIpFromHeaders(request.headers)));
  // A refreshed pair that is not tid-bound is not a tenant session (the API always binds on a tenant host): refuse it.
  if (!renewed || !hasTenantClaim(renewed.accessToken)) return { authed: false, hadCookies };
  return { authed: true, hadCookies, renewed, mustChangePassword: passwordChangeRequired(renewed.accessToken) };
}

async function tenantRequest(request: NextRequest, host: string, pathname: string, served: boolean) {
  const notFound = () => tenantHeaders(new NextResponse("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }));
  // T27: a state-changing request must come from this very host (Origin, else Referer); anything else is a generic 404.
  if (!sameOriginForUnsafe(request.method, request.headers, host)) return notFound();

  const headers = withHost(request, host, "tenant");
  const rewrite = () => {
    const url = request.nextUrl.clone();
    url.pathname = TENANT_ROUTE_PREFIX + (pathname === "/" ? "" : pathname);
    return NextResponse.rewrite(url, { request: { headers } });
  };
  // Not a served tenant (unknown host, or the API is down): the tenant layout answers 404 / "try again". No session logic.
  if (!served) return tenantHeaders(isRewriteExempt(pathname) ? NextResponse.next({ request: { headers } }) : rewrite());

  const isAuthApi = pathname === "/api/auth" || pathname.startsWith("/api/auth/");
  const isStaticOrAsset = pathname.startsWith("/_next/") || pathname.startsWith("/tenant-assets/") || (!pathname.startsWith("/api/") && isRewriteExempt(pathname));
  // The BFF auth endpoints write the cookies themselves; static files and tenant assets need no session.
  if (isAuthApi || isStaticOrAsset) return tenantHeaders(NextResponse.next({ request: { headers } }));

  const session = await tenantSession(request, host);
  if (session.renewed) {
    // visible to THIS request's render, and persisted to the browser
    const names = sessionCookieNames(true);
    request.cookies.set(names.access, session.renewed.accessToken);
    if (session.renewed.refreshToken) request.cookies.set(names.refresh, session.renewed.refreshToken);
    headers.set("cookie", request.cookies.toString());
  }

  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  if (session.authed && session.mustChangePassword && !isApi && pathname !== "/change-password") {
    // A temporary password: nothing else works until the person chooses their own (the API refuses it too).
    const url = request.nextUrl.clone();
    url.pathname = "/change-password";
    url.search = "";
    const redirect = NextResponse.redirect(url, 307);
    if (session.renewed) {
      const names = sessionCookieNames(true);
      const opts = sessionCookieOptionsFor(true);
      redirect.cookies.set(names.access, session.renewed.accessToken, opts);
      if (session.renewed.refreshToken) redirect.cookies.set(names.refresh, session.renewed.refreshToken, opts);
    }
    return tenantHeaders(redirect);
  }
  let response: NextResponse;
  if (!session.authed && !isApi && !isTenantPublicPath(pathname)) {
    // Login-first: a signed-out visitor to any tenant path goes to the tenant's own sign-in, then back (same-host paths only).
    const url = request.nextUrl.clone();
    const target = loginRedirectPath(pathname, request.nextUrl.search);
    const [loginPath, query] = target.split("?");
    url.pathname = loginPath;
    url.search = query ? `?${query}` : "";
    response = NextResponse.redirect(url, 307);
    if (session.hadCookies) {
      // dead or foreign cookies: drop them so the sign-in page starts clean
      const names = sessionCookieNames(true);
      response.cookies.delete(names.access);
      response.cookies.delete(names.refresh);
    }
    return tenantHeaders(response);
  }
  response = isApi ? NextResponse.next({ request: { headers } }) : rewrite();
  if (session.renewed) {
    const names = sessionCookieNames(true);
    const opts = sessionCookieOptionsFor(true);
    response.cookies.set(names.access, session.renewed.accessToken, opts);
    if (session.renewed.refreshToken) response.cookies.set(names.refresh, session.renewed.refreshToken, opts);
  }
  return tenantHeaders(response);
}

// ---- the platform (unchanged) ------------------------------------------------------------------------------------------

async function platformSession(request: NextRequest, host: string) {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  // Fast path: no refresh token, or the access token is still good → nothing to do.
  if (!refresh || !isExpired(access)) {
    return NextResponse.next({ request: { headers: withHost(request, host, "platform") } });
  }

  const renewed = await tryRefresh(refresh);
  if (!renewed) {
    // Couldn't refresh (expired/revoked/unreachable). Leave cookies as-is and let the
    // app layout's /api/account gate decide (redirect to /login when truly signed out).
    return NextResponse.next({ request: { headers: withHost(request, host, "platform") } });
  }

  // Make the new token visible to THIS request's render, then persist it to the browser.
  request.cookies.set(ACCESS_COOKIE, renewed.accessToken);
  if (renewed.refreshToken) request.cookies.set(REFRESH_COOKIE, renewed.refreshToken);

  const response = NextResponse.next({ request: { headers: withHost(request, host, "platform") } });
  const opts = sessionCookieOptions();
  response.cookies.set(ACCESS_COOKIE, renewed.accessToken, opts);
  if (renewed.refreshToken) response.cookies.set(REFRESH_COOKIE, renewed.refreshToken, opts);
  return response;
}

/** Exchange a refresh token for a fresh access+refresh pair. Null on any failure. `extra` = the tenant host headers (X2.6). */
async function tryRefresh(refreshToken: string, extra: Record<string, string> = {}): Promise<{ accessToken: string; refreshToken?: string } | null> {
  try {
    const res = await fetch(apiUrl("/api/refresh"), {
      method: "POST",
      headers: { "content-type": "application/json", ...extra },
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
  // Run on app pages and data routes, but NOT on static assets. The auth endpoints (login/logout/refresh) manage cookies
  // themselves, so the platform path returns early for them; they ARE matched so a tenant host's state-changing auth calls get
  // the same-origin check (X2.6).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|opengraph-image).*)"],
};
