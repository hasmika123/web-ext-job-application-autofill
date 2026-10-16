import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FILTERS, assignOpportunity, exportUrl, fetchOpportunities, matchTone, nextActionText, parseDetail, parseOpportunities, parseOpportunity, parseOptions, queryString,
  requestFromConsultant, setNextAction, sharePct, bulkAssign, notifyAwaiting, reviewOpportunity, createOpportunity,
} from "./opportunities";

afterEach(() => vi.unstubAllGlobals());

describe("parseOpportunities", () => {
  it("is null for a malformed document and empty for malformed sections", () => {
    expect(parseOpportunities(null)).toBeNull();
    expect(parseOpportunities([])).toBeNull();
    const v = parseOpportunities({ kpis: "x", items: [1, null, "a"], topMatches: 3, responses: 9, activity: {}, filters: [] })!;
    expect(v.kpis).toEqual([]);
    expect(v.items).toEqual([]);
    expect(v.topMatches).toEqual([]);
    expect(v.responses).toEqual({ total: 0, days: 30, slices: [] });
    expect(v.activity).toEqual([]);
    expect(v.filters).toEqual({ consultants: [], clients: [] });
    expect(v.size).toBe(8);
  });

  it("keeps only known KPI keys and drops a non-numeric delta", () => {
    const v = parseOpportunities({ kpis: [{ key: "open", value: 86, deltaPct: "x", sparkline: [1, "a", 3] }, { key: "bogus", value: 1 }] })!;
    expect(v.kpis).toEqual([{ key: "open", value: 86, deltaPct: null, sparkline: [1, 3] }]);
  });

  it("falls back to safe values for an unknown interest, action, resume state and status", () => {
    const o = parseOpportunity({ id: 4, consultant: { id: 1, name: "Alex", avatarUrl: 7 }, interest: "MAYBE", action: "SUBMIT", resumeStatus: "?", status: "DONE", owner: null })!;
    expect(o.interest).toBe("NO_RESPONSE");
    expect(o.action).toBe("FOLLOW_UP");
    expect(o.resumeStatus).toBe("NEEDS_UPDATE");
    expect(o.status).toBe("SUGGESTED");
    expect(o.owner).toBeNull();
    expect(o.consultant.avatarUrl).toBeNull();
    expect(parseOpportunity("nope")).toBeNull();
  });

  it("parses a detail and the add-dialog options", () => {
    expect(parseDetail({ item: null })).toBeNull();
    const d = parseDetail({ item: { id: 1 }, alternatives: [{ id: 2 }], events: [{ id: 3, text: "x" }] })!;
    expect(d.alternatives).toHaveLength(1);
    expect(d.events[0].text).toBe("x");
    expect(parseOptions({ consultants: [{ id: 1, name: "A" }], jobs: [{ id: 2, title: "T", client: "C" }] }).jobs[0]).toEqual({ id: 2, title: "T", client: "C", location: "" });
    expect(parseOptions(null)).toEqual({ consultants: [], jobs: [] });
  });
});

describe("queryString", () => {
  it("sends the board's defaults (last 30 days, newest first) and omits empty filters", () => {
    expect(queryString(DEFAULT_FILTERS)).toBe("days=30&sort=recent&dir=desc&page=0&responseDays=30");
  });

  it("sends every filter, 'any time' as 0, and drops paging for the export", () => {
    const f = { ...DEFAULT_FILTERS, q: " alex ", consultantId: "3", clientId: "4", interest: "OPEN", minScore: "80", days: "", stale: true, sort: "score", dir: "asc" as const, page: 2, responseDays: "" };
    expect(queryString(f)).toBe("q=alex&consultantId=3&clientId=4&interest=OPEN&minScore=80&days=0&stale=true&sort=score&dir=asc&page=2&responseDays=0");
    expect(exportUrl(2, f)).toBe("/api/orgs/2/mkt/opportunities/export?q=alex&consultantId=3&clientId=4&interest=OPEN&minScore=80&days=0&stale=true&sort=score&dir=asc");
  });
});

describe("fetchOpportunities", () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  it("maps 403/404 to DENIED, other errors and junk to FAILED, a document to OK", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await fetchOpportunities(2, DEFAULT_FILTERS)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(500, {}));
    expect(await fetchOpportunities(2, DEFAULT_FILTERS)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", reply(200, "junk"));
    expect(await fetchOpportunities(2, DEFAULT_FILTERS)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await fetchOpportunities(2, DEFAULT_FILTERS)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", reply(200, { items: [] }));
    expect((await fetchOpportunities(2, DEFAULT_FILTERS)).kind).toBe("OK");
  });
});

