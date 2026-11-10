import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JobStreamsPage from "./JobStreamsPage";

vi.setConfig({ testTimeout: 30_000 }); // a cold first render on a busy CI box can pass 5s

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60e3;
const H = 60 * MIN;

const stream = (id: number, sourceLabel: string, subtitle: string, every: number, keywords: string[], mins: number, openings: number, delta: number | null, over: Record<string, unknown> = {}) => ({
  id, sourceLabel, subtitle, status: "ACTIVE", active: true, syncEveryMinutes: every, keywords, clientScope: null, lastSyncAt: iso(mins * MIN), newOpenings: openings, openingsDeltaPct: delta, ...over,
});

const DAYS = ["2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26", "2026-04-27"];
const fixture = (over: Record<string, unknown> = {}) => ({
  kpis: [
    { key: "activeStreams", value: 6, deltaPct: 20, sparkline: [4, 4, 5, 5, 5, 5, 6, 6] },
    { key: "syncHealth", value: 100, deltaPct: 5, sparkline: [95, 95, 100, 100, 100, 100, 100, 100] },
    { key: "newOpenings", value: 362, deltaPct: 18, sparkline: [200, 220, 240, 260, 300, 330, 340, 362] },
    { key: "streamErrors", value: 3, deltaPct: -57, sparkline: [5, 4, 6, 3, 4, 2, 3, 3] },
  ],
  streams: {
    items: [
      stream(1, "LinkedIn Jobs", "Global Talent Solutions", 30, ["Java", "AWS", "Cloud", "Data Engineer", "Spring Boot", "Kubernetes", "React"], 10, 124, 12),
      stream(2, "Indeed", "Worldwide", 60, ["Data Analyst", "Business Analyst", "SQL", "Tableau"], 25, 86, 8),
      stream(3, "Dice", "Tech & Cleared", 120, ["Java Developer", "DevOps", "Azure", "AWS", "Terraform", "Docker", "Kubernetes"], 60, 48, 5),
      stream(4, "ZipRecruiter", "All Locations", 60, ["Project Manager", "IT Consultant", "PMP", "Agile", "Scrum"], 120, 32, 3),
      stream(5, "Client Portal", "ACME Clients", 30, ["Client Specific (Requisitions)"], 30, 67, 15, { clientScope: "ACME Clients" }),
      stream(6, "Vendor Feed", "Partner Integration", 240, ["Multiple Clients (Open Roles)"], 180, 45, null),
    ],
    total: 6, page: 0, size: 25,
  },
  filters: { sources: ["LinkedIn Jobs", "Indeed", "Dice", "ZipRecruiter", "Client Portal", "Vendor Feed"], statuses: ["ACTIVE", "PAUSED", "ERROR"], clients: ["ACME Clients"] },
  activity: [
    { id: 1, streamId: 1, source: "LinkedIn Jobs", syncedAt: iso(10 * MIN), openings: 124, status: "OK", message: "Sync completed" },
    { id: 2, streamId: 5, source: "Client Portal", syncedAt: iso(30 * MIN), openings: 67, status: "OK", message: "Sync completed" },
    { id: 3, streamId: 6, source: "Vendor Feed", syncedAt: iso(3 * H), openings: 0, status: "FAILED", message: "Connection timeout" },
  ],
  chart: { days: DAYS, series: [{ key: "s1", label: "LinkedIn Jobs", values: [20, 30, 25, 20, 22, 28, 40] }, { key: "s2", label: "Indeed", values: [10, 12, 15, 11, 13, 14, 16] }] },
  alerts: [
    { id: 1, severity: "ERROR", title: "Vendor Feed sync failed", detail: "Connection timeout. Retrying in 15 minutes.", raisedAt: iso(2 * H) },
    { id: 2, severity: "WARNING", title: "3 duplicate jobs detected", detail: "Similar titles from Indeed", raisedAt: iso(4 * H) },
    { id: 3, severity: "WARNING", title: "Keyword filter too broad", detail: "\"Developer\" returning high volume", raisedAt: iso(26 * H) },
    { id: 4, severity: "WARNING", title: "Client Portal slow response", detail: "Sync taking longer than usual", raisedAt: iso(30 * H) },
  ],
  rules: [
    { key: "DEFAULT_KEYWORDS", enabled: true, value: "Java, AWS" },
    { key: "CLIENT_MAPPING", enabled: true, value: null },
    { key: "DUPLICATE_DETECTION", enabled: true, value: null },
    { key: "AUTO_PUBLISH", enabled: false, value: null },
  ],
  ...over,
});

const HREFS = { jobs: "/w/marketing/jobs", streams: "/w/marketing/streams" };
const mount = () => render(<JobStreamsPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} />);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
function stubFetch(handler: Handler) {
  const f = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", f);
  return f;
}

