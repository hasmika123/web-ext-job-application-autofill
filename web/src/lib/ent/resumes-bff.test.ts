import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));

import { handle } from "./resumes-bff";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://web.test${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("resumes BFF", () => {
  it("forwards a list call with its query string", async () => {
    const res = await handle(req("GET", "/api/orgs/2/resumes?tab=pending&sort=name,asc"), ctx("2"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/orgs/2/resumes?tab=pending&sort=name,asc");
  });

  it("passes only the Idempotency-Key of the browser headers", async () => {
    await handle(req("POST", "/api/orgs/2/resumes", { consultantId: 4, name: "x" }, { "idempotency-key": "k-12345678", cookie: "secret=1", "if-match": "1", "x-evil": "1" }), ctx("2"));
    expect(serverApiFetch.mock.calls[0][1].headers).toEqual({ "Idempotency-Key": "k-12345678" });
  });

  it("serves exactly the documented routes", async () => {
    const ok: [string, string[]][] = [
      ["GET", []], ["GET", ["counts"]], ["GET", ["filters"]], ["GET", ["consultants"]], ["GET", ["7"]], ["GET", ["7", "export"]],
      ["PUT", ["7", "primary"]], ["PUT", ["7", "visibility"]], ["POST", ["7", "decision"]], ["POST", []], ["POST", ["bulk"]],
    ];
    for (const [method, path] of ok) {
      serverApiFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
      const res = await handle(req(method, `/api/orgs/2/resumes/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(200);
    }
    for (const [method, path] of [["DELETE", ["7"]], ["PUT", []], ["GET", ["7", "primary"]], ["POST", ["7"]], ["GET", ["abc"]], ["POST", ["bulk", "x"]], ["GET", ["7", "..", "x"]], ["PATCH", ["7"]]] as [string, string[]][]) {
      const res = await handle(req(method, `/api/orgs/2/resumes/${path.join("/")}`, ["GET", "DELETE"].includes(method) ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(404);
    }
  });

  it("streams an export with its type and disposition, and wraps an error as JSON", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response("Anika", { status: 200, headers: { "content-type": "text/plain;charset=UTF-8", "content-disposition": 'attachment; filename="a.txt"', "set-cookie": "x=1" } }));
    const res = await handle(req("GET", "/api/orgs/2/resumes/7/export?format=txt"), ctx("2", ["7", "export"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("a.txt");
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toBe("Anika");
    serverApiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Not found", code: "NOT_FOUND" }), { status: 404 }));
    const miss = await handle(req("GET", "/api/orgs/2/resumes/7/export"), ctx("2", ["7", "export"]));
    expect(miss.status).toBe(404);
    expect(await miss.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a non-numeric organization before calling the API, and a body that is not an object", async () => {
    expect((await handle(req("GET", "/api/orgs/x/resumes"), ctx("x"))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
    const bad = await handle(new Request("http://web.test/api/orgs/2/resumes/7/primary", { method: "PUT", body: "[1]" }), ctx("2", ["7", "primary"]));
    expect(bad.status).toBe(400);
  });

  it("answers an upstream refusal as { error, code } with the same status", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Only approved", code: "NOT_APPROVED" }), { status: 409 }));
    const res = await handle(req("PUT", "/api/orgs/2/resumes/7/primary", { primary: true }), ctx("2", ["7", "primary"]));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Only approved", code: "NOT_APPROVED" });
  });
});
