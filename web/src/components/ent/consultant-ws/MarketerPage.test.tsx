// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/marketer" }));

import { ToastProvider } from "@kiwiply/ui";
import MarketerPage from "./MarketerPage";

type W = Record<string, unknown>;

const full = (): W => ({
  orgId: 2,
  generatedAt: "2026-10-13T20:00:00Z",
  marketer: { memberId: 5, name: "Emily Carter", title: "Talent Marketing Specialist", assignedAt: "2026-09-01T00:00:00Z" },
  responseBadge: { sample: true, label: "Responsive", detail: "Typically replies within 2 hours" },
  focusOpportunities: [
    { matchId: 1, requirementId: 2, title: "Senior Java Developer", company: "TechCorp", location: null, workMode: "REMOTE", stage: "SUBMITTED", priority: "HIGH", nextStep: "Client feedback", nextStepDue: "2026-10-18" },
    { matchId: 2, requirementId: 3, title: "Data Engineer", company: "DataSphere", location: "Austin, TX", workMode: null, stage: "MARKETING", priority: "LOW", nextStep: null, nextStepDue: null },
  ],
  followups: [
    { key: "app-1", kind: "APPLICATION", dueOn: "2026-10-15", description: "Client feedback", status: "UPCOMING", relatedTitle: "Senior Java Developer", relatedCompany: "TechCorp" },
    { key: "task-2", kind: "TASK", dueOn: "2026-10-16", description: "Update resume", status: "IN_PROGRESS", relatedTitle: null, relatedCompany: null },
  ],
  marketerFocus: [
    { key: "marketing", title: "Actively marketing your profile", detail: "to 8 potential opportunities" },
    { key: "skills", title: "Targeting Java, AWS roles", detail: "based on your key skills" },
  ],
  messages: {
    sample: true,
    items: [
      { from: "Emily Carter", mine: false, preview: "Hi Anika! New opportunity.", at: "2026-10-13T18:00:00Z", unread: true },
      { from: "You", mine: true, preview: "Thanks!", at: "2026-10-12T20:00:00Z", unread: false },
    ],
  },
  actionPlan: {
    sample: true,
    items: [
      { title: "Keep profile and resumes up to date", status: "DONE", dueOn: null, completedOn: "2026-10-01" },
      { title: "Gather feedback", status: "NOT_STARTED", dueOn: "2026-10-25", completedOn: null },
    ],
  },
  notes: { sample: true, items: [{ title: "Profile Positioning", on: "2026-10-10", body: "Aligned on positioning." }] },
});

const none = (): W => ({
  orgId: 2,
  generatedAt: "2026-10-13T20:00:00Z",
  marketer: null,
  responseBadge: { sample: true, label: "Responsive", detail: "Typically replies within 2 hours" },
  focusOpportunities: [],
  followups: [],
  marketerFocus: [],
  messages: { sample: true, items: [] },
  actionPlan: { sample: true, items: [] },
  notes: { sample: true, items: [] },
});

let calls: string[];
let reply: () => { status: number; body: unknown };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  calls = [];
  reply = () => ({ status: 200, body: full() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const r = reply();
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
      <MarketerPage orgId={2} firstName="Anika Rao" />
    </ToastProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
  return view;
}

const card = (id: string) => document.querySelector(`[data-home-card="${id}"]`) as HTMLElement;

describe("My Marketer from real data", () => {
  it("asks the BFF once and draws the marketer, focus opportunities and follow-ups", async () => {
    await mount();
    expect(calls).toEqual(["/api/orgs/2/me-workspace/marketer"]);
    expect(document.querySelector("[data-marketer-name]")!.textContent).toBe("Emily Carter");
    expect(screen.getByText("Talent Marketing Specialist")).toBeTruthy();
    const opps = [...document.querySelectorAll("[data-focus-opportunity]")] as HTMLElement[];
    expect(opps).toHaveLength(2);
    expect(within(opps[0]).getByText("Submitted")).toBeTruthy();
    expect(within(opps[0]).getByText("High")).toBeTruthy();
    expect(within(opps[0]).getByText("Client feedback")).toBeTruthy();
    expect(within(opps[1]).getByText("Marketing")).toBeTruthy();
    expect([...document.querySelectorAll("[data-followup]")].map((e) => e.getAttribute("data-followup"))).toEqual(["app-1", "task-2"]);
    expect(within(card("marketer-followups")).getByText("Follow-up")).toBeTruthy();
    expect(within(card("marketer-followups")).getByText("Task")).toBeTruthy();
    expect([...document.querySelectorAll("[data-focus-item]")].map((e) => e.getAttribute("data-focus-item"))).toEqual(["marketing", "skills"]);
  });

  it("marks the marketer's half of the relationship as Sample", async () => {
    await mount();
    expect(within(document.querySelector("[data-response-badge]") as HTMLElement).getByText("Sample")).toBeTruthy();
    for (const id of ["marketer-plan", "marketer-messages", "marketer-notes"]) expect(card(id).querySelector("[data-sample]"), id).toBeTruthy();
    for (const id of ["marketer-focus-opps", "marketer-followups", "marketer-focus"]) expect(card(id).querySelector("[data-sample]"), id).toBeNull();
  });

  it("opens an honest dialog from Send Message and never claims anything was sent", async () => {
    await mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send Message" }));
    });
    const d = screen.getByRole("dialog");
    expect(within(d).getByText("Messaging arrives with the marketing workspace")).toBeTruthy();
    expect(within(d).getByText(/Nothing was sent or scheduled/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Got it" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ask About Opportunity/ }));
    });
    expect(within(screen.getByRole("dialog")).getByText(/Ask About Opportunity is not connected yet/)).toBeTruthy();
  });

  it("has an honest empty state when no marketer is assigned", async () => {
    reply = () => ({ status: 200, body: none() });
    await mount();
    expect(screen.getByText(/No marketer assigned yet/)).toBeTruthy();
    expect(document.querySelector("[data-marketer-name]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send Message" })).toBeNull();
    expect((screen.getByRole("button", { name: /Message Marketer/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/No opportunities in play right now/)).toBeTruthy();
    expect(screen.getByText(/All caught up\. Follow-ups/)).toBeTruthy();
    expect(document.querySelector("[data-sample]")).toBeNull();
  });

  it("says the page is not part of the role on a 404 and offers a retry on a failure", async () => {
    reply = () => ({ status: 404, body: { code: "not_found" } });
    await mount();
    expect(screen.getByText("This page isn't part of your role")).toBeTruthy();
    cleanup();
    reply = () => ({ status: 500, body: {} });
    await mount();
    expect(screen.getByText(/didn't load/)).toBeTruthy();
  });
});
