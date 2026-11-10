import { beforeEach, describe, expect, it } from "vitest";
// The dev mock of the retirement API (K10.9): the wizard tests and the Playwright journey stand on it, so its rules are pinned here.
import { createPlansState } from "../../scripts/mock-plans.mjs";

type Out = { status: number; body: any } | null; // eslint-disable-line @typescript-eslint/no-explicit-any
let s: ReturnType<typeof createPlansState>;
const call = (method: string, path: string, body: Record<string, unknown> = {}, query = ""): NonNullable<Out> =>
  s.handle({ method, path, body, query: new URLSearchParams(query), headers: {} }) as NonNullable<Out>;

const START = {
  planKey: "PRO",
  mode: "RETIRE_AT_RENEWAL",
  defaultOutcome: "FREE",
  successors: [{ planKey: "PRO_STUDENT", rank: 1 }],
  noticeScheduleDays: [60, 30, 7, 1],
  channels: ["EMAIL", "IN_APP"],
  reason: "Pro v1 is replaced by Pro v3 for new buyers",
  confirmPlanKey: "PRO",
};

beforeEach(() => {
  s = createPlansState({ stripeEnabled: true });
});

describe("retirement mock", () => {
  it("answers the fixture of the story: 212 subscribers, $4,238.88, 180 monthly, 32 quarterly, 0 yearly", () => {
    const { body } = call("GET", "/api/admin/retirements/coverage", {}, "planKey=PRO&successors=PRO_STUDENT");
    expect(body.impact).toMatchObject({ subscribers: 212, mrrMinor: 423888, byInterval: { MONTH: 180, QUARTER: 32, YEAR: 0 } });
    expect(body.successors[0]).toMatchObject({ fullyCovered: 198, withGaps: 14, wouldPayMore: 9 });
    expect(body.defaults.minNoticeDays).toBe(30);
  });

  it("refuses MIGRATE_AT_RENEWAL when 9 would pay more, a short reason, a wrong key and a date inside the minimum notice", () => {
    expect(call("POST", "/api/admin/retirements", { ...START, defaultOutcome: "MIGRATE_AT_RENEWAL" }).body.code).toBe("PRICE_INCREASE_REQUIRES_CONSENT");
    expect(call("POST", "/api/admin/retirements", { ...START, reason: "short" }).body.code).toBe("REASON_REQUIRED");
    expect(call("POST", "/api/admin/retirements", { ...START, confirmPlanKey: "PRO_X" }).body.code).toBe("CONFIRM_MISMATCH");
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(call("POST", "/api/admin/retirements", { ...START, effectiveNotBefore: soon }).body.code).toBe("NOTICE_TOO_SHORT");
  });

  it("starts, marks the plan RETIRING, refuses a second start, updates on an event, and cancels only while nobody acted", () => {
    const started = call("POST", "/api/admin/retirements", START);
    expect(started.status).toBe(201);
    expect(started.body.counts.pending).toBe(212);
    expect(call("GET", "/api/admin/plans/PRO").body.status).toBe("RETIRING");
    expect(call("POST", "/api/admin/retirements", START).body.code).toBe("RETIREMENT_EXISTS");
    const id = started.body.id;
    const after = call("POST", "/mock/retirements/event", { id, kind: "switched" }).body;
    expect(after.counts).toMatchObject({ pending: 211, switchScheduled: 1 });
    expect(after.canCancel).toBe(false);
    expect(call("POST", `/api/admin/retirements/${id}/cancel`, { reason: "x".repeat(25), confirmPlanKey: "PRO" }).body.code).toBe("RETIREMENT_ACTED");
  });

  it("cancel puts the plan back on sale when nobody has acted; the items list follows the shared list contract", () => {
    const id = call("POST", "/api/admin/retirements", START).body.id;
    const items = call("GET", `/api/admin/retirements/${id}/items`, {}, "page=0&size=10").body;
    expect(items.items).toHaveLength(10);
    expect(items.total).toBeGreaterThan(10);
    expect(call("POST", `/api/admin/retirements/${id}/cancel`, { reason: "x".repeat(25), confirmPlanKey: "PRO" }).body.status).toBe("CANCELLED");
    expect(call("GET", "/api/admin/plans/PRO").body.status).toBe("PUBLISHED");
  });

  it("renders the first notice from the copy register with the date", () => {
    const { body } = call("GET", "/api/admin/retirements/notices/preview", {}, "planKey=PRO&outcome=FREE");
    expect(body.subject).toMatch(/^Your Pro plan is changing on /);
    expect(body.body).toMatch(/moves to Free/);
    expect(body.body).toMatch(/Cancel any time/);
  });
});
