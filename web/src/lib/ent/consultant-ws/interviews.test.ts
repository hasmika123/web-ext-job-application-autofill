import { describe, expect, it } from "vitest";
import {
  checkDetailForm,
  checkFeedbackForm,
  dayState,
  entriesByDay,
  joinOffReason,
  joinUrl,
  monthGrid,
  nextJoinable,
  parseInterviewDetail,
  parseInterviews,
  safeMeetingUrl,
  shiftMonth,
  sortInterviews,
  type InterviewRow,
} from "./interviews";

const row = (over: Partial<InterviewRow> = {}): InterviewRow => ({
  id: 1, title: "Dev", company: "Acme", location: null, workMode: null, round: null, interviewerName: null, interviewerTitle: null,
  scheduledAt: "2026-10-15T10:00:00Z", durationMinutes: 60, status: "SCHEDULED", chip: "UPCOMING", mode: null, meetingUrl: null, prepNote: null, hasFeedback: false, ...over,
});
const tile = { value: 1, previous: 0, deltaPct: null, sparkline: [0, 1], vs: "last week" };

describe("parsers", () => {
  it("rejects a body that is not the contract and drops bad rows", () => {
    expect(parseInterviews(null)).toBeNull();
    expect(parseInterviews({ orgId: 1 })).toBeNull();
    const v = parseInterviews({
      orgId: 1, tiles: { upcoming: tile, thisWeek: tile, completed: tile, feedbackPending: tile },
      upcoming: [row(), { id: "x" }, { ...row({ id: 2 }), status: "WEIRD" }],
      calendar: [{ id: 1, scheduledAt: "2026-10-15T10:00:00Z", state: "UPCOMING", title: "Dev", company: null }, { id: 2, state: "NOPE" }],
      feedback: [{ interviewId: 1, title: "t", interviewedAt: "2026-10-01T00:00:00Z", outcome: "POSITIVE", summary: "s", updatedAt: "" }, { interviewId: 2, title: "t", interviewedAt: "x", outcome: "GREAT" }],
      pendingFeedback: [{ interviewId: 3, title: "t", interviewedAt: "2026-10-01T00:00:00Z" }],
    });
    expect(v?.upcoming).toHaveLength(1);
    expect(v?.calendar).toHaveLength(1);
    expect(v?.feedback).toHaveLength(1);
    expect(v?.pendingFeedback).toHaveLength(1);
  });
  it("parses a detail and tolerates a missing feedback", () => {
    const d = parseInterviewDetail({ interview: row(), applicationCode: "A-1", feedback: null, canEditDetails: true, canRecordFeedback: false });
    expect(d?.applicationCode).toBe("A-1");
    expect(d?.feedback).toBeNull();
    expect(parseInterviewDetail({})).toBeNull();
  });
});

describe("sort and join", () => {
  it("sorts by date both ways without mutating", () => {
    const list = [row({ id: 1, scheduledAt: "2026-10-20T10:00:00Z" }), row({ id: 2, scheduledAt: "2026-10-16T10:00:00Z" })];
    expect(sortInterviews(list, "soonest").map((r) => r.id)).toEqual([2, 1]);
    expect(sortInterviews(list, "latest").map((r) => r.id)).toEqual([1, 2]);
    expect(list[0].id).toBe(1);
  });
  it("only https links without credentials are joinable", () => {
    expect(safeMeetingUrl("https://meet.example.org/x")).not.toBeNull();
    expect(safeMeetingUrl("http://meet.example.org/x")).toBeNull();
    expect(safeMeetingUrl("javascript:alert(1)")).toBeNull();
    expect(safeMeetingUrl("https://u:p@meet.example.org/x")).toBeNull();
    expect(joinUrl(row({ meetingUrl: "https://meet.example.org/x" }))).toBe("https://meet.example.org/x");
    expect(joinUrl(row({ meetingUrl: "https://meet.example.org/x", status: "COMPLETED" }))).toBeNull();
    expect(joinOffReason(row())).toMatch(/No meeting link/);
  });
  it("picks the soonest interview that has a link", () => {
    const list = [row({ id: 1, scheduledAt: "2026-10-16T10:00:00Z" }), row({ id: 2, scheduledAt: "2026-10-18T10:00:00Z", meetingUrl: "https://meet.example.org/a" })];
    expect(nextJoinable(list)?.id).toBe(2);
    expect(nextJoinable([row()])).toBeNull();
  });
});

describe("calendar", () => {
  it("draws Sunday-first weeks that cover the month", () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g[0][0].inMonth).toBe(false);
    expect(g[0][4]).toMatchObject({ day: 1, inMonth: true });
    expect(g.length).toBeGreaterThanOrEqual(5);
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });
  it("navigates across years", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
  it("groups entries by day and picks the most pressing dot", () => {
    const e = [
      { id: 1, scheduledAt: new Date(2026, 9, 15, 10).toISOString(), state: "COMPLETED" as const, title: "a", company: null },
      { id: 2, scheduledAt: new Date(2026, 9, 15, 15).toISOString(), state: "UPCOMING" as const, title: "b", company: null },
    ];
    const m = entriesByDay(e);
    expect(m.get("2026-10-15")).toHaveLength(2);
    expect(dayState(m.get("2026-10-15")!)).toBe("UPCOMING");
    expect(dayState([])).toBeNull();
  });
});

describe("form checks", () => {
  const f = { mode: "" as const, meetingUrl: "", interviewerTitle: "", prepNote: "" };
  it("accepts an empty form and a good link", () => {
    expect(checkDetailForm(f)).toBeNull();
    expect(checkDetailForm({ ...f, meetingUrl: "https://meet.example.org/x" })).toBeNull();
  });
  it("explains what is wrong", () => {
    expect(checkDetailForm({ ...f, meetingUrl: "http://x.org" })).toMatch(/https/);
    expect(checkDetailForm({ ...f, meetingUrl: "https://a b.org" })).toMatch(/spaces/);
    expect(checkDetailForm({ ...f, prepNote: "x".repeat(2001) })).toMatch(/2000/);
    expect(checkFeedbackForm("", "x")).toMatch(/how it went/);
    expect(checkFeedbackForm("POSITIVE", "  ")).toMatch(/summary/);
    expect(checkFeedbackForm("POSITIVE", "fine")).toBeNull();
  });
});
