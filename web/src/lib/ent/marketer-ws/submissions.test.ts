import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boardQueryString, createSubmission, DEFAULT_QUERY, fetchSubmissions, logoFor, pageWindow, parseBoard, parseDetail, parseRow, photoFor, recordStatus, withdrawSubmission,
} from "./submissions";

afterEach(() => vi.unstubAllGlobals());

describe("parseBoard", () => {
  it("is null for a non-object and empties a malformed section", () => {
    expect(parseBoard(null)).toBeNull();
    expect(parseBoard([])).toBeNull();
    const b = parseBoard({ kpis: "nope", items: [{ id: 1, consultant: { name: "A" } }, "junk"], breakdown: 3, activity: {}, filters: [], views: "x" });
    expect(b?.kpis).toEqual({});
    expect(b?.items).toHaveLength(1);
    expect(b?.items[0].approvalState).toBe("DRAFT");
    expect(b?.items[0].status).toBe("DRAFT");
    expect(b?.items[0].resume).toBeNull();
    expect(b?.items[0].actions).toEqual([]);
    expect(b?.breakdown).toBeNull();
    expect(b?.activity).toEqual([]);
    expect(b?.filters).toEqual({ clients: [], jobTitles: [] });
    expect(b?.size).toBe(10);
  });

  it("keeps a delta of null as 'nothing to compare' and drops unknown buckets, actions and kinds", () => {
    const b = parseBoard({
      kpis: { pendingApprovals: { value: 12, deltaPct: null, sparkline: [1, "x", 3] }, rejected: { deltaPct: 5 } },
      items: [{ id: 2, status: "NOPE", approvalState: "AWAITING_APPROVAL", bucket: "AWAITING_APPROVAL", actions: ["WITHDRAW", "SUBMIT_FOR_CONSULTANT"] }],
      breakdown: { period: "7d", total: 3, buckets: [{ key: "DRAFT", count: 1 }, { key: "BOGUS", count: 2 }] },
      activity: [{ id: 1, kind: "WHAT", text: "t" }],
    });
    expect(b?.kpis.pendingApprovals).toEqual({ value: 12, deltaPct: null, sparkline: [1, 3] });
    expect(b?.kpis.rejected).toBeUndefined();
    expect(b?.items[0].status).toBe("DRAFT");
    expect(b?.items[0].actions).toEqual(["WITHDRAW"]);
    expect(b?.breakdown?.buckets).toHaveLength(1);
    expect(b?.activity[0].kind).toBe("DRAFT");
  });

  it("reads a full row", () => {
    const r = parseRow({
      id: 1, code: "SUB-2026-001", consultant: { id: 4, name: "Alex Morgan", role: "Java Developer", avatarUrl: null }, job: { id: 9, title: "Senior Java Developer", code: "JOB-1001" },
      client: { id: 3, name: "TechCorp" }, submissionDate: "2026-10-13T08:00:00Z", approvalState: "APPROVED", resume: { id: 7, version: "v3.2", updatedOn: "2026-10-12T00:00:00Z" },
      status: "SUBMITTED", bucket: "SUBMITTED", actions: ["RECORD_STATUS"],
    });
    expect(r.resume?.version).toBe("v3.2");
    expect(r.job.code).toBe("JOB-1001");
    expect(r.actions).toEqual(["RECORD_STATUS"]);
  });

  it("parses the detail with its events", () => {
    expect(parseDetail({})).toBeNull();
    const d = parseDetail({ row: { id: 1 }, note: "fit", events: [{ id: 5, kind: "CREATED", to: "DRAFT", at: "2026-10-13T08:00:00Z" }, 3] });
    expect(d?.note).toBe("fit");
    expect(d?.events).toHaveLength(1);
  });
});

describe("boardQueryString", () => {
  it("sends only what is set, plus paging, sort and the periods", () => {
    expect(boardQueryString(DEFAULT_QUERY)).toBe("period=30d&donutPeriod=30d&sort=date&dir=desc&page=0&size=10");
    const q = new URLSearchParams(boardQueryString({ ...DEFAULT_QUERY, q: " priya ", status: "CLIENT_REVIEW", clientId: "3", jobTitle: "Data Analyst", approval: "APPROVED", page: 2 }));
    expect(q.get("q")).toBe("priya");
    expect(q.get("status")).toBe("CLIENT_REVIEW");
    expect(q.get("clientId")).toBe("3");
    expect(q.get("jobTitle")).toBe("Data Analyst");
    expect(q.get("approval")).toBe("APPROVED");
    expect(q.get("page")).toBe("2");
  });
});

