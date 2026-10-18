// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => "/w/marketing/talent" }));

import { ShellSlotContext } from "@/components/ent/shell/ShellContext";
import TalentPage from "./TalentPage";

const setHeader = vi.fn();
const slot = { setHeader, claimMascot: vi.fn(), claimHelp: vi.fn() } as never;

const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [1, 2, 2, 3, 4, value] });
const person = (id: number, name: string, title: string, skill: string, years: number, location: string, avail: [string, string, string], resume: [string, string], apps: number, jobs: number) => ({
  id, name, avatarUrl: null, title, primarySkill: skill, yearsExperience: years, location,
  availability: { code: avail[0], label: avail[1], tone: avail[2] },
  resume: { state: resume[0], label: resume[1] }, activeApps: apps, assignedJobs: jobs,
});
const UP: [string, string] = ["UP_TO_DATE", "Up to date"];
const NEEDS: [string, string] = ["NEEDS_UPDATE", "Needs Update"];
const NOW: [string, string, string] = ["AVAILABLE_NOW", "Available Now", "green"];
const ROWS = [
  person(1, "Alex Morgan", "Senior Java Developer", "Java / Spring", 8, "New York, NY", NOW, UP, 5, 3),
  person(2, "Priya Sharma", "Business Analyst", "Business Analysis", 6, "Austin, TX", NOW, UP, 3, 2),
  person(3, "Michael Park", "AWS Engineer", "AWS / Cloud", 7, "Seattle, WA", ["SOON", "1 week", "blue"], UP, 4, 4),
  person(4, "Emily Lawson", "Project Manager", "Program Management", 9, "Chicago, IL", ["SOON", "2 weeks", "blue"], NEEDS, 2, 3),
  person(5, "David Kim", "Data Analyst", "Data Analytics", 4, "Remote", NOW, UP, 6, 2),
  person(6, "Sophia Patel", "Salesforce Consultant", "Salesforce", 6, "Denver, CO", ["SOON", "1 month", "blue"], UP, 3, 1),
  person(7, "James Chen", "DevOps Engineer", "DevOps / Kubernetes", 5, "San Francisco, CA", NOW, NEEDS, 5, 4),
  person(8, "Olivia Brooks", "UX Designer", "UX / UI Design", 7, "Boston, MA", ["IN_INTERVIEW", "In Interview", "violet"], UP, 2, 2),
];
const fixture = (over: Record<string, unknown> = {}) => ({
  kpis: [kpi("assigned", 28, 12), kpi("availableNow", 12, 33), kpi("needUpdates", 6, -40), kpi("activeInterviews", 8, 60), kpi("pendingApprovals", 5, -29)],
  counts: { all: 28, availableNow: 12, inInterview: 8, needsUpdate: 6, pendingApproval: 5 },
  facets: { skills: ["Java", "AWS"], locations: ["Austin, TX", "Remote"] },
  items: ROWS, total: 28, page: 0, size: 8,
  cards: {
    available: [ROWS[0], ROWS[4], ROWS[6], person(9, "Lisa Wong", "QA Automation Engineer", "QA", 6, "Austin, TX", NOW, UP, 1, 1)],
    needsUpdate: [ROWS[3], ROWS[6], person(10, "Kevin Liu", "Data Engineer", "Data", 7, "Seattle, WA", ["SOON", "2 weeks", "blue"], NEEDS, 1, 1), person(11, "Maria Garcia", "Solutions Architect", "Arch", 10, "Dallas, TX", ["SOON", "1 month", "blue"], NEEDS, 1, 1)],
    inInterview: [ROWS[7], person(12, "Ryan Taylor", "Cloud Architect", "Cloud", 8, "New York, NY", ["IN_INTERVIEW", "In Interview", "violet"], UP, 1, 1), person(13, "Nina Kapoor", "Business Analyst", "BA", 5, "Atlanta, GA", ["IN_INTERVIEW", "In Interview", "violet"], UP, 1, 1), person(14, "Daniel Wright", "Product Owner", "PM", 6, "Remote", ["IN_INTERVIEW", "In Interview", "violet"], UP, 1, 1)],
  },
  views: [{ id: 5, name: "Available this week", filters: { q: "", status: "AVAILABLE_NOW", skill: "", location: "", experience: "", availability: "" } }],
  canAddConsultant: true,
  ...over,
});
const DETAIL = {
  id: 1, name: "Alex Morgan", avatarUrl: null, title: "Senior Java Developer", headline: "Backend engineer", yearsExperience: 8, location: "New York, NY", workMode: "HYBRID",
  availability: { code: "AVAILABLE_NOW", label: "Available Now", tone: "green" }, resume: { state: "UP_TO_DATE", label: "Up to date" }, profileCompleteness: 80, skills: ["Java", "Spring"],
  resumes: [{ id: 10, name: "Alex - Senior Java Developer", version: 3, primary: true, approval: "APPROVED", updatedAt: "2026-10-01T00:00:00Z" }],
  applications: [{ code: "APP-2026-001", jobTitle: "Senior Java Developer", client: "TechCorp", stage: "UNDER_REVIEW", nextAction: "Follow up" }],
  interviews: [{ scheduledAt: "2026-10-20T15:00:00Z", round: "Technical", client: "TechCorp", durationMinutes: 45 }],
  assignedJobs: [{ jobId: 11, title: "Data Analyst", client: "Global Media", matchPct: 92 }], consent: "SUMMARY",
};

