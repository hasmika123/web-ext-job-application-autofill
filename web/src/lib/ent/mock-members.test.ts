/* eslint-disable @typescript-eslint/no-explicit-any -- the mock answers loose JSON */
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createMembersMock } from "../../../scripts/mock-members.mjs";

/** The members mock (scripts/mock-members.mjs) answers the shapes the page reads; this drives it with a fake request and response. */
function make(sub: string | null = "demo-ent-acme-sarah") {
  let last: { status: number; body: Record<string, any> } | null = null;
  const json = (_res: unknown, status: number, body: unknown) => {
    last = { status, body: body as Record<string, any> };
  };
  const handle = createMembersMock({ json, subOf: (() => sub) as never }) as (req: unknown, res: unknown, path: string, method: string) => boolean;
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
    const req = Object.assign(new EventEmitter(), { url, method, headers });
    const path = url.split("?")[0];
    last = null;
    const handled = handle(req, { writeHead: () => {}, end: () => {} }, path, method);
    if (body !== undefined || method !== "GET") {
      req.emit("data", body === undefined ? "" : JSON.stringify(body));
      req.emit("end");
    }
    return { handled, res: last as { status: number; body: Record<string, any> } | null };
  };
  return call;
}

describe("members mock", () => {
  it("lists the Acme roster with a page shape and sorts", () => {
    const call = make();
    const { res } = call("GET", "/api/orgs/2/members?sort=name,asc&size=5");
    expect(res!.status).toBe(200);
    expect(res!.body.total).toBeGreaterThanOrEqual(11);
    expect(res!.body.items).toHaveLength(5);
    const names = res!.body.items.map((i: { name: string }) => i.name);
    expect([...names].sort()).toEqual(names);
  });

  it("another organization and an anonymous caller get the generic 404", () => {
    expect(make()("GET", "/api/orgs/3/members").res!.status).toBe(404);
    expect(make(null)("GET", "/api/orgs/2/members").res!.status).toBe(404);
  });

  it("tiles carry a delta only where there is history", () => {
    const { res } = make()("GET", "/api/orgs/2/members/counts");
    expect(res!.body.total.delta).not.toBeNull();
    expect(res!.body.suspended).toMatchObject({ previous: null, delta: null, deltaPercent: null });
  });

  it("an edit needs If-Match (428) and a stale one is 412", () => {
    const call = make();
    expect(call("PATCH", "/api/orgs/2/members/3", { title: "x" }).res!.status).toBe(428);
    expect(call("PATCH", "/api/orgs/2/members/3", { title: "x" }, { "if-match": '"99"' }).res!.status).toBe(412);
    expect(call("PATCH", "/api/orgs/2/members/3", { title: "x" }, { "if-match": '"1"' }).res!.status).toBe(200);
  });

  it("a bulk call needs an Idempotency-Key and reports `previous` for the Undo", () => {
    const call = make();
    expect(call("POST", "/api/orgs/2/members/bulk/manager", { memberIds: [3], managerMemberId: 2 }).res!.status).toBe(400);
    const { res } = call("POST", "/api/orgs/2/members/bulk/manager", { memberIds: [3], managerMemberId: 2 }, { "idempotency-key": "k" });
    expect(res!.status).toBe(200);
    expect(res!.body.results[0]).toMatchObject({ memberId: 3, ok: true });
    expect(res!.body.results[0].previous).toHaveProperty("managerMemberId");
  });

  it("refuses the ceiling and the last administrator like the API", () => {
    const call = make("demo-ent-acme-sarah");
    // Sarah is not the Owner: handing out the Owner role is above her ceiling
    const out = call("PUT", "/api/orgs/2/members/3/roles", { roleIds: [10, 1], primaryRoleId: 10 });
    expect(out.res!.status).toBe(422);
    expect(out.res!.body.code).toBe("ROLE_CEILING");
    expect(out.res!.body.reason).toBe("ADMIN_ROLE");
  });

  it("offboards after the typed name and keeps a scheduled last day in the queue", () => {
    const call = make();
    expect(call("POST", "/api/orgs/2/members/8/offboard", { reason: "Left the company", confirm: "Nope" }, { "idempotency-key": "k" }).res!.status).toBe(422);
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    const seat = call("GET", "/api/orgs/2/members/8").res!.body;
    const sched = call("POST", "/api/orgs/2/members/8/offboard", { reason: "Leaves next week", confirm: seat.name, effectiveAt: future }, { "idempotency-key": "k2" });
    expect(sched.res!.body.scheduled).toBeTruthy();
    expect(call("GET", "/api/orgs/2/members/offboarding").res!.body.items).toHaveLength(1);
    expect(call("DELETE", "/api/orgs/2/members/offboarding/1").handled).toBe(true);
    expect(call("GET", "/api/orgs/2/members/offboarding").res!.body.items).toHaveLength(0);
  });
});
