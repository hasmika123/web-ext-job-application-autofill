/**
 * Cookie-based session helpers (server-only).
 *
 * The JWT from the Spring API is stored in httpOnly cookies so it's never readable
 * by client-side JavaScript. These helpers only run on the server — in Route Handlers
 * (which can set/delete cookies) and Server Components (which can read them).
 *
 * Next 16: `cookies()` is async — always `await` it.
 */
import { cookies } from "next/headers";

// R7.1 rename: dossier_* → kiwiply_*. Forces a one-time re-login for existing users
// (the old-named cookies stop being read). The cookie names live only here; route
// handlers go through the helpers below.
export const ACCESS_COOKIE = "kiwiply_access";
export const REFRESH_COOKIE = "kiwiply_refresh";

// The cookies persist for 30 days; the *access token* inside expires much sooner and
// is refreshed via /api/auth/refresh. Storing both lets us refresh without re-login.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

/** Set the access (and optionally refresh) token cookies. Call from a Route Handler. */
export async function setAuthCookies(accessToken: string, refreshToken?: string | null) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, baseCookieOptions());
  if (refreshToken) {
    store.set(REFRESH_COOKIE, refreshToken, baseCookieOptions());
  }
}

/** Remove both auth cookies (sign out). Call from a Route Handler. */
export async function clearAuthCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

/** Cheap check for "is there a session cookie" — does not validate the token. */
export async function hasSession(): Promise<boolean> {
  return Boolean(await getAccessToken());
}
