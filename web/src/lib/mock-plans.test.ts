import { beforeEach, describe, expect, it } from "vitest";
// The dev mock of the plan-builder API (K4.7): the web tests and the Playwright journey stand on it, so its rules are pinned here.
import { createPlansState } from "../../scripts/mock-plans.mjs";

type Out = { status: number; body: any } | null; // eslint-disable-line @typescript-eslint/no-explicit-any
let s: ReturnType<typeof createPlansState>;
const call = (method: string, path: string, body: Record<string, unknown> = {}, query = "", headers: Record<string, string> = {}): NonNullable<Out> =>
  s.handle({ method, path, body, query: new URLSearchParams(query), headers }) as NonNullable<Out>;
const key = { "idempotency-key": "idem-0001-abcd" };

beforeEach(() => {
  s = createPlansState({ stripeEnabled: true });
});

describe("the list", () => {
  it("has six plans incl. a SUNSET one, a DRAFT one and subscribers by version", () => {
    const { body } = call("GET", "/api/admin/plans");
    expect(body.map((p: { planKey: string }) => p.planKey)).toEqual(["FREE", "PRO", "AUTOPILOT", "PRO_STUDENT", "ORG_STANDARD", "ORG_CONSULTANCY"]);
    const pro = body.find((p: { planKey: string }) => p.planKey === "PRO");
    expect(pro.liveVersion.version).toBe(2);
    expect(pro.draftVersion).toBe(3);
    expect(pro.subscribersByVersion).toEqual({ "1": 212, "2": 1038 });
    expect(pro.pricesByInterval).toEqual({ MONTH: 1999, QUARTER: 4999 });
    expect(call("GET", "/api/admin/plans", {}, "status=SUNSET").body).toHaveLength(1);
  });
  it("refuses a non-admin", () => {
    expect(s.handle({ method: "GET", path: "/api/admin/plans", admin: false })?.status).toBe(403);
  });
});

