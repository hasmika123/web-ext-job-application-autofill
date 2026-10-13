// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { ToastProvider } from "@kiwiply/ui";
import type { MemberCounts, MemberDetail, MemberRow, RoleRef, Tile } from "@/lib/ent/members";
import EmployeesPage from "./EmployeesPage";

/* ── a stand-in for the BFF: records every call, answers from a small in-memory roster ────────────────────── */

type Call = { method: string; url: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined; headers: Record<string, string> };
let calls: Call[];
let people: Person[];
let overrides: ((c: Call) => { status: number; body?: unknown } | undefined)[];

interface Person {
  id: number;
  name: string;
  email: string | null;
  status: MemberRow["status"];
  title: string | null;
  roleIds: number[];
  primary: number;
  summaryOnly?: boolean;
  version: number;
}

const ROLES = [
  { id: 1, key: "OWNER", name: "Owner", description: "Everything", system: true },
  { id: 4, key: "MARKETING_SPECIALIST", name: "Marketing Specialist", description: null, system: true },
  { id: 10, key: "CONSULTANT", name: "Consultant", description: "Applies to jobs", system: true },
];
const GROUPS = [
  { id: 21, name: "Marketing", kind: "DEPARTMENT", memberCount: 2 },
  { id: 31, name: "Growth", kind: "TEAM", memberCount: 2 },
];

const roleRefs = (p: Person): RoleRef[] => p.roleIds.map((id) => ({ roleId: id, key: ROLES.find((r) => r.id === id)!.key, name: ROLES.find((r) => r.id === id)!.name, primary: id === p.primary }));
const rowOf = (p: Person): MemberRow => ({
  id: p.id, name: p.name, initials: p.name[0], workEmail: p.email, avatarUrl: null, status: p.status, title: p.title, roles: roleRefs(p), department: null, team: null,
  manager: p.summaryOnly ? null : { memberId: 1, name: "Olivia Owner", avatarUrl: null }, joinedAt: "2026-08-20T09:00:00Z", lastActiveAt: null, consentScope: "SUMMARY", invite: null, summaryOnly: !!p.summaryOnly,
});
const detailOf = (p: Person): MemberDetail => ({
  ...rowOf(p), phone: null, location: null, timezone: null, statusSince: null, primaryRoleKey: null, directReports: [], leftAt: null, consentFullTo: null, scheduledOffboarding: null, recentActivity: [],
  actions: { edit: true, manageRoles: true, suspend: p.status === "ACTIVE", reinstate: p.status === "SUSPENDED", offboard: p.status === "ACTIVE" || p.status === "SUSPENDED", viewActivity: true },
  version: `"${p.version}"`,
});
const tile = (value: number, previous: number | null = null): Tile => ({ value, previous, delta: previous === null ? null : value - previous, deltaPercent: previous ? Math.round((1000 * (value - previous)) / previous) / 10 : null });
let counts: MemberCounts;

const seedPeople = (): Person[] => [
  { id: 1, name: "Olivia Owner", email: "olivia@acme.test", status: "ACTIVE", title: null, roleIds: [1], primary: 1, version: 1 },
  { id: 2, name: "Anika Rao", email: "anika@acme.test", status: "ACTIVE", title: "Consultant", roleIds: [10], primary: 10, version: 1 },
  { id: 3, name: "Ben Okafor", email: "ben@acme.test", status: "ACTIVE", title: null, roleIds: [10, 4], primary: 10, version: 1 },
  { id: 4, name: "Sam Whitfield", email: "sam@acme.test", status: "SUSPENDED", title: null, roleIds: [10], primary: 10, version: 1 },
];

function stubApi() {
  calls = [];
  overrides = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const u = new URL(input, "http://x");
      const raw = init.body;
      const call: Call = { method: init.method ?? "GET", url: input, path: u.pathname.replace(/^\/api\/orgs\/2/, ""), params: u.searchParams, body: typeof raw === "string" ? JSON.parse(raw) : undefined, headers: (init.headers ?? {}) as Record<string, string> };
      calls.push(call);
      const r = answer(call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
    }),
  );
}

