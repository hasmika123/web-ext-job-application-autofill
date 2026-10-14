import { describe, expect, it } from "vitest";
import {
  activitySentence,
  bulkSummary,
  DEFAULT_QUERY,
  errorSentence,
  experienceText,
  listParams,
  locationText,
  nextSort,
  paramsFromState,
  showingText,
  stateFromParams,
  tileDelta,
  undoPlan,
  type ActivityItem,
  type PageState,
  type RowResult,
  type Tile,
} from "./consultants";

const tile = (over: Partial<Tile>): Tile => ({ value: 10, previous: 8, delta: 2, deltaPercent: 25, series: [], ...over });

describe("tileDelta", () => {
  it("draws nothing without a comparison", () => {
    expect(tileDelta(null)).toBeNull();
    expect(tileDelta(tile({ previous: null, delta: null, deltaPercent: null }))).toBeNull();
  });
  it("draws a percent when the API gave one and the plain difference otherwise", () => {
    expect(tileDelta(tile({}))).toEqual({ dir: "up", text: "25%" });
    expect(tileDelta(tile({ delta: -3, deltaPercent: -17 }))).toEqual({ dir: "down", text: "17%" });
    expect(tileDelta(tile({ previous: 0, delta: 4, deltaPercent: null }))).toEqual({ dir: "up", text: "+4" });
    expect(tileDelta(tile({ delta: 0, deltaPercent: 0 }))).toEqual({ dir: "flat", text: "0%" });
  });
});

describe("the address", () => {
  it("round-trips a full view", () => {
    const s: PageState = {
      query: { ...DEFAULT_QUERY, q: "sales", availability: "AVAILABLE", skill: "AWS", license: "EXPIRING", marketerId: "none", workMode: "REMOTE", status: "INACTIVE", sort: { key: "experience", dir: "desc" }, page: 2, size: 25 },
      selected: 14,
      tab: "applications",
    };
    expect(stateFromParams(paramsFromState(s))).toEqual(s);
  });
  it("leaves defaults out, so the clean list is the bare path", () => {
    expect(paramsFromState({ query: DEFAULT_QUERY, selected: null, tab: "overview" }).toString()).toBe("");
    expect(paramsFromState({ query: DEFAULT_QUERY, selected: 3, tab: "overview" }).toString()).toBe("c=3");
  });
  it("forgets the tab when nobody is selected", () => {
    expect(paramsFromState({ query: DEFAULT_QUERY, selected: null, tab: "activity" }).toString()).toBe("");
  });
  it("falls back to defaults for anything unknown", () => {
    const s = stateFromParams(new URLSearchParams("sort=salary,up&page=-2&size=7&c=abc&tab=zzz&status=DELETED"));
    expect(s.query.sort).toEqual(DEFAULT_QUERY.sort);
    expect(s.query.page).toBe(0);
    expect(s.query.size).toBe(10);
    expect(s.query.status).toBe("");
    expect(s.selected).toBeNull();
    expect(s.tab).toBe("overview");
  });
  it("asks the API with the names it knows, and waits for a second character of search", () => {
    const p = listParams({ ...DEFAULT_QUERY, q: "a", marketerId: "7", sort: { key: "name", dir: "desc" } });
    expect(p.get("q")).toBeNull();
    expect(p.get("marketerId")).toBe("7");
    expect(p.get("sort")).toBe("name,desc");
    expect(listParams({ ...DEFAULT_QUERY, q: " ab " }).get("q")).toBe("ab");
  });
});

describe("sorting and paging text", () => {
  it("flips the same column and starts numbers and dates descending", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name").dir).toBe("desc");
    expect(nextSort({ key: "name", dir: "asc" }, "experience")).toEqual({ key: "experience", dir: "desc" });
    expect(nextSort({ key: "name", dir: "asc" }, "license")).toEqual({ key: "license", dir: "asc" });
  });
  it("reads like the board", () => {
    expect(showingText(248, 0, 10, 10)).toBe("1-10 of 248 consultants");
    expect(showingText(1, 0, 10, 1)).toBe("1-1 of 1 consultant");
    expect(showingText(0, 0, 10, 0)).toBe("No consultants");
  });
  it("shows experience and place without inventing either", () => {
    expect(experienceText(8)).toBe("8 yrs");
    expect(experienceText(1)).toBe("1 yr");
    expect(experienceText(null)).toBe("—");
    expect(locationText("New York, NY", "REMOTE")).toBe("New York, NY (Remote)");
    expect(locationText(null, null)).toBe("—");
  });
});