const HREFS = { talent: "/w/marketing/talent", matches: "/w/marketing/matches", resumes: "/w/marketing/resumes", interviews: "/w/marketing/interviews", followups: "/w/marketing/followups", applications: "/w/marketing/applications" };
const mount = (hrefs: Record<string, string | null> = HREFS) => render(<ShellSlotContext.Provider value={slot}><TalentPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={hrefs} /></ShellSlotContext.Provider>);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
const OVERVIEW = {
  id: 1, name: "Alex Morgan", title: "Senior Java Developer", headline: "Backend engineer", yearsExperience: 8, workMode: "HYBRID",
  availability: { code: "AVAILABLE_NOW", label: "Available Now", tone: "green" }, resume: { state: "UP_TO_DATE", label: "Up to date" }, profileCompleteness: 80,
  contact: { workEmail: "alex.morgan@acme.example", location: "New York, NY", workAuthorization: "Citizen", phone: "(555) 010-0142", timeZone: "America/Chicago", preferredContact: "PHONE" }, skills: ["Java", "Spring"],
  placement: { placementId: 3, roleTitle: "Platform Engineer", client: "TechCorp", startDate: "2026-03-02", status: "ACTIVE" },
  resumes: [{ id: 10, name: "Alex - Senior Java Developer", version: 3, primary: true, approval: "APPROVED", updatedAt: "2026-10-01T00:00:00Z" }],
  applications: {
    total: 4, open: 3, byStage: [{ key: "applied", label: "Applied", count: 2 }, { key: "interviewing", label: "Interviewing", count: 1 }, { key: "hired", label: "Hired", count: 0 }],
    recent: [{ code: "APP-1", jobTitle: "Staff Engineer", client: "Globex", stage: "Applied", stageKey: "applied", nextAction: "Follow up", updatedAt: "2026-10-14T10:00:00Z", updatedBy: { label: "Sam Spec", relation: "marketer", kind: "PERSON", memberId: 9 } }],
  },
  interviews: [],
};
const stub = (board: () => Response) => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (/\/mkt\/talent\/\d+\/overview$/.test(url)) return json(200, OVERVIEW);
    if (/\/mkt\/talent\/views$/.test(url) && init?.method === "POST") return json(201, { id: 9, name: JSON.parse(String(init.body)).name, filters: { status: "NEEDS_UPDATE" } });
    if (/\/mkt\/talent\/views\/\d+$/.test(url) && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (/\/mkt\/talent\/\d+$/.test(url)) return json(200, DETAIL);
    return board();
  });
  vi.stubGlobal("fetch", fetchMock);
};

const ready = () => waitFor(() => expect(document.querySelector('[data-talent-row="1"]')).toBeTruthy());

