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
import { ACCESS_COOKIE, REFRESH_COOKIE, sessionCookieOptions } from "@/lib/cookies";

// Cookie names + lifetime live in `@/lib/cookies` (sharable with proxy.ts). Re-exported
// here so existing importers keep working. The access token inside expires in ~15 min
// and is silently refreshed (proxy.ts) using the refresh token.
export { ACCESS_COOKIE, REFRESH_COOKIE };

/** Set the access (and optionally refresh) token cookies. Call from a Route Handler. */
export async function setAuthCookies(accessToken: string, refreshToken?: string | null) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, sessionCookieOptions());
  if (refreshToken) {
    store.set(REFRESH_COOKIE, refreshToken, sessionCookieOptions());
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
