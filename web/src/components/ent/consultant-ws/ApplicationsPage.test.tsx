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
  render(<ApplicationsPage orgId={2} />);
  await flush();
}

describe("My Applications from real data", () => {
  it("draws the table only: no tiles, pipeline summary, recent updates, Quick Actions or help card", async () => {
    await mount();
    expect(urls[0]).toBe("/api/orgs/2/me-workspace/applications");
    expect(document.querySelector("[data-stat-tile]")).toBeNull();
    expect(document.querySelector("[data-delta]")).toBeNull();
    expect(screen.queryByText(/Quick Actions|Ask a question|Pipeline Summary|Recent Status Updates/)).toBeNull();
    const rows = [...document.querySelectorAll("tr[data-application]")] as HTMLElement[];
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Interview Scheduled")).toBeTruthy();
    expect(within(rows[0]).getByText("Technical Interview")).toBeTruthy();
    expect(within(rows[1]).getByText("Vendor Portal")).toBeTruthy();
    expect(within(rows[2]).getByText("Rejected")).toBeTruthy();
    expect(document.querySelector("[data-funnel]")).toBeNull();
    expect(document.querySelector("[data-update]")).toBeNull();
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

  it("the timeline and the header say who did it, by name with the relation (change audit: you / marketer / admin / Kiwiply / a former member)", async () => {
    const actor = (label: string, relation: string, memberId: number | null, kind = "PERSON") => ({ userId: null, memberId, label, relation, kind });
    const audited = {
      ...detail,
      updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), // config-literal-ok: test fixture
      updatedBy: actor("Sarah Chen", "marketer", 21),
      createdBy: actor("Priya Raman", "admin", 22),
      timeline: [
        { id: 1, type: "CREATED", fromStage: null, toStage: "ASSIGNED", by: "TEAM", actor: actor("Priya Raman", "admin", 22), at: "2024-10-01T00:00:00Z" },
        { id: 2, type: "STAGE_CHANGE", fromStage: "ASSIGNED", toStage: "SUBMITTED", by: "YOU", actor: actor("Anika Rao", "consultant", 11), at: "2024-10-05T00:00:00Z" },
        { id: 3, type: "STAGE_CHANGE", fromStage: "SUBMITTED", toStage: "UNDER_REVIEW", by: "MARKETER", actor: actor("Sarah Chen", "marketer", 21), at: "2024-10-08T00:00:00Z" },
        { id: 4, type: "STAGE_CHANGE", fromStage: "UNDER_REVIEW", toStage: "INTERVIEWING", by: "TEAM", actor: actor("Kiwiply", "system", null, "SYSTEM"), at: "2024-10-10T00:00:00Z" },
        { id: 5, type: "STAGE_CHANGE", fromStage: "INTERVIEWING", toStage: "OFFER", by: "TEAM", actor: actor("a former member", "member", 99), at: "2024-10-12T00:00:00Z" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => new Response(JSON.stringify(/applications\/\d+$/.test(url) ? audited : current), { status: 200, headers: { "content-type": "application/json" } })),
    );
    render(<ApplicationsPage orgId={2} firstName="Anika Rao" selfMemberId={11} />);
    await flush();
    fireEvent.click(screen.getByLabelText("View Senior Java Developer at Amazon"));
    await flush();
    const sheet = document.querySelector("[data-detail='1']") as HTMLElement;
    const line = sheet.querySelector("[data-updated-by]") as HTMLElement;
    expect(line.textContent).toMatch(/Updated 2 hours ago by Sarah Chen/);
    expect(within(line).getByText("MARKETER")).toBeTruthy();
    expect(sheet.querySelector("[data-created-by]")!.textContent).toContain("Priya Raman");
    const lines = [...sheet.querySelectorAll("[data-actor-line]")].map((n) => n.textContent);
    expect(lines).toEqual(["by Priya Raman" + "ADMIN", "by you", "by Sarah Chen" + "MARKETER", "automatically", "by a former member" + "MEMBER"]);
    expect(sheet.textContent).not.toContain("ent#");
  });

  it("shows honest empty states", async () => {
    current = page({ rows: [], recent: [], paging: { page: 0, size: 10, total: 0, pages: 0 }, funnel: [{ key: "TOTAL", count: 0, percent: null }], statuses: [{ key: "ALL", count: 0 }] });
    await mount();
    expect(screen.getByText(/No applications yet/)).toBeTruthy();
  });
});
