import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));

import { handle } from "./mgmt-bff";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://web.test${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("marketing manager BFF", () => {
  it("forwards a read with its query string", async () => {
    const res = await handle(req("GET", "/api/orgs/2/mgmt/pipeline?range=90&page=1"), ctx("2", ["pipeline"]));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/orgs/2/mgmt/pipeline?range=90&page=1");
  });

  it("forwards only the idempotency key on a write", async () => {
    await handle(req("POST", "/api/orgs/2/mgmt/approvals/7/approve", { note: "Looks good" }, { "idempotency-key": "manager-1", cookie: "secret", "x-evil": "1" }), ctx("2", ["approvals", "7", "approve"]));
    expect(serverApiFetch.mock.calls[0][1].headers).toEqual({ "Idempotency-Key": "manager-1" });
  });

  it("allows the documented reads and writes, but never becomes an open proxy", async () => {
    const ok: [string, string[]][] = [
      ["GET", ["home"]], ["GET", ["team"]], ["GET", ["team", "7"]], ["GET", ["assignments"]],
      ["GET", ["assignments", "consultants", "9", "history"]], ["GET", ["workload"]], ["GET", ["pipeline", "summary"]],
      ["GET", ["approvals"]], ["GET", ["approvals", "7"]], ["GET", ["escalations", "counts"]], ["GET", ["reports", "overview"]],
      ["PATCH", ["team", "7"]], ["POST", ["assignments", "assign"]], ["POST", ["workload", "rebalance"]], ["POST", ["escalations", "7", "resolve"]],
    ];
    for (const [method, path] of ok) {
      const response = await handle(req(method, `/api/orgs/2/mgmt/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path));
      expect(response.status, `${method} ${path.join("/")}`).toBe(200);
    }
    const bad = await handle(req("GET", "/api/orgs/2/mgmt/anything/else"), ctx("2", ["anything", "else"]));
    expect(bad.status).toBe(404);
  });

  it("refuses a non-numeric organization and invalid write body before the API", async () => {
    expect((await handle(req("GET", "/api/orgs/acme/mgmt/home"), ctx("acme", ["home"]))).status).toBe(404);
    const invalid = await handle(new Request("http://web.test/api/orgs/2/mgmt/assignments/assign", { method: "POST", body: "[]" }), ctx("2", ["assignments", "assign"]));
    expect(invalid.status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
