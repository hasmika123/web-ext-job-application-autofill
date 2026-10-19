// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/performance" }));
// the shell draws the header from what the page declares; here it is drawn in place so the subtitle can be asserted
vi.mock("@/components/ent/shell/ShellContext", () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
}));

import PerformancePage from "./PerformancePage";

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3600e3;
const kpi = (key: string, value: number | null, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [1, 2, 2, 3, 4, 5, 5, 6] });
const WEEKS = ["2024-08-26", "2024-09-02", "2024-09-09", "2024-09-16", "2024-09-23", "2024-09-30", "2024-10-07", "2024-10-14"];
const day = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const topRow = (rank: number, id: number, name: string, s: number, i: number, o: number, p: number, match: number | null, hours: number | null) => ({
  rank, id, name, avatarUrl: null, submissions: s, interviews: i, offers: o, placements: p, matchRatePct: match, lastActivityAt: hours === null ? null : iso(hours * H), trend: [1, 2, 2, 3, 3, 4, 4, 5],
});

const fixture = (over: Record<string, unknown> = {}) => ({
  generatedAt: iso(0),
  kpis: [kpi("assignedConsultants", 28, 12), kpi("activeSubmissions", 142, 18), kpi("interviewRate", 32, 5), kpi("offerRate", 18, 6), kpi("placements", 8, 33), kpi("followupCompletion", 86, 11)],
  weekly: { period: "8w", weeks: WEEKS.map((start, i) => ({ start, end: day(start, 6), submissions: 40 + i * 4, interviews: 20 + i, offers: 8 + i })) },
  trend: {
    period: "3m",
    points: [["2024-08-04", 70, 18, 10], ["2024-09-01", 102, 31, 18], ["2024-09-29", 130, 42, 23], ["2024-10-20", 142, 46, 26]].map(([date, submissions, interviews, offers]) => ({ date, submissions, interviews, offers })),
  },
  funnel: { period: "3m", total: 142, stages: [{ key: "submissions", label: "Submissions", count: 142, pct: 100 }, { key: "interviews", label: "Interviews", count: 46, pct: 32 }, { key: "offers", label: "Offers", count: 26, pct: 18 }, { key: "placements", label: "Placements", count: 12, pct: 8 }] },
  readiness: { total: 28, buckets: [{ key: "ready", label: "Ready to Submit", count: 15, pct: 54 }, { key: "progress", label: "In Progress", count: 8, pct: 29 }, { key: "attention", label: "Needs Attention", count: 3, pct: 11 }, { key: "inactive", label: "Inactive", count: 2, pct: 7 }] },
  streams: {
    period: "3m",
    rows: [
      { clientId: 1, client: "TechCorp", submissions: 48, interviews: 18, offers: 10, placements: 5, offerRatePct: 21, good: true },
      { clientId: 2, client: "Global Bank", submissions: 36, interviews: 12, offers: 7, placements: 3, offerRatePct: 19, good: true },
      { clientId: 3, client: "HealthPlus", submissions: 28, interviews: 8, offers: 4, placements: 2, offerRatePct: 14, good: false },
      { clientId: 4, client: "CloudScale", submissions: 20, interviews: 6, offers: 3, placements: 1, offerRatePct: 15, good: false },
      { clientId: 5, client: "ACME Internal", submissions: 10, interviews: 2, offers: 2, placements: 1, offerRatePct: 20, good: true },
    ],
  },
  top: [topRow(1, 1, "Alex Morgan", 28, 12, 7, 4, 86, 2), topRow(2, 2, "Priya Sharma", 24, 10, 5, 3, 82, 5), topRow(3, 3, "Michael Park", 22, 8, 4, 2, 78, 24), topRow(4, 4, "Emily Lawson", 18, 6, 4, 2, 76, 4), topRow(5, 5, "David Kim", 16, 5, 3, 1, 71, 24)],
  benchmarks: { period: "month", rows: [{ key: "interviewRate", label: "Interview Rate", value: 32, deltaPct: 5, industry: 25 }, { key: "offerRate", label: "Offer Rate", value: 18, deltaPct: 6, industry: 12 }, { key: "placementRate", label: "Placement Rate", value: 8, deltaPct: 3, industry: 5 }] },
  goals: {
    period: "month",
    canEdit: true,
    rows: [
      { key: "submissions", label: "Submissions", actual: 142, target: 200, pct: 71 },
      { key: "interviews", label: "Interviews", actual: 46, target: 60, pct: 77 },
      { key: "offers", label: "Offers", actual: 26, target: 40, pct: 65 },
      { key: "placements", label: "Placements", actual: 8, target: 15, pct: 53 },
    ],
  },
  actions: [
    { key: "quiet", text: "Follow up with 12 consultants", detail: "with no recent activity", page: "followups" },
    { key: "interviewing", text: "Focus on 8 high-potential candidates", detail: "in interview stage", page: "interviews" },
    { key: "matches", text: "Explore 15 new job matches", detail: "for top performers", page: "matches" },
    { key: "offerRate", text: "Improve offer rate for TechCorp opportunities", detail: null, page: "submissions" },
  ],
  ...over,
});

