import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ serverApiFetch }));

import { GET as list } from "./orgs/[orgId]/policies/route";
import { GET as one } from "./orgs/[orgId]/policies/[kind]/route";
import { PUT as draft } from "./orgs/[orgId]/policies/[kind]/draft/route";
import { POST as template } from "./orgs/[orgId]/policies/[kind]/template/route";
import { POST as submit } from "./orgs/[orgId]/policies/[kind]/submit/route";
import { POST as withdraw } from "./orgs/[orgId]/policies/[kind]/withdraw/route";
import { GET as queue } from "./admin/org-policies/route";
import { GET as review } from "./admin/org-policies/[id]/route";
import { POST as approve } from "./admin/org-policies/[id]/approve/route";
import { POST as requestChanges } from "./admin/org-policies/[id]/request-changes/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3200/x", { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => serverApiFetch.mockReset());

describe("org policy BFF routes", () => {
  it("forward to the org API with the kind encoded", async () => {
    serverApiFetch.mockResolvedValue(json({ ok: true }));
    await list(req("GET"), ctx({ orgId: "7" }));
    await one(req("GET"), ctx({ orgId: "7", kind: "ACCEPTABLE_USE" }));
    await template(req("POST"), ctx({ orgId: "7", kind: "PRIVACY" }));
    await submit(req("POST"), ctx({ orgId: "7", kind: "PRIVACY" }));
    await withdraw(req("POST"), ctx({ orgId: "7", kind: "PRIVACY" }));
    expect(serverApiFetch.mock.calls.map((c) => [c[0], c[1]?.method ?? "GET"])).toEqual([
      ["/api/orgs/7/policies", "GET"],
      ["/api/orgs/7/policies/ACCEPTABLE_USE", "GET"],
      ["/api/orgs/7/policies/PRIVACY/template", "POST"],
      ["/api/orgs/7/policies/PRIVACY/request-review", "POST"],
      ["/api/orgs/7/policies/PRIVACY/withdraw", "POST"],
    ]);
  });

  it("saves the draft with only the body and the If-Match version", async () => {
    serverApiFetch.mockResolvedValue(json({ ok: true }));
    await draft(req("PUT", { body: "# T\n\nx", extra: "ignored" }, { "if-match": "3" }), ctx({ orgId: "7", kind: "PRIVACY" }));
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/orgs/7/policies/PRIVACY/draft");
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "If-Match": "3" });
    expect(JSON.parse(init.body)).toEqual({ body: "# T\n\nx" });
  });

  it("refuses a bad shape before calling the API", async () => {
    expect((await list(req("GET"), ctx({ orgId: "7;drop" }))).status).toBe(404);
    expect((await one(req("GET"), ctx({ orgId: "7", kind: "../etc" }))).status).toBe(404);
    expect((await submit(req("POST"), ctx({ orgId: "x", kind: "PRIVACY" }))).status).toBe(404);
    expect((await draft(req("PUT", { nope: 1 }), ctx({ orgId: "7", kind: "PRIVACY" }))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("passes the API's refusal through as { error, code }", async () => {
    serverApiFetch.mockResolvedValue(json({ detail: "HTML is not allowed.", code: "POLICY_BODY_INVALID" }, 422));
    const res = await draft(req("PUT", { body: "<b>x</b>" }), ctx({ orgId: "7", kind: "PRIVACY" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "HTML is not allowed.", code: "POLICY_BODY_INVALID" });
  });
});

describe("admin policy review BFF routes", () => {
  it("lists by status (unknown statuses fall back to IN_REVIEW) and reads one", async () => {
    serverApiFetch.mockResolvedValue(json([]));
    await queue(new Request("http://localhost:3200/api/admin/org-policies?status=PUBLISHED"));
    await queue(new Request("http://localhost:3200/api/admin/org-policies?status=x;drop"));
    await review(req("GET"), ctx({ id: "12" }));
    expect(serverApiFetch.mock.calls.map((c) => c[0])).toEqual(["/api/admin/org-policies?status=PUBLISHED", "/api/admin/org-policies?status=IN_REVIEW", "/api/admin/org-policies/12"]);
  });

  it("approves and requests changes with only a comment", async () => {
    serverApiFetch.mockResolvedValue(json({ ok: true }));
    await approve(req("POST", { comment: "ok" }), ctx({ id: "12" }));
    await requestChanges(req("POST", { comment: "name your DPO" }), ctx({ id: "12" }));
    expect(serverApiFetch.mock.calls.map((c) => [c[0], JSON.parse(c[1].body)])).toEqual([
      ["/api/admin/org-policies/12/approve", { comment: "ok" }],
      ["/api/admin/org-policies/12/request-changes", { comment: "name your DPO" }],
    ]);
  });

  it("refuses other fields and non-numeric ids", async () => {
    expect((await approve(req("POST", { comment: "x", status: "PUBLISHED" }), ctx({ id: "12" }))).status).toBe(400);
    expect((await requestChanges(req("POST", "nope"), ctx({ id: "12" }))).status).toBe(400);
    expect((await review(req("GET"), ctx({ id: "1/../2" }))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