function answer(c: Call): { status: number; body?: unknown } {
  for (const o of overrides) {
    const r = o(c);
    if (r) return r;
  }
  const one = /^\/members\/(\d+)(\/.*)?$/.exec(c.path);
  if (c.path === "/members" && c.method === "GET") {
    const status = c.params.get("status");
    const q = (c.params.get("q") ?? "").toLowerCase();
    let items = people.filter((p) => (status ? status.split(",").includes(p.status) : p.status !== "REMOVED"));
    if (q) items = items.filter((p) => p.name.toLowerCase().includes(q));
    const [key, dir] = (c.params.get("sort") ?? "joined,desc").split(",");
    if (key === "name") items = [...items].sort((a, b) => a.name.localeCompare(b.name) * (dir === "desc" ? -1 : 1));
    const size = Number(c.params.get("size") ?? 25);
    const page = Number(c.params.get("page") ?? 0);
    return { status: 200, body: { items: items.slice(page * size, page * size + size).map(rowOf), page, size, total: items.length, hasNext: false } };
  }
  if (c.path === "/members/counts") return { status: 200, body: counts };
  if (c.path === "/members/offboarding") return { status: 200, body: { items: [] } };
  if (c.path === "/roles") return { status: 200, body: ROLES };
  if (c.path === "/groups") return { status: 200, body: GROUPS };
  if (c.path === "/members/bulk/roles") {
    const b = c.body as { memberIds: number[]; add?: number[]; remove?: number[] };
    const results = b.memberIds.map((id) => {
      const p = people.find((x) => x.id === id)!;
      const previous = { roleIds: [...p.roleIds], primaryRoleId: p.primary };
      const next = [...new Set([...p.roleIds, ...(b.add ?? [])])].filter((r) => !(b.remove ?? []).includes(r));
      if (next.length === p.roleIds.length) return { memberId: id, ok: true, reason: "UNCHANGED", previous: null };
      p.roleIds = next;
      return { memberId: id, ok: true, reason: null, previous };
    });
    return { status: 200, body: { action: "ROLES", requested: results.length, ok: results.length, skipped: [], results } };
  }
  if (c.path === "/members/bulk/status") {
    const b = c.body as { memberIds: number[]; action: string };
    const results = b.memberIds.map((id) => {
      const p = people.find((x) => x.id === id)!;
      const previous = { status: p.status };
      p.status = b.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
      return { memberId: id, ok: true, reason: null, previous };
    });
    return { status: 200, body: { action: b.action, requested: results.length, ok: results.length, skipped: [], results } };
  }
  if (one) {
    const p = people.find((x) => x.id === Number(one[1]))!;
    const sub = one[2] ?? "";
    if (c.method === "GET" && sub === "") return { status: 200, body: detailOf(p) };
    if (c.method === "GET" && sub === "/activity") return { status: 200, body: { direction: "on", items: [{ id: 1, at: "2026-10-10T09:00:00Z", actor: { memberId: 1, name: "Olivia Owner", avatarUrl: null }, action: "MEMBER_GROUP", risk: "LOW", targetType: "MEMBER", summary: "Placement changed" }], page: 0, size: 10, total: 1, hasNext: false } };
    if (c.method === "GET" && sub === "/offboard-preview") return { status: 200, body: { memberId: p.id, name: p.name, status: p.status, blockers: [], lines: [{ hook: "sessions", kind: "REVOKE", text: "Their sign-in sessions end." }], rolesEnded: ["Consultant"], consentScope: "SUMMARY", recordsKept: ["resumes", "the audit trail"], licenseNotice: null } };
    if (c.method === "PATCH") {
      if (c.headers["if-match"] !== `"${p.version}"`) return { status: 412, body: { error: "stale", code: "PRECONDITION_FAILED" } };
      if ("title" in c.body!) p.title = c.body!.title as string | null;
      p.version++;
      return { status: 200, body: detailOf(p) };
    }
    if (c.method === "PUT" && sub === "/roles") {
      const b = c.body as { roleIds: number[]; primaryRoleId: number };
      p.roleIds = b.roleIds;
      p.primary = b.primaryRoleId;
      return { status: 200, body: { memberId: p.id, roles: roleRefs(p) } };
    }
    if (c.method === "POST" && sub === "/suspend") {
      p.status = "SUSPENDED";
      return { status: 200, body: { memberId: p.id, action: "SUSPEND", previousStatus: "ACTIVE", status: "SUSPENDED", scheduled: null, lines: [] } };
    }
    if (c.method === "POST" && sub === "/reinstate") {
      p.status = "ACTIVE";
      return { status: 200, body: { memberId: p.id, action: "REINSTATE", previousStatus: "SUSPENDED", status: "ACTIVE", scheduled: null, lines: [] } };
    }
    if (c.method === "POST" && sub === "/offboard") {
      p.status = "REMOVED";
      return { status: 200, body: { memberId: p.id, action: "OFFBOARD", previousStatus: "ACTIVE", status: "REMOVED", scheduled: null, lines: [] } };
    }
  }
  return { status: 404, body: { error: "no" } };
}

