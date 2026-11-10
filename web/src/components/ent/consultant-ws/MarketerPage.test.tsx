// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
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
      <MarketerPage orgId={2} />
    </ToastProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
  return view;
}

const card = (id: string) => document.querySelector(`[data-home-card="${id}"]`) as HTMLElement;

describe("My Marketer from real data", () => {
  it("asks the BFF once and draws the marketer card, the messages, the notes and the marketer's focus, and nothing else", async () => {
    await mount();
    expect(calls).toEqual(["/api/orgs/2/me-workspace/marketer"]);
    expect(document.querySelector("[data-marketer-name]")!.textContent).toBe("Emily Carter");
    expect(screen.getByText("Talent Marketing Specialist")).toBeTruthy();
    expect([...document.querySelectorAll("[data-focus-item]")].map((e) => e.getAttribute("data-focus-item"))).toEqual(["marketing", "skills"]);
    for (const id of ["marketer-plan", "marketer-focus-opportunities", "marketer-followups", "marketer-quick", "help"]) expect(card(id)).toBeNull();
    expect(document.querySelector("[data-focus-opportunity]")).toBeNull();
    expect(document.querySelector("[data-followup]")).toBeNull();
    expect(screen.queryByText(/Quick Actions|Ask a question|Shared Action Plan|Current Focus Opportunities|Upcoming Follow-ups/)).toBeNull();
  });

  it("invents nothing for the marketer's half: no sample marks, no reply badge, honest empty cards", async () => {
    reply = () => ({ status: 200, body: { ...full(), responseBadge: { sample: false, label: null, detail: null }, messages: { sample: false, items: [] }, actionPlan: { sample: false, items: [] }, notes: { sample: false, items: [] } } });
    await mount();
    expect(document.querySelector("[data-response-badge]")).toBeNull();
    expect(document.querySelector("[data-sample]")).toBeNull();
    expect(within(card("marketer-messages")).getByText("No messages yet.")).toBeTruthy();
    expect(within(card("marketer-notes")).getByText("No notes yet.")).toBeTruthy();
  });

  it("the messaging buttons are disabled with the reason as their tooltip and nothing opens or is sent", async () => {
    await mount();
    for (const name of ["Send Message", "Schedule Call"]) {
      const all = screen.getAllByRole("button", { name }) as HTMLButtonElement[];
      for (const b of all) {
        expect(b.disabled, name).toBe(true);
        expect(b.title).toContain("isn't available yet");
      }
    }
    expect(screen.queryByRole("button", { name: "View Calendar" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.textContent).not.toContain("until the marketing workspace");
    expect(document.body.textContent).not.toContain("not connected");
  });

  it("has an honest empty state when no marketer is assigned", async () => {
    reply = () => ({ status: 200, body: none() });
    await mount();
    expect(screen.getByText(/No marketer assigned yet/)).toBeTruthy();
    expect(document.querySelector("[data-marketer-name]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send Message" })).toBeNull();
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
