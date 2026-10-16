// @vitest-environment node
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sign out on a tenant host (demo bug P0): the session cookies are `__Host-` cookies, which a browser only replaces or removes
 * through a Set-Cookie that is itself `Secure` + `Path=/` (no Domain). The old `cookies().delete(name)` sent neither, the browser
 * ignored it and the member stayed signed in. This runs the real route over Next's real response cookie store and reads the
 * Set-Cookie headers a browser would receive.
 */
const state = vi.hoisted(() => ({ host: "acme.localhost:3100", jar: new Map<string, string>(), out: null as null | NextResponse }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (n: string) => (n === "host" ? state.host : null) }),
  cookies: async () => ({
    get: (n: string) => (state.jar.has(n) ? { value: state.jar.get(n) } : undefined),
    set: (name: string, value: string, opts: object) => state.out!.cookies.set(name, value, opts),
    delete: (name: string) => state.out!.cookies.set(name, "", { expires: new Date(0) }), // what Next's delete() does: no Secure, no Path
  }),
}));
vi.mock("@/lib/tenant", () => ({ getEnterpriseSwitch: async () => "on" }));
vi.mock("@/lib/auth-host", () => ({ authHostHeaders: async () => ({}) }));

import { POST } from "./route";

beforeEach(() => {
  state.out = NextResponse.next();
  state.jar = new Map();
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
});

const setCookies = () => state.out!.headers.getSetCookie();
const expiry = (name: string) => setCookies().find((c) => c.startsWith(`${name}=`));

describe("POST /api/auth/logout clears the session cookies the way they were set", () => {
  it("tenant host: both __Host- cookies are expired with Secure, Path=/, HttpOnly and Max-Age=0 (and no Domain)", async () => {
    state.jar.set("__Host-kiwiply_access", "a");
    state.jar.set("__Host-kiwiply_refresh", "r");
    const res = await POST();
    expect(res.status).toBe(200);
    for (const name of ["__Host-kiwiply_access", "__Host-kiwiply_refresh"]) {
      const c = expiry(name);
      expect(c, name).toBeDefined();
      expect(c).toMatch(/^[^=]+=;/); // empty value
      expect(c).toMatch(/Path=\//);
      expect(c).toMatch(/;\s*Secure/i);
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/Max-Age=0/i);
      expect(c).not.toMatch(/Domain=/i);
    }
    expect(setCookies()).toHaveLength(2);
  });

  it("platform host: the plain cookie names, still expired on Path=/", async () => {
    state.host = "localhost:3100";
    state.jar.set("kiwiply_access", "a");
    state.jar.set("kiwiply_refresh", "r");
    await POST();
    for (const name of ["kiwiply_access", "kiwiply_refresh"]) {
      expect(expiry(name), name).toMatch(/Path=\//);
      expect(expiry(name), name).toMatch(/Max-Age=0/i);
    }
    expect(setCookies().some((c) => c.startsWith("__Host-"))).toBe(false);
  });
});
