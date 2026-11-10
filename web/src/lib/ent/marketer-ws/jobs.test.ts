import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_FILTERS, assignJob, criteriaFromFilters, criteriaLine, fetchJobs, filtersFromCriteria, hasFilters, jobsQuery, parseCandidates, parseDetail, parseJobs, saveSearch, sourceLogo,
} from "./jobs";

afterEach(() => vi.unstubAllGlobals());

describe("parseJobs", () => {
  it("is null for anything that is not an object", () => {
    for (const bad of [null, undefined, "x", 3, [], true]) expect(parseJobs(bad)).toBeNull();
  });

  it("turns a bare object into an empty board, never invented rows", () => {
    const v = parseJobs({})!;
    expect(v.items).toEqual([]);
    expect(v.total).toBe(0);
    expect(v.canAssign).toBe(false);
    expect(v.kpis).toEqual({ newToday: null, highMatch: null, assigned: null, savedSearches: null });
    expect(v.trendingSkills).toEqual([]);
    expect(v.topClients).toEqual([]);
    expect(v.alerts).toEqual([]);
    expect(v.savedSearches).toEqual([]);
    expect(v.streams).toEqual([]);
    expect(v.facets.workTypes).toEqual([]);
  });

  it("drops malformed rows and fixes up odd values", () => {
    const v = parseJobs({
      kpis: { newToday: { value: 24, deltaPct: "x", sparkline: [1, "a", 3] }, highMatch: "bad" },
      items: [{ id: 1, title: "Senior Java Developer", client: { id: 2, name: "TechCorp" }, priority: "URGENT", rateLabel: null, skills: ["Java", 3, "", "AWS"], postedAt: "2026-10-13T10:00:00Z" }, "nope", null, 7],
      total: "many",
      canAssign: "yes",
      trendingSkills: [{ skill: "Java", openings: 5, barPct: 400, deltaPct: 3 }, { skill: "AWS", openings: 2, barPct: -5 }],
      savedSearches: [{ id: 3, name: "x", criteria: { skills: ["Java"], rateMin: "5" }, newCount: 4 }],
      alerts: [{ id: "a", kind: "OTHER", text: "t", at: "2026-10-13T10:00:00Z" }],
    })!;
    expect(v.kpis.newToday).toEqual({ value: 24, deltaPct: null, sparkline: [1, 3] });
    expect(v.kpis.highMatch).toBeNull();
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ id: 1, priority: "MEDIUM", rateLabel: "-", skills: ["Java", "AWS"], client: { id: 2, name: "TechCorp", logoUrl: null } });
    expect(v.total).toBe(0);
    expect(v.canAssign).toBe(false);
    expect(v.trendingSkills.map((t) => t.barPct)).toEqual([100, 0]);
    expect(v.trendingSkills[0].rank).toBe(1);
    expect(v.savedSearches[0].criteria).toEqual({ q: null, skills: ["Java"], location: null, workType: null, visa: null, source: null, rateMin: null, rateMax: null });
    expect(v.alerts[0].kind).toBe("CLIENT");
  });

  it("reads detail and candidates leniently", () => {
    expect(parseDetail({})).toBeNull();
    expect(parseDetail({ job: { id: 1, title: "T" }, matches: [{ consultantId: 2, name: "A", score: 90, status: "ASSIGNED" }, 5] })!.matches).toHaveLength(1);
    expect(parseCandidates("x")).toEqual([]);
    expect(parseCandidates([{ consultantId: 1, name: "Alex", score: 9 }, null])).toEqual([{ consultantId: 1, name: "Alex", title: null, availability: null, score: 9, matchStatus: null, pausedReason: null, memberId: null }]);
    expect(parseCandidates([{ consultantId: 2, name: "Ben", pausedReason: "On a project — marketing paused", memberId: 7 }])[0]).toMatchObject({ pausedReason: "On a project — marketing paused", memberId: 7 });
  });
});

