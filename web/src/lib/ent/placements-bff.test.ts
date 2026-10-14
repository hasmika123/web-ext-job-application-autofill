import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init?: RequestInit }[] = [];
let reply: () => Response = () => Response.json({ ok: true });
vi.mock("@/lib/api", () => ({
  serverApiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return reply();
  }),
}));

import { GET, POST } from "@/app/api/orgs/[orgId]/placements/[[...path]]/route";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url = "http://x/api/orgs/2/placements", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  calls.length = 0;
  reply = () => Response.json({ ok: true });
});

describe("the placements BFF", () => {
  it("forwards the known reads and the query string untouched", async () => {
    await GET(req("GET", "http://x/api/orgs/2/placements?tab=upcoming&page=1&sort=end,asc"), ctx("2"));
    await GET(req("GET"), ctx("2", ["counts"]));
    await GET(req("GET"), ctx("2", ["filters"]));
    await GET(req("GET"), ctx("2", ["pickers"]));
    await GET(req("GET"), ctx("2", ["17"]));
    expect(calls.map((c) => c.path)).toEqual([
      "/api/orgs/2/placements?tab=upcoming&page=1&sort=end,asc",
      "/api/orgs/2/placements/counts",
      "/api/orgs/2/placements/filters",
      "/api/orgs/2/placements/pickers",
      "/api/orgs/2/placements/17",
    ]);
  });

  it("passes the idempotency key on, and nothing else of the browser's headers", async () => {
    await POST(req("POST", undefined, { consultantId: 1, clientId: 2 }, { "idempotency-key": "abc-12345678", cookie: "secret=1", authorization: "Bearer x" }), ctx("2"));
    expect(calls[0].init?.headers).toEqual({ "Idempotency-Key": "abc-12345678" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ consultantId: 1, clientId: 2 });
  });

  it("serves every action route with a JSON object body (and the pool exit without one)", async () => {
    for (const action of ["extend", "extension-requests", "complete", "redeploy", "notes", "undo"]) {
      expect((await POST(req("POST", undefined, { x: 1 }), ctx("2", ["7", action]))).status).toBe(200);
    }
    expect((await POST(req("POST", undefined, { decision: "APPROVE" }), ctx("2", ["7", "extensions", "3", "decision"]))).status).toBe(200);
    expect((await POST(req("POST"), ctx("2", ["7", "redeploy", "cancel"]))).status).toBe(200);
    expect(calls).toHaveLength(8);
    expect(calls[6].path).toBe("/api/orgs/2/placements/7/extensions/3/decision");
    expect(calls[7].path).toBe("/api/orgs/2/placements/7/redeploy/cancel");
    expect(calls[7].init?.body).toBeUndefined();
    expect((await POST(req("POST", undefined, [1, 2]), ctx("2", ["7", "extend"]))).status).toBe(400);
    expect((await POST(new Request("http://x", { method: "POST", body: "not json" }), ctx("2", ["7", "notes"]))).status).toBe(400);
  });

  it("is not an open proxy: unknown routes, other methods and malformed ids never reach the API", async () => {
    calls.length = 0;
    expect((await GET(req("GET"), ctx("2", ["secret"]))).status).toBe(404);
    expect((await GET(req("GET"), ctx("2", ["7x"]))).status).toBe(404);
    expect((await GET(req("GET"), ctx("abc"))).status).toBe(404);
    expect((await GET(req("GET"), ctx("2", ["7", "complete"]))).status).toBe(404);
    expect((await POST(req("POST", undefined, {}), ctx("2", ["counts"]))).status).toBe(404);
    expect((await POST(req("POST", undefined, {}), ctx("2", ["7", "delete"]))).status).toBe(404);
    expect((await POST(req("POST", undefined, {}), ctx("2", ["7", "extensions", "x", "decision"]))).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("keeps a refusal's status and gives it as { error, code }", async () => {
    reply = () => Response.json({ status: 404, code: "NOT_FOUND", detail: "Not found." }, { status: 404 });
    const res = await GET(req("GET"), ctx("2", ["999"]));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Not found.", code: "NOT_FOUND" });
  });
});
