// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@kiwiply/ui";
import { dayInput, type ConsultantPage, type Kpis, type KpiTile, type Marketer, type Row, type Schedule } from "@/lib/ent/marketing-assignments";
import MarketingAssignmentsPage from "./MarketingAssignmentsPage";

vi.setConfig({ testTimeout: 30_000 }); // a cold first render of the whole board is slow on a busy machine

/* ── a stand-in for the BFF: records every call, answers from a small in-memory world ───────────────────── */

type Call = { method: string; url: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined; headers: Record<string, string> };
let calls: Call[];
let overrides: ((c: Call) => { status: number; body?: unknown } | undefined)[];

interface World {
  marketers: { id: number; name: string; title: string; capacity: number; status: string }[];
  assignments: Map<number, { marketer: number; backup: number | null; priority: string; status: string; lastActivity: string }>;
  consultants: { id: number; name: string; title: string }[];
  /** Planned handovers and cover (H-assign). */
  plans: Schedule[];
  /** When set, a reassign answers 409 CONSULTANTS_LIMIT (the licence cap). */
  licenceMax?: number;
}
let world: World;

const nameOf = (id: number | null) => world.marketers.find((m) => m.id === id)?.name ?? "Member";
const person = (id: number | null) => (id == null ? null : { memberId: id, name: nameOf(id) });
const rowOf = (id: number): Row => {
  const c = world.consultants.find((x) => x.id === id)!;
  const a = world.assignments.get(id);
  return {
    consultantId: id, name: c.name, jobTitle: c.title, email: null, availability: "AVAILABLE",
    marketer: person(a?.marketer ?? null), backup: person(a?.backup ?? null), status: (a?.status as Row["status"]) ?? null, priority: (a?.priority as Row["priority"]) ?? null,
    activeApps: 2, lastActivityAt: a?.lastActivity ?? null, assignedAt: null,
  };
};
const count = (marketer: number) => [...world.assignments.values()].filter((a) => a.marketer === marketer).length;
const marketerOf = (m: World["marketers"][number]): Marketer => {
  const assigned = count(m.id);
  const percent = Math.round((assigned * 100) / m.capacity);
  return { memberId: m.id, name: m.name, title: m.title, status: m.status, capacity: m.capacity, assigned, percent, overloaded: assigned * 100 >= 90 * m.capacity, canManage: true };
};
const tile = (key: KpiTile["key"], current: number, previous: number | null, good: KpiTile["good"]): KpiTile => ({
  key, current, previous, delta: previous === null ? null : current - previous, deltaPct: previous ? Math.round(((current - previous) * 1000) / previous) / 1000 : null, series: [1, 2, 3, 4, 5, 6, 7, current], good,
});
const snapshotOf = (id: number) => {
  const a = world.assignments.get(id);
  return a ? { marketerMemberId: a.marketer, backupMemberId: a.backup, priority: a.priority, status: a.status } : {};
};

