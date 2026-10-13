// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/followups" }));

import FollowupsPage from "./FollowupsPage";

const at = (day: number, h: number, m = 0) => new Date(2026, 9, 13 + day, h, m).toISOString();
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [3, 4, 4, 6, 5, 8, 9, value] });
const row = (id: number, title: string, consultant: string, counterpart: string, channel: string, due: string, priority: string, status: string, overdue = false) => ({
  id, title, detail: `${consultant} - Java Developer`, consultantId: id, consultantName: consultant, avatarUrl: null, counterpart, channel, priority, status, overdue, dueAt: due, completedAt: null,
});

const TODAY = [
  row(1, "Interview feedback call", "Alex Morgan", "TechCorp", "PHONE", at(0, 9), "HIGH", "PENDING"),
  row(2, "Send candidate availability", "Priya Sharma", "Global Bank", "EMAIL", at(0, 10, 30), "MEDIUM", "IN_PROGRESS"),
  row(3, "Confirm next interview", "Michael Park", "AWS", "PHONE", at(0, 11), "HIGH", "PENDING"),
  row(4, "Share updated resume", "Emily Lawson", "HealthPlus", "EMAIL", at(0, 13), "MEDIUM", "PENDING"),
  row(5, "Client debrief meeting", "David Kim", "CloudScale", "TEAMS", at(0, 15), "HIGH", "SCHEDULED"),
  row(6, "Check reference status", "Sophia Martinez", "Deloitte", "PHONE", at(0, 16, 30), "LOW", "PENDING"),
  row(7, "Send engagement letter", "Liam O'Connor", "TechCorp", "EMAIL", at(0, 17), "LOW", "PENDING"),
  row(8, "Confirm start date", "Mia Thompson", "Global Bank", "PHONE", at(0, 17, 30), "LOW", "PENDING"),
];
const OVERDUE = [
  row(21, "Interview feedback (1st round)", "Daniel Wright", "FinTech Solutions", "EMAIL", at(1, 9), "HIGH", "PENDING", true),
  row(22, "Send offer update", "Olivia Bennett", "RetailCo", "PHONE", at(1, 11), "HIGH", "PENDING", true),
];
const UPCOMING = [row(31, "Schedule final interview", "Liam O'Connor", "TechCorp", "PHONE", at(4, 10), "MEDIUM", "NOT_STARTED")];

const view = (over: Record<string, unknown> = {}) => ({
  kpis: [kpi("dueToday", 12, 33), kpi("overdue", 6, 40), kpi("completedToday", 18, 20), kpi("waiting", 14, null)],
  today: { items: TODAY, total: 12 },
  overdue: { items: OVERDUE, total: 6 },
  upcoming: { items: UPCOMING, total: 14 },
  insights: { window: "THIS_WEEK", responseRatePct: 68, avgResponseHours: 43.2, completed: 32, waiting: 14 },
  ...over,
});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => (c as unknown as [string])[0]);
let fetchMock: ReturnType<typeof vi.fn>;
const mount = () => render(<FollowupsPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={{}} />);
const loaded = async () => {
  mount();
  await screen.findByText("Interview feedback call");
};

