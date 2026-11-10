import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));

import { GET as rangeGET } from "./route";
import { GET as icsGET } from "./[id]/ics/route";
import { POST as createPOST } from "../applications/[id]/interviews/route";
import { DELETE as itemDELETE, PUT as itemPUT } from "../applications/[id]/interviews/[iid]/route";
import { POST as outcomePOST } from "../applications/[id]/interviews/[iid]/outcome/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const itemCtx = (id: string, iid: string) => ({ params: Promise.resolve({ id, iid }) });
const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://web.test${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  serverApiFetch.mockResolvedValue(json({ ok: true }));
});
afterEach(() => {
  serverApiFetch.mockReset();
});

describe("GET /api/interviews", () => {
  it("forwards the range query untouched", async () => {
    serverApiFetch.mockResolvedValue(json([{ id: 1, company: "Acme" }]));
    const res = await rangeGET(req("GET", "/api/interviews?from=2026-10-01&to=2026-10-31&outcome=PENDING"));
    expect(await res.json()).toEqual([{ id: 1, company: "Acme" }]);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/interviews?from=2026-10-01&to=2026-10-31&outcome=PENDING");
  });

  it("relays a bad range as the 422 it is", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "TRACKER_INVALID", path: "to" }, 422));
    expect((await rangeGET(req("GET", "/api/interviews?from=2026-12-10&to=2026-12-01"))).status).toBe(422);
  });
});

describe("GET /api/interviews/:id/ics", () => {
  it("serves the calendar as a named attachment", async () => {
    serverApiFetch.mockResolvedValue(new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", { status: 200, headers: { "content-type": "text/calendar;charset=UTF-8" } }));
    const res = await icsGET(req("GET", "/api/interviews/12/ics"), idCtx("12"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="interview-12.ics"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/interviews/12/ics");
  });

  it("relays the 404 for someone else's interview without a calendar header", async () => {
    serverApiFetch.mockResolvedValue(json({ title: "Not Found" }, 404));
    const res = await icsGET(req("GET", "/api/interviews/9/ics"), idCtx("9"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("refuses a non-numeric id before calling Spring", async () => {
    expect((await icsGET(req("GET", "/api/interviews/x/ics"), idCtx("x"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("interviews of one application", () => {
  it("POST logs one (201 relayed, body forwarded)", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 5, kind: "VIDEO" }, 201));
    const res = await createPOST(req("POST", "/api/applications/3/interviews", { kind: "VIDEO", startsAt: "2026-10-10T14:00:00Z" }), idCtx("3"));
    expect(res.status).toBe(201);
    const [path, init] = serverApiFetch.mock.calls[0]!;
    expect(path).toBe("/api/profile/applications/3/interviews");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ kind: "VIDEO", startsAt: "2026-10-10T14:00:00Z" });
  });

  it("PUT is partial and DELETE is 204", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ id: 5, location: "Room 4" }));
    await itemPUT(req("PUT", "/api/applications/3/interviews/5", { location: "Room 4", endsAt: null }), itemCtx("3", "5"));
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/applications/3/interviews/5");
    expect(JSON.parse(serverApiFetch.mock.calls[0]![1]?.body as string)).toEqual({ location: "Room 4", endsAt: null });

    serverApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await itemDELETE(req("DELETE", "/api/applications/3/interviews/5"), itemCtx("3", "5"))).status).toBe(204);
    expect(serverApiFetch.mock.calls[1]![1]?.method).toBe("DELETE");
  });

  it("POST outcome", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 5, outcome: "PASSED" }));
    const res = await outcomePOST(req("POST", "/api/applications/3/interviews/5/outcome", { outcome: "PASSED" }), itemCtx("3", "5"));
    expect(await res.json()).toEqual({ id: 5, outcome: "PASSED" });
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/applications/3/interviews/5/outcome");
  });

  it("relays SENSITIVE_CONTENT and TRACKER_LIMIT with their status and code", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ code: "SENSITIVE_CONTENT", path: "notes", class: "SSN_ITIN" }, 422));
    const a = await createPOST(req("POST", "/api/applications/3/interviews", { kind: "VIDEO", startsAt: "2026-10-10T14:00:00Z", notes: "123-45-6789" }), idCtx("3"));
    expect(a.status).toBe(422);
    expect(await a.json()).toMatchObject({ code: "SENSITIVE_CONTENT", path: "notes" });
    serverApiFetch.mockResolvedValueOnce(json({ code: "TRACKER_LIMIT", limit: 30 }, 422));
    expect(await (await createPOST(req("POST", "/api/applications/3/interviews", { kind: "VIDEO", startsAt: "2026-10-10T14:00:00Z" }), idCtx("3"))).json()).toMatchObject({ limit: 30 });
  });

  it("refuses bad ids and empty bodies without calling Spring", async () => {
    expect((await createPOST(req("POST", "/api/applications/x/interviews", { kind: "VIDEO" }), idCtx("x"))).status).toBe(400);
    expect((await createPOST(req("POST", "/api/applications/3/interviews", ""), idCtx("3"))).status).toBe(400);
    expect((await itemPUT(req("PUT", "/api/applications/3/interviews/y", { notes: "a" }), itemCtx("3", "y"))).status).toBe(400);
    expect((await itemDELETE(req("DELETE", "/api/applications/3/interviews/y"), itemCtx("3", "y"))).status).toBe(400);
    expect((await outcomePOST(req("POST", "/api/applications/3/interviews/y/outcome", { outcome: "PASSED" }), itemCtx("3", "y"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
