// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@kiwiply/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/opportunities" }));
// The shell draws the header from what the page declares; here the declaration is drawn in place so the board's title and subtitle can be asserted.
vi.mock("@/components/ent/shell/ShellContext", () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
  ClaimsMascot: () => null,
  ClaimsHelpCard: () => null,
  openHelpPanel: vi.fn(),
}));

import OpportunitiesPage from "./OpportunitiesPage";

const NOW = Date.now();
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const person = (id: number, name: string) => ({ id, name, avatarUrl: null });
const SARAH = person(101, "Sarah Chen");
const JAMES = person(102, "James Lee");
const DAVID = person(103, "David Kim");

const opp = (id: number, who: [number, string], title: string, location: string, client: string, score: number, interest: string, resume: string, owner: unknown, next: number, action: string, status = "ASSIGNED") => ({
  id, consultant: person(who[0], who[1]), requirementId: 100 + id, jobTitle: title, location, clientId: id, client, matchScore: score, interest, resumeStatus: resume, owner,
  nextActionAt: day(next), action, status, lastActivityAt: ago(3600e3), stale: false, ready: false, reason: "Skills match.",
});
const ROWS = [
  opp(1, [1, "Alex Morgan"], "Senior Java Developer", "New York, NY (Hybrid)", "TechCorp", 92, "VERY_INTERESTED", "UPDATED", SARAH, 1, "REVIEW"),
  opp(2, [2, "Priya Sharma"], "Data Analyst", "Remote", "Global Bank", 88, "INTERESTED", "UPDATED", JAMES, 2, "ASSIGN", "SUGGESTED"),
  opp(3, [3, "Michael Park"], "AWS Cloud Engineer", "Austin, TX (Hybrid)", "CloudScale", 85, "OPEN", "NEEDS_UPDATE", SARAH, 0, "FOLLOW_UP"),
  opp(4, [4, "Emily Lawson"], "Project Manager (PMP)", "Remote", "NextGen", 78, "VERY_INTERESTED", "UPDATED", DAVID, 3, "REVIEW"),
  opp(5, [5, "David Kim"], "Business Analyst", "Chicago, IL (Hybrid)", "HealthPlus", 82, "INTERESTED", "UPDATED", JAMES, 1, "ASSIGN", "SUGGESTED"),
  opp(6, [6, "Jessica Wong"], "DevOps Engineer", "Seattle, WA (Remote)", "DataSystems", 76, "NOT_INTERESTED", "UPDATED", SARAH, 5, "COMPARE"),
  opp(7, [7, "Robert Chen"], "Full Stack Developer", "San Francisco, CA (Hybrid)", "FinTech Co", 80, "INTERESTED", "NEEDS_UPDATE", DAVID, 2, "FOLLOW_UP"),
  opp(8, [8, "Maria Garcia"], "Product Owner", "New York, NY (Hybrid)", "RetailPro", 74, "OPEN", "UPDATED", SARAH, 4, "ASSIGN", "SUGGESTED"),
];
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [1, 2, 2, 3, 4, value] });

const fixture = (over: Record<string, unknown> = {}) => ({
  kpis: [kpi("open", 86, 12), kpi("ready", 28, 18), kpi("awaiting", 42, -10), kpi("stale", 14, -22)],
  items: ROWS,
  total: 8,
  page: 0,
  size: 8,
  topMatches: [
    { id: 1, jobTitle: "Senior Java Developer", client: "TechCorp", location: "New York, NY", matchScore: 92 },
    { id: 2, jobTitle: "Data Analyst", client: "Global Bank", location: "Remote", matchScore: 88 },
  ],
  responses: {
    total: 86,
    days: 30,
    slices: [
      { key: "VERY_INTERESTED", label: "Very Interested", count: 28 },
      { key: "INTERESTED", label: "Interested", count: 24 },
      { key: "OPEN", label: "Open", count: 17 },
      { key: "NOT_INTERESTED", label: "Not Interested", count: 10 },
      { key: "NO_RESPONSE", label: "No Response", count: 7 },
    ],
  },
  activity: [
    { id: 1, kind: "INTEREST_CHANGED", consultant: "Alex Morgan", text: "marked as Very Interested", detail: "Senior Java Developer at TechCorp", at: ago(2 * 3600e3) },
    { id: 2, kind: "RESUME_REQUESTED", consultant: "Michael Park", text: "requested resume update", detail: "AWS Cloud Engineer at CloudScale", at: ago(6 * 3600e3) },
  ],
  filters: { consultants: [{ id: 1, name: "Alex Morgan" }], clients: [{ id: 1, name: "TechCorp" }] },
  ...over,
});