const PERMS = { "member.view_summary": "ORG", "members.invite": "ORG", "members.role.set": "ORG", "members.group.set": "ORG", "members.manager.set": "ORG", "members.suspend": "ORG", "members.remove": "ORG" };

async function mount(over: { permissions?: Record<string, string> } = {}) {
  const out = render(
    <ToastProvider>
      <EmployeesPage orgId={2} orgName="Acme" workspace="admin" selfMemberId={1} permissions={over.permissions ?? PERMS} supportEmail={null} />
    </ToastProvider>,
  );
  await settle(0);
  return out;
}

const settle = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const rows = () => Array.from(document.querySelectorAll<HTMLElement>("tr[data-row-id]"));
const rowFor = (name: string) => rows().find((r) => r.textContent?.includes(name))!;
const calledWith = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

function phone(on: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({ matches: on && query.includes("max-width: 767px"), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  people = seedPeople();
  counts = { asOf: null, scope: "ORG", total: tile(4, 3), active: tile(3, 3), invited: tile(0, null), suspended: tile(1, null), departments: tile(1, null), teams: tile(1, null) };
  stubApi();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Employees: the list", () => {
  it("shows the roster, the footer and the six tiles", async () => {
    await mount();
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["1", "2", "3", "4"]);
    expect(screen.getByText("Showing 1-4 of 4 employees")).toBeTruthy();
    expect(Array.from(document.querySelectorAll("[data-kpi]")).map((e) => e.getAttribute("data-kpi"))).toEqual(["total", "active", "invited", "suspended", "departments", "teams"]);
    expect(document.querySelector("[data-kpi=total] [data-kpi-value]")?.textContent).toBe("4");
    // the first list call carries the default sort and page
    const first = calls.find((c) => c.path === "/members" && c.method === "GET")!;
    expect(first.params.get("sort")).toBe("joined,desc");
    expect(first.params.get("page")).toBe("0");
  });

  it("draws a delta only where the API gave one; the rest show no delta and never a sparkline", async () => {
    await mount();
    const total = document.querySelector("[data-kpi=total]")!;
    expect(total.querySelector("[data-kpi-delta]")?.textContent).toContain("vs last month");
    expect(total.querySelector("[data-kpi-delta]")?.textContent).toContain("+33.3%");
    for (const k of ["invited", "suspended", "departments", "teams"]) expect(document.querySelector(`[data-kpi=${k}] [data-kpi-delta]`), k).toBeNull();
    expect(document.querySelector("[data-kpi-tiles] svg[data-sparkline], [data-kpi-tiles] polyline")).toBeNull();
  });

  it("searches after the typing rests, and filters by status", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search employees"), { target: { value: "anika" } });
    await settle(400);
    expect(calls.filter((c) => c.path === "/members" && c.params.get("q") === "anika")).toHaveLength(1);
    expect(rows().map((r) => r.textContent)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search employees"), { target: { value: "" } });
    await settle(400);
    fireEvent.click(document.querySelector('[role=search] button[aria-label="Status"]')!);
    fireEvent.click(screen.getByRole("option", { name: "Suspended" }));
    await settle();
    expect(calls.at(-1)!.params.get("status") ?? calls.filter((c) => c.path === "/members").at(-1)!.params.get("status")).toBe("SUSPENDED");
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("Sam Whitfield");
  });

  it("sorts by a header and keeps the direction in aria-sort", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Employee" }));
    await settle();
    const last = calls.filter((c) => c.path === "/members").at(-1)!;
    expect(last.params.get("sort")).toBe("name,asc");
    expect(document.querySelector("th[aria-sort=ascending]")?.textContent).toContain("Employee");
    expect(rows()[0].textContent).toContain("Anika Rao");
    fireEvent.click(screen.getByRole("button", { name: "Employee" }));
    await settle();
    expect(calls.filter((c) => c.path === "/members").at(-1)!.params.get("sort")).toBe("name,desc");
  });

  it("pages with the page size the member picks", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Rows per page"));
    fireEvent.click(screen.getByRole("option", { name: "25 per page" }));
    await settle();
    expect(calls.filter((c) => c.path === "/members").at(-1)!.params.get("size")).toBe("25");
  });
});

