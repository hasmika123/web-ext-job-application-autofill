import { describe, expect, it } from "vitest";
import { dueOf, parseDetail, parsePast, parseRow, parseSubmissions, rangeText, reasonProblem, sortPending, statusInfo, versionText, type SubRow } from "./submissions";

const row = (o: Record<string, unknown> = {}) => ({ id: 1, requirementId: 9, title: "Senior Java Developer", status: "PENDING_APPROVAL", attention: false, sample: false, ...o });
const tile = { value: 3, previous: 1, deltaPct: 200, sparkline: [0, 1, 2, 3, 3, 3], vs: "week" };
const past = { items: [row({ id: 2, status: "SUBMITTED_TO_CLIENT" })], page: 0, size: 5, total: 1, totalPages: 1, status: null };

describe("parsers", () => {
  it("reads the page and drops rows that are not the contract", () => {
    const v = parseSubmissions({ orgId: 2, generatedAt: "x", name: "A", tiles: { pending: tile, approved: { ...tile, vs: "month" }, submitted: tile, attention: tile }, pending: [row(), { id: "x" }, row({ status: "WEIRD" })], past });
    expect(v?.pending).toHaveLength(1);
    expect(v?.tiles.approved.vs).toBe("month");
    expect(v?.past.items[0].status).toBe("SUBMITTED_TO_CLIENT");
  });
  it("is null for a body that is not the contract", () => {
    expect(parseSubmissions({})).toBeNull();
    expect(parseSubmissions({ orgId: 1, tiles: {}, pending: [] })).toBeNull();
    expect(parsePast({})).toBeNull();
    expect(parseRow(null)).toBeNull();
    expect(parseDetail({})).toBeNull();
  });
  it("reads a detail with and without a resume", () => {
    expect(parseDetail({ row: row(), resume: null })?.resume).toBeNull();
    expect(parseDetail({ row: row(), resume: { id: 4, name: "R", versionNo: 3 } })?.resume?.versionNo).toBe(3);
  });
});

describe("helpers", () => {
  const now = new Date(2026, 9, 14, 12, 0).getTime();
  it("words the due time by calendar day", () => {
    expect(dueOf(new Date(2026, 9, 14, 17, 0).toISOString(), now).kind).toBe("today");
    expect(dueOf(new Date(2026, 9, 15, 10, 0).toISOString(), now).kind).toBe("tomorrow");
    expect(dueOf(new Date(2026, 9, 20, 10, 0).toISOString(), now).kind).toBe("later");
    expect(dueOf(new Date(2026, 9, 14, 9, 0).toISOString(), now).kind).toBe("overdue");
    expect(dueOf(null, now).kind).toBe("none");
  });
  it("sorts pending by due date with no-due last, without changing the input", () => {
    const mk = (id: number, title: string, dueAt: string | null) => parseRow(row({ id, title, dueAt })) as SubRow;
    const list = [mk(1, "B", null), mk(2, "A", "2026-10-20T00:00:00Z"), mk(3, "C", "2026-10-15T00:00:00Z")];
    expect(sortPending(list, "due").map((r) => r.id)).toEqual([3, 2, 1]);
    expect(sortPending(list, "title").map((r) => r.title)).toEqual(["A", "B", "C"]);
    expect(list.map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it("labels statuses, versions and ranges", () => {
    expect(statusInfo("NOT_SELECTED").label).toBe("Not Selected");
    expect(versionText(3)).toBe("v3");
    expect(versionText(null)).toBe("");
    expect(rangeText({ page: 1, size: 5, total: 12 }, 5)).toBe("Showing 6-10 of 12");
    expect(rangeText({ page: 0, size: 5, total: 0 }, 0)).toBe("");
  });
  it("checks the decline reason length", () => {
    expect(reasonProblem("ab")).not.toBeNull();
    expect(reasonProblem("a fine reason")).toBeNull();
    expect(reasonProblem("x".repeat(301))).not.toBeNull();
  });
});
