import { describe, expect, it } from "vitest";
import {
  calendarParams,
  DEFAULT_VIEW,
  errorSentence,
  filtersActive,
  formatRange,
  formatWhenLine,
  listParams,
  monthGrid,
  monthRange,
  moreFiltersActive,
  nextSort,
  pageCount,
  parseView,
  rangeLabel,
  shiftMonth,
  showingText,
  stepLine,
  viewParams,
} from "./interviews";

describe("the URL state of the Interviews page", () => {
  it("round-trips a view and keeps the link short", () => {
    const v = parseView(new URLSearchParams("tab=calendar&q=react&status=COMPLETED&client=7&mode=VIDEO&sort=client,asc&page=3&size=25&iv=12&dtab=feedback&month=2026-11&layout=grid"));
    expect(v).toMatchObject({ tab: "calendar", q: "react", status: "COMPLETED", client: "7", mode: "VIDEO", sort: { key: "client", dir: "asc" }, page: 2, size: 25, selected: 12, detailTab: "feedback", month: "2026-11", layout: "grid" });
    expect(parseView(viewParams(v))).toEqual(v);
    expect(viewParams(DEFAULT_VIEW).toString()).toBe("");
  });

  it("falls back on anything malformed", () => {
    const v = parseView(new URLSearchParams("tab=zzz&status=NOPE&client=x1&sort=bogus,up&page=-4&size=7&iv=abc&dtab=x&month=2026-13&from=yesterday&mode=TELEPATHY"));
    expect(v).toEqual(DEFAULT_VIEW);
  });

  it("builds the API query from the view", () => {
    const v = { ...DEFAULT_VIEW, q: "ab", status: "SCHEDULED", client: "3", consultant: "9", round: "Final Round", mode: "ONSITE", from: "2026-10-01", to: "2026-10-31", page: 2 };
    const p = listParams(v);
    expect(Object.fromEntries(p)).toEqual({ q: "ab", status: "SCHEDULED", clientId: "3", consultantId: "9", round: "Final Round", mode: "ONSITE", from: "2026-10-01", to: "2026-10-31", sort: "scheduled,desc", page: "2", size: "10" });
    expect(listParams({ ...DEFAULT_VIEW, q: "a" }).has("q")).toBe(false); // one letter is not a search
    const c = calendarParams({ ...v, from: "x", to: "y" }, "2026-02");
    expect(c.get("from")).toBe("2026-02-01");
    expect(c.get("to")).toBe("2026-02-28");
    expect(c.get("size")).toBe("100");
  });

  it("knows when filters are on and how many hide behind More Filters", () => {
    expect(filtersActive(DEFAULT_VIEW)).toBe(false);
    expect(filtersActive({ ...DEFAULT_VIEW, mode: "VIDEO" })).toBe(true);
    expect(moreFiltersActive({ ...DEFAULT_VIEW, mode: "VIDEO", round: "x", status: "SCHEDULED" })).toBe(2);
  });

  it("sorts like the other boards: the date starts newest first", () => {
    expect(nextSort({ key: "scheduled", dir: "desc" }, "scheduled")).toEqual({ key: "scheduled", dir: "asc" });
    expect(nextSort({ key: "scheduled", dir: "desc" }, "client")).toEqual({ key: "client", dir: "asc" });
    expect(nextSort({ key: "client", dir: "asc" }, "scheduled")).toEqual({ key: "scheduled", dir: "desc" });
  });
});

describe("display helpers", () => {
  it("writes the board's texts", () => {
    expect(showingText(124, 0, 10, 10)).toBe("1–10 of 124 interviews");
    expect(showingText(1, 0, 10, 1)).toBe("1–1 of 1 interview");
    expect(showingText(0, 0, 10, 0)).toBe("No interviews");
    expect(pageCount(124, 10)).toBe(13);
    expect(formatRange("2026-04-18T10:00:00Z", 60)).toBe("10:00 AM - 11:00 AM");
    expect(formatWhenLine("2026-04-18T10:00:00Z", 60)).toBe("Apr 18, 2026 • 10:00 AM - 11:00 AM");
    expect(rangeLabel("", "")).toBe("Any date");
    expect(rangeLabel("2026-04-01", "2026-04-30")).toBe("Apr 1, 2026 – Apr 30, 2026");
    expect(stepLine({ key: "final", label: "Final Round", at: null, state: "NOT_SCHEDULED", interviewId: null })).toBe("Not scheduled");
    expect(stepLine({ key: "iv-1", label: "Technical", at: "2026-04-18T10:00:00Z", state: "CURRENT", interviewId: 1 })).toBe("Apr 18, 2026 - 10:00 AM");
  });

  it("says why a request failed in plain words", () => {
    expect(errorSentence({ status: 409, code: "SLOT_OVERLAP", message: "x" })).toMatch(/already has an interview/);
    expect(errorSentence({ status: 404, message: "x" })).toMatch(/no longer in your view/);
    expect(errorSentence({ status: 422, message: "Too long" })).toBe("Too long");
  });
});

describe("the calendar", () => {
  it("builds a full six-week Monday grid", () => {
    const g = monthGrid("2026-10");
    expect(g).toHaveLength(6);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0][0]).toBe("2026-09-28"); // 1 Oct 2026 is a Thursday
    expect(g.flat()).toContain("2026-10-31");
  });

  it("moves between months and finds their ends", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2024-02")).toEqual(["2024-02-01", "2024-02-29"]);
  });
});
