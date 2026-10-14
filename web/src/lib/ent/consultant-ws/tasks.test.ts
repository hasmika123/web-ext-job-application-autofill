import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  bodyOf,
  buildQuery,
  dateBlock,
  dueInfo,
  formOf,
  parseRow,
  parseTasks,
  priorityTone,
  rangeText,
  reminderWhen,
  sortBy,
  statusInfo,
  titleProblem,
  typeLabel,
  withTab,
  EMPTY_FORM,
} from "./tasks";

const row = (o: Record<string, unknown> = {}) => ({
  id: 1, title: "Update resume", type: "RESUME_PROFILE", requirementId: 5, jobTitle: "Data Engineer", company: "Acme", priority: "HIGH", status: "IN_PROGRESS", dueOn: "2026-10-14",
  overdue: false, dueToday: true, assignedBy: { kind: "MARKETER", name: "Michael Park", sample: true }, completedAt: null, createdAt: "2026-10-01T00:00:00Z", ...o,
});
const tile = { value: 3, previous: 1, deltaPct: 200, sparkline: [0, 1, 2, 3, 3, 3] };
const body = () => ({
  orgId: 2, generatedAt: "2026-10-14T10:00:00Z", today: "2026-10-14", name: "Anika Rao",
  tiles: { total: tile, dueToday: tile, upcoming: tile, overdue: tile, completedThisWeek: { ...tile, deltaPct: null } },
  tasks: { items: [row(), { nope: true }], page: 0, size: 8, total: 1, totalPages: 1, counts: { all: 1, today: 1, week: 1, overdue: 0, completed: 0 } },
  focus: [{ taskId: 1, title: "Update resume", status: "IN_PROGRESS", done: false }],
  deadlines: [{ taskId: 1, title: "Update resume", jobTitle: null, company: "Acme", dueOn: "2026-10-14", priority: "HIGH" }],
  insights: { total: 1, completed: 0, inProgress: 1, notStarted: 0, overdue: 0, completionPct: 0, completedThisWeek: 0, completedLastWeek: 0, note: null },
  reminders: [{ kind: "SUBMISSION", title: "Submission approval pending", subtitle: "Acme - Role", at: null, href: "/w/consultant/submissions" }],
  jobs: [{ id: 5, title: "Data Engineer", company: "Acme" }],
  assigners: ["Michael Park"],
});

describe("parsing", () => {
  it("reads the contract and drops rows that do not match", () => {
    const v = parseTasks(body());
    expect(v?.today).toBe("2026-10-14");
    expect(v?.tasks.items).toHaveLength(1);
    expect(v?.tasks.items[0].assignedBy).toEqual({ kind: "MARKETER", name: "Michael Park", sample: true });
    expect(v?.tiles.completedThisWeek.deltaPct).toBeNull();
    expect(v?.insights.note).toBeNull();
    expect(v?.jobs[0].id).toBe(5);
  });
  it("is not the contract without tiles, today or the task page", () => {
    expect(parseTasks(null)).toBeNull();
    expect(parseTasks({ ...body(), today: undefined })).toBeNull();
    expect(parseTasks({ ...body(), tasks: null })).toBeNull();
  });
  it("falls back to safe values for unknown enums but never invents a status", () => {
    expect(parseRow(row({ type: "WHAT", priority: "?" }))).toMatchObject({ type: "OTHER", priority: "MEDIUM" });
    expect(parseRow(row({ status: "WHAT" }))).toBeNull();
  });
});