describe("the guard and the preview", () => {
  it("$3.99 for Extra AI credits fails with a $5.50 lever; the lever passes", () => {
    const low = call("GET", "/api/admin/catalog/margin", {}, "kind=OPTIONAL&amountMinor=399&aiBudgetCents=64").body;
    expect(low.ok).toBe(false);
    expect(low.levers.minPriceMinor).toBe(550);
    expect(call("GET", "/api/admin/catalog/margin", {}, "kind=OPTIONAL&amountMinor=550&aiBudgetCents=64").body.ok).toBe(true);
  });
  it("the Pro v3 draft passes at the seeded prices; drafting $3.99 makes the margin and the composition fail", () => {
    expect(call("GET", "/api/admin/plans/PRO/versions/3/preview").body.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    call("POST", "/api/admin/catalog/prices", { productId: 77, interval: "MONTH", amountMinor: 399, currency: "USD", audience: "INDIVIDUAL" });
    const pv = call("GET", "/api/admin/plans/PRO/versions/3/preview").body;
    expect(pv.checks.find((c: { id: string }) => c.id === "margin").ok).toBe(false);
    expect(pv.optional.find((o: { featureKey: string }) => o.featureKey === "ai.credits_extra").levers.minPriceMinor).toBe(550);
    expect(pv.impact.stripeObjectsToCreate[0].idempotencyKey).toMatch(/^price-/);
  });
});

describe("autosave", () => {
  it("PATCH and PUT bump updatedAt and a stale expectedUpdatedAt is a 409", () => {
    const v = call("GET", "/api/admin/plans/PRO/versions/3").body;
    const ok = call("PATCH", "/api/admin/plans/PRO/versions/3", { aiBudgetCapCents: 400, expectedUpdatedAt: v.updatedAt });
    expect(ok.status).toBe(200);
    expect(ok.body.aiBudgetCapCents).toBe(400);
    const stale = call("PATCH", "/api/admin/plans/PRO/versions/3", { aiBudgetCapCents: 500, expectedUpdatedAt: v.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
  });
  it("a published version is NOT_DRAFT", () => {
    expect(call("PATCH", "/api/admin/plans/PRO/versions/2", { summary: "x" }).body.code).toBe("NOT_DRAFT");
  });
  it("components: roles per audience, duplicates, a product for add-ons", () => {
    const row = { featureKey: "ai.credits_extra", role: "OPTIONAL", productId: 77 };
    expect(call("PUT", "/api/admin/plans/PRO/versions/3/components", { components: [{ ...row, role: "FEE" }] }).body.code).toBe("ROLE_INVALID_FOR_AUDIENCE");
    expect(call("PUT", "/api/admin/plans/PRO/versions/3/components", { components: [row, row] }).body.code).toBe("DUPLICATE_COMPONENT");
    expect(call("PUT", "/api/admin/plans/PRO/versions/3/components", { components: [{ ...row, productId: null }] }).body.code).toBe("PRODUCT_REQUIRED");
    expect(call("PUT", "/api/admin/plans/PRO/versions/3/components", { components: [row] }).status).toBe(200);
  });
  it("YEAR is derived from the monthly price, never typed", () => {
    call("PATCH", "/api/admin/plans/PRO/versions/3", { intervals: ["MONTH", "QUARTER", "YEAR"] });
    const base = call("GET", "/api/admin/plans/PRO/versions/3").body.baseProduct.prices.find((p: { interval: string }) => p.interval === "YEAR");
    expect(base).toMatchObject({ derived: true, source: "DERIVED", amountMinor: 21589 });
  });
});

describe("publish", () => {
  const publish = (body: Record<string, unknown>, headers: Record<string, string> = key) => call("POST", "/api/admin/plans/PRO/versions/3/publish", body, "", headers);
  it("needs the Idempotency-Key, the typed version and a reason", () => {
    expect(publish({ confirmVersion: 3, reason: "ship it to all" }, {}).body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(publish({ confirmVersion: 2, reason: "ship it to all" }).status).toBe(412);
    expect(publish({ confirmVersion: 3, reason: "short" }).body.code).toBe("REASON_REQUIRED");
  });
  it("publishes once, supersedes the live version and writes one catalog row; a replay with the same key changes nothing", () => {
    const first = publish({ confirmVersion: 3, reason: "ship it to all" });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("PUBLISHED");
    const plan = call("GET", "/api/admin/plans/PRO").body;
    expect(plan.versions.map((v: { version: number; status: string }) => `${v.version}:${v.status}`)).toEqual(["1:SUPERSEDED", "2:SUPERSEDED", "3:PUBLISHED"]);
    const rows = call("GET", "/api/admin/catalog/versions").body;
    expect(rows[rows.length - 1].summary).toMatch(/^Published PRO v3/);
    const replay = publish({ confirmVersion: 3, reason: "ship it to all" });
    expect(replay.status).toBe(200);
    expect(call("GET", "/api/admin/catalog/versions").body).toHaveLength(rows.length);
    expect(publish({ confirmVersion: 3, reason: "ship it to all" }, { "idempotency-key": "other-key-1234" }).body.code).toBe("NOT_DRAFT");
  });
  it("a failing margin is refused with the levers until an override reason is given", () => {
    call("POST", "/api/admin/catalog/prices", { productId: 77, interval: "MONTH", amountMinor: 399, currency: "USD", audience: "INDIVIDUAL" });
    const refused = publish({ confirmVersion: 3, reason: "ship it to all" });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe("MARGIN_BELOW_FLOOR");
    expect(refused.body.overrideAllowed).toBe(true);
    expect(refused.body.levers.minPriceMinor).toBe(550);
    expect(refused.body.checks.length).toBeGreaterThan(0);
    expect(publish({ confirmVersion: 3, reason: "ship it to all", overrideReason: "launch price" }).status).toBe(200);
  });
  it("an unpriced add-on blocks the publish", () => {
    call("PUT", "/api/admin/plans/PRO/versions/3/components", { components: [{ featureKey: "support.priority", role: "OPTIONAL", productId: 80 }] });
    expect(publish({ confirmVersion: 3, reason: "ship it to all" }).body.code).toBe("PLAN_PRICE_MISSING");
  });
  it("a missing TECHNICAL dependency blocks it", () => {
    call("PUT", "/api/admin/plans/PRO/versions/3/components", { components: [{ featureKey: "autopilot.prepare", role: "INCLUDED" }] });
    expect(publish({ confirmVersion: 3, reason: "ship it to all" }).body.code).toBe("PLAN_DEPENDENCY_MISSING");
  });
});

describe("compare, subscribers, versions", () => {
  it("compare lists the differences and both sides' subscribers and margins", () => {
    call("PATCH", "/api/admin/plans/PRO/versions/3", { aiBudgetCapCents: 400 });
    call("PUT", "/api/admin/plans/PRO/versions/3/components", { components: [{ featureKey: "ai.autofill", role: "INCLUDED", allowanceOverride: 3000 }] });
    const { body } = call("GET", "/api/admin/plans/PRO/compare", {}, "a=2&b=3");
    expect(body.diff.find((d: { path: string }) => d.path === "aiBudgetCapCents")).toMatchObject({ a: 300, b: 400 });
    expect(body.diff.find((d: { path: string }) => d.path === "components.ai.autofill.allowance")).toMatchObject({ a: 2000, b: 3000 });
    expect(body.diff.find((d: { path: string }) => d.path === "components.resume.library")).toMatchObject({ a: "INCLUDED", b: null });
    expect(body.subscribers).toEqual({ a: 1038, b: 0 });
    expect(Object.keys(body.marginByIntervalA)).toContain("MONTH");
  });
  it("subscribers: counts for everyone, logins for one version", () => {
    expect(call("GET", "/api/admin/plans/PRO/subscribers").body).toMatchObject({ byVersion: { "1": 212, "2": 1038 }, rows: null });
    expect(call("GET", "/api/admin/plans/PRO/subscribers", {}, "version=2").body.rows.length).toBeGreaterThan(0);
  });
  it("a second draft is refused; discarding the draft frees it", () => {
    expect(call("POST", "/api/admin/plans/PRO/versions", { reason: "start another one" }).body.code).toBe("DRAFT_EXISTS");
    expect(call("POST", "/api/admin/plans/PRO/versions/3/discard", {}).status).toBe(204);
    const made = call("POST", "/api/admin/plans/PRO/versions", { reason: "start another one" });
    expect(made.status).toBe(201);
    expect(made.body.version).toBe(3);
  });
});

describe("creating a plan and the organization rules", () => {
  it("creates a plan with a DRAFT v1 and rejects a bad or repeated key", () => {
    expect(call("POST", "/api/admin/plans", { planKey: "bad key", name: "x", audience: "INDIVIDUAL", reason: "a good reason" }).body.code).toBe("KEY_FORMAT");
    expect(call("POST", "/api/admin/plans", { planKey: "PRO", name: "x", audience: "INDIVIDUAL", reason: "a good reason" }).body.code).toBe("PLAN_KEY_EXISTS");
    const made = call("POST", "/api/admin/plans", { planKey: "TEAM_X", name: "Team X", audience: "ORG", reason: "a good reason" });
    expect(made.status).toBe(201);
    expect(made.body.versions[0]).toMatchObject({ version: 1, status: "DRAFT", intervals: ["MONTH"] });
  });
  it("an organization plan: no quarterly, the roster total and setup fee come from the DTO, and a missing setup fee is refused (mock-only rule)", () => {
    expect(call("PATCH", "/api/admin/plans/ORG_STANDARD/versions/1", { intervals: ["QUARTER"] }).body.code).toBe("NOT_DRAFT");
    const made = call("POST", "/api/admin/plans/ORG_STANDARD/versions", { reason: "start a new one" });
    const v = made.body.version;
    expect(call("PATCH", `/api/admin/plans/ORG_STANDARD/versions/${v}`, { intervals: ["MONTH", "QUARTER"] }).body.code).toBe("ORG_QUARTER_REFUSED");
    const pv = call("GET", `/api/admin/plans/ORG_STANDARD/versions/${v}/preview`, {}, "roster=%5B5%5DBASE%2C%5B3%5DRESUME_AI_SUPPORT").body;
    expect(pv.seats.roster.orgRecurringMinor).toBe(5 * 1499 + 3 * 2896);
    expect(pv.seats.roster.setupFeeMinor).toBe(49900);
    call("PATCH", `/api/admin/plans/ORG_STANDARD/versions/${v}`, { seatRules: { seatBaseProductId: 22, minSeats: 1 } });
    expect(call("POST", `/api/admin/plans/ORG_STANDARD/versions/${v}/publish`, { confirmVersion: v, reason: "ship it to all" }, "", key).body.code).toBe("SETUP_FEE_REQUIRED");
  });
});

describe("Stripe off", () => {
  it("the preview says so and the publish is still silent (P-02)", () => {
    s = createPlansState({ stripeEnabled: false });
    expect(call("GET", "/api/admin/plans/PRO/versions/3/preview").body.impact.stripeEnabled).toBe(false);
    expect(call("POST", "/api/admin/plans/PRO/versions/3/publish", { confirmVersion: 3, reason: "ship it to all" }, "", key).status).toBe(200);
  });
});
