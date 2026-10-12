import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));

import { POST as invitePOST } from "./invite/route";
import { POST as resendPOST } from "./[memberId]/resend/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://web.test${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const orgCtx = (orgId: string) => ({ params: Promise.resolve({ orgId }) });
const memberCtx = (orgId: string, memberId: string) => ({ params: Promise.resolve({ orgId, memberId }) });

beforeEach(() => serverApiFetch.mockImplementation(async () => json({ ok: true })));
afterEach(() => serverApiFetch.mockReset());

describe("POST /api/orgs/:orgId/members/invite", () => {
  it("forwards the emails and the role to Spring untouched", async () => {
    const body = { emails: ["a@example.org", "Sam <sam@example.org>"], role: "MEMBER", groupId: 4 };
    const res = await invitePOST(req("POST", "/api/orgs/2/members/invite", body), orgCtx("2"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/2/members/invite");
    expect(JSON.parse(String(serverApiFetch.mock.calls[0]![1]!.body))).toEqual(body);
  });

  it.each([
    [409, { code: "SEAT_STATE", orgStatus: "DRAFT" }],
    [422, { code: "ORG_LIMIT_REACHED", limit: "inviteDaily", max: 1000 }],
    [404, { code: "NOT_FOUND" }],
  ])("relays a %s with its code", async (status, problem) => {
    serverApiFetch.mockResolvedValue(json(problem, status));
    const res = await invitePOST(req("POST", "/api/orgs/2/members/invite", { emails: ["a@example.org"] }), orgCtx("2"));
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject(problem);
  });

  it("refuses a non-numeric org and an empty body before calling Spring", async () => {
    expect((await invitePOST(req("POST", "/api/orgs/x/members/invite", { emails: [] }), orgCtx("x"))).status).toBe(400);
    expect((await invitePOST(req("POST", "/api/orgs/2/members/invite", ""), orgCtx("2"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/orgs/:orgId/members/:memberId/resend", () => {
  it("proxies the resend", async () => {
    await resendPOST(req("POST", "/api/orgs/2/members/9/resend"), memberCtx("2", "9"));
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/2/members/9/resend");
    expect(serverApiFetch.mock.calls[0]![1]!.method).toBe("POST");
  });

  it("refuses ids that are not numbers", async () => {
    expect((await resendPOST(req("POST", "/x"), memberCtx("2", "../9"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
