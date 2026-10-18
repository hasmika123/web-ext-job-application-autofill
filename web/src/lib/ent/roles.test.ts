import { describe, expect, it } from "vitest";
import {
  assignHref,
  ceilingKey,
  choiceFor,
  deletable,
  donutGradient,
  draftOf,
  filterRoles,
  historyValues,
  isConflict,
  matchesQuery,
  reasonText,
  roleErrorMessage,
  roleIcon,
  rowsOf,
  summarize,
  type ApiFail,
  type CatalogEntry,
  type Draft,
  type HistoryEntry,
  type RoleRow,
} from "./roles";

const fail = (over: Partial<ApiFail>): ApiFail => ({ ok: false, status: 422, message: "api words", extra: {}, ...over });

const row = (over: Partial<RoleRow> = {}): RoleRow => ({
  id: 1, key: "ORG_ADMIN", name: "Organization Admin", description: "Runs the organization", templateKey: null, scopeLabel: "Organization", scopeLevel: "ORG",
  system: true, editable: false, status: "ACTIVE", assignedUsers: 3, permissionCount: 60, version: 'W/"a"', ...over,
});

describe("draft model", () => {
  it("never shows or sends the two self rows (the API adds them itself)", () => {
    const d = draftOf([
      { key: "reports.view", scope: "ORG", ceilingRoleKey: null, rowFilter: null },
      { key: "self.leave", scope: "OWN", ceilingRoleKey: null, rowFilter: null },
      { key: "self.share_scope.set", scope: "OWN", ceilingRoleKey: null, rowFilter: null },
    ]);
    expect(Object.keys(d)).toEqual(["reports.view"]);
  });

  it("sends key and scope always, an attribute only when the row has one, sorted by key", () => {
    const d: Draft = {
      "members.role.set": { scope: "ORG", ceilingRoleKey: "BELOW_ADMIN", rowFilter: null },
      "audit.view": { scope: "ORG", ceilingRoleKey: null, rowFilter: "BILLING_OPS" },
      "reports.view": { scope: "TEAM", ceilingRoleKey: null, rowFilter: null },
    };
    expect(rowsOf(d)).toEqual([
      { key: "audit.view", scope: "ORG", rowFilter: "BILLING_OPS" },
      { key: "members.role.set", scope: "ORG", ceilingRoleKey: "BELOW_ADMIN" },
      { key: "reports.view", scope: "TEAM" },
    ]);
  });
});

describe("summarize (the confirm step)", () => {
  const before: Draft = {
    "reports.view": { scope: "ASSIGNED", ceilingRoleKey: null, rowFilter: null },
    "pipeline.view": { scope: "ASSIGNED", ceilingRoleKey: null, rowFilter: null },
    "billing.view": { scope: "ORG", ceilingRoleKey: null, rowFilter: null },
  };

  it("lists what is added, removed and moved, each sorted", () => {
    const after: Draft = {
      "reports.view": { scope: "TEAM", ceilingRoleKey: null, rowFilter: null },
      "pipeline.view": { scope: "ASSIGNED", ceilingRoleKey: null, rowFilter: null },
      "audit.view": { scope: "ORG", ceilingRoleKey: null, rowFilter: null },
    };
    const s = summarize(before, after);
    expect(s.added).toEqual([{ key: "audit.view", scope: "ORG" }]);
    expect(s.removed).toEqual([{ key: "billing.view", scope: "ORG" }]);
    expect(s.changed).toEqual([{ key: "reports.view", from: "ASSIGNED", to: "TEAM" }]);
    expect(s.total).toBe(3);
  });

  it("is empty when nothing changed", () => {
    expect(summarize(before, { ...before }).total).toBe(0);
  });

  it("names sensitive keys that were added or widened, not narrowed or removed", () => {
    const danger = (k: string) => k === "billing.manage" || k === "org.close";
    const a = summarize({}, { "billing.manage": { scope: "ORG", ceilingRoleKey: null, rowFilter: null } }, danger);
    expect(a.dangerous).toEqual(["billing.manage"]);
    const widened = summarize(
      { "billing.manage": { scope: "TEAM", ceilingRoleKey: null, rowFilter: null } },
      { "billing.manage": { scope: "ORG", ceilingRoleKey: null, rowFilter: null } },
      danger,
    );
    expect(widened.dangerous).toEqual(["billing.manage"]);
    const narrowed = summarize(
      { "billing.manage": { scope: "ORG", ceilingRoleKey: null, rowFilter: null } },
      { "billing.manage": { scope: "TEAM", ceilingRoleKey: null, rowFilter: null } },
      danger,
    );
    expect(narrowed.dangerous).toEqual([]);
    expect(summarize({ "org.close": { scope: "ORG", ceilingRoleKey: null, rowFilter: null } }, {}, danger).dangerous).toEqual([]);
  });
});

