// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/matches" }));

vi.mock("@/components/ent/shell/ShellContext", () => ({
  default: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
  ClaimsMascot: () => null,
  ClaimsHelpCard: () => null,
  openHelpPanel: () => undefined,
}));

import JobMatchesPage from "./JobMatchesPage";

const BOARD: [string, string, string, string, string, number, string, string, boolean][] = [
  ["Alex Morgan", "Java Developer", "Java", "Senior Java Developer", "TechCorp", 96, "Excellent", "green", false],
  ["Priya Sharma", "Business Analyst", "Business Analysis", "Business Analyst", "Global Bank", 92, "Excellent", "green", true],
  ["Michael Park", "AWS Engineer", "AWS", "Cloud Engineer", "CloudScale", 89, "Good", "blue", false],
  ["Emily Lawson", "Project Manager", "Project Management", "IT Project Manager", "HealthPlus", 87, "Excellent", "green", true],
  ["David Kim", "Data Analyst", "SQL", "Data Analyst", "DataWorks", 85, "Good", "blue", false],
  ["Sophie Turner", "DevOps Engineer", "DevOps", "DevOps Engineer", "FinServe", 82, "Fair", "amber", true],
  ["James Wilson", "Full Stack Developer", "React", "Full Stack Developer", "NextGen", 78, "Good", "blue", true],
  ["Anita Desai", "QA Engineer", "QA Automation", "QA Automation Engineer", "RetailCo", 76, "Excellent", "green", false],
  ["Robert Chen", "Salesforce Consultant", "Salesforce", "Salesforce Developer", "Client Portal", 72, "Fair", "amber", true],
  ["Lisa Gomez", "UI/UX Designer", "UI/UX", "UI/UX Designer", "MediaHub", 68, "Fair", "amber", true],
];
const row = (i: number, status = "SUGGESTED") => {
  const [name, role, skill, job, client, score, fit, tone, update] = BOARD[i];
  return {
    id: i + 1, consultantId: 10 + i, consultantName: name, avatarUrl: null, consultantRole: role, primarySkill: skill, requirementId: 100 + i, jobTitle: job, clientId: 500 + i, client,
    score, status, stale: false, highConfidence: score >= 85, availability: { key: fit.toUpperCase(), label: fit, tone, pct: 100 },
    resumeUpdate: update ? { needed: true, reasons: ["Add to resume: " + skill] } : { needed: false, reasons: [] }, createdAt: "2026-10-10T10:00:00Z",
  };
};
const detail = (i: number) => ({
  row: row(i),
  consultant: { id: 10 + i, name: BOARD[i][0], role: BOARD[i][1], avatarUrl: null, skills: ["Java", "Spring Boot", "Microservices", "AWS"] },
  job: { id: 100 + i, title: BOARD[i][3], client: BOARD[i][4], location: "New York, NY", skills: ["Java", "Spring Boot", "AWS", "REST APIs"] },
  ticks: [
    { key: "skills", ok: true, text: "8 of 9 required skills match" },
    { key: "experience", ok: true, text: "5+ years of relevant experience" },
    { key: "availability", ok: true, text: "Available to start within 2 weeks" },
    { key: "location", ok: true, text: "Work location matches (New York, NY)" },
    { key: "client", ok: true, text: "Strong client fit based on past applications (2 of 2 progressed)" },
  ],
  insights: [
    { key: "skills", label: "Skills Match", pct: 92 }, { key: "experience", label: "Experience Level", pct: 88 }, { key: "availability", label: "Availability Fit", pct: 85 },
    { key: "client", label: "Client History", pct: 78 }, { key: "location", label: "Location Fit", pct: 90 },
  ],
  missingSkills: ["REST APIs"], reason: "rule", assignedAt: null,
});
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [1, 2, 2, 3, 4, value] });
const fixture = (over: Record<string, unknown> = {}) => ({
  kpis: [kpi("matched", 142, 24), kpi("highConfidence", 78, 31), kpi("ready", 56, 18), kpi("stale", 20, -35)],
  filters: {
    consultants: BOARD.map((b, i) => ({ key: String(10 + i), label: b[0] })), skills: ["Java", "AWS"], clients: [{ key: "500", label: "TechCorp" }],
    scores: [{ key: "high", label: "High confidence (85%+)" }, { key: "mid", label: "70% - 84%" }, { key: "low", label: "Below 70%" }],
  },
  items: BOARD.map((_, i) => row(i)), total: 142, page: 0, size: 10, topToday: [0, 1, 2, 3, 4].map((i) => row(i)), explanation: detail(0), highConfidenceMin: 85, staleDays: 7, ...over,
});

