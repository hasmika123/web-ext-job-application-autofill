// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/placements" }));

import { ToastProvider } from "@kiwiply/ui";
import PlacementsPage from "./PlacementsPage";

const NOW = Date.now();
const iso = (days: number) => new Date(NOW + days * 86_400_000).toISOString();
const ymd = (days: number) => iso(days).slice(0, 10);

const page = (over: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: new Date(NOW).toISOString(),
  name: "Anika Rao",
  activeCount: 1,
  active: {
    id: 7, roleTitle: "Senior Java Developer", status: "ACTIVE", clientName: "FinServe Inc.", endClientName: "Global Financial Group", projectName: "Digital Banking Platform",
    locationLabel: "New York, NY (Hybrid)", workMode: "Hybrid (2 days onsite)", managerName: "Alex Morgan", managerTitle: "Engineering Manager", hoursPerWeek: 40, scheduleLabel: "Mon - Fri",
    engagementStatus: "ON_TRACK", statusNote: "Performance is meeting expectations", startDate: ymd(-21), endDate: ymd(160), nextCheckIn: ymd(5), durationMonths: 6, openEnded: false, billable: true, sample: true,
  },
  marketer: { memberId: 4, name: "Emily Lawson", title: "Senior IT Recruiter" },
  checklist: [
    { id: 1, label: "Sign consultant agreement", dueOn: null, completedAt: iso(-10) },
    { id: 2, label: "Complete security training", dueOn: ymd(4), completedAt: null },
  ],
  milestones: [
    { id: 1, label: "Placement Start", description: "Engagement officially started", onDate: ymd(-21), completed: true },
    { id: 2, label: "First Month Review", description: "30-day check-in", onDate: ymd(9), completed: false },
  ],
  meetings: [
    { id: 1, label: "Project Sync", startsAt: iso(2), durationMinutes: 60, withLabel: "Client Team", joinUrl: "https://meet.example.com/sync" },
    { id: 2, label: "1:1 with Manager", startsAt: iso(7), durationMinutes: 30, withLabel: "Alex Morgan", joinUrl: null },
  ],
  activity: [
    { id: 1, type: "UPDATE", description: "Client systems access confirmed", actorLabel: "Client IT", occurredAt: iso(-18), sample: true },
    { id: 2, type: "DOCUMENT", description: "Consultant agreement signed", actorLabel: "You", occurredAt: iso(-20), sample: true },
  ],
  past: [],
  ...over,
});

type Call = { method: string; url: string; body?: string };
let calls: Call[];
let current: ReturnType<typeof page>;
let writeStatus = 200;
let writeBody: unknown = {};

