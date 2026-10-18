// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  host: "localhost:3000",
  flag: "on" as "on" | "off" | "unreachable",
  jar: new Map<string, string>(),
  sets: [] as { name: string; value: string; opts: Record<string, unknown> }[],
  deletes: [] as string[],
  outsideRequest: false,
}));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (state.outsideRequest) throw new Error("no request");
    return { get: (n: string) => (n === "host" ? state.host : null) };
  },
  cookies: async () => ({
    get: (n: string) => (state.jar.has(n) ? { value: state.jar.get(n) } : undefined),
    set: (name: string, value: string, opts: Record<string, unknown>) => state.sets.push({ name, value, opts }),
    delete: (n: string) => state.deletes.push(n),
  }),
}));
vi.mock("@/lib/tenant", () => ({ getEnterpriseSwitch: async () => state.flag }));

import { clearAuthCookies, getAccessToken, getRefreshToken, setAuthCookies } from "./auth";

beforeEach(() => {
  state.host = "localhost:3000";
  state.flag = "on";
  state.jar = new Map();
  state.sets = [];
  state.deletes = [];
  state.outsideRequest = false;
});

describe("session cookies by host kind (X2.6, T19)", () => {
  it("platform: the plain names and the options it always had (not forced Secure)", async () => {
    await setAuthCookies("a", "r");
    expect(state.sets.map((s) => s.name)).toEqual(["kiwiply_access", "kiwiply_refresh"]);
    expect(state.sets[0].opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(state.sets[0].opts.secure).toBe(process.env.NODE_ENV === "production");
    expect(state.sets[0].opts).not.toHaveProperty("domain");
    state.jar.set("kiwiply_access", "A");
    state.jar.set("kiwiply_refresh", "R");
    expect([await getAccessToken(), await getRefreshToken()]).toEqual(["A", "R"]);
    state.sets = [];
    await clearAuthCookies();
    expect(state.sets.map((x) => [x.name, x.value])).toEqual([["kiwiply_access", ""], ["kiwiply_refresh", ""]]);
    for (const x of state.sets) expect(x.opts).toMatchObject({ maxAge: 0, path: "/", httpOnly: true });
  });

  it("tenant host (enterprise on): the __Host- names, always Secure, host-only, Path=/", async () => {
    state.host = "acme.kiwiply.com";
    await setAuthCookies("a", "r");
    expect(state.sets.map((s) => s.name)).toEqual(["__Host-kiwiply_access", "__Host-kiwiply_refresh"]);
    for (const s of state.sets) expect(s.opts).toMatchObject({ secure: true, path: "/", httpOnly: true });
    for (const s of state.sets) expect(s.opts).not.toHaveProperty("domain");
    state.jar.set("__Host-kiwiply_access", "TA");
    state.jar.set("kiwiply_access", "PLATFORM-COOKIE");
    expect(await getAccessToken()).toBe("TA"); // a plain cookie on a tenant host (a shadow) is ignored
    state.sets = [];
    await clearAuthCookies();
    // a __Host- cookie is only removed by a Set-Cookie that is itself Secure + Path=/ (no Domain); a bare delete is ignored by the browser
    expect(state.sets.map((x) => [x.name, x.value])).toEqual([["__Host-kiwiply_access", ""], ["__Host-kiwiply_refresh", ""]]);
    for (const x of state.sets) {
      expect(x.opts).toMatchObject({ secure: true, path: "/", httpOnly: true, maxAge: 0 });
      expect(x.opts).not.toHaveProperty("domain");
    }
    expect(state.deletes).toEqual([]);
  });

  it("platform host never reads a __Host- cookie", async () => {
    state.jar.set("__Host-kiwiply_access", "TA");
    expect(await getAccessToken()).toBeUndefined();
  });

  it("enterprise flag off: an unlisted host is the platform (plain names), so a preview or staging host keeps working", async () => {
    state.host = "preview.example.net";
    state.flag = "off";
    await setAuthCookies("a", "r");
    expect(state.sets.map((s) => s.name)).toEqual(["kiwiply_access", "kiwiply_refresh"]);
  });

  it("flag unreachable (it was on): still the tenant names, fail closed", async () => {
    state.host = "acme.kiwiply.com";
    state.flag = "unreachable";
    await setAuthCookies("a");
    expect(state.sets.map((s) => s.name)).toEqual(["__Host-kiwiply_access", "__Host-kiwiply_refresh"]);
  });

  it("a sign-in without a refresh token expires the previous member's refresh cookie instead of leaving it to be renewed", async () => {
    state.host = "acme.kiwiply.com";
    await setAuthCookies("new-access");
    expect(state.sets[0]).toMatchObject({ name: "__Host-kiwiply_access", value: "new-access" });
    expect(state.sets[1]).toMatchObject({ name: "__Host-kiwiply_refresh", value: "" });
    expect(state.sets[1].opts).toMatchObject({ maxAge: 0, secure: true, path: "/" });
  });

  it("outside a request it is the platform", async () => {
    state.outsideRequest = true;
    await setAuthCookies("a");
    expect(state.sets[0].name).toBe("kiwiply_access");
  });
});
