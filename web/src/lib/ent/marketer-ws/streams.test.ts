import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agoText, configureStream, createStream, dayLabel, fetchStreams, keywordSummary, logoForStream, parseStreams, pauseStream, resumeStream, scheduleLabel, streamsUrl, updateRule,
} from "./streams";

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("parseStreams", () => {
  it("is lenient: junk becomes empty sections, a non-object is null", () => {
    expect(parseStreams(null)).toBeNull();
    expect(parseStreams([])).toBeNull();
    const v = parseStreams({ kpis: "x", streams: 3, filters: null, activity: [1, "a"], chart: [], alerts: {}, rules: [{ key: "NOPE" }] });
    expect(v).not.toBeNull();
    expect(v!.kpis).toEqual([]);
    expect(v!.streams.items).toEqual([]);
    expect(v!.filters).toEqual({ sources: [], statuses: [], clients: [] });
    expect(v!.activity).toEqual([]);
    expect(v!.chart).toEqual({ days: [], series: [] });
    expect(v!.alerts).toEqual([]);
    expect(v!.rules).toEqual([]);
  });

  it("keeps real rows, defaults the unknown and drops a delta that is not a number", () => {
    const v = parseStreams({
      kpis: [{ key: "syncHealth", value: 100, deltaPct: null, sparkline: [1, "x", 3] }, { key: "bogus", value: 1 }],
      streams: { items: [{ id: 1, sourceLabel: "Dice", status: "WEIRD", keywords: ["Java", 4, " "], newOpenings: 48, openingsDeltaPct: "5" }], total: 1, page: 0, size: 25 },
      chart: { days: ["2026-11-03", "2026-11-04"], series: [{ key: "s1", label: "Dice", values: [5] }] },
      alerts: [{ id: 1, severity: "ERROR", title: "Down" }, { id: 2, severity: "other", title: "Slow", detail: "x" }],
      rules: [{ key: "AUTO_PUBLISH", enabled: true, value: "Sync" }],
    })!;
    expect(v.kpis).toEqual([{ key: "syncHealth", value: 100, deltaPct: null, sparkline: [1, 3] }]);
    const s = v.streams.items[0];
    expect(s.status).toBe("ACTIVE");
    expect(s.active).toBe(true);
    expect(s.keywords).toEqual(["Java"]);
    expect(s.openingsDeltaPct).toBeNull();
    expect(s.lastSyncAt).toBeNull();
    expect(v.chart.series[0].values).toEqual([5, 0]); // one value per day, padded
    expect(v.alerts.map((a) => a.severity)).toEqual(["ERROR", "WARNING"]);
    expect(v.rules).toEqual([{ key: "AUTO_PUBLISH", enabled: true, value: "Sync" }]);
  });
});

describe("display helpers", () => {
  it("scheduleLabel", () => {
    expect(scheduleLabel(30)).toBe("Every 30 mins");
    expect(scheduleLabel(60)).toBe("Every 1 hour");
    expect(scheduleLabel(120)).toBe("Every 2 hours");
    expect(scheduleLabel(90)).toBe("Every 90 mins");
  });

  it("keywordSummary shows what fits and counts the rest, like the board's rows", () => {
    expect(keywordSummary(["Java", "AWS", "Cloud", "Data Engineer", "Spring Boot", "Kubernetes", "React"])).toEqual({ shown: ["Java", "AWS", "Cloud", "Data Engineer"], more: 3 });
    expect(keywordSummary(["Data Analyst", "Business Analyst", "SQL", "Tableau"])).toEqual({ shown: ["Data Analyst", "Business Analyst"], more: 2 });
    expect(keywordSummary(["Java Developer", "DevOps", "Azure", "AWS", "Terraform", "Docker", "Kubernetes"])).toEqual({ shown: ["Java Developer", "DevOps", "Azure"], more: 4 });
    expect(keywordSummary(["Project Manager", "IT Consultant", "PMP", "Agile", "Scrum"])).toEqual({ shown: ["Project Manager", "IT Consultant"], more: 3 });
    expect(keywordSummary(["Multiple Clients (Open Roles)"])).toEqual({ shown: ["Multiple Clients (Open Roles)"], more: 0 });
    expect(keywordSummary([])).toEqual({ shown: [], more: 0 });
  });

  it("agoText", () => {
    const now = Date.parse("2026-11-04T12:00:00Z");
    expect(agoText(null, now)).toBe("Never");
    expect(agoText("2026-11-04T11:50:00Z", now)).toBe("10 mins ago");
    expect(agoText("2026-11-04T11:00:00Z", now)).toBe("1 hour ago");
    expect(agoText("2026-11-04T10:00:00Z", now)).toBe("2 hours ago");
    expect(agoText("2026-11-02T12:00:00Z", now)).toBe("2 days ago");
  });

  it("dayLabel does not slip a day and logos are keyed by source", () => {
    expect(dayLabel("2026-04-21")).toBe("Apr 21");
    expect(logoForStream("LinkedIn Jobs")).toBe("/ent/marketer/streams/logo-linkedin.png");
    expect(logoForStream("Vendor Feed")).toBe("/ent/marketer/streams/logo-vendor.png");
    expect(logoForStream("Monster")).toBeNull();
  });
});

