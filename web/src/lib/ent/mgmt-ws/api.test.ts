import { afterEach, describe, expect, it, vi } from "vitest";
import { mgmtApi, parseAssignments, parseHome, parsePipeline, parseTeam } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("Marketing Manager API contracts", () => {
  it("parses the Home contract without inventing missing sections", () => {
    const view = parseHome({
      empty: false,
      generatedAt: "2026-11-28T08:00:00Z",
      tiles: { marketersActive: 2, marketersPaused: 1, consultantsCovered: 8, openOpportunities: 12, approvalsWaiting: 3, escalations: { open: 2, high: 1, medium: 1, low: 0, snoozed: 1 } },
      pipeline: { assigned: { thisWeek: 4, lastWeek: 2, deltaPct: 100 }, interested: {}, submitted: {}, interviews: {} },
      workload: [{ memberId: 4, name: "Mia", assigned: 4, capacity: 5, percent: 80, overloaded: false }],
      needsYou: [],
      activity: [],
    });
    expect(view?.tiles.consultantsCovered).toBe(8);
    expect(view?.pipeline.assigned.deltaPct).toBe(100);
    expect(view?.pipeline.interested.thisWeek).toBe(0);
    expect(parseHome({ tiles: {} })).toBeNull();
  });

  it("keeps the manager API under its own BFF path", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ empty: true, generatedAt: "now", tiles: { marketersActive: 0, marketersPaused: 0, consultantsCovered: 0, openOpportunities: 0, approvalsWaiting: 0, escalations: { open: 0, high: 0, medium: 0, low: 0, snoozed: 0 } }, pipeline: { assigned: {}, interested: {}, submitted: {}, interviews: {} }, workload: [], needsYou: [], activity: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await mgmtApi.home(2);
    expect(result.kind).toBe("OK");
    expect(fetchMock).toHaveBeenCalledWith("/api/orgs/2/mgmt/home", expect.any(Object));
  });

  it("parses the team and pipeline list shapes used by the page cards", () => {
    expect(parseTeam({ items: [{ memberId: 3, name: "Mia", status: "ACTIVE" }], total: 1 })?.items[0]).toMatchObject({ memberId: 3, name: "Mia", status: "ACTIVE" });
    expect(parsePipeline({ columns: [{ key: "ASSIGNED", label: "Assigned", count: 1, items: [{ id: 9, consultant: "Anika", job: "Engineer", marketer: { memberId: 7, name: "Mia" } }] }] })?.columns[0].items[0]).toMatchObject({ id: 9, consultant: "Anika", job: "Engineer", marketer: { id: 7, name: "Mia" } });
    expect(parseAssignments({ items: [{ consultantId: 9, name: "Anika", marketer: { memberId: 7, name: "Mia" } }] })?.items[0].marketer).toEqual({ id: 7, name: "Mia" });
  });
});
