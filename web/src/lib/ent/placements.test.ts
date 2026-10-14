import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  defaultSort,
  dayParts,
  errorSentence,
  extensionSummary,
  filtersActive,
  footText,
  formatDay,
  listParams,
  moreFiltersActive,
  pageCount,
  parseView,
  rateText,
  relativeDays,
  showingText,
  viewParams,
  type PlacementDetail,
} from "./placements";

const parse = (qs: string) => parseView(new URLSearchParams(qs));

describe("the placements URL state", () => {
  it("starts on the active tab, soonest end first, ten rows, nothing open", () => {
    const v = parse("");
    expect(v).toMatchObject({ tab: "active", q: "", sort: { key: "end", dir: "asc" }, page: 0, size: 10, mode: "list", selected: null, detailTab: "overview" });
    expect(viewParams(v).toString()).toBe("");
  });

  it("a completed placement reads latest end first by default and says so only when it differs", () => {
    expect(defaultSort("completed")).toEqual({ key: "end", dir: "desc" });
    const v = parse("tab=completed");
    expect(v.sort).toEqual({ key: "end", dir: "desc" });
    expect(viewParams(v).toString()).toBe("tab=completed");
    expect(viewParams({ ...v, sort: { key: "end", dir: "asc" } }).toString()).toBe("tab=completed&sort=end%2Casc");
  });

  it("round-trips a full view through the URL", () => {
    const qs = "tab=extensions&q=data+eng&client=3&role=QA+Lead&status=ENDING_SOON&manager=9&type=C2C&sf=2026-01-01&st=2026-02-01&ef=2026-03-01&et=2026-04-01&sort=rate%2Cdesc&page=3&size=25&view=grid&pl=42&dtab=notes";
    const v = parse(qs);
    expect(v).toMatchObject({ tab: "extensions", q: "data eng", client: "3", role: "QA Lead", status: "ENDING_SOON", manager: "9", type: "C2C", startFrom: "2026-01-01", startTo: "2026-02-01", endFrom: "2026-03-01", endTo: "2026-04-01", sort: { key: "rate", dir: "desc" }, page: 2, size: 25, mode: "grid", selected: 42, detailTab: "notes" });
    expect(parse(viewParams(v).toString())).toEqual(v);
  });

  it("a hand-edited link never breaks the page", () => {
    const v = parse("tab=nope&client=abc&status=NOPE&type=WEEKEND&sf=yesterday&sort=bogus,sideways&page=-4&size=7&pl=x&dtab=zzz&q=" + "x".repeat(200));
    expect(v).toMatchObject({ tab: "active", client: "", status: "", type: "", startFrom: "", sort: DEFAULT_VIEW.sort, page: 0, size: 10, selected: null, detailTab: "overview" });
    expect(v.q).toHaveLength(80);
  });

  it("sends the API only what it accepts: a search needs two characters, dates and ids go under the API names", () => {
    const p = listParams({ ...DEFAULT_VIEW, q: "a", client: "3", manager: "9", startFrom: "2026-01-01", endTo: "2026-04-01", page: 2 });
    expect(p.get("q")).toBeNull();
    expect(p.get("tab")).toBe("active");
    expect(p.get("clientId")).toBe("3");
    expect(p.get("managerId")).toBe("9");
    expect(p.get("startFrom")).toBe("2026-01-01");
    expect(p.get("endTo")).toBe("2026-04-01");
    expect(p.get("sort")).toBe("end,asc");
    expect(p.get("page")).toBe("2");
    expect(listParams({ ...DEFAULT_VIEW, q: "ab" }).get("q")).toBe("ab");
  });

  it("knows when a filter is on", () => {
    expect(filtersActive(DEFAULT_VIEW)).toBe(false);
    expect(filtersActive({ ...DEFAULT_VIEW, q: "a" })).toBe(false);
    expect(filtersActive({ ...DEFAULT_VIEW, q: "ab" })).toBe(true);
    expect(filtersActive({ ...DEFAULT_VIEW, role: "QA" })).toBe(true);
    expect(moreFiltersActive({ ...DEFAULT_VIEW, manager: "1", endTo: "2026-04-01", client: "3" })).toBe(2);
  });
});

describe("how the page words things", () => {
  it("counts pages and reads the row counts like the board", () => {
    expect(pageCount(142, 10)).toBe(15);
    expect(pageCount(0, 10)).toBe(1);
    expect(showingText(142, 0, 10, 10, "active")).toBe("1-10 of 142 active placements");
    expect(showingText(18, 1, 10, 8, "upcoming")).toBe("11-18 of 18 upcoming placements");
    expect(showingText(0, 0, 10, 0, "active")).toBe("No placements");
    expect(footText(142, 0, 10, 10)).toBe("1-10 of 142 placements");
    expect(footText(1, 0, 10, 1)).toBe("1-1 of 1 placement");
  });

  it("writes dates in UTC so the day never shifts", () => {
    expect(formatDay("2026-01-15")).toBe("Jan 15, 2026");
    expect(formatDay("2026-01-15T23:30:00Z")).toBe("Jan 15, 2026");
    expect(formatDay(null)).toBe("");
    expect(dayParts("2026-06-15")).toEqual({ md: "Jun 15", year: "2026" });
    expect(dayParts(null)).toEqual({ md: "", year: "" });
  });

  it("writes how far away a day is", () => {
    expect(relativeDays(45)).toBe("in 45 days");
    expect(relativeDays(1)).toBe("tomorrow");
    expect(relativeDays(0)).toBe("today");
    expect(relativeDays(-3)).toBe("3 days ago");
    expect(relativeDays(null)).toBe("");
  });

  it("writes a recorded rate and nothing for one the caller may not see", () => {
    expect(rateText(12500, "HOUR", "USD")).toBe("$125/hr");
    expect(rateText(12550, "HOUR", "USD")).toBe("$125.5/hr");
    expect(rateText(800000, "MONTH", "USD")).toBe("$8,000/mo");
    expect(rateText(9000, "HOUR", "EUR")).toBe("EUR 90/hr");
    expect(rateText(null, null, null)).toBe("");
  });

  it("turns an API refusal into a plain sentence", () => {
    expect(errorSentence({ status: 404, message: "x" })).toBe("This placement is no longer in your view.");
    expect(errorSentence({ status: 409, code: "ALREADY_PLACED", message: "x" })).toMatch(/already has a placement/);
    expect(errorSentence({ status: 422, message: "endDate must be after the current end date" })).toBe("endDate must be after the current end date");
    expect(errorSentence({ status: 0, message: "offline" })).toBe("offline");
  });

  it("summarises the extension status the way the card reads", () => {
    const base = { status: "ACTIVE" as const, extensions: [] as PlacementDetail["extensions"] };
    expect(extensionSummary(base).body).toMatch(/No extension requested yet/);
    expect(extensionSummary({ ...base, extensions: [{ id: 1, status: "REQUESTED", requestedEndDate: "2026-12-01" } as never] }).title).toBe("Extension requested");
    expect(extensionSummary({ ...base, extensions: [{ id: 1, status: "APPROVED", requestedEndDate: "2026-12-01" } as never] }).body).toMatch(/Dec 1, 2026/);
    expect(extensionSummary({ status: "ENDED", extensions: [] }).body).toMatch(/complete/);
  });
});
