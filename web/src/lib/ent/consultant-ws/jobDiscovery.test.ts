import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  applyChip,
  countFilters,
  demandText,
  filtersSummary,
  hasFilters,
  isChipOn,
  matchBand,
  matchBlurb,
  moneyShort,
  parseDetail,
  parseJob,
  parseOverview,
  parseSearch,
  placeText,
  rateText,
  relativeTime,
  searchQuery,
  type Chip,
  type Job,
} from "./jobDiscovery";

const job = (over: Record<string, unknown> = {}) => ({ id: 7, title: "Data Engineer", clientId: 3, clientName: "TechCorp", skills: ["Python", "SQL"], postedAt: "2026-10-01T00:00:00Z", currency: "USD", ...over });

describe("parseJob and parseSearch", () => {
  it("reads a job and keeps only what the contract says", () => {
    const j = parseJob(job({ rateMinMinor: 9500, rateMaxMinor: 12000, rateUnit: "HOUR", score: 92, scoreSource: "MATCH", relation: "ASSIGNED", featured: true, saved: true }))!;
    expect(j.title).toBe("Data Engineer");
    expect(j.score).toBe(92);
    expect(j.scoreSource).toBe("MATCH");
    expect(j.relation).toBe("ASSIGNED");
    expect(j.featured).toBe(true);
    expect(j.skills).toEqual(["Python", "SQL"]);
  });

  it("never invents a score: missing or non-numeric stays null, out-of-range is clamped", () => {
    expect(parseJob(job())!.score).toBeNull();
    expect(parseJob(job({ score: "high" }))!.score).toBeNull();
    expect(parseJob(job({ score: 140 }))!.score).toBe(100);
    expect(parseJob(job({ score: -5 }))!.score).toBe(0);
    expect(parseJob(job({ scoreSource: "GUESS" }))!.scoreSource).toBeNull();
  });

  it("reads the marketer's source link, name, quick info and the sample mark; an unsafe link becomes null", () => {
    const j = parseJob(job({ sourceUrl: "https://jobs.example.com/a/1", sourceName: "LinkedIn", quickInfo: "Contract role.", sourceSample: true }))!;
    expect(j.sourceUrl).toBe("https://jobs.example.com/a/1");
    expect(j.sourceName).toBe("LinkedIn");
    expect(j.quickInfo).toBe("Contract role.");
    expect(j.sourceSample).toBe(true);
    const none = parseJob(job())!;
    expect(none.sourceUrl).toBeNull();
    expect(none.sourceSample).toBe(false);
    for (const bad of ["http://x.example.com/a", "javascript:alert(1)", "https://u:p@x.example.com", "https://localhost/x", "https://x.example.com/a b", 7]) {
      expect(parseJob(job({ sourceUrl: bad }))!.sourceUrl).toBeNull();
    }
  });

  it("falls back to NONE for an unknown relation and drops rows without an id or title", () => {
    expect(parseJob(job({ relation: "WEIRD" }))!.relation).toBe("NONE");
    expect(parseJob({ title: "x" })).toBeNull();
    const s = parseSearch({ total: 2, page: 0, size: 10, sort: "newest", items: [job(), { nope: true }, "x"] })!;
    expect(s.items).toHaveLength(1);
    expect(s.sort).toBe("newest");
    expect(parseSearch({ items: [] })).toBeNull();
    expect(parseSearch(null)).toBeNull();
  });

  it("parses a detail (the marketer's notes and open positions; there is no apply state any more)", () => {
    const d = parseDetail({ job: job(), description: "About", openPositions: 2, apply: { state: "CAN_RECORD", message: "m" } })!;
    expect(d.description).toBe("About");
    expect(d.openPositions).toBe(2);
    expect("apply" in d).toBe(false);
    expect(parseDetail({ job: { nope: 1 } })).toBeNull();
  });
});

describe("parseOverview", () => {
  it("is tolerant: bad rows are dropped, empty blocks stay empty", () => {
    const o = parseOverview({
      orgId: 2,
      openJobs: 12,
      me: { consultantId: 1, name: "Anika" },
      filterOptions: { jobTypes: [{ value: "CONTRACT", label: "CONTRACT", count: 9 }, { value: 1 }], skills: [] },
      recommended: [{ key: "skill:aws", label: "AWS", kind: "skill", value: "AWS", source: "profile" }, { key: "x", label: "Bad", kind: "weird", value: "v" }],
      trending: [{ skill: "AWS", openJobs: 8, recent: 5, prior: 4, changePct: 25 }],
      savedSearches: [{ id: 1, name: "Remote", filters: { q: "data", workMode: "REMOTE" }, newResults: 4 }],
      recentSearches: [{ id: 9, label: "data, Remote", filters: {}, at: "2026-10-12T00:00:00Z" }],
    })!;
    expect(o.openJobs).toBe(12);
    expect(o.filterOptions.jobTypes).toHaveLength(1);
    expect(o.filterOptions.clients).toEqual([]);
    expect(o.recommended).toHaveLength(1);
    expect(o.recommended[0].source).toBe("profile");
    expect(o.trending[0].changePct).toBe(25);
    expect(o.savedSearches[0].filters.workMode).toBe("REMOTE");
    expect(parseOverview({})).toBeNull();
  });
});

