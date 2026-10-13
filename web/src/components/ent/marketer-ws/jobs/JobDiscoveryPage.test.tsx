// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30000 });
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => "/w/marketing/jobs" }));

import JobDiscoveryPage from "./JobDiscoveryPage";

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3600e3;
const tile = (value: number, deltaPct: number | null) => ({ value, deltaPct, sparkline: [1, 2, 3, 4, 5, 6, 7, value] });

const row = (id: number, title: string, client: string, location: string, rate: string, source: string, hours: number, priority: string) => ({
  id, title, client: { id, name: client, logoUrl: null }, location, workMode: "HYBRID", rateLabel: rate, source, postedAt: iso(hours * H), priority, visa: null, skills: ["Java"], status: "OPEN",
});
const ROWS = [
  row(1, "Senior Java Developer", "TechCorp", "New York, NY", "$90 - $110/hr", "LinkedIn Jobs", 2, "HIGH"),
  row(2, "Data Analyst", "Global Bank", "Remote", "$60 - $75/hr", "Indeed", 3, "MEDIUM"),
  row(3, "AWS Cloud Engineer", "CloudScale", "Austin, TX", "$95 - $120/hr", "Dice", 4, "HIGH"),
  row(4, "Business Analyst", "HealthPlus", "Chicago, IL", "$70 - $90/hr", "ZipRecruiter", 5, "MEDIUM"),
  row(5, "Project Manager (PMP)", "NovaGen", "Remote", "$85 - $105/hr", "Client Portal", 6, "HIGH"),
  row(6, ".NET Developer", "FinServe", "Charlotte, NC", "$75 - $95/hr", "LinkedIn Jobs", 8, "MEDIUM"),
  row(7, "QA Automation Engineer", "RetailWorks", "Dallas, TX", "$65 - $85/hr", "Indeed", 10, "LOW"),
  row(8, "Salesforce Developer", "Acme Health", "San Francisco, CA", "$90 - $120/hr", "Dice", 12, "HIGH"),
];

const SEARCHES = [
  { id: 1, name: "Java Developers - East Coast", criteria: { skills: ["Java", "Spring", "AWS"], location: "NY, NJ, PA" }, newCount: 24 },
  { id: 2, name: "Data & Analytics Roles", criteria: { skills: ["Python", "SQL", "Tableau"], location: "Remote" }, newCount: 18 },
  { id: 3, name: "AWS Cloud Roles", criteria: { skills: ["AWS", "DevOps"], location: "Nationwide" }, newCount: 32 },
  { id: 4, name: "Project Managers", criteria: { skills: ["PMP", "Agile"], location: "Remote" }, newCount: 12 },
  { id: 5, name: ".NET Opportunities", criteria: { skills: [".NET", "C#"], location: "US" }, newCount: 16 },
];

const fixture = (over: Record<string, unknown> = {}) => ({
  kpis: { newToday: tile(24, 26), highMatch: tile(56, 18), assigned: tile(32, 14), savedSearches: tile(12, 50) },
  items: ROWS,
  total: 342,
  page: 0,
  size: 8,
  canAssign: true,
  facets: { skills: ["Java", "AWS", "Python"], locations: ["Austin, TX", "Remote"], workTypes: ["ON_SITE", "HYBRID", "REMOTE"], visas: ["H-1B transfer"], sources: ["Dice", "Indeed", "LinkedIn Jobs"] },
  trendingSkills: [
    { rank: 1, skill: "Java", openings: 128, deltaPct: 32, barPct: 100 }, { rank: 2, skill: "AWS", openings: 112, deltaPct: 28, barPct: 88 }, { rank: 3, skill: "Python", openings: 98, deltaPct: 20, barPct: 77 },
    { rank: 4, skill: "SQL", openings: 76, deltaPct: 18, barPct: 59 }, { rank: 5, skill: "Project Management", openings: 64, deltaPct: 15, barPct: 50 },
  ],
  topClients: [
    { id: 1, name: "TechCorp", logoUrl: null, openings: 48, topSkills: ["Java", "AWS", "DevOps"], deltaPct: 40 },
    { id: 2, name: "Global Bank", logoUrl: null, openings: 36, topSkills: ["Data", "SQL", "Python"], deltaPct: 28 },
  ],
  alerts: [
    { id: "client-1", kind: "CLIENT", text: "24 new Java openings at TechCorp", at: iso(2 * H), clientId: 1, logoUrl: null },
    { id: "search-4", kind: "SEARCH", text: "5 new Project Manager roles match your saved search", at: iso(9 * H), clientId: null, logoUrl: null },
  ],
  savedSearches: SEARCHES,
  streams: [
    { clientId: 1, name: "TechCorp", subtitle: "All Openings", logoUrl: null, newThisWeek: 124, status: "Active" },
    { clientId: 2, name: "Global Bank", subtitle: "IT & Data", logoUrl: null, newThisWeek: 86, status: "Active" },
    { clientId: 3, name: "CloudScale", subtitle: "Cloud & DevOps", logoUrl: null, newThisWeek: 67, status: "Active" },
    { clientId: 4, name: "HealthPlus", subtitle: "Healthcare IT", logoUrl: null, newThisWeek: 42, status: "Active" },
    { clientId: 5, name: "Client Portal", subtitle: "Enterprise", logoUrl: null, newThisWeek: 106, status: "Active" },
  ],
  ...over,
});

