import { describe, expect, it } from "vitest";
import {
  bulkSummary,
  bulkUndoPlans,
  DEFAULT_STATE,
  errorSentence,
  fileSizeText,
  filtersActive,
  listParams,
  nextSort,
  parseState,
  resumeTileDelta,
  showingText,
  stateToSearch,
  yearsText,
  type ResumeTile,
  type ResumeUrlState,
} from "./resumes";

const sp = (q: string) => new URLSearchParams(q);

describe("URL state", () => {
  it("a clean URL is the default state and the default state is a clean URL", () => {
    expect(parseState(sp(""))).toEqual(DEFAULT_STATE);
    expect(stateToSearch(DEFAULT_STATE)).toBe("");
  });

  it("round-trips every part of the page", () => {
    const s: ResumeUrlState = {
      tab: "pending", q: "java", department: "12", visibility: "PRIVATE", status: "PENDING", primary: "no", owner: "7", updated: "30",
      sort: { key: "name", dir: "asc" }, page: 2, size: 25, view: "grid", open: 99,
    };
    const url = stateToSearch(s);
    expect(url).toContain("tab=pending");
    expect(url).toContain("page=3"); // the URL counts pages from 1
    expect(parseState(sp(url.slice(1)))).toEqual(s);
  });

  it("never trusts the URL: unknown values fall back to the default", () => {
    const s = parseState(sp("tab=evil&vis=SECRET&status=x&primary=maybe&updated=5&sort=salary,up&page=-4&size=9999&view=3d&open=abc&dept=1;drop&owner=%20"));
    expect(s).toEqual(DEFAULT_STATE);
    expect(parseState(sp("sort=name,sideways")).sort).toEqual({ key: "name", dir: "desc" });
    expect(parseState(sp("q=" + "x".repeat(200))).q).toHaveLength(80);
  });

  it("sends the API its own parameter names and skips a one-letter search", () => {
    const p = listParams({ ...DEFAULT_STATE, q: "a", primary: "yes", department: "3", sort: { key: "version", dir: "desc" }, page: 1, size: 25 });
    expect(p.get("q")).toBeNull();
    expect(p.get("primary")).toBe("true");
    expect(p.get("departmentId")).toBe("3");
    expect(p.get("sort")).toBe("version,desc");
    expect(p.get("page")).toBe("1");
    expect(p.get("size")).toBe("25");
    expect(listParams({ ...DEFAULT_STATE, q: "ja" }).get("q")).toBe("ja");
  });

  it("filtersActive ignores the tab and the sort", () => {
    expect(filtersActive({ ...DEFAULT_STATE, tab: "pending", sort: { key: "name", dir: "asc" } })).toBe(false);
    expect(filtersActive({ ...DEFAULT_STATE, owner: "4" })).toBe(true);
    expect(filtersActive({ ...DEFAULT_STATE, q: "a" })).toBe(false);
    expect(filtersActive({ ...DEFAULT_STATE, q: "ab" })).toBe(true);
  });
});

describe("sorting and paging text", () => {
  it("flips the same column and starts dates descending", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "asc" }, "modified")).toEqual({ key: "modified", dir: "desc" });
    expect(nextSort({ key: "modified", dir: "desc" }, "consultant")).toEqual({ key: "consultant", dir: "asc" });
  });

  it("says what is shown", () => {
    expect(showingText(247, 0, 10, 10)).toBe("1-10 of 247 resumes");
    expect(showingText(1, 0, 10, 1)).toBe("1-1 of 1 resume");
    expect(showingText(0, 0, 10, 0)).toBe("No resumes");
  });
});

describe("tiles", () => {
  const t = (value: number, previous: number | null): ResumeTile => ({ value, previous, delta: previous === null ? null : value - previous, deltaPercent: previous ? Math.round((1000 * (value - previous)) / previous) / 10 : null, series: [] });

  it("draws a delta only when the API rebuilt the earlier figure", () => {
    expect(resumeTileDelta(t(247, 220))).toEqual({ dir: "up", text: "+12.3%" });
    expect(resumeTileDelta(t(14, 18))).toEqual({ dir: "down", text: "-22.2%" });
    expect(resumeTileDelta(t(186, null))).toBeNull();
    expect(resumeTileDelta(null)).toBeNull();
  });
});

describe("labels", () => {
  it("formats sizes and years", () => {
    expect(fileSizeText(842)).toBe("842 KB");
    expect(fileSizeText(2048)).toBe("2.0 MB");
    expect(fileSizeText(null)).toBe("");
    expect(yearsText({ title: "x", employer: "y", startYear: 2018, endYear: 2021 })).toBe("2018 - 2021");
    expect(yearsText({ title: "x", employer: "y", startYear: 2021, endYear: null })).toBe("2021 - Present");
  });

  it("turns refusal codes into sentences a person can act on", () => {
    expect(errorSentence({ status: 409, code: "NOT_APPROVED", message: "x" })).toMatch(/approved/i);
    expect(errorSentence({ status: 422, code: "SELF_DECISION", message: "x" })).toMatch(/other than the person/i);
    expect(errorSentence({ status: 404, message: "x" })).toMatch(/no longer in your view/);
    expect(errorSentence({ status: 0, message: "offline" })).toBe("offline");
    expect(errorSentence({ status: 500, message: "boom" })).toBe("boom");
  });
});

describe("bulk Undo", () => {
  const rows = [
    { id: 1, outcome: "APPLIED" as const, reason: null, previous: "INTERNAL" },
    { id: 2, outcome: "APPLIED" as const, reason: null, previous: "PRIVATE" },
    { id: 3, outcome: "APPLIED" as const, reason: null, previous: "INTERNAL" },
    { id: 4, outcome: "SKIPPED" as const, reason: "NOT_FOUND", previous: null },
  ];

  it("puts each old visibility back for the rows that changed and leaves the skipped ones alone", () => {
    const plans = bulkUndoPlans("VISIBILITY", rows);
    expect(plans).toContainEqual({ kind: "visibility", visibility: "INTERNAL", ids: [1, 3] });
    expect(plans).toContainEqual({ kind: "visibility", visibility: "PRIVATE", ids: [2] });
    expect(plans).toHaveLength(2);
  });

  it("undoes an approval by reopening and a reopen by deciding again", () => {
    expect(bulkUndoPlans("APPROVE", rows.slice(0, 2))).toEqual([{ kind: "reopen", ids: [1, 2] }]);
    expect(bulkUndoPlans("REOPEN", [{ id: 5, outcome: "APPLIED", reason: null, previous: "APPROVED" }, { id: 6, outcome: "APPLIED", reason: null, previous: "REJECTED" }])).toEqual([
      { kind: "approval", ids: [5], decision: "APPROVE" },
      { kind: "approval", ids: [6], decision: "REJECT" },
    ]);
    expect(bulkUndoPlans("APPROVE", [{ id: 1, outcome: "SKIPPED", reason: "NOT_PENDING", previous: null }])).toEqual([]);
  });

  it("summarises what happened in one sentence", () => {
    expect(bulkSummary({ applied: 3, skipped: 1, results: rows }, "updated")).toEqual({ title: "3 resumes updated", description: "1 no longer in your view.", variant: "success" });
    expect(bulkSummary({ applied: 0, skipped: 1, results: [rows[3]] }, "approved").variant).toBe("error");
    expect(bulkSummary({ applied: 1, skipped: 0, results: [rows[0]] }, "approved").title).toBe("1 resume approved");
  });
});
