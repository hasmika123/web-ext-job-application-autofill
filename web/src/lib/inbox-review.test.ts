import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PERSONAL_REVIEW,
  acceptReview,
  dismissReview,
  fetchRejectionSetting,
  fetchReview,
  isSure,
  parseReviewList,
  reviewSentence,
  saveRejectionSetting,
  undoInboxChange,
  type ReviewItem,
} from "./inbox-review";
import { reviewEndpoints } from "./ent/consultant-ws/inbox";

const item = (o: Partial<ReviewItem> = {}): ReviewItem => ({
  id: 7,
  kind: "REJECTION",
  applicationId: 3,
  company: "Acme",
  role: "Data Engineer",
  currentStatus: "APPLIED",
  proposedStatus: "REJECTED",
  confidence: 90,
  evidence: "we will not be moving forward",
  candidates: [],
  createdAt: "2026-10-12T10:00:00Z",
  expiresAt: null,
  ...o,
});

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

describe("parseReviewList", () => {
  it("reads the contract and drops rows that are not", () => {
    const l = parseReviewList({
      items: [
        { id: 1, kind: "AMBIGUOUS", applicationId: null, company: "Orbit Freight", role: "", currentStatus: null, proposedStatus: "REJECTED", confidence: 55, evidence: "e", candidates: [{ applicationId: 4, company: "Orbit Freight", role: "SRE" }, { nope: 1 }], createdAt: "2026-10-12T10:00:00Z", expiresAt: "2026-10-30T10:00:00Z" },
        { id: 2, kind: "SOMETHING_ELSE" },
        "x",
      ],
      count: 3,
    })!;
    expect(l.items).toHaveLength(1);
    expect(l.items[0].candidates).toEqual([{ applicationId: 4, company: "Orbit Freight", role: "SRE" }]);
    expect(l.items[0].applicationId).toBeNull();
    expect(l.count).toBe(3);
  });
  it("rejects a body that is not the contract", () => {
    expect(parseReviewList(null)).toBeNull();
    expect(parseReviewList({})).toBeNull();
  });
});

describe("plain words", () => {
  it("says a rejection the way the brief does", () => {
    expect(reviewSentence(item())).toBe("Acme says: not selected for Data Engineer. Mark as Rejected?");
  });
  it("counts the candidates of an ambiguous mail", () => {
    const two = item({ kind: "AMBIGUOUS", applicationId: null, company: "Orbit Freight", candidates: [{ applicationId: 1, company: "o", role: "a" }, { applicationId: 2, company: "o", role: "b" }] });
    expect(reviewSentence(two)).toBe("Two applications could match this email from Orbit Freight: choose one");
    expect(reviewSentence({ ...two, candidates: [...two.candidates, { applicationId: 3, company: "o", role: "c" }] })).toContain("Three applications");
  });
  it("words a status change with the surface's labels", () => {
    expect(reviewSentence(item({ kind: "STATUS_CHANGE", proposedStatus: "INTERVIEW" }), (s) => `<${s}>`)).toBe("Acme wrote about Data Engineer. Move it to <INTERVIEW>?");
  });
  it("is not sure below 80", () => {
    expect(isSure({ confidence: 79 })).toBe(false);
    expect(isSure({ confidence: 80 })).toBe(true);
  });
});

describe("the personal client", () => {
  it("lists through /api/inbox/review", async () => {
    const f = reply(200, { items: [], count: 0 });
    vi.stubGlobal("fetch", f);
    expect(await fetchReview(PERSONAL_REVIEW)).toEqual({ kind: "ok", data: { items: [], count: 0 } });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("/api/inbox/review");
  });
  it("tells a refusal from a failure", async () => {
    vi.stubGlobal("fetch", reply(403, { error: "no" }));
    expect((await fetchReview(PERSONAL_REVIEW)).kind).toBe("denied");
    vi.stubGlobal("fetch", reply(500, { error: "no" }));
    expect((await fetchReview(PERSONAL_REVIEW)).kind).toBe("failed");
    vi.stubGlobal("fetch", reply(200, { nope: 1 }));
    expect((await fetchReview(PERSONAL_REVIEW)).kind).toBe("failed");
  });
  it("accepts with the chosen application and reads the new status", async () => {
    const f = reply(200, { application: { id: 4, status: "REJECTED" } });
    vi.stubGlobal("fetch", f);
    expect(await acceptReview(PERSONAL_REVIEW, 7, 4)).toEqual({ ok: true, status: "REJECTED" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/inbox/review/7/accept");
    expect(JSON.parse(init.body as string)).toEqual({ applicationId: 4 });
  });
  it("says in words when it was already handled", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "x" }));
    expect(await acceptReview(PERSONAL_REVIEW, 7)).toEqual({ ok: false, message: "That one was already handled." });
  });
  it("dismisses on a 204", async () => {
    const f = reply(204);
    vi.stubGlobal("fetch", f);
    expect(await dismissReview(PERSONAL_REVIEW, 7)).toEqual({ ok: true, status: null });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("/api/inbox/review/7/dismiss");
  });
  it("undoes, and turns 409 UNDO_EXPIRED into 'Too late to undo'", async () => {
    const f = reply(200, { application: { id: 4, status: "APPLIED" } });
    vi.stubGlobal("fetch", f);
    expect(await undoInboxChange(PERSONAL_REVIEW, 4, "e9")).toEqual({ ok: true, status: "APPLIED" });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("/api/applications/4/inbox-undo/e9");
    vi.stubGlobal("fetch", reply(409, { code: "UNDO_EXPIRED", error: "x" }));
    expect(await undoInboxChange(PERSONAL_REVIEW, 4, "e9")).toEqual({ ok: false, expired: true, message: "Too late to undo" });
  });
  it("reads and saves the rejection setting", async () => {
    vi.stubGlobal("fetch", reply(200, { applyRejectionsAutomatically: false }));
    expect(await fetchRejectionSetting(PERSONAL_REVIEW)).toEqual({ kind: "ok", applyRejectionsAutomatically: false });
    const f = reply(200, { applyRejectionsAutomatically: true });
    vi.stubGlobal("fetch", f);
    expect(await saveRejectionSetting(PERSONAL_REVIEW, true)).toEqual({ kind: "ok", applyRejectionsAutomatically: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/inbox/settings");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ applyRejectionsAutomatically: true });
  });
});

describe("the consultant workspace routes", () => {
  it("are all under the organization's me-workspace", () => {
    const e = reviewEndpoints(12);
    expect(e.list).toBe("/api/orgs/12/me-workspace/inbox/review");
    expect(e.accept(5)).toBe("/api/orgs/12/me-workspace/inbox/review/5/accept");
    expect(e.dismiss(5)).toBe("/api/orgs/12/me-workspace/inbox/review/5/dismiss");
    expect(e.settings).toBe("/api/orgs/12/me-workspace/inbox/settings");
    expect(e.undo(9, "ev1")).toBe("/api/orgs/12/me-workspace/applications/9/inbox-undo/ev1");
  });
});
