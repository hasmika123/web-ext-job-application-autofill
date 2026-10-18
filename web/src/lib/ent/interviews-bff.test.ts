import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init?: RequestInit }[] = [];
let reply: () => Response = () => Response.json({ ok: true });
vi.mock("@/lib/api", () => ({
  serverApiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return reply();
  }),
}));

import { GET, PATCH, POST } from "@/app/api/orgs/[orgId]/interviews/[[...path]]/route";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url = "http://x/api/orgs/2/interviews", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  calls.length = 0;
  reply = () => Response.json({ ok: true });
});

describe("the interviews BFF", () => {
  it("forwards the known routes and the query string untouched", async () => {
    await GET(req("GET", "http://x/api/orgs/2/interviews?status=COMPLETED&page=1"), ctx("2"));
    await GET(req("GET"), ctx("2", ["counts"]));
    await GET(req("GET"), ctx("2", ["pickers"]));
    await GET(req("GET"), ctx("2", ["analytics"]));
    await GET(req("GET"), ctx("2", ["17"]));
    expect(calls.map((c) => c.path)).toEqual(["/api/orgs/2/interviews?status=COMPLETED&page=1", "/api/orgs/2/interviews/counts", "/api/orgs/2/interviews/pickers", "/api/orgs/2/interviews/analytics", "/api/orgs/2/interviews/17"]);
  });

  it("passes the idempotency key on, and nothing else of the browser's headers", async () => {
    await POST(req("POST", undefined, { consultantId: 2, scheduledAt: "2026-11-03T14:00:00Z" }, { "idempotency-key": "abc-12345678", cookie: "secret=1", authorization: "Bearer x" }), ctx("2"));
    expect(calls[0].init?.headers).toEqual({ "Idempotency-Key": "abc-12345678" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ consultantId: 2, scheduledAt: "2026-11-03T14:00:00Z" });
  });

  it("serves the status, feedback, reschedule, reminder and edit routes with a JSON object body only", async () => {
    expect((await POST(req("POST", undefined, { status: "COMPLETED" }), ctx("2", ["7", "status"]))).status).toBe(200);
    expect((await POST(req("POST", undefined, { rating: 4, recommendation: "ADVANCE" }), ctx("2", ["7", "feedback"]))).status).toBe(200);
    expect((await PATCH(req("PATCH", undefined, { notes: null }), ctx("2", ["7"]))).status).toBe(200);
    expect((await POST(req("POST", undefined, { scheduledAt: "2026-11-03T14:00:00Z" }), ctx("2", ["7", "reschedule"]))).status).toBe(200);
    expect((await POST(req("POST", undefined, {}), ctx("2", ["7", "reminder"]))).status).toBe(200);
    expect((await POST(req("POST", undefined, [1, 2]), ctx("2", ["7", "status"]))).status).toBe(400);
    expect((await PATCH(new Request("http://x", { method: "PATCH", body: "not json" }), ctx("2", ["7"]))).status).toBe(400);
    expect(calls).toHaveLength(5);
  });

  it("is not an open proxy: unknown routes, other methods and malformed ids never reach the API", async () => {
    expect((await GET(req("GET"), ctx("2", ["secret"]))).status).toBe(404);
    expect((await GET(req("GET"), ctx("2", ["7x"]))).status).toBe(404);
    expect((await GET(req("GET"), ctx("abc"))).status).toBe(404);
    expect((await GET(req("GET"), ctx("2", ["7", "stage"]))).status).toBe(404);
    expect((await POST(req("POST", undefined, {}), ctx("2", ["counts"]))).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("keeps a refusal's status and gives it as { error, code }", async () => {
    reply = () => Response.json({ status: 404, code: "NOT_FOUND", detail: "Not found." }, { status: 404 });
    const res = await GET(req("GET"), ctx("2", ["999"]));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Not found.", code: "NOT_FOUND" });
  });
});
