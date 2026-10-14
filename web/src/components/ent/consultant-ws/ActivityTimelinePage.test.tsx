// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/activity-timeline" }));

import { ToastProvider } from "@kiwiply/ui";
import ActivityTimelinePage from "./ActivityTimelinePage";

type W = Record<string, unknown>;

const tile = (value: number, deltaPct: number | null = null, vs = "month") => ({ value, previous: deltaPct === null ? 0 : 1, deltaPct, sparkline: [0, 1, 2, 3, 4, value], vs });
const ev = (key: string, type: string, o: W = {}): W => ({
  key, type, group: "OFFER", category: null, at: "2026-10-12T10:24:00Z", title: type, description: `desc ${key}`, chip: null, actionLabel: "View Offer", target: "offers", sample: false, ...o,
});
const page = (o: W = {}): W => ({
  orgId: 2, generatedAt: "2026-10-13T20:00:00Z", consultantName: "Casey One",
  tiles: { total: tile(48, 20), thisWeek: tile(12, 33.3, "week"), applications: tile(15), interviews: tile(6, 50), profile: tile(4) },
  type: "ALL", days: 30, total: 3,
  events: [
    ev("resume:1", "RESUME_UPDATED", { group: "RESUME", title: "Resume Updated", actionLabel: "View Resume", target: "resumes", chip: { kind: "FILE", primary: "Senior Java Developer Resume.pdf", secondary: null, company: null, from: null, to: null } }),
    ev("offer-event:9", "OFFER_RECEIVED", { title: "Offer Received", chip: { kind: "JOB", primary: "Senior Java Developer", secondary: "FinServe Inc.", company: "FinServe Inc.", from: null, to: null }, at: "2026-10-12T09:00:00Z" }),
    ev("interview:4", "INTERVIEW_SCHEDULED", { group: "INTERVIEW", title: "Interview Scheduled", actionLabel: "View Interview", target: "interviews", at: "2026-10-08T16:15:00Z", chip: { kind: "DATES", primary: null, secondary: null, company: null, from: "2026-10-15T10:00:00Z", to: "2026-10-15T11:00:00Z" } }),
  ],
  nextCursor: "c3VwZXI", milestones: [
    { key: "app-submitted", label: "Application Submitted", reached: true, on: "2026-10-12T00:00:00Z" },
    { key: "offer-accepted", label: "Offer Accepted", reached: false, on: null },
  ], ...o,
});

