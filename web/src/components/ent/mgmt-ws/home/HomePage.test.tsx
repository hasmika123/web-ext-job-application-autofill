// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./HomePage";

const view = {
  empty: false,
  generatedAt: "2026-11-28T08:00:00Z",
  tiles: { marketersActive: 2, marketersPaused: 1, consultantsCovered: 3, openOpportunities: 12, approvalsWaiting: 2, escalations: { open: 2, high: 1, medium: 1, low: 0, snoozed: 1 } },
  pipeline: { assigned: { thisWeek: 8, lastWeek: 6, deltaPct: 33.3 }, interested: { thisWeek: 5, lastWeek: 4, deltaPct: 25 }, submitted: { thisWeek: 4, lastWeek: 5, deltaPct: -20 }, interviews: { thisWeek: 2, lastWeek: 1, deltaPct: 100 } },
  workload: [{ memberId: 103, name: "Sarah Chen", assigned: 7, capacity: 10, percent: 70, overloaded: false }],
  needsYou: [{ type: "APPROVAL", id: 501, title: "Assign Anika Rao", severity: null, who: "Mia Johnson", since: "2026-11-28T04:00:00Z", link: "/w/marketing-mgmt/approvals?id=501" }],
  activity: [{ id: 1, type: "RESUME", text: "updated a resume", consultant: "Emily Lawson", actor: "Mia Johnson", at: "2026-11-28T04:00:00Z" }],
};

const hrefs = { team: "/w/marketing-mgmt/team", pipeline: "/w/marketing-mgmt/pipeline", workload: "/w/marketing-mgmt/workload", escalations: "/w/marketing-mgmt/escalations" };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => vi.stubGlobal("fetch", reply(200, view)));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Marketing Manager Home", () => {
  it("draws the six team tiles and the manager sections from the API response", async () => {
    render(<HomePage orgId={2} orgName="Acme" firstName="Sarah" hrefs={hrefs} />);
    await screen.findByText("Needs you");
    expect(document.querySelectorAll("[data-mgmt-tiles] > *")).toHaveLength(6);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Assign Anika Rao")).toBeTruthy();
    expect(screen.getAllByText("Team pipeline this week compared with last week").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Sarah Chen")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review escalations" }).getAttribute("href")).toBe("/w/marketing-mgmt/escalations");
  });

  it("shows the honest empty state without rendering made-up team sections", async () => {
    vi.stubGlobal("fetch", reply(200, { ...view, empty: true, tiles: { ...view.tiles, marketersActive: 0, marketersPaused: 0, consultantsCovered: 0, openOpportunities: 0, approvalsWaiting: 0, escalations: { open: 0, high: 0, medium: 0, low: 0, snoozed: 0 } } }));
    render(<HomePage orgId={2} orgName="Acme" firstName="Sarah" hrefs={hrefs} />);
    await waitFor(() => expect(screen.getByText("Build your team")).toBeTruthy());
    expect(screen.queryByText("Needs you")).toBeNull();
    expect(screen.getByRole("link", { name: "Open Team" }).getAttribute("href")).toBe("/w/marketing-mgmt/team");
  });
});
