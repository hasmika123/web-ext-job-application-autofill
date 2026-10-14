import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));

import { handle } from "./consultants-bff";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://web.test${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("consultants BFF", () => {
  it("forwards a list call with its query string", async () => {
    const res = await handle(req("GET", "/api/orgs/2/consultants?q=jess&sort=name,asc"), ctx("2"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/orgs/2/consultants?q=jess&sort=name,asc");
  });

  it("passes If-Match on an edit and Idempotency-Key on a create, and nothing else of the browser's headers", async () => {
    await handle(req("PATCH", "/api/orgs/2/consultants/7", { availabilityStatus: "NOTICE" }, { "if-match": 'W/"3-0"', cookie: "secret=1", "x-evil": "1" }), ctx("2", ["7"]));
    expect(serverApiFetch.mock.calls[0][1].headers).toEqual({ "If-Match": 'W/"3-0"' });
    await handle(req("POST", "/api/orgs/2/consultants", { displayName: "Fay" }, { "idempotency-key": "k-12345678" }), ctx("2"));
    expect(serverApiFetch.mock.calls[1][1].headers).toEqual({ "Idempotency-Key": "k-12345678" });
  });

  it("serves exactly the documented routes", async () => {
    const ok: [string, string[]][] = [
      ["GET", []], ["GET", ["counts"]], ["GET", ["filters"]], ["GET", ["7"]], ["GET", ["7", "assignments"]], ["GET", ["7", "applications"]], ["GET", ["7", "activity"]], ["GET", ["7", "job-options"]],
      ["POST", []], ["PATCH", ["7"]], ["POST", ["7", "marketer"]], ["POST", ["7", "deactivate"]], ["POST", ["7", "reactivate"]], ["POST", ["7", "applications"]],
      ["POST", ["bulk", "availability"]], ["POST", ["bulk", "marketer"]], ["POST", ["bulk", "status"]],
    ];
    for (const [method, path] of ok) {
      const res = await handle(req(method, `/api/orgs/2/consultants/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(200);
    }
    const refused: [string, string[]][] = [
      ["DELETE", ["7"]], ["PUT", ["7"]], ["GET", ["abc"]], ["GET", ["7", "secrets"]], ["POST", ["bulk", "delete"]], ["GET", ["7", "marketer"]], ["POST", ["7"]], ["PATCH", []], ["GET", ["7", "8"]],
    ];
    for (const [method, path] of refused) {
      const res = await handle(req(method, `/api/orgs/2/consultants/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(404);
    }
  });

  it("refuses a non-numeric organization and a body that is not an object", async () => {
    expect((await handle(req("GET", "/api/orgs/abc/consultants"), ctx("abc"))).status).toBe(404);
    const bad = await handle(new Request("http://web.test/api/orgs/2/consultants", { method: "POST", body: "[1]", headers: { "content-type": "application/json" } }), ctx("2"));
    expect(bad.status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("answers the API's refusals in the page's shape", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ title: "Not found", code: "NOT_FOUND", status: 404 }), { status: 404 }));
    const res = await handle(req("GET", "/api/orgs/2/consultants/9"), ctx("2", ["9"]));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND", error: "Not found" });
  });

  it("is a 502 when the API cannot be reached", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await handle(req("GET", "/api/orgs/2/consultants"), ctx("2"))).status).toBe(502);
  });
});
