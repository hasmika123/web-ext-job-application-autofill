import { describe, expect, it } from "vitest";
import type { AnalyticsStats } from "@/lib/job-analytics";
import { appliedDelta, barGroups, chartScale, companyPct, funnelRows, isQuiet, responseNote, statusSegments } from "./compute";

const stats = (over: Partial<AnalyticsStats> = {}): AnalyticsStats => ({ applied: 10, appliedPrev: 8, replies: 4, interviews: 2, offers: 1, responseRate: 40, ...over });

describe("barGroups", () => {
  it("labels a week by its first day and a month by its name and year, so a year never repeats a label", () => {
    const b = [{ start: "2026-10-12", applied: 3, interviews: 1, offers: 0 }];
    expect(barGroups(b, "week")).toEqual([{ label: "Oct 12", values: [3, 1, 0] }]);
    expect(barGroups(b.map((x) => ({ ...x, start: "2026-10-01" })), "month")).toEqual([{ label: "Oct ’26", values: [3, 1, 0] }]);
  });
  it("isQuiet when every bar is empty", () => {
    expect(isQuiet([{ start: "2026-10-12", applied: 0, interviews: 0, offers: 0 }])).toBe(true);
    expect(isQuiet([{ start: "2026-10-12", applied: 0, interviews: 0, offers: 1 }])).toBe(false);
  });
});

describe("chartScale", () => {
  it("never draws a one-tick axis and keeps at most four intervals", () => {
    expect(chartScale([{ values: [0, 0, 0] }])).toEqual({ max: 2, ticks: [0, 1, 2] });
    const s = chartScale([{ values: [7, 2, 0] }]);
    expect(s.max).toBeGreaterThanOrEqual(7);
    expect(s.ticks.length).toBeLessThanOrEqual(5);
    expect(chartScale([{ values: [43] }]).max).toBeGreaterThanOrEqual(43);
  });
});

describe("appliedDelta", () => {
  it("compares with the period before and says nothing without one", () => {
    expect(appliedDelta(stats({ applied: 10, appliedPrev: 8 }))).toEqual({ value: "25%", up: true });
    expect(appliedDelta(stats({ applied: 4, appliedPrev: 8 }))).toEqual({ value: "50%", up: false });
    expect(appliedDelta(stats({ appliedPrev: 0 }))).toBeUndefined();
    expect(appliedDelta(stats({ applied: 8, appliedPrev: 8 }))).toBeUndefined();
  });
});

describe("funnel, status and company shaping", () => {
  it("the funnel is each stage over applications, capped at 100", () => {
    const rows = funnelRows(stats({ applied: 4, replies: 6 }));
    expect(rows.map((r) => r.label)).toEqual(["Applied", "Replies", "Interviews", "Offers"]);
    expect(rows[1].value).toBe(100);
    expect(funnelRows(stats({ applied: 0, replies: 0, interviews: 0, offers: 0 })).every((r) => r.value === 0)).toBe(true);
  });
  it("status slices carry the status tone", () => {
    expect(statusSegments([{ status: "OFFER", label: "Offer", count: 2 }])).toEqual([{ label: "Offer", value: 2, tone: "violet" }]);
  });
  it("company share and the response note never invent a rate", () => {
    expect(companyPct(4, 1)).toBe(25);
    expect(companyPct(0, 0)).toBe(0);
    expect(responseNote(stats({ responseRate: null }))).toBe("No applications in this period");
    expect(responseNote(stats({ responseRate: 40 }))).toBe("40% response rate");
  });
});
