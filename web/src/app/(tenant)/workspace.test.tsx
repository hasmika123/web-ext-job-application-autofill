// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { meTenantFor as untyped } from "../../../scripts/mock-me-tenant.mjs";
import { parseMeTenant } from "@/lib/ent/tenant-session-core";

const state = vi.hoisted(() => ({
  tenant: { kind: "TENANT", tenant: { kind: "TENANT", displayName: "Acme", branding: { logoUrl: "/tenant-assets/logo?v=1", supportEmail: "it@acme.com" } } } as unknown,
  session: { kind: "UNAUTHENTICATED" } as unknown,
}));
vi.mock("@/lib/tenant", () => ({ getTenant: async () => state.tenant }));
vi.mock("@/lib/ent/tenant-session", async (orig) => ({ ...(await orig<typeof import("@/lib/ent/tenant-session")>()), getTenantSession: async () => state.session }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/w/admin",
  useSearchParams: () => new URLSearchParams(),
}));
// the shell is a client component with its own tests; here only what the layout hands it matters
vi.mock("@/components/ent/shell/EnterpriseShell", () => ({
  default: (p: { workspace: { key: string }; me: { person: { name: string } }; tenant: { displayName: string }; children: React.ReactNode }) => (
    <div data-shell data-workspace={p.workspace.key} data-member={p.me.person.name} data-org={p.tenant.displayName}>
      {p.children}
    </div>
  ),
}));

import WorkspaceLayout from "./%5Ft/w/[workspace]/layout";
import WorkspaceCatchAll from "./%5Ft/w/[workspace]/[[...slug]]/page";
import WorkspaceBrandingRoute from "./%5Ft/w/[workspace]/branding/page";

const meTenantFor = untyped as (host: string, login: string) => { body: unknown; etag: string } | null;
const ok = (login: string) => {
  const a = meTenantFor("acme.localhost", login)!;
  return { kind: "OK", me: parseMeTenant(a.body)!, etag: a.etag };
};
const layout = async (workspace: string) => renderToStaticMarkup(await WorkspaceLayout({ params: Promise.resolve({ workspace }), children: <p>the page</p> }));
const catchAll = async (workspace: string, slug?: string[]) => renderToStaticMarkup((await WorkspaceCatchAll({ params: Promise.resolve({ workspace, slug }) })) ?? <i />);

beforeEach(() => {
  state.session = { kind: "UNAUTHENTICATED" };
});

describe("workspace layout (16 s2.4)", () => {
  it("a signed-out visitor, or a token the API refuses, goes to this host's sign-in", async () => {
    await expect(layout("admin")).rejects.toThrow("REDIRECT:/login");
  });

  it("MEMBER_SUSPENDED: the paused panel with sign-out only, no organization data in the DOM", async () => {
    state.session = { kind: "SUSPENDED" };
    const html = await layout("admin");
    expect(html).toContain("data-tenant-paused");
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Acme");
    expect(html).not.toContain("data-shell");
    expect(html).not.toContain("the page");
  });

  it("not a member / unreachable get their own panels, never a default menu", async () => {
    state.session = { kind: "NOT_A_MEMBER" };
    expect(await layout("admin")).toContain("data-tenant-not-a-member");
    state.session = { kind: "UNAVAILABLE" };
    const html = await layout("admin");
    expect(html).toContain("data-tenant-unavailable");
    expect(html).not.toContain("data-shell");
  });

  it("a member gets the shell around the page, with the org's name and logo from the host", async () => {
    state.session = ok("owner@acme.com");
    const html = await layout("admin");
    expect(html).toContain('data-workspace="admin"');
    expect(html).toContain('data-org="Acme"');
    expect(html).toContain("the page");
  });

  it("a workspace the member's roles do not grant renders 'This isn't part of your role' inside the shell (no redirect, no page)", async () => {
    state.session = ok("owner@acme.com");
    const html = await layout("hr");
    expect(html).toContain("data-shell");
    expect(html).toContain("data-not-your-role");
    expect(html).not.toContain("the page");
  });

  it("Sarah can open her second workspace", async () => {
    state.session = ok("sarah@acme.com");
    expect(await layout("marketing-mgmt")).toContain('data-workspace="marketing-mgmt"');
  });
});

describe("catch-all: a menu page that is not built yet", () => {
  it("every page the owner's menu lists resolves to 'on the way', never a 404", async () => {
    state.session = ok("owner@acme.com");
    const html = await catchAll("admin", ["jobs"]);
    expect(html).toContain("data-coming-soon");
    expect(html).toContain("This page is on the way");
  });
  it("the workspace home resolves too (the dashboard comes with X2.17)", async () => {
    state.session = ok("owner@acme.com");
    expect(await catchAll("admin")).toContain("data-coming-soon");
  });
  it("a page that is not in the member's menu is 'not part of your role'", async () => {
    state.session = ok("marketer@acme.com");
    expect(await catchAll("marketing", ["billing"])).toContain("data-not-your-role");
  });
});

describe("Organization Branding is mounted in the shell (X2.18)", () => {
  it("takes the org from the session and renders the editor frame-less for branding.manage", async () => {
    state.session = ok("owner@acme.com");
    const html = renderToStaticMarkup((await WorkspaceBrandingRoute()) ?? <i />);
    expect(html).not.toContain("Organization admin"); // the old standalone frame is gone
  });
  it("a member without branding.manage gets the role state", async () => {
    state.session = ok("marketer@acme.com");
    expect(renderToStaticMarkup((await WorkspaceBrandingRoute()) ?? <i />)).toContain("data-not-your-role");
  });
});
