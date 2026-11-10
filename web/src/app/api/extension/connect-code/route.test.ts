import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { POST } from "./route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => serverApiFetch.mockReset());

describe("POST /api/extension/connect-code (tenant host)", () => {
  it("asks the API with the session of this host and returns only the connect URL", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ connectUrl: "https://kiwiply.com/connect?code=abc", expiresInSeconds: 60 }));
    const res = await POST();
    expect(await res.json()).toEqual({ connectUrl: "https://kiwiply.com/connect?code=abc" });
    expect(serverApiFetch.mock.calls[0]).toEqual(["/api/extension/connect-code", { method: "POST" }]);
  });

  it("relays 401 (signed out) and 429 (too many), and treats anything else as unavailable", async () => {
    serverApiFetch.mockResolvedValueOnce(json({}, 401));
    expect((await POST()).status).toBe(401);
    serverApiFetch.mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "12" } }));
    const r = await POST();
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("12");
    serverApiFetch.mockResolvedValueOnce(json({}, 500));
    expect((await POST()).status).toBe(502);
  });

  it("never passes along a URL that is not http(s)", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ connectUrl: "javascript:alert(1)" }));
    expect((await POST()).status).toBe(502);
  });
});
