import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authHostHeaders = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-host", () => ({ authHostHeaders }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://acme.localhost:3200/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.5.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) }));

beforeEach(() => authHostHeaders.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("POST /api/auth/reset-password (S9: the host decides the world)", () => {
  it("on a tenant host the finish call carries that host", async () => {
    authHostHeaders.mockResolvedValue({ "X-Kiwiply-Host": "acme.localhost" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    expect(await (await post({ key: "k1", newPassword: "new-password-1" })).json()).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/account/reset-password/finish");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "X-Kiwiply-Host": "acme.localhost" });
    expect(JSON.parse(init.body as string)).toEqual({ key: "k1", newPassword: "new-password-1" });
  });

  it("a key of the other world fails like an unknown key (the API refuses, the page says expired)", async () => {
    authHostHeaders.mockResolvedValue({});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    const res = await post({ key: "enterprise-key", newPassword: "new-password-1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid or has expired/);
  });

  it("rejects a missing key and a short password before calling the API", async () => {
    authHostHeaders.mockResolvedValue({});
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await post({ newPassword: "new-password-1" })).status).toBe(400);
    expect((await post({ key: "k", newPassword: "abc" })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
