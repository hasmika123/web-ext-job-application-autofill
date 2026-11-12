import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));

import { handle } from "./domains-bff";

const ctx = (orgId: string, path?: string[]) => ({ params: Promise.resolve({ orgId, path }) });
const req = (method: string, body?: unknown) =>
  new Request("http://web.test/x", { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  serverApiFetch.mockReset();
  serverApiFetch.mockResolvedValue(new Response("{}", { status: 200 }));
});

/** CUSTOM-DOMAINS-BUILD.md (A4): the Domains BFF forwards exactly its routes. */
describe("domains BFF", () => {
  it("serves the documented routes", async () => {
    const ok: [string, string[], unknown][] = [
      ["GET", [], undefined],
      ["POST", [], { hostname: "careers.acme.com" }],
      ["GET", ["5", "instructions"], undefined],
      ["POST", ["5", "verify"], undefined],
      ["POST", ["5", "activate"], undefined],
      ["POST", ["5", "resume"], undefined],
      ["POST", ["5", "suspend"], { reason: "Moving" }],
      ["POST", ["5", "remove"], { confirm: "careers.acme.com" }],
    ];
    for (const [m, path, body] of ok) expect((await handle(req(m, body), ctx("2", path))).status, `${m} ${path.join("/")}`).toBe(200);
    expect(serverApiFetch.mock.calls.map((c) => c[0])).toContain("/api/orgs/2/hostnames/5/remove");
  });

  it("refuses everything else without calling the API", async () => {
    const bad: [string, string, string[]][] = [
      ["DELETE", "2", ["5"]],
      ["GET", "2", ["5"]],
      ["POST", "2", ["x", "verify"]],
      ["GET", "a2", []],
      ["PUT", "2", []],
    ];
    for (const [m, org, path] of bad) {
      expect((await handle(req(m, m === "GET" ? undefined : {}), ctx(org, path))).status, `${m} ${org} ${path.join("/")}`).toBe(404);
    }
    expect((await handle(req("POST", undefined), ctx("2", ["5", "suspend"]))).status).toBe(400);
    expect(serverApiFetch).toHaveBeenCalledTimes(0);
  });
});
