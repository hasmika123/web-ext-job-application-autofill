/**
 * Cookie-based session helpers (server-only).
 *
 * The JWT from the Spring API is stored in httpOnly cookies so it's never readable
 * by client-side JavaScript. These helpers only run on the server — in Route Handlers
 * (which can set/delete cookies) and Server Components (which can read them).
 *
 * Next 16: `cookies()` is async — always `await` it.
 *
 * X2.6: on a tenant host the cookies are the `__Host-` pair (see `lib/cookies.ts`); on the platform they are exactly the plain
 * names they always were.
 */
import { cookies, headers } from "next/headers";
import { ACCESS_COOKIE, REFRESH_COOKIE, expiredCookieOptionsFor, sessionCookieNames, sessionCookieOptionsFor } from "@/lib/cookies";
import { getEnterpriseSwitch } from "@/lib/tenant";
import { isPlatformHost, requestHost } from "@/lib/tenant-host";

// Cookie names + lifetime live in `@/lib/cookies` (sharable with proxy.ts). Re-exported
// here so existing importers keep working. The access token inside expires in ~15 min
// and is silently refreshed (proxy.ts) using the refresh token.
export { ACCESS_COOKIE, REFRESH_COOKIE };

/**
 * Is this request on a tenant host? A non-platform host while the enterprise flag is not off: those hosts use the `__Host-`
 * cookie names. Recomputed from the raw host (never the browser-sendable `x-kiwiply-host`), the same rule the proxy applies
 * through `resolveHost`, so the BFF handlers (which the proxy does not rewrite) and the pages agree. Outside a request (a
 * script) it is the platform.
 */
export async function onTenantHost(): Promise<boolean> {
  try {
    const host = requestHost(await headers());
    if (host === "" || isPlatformHost(host)) return false;
    return (await getEnterpriseSwitch()) !== "off";
  } catch {
    return false;
  }
}

/** Set the access (and optionally refresh) token cookies. Call from a Route Handler. */
export async function setAuthCookies(accessToken: string, refreshToken?: string | null) {
  const tenant = await onTenantHost();
  const names = sessionCookieNames(tenant);
  const store = await cookies();
  store.set(names.access, accessToken, sessionCookieOptionsFor(tenant));
  if (refreshToken) {
    store.set(names.refresh, refreshToken, sessionCookieOptionsFor(tenant));
  } else {
    // A new sign-in replaces the session: never leave the previous member's refresh token behind to be silently renewed.
    store.set(names.refresh, "", expiredCookieOptionsFor(tenant));
  }
}

/**
 * Remove both auth cookies (sign out). Call from a Route Handler. The expiry carries the attributes the cookies were set with
 * (`Secure` + `Path=/` on a tenant host): a browser ignores a `__Host-` Set-Cookie without `Secure`, which left the member signed in.
 */
export async function clearAuthCookies() {
  const tenant = await onTenantHost();
  const names = sessionCookieNames(tenant);
  const store = await cookies();
  const expired = expiredCookieOptionsFor(tenant);
  store.set(names.access, "", expired);
  store.set(names.refresh, "", expired);
}

export async function getAccessToken(): Promise<string | undefined> {
  const names = sessionCookieNames(await onTenantHost());
  return (await cookies()).get(names.access)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const names = sessionCookieNames(await onTenantHost());
  return (await cookies()).get(names.refresh)?.value;
}

/** Cheap check for "is there a session cookie" — does not validate the token. */
export async function hasSession(): Promise<boolean> {
  return Boolean(await getAccessToken());
}
