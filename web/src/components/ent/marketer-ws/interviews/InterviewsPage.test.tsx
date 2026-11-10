// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/interviews" }));
// the shell draws the header from what the page declares; here it is drawn in place so the subtitle can be asserted
vi.mock("@/components/ent/shell/ShellContext", () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
}));

import InterviewsPage from "./InterviewsPage";

const local = (day: number, h: number, m = 0) => new Date(2024, 3, day, h, m).toISOString();
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [3, 4, 5, 4, 6, 7, 6, value] });
const row = (id: number, consultant: string, role: string, client: string, type: string, startsAt: string, round: string, recruiter: string, status: string) => ({
  id, consultantId: id, consultant, avatarUrl: null, role, clientId: id, client, type, startsAt, durationMinutes: 45, round, recruiter, status, proposedFor: null, rescheduleCount: 0,
});

const ROWS = [
  row(1, "Alex Morgan", "Java Developer", "TechCorp", "VIDEO", local(22, 10), "1st Round", "Priya Sharma", "CONFIRMED"),
  row(2, "Priya Sharma", "Business Analyst", "Global Bank", "ONSITE", local(22, 14), "Final Round", "Emily Lawson", "CONFIRMED"),
  row(3, "Michael Park", "AWS Engineer", "CloudScale", "TECHNICAL", local(23, 11), "2nd Round", "David Kim", "SCHEDULED"),
  row(4, "Emily Lawson", "Project Manager", "HealthPlus", "PANEL", local(24, 13), "1st Round", "Priya Sharma", "PENDING_FEEDBACK"),
  row(5, "David Kim", "Data Analyst", "DataMatrix", "VIDEO", local(24, 15), "Final Round", "Michael Park", "SCHEDULED"),
  row(6, "Sophia Patel", "QA Engineer", "FinTech Solutions", "TECHNICAL", local(25, 10, 30), "1st Round", "Alex Morgan", "RESCHEDULED"),
  row(7, "Daniel Wright", "DevOps Engineer", "CloudScale", "PANEL", local(25, 14), "2nd Round", "Emily Lawson", "AWAITING_CONFIRMATION"),
  row(8, "Olivia Chen", "Product Manager", "InnovateTech", "CLIENT", local(26, 11), "Final Round", "David Kim", "SCHEDULED"),
];

const fixture = (over: Record<string, unknown> = {}) => ({
  generatedAt: local(21, 8),
  kpis: [kpi("interviewsThisWeek", 12, 20), kpi("confirmedInterviews", 8, 33), kpi("pendingFeedback", 5, -17), kpi("reschedules", 2, -50)],
  schedule: { items: ROWS, total: 8, page: 0, size: 25, from: "2024-04-21", to: "2024-04-27" },
  upcoming: ROWS.slice(0, 5),
  pendingFeedback: [
    { id: 101, interviewAt: local(20, 10), consultant: "James Wilson", avatarUrl: null, client: "TechCorp", round: "1st", daysOverdue: 2 },
    { id: 103, interviewAt: local(22, 9), consultant: "Emily Lawson", avatarUrl: null, client: "HealthPlus", round: "1st", daysOverdue: 1 },
    { id: 105, interviewAt: local(23, 9), consultant: "Sophia Patel", avatarUrl: null, client: "CloudScale", round: "1st", daysOverdue: 0 },
  ],
  checklist: {
    interviewId: 1, consultant: "Alex Morgan", client: "TechCorp",
    items: [
      { id: 1, label: "Review consultant resume and past feedback", done: true },
      { id: 2, label: "Share interview details with consultant", done: true },
      { id: 3, label: "Send calendar invite and meeting link", done: false },
      { id: 4, label: "Share client briefing and interview agenda", done: false },
      { id: 5, label: "Confirm technical requirements (if applicable)", done: false },
      { id: 6, label: "Prepare role-specific questions", done: false },
      { id: 7, label: "Notify internal stakeholders", done: false },
    ],
  },
  reminders: ROWS.slice(0, 5).map((r) => ({ id: r.id, startsAt: r.startsAt, consultant: r.consultant, client: r.client, type: r.type })),
  clients: [{ id: 1, name: "TechCorp" }, { id: 2, name: "Global Bank" }],
  ...over,
});

