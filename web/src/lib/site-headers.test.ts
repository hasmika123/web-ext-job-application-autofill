// @vitest-environment node
import { describe, expect, it } from "vitest";
import { setTenantSecurityHeaders } from "./tenant-headers";
import { contentSecurityPolicyReportOnly, siteSecurityHeaders } from "./site-headers";

const asMap = (dev: boolean) => new Map(siteSecurityHeaders(dev).map((h) => [h.key.toLowerCase(), h.value]));

describe("main-site security headers (T5.2)", () => {
  it("carries HSTS, nosniff, referrer policy, framing, permissions policy and a report-only CSP", () => {
    const h = asMap(false);
    expect(h.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(h.get("permissions-policy")).toContain("camera=()");
    expect(h.has("content-security-policy-report-only")).toBe(true);
  });

  it("the CSP is report-only and never an enforced Content-Security-Policy (the app uses inline scripts)", () => {
    expect(asMap(false).has("content-security-policy")).toBe(false);
    expect(contentSecurityPolicyReportOnly(false)).toContain("'unsafe-inline'");
  });

  it("the CSP forbids plugins and foreign framing and form targets, and pins the base", () => {
    const csp = contentSecurityPolicyReportOnly(false);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("unsafe-eval is allowed in development only (hot reload)", () => {
    expect(contentSecurityPolicyReportOnly(true)).toContain("'unsafe-eval'");
  });

  it("agrees with the tenant set on every header both send", () => {
    const tenant = new Headers();
    setTenantSecurityHeaders(tenant, "/preview/login");
    const site = asMap(false);
    expect(site.get("x-content-type-options")).toBe(tenant.get("x-content-type-options"));
    expect(site.get("referrer-policy")).toBe(tenant.get("referrer-policy"));
    // the tenant preview page is framable by its own origin; the site value allows that too (a single value, never a conflict)
    expect(tenant.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(site.get("x-frame-options")).toBe("SAMEORIGIN");
    // the tenant enforced policy and the site report-only policy are different headers
    expect(tenant.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(site.has("content-security-policy")).toBe(false);
  });
});
