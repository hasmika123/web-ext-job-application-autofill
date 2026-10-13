// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { GET } from "./[id]/thumbnail/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
afterEach(() => serverApiFetch.mockReset());

describe("GET /api/resumes/:id/thumbnail (R3.13)", () => {
  it("proxies the owner's thumbnail with its ETag and cache headers", async () => {
    serverApiFetch.mockResolvedValue(new Response(PNG, { status: 200, headers: { "content-type": "image/png", etag: '"abc"', "cache-control": "max-age=86400, private", "set-cookie": "x=1" } }));
    const res = await GET(new Request("http://w/x?v=abc"), params("42"));
    expect(serverApiFetch).toHaveBeenCalledWith("/api/profile/resumes/42/thumbnail", { headers: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("cache-control")).toBe("max-age=86400, private");
    expect(res.headers.get("set-cookie")).toBeNull(); // only the picture's own headers go on
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it("passes If-None-Match through and answers 304 with no body", async () => {
    serverApiFetch.mockResolvedValue(new Response(null, { status: 304, headers: { etag: '"abc"' } }));
    const res = await GET(new Request("http://w/x", { headers: { "if-none-match": '"abc"' } }), params("42"));
    expect(serverApiFetch).toHaveBeenCalledWith("/api/profile/resumes/42/thumbnail", { headers: { "if-none-match": '"abc"' } });
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"abc"');
  });

  it("relays 404 (none yet / not yours) and 401 as bare statuses", async () => {
    serverApiFetch.mockResolvedValue(new Response("nope", { status: 404 }));
    const res = await GET(new Request("http://w/x"), params("42"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    serverApiFetch.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await GET(new Request("http://w/x"), params("42"))).status).toBe(401);
  });

  it("refuses a bad id and says so when the API is unreachable", async () => {
    expect((await GET(new Request("http://w/x"), params("4x2"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
    serverApiFetch.mockRejectedValue(new Error("down"));
    expect((await GET(new Request("http://w/x"), params("42"))).status).toBe(502);
  });
});
