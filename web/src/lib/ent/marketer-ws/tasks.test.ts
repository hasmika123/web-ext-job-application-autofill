import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_QUERY, dayKey, dueDateText, fetchAssignees, fetchCalendar, fetchTasks, logoFor, monthGrid, monthLabel, pageCount, parseCalendar, parseTasks, photoFor, queryString, relativeDue, runTaskAction,
  shiftMonth, showingText,
} from "./tasks";

const row = (over: Record<string, unknown> = {}) => ({ id: 1, title: "Share new openings with team", category: "JOB_OPPORTUNITY", priority: "HIGH", status: "IN_PROGRESS", dueAt: "2026-10-10T09:00:00Z", ownerMemberId: 7, ownerName: "Sarah Chen", ...over });

afterEach(() => vi.unstubAllGlobals());

describe("parseTasks", () => {
  it("is lenient: a malformed list is empty, an unknown enum falls back, a non-object is null", () => {
    expect(parseTasks(null)).toBeNull();
    expect(parseTasks([])).toBeNull();
    const v = parseTasks({
      kpis: [{ key: "bogus", value: 1 }, { key: "total", value: 24, deltaPct: 12, sparkline: [1, "x", 3] }],
      tasks: { items: [row({ category: "NOPE", priority: "URGENT", status: "DONE" }), 5, null], total: 24 },
      upcoming: "nope",
    })!;
    expect(v.kpis).toHaveLength(1);
    expect(v.kpis[0]).toMatchObject({ key: "total", value: 24, deltaPct: 12, sparkline: [1, 3] });
    expect(v.tasks.items).toHaveLength(1);
    expect(v.tasks.items[0]).toMatchObject({ category: "FOLLOW_UP", priority: "MEDIUM", status: "NOT_STARTED", mine: false, canDelete: false, consultantName: null, avatarUrl: null });
    expect(v.tasks.total).toBe(24);
    expect(v.upcoming).toEqual([]);
    expect(v.tabs).toEqual({ all: 0, my: 0, team: 0, overdue: 0, dueThisWeek: 0, completed: 0 });
    expect(v.options).toEqual({ consultants: [], clients: [], owners: [] });
    expect(v.wide).toBe(false);
  });

  it("never reports fewer rows than it holds, and keeps a missing delta as null (no chip)", () => {
    const v = parseTasks({ kpis: [{ key: "overdue", value: 5 }], tasks: { items: [row(), row({ id: 2 })], total: 1 } })!;
    expect(v.tasks.total).toBe(2);
    expect(v.kpis[0].deltaPct).toBeNull();
    expect(v.tasks.size).toBe(10);
  });

  it("drops options without an id or a name", () => {
    const v = parseTasks({ options: { consultants: [{ id: 4, name: "Ava Patel" }, { id: 0, name: "x" }, { id: 5 }], clients: "x", owners: [{ id: 7, name: "Sarah Chen" }] } })!;
    expect(v.options.consultants).toEqual([{ id: 4, name: "Ava Patel" }]);
    expect(v.options.clients).toEqual([]);
    expect(v.options.owners).toHaveLength(1);
  });
});

describe("parseCalendar", () => {
  it("keeps only well-formed days", () => {
    expect(parseCalendar("x")).toBeNull();
    const c = parseCalendar({ month: "2026-10", days: [{ date: "2026-10-12", total: 2, open: 1, topPriority: "HIGH" }, { date: "oct 13", total: 1 }, { date: "2026-10-14", total: 1, topPriority: "??" }] })!;
    expect(c.days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-14"]);
    expect(c.days[1].topPriority).toBe("MEDIUM");
  });
});

describe("query and fetch", () => {
  it("builds the query string, leaving empty filters out", () => {
    expect(queryString(DEFAULT_QUERY)).toBe("tab=ALL&page=0&size=10");
    expect(queryString({ ...DEFAULT_QUERY, tab: "OVERDUE", category: "RESUME", due: "2026-10-12", page: 2 })).toBe("tab=OVERDUE&category=RESUME&due=2026-10-12&page=2&size=10");
  });

  it("maps 403 and 404 to DENIED, other failures to FAILED, and a good body to OK", async () => {
    const ok = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", ok(404, {}));
    expect(await fetchTasks(2, DEFAULT_QUERY)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", ok(403, {}));
    expect(await fetchTasks(2, DEFAULT_QUERY)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", ok(500, {}));
    expect(await fetchTasks(2, DEFAULT_QUERY)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchTasks(2, DEFAULT_QUERY)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", ok(200, { tasks: { items: [row()], total: 1 } }));
    const r = await fetchTasks(2, DEFAULT_QUERY);
    expect(r.kind).toBe("OK");
  });

  it("fetchCalendar and fetchAssignees return null on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await fetchCalendar(2, "2026-10")).toBeNull();
    expect(await fetchAssignees(2, 5)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ id: 8, name: "Michael Park" }]), { status: 200 })));
    expect(await fetchAssignees(2, 5)).toEqual([{ id: 8, name: "Michael Park" }]);
  });
});