const HREFS = { matches: "/w/marketing/matches", jobs: "/w/marketing/jobs", activity: "/w/marketing/activity", opportunities: "/w/marketing/opportunities" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface Call { url: string; method: string; body: string }
function stub(list: () => Response = () => json(200, fixture())) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : "" };
      calls.push(call);
      if (call.method === "POST" && /\/assign$/.test(url)) return json(200, { message: "Assigned. Priya Sharma was asked for their interest.", changed: true });
      if (call.method === "POST" && /\/request$/.test(url)) return json(200, { message: "Asked Michael Park to update their resume.", changed: true });
      if (call.method === "POST" && /\/notify$/.test(url)) return json(200, { done: 2, skipped: [], message: "Asked 2 consultants for their interest." });
      if (call.method === "POST") return json(200, { message: "Done.", changed: true });
      if (/\/opportunities\/\d+$/.test(url)) return json(200, { item: ROWS[5], alternatives: [ROWS[0]], events: [] });
      if (/\/options/.test(url)) return json(200, { consultants: [{ id: 1, name: "Alex Morgan" }], jobs: [{ id: 9, title: "Java Lead", client: "TechCorp", location: "NY" }] });
      return list();
    }),
  );
  return calls;
}
const lists = (calls: Call[]) => calls.filter((c) => c.method === "GET" && /\/mkt\/opportunities\?/.test(c.url));
const mount = () => render(<ToastProvider><OpportunitiesPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} /></ToastProvider>);
const row = async (id: number) => await waitFor(() => {
  const r = document.querySelector(`[data-opp-row="${id}"]`) as HTMLElement;
  expect(r).toBeTruthy();
  return r;
});

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OpportunitiesPage", () => {
  it("draws the board's title, subtitle and four KPI tiles with value and delta", async () => {
    stub();
    mount();
    expect(screen.getByRole("heading", { name: "Opportunities", level: 1 })).toBeTruthy();
    expect(screen.getByText("Manage shortlisted openings, assign opportunities to consultants, and track consultant interest and readiness.")).toBeTruthy();
    const open = await waitFor(() => {
      const t = document.querySelector('[data-stat-tile="open"]') as HTMLElement;
      expect(within(t).getByText("86")).toBeTruthy();
      return t;
    });
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(4);
    for (const [key, title, value] of [["open", "Open Opportunities", "86"], ["ready", "Ready to Assign", "28"], ["awaiting", "Awaiting Consultant Review", "42"], ["stale", "Stale Opportunities", "14"]]) {
      const t = document.querySelector(`[data-stat-tile="${key}"]`) as HTMLElement;
      expect(within(t).getByText(title)).toBeTruthy();
      expect(within(t).getByText(value)).toBeTruthy();
    }
    expect(open.textContent).toContain("12%");
    expect((document.querySelector('[data-stat-tile="stale"]') as HTMLElement).textContent).toContain("22%");
    expect(open.textContent).toContain("vs last month");
  });

  it("omits the delta chip when the API has no previous value", async () => {
    stub(() => json(200, fixture({ kpis: [kpi("open", 5, null), kpi("ready", 1, null), kpi("awaiting", 0, null), kpi("stale", 0, null)] })));
    mount();
    const t = await waitFor(() => {
      const x = document.querySelector('[data-stat-tile="open"]') as HTMLElement;
      expect(within(x).getByText("5")).toBeTruthy();
      return x;
    });
    expect(t.textContent).not.toContain("vs last month");
  });

  it("lists every board column and row: consultant, job + location, client, score, interest, resume, owner, next action, button", async () => {
    stub();
    mount();
    const card = await waitFor(() => {
      const c = document.querySelector('[data-opp-card="table"]') as HTMLElement;
      expect(within(c).getByText("Alex Morgan")).toBeTruthy();
      return c;
    });
    expect(within(card).getByRole("heading", { name: "Assigned Opportunities" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Add Opportunity/ })).toBeTruthy();
    for (const col of ["Consultant", "Opportunity / Job Title", "Client", "Match Score", "Consultant Interest", "Resume Status", "Owner", "Next Action", "Actions"]) {
      expect(within(card).getAllByText(col).length).toBeGreaterThan(0);
    }
    const r1 = await row(1);
    for (const text of ["Alex Morgan", "Senior Java Developer", "New York, NY (Hybrid)", "TechCorp", "92%", "Very Interested", "Updated", "Sarah Chen", "1 day"]) expect(within(r1).getByText(text)).toBeTruthy();
    expect(within(r1).getByRole("button", { name: "Review" })).toBeTruthy();
    const r3 = await row(3);
    expect(within(r3).getByText("Needs Update")).toBeTruthy();
    expect(within(r3).getByText("Today")).toBeTruthy();
    expect(within(r3).getByRole("button", { name: "Follow Up" })).toBeTruthy();
    expect(within(await row(2)).getByRole("button", { name: "Assign" })).toBeTruthy();
    expect(within(await row(6)).getByRole("button", { name: "Compare" })).toBeTruthy();
    expect(within(await row(6)).getByText("Not Interested")).toBeTruthy();
    expect(within(r1).getByRole("button", { name: /More for Alex Morgan/ })).toBeTruthy();
    expect(document.querySelectorAll("[data-opp-row]")).toHaveLength(8);
  });

  it("shows the search box and the five filters with the board's labels", async () => {
    stub();
    mount();
    await row(1);
    const bar = document.querySelector("[data-opp-filters]") as HTMLElement;
    expect(within(bar).getByPlaceholderText("Search by consultant or job title...")).toBeTruthy();
    for (const label of ["All Consultants", "All Clients", "Interest Status", "Match Score", "Last 30 Days"]) expect(within(bar).getByText(label)).toBeTruthy();
  });

  it("asks the API for the filtered list when a filter changes (search is debounced)", async () => {
    const calls = stub();
    mount();
    await row(1);
    fireEvent.change(screen.getByPlaceholderText("Search by consultant or job title..."), { target: { value: "priya" } });
    await waitFor(() => expect(lists(calls).some((c) => c.url.includes("q=priya"))).toBe(true));
    expect(lists(calls)[0].url).toContain("days=30");
  });

  it("draws the three lower cards and the right column", async () => {
    stub();
    mount();
    await row(1);
    const top = document.querySelector('[data-opp-card="top"]') as HTMLElement;
    expect(within(top).getByRole("heading", { name: "Top Opportunities by Match" })).toBeTruthy();
    for (const col of ["Job Title", "Client", "Location", "Match Score"]) expect(within(top).getByText(col)).toBeTruthy();
    expect(within(top).getByText("Global Bank")).toBeTruthy();
    expect(within(top).getByText("88%")).toBeTruthy();
    expect(within(top).getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/w/marketing/matches");

    const resp = document.querySelector('[data-opp-card="responses"]') as HTMLElement;
    expect(within(resp).getByRole("heading", { name: "Consultant Responses" })).toBeTruthy();
    expect(within(resp).getByText("86")).toBeTruthy();
    expect(within(resp).getByText("Opportunities")).toBeTruthy();
    for (const label of ["Very Interested", "Interested", "Open", "Not Interested", "No Response"]) expect(within(resp).getAllByText(label).length).toBeGreaterThan(0);
    expect(within(resp).getByText("33%")).toBeTruthy();
    expect(within(resp).getByText("Last 30 Days")).toBeTruthy();

    const act = document.querySelector('[data-opp-card="activity"]') as HTMLElement;
    expect(within(act).getByRole("heading", { name: "Recent Opportunity Activity" })).toBeTruthy();
    expect(within(act).getByText("Alex Morgan")).toBeTruthy();
    expect(within(act).getByText("Senior Java Developer at TechCorp")).toBeTruthy();
    expect(within(act).getByText("2 hours ago")).toBeTruthy();

    expect(screen.getByText("Find the right opportunities for your talent faster!")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ask a question/ })).toBeTruthy();
    const quick = document.querySelector('[data-opp-card="quick"]') as HTMLElement;
    expect(within(quick).getByRole("heading", { name: "Quick Actions" })).toBeTruthy();
    for (const q of ["Bulk Assign Opportunities", "Send Opportunity Notifications", "Find Similar Opportunities", "Export Opportunity List", "View Stale Opportunities"]) expect(within(quick).getByText(q)).toBeTruthy();
  });

  it("shows the board's empty copy with no rows and a filter message when filters hide everything", async () => {
    stub(() => json(200, fixture({ items: [], total: 0, topMatches: [], activity: [], responses: { total: 0, days: 30, slices: [] }, kpis: [] })));
    mount();
    expect(await screen.findByText("Assign the first opportunity.")).toBeTruthy();
    expect(screen.getByText("No open opportunities to rank yet.")).toBeTruthy();
    expect(screen.getByText("No consultant responses in this period.")).toBeTruthy();
    expect(screen.getByText("Nothing has happened on your opportunities yet.")).toBeTruthy();
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(4);
    fireEvent.change(screen.getByPlaceholderText("Search by consultant or job title..."), { target: { value: "zzz" } });
    expect(await screen.findByText("No opportunities match these filters.")).toBeTruthy();
  });

  it("offers a retry when the board fails to load", async () => {
    let ok = false;
    stub(() => (ok ? json(200, fixture()) : json(500, {})));
    mount();
    const retry = await screen.findByRole("button", { name: /try again|retry/i });
    ok = true;
    fireEvent.click(retry);
    expect((await screen.findAllByText("Alex Morgan")).length).toBeGreaterThan(0);
  });

  it("says the page isn't part of the role on a 403/404", async () => {
    stub(() => json(404, { status: 404 }));
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
  });

  it("Assign posts to the assign route, tells the marketer, and reloads (it never sets an interest)", async () => {
    const calls = stub();
    mount();
    fireEvent.click(within(await row(2)).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/orgs/2/mkt/opportunities/2/assign")).toBe(true));
    expect(await screen.findByText("Assigned. Priya Sharma was asked for their interest.")).toBeTruthy();
    await waitFor(() => expect(lists(calls).length).toBeGreaterThan(1));
    expect(calls.filter((c) => c.method !== "GET").every((c) => !/interest"\s*:|submit/i.test(c.body))).toBe(true);
  });

  it("Follow Up on a stale resume asks the consultant for a resume update", async () => {
    const calls = stub();
    mount();
    fireEvent.click(within(await row(3)).getByRole("button", { name: "Follow Up" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/orgs/2/mkt/opportunities/3/request" && c.body === '{"kind":"RESUME"}')).toBe(true));
    expect(await screen.findByText("Asked Michael Park to update their resume.")).toBeTruthy();
  });

  it("Follow Up with an up to date resume asks for their interest", async () => {
    const calls = stub(() => json(200, fixture({ items: [opp(9, [9, "Sam Lee"], "QA Lead", "Remote", "Acme", 81, "NO_RESPONSE", "UPDATED", SARAH, 1, "FOLLOW_UP")] })));
    mount();
    fireEvent.click(within(await row(9)).getByRole("button", { name: "Follow Up" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/9/request") && c.body === '{"kind":"INTEREST"}')).toBe(true));
  });

  it("Compare opens the comparison with the consultant's other opportunities", async () => {
    const calls = stub();
    mount();
    fireEvent.click(within(await row(6)).getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("Compare opportunities")).toBeTruthy();
    expect(calls.some((c) => c.method === "GET" && c.url === "/api/orgs/2/mkt/opportunities/6")).toBe(true);
    expect(await screen.findByText(/other open opportunities/)).toBeTruthy();
    expect(document.querySelectorAll("[data-compare-row]")).toHaveLength(1);
  });

  it("Review opens the review dialog and Mark as reviewed posts the review", async () => {
    const calls = stub();
    mount();
    fireEvent.click(within(await row(1)).getByRole("button", { name: "Review" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark as reviewed" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/review"))).toBe(true));
  });

  it("Send Opportunity Notifications asks to confirm, then posts the request", async () => {
    const calls = stub();
    mount();
    await row(1);
    fireEvent.click(screen.getByRole("button", { name: /Send Opportunity Notifications/ }));
    expect(await screen.findByText(/42 assigned opportunities are waiting/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send requests" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/orgs/2/mkt/opportunities/notify")).toBe(true));
    expect(await screen.findByText("Asked 2 consultants for their interest.")).toBeTruthy();
  });

  it("Export Opportunity List is a download link carrying the board's filters", async () => {
    stub();
    mount();
    await row(1);
    const link = screen.getByRole("link", { name: /Export Opportunity List/ });
    expect(link.getAttribute("href")).toBe("/api/orgs/2/mkt/opportunities/export?days=30&sort=recent&dir=desc");
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("View Stale Opportunities filters the list to stale rows for any period", async () => {
    const calls = stub();
    mount();
    await row(1);
    fireEvent.click(screen.getByRole("button", { name: /View Stale Opportunities/ }));
    await waitFor(() => expect(lists(calls).some((c) => c.url.includes("stale=true") && c.url.includes("days=0"))).toBe(true));
    expect(await screen.findByText("Stale only")).toBeTruthy();
  });

  it("Find Similar Opportunities opens the matches page", async () => {
    stub();
    mount();
    await row(1);
    expect(screen.getByRole("link", { name: /Find Similar Opportunities/ }).getAttribute("href")).toBe("/w/marketing/matches");
  });

  it("Add Opportunity loads the consultants and jobs and posts a create request", async () => {
    const calls = stub();
    mount();
    await row(1);
    fireEvent.click(screen.getByRole("button", { name: /Add Opportunity/ }));
    expect(await screen.findByText("Add opportunity")).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.url.includes("/options"))).toBe(true));
    expect(await screen.findByText(/not contacted until you assign/)).toBeTruthy();
  });

  it("Bulk Assign lists the ready opportunities and assigns the ticked ones", async () => {
    const ready = { ...ROWS[1], ready: true };
    const calls = stub(() => json(200, fixture({ items: [ready] })));
    mount();
    await row(2);
    fireEvent.click(screen.getByRole("button", { name: /Bulk Assign Opportunities/ }));
    expect(await screen.findByText("Bulk assign opportunities")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Assign 1" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/bulk-assign") && c.body === '{"ids":[2]}')).toBe(true));
  });
});
