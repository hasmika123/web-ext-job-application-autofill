/**
 * T5.2: security response headers of the main site (kiwiply.com), wired in `next.config.ts` `headers()`. Tenant hosts add their own set in
 * `tenant-headers.ts` (proxy); the two never disagree: the values below that a tenant also sets are identical, and the CSP here is
 * REPORT-ONLY, a different header from the enforced `frame-ancestors` policy a tenant preview page sends.
 *
 * Plain TypeScript with no `@/` alias imports: `next.config.ts` loads it before Next's own resolver exists.
 */

export type HeaderEntry = { key: string; value: string };

/**
 * Report-only: the app hydrates with inline scripts and Google sign-in / Analytics load from Google, so an enforced policy would need nonces on
 * every page first. Report-only shows violations in the browser console without blocking anything; tighten to enforced once the console is clean.
 */
export function contentSecurityPolicyReportOnly(dev: boolean): string {
  const scripts = ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://www.googletagmanager.com"];
  if (dev) scripts.push("'unsafe-eval'");
  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:" + (dev ? " ws: http://localhost:*" : ""),
    "frame-src 'self' https://accounts.google.com https://js.stripe.com https://checkout.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'self'",
  ].join("; ");
}

export function siteSecurityHeaders(dev: boolean): HeaderEntry[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // SAMEORIGIN, not DENY: the resume preview and the Branding preview frame same-origin pages. Cross-origin framing stays blocked.
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.stripe.com\"), usb=(), interest-cohort=()" },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicyReportOnly(dev) },
  ];
}
