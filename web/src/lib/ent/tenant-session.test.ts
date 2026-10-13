import { describe, expect, it } from "vitest";
import { accessChanged, fetchTenantSession, parseMeTenant } from "@/lib/ent/tenant-session";
import { bottomBar, findWorkspace, landingFor, showSwitcher, workspacesFor } from "@/lib/ent/workspaces";

const modules = { domains: true, roles: true, billing: false, marketing: false, hrFinance: false, extensionWorkspaces: false, integrations: false, analytics: false };
const ws = (slug: string, key: string, nav: string[]) => ({
  key: slug,
  workspaceKey: key,
  label: slug,
  home: `/w/${slug}`,
  order: 1,
  roleKeys: ["ORG_ADMIN"],
  nav: nav.map((k) => ({ key: k, label: k, icon: "Home", href: k === "home" ? `/w/${slug}` : `/w/${slug}/${k}`, badge: null })),
  bottomTabs: ["home", "employees"],
});
const body = (over: Record<string, unknown> = {}) => ({
  org: { id: 1, displayName: "Acme", status: "ACTIVE", type: "STAFFING", primaryHost: "acme.localhost", terminology: {}, flags: { pastDue: false, billingActionRequired: false, greeting: true } },
  member: { id: 5, status: "ACTIVE", title: null, joinedAt: null },
  person: { name: "Sarah", email: "s@acme.com", imageUrl: null },
  roles: [{ id: 1, key: "ORG_ADMIN", name: "Org Admin", isPrimary: true, workspaceKey: "ADMIN" }],
  permissions: { "members.invite": "ORG" },
  modules,
  workspaces: [ws("admin", "ADMIN", ["home", "employees", "settings"]), ws("marketing-mgmt", "MARKETING_MGMT", ["home"])],
  landing: "/w/admin",
  landingKey: "admin",
  consent: { scope: "NONE", fullTo: null },
  features: { licensed: [], pending: true },
  ...over,
});
const reply = (status: number, json?: unknown, headers: Record<string, string> = {}) => async () =>
  new Response(json === undefined ? null : JSON.stringify(json), { status, headers: { "content-type": "application/json", ...headers } });

describe("fetchTenantSession fails closed", () => {
  it("returns the member only for a 200 that has the contract's shape", async () => {
    const r = await fetchTenantSession(reply(200, body(), { etag: '"abc"' }));
    expect(r.kind).toBe("OK");
    if (r.kind === "OK") {
      expect(r.etag).toBe('"abc"');
      expect(workspacesFor(r.me).map((w) => w.key)).toEqual(["admin", "marketing-mgmt"]);
    }
  });

  it("maps every refusal to a named state with no organization data", async () => {
    expect((await fetchTenantSession(reply(401, { code: "TOKEN_TENANT_MISMATCH" }))).kind).toBe("UNAUTHENTICATED");
    expect((await fetchTenantSession(reply(403, { code: "MEMBER_SUSPENDED" }))).kind).toBe("SUSPENDED");
    expect((await fetchTenantSession(reply(403, { code: "SOMETHING_ELSE" }))).kind).toBe("NOT_A_MEMBER");
    expect((await fetchTenantSession(reply(404, { code: "NOT_FOUND" }))).kind).toBe("NOT_A_MEMBER");
    expect((await fetchTenantSession(reply(418))).kind).toBe("NOT_A_MEMBER");
    expect((await fetchTenantSession(reply(429))).kind).toBe("UNAVAILABLE");
    expect((await fetchTenantSession(reply(503))).kind).toBe("UNAVAILABLE");
    expect((await fetchTenantSession(async () => { throw new Error("down"); })).kind).toBe("UNAVAILABLE");
  });

  it("never grants on a body that is not the contract", async () => {
    for (const bad of [{}, [], "x", null, body({ modules: { domains: true } }), body({ workspaces: "all" }), body({ landing: "https://evil.example" }), body({ workspaces: [{ ...ws("admin", "ADMIN", ["home"]), home: "//evil" }] }), body({ org: {} })]) {
      const r = await fetchTenantSession(reply(200, bad));
      expect(r.kind, JSON.stringify(bad).slice(0, 60)).toBe("UNAVAILABLE");
    }
    expect((await fetchTenantSession(async () => new Response("<html>", { status: 200 }))).kind).toBe("UNAVAILABLE");
  });

  it("asks with If-None-Match and reports a 304 as unchanged", async () => {
    let seen: string | null = null;
    const fetcher = async (_p: string, init?: RequestInit) => {
      seen = new Headers(init?.headers).get("if-none-match");
      return new Response(null, { status: 304 });
    };
    expect(await accessChanged(fetcher, '"abc"')).toBe(false);
    expect(seen).toBe('"abc"');
  });
});

describe("accessChanged (the focus re-check)", () => {
  it("is true for a different tag, a lost session, a suspension and a missing validator", async () => {
    expect(await accessChanged(reply(200, body(), { etag: '"new"' }), '"old"')).toBe(true);
    expect(await accessChanged(reply(200, body(), { etag: '"same"' }), '"same"')).toBe(false);
    expect(await accessChanged(reply(401), '"old"')).toBe(true);
    expect(await accessChanged(reply(403, { code: "MEMBER_SUSPENDED" }), '"old"')).toBe(true);
    expect(await accessChanged(reply(404), '"old"')).toBe(true);
    expect(await accessChanged(reply(200, body()), null)).toBe(true);
  });
  it("keeps the shell when the API is merely unreachable", async () => {
    expect(await accessChanged(reply(503), '"old"')).toBe(false);
  });
});

describe("workspace helpers", () => {
  const me = parseMeTenant(body())!;
  it("lands in the API's choice, shows the switcher only with several workspaces", () => {
    expect(landingFor(me)).toBe("/w/admin");
    expect(showSwitcher(me)).toBe(true);
    const one = parseMeTenant(body({ workspaces: [ws("consultant", "CONSULTANT", ["home"])], landing: "/w/consultant", landingKey: "consultant" }))!;
    expect(showSwitcher(one)).toBe(false);
    const none = parseMeTenant(body({ workspaces: [], landing: null, landingKey: null }))!;
    expect(landingFor(none)).toBeNull();
  });
  it("falls back to the first workspace when the landing is not one of them", () => {
    expect(landingFor({ ...me, landing: "/w/hr" })).toBe("/w/admin");
  });
  it("finds a workspace by slug and refuses one that is not the member's (the layout then shows the not-your-role state)", () => {
    expect(findWorkspace(me, "marketing-mgmt")?.workspaceKey).toBe("MARKETING_MGMT");
    expect(findWorkspace(me, "hr")).toBeUndefined();
  });
  it("splits the phone bar into the documented tabs that exist and More", () => {
    const { tabs, more } = bottomBar(me.workspaces[0]);
    expect(tabs.map((t) => t.key)).toEqual(["home", "employees"]);
    expect(more.map((t) => t.key)).toEqual(["settings"]);
  });
});
