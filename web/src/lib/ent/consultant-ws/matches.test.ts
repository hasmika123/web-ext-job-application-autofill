import { describe, expect, it } from "vitest";
import { MAX_COMPARE, NO_FILTERS, activeFilterCount, alertAgo, distinct, filterMatches, fitTone, parseDetail, parseMatches, postedAgo, rateRank, rateText, sortMatches, toggleCompare, type MatchRow } from "./matches";

const tile = (value: number, extra: Record<string, unknown> = {}) => ({ value, previous: 1, deltaPct: 10, sparkline: [0, 1, 2], sample: false, ...extra });
const row = (over: Partial<MatchRow> = {}): MatchRow => ({
  matchId: 1, requirementId: 10, title: "Java Dev", company: "TechCorp", location: "Austin, TX", workMode: "REMOTE", employment: "CONTRACT", score: 90, skillFit: 80,
  postedAt: "2026-10-11T00:00:00Z", rateMinMinor: 8500, rateMaxMinor: 9500, rateUnit: "HOUR", currency: "USD", saved: false, viewed: false, interestSent: false, sourceUrl: null, sourceName: null, quickInfo: null, sourceSample: false, ...over,
});

const body = () => ({
  orgId: 2,
  generatedAt: "2026-10-13T00:00:00Z",
  name: "Anika Rao",
  tiles: { total: tile(8), high: tile(3), fresh: tile(2, { deltaPct: null }), saved: tile(1), viewed: tile(4) },
  matches: [row(), { bad: true }, { matchId: 3, title: "SRE", score: 250, skillFit: null, saved: true }],
  quality: { percent: 140, checks: [{ key: "profile", label: "Keep your profile up to date", done: true }, { key: 5 }] },
  alerts: [
    { key: "new-matches", kind: "NEW_MATCHES", title: "2 new job matches", detail: "Based on your profile", at: "2026-10-13T00:00:00Z" },
    { key: "x", kind: "WHATEVER", title: "t", at: "2026-10-13T00:00:00Z" },
  ],
});

describe("the marketer's source link on a match row", () => {
  it("reads link, name, note and sample mark; an unsafe or missing link is null", () => {
    const v = parseMatches({ ...body(), matches: [
      { matchId: 1, title: "A", score: 80, sourceUrl: "https://jobs.example.com/a/1", sourceName: "Dice", quickInfo: "Note", sourceSample: true },
      { matchId: 2, title: "B", score: 80, sourceUrl: "javascript:alert(1)", quickInfo: "Only a note" },
      { matchId: 3, title: "C", score: 80 },
    ] })!;
    expect(v.matches[0]).toMatchObject({ sourceUrl: "https://jobs.example.com/a/1", sourceName: "Dice", quickInfo: "Note", sourceSample: true });
    expect(v.matches[1]).toMatchObject({ sourceUrl: null, quickInfo: "Only a note", sourceSample: false });
    expect(v.matches[2]).toMatchObject({ sourceUrl: null, sourceName: null, quickInfo: null });
  });
});

describe("parseMatches", () => {
  it("reads the contract, clamps numbers and drops rows that are not the contract", () => {
    const v = parseMatches(body())!;
    expect(v.name).toBe("Anika Rao");
    expect(v.tiles.total.value).toBe(8);
    expect(v.tiles.fresh.deltaPct).toBeNull();
    expect(v.matches.map((m) => m.title)).toEqual(["Java Dev", "SRE"]);
    expect(v.matches[1].score).toBe(100);
    expect(v.matches[1].skillFit).toBeNull();
    expect(v.matches[1].saved).toBe(true);
    expect(v.quality.percent).toBe(100);
    expect(v.quality.checks).toHaveLength(1);
    expect(v.alerts.map((a) => a.key)).toEqual(["new-matches"]);
  });
  it("is null for something that is not the contract and never invents values for an empty body", () => {
    expect(parseMatches(null)).toBeNull();
    expect(parseMatches({ orgId: "2" })).toBeNull();
    const v = parseMatches({ orgId: 1, tiles: {} })!;
    expect(v.tiles.total).toEqual({ value: 0, previous: null, deltaPct: null, sparkline: [] });
    expect(v.matches).toEqual([]);
    expect(v.alerts).toEqual([]);
  });
});

