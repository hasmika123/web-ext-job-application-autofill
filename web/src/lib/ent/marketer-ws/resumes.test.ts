import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FILTERS, agoText, approveResume, buildQuery, completenessTone, fetchResumes, markNeedsUpdate, pageWindow, parseResumeDetail, parseResumes, patchResume, photoFor, requestApproval,
} from "./resumes";

const row = (over: Record<string, unknown> = {}) => ({
  id: 1, consultantId: 1, consultantName: "Alex Morgan", consultantTitle: "Java Developer", avatarUrl: null, title: "Alex Morgan - Consulting Resume", targetRole: null, version: 3,
  lastModifiedAt: "2026-10-11T10:00:00Z", primary: true, completeness: 92, approval: "APPROVED", hasFile: false, canEdit: true, ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("parseResumes", () => {
  it("reads the board document", () => {
    const v = parseResumes({
      kpis: [{ key: "total", value: 48, deltaPct: 12, sparkline: [1, 2, 3] }, { key: "bogus", value: 1 }],
      items: [row()], total: 48, page: 0, size: 10, skills: ["Java", 3], activity: [{ id: 1, resumeId: 1, consultantId: 1, consultantName: "Alex Morgan", kind: "UPDATED", text: "updated resume to v3", at: "2026-10-13T10:00:00Z" }], canApprove: true,
    })!;
    expect(v.kpis).toHaveLength(1);
    expect(v.kpis[0]).toMatchObject({ key: "total", value: 48, deltaPct: 12 });
    expect(v.items[0]).toMatchObject({ consultantName: "Alex Morgan", version: 3, approval: "APPROVED", hasFile: false });
    expect(v.skills).toEqual(["Java"]);
    expect(v.total).toBe(48);
    expect(v.activity[0].text).toBe("updated resume to v3");
    expect(v.canApprove).toBe(true);
  });

  it("is lenient: wrong shapes become empty sections and defaults, a non-object is null", () => {
    expect(parseResumes(null)).toBeNull();
    expect(parseResumes([])).toBeNull();
    const v = parseResumes({ kpis: "x", items: [row({ approval: "weird", version: 0, completeness: 400, avatarUrl: 5 }), 7], activity: {}, total: "many" })!;
    expect(v.kpis).toEqual([]);
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ approval: "APPROVED", version: 1, completeness: 100, avatarUrl: null });
    expect(v.activity).toEqual([]);
    expect(v.total).toBe(1);
    expect(v.canApprove).toBe(false);
  });

  it("a missing delta is null (no chip), never zero", () => {
    expect(parseResumes({ kpis: [{ key: "total", value: 1, sparkline: [] }] })!.kpis[0].deltaPct).toBeNull();
  });

  it("parses the preview", () => {
    const d = parseResumeDetail({ row: row(), headline: "h", summary: null, skills: [{ name: "Java", primary: true }], experience: [{ title: "Dev", employer: "Acme", startYear: 2020, endYear: null }], history: [] })!;
    expect(d.headline).toBe("h");
    expect(d.summary).toBeNull();
    expect(d.experience[0]).toEqual({ title: "Dev", employer: "Acme", startYear: 2020, endYear: null });
    expect(parseResumeDetail({})).toBeNull();
  });
});

describe("helpers", () => {
  it("builds the query the API reads", () => {
    expect(buildQuery(DEFAULT_FILTERS)).toBe("updated=3m&sort=modified%2Cdesc&page=0&size=10");
    expect(buildQuery({ ...DEFAULT_FILTERS, q: " alex ", skill: "Java", status: "PENDING", availability: "AVAILABLE", page: 2, size: 25, updated: "all" })).toBe(
      "q=alex&skill=Java&status=PENDING&updated=all&availability=AVAILABLE&sort=modified%2Cdesc&page=2&size=25",
    );
  });
  it("slides a five page window", () => {
    expect(pageWindow(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(pageWindow(0, 2)).toEqual([0, 1]);
    expect(pageWindow(7, 10)).toEqual([5, 6, 7, 8, 9]);
    expect(pageWindow(5, 12)).toEqual([3, 4, 5, 6, 7]);
    expect(pageWindow(0, 0)).toEqual([]);
  });
  it("says 'ago' the way the board does", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    const ago = (d: number) => agoText(new Date(now - d * 864e5).toISOString(), now);
    expect(ago(2)).toBe("2 days ago");
    expect(ago(14)).toBe("2 weeks ago");
    expect(ago(28)).toBe("4 weeks ago");
    expect(ago(90)).toBe("3 months ago");
    expect(agoText("nope", now)).toBe("");
  });
  it("colours completeness by band", () => {
    expect([92, 80, 79, 60, 59].map(completenessTone)).toEqual(["green", "green", "amber", "amber", "red"]);
  });
  it("uses a real avatar first, then a board photo by name, else nothing (initials)", () => {
    expect(photoFor("Alex Morgan", "/x.png")).toBe("/x.png");
    expect(photoFor("Alex Morgan", null)).toBe("/ent/marketer/resumes/alex-morgan.png");
    expect(photoFor("Someone Else", null)).toBeNull();
  });
});

const reply = (status: number, body: unknown) => vi.fn(async (...args: unknown[]) => (void args, new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })));

describe("fetching and writing", () => {
  it("DENIED for 403/404, FAILED for a server error", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await fetchResumes(2, DEFAULT_FILTERS)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(500, {}));
    expect(await fetchResumes(2, DEFAULT_FILTERS)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await fetchResumes(2, DEFAULT_FILTERS)).toEqual({ kind: "FAILED" });
  });

  it("every write goes through the BFF routes of the Resumes page and nowhere else", async () => {
    const detail = { row: row(), headline: null, summary: null, skills: [], experience: [], history: [] };
    const f = reply(200, detail);
    vi.stubGlobal("fetch", f);
    await patchResume(2, 5, { headline: "New" });
    await requestApproval(2, 5);
    await markNeedsUpdate(2, 5);
    await approveResume(2, 5);
    const calls = f.mock.calls.map((c) => [String(c[0]), (c[1] as RequestInit).method]);
    expect(calls).toEqual([
      ["/api/orgs/2/mkt/resumes/5", "PATCH"],
      ["/api/orgs/2/mkt/resumes/5/approval-request", "POST"],
      ["/api/orgs/2/mkt/resumes/5/needs-update", "POST"],
      ["/api/orgs/2/mkt/resumes/5/approve", "POST"],
    ]);
    expect(JSON.parse(String((f.mock.calls[0][1] as RequestInit).body))).toEqual({ headline: "New" });
  });

  it("maps 422 to INVALID with the API's message, 404 to DENIED, 5xx to FAILED", async () => {
    vi.stubGlobal("fetch", reply(422, { error: "title: is required" }));
    expect(await patchResume(2, 5, { title: "" })).toEqual({ kind: "INVALID", message: "title: is required" });
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await requestApproval(2, 5)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(409, { error: "You can't approve a resume you requested or edited yourself." }));
    expect(await approveResume(2, 5)).toMatchObject({ kind: "FAILED", message: "You can't approve a resume you requested or edited yourself." });
  });
});
