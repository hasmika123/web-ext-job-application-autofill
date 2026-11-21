import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { GET } from "./route";
import { GET as GET_DETAIL } from "./[id]/route";
import { POST as POST_ASSIGN } from "./[id]/assign/route";
import { POST as POST_DISMISS } from "./[id]/dismiss/route";

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

  it("keeps detail and lifecycle actions on the canonical source path", async () => {
    await GET_DETAIL(req("/x"), { params: Promise.resolve({ orgId: "2", id: "7" }) });
    await POST_ASSIGN(req("/x"), { params: Promise.resolve({ orgId: "2", id: "7" }) });
    await POST_DISMISS(req("/x"), { params: Promise.resolve({ orgId: "2", id: "7" }) });
    expect(serverApiFetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/orgs/2/mkt/matches/canonical/7",
      "/api/orgs/2/mkt/matches/canonical/7/assign",
      "/api/orgs/2/mkt/matches/canonical/7/dismiss",
    ]);
    expect(serverApiFetch.mock.calls[1]![1]).toMatchObject({ method: "POST", headers: { accept: "application/json" } });
  });

  it("rejects bad canonical ids before forwarding", async () => {
    expect((await GET_DETAIL(req("/x"), { params: Promise.resolve({ orgId: "2", id: "../7" }) })).status).toBe(404);
    expect((await POST_ASSIGN(req("/x"), { params: Promise.resolve({ orgId: "bad", id: "7" }) })).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
