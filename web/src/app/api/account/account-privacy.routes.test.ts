import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
const clearAuthCookies = vi.fn(async () => {});
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/auth", () => ({ clearAuthCookies: () => clearAuthCookies() }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => p }));

import * as deletion from "./deletion-request/route";
import * as exportsRoute from "./exports/route";
import * as oneExport from "./exports/[id]/route";
import * as exportFile from "./exports/[id]/file/route";
import * as terms from "./terms-acceptance/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

afterEach(() => {
  serverApiFetch.mockReset();
  clearAuthCookies.mockClear();
});

describe("/api/account/deletion-request", () => {
  it("GET proxies the status and never lets the browser cache it", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ status: "PENDING", canUndo: true, graceHours: 24 }));
    const res = await deletion.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "PENDING", canUndo: true });
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/account/deletion-request");
  });

  it("an enterprise account's 404 passes straight through (the panel hides its controls)", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ title: "Not found" }, 404));
    expect((await deletion.GET()).status).toBe(404);
    serverApiFetch.mockResolvedValueOnce(json({ title: "Not found" }, 404));
    expect((await deletion.POST()).status).toBe(404);
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it("POST schedules the erasure and leaves the session alone while the undo window runs", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ status: "PENDING", graceHours: 24, canUndo: true }, 202));
    const res = await deletion.POST();
    expect(res.status).toBe(202);
    expect(serverApiFetch.mock.calls[0][1]?.method).toBe("POST");
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it("POST with a zero-hour window erases at once, so the dead session cookies are cleared too", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ status: "DELETED", graceHours: 0, canUndo: false }));
    const res = await deletion.POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "DELETED" });
    expect(clearAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("DELETE withdraws the request", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ status: "NONE", canUndo: false, graceHours: 24 }));
    const res = await deletion.DELETE();
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("answers 502 when Spring is down, relays a 401, and turns a demo refusal into the friendly 403", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await deletion.POST()).status).toBe(502);
    serverApiFetch.mockResolvedValueOnce(json({ title: "Unauthorized" }, 401));
    expect((await deletion.GET()).status).toBe(401);
    serverApiFetch.mockResolvedValueOnce(json({ code: "DEMO_READ_ONLY" }, 403));
    const demo = await deletion.POST();
    expect(demo.status).toBe(403);
    expect(demo.headers.get("x-demo-read-only")).toBe("1");
  });
});

describe("/api/account/exports", () => {
  it("GET lists my export jobs", async () => {
    serverApiFetch.mockResolvedValueOnce(json([{ id: 3, status: "READY", downloadPath: "/api/account/exports/3/file?exp=1&sig=a" }]));
    const res = await exportsRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json())[0].id).toBe(3);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/account/exports");
  });

  it("POST queues an export and relays the daily-limit 429", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ id: 4, status: "QUEUED" }, 202));
    const ok = await exportsRoute.POST();
    expect(ok.status).toBe(202);
    expect(serverApiFetch.mock.calls[0][1]?.method).toBe("POST");
    serverApiFetch.mockResolvedValueOnce(json({ detail: "Too many exports requested today" }, 429));
    expect((await exportsRoute.POST()).status).toBe(429);
  });

  it("GET /:id proxies one job and refuses a non-numeric id without calling Spring", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ id: 7, status: "RUNNING" }));
    const res = await oneExport.GET(new Request("http://web.test/api/account/exports/7"), ctx("7"));
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/account/exports/7");
    serverApiFetch.mockClear();
    expect((await oneExport.GET(new Request("http://web.test/x"), ctx("7/../../admin"))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("someone else's job is Spring's generic 404, passed through", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ title: "Not found" }, 404));
    expect((await oneExport.GET(new Request("http://web.test/x"), ctx("99"))).status).toBe(404);
  });
});

describe("/api/account/exports/:id/file", () => {
  const get = (qs: string, id = "7") => exportFile.GET(new Request(`http://web.test/api/account/exports/${id}/file${qs}`), ctx(id));

  it("streams the ZIP through with its type, file name and length, and forbids caching", async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
    serverApiFetch.mockResolvedValueOnce(
      new Response(bytes, { status: 200, headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="kiwiply-export-7.zip"', "content-length": "7" } }),
    );
    const res = await get("?exp=1790000000&sig=abc_-DEF");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("kiwiply-export-7.zip");
    expect(res.headers.get("content-length")).toBe("7");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/account/exports/7/file?exp=1790000000&sig=abc_-DEF");
  });

  it("forwards only exp and sig, and refuses anything else shaped like an attack", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response("zip", { status: 200 }));
    await get("?exp=1790000000&sig=abc&extra=1");
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/account/exports/7/file?exp=1790000000&sig=abc");
    serverApiFetch.mockClear();
    expect((await get("?exp=abc&sig=x")).status).toBe(400);
    expect((await get("?exp=1&sig=a/b")).status).toBe(400);
    expect((await get("", "x")).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("an expired export is 410, a bad link or someone else's job is 404, a lapsed session is 401", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ title: "Gone" }, 410));
    expect((await get("?exp=1&sig=a")).status).toBe(410);
    serverApiFetch.mockResolvedValueOnce(json({ title: "Not found" }, 404));
    expect((await get("?exp=1&sig=a")).status).toBe(404);
    serverApiFetch.mockResolvedValueOnce(json({ title: "Unauthorized" }, 401));
    expect((await get("?exp=1&sig=a")).status).toBe(401);
  });

  it("answers 502 when Spring is down or fails", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await get("?exp=1&sig=a")).status).toBe(502);
    serverApiFetch.mockResolvedValueOnce(json({ title: "boom" }, 500));
    expect((await get("?exp=1&sig=a")).status).toBe(502);
  });
});

describe("/api/account/terms-acceptance", () => {
  const post = (body: unknown) =>
    terms.POST(new Request("http://web.test/api/account/terms-acceptance", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } }));

  it("GET proxies which versions are in force and which I accepted", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ terms: { current: "2026-10", accepted: null } }));
    const res = await terms.GET();
    expect(res.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/account/terms-acceptance");
  });

  it("POST forwards only document, version and source", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ ok: true }, 201));
    const res = await post({ document: "TERMS", version: "2026-10", source: "settings", userId: 5, orgId: 9 });
    expect(res.status).toBe(201);
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/account/terms-acceptance");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ document: "TERMS", version: "2026-10", source: "settings" });
  });

  it("POST validates before calling Spring", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ document: "COOKIES", version: "1" })).status).toBe(400);
    expect((await post({ document: "TERMS" })).status).toBe(400);
    expect((await post({ document: "PRIVACY", version: "1", source: 5 })).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("relays Spring's refusal of a version that is not the one in force", async () => {
    serverApiFetch.mockResolvedValueOnce(json({ detail: "That is not the version in force" }, 409));
    expect((await post({ document: "TERMS", version: "2020-01" })).status).toBe(409);
  });
});
