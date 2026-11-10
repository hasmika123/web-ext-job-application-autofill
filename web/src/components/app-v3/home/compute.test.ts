import { describe, expect, it } from "vitest";
import type { Application } from "@/lib/applications";
import { bucketActivity, computeDashboard, computeProfile } from "./compute";

const SUMMARY = { ALL: 40, DRAFT: 2, SAVED: 4, APPLIED: 12, IN_REVIEW: 8, INTERVIEW: 6, OFFER: 2, REJECTED: 5, WITHDRAWN: 1, GHOSTED: 3, ARCHIVED: 9 };

const app = (id: number, over: Partial<Application> = {}): Application => ({
  id,
  company: `Co ${id}`,
  roleTitle: `Role ${id}`,
  status: "APPLIED",
  appliedAt: "2026-10-08T12:00:00Z",
  createdAt: "2026-10-01T12:00:00Z",
  ...over,
});

describe("computeDashboard (from the list summary)", () => {
  it("the tiles are the server's counts: submitted = APPLIED..REJECTED, not saved or drafts", () => {
    const n = computeDashboard(SUMMARY, []);
    expect(n.stats.map((s) => [s.id, s.value])).toEqual([
      ["applications", "33"],
      ["interviews", "6"],
      ["offers", "2"],
      ["saved", "4"],
    ]);
    expect(n.total).toBe(33);
  });

  it("the donut slices follow the summary, in funnel order", () => {
    const n = computeDashboard(SUMMARY, []);
    expect(n.status).toEqual([
      { label: "Applied", value: 12, tone: "blue" },
      { label: "Under Review", value: 8, tone: "amber" },
      { label: "Interview", value: 6, tone: "green" },
      { label: "Offer", value: 2, tone: "violet" },
      { label: "Rejected", value: 5, tone: "coral" },
    ]);
  });

  it("words the notes from the counts and never claims a trend", () => {
    const n = computeDashboard(SUMMARY, []);
    expect(n.stats[0].note).toBe("3 gone quiet");
    expect(n.stats[1].note).toBe("in progress");
    expect(n.stats[2].note).toBe("decision time");
    expect(n.stats[3].note).toBe("on your list");
    const quietless = computeDashboard({ ...SUMMARY, GHOSTED: 0 }, []);
    expect(quietless.stats[0].note).toBe("20 waiting to hear back");
    for (const s of n.stats) expect(s.note).not.toMatch(/this week|%|\+/);
  });

  it("an empty account is zeros with encouraging copy, not a made-up number", () => {
    const n = computeDashboard(undefined, []);
    expect(n.stats.map((s) => s.value)).toEqual(["0", "0", "0", "0"]);
    expect(n.total).toBe(0);
    expect(n.stats[0].note).toBe("Send your first one");
    expect(n.stats[3].note).toBe("save some jobs");
    expect(n.status.every((s) => s.value === 0)).toBe(true);
    expect(n.recent).toEqual([]);
  });

  it("recent keeps the first five, with a short date and the wire status", () => {
    const rows = Array.from({ length: 7 }, (_, i) => app(i + 1, i === 0 ? { status: "IN_REVIEW" } : {}));
    const n = computeDashboard(SUMMARY, rows);
    expect(n.recent).toHaveLength(5);
    expect(n.recent[0]).toMatchObject({ id: "1", title: "Role 1", company: "Co 1", status: "IN_REVIEW" });
    expect(n.recent[0].date).toMatch(/Oct 8/);
  });
});

describe("bucketActivity", () => {
  const days = (n: number, count = (i: number) => i) =>
    Array.from({ length: n }, (_, i) => ({ day: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), count: count(i) }));

  it("a week or less is one bar per day, named by weekday", () => {
    const g = bucketActivity(days(7));
    expect(g).toHaveLength(7);
    expect(g[0]).toEqual({ label: "Thu", values: [0] }); // 2026-10-01 is a Thursday
    expect(g[6].values).toEqual([6]);
  });

  it("30 days fold into 6 buckets of 5, 90 days into 6 of 15; totals are kept", () => {
    const thirty = bucketActivity(days(30, () => 1));
    expect(thirty).toHaveLength(6);
    expect(thirty.every((b) => b.values[0] === 5)).toBe(true);
    expect(thirty[0].label).toBe("Oct 1");
    const ninety = bucketActivity(days(90, () => 2));
    expect(ninety).toHaveLength(6);
    expect(ninety.reduce((s, b) => s + b.values[0], 0)).toBe(180);
  });

  it("a period that does not divide evenly keeps its last short bucket; nothing in is nothing out", () => {
    const g = bucketActivity(days(31, () => 1));
    expect(g.reduce((s, b) => s + b.values[0], 0)).toBe(31);
    expect(bucketActivity([])).toEqual([]);
  });
});

describe("computeProfile", () => {
  it("an account with no profile and no resume is 0 percent, nothing ticked", () => {
    const p = computeProfile(null, 0);
    expect(p.pct).toBe(0);
    expect(p.checks.every((c) => !c.done)).toBe(true);
  });
  it("a resume ticks the three resume-derived checks", () => {
    expect(computeProfile({}, 1).pct).toBe(50);
  });
});
