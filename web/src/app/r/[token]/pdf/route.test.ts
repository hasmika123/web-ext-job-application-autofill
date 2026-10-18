import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));

import { GET } from "./route";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const ctx = (token = TOKEN) => ({ params: Promise.resolve({ token }) });
const req = (ip = "203.0.113.9") => new Request(`http://web.test/r/${TOKEN}/pdf`, { headers: { "x-forwarded-for": ip } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /r/:token/pdf", () => {
  it("streams the stored PDF as a download, uncached and unindexed", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { "content-type": "application/pdf" } }));
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="resume.pdf"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([37, 80, 68, 70]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://api.test/api/public/resumes/${TOKEN}/pdf`);
    const sent = new Headers(init?.headers);
    expect(sent.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(sent.get("authorization")).toBeNull();
  });

  it("answers 404 for a token that cannot be real without asking the API", async () => {
    const res = await GET(req(), ctx("nope"));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the API's refusals: 404 stays 404, 409 PDF_NOT_READY, 429 keeps Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect((await GET(req(), ctx())).status).toBe(404);

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 409 }));
    const notReady = await GET(req(), ctx());
    expect(notReady.status).toBe(409);
    expect(((await notReady.json()) as { code: string }).code).toBe("PDF_NOT_READY");

    fetchMock.mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "42" } }));
    const limited = await GET(req(), ctx());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
  });

  it("is a 502 when the API cannot be reached, never a fake 404", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    expect((await GET(req(), ctx())).status).toBe(502);
  });
});
