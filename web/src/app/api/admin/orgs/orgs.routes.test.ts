import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ serverApiFetch }));

import { GET as list, POST as create } from "./route";
import { GET as summary } from "./summary/route";
import { GET as labelCheck } from "./label-check/route";
import { GET as detail } from "./[id]/route";
import { POST as provision } from "./[id]/hostnames/subdomain/route";
import { POST as enterprise } from "./[id]/enterprise/route";
import { POST as moduleSwitch } from "./[id]/modules/route";
import { POST as hostAction } from "./[id]/hostnames/[hid]/[action]/route";
import { POST as resetOwner } from "./[id]/owner/reset-password/route";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const post = (url: string, body: unknown) => new Request(`http://localhost:3200${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => serverApiFetch.mockReset());

describe("GET /api/admin/orgs", () => {
  it("translates the list contract to the API query and wraps the page", async () => {
    serverApiFetch.mockResolvedValue(json([{ id: 1, name: "Acme" }], 200, { "x-total-count": "41" }));
    const res = await list(new Request("http://localhost:3200/api/admin/orgs?q=%20acme%20&status=ACTIVE&type=STAFFING&enterprise=true&page=2&size=10&evil=1"));
    expect(await res.json()).toEqual({ items: [{ id: 1, name: "Acme" }], total: 41, page: 2, size: 10 });
    const path = serverApiFetch.mock.calls[0][0] as string;
    expect(path).toBe("/api/admin/orgs?page=2&size=10&search=acme&status=ACTIVE&type=STAFFING&enterprise=true");
  });

  it("caps the page size and passes a refusal through in the admin shape", async () => {
    serverApiFetch.mockResolvedValue(json({ detail: "Forbidden", code: "X" }, 403));
    const res = await list(new Request("http://localhost:3200/api/admin/orgs?size=9999"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "X", error: "Forbidden" });
    expect(serverApiFetch.mock.calls[0][0]).toContain("size=100");
  });

  it("answers 502 when the API is unreachable", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await list(new Request("http://localhost:3200/api/admin/orgs"))).status).toBe(502);
  });
});

describe("the other reads", () => {
  it("forwards summary, detail and the label check (label capped, orgId digits only)", async () => {
    serverApiFetch.mockResolvedValue(json({ ok: true }));
    await summary();
    await detail(new Request("http://x"), ctx({ id: "7" }));
    await labelCheck(new Request(`http://localhost:3200/api/admin/orgs/label-check?label=${"a".repeat(200)}&orgId=7;drop`));
    await labelCheck(new Request("http://localhost:3200/api/admin/orgs/label-check?label=acme&orgId=12"));
    expect(serverApiFetch.mock.calls.map((c) => c[0])).toEqual(["/api/admin/orgs/summary", "/api/admin/orgs/7", `/api/admin/orgs/label-check?label=${"a".repeat(80)}`, "/api/admin/orgs/label-check?label=acme&orgId=12"]);
  });

  it("refuses a non-numeric id before calling the API", async () => {
    expect((await detail(new Request("http://x"), ctx({ id: "7/../x" }))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("mutations", () => {
  it("create forwards only known fields, and its answer (a one-time password) is never cacheable", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 5, tempPassword: "Abc" }, 201));
    const res = await create(post("/api/admin/orgs", { name: "Acme", label: "acme", type: "STAFFING", ownerEmail: "o@example.test", ownerName: "Olivia" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await create(post("/api/admin/orgs", { name: "x", admin: true }))).status).toBe(400);
  });

  it("provision, enterprise and owner reset forward their bodies; unknown fields are 400", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 7 }));
    await provision(post("/x", { label: "acme" }), ctx({ id: "7" }));
    await enterprise(post("/x", { on: true, reason: "Order form signed" }), ctx({ id: "7" }));
    const reset = await resetOwner(post("/x", { reason: "Owner lost the first password" }), ctx({ id: "7" }));
    expect(reset.headers.get("cache-control")).toBe("no-store");
    expect(serverApiFetch.mock.calls.map((c) => [c[0], (c[1] as RequestInit).body])).toEqual([
      ["/api/admin/orgs/7/hostnames/subdomain", '{"label":"acme"}'],
      ["/api/admin/orgs/7/enterprise", '{"on":true,"reason":"Order form signed"}'],
      ["/api/admin/orgs/7/owner/reset-password", '{"reason":"Owner lost the first password"}'],
    ]);
    expect((await provision(post("/x", { label: "a", extra: 1 }), ctx({ id: "7" }))).status).toBe(400);
  });

  it("the module switch forwards key, on and reason only", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 7 }));
    await moduleSwitch(post("/x", { key: "roles", on: true, reason: "Part of the pilot scope" }), ctx({ id: "7" }));
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/orgs/7/modules");
    expect((await moduleSwitch(post("/x", { key: "roles", flag: "flag.enterprise" }), ctx({ id: "7" }))).status).toBe(400);
    expect((await moduleSwitch(post("/x", { key: "roles" }), ctx({ id: "x" }))).status).toBe(404);
  });

  it("hostname actions accept only suspend and resume on numeric ids", async () => {
    serverApiFetch.mockResolvedValue(json({ id: 7 }));
    expect((await hostAction(post("/x", { reason: "Payment dispute review" }), ctx({ id: "7", hid: "3", action: "suspend" }))).status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/orgs/7/hostnames/3/suspend");
    expect((await hostAction(post("/x", { reason: "x" }), ctx({ id: "7", hid: "3", action: "delete" }))).status).toBe(404);
    expect((await hostAction(post("/x", { reason: "x" }), ctx({ id: "7", hid: "3x", action: "resume" }))).status).toBe(404);
    expect(serverApiFetch).toHaveBeenCalledTimes(1);
  });

  it("carries the API's machine code and extras (SLUG_TAKEN + suggestion) to the page", async () => {
    serverApiFetch.mockResolvedValue(json({ detail: "The address is taken", code: "SLUG_TAKEN", suggestion: "acme-2", status: 409 }, 409));
    const res = await provision(post("/x", { label: "acme" }), ctx({ id: "7" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "SLUG_TAKEN", suggestion: "acme-2", error: "The address is taken" });
  });
});
