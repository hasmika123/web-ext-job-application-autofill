import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
const hasSession = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/auth", () => ({ hasSession: () => hasSession() }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));

import { GET, POST } from "./route";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
// each call gets its own client address so the route's rate limit never couples the tests
let n = 0;
const post = (body: unknown) =>
  POST(new Request("http://kiwiply.test/api/extension/token", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": `10.2.${Math.floor(++n / 250)}.${n % 250}` } }));
const CODE = "c".repeat(43);

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});
afterEach(() => {
  serverApiFetch.mockReset();
  hasSession.mockReset();
  fetchSpy.mockRestore();
});

describe("GET /api/extension/token (personal)", () => {
  it("is 401 without a session", async () => {
    hasSession.mockResolvedValue(false);
    expect((await GET()).status).toBe(401);
  });

  it("hands over the tokens with the account kind, user id and email inside the same object", async () => {
    hasSession.mockResolvedValue(true);
    serverApiFetch.mockResolvedValueOnce(json({ accessToken: "A", refreshToken: "R", kind: "PERSONAL", userId: 7, email: "sam@x.test", username: "sam" }));
    const res = await GET();
    expect(await res.json()).toEqual({ access: "A", refresh: "R", kind: "PERSONAL", userId: 7, email: "sam@x.test", username: "sam" });
    expect(serverApiFetch).toHaveBeenCalledTimes(1); // the API supplied the username: no account lookup
  });

  it("an older API (no kind) still works: the account login is looked up for the label", async () => {
    hasSession.mockResolvedValue(true);
    serverApiFetch.mockResolvedValueOnce(json({ accessToken: "A", refreshToken: "R" })).mockResolvedValueOnce(json({ login: "sam" }));
    expect(await (await GET()).json()).toMatchObject({ access: "A", refresh: "R", kind: "PERSONAL", username: "sam" });
  });

  it("a failed or malformed session is an error, not a half handoff", async () => {
    hasSession.mockResolvedValue(true);
    serverApiFetch.mockResolvedValueOnce(json({}, 500));
    expect((await GET()).status).toBe(502);
    serverApiFetch.mockResolvedValueOnce(json({ accessToken: "A" }));
    expect((await GET()).status).toBe(502);
  });
});

describe("POST /api/extension/token (enterprise connect code)", () => {
  it("exchanges the code on the public endpoint WITHOUT a bearer token and returns the enterprise handoff", async () => {
    fetchSpy.mockResolvedValueOnce(json({ accessToken: "A", refreshToken: "R", kind: "ENTERPRISE", userId: 41, orgId: 3, orgName: "Acme", email: "sam@x.test" }));
    const res = await post({ code: CODE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access: "A", refresh: "R", kind: "ENTERPRISE", userId: 41, orgId: 3, orgName: "Acme", email: "sam@x.test" });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/extension/connect-code/exchange");
    expect(new Headers(init.headers).has("authorization")).toBe(false);
    expect(JSON.parse(init.body as string)).toEqual({ code: CODE });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("every failure is the same 400 and says nothing about the code", async () => {
    fetchSpy.mockResolvedValueOnce(json({}, 401));
    const a = await post({ code: CODE });
    fetchSpy.mockResolvedValueOnce(json({ title: "Not found" }, 404));
    const b = await post({ code: "d".repeat(43) });
    expect([a.status, b.status]).toEqual([400, 400]);
    expect(await a.json()).toEqual(await b.json());
  });

  it("refuses a missing or absurd code before calling the API, and a personal answer on the code path", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ code: "short" })).status).toBe(400);
    expect((await POST(new Request("http://kiwiply.test/x", { method: "POST", body: "not json", headers: { "x-forwarded-for": "10.9.9.9" } }))).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockResolvedValueOnce(json({ accessToken: "A", refreshToken: "R", kind: "PERSONAL", userId: 1 }));
    expect((await post({ code: CODE })).status).toBe(502);
  });

  it("an enterprise answer without a positive org id or user id is malformed", async () => {
    fetchSpy.mockResolvedValueOnce(json({ accessToken: "A", refreshToken: "R", kind: "ENTERPRISE", userId: 41 }));
    expect((await post({ code: CODE })).status).toBe(502);
  });

  it("an unreachable API is a 502 and the API's own 429 is relayed", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("down"));
    expect((await post({ code: CODE })).status).toBe(502);
    fetchSpy.mockResolvedValueOnce(json({}, 429, { "retry-after": "30" }));
    const r = await post({ code: CODE });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("30");
  });
});