describe("error mapping", () => {
  it("ROLE_CEILING names the key and scope, SELF and ADMIN_ROLE have their own sentences", () => {
    expect(roleErrorMessage(fail({ code: "ROLE_CEILING", extra: { key: "org.close", scope: "ORG" } }))).toBe("You can't give org.close at organization level: you don't hold it yourself.");
    expect(roleErrorMessage(fail({ code: "ROLE_CEILING", extra: { reason: "SELF" } }))).toMatch(/your own roles/);
    expect(roleErrorMessage(fail({ code: "ROLE_CEILING", extra: { reason: "ADMIN_ROLE", role: "ORG_ADMIN" } }))).toMatch(/Owner/);
    expect(ceilingKey(fail({ code: "ROLE_CEILING", extra: { key: "org.close" } }))).toBe("org.close");
    expect(ceilingKey(fail({ code: "LAST_ADMIN" }))).toBeNull();
  });

  it("LAST_ADMIN, ROLE_IN_USE, ROLE_SYSTEM, name taken, conflict", () => {
    expect(roleErrorMessage(fail({ status: 409, code: "LAST_ADMIN", extra: { role: "OWNER" } }))).toBe("The organization needs at least one Owner.");
    expect(roleErrorMessage(fail({ status: 409, code: "LAST_ADMIN", extra: { role: "ORG_ADMIN" } }))).toBe("The organization needs at least one administrator.");
    expect(roleErrorMessage(fail({ status: 409, code: "ROLE_IN_USE", extra: { count: 3 } }))).toBe("Used by 3 people. Move them to another role first.");
    expect(roleErrorMessage(fail({ status: 409, code: "ROLE_IN_USE", extra: { count: 1 } }))).toBe("Used by 1 person. Move them to another role first.");
    expect(roleErrorMessage(fail({ status: 409, code: "ROLE_SYSTEM" }))).toMatch(/Duplicate it to customise/);
    expect(roleErrorMessage(fail({ status: 409, code: "ROLE_NAME_TAKEN" }))).toMatch(/already exists/);
    expect(roleErrorMessage(fail({ status: 412, code: "PRECONDITION_FAILED" }))).toMatch(/Reload/);
    expect(isConflict(fail({ status: 412, code: "PRECONDITION_FAILED" }))).toBe(true);
    expect(isConflict(fail({ status: 409, code: "ROLE_IN_USE" }))).toBe(false);
  });

  it("falls back to the API's own words, and says so for a dead network", () => {
    expect(roleErrorMessage(fail({ status: 500, message: "Boom." }))).toBe("Boom.");
    expect(roleErrorMessage(fail({ status: 0, message: "" }))).toMatch(/couldn't reach the server/);
    expect(roleErrorMessage(fail({ status: 404, message: "" }))).toMatch(/deleted/);
  });
});

describe("the roles table helpers", () => {
  it("searches name, description and scope label, case-insensitively", () => {
    const roles = [row(), row({ id: 2, key: "CUSTOM_X", name: "Custom Viewer", description: "Read-only access", scopeLabel: "Custom", system: false })];
    expect(filterRoles(roles, "viewer").map((r) => r.id)).toEqual([2]);
    expect(filterRoles(roles, "RUNS").map((r) => r.id)).toEqual([1]);
    expect(filterRoles(roles, "custom").map((r) => r.id)).toEqual([2]);
    expect(filterRoles(roles, "  ")).toHaveLength(2);
  });

  it("only an unused custom role is deletable", () => {
    expect(deletable({ system: false, assignedUsers: 0 })).toBe(true);
    expect(deletable({ system: false, assignedUsers: 2 })).toBe(false);
    expect(deletable({ system: true, assignedUsers: 0 })).toBe(false);
  });

  it("assign users goes to the Employees page filtered by the role", () => {
    expect(assignHref("admin", { id: 7 })).toBe("/w/admin/employees?role=7");
  });

  it("icons follow what the role is for, custom roles follow their template", () => {
    expect(roleIcon({ key: "OWNER", templateKey: null, system: true }).icon).toBe("crown");
    expect(roleIcon({ key: "CUSTOM_A", templateKey: "FINANCE_SPECIALIST", system: false }).icon).toBe("dollar");
    expect(roleIcon({ key: "CUSTOM_B", templateKey: null, system: false }).icon).toBe("shield");
  });

  it("the donut is a whole circle from the categories' key counts", () => {
    const g = donutGradient([{ keys: 10 }, { keys: 30 }], ["red", "blue"]);
    expect(g).toBe("conic-gradient(red 0.00% 25.00%, blue 25.00% 100.00%)");
    expect(donutGradient([{ keys: 0 }], ["red"])).toContain("var(--color-line)");
  });
});

describe("catalog helpers", () => {
  const entry: CatalogEntry = {
    key: "members.role.set", family: "members", label: "Members role set", description: "Change the roles of members.", dangerous: true, actsForOthers: false, defaultScope: "ORG",
    scopes: [{ scope: "ORG", grantable: true, ceilingRoleKey: "BELOW_ADMIN", rowFilter: null }], grantable: true, reason: null,
  };

  it("a new row at a scope carries the attribute the catalog says the caller needs", () => {
    expect(choiceFor(entry, "ORG")?.ceilingRoleKey).toBe("BELOW_ADMIN");
    expect(choiceFor(entry, "TEAM")).toBeUndefined();
  });

  it("matches on key, label and description", () => {
    expect(matchesQuery(entry, "role.set")).toBe(true);
    expect(matchesQuery(entry, "CHANGE THE ROLES")).toBe(true);
    expect(matchesQuery(entry, "billing")).toBe(false);
    expect(matchesQuery(entry, " ")).toBe(true);
  });

  it("explains why a key is greyed out", () => {
    expect(reasonText("BEYOND_YOUR_ACCESS")).toMatch(/Beyond your access/);
    expect(reasonText("OWNER_ONLY")).toMatch(/Owner/);
    expect(reasonText(null)).toBe("");
  });
});

describe("history values", () => {
  const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({ id: 1, action: "ROLE_UPDATE", risk: "HIGH", actor: "a", targetType: "ROLE", targetId: "1", targetLogin: null, roleName: "R", at: "2026-10-13T09:00:00Z", details: {}, ...over });

  it("an update shows what went out and what came in", () => {
    const v = historyValues(entry({ details: { added: ["reports.view@ORG"], removed: ["billing.view"], scopeChanged: [{ key: "x.y", from: "TEAM", to: "ORG" }] } }));
    expect(v.oldValue).toBe("−billing.view");
    expect(v.newValue).toBe("+reports.view@ORG, x.y TEAM→ORG");
  });

  it("create, delete, rename and assignment each read sensibly", () => {
    expect(historyValues(entry({ action: "ROLE_CREATE", details: { permissions: 9 } }))).toEqual({ oldValue: null, newValue: "9 permissions" });
    expect(historyValues(entry({ action: "ROLE_DELETE", details: { name: "Temp" } }))).toEqual({ oldValue: "Temp", newValue: null });
    expect(historyValues(entry({ details: { name: "New name" } }))).toEqual({ oldValue: null, newValue: "renamed to New name" });
    expect(historyValues(entry({ action: "ROLE_ASSIGN", details: { added: ["MARKETING_MANAGER"], removed: [] } }))).toEqual({ oldValue: null, newValue: "MARKETING_MANAGER" });
  });
});
