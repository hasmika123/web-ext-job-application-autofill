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
 * Which organization the `/org` console is showing for someone who belongs to several (O1.6): the org id, httpOnly,
 * a year. It is a PREFERENCE, never a credential: the server checks it against `GET /api/orgs/mine` on every request,
 * so a forged or stale value falls back to the first org the person administers. Written only by `POST /api/orgs/current`.
 */
export const ORG_COOKIE = "kiwiply_org";
export const ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * How long a session persists without re-login. The access token *inside* the cookie
 * expires in 15 min and is silently refreshed by `proxy.ts` using the refresh token,
 * which the API re-issues with this same window on every refresh — so the session is a
 * rolling 90-day window: active users stay signed in indefinitely, idle ones until this
 * elapses. Must stay >= the API's `token-validity-in-seconds-for-remember-me`.
 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

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
