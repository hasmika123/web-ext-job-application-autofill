import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applied, applyOptimistic, countByState, decline, fetchList, fetchOne, interest, link, parseList, parseOpportunity, predictAllowed, requestInfo, safePostingUrl, sourceName, unlink, viewed,
} from "./opportunities";

const raw = (over: Record<string, unknown> = {}) => ({
  id: 7,
  state: "ASSIGNED",
  job: { id: 70, title: "Senior Java Developer", company: "TechCorp", location: "New York, NY", workMode: "HYBRID", employmentType: "CONTRACT", payLabel: "$70-80/hr", jobUrl: "https://www.linkedin.com/jobs/view/123", atsPlatform: "linkedin", externalJobId: "123", postedOn: "2026-10-10", skills: ["Java", "Kafka"] },
  marketerNote: "Strong fit, mention Kafka.",
  assignedBy: { memberId: 9, name: "Mia Marketer" },
  assignedAt: "2026-10-12T09:00:00Z",
  priority: "HIGH",
  dueOn: "2026-10-20",
  infoRequest: "",
  infoAnswer: "",
  appliedAt: null,
  linkedApplicationId: null,
  allowedActions: ["VIEWED", "INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED"],
  version: 3,
  ...over,
});

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("parseOpportunity", () => {
  it("reads the contract DTO", () => {
    const o = parseOpportunity(raw());
    expect(o).toMatchObject({ id: 7, state: "ASSIGNED", priority: "HIGH", dueOn: "2026-10-20", version: 3, linkedApplicationId: null });
    expect(o?.job).toMatchObject({ title: "Senior Java Developer", payLabel: "$70-80/hr", workMode: "HYBRID", skills: ["Java", "Kafka"], atsPlatform: "linkedin" });
    expect(o?.assignedBy.name).toBe("Mia Marketer");
    expect(o?.allowedActions).toEqual(["VIEWED", "INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED"]);
  });
  it("is lenient: junk becomes defaults, unknown actions and bad skills are dropped, no id is null", () => {
    const o = parseOpportunity({ id: 1, state: "WEIRD", priority: "??", job: "nope", allowedActions: ["INTEREST", "DELETE_EVERYTHING", 4], assignedBy: null });
    expect(o).toMatchObject({ state: "ASSIGNED", priority: "MEDIUM", allowedActions: ["INTEREST"] });
    expect(o?.job.title).toBe("");
    expect(parseOpportunity({ state: "ASSIGNED" })).toBeNull();
    expect(parseOpportunity(null)).toBeNull();
    expect(parseOpportunity([])).toBeNull();
  });
  it("keeps the timeline only when the API sends one", () => {
    expect(parseOpportunity(raw())?.timeline).toEqual([]);
    expect(parseOpportunity(raw({ timeline: [{ id: "a", at: "2026-10-12T09:00:00Z", text: "Assigned", actor: "Mia" }, { at: "x" }] }))?.timeline).toHaveLength(1);
  });
});

describe("parseList / countByState", () => {
  it("drops malformed rows and counts per state", () => {
    const list = parseList({ items: [raw(), raw({ id: 8, state: "APPLIED" }), "junk", raw({ id: 9, state: "APPLIED" })], total: 3 });
    expect(list?.items).toHaveLength(3);
    expect(countByState(list!.items)).toMatchObject({ ALL: 3, ASSIGNED: 1, APPLIED: 2, DECLINED: 0 });
    expect(parseList({})).toBeNull();
  });
});

describe("helpers", () => {
  it("only links http(s) postings", () => {
    expect(safePostingUrl("https://boards.greenhouse.io/x/jobs/1")).toContain("greenhouse");
    expect(safePostingUrl("javascript:alert(1)")).toBeNull();
    expect(safePostingUrl("")).toBeNull();
  });
  it("knows the boards it has art for", () => {
    expect(sourceName("linkedin")).toEqual({ label: "LinkedIn", known: true });
    expect(sourceName("Acme ATS")).toEqual({ label: "Acme ATS", known: false });
    expect(sourceName("").label).toBe("");
  });
});

describe("fetchList / fetchOne", () => {
  it("OK, DENIED on 404, FAILED on 500 or a network error", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ items: [raw()], total: 1 })).mockResolvedValueOnce(ok({}, 404)).mockResolvedValueOnce(ok({}, 500)).mockRejectedValueOnce(new Error("down"));
    vi.stubGlobal("fetch", f);
    expect((await fetchList(2)).kind).toBe("OK");
    expect(String(f.mock.calls[0][0])).toBe("/api/orgs/2/consultant/opportunities?page=0&size=100");
    expect((await fetchList(2)).kind).toBe("DENIED");
    expect((await fetchList(2)).kind).toBe("FAILED");
    expect((await fetchList(2)).kind).toBe("FAILED");
  });
  it("sends the state filter", async () => {
    const f = vi.fn().mockResolvedValue(ok({ items: [], total: 0 }));
    vi.stubGlobal("fetch", f);
    await fetchList(2, { state: "APPLIED", size: 10 });
    expect(String(f.mock.calls[0][0])).toBe("/api/orgs/2/consultant/opportunities?page=0&size=10&state=APPLIED");
  });
  it("fetchOne maps 404 to NOT_FOUND", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok(raw())).mockResolvedValueOnce(ok({}, 404)));
    expect((await fetchOne(2, 7)).kind).toBe("OK");
    expect((await fetchOne(2, 7)).kind).toBe("NOT_FOUND");
  });
});

