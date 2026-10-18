// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tenant: { kind: "TENANT", tenant: { kind: "TENANT", displayName: "Acme", branding: { supportEmail: "it@acme.test" } } } as unknown,
  session: { kind: "UNAUTHENTICATED" } as unknown,
  reply: null as null | (() => Response),
  path: "",
}));
vi.mock("@/lib/tenant", () => ({ getTenant: async () => state.tenant }));
vi.mock("@/lib/ent/tenant-session", async (orig) => ({ ...(await orig<typeof import("@/lib/ent/tenant-session")>()), getTenantSession: async () => state.session }));
vi.mock("@/lib/api", () => ({
  serverApiFetch: async (path: string) => {
    state.path = path;
    return state.reply!();
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("@/components/ent/join/JoinInvite", () => ({
  default: (p: { token: string; signedIn: boolean; preview: { orgName: string; createsAccount: boolean } }) => (
    <div data-join data-token={p.token} data-signed-in={String(p.signedIn)} data-creates={String(p.preview.createsAccount)} data-org={p.preview.orgName} />
  ),
}));

import TenantJoinPage from "./%5Ft/join/t/[token]/page";

const preview = (createsAccount: boolean) => ({ source: "EMAIL", orgName: "Acme", orgSlug: "acme", open: true, consent: { version: "v3", defaultScope: "NONE", options: ["NONE", "SUMMARY"] }, createsAccount });
const render = async (token = "tok") => renderToStaticMarkup(await TenantJoinPage({ params: Promise.resolve({ token }) }));

beforeEach(() => {
  state.session = { kind: "UNAUTHENTICATED" };
});

describe("tenant join page (S9)", () => {
  it("previews the invitation through the API (host-scoped) and hands the preview to the form", async () => {
    state.reply = () => Response.json(preview(true));
    const html = await render("a/b");
    expect(state.path).toBe("/api/join/a%2Fb");
    expect(html).toContain('data-creates="true"');
    expect(html).toContain('data-org="Acme"');
  });

  it("for an invitation that creates an account no session lookup decides anything: signedIn is false", async () => {
    state.session = { kind: "OK", me: {}, etag: null };
    state.reply = () => Response.json(preview(true));
    expect(await render()).toContain('data-signed-in="false"');
  });

  it("a legacy invitation passes whether the visitor holds a session on this host", async () => {
    state.reply = () => Response.json(preview(false));
    expect(await render()).toContain('data-signed-in="false"');
    state.session = { kind: "OK", me: {}, etag: null };
    expect(await render()).toContain('data-signed-in="true"');
  });

  it("anything that is not a live link shows one generic message (404), expiry and throttling their own", async () => {
    state.reply = () => new Response("{}", { status: 404 });
    expect(await render()).toContain("This invitation link is not valid.");
    state.reply = () => Response.json({ code: "INVITE_EXPIRED" }, { status: 409 });
    expect(await render()).toContain("has expired");
    state.reply = () => new Response("{}", { status: 429 });
    expect(await render()).toContain("Too many attempts");
    state.reply = () => {
      throw new Error("down");
    };
    expect(await render()).toContain("Couldn&#x27;t reach the server");
  });

  it("renders nothing for a host that is not a served tenant (the layout already answered)", async () => {
    state.tenant = { kind: "UNKNOWN" };
    expect(await TenantJoinPage({ params: Promise.resolve({ token: "t" }) })).toBeNull();
    state.tenant = { kind: "TENANT", tenant: { kind: "TENANT", displayName: "Acme", branding: {} } };
  });
});
