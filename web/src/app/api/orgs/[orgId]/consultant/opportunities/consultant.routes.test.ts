import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { GET as listGET } from "./route";
import { GET as oneGET } from "./[id]/route";
import { POST as viewedPOST } from "./[id]/viewed/route";
import { POST as interestPOST } from "./[id]/interest/route";
import { POST as declinePOST } from "./[id]/decline/route";
import { POST as askPOST } from "./[id]/request-info/route";
import { POST as appliedPOST } from "./[id]/applied/route";
import { POST as linkPOST } from "./[id]/link/route";
import { POST as unlinkPOST } from "./[id]/unlink/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ctx = (orgId: string, id?: string) => ({ params: Promise.resolve({ orgId, id: id as string }) });
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://web.test${url}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => serverApiFetch.mockResolvedValue(json({ ok: true })));
afterEach(() => serverApiFetch.mockReset());

describe("GET consultant/opportunities (forwards to con/)", () => {
  it("forwards the query string to the con namespace (never the mkt one)", async () => {
    serverApiFetch.mockResolvedValue(json({ items: [], total: 0 }));
    const res = await listGET(req("GET", "/api/orgs/2/consultant/opportunities?state=APPLIED&page=0&size=100"), ctx("2"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/2/con/opportunities?state=APPLIED&page=0&size=100");
  });
  it("one opportunity", async () => {
    await oneGET(req("GET", "/api/orgs/2/consultant/opportunities/7"), ctx("2", "7"));
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/2/con/opportunities/7");
  });
  it("a non-numeric org or id is a 404 without calling the API", async () => {
    expect((await listGET(req("GET", "/x"), ctx("abc"))).status).toBe(404);
    expect((await oneGET(req("GET", "/x"), ctx("2", "../7"))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
  it("relays the API's 404 and a network failure as 502", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ detail: "Not found" }, 404));
    expect((await oneGET(req("GET", "/x"), ctx("2", "9"))).status).toBe(404);
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await oneGET(req("GET", "/x"), ctx("2", "9"))).status).toBe(502);
  });
});

describe("POST actions", () => {
  const cases: [string, typeof viewedPOST, string, Record<string, unknown>][] = [
    ["viewed", viewedPOST, "viewed", {}],
    ["interest", interestPOST, "interest", {}],
    ["decline", declinePOST, "decline", { reason: "RATE", note: "too low" }],
    ["request-info", askPOST, "request-info", { question: "Remote?" }],
    ["applied", appliedPOST, "applied", { applicationId: 5 }],
    ["link", linkPOST, "link", { applicationId: 5 }],
    ["unlink", unlinkPOST, "unlink", {}],
  ];
  for (const [name, handler, path, body] of cases) {
    it(`${name} forwards to /con/opportunities/{id}/${path} with the body and both headers`, async () => {
      const res = await handler(req("POST", `/api/orgs/2/consultant/opportunities/7/${path}`, body, { "idempotency-key": "k-1", "if-match": "3" }), ctx("2", "7"));
      expect(res.status).toBe(200);
      const [url, init] = serverApiFetch.mock.calls[0]!;
      expect(url).toBe(`/api/orgs/2/con/opportunities/7/${path}`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual(body);
      const h = new Headers(init?.headers);
      expect(h.get("idempotency-key")).toBe("k-1");
      expect(h.get("if-match")).toBe("3");
    });
  }
  it("does not invent headers the page did not send", async () => {
    await interestPOST(req("POST", "/x", {}), ctx("2", "7"));
    const h = new Headers(serverApiFetch.mock.calls[0]![1]?.headers);
    expect(h.get("idempotency-key")).toBeNull();
    expect(h.get("if-match")).toBeNull();
  });
  it("rejects unknown fields (no state, no consultantId: the API owns who the consultant is) and non-objects", async () => {
    expect((await interestPOST(req("POST", "/x", { consultantId: 9 }), ctx("2", "7"))).status).toBe(400);
    expect((await appliedPOST(req("POST", "/x", { state: "APPLIED" }), ctx("2", "7"))).status).toBe(400);
    expect((await declinePOST(req("POST", "/x", "[1]"), ctx("2", "7"))).status).toBe(400);
    expect((await declinePOST(req("POST", "/x", "not json"), ctx("2", "7"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
  it("a bad id is a 404", async () => {
    expect((await viewedPOST(req("POST", "/x", {}), ctx("2", "x1"))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
  it("relays 409 VERSION_CONFLICT and 422 SENSITIVE_CONTENT with their codes", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ code: "VERSION_CONFLICT", detail: "Changed" }, 409));
    const a = await interestPOST(req("POST", "/x", {}), ctx("2", "7"));
    expect(a.status).toBe(409);
    expect(await a.json()).toMatchObject({ code: "VERSION_CONFLICT", error: "Changed" });
    serverApiFetch.mockResolvedValueOnce(json({ code: "SENSITIVE_CONTENT", detail: "Remove it" }, 422));
    const b = await askPOST(req("POST", "/x", { question: "x" }), ctx("2", "7"));
    expect(b.status).toBe(422);
    expect(await b.json()).toMatchObject({ code: "SENSITIVE_CONTENT" });
  });
});
