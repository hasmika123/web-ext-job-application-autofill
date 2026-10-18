import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_QUERY, addNote, daysOverdue, daysText, dueDate, fetchApplications, logoFor, markFollowUpDone, parseApplications, queryString, recordStage, setNextAction, shortDate,
} from "./applications";

afterEach(() => vi.unstubAllGlobals());

describe("parseApplications", () => {
  it("is lenient: a malformed document is null, a malformed section is empty", () => {
    expect(parseApplications(null)).toBeNull();
    expect(parseApplications([])).toBeNull();
    const v = parseApplications({ kpis: "x", tracker: 7, funnel: null, overdue: {}, updates: [1, "a"] });
    expect(v).not.toBeNull();
    expect(v!.kpis).toEqual([]);
    expect(v!.tracker.items).toEqual([]);
    expect(v!.tracker.size).toBe(8);
    expect(v!.funnel.stages).toEqual([]);
    expect(v!.overdue).toEqual([]);
    expect(v!.updates).toEqual([]);
    expect(v!.perms).toEqual({ followups: false, record: false });
  });

  it("keeps only the four KPIs, a missing delta stays null, an unknown stage reads as Applied", () => {
    const v = parseApplications({
      kpis: [{ key: "active", value: 142, deltaPct: 12, sparkline: [1, "x", 3] }, { key: "mystery", value: 1 }, { key: "offers", value: 12 }],
      tracker: { items: [{ id: 1, consultant: { id: 3, name: "Alex Morgan", consent: "SUMMARY" }, stage: { key: "weird" }, role: null }] },
    })!;
    expect(v.kpis.map((k) => k.key)).toEqual(["active", "offers"]);
    expect(v.kpis[0].sparkline).toEqual([1, 3]);
    expect(v.kpis[1].deltaPct).toBeNull();
    const row = v.tracker.items[0];
    expect(row.stage).toEqual({ key: "applied", label: "Applied" });
    expect(row.consultant.consent).toBe("SUMMARY");
    expect(row.role).toBeNull();
    expect(row.owner).toBeNull();
  });
});

describe("queryString", () => {
  it("sends the board's filters and leaves empty ones out", () => {
    expect(queryString(DEFAULT_QUERY)).toBe("period=3m&funnelPeriod=3m&sort=appliedOn%2Cdesc&page=0&size=8");
    const s = queryString({ ...DEFAULT_QUERY, q: " java ", consultantId: "4", clientId: "9", stage: "offer", period: "6m", page: 2 });
    expect(s).toContain("q=java");
    expect(s).toContain("consultantId=4");
    expect(s).toContain("clientId=9");
    expect(s).toContain("stage=offer");
    expect(s).toContain("period=6m");
    expect(s).toContain("page=2");
  });
});

describe("fetchApplications", () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  it("maps 403/404 to DENIED, other failures to FAILED, and a good body to OK", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await fetchApplications(2, DEFAULT_QUERY)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(500, {}));
    expect(await fetchApplications(2, DEFAULT_QUERY)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", reply(200, "nope"));
    expect(await fetchApplications(2, DEFAULT_QUERY)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await fetchApplications(2, DEFAULT_QUERY)).toEqual({ kind: "FAILED" });
    const ok = reply(200, { kpis: [], tracker: { items: [] } });
    vi.stubGlobal("fetch", ok);
    expect((await fetchApplications(2, DEFAULT_QUERY)).kind).toBe("OK");
    expect(String((ok.mock.calls[0] as unknown[])[0])).toBe("/api/orgs/2/mkt/applications?period=3m&funnelPeriod=3m&sort=appliedOn%2Cdesc&page=0&size=8");
  });
});

describe("the writes are records on the BFF, nothing else", () => {
  const row = { id: 5, consultant: { id: 1, name: "A", consent: "FULL" }, stage: { key: "offer", label: "Offer" } };
  it("each write calls its own BFF route with the right method and body", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(row), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await addNote(2, 5, "hello");
    await setNextAction(2, 5, "Call them", "2026-10-20");
    await markFollowUpDone(2, 5);
    await recordStage(2, 5, "not_selected", "WITHDRAWN");
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([u, i]) => `${i.method} ${u}`)).toEqual([
      "POST /api/orgs/2/mkt/applications/5/notes",
      "PATCH /api/orgs/2/mkt/applications/5/next-action",
      "POST /api/orgs/2/mkt/applications/5/follow-up-done",
      "POST /api/orgs/2/mkt/applications/5/stage",
    ]);
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ body: "hello" });
    expect(JSON.parse(String(calls[1][1].body))).toEqual({ nextAction: "Call them", dueDate: "2026-10-20" });
    expect(calls[2][1].body).toBeUndefined();
    expect(JSON.parse(String(calls[3][1].body))).toEqual({ stage: "not_selected", reason: "WITHDRAWN" });
    // nothing but the Applications BFF is ever called (no submit, no other service)
    expect(calls.every(([u]) => u.startsWith("/api/orgs/2/mkt/applications/"))).toBe(true);
  });

  it("answers the updated row, the server's message, or a quiet 'denied' for a 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(row), { status: 200 })));
    const ok = await addNote(2, 5, "x");
    expect(ok.ok && ok.row?.stage.key).toBe("offer");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Note is too long." }), { status: 400 })));
    expect(await addNote(2, 5, "x")).toEqual({ ok: false, denied: false, message: "Note is too long." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const denied = await addNote(2, 5, "x");
    expect(!denied.ok && denied.denied).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect((await addNote(2, 5, "x")).ok).toBe(false);
  });
});

describe("formatting", () => {
  it("dates, days and logos", () => {
    expect(shortDate("2024-04-12")).toBe("Apr 12, 2024");
    expect(shortDate(null)).toBe("");
    expect(dueDate("2024-04-18")).toBe("Apr 18");
    expect(dueDate("nope")).toBe("");
    expect(daysText(1)).toBe("1 day");
    expect(daysText(3)).toBe("3 days");
    expect(daysOverdue("2026-10-10", new Date(2026, 9, 13, 15, 0))).toBe(3);
    expect(daysOverdue("2026-10-14", new Date(2026, 9, 13))).toBe(-1);
    expect(logoFor("LinkedIn")).toBe("/ent/marketer/applications/logo-linkedin.png");
    expect(logoFor("Company Website")).toBe("/ent/marketer/applications/logo-website.png");
    expect(logoFor("Vendor Portal")).toBeNull();
  });
});
