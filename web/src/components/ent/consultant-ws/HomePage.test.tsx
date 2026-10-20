// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant" }));

import ConsultantHomePage from "./HomePage";

const tile = (value: number) => ({ value, previous: 1, deltaPct: 200, sparkline: [1, 2, 3], sample: false });

const body = () => ({
  orgId: 2,
  generatedAt: "2026-10-13T20:00:00Z",
  me: { consultantId: 1, name: "Anika Rao", jobTitle: null },
  tiles: {
    jobMatches: tile(9),
    assignedOpportunities: tile(3),
    activeApplications: tile(5),
    upcomingInterviews: tile(3),
    submissionsPending: { ...tile(3), sample: true },
    activePlacement: { value: 0, label: null },
  },
  recommendedMatches: [{ matchId: 1, requirementId: 1, title: "Match role", company: "MatchCo", score: 0, location: null, workMode: null, employment: null }],
  assignedOpportunities: [
    { matchId: 11, requirementId: 1, title: "Figma role", company: "Figma", status: "REVIEW_NEEDED", assignedAt: "2026-10-10" },
    { matchId: 12, requirementId: 2, title: "Ramp role", company: "Ramp", status: "AWAITING_APPROVAL", assignedAt: "2026-10-09" },
    { matchId: 13, requirementId: 3, title: "Rover role", company: "Rover", status: "INTERESTED", assignedAt: "2026-10-08" },
  ],
  applications: [{ id: 5, code: "A-5", title: "Backend role", company: "Acme", stage: "SUBMITTED", closedReason: null, appliedOn: "2026-10-01" }],
  interviews: [],
  resumeStrength: { percent: 60, hasResume: true, checks: [] },
  todaysFocus: { date: "2026-10-13", items: [{ key: "availability", label: "Update availability" }] },
  tasks: [{ id: 1, title: "Task one", dueOn: "2026-10-13", priority: "HIGH", status: "NOT_STARTED" }],
  marketerMessages: { sample: true, items: [] },
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body()), { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function ready() {
  render(<ConsultantHomePage orgId={2} firstName="Anika" />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  await screen.findByText("Opportunities needing a response");
}

describe("Consultant Home", () => {
  it("shows four tiles that name something to act on, with no sparkline, delta or sample marker", async () => {
    await ready();
    const tiles = document.querySelectorAll("[data-stat-tile]");
    expect([...tiles].map((t) => t.getAttribute("data-stat-tile"))).toEqual(["assignedOpportunities", "activeApplications", "upcomingInterviews", "submissionsPending"]);
    expect(screen.getByLabelText("Opportunities awaiting your response").querySelector("[data-tile-value]")?.textContent).toBe("2");
    expect(document.querySelector("[data-delta]")).toBeNull();
    expect(document.querySelector("[data-stat-tile] svg[data-sparkline], [data-stat-tile] [data-sample]")).toBeNull();
  });

  it("draws Today, the opportunities needing a response, interviews and applications, and nothing else", async () => {
    await ready();
    const cards = [...document.querySelectorAll("[data-home-card]")].map((c) => c.getAttribute("data-home-card"));
    expect(cards).toEqual(["home-focus", "home-assigned", "home-interviews", "home-applications"]);
    expect(screen.queryByText(/Quick Actions/)).toBeNull();
    expect(screen.queryByText(/Ask a question/)).toBeNull();
    expect(screen.queryByText("Recommended Job Matches")).toBeNull();
    expect(screen.queryByText("Resume Strength")).toBeNull();
  });

  it("lists only the opportunities still waiting for an answer, each with a Respond link", async () => {
    await ready();
    expect(screen.getByRole("link", { name: "Respond to Figma role" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Respond to Ramp role" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Respond to Rover role" })).toBeNull();
  });
});
