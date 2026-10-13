import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_FILTERS, deleteTalentView, fetchTalent, fetchTalentDetail, hasFilters, parseDetail, parseRow, parseTalent, saveTalentView, talentQueryString, yearsText } from "./talent";

afterEach(() => vi.unstubAllGlobals());
const reply = (status: number, body?: unknown) => vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("parseTalent", () => {
  it("is null for a non-object and empties a malformed section", () => {
    expect(parseTalent(null)).toBeNull();
    expect(parseTalent([])).toBeNull();
    const v = parseTalent({ kpis: "nope", items: [{ id: 1, name: "A" }, "x"], cards: 5, views: [{ id: 2, name: "V", filters: { status: "DROP", q: 4 } }] });
    expect(v?.kpis).toEqual([]);
    expect(v?.items).toHaveLength(1);
    expect(v?.items[0].availability.code).toBe("UNAVAILABLE");
    expect(v?.items[0].resume.state).toBe("UP_TO_DATE");
    expect(v?.cards.available).toEqual([]);
    expect(v?.views[0].filters.status).toBe("");
    expect(v?.views[0].filters.q).toBe("");
    expect(v?.canAddConsultant).toBe(false);
    expect(v?.size).toBe(8);
  });

  it("keeps the real rows and a null delta as null (no chip)", () => {
    const v = parseTalent({
      kpis: [{ key: "assigned", value: 28, deltaPct: null, sparkline: [1, "x", 3] }, { key: "bogus", value: 1 }],
      counts: { all: 28, availableNow: 12, inInterview: 8, needsUpdate: 6, pendingApproval: 5 },
      items: [{ id: 1, name: "Alex Morgan", title: "Senior Java Developer", primarySkill: "Java / Spring", yearsExperience: 8, location: "New York, NY", availability: { code: "AVAILABLE_NOW", label: "Available Now", tone: "green" }, resume: { state: "NEEDS_UPDATE", label: "Needs Update" }, activeApps: 5, assignedJobs: 3 }],
      canAddConsultant: true,
    });
    expect(v?.kpis).toEqual([{ key: "assigned", value: 28, deltaPct: null, sparkline: [1, 3] }]);
    expect(v?.counts.pendingApproval).toBe(5);
    expect(v?.items[0]).toMatchObject({ name: "Alex Morgan", yearsExperience: 8, assignedJobs: 3, avatarUrl: null });
    expect(v?.items[0].resume.state).toBe("NEEDS_UPDATE");
    expect(v?.canAddConsultant).toBe(true);
  });

  it("parseRow tolerates an unknown availability code and a missing years value", () => {
    const r = parseRow({ id: 3, name: "X", availability: { code: "WHAT", tone: "pink" }, yearsExperience: "many" });
    expect(r.availability).toEqual({ code: "UNAVAILABLE", label: "", tone: "grey" });
    expect(r.yearsExperience).toBeNull();
    expect(yearsText(null)).toBe("");
    expect(yearsText(8)).toBe("8 yrs");
  });
});

describe("parseDetail", () => {
  it("needs an id and carries only the summary fields", () => {
    expect(parseDetail({})).toBeNull();
    const d = parseDetail({ id: 1, name: "Alex", email: "a@b.c", phone: "123", skills: ["Java", 3], resumes: [{ id: 1, name: "R", version: 3, primary: true, approval: "APPROVED", updatedAt: "2026-10-01T00:00:00Z" }], consent: "weird" });
    expect(d?.skills).toEqual(["Java"]);
    expect(d?.consent).toBe("SUMMARY");
    expect(d?.resumes[0].primary).toBe(true);
    expect(Object.keys(d ?? {})).not.toContain("email");
    expect(Object.keys(d ?? {})).not.toContain("phone");
  });
});

describe("talentQueryString", () => {
  it("sends only the filters that are set", () => {
    expect(talentQueryString({ ...NO_FILTERS, page: 0 })).toBe("");
    expect(talentQueryString({ ...NO_FILTERS, q: " java ", status: "NEEDS_UPDATE", experience: "6-8", page: 2 })).toBe("q=java&status=NEEDS_UPDATE&experience=6-8&page=2");
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, skill: "Java" })).toBe(true);
  });
});

describe("fetchers", () => {
  it("maps 403/404 to DENIED, other failures to FAILED, and a bad body to FAILED", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect((await fetchTalent(2, { ...NO_FILTERS, page: 0 })).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(403, {}));
    expect((await fetchTalentDetail(2, 1)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(500, {}));
    expect((await fetchTalent(2, { ...NO_FILTERS, page: 0 })).kind).toBe("FAILED");
    vi.stubGlobal("fetch", reply(200, "nope"));
    expect((await fetchTalent(2, { ...NO_FILTERS, page: 0 })).kind).toBe("FAILED");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await fetchTalent(2, { ...NO_FILTERS, page: 0 })).kind).toBe("FAILED");
  });

  it("asks only the BFF routes of this page", async () => {
    const f = reply(200, { items: [] });
    vi.stubGlobal("fetch", f);
    await fetchTalent(2, { ...NO_FILTERS, status: "AVAILABLE_NOW", page: 0 });
    expect(f.mock.calls[0][0]).toBe("/api/orgs/2/mkt/talent?status=AVAILABLE_NOW");
  });

  it("saves and deletes a view through the BFF with filters only", async () => {
    const f = reply(201, { id: 4, name: "Mine", filters: { status: "NEEDS_UPDATE" } });
    vi.stubGlobal("fetch", f);
    const r = await saveTalentView(2, "Mine", { ...NO_FILTERS, status: "NEEDS_UPDATE" });
    expect(r).toEqual({ ok: true, view: { id: 4, name: "Mine", filters: { ...NO_FILTERS, status: "NEEDS_UPDATE" } } });
    expect(f.mock.calls[0][0]).toBe("/api/orgs/2/mkt/talent/views");
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ name: "Mine", q: null, status: "NEEDS_UPDATE", skill: null, location: null, experience: null, availability: null });
    vi.stubGlobal("fetch", reply(422, { error: "Give the view a name." }));
    expect(await saveTalentView(2, "", NO_FILTERS)).toEqual({ ok: false, error: "Give the view a name." });
    const del = reply(204);
    vi.stubGlobal("fetch", del);
    expect(await deleteTalentView(2, 4)).toBe(true);
    expect(del.mock.calls[0][0]).toBe("/api/orgs/2/mkt/talent/views/4");
    expect(del.mock.calls[0][1]).toEqual({ method: "DELETE" });
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await deleteTalentView(2, 9)).toBe(false);
  });
});
