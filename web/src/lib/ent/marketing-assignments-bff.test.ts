import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));

import { handle } from "./marketing-assignments-bff";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://web.test${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("marketing assignments BFF", () => {
  it("forwards a list call with its query string", async () => {
    const res = await handle(req("GET", "/api/orgs/2/marketing-assignments/consultants?marketerId=7&q=ja"), ctx("2", ["consultants"]));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/orgs/2/marketing-assignments/consultants?marketerId=7&q=ja");
  });

  it("passes the Idempotency-Key and nothing else of the browser's headers", async () => {
    await handle(req("POST", "/api/orgs/2/marketing-assignments/assign", { consultantIds: [1] }, { "idempotency-key": "k-1", cookie: "secret=1", "x-evil": "1", "if-match": "x" }), ctx("2", ["assign"]));
    expect(serverApiFetch.mock.calls[0][1].headers).toEqual({ "Idempotency-Key": "k-1" });
  });

  it("serves exactly the documented routes", async () => {
    const ok: [string, string[]][] = [
      ["GET", ["marketers"]], ["GET", ["marketers", "candidates"]], ["GET", ["consultants"]], ["GET", ["filters"]], ["GET", ["kpis"]], ["GET", ["workload"]],
      ["POST", ["marketers"]], ["PATCH", ["marketers", "7"]], ["POST", ["assign"]], ["POST", ["update"]], ["POST", ["unassign"]], ["POST", ["restore"]],
    ];
    for (const [method, path] of ok) {
      const res = await handle(req(method, `/api/orgs/2/marketing-assignments/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(200);
    }
    const bad: [string, string[]][] = [["DELETE", ["marketers", "7"]], ["POST", []], ["GET", []], ["GET", ["assign"]], ["PATCH", ["marketers"]], ["PATCH", ["marketers", "x"]], ["POST", ["everything"]], ["GET", ["marketers", "7"]], ["GET", ["consultants", "..", "x"]]];
    for (const [method, path] of bad) {
      const res = await handle(req(method, `/api/orgs/2/marketing-assignments/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(404);
    }
  });

  it("refuses a non-numeric organization before calling the API", async () => {
    const res = await handle(req("GET", "/api/orgs/x/marketing-assignments/kpis"), ctx("x", ["kpis"]));
    expect(res.status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("refuses a body that is not a JSON object", async () => {
    const res = await handle(new Request("http://web.test/api/orgs/2/marketing-assignments/assign", { method: "POST", body: "[1]" }), ctx("2", ["assign"]));
    expect(res.status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("passes the API's refusal on as { error, code, ...extras } with the same status", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Over capacity", code: "OVER_CAPACITY", capacity: 3, current: 3 }), { status: 409 }));
    const res = await handle(req("POST", "/api/orgs/2/marketing-assignments/assign", { consultantIds: [1], marketerMemberId: 2 }), ctx("2", ["assign"]));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Over capacity", code: "OVER_CAPACITY", capacity: 3, current: 3 });
  });

  it("answers 502 in the same shape when the API is down", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    const res = await handle(req("GET", "/api/orgs/2/marketing-assignments/kpis"), ctx("2", ["kpis"]));
    expect(res.status).toBe(502);
  });
});