describe("actions", () => {
  const call = (f: ReturnType<typeof vi.fn>, n = 0) => ({ url: String(f.mock.calls[n][0]), init: f.mock.calls[n][1] as RequestInit, headers: new Headers((f.mock.calls[n][1] as RequestInit).headers), body: JSON.parse(String((f.mock.calls[n][1] as RequestInit).body)) });

  it("posts each action to its own route with an idempotency key and the optional If-Match", async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(ok(raw({ state: "VIEWED", version: 4 }))));
    vi.stubGlobal("fetch", f);
    const r = await viewed(2, 7, { version: 3 });
    expect(r).toMatchObject({ kind: "OK", item: { state: "VIEWED", version: 4 } });
    let c = call(f);
    expect(c.url).toBe("/api/orgs/2/consultant/opportunities/7/viewed");
    expect(c.init.method).toBe("POST");
    expect(c.headers.get("if-match")).toBe("3");
    expect(c.headers.get("idempotency-key")).toBeTruthy();

    await interest(2, 7);
    c = call(f, 1);
    expect(c.url.endsWith("/7/interest")).toBe(true);
    expect(c.headers.get("if-match")).toBeNull();

    await decline(2, 7, "RATE", "  too low ");
    c = call(f, 2);
    expect(c.url.endsWith("/7/decline")).toBe(true);
    expect(c.body).toEqual({ reason: "RATE", note: "too low" });
    await decline(2, 7, "OTHER", " ");
    expect(call(f, 3).body).toEqual({ reason: "OTHER" });

    await requestInfo(2, 7, " Is it remote? ");
    expect(call(f, 4).url.endsWith("/7/request-info")).toBe(true);
    expect(call(f, 4).body).toEqual({ question: "Is it remote?" });

    await applied(2, 7);
    expect(call(f, 5).url.endsWith("/7/applied")).toBe(true);
    expect(call(f, 5).body).toEqual({});
    await applied(2, 7, 55);
    expect(call(f, 6).body).toEqual({ applicationId: 55 });

    await link(2, 7, 55);
    expect(call(f, 7).url.endsWith("/7/link")).toBe(true);
    expect(call(f, 7).body).toEqual({ applicationId: 55 });
    await unlink(2, 7);
    expect(call(f, 8).url.endsWith("/7/unlink")).toBe(true);
  });

  it("uses a given idempotency key", async () => {
    const f = vi.fn().mockResolvedValue(ok(raw()));
    vi.stubGlobal("fetch", f);
    await interest(2, 7, { idempotencyKey: "abc" });
    expect(call(f).headers.get("idempotency-key")).toBe("abc");
  });

  it("maps 409 VERSION_CONFLICT, 404, 422 SENSITIVE_CONTENT, 400 and network errors to typed results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(ok({ error: "Changed", code: "VERSION_CONFLICT" }, 409))
        .mockResolvedValueOnce(ok({ error: "Nope", code: "JOB_NOT_OPEN" }, 409))
        .mockResolvedValueOnce(ok({ error: "Not found." }, 404))
        .mockResolvedValueOnce(ok({ error: "Sensitive", code: "SENSITIVE_CONTENT" }, 422))
        .mockResolvedValueOnce(ok({ error: "Too long" }, 400))
        .mockResolvedValueOnce(ok({ error: "Boom" }, 500))
        .mockRejectedValueOnce(new Error("down")),
    );
    expect(await interest(2, 7)).toEqual({ kind: "VERSION_CONFLICT" });
    expect(await interest(2, 7)).toEqual({ kind: "INVALID", error: "Nope" });
    expect(await interest(2, 7)).toEqual({ kind: "NOT_FOUND" });
    expect(await requestInfo(2, 7, "x")).toEqual({ kind: "SENSITIVE", error: "Sensitive" });
    expect(await requestInfo(2, 7, "x")).toEqual({ kind: "INVALID", error: "Too long" });
    expect(await interest(2, 7)).toEqual({ kind: "FAILED", error: "Boom" });
    expect((await interest(2, 7)).kind).toBe("FAILED");
  });

  it("an OK answer without a row keeps item null (the page reloads instead of guessing)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({})));
    expect(await unlink(2, 7)).toEqual({ kind: "OK", item: null });
  });
});

describe("applyOptimistic", () => {
  const base = parseOpportunity(raw())!;
  it("moves the state and recomputes the allowed actions", () => {
    expect(applyOptimistic(base, { action: "INTEREST" })).toMatchObject({ state: "INTERESTED", allowedActions: predictAllowed("INTERESTED", false) });
    expect(applyOptimistic(base, { action: "DECLINE" }).allowedActions).toEqual(["INTEREST"]);
    expect(applyOptimistic(base, { action: "REQUEST_INFO", question: " q " })).toMatchObject({ state: "NEEDS_INFO", infoRequest: "q" });
    const applied = applyOptimistic(base, { action: "APPLIED" }, new Date("2026-10-13T10:00:00Z"));
    expect(applied).toMatchObject({ state: "APPLIED", appliedAt: "2026-10-13T10:00:00.000Z", allowedActions: ["LINK"] });
    expect(applyOptimistic(applied, { action: "LINK", applicationId: 5 })).toMatchObject({ linkedApplicationId: 5, allowedActions: ["UNLINK"] });
    expect(applyOptimistic(applied, { action: "UNLINK" }).linkedApplicationId).toBeNull();
  });
  it("viewed only moves a New row", () => {
    expect(applyOptimistic(base, { action: "VIEWED" }).state).toBe("VIEWED");
    expect(applyOptimistic({ ...base, state: "INTERESTED" }, { action: "VIEWED" }).state).toBe("INTERESTED");
  });
  it("a closed row allows nothing", () => {
    expect(predictAllowed("CLOSED", false)).toEqual([]);
  });
});
