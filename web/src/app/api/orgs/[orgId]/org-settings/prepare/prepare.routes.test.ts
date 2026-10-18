import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ serverApiFetch }));

import { GET, PUT } from "./route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const put = (body: unknown) => new Request("http://localhost:3200/api/orgs/7/org-settings/prepare", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (orgId: string) => ({ params: Promise.resolve({ orgId }) });

beforeEach(() => serverApiFetch.mockReset());

describe("/api/orgs/{orgId}/org-settings/prepare", () => {
  it("reads the organization's switch and limits from the API", async () => {
    serverApiFetch.mockResolvedValue(json({ enabled: false }));
    const res = await GET(new Request("http://x"), ctx("7"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/orgs/7/org-settings/prepare");
  });

  it("refuses a non-numeric organization id without calling the API", async () => {
    expect((await GET(new Request("http://x"), ctx("7;drop"))).status).toBe(404);
    expect((await PUT(put({ enabled: true }), ctx("abc"))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("forwards only the four known fields and nothing else", async () => {
    serverApiFetch.mockResolvedValue(json({ enabled: true }));
    const ok = await PUT(put({ enabled: true, dailyCap: 5, monthlyCap: null, maxBatch: 3 }), ctx("7"));
    expect(ok.status).toBe(200);
    const [path, init] = serverApiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/orgs/7/org-settings/prepare");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ enabled: true, dailyCap: 5, monthlyCap: null, maxBatch: 3 });
    serverApiFetch.mockClear();
    const bad = await PUT(put({ enabled: true, sessionMinutes: 5 }), ctx("7"));
    expect(bad.status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
