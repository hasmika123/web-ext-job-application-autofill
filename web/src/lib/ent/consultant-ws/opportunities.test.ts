import { describe, expect, it } from "vitest";
import { actionTarget, canRespond, daysLeftText, dueUrgent, nextSteps, parseDetail, parseOpportunities, rateText, type OppRow } from "./opportunities";

const tile = (value: number, extra: Record<string, unknown> = {}) => ({ value, previous: 1, deltaPct: 10, sparkline: [0, 1, 2], ...extra });
const row = (over: Partial<OppRow> = {}): OppRow => ({
  matchId: 1, requirementId: 10, title: "Java Dev", skills: ["Java"], company: "TechCorp", location: "Austin, TX", workMode: "HYBRID", marketer: "Morgan",
  status: "NEW", priority: "HIGH", priorityDerived: false, dueOn: "2026-10-16", dueDerived: false, daysLeft: 2, score: 90, missingSkills: 0, interestSent: false, assignedAt: null, ...over,
});

describe("parseOpportunities", () => {
  it("reads the contract and drops rows that are not the contract", () => {
    const v = parseOpportunities({
      orgId: 2,
      tiles: { total: tile(5), high: tile(2), awaiting: tile(1, { deltaPct: null }), inReview: tile(1), declined: tile(1) },
      rows: [row(), { bad: true }, { matchId: 3, title: "SRE", status: "WEIRD", priority: "??", score: 400 }],
      total: 2,
      nextSteps: { toRespond: 2, soonestDueDays: null },
    })!;
    expect(v.rows.map((r) => r.matchId)).toEqual([1, 3]);
    expect(v.rows[1]).toMatchObject({ status: "NEW", priority: "MEDIUM", score: 100, marketer: null });
    expect(v.tiles.awaiting.deltaPct).toBeNull();
    expect(v.nextSteps).toMatchObject({ toRespond: 2, soonestDueDays: null, hasMarketer: false });
  });
  it("is null for anything else", () => {
    expect(parseOpportunities(null)).toBeNull();
    expect(parseOpportunities({ orgId: 1 })).toBeNull();
  });
});

describe("parseDetail", () => {
  it("reads skills and the timeline and skips junk", () => {
    const d = parseDetail({ row: row(), skills: [{ skill: "Java", present: true }, 4], timeline: [{ key: "ASSIGNED", label: "Assigned", at: "2026-10-01T00:00:00Z" }, { key: 1 }], rateMinMinor: 8500 })!;
    expect(d.skills).toEqual([{ skill: "Java", present: true }]);
    expect(d.timeline).toHaveLength(1);
    expect(parseDetail({})).toBeNull();
  });
});

describe("labels", () => {
  it("words the days left", () => {
    expect(daysLeftText(2)).toBe("2 days left");
    expect(daysLeftText(1)).toBe("1 day left");
    expect(daysLeftText(0)).toBe("Due today");
    expect(daysLeftText(-3)).toBe("3 days overdue");
  });
  it("is urgent at 3 days or fewer and when overdue, but not once declined", () => {
    expect(dueUrgent(row({ daysLeft: 3 }))).toBe(true);
    expect(dueUrgent(row({ daysLeft: 4 }))).toBe(false);
    expect(dueUrgent(row({ daysLeft: -1 }))).toBe(true);
    expect(dueUrgent(row({ daysLeft: -1, status: "DECLINED" }))).toBe(false);
    expect(canRespond(row({ status: "DECLINED" }))).toBe(false);
  });
  it("prints the rate band from minor units", () => {
    expect(rateText({ rateMinMinor: 8500, rateMaxMinor: 9500, rateUnit: "HOUR", currency: "USD" })).toBe("$85-95/hr");
    expect(rateText({ rateMinMinor: 12000000, rateMaxMinor: null, rateUnit: "YEAR", currency: "USD" })).toBe("$120k/yr");
    expect(rateText({ rateMinMinor: null, rateMaxMinor: null, rateUnit: null, currency: null })).toBeNull();
  });
  it("targets the picked row, else the first, else none", () => {
    const rows = [row({ matchId: 1 }), row({ matchId: 2 })];
    expect(actionTarget(rows, 2)?.matchId).toBe(2);
    expect(actionTarget(rows, 9)?.matchId).toBe(1);
    expect(actionTarget([], null)).toBeNull();
  });
});

describe("nextSteps", () => {
  it("derives each step from the counts and leaves out the ones with nothing to do", () => {
    const s = nextSteps({ toRespond: 5, soonestDueDays: 2, resumeGaps: 1, upcomingInterviews: 2, hasMarketer: true }, "/w/consultant");
    expect(s.map((x) => x.key)).toEqual(["respond", "resume", "interviews", "marketer"]);
    expect(s[0].title).toBe("Respond to 5 opportunities");
    expect(s[2].href).toBe("/w/consultant/interview-prep");
    expect(nextSteps({ toRespond: 0, soonestDueDays: null, resumeGaps: 0, upcomingInterviews: 0, hasMarketer: false }, "/w/consultant").map((x) => x.key)).toEqual(["marketer"]);
    expect(nextSteps({ toRespond: 1, soonestDueDays: -1, resumeGaps: 0, upcomingInterviews: 0, hasMarketer: true }, "/w/consultant")[0].title).toBe("Respond to 1 opportunity");
  });
});
