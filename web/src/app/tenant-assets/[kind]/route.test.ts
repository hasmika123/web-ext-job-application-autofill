// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "./route";

const ctx = (kind: string) => ({ params: Promise.resolve({ kind }) });
const req = (headers: Record<string, string>) => new Request("http://acme.localhost/tenant-assets/logo?v=3", { headers });

afterEach(() => vi.unstubAllGlobals());

describe("/tenant-assets/{kind} BFF proxy (X2.13)", () => {
  it("proxies the host's asset with the API's cache headers and sends only the host, never a parameter", async () => {
    const fn = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", etag: '"abc"' } }));
    vi.stubGlobal("fetch", fn);
    const res = await GET(req({ "x-kiwiply-host": "acme.localhost" }), ctx("logo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/public\/tenant\/assets\/logo$/);
    expect((init.headers as Record<string, string>)["X-Kiwiply-Host"]).toBe("acme.localhost");
  });

  it("forwards If-None-Match and passes a 304 through with no body", async () => {
    const fn = vi.fn(async () => new Response(null, { status: 304, headers: { etag: '"abc"' } }));
    vi.stubGlobal("fetch", fn);
    const res = await GET(req({ "x-kiwiply-host": "acme.localhost", "if-none-match": '"abc"' }), ctx("logo"));
    expect(res.status).toBe(304);
    expect(((fn.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)["If-None-Match"]).toBe('"abc"');
  });

  it("is a bare 404 for a platform host, an unknown kind, and any API refusal; no API call for the first two", async () => {
    const fn = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fn);
    expect((await GET(req({ "x-kiwiply-host": "localhost" }), ctx("logo"))).status).toBe(404);
    expect((await GET(req({ "x-kiwiply-host": "acme.localhost" }), ctx("avatar"))).status).toBe(404);
    expect((await GET(req({}), ctx("logo"))).status).toBe(404);
    expect(fn).not.toHaveBeenCalled();
    expect((await GET(req({ "x-kiwiply-host": "nobody.localhost" }), ctx("logo"))).status).toBe(404);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("HEAD returns headers and no body; an unreachable API is a 502, a throttled one a 429 with Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { status: 200, headers: { etag: '"x"' } })));
    const head = await HEAD(req({ "x-kiwiply-host": "acme.localhost" }), ctx("logo"));
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    expect((await GET(req({ "x-kiwiply-host": "acme.localhost" }), ctx("logo"))).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "30" } })));
    const limited = await GET(req({ "x-kiwiply-host": "acme.localhost" }), ctx("logo"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("30");
  });
});
