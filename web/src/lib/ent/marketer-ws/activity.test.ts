import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildQuery, dayText, fetchActivity, logActivity, logoFor, parseActivity, pctText, photoFor, rangeLabel, rangePresets, setActivityStatus, timeText, upcomingWhen,
} from "./activity";

const row = (over: Record<string, unknown> = {}) => ({
  id: "RESUME:1", source: "RESUME", type: "RESUME_UPDATED", group: "RESUME", groupLabel: "Resume", title: "Resume Updated", subtitle: "Updated work experience and skills", at: "2026-10-13T09:00:00Z",
  actor: { id: 7, name: "Emily Lawson" }, consultant: { id: 11, name: "Alex Morgan" }, client: { id: 100, name: "TechCorp" }, tag: "Profile", status: "COMPLETED", manual: false, ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("parseActivity", () => {
  it("is lenient: a malformed list is empty, an unknown enum falls back, a non-object is null", () => {
    expect(parseActivity(null)).toBeNull();
    expect(parseActivity([])).toBeNull();
    const v = parseActivity({
      from: "2026-10-01", to: "2026-10-31", canLog: "yes",
      kpis: [{ key: "bogus", value: 1 }, { key: "resume", value: 28, deltaPct: 33.3, sparkline: [1, "x", 3] }],
      activities: { items: [row({ status: "WEIRD", actor: "nope", client: null }), 5, null], total: 148, page: 2, size: 10 },
      summary: { range: "NEVER", rows: "nope" }, upcoming: [{ id: "FOLLOWUP:1", title: "Call", at: "2026-10-14T10:00:00Z" }, 3], options: { consultants: [{ id: 1, name: "A" }, { name: "no id" }] },
    })!;
    expect(v.canLog).toBe(false); // only a real true counts
    expect(v.kpis).toHaveLength(1);
    expect(v.kpis[0]).toMatchObject({ key: "resume", value: 28, deltaPct: 33.3, sparkline: [1, 3] });
    expect(v.activities.items).toHaveLength(1);
    expect(v.activities.items[0]).toMatchObject({ status: "COMPLETED", actor: null, client: null });
    expect(v.activities.total).toBe(148);
    expect(v.activities.page).toBe(2);
    expect(v.summary).toMatchObject({ range: "THIS_MONTH", rows: [], total: 0 });
    expect(v.upcoming).toHaveLength(1);
    expect(v.options.consultants).toEqual([{ id: 1, name: "A" }]);
    expect(v.options.clients).toEqual([]);
  });

  it("never reports fewer rows than it holds, and keeps a missing delta as null (no chip)", () => {
    const v = parseActivity({ kpis: [{ key: "total", value: 6 }], activities: { items: [row(), row({ id: "RESUME:2" })], total: 1 }, upcoming: [{ id: "a" }, { id: "b" }], upcomingTotal: 1 })!;
    expect(v.activities.total).toBe(2);
    expect(v.upcomingTotal).toBe(2);
    expect(v.kpis[0].deltaPct).toBeNull();
  });

  it("keeps a client label that has no id (a follow-up's counterpart)", () => {
    const v = parseActivity({ activities: { items: [row({ client: { id: null, name: "Global Bank" } })] } })!;
    expect(v.activities.items[0].client).toEqual({ id: null, name: "Global Bank" });
  });
});

describe("buildQuery", () => {
  it("leaves empty filters out and always asks for a page and a size", () => {
    expect(buildQuery({})).toBe("page=0&size=10");
    const q = new URLSearchParams(buildQuery({ from: "2026-10-01", to: "2026-10-31", consultantId: "11", type: "RESUME", status: "COMPLETED", clientId: "100", ownerId: "7", sort: "oldest", summaryRange: "LAST_MONTH", page: 2 }));
    expect(Object.fromEntries(q)).toEqual({ from: "2026-10-01", to: "2026-10-31", consultantId: "11", type: "RESUME", status: "COMPLETED", clientId: "100", ownerId: "7", sort: "oldest", summaryRange: "LAST_MONTH", page: "2", size: "10" });
    expect(new URLSearchParams(buildQuery({ sort: "recent", summaryRange: "THIS_MONTH" })).has("sort")).toBe(false);
  });
});

describe("fetchActivity", () => {
  it("maps 403/404 to DENIED, other failures to FAILED, a good body to OK", async () => {
    const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await fetchActivity(2)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(500, {}));
    expect(await fetchActivity(2)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchActivity(2)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", reply(200, [1]));
    expect(await fetchActivity(2)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", reply(200, { kpis: [] }));
    expect((await fetchActivity(2)).kind).toBe("OK");
  });
});

describe("writes", () => {
  it("log activity POSTs only to the activity BFF route and nothing that submits", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await logActivity(2, { consultantId: 11, type: "FOLLOWUP_LOGGED", title: "Called the recruiter" })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orgs/2/mkt/activity");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ consultantId: 11, clientAccountId: null, type: "FOLLOWUP_LOGGED", title: "Called the recruiter" });
    expect(url).not.toMatch(/submit|send|email/);
  });

  it("surfaces the API's message and tells a 404 apart", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "title: is required" }), { status: 422 })));
    expect(await logActivity(2, { consultantId: 1, type: "X", title: "" })).toEqual({ ok: false, denied: false, message: "title: is required" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await logActivity(2, { consultantId: 1, type: "X", title: "y" })).toMatchObject({ ok: false, denied: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await logActivity(2, { consultantId: 1, type: "X", title: "y" })).toMatchObject({ ok: false, denied: false });
  });

  it("only a MANUAL row id can change status, through the status route", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await setActivityStatus(2, "RESUME:5", "CANCELLED")).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await setActivityStatus(2, "MANUAL:5", "CANCELLED")).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orgs/2/mkt/activity/5/status");
    expect(init.method).toBe("PATCH");
  });
});

