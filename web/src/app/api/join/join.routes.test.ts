import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));

import { GET as previewGET } from "./[token]/route";
import { POST as acceptPOST } from "./[token]/accept/route";
import { GET as codePreviewGET, POST as codePOST } from "./code/[code]/route";

const TOKEN = "Ab3".repeat(10) + "xy";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://web.test${url}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) });
const codeCtx = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => serverApiFetch.mockImplementation(async () => json({ ok: true })));
afterEach(() => serverApiFetch.mockReset());

describe("GET /api/join/:token (public preview)", () => {
  it("proxies the preview and forwards the visitor's address so Spring rate limits the person", async () => {
    serverApiFetch.mockResolvedValue(json({ orgName: "Acme" }));
    const res = await previewGET(req("GET", `/api/join/${TOKEN}`, undefined, { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "TestAgent/1" }), tokenCtx(TOKEN));
    expect(await res.json()).toEqual({ orgName: "Acme" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(serverApiFetch.mock.calls[0]![0]).toBe(`/api/join/${TOKEN}`);
    const headers = new Headers(serverApiFetch.mock.calls[0]![1]!.headers);
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(headers.get("user-agent")).toBe("TestAgent/1");
  });

  it("refuses anything that cannot be a token before calling Spring", async () => {
    for (const bad of ["short", "a".repeat(33), "../etc/passwd", "a".repeat(31) + "-"]) {
      expect((await previewGET(req("GET", "/api/join/x"), tokenCtx(bad))).status).toBe(400);
    }
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("relays the generic 404 and the expiry 409 with its reason", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ code: "NOT_FOUND" }, 404));
    expect((await previewGET(req("GET", `/api/join/${TOKEN}`), tokenCtx(TOKEN))).status).toBe(404);
    serverApiFetch.mockResolvedValueOnce(json({ code: "INVITE_EXPIRED", reason: "expired", orgName: "Acme" }, 409));
    const res = await previewGET(req("GET", `/api/join/${TOKEN}`), tokenCtx(TOKEN));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "INVITE_EXPIRED", reason: "expired" });
  });
});

describe("POST /api/join/:token/accept", () => {
  it("forwards the choice and the consent version", async () => {
    const body = { shareScope: "SUMMARY", consentVersion: "org-share/v1" };
    await acceptPOST(req("POST", `/api/join/${TOKEN}/accept`, body), tokenCtx(TOKEN));
    expect(serverApiFetch.mock.calls[0]![0]).toBe(`/api/join/${TOKEN}/accept`);
    expect(serverApiFetch.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(String(serverApiFetch.mock.calls[0]![1]!.body))).toEqual(body);
  });

  it("relays ALREADY_MEMBER and SEAT_STATE as they are", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ code: "ALREADY_MEMBER" }, 409));
    const a = await acceptPOST(req("POST", `/api/join/${TOKEN}/accept`, { shareScope: "NONE", consentVersion: "org-share/v1" }), tokenCtx(TOKEN));
    expect(a.status).toBe(409);
    expect(await a.json()).toMatchObject({ code: "ALREADY_MEMBER" });
    serverApiFetch.mockResolvedValueOnce(json({ code: "SEAT_STATE", orgStatus: "DRAFT" }, 409));
    expect(await (await acceptPOST(req("POST", `/api/join/${TOKEN}/accept`, { shareScope: "NONE", consentVersion: "org-share/v1" }), tokenCtx(TOKEN))).json()).toMatchObject({ code: "SEAT_STATE" });
  });

  it("refuses a bad token and an empty body before calling Spring", async () => {
    expect((await acceptPOST(req("POST", "/api/join/x/accept", { shareScope: "NONE" }), tokenCtx("nope"))).status).toBe(400);
    expect((await acceptPOST(req("POST", `/api/join/${TOKEN}/accept`, ""), tokenCtx(TOKEN))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("/api/join/code/:code", () => {
  it("previews and joins through the code routes", async () => {
    await codePreviewGET(req("GET", "/api/join/code/KIWI7F3A"), codeCtx("KIWI7F3A"));
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/join/code/KIWI7F3A");
    await codePOST(req("POST", "/api/join/code/KIWI7F3A", { shareScope: "NONE", consentVersion: "org-share/v1" }), codeCtx("KIWI7F3A"));
    expect(serverApiFetch.mock.calls[1]![0]).toBe("/api/join/code/KIWI7F3A");
    expect(serverApiFetch.mock.calls[1]![1]!.method).toBe("POST");
  });

  it("refuses a code that cannot be one", async () => {
    expect((await codePreviewGET(req("GET", "/api/join/code/x"), codeCtx("a/../b"))).status).toBe(400);
    expect((await codePOST(req("POST", "/api/join/code/x", { a: 1 }), codeCtx("x"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
