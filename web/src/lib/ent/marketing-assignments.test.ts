import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bulkSummary,
  changedCount,
  consultantParams,
  DEFAULT_QUERY,
  errorSentence,
  filtersApplied,
  marketingApi,
  nextSort,
  overCapacityOf,
  overText,
  pageCount,
  parseQuery,
  showingText,
  tileView,
  toSearch,
  undoRows,
  type BulkResult,
  type KpiTile,
} from "./marketing-assignments";

const tile = (key: KpiTile["key"], current: number, previous: number | null, good: KpiTile["good"] = "UP"): KpiTile => ({
  key,
  current,
  previous,
  delta: previous === null ? null : current - previous,
  deltaPct: previous ? Math.round(((current - previous) * 1000) / previous) / 1000 : null,
  series: [1, 2, 3],
  good,
});

describe("the URL carries the view", () => {
  it("a plain page has a plain URL and a plain URL gives the defaults", () => {
    expect(toSearch(DEFAULT_QUERY).toString()).toBe("");
    expect(parseQuery(new URLSearchParams(""))).toEqual(DEFAULT_QUERY);
  });

  it("round-trips the marketer, the filters, the sort and the page", () => {
    const q = { ...DEFAULT_QUERY, marketerId: 7, q: "java", status: "PAUSED", priority: "HIGH", clientId: "12", availability: "ON_PROJECT", noBackup: true, sort: { key: "name" as const, dir: "asc" as const }, page: 2, size: 25, mq: "jes", mstatus: "ACTIVE" };
    const s = toSearch(q).toString();
    expect(s).toContain("m=7");
    expect(s).toContain("sort=name%2Casc");
    expect(parseQuery(new URLSearchParams(s))).toEqual(q);
  });

  it("reads Next's searchParams object too, and ignores anything unknown or malformed (a shared link never breaks the page)", () => {
    const q = parseQuery({ m: ["9", "10"], status: "BOGUS", priority: "high", page: "-3", size: "7", sort: "evil,asc", client: "x1", avail: "AVAILABLE", nb: "1" });
    expect(q.marketerId).toBe(9);
    expect(q.status).toBe("");
    expect(q.priority).toBe("");
    expect(q.page).toBe(0);
    expect(q.size).toBe(10);
    expect(q.sort).toEqual(DEFAULT_QUERY.sort);
    expect(q.clientId).toBe("");
    expect(q.availability).toBe("AVAILABLE");
    expect(q.noBackup).toBe(true);
  });

  it("asks the API only with a search of two characters, and names the marketer", () => {
    expect(consultantParams({ ...DEFAULT_QUERY, q: "a" }, 5).get("q")).toBeNull();
    const p = consultantParams({ ...DEFAULT_QUERY, q: "ja", noBackup: true, clientId: "3" }, 5);
    expect(p.get("q")).toBe("ja");
    expect(p.get("marketerId")).toBe("5");
    expect(p.get("noBackup")).toBe("true");
    expect(p.get("clientId")).toBe("3");
    expect(p.get("sort")).toBe("lastActivity,desc");
    expect(p.get("page")).toBe("0");
    expect(p.get("size")).toBe("10");
  });

  it("knows when a filter is applied", () => {
    expect(filtersApplied(DEFAULT_QUERY)).toBe(false);
    expect(filtersApplied({ ...DEFAULT_QUERY, q: "x" })).toBe(false);
    expect(filtersApplied({ ...DEFAULT_QUERY, q: "xy" })).toBe(true);
    expect(filtersApplied({ ...DEFAULT_QUERY, noBackup: true })).toBe(true);
  });
});

describe("sorting and paging helpers", () => {
  it("flips a column, and starts dates and counts with the biggest", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "asc" }, "lastActivity")).toEqual({ key: "lastActivity", dir: "desc" });
    expect(nextSort({ key: "name", dir: "asc" }, "priority")).toEqual({ key: "priority", dir: "asc" });
  });
  it("counts pages and words the footer", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(28, 10)).toBe(3);
    expect(showingText(28, 0, 10, 10)).toBe("1-10 of 28 consultants");
    expect(showingText(1, 0, 10, 1)).toBe("1-1 of 1 consultant");
    expect(showingText(0, 0, 10, 0)).toBe("No consultants");
  });
});

describe("tile deltas are never invented", () => {
  it("draws nothing without a previous figure", () => {
    expect(tileView(tile("assigned", 5, null))).toBeNull();
    expect(tileView(null)).toBeNull();
  });
  it("reads the two consultant counts as a percent and the marketer counts as a plain difference", () => {
    expect(tileView(tile("assigned", 162, 144))).toEqual({ dir: "up", text: "+12.5%", good: true });
    expect(tileView(tile("marketers", 12, 10))).toEqual({ dir: "up", text: "+2", good: true });
    expect(tileView(tile("unassigned", 24, 30, "DOWN"))).toEqual({ dir: "down", text: "-20%", good: true });
    expect(tileView(tile("overloaded", 3, 2, "DOWN"))).toEqual({ dir: "up", text: "+1", good: false });
  });
  it("falls back to the difference when there was nothing before, and flat is neutral", () => {
    expect(tileView(tile("assigned", 4, 0))).toEqual({ dir: "up", text: "+4", good: true });
    expect(tileView(tile("overloaded", 3, 3, "DOWN"))).toEqual({ dir: "flat", text: "0", good: null });
  });
});

