// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ token: undefined as string | undefined, response: null as Response | (() => never) | null }));
vi.mock("@/lib/auth", () => ({ getAccessToken: async () => state.token }));
vi.mock("@/lib/api", () => ({
  serverApiFetch: async () => {
    if (typeof state.response === "function") state.response();
    return state.response as Response;
  },
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { destinationFor, getTenantSession, requireTenantSession } from "./tenant-session";

const me = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  state.token = "t";
  state.response = me({ landing: "/w/admin", org: { displayName: "Acme" } });
});

describe("getTenantSession: GET /api/me/tenant (X2.2 contract stub)", () => {
  it("no cookie: unauthenticated without calling the API", async () => {
    state.token = undefined;
    state.response = () => {
      throw new Error("must not call");
    };
    expect(await getTenantSession()).toEqual({ status: "UNAUTHENTICATED" });
  });
  it("200 with a landing: OK", async () => {
    expect(await getTenantSession()).toEqual({ status: "OK", landing: "/w/admin", orgName: "Acme" });
  });
  it("401 (expired, TOKEN_TENANT_MISMATCH: a session of another tenant) is unauthenticated", async () => {
    state.response = me({ code: "TOKEN_TENANT_MISMATCH" }, 401);
    expect(await getTenantSession()).toEqual({ status: "UNAUTHENTICATED" });
  });
  it("403 is a paused seat; 404 NOT_A_MEMBER a non-member; a bare 404 is the missing contract", async () => {
    state.response = me({ code: "MEMBER_SUSPENDED" }, 403);
    expect(await getTenantSession()).toEqual({ status: "SUSPENDED" });
    state.response = me({ code: "NOT_A_MEMBER" }, 404);
    expect(await getTenantSession()).toEqual({ status: "NOT_A_MEMBER" });
    state.response = new Response("", { status: 404 });
    expect(await getTenantSession()).toEqual({ status: "NO_CONTRACT" });
  });
  it("5xx, a network error and garbage are unavailable, never a guess", async () => {
    state.response = me({}, 503);
    expect(await getTenantSession()).toEqual({ status: "UNAVAILABLE" });
    state.response = () => {
      throw new Error("down");
    };
    expect(await getTenantSession()).toEqual({ status: "UNAVAILABLE" });
    state.response = new Response("not json", { status: 200 });
    expect(await getTenantSession()).toEqual({ status: "UNAVAILABLE" });
  });
  it("a landing that is not a plain same-host path is never followed", async () => {
    for (const landing of ["//evil.com", "https://evil.com/w", "/_t/x", "/api/auth/logout", 7, null]) {
      state.response = me({ landing });
      expect((await getTenantSession()).status, String(landing)).toBe("NO_CONTRACT");
    }
  });
});

describe("destinationFor", () => {
  const ok = { status: "OK", landing: "/w/admin", orgName: null } as const;
  it("a safe next wins over the landing; an unsafe next falls back to the landing", () => {
    expect(destinationFor(ok, "/w/consultant")).toBe("/w/consultant");
    expect(destinationFor(ok, "//evil.com")).toBe("/w/admin");
    expect(destinationFor(ok, undefined)).toBe("/w/admin");
  });
  it("nothing to follow unless OK", () => {
    for (const s of [{ status: "UNAUTHENTICATED" }, { status: "NO_CONTRACT" }, { status: "SUSPENDED" }] as const) expect(destinationFor(s, "/x")).toBeNull();
  });
});

describe("requireTenantSession", () => {
  it("signed out goes to /login with a safe return-to", async () => {
    state.token = undefined;
    await expect(requireTenantSession("/w/admin?x=1")).rejects.toThrow("REDIRECT:/login?next=%2Fw%2Fadmin%3Fx%3D1");
    await expect(requireTenantSession("//evil.com")).rejects.toThrow("REDIRECT:/login");
  });
  it("a member passes", async () => {
    expect((await requireTenantSession("/w/admin")).status).toBe("OK");
  });
});
