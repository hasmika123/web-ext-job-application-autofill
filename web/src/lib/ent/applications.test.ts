import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appliedText,
  applicationsApi,
  DEFAULT_VIEW,
  errorSentence,
  eventTitle,
  filtersActive,
  filterParams,
  formatDay,
  formatShort,
  listParams,
  moveOptions,
  nextActionText,
  nextSort,
  nextStagesOf,
  pageCount,
  parseView,
  showingText,
  viewParams,
  type EventItem,
  type ViewState,
} from "./applications";

const view = (patch: Partial<ViewState> = {}): ViewState => ({ ...DEFAULT_VIEW, ...patch });

describe("the URL state of the page", () => {
  it("an empty query is the default view and a default view has an empty query", () => {
    expect(parseView(new URLSearchParams(""))).toEqual(DEFAULT_VIEW);
    expect(viewParams(DEFAULT_VIEW).toString()).toBe("");
  });

  it("round-trips every part of a view (the page number is 1-based in the link)", () => {
    const v = view({ tab: "pipeline", q: "frontend", stage: "OFFER", job: "Data Analyst", client: "4", marketer: "9", from: "2026-01-01", to: "2026-02-01", sort: { key: "client", dir: "desc" }, page: 2, size: 25, selected: 77, detailTab: "notes" });
    const qs = viewParams(v).toString();
    expect(qs).toContain("page=3");
    expect(qs).toContain("app=77");
    expect(parseView(new URLSearchParams(qs))).toEqual(v);
  });

  it("falls back to the default for anything hand-edited or malformed", () => {
    const v = parseView(new URLSearchParams("tab=nope&stage=BOGUS&client=abc&from=yesterday&sort=evil,up&page=-4&size=999&app=x&dtab=zzz"));
    expect(v).toEqual(DEFAULT_VIEW);
  });

  it("keeps the drawer tab only while an application is open", () => {
    expect(viewParams(view({ selected: null, detailTab: "activity" })).toString()).toBe("");
    expect(viewParams(view({ selected: 5, detailTab: "activity" })).toString()).toBe("app=5&dtab=activity");
  });

  it("sends the API only the filters that count (a one-letter search waits for a second letter)", () => {
    expect(filterParams(view({ q: "a" }), true).toString()).toBe("");
    const p = listParams(view({ q: "  ab ", stage: "OFFER", job: "QA", client: "2", marketer: "3", from: "2026-01-01", to: "2026-03-01", page: 1, size: 25 }));
    expect(p.get("q")).toBe("ab");
    expect(p.get("stage")).toBe("OFFER");
    expect(p.get("jobTitle")).toBe("QA");
    expect(p.get("clientId")).toBe("2");
    expect(p.get("marketerId")).toBe("3");
    expect(p.get("from")).toBe("2026-01-01");
    expect(p.get("sort")).toBe("applied,desc");
    expect(p.get("page")).toBe("1");
    expect(p.get("size")).toBe("25");
    expect(filterParams(view({ stage: "OFFER" }), false).has("stage")).toBe(false); // the pipeline has a column per stage
  });

  it("knows when something is filtered", () => {
    expect(filtersActive(DEFAULT_VIEW)).toBe(false);
    expect(filtersActive(view({ q: "a" }))).toBe(false);
    expect(filtersActive(view({ q: "ab" }))).toBe(true);
    expect(filtersActive(view({ to: "2026-01-01" }))).toBe(true);
  });
});

describe("sorting, paging and text", () => {
  it("a header click flips the same column and starts a new one ascending (the applied date newest first)", () => {
    expect(nextSort({ key: "job", dir: "asc" }, "job")).toEqual({ key: "job", dir: "desc" });
    expect(nextSort({ key: "job", dir: "desc" }, "client")).toEqual({ key: "client", dir: "asc" });
    expect(nextSort({ key: "job", dir: "asc" }, "applied")).toEqual({ key: "applied", dir: "desc" });
  });

  it("counts pages and words the range like the board", () => {
    expect(pageCount(324, 10)).toBe(33);
    expect(pageCount(0, 10)).toBe(1);
    expect(showingText(324, 0, 10, 10)).toBe("1-10 of 324 applications");
    expect(showingText(324, 32, 10, 4)).toBe("321-324 of 324 applications");
    expect(showingText(1, 0, 10, 1)).toBe("1-1 of 1 application");
    expect(showingText(0, 0, 10, 0)).toBe("No applications");
  });

  it("formats dates in UTC so the day never shifts", () => {
    expect(formatDay("2024-01-12")).toBe("Jan 12, 2024");
    expect(formatDay("2024-01-12T23:30:00Z")).toBe("Jan 12, 2024");
    expect(formatShort("2024-01-12T09:07:00Z")).toBe("Jan 12");
    expect(formatDay(null)).toBe("");
    expect(formatDay("not a date")).toBe("");
  });

  it("says how long ago it was applied", () => {
    const now = Date.parse("2024-02-02T12:00:00Z");
    expect(appliedText("2024-02-02", now)).toBe("Feb 2, 2024 (today)");
    expect(appliedText("2024-01-31", now)).toBe("Jan 31, 2024 (2 days ago)");
    expect(appliedText("2024-01-12", now)).toBe("Jan 12, 2024 (3 weeks ago)");
    expect(appliedText("2023-10-02", now)).toBe("Oct 2, 2023 (4 months ago)");
    expect(appliedText("2021-02-01", now)).toBe("Feb 1, 2021 (3 years ago)");
  });

  it("shows N/A for a closed application's next action and a dash-less empty string for none", () => {
    expect(nextActionText({ stage: "CLOSED", nextAction: "x" })).toBe("N/A");
    expect(nextActionText({ stage: "OFFER", nextAction: null })).toBe("");
    expect(nextActionText({ stage: "OFFER", nextAction: "Prepare offer" })).toBe("Prepare offer");
  });
});

