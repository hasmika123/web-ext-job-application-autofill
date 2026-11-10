// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing" }));

import { dayOffset, parseHome } from "@/lib/ent/marketer-ws/home";
import MarketingHomePage from "./MarketingHomePage";

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW - ms).toISOString();
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [1, 2, 2, 3, 4, value] });
/** A moment `days` calendar days from today at 10:00 in the viewer's clock, as the API writes it. */
const at = (days: number, h = 10) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

const fixture = (over: Record<string, unknown> = {}) => ({
  kpis: [kpi("assigned", 28, 12), kpi("profilesReady", 24, 9), kpi("newMatches", 56, 18), kpi("pendingSubmissions", 18, -22), kpi("upcomingInterviews", 12, 33), kpi("overdueFollowups", 6, -40)],
  talent: [
    { id: 1, name: "Alex Morgan", primarySkill: "Java Developer", availability: { label: "Available", tone: "green" }, resume: { label: "Updated", state: "UPDATED" }, activeApps: 3, nextAction: { label: "Submit to Job", tone: "blue" } },
    { id: 4, name: "Emily Lawson", primarySkill: "Project Manager", availability: { label: "1 month", tone: "blue" }, resume: { label: "Needs Update", state: "NEEDS_UPDATE" }, activeApps: 1, nextAction: { label: "Request Resume", tone: "red" } },
  ],
  streams: [{ source: "LinkedIn Jobs", status: "Active", newOpenings: 124, lastSyncAt: iso(10 * 60e3) }],
  openings: [{ id: 9, title: "Senior Java Developer", client: "TechCorp", location: "New York, NY", matchPct: 92 }, { id: 10, title: "Project Manager (PMP)", client: "NextGen", location: "Remote", matchPct: 78 }, { id: 11, title: "Data Engineer", client: "Acme", location: "Austin, TX", matchPct: 0 }],
  pipeline: { total: 362, deltaPct: 18, stages: [{ key: "review", label: "Review", count: 142, pct: 32 }, { key: "submitted", label: "Submitted", count: 108, pct: 25 }] },
  tasks: [{ id: 1, title: "Follow up with TechCorp recruiter", sub: "Alex Morgan - Java Developer", dueAt: "2026-10-13T09:00:00", kind: "CALL", done: false }],
  interviews: [
    { id: 1, startsAt: at(0), consultant: "Alex Morgan", role: "Java Developer", client: "TechCorp", type: "1st Round", status: "Confirmed" },
    { id: 2, startsAt: at(1), consultant: "Emily Lawson", role: "Project Manager", client: "NextGen", type: "2nd Round", status: "Confirmed" },
    { id: 3, startsAt: at(5), consultant: "David Kim", role: "QA Lead", client: "Acme", type: "Final", status: "Confirmed" },
  ],
  activity: [{ id: 1, actor: "Emily Lawson", text: "updated resume", detail: "Resume updated with new certifications", at: iso(2 * 3600e3) }],
  ...over,
});

