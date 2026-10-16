import { describe, expect, it } from "vitest";
import { isTenantPublicPath, TENANT_POLICY_PATHS } from "@/lib/tenant-host";
import { DEFAULT_POLICY_LINKS, parseLinks, parsePolicy } from "@/lib/tenant-policies";

describe("tenant policy reads", () => {
  it("parses a policy and tolerates missing optional fields", () => {
    expect(parsePolicy({ kind: "PRIVACY", title: "Privacy Policy", body: "# P", source: "PUBLISHED", version: 3, publishedAt: "2026-10-01T00:00:00Z", orgName: "Acme" })).toMatchObject({ source: "PUBLISHED", version: 3 });
    expect(parsePolicy({ kind: "PRIVACY", title: "t", body: "b", orgName: "Acme" })).toMatchObject({ source: "TEMPLATE", version: null, supportEmail: null });
    expect(parsePolicy({ kind: "PRIVACY" })).toBeNull();
    expect(parsePolicy(null)).toBeNull();
  });

  it("accepts only same-host paths in the link index", () => {
    expect(parseLinks([{ kind: "PRIVACY", title: "Privacy", path: "/privacy" }])).toHaveLength(1);
    expect(parseLinks([{ kind: "X", title: "x", path: "//evil.example" }])).toBeNull();
    expect(parseLinks([{ kind: "X", title: "x", path: "https://evil.example" }])).toBeNull();
    expect(parseLinks({})).toBeNull();
  });

  it("the default footer is the four standard pages", () => {
    expect(DEFAULT_POLICY_LINKS.map((l) => l.path)).toEqual(["/privacy", "/terms", "/acceptable-use", "/support"]);
  });
});

describe("policy pages are public on a tenant host", () => {
  it("never need a sign-in first", () => {
    for (const p of ["/privacy", "/terms", "/acceptable-use", "/support", "/policies/cookies"]) expect(isTenantPublicPath(p), p).toBe(true);
    expect(TENANT_POLICY_PATHS).toContain("/policies");
  });

  it("everything else stays login-first", () => {
    for (const p of ["/", "/w/admin", "/me", "/privacy-settings", "/supporter"]) expect(isTenantPublicPath(p), p).toBe(false);
  });
});