const PROPS = { orgId: 2, orgName: "Acme", firstName: "Sarah", hrefs: {} };
const mount = () => render(<JobMatchesPage {...PROPS} />);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let calls: { url: string; method: string }[] = [];
const routeFetch = (list: () => Response) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (/\/mkt\/matches\/\d+\/assign$/.test(url)) return json(200, row(0, "ASSIGNED"));
    if (/\/mkt\/matches\/\d+$/.test(url)) return json(200, detail(Number(url.split("/").pop()) - 1));
    if (/\/mkt\/matches\/compare/.test(url)) return json(200, { a: detail(0), b: detail(1) });
    return list();
  });

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", routeFetch(() => json(200, fixture())));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("JobMatchesPage", () => {
  it("draws the four KPI tiles with the board's titles, values and deltas", async () => {
    mount();
    await waitFor(() => expect(within(document.querySelector('[data-stat-tile="matched"]') as HTMLElement).getByText("142")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Job Matches" })).toBeTruthy();
    expect(screen.getByText("Find the best consultant-job matches using AI and manual matching for your assigned consultants.")).toBeTruthy();
    for (const t of ["Matched Openings", "High-Confidence Matches", "Consultant-Ready Matches", "Stale Matches (7+ days)"]) expect(screen.getByText(t)).toBeTruthy();
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(4);
    expect((document.querySelector('[data-stat-tile="highConfidence"]') as HTMLElement).textContent).toContain("31%");
    expect((document.querySelector('[data-stat-tile="stale"]') as HTMLElement).textContent).toContain("35%");
  });

  it("has the filter row and the table with every column, row and button of the board", async () => {
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    for (const f of ["Consultant", "Primary Skill", "Client", "Match Score"]) expect(screen.getAllByText(f).length).toBeGreaterThan(0);
    expect(screen.getByText("All Consultants")).toBeTruthy();
    expect(screen.getByText("All Skills")).toBeTruthy();
    expect(screen.getByText("All Clients")).toBeTruthy();
    expect(screen.getByText("All Scores")).toBeTruthy();
    expect(screen.getByText("Clear Filters")).toBeTruthy();
    const head = within(document.querySelector("thead") as HTMLElement);
    for (const c of ["Consultant", "Primary Skill", "Matched Job Title", "Client", "Match Score", "Availability Fit", "Resume Update", "Actions"]) expect(head.getByText(c)).toBeTruthy();
    expect(document.querySelectorAll("[data-match-row]")).toHaveLength(10);
    const alex = document.querySelector('[data-match-row="1"]') as HTMLElement;
    expect(within(alex).getByText("Alex Morgan")).toBeTruthy();
    expect(within(alex).getByText("Java Developer")).toBeTruthy();
    expect(within(alex).getByText("96%")).toBeTruthy();
    expect(within(alex).getByText("Excellent")).toBeTruthy();
    expect(within(alex).getByText("Not Required")).toBeTruthy();
    for (const b of ["Review", "Assign", "Compare"]) expect(within(alex).getByRole("button", { name: b })).toBeTruthy();
    expect(within(document.querySelector('[data-match-row="2"]') as HTMLElement).getByText("Update")).toBeTruthy();
    expect(within(document.querySelector('[data-match-row="10"]') as HTMLElement).getByText("68%")).toBeTruthy();
  });

  it("shows the Match Explanation, Match Insights, the help card and Top Matches Today", async () => {
    mount();
    await screen.findByText("Why this is a great match");
    expect(screen.getByText("Match Explanation")).toBeTruthy();
    expect(screen.getByText("8 of 9 required skills match")).toBeTruthy();
    expect(screen.getAllByText("Match Score").length).toBeGreaterThan(1);
    expect(screen.getByText("Match Insights")).toBeTruthy();
    for (const l of ["Skills Match", "Experience Level", "Availability Fit", "Client History", "Location Fit"]) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
    expect(screen.getByText("Review high-confidence matches for your assigned consultants!")).toBeTruthy();
    expect(screen.getByText(/I've found 78 high-confidence matches/)).toBeTruthy();
    expect(screen.getByText("Top Matches Today")).toBeTruthy();
    expect(document.querySelectorAll("[data-top-match]")).toHaveLength(5);
  });

  it("'Show high-confidence matches' applies the high-confidence filter", async () => {
    mount();
    await screen.findByText("Why this is a great match");
    fireEvent.click(screen.getByRole("button", { name: /Show high-confidence matches/ }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("score=high"))).toBe(true));
  });

  it("clicking a row loads that match's explanation", async () => {
    mount();
    await screen.findByText("Why this is a great match");
    fireEvent.click(document.querySelector('[data-match-row="3"]') as HTMLElement);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/mkt/matches/3"))).toBe(true));
  });

  it("Assign calls the BFF assign route and reloads (a record only: no submit anywhere)", async () => {
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    fireEvent.click(within(document.querySelector('[data-match-row="1"]') as HTMLElement).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/mkt/matches/1/assign"))).toBe(true));
    for (const c of calls) expect(c.url).not.toMatch(/submit|apply|send/);
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.url.includes("/mkt/matches?")).length).toBeGreaterThan(1));
  });

  it("Review opens a drawer with the match", async () => {
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    fireEvent.click(within(document.querySelector('[data-match-row="1"]') as HTMLElement).getByRole("button", { name: "Review" }));
    await screen.findByText("Review match");
    await waitFor(() => expect(document.querySelector("[data-review-body]")).toBeTruthy());
  });

  it("Compare opens a side-by-side drawer of two matches", async () => {
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    fireEvent.click(within(document.querySelector('[data-match-row="1"]') as HTMLElement).getByRole("button", { name: "Compare" }));
    await screen.findByText("Compare matches");
    await waitFor(() => expect(document.querySelectorAll("[data-compare-col]")).toHaveLength(2));
    expect(calls.some((c) => c.url.includes("/mkt/matches/compare?a=1&b="))).toBe(true);
  });

  it("says so, with no rows and no number, when there are no matches", async () => {
    vi.stubGlobal("fetch", routeFetch(() => json(200, fixture({ kpis: [], items: [], total: 0, topToday: [], explanation: null }))));
    mount();
    await screen.findByText("Run a match to see suggestions.");
    expect(screen.getByText("Showing 0–0 of 0 matches")).toBeTruthy();
    expect(screen.getByText("No suggested matches yet.")).toBeTruthy();
    expect(screen.getByText("Pick a match to see why it fits.")).toBeTruthy();
    expect(screen.getAllByText("Nothing yet")).toHaveLength(4);
  });

  it("offers a retry when the board fails to load", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(500, {})).mockResolvedValue(json(200, fixture()));
    vi.stubGlobal("fetch", f);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /retry|try again/i }));
    await screen.findByText("Showing 1–10 of 142 matches");
  });

  it("says the page isn't part of the role on 404 or 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(404, {})));
    mount();
    await screen.findByText("This page isn't part of your role");
  });
});