beforeEach(() => {
  fetchMock = vi.fn(async (u: string, init?: RequestInit) => (init?.method ? reply(200, { item: null, event: "X", emailed: false }) : reply(200, view())));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FollowupsPage board", () => {
  it("draws the four KPI tiles in the inline layout with value, delta and 'vs last week'", async () => {
    await loaded();
    const tiles = document.querySelectorAll("[data-stat-tile]");
    expect(tiles).toHaveLength(4);
    const t = (id: string) => document.querySelector(`[data-stat-tile="${id}"]`) as HTMLElement;
    expect(within(t("dueToday")).getByText("Due Today")).toBeTruthy();
    expect(within(t("dueToday")).getByText("12")).toBeTruthy();
    expect(t("dueToday").textContent).toContain("33%");
    expect(t("dueToday").textContent).toContain("vs last week");
    expect(within(t("overdue")).getByText("Overdue")).toBeTruthy();
    expect(within(t("completedToday")).getByText("Completed Today")).toBeTruthy();
    expect(within(t("completedToday")).getByText("18")).toBeTruthy();
    expect(within(t("waiting")).getByText("Waiting on Response")).toBeTruthy();
    expect(within(t("waiting")).getByText("14")).toBeTruthy();
    expect(t("waiting").textContent).not.toContain("vs last week"); // no previous value: no chip
  });

  it("titles every card with its total and the Today toolbar", async () => {
    await loaded();
    expect(screen.getByRole("heading", { name: /Today's Follow-ups\s*\(12\)/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Overdue Follow-ups\s*\(6\)/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Upcoming Follow-ups\s*\(14\)/ })).toBeTruthy();
    const today = document.querySelector('[data-followups-card="today"]') as HTMLElement;
    for (const b of ["Send Reminder", "Log Call", "Update Status"]) expect(within(today).getByRole("button", { name: b })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /View all|Show less/ })).toHaveLength(3);
  });

  it("draws the board's columns and row cells", async () => {
    await loaded();
    const table = document.querySelector('[data-followup-table="today"]') as HTMLElement;
    for (const h of ["Follow-up Item", "Consultant", "Client / Recruiter", "Channel", "Due Time", "Priority", "Status"]) expect(within(table).getByText(h)).toBeTruthy();
    const r = table.querySelector('[data-followup-row="1"]') as HTMLElement;
    expect(within(r).getByText("Interview feedback call")).toBeTruthy();
    expect(within(r).getByText("Alex Morgan")).toBeTruthy();
    expect(within(r).getByText("TechCorp")).toBeTruthy();
    expect(within(r).getByText("Phone")).toBeTruthy();
    expect(within(r).getByText("9:00 AM")).toBeTruthy();
    expect(within(r).getByText("High")).toBeTruthy();
    expect(within(r).getByText("Pending")).toBeTruthy();
    expect(within(r).getByRole("checkbox", { name: "Select Interview feedback call" })).toBeTruthy();
    expect(within(r).getByRole("button", { name: "More for Interview feedback call" })).toBeTruthy();
    const t5 = table.querySelector('[data-followup-row="5"]') as HTMLElement;
    expect(within(t5).getByText("Teams")).toBeTruthy();
    expect(within(t5).getByText("Scheduled")).toBeTruthy();
    expect(within(t5).getByText("CloudScale")).toBeTruthy();
    expect(within(table.querySelector('[data-followup-row="2"]') as HTMLElement).getByText("In Progress")).toBeTruthy();
    expect(within(table.querySelector('[data-followup-row="2"]') as HTMLElement).getByText("Email")).toBeTruthy();
  });

  it("shows dates on overdue rows with the Overdue chip, and Not Started upcoming rows", async () => {
    await loaded();
    const over = document.querySelector('[data-followup-table="overdue"]') as HTMLElement;
    expect(within(over).getByText("Oct 14, 9:00 AM")).toBeTruthy();
    expect(within(over).getAllByText("Overdue")).toHaveLength(2);
    expect(within(over).getByText("FinTech Solutions")).toBeTruthy();
    const up = document.querySelector('[data-followup-table="upcoming"]') as HTMLElement;
    expect(within(up).getByText("Not Started")).toBeTruthy();
    expect(within(up).getByText("Oct 17, 10:00 AM")).toBeTruthy();
  });

  it("shows six of the Today rows and 'View all' reveals the rest", async () => {
    await loaded();
    const today = document.querySelector('[data-followups-card="today"]') as HTMLElement;
    expect(today.querySelectorAll("[data-followup-row]")).toHaveLength(6);
    fireEvent.click(within(today).getByRole("button", { name: "View all" }));
    expect(today.querySelectorAll("[data-followup-row]")).toHaveLength(8);
    expect(within(today).getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("sorts Today by Due Time when the header is clicked", async () => {
    await loaded();
    const table = document.querySelector('[data-followup-table="today"]') as HTMLElement;
    const ids = () => [...table.querySelectorAll("[data-followup-row]")].map((e) => e.getAttribute("data-followup-row"));
    expect(ids()[0]).toBe("1");
    fireEvent.click(within(table).getByRole("button", { name: /Due Time/ }));
    expect(ids()[0]).toBe("8");
  });

  it("draws the right column: bee help card, Quick Actions with descriptions, Insights", async () => {
    await loaded();
    expect(screen.getByText("Keep your follow-ups on track")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ask a question/ })).toBeTruthy();
    const quick = document.querySelector('[data-followups-card="quick-actions"]') as HTMLElement;
    expect(within(quick).getByText("Quick Actions")).toBeTruthy();
    expect(within(quick).getByText("Record call notes and outcomes")).toBeTruthy();
    expect(within(quick).getByText("Mark follow-up as complete or update")).toBeTruthy();
    expect(within(quick).getByText("Send Reminder")).toBeTruthy();
    const ins = document.querySelector('[data-followups-card="insights"]') as HTMLElement;
    expect(within(ins).getByText("Follow-up Insights")).toBeTruthy();
    expect(within(ins).getByRole("button", { name: "Insights window" }).textContent).toContain("This Week");
    expect(within(ins).getByText("Response Rate")).toBeTruthy();
    expect(within(ins).getByText("68%")).toBeTruthy();
    expect(within(ins).getByText("Avg. Response Time")).toBeTruthy();
    expect(within(ins).getByText("1.8 days")).toBeTruthy();
    expect(within(ins).getByText("Follow-up Completed")).toBeTruthy();
    expect(within(ins).getByText("32")).toBeTruthy();
    expect(within(ins).getByText("Still Waiting")).toBeTruthy();
    expect(within(ins).getByText("14")).toBeTruthy();
  });

  it("reloads the insights for another window", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Insights window" }));
    fireEvent.click(await screen.findByRole("option", { name: "Last Week" }));
    await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("window=LAST_WEEK"))).toBe(true));
  });
});