describe("Employees: empty states", () => {
  it("says no one matches the filters and offers to clear them", async () => {
    await mount();
    overrides.push((c) => (c.path === "/members" && c.params.get("q") === "zzz" ? { status: 200, body: { items: [], page: 0, size: 10, total: 0, hasNext: false } } : undefined));
    fireEvent.change(screen.getByLabelText("Search employees"), { target: { value: "zzz" } });
    await settle(400);
    expect(screen.getByText("No employees match")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);
  });

  it("invites the first teammate when the owner is alone", async () => {
    people = [people[0]];
    await mount();
    expect(screen.getAllByText("Invite your first teammate").length).toBeGreaterThan(0);
    expect(document.querySelector('a[href="/w/admin/invitations?invite=1"]')).toBeTruthy();
  });

  it("shows an error with a retry when the list cannot load", async () => {
    overrides.push((c) => (c.path === "/members" && c.method === "GET" ? { status: 500, body: { error: "boom" } } : undefined));
    await mount();
    expect(screen.getByRole("button", { name: /Try again|Retry/ })).toBeTruthy();
  });

  it("hides Add Employee without the invite permission", async () => {
    await mount({ permissions: { "member.view_summary": "ORG" } });
    expect(document.querySelector("[data-add-employee]")).toBeNull();
  });
});