describe("the duplicate and cap guards (Sprint 2 / B1)", () => {
  const finding = { rule: "SAME_JOB", message: "This consultant already has the same role: Senior Java Developer at TechCorp." };
  type Sent = { url: string; method: string; body: string };
  /** Serves the board and answers every assign with `answer(matchId, body)`. */
  function stubAssign(answer: (id: number, body: string) => Response) {
    const sent: Sent[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const call = { url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : "" };
        sent.push(call);
        const m = /\/mkt\/matches\/(\d+)\/assign$/.exec(url);
        if (m && call.method === "POST") return answer(Number(m[1]), call.body);
        if (/\/mkt\/matches\/\d+$/.test(url)) return json(200, detail(Number(url.split("/").pop()) - 1));
        return json(200, fixture());
      }),
    );
    return sent;
  }
  const rowButton = (id: number) => within(document.querySelector(`[data-match-row="${id}"]`) as HTMLElement).getByRole("button", { name: "Assign" });
  const dialogNow = () => document.querySelector("[data-match-dialog=duplicate]") as HTMLElement | null;

  it("a duplicate warning opens a dialog with the findings, and Assign anyway needs a reason that is then sent with the confirmation", async () => {
    const sent = stubAssign((_, body) => (body ? json(200, row(0, "ASSIGNED")) : json(409, { error: "Duplicate. Confirm with a reason to go ahead.", code: "DUPLICATE_WARNING", findings: [finding] })));
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    fireEvent.click(rowButton(1));
    const dialog = await waitFor(() => {
      const d = dialogNow();
      expect(d).toBeTruthy();
      return d as HTMLElement;
    });
    expect(within(dialog).getByText(/already has the same role: Senior Java Developer at TechCorp/)).toBeTruthy();
    expect(within(dialog).getByText(/Alex Morgan/)).toBeTruthy();
    expect(screen.queryByText("Duplicate. Confirm with a reason to go ahead.")).toBeNull(); // the dialog is the answer, not a notice
    const go = within(dialog).getByRole("button", { name: "Assign anyway" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "The client asked for both vendors" } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await waitFor(() => expect(sent.some((c) => c.url.endsWith("/mkt/matches/1/assign") && c.body === JSON.stringify({ confirmDuplicate: true, duplicateReason: "The client asked for both vendors" }))).toBe(true));
    await waitFor(() => expect(dialogNow()).toBeNull());
    expect(sent.filter((c) => c.method === "POST").every((c) => !/submit|apply|send/.test(c.url))).toBe(true); // E1: a record only
  });

  it("the first assign is sent without a body, so a plain assign stays exactly as it was", async () => {
    const sent = stubAssign(() => json(200, row(0, "ASSIGNED")));
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    fireEvent.click(rowButton(1));
    await waitFor(() => expect(sent.some((c) => c.method === "POST")).toBe(true));
    expect(sent.find((c) => c.method === "POST")?.body).toBe("");
    expect(dialogNow()).toBeNull();
  });

  it("Cancel closes the dialog without a second call", async () => {
    const sent = stubAssign(() => json(409, { error: "Duplicate.", code: "DUPLICATE_WARNING", findings: [finding] }));
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    fireEvent.click(rowButton(1));
    const dialog = await waitFor(() => {
      const d = dialogNow();
      expect(d).toBeTruthy();
      return d as HTMLElement;
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialogNow()).toBeNull());
    expect(sent.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("a block is a plain message with nothing to confirm", async () => {
    stubAssign(() => json(409, { error: "This consultant already has the same role. Your organization does not allow this.", code: "DUPLICATE_BLOCKED", findings: [finding] }));
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    fireEvent.click(rowButton(1));
    expect(await screen.findByText("This consultant already has the same role. Your organization does not allow this.")).toBeTruthy();
    expect(dialogNow()).toBeNull();
  });

  it("the open-opportunity limit is a plain message too", async () => {
    stubAssign(() => json(409, { error: "This consultant already has 5 open opportunities, the most your organization allows (5).", code: "ASSIGNMENT_CAP" }));
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    fireEvent.click(rowButton(1));
    expect(await screen.findByText(/already has 5 open opportunities, the most your organization allows/)).toBeTruthy();
    expect(dialogNow()).toBeNull();
  });

  it("Assign selected leaves out the flagged rows and names them, never confirming for the marketer", async () => {
    const sent = stubAssign((id) => (id === 2 ? json(409, { error: "Duplicate.", code: "DUPLICATE_WARNING", findings: [finding] }) : json(200, row(0, "ASSIGNED"))));
    mount();
    await screen.findByText("Showing 1–10 of 142 matches");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Alex Morgan" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Priya Sharma" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign selected" }));
    expect(await screen.findByText(/Left out: 1 looked like a duplicate \(assign those one by one to confirm\)\./)).toBeTruthy();
    expect(dialogNow()).toBeNull();
    expect(sent.filter((c) => c.method === "POST" && c.body !== "")).toHaveLength(0); // nothing was confirmed
  });
});
