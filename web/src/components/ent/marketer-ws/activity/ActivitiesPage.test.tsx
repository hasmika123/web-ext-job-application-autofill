// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/activity" }));

import ActivitiesPage from "./ActivitiesPage";

const at = (day: number, h: number, m: number) => new Date(Date.UTC(2024, 9, day, h, m)).toISOString();
const person = (name: string, id: number) => ({ id, name, avatarUrl: null });
const row = (id: string, type: string, group: string, groupLabel: string, title: string, subtitle: string, when: string, actor: string, consultant: string, client: string, tag: string, extra: Record<string, unknown> = {}) => ({
  id, source: id.split(":")[0], type, group, groupLabel, title, subtitle, at: when, actor: person(actor, 1), consultant: person(consultant, 2), client: { id: 3, name: client }, tag, status: "COMPLETED", manual: false, ...extra,
});

const ROWS = [
  row("RESUME:1", "RESUME_UPDATED", "RESUME", "Resume", "Resume Updated", "Updated work experience and skills", at(18, 16, 32), "Emily Lawson", "Alex Morgan", "TechCorp", "Profile"),
  row("OPPORTUNITY:2", "OPPORTUNITY_ASSIGNED", "OPPORTUNITY", "Opportunity", "Opportunity Assigned", "Assigned to new opportunity", at(18, 14, 15), "Sarah Chen", "Priya Sharma", "Global Bank", "Marketing"),
  row("SUBMISSION:3", "SUBMISSION_APPROVED", "SUBMISSION", "Submission", "Consultant Approved Submission", "Approved to submit to client", at(18, 11, 40), "Michael Park", "David Kim", "CloudScale", "Approval"),
  row("SUBMISSION:4", "CANDIDATE_SUBMITTED", "SUBMISSION", "Submission", "Candidate Submitted to Client", "Submitted profile for consideration", at(17, 15, 26), "Priya Sharma", "Emily Lawson", "HealthPlus", "Client"),
  row("FOLLOWUP:5", "FOLLOWUP_LOGGED", "FOLLOWUP", "Follow-up", "Recruiter Follow-up Logged", "Spoke with hiring manager", at(17, 13, 10), "Alex Morgan", "Michael Park", "AWS", "Client Call"),
  row("INTERVIEW:6", "INTERVIEW_SCHEDULED", "INTERVIEW", "Interview", "Interview Scheduled", "Technical interview scheduled", at(16, 11, 0), "Daniel Wright", "Anna Wilson", "RetailCo", "Technical"),
  row("INTERVIEW:7", "FEEDBACK_RECEIVED", "FEEDBACK", "Feedback", "Interview Feedback Received", "Positive feedback from client", at(15, 16, 20), "Olivia Bennett", "Daniel Kim", "NextGen Tech", "Positive"),
  row("APPLICATION:8", "APPLICATION_MOVED", "APPLICATION", "Application", "Application Moved to Interview", "Moved to interview stage", at(15, 10, 15), "Ethan Brooks", "Isabella Rossi", "ACME Internal", "Pipeline"),
  row("APPLICATION:9", "OFFER_RECEIVED", "OFFER", "Offer", "Offer Received", "Received written offer from client", at(14, 15, 5), "Noah Patel", "Alex Morgan", "TechCorp", "Success"),
  row("PLACEMENT:10", "PLACEMENT_CONFIRMED", "PLACEMENT", "Placement", "Placement Confirmed", "Consultant started - position filled", at(14, 9, 30), "Sarah Chen", "Priya Sharma", "Global Bank", "Closed"),
];

const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [3, 4, 4, 6, 5, 8, 9, value] });
const nowDay = new Date();
const today = (h: number) => new Date(Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth(), nowDay.getUTCDate(), h)).toISOString();
const tomorrow = (h: number) => new Date(Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth(), nowDay.getUTCDate() + 1, h)).toISOString();