beforeEach(() => {
  calls = [];
  current = page();
  writeStatus = 200;
  writeBody = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body as string | undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method === "PUT") return json(writeStatus === 200 ? { id: 2, label: "Complete security training", dueOn: null, completedAt: new Date().toISOString() } : writeBody, writeStatus);
      if (method === "POST") return json(writeStatus === 200 ? { id: 9, type: "UPDATE", description: "Going well", actorLabel: "Anika Rao", occurredAt: new Date().toISOString(), sample: false } : writeBody, writeStatus);
      return json(current);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    render(
      <ToastProvider>
        <PlacementsPage orgId={2} firstName="Anika Rao" />
      </ToastProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

describe("My Placement page", () => {
  it("draws the tiles, the overview and the lists from the API's answer, with Sample marks and no rate", async () => {
    await mount();
    const root = document.querySelector("[data-consultant-placements]") as HTMLElement;
    expect(root.getAttribute("data-status")).toBe("ready");
    const tiles = within(document.querySelector("[data-placement-tiles]") as HTMLElement);
    expect(tiles.getByText("Current Engagement")).toBeTruthy();
    expect(tiles.getByText("3 weeks ago")).toBeTruthy();
    expect(tiles.getByText("6 Months")).toBeTruthy();
    expect(tiles.getByText("Billable")).toBeTruthy();
    expect(tiles.getByText("In 5 days")).toBeTruthy();
    expect(screen.getByText("FinServe Inc.")).toBeTruthy();
    expect(screen.getByText("Global Financial Group")).toBeTruthy();
    expect(screen.getByText("Digital Banking Platform")).toBeTruthy();
    expect(screen.getByText("40 hours/week")).toBeTruthy();
    expect(screen.getByText("On Track")).toBeTruthy();
    expect(screen.getByText("Emily Lawson")).toBeTruthy();
    expect(document.querySelector("[data-sample-note]")).toBeTruthy();
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/bill rate|\$\d|per hour|\/hr/);
  });

  it("Contact links go to My Marketer and say email is not shown", async () => {
    await mount();
    const links = screen.getAllByRole("link", { name: /^Contact / });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const l of links) {
      expect(l.getAttribute("href")).toBe("/w/consultant/marketer");
      expect(l.getAttribute("title")).toMatch(/Email addresses are not shown/);
    }
  });

  it("Join opens only a real https link; a meeting without one is disabled with a reason", async () => {
    await mount();
    const join = within(document.querySelector("[data-meeting='1']") as HTMLElement).getByRole("link");
    expect(join.getAttribute("href")).toBe("https://meet.example.com/sync");
    expect(join.getAttribute("rel")).toContain("noopener");
    const off = within(document.querySelector("[data-meeting='2']") as HTMLElement).getByRole("button") as HTMLButtonElement;
    expect(off.disabled).toBe(true);
    expect(off.getAttribute("title")).toMatch(/No join link/);
  });

  it("ticking a checklist item updates at once, writes, and Undo reverses it", async () => {
    await mount();
    const item = document.querySelector("[data-check='2']") as HTMLElement;
    expect(item.getAttribute("aria-checked")).toBe("false");
    await act(async () => {
      fireEvent.click(item);
    });
    expect(item.getAttribute("aria-checked")).toBe("true");
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/orgs/2/me-workspace/placements/checklist/2");
    expect(JSON.parse(put.body!)).toEqual({ completed: true });
    expect(document.querySelector("[data-progress]")?.textContent).toBe("2/2");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    });
    expect(item.getAttribute("aria-checked")).toBe("false");
    expect(JSON.parse(calls.filter((c) => c.method === "PUT")[1].body!)).toEqual({ completed: false });
  });

  it("a failed checklist write rolls the tick back and says so", async () => {
    writeStatus = 500;
    await mount();
    const item = document.querySelector("[data-check='2']") as HTMLElement;
    await act(async () => {
      fireEvent.click(item);
    });
    expect(item.getAttribute("aria-checked")).toBe("false");
    expect(document.querySelector("[data-check-notice]")?.textContent).toMatch(/didn't save/);
  });

  it("Update Status posts a validated note and reloads", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-post-update]") as HTMLElement);
    fireEvent.change(screen.getByLabelText("Status update"), { target: { value: "ok" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post update" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/at least 3/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.change(screen.getByLabelText("Status update"), { target: { value: "  Going well  " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post update" }));
    });
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/me-workspace/placements/status-note");
    expect(JSON.parse(post.body!)).toEqual({ note: "Going well" });
    expect(screen.queryByLabelText("Status update")).toBeNull();
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThanOrEqual(2);
  });

  it("a refused status note keeps the dialog open with the API's message", async () => {
    writeStatus = 422;
    writeBody = { error: "note: contains a social security number" };
    await mount();
    fireEvent.click(document.querySelector("[data-post-update]") as HTMLElement);
    fireEvent.change(screen.getByLabelText("Status update"), { target: { value: "my SSN is private" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post update" }));
    });
    expect(screen.getByRole("alert").textContent).toContain("social security");
    expect(screen.getByLabelText("Status update")).toBeTruthy();
  });

  it("Client details opens from the overview; there is no Quick Actions card, Helpful resources, Coming soon row or help card", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-client-details-btn]") as HTMLElement);
    expect(document.querySelector("[data-client-details]")?.textContent).toContain("Global Financial Group");
    expect(document.querySelector("[data-quick]")).toBeNull();
    expect(screen.queryByText(/Quick Actions|Helpful Resources|Coming soon|Download Documents|Ask a question/)).toBeNull();
  });

  it("the activity View button shows the full text", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "View activity: Consultant agreement signed" }));
    expect(screen.getAllByText("Consultant agreement signed").length).toBeGreaterThanOrEqual(2);
  });

  it("with no active placement it says so honestly, links to Offers and lists past placements", async () => {
    current = page({
      activeCount: 0, active: null, marketer: null, checklist: [], milestones: [], meetings: [], activity: [],
      past: [{ id: 3, roleTitle: "Old Contract", clientName: "RetailCo", startDate: "2025-01-06", endDate: "2025-06-30" }],
    });
    await mount();
    expect(document.querySelector("[data-no-placement]")).toBeTruthy();
    expect(screen.getByText("No active placement yet", { selector: "h2" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View my offers" }).getAttribute("href")).toBe("/w/consultant/offers");
    expect(document.querySelector("[data-past='3']")?.textContent).toContain("Old Contract");
    expect(document.querySelector("[data-placement-tiles]")).toBeNull();
    expect(document.querySelector("[data-post-update]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Coming soon/);
  });

  it("a failed load shows a retry, not a made-up page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await mount();
    expect(document.querySelector("[data-consultant-placements]")?.getAttribute("data-status")).toBe("failed");
    expect(screen.getByText(/didn't load/)).toBeTruthy();
  });
});