function answer(c: Call): { status: number; body?: unknown } {
  for (const o of overrides) {
    const r = o(c);
    if (r) return r;
  }
  const p = c.path.replace("/marketing-assignments", "");
  if (p === "/marketers" && c.method === "GET") {
    const q = (c.params.get("q") ?? "").toLowerCase();
    const st = c.params.get("status");
    const items = world.marketers.filter((m) => (!st || m.status === st) && (!q || m.name.toLowerCase().includes(q))).map(marketerOf).sort((a, b) => b.percent - a.percent);
    const total = items.reduce((n, m) => n + m.assigned, 0);
    return { status: 200, body: { items, canManage: true, summary: { marketers: items.length, totalAssigned: total, avgPerMarketer: items.length ? Math.round((total * 10) / items.length) / 10 : null, overloaded: items.filter((m) => m.overloaded).length, unassigned: world.consultants.length - world.assignments.size } } };
  }
  if (p === "/kpis") {
    const kpis: Kpis = { tiles: [tile("assigned", world.assignments.size, 3, "UP"), tile("marketers", world.marketers.length, null, "UP"), tile("unassigned", world.consultants.length - world.assignments.size, 2, "DOWN"), tile("overloaded", 1, 0, "DOWN")], generatedAt: "2026-10-13T09:00:00Z", note: "Rebuilt from timestamps." };
    return { status: 200, body: kpis };
  }
  if (p === "/filters") return { status: 200, body: { clients: [{ id: 1, name: "TechCorp", detail: null }], statuses: ["ACTIVE", "PAUSED"], priorities: ["HIGH", "MEDIUM", "LOW"], availabilities: ["AVAILABLE", "ON_PROJECT"] } };
  if (p === "/consultants" && c.method === "GET") {
    const mid = c.params.get("marketerId");
    const unassigned = c.params.get("unassigned") === "true";
    const q = (c.params.get("q") ?? "").toLowerCase();
    let items = world.consultants.map((x) => rowOf(x.id)).filter((r) => (unassigned ? !r.marketer : !!r.marketer));
    if (mid) items = items.filter((r) => r.marketer?.memberId === Number(mid));
    if (q) items = items.filter((r) => r.name.toLowerCase().includes(q));
    if (c.params.get("priority")) items = items.filter((r) => r.priority === c.params.get("priority"));
    if (c.params.get("status")) items = items.filter((r) => r.status === c.params.get("status"));
    const [key, dir] = (c.params.get("sort") ?? "lastActivity,desc").split(",");
    const by = (r: Row) => (key === "name" ? r.name : key === "priority" ? ["HIGH", "MEDIUM", "LOW"].indexOf(r.priority ?? "") : (r.lastActivityAt ?? ""));
    items = [...items].sort((a, b) => (by(a) < by(b) ? -1 : by(a) > by(b) ? 1 : 0) * (dir === "desc" ? -1 : 1));
    const size = Number(c.params.get("size") ?? 10);
    const page = Number(c.params.get("page") ?? 0);
    const body: ConsultantPage = { items: items.slice(page * size, page * size + size), page, size, total: items.length, hasMore: (page + 1) * size < items.length };
    return { status: 200, body };
  }
  if (p === "/assign") {
    const b = c.body as { consultantIds: number[]; marketerMemberId: number; allowOverCapacity?: boolean };
    const m = world.marketers.find((x) => x.id === b.marketerMemberId)!;
    const adds = b.consultantIds.filter((id) => world.assignments.get(id)?.marketer !== m.id).length;
    if (count(m.id) + adds > m.capacity && !b.allowOverCapacity) return { status: 409, body: { error: "This would put the marketer over capacity", code: "OVER_CAPACITY", marketerMemberId: m.id, capacity: m.capacity, current: count(m.id), adding: adds, projected: count(m.id) + adds } };
    const results = b.consultantIds.map((id) => {
      const previous = snapshotOf(id);
      const old = world.assignments.get(id);
      world.assignments.set(id, { marketer: m.id, backup: null, priority: old?.priority ?? "MEDIUM", status: old?.status ?? "ACTIVE", lastActivity: "2026-10-13T09:00:00Z" });
      return { consultantId: id, ok: true, reason: null, previous };
    });
    return { status: 200, body: { action: "ASSIGN", requested: results.length, ok: results.length, skipped: [], results } };
  }
  if (p === "/update") {
    const b = c.body as { consultantIds: number[]; priority?: string; status?: string; backupMemberId?: number; clearBackup?: boolean };
    const results = b.consultantIds.map((id) => {
      const a = world.assignments.get(id)!;
      const previous = snapshotOf(id);
      if (b.priority) a.priority = b.priority;
      if (b.status) a.status = b.status;
      if (b.backupMemberId) a.backup = b.backupMemberId;
      if (b.clearBackup) a.backup = null;
      return { consultantId: id, ok: true, reason: null, previous };
    });
    return { status: 200, body: { action: "UPDATE", requested: results.length, ok: results.length, skipped: [], results } };
  }
  if (p === "/unassign") {
    const b = c.body as { consultantIds: number[] };
    const results = b.consultantIds.map((id) => {
      const previous = snapshotOf(id);
      world.assignments.delete(id);
      return { consultantId: id, ok: true, reason: null, previous };
    });
    return { status: 200, body: { action: "UNASSIGN", requested: results.length, ok: results.length, skipped: [], results } };
  }
  if (p === "/restore") {
    const b = c.body as { rows: { consultantId: number; marketerMemberId: number | null; backupMemberId: number | null; priority: string; status: string }[] };
    const results = b.rows.map((r) => {
      const previous = snapshotOf(r.consultantId);
      if (r.marketerMemberId == null) world.assignments.delete(r.consultantId);
      else world.assignments.set(r.consultantId, { marketer: r.marketerMemberId, backup: r.backupMemberId, priority: r.priority, status: r.status, lastActivity: "2026-10-13T09:00:00Z" });
      return { consultantId: r.consultantId, ok: true, reason: null, previous };
    });
    return { status: 200, body: { action: "RESTORE", requested: results.length, ok: results.length, skipped: [], results } };
  }
  if (p === "/workload") return { status: 200, body: { items: world.marketers.map((m) => ({ ...marketerOf(m), memberId: m.id, highPriority: 1, paused: 0, withoutBackup: 2, activeApps: 5, backupFor: 0 })), summary: { marketers: 3, totalAssigned: 4, avgPerMarketer: 1.3, overloaded: 1, unassigned: 1 }, generatedAt: "2026-10-13T09:00:00Z" } };
  if (p === "/marketers/candidates") return { status: 200, body: { items: [{ id: 99, name: "Nia Brooks", detail: "Marketing Specialist" }] } };
  if (p === "/marketers" && c.method === "POST") {
    world.marketers.push({ id: 99, name: "Nia Brooks", title: (c.body?.title as string) ?? "Marketing", capacity: c.body?.capacity as number, status: "ACTIVE" });
    return { status: 201, body: marketerOf(world.marketers.at(-1)!) };
  }
  const patch = /^\/marketers\/(\d+)$/.exec(p);
  if (patch && c.method === "PATCH") {
    const m = world.marketers.find((x) => x.id === Number(patch[1]))!;
    if (c.body?.capacity) m.capacity = c.body.capacity as number;
    if (c.body?.status) m.status = c.body.status as string;
    return { status: 200, body: marketerOf(m) };
  }
  if (p === "/schedules" && c.method === "GET") return { status: 200, body: { items: world.plans.filter((x) => x.status === "SCHEDULED" || x.status === "ACTIVE") } };
  if (p === "/handover-preview") {
    const id = Number(c.params.get("consultantId"));
    const to = c.params.get("toMemberId") ? Number(c.params.get("toMemberId")) : null;
    const target = world.marketers.find((m) => m.id === to);
    const open = !!world.assignments.get(id);
    return {
      status: 200,
      body: {
        consultantId: id, consultantName: world.consultants.find((x) => x.id === id)?.name ?? "", from: person(world.assignments.get(id)?.marketer ?? null), to: person(to),
        opportunities: open ? 2 : 0, tasks: open ? 1 : 0, followups: 0, total: open ? 3 : 0, handoverEnabled: true,
        toAssigned: target ? count(target.id) : null, toCapacity: target ? target.capacity : null, licenceMax: world.licenceMax ?? null,
        overCapacity: target ? count(target.id) + 1 > target.capacity : false, overLicence: !!world.licenceMax && !!target && count(target.id) + 1 > world.licenceMax,
        pending: world.plans.filter((x) => x.consultantId === id && (x.status === "SCHEDULED" || x.status === "ACTIVE")),
      },
    };
  }
  if (p === "/reassign") {
    const b = c.body as { consultantId: number; newMarketerMemberId: number; effectiveAt?: string; reason?: string; allowOverCapacity?: boolean };
    const target = world.marketers.find((m) => m.id === b.newMarketerMemberId)!;
    if (world.licenceMax && count(target.id) + 1 > world.licenceMax) return { status: 409, body: { error: "The licence allows " + world.licenceMax + " consultants per marketer", code: "CONSULTANTS_LIMIT", marketerMemberId: target.id, max: world.licenceMax, current: count(target.id), adding: 1, projected: count(target.id) + 1 } };
    if (b.effectiveAt) {
      const plan: Schedule = {
        id: 900 + world.plans.length, consultantId: b.consultantId, consultantName: world.consultants.find((x) => x.id === b.consultantId)?.name ?? null, kind: "REASSIGN", status: "SCHEDULED",
        newMarketer: person(target.id)!, returnMarketer: null, currentMarketer: person(world.assignments.get(b.consultantId)?.marketer ?? null), startsAt: b.effectiveAt, endsAt: null,
        reason: b.reason ?? null, outcome: null, createdBy: null, createdAt: "2026-10-13T09:00:00Z", appliedAt: null, finishedAt: null,
      };
      world.plans.push(plan);
      return { status: 200, body: { status: "SCHEDULED", applied: null, schedule: plan } };
    }
    const r = answer({ ...c, path: "/marketing-assignments/assign", body: { consultantIds: [b.consultantId], marketerMemberId: b.newMarketerMemberId, ...(b.allowOverCapacity ? { allowOverCapacity: true } : {}) } });
    return r.status === 200 ? { status: 200, body: { status: "DONE", applied: r.body, schedule: null } } : r;
  }
  if (p === "/delegate") {
    const b = c.body as { consultantId: number; coverMarketerMemberId: number; startsAt?: string; endsAt: string; reason: string };
    const plan: Schedule = {
      id: 900 + world.plans.length, consultantId: b.consultantId, consultantName: world.consultants.find((x) => x.id === b.consultantId)?.name ?? null, kind: "DELEGATE", status: b.startsAt ? "SCHEDULED" : "ACTIVE",
      newMarketer: person(b.coverMarketerMemberId)!, returnMarketer: person(world.assignments.get(b.consultantId)?.marketer ?? null), currentMarketer: person(b.startsAt ? (world.assignments.get(b.consultantId)?.marketer ?? null) : b.coverMarketerMemberId),
      startsAt: b.startsAt ?? "2026-10-13T09:00:00Z", endsAt: b.endsAt, reason: b.reason, outcome: null, createdBy: null, createdAt: "2026-10-13T09:00:00Z", appliedAt: null, finishedAt: null,
    };
    world.plans.push(plan);
    return { status: 200, body: plan };
  }
  const cancel = /^\/schedules\/(\d+)\/cancel$/.exec(p);
  if (cancel && c.method === "POST") {
    const plan = world.plans.find((x) => x.id === Number(cancel[1]));
    if (!plan) return { status: 404, body: { error: "no" } };
    plan.status = plan.status === "ACTIVE" ? "ENDED" : "CANCELLED";
    return { status: 200, body: plan };
  }
  return { status: 404, body: { error: "no" } };
}

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