describe("pageWindow", () => {
  it("draws 1 2 3 4 5 ... 9 on the first pages, like the board", () => {
    expect(pageWindow(0, 9)).toEqual([0, 1, 2, 3, 4, "gap", 8]);
    expect(pageWindow(3, 9)).toEqual([0, 1, 2, 3, 4, "gap", 8]);
  });
  it("centres on the page in the middle and anchors the end", () => {
    expect(pageWindow(5, 12)).toEqual([0, "gap", 4, 5, 6, "gap", 11]);
    expect(pageWindow(11, 12)).toEqual([0, "gap", 7, 8, 9, 10, 11]);
    expect(pageWindow(0, 1)).toEqual([0]);
    expect(pageWindow(2, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("board art", () => {
  it("prefers the API's avatar and falls back to the board crop by name, then to initials", () => {
    expect(photoFor("Alex Morgan", "/x.png")).toBe("/x.png");
    expect(photoFor("Alex Morgan", null)).toBe("/ent/marketer/submissions/alex-morgan.png");
    expect(photoFor("Nobody Known", null)).toBeNull();
    expect(logoFor("Global Bank")).toBe("/ent/marketer/submissions/logo-global-bank.png");
    expect(logoFor("Unknown Co")).toBeNull();
  });
});

describe("fetchSubmissions and the writes", () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status }));

  it("maps 403/404 to DENIED, other failures to FAILED, and a good document to OK", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect((await fetchSubmissions(2, DEFAULT_QUERY)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(500, {}));
    expect((await fetchSubmissions(2, DEFAULT_QUERY)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", reply(200, "nope"));
    expect((await fetchSubmissions(2, DEFAULT_QUERY)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", reply(200, { items: [], total: 0 }));
    expect((await fetchSubmissions(2, DEFAULT_QUERY)).kind).toBe("OK");
  });

  it("writes go to the BFF with the right verb and report the API's message on a refusal", async () => {
    const fn = reply(201, { id: 9, code: "SUB-2026-009" });
    vi.stubGlobal("fetch", fn);
    const ok = await createSubmission(2, { consultantId: 1, requirementId: 11 });
    expect(ok.ok).toBe(true);
    expect(fn).toHaveBeenCalledWith("/api/orgs/2/mkt/submissions", expect.objectContaining({ method: "POST", body: JSON.stringify({ consultantId: 1, requirementId: 11 }) }));
    vi.stubGlobal("fetch", reply(409, { error: "A submission for this consultant and job already exists.", code: "SUBMISSION_EXISTS" }));
    const dup = await createSubmission(2, { consultantId: 1, requirementId: 11 });
    expect(dup).toEqual({ ok: false, status: 409, error: "A submission for this consultant and job already exists.", code: "SUBMISSION_EXISTS" });
    vi.stubGlobal("fetch", reply(204, null));
    expect((await withdrawSubmission(2, 9)).ok).toBe(true);
    const patch = reply(200, { id: 9 });
    vi.stubGlobal("fetch", patch);
    await recordStatus(2, 9, "CLIENT_REVIEW");
    expect(patch).toHaveBeenCalledWith("/api/orgs/2/mkt/submissions/9/status", expect.objectContaining({ method: "PATCH" }));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const down = await withdrawSubmission(2, 9);
    expect(down.ok).toBe(false);
  });
});

describe("create and the duplicate guard (Sprint 2 / B1)", () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("a confirmed create carries the two extra fields; a plain one is exactly as before", async () => {
    const f = reply(201, { id: 9 });
    vi.stubGlobal("fetch", f);
    await createSubmission(2, { consultantId: 1, requirementId: 11 });
    await createSubmission(2, { consultantId: 1, requirementId: 11, note: "Fits" }, { reason: "Both vendors asked" });
    const body = (n: number) => JSON.parse(((f.mock.calls[n] as unknown) as [string, RequestInit])[1].body as string);
    expect(body(0)).toEqual({ consultantId: 1, requirementId: 11 });
    expect(body(1)).toEqual({ consultantId: 1, requirementId: 11, note: "Fits", confirmDuplicate: true, duplicateReason: "Both vendors asked" });
  });

  it("a refusal keeps its code and findings", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "Duplicate. Confirm with a reason to go ahead.", code: "DUPLICATE_WARNING", findings: [{ rule: "SAME_POSTING", message: "Same posting." }, { rule: "x" }] }));
    expect(await createSubmission(2, { consultantId: 1, requirementId: 11 })).toEqual({
      ok: false, status: 409, error: "Duplicate. Confirm with a reason to go ahead.", code: "DUPLICATE_WARNING", findings: [{ rule: "SAME_POSTING", message: "Same posting." }],
    });
    vi.stubGlobal("fetch", reply(409, { error: "Blocked.", code: "DUPLICATE_BLOCKED" }));
    expect(await createSubmission(2, { consultantId: 1, requirementId: 11 })).toEqual({ ok: false, status: 409, error: "Blocked.", code: "DUPLICATE_BLOCKED" });
  });
});