beforeEach(() => stubFetch(() => json(200, fixture())));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (label: string) =>
  waitFor(() => {
    const el = document.querySelector(`[data-stream-row="${label}"]`) as HTMLElement | null;
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });

describe("JobStreamsPage", () => {
  it("has no tiles; one status line says how many sources, the last sync and the warnings", async () => {
    mount();
    await row("LinkedIn Jobs");
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(0);
    expect((document.querySelector("[data-sources-status]") as HTMLElement).textContent).toBe("6 sources · last sync 10 mins ago · 4 warnings");
  });

  it("draws the Sources card: title, add button, filters, columns and the six rows", async () => {
    mount();
    await screen.findByText("Sources");
    await row("LinkedIn Jobs");
    expect(screen.getByRole("button", { name: /Add source/ })).toBeTruthy();
    expect(screen.getByPlaceholderText("Search job sources...")).toBeTruthy();
    for (const label of ["All sources", "All statuses", "All clients"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Show inactive")).toBeTruthy();
    for (const col of ["Source", "Status", "Sync schedule", "Keywords / filters", "Last sync", "Openings", "Actions"]) expect(screen.getAllByText(col).length).toBeGreaterThan(0);
    const rows = document.querySelectorAll("[data-stream-row]");
    expect(rows).toHaveLength(6);
    const li = document.querySelector('[data-stream-row="LinkedIn Jobs"]') as HTMLElement;
    expect(within(li).getByText("Global Talent Solutions")).toBeTruthy();
    expect(within(li).getByText("Active")).toBeTruthy();
    expect(within(li).getByText("Every 30 mins")).toBeTruthy();
    expect(li.textContent).toContain("Java, AWS, Cloud, Data Engineer");
    expect(within(li).getByText("+3")).toBeTruthy();
    expect(within(li).getByText("10 mins ago")).toBeTruthy();
    expect(within(li).getByText("124")).toBeTruthy();
    expect(within(li).getByText(/\+12%/)).toBeTruthy();
    expect(within(li).getByRole("button", { name: "Configure" })).toBeTruthy();
    expect(within(li).getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(within(li).getByRole("link", { name: "View openings" }).getAttribute("href")).toBe("/w/marketing/jobs");
    expect(within(document.querySelector('[data-stream-row="Dice"]') as HTMLElement).getByText("Every 2 hours")).toBeTruthy();
    expect(within(document.querySelector('[data-stream-row="Indeed"]') as HTMLElement).getByText("Every 1 hour")).toBeTruthy();
    // a stream without a delta draws none
    expect((document.querySelector('[data-stream-row="Vendor Feed"]') as HTMLElement).textContent).not.toMatch(/[↑↓]/);
  });

  it("merges sync activity and warnings into one list, newest first; no chart and no assistant card", async () => {
    mount();
    await screen.findByText("Vendor Feed sync failed");
    expect(document.querySelector('[data-streams-card="activity"]')).toBeNull();
    expect(document.querySelector('[data-streams-card="alerts"]')).toBeNull();
    expect(document.querySelector('[data-streams-card="openings"]')).toBeNull();
    expect(document.querySelector('[data-streams-card="assistant"]')).toBeNull();
    expect(screen.queryByText("Openings Captured")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ask a question/ })).toBeNull();
    const recent = document.querySelector('[data-streams-card="recent"]') as HTMLElement;
    expect(within(recent).getByText("Recent syncs and warnings")).toBeTruthy();
    expect(recent.querySelectorAll("[data-sync-row]")).toHaveLength(3);
    expect(recent.querySelectorAll("[data-alert-row]")).toHaveLength(4);
    // newest first: a sync 10 min ago, a sync 30 min ago, then the alert 2 hours ago, the sync 3 hours ago ...
    const order = Array.from(recent.querySelectorAll("li")).map((li) => li.getAttribute("data-sync-row") ? "s" + li.getAttribute("data-sync-row") : "a" + li.getAttribute("data-alert-row"));
    expect(order.slice(0, 4)).toEqual(["s1", "s2", "a1", "s3"]);
    expect(within(recent).getByText("Connection timeout")).toBeTruthy();
    expect(within(recent).getByLabelText("Sync failed")).toBeTruthy();
    expect(recent.querySelector('[data-severity="ERROR"]')).not.toBeNull();
    const rules = document.querySelector('[data-streams-card="rules"]') as HTMLElement;
    for (const t of ["Default keywords", "Client mapping rules", "Duplicate detection", "Auto-publish"]) expect(within(rules).getByText(t)).toBeTruthy();
    expect(within(rules).getByText("Off")).toBeTruthy(); // only the disabled rule
  });

  it("an empty organization shows the honest empty copy, not made-up rows", async () => {
    stubFetch(() =>
      json(200, fixture({
        kpis: [{ key: "activeStreams", value: 0, deltaPct: null, sparkline: [] }, { key: "syncHealth", value: null, deltaPct: null, sparkline: [] }, { key: "newOpenings", value: 0, deltaPct: null, sparkline: [] }, { key: "streamErrors", value: 0, deltaPct: null, sparkline: [] }],
        streams: { items: [], total: 0, page: 0, size: 25 }, activity: [], chart: { days: DAYS, series: [] }, alerts: [], rules: [],
      })),
    );
    mount();
    expect(await screen.findByText("No sources yet. Add one to start capturing openings.")).toBeTruthy();
    expect(screen.getByText("No syncs have run yet, and no warnings.")).toBeTruthy();
    expect((document.querySelector("[data-sources-status]") as HTMLElement).textContent).toBe("0 sources · last sync never · 0 warnings");
    expect(document.querySelectorAll("[data-stream-row]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-rule-row]")).toHaveLength(4); // the four rules are always listed, off by default
  });

  it("a failed load offers a retry", async () => {
    let ok = false;
    stubFetch(() => (ok ? json(200, fixture()) : json(500, {})));
    mount();
    const retry = await screen.findByRole("button", { name: /retry/i });
    ok = true;
    fireEvent.click(retry);
    await screen.findByText("Sources");
  });

  it("a 404 (not your role) shows the role message", async () => {
    stubFetch(() => json(404, { status: 404 }));
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
  });

  it("typing in the filters re-queries the API with them", async () => {
    const f = stubFetch(() => json(200, fixture()));
    mount();
    await screen.findByText("Sources");
    fireEvent.change(screen.getByPlaceholderText("Search job sources..."), { target: { value: "dice" } });
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes("q=dice"))).toBe(true));
    fireEvent.click(screen.getByRole("switch", { name: "Show inactive" }));
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes("showInactive=true"))).toBe(true));
  });

  it("Pause calls the pause route and reloads; nothing submits", async () => {
    const f = stubFetch((url, init) => (init?.method === "POST" ? json(200, { id: 1, sourceLabel: "LinkedIn Jobs", status: "PAUSED", active: false, syncEveryMinutes: 30 }) : json(200, fixture())));
    mount();
    const li = await row("LinkedIn Jobs");
    fireEvent.click(within(li).getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === "/api/orgs/2/mkt/streams/1/pause" && (c[1] as RequestInit).method === "POST")).toBe(true));
    for (const c of f.mock.calls) expect(String(c[0])).not.toMatch(/submit/i);
  });

  it("a paused stream offers Resume", async () => {
    const base = fixture();
    const items = [...(base.streams as { items: unknown[] }).items];
    items[0] = stream(1, "LinkedIn Jobs", "Global Talent Solutions", 30, ["Java"], 10, 124, 12, { status: "PAUSED", active: false });
    stubFetch(() => json(200, fixture({ streams: { items, total: 6, page: 0, size: 25 } })));
    mount();
    const li = await row("LinkedIn Jobs");
    expect(within(li).getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(within(li).getByText("Paused")).toBeTruthy();
  });

  it("Add source posts the form to the BFF and shows the API's error inline", async () => {
    const f = stubFetch((url, init) => (init?.method === "POST" ? json(400, { error: "a stream with this name already exists" }) : json(200, fixture())));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Add source/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("LinkedIn Jobs"), { target: { value: "Dice" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add source" }));
    expect(await within(dialog).findByText("a stream with this name already exists")).toBeTruthy();
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST")!;
    expect(post[0]).toBe("/api/orgs/2/mkt/streams");
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({ sourceLabel: "Dice", syncEveryMinutes: 60 });
  });

  it("toggling a rule patches the rule route", async () => {
    const f = stubFetch((url, init) => (init?.method === "PATCH" ? json(200, { key: "AUTO_PUBLISH", enabled: true, value: null }) : json(200, fixture())));
    mount();
    fireEvent.click(await waitFor(() => {
      const el = document.querySelector('[data-rule-row="AUTO_PUBLISH"]') as HTMLElement | null;
      expect(el).not.toBeNull();
      return el as HTMLElement;
    }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("switch"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save rule" }));
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === "/api/orgs/2/mkt/streams/rules/AUTO_PUBLISH" && (c[1] as RequestInit).method === "PATCH")).toBe(true));
    const patch = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PATCH")!;
    expect(JSON.parse((patch[1] as RequestInit).body as string).enabled).toBe(true);
  });
});
