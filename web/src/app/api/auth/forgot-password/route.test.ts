import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authHostHeaders = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-host", () => ({ authHostHeaders }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://acme.localhost:3200/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.4.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) }));

beforeEach(() => authHostHeaders.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("POST /api/auth/forgot-password (S9: the host decides the world)", () => {
  it("on a tenant host the API call carries that host, so only that organization's account is reset", async () => {
    authHostHeaders.mockResolvedValue({ "X-Kiwiply-Host": "acme.localhost" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const res = await post({ email: " sam@example.test " });
    expect(await res.json()).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/account/reset-password/init");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "X-Kiwiply-Host": "acme.localhost", "content-type": "text/plain" });
    expect(init.body).toBe("sam@example.test");
  });

  it("on kiwiply.com no host header is sent (the personal account), and the answer is identical", async () => {
    authHostHeaders.mockResolvedValue({});
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    expect(await (await post({ email: "sam@example.test" })).json()).toEqual({ ok: true });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({ "content-type": "text/plain" });
  });

  it("answers the same whether the API found an account or refused (never reveals which)", async () => {
    authHostHeaders.mockResolvedValue({ "X-Kiwiply-Host": "acme.localhost" });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const found = await post({ email: "a@example.test" });
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 400 }));
    const unknown = await post({ email: "b@example.test" });
    expect([found.status, await found.json()]).toEqual([unknown.status, await unknown.json()]);
  });
});
