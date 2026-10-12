import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string) => Promise<Response>>();
const getAccessToken = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string) => serverApiFetch(path) }));
vi.mock("@/lib/auth", () => ({ getAccessToken: () => getAccessToken() }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));
// The PDF half of the route is not under test (and playwright-core is heavy): stub its module.
vi.mock("@/lib/pdf", () => ({
  PdfBusyError: class extends Error {},
  PdfTimeoutError: class extends Error {},
  PdfUnavailableError: class extends Error {},
  exportResumePdf: vi.fn(),
}));

import { GET } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (qs: string, ip = "10.0.0.1") =>
  new Request(`http://web.test/api/resumes/42/export${qs}`, { headers: { "x-forwarded-for": ip } });

const docJson = (label: string) =>
  new Response(JSON.stringify({ label }), { status: 200, headers: { "content-type": "application/json" } });
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

beforeEach(() => {
  getAccessToken.mockResolvedValue("tok");
  serverApiFetch.mockImplementation(async (path) => (path.endsWith("/doc/text") ? text("PRIYA SHARMA\nEngineer") : docJson("Backend SWE")));
});
afterEach(() => {
  serverApiFetch.mockReset();
  getAccessToken.mockReset();
});

describe("GET /api/resumes/:id/export?format=txt", () => {
  it("proxies the plain-text document as a named download", async () => {
    const res = await GET(req("?format=txt", "10.0.1.1"), ctx("42"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Backend-SWE.txt"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("PRIYA SHARMA\nEngineer");
    expect(serverApiFetch).toHaveBeenCalledWith("/api/profile/resumes/42/doc/text");
  });

  it("falls back to resume-<id>.txt when the label is not available", async () => {
    serverApiFetch.mockImplementation(async (path) => (path.endsWith("/doc/text") ? text("x") : new Response("{}", { status: 500 })));
    const res = await GET(req("?format=txt", "10.0.1.2"), ctx("42"));
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="resume-42.txt"');
  });

  it("rejects an unsupported format and a bad id", async () => {
    expect((await GET(req("?format=docx", "10.0.1.3"), ctx("42"))).status).toBe(400);
    expect((await GET(req("", "10.0.1.4"), ctx("42"))).status).toBe(400);
    expect((await GET(req("?format=txt", "10.0.1.5"), ctx("abc"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("is 401 when signed out", async () => {
    getAccessToken.mockResolvedValue(null);
    expect((await GET(req("?format=txt", "10.0.1.6"), ctx("42"))).status).toBe(401);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("relays Spring's 404 for someone else's resume", async () => {
    serverApiFetch.mockImplementation(async (path) => (path.endsWith("/doc/text") ? text("", 404) : new Response("{}", { status: 404 })));
    const res = await GET(req("?format=txt", "10.0.1.7"), ctx("42"));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain("no longer there");
  });

  it("is 502 when Spring cannot be reached", async () => {
    serverApiFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await GET(req("?format=txt", "10.0.1.8"), ctx("42"))).status).toBe(502);
  });
});
