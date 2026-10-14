import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_QUERY, fetchPerformance, matchTone, monthLabels, parsePerformance, photoFor, queryString, saveGoals, shortDay, weekLines } from "./performance";

afterEach(() => vi.unstubAllGlobals());

describe("parsePerformance", () => {
  it("returns null for anything that is not an object", () => {
    for (const bad of [null, undefined, 3, "x", [], [1]]) expect(parsePerformance(bad)).toBeNull();
  });

  it("an empty object is an empty board, not a crash", () => {
    const v = parsePerformance({})!;
    expect(v.kpis).toEqual([]);
    expect(v.weekly).toBeNull();
    expect(v.trend).toBeNull();
    expect(v.funnel).toBeNull();
    expect(v.readiness).toBeNull();
    expect(v.streams).toBeNull();
    expect(v.top).toEqual([]);
    expect(v.benchmarks).toBeNull();
    expect(v.goals).toBeNull();
    expect(v.actions).toEqual([]);
  });

  it("keeps null values and null deltas (no made-up zero, no chip) and drops unknown tile keys", () => {
    const v = parsePerformance({ kpis: [{ key: "offerRate", value: null, deltaPct: null, sparkline: [1, "x", 2, NaN] }, { key: "nonsense", value: 3 }, { key: "placements", value: 8, deltaPct: 33 }] })!;
    expect(v.kpis).toHaveLength(2);
    expect(v.kpis[0]).toEqual({ key: "offerRate", value: null, deltaPct: null, sparkline: [1, 2] });
    expect(v.kpis[1]).toMatchObject({ key: "placements", value: 8, deltaPct: 33, sparkline: [] });
  });

  it("is lenient with malformed sections and rows", () => {
    const v = parsePerformance({
      weekly: { weeks: [{ start: "2024-08-26", end: 3, submissions: "9" }, "junk"] },
      funnel: "no",
      readiness: { total: 2, buckets: [{ key: "ready", label: "Ready", count: 2, pct: 100 }, { key: "weird", count: 1 }] },
      streams: { rows: [{ client: "TechCorp", offerRatePct: "x", good: "yes" }] },
      top: [{ name: "Alex", matchRatePct: "86", lastActivityAt: "", trend: [1, "a", 3] }],
      benchmarks: { rows: [{ key: "offerRate", value: 18, industry: null }, { key: "other" }] },
      goals: { canEdit: "true", rows: [{ key: "offers", actual: 3, target: null, pct: null }, { key: "x" }] },
      actions: [{ key: "quiet", text: "Follow up", page: "followups" }, null],
    })!;
    expect(v.weekly!.weeks).toEqual([{ start: "2024-08-26", end: "", submissions: 0, interviews: 0, offers: 0 }]);
    expect(v.funnel).toBeNull();
    expect(v.readiness!.buckets).toHaveLength(1);
    expect(v.streams!.rows[0]).toMatchObject({ client: "TechCorp", offerRatePct: null, good: false });
    expect(v.top[0]).toMatchObject({ rank: 1, name: "Alex", matchRatePct: null, lastActivityAt: null, trend: [1, 3] });
    expect(v.benchmarks!.rows).toHaveLength(1);
    expect(v.benchmarks!.rows[0].industry).toBeNull();
    expect(v.goals!.canEdit).toBe(false);
    expect(v.goals!.rows).toEqual([{ key: "offers", label: "", actual: 3, target: null, pct: null }]);
    expect(v.actions).toEqual([{ key: "quiet", text: "Follow up", detail: null, page: "followups" }]);
  });
});

describe("queryString", () => {
  it("sends only what differs from the board's defaults", () => {
    expect(queryString(DEFAULT_QUERY)).toBe("");
    expect(queryString({ ...DEFAULT_QUERY, weeks: "12w", benchmarks: "lastMonth" })).toBe("weeks=12w&benchmarks=lastMonth");
  });
});

describe("fetchPerformance", () => {
  const reply = (status: number, body: unknown) => vi.fn(async (_url?: unknown, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

  it("OK for a good board, with the periods in the query", async () => {
    const f = reply(200, { kpis: [] });
    vi.stubGlobal("fetch", f);
    const r = await fetchPerformance(2, { ...DEFAULT_QUERY, trend: "6m" });
    expect(r.kind).toBe("OK");
    expect(f.mock.calls[0][0]).toBe("/api/orgs/2/mkt/performance?trend=6m");
  });

  it("403 and 404 are DENIED, other failures and a non-object body are FAILED", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect((await fetchPerformance(2)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(403, {}));
    expect((await fetchPerformance(2)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(500, {}));
    expect((await fetchPerformance(2)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", reply(200, [1]));
    expect((await fetchPerformance(2)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect((await fetchPerformance(2)).kind).toBe("FAILED");
  });
});

describe("saveGoals", () => {
  it("PUTs only the given targets to the BFF and parses the returned card", async () => {
    const f = vi.fn(async (_url?: unknown, _init?: RequestInit) => new Response(JSON.stringify({ period: "month", canEdit: true, rows: [{ key: "offers", label: "Offers", actual: 1, target: 9, pct: 11 }] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await saveGoals(2, { offers: 9 });
    expect(f.mock.calls[0][0]).toBe("/api/orgs/2/mkt/performance/goals");
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ method: "PUT", body: JSON.stringify({ offers: 9 }) });
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.goals?.rows[0].target).toBe(9);
  });

  it("denied and failures answer a message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await saveGoals(2, { offers: 1 })).toMatchObject({ ok: false, denied: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "must be between 0 and 100000" }), { status: 400 })));
    expect(await saveGoals(2, { offers: 1 })).toMatchObject({ ok: false, denied: false, message: "must be between 0 and 100000" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("x"))));
    expect(await saveGoals(2, { offers: 1 })).toMatchObject({ ok: false });
  });
});

describe("view helpers", () => {
  it("formats days and the two lines of a week label", () => {
    expect(shortDay("2024-08-26")).toBe("Aug 26");
    expect(shortDay("nope")).toBe("");
    expect(weekLines({ start: "2024-08-26", end: "2024-09-01", submissions: 0, interviews: 0, offers: 0 })).toEqual(["Aug 26", "Sep 1"]);
  });

  it("labels the month only on its first point", () => {
    const p = (date: string) => ({ date, submissions: 0, interviews: 0, offers: 0 });
    expect(monthLabels([p("2024-08-04"), p("2024-08-11"), p("2024-09-01"), p("2024-09-08"), p("2024-10-06")])).toEqual(["Aug", "", "Sep", "", "Oct"]);
  });

  it("the Match Rate chip is green from 80 and amber below, none without a rate", () => {
    expect(matchTone(80)).toBe("green");
    expect(matchTone(79)).toBe("amber");
    expect(matchTone(null)).toBe("none");
  });

  it("a real avatar always wins over the board's cropped photos", () => {
    expect(photoFor("Alex Morgan", null)).toBe("/ent/marketer/performance/alex-morgan.png");
    expect(photoFor("Alex Morgan", "/me.png")).toBe("/me.png");
    expect(photoFor("Someone Else", null)).toBeNull();
  });
});
