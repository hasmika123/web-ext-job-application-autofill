import { beforeEach, describe, expect, it, vi } from "vitest";

/** Gap D-2: an organization that requires two-step sign-in, through the two BFF routes (password, then the emailed code). */
const hostHeaders = vi.hoisted(() => ({ value: {} as Record<string, string> }));
const device = vi.hoisted(() => ({ value: {} as Record<string, string> }));
const setAuthCookies = vi.hoisted(() => vi.fn());
const setDeviceCookie = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-host", async (orig) => ({ ...(await orig<typeof import("@/lib/auth-host")>()), authHostHeaders: async () => hostHeaders.value }));
vi.mock("@/lib/auth", () => ({ setAuthCookies, setDeviceCookie, deviceHeaders: async () => device.value }));

import { POST as login } from "./route";
import { POST as code } from "./mfa/route";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (claims: Record<string, unknown>) => `${b64({ alg: "none" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 900, ...claims })}.sig`;
const ip = () => `10.3.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const req = (path: string, body: unknown) =>
  new Request(`http://acme.localhost:3200${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify(body) });

beforeEach(() => {
  hostHeaders.value = { "X-Kiwiply-Host": "acme.localhost" };
  device.value = {};
  setAuthCookies.mockReset();
  setDeviceCookie.mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/auth/login on an organization that requires two-step sign-in", () => {
  it("hands back the code handle and how long a browser can be remembered, with no session yet", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ mfaRequired: true, mfaToken: "h", rememberDays: 30 }), { status: 200 }));
    const res = await login(req("/api/auth/login", { username: "ana", password: "pw" }));
    expect(await res.json()).toEqual({ mfaRequired: true, mfaToken: "h", rememberDays: 30 });
    expect(setAuthCookies).not.toHaveBeenCalled();
  });

  it("sends a remembered browser's token to the API", async () => {
    device.value = { "x-kiwiply-device": "dev-token" };
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: token({ tid: 1 }), refreshToken: "r" }), { status: 200 }));
    expect(await (await login(req("/api/auth/login", { username: "ana", password: "pw" }))).json()).toEqual({ ok: true });
    expect((f.mock.calls[0][1]?.headers as Record<string, string>)["x-kiwiply-device"]).toBe("dev-token");
  });

  it.each([
    ["TWO_STEP_NO_EMAIL", 403, "Your account has no email address for a sign-in code. Ask your administrator to add one."],
    ["TWO_STEP_TOO_MANY_CODES", 429, "Too many sign-in codes were sent. Try again in an hour."],
  ])("passes the API's own sentence through for %s", async (c, status, title) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: c, title, message: "error.org" }), { status }));
    const res = await login(req("/api/auth/login", { username: "ana", password: "pw" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: title, code: c });
    expect(setAuthCookies).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login/mfa", () => {
  it("asks the API to remember the browser and keeps the token it returns", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accessToken: token({ tid: 1 }), refreshToken: "r", deviceToken: "d", deviceExpiresAt: "2026-12-19T10:00:00Z" }), { status: 200 }),
    );
    const res = await code(req("/api/auth/login/mfa", { mfaToken: "h", code: "123456", remember: true }));
    expect(await res.json()).toEqual({ ok: true });
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ mfaToken: "h", code: "123456", rememberDevice: true });
    expect(setAuthCookies).toHaveBeenCalledTimes(1);
    expect(setDeviceCookie).toHaveBeenCalledWith("d", "2026-12-19T10:00:00Z");
  });

  it("remembers nothing unless asked", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: token({ tid: 1 }), refreshToken: "r" }), { status: 200 }));
    await code(req("/api/auth/login/mfa", { mfaToken: "h", code: "123456" }));
    expect(JSON.parse(String(f.mock.calls[0][1]?.body)).rememberDevice).toBe(false);
    expect(setDeviceCookie).not.toHaveBeenCalled();
  });

  it("a temporary password still has to be changed after the code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: token({ tid: 1, pcr: true }), refreshToken: "r" }), { status: 200 }));
    expect(await (await code(req("/api/auth/login/mfa", { mfaToken: "h", code: "123456" }))).json()).toEqual({ ok: true, passwordChangeRequired: true });
  });

  it("a wrong code sets nothing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const res = await code(req("/api/auth/login/mfa", { mfaToken: "h", code: "000000" }));
    expect(res.status).toBe(401);
    expect(setAuthCookies).not.toHaveBeenCalled();
    expect(setDeviceCookie).not.toHaveBeenCalled();
  });
});