describe("the write calls (E1: prepare or request, never answer or submit)", () => {
  it("call only the BFF routes under /mkt/opportunities and carry no interest or submit fields", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ message: "Done.", changed: true, skipped: [] }), { status: 200 });
    }));
    await assignOpportunity(2, 5);
    await requestFromConsultant(2, 5, "INTEREST");
    await requestFromConsultant(2, 5, "RESUME");
    await reviewOpportunity(2, 5);
    await setNextAction(2, 5, "2026-10-20T09:00:00.000Z");
    await bulkAssign(2, [1, 2]);
    await notifyAwaiting(2);
    await createOpportunity(2, 1, 9);
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "POST /api/orgs/2/mkt/opportunities/5/assign",
      "POST /api/orgs/2/mkt/opportunities/5/request",
      "POST /api/orgs/2/mkt/opportunities/5/request",
      "POST /api/orgs/2/mkt/opportunities/5/review",
      "PATCH /api/orgs/2/mkt/opportunities/5/next-action",
      "POST /api/orgs/2/mkt/opportunities/bulk-assign",
      "POST /api/orgs/2/mkt/opportunities/notify",
      "POST /api/orgs/2/mkt/opportunities",
    ]);
    const bodies = calls.map((c) => String(c.init.body ?? ""));
    for (const b of bodies) {
      expect(b).not.toMatch(/"interest"\s*:/);
      expect(b).not.toMatch(/submit|respond/i);
    }
    expect(bodies[1]).toBe('{"kind":"INTEREST"}');
  });

  it("returns the API's message and code on a refusal, and a calm message when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "The consultant needs an approved resume before this can be assigned.", code: "RESUME_NOT_APPROVED" }), { status: 409 })));
    expect(await assignOpportunity(2, 5)).toEqual({ ok: false, error: "The consultant needs an approved resume before this can be assigned.", code: "RESUME_NOT_APPROVED", status: 409 });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await assignOpportunity(2, 5)).toMatchObject({ ok: false, status: 0 });
  });
});

describe("small helpers", () => {
  const NOW = new Date(2026, 9, 13, 15, 0).getTime();
  const at = (days: number) => new Date(2026, 9, 13 + days, 9, 0).toISOString();
  it("writes the next action as the board does", () => {
    expect(nextActionText(null, NOW)).toBe("-");
    expect(nextActionText("junk", NOW)).toBe("-");
    expect(nextActionText(at(0), NOW)).toBe("Today");
    expect(nextActionText(at(1), NOW)).toBe("1 day");
    expect(nextActionText(at(3), NOW)).toBe("3 days");
    expect(nextActionText(at(-2), NOW)).toBe("Overdue");
  });
  it("computes shares and the match tone", () => {
    expect(sharePct(28, 86)).toBe(33);
    expect(sharePct(0, 0)).toBe(0);
    expect(matchTone(80)).toBe("green");
    expect(matchTone(79)).toBe("amber");
  });
});

describe("MKT-40 / MKT-44 helpers", () => {
  it("offers Withdraw on a live assignment and Re-assign on a declined or withdrawn one", async () => {
    const { followUpOf, checkHandJob, withdrawOpportunity, reassignOpportunity, createJobByHand } = await import("./opportunities");
    expect(followUpOf({ status: "ASSIGNED", state: "ASSIGNED" })).toBe("WITHDRAW");
    expect(followUpOf({ status: "ASSIGNED", state: "NEEDS_INFO" })).toBe("WITHDRAW");
    expect(followUpOf({ status: "ASSIGNED", state: "DECLINED" })).toBe("REASSIGN");
    expect(followUpOf({ status: "ASSIGNED", state: "CLOSED" })).toBe("REASSIGN");
    expect(followUpOf({ status: "ASSIGNED", state: "APPLIED" })).toBeNull();
    expect(followUpOf({ status: "SUGGESTED", state: "ASSIGNED" })).toBeNull();

    const ok = { title: "Platform Engineer", company: "Acme", location: "Austin, TX", workMode: "REMOTE" as const, description: "Found it.", jobUrl: "" };
    expect(checkHandJob(ok)).toBeNull();
    expect(checkHandJob({ ...ok, title: "x" })).toMatch(/title/);
    expect(checkHandJob({ ...ok, workMode: "" })).toMatch(/work mode/);
    expect(checkHandJob({ ...ok, jobUrl: "http://nope.example.com" })).toMatch(/https/);

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ jobId: 41, existingJob: false }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const made = await createJobByHand(4, ok);
    expect(made).toEqual({ ok: true, jobId: 41, existing: false });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("/api/orgs/4/mkt/opportunities/job");
    expect(JSON.parse(String(call[1].body))).toEqual({ title: "Platform Engineer", company: "Acme", location: "Austin, TX", workMode: "REMOTE", description: "Found it." });
    expect((call[1].headers as Record<string, string>)["idempotency-key"]).toBeTruthy();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Withdrawn.", changed: true }), { status: 200 })));
    expect(await withdrawOpportunity(4, 5, "paused")).toMatchObject({ ok: true });
    expect(await reassignOpportunity(4, 5, 11)).toMatchObject({ ok: true });
  });
});
