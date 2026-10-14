import { beforeEach, describe, expect, it, vi } from "vitest";

const hostHeaders = vi.hoisted(() => ({ value: {} as Record<string, string> }));
const setAuthCookies = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-host", async (orig) => ({ ...(await orig<typeof import("@/lib/auth-host")>()), authHostHeaders: async () => hostHeaders.value }));
vi.mock("@/lib/auth", () => ({ setAuthCookies }));

import { POST } from "./route";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (claims: Record<string, unknown>) => `${b64({ alg: "none" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 900, ...claims })}.sig`;
const post = () =>
  POST(
    new Request("http://acme.localhost:3200/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify({ username: "owner@example.test", password: "pw" }),
    }),
  );

beforeEach(() => {
  hostHeaders.value = {};
  setAuthCookies.mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/auth/login with an administrator-issued temporary password", () => {
  it("on a tenant host it sets the session and says the password must be changed", async () => {
    hostHeaders.value = { "X-Kiwiply-Host": "acme.localhost" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: token({ pcr: true, tid: 1 }), refreshToken: "r" }), { status: 200 }));
    const res = await post();
    expect(await res.json()).toEqual({ ok: true, passwordChangeRequired: true });
    expect(setAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("on the platform it is turned away without a session (the change screen lives on the organization address)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: token({ pcr: true }), refreshToken: "r" }), { status: 200 }));
    const res = await post();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("USE_ORG_ADDRESS");
    expect(setAuthCookies).not.toHaveBeenCalled();
  });

  it("an ordinary sign-in is unchanged", async () => {
    hostHeaders.value = { "X-Kiwiply-Host": "acme.localhost" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: token({ tid: 1 }), refreshToken: "r" }), { status: 200 }));
    expect(await (await post()).json()).toEqual({ ok: true });
  });

  it("an expired temporary password says so (and only that) instead of Incorrect username or password", async () => {
    hostHeaders.value = { "X-Kiwiply-Host": "acme.localhost" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: "TEMP_PASSWORD_EXPIRED" }), { status: 403 }));
    const res = await post();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("TEMP_PASSWORD_EXPIRED");
    expect(body.error).toMatch(/expired/);
    expect(setAuthCookies).not.toHaveBeenCalled();
  });
});