describe("Employees: summary-only rows", () => {
  it("show the job title instead of a work email and no manager", async () => {
    people[1].email = null;
    people[1].summaryOnly = true;
    await mount();
    const row = rowFor("Anika Rao");
    expect(row.textContent).not.toContain("anika@acme.test");
    expect(row.textContent).toContain("Consultant");
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("Employees: bulk actions", () => {
  const select = (...names: string[]) => names.forEach((n) => fireEvent.click(screen.getByRole("checkbox", { name: `Select ${n}` })));

  it("shows the bar for the ticked rows and clears it", async () => {
    await mount();
    expect(document.querySelector("[data-bulk-bar]")).toBeNull();
    select("Anika Rao", "Ben Okafor");
    expect(document.querySelector("[data-bulk-bar]")?.textContent).toContain("2 selected");
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(document.querySelector("[data-bulk-bar]")).toBeNull();
  });

  it("changes roles with an Idempotency-Key, reports it, and Undo sends the previous roles back", async () => {
    await mount();
    select("Anika Rao", "Ben Okafor");
    fireEvent.click(screen.getByRole("button", { name: "Change roles" }));
    const dialog = screen.getByRole("dialog", { name: "Change roles" });
    fireEvent.click(within(within(dialog).getByRole("group", { name: "Add these roles" })).getByLabelText("Marketing Specialist"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await settle();
    const bulk = calledWith("POST", "/members/bulk/roles")[0];
    expect(bulk.headers["idempotency-key"]).toBeTruthy();
    expect(bulk.body).toEqual({ memberIds: [2, 3], add: [4], remove: [] });
    expect(screen.getByText(/Updated roles for 1 person/)).toBeTruthy(); // Ben already had it: unchanged
    expect(screen.getByText(/1 person already as asked/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    const put = calledWith("PUT", "/members/2/roles")[0];
    expect(put.body).toEqual({ roleIds: [10], primaryRoleId: 10 });
    expect(calledWith("PUT", "/members/3/roles")).toHaveLength(0); // Ben did not change, nothing to put back
    expect(people[1].roleIds).toEqual([10]);
  });

  it("suspends with a reason and undoes with a reinstatement", async () => {
    await mount();
    select("Anika Rao");
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Access review pending" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend" }));
    await settle();
    expect(calledWith("POST", "/members/bulk/status")[0].body).toMatchObject({ memberIds: [2], action: "SUSPEND", reason: "Access review pending" });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(calledWith("POST", "/members/bulk/status")[1].body).toMatchObject({ memberIds: [2], action: "REINSTATE" });
  });

  it("reports skipped rows with the reason", async () => {
    await mount();
    overrides.push((c) => (c.path === "/members/bulk/status" ? { status: 200, body: { action: "SUSPEND", requested: 1, ok: 0, skipped: [{ memberId: 1, reason: "LAST_ADMIN" }], results: [{ memberId: 1, ok: false, reason: "LAST_ADMIN", previous: null }] } } : undefined));
    select("Olivia Owner");
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Testing the guard" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend" }));
    await settle();
    expect(screen.getByText("Nothing was suspended")).toBeTruthy();
    expect(screen.getByText(/without an administrator/)).toBeTruthy();
  });
});

describe("Employees: the detail sheet", () => {
  async function open(name: string) {
    fireEvent.click(rowFor(name));
    await settle();
  }

  it("opens on a row click with the overview, omits what the API does not return, and keeps the row highlighted", async () => {
    await mount();
    await open("Anika Rao");
    const sheet = document.querySelector("#ent-employee-sheet")!;
    expect(sheet.textContent).toContain("Anika Rao");
    expect(sheet.textContent).toContain("anika@acme.test");
    expect(sheet.querySelector("[data-contact]")?.querySelectorAll("li")).toHaveLength(1); // phone, location, timezone are null: no lines
    expect(rowFor("Anika Rao").getAttribute("aria-selected")).toBe("true");
    expect(sheet.textContent).toContain("Joined");
  });

  it("walks the three tabs", async () => {
    await mount();
    await open("Anika Rao");
    fireEvent.click(screen.getByRole("tab", { name: "Access & Roles" }));
    expect(document.querySelector("[data-tab-panel=access]")).toBeTruthy();
    expect(document.querySelector("[data-role-picker]")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    await settle();
    expect(document.querySelector("[data-tab-panel=activity]")?.textContent).toContain("Placement changed");
    expect(calls.some((c) => c.path === "/members/2/activity" && c.params.get("direction") === "on")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Done by them" }));
    await settle();
    expect(calls.some((c) => c.path === "/members/2/activity" && c.params.get("direction") === "by")).toBe(true);
  });

  it("autosaves the job title with If-Match, and no Save button exists", async () => {
    await mount();
    await open("Anika Rao");
    expect(screen.queryByRole("button", { name: /^save/i })).toBeNull();
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Senior Consultant" } });
    await settle(500);
    expect(calledWith("PATCH", "/members/2")).toHaveLength(0); // still typing
    await settle(500);
    const patch = calledWith("PATCH", "/members/2")[0];
    expect(patch.headers["if-match"]).toBe('"1"');
    expect(patch.body).toEqual({ title: "Senior Consultant" });
    expect(document.querySelector("[data-title-status=saved]")).toBeTruthy();
    expect(rowFor("Anika Rao").textContent).toContain("anika@acme.test");
  });

  it("handles a stale version (412) by reloading the person and sending the edit once more", async () => {
    await mount();
    await open("Anika Rao");
    people[1].version = 5; // somebody else edited meanwhile
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Lead" } });
    await settle(900);
    const patches = calledWith("PATCH", "/members/2");
    expect(patches.map((p) => p.headers["if-match"])).toEqual(['"1"', '"5"']);
    expect(people[1].title).toBe("Lead");
    expect(document.querySelector("[data-title-status=saved]")).toBeTruthy();
  });

  it("shows the reason when the API refuses a role (ROLE_CEILING) and puts the picker back", async () => {
    await mount();
    await open("Anika Rao");
    fireEvent.click(screen.getByRole("tab", { name: "Access & Roles" }));
    overrides.push((c) => (c.method === "PUT" ? { status: 422, body: { error: "above your access", code: "ROLE_CEILING", reason: "ADMIN_ROLE" } } : undefined));
    fireEvent.click(screen.getByLabelText(/^Owner/));
    await settle();
    expect(document.querySelector("[data-role-error]")?.textContent).toMatch(/administrator role/);
    expect((screen.getByLabelText(/^Owner/) as HTMLInputElement).checked).toBe(false);
  });

  it("changes roles through the picker and can make one primary", async () => {
    await mount();
    await open("Ben Okafor");
    fireEvent.click(screen.getByRole("tab", { name: "Access & Roles" }));
    fireEvent.click(screen.getByRole("button", { name: "Make primary" }));
    await settle();
    expect(calledWith("PUT", "/members/3/roles")[0].body).toEqual({ roleIds: [10, 4], primaryRoleId: 4 });
  });

  it("only lists the quick actions the API allows", async () => {
    await mount();
    await open("Sam Whitfield"); // suspended: reinstate, not suspend
    const qa = document.querySelector("[data-quick-actions]")!;
    expect(qa.querySelector('[data-quick-action="reinstate"]')).toBeTruthy();
    expect(qa.querySelector('[data-quick-action="suspend"]')).toBeNull();
    expect(qa.textContent).not.toMatch(/Reset Password/);
  });

  it("suspends with a reason and reinstates with an undo", async () => {
    await mount();
    await open("Anika Rao");
    fireEvent.click(document.querySelector('[data-quick-action="suspend"]')!);
    const dialog = screen.getByRole("dialog", { name: /Suspend Anika Rao/ });
    const confirm = within(dialog).getByRole("button", { name: "Suspend" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "short" } });
    expect(confirm.disabled).toBe(true); // under 10 characters
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Pending a review of access" } });
    fireEvent.click(confirm);
    await settle();
    expect(calledWith("POST", "/members/2/suspend")[0].body).toEqual({ reason: "Pending a review of access" });
    expect(people[1].status).toBe("SUSPENDED");
    fireEvent.click(screen.getByRole("button", { name: "Undo" })); // the toast's undo reinstates
    await settle();
    expect(calledWith("POST", "/members/2/reinstate")).toHaveLength(1);
    expect(people[1].status).toBe("ACTIVE");
  });

  it("offboards after the typed name, says the records are kept, and removes the person from the list", async () => {
    await mount();
    await open("Anika Rao");
    fireEvent.click(document.querySelector('[data-quick-action="offboard"]')!);
    await settle();
    const dialog = screen.getByRole("dialog", { name: /Offboard Anika Rao/ });
    expect(dialog.textContent).toContain("Their records are kept");
    expect(dialog.textContent).toContain("Their sign-in sessions end.");
    const go = within(dialog).getByRole("button", { name: "Offboard" }) as HTMLButtonElement;
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Left the company in May" } });
    expect(go.disabled).toBe(true); // the name is not typed yet
    fireEvent.change(within(dialog).getByLabelText("Type Anika Rao to confirm"), { target: { value: "Anika Rao" } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await settle();
    const call = calledWith("POST", "/members/2/offboard")[0];
    expect(call.body).toEqual({ reason: "Left the company in May", confirm: "Anika Rao", effectiveAt: null });
    expect(call.headers["idempotency-key"]).toBeTruthy();
    expect(rows().some((r) => r.textContent?.includes("Anika Rao"))).toBe(false);
  });

  it("blocks an offboarding the API says cannot happen", async () => {
    await mount();
    overrides.push((c) => (c.path === "/members/1/offboard-preview" ? { status: 200, body: { memberId: 1, name: "Olivia Owner", status: "ACTIVE", blockers: [{ code: "LAST_ADMIN", message: "This is the last administrator." }], lines: [], rolesEnded: [], consentScope: null, recordsKept: [], licenseNotice: null } } : undefined));
    await open("Olivia Owner");
    fireEvent.click(document.querySelector('[data-quick-action="offboard"]')!);
    await settle();
    const dialog = screen.getByRole("dialog", { name: /Offboard Olivia Owner/ });
    expect(dialog.querySelector("[data-offboard-blockers]")?.textContent).toContain("last administrator");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Trying the guard" } });
    fireEvent.change(within(dialog).getByLabelText("Type Olivia Owner to confirm"), { target: { value: "Olivia Owner" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Offboard" }));
    await settle();
    expect(calledWith("POST", "/members/1/offboard")).toHaveLength(0);
    expect(dialog.textContent).toContain("This is the last administrator.");
  });

  it("says so when the person is no longer in the caller's view (404)", async () => {
    await mount();
    overrides.push((c) => (c.path === "/members/2" && c.method === "GET" ? { status: 404, body: { error: "Not found" } } : undefined));
    await open("Anika Rao");
    expect(document.querySelector("#ent-employee-sheet")?.textContent).toMatch(/no longer in your view/);
  });
});

describe("Employees: on a phone", () => {
  it("turns the table into cards and the sheet into a bottom sheet", async () => {
    phone(true);
    await mount();
    expect(document.querySelector("table")).toBeNull();
    const cards = document.querySelectorAll("[data-employee-cards] > li");
    expect(cards).toHaveLength(4);
    fireEvent.click(within(cards[1] as HTMLElement).getByRole("button", { name: /Anika Rao/ }));
    await settle();
    const sheet = document.querySelector("#ent-employee-sheet");
    expect(sheet?.getAttribute("role")).toBe("dialog");
    expect(sheet?.textContent).toContain("Anika Rao");
    expect(screen.getByLabelText("Sort by")).toBeTruthy();
  });
});
