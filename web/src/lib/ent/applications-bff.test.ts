import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init?: RequestInit }[] = [];
let reply: () => Response = () => Response.json({ ok: true });
vi.mock("@/lib/api", () => ({
  serverApiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return reply();
  }),
}));

import { GET, PATCH, POST } from "@/app/api/orgs/[orgId]/applications/[[...path]]/route";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url = "http://x/api/orgs/2/applications", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  calls.length = 0;
  reply = () => Response.json({ ok: true });
});

describe("the applications BFF", () => {
  it("forwards the known routes and the query string untouched", async () => {
    await GET(req("GET", "http://x/api/orgs/2/applications?stage=OFFER&page=1"), ctx("2"));
    await GET(req("GET"), ctx("2", ["counts"]));
    await GET(req("GET"), ctx("2", ["pickers"]));
    await GET(req("GET"), ctx("2", ["17"]));
    expect(calls.map((c) => c.path)).toEqual(["/api/orgs/2/applications?stage=OFFER&page=1", "/api/orgs/2/applications/counts", "/api/orgs/2/applications/pickers", "/api/orgs/2/applications/17"]);
  });

  it("passes the idempotency key on, and nothing else of the browser's headers", async () => {
    await POST(req("POST", undefined, { requirementId: 1, consultantId: 2 }, { "idempotency-key": "abc-12345678", cookie: "secret=1", authorization: "Bearer x" }), ctx("2"));
    expect(calls[0].init?.headers).toEqual({ "Idempotency-Key": "abc-12345678" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ requirementId: 1, consultantId: 2 });
  });

  it("serves the stage, notes and edit routes with a JSON object body only", async () => {
    expect((await POST(req("POST", undefined, { stage: "OFFER" }), ctx("2", ["7", "stage"]))).status).toBe(200);
    expect((await POST(req("POST", undefined, { body: "hi" }), ctx("2", ["7", "notes"]))).status).toBe(200);
    expect((await PATCH(req("PATCH", undefined, { nextAction: null }), ctx("2", ["7"]))).status).toBe(200);
    expect((await POST(req("POST", undefined, [1, 2]), ctx("2", ["7", "stage"]))).status).toBe(400);
    expect((await PATCH(new Request("http://x", { method: "PATCH", body: "not json" }), ctx("2", ["7"]))).status).toBe(400);
    expect(calls).toHaveLength(3);
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