const HREFS = { interviews: "/w/marketing/interviews" };
const mount = () => render(<InterviewsPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} />);
const reply = (status: number, body: unknown) => vi.fn(async (...args: [string, RequestInit?]) => (void args, new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })));
/** The schedule rows are on screen (a name alone appears in several cards). */
const rowsReady = () => waitFor(() => expect(document.querySelector('[data-interview-row="1"]')).toBeTruthy());
const calls = (f: ReturnType<typeof reply>) => f.mock.calls.map(([u, i]) => `${i?.method ?? "GET"} ${String(u).split("?")[0]}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2024, 3, 24, 12, 0));
  vi.stubGlobal("fetch", reply(200, fixture()));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InterviewsPage", () => {
  it("has no tiles; the schedule header says how many interviews are this week", async () => {
    mount();
    await rowsReady();
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(0);
    expect(document.querySelector("[data-this-week]")?.textContent).toBe("12 this week");
    expect(document.body.textContent).not.toContain("vs last week");
  });

  it("sets the plan's subtitle", async () => {
    mount();
    await rowsReady();
    expect(screen.getByText("Your consultants' interviews, and the feedback still owed.")).toBeTruthy();
  });

  it("shows the schedule card: the week picker, filters, the View / List / Calendar switch and every column", async () => {
    mount();
    await rowsReady();
    const card = document.querySelector('[data-card="schedule"]') as HTMLElement;
    expect(within(card).getByText("Schedule")).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Date range: Apr 21 – Apr 27, 2024/ })).toBeTruthy();
    expect(within(card).getByText("All statuses")).toBeTruthy();
    expect(within(card).getByText("All clients")).toBeTruthy();
    expect(within(card).getByText("View")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(card).getByRole("button", { name: "Calendar" }).getAttribute("aria-pressed")).toBe("false");
    for (const h of ["Consultant", "Role", "Client", "Interview type", "Round", "Recruiter / contact", "Status", "Action"]) expect(within(card).getByRole("columnheader", { name: h })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Sort by date and time" })).toBeTruthy();
    expect(card.querySelectorAll("[data-interview-row]")).toHaveLength(8);
  });

  it("draws every row of the board: type label, date and time, round, recruiter and the five status chips", async () => {
    mount();
    await rowsReady();
    const r1 = document.querySelector('[data-interview-row="1"]') as HTMLElement;
    for (const t of ["Alex Morgan", "Java Developer", "TechCorp", "Video Interview", "Apr 22, 2024", "1st Round", "Priya Sharma", "Confirmed"]) expect(within(r1).getByText(t)).toBeTruthy();
    expect(r1.textContent).toMatch(/10:00\s?AM/);
    expect(within(document.querySelector('[data-interview-row="2"]') as HTMLElement).getByText("Onsite Interview")).toBeTruthy();
    expect(within(document.querySelector('[data-interview-row="3"]') as HTMLElement).getByText("Technical Interview")).toBeTruthy();
    expect(within(document.querySelector('[data-interview-row="4"]') as HTMLElement).getByText("Panel Interview")).toBeTruthy();
    expect(within(document.querySelector('[data-interview-row="8"]') as HTMLElement).getByText("Client Interview")).toBeTruthy();
    const chips = Array.from(document.querySelectorAll('[data-card="schedule"] [data-status-chip]')).map((c) => c.textContent);
    expect(chips).toEqual(["Confirmed", "Confirmed", "Scheduled", "Pending feedback", "Scheduled", "Rescheduled", "Awaiting confirmation", "Scheduled"]);
  });

  it("keeps Pending feedback; the Upcoming, Reminders and Preparation cards and the bee card are gone", async () => {
    mount();
    await rowsReady();
    const pf = document.querySelector('[data-card="pending-feedback"]') as HTMLElement;
    for (const h of ["Interview date", "Consultant", "Client", "Round", "Days"]) expect(within(pf).getByRole("columnheader", { name: h })).toBeTruthy();
    expect(Array.from(pf.querySelectorAll("[data-days-chip]")).map((c) => [c.textContent, c.getAttribute("data-days-chip")])).toEqual([["2 days", "red"], ["1 day", "amber"], ["< 1 day", "green"]]);
    expect(within(pf).getByText("Apr 20, 2024")).toBeTruthy();
    for (const c of ["upcoming", "reminders", "checklist"]) expect(document.querySelector(`[data-card="${c}"]`), c).toBeNull();
    expect(screen.queryByText(/Get ready for your interviews/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Ask a question/ })).toBeNull();
    expect(screen.queryByText("Interview Reminders")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("switches to a real week grid in Calendar view and keeps the same rows", async () => {
    const f = reply(200, fixture());
    vi.stubGlobal("fetch", f);
    mount();
    await rowsReady();
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    await waitFor(() => expect(document.querySelector("[data-calendar]")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Calendar" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("columnheader").filter((h) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+$/.test(h.textContent ?? ""))).toHaveLength(7);
    expect(document.querySelectorAll("[data-cal-event]")).toHaveLength(8);
    const ev = document.querySelector('[data-cal-event="1"]') as HTMLElement;
    expect(ev.textContent).toContain("Alex Morgan");
    expect(ev.textContent).toContain("TechCorp");
    // the calendar asks for the whole range in one page
    const last = new URL(String(f.mock.calls[f.mock.calls.length - 1][0]), "http://x");
    expect(last.searchParams.get("size")).toBe("100");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    await waitFor(() => expect(document.querySelector("[data-calendar]")).toBeNull());
  });

  it("changing the date range or sort asks the API again with the new parameters", async () => {
    const f = reply(200, fixture());
    vi.stubGlobal("fetch", f);
    mount();
    await rowsReady();
    fireEvent.click(screen.getByRole("button", { name: "Sort by date and time" }));
    await waitFor(() => expect(new URL(String(f.mock.calls[f.mock.calls.length - 1][0]), "http://x").searchParams.get("dir")).toBe("desc"));
    fireEvent.click(screen.getByRole("button", { name: /Date range/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Next week" }));
    await waitFor(() => {
      const u = new URL(String(f.mock.calls[f.mock.calls.length - 1][0]), "http://x");
      expect(u.searchParams.get("from")).toBe("2024-04-28");
      expect(u.searchParams.get("to")).toBe("2024-05-04");
    });
    expect(screen.getByRole("button", { name: /Date range: Apr 28 – May 4, 2024/ })).toBeTruthy();
  });

  it("Pending Feedback 'View all' filters the schedule to pending feedback", async () => {
    const f = reply(200, fixture());
    vi.stubGlobal("fetch", f);
    mount();
    await screen.findByText("Pending feedback", { selector: "h2" });
    fireEvent.click(screen.getByRole("button", { name: "View all pending feedback" }));
    await waitFor(() => expect(new URL(String(f.mock.calls[f.mock.calls.length - 1][0]), "http://x").searchParams.get("status")).toBe("PENDING_FEEDBACK"));
  });

  it("Propose reschedule is a proposal: it POSTs to the reschedule route and says the consultant confirms", async () => {
    const f = reply(200, fixture());
    vi.stubGlobal("fetch", f);
    mount();
    await rowsReady();
    fireEvent.click(within(document.querySelector('[data-interview-row="1"]') as HTMLElement).getByRole("button", { name: "Actions for Alex Morgan" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Propose reschedule" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/confirms the new time/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/New date and time/), { target: { value: "2099-01-05T10:00" } });
    f.mockImplementation(async (_u: string, i?: RequestInit) => new Response(JSON.stringify(i?.method === "POST" ? ROWS[0] : fixture()), { status: 200 }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Propose new time" }));
    await waitFor(() => expect(calls(f)).toContain("POST /api/orgs/2/mkt/interviews/1/reschedule"));
    const post = f.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(JSON.parse(String(post[1]?.body)).proposedAt).toBe(new Date(2099, 0, 5, 10, 0).toISOString());
    await screen.findByText(/Proposed a new time for Alex Morgan/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Record feedback, Confirm and Reminder go through the BFF; a refusal is shown, not swallowed", async () => {
    const f = reply(200, fixture());
    vi.stubGlobal("fetch", f);
    mount();
    await rowsReady();
    fireEvent.click(within(document.querySelector('[data-interview-row="4"]') as HTMLElement).getByRole("button", { name: "Actions for Emily Lawson" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Record feedback" }));
    const dialog = await screen.findByRole("dialog");
    f.mockImplementation(async (_u: string, i?: RequestInit) => (i?.method === "POST" ? new Response(JSON.stringify({ message: "The interview has not happened yet" }), { status: 409 }) : new Response(JSON.stringify(fixture()), { status: 200 })));
    fireEvent.change(within(dialog).getByPlaceholderText("What the client said"), { target: { value: "Went well" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save feedback" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("has not happened yet");
    expect(calls(f)).toContain("POST /api/orgs/2/mkt/interviews/4/feedback");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    f.mockImplementation(async (_u: string, i?: RequestInit) => new Response(JSON.stringify(i?.method === "POST" ? ROWS[2] : fixture()), { status: 200 }));
    fireEvent.click(within(document.querySelector('[data-interview-row="3"]') as HTMLElement).getByRole("button", { name: "Actions for Michael Park" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Record slot confirmed" }));
    await waitFor(() => expect(calls(f)).toContain("POST /api/orgs/2/mkt/interviews/3/confirm"));
    fireEvent.click(within(document.querySelector('[data-interview-row="3"]') as HTMLElement).getByRole("button", { name: "Actions for Michael Park" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Request reminder" }));
    await waitFor(() => expect(calls(f)).toContain("POST /api/orgs/2/mkt/interviews/3/remind"));
    await screen.findByText(/Nothing is sent from here/);
  });

  it("no menu offers anything that submits for a consultant", async () => {
    mount();
    await rowsReady();
    fireEvent.click(within(document.querySelector('[data-interview-row="1"]') as HTMLElement).getByRole("button", { name: "Actions for Alex Morgan" }));
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    expect(items).toEqual(["Propose reschedule", "Request reminder"]); // already confirmed: no "Record slot confirmed"
    expect(items.join(" ")).not.toMatch(/submit|apply|send/i);
  });

  it("says so, with no rows and no numbers, when everything is empty", async () => {
    vi.stubGlobal("fetch", reply(200, fixture({ kpis: [], schedule: { items: [], total: 0, page: 0, size: 25, from: "2024-04-21", to: "2024-04-27" }, upcoming: [], pendingFeedback: [], checklist: null, reminders: [], clients: [] })));
    mount();
    await screen.findByText("No interviews scheduled in this period.");
    expect(screen.getByText("No feedback is waiting.")).toBeTruthy();
    expect(document.querySelector("[data-interview-row]")).toBeNull();
  });

  it("offers a retry when the load fails and recovers", async () => {
    const f = reply(500, {});
    vi.stubGlobal("fetch", f);
    mount();
    const retry = await screen.findByRole("button", { name: /try again|retry/i });
    f.mockImplementation(async () => new Response(JSON.stringify(fixture()), { status: 200 }));
    fireEvent.click(retry);
    await rowsReady();
  });

  it("says the page isn't part of the role on 403 and 404", async () => {
    for (const status of [403, 404]) {
      vi.stubGlobal("fetch", reply(status, { code: "NOT_FOUND" }));
      const { unmount } = mount();
      await screen.findByText("This page isn't part of your role");
      unmount();
    }
  });
});
