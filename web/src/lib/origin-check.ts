/**
 * Same-origin check for state-changing requests on a tenant host (doc 42 T27, SEC-16; the web half of the API's planned
 * `OriginCheckFilter`).
 *
 * `*.kiwiply.com` tenants are same-SITE, so a `SameSite=Lax` cookie IS sent from `evil.kiwiply.com` to `acme.kiwiply.com`. A
 * cookie-authenticated POST/PUT/PATCH/DELETE must therefore carry an `Origin` (else `Referer`) whose host is the host that was
 * addressed. Neither header, an unparseable one or `Origin: null` fails (the caller answers a generic 404). Safe methods are
 * never checked. Pure and edge-safe.
 */
import { normalizeHost } from "@/lib/tenant-host";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return normalizeHost(u.host) || null;
  } catch {
    return null;
  }
}

/** True when the request may proceed: a safe method, or an Origin (else Referer) on `host`. */
export function sameOriginForUnsafe(method: string, headers: { get(name: string): string | null }, host: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  const origin = headers.get("origin");
  // A present Origin decides alone (`null` from a sandboxed frame or a redirect chain never matches); Referer only when there is none.
  const claimed = origin !== null ? hostOf(origin) : hostOf(headers.get("referer"));
  return claimed !== null && claimed === normalizeHost(host);
}
