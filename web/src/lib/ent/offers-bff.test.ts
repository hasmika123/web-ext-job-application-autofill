import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init?: RequestInit }[] = [];
let reply: () => Response = () => Response.json({ ok: true });
vi.mock("@/lib/api", () => ({
  serverApiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return reply();
  }),
}));

import { GET, POST, PUT } from "@/app/api/orgs/[orgId]/offers/[[...path]]/route";
import { GET as SUBMISSIONS_GET } from "@/app/api/orgs/[orgId]/submissions/[[...path]]/route";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url = "http://x/api/orgs/2/offers", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  calls.length = 0;
  reply = () => Response.json({ ok: true });
});

describe("the offers BFF", () => {
  it("forwards the known reads and the query string untouched", async () => {
    await GET(req("GET", "http://x/api/orgs/2/offers?tab=draft&page=1&q=ana"), ctx("2"));
    await GET(req("GET"), ctx("2", ["counts"]));
    await GET(req("GET"), ctx("2", ["pickers"]));
    await GET(req("GET"), ctx("2", ["17"]));
    expect(calls.map((c) => c.path)).toEqual(["/api/orgs/2/offers?tab=draft&page=1&q=ana", "/api/orgs/2/offers/counts", "/api/orgs/2/offers/pickers", "/api/orgs/2/offers/17"]);
  });

  it("forwards record, revise, extend, withdraw and the placement retry with the idempotency key and nothing else of the browser's headers", async () => {
    await POST(req("POST", undefined, { consultantId: 1 }, { "idempotency-key": "abc-12345678", cookie: "secret=1", authorization: "Bearer x" }), ctx("2"));
    await PUT(req("PUT", undefined, { rateMinor: 5 }), ctx("2", ["17"]));
    await POST(req("POST"), ctx("2", ["17", "extend"]));
    await POST(req("POST", undefined, { reason: "x" }), ctx("2", ["17", "withdraw"]));
    await POST(req("POST"), ctx("2", ["17", "placement"]));
    expect(calls.map((c) => [c.init?.method, c.path])).toEqual([
      ["POST", "/api/orgs/2/offers"],
      ["PUT", "/api/orgs/2/offers/17"],
      ["POST", "/api/orgs/2/offers/17/extend"],
      ["POST", "/api/orgs/2/offers/17/withdraw"],
      ["POST", "/api/orgs/2/offers/17/placement"],
    ]);
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("abc-12345678");
    expect(JSON.stringify(headers)).not.toContain("secret");
    expect(JSON.stringify(headers)).not.toContain("Bearer");
  });

  it("has no accept, decline or negotiate route: only the consultant answers an offer", async () => {
    for (const verb of ["accept", "decline", "negotiate", "sign", "submit"]) {
      const r = await POST(req("POST", undefined, {}), ctx("2", ["17", verb]));
      expect(r.status).toBe(404);
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses a bad organization id, an unknown path, a wrong method and a body that is not a JSON object", async () => {
    expect((await GET(req("GET"), ctx("abc"))).status).toBe(404);
    expect((await GET(req("GET"), ctx("2", ["17", "withdraw"]))).status).toBe(404);
    expect((await GET(req("GET"), ctx("2", ["../x"]))).status).toBe(404);
    const bad = await POST(new Request("http://x/api/orgs/2/offers", { method: "POST", body: "[1]" }), ctx("2"));
    expect(bad.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("the submissions records BFF", () => {
  it("forwards only the two reads and has no write method", async () => {
    await SUBMISSIONS_GET(req("GET", "http://x/api/orgs/2/submissions?status=SUBMITTED&page=0"), ctx("2"));
    await SUBMISSIONS_GET(req("GET"), ctx("2", ["counts"]));
    expect(calls.map((c) => c.path)).toEqual(["/api/orgs/2/submissions?status=SUBMITTED&page=0", "/api/orgs/2/submissions/counts"]);
    expect((await SUBMISSIONS_GET(req("GET"), ctx("2", ["9"]))).status).toBe(404);
    expect((await SUBMISSIONS_GET(req("GET"), ctx("x"))).status).toBe(404);
    const mod = await import("@/app/api/orgs/[orgId]/submissions/[[...path]]/route");
    expect(Object.keys(mod).sort()).toEqual(["GET"]);
  });
});
