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
  it("has no tiles; the chip row says how many openings are new today and lists the saved searches", async () => {
    await board();
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(0);
    const chips = document.querySelector("[data-jobs-chips]") as HTMLElement;
    expect(within(chips).getByText("24 new today")).toBeTruthy();
    expect(within(chips).getByText("Java Developers - East Coast")).toBeTruthy();
    expect(within(chips).getByText("24 new", { selector: "[data-new-badge]" })).toBeTruthy();
    expect(chips.querySelectorAll("[data-saved-row]")).toHaveLength(5);
    expect(chips.querySelectorAll("[data-new-badge]")).toHaveLength(5);
    expect(within(chips).getByRole("button", { name: "Apply search AWS Cloud Roles" }).getAttribute("title")).toBe("Skills: AWS, DevOps | Location: Nationwide");
  });

  it("draws the search bar and the filter row: four filters in view, Visa and Rate under More filters", async () => {
    await board();
    expect(screen.getByPlaceholderText(/Search title, skills, client, or keywords/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    const bar = document.querySelector("[data-jobs-filters]") as HTMLElement;
    for (const label of ["Skills", "Location", "Work type", "Source"]) expect(within(bar).getByText(label)).toBeTruthy();
    for (const label of ["Visa", "Rate"]) expect(within(bar).queryByText(label)).toBeNull();
    const filters = bar.textContent ?? "";
    for (const value of ["Select skills", "Select location", "All types", "All sources"]) expect(filters).toContain(value);
    expect(screen.getByRole("button", { name: "Clear all" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    const more = document.querySelector("[data-more-filters]") as HTMLElement;
    for (const label of ["Visa", "Rate"]) expect(within(more).getByText(label)).toBeTruthy();
    expect(more.textContent).toContain("All visa types");
    expect(more.textContent).toContain("Min - Max");
    const card = document.querySelector('[data-jobs-card="openings"]') as HTMLElement;
    expect(within(card).getByText("Openings")).toBeTruthy();
    expect(within(card).getByText("(342)")).toBeTruthy();
    expect(within(card).getByText("Sort by")).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Table/ })).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Card/ })).toBeTruthy();
  });

  it("lists the board's eight rows with every column, chip and button", async () => {
    await board();
    const card = document.querySelector('[data-jobs-card="openings"]') as HTMLElement;
    for (const col of ["Opening", "Client", "Location", "Rate", "Source", "Posted", "Priority", "Actions"]) expect(within(card).getAllByText(col).length).toBeGreaterThan(0);
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

  it("has no Trending skills, Top clients, alerts, bee help card or Watched streams (those moved or went)", async () => {
    await board();
    for (const c of ["trending", "clients", "alerts", "help", "saved", "streams"]) expect(document.querySelector(`[data-jobs-card="${c}"]`), c).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask a question" })).toBeNull();
    expect(screen.queryByText(/Trending skills/i)).toBeNull();
    expect(screen.queryByText(/Watched job streams/i)).toBeNull();
  });

  it("says so, with no rows and no chips, when the organization has nothing", async () => {
    serve(() => json(200, fixture({ kpis: {}, items: [], total: 0, trendingSkills: [], topClients: [], alerts: [], savedSearches: [], streams: [] })));
    mount();
    await screen.findByText("No openings yet.");
    expect(document.querySelector("[data-jobs-chips]")).toBeNull();
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
    fireEvent.change(screen.getByLabelText("Work type"), { target: { value: "REMOTE" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("workType=REMOTE") && c.url.includes("source=Indeed"))).toBe(true));
    fireEvent.change(screen.getByPlaceholderText(/Search title, skills/), { target: { value: "java" } });
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

  it("Save for a consultant puts the job on the assigned consultant's own list as Saved; nothing is applied or submitted (E1)", async () => {
    serve((url, method) => {
      if (url.endsWith("/jobs/1/candidates")) return json(200, [{ consultantId: 5, name: "Alex Morgan", title: "Java Developer", availability: "AVAILABLE", score: 92, matchStatus: null, memberId: 50 }, { consultantId: 6, name: "No Seat", title: null, availability: null, score: null, matchStatus: null, memberId: null }]);
      if (method === "POST" && url.endsWith("/consultants/50/applications/save")) return json(200, { applicationId: 9, company: "TechCorp", roleTitle: "Senior Java Developer", status: "SAVED", alreadySaved: false });
      if (/\/mkt\/jobs\/1$/.test(url)) return json(200, { job: ROWS[0], description: "Build services.", employment: null, duration: null, experienceLevel: null, matches: [] });
      return undefined;
    });
    await board();
    fireEvent.click(screen.getByRole("button", { name: "View Senior Java Developer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save for a consultant" }));
    expect(await screen.findByText(/does not apply to the job: the consultant applies themselves/)).toBeTruthy();
    // a consultant with no organization account cannot be picked for a save
    fireEvent.click(await screen.findByText("No Seat"));
    fireEvent.click(screen.getByRole("button", { name: "Save job" }));
    await screen.findByText(/no organization account yet/);
    fireEvent.click(screen.getByText("Alex Morgan"));
    fireEvent.click(screen.getByRole("button", { name: "Save job" }));
    await screen.findByText(/Saved for Alex Morgan - Senior Java Developer/);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/consultants/50/applications/save");
    const sent = JSON.parse(post.body!);
    expect(sent.roleTitle).toBe("Senior Java Developer");
    expect(sent.status).toBeUndefined();
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(1);
    expect(calls.every((c) => !/submi/i.test(c.url))).toBe(true);
  });

  it("a consultant on a project is listed, disabled, with the reason, and cannot be picked", async () => {
    serve((url) => {
      if (url.endsWith("/jobs/1/candidates")) return json(200, [
        { consultantId: 5, name: "Alex Morgan", title: null, availability: null, score: 92, matchStatus: null, pausedReason: null },
        { consultantId: 9, name: "Ben Okafor", title: "Engineer", availability: "ON_PROJECT", score: null, matchStatus: null, pausedReason: "On a project — marketing paused" },
      ]);
      return undefined;
    });
    await board();
    fireEvent.click(screen.getByRole("button", { name: "Assign Senior Java Developer" }));
    await screen.findByText("Alex Morgan");
    const ben = document.querySelector("[data-candidate='9']") as HTMLElement;
    expect(ben.getAttribute("data-paused")).toBe("true");
    expect(within(ben).getByText("On a project — marketing paused")).toBeTruthy();
    expect((ben.querySelector("input") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(ben);
    expect((screen.getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the API's CONSULTANT_PAUSED sentence kindly when such a request reaches the API anyway", async () => {
    serve((url, method) => {
      if (url.endsWith("/jobs/1/candidates")) return json(200, [{ consultantId: 5, name: "Alex Morgan", title: null, availability: null, score: null, matchStatus: null, pausedReason: null }]);
      if (method === "POST") return json(409, { error: "This consultant is on a project and their marketing is paused, so nothing can be assigned.", code: "CONSULTANT_PAUSED" });
      return undefined;
    });
    await board();
    fireEvent.click(screen.getByRole("button", { name: "Assign Senior Java Developer" }));
    fireEvent.click(await screen.findByText("Alex Morgan"));
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    await screen.findByText(/on a project and their marketing is paused/);
  });

  describe("the duplicate and cap guards (Sprint 2 / B1)", () => {
    const finding = { rule: "VENDOR_CHAIN", message: "This consultant already has the same role through another vendor: TekVendor (Senior Java Developer)." };
    const candidates = [
      { consultantId: 5, name: "Alex Morgan", title: "Java Developer", availability: "AVAILABLE", score: 92, matchStatus: null },
      { consultantId: 6, name: "Priya Sharma", title: "Business Analyst", availability: "NOTICE", score: null, matchStatus: null },
    ];
    /** Serves the candidates, and answers every assign with what the test says. */
    const stubAssign = (answer: (body: Record<string, unknown>) => Response) =>
      serve((url, method, body) => {
        if (url.endsWith("/jobs/1/candidates")) return json(200, candidates);
        if (method === "POST" && url.endsWith("/jobs/1/assign")) return answer(body as Record<string, unknown>);
        return undefined;
      });
    const openAssign = async (name: string) => {
      await board();
      fireEvent.click(screen.getByRole("button", { name: "Assign Senior Java Developer" }));
      fireEvent.click(await screen.findByText(name));
    };

    it("a duplicate warning shows what was found, Assign anyway needs a reason, and the same call is sent again with the confirmation", async () => {
      stubAssign((body) =>
        body.confirmDuplicate
          ? json(200, { matchId: 77, requirementId: 1, consultantId: 5, status: "ASSIGNED", score: 92, created: true })
          : json(409, { error: "Duplicate. Confirm with a reason to go ahead.", code: "DUPLICATE_WARNING", findings: [finding] }),
      );
      await openAssign("Alex Morgan");
      fireEvent.click(screen.getByRole("button", { name: "Assign" }));
      expect(await screen.findByText(/through another vendor: TekVendor/)).toBeTruthy();
      expect(screen.queryByText("Duplicate. Confirm with a reason to go ahead.")).toBeNull(); // the findings replace the sentence
      const go = screen.getByRole("button", { name: "Assign anyway" }) as HTMLButtonElement;
      expect(go.disabled).toBe(true);
      fireEvent.change(screen.getByLabelText("Why is it fine to go ahead?"), { target: { value: "The client asked for both vendors" } });
      expect(go.disabled).toBe(false);
      fireEvent.click(go);
      await screen.findByText(/Assigned Alex Morgan - Senior Java Developer/);
      const posts = calls.filter((c) => c.method === "POST");
      expect(posts.map((c) => JSON.parse(c.body!))).toEqual([{ consultantId: 5 }, { consultantId: 5, confirmDuplicate: true, duplicateReason: "The client asked for both vendors" }]);
      expect(calls.every((c) => !/submi/i.test(c.url))).toBe(true); // E1
    });

    it("choosing another consultant drops the warning, because it belonged to one pair", async () => {
      stubAssign(() => json(409, { error: "Duplicate.", code: "DUPLICATE_WARNING", findings: [finding] }));
      await openAssign("Alex Morgan");
      fireEvent.click(screen.getByRole("button", { name: "Assign" }));
      await screen.findByText(/through another vendor/);
      fireEvent.click(screen.getByText("Priya Sharma"));
      await waitFor(() => expect(screen.queryByText(/through another vendor/)).toBeNull());
      expect(screen.getByRole("button", { name: "Assign" })).toBeTruthy();
    });

    it("a block is a plain message with no reason box", async () => {
      stubAssign(() => json(409, { error: "This consultant already has the same role. Your organization does not allow this.", code: "DUPLICATE_BLOCKED", findings: [finding] }));
      await openAssign("Alex Morgan");
      fireEvent.click(screen.getByRole("button", { name: "Assign" }));
      await screen.findByText("This consultant already has the same role. Your organization does not allow this.");
      expect(screen.queryByLabelText("Why is it fine to go ahead?")).toBeNull();
      expect(screen.queryByRole("button", { name: "Assign anyway" })).toBeNull();
    });

    it("the open-opportunity limit is a plain message too", async () => {
      stubAssign(() => json(409, { error: "This consultant already has 5 open opportunities, the most your organization allows (5).", code: "ASSIGNMENT_CAP" }));
      await openAssign("Alex Morgan");
      fireEvent.click(screen.getByRole("button", { name: "Assign" }));
      await screen.findByText(/already has 5 open opportunities, the most your organization allows/);
      expect(screen.queryByLabelText("Why is it fine to go ahead?")).toBeNull();
    });
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
