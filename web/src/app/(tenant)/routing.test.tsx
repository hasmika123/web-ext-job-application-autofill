// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tenant: { kind: "TENANT", tenant: { kind: "TENANT", displayName: "Acme", branding: { welcomeMessage: "Hi" }, login: { password: true, google: false, mfaRequired: false } } } as unknown,
  session: { status: "UNAUTHENTICATED" } as unknown,
}));
vi.mock("@/lib/tenant", () => ({ getTenant: async () => state.tenant }));
vi.mock("@/lib/ent/tenant-session", async (orig) => ({ ...(await orig<typeof import("@/lib/ent/tenant-session")>()), getTenantSession: async () => state.session }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("@/components/ent/login/BrandedLogin", () => ({ default: (p: { next?: string }) => <div data-login-form data-next={p.next ?? ""} /> }));

import TenantHome from "./%5Ft/page";
import TenantLoginPage from "./%5Ft/login/page";

const ok = (landing: string) => ({ status: "OK", landing, orgName: "Acme" });
const home = async () => renderToStaticMarkup(await TenantHome());
const login = async (next?: string | string[]) => renderToStaticMarkup(await TenantLoginPage({ searchParams: Promise.resolve({ next }) }));
beforeEach(() => {
  state.session = { status: "UNAUTHENTICATED" };
});

describe("tenant root: login-first (X2.6)", () => {
  it("a signed-in member goes straight to the landing the API names", async () => {
    state.session = ok("/w/admin");
    await expect(home()).rejects.toThrow("REDIRECT:/w/admin");
  });
  it("a token the API refuses (another tenant's, expired) goes to this host's login", async () => {
    await expect(home()).rejects.toThrow("REDIRECT:/login");
  });
  it("until X2.2 exists (no contract) the member sees the welcome skeleton, not a loop", async () => {
    state.session = { status: "NO_CONTRACT" };
    expect(await home()).toContain("Welcome to Acme");
  });
  it("a landing of / is not followed (no self-redirect loop)", async () => {
    state.session = ok("/");
    expect(await home()).toContain("Welcome to Acme");
  });
  it("paused and non-member seats get their own panels, no data", async () => {
    state.session = { status: "SUSPENDED" };
    expect(await home()).toContain("data-tenant-paused");
    state.session = { status: "NOT_A_MEMBER" };
    expect(await home()).toContain("data-tenant-not-a-member");
  });
  it("renders nothing for a host that is not a served tenant (the layout already answered)", async () => {
    state.tenant = { kind: "UNKNOWN" };
    expect(await TenantHome()).toBeNull();
    state.tenant = { kind: "TENANT", tenant: { kind: "TENANT", displayName: "Acme" } };
  });
});

describe("tenant login: the logged-in redirect away from /login (X2.6)", () => {
  it("signed out shows the form and passes the next through", async () => {
    expect(await login("/w/admin")).toContain('data-next="/w/admin"');
  });
  it("signed in goes to ?next= when it is a same-host path, else to the landing", async () => {
    state.session = ok("/w/admin");
    await expect(login("/w/consultant")).rejects.toThrow("REDIRECT:/w/consultant");
    await expect(login()).rejects.toThrow("REDIRECT:/w/admin");
  });
  it("an open-redirect next never leaves the host, even signed in", async () => {
    state.session = ok("/w/admin");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "/_t/login", "/login?next=//evil.com"]) {
      await expect(login(bad), bad).rejects.toThrow("REDIRECT:/w/admin");
    }
  });
  it("signed in but no contract yet (X2.2 absent) still shows the form", async () => {
    state.session = { status: "NO_CONTRACT" };
    expect(await login("/w/admin")).toContain("data-login-form");
  });
});