beforeEach(() => stub(() => json(200, fixture())));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("TalentPage: the board", () => {
  it("sets the board's title and subtitle", async () => {
    mount();
    await screen.findByText("My Assigned Consultants");
    expect(setHeader).toHaveBeenCalledWith({ title: "My Assigned Talent", subtitle: "Manage your assigned consultants, keep their profiles up to date, and drive them to new opportunities." });
  });

  it("draws the five KPI tiles with the board's titles, values and deltas", async () => {
    mount();
    const tile = await waitFor(() => {
      const t = document.querySelector('[data-stat-tile="assigned"]') as HTMLElement;
      expect(within(t).getByText("28")).toBeTruthy();
      return t;
    });
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(5);
    for (const title of ["Total Assigned Consultants", "Available Now", "Profiles Need Updates", "Active Interviews", "Pending Approvals"]) {
      expect(document.querySelector(`[data-talent-tiles] [aria-label="${title}"]`), title).toBeTruthy();
    }
    expect(tile.textContent).toContain("12%");
    expect((document.querySelector('[data-stat-tile="needUpdates"]') as HTMLElement).textContent).toContain("40%");
    expect((document.querySelector('[data-stat-tile="activeInterviews"]') as HTMLElement).textContent).toContain("60%");
  });

  it("draws the consultants card: count, search, Filters, Saved Views, Add Consultant, chips with counts and the four dropdowns", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { name: /My Assigned Consultants\s*\(28\)/ })).toBeTruthy();
    expect(screen.getByPlaceholderText("Search by name, skill, or location...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saved Views" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add Consultant" }).getAttribute("href")).toBe("/w/admin/consultants");
    for (const chip of ["All (28)", "Available Now (12)", "In Interview (8)", "Needs Update (6)", "Pending Approval (5)"]) expect(screen.getByRole("button", { name: chip }), chip).toBeTruthy();
    for (const dd of ["Skill", "Location", "Experience", "Availability"]) expect(screen.getAllByRole("button", { name: new RegExp(dd) }).length, dd).toBeGreaterThan(0);
  });

  it("draws the table's columns and the board's rows", async () => {
    mount();
    await ready();
    const heads = Array.from(document.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
    for (const col of ["Consultant", "Primary Skill", "Experience", "Location", "Availability", "Resume Status", "Active Apps", "Assigned Jobs", "Actions"]) expect(heads, col).toContain(col);
    expect(document.querySelectorAll("[data-talent-row]")).toHaveLength(8);
    const alex = document.querySelector('[data-talent-row="1"]') as HTMLElement;
    for (const text of ["Alex Morgan", "Senior Java Developer", "Java / Spring", "8 yrs", "New York, NY", "Available Now", "Up to date", "5", "3"]) expect(alex.textContent, text).toContain(text);
    expect(within(alex).getByRole("button", { name: "View Profile" })).toBeTruthy();
    expect((document.querySelector('[data-talent-row="4"]') as HTMLElement).textContent).toContain("Needs Update");
    expect((document.querySelector('[data-talent-row="3"]') as HTMLElement).textContent).toContain("1 week");
    expect((document.querySelector('[data-talent-row="8"]') as HTMLElement).textContent).toContain("In Interview");
    expect(screen.getByText("Showing 1-8 of 28")).toBeTruthy();
  });

  it("draws the three bottom cards with their counts and row buttons", async () => {
    mount();
    await ready();
    const avail = document.querySelector('[data-talent-card="available"]') as HTMLElement;
    expect(avail.textContent).toMatch(/Available Now\s*\(12\)/);
    expect(within(avail).getAllByRole("button", { name: "View" })).toHaveLength(4);
    expect(avail.textContent).toContain("Lisa Wong");
    const needs = document.querySelector('[data-talent-card="needs-update"]') as HTMLElement;
    expect(needs.textContent).toMatch(/Needs Resume Update\s*\(6\)/);
    const updates = within(needs).getAllByRole("link", { name: "Update" });
    expect(updates).toHaveLength(4);
    expect(updates[0].getAttribute("href")).toBe("/w/marketing/resumes?consultant=4");
    const iv = document.querySelector('[data-talent-card="in-interview"]') as HTMLElement;
    expect(iv.textContent).toMatch(/In Interview Process\s*\(8\)/);
    expect(iv.textContent).toContain("Daniel Wright");
  });

  it("draws the bee help card and the Quick Actions list that open the sibling pages (E1: nothing submits)", async () => {
    mount();
    await ready();
    expect(screen.getByText("Find the right opportunities for your assigned talent!")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ask a question/ })).toBeTruthy();
    const quick = document.querySelector('[data-talent-card="quick-actions"]') as HTMLElement;
    expect(within(quick).getByRole("link", { name: "Find Job Matches" }).getAttribute("href")).toBe("/w/marketing/matches");
    expect(within(quick).getByRole("link", { name: "Bulk Update Resumes" }).getAttribute("href")).toBe("/w/marketing/resumes");
    expect(within(quick).getByRole("link", { name: "Schedule Interviews" }).getAttribute("href")).toBe("/w/marketing/interviews");
    expect(within(quick).getByRole("link", { name: "Send Follow-ups" }).getAttribute("href")).toBe("/w/marketing/followups");
    expect(within(quick).getByRole("link", { name: "Generate Talent Report" }).getAttribute("href")).toBe("/w/marketing/applications");
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });

  it("disables Add Consultant (with a reason) when the role has no consultants.edit", async () => {
    stub(() => json(200, fixture({ canAddConsultant: false })));
    mount();
    await ready();
    expect(screen.queryByRole("link", { name: "Add Consultant" })).toBeNull();
    const btn = screen.getByRole("button", { name: "Add Consultant" });
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("TalentPage: filters, views, drawer", () => {
  it("a status chip asks the API for that status and shows it pressed", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Needs Update (6)" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("status=NEEDS_UPDATE"))).toBe(true));
    expect(screen.getByRole("button", { name: "Needs Update (6)" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("typing in the search asks the API once typing rests", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByPlaceholderText("Search by name, skill, or location..."), { target: { value: "java" } });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("q=java"))).toBe(true), { timeout: 2000 });
  });

  it("applies a saved view, saves the current filters under a name and never calls anything but this page's routes", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Needs Update (6)" }));
    fireEvent.click(screen.getByRole("button", { name: "Saved Views" }));
    fireEvent.click(await screen.findByRole("button", { name: "Available this week" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("status=AVAILABLE_NOW"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Saved Views" }));
    fireEvent.change(await screen.findByPlaceholderText("View name"), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/mkt/talent/views") && (c[1] as RequestInit)?.method === "POST")).toBe(true));
    for (const c of fetchMock.mock.calls) expect(String(c[0])).toMatch(/^\/api\/orgs\/2\/mkt\/talent/);
  });

  it("View Profile opens the right-hand drawer with the consultant's summary and no contact details", async () => {
    mount();
    await ready();
    fireEvent.click(within(document.querySelector('[data-talent-row="1"]') as HTMLElement).getByRole("button", { name: "View Profile" }));
    const drawer = await waitFor(() => {
      const d = document.querySelector("[data-talent-drawer]") as HTMLElement;
      expect(within(d).getByText("Spring")).toBeTruthy();
      return d;
    });
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/orgs/2/mkt/talent/1")).toBe(true);
    expect(drawer.textContent).toContain("Summary");
    expect(drawer.textContent).toContain("Senior Java Developer");
    expect(drawer.textContent).toContain("Data Analyst");
    expect(drawer.textContent).not.toMatch(/ssn|passport|date of birth/i);
  });

  it("View Profile shows the assigned consultant's contact, placement, resumes and applications with who updated them", async () => {
    mount();
    await ready();
    fireEvent.click(within(document.querySelector('[data-talent-row="1"]') as HTMLElement).getByRole("button", { name: "View Profile" }));
    const drawer = await waitFor(() => {
      const d = document.querySelector("[data-talent-drawer]") as HTMLElement;
      expect(d.querySelector("[data-talent-contact]")).toBeTruthy();
      return d;
    });
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/orgs/2/mkt/talent/1/overview")).toBe(true);
    expect(drawer.textContent).toContain("alex.morgan@acme.example");
    expect(drawer.textContent).toContain("Citizen");
    expect(drawer.textContent).toContain("(555) 010-0142");
    expect(drawer.textContent).toContain("Central (Chicago)");
    expect(drawer.querySelector('a[href="tel:5550100142"]')).toBeTruthy();
    expect(drawer.textContent).toContain("Platform Engineer");
    expect(drawer.textContent).toContain("TechCorp");
    expect(drawer.textContent).toContain("Applied 2");
    expect(drawer.textContent).not.toContain("Hired 0");
    expect(drawer.querySelector("[data-updated-by]")?.textContent).toContain("by Sam Spec");
    expect(drawer.textContent).not.toMatch(/ssn|passport|date of birth|\$/i);
  });
});

describe("TalentPage: states", () => {
  it("says so, with no rows and no number, when nobody is assigned", async () => {
    stub(() => json(200, fixture({ kpis: [], items: [], total: 0, counts: { all: 0, availableNow: 0, inInterview: 0, needsUpdate: 0, pendingApproval: 0 }, cards: { available: [], needsUpdate: [], inInterview: [] }, views: [] })));
    mount();
    await screen.findByText("No consultants are assigned to you yet.");
    expect(screen.getAllByText("Nothing yet")).toHaveLength(5);
    expect(screen.getByText("No one is available right now.")).toBeTruthy();
    expect(screen.getByText("Every resume is up to date.")).toBeTruthy();
    expect(screen.getByText("No one is in the interview process.")).toBeTruthy();
  });

  it("offers a retry when the call fails", async () => {
    stub(() => json(500, {}));
    mount();
    await screen.findByText(/didn't load/i);
    stub(() => json(200, fixture()));
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    await ready();
  });

  it("shows 'isn't part of your role' on 403 and 404", async () => {
    for (const status of [403, 404]) {
      stub(() => json(status, {}));
      mount();
      await screen.findByText("This page isn't part of your role");
      cleanup();
    }
  });
});
