/**
 * Security response headers of a tenant host (kept out of `proxy.ts` so the rule is unit-testable and the proxy file exports
 * only what Next expects). No `next/headers` import: it runs in the proxy.
 */

/**
 * The ONE tenant page another page may frame: the Branding editor's live preview (`LoginPreview` draws
 * `<iframe src="/preview/login">`). Every other tenant path stays `DENY` (clickjacking).
 */
export const FRAMEABLE_TENANT_PATH = "/preview/login";

/** Sets the tenant security headers on `headers` for a request to `pathname`. */
export function setTenantSecurityHeaders(headers: Headers, pathname: string): void {
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("X-Content-Type-Options", "nosniff");
  if (pathname === FRAMEABLE_TENANT_PATH) {
    // Same-origin framing only, never a foreign page. `frame-ancestors 'self'` is the modern control; SAMEORIGIN is the
    // fallback for a browser that reads only X-Frame-Options.
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  } else {
    headers.set("X-Frame-Options", "DENY");
  }
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}
