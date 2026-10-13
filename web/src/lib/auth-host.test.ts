// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const hdrs = vi.hoisted(() => ({ value: new Headers() as Headers | "throw" }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (hdrs.value === "throw") throw new Error("outside a request scope");
    return hdrs.value;
  },
}));
const setAuthCookies = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/auth", () => ({ setAuthCookies, getRefreshToken: async () => "r1" }));

import { authHostHeaders, isNotAMember } from "./auth-host";
import { authHostHeader } from "./tenant-host";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";

afterEach(() => {
  vi.unstubAllGlobals();
  setAuthCookies.mockClear();
});

describe("authHostHeader (X1.5: login/refresh must tell the API which tenant host this is)", () => {
  it("forwards a tenant host, normalised, preferring x-forwarded-host", () => {
    expect(authHostHeader(new Headers({ host: "web:3000", "x-forwarded-host": "Acme.Localhost:443" }))).toEqual({ "X-Kiwiply-Host": "acme.localhost" });
  });
  it("sends nothing for a platform host or no host", () => {
    expect(authHostHeader(new Headers({ host: "localhost:3000" }))).toEqual({});
    expect(authHostHeader(new Headers({ host: "kiwiply.com" }))).toEqual({});
    expect(authHostHeader(new Headers())).toEqual({});
  });
  it("never trusts a browser-supplied x-kiwiply-host", () => {
    expect(authHostHeader(new Headers({ host: "localhost:3000", "x-kiwiply-host": "acme.localhost" }))).toEqual({});
  });
  it("survives being called outside a request", async () => {
    hdrs.value = "throw";
    expect(await authHostHeaders()).toEqual({});
  });
});

describe("auth route handlers on a tenant host", () => {
  const sent = (fn: ReturnType<typeof vi.fn>) => (fn.mock.calls[0][1] as { headers: Record<string, string> }).headers;
  const req = () =>
    new Request("http://acme.localhost/api/auth/login", { method: "POST", body: JSON.stringify({ username: "u", password: "p" }), headers: { "x-forwarded-for": "9.9.9.9" } });

  it("login forwards X-Kiwiply-Host and sets cookies on success", async () => {
    hdrs.value = new Headers({ host: "acme.localhost:3000" });
    const fn = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ accessToken: "a", refreshToken: "r" })));
    vi.stubGlobal("fetch", fn);
    const res = await login(req());
    expect(res.status).toBe(200);
    expect(sent(fn)["X-Kiwiply-Host"]).toBe("acme.localhost");
    expect(setAuthCookies).toHaveBeenCalled();
  });

  it("login turns the API's NOT_A_MEMBER into a 403 with no cookies and no data", async () => {
    hdrs.value = new Headers({ host: "acme.localhost:3000" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "NOT_A_MEMBER", title: "Acme Staffing" }), { status: 403 })));
    const res = await login(req());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "You're not a member of this workspace.", code: "NOT_A_MEMBER" });
    expect(setAuthCookies).not.toHaveBeenCalled();
  });

  it("an ordinary 401 stays the generic wrong-password answer", async () => {
    hdrs.value = new Headers({ host: "acme.localhost:3000" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect((await login(req())).status).toBe(401);
  });

  it("refresh forwards the host too", async () => {
    hdrs.value = new Headers({ host: "acme.localhost:3000" });
    const fn = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ accessToken: "a2", refreshToken: "r2" })));
    vi.stubGlobal("fetch", fn);
    expect((await refresh()).status).toBe(200);
    expect(sent(fn)["X-Kiwiply-Host"]).toBe("acme.localhost");
  });

  it("isNotAMember only matches the 403 code", async () => {
    expect(await isNotAMember(new Response(JSON.stringify({ code: "NOT_A_MEMBER" }), { status: 403 }))).toBe(true);
    expect(await isNotAMember(new Response(JSON.stringify({ code: "OTHER" }), { status: 403 }))).toBe(false);
    expect(await isNotAMember(new Response("x", { status: 401 }))).toBe(false);
  });
});
