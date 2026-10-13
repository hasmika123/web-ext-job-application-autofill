// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/admin" }));

import { ToastProvider } from "@kiwiply/ui";
import DashboardPage from "./DashboardPage";

/** The talent board (design/enterprise-talent/dashboard.png): real data shapes for the six tiles, the charts, the feed and the help card. */
type W = Record<string, unknown>;
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const tile = (value: number, previous: number | null, deltaPct: number | null, extra: W = {}) => ({ value, previous, deltaPct, sparkline: [1, 2, 3, 4, 5, value], comparedTo: "30d", counts: {}, ...extra });

const talent = (over: Record<string, W> = {}) => {
  const base: Record<string, W> = {
    "consultants.total": { key: "consultants.total", state: "ok", data: tile(153, 140, 9.3) },
    "employees.active": { key: "employees.active", state: "ok", data: tile(9, 9, 0) },
    "applications.active": { key: "applications.active", state: "ok", data: tile(64, 68, -5.9) },
    "interviews.upcoming": { key: "interviews.upcoming", state: "ok", data: tile(28, 22, 27.3, { comparedTo: "7d" }) },
    placements: { key: "placements", state: "ok", data: tile(142, 124, 14.5) },
    "finance.summary": { key: "finance.summary", state: "ok", data: tile(32_800_000, 30_943_400, 6, { unit: "money", currency: "USD" }) },
    "team.performance": {
      key: "team.performance",
      state: "ok",
      data: {
        months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        series: [
          { key: "applications", label: "Applications", values: [4, 6, 8, 9, 12, 20] },
          { key: "interviews", label: "Interviews", values: [1, 2, 3, 4, 6, 9] },
          { key: "placements", label: "Placements", values: [0, 1, 1, 2, 3, 5] },
        ],
      },
    },
    "pipeline.overview": {
      key: "pipeline.overview",
      state: "ok",
      data: {
        total: 64,
        slices: [
          { key: "new", label: "New", value: 18 },
          { key: "in_review", label: "In Review", value: 20 },
          { key: "interviewing", label: "Interview Scheduled", value: 14 },
          { key: "offered", label: "Offered", value: 8 },
          { key: "hired", label: "Hired", value: 4 },
        ],
      },
    },
    "quick.actions": { key: "quick.actions", state: "ok", data: { items: [{ key: "review-applications", label: "Review Applications", description: "View pending applications", href: "/w/admin/applications", permission: "member.view_summary", available: true, soonModule: null }] } },
    alerts: { key: "alerts", state: "ok", data: { items: [] } },
    "activity.recent": {
      key: "activity.recent",
      state: "ok",
      data: {
        items: [
          { id: 5, action: "APPLICATION_STAGE_CHANGE", label: "submitted an application for Dana Cole", actorLogin: null, actorName: "Jessica Davis", targetType: "APPLICATION", targetLogin: null, targetName: null, at: ago(3 * 3600e3), source: "application", subject: "Marketing Consultant" },
        ],
      },
    },
  };
  return { orgId: 2, generatedAt: new Date(NOW).toISOString(), widgets: Object.values({ ...base, ...over }) };
};

let reply: () => unknown;

