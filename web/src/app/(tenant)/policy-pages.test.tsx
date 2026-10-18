// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tenant: { kind: "TENANT", tenant: { kind: "TENANT", displayName: "Acme Staffing", branding: { logoUrl: "/tenant-assets/logo?v=1" } } } as unknown,
  policy: { kind: "OK" } as unknown,
  links: [] as unknown,
  asked: [] as string[],
}));
vi.mock("@/lib/tenant", () => ({ getTenant: async () => state.tenant }));
vi.mock("@/lib/tenant-policies", () => ({
  getTenantPolicy: async (kind: string) => {
    state.asked.push(kind);
    return state.policy;
  },
  getTenantPolicyLinks: async () => state.links,
}));
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import TenantPolicyPage, { policyMetadata } from "@/components/ent/policy/TenantPolicyPage";
import PrivacyPage from "./%5Ft/privacy/page";
import TermsPage from "./%5Ft/terms/page";
import AcceptableUsePage from "./%5Ft/acceptable-use/page";
import SupportPage from "./%5Ft/support/page";
import ExtraPage from "./%5Ft/policies/[slug]/page";

const policy = (over: Record<string, unknown> = {}) => ({
  kind: "OK",
  policy: {
    kind: "PRIVACY",
    title: "Privacy Policy",
    body: "# Privacy Policy\n\nWe keep **little** data. Write to [us](mailto:privacy@acme.example) or read [terms](/terms).\n\n- one\n- two",
    source: "PUBLISHED",
    version: 2,
    publishedAt: "2026-10-01T12:00:00Z",
    orgName: "Acme Staffing",
    supportEmail: "privacy@acme.example",
    ...over,
  },
});
const html = async (kind = "PRIVACY") => renderToStaticMarkup(await TenantPolicyPage({ kind }));

beforeEach(() => {
  state.tenant = { kind: "TENANT", tenant: { kind: "TENANT", displayName: "Acme Staffing", branding: { logoUrl: "/tenant-assets/logo?v=1" } } };
  state.policy = policy();
  state.links = [
    { kind: "PRIVACY", title: "Privacy Policy", path: "/privacy" },
    { kind: "TERMS", title: "Terms of Use", path: "/terms" },
  ];
  state.asked = [];
  notFound.mockClear();
});

describe("a tenant policy page", () => {
  it("renders the organization's text with its logo and no Kiwiply link", async () => {
    const out = await html();
    expect(out).toContain("<h1");
    expect(out).toContain("Privacy Policy");
    expect(out).toContain("<strong>little</strong>");
    expect(out).toContain('href="mailto:privacy@acme.example"');
    expect(out).toContain('href="/terms"');
    expect(out).toContain("/tenant-assets/logo");
    expect(out).toContain("Last updated October 1, 2026.");
    expect(out.toLowerCase()).not.toContain("kiwiply.com");
    expect(out).not.toMatch(/Kiwiply/);
    expect([...out.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).filter((h) => /^https?:/.test(h))).toEqual([]);
  });

  it("links the organization's sibling policy pages on its own host", async () => {
    const out = await html();
    expect(out).toContain('data-policy-links');
    expect(out).toContain('href="/privacy"');
    expect(out).toContain('href="/terms"');
    expect(out).toContain('href="/login"');
  });

  it("never lets a body inject markup or a script link", async () => {
    state.policy = policy({ body: "# T\n\n<script>alert(1)</script> [x](javascript:alert(1)) [y](//evil.example) [z](https://ok.example)" });
    const out = await html();
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("evil.example");
    expect(out).toContain('href="https://ok.example"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("the neutral template has no 'last updated' line", async () => {
    state.policy = policy({ source: "TEMPLATE", version: null, publishedAt: null });
    expect(await html()).not.toContain("Last updated");
  });

  it("a kind the host does not offer is the tenant 404; a slow API is 'try again', not a 404", async () => {
    state.policy = { kind: "NOT_FOUND" };
    await expect(html("NOPE")).rejects.toThrow("NEXT_NOT_FOUND");
    state.policy = { kind: "UNAVAILABLE" };
    expect(await html()).toContain("Please try again in a moment");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("a host that is not a served tenant renders nothing (the tenant layout answers)", async () => {
    state.tenant = { kind: "UNKNOWN" };
    expect(await TenantPolicyPage({ kind: "PRIVACY" })).toBeNull();
  });

  it("titles the tab with the policy and the organization, not the platform", async () => {
    const meta = await policyMetadata("PRIVACY");
    expect(meta.title).toEqual({ absolute: "Privacy Policy · Acme Staffing" });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("the route files", () => {
  it("each page asks for its own kind; extra kinds come from the slug", async () => {
    for (const [Page, kind] of [[PrivacyPage, "PRIVACY"], [TermsPage, "TERMS"], [AcceptableUsePage, "ACCEPTABLE_USE"], [SupportPage, "SUPPORT_CONTACT"]] as const) {
      state.asked = [];
      const el = Page() as unknown as { props: { kind: string } };
      renderToStaticMarkup(await TenantPolicyPage(el.props));
      expect(state.asked).toEqual([kind]);
    }
    state.asked = [];
    const extra = (await ExtraPage({ params: Promise.resolve({ slug: "data-retention" }) })) as unknown as { props: { kind: string } };
    renderToStaticMarkup(await TenantPolicyPage(extra.props));
    expect(state.asked).toEqual(["data-retention"]);
  });
});
