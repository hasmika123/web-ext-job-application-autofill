import { describe, expect, it } from "vitest";
import {
  bulkSummary,
  DEFAULT_QUERY,
  errorSentence,
  hasFilters,
  initialsOf,
  listParams,
  nextSort,
  pageCount,
  parseUrl,
  postedText,
  rateText,
  showingText,
  skillChips,
  tileDelta,
  undoGroups,
  urlParams,
  type BulkResult,
  type JobQuery,
} from "./jobs";

const q = (over: Partial<JobQuery> = {}): JobQuery => ({ ...DEFAULT_QUERY, sort: { ...DEFAULT_QUERY.sort }, ...over });

describe("tileDelta", () => {
  it("writes the plain difference, or the percent when the board does", () => {
    expect(tileDelta({ previous: 18, delta: 6, deltaPercent: 33.3 }, "count")).toEqual({ dir: "up", text: "+6" });
    expect(tileDelta({ previous: 6, delta: 2, deltaPercent: 33.3 }, "percent")).toEqual({ dir: "up", text: "+33.3%" });
    expect(tileDelta({ previous: 8, delta: -2, deltaPercent: -25 }, "percent")).toEqual({ dir: "down", text: "-25%" });
    expect(tileDelta({ previous: 5, delta: 0, deltaPercent: 0 }, "count")).toEqual({ dir: "flat", text: "0" });
  });
  it("falls back to the difference when the previous figure was zero", () => {
    expect(tileDelta({ previous: 0, delta: 8, deltaPercent: null }, "percent")).toEqual({ dir: "up", text: "+8" });
  });
  it("draws nothing without history", () => {
    expect(tileDelta({ previous: null, delta: null, deltaPercent: null }, "count")).toBeNull();
    expect(tileDelta(null, "count")).toBeNull();
  });
});

describe("the query and the address", () => {
  it("sends only what is set, and a search of at least two characters", () => {
    expect(listParams(q({ q: "r" })).has("q")).toBe(false);
    const p = listParams(q({ q: " react ", status: "OPEN", clientId: "7", sort: { key: "match", dir: "desc" }, page: 2, size: 25 }));
    expect(p.get("q")).toBe("react");
    expect(p.get("status")).toBe("OPEN");
    expect(p.get("clientId")).toBe("7");
    expect(p.get("sort")).toBe("match");
    expect(p.get("dir")).toBe("desc");
    expect(p.get("page")).toBe("2");
    expect(p.get("size")).toBe("25");
    expect(p.has("location")).toBe(false);
  });

  it("round-trips the view, with 1-based pages in the address", () => {
    const view = q({ q: "react", status: "OPEN", workMode: "HYBRID", location: "New York, NY", minMatch: "90", sort: { key: "title", dir: "asc" }, page: 1, size: 25 });
    const params = urlParams(view, 12, "matches");
    expect(params.get("page")).toBe("2");
    expect(params.get("job")).toBe("12");
    expect(params.get("tab")).toBe("matches");
    const back = parseUrl(new URLSearchParams(params.toString()));
    expect(back.query).toEqual(view);
    expect(back.openId).toBe(12);
    expect(back.tab).toBe("matches");
  });

  it("keeps the default address empty", () => {
    expect(urlParams(q(), null, "overview").toString()).toBe("");
  });

  it("falls back to the defaults on junk in the address", () => {
    const u = parseUrl(new URLSearchParams("sort=nope&page=-3&size=7&job=abc&tab=zzz"));
    expect(u.query.sort).toEqual(DEFAULT_QUERY.sort);
    expect(u.query.page).toBe(0);
    expect(u.query.size).toBe(DEFAULT_QUERY.size);
    expect(u.openId).toBeNull();
    expect(u.tab).toBe("overview");
  });

  it("flips a sorted column and starts a new one with its natural direction", () => {
    expect(nextSort({ key: "posted", dir: "desc" }, "posted")).toEqual({ key: "posted", dir: "asc" });
    expect(nextSort({ key: "posted", dir: "desc" }, "title")).toEqual({ key: "title", dir: "asc" });
    expect(nextSort({ key: "title", dir: "asc" }, "submissions")).toEqual({ key: "submissions", dir: "desc" });
  });

  it("knows when a filter is on", () => {
    expect(hasFilters(q())).toBe(false);
    expect(hasFilters(q({ q: "a" }))).toBe(false);
    expect(hasFilters(q({ q: "ab" }))).toBe(true);
    expect(hasFilters(q({ minMatch: "80" }))).toBe(true);
  });
});

describe("text helpers", () => {
  it("writes ranges, single rates and no rate", () => {
    expect(rateText({ min: 120, max: 160, unit: "HOUR", currency: "USD" })).toBe("$120 - $160 / hour");
    expect(rateText({ min: 140000, max: null, unit: "YEAR", currency: "USD" })).toBe("$140,000 / year");
    expect(rateText({ min: null, max: null, unit: null, currency: "USD" })).toBe("");
    expect(rateText(null)).toBe("");
  });
  it("shows three skills and counts the rest", () => {
    expect(skillChips(["a", "b", "c", "d", "e"])).toEqual({ shown: ["a", "b", "c"], more: 2 });
    expect(skillChips(["a"])).toEqual({ shown: ["a"], more: 0 });
  });
  it("writes dates, initials and the page footer", () => {
    expect(postedText("2026-03-18T10:00:00Z")).toBe("Mar 18, 2026");
    expect(postedText(null)).toBe("");
    expect(initialsOf("Jessica Davis")).toBe("JD");
    expect(initialsOf("Cher")).toBe("CH");
    expect(showingText(24, 0, 10, 10)).toBe("1–10 of 24 jobs");
    expect(showingText(1, 0, 10, 1)).toBe("1–1 of 1 job");
    expect(showingText(0, 0, 10, 0)).toBe("0 jobs");
    expect(pageCount(24, 10)).toBe(3);
    expect(pageCount(0, 10)).toBe(1);
  });
  it("turns refusals into sentences", () => {
    expect(errorSentence({ status: 412, message: "x" })).toContain("Someone else changed");
    expect(errorSentence({ status: 404, message: "x" })).toContain("no longer in your view");
    expect(errorSentence({ status: 409, code: "JOB_NOT_OPEN", message: "x" })).toContain("Reopen");
    expect(errorSentence({ status: 422, message: "title: at least 2 characters" })).toBe("title: at least 2 characters");
    expect(errorSentence({ status: 0, message: "offline" })).toBe("offline");
  });
});

describe("bulk results", () => {
  const res: BulkResult = {
    action: "status",
    requested: 4,
    ok: 3,
    skipped: [{ id: 4, reason: "UNCHANGED" }],
    results: [
      { id: 1, ok: true, reason: null, previous: { status: "OPEN" } },
      { id: 2, ok: true, reason: null, previous: { status: "ON_HOLD" } },
      { id: 3, ok: true, reason: null, previous: { status: "OPEN" } },
      { id: 4, ok: false, reason: "UNCHANGED", previous: { status: "CLOSED" } },
    ],
  };
  it("groups the Undo by the status each job had, skipping the ones that did not change", () => {
    expect(undoGroups(res.results)).toEqual([
      { status: "OPEN", ids: [1, 3] },
      { status: "ON_HOLD", ids: [2] },
    ]);
  });
  it("summarises", () => {
    expect(bulkSummary(res, "closed")).toEqual({ title: "3 jobs closed", description: "1 job skipped (already in that state or not in your view).", variant: "success" });
    expect(bulkSummary({ ...res, ok: 0 }, "closed").variant).toBe("error");
  });
});
