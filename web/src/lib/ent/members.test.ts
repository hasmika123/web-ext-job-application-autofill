import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUERY,
  bulkSummary,
  errorSentence,
  formatDate,
  joinedText,
  listParams,
  nextSort,
  pageCount,
  relativeTime,
  rolesSorted,
  showingText,
  statusLabel,
  tileDelta,
  undoPlan,
  type BulkResult,
  type RowResult,
} from "./members";
import { pageWindow } from "@/components/ent/employees/EmployeesTable";
import { effectiveAtOf } from "@/components/ent/employees/LifecycleFlows";

describe("list query", () => {
  it("sends sort, page and size always, and the filters only when set", () => {
    expect(listParams(DEFAULT_QUERY).toString()).toBe("sort=joined%2Cdesc&page=0&size=10");
    const p = listParams({ ...DEFAULT_QUERY, q: " anika ", status: "ACTIVE", roleId: "4", departmentId: "21", teamId: "31", managerId: "1", page: 2, size: 25, sort: { key: "name", dir: "asc" } });
    expect(Object.fromEntries(p)).toEqual({ q: "anika", status: "ACTIVE", roleId: "4", departmentId: "21", teamId: "31", managerId: "1", sort: "name,asc", page: "2", size: "25" });
  });

  it("waits for a second character before searching (the API refuses one)", () => {
    expect(listParams({ ...DEFAULT_QUERY, q: "a" }).has("q")).toBe(false);
    expect(listParams({ ...DEFAULT_QUERY, q: "an" }).get("q")).toBe("an");
  });

  it("flips direction on the same column and starts dates newest first", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "desc" }, "joined")).toEqual({ key: "joined", dir: "desc" });
    expect(nextSort({ key: "joined", dir: "desc" }, "status")).toEqual({ key: "status", dir: "asc" });
  });

  it("counts pages and words the footer", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(186, 10)).toBe(19);
    expect(showingText(186, 0, 10, 10)).toBe("Showing 1-10 of 186 employees");
    expect(showingText(186, 18, 10, 6)).toBe("Showing 181-186 of 186 employees");
    expect(showingText(1, 0, 10, 1)).toBe("Showing 1-1 of 1 employee");
    expect(showingText(0, 0, 10, 0)).toBe("No employees");
  });

  it("windows the page buttons: ends always, gaps in between", () => {
    expect(pageWindow(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(pageWindow(0, 19)).toEqual([0, 1, 2, 3, 4, "gap", 18]);
    expect(pageWindow(9, 19)).toEqual([0, "gap", 8, 9, 10, "gap", 18]);
    expect(pageWindow(18, 19)).toEqual([0, "gap", 14, 15, 16, 17, 18]);
  });
});

describe("KPI delta: never invented", () => {
  it("is null when the API has no history", () => {
    expect(tileDelta({ value: 5, previous: null, delta: null, deltaPercent: null })).toBeNull();
    expect(tileDelta(null)).toBeNull();
    expect(tileDelta(undefined)).toBeNull();
  });
  it("uses the percent when given, the plain difference otherwise", () => {
    expect(tileDelta({ value: 12, previous: 11, delta: 1, deltaPercent: 9.1 })).toEqual({ dir: "up", text: "+9.1%" });
    expect(tileDelta({ value: 6, previous: 8, delta: -2, deltaPercent: -25 })).toEqual({ dir: "down", text: "-25%" });
    expect(tileDelta({ value: 12, previous: 0, delta: 12, deltaPercent: null })).toEqual({ dir: "up", text: "+12" });
    expect(tileDelta({ value: 4, previous: 4, delta: 0, deltaPercent: 0 })).toEqual({ dir: "flat", text: "0%" });
  });
});

describe("dates", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  it("says how long ago", () => {
    expect(relativeTime("2026-05-15T12:00:00Z", now)).toBe("5 months ago");
    expect(relativeTime("2026-10-13T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-10-16T12:00:00Z", now)).toBe("in 3 days");
    expect(relativeTime(null, now)).toBe("");
  });
  it("joined reads 'Jan 15, 2024 (… ago)'", () => {
    expect(formatDate("2024-01-15T09:00:00Z")).toBe("Jan 15, 2024");
    expect(joinedText("2026-05-15T12:00:00Z", now)).toBe("May 15, 2026 (5 months ago)");
    expect(joinedText(null, now)).toBe("");
  });
  it("a chosen last day is the end of that day, none means now", () => {
    expect(effectiveAtOf("")).toBeNull();
    expect(new Date(effectiveAtOf("2026-12-31")!).getTime()).toBeGreaterThan(Date.parse("2026-12-31T00:00:00"));
  });
});