describe("runTaskAction (record only)", () => {
  const calls = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c as unknown as [string, RequestInit]);

  it("uses only the six task routes with the right verbs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await runTaskAction(2, { kind: "create", task: { title: "x", category: "RESUME", priority: "LOW", dueAt: "2026-10-15T10:00:00Z" } });
    await runTaskAction(2, { kind: "update", id: 5, patch: { title: "y" } });
    await runTaskAction(2, { kind: "complete", id: 5 });
    await runTaskAction(2, { kind: "reopen", id: 5 });
    await runTaskAction(2, { kind: "reassign", id: 5, ownerMemberId: 8 });
    await runTaskAction(2, { kind: "delete", id: 5 });
    expect(calls().map(([u, i]) => `${i.method} ${u}`)).toEqual([
      "POST /api/orgs/2/mkt/tasks", "PATCH /api/orgs/2/mkt/tasks/5", "POST /api/orgs/2/mkt/tasks/5/complete", "POST /api/orgs/2/mkt/tasks/5/reopen",
      "POST /api/orgs/2/mkt/tasks/5/reassign", "DELETE /api/orgs/2/mkt/tasks/5",
    ]);
    expect(JSON.parse(String(calls()[4][1].body))).toEqual({ ownerMemberId: 8 });
    for (const [u] of calls()) expect(u).not.toMatch(/submit|email|send|mail/i);
  });

  it("returns the server's message, flags a 404 as denied, and survives a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 422 })));
    expect(await runTaskAction(2, { kind: "complete", id: 1 })).toEqual({ ok: false, denied: false, message: "nope" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await runTaskAction(2, { kind: "complete", id: 1 })).toMatchObject({ ok: false, denied: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await runTaskAction(2, { kind: "complete", id: 1 })).toMatchObject({ ok: false, denied: false });
  });
});

describe("display helpers", () => {
  const now = new Date(2026, 9, 10, 9, 0);
  it("formats due dates and the Upcoming Deadlines time", () => {
    expect(dueDateText(new Date(2026, 9, 10, 9, 0).toISOString())).toBe("Oct 10, 2026");
    expect(dueDateText("garbage")).toBe("");
    expect(relativeDue(new Date(2026, 9, 10, 16, 0).toISOString(), now)).toBe("Today, 4:00 PM");
    expect(relativeDue(new Date(2026, 9, 11, 10, 0).toISOString(), now)).toBe("Tomorrow, 10:00 AM");
    expect(relativeDue(new Date(2026, 9, 14, 10, 0).toISOString(), now)).toBe("Oct 14, 2026");
    expect(relativeDue("garbage", now)).toBe("");
  });

  it("lays a month out in whole Sunday-first weeks with the neighbours flagged", () => {
    const g = monthGrid("2026-10"); // Oct 1, 2026 is a Thursday
    expect(g.length % 7).toBe(0);
    expect(g[0]).toEqual({ key: "2026-09-27", day: 27, outside: true });
    expect(g[4]).toEqual({ key: "2026-10-01", day: 1, outside: false });
    expect(g.filter((c) => !c.outside)).toHaveLength(31);
    expect(monthGrid("garbage")).toEqual([]);
  });

  it("shifts and labels months across a year boundary", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("pager arithmetic and the footer text", () => {
    expect(pageCount(24, 10)).toBe(3);
    expect(pageCount(0, 10)).toBe(1);
    expect(showingText(0, 10, 24)).toBe("Showing 1 to 10 of 24 tasks");
    expect(showingText(2, 10, 24)).toBe("Showing 21 to 24 of 24 tasks");
    expect(showingText(0, 10, 0)).toBe("Showing 0 of 0 tasks");
  });

  it("board art only for the people and clients on the board; a real avatarUrl wins", () => {
    expect(photoFor("Ava Patel", null)).toBe("/ent/marketer/tasks/ava-patel.png");
    expect(photoFor("Stranger Person", null)).toBeNull();
    expect(photoFor("Ava Patel", "/x.png")).toBe("/x.png");
    expect(logoFor("AWS")).toBe("/ent/marketer/tasks/logo-aws.png");
    expect(logoFor("Global Bank")).toBeNull();
  });
});
