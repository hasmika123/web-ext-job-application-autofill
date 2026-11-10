import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { POST as createPOST } from "./route";
import { GET as statusGET } from "./status/route";
import { GET as sessionGET } from "./[sessionId]/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ctx = (orgId: string, sessionId?: string) => ({ params: Promise.resolve({ orgId, sessionId: sessionId as string }) });
const req = (method: string, body?: unknown) =>
  new Request("http://web.test/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => serverApiFetch.mockResolvedValue(json({ ok: true })));
afterEach(() => serverApiFetch.mockReset());

describe("consultant/prepare BFF (forwards to con/prepare)", () => {
  it("forwards the plan with only the ids", async () => {
    const res = await createPOST(req("POST", { matchIds: [3, 4] }), ctx("2"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/2/con/prepare");
    expect(serverApiFetch.mock.calls[0]![1]?.method).toBe("POST");
    expect(JSON.parse(String(serverApiFetch.mock.calls[0]![1]?.body))).toEqual({ matchIds: [3, 4] });
  });

  it("refuses a body that is not a short list of ids, before the API sees it", async () => {
    for (const bad of [{}, { matchIds: [] }, { matchIds: ["1"] }, { matchIds: [0] }, { matchIds: [1.5] }, { matchIds: Array.from({ length: 51 }, (_, i) => i + 1) }, { matchIds: [1], consultantId: 9 }, "[1]", "not json"]) {
      expect((await createPOST(req("POST", bad), ctx("2"))).status, JSON.stringify(bad)).toBe(400);
    }
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("reads the status and one session", async () => {
    await statusGET(req("GET"), ctx("2"));
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/2/con/prepare/status");
    await sessionGET(req("GET"), ctx("2", "31"));
    expect(serverApiFetch.mock.calls[1]![0]).toBe("/api/orgs/2/con/prepare/31");
  });

  it("a non-numeric org or session is a 404 without calling the API", async () => {
    expect((await statusGET(req("GET"), ctx("abc"))).status).toBe(404);
    expect((await sessionGET(req("GET"), ctx("2", "../7"))).status).toBe(404);
    expect((await createPOST(req("POST", { matchIds: [1] }), ctx("x"))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("relays the API's cap refusal with its code and a network failure as 502", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "PREPARE_CAP_REACHED", message: "Over.", remainingToday: 1, remainingMonth: 2 }, 409));
    const cap = await createPOST(req("POST", { matchIds: [1, 2] }), ctx("2"));
    expect(cap.status).toBe(409);
    expect(await cap.json()).toMatchObject({ code: "PREPARE_CAP_REACHED", remainingToday: 1, remainingMonth: 2, error: "Over." });
    serverApiFetch.mockRejectedValue(new Error("down"));
    expect((await statusGET(req("GET"), ctx("2"))).status).toBe(502);
  });
});
