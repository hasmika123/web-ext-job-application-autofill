// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The "We couldn't load your workspace" panel: one page view makes about fourteen layout renders (the page plus every menu link's prefetch),
 * each of which used to make its own `GET /api/me/tenant`. Under load the last ones missed their time budget and, when that was the
 * navigation itself, the member saw the panel. These tests pin the two halves of the fix: the burst is ONE API call, and a failure is never
 * remembered (so "Try again" really asks again).
 */
const calls: { n: number; mode: "ok" | "unavailable" } = { n: 0, mode: "ok" };
let token: string | undefined = "token-sarah";

vi.mock("@/lib/api", () => ({
  serverApiFetch: async () => {
    calls.n++;
    await new Promise((r) => setTimeout(r, 20)); // the API takes a moment: the burst overlaps
    return calls.mode === "ok" ? new Response(JSON.stringify(meBody()), { status: 200, headers: { "content-type": "application/json", etag: '"e1"' } }) : new Response(null, { status: 503 });
  },
}));
vi.mock("@/lib/auth", () => ({ getAccessToken: async () => token }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-kiwiply-host": "acme.localhost" }) }));
// react's per-request cache() would memoize across these calls outside a request; the fan-out is across REQUESTS, so make it a pass-through
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const modules = { domains: true, roles: true, billing: false, marketing: false, hrFinance: false, extensionWorkspaces: false, integrations: false, analytics: false };
const meBody = () => ({
  org: { id: 1, displayName: "Acme", status: "ACTIVE", type: "STAFFING", primaryHost: "acme.localhost", terminology: {}, flags: {} },
  member: { id: 5, status: "ACTIVE", title: null, joinedAt: null },
  person: { name: "Sarah", email: "s@acme.com", imageUrl: null },
  roles: [],
  permissions: {},
  modules,
  workspaces: [{ key: "admin", workspaceKey: "ADMIN", label: "admin", home: "/w/admin", order: 1, roleKeys: [], nav: [{ key: "home", label: "home", icon: "Home", href: "/w/admin", badge: null }], bottomTabs: ["home"] }],
  landing: "/w/admin",
  landingKey: "admin",
  consent: { scope: "NONE", fullTo: null },
  features: { licensed: [], pending: false },
});

import { clearSharedTenantSessions, getTenantSession } from "@/lib/ent/tenant-session";

beforeEach(() => {
  calls.n = 0;
  calls.mode = "ok";
  token = "token-sarah";
  clearSharedTenantSessions();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("getTenantSession under the page's burst of renders", () => {
  it("makes ONE API call for the fourteen renders of a page view", async () => {
    const burst = await Promise.all(Array.from({ length: 14 }, () => getTenantSession()));
    expect(calls.n).toBe(1);
    expect(burst.map((s) => s.kind)).toEqual(Array(14).fill("OK"));
  });

  it("does not share a session between two people", async () => {
    await getTenantSession();
    token = "token-omar";
    await getTenantSession();
    expect(calls.n).toBe(2);
  });

  it("never remembers a failure: Try again asks the API afresh and recovers", async () => {
    calls.mode = "unavailable";
    const failed = await Promise.all([getTenantSession(), getTenantSession(), getTenantSession()]);
    expect(failed.every((s) => s.kind === "UNAVAILABLE")).toBe(true);
    expect(calls.n).toBe(1); // the burst shared the one failed call, and says why in the server log
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("HTTP 503"));
    calls.mode = "ok";
    expect((await getTenantSession()).kind).toBe("OK"); // the retry is a new call, not the remembered failure
    expect(calls.n).toBe(2);
  });

  it("makes the call directly (nothing to share) when nobody is signed in", async () => {
    token = undefined;
    await Promise.all([getTenantSession(), getTenantSession()]);
    expect(calls.n).toBe(2);
  });
});