describe("parseDetail", () => {
  it("reads skills, bullets and improvements", () => {
    const d = parseDetail({
      match: row(),
      reason: "Great fit",
      skills: [{ skill: "Java", present: true, primary: true, percent: 100 }, { skill: "Kubernetes", present: false, percent: 0 }, { nope: 1 }],
      explanation: [{ key: "skills", text: "You have 1 of 2", ok: true }],
      improvements: [{ tag: "GAP", title: "Kubernetes", text: "x" }, { tag: "other", title: "Certs", text: "y" }],
      interestSentAt: "2026-10-12T00:00:00Z",
    })!;
    expect(d.skills.map((s) => s.skill)).toEqual(["Java", "Kubernetes"]);
    expect(d.improvements.map((i) => i.tag)).toEqual(["GAP", "SUGGESTED"]);
    expect(d.interestSentAt).toBe("2026-10-12T00:00:00Z");
    expect(parseDetail({})).toBeNull();
  });
});

describe("sort and filter", () => {
  const a = row({ matchId: 1, title: "A", score: 80, postedAt: "2026-10-01T00:00:00Z", rateMaxMinor: 5000, rateMinMinor: 4000 });
  const b = row({ matchId: 2, title: "B", score: 95, postedAt: "2026-10-10T00:00:00Z", rateMaxMinor: null, rateMinMinor: null });
  const c = row({ matchId: 3, title: "C", score: 70, postedAt: "2026-10-12T00:00:00Z", rateMaxMinor: 12000, rateUnit: "HOUR", saved: true, employment: "FTE", workMode: "HYBRID" });
  it("sorts by score, newest and rate (no rate last) without changing the input", () => {
    const list = [a, b, c];
    expect(sortMatches(list, "score").map((m) => m.title)).toEqual(["B", "A", "C"]);
    expect(sortMatches(list, "newest").map((m) => m.title)).toEqual(["C", "B", "A"]);
    expect(sortMatches(list, "rate").map((m) => m.title)).toEqual(["C", "A", "B"]);
    expect(list.map((m) => m.title)).toEqual(["A", "B", "C"]);
  });
  it("ranks a yearly rate against an hourly one", () => {
    expect(rateRank({ rateMinMinor: null, rateMaxMinor: 12000000, rateUnit: "YEAR" })!).toBeGreaterThan(rateRank({ rateMinMinor: null, rateMaxMinor: 4000, rateUnit: "HOUR" })!);
  });
  it("filters by score, type, mode and saved, and counts the active ones", () => {
    const list = [a, b, c];
    expect(filterMatches(list, { ...NO_FILTERS, minScore: 80 }).map((m) => m.title)).toEqual(["A", "B"]);
    expect(filterMatches(list, { ...NO_FILTERS, employment: "FTE" }).map((m) => m.title)).toEqual(["C"]);
    expect(filterMatches(list, { ...NO_FILTERS, workMode: "HYBRID" }).map((m) => m.title)).toEqual(["C"]);
    expect(filterMatches(list, { ...NO_FILTERS, savedOnly: true }).map((m) => m.title)).toEqual(["C"]);
    expect(activeFilterCount({ minScore: 80, employment: "FTE", workMode: "", savedOnly: true })).toBe(3);
    expect(distinct(list, (m) => m.employment)).toEqual(["CONTRACT", "FTE"]);
  });
});

describe("compare", () => {
  it("toggles and holds at three", () => {
    let ids: number[] = [];
    for (const id of [1, 2, 3, 4]) ids = toggleCompare(ids, id);
    expect(ids).toEqual([1, 2, 3]);
    expect(ids).toHaveLength(MAX_COMPARE);
    expect(toggleCompare(ids, 2)).toEqual([1, 3]);
  });
});

describe("labels", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  it("posted and alert times", () => {
    expect(postedAgo("2026-10-13T01:00:00Z", now)).toBe("Today");
    expect(postedAgo("2026-10-12T01:00:00Z", now)).toBe("1 day ago");
    expect(postedAgo("2026-10-11T01:00:00Z", now)).toBe("2 days ago");
    expect(postedAgo("2026-09-20T01:00:00Z", now)).toBe("3 weeks ago");
    expect(postedAgo(null, now)).toBe("");
    expect(alertAgo("2026-10-13T10:00:00Z", now)).toBe("2h ago");
    expect(alertAgo("2026-10-12T10:00:00Z", now)).toBe("1d ago");
    expect(alertAgo("2026-10-13T11:59:00Z", now)).toBe("just now");
  });
  it("rate text and fit tone", () => {
    expect(rateText(row())).toBe("$85-95/hr");
    expect(rateText(row({ rateMinMinor: 12000000, rateMaxMinor: 12000000, rateUnit: "YEAR" }))).toBe("$120k/yr");
    expect(rateText(row({ rateMinMinor: null, rateMaxMinor: null }))).toBeNull();
    expect(fitTone(90)).toBe("green");
    expect(fitTone(60)).toBe("amber");
    expect(fitTone(10)).toBe("red");
  });
});