describe("display helpers", () => {
  it("formats the range, day and time in UTC", () => {
    expect(rangeLabel("2024-10-01", "2024-10-31")).toBe("Oct 1, 2024 - Oct 31, 2024");
    expect(dayText("2024-10-18T16:32:00Z")).toBe("Oct 18, 2024");
    expect(timeText("2024-10-18T16:32:00Z")).toBe("4:32 PM");
    expect(dayText("garbage")).toBe("");
    expect(pctText(19.3)).toBe("19%");
  });

  it("presets: this month, last month, last 7 and 30 days (UTC)", () => {
    const p = rangePresets(new Date("2026-10-13T10:00:00Z"));
    expect(p[0]).toMatchObject({ label: "This month", from: "2026-10-01", to: "2026-10-31" });
    expect(p[1]).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(p[2]).toMatchObject({ from: "2026-10-07", to: "2026-10-13" });
    expect(p[3]).toMatchObject({ from: "2026-09-14", to: "2026-10-13" });
  });

  it("upcoming reads Today / Tomorrow / a date, with a tone for the colour", () => {
    const now = new Date("2026-10-13T08:00:00Z");
    expect(upcomingWhen("2026-10-13T10:00:00Z", now)).toEqual({ text: "Today, 10:00 AM", tone: "today" });
    expect(upcomingWhen("2026-10-14T09:00:00Z", now)).toEqual({ text: "Tomorrow, 9:00 AM", tone: "tomorrow" });
    expect(upcomingWhen("2026-10-20T10:00:00Z", now)).toEqual({ text: "Oct 20, 10:00 AM", tone: "later" });
    expect(upcomingWhen("nope", now).text).toBe("");
  });

  it("photos and logos: the API's avatar wins, the board's crops only for the people on it", () => {
    expect(photoFor("Emily Lawson", "/x.png")).toBe("/x.png");
    expect(photoFor("Emily Lawson", null)).toBe("/ent/marketer/activity/emily-lawson.png");
    expect(photoFor("Somebody Else", null)).toBeNull();
    expect(logoFor("Global Bank")).toBe("/ent/marketer/activity/logo-global-bank.png");
    expect(logoFor("Unknown Co")).toBeNull();
  });
});