describe("filters", () => {
  it("builds a query with only what is set", () => {
    expect(jobsQuery(EMPTY_FILTERS, 0)).toBe("page=0&size=8");
    const q = new URLSearchParams(jobsQuery({ ...EMPTY_FILTERS, q: " java ", skills: ["Java", "AWS"], location: "NY", workType: "REMOTE", visa: "H-1B transfer", source: "Dice", rateMin: "50", rateMax: "90", sort: "rate_desc" }, 2));
    expect(Object.fromEntries(q)).toEqual({ q: "java", skills: "Java,AWS", location: "NY", workType: "REMOTE", visa: "H-1B transfer", source: "Dice", rateMin: "50", rateMax: "90", sort: "rate_desc", page: "2", size: "8" });
  });

  it("knows when a filter is on", () => {
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasFilters({ ...EMPTY_FILTERS, sort: "title_asc" })).toBe(false);
    expect(hasFilters({ ...EMPTY_FILTERS, q: "  " })).toBe(false);
    expect(hasFilters({ ...EMPTY_FILTERS, rateMax: "1" })).toBe(true);
  });

  it("round-trips a saved search through the filters", () => {
    const f = { ...EMPTY_FILTERS, skills: ["Java"], location: "NY", rateMin: "40" };
    const c = criteriaFromFilters(f);
    expect(c).toEqual({ q: null, skills: ["Java"], location: "NY", workType: null, visa: null, source: null, rateMin: 40, rateMax: null });
    expect(filtersFromCriteria(c, "title_asc")).toEqual({ ...f, sort: "title_asc" });
    expect(criteriaFromFilters({ ...EMPTY_FILTERS, rateMin: "abc" }).rateMin).toBeNull();
  });

  it("describes a saved search under its name", () => {
    expect(criteriaLine({ q: null, skills: ["Java", "Spring", "AWS"], location: "NY, NJ, PA", workType: null, visa: null, source: null, rateMin: null, rateMax: null })).toBe("Skills: Java, Spring, AWS | Location: NY, NJ, PA");
  });

  it("maps a source to its board logo", () => {
    expect(sourceLogo("LinkedIn Jobs")).toBe("/ent/marketer/jobs/source-linkedin.png");
    expect(sourceLogo(" ziprecruiter ")).toBe("/ent/marketer/jobs/source-zip.png");
    expect(sourceLogo("Somewhere")).toBeNull();
  });
});

describe("calls", () => {
  const reply = (status: number, body?: unknown) => vi.fn(async () => (status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body ?? {}), { status, headers: { "content-type": "application/json" } })));

  it("classifies the board fetch: ok, denied (403/404), failed", async () => {
    vi.stubGlobal("fetch", reply(200, { items: [] }));
    expect((await fetchJobs(2, "page=0")).kind).toBe("OK");
    for (const s of [403, 404]) {
      vi.stubGlobal("fetch", reply(s));
      expect((await fetchJobs(2, "page=0")).kind).toBe("DENIED");
    }
    vi.stubGlobal("fetch", reply(500));
    expect((await fetchJobs(2, "page=0")).kind).toBe("FAILED");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await fetchJobs(2, "page=0")).kind).toBe("FAILED");
  });

  it("assign posts the consultant id to the assign route and nothing else", async () => {
    const f = reply(200, { matchId: 1, requirementId: 3, consultantId: 5, status: "ASSIGNED", score: 80, created: true });
    vi.stubGlobal("fetch", f);
    const r = await assignJob(2, 3, 5);
    expect(r).toEqual({ ok: true, value: { matchId: 1, requirementId: 3, consultantId: 5, status: "ASSIGNED", score: 80, created: true } });
    const [url, init] = (f.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe("/api/orgs/2/mkt/jobs/3/assign");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ consultantId: 5 });
    expect(url).not.toMatch(/submi/i);
  });

  it("surfaces the API's message and keeps the status for a refused write", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "This job is no longer open." }));
    expect(await assignJob(2, 3, 5)).toEqual({ ok: false, status: 409, error: "This job is no longer open." });
    vi.stubGlobal("fetch", reply(404, {}));
    const r = await saveSearch(2, "x", criteriaFromFilters(EMPTY_FILTERS));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });
});

describe("assign and the duplicate guard (Sprint 2 / B1)", () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  const sentBody = (f: ReturnType<typeof reply>, n = 0) => JSON.parse(((f.mock.calls[n] as unknown) as [string, RequestInit])[1].body as string);

  it("a confirmed assign sends the two extra fields; a plain one does not", async () => {
    const f = reply(200, { matchId: 1, requirementId: 3, consultantId: 5, status: "ASSIGNED", score: 80, created: true });
    vi.stubGlobal("fetch", f);
    await assignJob(2, 3, 5);
    await assignJob(2, 3, 5, { reason: "Both vendors asked" });
    expect(sentBody(f, 0)).toEqual({ consultantId: 5 });
    expect(sentBody(f, 1)).toEqual({ consultantId: 5, confirmDuplicate: true, duplicateReason: "Both vendors asked" });
  });

  it("a refusal keeps its code and findings so the page can ask for a reason", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "Duplicate. Confirm with a reason to go ahead.", code: "DUPLICATE_WARNING", findings: [{ rule: "SAME_JOB", message: "Same role." }, "junk"] }));
    expect(await assignJob(2, 3, 5)).toEqual({ ok: false, status: 409, error: "Duplicate. Confirm with a reason to go ahead.", code: "DUPLICATE_WARNING", findings: [{ rule: "SAME_JOB", message: "Same role." }] });
    vi.stubGlobal("fetch", reply(409, { error: "This consultant already has 5 open opportunities, the most your organization allows (5).", code: "ASSIGNMENT_CAP" }));
    expect(await assignJob(2, 3, 5)).toEqual({ ok: false, status: 409, error: "This consultant already has 5 open opportunities, the most your organization allows (5).", code: "ASSIGNMENT_CAP" });
  });
});