describe("Undo is the reverse of what the API said it changed", () => {
  it("puts a reassigned consultant back with the marketer, backup, priority and status they had", () => {
    const rows = undoRows([{ consultantId: 1, ok: true, reason: null, previous: { marketerMemberId: 9, backupMemberId: 4, priority: "HIGH", status: "PAUSED" } }]);
    expect(rows).toEqual([{ consultantId: 1, marketerMemberId: 9, backupMemberId: 4, priority: "HIGH", status: "PAUSED" }]);
  });
  it("takes a first-time assignment away again (its previous is empty), and leaves skipped and unchanged rows alone", () => {
    const rows = undoRows([
      { consultantId: 1, ok: true, reason: null, previous: {} },
      { consultantId: 2, ok: true, reason: "UNCHANGED", previous: null },
      { consultantId: 3, ok: false, reason: "NOT_FOUND", previous: null },
    ]);
    expect(rows).toEqual([{ consultantId: 1, marketerMemberId: null, backupMemberId: null, priority: "MEDIUM", status: "ACTIVE" }]);
  });
  it("counts what really changed and words the toast", () => {
    const r: BulkResult = { action: "ASSIGN", requested: 4, ok: 3, skipped: [{ consultantId: 4, reason: "NOT_FOUND" }], results: [
      { consultantId: 1, ok: true, reason: null, previous: {} },
      { consultantId: 2, ok: true, reason: null, previous: { marketerMemberId: 1 } },
      { consultantId: 3, ok: true, reason: "UNCHANGED", previous: null },
      { consultantId: 4, ok: false, reason: "NOT_FOUND", previous: null },
    ] };
    expect(changedCount(r)).toBe(2);
    const s = bulkSummary(r, "assigned");
    expect(s.title).toBe("Assigned 2 consultants");
    expect(s.variant).toBe("success");
    expect(s.description).toContain("1 consultant already as asked");
    expect(s.description).toContain("1 skipped");
    expect(bulkSummary({ ...r, ok: 0, results: [r.results[3]] }, "paused").variant).toBe("error");
  });
});

describe("capacity", () => {
  it("reads the 409 OVER_CAPACITY figures, and only those", () => {
    const base = { ok: false as const, status: 409, code: "OVER_CAPACITY", extra: { marketerMemberId: 3, capacity: 30, current: 28, adding: 3, projected: 31 } };
    expect(overCapacityOf(base)).toEqual({ marketerMemberId: 3, capacity: 30, current: 28, adding: 3, projected: 31 });
    expect(overCapacityOf({ ...base, code: "OTHER" })).toBeNull();
    expect(overCapacityOf({ ...base, status: 422 })).toBeNull();
    expect(overCapacityOf({ ...base, extra: { capacity: 30 } })).toBeNull();
  });
  it("says it in a sentence", () => {
    expect(overText("Jessica Davis", 31, 30)).toBe("Jessica Davis would have 31 of 30 consultants, 1 over.");
    expect(overText("Mia", 4, 5)).toBe("Mia would have 4 of 5 consultants.");
  });
  it("has friendlier words for the known codes and keeps the server's message for the rest", () => {
    expect(errorSentence({ status: 422, code: "MARKETER_INVALID", message: "x" })).toContain("can't carry");
    expect(errorSentence({ status: 500, message: "Boom" })).toBe("Boom");
    expect(errorSentence({ status: 0, message: "offline" })).toBe("offline");
  });
});

describe("the client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends an Idempotency-Key with every change, and the body as JSON", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ action: "ASSIGN", requested: 1, ok: 1, skipped: [], results: [] }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    await marketingApi.assign(2, { consultantIds: [1], marketerMemberId: 5 }, "key-12345678");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orgs/2/marketing-assignments/assign");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("key-12345678");
    expect(JSON.parse(init.body as string)).toEqual({ consultantIds: [1], marketerMemberId: 5 });
  });

  it("turns a refusal into code, message and the extras the page needs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "Over", code: "OVER_CAPACITY", capacity: 3 }) }) as unknown as Response));
    const r = await marketingApi.assign(2, { consultantIds: [1], marketerMemberId: 5 });
    expect(r).toMatchObject({ ok: false, status: 409, code: "OVER_CAPACITY", message: "Over", extra: { capacity: 3 } });
  });

  it("says so when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    const r = await marketingApi.kpis(2);
    expect(r).toMatchObject({ ok: false, status: 0 });
  });

  it("asks for the marketers with a search only from two characters", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    await marketingApi.marketers(2, { q: "j", status: "" });
    await marketingApi.marketers(2, { q: "je", status: "PAUSED" });
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe("/api/orgs/2/marketing-assignments/marketers");
    expect((fetchMock.mock.calls[1] as unknown[])[0]).toBe("/api/orgs/2/marketing-assignments/marketers?q=je&status=PAUSED");
  });
});
