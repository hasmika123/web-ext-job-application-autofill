import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  durationSub,
  durationText,
  engagementInfo,
  meetingBlock,
  noteProblem,
  parsePlacementView,
  relativeDay,
  safeHttps,
  withCompleted,
} from "./placements";

const NOW = Date.parse("2026-10-13T12:00:00Z");

const body = (over: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: "2026-10-13T12:00:00Z",
  name: "Anika Rao",
  activeCount: 1,
  active: { id: 7, roleTitle: "Senior Java Developer", status: "ACTIVE", clientName: "FinServe", startDate: "2026-09-22", endDate: null, durationMonths: 1, openEnded: true, billable: true, sample: true, engagementStatus: "ON_TRACK" },
  marketer: { memberId: 4, name: "Emily Lawson", title: "Senior IT Recruiter" },
  checklist: [
    { id: 1, label: "Sign agreement", dueOn: null, completedAt: "2026-10-01T00:00:00Z" },
    { id: 2, label: "Security training", dueOn: "2026-10-18", completedAt: null },
    { nope: true },
  ],
  milestones: [{ id: 1, label: "Start", description: null, onDate: "2026-09-22", completed: true }, { id: 2, label: "bad date", onDate: "soon" }],
  meetings: [
    { id: 1, label: "Sync", startsAt: "2026-10-16T15:00:00Z", durationMinutes: 60, withLabel: "Team", joinUrl: "https://meet.example.com/x" },
    { id: 2, label: "Unsafe", startsAt: "2026-10-17T15:00:00Z", durationMinutes: 30, joinUrl: "javascript:alert(1)" },
  ],
  activity: [{ id: 1, type: "DOCUMENT", description: "Signed", actorLabel: "You", occurredAt: "2026-09-22T16:00:00Z", sample: false }, { id: 2, type: "WEIRD", description: "x", occurredAt: "2026-09-23T16:00:00Z" }],
  past: [{ id: 3, roleTitle: "Old", clientName: null, startDate: "2025-01-01", endDate: "2025-06-01" }],
  ...over,
});

describe("parsePlacementView", () => {
  it("parses the contract and drops rows that do not match", () => {
    const v = parsePlacementView(body())!;
    expect(v.active?.roleTitle).toBe("Senior Java Developer");
    expect(v.active?.openEnded).toBe(true);
    expect(v.marketer?.name).toBe("Emily Lawson");
    expect(v.checklist.map((c) => c.id)).toEqual([1, 2]);
    expect(v.milestones.map((m) => m.id)).toEqual([1]);
    expect(v.meetings).toHaveLength(2);
    expect(v.activity.map((a) => a.type)).toEqual(["DOCUMENT", "UPDATE"]);
    expect(v.past[0].clientName).toBeNull();
  });

  it("never exposes a non-https join link", () => {
    const v = parsePlacementView(body())!;
    expect(v.meetings[0].joinUrl).toBe("https://meet.example.com/x");
    expect(v.meetings[1].joinUrl).toBeNull();
    expect(safeHttps("http://a.example.com")).toBeNull();
    expect(safeHttps("https://")).toBeNull();
    expect(safeHttps("https://a.example.com/path?x=1")).toBe("https://a.example.com/path?x=1");
  });

  it("handles no active placement and rejects a body that is not the contract", () => {
    const v = parsePlacementView(body({ active: null, activeCount: 0, marketer: null, checklist: undefined }))!;
    expect(v.active).toBeNull();
    expect(v.checklist).toEqual([]);
    expect(parsePlacementView(null)).toBeNull();
    expect(parsePlacementView({ orgId: "2" })).toBeNull();
    expect(parsePlacementView(body({ active: { id: 1, roleTitle: "x", startDate: "bad" } }))!.active).toBeNull();
  });

  it("has no rate field anywhere in what it keeps", () => {
    const v = parsePlacementView(body({ active: { ...(body().active as object), billRateMinor: 9900, rateUnit: "HOUR" } }))!;
    const s = JSON.stringify(v).toLowerCase();
    expect(s).not.toContain("billrate");
    expect(s).not.toContain("rateunit");
    expect(s).not.toContain("9900");
  });
});

describe("wording", () => {
  it("relativeDay counts UTC days against the server clock", () => {
    expect(relativeDay("2026-10-13", NOW)).toBe("Today");
    expect(relativeDay("2026-10-14", NOW)).toBe("Tomorrow");
    expect(relativeDay("2026-10-12", NOW)).toBe("Yesterday");
    expect(relativeDay("2026-10-18", NOW)).toBe("In 5 days");
    expect(relativeDay("2026-09-22", NOW)).toBe("3 weeks ago");
    expect(relativeDay("2026-05-13", NOW)).toBe("5 months ago");
    expect(relativeDay(null, NOW)).toBe("");
    expect(relativeDay("junk", NOW)).toBe("");
  });

  it("duration text is honest about open-ended placements", () => {
    expect(durationText({ durationMonths: 6 })).toBe("6 Months");
    expect(durationText({ durationMonths: 1 })).toBe("1 Month");
    expect(durationText({ durationMonths: 0 })).toBe("Under a month");
    expect(durationSub({ openEnded: false, endDate: "2027-04-13" })).toBe("Expected End: Apr 13, 2027");
    expect(durationSub({ openEnded: true, endDate: null })).toBe("Open-ended (so far)");
  });

  it("engagement pills", () => {
    expect(engagementInfo("ON_TRACK")).toEqual({ label: "On Track", tone: "green" });
    expect(engagementInfo("AT_RISK")?.tone).toBe("amber");
    expect(engagementInfo("NEEDS_ATTENTION")?.tone).toBe("red");
    expect(engagementInfo(null)).toBeNull();
  });

  it("meetingBlock gives month, day and a time range", () => {
    const b = meetingBlock({ startsAt: "2026-10-16T15:00:00Z", durationMinutes: 60 });
    expect(b.month).toBe("OCT");
    expect(Number(b.day)).toBeGreaterThanOrEqual(15);
    expect(b.time).toMatch(/ - /);
    expect(meetingBlock({ startsAt: "nope", durationMinutes: 5 })).toEqual({ month: "", day: "", time: "" });
  });
});

describe("checklist and note helpers", () => {
  const items = [
    { id: 1, label: "a", dueOn: null, completedAt: "2026-10-01T00:00:00Z" },
    { id: 2, label: "b", dueOn: null, completedAt: null },
  ];
  it("progress and optimistic update", () => {
    expect(checklistProgress(items)).toEqual({ done: 1, total: 2 });
    const ticked = withCompleted(items, 2, true, "2026-10-13T00:00:00Z");
    expect(checklistProgress(ticked)).toEqual({ done: 2, total: 2 });
    expect(items[1].completedAt).toBeNull();
    expect(checklistProgress(withCompleted(ticked, 1, false, "x"))).toEqual({ done: 1, total: 2 });
  });
  it("noteProblem enforces 3 to 300 characters", () => {
    expect(noteProblem("ok")).toMatch(/at least 3/);
    expect(noteProblem("   ")).toMatch(/at least 3/);
    expect(noteProblem("fine")).toBeNull();
    expect(noteProblem("x".repeat(300))).toBeNull();
    expect(noteProblem("x".repeat(301))).toMatch(/300/);
  });
});
