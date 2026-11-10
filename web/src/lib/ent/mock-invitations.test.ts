/* eslint-disable @typescript-eslint/no-explicit-any -- the mock handler answers untyped JSON; the test reads it loosely */
import { describe, expect, it } from "vitest";
import { createInvitationsMock as untyped } from "../../../scripts/mock-invitations.mjs";

type Handler = (req: unknown, res: unknown, path: string, method: string) => boolean;
const createInvitationsMock = untyped as (o: { json: unknown; withBody: unknown; hostOf: (r: { host: string }) => string }) => Handler;

/** Drives the mock handler without a socket: a fake request (host, token, body) and a response that records what was sent. */
function client() {
  const out: { status: number; body: unknown } = { status: 0, body: null };
  const res = { writeHead: (s: number) => (out.status = s), end: () => undefined };
  const json = (_r: unknown, status: number, body: unknown) => {
    out.status = status;
    out.body = body;
    return true;
  };
  const handle = createInvitationsMock({ json, withBody: (req: { body?: unknown }, cb: (b: unknown) => void) => cb(req.body ?? {}), hostOf: (r) => r.host });
  const token = (sub: string) => `Bearer x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;
  return (method: string, path: string, who: { host: string; login: string }, body?: unknown) => {
    out.status = 0;
    out.body = null;
    const [p, q] = path.split("?");
    const handled = handle({ host: who.host, headers: { authorization: token(who.login) }, url: `${p}${q ? `?${q}` : ""}`, body, resume: () => undefined }, res, p, method);
    return { handled, status: out.status, body: out.body as Record<string, any> };
  };
}

const sarah = { host: "acme.localhost", login: "sarah@acme.com" };

describe("the invitations mock honours the API's contract", () => {
  it("lists, filters and pages; counts carry deltas; the feed is newest first", () => {
    const call = client();
    const all = call("GET", "/api/orgs/2/invitations?page=0&size=5", sarah);
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(5);
    expect(all.body.total).toBe(14);
    const pending = call("GET", "/api/orgs/2/invitations?status=PENDING&size=50", sarah);
    expect(pending.body.items.every((i: any) => i.status === "PENDING")).toBe(true);
    expect(call("GET", "/api/orgs/2/invitations?q=sophia", sarah).body.items.map((i: any) => i.name)).toEqual(["Sophia Martinez"]);
    const counts = call("GET", "/api/orgs/2/invitations/counts", sarah).body;
    expect(counts.counts.map((c: any) => c.status)).toEqual(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]);
    expect(counts.total).toBe(14);
    const feed = call("GET", "/api/orgs/2/invitations/activity?limit=4", sarah).body as unknown as { at: string }[];
    expect(feed).toHaveLength(4);
    expect(Date.parse(feed[0].at)).toBeGreaterThanOrEqual(Date.parse(feed[3].at));
  });

  it("invites with one row per entry, refuses a duplicate and a member, then resend and revoke follow the rules", () => {
    const call = client();
    const r = call("POST", "/api/orgs/2/invitations", sarah, { emails: ["new@acme.com", "Ana Lee <ana@acme.com>", "bad", "new@acme.com", "owner@acme.com", "emily.carter@acme.com"], roleIds: [13], departmentGroupId: 21 });
    expect(r.body.rows.map((x: any) => x.status)).toEqual(["INVITED", "INVITED", "INVALID", "DUPLICATE", "ALREADY_MEMBER", "DUPLICATE"]);
    expect(r.body.rows[2].reason).toBe("malformed");
    const made = call("GET", "/api/orgs/2/invitations?q=ana@acme.com", sarah).body.items[0];
    expect(made.name).toBe("Ana Lee");
    expect(made.department.name).toBe("Marketing");
    expect(call("POST", `/api/orgs/2/invitations/${made.id}/revoke`, sarah).status).toBe(204);
    expect(call("POST", `/api/orgs/2/invitations/${made.id}/revoke`, sarah).status).toBe(404); // only a pending one can be revoked
    expect(call("POST", `/api/orgs/2/invitations/${made.id}/resend`, sarah).status).toBe(404); // revoked: gone for good
    const expired = call("GET", "/api/orgs/2/invitations?status=EXPIRED", sarah).body.items[0];
    expect(call("POST", `/api/orgs/2/invitations/${expired.id}/resend`, sarah).status).toBe(200);
    expect(call("GET", "/api/orgs/2/invitations/" + expired.id, sarah).status).toBe(404);
    const bulk = call("POST", "/api/orgs/2/invitations/bulk/revoke", sarah, { ids: [expired.id, 99999] });
    expect(bulk.body.results.map((x: any) => x.status)).toEqual(["OK", "FAILED"]);
  });

  it("rate-limits resends, and a role above the caller's own is a 422 ROLE_CEILING", () => {
    const call = client();
    const row = call("GET", "/api/orgs/2/invitations?status=PENDING", sarah).body.items[0];
    for (let i = 0; i < 3; i++) expect(call("POST", `/api/orgs/2/invitations/${row.id}/resend`, sarah).status).toBe(200);
    expect(call("POST", `/api/orgs/2/invitations/${row.id}/resend`, sarah).status).toBe(429);
    const high = call("POST", "/api/orgs/2/invitations", sarah, { emails: ["z@acme.com"], roleIds: [11] });
    expect(high.status).toBe(422);
    expect(high.body.code).toBe("ROLE_CEILING");
  });

  it("another organization, a member without members.invite and a signed-out call all get the generic 404", () => {
    const call = client();
    expect(call("GET", "/api/orgs/3/invitations", sarah).status).toBe(404); // Acme's session on Beta's organization
    expect(call("GET", "/api/orgs/2/invitations", { host: "beta.localhost", login: "owner@beta.com" }).status).toBe(404); // Beta's owner on Acme's
    expect(call("GET", "/api/orgs/2/invitations", { host: "acme.localhost", login: "consultant@acme.com" }).status).toBe(404);
    expect(call("GET", "/api/orgs/3/invitations", { host: "beta.localhost", login: "owner@beta.com" }).body.total).toBe(0); // Beta starts empty
  });

  it("offers roles and departments to the invite form", () => {
    const call = client();
    expect((call("GET", "/api/orgs/2/roles", sarah).body as unknown as unknown[]).length).toBeGreaterThan(3);
    expect((call("GET", "/api/orgs/2/groups", sarah).body as unknown as { kind: string }[]).every((g) => g.kind === "DEPARTMENT")).toBe(true);
    expect(call("GET", "/api/orgs/3/groups", { host: "beta.localhost", login: "owner@beta.com" }).body).toEqual([]);
  });
});