describe("fetch + writes", () => {
  it("builds the query string from the filters only", () => {
    expect(streamsUrl(2)).toBe("/api/orgs/2/mkt/streams");
    expect(streamsUrl(2, { q: " dice ", status: "ERROR", showInactive: true, days: 14, source: "Indeed", client: "ACME" })).toBe("/api/orgs/2/mkt/streams?q=dice&source=Indeed&status=ERROR&client=ACME&showInactive=true&days=14");
    expect(streamsUrl(2, { days: 7 })).toBe("/api/orgs/2/mkt/streams");
  });

  it("maps 403/404 to DENIED, other failures to FAILED, malformed to FAILED", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect((await fetchStreams(2)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(500, {}));
    expect((await fetchStreams(2)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", reply(200, [1]));
    expect((await fetchStreams(2)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect((await fetchStreams(2)).kind).toBe("FAILED");
  });

  it("every write goes to the BFF stream routes and returns the API's row", async () => {
    const f = reply(200, { id: 7, sourceLabel: "Dice", status: "PAUSED", active: false, syncEveryMinutes: 120 });
    vi.stubGlobal("fetch", f);
    const r = await pauseStream(2, 7);
    expect(r.ok && r.value.status).toBe("PAUSED");
    expect(f).toHaveBeenLastCalledWith("/api/orgs/2/mkt/streams/7/pause", expect.objectContaining({ method: "POST" }));
    await resumeStream(2, 7);
    expect(f).toHaveBeenLastCalledWith("/api/orgs/2/mkt/streams/7/resume", expect.objectContaining({ method: "POST" }));
    await configureStream(2, 7, { syncEveryMinutes: 60 });
    expect(f).toHaveBeenLastCalledWith("/api/orgs/2/mkt/streams/7", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ syncEveryMinutes: 60 }) }));
    await createStream(2, { sourceLabel: "Monster" });
    expect(f).toHaveBeenLastCalledWith("/api/orgs/2/mkt/streams", expect.objectContaining({ method: "POST" }));
    await updateRule(2, "AUTO_PUBLISH", { enabled: false });
    expect(f).toHaveBeenLastCalledWith("/api/orgs/2/mkt/streams/rules/AUTO_PUBLISH", expect.objectContaining({ method: "PATCH" }));
    for (const call of f.mock.calls as unknown as [string][]) expect(call[0]).not.toMatch(/submit/i); // E1: nothing submits
  });

  it("a failed write carries the API's message; a 404 is flagged as denied", async () => {
    vi.stubGlobal("fetch", reply(400, { error: "a stream with this name already exists" }));
    const bad = await createStream(2, { sourceLabel: "Dice" });
    expect(bad).toEqual({ ok: false, denied: false, error: "a stream with this name already exists" });
    vi.stubGlobal("fetch", reply(404, {}));
    const gone = await pauseStream(2, 1);
    expect(!gone.ok && gone.denied).toBe(true);
  });
});
