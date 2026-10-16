import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));

import { GET as listGET } from "./route";
import { GET as detailGET, PATCH as detailPATCH } from "./[id]/route";
import { GET as eventsGET } from "./[id]/events/route";
import { GET as activityGET } from "./activity/route";
import { POST as bulkPOST } from "./bulk/route";
import { POST as notePOST } from "./[id]/notes/route";
import { DELETE as noteDELETE, PUT as notePUT } from "./[id]/notes/[nid]/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const noteCtx = (id: string, nid: string) => ({ params: Promise.resolve({ id, nid }) });
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

describe("GET /api/applications (list v2)", () => {
  it("forwards the whole query string untouched and relays the page", async () => {
    serverApiFetch.mockResolvedValue(json({ items: [], total: 0, page: 0, size: 20, summary: { ALL: 0 } }));
    const res = await listGET(req("GET", "/api/applications?page=0&size=20&status=APPLIED,INTERVIEW&q=acme%20robotics&sort=company,asc"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 0, summary: { ALL: 0 } });
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/applications?page=0&size=20&status=APPLIED,INTERVIEW&q=acme%20robotics&sort=company,asc");
  });

  it("with no query asks for the old plain array", async () => {
    await listGET(req("GET", "/api/applications"));
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/applications");
  });

  it("relays Spring's problem JSON (SORT_INVALID) with its status", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "SORT_INVALID", allowed: ["company"] }, 400));
    const res = await listGET(req("GET", "/api/applications?page=0&sort=nope"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "SORT_INVALID" });
  });

  it("is never cached", async () => {
    const res = await listGET(req("GET", "/api/applications?page=0"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/applications/:id (detail)", () => {
  it("proxies to the detail endpoint", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 7, events: [], notes: [], interviews: [] }));
    const res = await detailGET(req("GET", "/api/applications/7"), idCtx("7"));
    expect(await res.json()).toMatchObject({ id: 7 });
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/applications/7");
  });

  it("refuses a non-numeric id before calling Spring", async () => {
    const res = await detailGET(req("GET", "/api/applications/../x"), idCtx("../x"));
    expect(res.status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("relays the 404 for someone else's application", async () => {
    serverApiFetch.mockResolvedValue(json({ title: "Not Found" }, 404));
    expect((await detailGET(req("GET", "/api/applications/9"), idCtx("9"))).status).toBe(404);
  });
});

describe("GET /api/applications/:id/events (full history)", () => {
  it("proxies to the paged history endpoint with the query untouched", async () => {
    serverApiFetch.mockResolvedValue(json({ items: [], total: 0, page: 1, size: 50 }));
    const res = await eventsGET(req("GET", "/api/applications/7/events?page=1&size=50"), idCtx("7"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/applications/7/events?page=1&size=50");
  });

  it("refuses a non-numeric id before calling Spring, and relays the 404 for someone else's application", async () => {
    expect((await eventsGET(req("GET", "/api/applications/x/events"), idCtx("x"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
    serverApiFetch.mockResolvedValue(json({ title: "Not Found" }, 404));
    expect((await eventsGET(req("GET", "/api/applications/9/events"), idCtx("9"))).status).toBe(404);
  });
});

describe("PATCH /api/applications/:id", () => {
  it("forwards the body and method, and relays the updated application", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 7, status: "IN_REVIEW" }));
    const res = await detailPATCH(req("PATCH", "/api/applications/7", { status: "IN_REVIEW", nextAction: null }), idCtx("7"));
    expect(res.status).toBe(200);
    const [path, init] = serverApiFetch.mock.calls[0]!;
    expect(path).toBe("/api/profile/applications/7");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ status: "IN_REVIEW", nextAction: null });
  });

  it("relays Spring's refusals: SENSITIVE_CONTENT and TRACKER_INVALID keep their code and status", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "SENSITIVE_CONTENT", path: "nextAction", class: "SSN_ITIN" }, 422));
    const res = await detailPATCH(req("PATCH", "/api/applications/7", { nextAction: "123-45-6789" }), idCtx("7"));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "SENSITIVE_CONTENT", class: "SSN_ITIN" });
  });

  it("refuses an empty body and a bad id without calling Spring", async () => {
    expect((await detailPATCH(req("PATCH", "/api/applications/7", ""), idCtx("7"))).status).toBe(400);
    expect((await detailPATCH(req("PATCH", "/api/applications/x", { starred: true }), idCtx("x"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("maps a demo account's write refusal to the friendly 403", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "DEMO_READ_ONLY" }, 403));
    const res = await detailPATCH(req("PATCH", "/api/applications/7", { starred: true }), idCtx("7"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_READ_ONLY" });
  });
});

describe("GET /api/applications/activity", () => {
  it("forwards days and tz", async () => {
    serverApiFetch.mockResolvedValue(json([{ day: "2026-10-12", count: 3 }]));
    const res = await activityGET(req("GET", "/api/applications/activity?days=30&tz=America%2FNew_York"));
    expect(await res.json()).toEqual([{ day: "2026-10-12", count: 3 }]);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/applications/activity?days=30&tz=America%2FNew_York");
  });
});

describe("POST /api/applications/bulk", () => {
  it("forwards {ids, action, status} and relays the per-id result", async () => {
    serverApiFetch.mockResolvedValue(json({ done: [1, 2], failed: [{ id: 3, reason: "NOT_FOUND" }] }));
    const res = await bulkPOST(req("POST", "/api/applications/bulk", { ids: [1, 2, 3], action: "STATUS", status: "WITHDRAWN" }));
    expect(await res.json()).toEqual({ done: [1, 2], failed: [{ id: 3, reason: "NOT_FOUND" }] });
    const [path, init] = serverApiFetch.mock.calls[0]!;
    expect(path).toBe("/api/profile/applications/bulk");
    expect(JSON.parse(init?.body as string)).toEqual({ ids: [1, 2, 3], action: "STATUS", status: "WITHDRAWN" });
  });

  it("relays TRACKER_LIMIT", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "TRACKER_LIMIT", limit: 50 }, 422));
    const res = await bulkPOST(req("POST", "/api/applications/bulk", { ids: [], action: "ARCHIVE" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ limit: 50 });
  });
});