const view = (over: Record<string, unknown> = {}) => ({
  generatedAt: "2026-10-13T10:00:00Z", from: "2024-10-01", to: "2024-10-31", canLog: true,
  kpis: [kpi("total", 148, 22), kpi("resume", 28, 33), kpi("submission", 36, 20), kpi("followup", 42, 14), kpi("interview", 18, 38)],
  activities: { items: ROWS, total: 148, page: 0, size: 10 },
  summary: {
    range: "THIS_MONTH", from: "2024-10-01", to: "2024-10-31", total: 148,
    rows: [["RESUME", "Resume Updates", 28, 18.9], ["SUBMISSION", "Submissions", 36, 24.3], ["FOLLOWUP", "Client Follow-ups", 42, 28.4], ["INTERVIEW", "Interviews", 18, 12.2], ["APPLICATION", "Applications", 14, 9.5], ["OFFER", "Offers", 6, 4.1], ["PLACEMENT", "Placements", 4, 2.7]]
      .map(([key, label, count, pct]) => ({ key, label, count, pct })),
  },
  upcoming: [
    { id: "FOLLOWUP:1", kind: "FOLLOWUP", icon: "phone", title: "Client follow-up: TechCorp", consultantName: "Alex Morgan", at: today(10) },
    { id: "FOLLOWUP:2", kind: "FOLLOWUP", icon: "message", title: "Interview feedback call", consultantName: "Emily Lawson", at: today(14) },
    { id: "FOLLOWUP:3", kind: "FOLLOWUP", icon: "resume", title: "Send updated resume", consultantName: "Priya Sharma", at: tomorrow(9) },
    { id: "FOLLOWUP:4", kind: "FOLLOWUP", icon: "application", title: "Check application status", consultantName: "Michael Park", at: tomorrow(13) },
    { id: "INTERVIEW:5", kind: "INTERVIEW", icon: "calendar", title: "Interview: RetailCo", consultantName: "Daniel Kim", at: new Date(Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth(), nowDay.getUTCDate() + 6, 10)).toISOString() },
    { id: "FOLLOWUP:6", kind: "FOLLOWUP", icon: "phone", title: "Follow up on offer details", consultantName: "Daniel Kim", at: new Date(Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth(), nowDay.getUTCDate() + 7, 10)).toISOString() },
  ],
  upcomingTotal: 6,
  options: {
    consultants: [{ id: 2, name: "Alex Morgan" }, { id: 4, name: "Priya Sharma" }], clients: [{ id: 3, name: "TechCorp" }], owners: [{ id: 1, name: "Sarah Chen" }],
    types: [{ key: "RESUME", label: "Resume" }, { key: "FOLLOWUP", label: "Follow-up" }], manualTypes: [{ key: "FOLLOWUP_LOGGED", label: "Recruiter Follow-up Logged" }, { key: "RESUME_UPDATED", label: "Resume Updated" }],
    statuses: [{ key: "COMPLETED", label: "Completed" }, { key: "SCHEDULED", label: "Scheduled" }, { key: "CANCELLED", label: "Cancelled" }],
    summaryRanges: [{ key: "THIS_MONTH", label: "This Month" }, { key: "LAST_MONTH", label: "Last Month" }],
  },
  ...over,
});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const calls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => c as unknown as [string, RequestInit | undefined]);
let fetchMock: ReturnType<typeof vi.fn>;
const mount = () => render(<ActivitiesPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={{}} />);
const loaded = async () => {
  mount();
  await screen.findByText("Consultant Approved Submission");
};