const settle = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const PERMS_ALL = { "assignments.manage": "ORG", "workload.view": "ORG", "consultants.view": "ORG", "clients.view": "ORG", "members.invite": "ORG" };

async function mount(over: { permissions?: Record<string, string>; initialSearch?: Record<string, string> } = {}) {
  const out = render(
    <ToastProvider>
      <MarketingAssignmentsPage orgId={2} workspace="admin" permissions={over.permissions ?? PERMS_ALL} initialSearch={over.initialSearch} />
    </ToastProvider>,
  );
  await settle(0);
  await settle(0);
  return out;
}
const tableRows = () => within(screen.getByRole("table", { name: "Assigned consultants" })).getAllByRole("row").slice(1);
const rowFor = (name: string) => tableRows().find((r) => r.textContent?.includes(name))!;
const calledWith = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === `/marketing-assignments${path}`);
const lastList = () => calls.filter((c) => c.path === "/marketing-assignments/consultants" && !c.params.get("unassigned")).at(-1)!;
const openRowMenu = (name: string) => {
  fireEvent.click(within(rowFor(name)).getByRole("button", { name: "Row actions" }));
};

beforeEach(() => {
  vi.useFakeTimers();
  world = {
    marketers: [
      { id: 11, name: "Jessica Davis", title: "Marketing Consultant", capacity: 3, status: "ACTIVE" },
      { id: 12, name: "Michael Park", title: "Marketing Consultant", capacity: 2, status: "ACTIVE" },
      { id: 13, name: "Ava Reed", title: "Marketing Consultant", capacity: 5, status: "ACTIVE" },
    ],
    consultants: [
      { id: 1, name: "Daniel Clark", title: "Java Developer" },
      { id: 2, name: "Sophia Patel", title: "Product Manager" },
      { id: 3, name: "Ethan Miller", title: "Data Analyst" },
      { id: 4, name: "Olivia Carter", title: "UX Designer" },
      { id: 5, name: "Zoe Unassigned", title: "QA Engineer" },
    ],
    plans: [],
    assignments: new Map([
      [1, { marketer: 11, backup: 12, priority: "HIGH", status: "ACTIVE", lastActivity: "2026-10-12T09:00:00Z" }],
      [2, { marketer: 11, backup: null, priority: "MEDIUM", status: "ACTIVE", lastActivity: "2026-10-11T09:00:00Z" }],
      [3, { marketer: 12, backup: null, priority: "LOW", status: "ACTIVE", lastActivity: "2026-10-10T09:00:00Z" }],
      [4, { marketer: 12, backup: null, priority: "LOW", status: "PAUSED", lastActivity: "2026-10-09T09:00:00Z" }],
    ]),
  };
  stubApi();
  window.history.replaceState(null, "", "/w/admin/marketing-assignments");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Marketing Assignments: the board", () => {
  it("shows the two attention tiles without trend, the marketers by load, and the first marketer's consultants", async () => {
    await mount();
    expect(Array.from(document.querySelectorAll("[data-kpi]")).map((e) => e.getAttribute("data-kpi"))).toEqual(["unassigned", "overloaded"]);
    expect(document.querySelector("[data-kpi=overloaded] [data-kpi-value]")?.textContent).toBe("1");
    expect(document.querySelector("[data-kpi-delta]")).toBeNull();
    expect(document.querySelectorAll("[data-kpi] [data-sparkline]").length).toBe(0);
    const cards = Array.from(document.querySelectorAll("[data-marketer]"));
    expect(cards.map((c) => c.getAttribute("data-marketer"))).toEqual(["12", "11", "13"]); // Michael is full (100%), Jessica 67%, Ava 0
    expect(cards[0].querySelector("[data-load]")?.textContent).toBe("2 / 2");
    expect(cards[0].querySelector("[data-percent]")?.textContent).toBe("100%");
    // the most loaded marketer is selected first
    expect(document.querySelector("[data-consultants-subtitle]")?.textContent).toBe("Consultants assigned to Michael Park (2 total)");
    expect(tableRows().map((r) => r.textContent)).toHaveLength(2);
    expect(document.querySelector("[data-marketers-count]")?.textContent).toBe("3 marketers · 4 assigned");
    expect(document.querySelector("[data-summary]")).toBeNull(); // the footer trio is gone
    expect(screen.getByRole("button", { name: /View workload report/ })).toBeTruthy();
    expect(document.querySelector("[data-help-bee]")).toBeNull();
    expect(screen.queryByText(/Need help with marketing assignments/)).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Last activity/i })).toBeNull();
  });

  it("puts the selected marketer in the URL and selects another on a click", async () => {
    await mount();
    expect(window.location.search).toBe("?m=12");
    fireEvent.click(screen.getByRole("button", { name: /^Jessica Davis, 2 \/ 3/ }));
    await settle();
    expect(lastList().params.get("marketerId")).toBe("11");
    expect(window.location.search).toBe("?m=11");
    expect(rowFor("Daniel Clark").textContent).toContain("Michael Park"); // backup
    expect(document.querySelector("[data-consultants-subtitle]")?.textContent).toContain("Jessica Davis (2 total)");
  });

  it("opens from a shared link on the same marketer, filter and page", async () => {
    await mount({ initialSearch: { m: "11", priority: "HIGH", sort: "name,asc" } });
    const l = lastList();
    expect(l.params.get("marketerId")).toBe("11");
    expect(l.params.get("priority")).toBe("HIGH");
    expect(l.params.get("sort")).toBe("name,asc");
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0].textContent).toContain("Daniel Clark");
  });

  it("searches the table after the typing rests and sorts by a header", async () => {
    await mount({ initialSearch: { m: "11" } });
    fireEvent.change(screen.getByLabelText("Search consultants"), { target: { value: "sophia" } });
    await settle(400);
    expect(lastList().params.get("q")).toBe("sophia");
    expect(window.location.search).toContain("q=sophia");
    expect(tableRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search consultants"), { target: { value: "" } });
    await settle(400);
    fireEvent.click(screen.getByRole("button", { name: "Consultant" }));
    await settle();
    expect(lastList().params.get("sort")).toBe("name,asc");
  });

  it("filters the marketers on the left", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search marketers"), { target: { value: "ava" } });
    await settle(400);
    expect(Array.from(document.querySelectorAll("[data-marketer]")).map((c) => c.getAttribute("data-marketer"))).toEqual(["13"]);
    expect(window.location.search).toContain("mq=ava");
  });

  it("shows an empty table with a way forward for a marketer with no consultants", async () => {
    await mount({ initialSearch: { m: "13" } });
    expect(screen.getByText("Ava Reed has no consultants yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Assign consultants" }).length).toBeGreaterThan(0);
  });

  it("shows an error with a retry when the marketers cannot load", async () => {
    overrides.push((c) => (c.path === "/marketing-assignments/marketers" && c.method === "GET" ? { status: 500, body: { error: "boom" } } : undefined));
    await mount();
    expect(screen.getByText("boom")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Try again|Retry/ }).length).toBeGreaterThan(0);
  });

  it("says there are no marketers yet and offers Add Marketer", async () => {
    world.marketers = [];
    world.assignments = new Map();
    await mount();
    expect(screen.getByText("No marketers yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Add marketer/ }).length).toBeGreaterThan(0);
  });
});

