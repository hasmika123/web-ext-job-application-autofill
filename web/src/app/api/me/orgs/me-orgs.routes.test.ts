import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));

import { GET as listGET } from "./route";
import { PUT as sharePUT } from "./[orgId]/share/route";
import { POST as leavePOST } from "./[orgId]/leave/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ctx = (orgId: string) => ({ params: Promise.resolve({ orgId }) });
const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://web.test${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => serverApiFetch.mockImplementation(async () => json({ ok: true })));
afterEach(() => serverApiFetch.mockReset());

describe("GET /api/me/orgs", () => {
  it("proxies to the member's own list and is never cached", async () => {
    serverApiFetch.mockResolvedValue(json([{ org: { id: 1, name: "Acme" }, scope: "SUMMARY" }]));
    const res = await listGET();
    expect(await res.json()).toEqual([{ org: { id: 1, name: "Acme" }, scope: "SUMMARY" }]);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/me/orgs");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("PUT /api/me/orgs/:orgId/share", () => {
  it("forwards the member's choice and the consent version untouched", async () => {
    const body = { scope: "NONE", consentVersion: "org-share/v1" };
    const res = await sharePUT(req("PUT", "/api/me/orgs/7/share", body), ctx("7"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/me/orgs/7/share");
    expect(serverApiFetch.mock.calls[0]![1]!.method).toBe("PUT");
    expect(JSON.parse(String(serverApiFetch.mock.calls[0]![1]!.body))).toEqual(body);
  });

  it("relays a refusal with its code (FULL needs a named person)", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "ORG_INVALID", field: "fullToMemberId" }, 422));
    const res = await sharePUT(req("PUT", "/api/me/orgs/7/share", { scope: "FULL", consentVersion: "org-share/v1" }), ctx("7"));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "ORG_INVALID", field: "fullToMemberId" });
  });

  it("answers 404 from Spring for an org the caller is not in, without any hint", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "NOT_FOUND" }, 404));
    const res = await sharePUT(req("PUT", "/api/me/orgs/9/share", { scope: "NONE", consentVersion: "org-share/v1" }), ctx("9"));
    expect(res.status).toBe(404);
  });

  it("refuses a non-numeric org id and an empty body before calling Spring", async () => {
    expect((await sharePUT(req("PUT", "/api/me/orgs/x/share", { scope: "NONE" }), ctx("x"))).status).toBe(400);
    expect((await sharePUT(req("PUT", "/api/me/orgs/7/share", ""), ctx("7"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/me/orgs/:orgId/leave", () => {
  it("proxies the leave and relays the 204", async () => {
    serverApiFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await leavePOST(req("POST", "/api/me/orgs/7/leave"), ctx("7"));
    expect(res.status).toBe(204);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/me/orgs/7/leave");
    expect(serverApiFetch.mock.calls[0]![1]!.method).toBe("POST");
  });

  it("relays OWNER_MUST_TRANSFER", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "OWNER_MUST_TRANSFER" }, 409));
    const res = await leavePOST(req("POST", "/api/me/orgs/7/leave"), ctx("7"));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "OWNER_MUST_TRANSFER" });
  });

  it("refuses a non-numeric org id", async () => {
    expect((await leavePOST(req("POST", "/api/me/orgs/../leave"), ctx("../"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