const empty = () =>
  fixture({
    kpis: [kpi("assignedConsultants", null, null), kpi("activeSubmissions", null, null), kpi("interviewRate", null, null), kpi("offerRate", null, null), kpi("placements", 0, null), kpi("followupCompletion", null, null)],
    weekly: { period: "8w", weeks: WEEKS.map((start) => ({ start, end: day(start, 6), submissions: 0, interviews: 0, offers: 0 })) },
    trend: { period: "3m", points: [] },
    funnel: { period: "3m", total: 0, stages: [] },
    readiness: null,
    streams: { period: "3m", rows: [] },
    top: [],
    benchmarks: { period: "month", rows: [{ key: "interviewRate", label: "Interview Rate", value: null, deltaPct: null, industry: null }] },
    goals: { period: "month", canEdit: true, rows: [] },
    actions: [],
  });

const HREFS = { talent: "/w/marketing/talent", followups: "/w/marketing/followups", interviews: "/w/marketing/interviews", matches: "/w/marketing/matches", submissions: "/w/marketing/submissions" };
const mount = () => render(<PerformancePage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} />);
const reply = (status: number, body: unknown) => vi.fn(async (_url?: unknown, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const ready = () => screen.findByText("Alex Morgan");
const card = (name: string) => document.querySelector(`[data-perf-card="${name}"]`) as HTMLElement;
const tile = (key: string) => document.querySelector(`[data-stat-tile="${key}"]`) as HTMLElement;

beforeEach(() => vi.stubGlobal("fetch", reply(200, fixture())));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PerformancePage", () => {
  it("draws the plan's subtitle and four tiles with value and a plain-text delta (no arrow glyph, no 'Up')", async () => {
    mount();
    await ready();
    expect(screen.getByText("How your pipeline is converting.")).toBeTruthy();
    for (const [key, title, value, delta] of [
      ["activeSubmissions", "Active submissions", "142", "+18%"],
      ["interviewRate", "Interview rate", "32%", "+5%"],
      ["offerRate", "Offer rate", "18%", "+6%"],
      ["placements", "Placements this month", "8", "+33%"],
    ]) {
      await waitFor(() => expect(tile(key)).toBeTruthy());
      expect(within(tile(key)).getByText(title)).toBeTruthy();
      expect(within(tile(key)).getByText(value)).toBeTruthy();
      const d = tile(key).querySelector("[data-delta]") as HTMLElement;
      expect(d.textContent).toBe(`${delta} vs last month`);
      expect(tile(key).querySelector("[data-delta-chip]")).toBeNull();
      expect(tile(key).textContent).not.toMatch(/\bUp\b|[↑↓▲▼]/);
    }
    expect(document.querySelectorAll("[data-stat-tile]").length).toBe(4);
    expect(tile("assignedConsultants")).toBeNull();
    expect(tile("followupCompletion")).toBeNull();
  });

  it("writes a fall as a minus sign", async () => {
    vi.stubGlobal("fetch", reply(200, fixture({ kpis: [kpi("activeSubmissions", 10, -7), kpi("interviewRate", 32, 0), kpi("offerRate", 18, null), kpi("placements", 8, 33)] })));
    mount();
    await ready();
    expect((tile("activeSubmissions").querySelector("[data-delta]") as HTMLElement).textContent).toBe("-7% vs last month");
    expect((tile("interviewRate").querySelector("[data-delta]") as HTMLElement).textContent).toBe("0% vs last month");
    expect(tile("offerRate").querySelector("[data-delta]")).toBeNull();
  });

  it("draws Submissions by Week: info, the period select, the legend, three bars per week and two-line week labels", async () => {
    mount();
    await ready();
    const c = card("weekly");
    expect(within(c).getByRole("heading", { name: "Submissions by week" })).toBeTruthy();
    expect(within(c).getByRole("button", { name: /About Submissions by week/ })).toBeTruthy();
    expect(within(c).getByRole("button", { name: "Weeks period" })).toBeTruthy();
    for (const s of ["Total submissions", "Interviews", "Offers"]) expect(within(c).getAllByText(s).length).toBeGreaterThan(0);
    expect(c.querySelectorAll("[data-bar]").length).toBe(24);
    const first = c.querySelector('[data-week-label="0"]') as HTMLElement;
    expect(first.children[0].textContent).toBe("Aug 26");
    expect(first.children[1].textContent).toBe("Sep 1");
  });

  it("draws Interviews vs Offers with the end bubbles 142, 46 and 26 and the month labels", async () => {
    mount();
    await ready();
    const c = card("trend");
    expect(within(c).getByRole("heading", { name: "Interviews vs offers" })).toBeTruthy();
    expect(c.querySelector('[data-end-bubble="submissions"]')?.textContent).toBe("142");
    expect(c.querySelector('[data-end-bubble="interviews"]')?.textContent).toBe("46");
    expect(c.querySelector('[data-end-bubble="offers"]')?.textContent).toBe("26");
    for (const m of ["Aug", "Sep", "Oct"]) expect(within(c).getAllByText(m).length).toBeGreaterThan(0);
    expect(within(c).getByText("Last 3 months")).toBeTruthy();
  });

  it("draws the Placement funnel 142/46/26/12 with the legend percents", async () => {
    mount();
    await ready();
    const c = card("funnel");
    expect(within(c).getByText("Placement funnel")).toBeTruthy();
    expect(c.querySelectorAll("[data-funnel-stage]").length).toBe(4);
    const text = c.textContent ?? "";
    for (const n of ["142", "46", "26", "12"]) expect(text).toContain(n);
    expect((c.querySelector('[data-funnel-row="interviews"]') as HTMLElement).textContent).toContain("32%");
    expect((c.querySelector('[data-funnel-row="placements"]') as HTMLElement).textContent).toContain("8%");
    expect((c.querySelector('[data-funnel-row="submissions"]') as HTMLElement).textContent).toContain("100%");
  });

  it("draws By client (was Job stream effectiveness): the columns, a row per client and green / red Offer rate chips", async () => {
    mount();
    await ready();
    const c = card("streams");
    expect(within(c).getByText("By client")).toBeTruthy();
    expect(within(c).queryByText("Job Stream Effectiveness")).toBeNull();
    for (const col of ["Client", "Submissions", "Interviews", "Offers", "Placements", "Offer rate"]) expect(within(c).getAllByText(col).length).toBeGreaterThan(0);
    const tech = c.querySelector('[data-stream-row="TechCorp"]') as HTMLElement;
    expect(tech.textContent).toContain("48");
    expect(within(tech).getByText("21%").className).toContain("v2-green");
    expect(within(c.querySelector('[data-stream-row="HealthPlus"]') as HTMLElement).getByText("14%").className).toContain("v2-pink");
    expect(within(c.querySelector('[data-stream-row="CloudScale"]') as HTMLElement).getByText("15%").getAttribute("data-offer-rate")).toBe("low");
    expect(within(c).getByText("Last 3 months")).toBeTruthy();
  });

  it("draws Top performing consultants: rank, name, numbers, Match rate chip, last activity, trend, kebab and View all", async () => {
    mount();
    await ready();
    const c = card("top");
    for (const col of ["#", "Consultant", "Submissions", "Interviews", "Offers", "Placements", "Match rate", "Last activity", "Trend"]) expect(within(c).getAllByText(col).length).toBeGreaterThan(0);
    const first = c.querySelector('[data-top-row="1"]') as HTMLElement;
    expect(within(first).getByText("Alex Morgan")).toBeTruthy();
    expect(first.textContent).toContain("28");
    expect(within(first).getByText("86%").className).toContain("v2-green");
    expect(within(first).getByText("2 hours ago")).toBeTruthy();
    expect(within(first).getByLabelText("More for Alex Morgan")).toBeTruthy();
    expect(first.querySelector("[data-sparkline]")).toBeTruthy();
    expect(within(c.querySelector('[data-top-row="3"]') as HTMLElement).getByText("78%").className).toContain("v2-amber");
    expect(within(c.querySelector('[data-top-row="5"]') as HTMLElement).getByText("1 day ago")).toBeTruthy();
    expect(c.querySelectorAll("[data-top-row]").length).toBe(5);
    expect(within(c).getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/w/marketing/talent");
  });

  it("has no right column and no Consultant readiness: bee card, Performance benchmarks, Goals progress and Recommended actions are gone (D5)", async () => {
    mount();
    await ready();
    for (const c of ["help", "benchmarks", "goals", "actions", "readiness"]) expect(document.querySelector(`[data-perf-card="${c}"]`), c).toBeNull();
    for (const t of ["Performance Benchmarks", "Goals Progress", "Recommended Actions", "Consultant Readiness", "Industry"]) expect(screen.queryByText(t)).toBeNull();
    expect(screen.queryByRole("button", { name: /Ask a question/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set your monthly targets" })).toBeNull();
  });

  it("every card with a formula carries an info icon", async () => {
    mount();
    await ready();
    for (const what of ["Submissions by week", "Interviews vs offers", "Placement funnel", "By client", "Top performing consultants"]) {
      expect(screen.getByRole("button", { name: new RegExp(`About ${what}`) }).getAttribute("aria-label")?.length).toBeGreaterThan(40);
    }
  });

  it("changing a card's period refetches the board with that period in the query", async () => {
    const f = reply(200, fixture());
    vi.stubGlobal("fetch", f);
    mount();
    await ready();
    fireEvent.click(within(card("weekly")).getByRole("button", { name: "Weeks period" }));
    fireEvent.click(await screen.findByRole("option", { name: "Last 12 weeks" }));
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes("weeks=12w"))).toBe(true));
    expect(String(f.mock.calls[0][0])).toBe("/api/orgs/2/mkt/performance");
  });

  it("with no numbers yet every card shows its empty state, never a made-up number", async () => {
    vi.stubGlobal("fetch", reply(200, empty()));
    mount();
    await waitFor(() => expect(screen.getAllByText("Numbers appear after your first week.").length).toBeGreaterThanOrEqual(4));
    expect(within(tile("interviewRate")).getByText("Nothing yet")).toBeTruthy();
  });

  it("shows a retry when the board fails to load, and loads on retry", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValue(new Response(JSON.stringify(fixture()), { status: 200 }));
    vi.stubGlobal("fetch", f);
    mount();
    const retry = await screen.findByRole("button", { name: /try again|retry/i });
    fireEvent.click(retry);
    await ready();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("a 403 or 404 says the page isn't part of the role", async () => {
    vi.stubGlobal("fetch", reply(404, { status: 404 }));
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
  });

  it("nothing on the page can submit for a consultant: the page only reads", async () => {
    const f = reply(200, fixture());
    vi.stubGlobal("fetch", f);
    mount();
    await ready();
    expect(screen.queryByRole("button", { name: /^submit/i })).toBeNull();
    expect(f.mock.calls.every((c) => !(c[1] as RequestInit | undefined)?.method)).toBe(true);
  });
});