const HREFS = { talent: "/w/marketing/talent", jobs: "/w/marketing/jobs", matches: "/w/marketing/matches", opportunities: "/w/marketing/opportunities", followups: "/w/marketing/followups", interviews: "/w/marketing/interviews", activity: "/w/marketing/activity" };
const mount = () => render(<MarketingHomePage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} />);
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => vi.stubGlobal("fetch", reply(200, fixture())));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketingHomePage", () => {
  it("draws four tiles, with the value and no sparkline or delta", async () => {
    mount();
    const tile = await waitFor(() => {
      const t = document.querySelector('[data-stat-tile="assigned"]') as HTMLElement;
      expect(within(t).getByText("28")).toBeTruthy();
      return t;
    });
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(4);
    expect(["assigned", "newMatches", "pendingSubmissions", "overdueFollowups"].every((k) => document.querySelector(`[data-stat-tile="${k}"]`))).toBe(true);
    expect(tile.textContent).not.toContain("12%");
    expect(tile.querySelector("svg[data-sparkline], [data-sparkline]")).toBeNull();
    expect(screen.queryByText("Ask a question")).toBeNull();
    expect(screen.queryByText("Job stream monitor", { exact: false })).toBeNull();
    expect(screen.queryByText("Submission pipeline", { exact: false })).toBeNull();
  });

  it("puts Today first: follow-ups due, and only today's and tomorrow's interviews", async () => {
    mount();
    await screen.findByText("Follow up with TechCorp recruiter");
    const cards = Array.from(document.querySelectorAll("[data-home-card]")).map((c) => c.getAttribute("data-home-card"));
    expect(cards).toEqual(["today", "openings", "talent", "activity"]);
    const today = document.querySelector('[data-home-card="today"]') as HTMLElement;
    expect(within(today).getByText("Follow-ups due today")).toBeTruthy();
    expect(within(today).getByText("Interviews today and tomorrow")).toBeTruthy();
    expect(today.querySelector('[data-interview-row="1"]')).toBeTruthy();
    expect(today.querySelector('[data-interview-row="2"]')).toBeTruthy();
    expect(today.querySelector('[data-interview-row="3"]')).toBeNull();
    expect((today.querySelector('[data-interview-row="1"]') as HTMLElement).textContent).toContain("Today");
    expect((today.querySelector('[data-interview-row="2"]') as HTMLElement).textContent).toContain("Tomorrow");
  });

  it("lists assigned talent with next-action buttons that only open a page (E1: nothing submits)", async () => {
    mount();
    const row = await waitFor(() => {
      const r = document.querySelector('[data-talent-row="1"]') as HTMLElement;
      expect(r).toBeTruthy();
      return r;
    });
    const link = within(row).getByRole("link", { name: "Submit to Job" });
    expect(link.getAttribute("href")).toBe("/w/marketing/talent?consultant=1");
    expect(screen.getByText("Needs Update")).toBeTruthy();
    expect(Array.from(row.closest("table")!.querySelectorAll("th")).map((th) => th.textContent)).toEqual(["Consultant", "Availability", "Resume", "Next action"]);
  });

  it("shows openings (an unscored one reads Not scored), tasks, interviews and activity", async () => {
    mount();
    await screen.findByText("Senior Java Developer");
    expect(screen.getByText("92%")).toBeTruthy();
    expect(screen.getByText("Not scored")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Assign" })).toHaveLength(3);
    expect(document.querySelector("[data-funnel]")).toBeNull();
    expect(screen.getByText("Follow up with TechCorp recruiter")).toBeTruthy();
    expect(document.querySelector("[data-interview-row]")).toBeTruthy();
    expect(screen.getByText("Resume updated with new certifications")).toBeTruthy();
  });

  // PLT-42 (390 px): a table wider than its card must scroll inside an overflow box, never widen the page. jsdom has no layout, so this
  // checks the structure; the story suite measures the real overflow at 390 px.
  it("keeps every table inside its own horizontal-scroll box so the page never scrolls sideways on a phone", async () => {
    mount();
    await screen.findByText("Senior Java Developer");
    const tables = Array.from(document.querySelectorAll("[data-marketing-home] table"));
    expect(tables.length).toBeGreaterThanOrEqual(2);
    for (const t of tables) expect(t.closest(".overflow-x-auto"), "a table sits in an overflow-x-auto box").toBeTruthy();
  });

  it("says so, with no rows and no number, when a section is empty", async () => {
    vi.stubGlobal("fetch", reply(200, fixture({ talent: [], streams: [], openings: [], pipeline: null, tasks: [], interviews: [], activity: [], kpis: [] })));
    mount();
    await screen.findByText("No consultants are assigned to you yet.");
    expect(screen.getByText("No follow-ups due and no interviews today or tomorrow.")).toBeTruthy();
    expect(screen.getAllByText("Nothing yet")).toHaveLength(4);
  });

  it("offers a retry when the call fails and the denied state on 403", async () => {
    vi.stubGlobal("fetch", reply(500, {}));
    mount();
    await screen.findByText(/didn't load/i);
    cleanup();
    vi.stubGlobal("fetch", reply(403, {}));
    mount();
    await screen.findByText("This page isn't part of your role");
  });
});

describe("dayOffset", () => {
  it("counts calendar days in the viewer's clock", () => {
    const noon = new Date(2026, 9, 19, 12).getTime();
    expect(dayOffset(new Date(2026, 9, 19, 6).toISOString(), noon)).toBe(0);
    expect(dayOffset(new Date(2026, 9, 20, 23).toISOString(), noon)).toBe(1);
    expect(dayOffset(new Date(2026, 9, 18, 23).toISOString(), noon)).toBe(-1);
    expect(dayOffset("not a date", noon)).toBeNull();
  });
});

describe("parseHome", () => {
  it("is null for a non-object and empties a malformed section", () => {
    expect(parseHome(null)).toBeNull();
    const v = parseHome({ kpis: "nope", talent: [{ id: 1, name: "A" }] });
    expect(v?.kpis).toEqual([]);
    expect(v?.talent[0].availability.tone).toBe("blue");
  });
});
