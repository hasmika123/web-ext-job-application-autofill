// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FRAMEABLE_TENANT_PATH, setTenantSecurityHeaders } from "./tenant-headers";

const headersFor = (path: string) => {
  const h = new Headers();
  setTenantSecurityHeaders(h, path);
  return h;
};

describe("tenant security headers: framing", () => {
  it("every tenant path is framed by nobody", () => {
    for (const path of ["/", "/login", "/w/admin/branding", "/preview", "/preview/login/x", "/api/me/tenant", "/_t/preview/login", "/PREVIEW/login"]) {
      const h = headersFor(path);
      expect(h.get("x-frame-options"), path).toBe("DENY");
      expect(h.get("content-security-policy"), path).toBeNull();
    }
  });

  it("the Branding preview page is framable by the SAME origin only, never a foreign page", () => {
    expect(FRAMEABLE_TENANT_PATH).toBe("/preview/login");
    const h = headersFor(FRAMEABLE_TENANT_PATH);
    expect(h.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(h.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(h.get("content-security-policy")).not.toMatch(/\*|https?:/); // no wildcard, no named origin
  });

  it("the other tenant headers are unchanged on both", () => {
    for (const path of ["/login", FRAMEABLE_TENANT_PATH]) {
      const h = headersFor(path);
      expect(h.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(h.get("x-content-type-options")).toBe("nosniff");
      expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    }
  });
});
