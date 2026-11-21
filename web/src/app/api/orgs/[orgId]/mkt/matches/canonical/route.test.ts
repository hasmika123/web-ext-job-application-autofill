import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { GET } from "./route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (url: string) => new Request(`http://web.test${url}`);

beforeEach(() => serverApiFetch.mockResolvedValue(json({ source: "OPPORTUNITY_MATCH", items: [], total: 0 })));
afterEach(() => serverApiFetch.mockReset());

describe("GET mkt/matches/canonical", () => {
  it("forwards only the canonical feed filters", async () => {
    const response = await GET(req("/api/orgs/2/mkt/matches/canonical?consultant=7&status=SUGGESTED&ignored=x"), { params: Promise.resolve({ orgId: "2" }) });
    expect(response.status).toBe(200);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/2/mkt/matches/canonical?consultant=7&status=SUGGESTED");
    expect(serverApiFetch.mock.calls[0]![1]?.headers).toEqual({ accept: "application/json" });
  });

  it("rejects a bad organization id before it reaches the API", async () => {
    expect((await GET(req("/x"), { params: Promise.resolve({ orgId: "../2" }) })).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
