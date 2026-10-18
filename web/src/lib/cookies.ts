/**
 * Shared session-cookie names + options.
 *
 * Kept in its own module (NO `next/headers` import) so it can be used by BOTH the
 * request-scoped cookie helpers (`auth.ts`, Route Handlers) AND `proxy.ts`, which runs
 * before render and must not pull the request-scoped `cookies()` API into its runtime.
 */

// R7.1 rename: dossier_* → kiwiply_*. The cookie names live here; everything else
// (auth.ts, proxy.ts) imports them so the names never drift.
export const ACCESS_COOKIE = "kiwiply_access";
export const REFRESH_COOKIE = "kiwiply_refresh";

/**
 * How long a session persists without re-login. The access token *inside* the cookie
 * expires in 15 min and is silently refreshed by `proxy.ts` using the refresh token,
 * which the API re-issues with this same window on every refresh — so the session is a
 * rolling 90-day window: active users stay signed in indefinitely, idle ones until this
 * elapses. Must stay >= the API's `token-validity-in-seconds-for-remember-me`.
 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/**
 * Tenant hosts (X1.5 spec gap, doc 42 T19): the session cookies carry the `__Host-` prefix (browser-enforced: Secure, no Domain,
 * Path=/), so a sibling tenant or `evil.kiwiply.com` can never plant or shadow them with a `Domain=.kiwiply.com` cookie. A tenant
 * host reads and writes ONLY these names; the platform reads and writes ONLY the plain ones, so neither ever sees the other's.
 */
export const TENANT_ACCESS_COOKIE = "__Host-kiwiply_access";
export const TENANT_REFRESH_COOKIE = "__Host-kiwiply_refresh";

export function sessionCookieNames(tenant: boolean): { access: string; refresh: string } {
  return tenant ? { access: TENANT_ACCESS_COOKIE, refresh: TENANT_REFRESH_COOKIE } : { access: ACCESS_COOKIE, refresh: REFRESH_COOKIE };
}

/** Cookie options for the host kind: tenant cookies are always `Secure` (a `__Host-` cookie must be; Chromium accepts it on `*.localhost`). */
export function sessionCookieOptionsFor(tenant: boolean) {
  const base = sessionCookieOptions();
  return tenant ? { ...base, secure: true } : base;
}

/**
 * Options that EXPIRE a session cookie. A browser ignores a `Set-Cookie` for a `__Host-` name that lacks `Secure` (and a
 * deletion is just a `Set-Cookie` with `Max-Age=0`), so the delete must carry the SAME attributes the cookie was set with:
 * `Secure` on a tenant host, `Path=/`, no `Domain`. A bare `cookies.delete(name)` leaves a tenant member signed in.
 */
export function expiredCookieOptionsFor(tenant: boolean) {
  return { ...sessionCookieOptionsFor(tenant), maxAge: 0, expires: new Date(0) };
}

/** Options for the httpOnly session cookies. Used wherever these cookies are written. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
