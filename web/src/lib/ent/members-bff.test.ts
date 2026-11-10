import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));

import { handle } from "./members-bff";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://web.test${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("members BFF", () => {
  it("forwards a list call with its query string", async () => {
    const res = await handle(req("GET", "/api/orgs/2/members?q=an&sort=name,asc"), ctx("2"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/orgs/2/members?q=an&sort=name,asc");
  });

  it("passes If-Match on an edit and Idempotency-Key on a bulk call, and nothing else of the browser's headers", async () => {
    await handle(req("PATCH", "/api/orgs/2/members/7", { title: "Lead" }, { "if-match": '"3"', cookie: "secret=1", "x-evil": "1" }), ctx("2", ["7"]));
    expect(serverApiFetch.mock.calls[0][1].headers).toEqual({ "If-Match": '"3"' });
    await handle(req("POST", "/api/orgs/2/members/bulk/roles", { memberIds: [1] }, { "idempotency-key": "k-1" }), ctx("2", ["bulk", "roles"]));
    expect(serverApiFetch.mock.calls[1][1].headers).toEqual({ "Idempotency-Key": "k-1" });
  });

  it("serves exactly the documented routes", async () => {
    const ok: [string, string[]][] = [
      ["GET", []], ["GET", ["counts"]], ["GET", ["offboarding"]], ["DELETE", ["offboarding", "5"]], ["GET", ["7"]], ["GET", ["7", "activity"]], ["GET", ["7", "offboard-preview"]],
      ["PUT", ["7", "roles"]], ["POST", ["7", "suspend"]], ["POST", ["7", "reinstate"]], ["POST", ["7", "offboard"]], ["POST", ["bulk", "status"]], ["POST", ["bulk", "manager"]], ["POST", ["bulk", "groups"]],
    ];
    for (const [method, path] of ok) {
      serverApiFetch.mockResolvedValueOnce(new Response(method === "DELETE" ? null : "{}", { status: method === "DELETE" ? 204 : 200 }));
      const res = await handle(req(method, `/api/orgs/2/members/${path.join("/")}`, ["GET", "DELETE"].includes(method) ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBeLessThan(300);
    }
    for (const [method, path] of [["DELETE", ["7"]], ["POST", []], ["GET", ["7", "roles"]], ["POST", ["bulk", "everything"]], ["GET", ["abc"]], ["PUT", ["7"]], ["GET", ["7", "..", "x"]]] as [string, string[]][]) {
      const res = await handle(req(method, `/api/orgs/2/members/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(404);
    }
  });

  it("refuses a non-numeric organization before calling the API", async () => {
    const res = await handle(req("GET", "/api/orgs/x/members"), ctx("x"));
    expect(res.status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("rejects a body that is not a JSON object", async () => {
    const res = await handle(new Request("http://web.test/api/orgs/2/members/7", { method: "PATCH", body: "[1]" }), ctx("2", ["7"]));
    expect(res.status).toBe(400);
  });

  it("answers an upstream error as { error, code } with the same status, and 204 as an empty 204", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "The person changed", code: "PRECONDITION_FAILED" }), { status: 412 }));
    const res = await handle(req("PATCH", "/api/orgs/2/members/7", {}, { "if-match": '"1"' }), ctx("2", ["7"]));
    expect(res.status).toBe(412);
    expect(await res.json()).toMatchObject({ error: "The person changed", code: "PRECONDITION_FAILED" });
    serverApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const del = await handle(req("DELETE", "/api/orgs/2/members/offboarding/5"), ctx("2", ["offboarding", "5"]));
    expect(del.status).toBe(204);
  });
});
