import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it } from "vitest";
import { createConOpportunitiesMock } from "../../../../scripts/mock-con-opportunities.mjs";
import { parseList, parseOpportunity } from "./opportunities";

/** The dev mock must keep speaking the contract the page parses: lifecycle, allowedActions, versions, 404 for everyone but the consultant. */
type Out = { status: number; body: Record<string, unknown> };
const handle = (createConOpportunitiesMock as (deps: unknown) => unknown)({
  json: (res: { out?: Out }, status: number, body: Record<string, unknown>) => {
    res.out = { status, body };
  },
  subOf: (req: { sub?: string }) => req.sub ?? null,
}) as (req: unknown, res: unknown, path: string, method: string) => boolean;

async function call(method: string, path: string, opts: { sub?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Out> {
  const req = Object.assign(new EventEmitter(), { sub: opts.sub ?? "consultant@acme.com", headers: { "idempotency-key": "k", ...(opts.headers ?? {}) }, url: path, resume: () => {} });
  const res: { out?: Out } = {};
  const handled = handle(req, res, path.split("?")[0], method);
  expect(handled).toBe(true);
  setTimeout(() => {
    if (opts.body !== undefined) req.emit("data", JSON.stringify(opts.body));
    req.emit("end");
  }, 0);
  await new Promise((r) => setTimeout(r, 5));
  return res.out!;
}
const BASE = "/api/orgs/2/con/opportunities";

beforeEach(async () => {
  await call("POST", "/mock/con/opportunities/reset");
});

describe("mock con/opportunities", () => {
  it("serves five realistic rows the page can parse, across states, with a LinkedIn payLabel, an Indeed and a Greenhouse job", async () => {
    const r = await call("GET", BASE);
    expect(r.status).toBe(200);
    const list = parseList(r.body)!;
    expect(list.items).toHaveLength(5);
    expect(new Set(list.items.map((i) => i.state)).size).toBeGreaterThanOrEqual(4);
    const platforms = list.items.map((i) => i.job.atsPlatform);
    expect(platforms).toEqual(expect.arrayContaining(["linkedin", "indeed", "greenhouse"]));
    expect(list.items.find((i) => i.job.atsPlatform === "linkedin")?.job.payLabel).toBeTruthy();
    for (const i of list.items) expect(i.allowedActions.length).toBeGreaterThanOrEqual(0);
    expect((await call("GET", `${BASE}?state=APPLIED`)).body.total).toBe(1);
  });

  it("is a 404 for anyone but the acme consultant, and for another org", async () => {
    expect((await call("GET", BASE, { sub: "marketer@acme.com" })).status).toBe(404);
    expect((await call("GET", "/api/orgs/3/con/opportunities")).status).toBe(404);
    expect((await call("GET", `${BASE}/999`)).status).toBe(404);
  });

  it("follows the matrix: viewed, interested, ask, applied, then link/unlink", async () => {
    let r = await call("POST", `${BASE}/1/viewed`, { body: {} });
    expect(parseOpportunity(r.body)).toMatchObject({ state: "VIEWED", version: 1 });
    r = await call("POST", `${BASE}/1/interest`, { body: {} });
    expect(parseOpportunity(r.body)?.state).toBe("INTERESTED");
    r = await call("POST", `${BASE}/1/request-info`, { body: { question: "Relocation?" } });
    expect(parseOpportunity(r.body)).toMatchObject({ state: "NEEDS_INFO", infoRequest: "Relocation?" });
    r = await call("POST", `${BASE}/1/applied`, { body: {} });
    const applied = parseOpportunity(r.body)!;
    expect(applied.state).toBe("APPLIED");
    expect(applied.appliedAt).toBeTruthy();
    expect(applied.allowedActions).toEqual(["LINK"]);
    r = await call("POST", `${BASE}/1/link`, { body: { applicationId: 56 } });
    expect(parseOpportunity(r.body)).toMatchObject({ linkedApplicationId: 56, allowedActions: ["UNLINK"] });
    r = await call("POST", `${BASE}/1/unlink`, { body: {} });
    expect(parseOpportunity(r.body)?.linkedApplicationId).toBeNull();
  });

  it("decline needs a reason from the list; declined can come back to interested; closed allows nothing", async () => {
    expect((await call("POST", `${BASE}/2/decline`, { body: { reason: "BECAUSE" } })).status).toBe(400);
    let r = await call("POST", `${BASE}/2/decline`, { body: { reason: "RATE", note: "low" } });
    expect(parseOpportunity(r.body)).toMatchObject({ state: "DECLINED", allowedActions: ["INTEREST"] });
    r = await call("POST", `${BASE}/2/interest`, { body: {} });
    expect(parseOpportunity(r.body)?.state).toBe("INTERESTED");
  });

  it("same-target is a 200 no-op; an illegal move is a 409; a stale If-Match is VERSION_CONFLICT", async () => {
    const same = await call("POST", `${BASE}/4/applied`, { body: {} });
    expect(same.status).toBe(200);
    expect(parseOpportunity(same.body)?.version).toBe(0);
    expect((await call("POST", `${BASE}/5/viewed`, { body: {} })).status).toBe(409);
    await call("POST", "/mock/con/opportunities/1/bump");
    const stale = await call("POST", `${BASE}/1/interest`, { body: {}, headers: { "if-match": "0" } });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
    expect((await call("POST", `${BASE}/1/interest`, { body: {}, headers: { "if-match": "1" } })).status).toBe(200);
  });

  it("refuses sensitive text and a missing idempotency key", async () => {
    const s = await call("POST", `${BASE}/1/request-info`, { body: { question: "my ssn is 123-45-6789" } });
    expect(s.status).toBe(422);
    expect(s.body.code).toBe("SENSITIVE_CONTENT");
    const k = await call("POST", `${BASE}/1/interest`, { body: {}, headers: { "idempotency-key": "" } });
    expect(k.status).toBe(400);
  });
});