describe("searchQuery and filter helpers", () => {
  it("sends only the filters that are set", () => {
    expect(searchQuery(EMPTY_FILTERS, "match", 0, 10)).toBe("sort=match&page=0&size=10");
    const q = searchQuery({ ...EMPTY_FILTERS, q: " data engineer ", workMode: "REMOTE", clientId: 5, minRateMinor: 10000 }, "rate", 2, 10, 60);
    const p = new URLSearchParams(q);
    expect(p.get("q")).toBe("data engineer");
    expect(p.get("workMode")).toBe("REMOTE");
    expect(p.get("clientId")).toBe("5");
    expect(p.get("minRateMinor")).toBe("10000");
    expect(p.get("sort")).toBe("rate");
    expect(p.get("page")).toBe("2");
    expect(p.get("minScore")).toBe("60");
    expect(p.has("location")).toBe(false);
  });

  it("counts filters and knows when there are none", () => {
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
    expect(countFilters({ ...EMPTY_FILTERS, q: "x", skill: "AWS", clientId: 2, minRateMinor: 5000 })).toBe(4);
    expect(hasFilters({ ...EMPTY_FILTERS, location: "  " })).toBe(false);
  });

  it("a recommended chip applies its filter and applying it again removes it", () => {
    const chip: Chip = { key: "skill:aws", label: "AWS", kind: "skill", value: "AWS", source: "profile" };
    const on = applyChip(EMPTY_FILTERS, chip);
    expect(on.skill).toBe("AWS");
    expect(isChipOn(on, chip)).toBe(true);
    expect(applyChip(on, chip).skill).toBe("");
    const rate: Chip = { key: "minRate:80", label: "$80+/hr", kind: "minRate", value: "8000", source: "market" };
    expect(applyChip(EMPTY_FILTERS, rate).minRateMinor).toBe(8000);
    expect(applyChip(applyChip(EMPTY_FILTERS, rate), rate).minRateMinor).toBeNull();
    const mode: Chip = { key: "workMode:REMOTE", label: "Remote Friendly", kind: "workMode", value: "REMOTE", source: "profile" };
    expect(applyChip(EMPTY_FILTERS, mode).workMode).toBe("REMOTE");
    expect(isChipOn({ ...EMPTY_FILTERS, skill: "aws" }, chip)).toBe(true);
  });

  it("summarises a saved search in words", () => {
    expect(filtersSummary({ ...EMPTY_FILTERS, q: "data engineer", workMode: "REMOTE", jobType: "CONTRACT", minRateMinor: 8000 })).toBe("data engineer, Remote, Contract, $80+/hr");
    expect(filtersSummary(EMPTY_FILTERS)).toBe("All jobs");
  });
});

describe("rate, match and place text", () => {
  const base: Pick<Job, "rateMinMinor" | "rateMaxMinor" | "rateUnit" | "currency"> = { rateMinMinor: 9500, rateMaxMinor: 12000, rateUnit: "HOUR", currency: "USD" };
  it("formats minor units as $95 - $120/hr", () => {
    expect(rateText(base)).toBe("$95 - $120/hr");
    expect(rateText({ ...base, rateMinMinor: 12000000, rateMaxMinor: 15000000, rateUnit: "YEAR" })).toBe("$120,000 - $150,000/yr");
    expect(rateText({ ...base, rateMinMinor: 9550 })).toBe("$95.50 - $120/hr");
    expect(rateText({ ...base, rateMaxMinor: null })).toBe("From $95/hr");
    expect(rateText({ ...base, rateMinMinor: null })).toBe("Up to $120/hr");
    expect(rateText({ ...base, rateMinMinor: 9500, rateMaxMinor: 9500 })).toBe("$95/hr");
    expect(rateText({ rateMinMinor: null, rateMaxMinor: null, rateUnit: null, currency: "USD" })).toBeNull();
    expect(moneyShort(1.5, "USD")).toBeNull();
  });

  it("bands the match score like the board", () => {
    expect(matchBand(92).label).toBe("Excellent match");
    expect(matchBand(86).label).toBe("Great match");
    expect(matchBand(78).label).toBe("Good match");
    expect(matchBand(76).label).toBe("Good match");
    expect(matchBand(68).label).toBe("Potential match");
    expect(matchBand(95).tone).toBe("green");
    expect(matchBand(10).tone).toBe("amber");
  });

  it("says honestly where the score comes from", () => {
    expect(matchBlurb({ score: null, scoreSource: null, matchedSkills: 0, totalSkills: 0 })).toMatch(/Add skills/);
    expect(matchBlurb({ score: 67, scoreSource: "SKILLS", matchedSkills: 2, totalSkills: 3 })).toBe("You have 2 of 3 required skills.");
    expect(matchBlurb({ score: 90, scoreSource: "MATCH", matchedSkills: 0, totalSkills: 0 })).toMatch(/marketer/);
  });

  it("names the place", () => {
    expect(placeText("Austin, TX", "REMOTE")).toBe("Remote");
    expect(placeText("Austin, TX", "HYBRID")).toBe("Austin, TX");
    expect(placeText(null, "ON_SITE")).toBe("On-site");
    expect(placeText(null, null)).toBe("Not specified");
  });
});

describe("demand and time", () => {
  it("shows demand change only when the API had enough data to give one", () => {
    expect(demandText({ changePct: 42 })).toEqual({ text: "+42% demand", dir: "up" });
    expect(demandText({ changePct: -10.4 })).toEqual({ text: "-10% demand", dir: "down" });
    expect(demandText({ changePct: 0 })).toEqual({ text: "steady demand", dir: "flat" });
    expect(demandText({ changePct: null })).toBeNull();
  });

  it("writes relative times", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(relativeTime("2026-10-13T10:00:00Z", now)).toBe("2 hours ago");
    expect(relativeTime("2026-10-12T12:00:00Z", now)).toBe("1 day ago");
    expect(relativeTime("2026-10-10T12:00:00Z", now)).toBe("3 days ago");
    expect(relativeTime("2026-09-29T12:00:00Z", now)).toBe("2 weeks ago");
    expect(relativeTime("2026-10-13T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("nope", now)).toBe("");
  });
});