describe("notes", () => {
  it("POST creates (201 relayed) at the right path", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 5, body: "hi" }, 201));
    const res = await notePOST(req("POST", "/api/applications/7/notes", { body: "hi", pinned: true }), idCtx("7"));
    expect(res.status).toBe(201);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/applications/7/notes");
  });

  it("PUT is partial and DELETE is 204 with no body", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ id: 5, pinned: true }));
    const put = await notePUT(req("PUT", "/api/applications/7/notes/5", { pinned: true }), noteCtx("7", "5"));
    expect(put.status).toBe(200);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/applications/7/notes/5");
    expect(serverApiFetch.mock.calls[0]![1]?.method).toBe("PUT");

    serverApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const del = await noteDELETE(req("DELETE", "/api/applications/7/notes/5"), noteCtx("7", "5"));
    expect(del.status).toBe(204);
    expect(serverApiFetch.mock.calls[1]![1]?.method).toBe("DELETE");
  });

  it("refuses bad ids", async () => {
    expect((await notePOST(req("POST", "/api/applications/x/notes", { body: "a" }), idCtx("x"))).status).toBe(400);
    expect((await notePUT(req("PUT", "/api/applications/7/notes/y", { body: "a" }), noteCtx("7", "y"))).status).toBe(400);
    expect((await noteDELETE(req("DELETE", "/api/applications/7/notes/y"), noteCtx("7", "y"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("relays SENSITIVE_CONTENT for a note", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "SENSITIVE_CONTENT", path: "body", class: "SSN_ITIN" }, 422));
    const res = await notePOST(req("POST", "/api/applications/7/notes", { body: "123-45-6789" }), idCtx("7"));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "SENSITIVE_CONTENT" });
  });
});
