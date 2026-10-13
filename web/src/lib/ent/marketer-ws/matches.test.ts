import { afterEach, describe, expect, it, vi } from "vitest";
import { actOnMatch, EMPTY_QUERY, fetchMatches, matchPhoto, parseDetail, parseMatches, queryString, scoreTone } from "./matches";

const row = (over: Record<string, unknown> = {}) => ({
  id: 1, consultantId: 10, consultantName: "Alex Morgan", avatarUrl: null, consultantRole: "Java Developer", primarySkill: "Java", requirementId: 100,
  jobTitle: "Senior Java Developer", clientId: 500, client: "TechCorp", score: 96, status: "SUGGESTED", stale: false, highConfidence: true,
  availability: { key: "EXCELLENT", label: "Excellent", tone: "green", pct: 100 }, resumeUpdate: { needed: false, reasons: [] }, createdAt: "2026-10-11T10:00:00Z", ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("parseMatches", () => {
  it("reads a full document", () => {
    const v = parseMatches({
      kpis: [{ key: "matched", value: 142, deltaPct: 24, sparkline: [1, 2, 3] }, { key: "bogus", value: 1 }],
      filters: { consultants: [{ key: "10", label: "Alex Morgan" }], skills: ["Java"], clients: [{ key: "500", label: "TechCorp" }], scores: [{ key: "high", label: "High" }] },
      items: [row()], total: 142, page: 0, size: 10, topToday: [row()], explanation: { row: row(), consultant: { id: 10, name: "Alex Morgan", role: "Java Developer", skills: ["Java"] }, job: { id: 100, title: "Senior Java Developer", client: "TechCorp", location: "NY", skills: [] }, ticks: [{ key: "skills", ok: true, text: "x" }], insights: [{ key: "skills", label: "Skills Match", pct: 92 }, { key: "client", label: "Client History", pct: null }], missingSkills: [], reason: "r", assignedAt: null },
      highConfidenceMin: 85, staleDays: 7,
    });
    expect(v?.kpis).toHaveLength(1); // an unknown key is dropped
    expect(v?.items[0].availability.tone).toBe("green");
    expect(v?.explanation?.insights[1].pct).toBeNull();
    expect(v?.total).toBe(142);
  });

  it("is lenient: junk sections become empty, junk documents become null", () => {
    const v = parseMatches({ kpis: "x", items: [{ nope: 1 }, row({ status: "WEIRD", availability: null })], topToday: 5, explanation: { row: {} } });
    expect(v?.kpis).toEqual([]);
    expect(v?.items).toHaveLength(1);
    expect(v?.items[0].status).toBe("SUGGESTED");
    expect(v?.items[0].availability.tone).toBe("amber");
    expect(v?.topToday).toEqual([]);
    expect(v?.explanation).toBeNull();
    expect(parseMatches(null)).toBeNull();
    expect(parseMatches([])).toBeNull();
    expect(parseDetail({})).toBeNull();
  });
});

describe("queryString and art", () => {
  it("sends only the filters that are set", () => {
    expect(queryString(EMPTY_QUERY)).toBe("page=0&size=10");
    expect(queryString({ ...EMPTY_QUERY, score: "high", clientId: "5", selected: 3, page: 2 })).toBe("page=2&size=10&clientId=5&score=high&selected=3");
  });
  it("a real avatarUrl wins; a board consultant falls back to the cropped photo; anyone else gets initials", () => {
    expect(matchPhoto("Alex Morgan", "https://x/y.png")).toBe("https://x/y.png");
    expect(matchPhoto("Alex Morgan", null)).toBe("/ent/marketer/matches/alex-morgan.png");
    expect(matchPhoto("Alex Morgan", null, true)).toBe("/ent/marketer/matches/alex-morgan-large.png");
    expect(matchPhoto("Someone Else", null)).toBeNull();
  });
  it("draws 80% and up green", () => {
    expect(scoreTone(82)).toBe("green");
    expect(scoreTone(78)).toBe("amber");
  });
});

describe("network helpers", () => {
  const reply = (status: number, body: unknown) => vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("maps 404/403 to DENIED and a bad body to FAILED", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect((await fetchMatches(2, EMPTY_QUERY)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(200, "junk"));
    expect((await fetchMatches(2, EMPTY_QUERY)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await fetchMatches(2, EMPTY_QUERY)).kind).toBe("FAILED");
  });

  it("assign and dismiss POST to the BFF only (a record, never a submission)", async () => {
    const f = reply(200, row({ status: "ASSIGNED" }));
    vi.stubGlobal("fetch", f);
    const r = await actOnMatch(2, 7, "assign");
    expect(r.kind).toBe("OK");
    expect(f).toHaveBeenCalledWith("/api/orgs/2/mkt/matches/7/assign", expect.objectContaining({ method: "POST" }));
    await actOnMatch(2, 7, "dismiss");
    expect(f).toHaveBeenLastCalledWith("/api/orgs/2/mkt/matches/7/dismiss", expect.objectContaining({ method: "POST" }));
    for (const call of f.mock.calls) expect(String(call[0])).not.toMatch(/submit|apply|send/);
  });

  it("surfaces a 409 as a conflict with the server's words", async () => {
    vi.stubGlobal("fetch", reply(409, { message: "This job is no longer open" }));
    expect(await actOnMatch(2, 7, "assign")).toEqual({ kind: "CONFLICT", message: "This job is no longer open" });
  });
});