beforeEach(() => {
  fetchMock = vi.fn(async (_u: string, init?: RequestInit) => (init?.method ? reply(200, { item: null }) : reply(200, view())));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActivitiesPage board", () => {
  it("draws the five KPI tiles in the inline layout with value, delta and 'vs last week'", async () => {
    await loaded();
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(5);
    const t = (id: string) => document.querySelector(`[data-stat-tile="${id}"]`) as HTMLElement;
    for (const [id, title, value, delta] of [["total", "Total Activities", "148", "22%"], ["resume", "Resume Updates", "28", "33%"], ["submission", "New Submissions", "36", "20%"], ["followup", "Client Follow-ups", "42", "14%"], ["interview", "Interviews Coordinated", "18", "38%"]]) {
      expect(within(t(id)).getByText(title)).toBeTruthy();
      expect(within(t(id)).getByText(value)).toBeTruthy();
      expect(t(id).textContent).toContain(delta);
      expect(t(id).textContent).toContain("vs last week");
    }
  });

  it("draws the filter row with the board's labels, the range and the All options", async () => {
    await loaded();
    const f = document.querySelector("[data-activity-filters]") as HTMLElement;
    for (const l of ["Date Range", "Consultant", "Activity Type", "Status", "Client", "Owner"]) expect(within(f).getByText(l)).toBeTruthy();
    expect(within(f).getByRole("button", { name: "Date range: Oct 1, 2024 - Oct 31, 2024" })).toBeTruthy();
    for (const [label, all] of [["Consultant", "All Consultants"], ["Activity Type", "All Types"], ["Status", "All Statuses"], ["Client", "All Clients"], ["Owner", "All Owners"]]) {
      expect(within(f).getByRole("button", { name: label }).textContent).toContain(all);
    }
  });

  it("titles the feed with its total, the sort select and the Log Activity button", async () => {
    await loaded();
    expect(screen.getByRole("heading", { name: /Recent Activities\s*\(148\)/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort" }).textContent).toContain("Most Recent");
    expect(screen.getByRole("button", { name: /Log Activity/ })).toBeTruthy();
  });

  it("draws the board's columns and row cells (date and time, icon title and subtitle, people, client logo, two chips, status)", async () => {
    await loaded();
    const table = document.querySelector("[data-activity-table]") as HTMLElement;
    for (const h of ["Date & Time", "Activity", "Actor", "Consultant", "Related To", "Client", "Tags", "Status"]) expect(within(table).getByRole("columnheader", { name: h })).toBeTruthy();
    const r = table.querySelector('[data-activity-row="RESUME:1"]') as HTMLElement;
    expect(within(r).getByText("Oct 18, 2024")).toBeTruthy();
    expect(within(r).getByText("4:32 PM")).toBeTruthy();
    expect(within(r).getByText("Resume Updated")).toBeTruthy();
    expect(within(r).getByText("Updated work experience and skills")).toBeTruthy();
    expect(within(r).getByText("Emily Lawson")).toBeTruthy();
    expect(within(r).getByText("Alex Morgan")).toBeTruthy();
    expect(within(r).getByText("TechCorp")).toBeTruthy();
    expect(r.querySelector('img[src="/ent/marketer/activity/logo-techcorp.png"]')).toBeTruthy();
    expect(within(r).getByText("Resume")).toBeTruthy();
    expect(within(r).getByText("Profile")).toBeTruthy();
    expect(within(r).getByText("Completed")).toBeTruthy();
    expect(within(r).getByRole("button", { name: "More for Resume Updated" })).toBeTruthy();
    expect(table.querySelectorAll("[data-activity-row]")).toHaveLength(10);
    expect(within(table.querySelector('[data-activity-row="PLACEMENT:10"]') as HTMLElement).getByText("Closed")).toBeTruthy();
    expect(within(table.querySelector('[data-activity-row="INTERVIEW:7"]') as HTMLElement).getByText("Feedback")).toBeTruthy();
    expect(within(table.querySelector('[data-activity-row="INTERVIEW:7"]') as HTMLElement).getByText("Positive")).toBeTruthy();
  });

  it("draws the right column: bee help card, summary rows with counts and percents, upcoming rows with their day", async () => {
    await loaded();
    expect(screen.getByText("Keep your marketing momentum going")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ask a question/ })).toBeTruthy();
    const sum = document.querySelector('[data-activity-card="summary"]') as HTMLElement;
    expect(within(sum).getByRole("heading", { name: "Activity Summary by Type" })).toBeTruthy();
    expect(within(sum).getByRole("button", { name: "Summary range" }).textContent).toContain("This Month");
    const resume = sum.querySelector('[data-summary-row="RESUME"]') as HTMLElement;
    expect(resume.textContent).toContain("Resume Updates");
    expect(resume.textContent).toContain("28");
    expect(resume.textContent).toContain("19%");
    expect(sum.querySelectorAll("[data-summary-row]")).toHaveLength(7);
    expect(within(sum).getByText("Placements")).toBeTruthy();
    const up = document.querySelector('[data-activity-card="upcoming"]') as HTMLElement;
    expect(within(up).getByRole("heading", { name: "Upcoming Activities" })).toBeTruthy();
    expect(up.querySelectorAll("[data-upcoming-row]")).toHaveLength(5);
    expect(within(up).getByText("Client follow-up: TechCorp")).toBeTruthy();
    expect(within(up).getByText("Alex Morgan")).toBeTruthy();
    expect(within(up).getByText("Today, 10:00 AM")).toBeTruthy();
    expect(within(up).getByText("Tomorrow, 9:00 AM")).toBeTruthy();
    fireEvent.click(within(up).getByRole("button", { name: "View all" }));
    expect(up.querySelectorAll("[data-upcoming-row]")).toHaveLength(6);
  });

  it("pages through the feed with Previous / Next", async () => {
    await loaded();
    expect(screen.getByText("Showing 1 to 10 of 148 activities")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls(fetchMock).some(([u]) => u.includes("page=1"))).toBe(true));
  });
});

