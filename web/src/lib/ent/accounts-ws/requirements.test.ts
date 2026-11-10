import { afterEach, describe, expect, it, vi } from "vitest";
import { ageText, DEFAULT_QUERY, daysUntil, dueText, errorSentence, existingId, hasFilters, initialsOf, listParams, rateText, requirementsApi, showingText } from "./requirements";

describe("requirements helpers", () => {
  it("writes a rate range as business data, or nothing", () => {
    expect(rateText({ min: 70, max: 90, unit: "HOUR", currency: "USD" })).toBe("$70 - $90 / hour");
    expect(rateText({ min: 140000, max: null, unit: "YEAR", currency: "USD" })).toBe("$140,000 / year");
    expect(rateText({ min: null, max: null, unit: null, currency: "USD" })).toBe("");
    expect(rateText(null)).toBe("");
  });

  it("writes dates without a time zone shift", () => {
    expect(dueText("2026-12-31")).toBe("Dec 31, 2026");
    expect(dueText(null)).toBe("");
    expect(dueText("not a date")).toBe("");
    expect(daysUntil("2026-10-20", new Date(Date.UTC(2026, 9, 16, 23, 30)))).toBe(4);
    expect(daysUntil("2026-10-10", new Date(Date.UTC(2026, 9, 16)))).toBe(-6);
    expect(daysUntil(null)).toBeNull();
    expect(ageText(0)).toBe("Today");
    expect(ageText(1)).toBe("1 day");
    expect(ageText(20)).toBe("20 days");
  });

  it("builds the list call from the filters; a one letter search is not sent", () => {
    expect(listParams(DEFAULT_QUERY).toString()).toBe("sort=posted&dir=desc&page=0&size=10");
    const p = listParams({ ...DEFAULT_QUERY, q: " ml ", status: "OPEN", priority: "HIGH", clientId: "5", assigned: "NONE", aging: true, page: 2 });
    expect(p.get("q")).toBe("ml");
    expect(p.get("status")).toBe("OPEN");
    expect(p.get("assigned")).toBe("NONE");
    expect(p.get("aging")).toBe("true");
    expect(p.get("page")).toBe("2");
    expect(listParams({ ...DEFAULT_QUERY, q: "m" }).has("q")).toBe(false);
    expect(hasFilters(DEFAULT_QUERY)).toBe(false);
    expect(hasFilters({ ...DEFAULT_QUERY, aging: true })).toBe(true);
    expect(hasFilters({ ...DEFAULT_QUERY, q: "m" })).toBe(false);
  });

  it("words the counts and the refusals", () => {
    expect(showingText(0, 0, 10, 0)).toBe("0 requirements");
    expect(showingText(1, 0, 10, 1)).toBe("1–1 of 1 requirement");
    expect(showingText(24, 1, 10, 10)).toBe("11–20 of 24 requirements");
    expect(errorSentence({ status: 409, code: "REQUIREMENT_EXISTS", message: "x" })).toContain("already has an open requirement");
    expect(errorSentence({ status: 409, code: "RESUME_NOT_APPROVED", message: "x" })).toContain("approved resume");
    expect(errorSentence({ status: 412, message: "x" })).toContain("Someone else changed");
    expect(errorSentence({ status: 404, message: "x" })).toContain("no longer in your view");
    expect(errorSentence({ status: 422, message: "Plain words" })).toBe("Plain words");
    expect(existingId({ code: "REQUIREMENT_EXISTS", extra: { existingId: 7 } })).toBe(7);
    expect(existingId({ code: "OTHER", extra: { existingId: 7 } })).toBeNull();
    expect(initialsOf("Jessica Davis")).toBe("JD");
    expect(initialsOf("")).toBe("?");
  });
});

describe("requirementsApi", () => {
  afterEach(() => vi.unstubAllGlobals());
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("sends the intake with its Idempotency-Key and the edit with If-Match", async () => {
    const fetchMock = vi.fn(async () => json(201, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await requirementsApi.create(2, { title: "Dev", clientId: 1 }, "key-1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orgs/2/requirements");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("key-1");
    await requirementsApi.patch(2, 7, { priority: "HIGH" }, '"3"');
    const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url2).toBe("/api/orgs/2/requirements/7");
    expect((init2.headers as Record<string, string>)["if-match"]).toBe('"3"');
    await requirementsApi.assign(2, 7, 9);
    const [url3, init3] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(url3).toBe("/api/orgs/2/requirements/7/assignments");
    expect(init3.body).toBe('{"consultantId":9}');
  });

  it("keeps the code and the extra fields of a refusal, and survives a dead network", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(409, { code: "REQUIREMENT_EXISTS", error: "dup", existingId: 4 })));
    const r = await requirementsApi.create(2, { title: "Dev", clientId: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.code).toBe("REQUIREMENT_EXISTS");
      expect(r.extra.existingId).toBe(4);
    }
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const down = await requirementsApi.list(2, DEFAULT_QUERY);
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.status).toBe(0);
  });
});
