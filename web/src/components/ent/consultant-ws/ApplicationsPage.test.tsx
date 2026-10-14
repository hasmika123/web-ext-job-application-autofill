// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/applications" }));

import ApplicationsPage from "./ApplicationsPage";

const tile = (value: number, deltaPct: number | null = null) => ({ value, previous: 1, deltaPct, sparkline: [0, 1, 2, 3, 4, value] });
const arow = (over: Record<string, unknown>) => ({
  applicationId: 1, code: "APP-2026-001", requirementId: 10, title: "Senior Java Developer", company: "Amazon", appliedOn: "2024-10-14", source: "Job Match", stage: "INTERVIEWING", closedReason: null,
  nextAction: "Technical Interview", nextActionDue: "2024-10-18", ...over,
});
const page = (over: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: new Date().toISOString(),
  name: "Anika Rao",
  tiles: { total: tile(3, 28), underReview: tile(1, 17), interviews: tile(1, 100), rejected: tile(1, 25), offers: tile(0) },
  rows: [
    arow({}),
    arow({ applicationId: 2, title: "Backend Engineer", company: "Google", stage: "UNDER_REVIEW", source: "Vendor Portal", nextAction: null, nextActionDue: null }),
    arow({ applicationId: 3, title: "Software Engineer", company: "Meta", stage: "CLOSED", closedReason: "REJECTED", source: null, nextAction: null, nextActionDue: null }),
  ],
  paging: { page: 0, size: 10, total: 3, pages: 1 },
  status: "ALL",
  sort: "applied",
  statuses: [{ key: "ALL", count: 3 }, { key: "INTERVIEWING", count: 1 }, { key: "REJECTED", count: 1 }],
  funnel: [
    { key: "TOTAL", count: 3, percent: 100 },
    { key: "UNDER_REVIEW", count: 1, percent: 33.3 },
    { key: "INTERVIEWING", count: 1, percent: 33.3 },
    { key: "OFFER", count: 0, percent: 0 },
    { key: "REJECTED", count: 1, percent: 33.3 },
  ],
  recent: [{ id: 9, applicationId: 3, toStage: "CLOSED", closedReason: "REJECTED", title: "Software Engineer", company: "Meta", by: "MARKETER", at: "2024-10-08T15:47:00Z" }],
  ...over,
});
const detail = {
  row: arow({}),
  createdAt: "2024-10-01T00:00:00Z",
  stageChangedAt: "2024-10-12T00:00:00Z",
  timeline: [
    { id: 1, type: "CREATED", fromStage: null, toStage: "ASSIGNED", by: "MARKETER", at: "2024-10-01T00:00:00Z" },
    { id: 2, type: "STAGE_CHANGE", fromStage: "ASSIGNED", toStage: "INTERVIEWING", by: "YOU", at: "2024-10-12T00:00:00Z" },
  ],
};

let urls: string[];
let current: ReturnType<typeof page>;
beforeEach(() => {
  urls = [];
  current = page();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
      return /applications\/\d+$/.test(url) ? json(detail) : json(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
async function mount() {
  render(<ApplicationsPage orgId={2} firstName="Anika Rao" />);
  await flush();
}
const tileOf = (k: string) => document.querySelector(`[data-stat-tile="${k}"]`) as HTMLElement;

describe("My Applications from real data", () => {
  it("draws tiles with vs last month, the table, funnel and recent updates", async () => {
    await mount();
    expect(urls[0]).toBe("/api/orgs/2/me-workspace/applications");
    expect(within(tileOf("total")).getByText("3")).toBeTruthy();
    expect(within(tileOf("total")).getByText(/28%/)).toBeTruthy();
    expect(within(tileOf("offers")).getByText("No change to compare yet")).toBeTruthy();
    expect((tileOf("rejected").querySelector("[data-delta]") as HTMLElement).className).toContain("coral");
    const rows = [...document.querySelectorAll("tr[data-application]")] as HTMLElement[];
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Interview Scheduled")).toBeTruthy();
    expect(within(rows[0]).getByText("Technical Interview")).toBeTruthy();
    expect(within(rows[1]).getByText("Vendor Portal")).toBeTruthy();
    expect(within(rows[2]).getByText("Rejected")).toBeTruthy();
    expect(document.querySelector("[data-funnel='OFFER']")!.textContent).toContain("0");
    expect(document.querySelector("[data-funnel='UNDER_REVIEW']")!.textContent).toContain("33%");
    expect(document.querySelector("[data-update='CLOSED']")!.textContent).toContain("Application Rejected");
    expect(screen.queryByText("Phone Screen")).toBeNull();
  });

  it("the status filter and sort go to the API", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "REJECTED" } });
    await flush();
    expect(urls).toContain("/api/orgs/2/me-workspace/applications?status=REJECTED");
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "company" } });
    await flush();
    expect(urls).toContain("/api/orgs/2/me-workspace/applications?status=REJECTED&sort=company");
  });

  it("View opens the details sheet with the timeline", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("View Senior Java Developer at Amazon"));
    await flush();
    expect(urls).toContain("/api/orgs/2/me-workspace/applications/1");
    expect(document.querySelector("[data-detail='1']")!.textContent).toContain("APP-2026-001");
    expect(document.querySelectorAll("[data-timeline] li")).toHaveLength(2);
  });

  it("shows honest empty states", async () => {
    current = page({ rows: [], recent: [], paging: { page: 0, size: 10, total: 0, pages: 0 }, funnel: [{ key: "TOTAL", count: 0, percent: null }], statuses: [{ key: "ALL", count: 0 }] });
    await mount();
    expect(screen.getByText(/No applications yet/)).toBeTruthy();
    expect(screen.getByText(/No status updates yet/)).toBeTruthy();
    expect(screen.getByText(/Nothing in your pipeline yet/)).toBeTruthy();
  });
});