describe("wording", () => {
  it("labels types, statuses and priorities", () => {
    expect(typeLabel("RESUME_PROFILE")).toBe("Resume & Profile");
    expect(typeLabel("???")).toBe("General");
    expect(statusInfo("DONE")).toEqual({ label: "Done", tone: "green" });
    expect(statusInfo("NOT_STARTED").tone).toBe("slate");
    expect(priorityTone("HIGH")).toBe("red");
    expect(priorityTone("LOW")).toBe("green");
  });
  it("trusts the server for overdue and today", () => {
    expect(dueInfo({ dueOn: null, overdue: false, dueToday: false })).toEqual({ kind: "none", text: "No due date" });
    expect(dueInfo({ dueOn: "2026-10-14", overdue: true, dueToday: false }).kind).toBe("overdue");
    expect(dueInfo({ dueOn: "2026-10-14", overdue: false, dueToday: true })).toEqual({ kind: "today", text: "Oct 14, 2026" });
    expect(dueInfo({ dueOn: "2026-10-20", overdue: false, dueToday: false }).kind).toBe("later");
  });
  it("draws a date block, a reminder time and a range", () => {
    expect(dateBlock("2026-10-14")).toEqual({ month: "OCT", day: "14" });
    expect(dateBlock("nope")).toEqual({ month: "", day: "" });
    expect(reminderWhen(null)).toBe("");
    expect(reminderWhen("2026-10-15T00:00:00Z")).toBe("Oct 15, 2026");
    expect(rangeText({ page: 1, size: 8, total: 12 }, 4)).toBe("Showing 9-12 of 12");
    expect(rangeText({ page: 0, size: 8, total: 0 }, 0)).toBe("");
  });
});

describe("the list query", () => {
  it("leaves empty values out and always sends sort, dir, page and size", () => {
    expect(buildQuery(DEFAULT_FILTERS)).toBe("sort=due&dir=asc&page=0&size=8");
    const q = new URLSearchParams(buildQuery({ ...DEFAULT_FILTERS, tab: "OVERDUE", type: "COMMUNICATION", priority: "HIGH", assignedBy: "Michael Park", due: "NEXT_7", q: "  offer ", page: 2 }));
    expect(Object.fromEntries(q)).toEqual({ tab: "OVERDUE", type: "COMMUNICATION", priority: "HIGH", assignedBy: "Michael Park", due: "NEXT_7", q: "offer", sort: "due", dir: "asc", page: "2", size: "8" });
  });
  it("caps the search text at 100 characters", () => {
    expect(new URLSearchParams(buildQuery({ ...DEFAULT_FILTERS, q: "x".repeat(300) })).get("q")).toHaveLength(100);
  });
  it("flips the direction on the same column and restarts on a new one", () => {
    const a = sortBy(DEFAULT_FILTERS, "due");
    expect(a).toMatchObject({ sort: "due", dir: "desc", page: 0 });
    expect(sortBy({ ...a, page: 3 }, "title")).toMatchObject({ sort: "title", dir: "asc", page: 0 });
  });
  it("lists the newest finished first on the Completed tab and goes back to due date elsewhere", () => {
    const c = withTab({ ...DEFAULT_FILTERS, page: 2 }, "COMPLETED");
    expect(c).toMatchObject({ tab: "COMPLETED", sort: "completed", dir: "desc", page: 0 });
    expect(withTab(c, "ALL")).toMatchObject({ tab: "ALL", sort: "due", dir: "asc" });
    expect(withTab({ ...DEFAULT_FILTERS, sort: "title", dir: "desc" }, "TODAY")).toMatchObject({ sort: "title", dir: "desc" });
  });
});

describe("the write form", () => {
  it("checks the title length", () => {
    expect(titleProblem("ab")).not.toBeNull();
    expect(titleProblem("abc")).toBeNull();
    expect(titleProblem("x".repeat(201))).not.toBeNull();
    expect(titleProblem("   ")).not.toBeNull();
  });
  it("builds the body, leaving out an empty due date and job", () => {
    expect(bodyOf({ ...EMPTY_FORM, title: "  Call them  " })).toEqual({ title: "Call them", priority: "MEDIUM", type: "OTHER" });
    expect(bodyOf({ ...EMPTY_FORM, title: "Call", dueOn: "2026-11-01", requirementId: "7", priority: "HIGH", type: "COMMUNICATION" })).toEqual({ title: "Call", dueOn: "2026-11-01", requirementId: 7, priority: "HIGH", type: "COMMUNICATION" });
  });
  it("starts the edit form from the row", () => {
    const r = parseRow(row());
    expect(r && formOf(r)).toEqual({ title: "Update resume", dueOn: "2026-10-14", priority: "HIGH", type: "RESUME_PROFILE", requirementId: "5" });
  });
});
