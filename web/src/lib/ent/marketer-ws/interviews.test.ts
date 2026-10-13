import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmSlot, daysChip, dayText, fetchInterviews, parseInterviews, proposeReschedule, rangeLabel, recordFeedback, requestReminder, shortDateTime, tickPrepItem, tileOf, timeText, weekRange,
} from "./interviews";

afterEach(() => vi.unstubAllGlobals());
const reply = (status: number, body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("parseInterviews", () => {
  it("is lenient: junk sections become empty, junk values get defaults", () => {
    const v = parseInterviews({ kpis: [{ key: "pendingFeedback", value: "x", deltaPct: "no" }, { key: "nonsense", value: 1 }], schedule: { items: [{ id: 1, type: "HOLOGRAM", status: "???" }, "junk"] }, upcoming: 7, pendingFeedback: null, checklist: "no", reminders: [{}], clients: [null] });
    expect(v).not.toBeNull();
    expect(v!.kpis).toEqual([{ key: "pendingFeedback", value: 0, deltaPct: null, sparkline: [] }]);
    expect(v!.schedule.items).toHaveLength(1);
    expect(v!.schedule.items[0]).toMatchObject({ id: 1, type: "VIDEO", status: "SCHEDULED", avatarUrl: null, proposedFor: null, durationMinutes: 45 });
    expect(v!.upcoming).toEqual([]);
    expect(v!.pendingFeedback).toEqual([]);
    expect(v!.checklist).toBeNull();
    expect(v!.reminders).toHaveLength(1);
    expect(v!.clients).toEqual([]);
  });

  it("a document that is not an object is null; an empty object is an empty board", () => {
    expect(parseInterviews(null)).toBeNull();
    expect(parseInterviews([])).toBeNull();
    const v = parseInterviews({})!;
    expect(v.kpis).toEqual([]);
    expect(v.schedule).toMatchObject({ items: [], total: 0, size: 25 });
  });

  it("keeps a real delta, a checklist and a proposal", () => {
    const v = parseInterviews({
      kpis: [{ key: "reschedules", value: 2, deltaPct: -50, sparkline: [1, 2, "x", 3] }],
      schedule: { items: [{ id: 4, type: "TECHNICAL", status: "RESCHEDULED", proposedFor: "2026-10-20T10:00:00Z", rescheduleCount: 1 }], total: 1, page: 0, size: 25, from: "2026-10-11", to: "2026-10-17" },
      checklist: { interviewId: 4, consultant: "Alex", client: "TechCorp", items: [{ id: 1, label: "Review", done: true }, { id: 2, label: "Share" }] },
    })!;
    expect(v.kpis[0]).toEqual({ key: "reschedules", value: 2, deltaPct: -50, sparkline: [1, 2, 3] });
    expect(v.schedule.items[0].proposedFor).toBe("2026-10-20T10:00:00Z");
    expect(v.checklist!.items).toEqual([{ id: 1, label: "Review", done: true }, { id: 2, label: "Share", done: false }]);
  });
});

describe("dates", () => {
  it("the default range is the Sunday-to-Saturday week, labelled like the board", () => {
    const r = weekRange(new Date(2024, 3, 24, 12));
    expect(r).toEqual({ from: "2024-04-21", to: "2024-04-27" });
    expect(rangeLabel(r.from, r.to)).toBe("Apr 21 – Apr 27, 2024");
    expect(weekRange(new Date(2024, 3, 21)).from).toBe("2024-04-21"); // a Sunday is the first day
    expect(weekRange(new Date(2024, 3, 27)).to).toBe("2024-04-27"); // a Saturday the last
  });

  it("labels a range across a year and rejects a bad one", () => {
    expect(rangeLabel("2024-12-29", "2025-01-04")).toBe("Dec 29, 2024 – Jan 4, 2025");
    expect(rangeLabel("nope", "2024-01-01")).toBe("Select dates");
  });

  it("formats the board's date and time styles in the viewer's local time", () => {
    const iso = new Date(2024, 3, 22, 10, 0).toISOString();
    expect(dayText(iso)).toBe("Apr 22, 2024");
    expect(timeText(iso)).toMatch(/^10:00\s?AM$/);
    expect(shortDateTime(iso)).toMatch(/^Apr 22, 10:00\s?AM$/);
    expect(tileOf(iso)).toEqual({ month: "APR", day: "22" });
    expect(dayText("junk")).toBe("");
  });

  it("the days chips are red from two days, amber at one, green under a day", () => {
    expect(daysChip(2)).toEqual({ label: "2 days", tone: "red" });
    expect(daysChip(5).tone).toBe("red");
    expect(daysChip(1)).toEqual({ label: "1 day", tone: "amber" });
    expect(daysChip(0)).toEqual({ label: "< 1 day", tone: "green" });
  });
});

describe("fetchInterviews", () => {
  it("sends the filters and the viewer's UTC offset to the BFF", async () => {
    const f = reply(200, { kpis: [], schedule: {} });
    vi.stubGlobal("fetch", f);
    const r = await fetchInterviews(2, { from: "2024-04-21", to: "2024-04-27", status: "CONFIRMED", clientId: 7, dir: "desc", page: 1, size: 25 });
    expect(r.kind).toBe("OK");
    const url = new URL(String(f.mock.calls[0][0]), "http://x");
    expect(url.pathname).toBe("/api/orgs/2/mkt/interviews");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ from: "2024-04-21", to: "2024-04-27", status: "CONFIRMED", clientId: "7", dir: "desc", page: "1", size: "25" });
    expect(url.searchParams.get("tzOffsetMinutes")).toBe(String(-new Date().getTimezoneOffset()));
  });

  it("403 and 404 are DENIED, other failures and junk are FAILED", async () => {
    vi.stubGlobal("fetch", reply(404, { code: "NOT_FOUND" }));
    expect((await fetchInterviews(2)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(403, {}));
    expect((await fetchInterviews(2)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(500, {}));
    expect((await fetchInterviews(2)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", reply(200, [1, 2]));
    expect((await fetchInterviews(2)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await fetchInterviews(2)).kind).toBe("FAILED");
  });
});

describe("writes (E1: record or propose, never submit)", () => {
  it("each write goes to its own BFF route with its own verb, and nothing else", async () => {
    const row = { id: 5, status: "RESCHEDULED" };
    const f = reply(200, row);
    vi.stubGlobal("fetch", f);
    await proposeReschedule(2, 5, { proposedAt: "2026-10-20T10:00:00.000Z", note: "n" });
    await confirmSlot(2, 5);
    await recordFeedback(2, 5, { outcome: "PASSED", note: "ok" });
    await requestReminder(2, 5);
    await tickPrepItem(2, 5, 9, true);
    const calls = f.mock.calls.map(([u, i]) => `${i?.method} ${u}`);
    expect(calls).toEqual([
      "POST /api/orgs/2/mkt/interviews/5/reschedule",
      "POST /api/orgs/2/mkt/interviews/5/confirm",
      "POST /api/orgs/2/mkt/interviews/5/feedback",
      "POST /api/orgs/2/mkt/interviews/5/remind",
      "PATCH /api/orgs/2/mkt/interviews/5/prep/9",
    ]);
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ proposedAt: "2026-10-20T10:00:00.000Z", note: "n" });
    expect(JSON.parse(String(f.mock.calls[4][1]?.body))).toEqual({ done: true });
    expect(calls.join(" ")).not.toMatch(/submit|apply|send/i);
  });

  it("maps 404 to DENIED, a refusal to its sentence, a server error to FAILED", async () => {
    vi.stubGlobal("fetch", reply(404, { code: "NOT_FOUND" }));
    expect((await confirmSlot(2, 5)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(409, { message: "The interview has not happened yet" }));
    expect(await recordFeedback(2, 5, { outcome: "PASSED" })).toEqual({ kind: "REFUSED", message: "The interview has not happened yet" });
    vi.stubGlobal("fetch", reply(422, {}));
    expect((await proposeReschedule(2, 5, { proposedAt: "x" })).kind).toBe("REFUSED");
    vi.stubGlobal("fetch", reply(500, {}));
    expect((await requestReminder(2, 5)).kind).toBe("FAILED");
  });
});