const HREFS = { matches: "/w/marketing/matches", streams: "/w/marketing/streams", jobs: "/w/marketing/jobs" };
const mount = () => render(<JobDiscoveryPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} />);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let calls: { url: string; method: string; body: string | null }[] = [];
const serve = (handler: (url: string, method: string, body: unknown) => Response | undefined) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const raw = typeof init?.body === "string" ? init.body : null;
      calls.push({ url, method, body: raw });
      return handler(url, method, raw ? JSON.parse(raw) : null) ?? json(200, fixture());
    }),
  );

beforeEach(() => {
  calls = [];
  push.mockClear();
  serve(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const board = async () => {
  mount();
  await screen.findByText("Senior Java Developer");
};

describe("JobDiscoveryPage", () => {
  it("draws the five tiles exactly as the board: the fourth has no title, the fifth is titled Saved Searches", async () => {
    await board();
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(5);
    const t = (id: string) => document.querySelector(`[data-stat-tile="${id}"]`) as HTMLElement;
    expect(within(t("newToday")).getByText("New Openings Today")).toBeTruthy();
    expect(within(t("newToday")).getByText("24")).toBeTruthy();
    expect(t("newToday").textContent).toContain("26%");
    expect(t("newToday").textContent).toContain("vs yesterday");
    expect(within(t("highMatch")).getByText("High-Match Openings")).toBeTruthy();
    expect(within(t("highMatch")).getByText("56")).toBeTruthy();
    expect(t("highMatch").textContent).toContain("vs last week");
    expect(within(t("assigned")).getByText("Jobs Assigned")).toBeTruthy();
    expect(within(t("assigned")).getByText("32")).toBeTruthy();
    expect(t("savedSearchCount").querySelector("h3")).toBeNull();
    expect(within(t("savedSearchCount")).getByText("12")).toBeTruthy();
    expect(t("savedSearchCount").textContent).toContain("50%");
    expect(t("savedSearchCount").textContent).toContain("vs last month");
    expect(within(t("savedSearches")).getByText("Saved Searches")).toBeTruthy();
    expect(t("savedSearches").querySelector("[data-tile-value]")).toBeNull();
  });

  it("draws the search bar, the filter row and the Job Openings header", async () => {
    await board();
    expect(screen.getByPlaceholderText(/Search job title, skills, client, or keywords/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    for (const label of ["Skills", "Location", "Work Type", "Visa", "Rate", "Source"]) expect(within(document.querySelector("[data-jobs-filters]") as HTMLElement).getByText(label)).toBeTruthy();
    const filters = (document.querySelector("[data-jobs-filters]") as HTMLElement).textContent ?? "";
    for (const value of ["Select skills", "Select location", "All Types", "All Visa Types", "Min - Max", "All Sources"]) expect(filters).toContain(value);
    expect(screen.getByRole("button", { name: "Clear all" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More filters" })).toBeTruthy();
    const card = document.querySelector('[data-jobs-card="openings"]') as HTMLElement;
    expect(within(card).getByText("Job Openings")).toBeTruthy();
    expect(within(card).getByText("(342)")).toBeTruthy();
    expect(within(card).getByText("Sort by")).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Table/ })).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Card/ })).toBeTruthy();
  });

  it("lists the board's eight rows with every column, chip and button", async () => {
    await board();
    const card = document.querySelector('[data-jobs-card="openings"]') as HTMLElement;
    for (const col of ["Job Title", "Client", "Location", "Rate", "Source", "Posted", "Priority", "Actions"]) expect(within(card).getAllByText(col).length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-job-row]")).toHaveLength(8);
    const first = document.querySelector('[data-job-row="1"]') as HTMLElement;
    expect(within(first).getByText("Senior Java Developer")).toBeTruthy();
    expect(within(first).getByText("TechCorp")).toBeTruthy();
    expect(within(first).getByText("New York, NY")).toBeTruthy();
    expect(within(first).getByText("$90 - $110/hr")).toBeTruthy();
    expect(within(first).getByText("LinkedIn Jobs")).toBeTruthy();
    expect(within(first).getByText("2 hours ago")).toBeTruthy();
    expect(within(first).getByText("High")).toBeTruthy();
    expect(first.querySelector("[data-client-logo]")).toBeTruthy();
    expect(first.querySelector("[data-source-logo]")).toBeTruthy();
    expect(within(first).getByRole("button", { name: "View Senior Java Developer" })).toBeTruthy();
    expect(within(first).getByRole("link", { name: "Match Senior Java Developer" }).getAttribute("href")).toBe("/w/marketing/matches?job=1");
    expect(within(first).getByRole("button", { name: "Assign Senior Java Developer" })).toBeTruthy();
    expect(within(first).getByRole("button", { name: "More for Senior Java Developer" })).toBeTruthy();
    expect(within(document.querySelector('[data-job-row="7"]') as HTMLElement).getByText("Low")).toBeTruthy();
    expect(within(document.querySelector('[data-job-row="2"]') as HTMLElement).getByText("Medium")).toBeTruthy();
  });

  it("draws Trending Skills, Top Clients Hiring and Recent Job Alerts", async () => {
    await board();
    const trending = document.querySelector('[data-jobs-card="trending"]') as HTMLElement;
    expect(within(trending).getByText("Trending Skills in Openings")).toBeTruthy();
    expect(document.querySelectorAll("[data-trending-row]")).toHaveLength(5);
    expect(within(trending).getByText("128")).toBeTruthy();
    expect(trending.textContent).toContain("+32%");
    const clients = document.querySelector('[data-jobs-card="clients"]') as HTMLElement;
    expect(within(clients).getByText("Top Clients Hiring")).toBeTruthy();
    for (const h of ["Client", "Openings", "Top Skills", "Trend"]) expect(within(clients).getByText(h)).toBeTruthy();
    expect(within(clients).getByText("Java, AWS, DevOps")).toBeTruthy();
    expect(clients.textContent).toContain("+40%");
    const alerts = document.querySelector('[data-jobs-card="alerts"]') as HTMLElement;
    expect(within(alerts).getByText("Recent Job Alerts")).toBeTruthy();
    expect(within(alerts).getByText("24 new Java openings at TechCorp")).toBeTruthy();
    expect(within(alerts).getByText("2 hours ago")).toBeTruthy();
  });

  it("draws the right column: bee help card, Saved Searches with N new badges, Watched Job Streams", async () => {
    await board();
    const help = document.querySelector('[data-jobs-card="help"]') as HTMLElement;
    expect(within(help).getByText("Discover the best opportunities for your consultants")).toBeTruthy();
    expect(within(help).getByText("Use filters, saved searches, and AI matching to find and assign the right jobs faster.")).toBeTruthy();
    expect(within(help).getByRole("button", { name: "Ask a question" })).toBeTruthy();
    expect(help.querySelector("img")?.getAttribute("src")).toBe("/ent/marketer/jobs/banner.png");
    const saved = document.querySelector('[data-jobs-card="saved"]') as HTMLElement;
    expect(within(saved).getByText("Saved Searches")).toBeTruthy();
    expect(within(saved).getByText("(5)")).toBeTruthy();
    expect(within(saved).getByText("Java Developers - East Coast")).toBeTruthy();
    expect(within(saved).getByText("Skills: Java, Spring, AWS | Location: NY, NJ, PA")).toBeTruthy();
    expect(within(saved).getByText("24 new")).toBeTruthy();
    expect(saved.querySelectorAll("[data-new-badge]")).toHaveLength(5);
    const streams = document.querySelector('[data-jobs-card="streams"]') as HTMLElement;
    expect(within(streams).getByText("Watched Job Streams")).toBeTruthy();
    expect(within(streams).getByText("(5)")).toBeTruthy();
    expect(within(streams).getByText("TechCorp - All Openings")).toBeTruthy();
    expect(within(streams).getByText("124 new jobs this week")).toBeTruthy();
    expect(within(streams).getAllByText("Active")).toHaveLength(5);
    expect(within(streams).getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/w/marketing/streams");
  });

  it("says so, with no rows and no numbers, when the organization has nothing", async () => {
    serve(() => json(200, fixture({ kpis: {}, items: [], total: 0, trendingSkills: [], topClients: [], alerts: [], savedSearches: [], streams: [] })));
    mount();
    await screen.findByText("No open jobs yet.");
    expect(screen.getByText("No skills to rank yet.")).toBeTruthy();
    expect(screen.getByText("No client is hiring right now.")).toBeTruthy();
    expect(screen.getByText("No new alerts.")).toBeTruthy();
    expect(screen.getByText(/No saved searches yet/)).toBeTruthy();
    expect(screen.getByText(/nothing to watch/)).toBeTruthy();
    expect(screen.getAllByText("Nothing yet").length).toBeGreaterThanOrEqual(3);
    expect(document.querySelectorAll("[data-job-row]")).toHaveLength(0);
  });

  it("explains a search that matches nothing", async () => {
    await board();
    serve((url) => (url.includes("source=Dice") ? json(200, fixture({ items: [], total: 0 })) : undefined));
    const source = screen.getByLabelText("Source") as HTMLSelectElement;
    fireEvent.change(source, { target: { value: "Dice" } });
    await screen.findByText("No openings match these filters.");
  });

  it("offers a retry when the board does not load", async () => {
    let n = 0;
    serve(() => (n++ === 0 ? json(500, { error: "x" }) : undefined));
    mount();
    const retry = await screen.findByRole("button", { name: /try again|retry/i });
    fireEvent.click(retry);
    await screen.findByText("Senior Java Developer");
  });

  it.each([403, 404])("shows 'isn't part of your role' for a %i", async (status) => {
    serve(() => json(status, { error: "no" }));
    mount();
    await screen.findByText("This page isn't part of your role");
    expect(document.querySelector("[data-job-row]")).toBeNull();
  });

  it("sends the filters to the API: source, search words, and Clear all", async () => {
    await board();
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "Indeed" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("source=Indeed"))).toBe(true));
    fireEvent.change(screen.getByLabelText("Work Type"), { target: { value: "REMOTE" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("workType=REMOTE") && c.url.includes("source=Indeed"))).toBe(true));
    fireEvent.change(screen.getByPlaceholderText(/Search job title/), { target: { value: "java" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("q=java"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => {
      const last = calls[calls.length - 1].url;
      expect(last).not.toContain("q=java");
      expect(last).not.toContain("source=");
      expect(last).not.toContain("workType=");
    });
  });

  it("changes the sort and pages through the openings", async () => {
    await board();
    fireEvent.click(screen.getByRole("button", { name: "Sort by posted date" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("sort=posted_asc"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("page=1"))).toBe(true));
    expect(screen.getByText(/of 342/)).toBeTruthy();
  });

  it("applies a saved search to the filters and marks it seen", async () => {
    await board();
    fireEvent.click(screen.getByRole("button", { name: "Apply search AWS Cloud Roles" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("skills=AWS%2CDevOps") || c.url.includes("skills=AWS,DevOps"))).toBe(true));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/saved-searches/3/seen"))).toBe(true));
  });

  it("saves the current filters as a search from More filters", async () => {
    serve((url, method) => (method === "POST" && url.endsWith("/saved-searches") ? json(201, { id: 9, name: "Dice roles", criteria: { source: "Dice", skills: [] }, newCount: 0 }) : undefined));
    await board();
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "Dice" } });
    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    fireEvent.change(screen.getByPlaceholderText(/Name it/), { target: { value: "Dice roles" } });
    fireEvent.click(screen.getByRole("button", { name: "Save search" }));
    await screen.findByText(/Saved "Dice roles"/);
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/saved-searches"))!;
    expect(JSON.parse(post.body!)).toMatchObject({ name: "Dice roles", criteria: { source: "Dice" } });
  });

  it("toggles to the card layout with the same rows and buttons", async () => {
    await board();
    fireEvent.click(screen.getByRole("button", { name: /Card/ }));
    expect(document.querySelector("[data-job-cards]")).toBeTruthy();
    expect(document.querySelectorAll("[data-job-row]")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Assign Data Analyst" })).toBeTruthy();
  });

  it("View opens the job's details with its best matches", async () => {
    serve((url) =>
      /\/mkt\/jobs\/1$/.test(url)
        ? json(200, { job: ROWS[0], description: "Build services for the client.", employment: "CONTRACT", duration: "6 months", experienceLevel: "SENIOR", matches: [{ consultantId: 5, name: "Alex Morgan", score: 92, status: "SUGGESTED" }] })
        : undefined,
    );
    await board();
    fireEvent.click(screen.getByRole("button", { name: "View Senior Java Developer" }));
    await screen.findByText("Build services for the client.");
    expect(screen.getByText("Alex Morgan")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();
  });

  it("Assign picks a consultant and records the match; it never calls anything that submits (E1)", async () => {
    serve((url, method) => {
      if (url.endsWith("/jobs/1/candidates")) return json(200, [{ consultantId: 5, name: "Alex Morgan", title: "Java Developer", availability: "AVAILABLE", score: 92, matchStatus: null }, { consultantId: 6, name: "Priya Sharma", title: "Business Analyst", availability: "NOTICE", score: null, matchStatus: null }]);
      if (method === "POST" && url.endsWith("/jobs/1/assign")) return json(200, { matchId: 77, requirementId: 1, consultantId: 5, status: "ASSIGNED", score: 92, created: true });
      return undefined;
    });
    await board();
    fireEvent.click(screen.getByRole("button", { name: "Assign Senior Java Developer" }));
    const pick = await screen.findByText("Alex Morgan");
    expect(screen.getByText("Priya Sharma")).toBeTruthy();
    expect(screen.getByText(/does not apply to the job/)).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Assign" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(pick);
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    await screen.findByText(/Assigned Alex Morgan - Senior Java Developer/);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/mkt/jobs/1/assign");
    expect(JSON.parse(post.body!)).toEqual({ consultantId: 5 });
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(1);
    expect(calls.every((c) => !/submi/i.test(c.url))).toBe(true);
  });

  it("explains a refused assignment and keeps the drawer open", async () => {
    serve((url, method) => {
      if (url.endsWith("/jobs/1/candidates")) return json(200, [{ consultantId: 5, name: "Alex Morgan", title: null, availability: null, score: null, matchStatus: null }]);
      if (method === "POST") return json(409, { error: "This job is no longer open.", code: "JOB_NOT_OPEN" });
      return undefined;
    });
    await board();
    fireEvent.click(screen.getByRole("button", { name: "Assign Senior Java Developer" }));
    fireEvent.click(await screen.findByText("Alex Morgan"));
    const confirm = screen.getByRole("button", { name: "Assign" });
    fireEvent.click(confirm);
    await screen.findByText("This job is no longer open.");
  });

  it("hides Assign for a caller without opportunities.manage", async () => {
    serve(() => json(200, fixture({ canAssign: false })));
    await board();
    expect(screen.queryByRole("button", { name: /^Assign / })).toBeNull();
    expect(screen.getByRole("link", { name: "Match Senior Java Developer" })).toBeTruthy();
  });

  it("deletes one of the caller's saved searches", async () => {
    serve((url, method) => (method === "DELETE" ? new Response(null, { status: 204 }) : url.includes("/jobs?") ? undefined : undefined));
    await board();
    fireEvent.click(screen.getByRole("button", { name: "More for AWS Cloud Roles" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/saved-searches/3"))).toBe(true));
    await screen.findByText(/Removed the saved search "AWS Cloud Roles"/);
  });
});
