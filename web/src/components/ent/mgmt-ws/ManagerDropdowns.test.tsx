// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import AssignmentsPage from "./assignments/AssignmentsPage";
import PipelineBoardPage from "./pipeline/PipelineBoardPage";

const team = {
  items: [
    {
      memberId: 103,
      name: "Sarah Chen",
      title: "Marketing Manager",
      status: "ACTIVE",
      capacity: 10,
      assigned: 7,
      percent: 70,
      overloaded: false,
      openApprovals: 1,
      openEscalations: 0,
      lastActiveAt: "2026-11-28T08:00:00Z",
      canManage: true,
    },
  ],
  page: 0,
  size: 100,
  total: 1,
  hasMore: false,
};

const assignments = {
  items: [
    {
      consultantId: 22,
      name: "Alex Morgan",
      jobTitle: "Senior Developer",
      email: null,
      availability: "AVAILABLE",
      marketer: null,
      backup: null,
      status: "ACTIVE",
      priority: "HIGH",
      activeApps: 2,
      lastActivityAt: "2026-11-28T08:00:00Z",
      assignedAt: null,
    },
  ],
  page: 0,
  size: 50,
  total: 1,
  hasMore: false,
};

const pipeline = {
  columns: [
    {
      key: "ASSIGNED",
      label: "Assigned",
      count: 1,
      items: [{ id: 1, consultantId: 22, consultant: "Alex Morgan", requirementId: 4, job: "Senior Developer", clientId: 8, client: "Acme", marketer: null, column: "ASSIGNED", priority: "HIGH", lastActivityAt: "2026-11-28T08:00:00Z", ageDays: 2, stale: false }],
    },
  ],
  total: 1,
  page: 0,
  size: 100,
  staleDays: 14,
  rangeDays: 30,
  empty: false,
  generatedAt: "2026-11-28T08:00:00Z",
};

const pipelineSummary = {
  columns: [{ key: "ASSIGNED", label: "Assigned", count: 1 }],
  stale: 0,
  staleDays: 14,
  rangeDays: 30,
  windows: [],
  empty: false,
  generatedAt: "2026-11-28T08:00:00Z",
};

let calls: string[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = String(input);
      calls.push(url);
      const body = url.includes("/team") ? team : url.includes("/assignments") ? assignments : url.includes("/pipeline/summary") ? pipelineSummary : pipeline;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Marketing Manager dropdowns", () => {
  it("uses shared styled controls for assignment status and marketer target", async () => {
    render(<ToastProvider><AssignmentsPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={{}} /></ToastProvider>);
    await screen.findByText("Alex Morgan");

    expect(screen.queryByRole("combobox", { name: "Assignment status" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Assign selected to" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Assignment status" }));
    expect(screen.getByRole("listbox", { name: "Assignment status" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Paused" }));
    await waitFor(() => expect(calls.some((url) => url.includes("status=PAUSED"))).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Assign selected to" }));
    expect(screen.getByRole("listbox", { name: "Assign selected to" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Sarah Chen" })).toBeTruthy();
  });

  it("uses the shared styled control for pipeline date range and reloads after a selection", async () => {
    render(<PipelineBoardPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={{}} />);
    await screen.findByText("Senior Developer");

    expect(screen.queryByRole("combobox", { name: "Date range" })).toBeNull();
    const range = screen.getByRole("button", { name: "Date range" });
    expect(range.getAttribute("aria-haspopup")).toBe("listbox");

    fireEvent.click(range);
    fireEvent.click(screen.getByRole("option", { name: "Last 90 days" }));
    await waitFor(() => expect(calls.some((url) => url.includes("range=90"))).toBe(true));
  });
});
