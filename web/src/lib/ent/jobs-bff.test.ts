import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));

import { handle } from "./jobs-bff";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://web.test${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("jobs BFF", () => {
  it("forwards a list call with its query string", async () => {
    const res = await handle(req("GET", "/api/orgs/2/jobs?status=OPEN&q=react"), ctx("2"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/orgs/2/jobs?status=OPEN&q=react");
  });

  it("passes If-Match and Idempotency-Key and nothing else of the browser's headers", async () => {
    await handle(req("PATCH", "/api/orgs/2/jobs/7", { title: "Lead dev" }, { "if-match": '"3"', cookie: "secret=1", "x-evil": "1" }), ctx("2", ["7"]));
    expect(serverApiFetch.mock.calls[0][1].headers).toEqual({ "If-Match": '"3"' });
    await handle(req("POST", "/api/orgs/2/jobs", { title: "Dev", clientId: 1 }, { "idempotency-key": "k-12345678" }), ctx("2"));
    expect(serverApiFetch.mock.calls[1][1].headers).toEqual({ "Idempotency-Key": "k-12345678" });
  });

  it("serves exactly the documented routes", async () => {
    const ok: [string, string[]][] = [
      ["GET", []], ["GET", ["summary"]], ["GET", ["7"]], ["POST", []], ["PATCH", ["7"]], ["POST", ["bulk", "status"]], ["POST", ["7", "matches", "9", "assign"]], ["PATCH", ["7", "matches", "9"]],
    ];
    for (const [method, path] of ok) {
      const res = await handle(req(method, `/api/orgs/2/jobs/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path.length ? path : undefined));
      expect(res.status, `${method} ${path.join("/")}`).toBeLessThan(300);
    }
    const no: [string, string[]][] = [["DELETE", ["7"]], ["PUT", ["7"]], ["GET", ["7", "matches"]], ["POST", ["7"]], ["GET", ["abc"]], ["GET", ["../x"]], ["POST", ["7", "matches", "x", "assign"]], ["GET", ["bulk", "status"]]];
    for (const [method, path] of no) {
      const res = await handle(req(method, `/api/orgs/2/jobs/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(404);
    }
    expect((await handle(req("GET", "/api/orgs/x/jobs"), ctx("x"))).status).toBe(404);
  });

  it("answers 400 for a body that is not a JSON object, and an assign with no body is an empty object", async () => {
    expect((await handle(new Request("http://web.test/api/orgs/2/jobs", { method: "POST", body: "[1]", headers: { "content-type": "application/json" } }), ctx("2"))).status).toBe(400);
    await handle(new Request("http://web.test/api/orgs/2/jobs/7/matches/9/assign", { method: "POST" }), ctx("2", ["7", "matches", "9", "assign"]));
    expect(serverApiFetch.mock.calls.at(-1)![1].body).toBe("{}");
  });
});
