import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));

import { handle } from "./licenses-bff";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://web.test${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", cookie: "secret=1" } });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("licenses BFF", () => {
  it("serves exactly the documented routes", async () => {
    const ok: [string, string[]][] = [
      ["GET", []], ["GET", ["catalog"]], ["GET", ["7"]], ["POST", ["7"]], ["PUT", ["7", "features"]], ["POST", ["7", "suspend"]], ["POST", ["7", "reactivate"]], ["POST", ["7", "end"]],
    ];
    for (const [method, path] of ok) {
      const res = await handle(req(method, `/api/orgs/2/licenses/${path.join("/")}`, method === "GET" ? undefined : {}), ctx("2", path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(200);
    }
    expect(serverApiFetch.mock.calls.map((c) => c[0])).toContain("/api/orgs/2/licenses/7/features");
  });

  it("refuses everything else without calling the API", async () => {
    const bad: [string, string, string[]][] = [
      ["DELETE", "2", ["7"]], ["POST", "2", []], ["GET", "2", ["7", "history"]], ["POST", "2", ["abc", "end"]], ["GET", "x1", []], ["PUT", "2", ["7"]],
    ];
    for (const [method, org, path] of bad) {
      const res = await handle(req(method, `/api/orgs/${org}/licenses/${path.join("/")}`, method === "GET" ? undefined : {}), ctx(org, path));
      expect(res.status, `${method} ${org} ${path.join("/")}`).toBe(404);
    }
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("forwards the JSON body and none of the browser's headers", async () => {
    await handle(req("PUT", "/api/orgs/2/licenses/7/features", { features: ["inbox.monitoring"] }), ctx("2", ["7", "features"]));
    const init = serverApiFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ features: ["inbox.monitoring"] });
    expect(JSON.stringify(init.headers ?? {})).not.toContain("secret");
  });
});