describe("labels and roles", () => {
  it("offboarded covers left and removed", () => {
    expect(statusLabel("LEFT")).toBe("Offboarded");
    expect(statusLabel("REMOVED")).toBe("Offboarded");
    expect(statusLabel("ACTIVE")).toBe("Active");
  });
  it("puts the primary role first", () => {
    const r = [
      { roleId: 2, key: "B", name: "B", primary: false },
      { roleId: 1, key: "A", name: "A", primary: true },
    ];
    expect(rolesSorted(r).map((x) => x.key)).toEqual(["A", "B"]);
  });
});

describe("error sentences", () => {
  it("names the reason of a role ceiling refusal", () => {
    expect(errorSentence({ status: 422, code: "ROLE_CEILING", message: "x", extra: { reason: "ADMIN_ROLE" } })).toMatch(/administrator role/);
    expect(errorSentence({ status: 422, code: "ROLE_CEILING", message: "x", extra: { reason: "SELF" } })).toMatch(/your own/);
    expect(errorSentence({ status: 422, code: "ROLE_CEILING", message: "x", extra: { key: "roles.manage", scope: "ORG" } })).toMatch(/roles\.manage/);
    expect(errorSentence({ status: 409, code: "LAST_ADMIN", message: "x", extra: {} })).toMatch(/without an administrator/);
  });
  it("a stale edit says someone else changed the person", () => {
    expect(errorSentence({ status: 412, message: "x" })).toMatch(/Someone else/);
  });
  it("keeps the server's own words otherwise", () => {
    expect(errorSentence({ status: 422, code: "WHATEVER", message: "Title is too long." })).toBe("Title is too long.");
  });
});

const ok = (memberId: number, previous: Record<string, unknown> | null, reason: string | null = null): RowResult => ({ memberId, ok: true, reason, previous });

describe("undo from `previous`", () => {
  it("restores roles one person at a time", () => {
    const plans = undoPlan("roles", [ok(1, { roleIds: [4], primaryRoleId: 4 }), ok(2, { roleIds: [5, 6], primaryRoleId: 6 }), ok(3, null, "UNCHANGED"), { memberId: 4, ok: false, reason: "LAST_ADMIN", previous: null }]);
    expect(plans).toEqual([
      { kind: "roles", memberId: 1, roleIds: [4], primaryRoleId: 4 },
      { kind: "roles", memberId: 2, roleIds: [5, 6], primaryRoleId: 6 },
    ]);
  });
  it("groups people with the same previous placement into one call", () => {
    const plans = undoPlan("groups", [ok(1, { departmentGroupId: 21, teamGroupId: 31 }), ok(2, { departmentGroupId: 21, teamGroupId: 31 }), ok(3, { departmentGroupId: null, teamGroupId: null })]);
    expect(plans).toEqual([
      { kind: "groups", memberIds: [1, 2], departmentGroupId: 21, teamGroupId: 31 },
      { kind: "groups", memberIds: [3], departmentGroupId: null, teamGroupId: null },
    ]);
  });
  it("puts managers back, and a suspension undoes to a reinstatement", () => {
    expect(undoPlan("manager", [ok(1, { managerMemberId: 9 }), ok(2, { managerMemberId: 9 })])).toEqual([{ kind: "manager", memberIds: [1, 2], managerMemberId: 9 }]);
    expect(undoPlan("status", [ok(1, { status: "ACTIVE" }), ok(2, { status: "SUSPENDED" })])).toEqual([
      { kind: "status", memberIds: [1], action: "REINSTATE" },
      { kind: "status", memberIds: [2], action: "SUSPEND" },
    ]);
  });
});

describe("bulk summary", () => {
  const res = (over: Partial<BulkResult>): BulkResult => ({ action: "ROLES", requested: 3, ok: 2, skipped: [], results: [], ...over });
  it("counts what changed, what was already as asked and what was skipped with why", () => {
    const r = res({ ok: 2, skipped: [{ memberId: 3, reason: "LAST_ADMIN" }], results: [ok(1, { roleIds: [1], primaryRoleId: 1 }), ok(2, null, "UNCHANGED"), { memberId: 3, ok: false, reason: "LAST_ADMIN", previous: null }] });
    const s = bulkSummary(r, "updated roles for");
    expect(s.variant).toBe("success");
    expect(s.title).toBe("Updated roles for 1 person");
    expect(s.description).toMatch(/1 person already as asked/);
    expect(s.description).toMatch(/1 skipped: That would leave the organization without an administrator/);
  });
  it("is an error when nothing changed and something was skipped", () => {
    const s = bulkSummary(res({ ok: 0, skipped: [{ memberId: 1, reason: "SELF" }], results: [{ memberId: 1, ok: false, reason: "SELF", previous: null }] }), "suspended");
    expect(s.variant).toBe("error");
    expect(s.title).toBe("Nothing was suspended");
  });
});