describe("the stage machine of the menus", () => {
  it("offers only later stages, and nothing out of Closed", () => {
    expect(nextStagesOf("ASSIGNED")).toEqual(["SUBMITTED", "UNDER_REVIEW", "INTERVIEWING", "OFFER", "CLOSED"]);
    expect(nextStagesOf("OFFER")).toEqual(["CLOSED"]);
    expect(nextStagesOf("CLOSED")).toEqual([]);
  });

  it("words every move as a record and splits closing into one entry per reason", () => {
    const o = moveOptions(["SUBMITTED", "CLOSED"]);
    expect(o[0]).toEqual({ key: "SUBMITTED", label: "Record as Submitted", stage: "SUBMITTED" });
    expect(o.slice(1).map((x) => x.label)).toEqual(["Close: Hired", "Close: Rejected", "Close: Withdrawn", "Close: No response"]);
    expect(o[1].closedReason).toBe("HIRED");
  });

  it("titles history events in plain words", () => {
    const e = (type: string, toStage: string | null): EventItem => ({ id: 1, type, fromStage: null, toStage, actor: null, detail: null, at: "2026-01-01T00:00:00Z" });
    expect(eventTitle(e("CREATED", "ASSIGNED"))).toBe("Application added");
    expect(eventTitle(e("STAGE_CHANGE", "UNDER_REVIEW"))).toBe("Recorded as Under Review");
    expect(eventTitle(e("STAGE_REVERT", "ASSIGNED"))).toBe("Moved back to Assigned");
    expect(eventTitle(e("NOTE", null))).toBe("Note added");
    expect(eventTitle(e("UPDATE", null))).toBe("Details updated");
  });
});

describe("error sentences", () => {
  it("prefers friendly wording for known codes and says 'no longer in your view' for a 404", () => {
    expect(errorSentence({ status: 422, code: "INVALID_TRANSITION", message: "raw" })).toContain("isn't allowed");
    expect(errorSentence({ status: 409, code: "DUPLICATE_APPLICATION", message: "raw" })).toContain("already has an application");
    expect(errorSentence({ status: 404, message: "Not found" })).toBe("This application is no longer in your view.");
    expect(errorSentence({ status: 500, message: "Boom" })).toBe("Boom");
    expect(errorSentence({ status: 0, message: "offline" })).toBe("offline");
  });
});

describe("the client", () => {
  let calls: { url: string; init?: RequestInit }[];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ ok: true });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("builds the list, pipeline and counts urls under the BFF", async () => {
    await applicationsApi.list(2, view({ stage: "OFFER" }));
    await applicationsApi.pipeline(2, view({ stage: "OFFER", q: "ab" }));
    await applicationsApi.counts(2);
    expect(calls[0].url).toBe("/api/orgs/2/applications?stage=OFFER&sort=applied%2Cdesc&page=0&size=10");
    expect(calls[1].url).toBe("/api/orgs/2/applications/pipeline?q=ab");
    expect(calls[2].url).toBe("/api/orgs/2/applications/counts");
  });

  it("sends a stage move with an idempotency key and the undo as the event id", async () => {
    await applicationsApi.move(2, 7, "CLOSED", "HIRED");
    await applicationsApi.undo(2, 7, 99);
    const [move, undo] = calls;
    expect(move.url).toBe("/api/orgs/2/applications/7/stage");
    expect(JSON.parse(String(move.init?.body))).toEqual({ stage: "CLOSED", closedReason: "HIRED" });
    expect((move.init?.headers as Record<string, string>)["idempotency-key"]).toMatch(/\S{8,}/);
    expect(JSON.parse(String(undo.init?.body))).toEqual({ undoEventId: 99 });
  });

  it("turns a refusal into { ok: false } with the code and the server's sentence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Nope", code: "DUPLICATE_APPLICATION" }, { status: 409 })));
    const r = await applicationsApi.create(2, { requirementId: 1, consultantId: 2 });
    expect(r).toMatchObject({ ok: false, status: 409, code: "DUPLICATE_APPLICATION", message: "Nope" });
  });

  it("answers a dropped connection as status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    expect(await applicationsApi.detail(2, 1)).toMatchObject({ ok: false, status: 0 });
  });
});