async function mount(props: Partial<React.ComponentProps<typeof DashboardPage>> = {}) {
  render(
    <ToastProvider>
      <DashboardPage orgId={2} orgName="Acme" firstName="Sarah" auditHref={null} applicationsHref="/w/admin/applications" {...props} />
    </ToastProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  window.localStorage.clear();
  reply = () => talent();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(reply()), { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tileOf = (key: string) => document.querySelector(`[data-stat-tile="${key}"]`) as HTMLElement | null;
const cardOf = (key: string) => document.querySelector(`[data-dash-card="${key}"]`) as HTMLElement | null;

describe("the talent board", () => {
  it("draws the six tiles: values, money compact, week-over-week text, red for a drop", async () => {
    await mount();
    expect(within(tileOf("consultants.total")!).getByText("153")).toBeTruthy();
    expect(within(tileOf("applications.active")!).getByText("64")).toBeTruthy();
    expect(tileOf("applications.active")!.querySelector("[data-delta=down]")!.textContent).toContain("5.9%");
    expect(tileOf("interviews.upcoming")!.textContent).toContain("vs last week");
    expect(tileOf("placements")!.querySelector("[data-delta=up]")!.textContent).toContain("15%");
    expect(tileOf("finance.summary")!.querySelector("[data-tile-value]")!.textContent).toBe("$328K");
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(6);
  });

  it("the pipeline card lists the stages with a total, and the charts have text alternatives", async () => {
    await mount();
    const pipe = cardOf("pipeline.overview")!;
    expect(pipe.textContent).toContain("Interview Scheduled");
    expect(pipe.textContent).toContain("Total Applications");
    expect(pipe.querySelector("[data-donut-chart] svg")!.getAttribute("aria-label")).toContain("In Review 20");
    const team = cardOf("team.performance")!;
    expect(team.querySelector("table")).toBeTruthy();
    expect(team.querySelectorAll("[data-bar^='applications:']")).toHaveLength(6);
  });

  it("the range select narrows the chart to the last 3 months", async () => {
    await mount();
    const select = document.querySelector("[data-team-range]") as HTMLSelectElement;
    expect(select.value).toBe("6");
    await act(async () => {
      fireEvent.change(select, { target: { value: "3" } });
    });
    expect(cardOf("team.performance")!.querySelectorAll("[data-bar^='applications:']")).toHaveLength(3);
    expect(cardOf("team.performance")!.querySelector("[data-bar='applications:Jan']")).toBeNull();
  });

  it("a quick action is a real link", async () => {
    await mount();
    const a = document.querySelector("[data-quick-action=review-applications]") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/w/admin/applications");
  });

  it("an application activity row shows who, the job, and leads to the applications page; View all falls back to it", async () => {
    await mount();
    const row = document.querySelector("[data-activity='application-5']")!;
    expect(row.textContent).toContain("Jessica Davis");
    expect(row.textContent).toContain("Marketing Consultant");
    expect(row.querySelector("a")!.getAttribute("href")).toBe("/w/admin/applications");
    expect(within(cardOf("activity.recent")!).getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/w/admin/applications");
  });

  it("an organization with no rows gets honest sentences, never zeros or empty charts", async () => {
    reply = () =>
      talent({
        "applications.active": { key: "applications.active", state: "empty", reason: "NO_APPLICATIONS" },
        "finance.summary": { key: "finance.summary", state: "empty", reason: "NO_SPEND" },
        "pipeline.overview": { key: "pipeline.overview", state: "empty", reason: "NO_APPLICATIONS" },
        "team.performance": { key: "team.performance", state: "empty", reason: "NO_APPLICATIONS" },
      });
    await mount();
    expect(tileOf("applications.active")!.textContent).toContain("No applications yet");
    expect(tileOf("applications.active")!.querySelector("[data-tile-value]")).toBeNull();
    expect(tileOf("finance.summary")!.textContent).toContain("No spend recorded this month");
    expect(cardOf("pipeline.overview")!.textContent).toContain("No applications yet");
    expect(cardOf("pipeline.overview")!.querySelector("[data-donut-chart]")).toBeNull();
    expect(cardOf("team.performance")!.querySelector("[data-bar]")).toBeNull();
  });
});

describe("the help card", () => {
  it("dismisses with the X, stays dismissed for this organization only", async () => {
    await mount();
    expect(cardOf("help")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss the help card" }));
    });
    expect(cardOf("help")).toBeNull();
    expect(window.localStorage.getItem("kiwiply.dashboard.help.dismissed.2")).toBe("1");
    cleanup();
    await mount();
    expect(cardOf("help")).toBeNull();
    cleanup();
    await mount({ orgId: 3 });
    expect(cardOf("help")).toBeTruthy();
  });

  it("works when the browser refuses storage", async () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      await mount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Dismiss the help card" }));
      });
      expect(cardOf("help")).toBeNull();
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});

describe("alerts list", () => {
  it("shows four with their time, and View all reveals the rest", async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ key: `A${i}`, severity: "info", title: `Alert ${i}`, message: "m", href: "/w/admin/applications", count: 1, at: ago(3600e3) }));
    reply = () => talent({ alerts: { key: "alerts", state: "ok", data: { items } } });
    await mount();
    expect(document.querySelectorAll("[data-alert]")).toHaveLength(4);
    expect(within(cardOf("alerts")!).getAllByText("1 hour ago").length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(document.querySelector("[data-alerts-view-all]")!);
    });
    expect(document.querySelectorAll("[data-alert]")).toHaveLength(6);
  });
});
