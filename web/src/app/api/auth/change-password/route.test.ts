import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.hoisted(() => vi.fn());
const setAuthCookies = vi.hoisted(() => vi.fn());
const getRefreshToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ serverApiFetch }));
vi.mock("@/lib/auth", () => ({ setAuthCookies, getRefreshToken }));
vi.mock("@/lib/auth-host", () => ({ authHostHeaders: async () => ({ "X-Kiwiply-Host": "acme.localhost" }) }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://acme.localhost:3200/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.3.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) }));

beforeEach(() => {
  serverApiFetch.mockReset();
  setAuthCookies.mockReset();
  getRefreshToken.mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/auth/change-password", () => {
  it("changes the password, then swaps the cookies for a clean pair with ONE refresh, and echoes nothing", async () => {
    serverApiFetch.mockResolvedValue(new Response(null, { status: 200 }));
    getRefreshToken.mockResolvedValue("old-refresh");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: "clean", refreshToken: "new-refresh" }), { status: 200 }));
    const res = await post({ currentPassword: "temp-value", newPassword: "my-own-password" });
    expect(await res.json()).toEqual({ ok: true });
    expect(JSON.parse((serverApiFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ currentPassword: "temp-value", newPassword: "my-own-password" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/refresh");
    expect(setAuthCookies).toHaveBeenCalledWith("clean", "new-refresh");
  });

  it("maps a wrong current password or a refused new one to a calm 400 and keeps the session as it was", async () => {
    serverApiFetch.mockResolvedValue(new Response("{}", { status: 400 }));
    const res = await post({ currentPassword: "nope", newPassword: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_PASSWORD");
    expect(setAuthCookies).not.toHaveBeenCalled();
  });

  it("a lost session is a 401, a missing field a 400, an unreachable API a 502", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    expect((await post({ currentPassword: "a", newPassword: "b" })).status).toBe(401);
    expect((await post({ currentPassword: "a" })).status).toBe(400);
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await post({ currentPassword: "a", newPassword: "bcdef" })).status).toBe(502);
  });
});