describe("Marketing Assignments: read only", () => {
  it("draws no change controls without assignments.manage", async () => {
    await mount({ permissions: { "workload.view": "ORG" } });
    expect(screen.queryByRole("button", { name: /Add marketer/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign consultants" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Bulk actions/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Select Daniel/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Row actions" })).toBeNull();
    expect(tableRows().length).toBeGreaterThan(0);
  });
});

describe("Marketing Assignments: changes with Undo", () => {
  it("sets a priority from the row menu with an Idempotency-Key and Undo puts it back", async () => {
    await mount({ initialSearch: { m: "11" } });
    openRowMenu("Sophia Patel");
    fireEvent.click(screen.getByRole("menuitem", { name: "High" }));
    await settle();
    const call = calledWith("POST", "/update")[0];
    expect(call.headers["idempotency-key"]).toBeTruthy();
    expect(call.body).toEqual({ consultantIds: [2], priority: "HIGH" });
    expect(world.assignments.get(2)!.priority).toBe("HIGH");
    expect(screen.getByText(/Set high priority on 1 consultant/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    const restore = calledWith("POST", "/restore")[0];
    expect(restore.body).toEqual({ rows: [{ consultantId: 2, marketerMemberId: 11, backupMemberId: null, priority: "MEDIUM", status: "ACTIVE" }] });
    expect(world.assignments.get(2)!.priority).toBe("MEDIUM");
    expect(screen.getByText("Undone")).toBeTruthy();
  });

  it("runs a bulk action on the ticked rows", async () => {
    await mount({ initialSearch: { m: "11" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Daniel Clark" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Sophia Patel" }));
    fireEvent.click(screen.getByRole("button", { name: /Bulk actions/ }));
    expect(screen.getByRole("menuitem", { name: "Pause" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Pause" }));
    await settle();
    expect(calledWith("POST", "/update")[0].body).toEqual({ consultantIds: [1, 2], status: "PAUSED" });
    expect(screen.getByText(/Paused 2 consultants/)).toBeTruthy();
    expect(world.assignments.get(1)!.status).toBe("PAUSED");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(world.assignments.get(1)!.status).toBe("ACTIVE");
    expect(world.assignments.get(2)!.status).toBe("ACTIVE");
  });

  it("offers nothing to do in Bulk Actions until rows are ticked", async () => {
    await mount({ initialSearch: { m: "11" } });
    fireEvent.click(screen.getByRole("button", { name: /Bulk actions/ }));
    expect(screen.getByRole("menuitem", { name: "Select consultants in the table first" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("menuitem", { name: "Pause" })).toBeNull();
  });

  it("unassigns and Undo brings the assignment back as it was", async () => {
    await mount({ initialSearch: { m: "11" } });
    openRowMenu("Daniel Clark");
    fireEvent.click(screen.getByRole("menuitem", { name: "Unassign" }));
    await settle();
    expect(world.assignments.has(1)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(world.assignments.get(1)).toMatchObject({ marketer: 11, backup: 12, priority: "HIGH" });
  });

  it("reassigns, warns when the new marketer is full, and goes ahead only on Assign anyway", async () => {
    await mount({ initialSearch: { m: "11" } });
    openRowMenu("Daniel Clark");
    fireEvent.click(screen.getByRole("menuitem", { name: /Reassign or schedule/ }));
    const dialog = screen.getByRole("dialog", { name: /Reassign Daniel Clark/ });
    expect(within(dialog).queryByLabelText(/^Jessica Davis/)).toBeNull(); // the current marketer is not offered
    fireEvent.click(within(dialog).getByLabelText(/^Michael Park, 2 of 2/));
    await settle();
    // before anything happens the sheet says how much open work moves (counts only) and how full the new marketer would be
    expect(dialog.querySelector("[data-preview-line]")?.textContent).toBe("2 open opportunities and 1 task move to Michael Park.");
    expect(Array.from(dialog.querySelectorAll("[data-preview-counts] dd")).map((e) => e.textContent)).toEqual(["2", "1", "0"]);
    expect(dialog.textContent).toContain("Michael Park would carry 3 of 2 consultants");
    fireEvent.click(dialog.querySelector("[data-reassign-submit]")!);
    await settle();
    expect(world.assignments.get(1)!.marketer).toBe(11); // refused
    expect(within(dialog).getByRole("alert").textContent).toContain("Michael Park would have 3 of 2 consultants, 1 over.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign anyway" }));
    await settle();
    const assigns = calledWith("POST", "/reassign");
    expect(assigns).toHaveLength(2);
    expect(assigns[0].body).toEqual({ consultantId: 1, newMarketerMemberId: 12 });
    expect(assigns[1].body).toEqual({ consultantId: 1, newMarketerMemberId: 12, allowOverCapacity: true });
    expect(assigns[1].headers["idempotency-key"]).not.toBe(assigns[0].headers["idempotency-key"]);
    expect(world.assignments.get(1)!.marketer).toBe(12);
    expect(screen.getByText(/Reassigned 1 consultant/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(world.assignments.get(1)).toMatchObject({ marketer: 11, backup: 12 });
  });

  it("schedules a handover for a future day, shows it under the consultant, and Undo cancels the plan", async () => {
    await mount({ initialSearch: { m: "11" } });
    openRowMenu("Daniel Clark");
    fireEvent.click(screen.getByRole("menuitem", { name: /Reassign or schedule/ }));
    const sheet = screen.getByRole("dialog", { name: /Reassign Daniel Clark/ });
    fireEvent.click(within(sheet).getByLabelText(/^Ava Reed, 0 of 5/));
    fireEvent.click(sheet.querySelector("[data-when-date]")!);
    const day = dayInput(6);
    fireEvent.change(within(sheet).getByLabelText("Hand over on"), { target: { value: day } });
    fireEvent.change(within(sheet).getByLabelText("Reason"), { target: { value: "Workload balance" } });
    await settle();
    expect(within(sheet).getByRole("button", { name: "Schedule handover" })).toBeTruthy();
    fireEvent.click(sheet.querySelector("[data-reassign-submit]")!);
    await settle();
    const sent = calledWith("POST", "/reassign")[0];
    expect(sent.body).toMatchObject({ consultantId: 1, newMarketerMemberId: 13, reason: "Workload balance" });
    expect(typeof sent.body?.effectiveAt).toBe("string");
    expect(sent.headers["idempotency-key"]).toBeTruthy();
    expect(world.assignments.get(1)!.marketer).toBe(11); // nothing moves today
    expect(screen.getByText("Handover scheduled")).toBeTruthy();
    expect(rowFor("Daniel Clark").querySelector("[data-plan-note=REASSIGN]")?.textContent).toMatch(/^Moves to Ava Reed on /);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(world.plans[0].status).toBe("CANCELLED");
    expect(calledWith("POST", "/schedules/900/cancel")).toHaveLength(1);
  });

  it("sets temporary cover: needs an end day and a reason, then shows who covers until when", async () => {
    await mount({ initialSearch: { m: "11" } });
    openRowMenu("Daniel Clark");
    fireEvent.click(screen.getByRole("menuitem", { name: /Temporary cover/ }));
    const sheet = screen.getByRole("dialog", { name: /Reassign Daniel Clark/ });
    expect(sheet.querySelector("[data-mode-cover]")?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(sheet).getByLabelText(/^Ava Reed, 0 of 5/));
    await settle();
    const submit = sheet.querySelector("[data-reassign-submit]") as HTMLButtonElement;
    expect(submit.textContent).toBe("Start cover");
    expect(submit.disabled).toBe(true); // no end day, no reason
    fireEvent.change(within(sheet).getByLabelText("Back on"), { target: { value: dayInput(9) } });
    expect(submit.disabled).toBe(true); // still no reason
    fireEvent.change(within(sheet).getByLabelText("Reason"), { target: { value: "On leave" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await settle();
    const sent = calledWith("POST", "/delegate")[0];
    expect(sent.body).toMatchObject({ consultantId: 1, coverMarketerMemberId: 13, reason: "On leave" });
    expect(typeof sent.body?.endsAt).toBe("string");
    expect(sent.body).not.toHaveProperty("startsAt"); // starts now
    expect(screen.getByText("Ava Reed is covering Daniel Clark")).toBeTruthy();
    expect(rowFor("Daniel Clark").querySelector("[data-plan-note=DELEGATE]")?.textContent).toMatch(/^Covered by Ava Reed until /);
  });

  it("a licence cap stops the change and offers no way around it", async () => {
    world.licenceMax = 2;
    await mount({ initialSearch: { m: "11" } });
    openRowMenu("Daniel Clark");
    fireEvent.click(screen.getByRole("menuitem", { name: /Reassign or schedule/ }));
    const sheet = screen.getByRole("dialog", { name: /Reassign Daniel Clark/ });
    fireEvent.click(within(sheet).getByLabelText(/^Michael Park, 2 of 2/));
    await settle();
    fireEvent.click(sheet.querySelector("[data-reassign-submit]")!);
    await settle();
    expect(sheet.querySelector("[data-licence-limit]")?.textContent).toContain("It allows 2 consultants per marketer and Michael Park already has 2.");
    expect(within(sheet).queryByRole("button", { name: "Assign anyway" })).toBeNull();
    expect((sheet.querySelector("[data-reassign-submit]") as HTMLButtonElement).disabled).toBe(true);
    expect(world.assignments.get(1)!.marketer).toBe(11);
  });

  it("lists the plans already waiting for the consultant and cancels one", async () => {
    world.plans.push({
      id: 700, consultantId: 1, consultantName: "Daniel Clark", kind: "DELEGATE", status: "SCHEDULED", newMarketer: { memberId: 13, name: "Ava Reed" }, returnMarketer: null, currentMarketer: { memberId: 11, name: "Jessica Davis" },
      startsAt: "2030-01-10T00:00:00Z", endsAt: "2030-01-20T00:00:00Z", reason: "Holiday", outcome: null, createdBy: null, createdAt: "2026-10-13T09:00:00Z", appliedAt: null, finishedAt: null,
    });
    await mount({ initialSearch: { m: "11" } });
    expect(rowFor("Daniel Clark").querySelector("[data-plan-note=DELEGATE]")?.textContent).toContain("Ava Reed covers from");
    openRowMenu("Daniel Clark");
    fireEvent.click(screen.getByRole("menuitem", { name: /Reassign or schedule/ }));
    const sheet = screen.getByRole("dialog", { name: /Reassign Daniel Clark/ });
    await settle();
    const pending = sheet.querySelector("[data-pending-plans]")!;
    expect(pending.textContent).toContain("Holiday");
    fireEvent.click(within(pending as HTMLElement).getByRole("button", { name: "Cancel" }));
    await settle();
    expect(calledWith("POST", "/schedules/700/cancel")).toHaveLength(1);
    expect(world.plans[0].status).toBe("CANCELLED");
    expect(screen.getByText("Plan cancelled")).toBeTruthy();
  });

  it("assigns unassigned consultants to the selected marketer from the dialog", async () => {
    await mount({ initialSearch: { m: "13" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Assign consultants" })[0]);
    await settle(300);
    const dialog = screen.getByRole("dialog", { name: /Assign consultants to Ava Reed/ });
    expect(within(dialog).getByText("Zoe Unassigned")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Assign\s*consultants?/ }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Select Zoe Unassigned" }));
    expect(within(dialog).getByText("1 selected")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign 1 consultant" }));
    await settle();
    expect(calledWith("POST", "/assign")[0].body).toEqual({ consultantIds: [5], marketerMemberId: 13 });
    expect(world.assignments.get(5)!.marketer).toBe(13);
    expect(screen.queryByRole("dialog", { name: /Assign consultants to/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" })); // a first assignment is taken away again
    await settle();
    expect(world.assignments.has(5)).toBe(false);
  });

  it("warns before the call when the pick would go past capacity", async () => {
    await mount({ initialSearch: { m: "11" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Assign consultants" })[0]);
    await settle(300);
    const dialog = screen.getByRole("dialog", { name: /Assign consultants to Jessica Davis/ });
    fireEvent.change(within(dialog).getByLabelText("Pick from"), { target: { value: "others" } });
    fireEvent.click(within(dialog).getByLabelText("Pick from"));
    fireEvent.click(screen.getByRole("option", { name: "Other marketers' consultants" }));
    await settle(300);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Select Ethan Miller" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Select Olivia Carter" }));
    expect(within(dialog).getByText(/Heads up: Jessica Davis would have 4 of 3 consultants, 1 over\./)).toBeTruthy();
  });

  it("sets the backup marketer through the picker", async () => {
    await mount({ initialSearch: { m: "11" } });
    openRowMenu("Sophia Patel");
    fireEvent.click(screen.getByRole("menuitem", { name: /Set backup marketer/ }));
    const dialog = screen.getByRole("dialog", { name: "Set backup marketer" });
    expect(within(dialog).queryByLabelText(/^Jessica Davis/)).toBeNull();
    fireEvent.click(within(dialog).getByLabelText(/^Ava Reed/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Set backup" }));
    await settle();
    expect(calledWith("POST", "/update")[0].body).toEqual({ consultantIds: [2], backupMemberId: 13 });
    expect(world.assignments.get(2)!.backup).toBe(13);
  });

  it("pauses a marketer from the card menu, with Undo", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Ava Reed" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pause marketer" }));
    await settle();
    expect(calledWith("PATCH", "/marketers/13")[0].body).toEqual({ status: "PAUSED" });
    expect(screen.getByText("Ava Reed is paused")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(world.marketers.find((m) => m.id === 13)!.status).toBe("ACTIVE");
  });

  it("changes a capacity with no Save button: it saves when you leave the box", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Ava Reed" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit capacity" }));
    const dialog = screen.getByRole("dialog", { name: /Capacity of Ava Reed/ });
    expect(within(dialog).queryByRole("button", { name: /^Save/ })).toBeNull();
    const box = within(dialog).getByLabelText("Capacity");
    fireEvent.change(box, { target: { value: "8" } });
    fireEvent.blur(box);
    await settle();
    expect(calledWith("PATCH", "/marketers/13")[0].body).toEqual({ capacity: 8 });
    expect(within(dialog).getByText("Saved")).toBeTruthy();
  });

  it("adds a marketer from the members who hold a marketing role", async () => {
    await mount();
    fireEvent.click(screen.getAllByRole("button", { name: /Add marketer/ })[0]);
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Add a marketer" });
    fireEvent.click(within(dialog).getByLabelText("Nia Brooks"));
    fireEvent.change(within(dialog).getByLabelText(/Capacity/), { target: { value: "12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add marketer" }));
    await settle();
    expect(calledWith("POST", "/marketers")[0].body).toEqual({ memberId: 99, capacity: 12 });
    expect(screen.getByText("Nia Brooks is now a marketer")).toBeTruthy();
    expect(document.querySelector("[data-marketer='99']")).toBeTruthy();
  });

  it("opens the workload report", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /View workload report/ }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Workload report" });
    expect(within(dialog).getByRole("table", { name: "Workload by marketer" })).toBeTruthy();
    expect(within(dialog).getByText("Michael Park")).toBeTruthy();
  });
});
