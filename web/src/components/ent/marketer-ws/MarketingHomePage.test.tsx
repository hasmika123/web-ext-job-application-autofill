// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing" }));

import { parseHome } from "@/lib/ent/marketer-ws/home";
import MarketingHomePage from "./MarketingHomePage";

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW - ms).toISOString();
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [1, 2, 2, 3, 4, value] });

const fixture = (over: Record<string, unknown> = {}) => ({
  kpis: [kpi("assigned", 28, 12), kpi("profilesReady", 24, 9), kpi("newMatches", 56, 18), kpi("pendingSubmissions", 18, -22), kpi("upcomingInterviews", 12, 33), kpi("overdueFollowups", 6, -40)],
  talent: [
    { id: 1, name: "Alex Morgan", primarySkill: "Java Developer", availability: { label: "Available", tone: "green" }, resume: { label: "Updated", state: "UPDATED" }, activeApps: 3, nextAction: { label: "Submit to Job", tone: "blue" } },
    { id: 4, name: "Emily Lawson", primarySkill: "Project Manager", availability: { label: "1 month", tone: "blue" }, resume: { label: "Needs Update", state: "NEEDS_UPDATE" }, activeApps: 1, nextAction: { label: "Request Resume", tone: "red" } },
  ],
  streams: [{ source: "LinkedIn Jobs", status: "Active", newOpenings: 124, lastSyncAt: iso(10 * 60e3) }],
  openings: [{ id: 9, title: "Senior Java Developer", client: "TechCorp", location: "New York, NY", matchPct: 92 }, { id: 10, title: "Project Manager (PMP)", client: "NextGen", location: "Remote", matchPct: 78 }],
  pipeline: { total: 362, deltaPct: 18, stages: [{ key: "review", label: "Review", count: 142, pct: 32 }, { key: "submitted", label: "Submitted", count: 108, pct: 25 }] },
  tasks: [{ id: 1, title: "Follow up with TechCorp recruiter", sub: "Alex Morgan - Java Developer", dueAt: "2026-10-13T09:00:00", kind: "CALL", done: false }],
  interviews: [{ id: 1, startsAt: "2026-10-13T10:00:00", consultant: "Alex Morgan", role: "Java Developer", client: "TechCorp", type: "1st Round", status: "Confirmed" }],
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
  it("draws the six KPI tiles with value and delta", async () => {
    mount();
    const tile = await waitFor(() => {
      const t = document.querySelector('[data-stat-tile="assigned"]') as HTMLElement;
      expect(within(t).getByText("28")).toBeTruthy();
      return t;
    });
    expect(tile.textContent).toContain("12%");
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(6);
    expect((document.querySelector('[data-stat-tile="pendingSubmissions"]') as HTMLElement).textContent).toContain("22%");
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
  });

  it("shows openings, the pipeline total, tasks, interviews and activity", async () => {
    mount();
    await screen.findByText("Senior Java Developer");
    expect(screen.getByText("92%")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Assign" })).toHaveLength(2);
    expect(screen.getByText("362")).toBeTruthy();
    expect(document.querySelector("[data-funnel]")).toBeTruthy();
    expect(screen.getByText("Follow up with TechCorp recruiter")).toBeTruthy();
    expect(document.querySelector("[data-interview-row]")).toBeTruthy();
    expect(screen.getByText("Resume updated with new certifications")).toBeTruthy();
  });

  it("says so, with no rows and no number, when a section is empty", async () => {
    vi.stubGlobal("fetch", reply(200, fixture({ talent: [], streams: [], openings: [], pipeline: null, tasks: [], interviews: [], activity: [], kpis: [] })));
    mount();
    await screen.findByText("No consultants are assigned to you yet.");
    expect(screen.getByText("No job streams are connected yet.")).toBeTruthy();
    expect(screen.getByText("No submissions in this period.")).toBeTruthy();
    expect(screen.getAllByText("Nothing yet")).toHaveLength(6);
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

describe("parseHome", () => {
  it("is null for a non-object and empties a malformed section", () => {
    expect(parseHome(null)).toBeNull();
    const v = parseHome({ kpis: "nope", talent: [{ id: 1, name: "A" }] });
    expect(v?.kpis).toEqual([]);
    expect(v?.talent[0].availability.tone).toBe("blue");
  });
});