let calls: string[];
let reply: (url: string) => { status: number; body: unknown };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  calls = [];
  reply = () => ({ status: 200, body: page() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const r = reply(url);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  const view = render(
    <ToastProvider>
      <ActivityTimelinePage orgId={2} firstName="Casey One" />
    </ToastProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
  return view;
}
const rows = () => [...document.querySelectorAll("[data-timeline-row]")] as HTMLElement[];
const tileEl = (k: string) => document.querySelector(`[data-stat-tile="${k}"]`) as HTMLElement;

describe("Activity Timeline from real data", () => {
  it("asks the BFF once with the default filters and draws tiles, rows, chips and links", async () => {
    await mount();
    expect(calls).toEqual(["/api/orgs/2/me-workspace/activity-timeline?days=30&size=20"]);
    expect(document.querySelector("[data-consultant-activity-timeline]")!.getAttribute("data-status")).toBe("ready");
    expect(within(tileEl("total")).getByText("48")).toBeTruthy();
    expect(tileEl("total").querySelector("[data-tile-delta]")!.textContent).toContain("20%");
    expect(within(tileEl("total")).getByText("vs last month")).toBeTruthy();
    expect(within(tileEl("thisWeek")).getByText("vs last week")).toBeTruthy();
    expect(tileEl("applications").querySelector("[data-tile-delta]")).toBeNull();
    expect(within(tileEl("applications")).getByText("Last 30 days")).toBeTruthy();

    expect(rows().map((r) => r.getAttribute("data-timeline-row"))).toEqual(["RESUME_UPDATED", "OFFER_RECEIVED", "INTERVIEW_SCHEDULED"]);
    expect(within(rows()[0]).getByText("Senior Java Developer Resume.pdf")).toBeTruthy();
    expect(within(rows()[1]).getByText("FinServe Inc.")).toBeTruthy();
    expect(within(rows()[2]).getByText(/\d{1,2}:\d{2} [AP]M - \d{1,2}:\d{2} [AP]M/)).toBeTruthy();
    expect(within(rows()[0]).getByRole("link", { name: "View Resume" }).getAttribute("href")).toBe("/w/consultant/resumes");
    expect(within(rows()[1]).getByRole("link", { name: "View Offer" }).getAttribute("href")).toBe("/w/consultant/offers");
    expect(within(rows()[2]).getByRole("link", { name: "View Interview" }).getAttribute("href")).toBe("/w/consultant/interviews");
    expect(document.querySelectorAll("[data-day-group]").length).toBe(2);
    expect(screen.getByText("Showing 3 of 3")).toBeTruthy();
  });

  it("draws the milestone checklist with open circles for unreached ones, and the quick links", async () => {
    await mount();
    expect(document.querySelector('[data-milestone="app-submitted"]')!.getAttribute("data-reached")).toBe("true");
    const open = document.querySelector('[data-milestone="offer-accepted"]') as HTMLElement;
    expect(open.getAttribute("data-reached")).toBe("false");
    expect(open.textContent).toContain("-");
    expect(document.querySelector('[data-quick="view-application"]')!.getAttribute("href")).toBe("/w/consultant/applications");
    expect(document.querySelector('[data-quick="message-marketer"]')!.getAttribute("href")).toBe("/w/consultant/marketer");
    expect(document.querySelector('[data-quick="review-feedback"]')!.getAttribute("href")).toBe("/w/consultant/interviews");
    expect(screen.getByText("Your activity timeline, made simple!")).toBeTruthy();
  });

  it("refetches from the first page when the type or the period changes", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Period"), { target: { value: "90" } });
      await vi.advanceTimersByTimeAsync(20);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Activity type"), { target: { value: "OFFER" } });
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(calls).toEqual([
      "/api/orgs/2/me-workspace/activity-timeline?days=30&size=20",
      "/api/orgs/2/me-workspace/activity-timeline?days=90&size=20",
      "/api/orgs/2/me-workspace/activity-timeline?type=OFFER&days=90&size=20",
    ]);
  });

  it("loads the next page with the API cursor and appends it without repeats", async () => {
    await mount();
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
    reply = () => ({ status: 200, body: page({ events: [ev("offer-event:9", "OFFER_RECEIVED"), ev("placement-act:1", "PLACEMENT_MILESTONE", { group: "PLACEMENT", title: "Placement Update", at: "2026-10-01T10:00:00Z" })], nextCursor: null }) });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(calls[1]).toBe("/api/orgs/2/me-workspace/activity-timeline?days=30&size=20&cursor=c3VwZXI");
    expect(rows()).toHaveLength(4);
    expect(rows().map((r) => r.getAttribute("data-event-key"))).toEqual(["resume:1", "offer-event:9", "interview:4", "placement-act:1"]);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("keeps what is on screen and says so when more activity fails to load", async () => {
    await mount();
    reply = () => ({ status: 500, body: {} });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(rows()).toHaveLength(3);
    expect(screen.getByRole("alert").textContent).toContain("didn't load");
  });

  it("exports only the rows on screen as a client-side CSV", async () => {
    const created: Blob[] = [];
    URL.createObjectURL = (b: Blob | MediaSource) => (created.push(b as Blob), "blob:x");
    URL.revokeObjectURL = () => undefined;
    await mount();
    const before = calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Export Timeline/ }));
    });
    expect(calls.length).toBe(before); // no server call
    expect(created).toHaveLength(1);
    vi.useRealTimers();
    const text = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(created[0]); });
    expect(text.trimEnd().split("\r\n")).toHaveLength(4); // header + 3 loaded rows
  });

  it("shows an honest empty state and open milestones for a consultant with no activity", async () => {
    reply = () => ({ status: 200, body: page({ events: [], total: 0, nextCursor: null, tiles: { total: tile(0), thisWeek: tile(0, null, "week"), applications: tile(0), interviews: tile(0), profile: tile(0) }, milestones: [{ key: "k", label: "Offer Received", reached: false, on: null }] }) });
    await mount();
    expect(rows()).toHaveLength(0);
    expect(screen.getByText(/No activity in the last 30 days/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByRole("button", { name: /Export Timeline/ }).hasAttribute("disabled")).toBe(true);
    expect(document.querySelector('[data-milestone="k"]')!.getAttribute("data-reached")).toBe("false");
  });

  it("shows the role message on a 404", async () => {
    reply = () => ({ status: 404, body: {} });
    await mount();
    expect(screen.getByText("This page isn't part of your role")).toBeTruthy();
  });

  it("shows a retry on a failure", async () => {
    reply = () => ({ status: 500, body: {} });
    await mount();
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeTruthy();
  });
});
