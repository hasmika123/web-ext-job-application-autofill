import { describe, expect, it } from "vitest";
import {
  chipText,
  csvCell,
  dayHeading,
  dotTone,
  groupByDay,
  hrefFor,
  mergeEvents,
  milestoneDate,
  parseEvent,
  parseTimeline,
  queryString,
  rangeLabel,
  timelineCsv,
  type TimelineEvent,
} from "./activityTimeline";

const tile = (value: number, deltaPct: number | null = null) => ({ value, previous: deltaPct === null ? 0 : 1, deltaPct, sparkline: [0, 1, 2, 3, 4, value], vs: "month" });
const ev = (o: Record<string, unknown> = {}) => ({
  key: "resume:1", type: "RESUME_UPDATED", group: "RESUME", category: "PROFILE", at: "2026-10-12T10:24:00Z", title: "Resume Updated", description: "You updated your resume.",
  chip: { kind: "FILE", primary: "Senior Java Developer Resume.pdf", secondary: null, company: null, from: null, to: null }, actionLabel: "View Resume", target: "resumes", sample: false, ...o,
});
const body = (o: Record<string, unknown> = {}) => ({
  orgId: 2, generatedAt: "2026-10-13T00:00:00Z", consultantName: "Casey", tiles: { total: tile(5, 20), thisWeek: tile(2), applications: tile(1), interviews: tile(0), profile: tile(1) },
  type: "ALL", days: 30, total: 1, events: [ev()], nextCursor: null, milestones: [{ key: "offer-received", label: "Offer Received", reached: true, on: "2026-10-05T09:18:00Z" }, { key: "project-start", label: "Project Start Date", reached: false, on: null }], ...o,
});

describe("parser", () => {
  it("reads the contract and keeps a missing delta as null", () => {
    const v = parseTimeline(body())!;
    expect(v.events).toHaveLength(1);
    expect(v.events[0].chip?.kind).toBe("FILE");
    expect(v.tiles.total.deltaPct).toBe(20);
    expect(v.tiles.thisWeek.deltaPct).toBeNull();
    expect(v.milestones.map((m) => m.reached)).toEqual([true, false]);
    expect(v.nextCursor).toBeNull();
  });
  it("drops rows that are not the contract and rejects a body without tiles", () => {
    expect(parseEvent({ key: "x" })).toBeNull();
    expect(parseEvent(ev({ at: "not a date" }))).toBeNull();
    expect(parseTimeline(body({ events: [ev(), { nope: true }, ev({ key: "b" })] }))!.events.map((e) => e.key)).toEqual(["resume:1", "b"]);
    expect(parseTimeline({ orgId: 1 })).toBeNull();
    expect(parseTimeline(null)).toBeNull();
    expect(parseTimeline(body({ tiles: { total: tile(1) } }))).toBeNull();
  });
  it("ignores an unknown chip kind", () => {
    expect(parseEvent(ev({ chip: { kind: "WAT", primary: "x" } }))!.chip).toBeNull();
  });
});

describe("merge, grouping and links", () => {
  it("never repeats an event when a refresh overlaps a page", () => {
    const a = parseEvent(ev())!;
    const b = parseEvent(ev({ key: "b" }))!;
    expect(mergeEvents([a], [a, b]).map((e) => e.key)).toEqual(["resume:1", "b"]);
  });
  it("groups consecutive events of one day", () => {
    const e = (key: string, at: string) => parseEvent(ev({ key, at }))! as TimelineEvent;
    const g = groupByDay([e("a", "2026-10-12T10:00:00Z"), e("b", "2026-10-12T08:00:00Z"), e("c", "2026-10-11T23:00:00Z")], "UTC");
    expect(g.map((x) => [x.day, x.events.length])).toEqual([["Oct 12, 2026", 2], ["Oct 11, 2026", 1]]);
  });
  it("calls the two latest days Today and Yesterday", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(dayHeading("2026-10-13T01:00:00Z", now, "UTC")).toBe("Today");
    expect(dayHeading("2026-10-12T23:00:00Z", now, "UTC")).toBe("Yesterday");
    expect(dayHeading("2026-10-01T23:00:00Z", now, "UTC")).toBe("Oct 1, 2026");
  });
  it("links to the owning page and colours the dot by group", () => {
    expect(hrefFor("/w/consultant", { target: "offers" })).toBe("/w/consultant/offers");
    expect(hrefFor("/w/consultant", { target: "" })).toBe("/w/consultant");
    expect(dotTone({ group: "OFFER", type: "OFFER_RECEIVED" })).toBe("amber");
    expect(dotTone({ group: "SUBMISSION", type: "MARKETER_NOTE" })).toBe("red");
    expect(dotTone({ group: "NEW", type: "X" })).toBe("slate");
  });
  it("formats a date range and a milestone date, and shows a dash for an open one", () => {
    expect(rangeLabel("2026-10-15T10:00:00Z", "2026-10-15T11:00:00Z", "UTC")).toEqual({ day: "Oct 15, 2026", time: "10:00 AM - 11:00 AM" });
    expect(rangeLabel(null, null)).toBeNull();
    expect(milestoneDate({ key: "k", label: "l", reached: false, on: null })).toBe("-");
    expect(milestoneDate({ key: "k", label: "l", reached: true, on: "2026-10-05T09:18:00Z" })).toBe("Oct 5, 2026");
  });
});

describe("query", () => {
  it("omits the type for All and always sends days and size", () => {
    expect(queryString({ type: "ALL", days: 30 })).toBe("days=30&size=20");
    expect(queryString({ type: "OFFER", days: 7 }, "abc_-", 5)).toBe("type=OFFER&days=7&size=5&cursor=abc_-");
  });
});

describe("CSV export", () => {
  it("quotes commas and quotes and neutralizes formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("line1\nline2")).toBe("line1 line2");
  });
  it("writes a header and one line per loaded row", () => {
    const csv = timelineCsv([parseEvent(ev())!], "UTC");
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("Date,Time,Activity,Title,Description,Context");
    expect(lines[1]).toBe("\"Oct 12, 2026\",10:24 AM,RESUME_UPDATED,Resume Updated,You updated your resume.,Senior Java Developer Resume.pdf");
    expect(lines).toHaveLength(2);
    expect(chipText(null)).toBe("");
  });
});