describe("filters", () => {
  it("a Select filter reloads the board with that filter and goes back to page 0", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Consultant" }));
    fireEvent.click(await screen.findByRole("option", { name: "Priya Sharma" }));
    await waitFor(() => expect(calls(fetchMock).some(([u]) => u.includes("consultantId=4") && u.includes("page=0"))).toBe(true));
  });

  it("changing the sort asks for the oldest first", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click(await screen.findByRole("option", { name: "Oldest First" }));
    await waitFor(() => expect(calls(fetchMock).some(([u]) => u.includes("sort=oldest"))).toBe(true));
  });

  it("the summary range select has its own range", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Summary range" }));
    fireEvent.click(await screen.findByRole("option", { name: "Last Month" }));
    await waitFor(() => expect(calls(fetchMock).some(([u]) => u.includes("summaryRange=LAST_MONTH"))).toBe(true));
  });

  it("a date preset reloads with from and to", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Date range:/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Last 7 days" }));
    await waitFor(() => expect(calls(fetchMock).some(([u]) => /from=\d{4}-\d{2}-\d{2}/.test(u) && /to=\d{4}-\d{2}-\d{2}/.test(u))).toBe(true));
  });
});

describe("states", () => {
  it("an empty org shows the empty copy and honest nothing-yet tiles", async () => {
    fetchMock.mockImplementation(async () =>
      reply(200, view({ kpis: ACTIVITY_ZERO(), activities: { items: [], total: 0, page: 0, size: 10 }, summary: { range: "THIS_MONTH", from: "2024-10-01", to: "2024-10-31", total: 0, rows: [] }, upcoming: [], upcomingTotal: 0 })),
    );
    mount();
    expect((await screen.findAllByText("No activity yet")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Nothing scheduled in the next two weeks.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Recent Activities\s*\(0\)/ })).toBeTruthy();
    expect(document.querySelector("[data-activity-table]")).toBeNull();
  });

  it("a failed load shows the retry and a retry reloads", async () => {
    fetchMock.mockImplementation(async () => reply(500, {}));
    mount();
    const retry = await screen.findByRole("button", { name: /Try again|Retry/ });
    fetchMock.mockImplementation(async () => reply(200, view()));
    fireEvent.click(retry);
    await screen.findByText("Consultant Approved Submission");
  });

  it("a 403 or 404 says the page isn't part of the role", async () => {
    fetchMock.mockImplementation(async () => reply(404, {}));
    mount();
    expect(await screen.findByText(/isn't part of your role/)).toBeTruthy();
  });

  it("a caller who may only read sees no Log Activity button", async () => {
    fetchMock.mockImplementation(async () => reply(200, view({ canLog: false })));
    await loaded();
    expect(screen.queryByRole("button", { name: /Log Activity/ })).toBeNull();
  });
});

function ACTIVITY_ZERO() {
  return ["total", "resume", "submission", "followup", "interview"].map((key) => ({ key, value: 0, deltaPct: null, sparkline: [] }));
}

describe("record-only writes", () => {
  it("Log Activity records through the activity BFF route and nothing else, then reloads", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Log Activity/ }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText(/nothing is sent to the client or the consultant, and nothing is submitted/i)).toBeTruthy();
    const submit = within(dlg).getByRole("button", { name: "Log activity" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // needs a consultant and a title
    fireEvent.click(within(dlg).getByRole("button", { name: "Consultant" }));
    fireEvent.click(await screen.findByRole("option", { name: "Alex Morgan" }));
    fireEvent.change(within(dlg).getByLabelText("Title"), { target: { value: "Called the recruiter" } });
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(calls(fetchMock).some(([, init]) => init?.method === "POST")).toBe(true));
    const post = calls(fetchMock).find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/api/orgs/2/mkt/activity");
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ consultantId: 2, type: "FOLLOWUP_LOGGED", title: "Called the recruiter", clientAccountId: null });
    await screen.findByText(/Activity logged\. Nothing was sent to anyone\./);
    // every write the page made went to the activity BFF; none of them can submit for a consultant
    for (const [u] of calls(fetchMock).filter(([, i]) => i?.method)) expect(u).toMatch(/^\/api\/orgs\/2\/mkt\/activity(\/\d+\/status)?$/);
  });

  it("a rejected log keeps the dialog open with the API's message", async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) => (init?.method ? reply(422, { error: "title: contains a sensitive identifier" }) : reply(200, view())));
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Log Activity/ }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Consultant" }));
    fireEvent.click(await screen.findByRole("option", { name: "Alex Morgan" }));
    fireEvent.change(within(dlg).getByLabelText("Title"), { target: { value: "x" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Log activity" }));
    expect((await within(dlg).findByRole("alert")).textContent).toContain("sensitive identifier");
  });

  it("the kebab opens the details of a feed line; only a logged row can change status", async () => {
    const manual = row("MANUAL:50", "FOLLOWUP_LOGGED", "FOLLOWUP", "Follow-up", "Called the recruiter", "Left a voicemail", at(13, 9, 0), "Sarah Chen", "Alex Morgan", "TechCorp", "Client", { manual: true, source: "MANUAL", status: "SCHEDULED" });
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) => (init?.method ? reply(200, { item: null }) : reply(200, view({ activities: { items: [ROWS[0], manual], total: 2, page: 0, size: 10 } }))));
    mount();
    await screen.findByText("Called the recruiter");
    fireEvent.click(screen.getByRole("button", { name: "More for Resume Updated" }));
    expect(screen.queryByRole("menuitem", { name: "Cancel activity" })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: "View details" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("Updated work experience and skills")).toBeTruthy();
    expect(within(dlg).getByText("Resume change log")).toBeTruthy();
    fireEvent.click(within(dlg).getAllByRole("button", { name: "Close" }).at(-1)!);

    fireEvent.click(screen.getByRole("button", { name: "More for Called the recruiter" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cancel activity" }));
    await waitFor(() => expect(calls(fetchMock).some(([u, init]) => u === "/api/orgs/2/mkt/activity/50/status" && init?.method === "PATCH")).toBe(true));
    await screen.findByText("Activity updated.");
  });
});