describe("FollowupsPage states", () => {
  it("empty lists show the board's empty copy and no fake rows", async () => {
    fetchMock.mockImplementation(async () => reply(200, view({ today: { items: [], total: 0 }, overdue: { items: [], total: 0 }, upcoming: { items: [], total: 0 }, kpis: [kpi("dueToday", 0, null), kpi("overdue", 0, null), kpi("completedToday", 0, null), kpi("waiting", 0, null)], insights: { window: "THIS_WEEK", responseRatePct: null, avgResponseHours: null, completed: 0, waiting: 0 } })));
    mount();
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(screen.getByText("Nothing is overdue.")).toBeTruthy();
    expect(screen.getByText("No upcoming follow-ups.")).toBeTruthy();
    expect(document.querySelectorAll("[data-followup-row]")).toHaveLength(0);
    expect(screen.getByText("No follow-up activity in this window yet.")).toBeTruthy();
  });

  it("a failed load shows a retry that loads again", async () => {
    fetchMock.mockImplementationOnce(async () => reply(500, {}));
    mount();
    const retry = await screen.findByRole("button", { name: /retry|try again/i });
    fireEvent.click(retry);
    expect(await screen.findByText("Interview feedback call")).toBeTruthy();
  });

  it.each([403, 404])("a %i says this page isn't part of the role", async (code) => {
    fetchMock.mockImplementation(async () => reply(code, {}));
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
    expect(document.querySelectorAll("[data-followup-row]")).toHaveLength(0);
  });
});

describe("FollowupsPage actions (E1: they only record)", () => {
  const writes = () => fetchMock.mock.calls.filter((c) => (c as unknown as [string, RequestInit?])[1]?.method).map((c) => c as unknown as [string, RequestInit]);

  it("asks for a selection before any action", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Log Call" }));
    expect(screen.getByText("Select at least one follow-up first.")).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it("Send Reminder records a reminder request for the checked rows and says nothing was emailed", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Interview feedback call" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Confirm next interview" }));
    fireEvent.click(within(document.querySelector('[data-followups-card="today"]') as HTMLElement).getByRole("button", { name: "Send Reminder" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Nothing is emailed");
    fireEvent.click(within(dialog).getByRole("button", { name: "Record reminder" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Nothing was emailed"));
    const w = writes();
    expect(w.map((c) => c[0])).toEqual(["/api/orgs/2/mkt/followups/1/reminder", "/api/orgs/2/mkt/followups/3/reminder"]);
    expect(w.every((c) => c[1].method === "POST")).toBe(true);
  });

  it("Log Call needs a note, then posts it", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "More for Share updated resume" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Log call" }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save call" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Call notes", { selector: "textarea" }), { target: { value: "Left a voicemail" } });
    fireEvent.click(within(dialog).getByLabelText("Waiting for a reply"));
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][0]).toBe("/api/orgs/2/mkt/followups/4/call");
    expect(JSON.parse(writes()[0][1].body as string)).toEqual({ note: "Left a voicemail", awaitingReply: true });
  });

  it("Mark complete from the row menu completes that row and reloads the board", async () => {
    await loaded();
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "More for Confirm next interview" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark complete" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][0]).toBe("/api/orgs/2/mkt/followups/3/complete");
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before + 1));
  });

  it("a failed save keeps the dialog open with the API's message", async () => {
    fetchMock.mockImplementation(async (u: string, init?: RequestInit) => (init?.method ? reply(422, { error: "note: contains a sensitive number" }) : reply(200, view())));
    await loaded();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Interview feedback call" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Update Status" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Update status" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("sensitive number");
  });

  it("never calls anything that submits for a consultant or sends mail", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Interview feedback call" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Send Reminder" })[0]);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record reminder" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    for (const u of urls(fetchMock)) {
      expect(u).toMatch(/^\/api\/orgs\/2\/mkt\/followups(\?|\/\d+\/(reminder|call|status|complete)$)/);
      expect(u).not.toMatch(/submit|email|mail|send/);
    }
  });
});