describe("Undo and summaries", () => {
  const res = (rows: RowResult[]) => ({ action: "AVAILABILITY", requested: rows.length, ok: rows.filter((r) => r.ok).length, results: rows });
  it("groups the changed rows by their previous value", () => {
    const plans = undoPlan("availability", [
      { id: 1, ok: true, reason: null, previous: { availability: "AVAILABLE" } },
      { id: 2, ok: true, reason: null, previous: { availability: "AVAILABLE" } },
      { id: 3, ok: true, reason: null, previous: { availability: "NOTICE" } },
      { id: 4, ok: false, reason: "UNCHANGED", previous: null },
    ]);
    expect(plans).toEqual([
      { kind: "availability", ids: [1, 2], availability: "AVAILABLE" },
      { kind: "availability", ids: [3], availability: "NOTICE" },
    ]);
  });
  it("cannot un-assign a consultant who had no marketer", () => {
    expect(undoPlan("marketer", [{ id: 1, ok: true, reason: null, previous: { marketerMemberId: null } }])).toEqual([]);
    expect(undoPlan("marketer", [{ id: 1, ok: true, reason: null, previous: { marketerMemberId: 7 } }])).toEqual([{ kind: "marketer", ids: [1], marketerMemberId: 7 }]);
  });
  it("undoes a deactivation by reactivating", () => {
    expect(undoPlan("status", [{ id: 1, ok: true, reason: null, previous: { status: "ACTIVE" } }])).toEqual([{ kind: "status", ids: [1], action: "REACTIVATE" }]);
  });
  it("says what was skipped and why", () => {
    const s = bulkSummary(res([{ id: 1, ok: true, reason: null, previous: {} }, { id: 2, ok: false, reason: "UNCHANGED", previous: null }, { id: 3, ok: false, reason: "NOT_FOUND", previous: null }]), "updated");
    expect(s.title).toBe("1 consultant updated");
    expect(s.description).toBe("Skipped 2: 1 already set, 1 not in your view.");
    expect(bulkSummary(res([{ id: 2, ok: false, reason: "UNCHANGED", previous: null }]), "updated").variant).toBe("error");
  });
});

describe("sentences", () => {
  it("speaks plainly for the codes the API uses", () => {
    expect(errorSentence({ status: 409, code: "CONSULTANT_EXISTS", message: "x" })).toContain("already exists");
    expect(errorSentence({ status: 422, code: "SENSITIVE_CONTENT", message: "x" })).toContain("never store");
    expect(errorSentence({ status: 412, message: "x" })).toContain("Reload");
    expect(errorSentence({ status: 404, message: "x" })).toContain("no longer");
    expect(errorSentence({ status: 0, message: "We couldn't reach the server." })).toBe("We couldn't reach the server.");
  });
  it("describes an activity item from its fields", () => {
    const base: ActivityItem = { kind: "APPLICATION", at: "2026-10-01T00:00:00Z", actor: null, action: "STAGE_CHANGE", code: "APP-1", jobTitle: "Dev", fromStage: "SUBMITTED", toStage: "OFFER", detail: null };
    expect(activitySentence(base)).toBe("APP-1 for Dev moved from Submitted to Offer");
    expect(activitySentence({ ...base, action: "CREATED", fromStage: null, toStage: "ASSIGNED" })).toBe("Application APP-1 for Dev created");
    expect(activitySentence({ ...base, kind: "AUDIT", action: "CONSULTANT_ASSIGN" })).toBe("Changed the marketer");
  });
});
