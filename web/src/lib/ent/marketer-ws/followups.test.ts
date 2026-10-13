import { afterEach, describe, expect, it, vi } from "vitest";
import { dueText, fetchFollowups, logoFor, parseFollowups, photoFor, responseTimeText, runFollowupAction, statusText } from "./followups";

const row = (over: Record<string, unknown> = {}) => ({ id: 1, title: "Interview feedback call", consultantId: 4, consultantName: "Alex Morgan", counterpart: "TechCorp", channel: "PHONE", priority: "HIGH", status: "PENDING", overdue: false, dueAt: "2026-10-13T09:00:00Z", ...over });

afterEach(() => vi.unstubAllGlobals());

describe("parseFollowups", () => {
  it("is lenient: a malformed list is empty, an unknown enum falls back, a non-object is null", () => {
    expect(parseFollowups(null)).toBeNull();
    expect(parseFollowups([])).toBeNull();
    const v = parseFollowups({ kpis: [{ key: "bogus", value: 1 }, { key: "dueToday", value: 12, deltaPct: 33.3, sparkline: [1, "x", 3] }], today: { items: [row({ channel: "FAX", priority: "URGENT", status: "OVERDUE" }), 5, null], total: 12 }, overdue: "nope", upcoming: undefined })!;
    expect(v.kpis).toHaveLength(1);
    expect(v.kpis[0]).toMatchObject({ key: "dueToday", value: 12, deltaPct: 33.3, sparkline: [1, 3] });
    expect(v.today.items).toHaveLength(1);
    expect(v.today.items[0]).toMatchObject({ channel: "NOTE", priority: "MEDIUM", status: "PENDING" });
    expect(v.today.total).toBe(12);
    expect(v.overdue).toEqual({ items: [], total: 0 });
    expect(v.upcoming.total).toBe(0);
    expect(v.insights).toMatchObject({ window: "THIS_WEEK", responseRatePct: null, avgResponseHours: null, completed: 0, waiting: 0 });
  });

  it("never reports fewer rows than it holds, and keeps a missing delta as null (no chip)", () => {
    const v = parseFollowups({ kpis: [{ key: "overdue", value: 6 }], today: { items: [row(), row({ id: 2 })], total: 1 } })!;
    expect(v.today.total).toBe(2);
    expect(v.kpis[0].deltaPct).toBeNull();
  });
});

describe("helpers", () => {
  it("formats due times with and without the date", () => {
    const iso = new Date(2026, 9, 14, 9, 0).toISOString();
    expect(dueText(iso, false)).toBe("9:00 AM");
    expect(dueText(iso, true)).toBe("Oct 14, 9:00 AM");
    expect(dueText("garbage", true)).toBe("");
  });

  it("an overdue row reads Overdue whatever its stored status", () => {
    expect(statusText({ status: "PENDING", overdue: true })).toBe("Overdue");
    expect(statusText({ status: "IN_PROGRESS", overdue: false })).toBe("In Progress");
    expect(statusText({ status: "NOT_STARTED", overdue: false })).toBe("Not Started");
  });

  it("response time reads in days from a day up, hours below, a dash when empty", () => {
    expect(responseTimeText(43.2)).toBe("1.8 days");
    expect(responseTimeText(5)).toBe("5.0 hrs");
    expect(responseTimeText(null)).toBe("—");
  });

  it("board art only for the people and clients on the board; a real avatarUrl wins", () => {
    expect(photoFor("Alex Morgan", null)).toBe("/ent/marketer/followups/alex-morgan.png");
    expect(photoFor("Liam O'Connor", null)).toBe("/ent/marketer/followups/liam-oconnor.png");
    expect(photoFor("Stranger Person", null)).toBeNull();
    expect(photoFor("Alex Morgan", "/x.png")).toBe("/x.png");
    expect(logoFor("AWS")).toBe("/ent/marketer/followups/logo-aws.png");
    expect(logoFor("ACME Internal")).toBe("/ent/marketer/followups/logo-acme-internal.png");
    expect(logoFor("Global Bank")).toBeNull();
  });
});

describe("fetchFollowups", () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("403 and 404 are DENIED, other failures FAILED, a bad body FAILED", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await fetchFollowups(2)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(403, {}));
    expect(await fetchFollowups(2)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(500, {}));
    expect(await fetchFollowups(2)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", reply(200, []));
    expect(await fetchFollowups(2)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await fetchFollowups(2)).toEqual({ kind: "FAILED" });
  });

  it("asks the BFF for the chosen window", async () => {
    const f = reply(200, { kpis: [] });
    vi.stubGlobal("fetch", f);
    const r = await fetchFollowups(7, "LAST_WEEK");
    expect(r.kind).toBe("OK");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/orgs/7/mkt/followups?window=LAST_WEEK&size=100");
  });
});

describe("runFollowupAction (record only: it can only reach the four BFF record routes)", () => {
  const ok = () => vi.fn(async () => new Response("{}", { status: 200 }));
  const call = (f: ReturnType<typeof ok>) => f.mock.calls[0] as unknown as [string, RequestInit];

  it("posts a reminder REQUEST to the reminder route", async () => {
    const f = ok();
    vi.stubGlobal("fetch", f);
    expect(await runFollowupAction(2, 9, { kind: "reminder", note: "hi" })).toEqual({ ok: true });
    expect(call(f)[0]).toBe("/api/orgs/2/mkt/followups/9/reminder");
    expect(call(f)[1].method).toBe("POST");
    expect(JSON.parse(call(f)[1].body as string)).toEqual({ note: "hi" });
  });

  it("logs a call, updates a status and completes", async () => {
    const f = ok();
    vi.stubGlobal("fetch", f);
    await runFollowupAction(2, 9, { kind: "call", note: "voicemail", awaitingReply: true });
    expect(call(f)[0]).toBe("/api/orgs/2/mkt/followups/9/call");
    expect(JSON.parse(call(f)[1].body as string)).toEqual({ note: "voicemail", awaitingReply: true });
    const g = ok();
    vi.stubGlobal("fetch", g);
    await runFollowupAction(2, 9, { kind: "status", status: "WAITING" });
    expect(call(g)[0]).toBe("/api/orgs/2/mkt/followups/9/status");
    expect(call(g)[1].method).toBe("PATCH");
    const h = ok();
    vi.stubGlobal("fetch", h);
    await runFollowupAction(2, 9, { kind: "complete" });
    expect(call(h)[0]).toBe("/api/orgs/2/mkt/followups/9/complete");
  });

  it("surfaces the API's message and tells a denial from a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "note: is required" }), { status: 422 })));
    expect(await runFollowupAction(2, 9, { kind: "call", note: "" })).toEqual({ ok: false, denied: false, message: "note: is required" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await runFollowupAction(2, 9, { kind: "complete" })).toMatchObject({ ok: false, denied: true });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await runFollowupAction(2, 9, { kind: "complete" })).toMatchObject({ ok: false, denied: false });
  });
});
