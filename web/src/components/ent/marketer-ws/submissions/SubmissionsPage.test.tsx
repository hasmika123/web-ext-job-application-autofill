// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/submissions" }));

import { dateText } from "@/lib/ent/marketer-ws/submissions";
import SubmissionsPage from "./SubmissionsPage";

const NOW = Date.now();
const H = 3600e3;
const D = 24 * H;
const iso = (ms: number) => new Date(NOW - ms).toISOString();

type RowSpec = [number, string, string, string, string, string, string, string, string, number, string, string, string[], string];
// id, consultant, role, jobTitle, jobCode, client, approval, status, resume, age(ms), bucket, code, actions, resumeUpdated
const SPECS: RowSpec[] = [
  [1, "Alex Morgan", "Java Developer", "Senior Java Developer", "JOB-1001", "TechCorp", "APPROVED", "SUBMITTED", "v3.2", 2 * H, "SUBMITTED", "SUB-2026-001", ["RECORD_STATUS"], iso(1 * D)],
  [2, "Priya Sharma", "Business Analyst", "Data Analyst", "JOB-1043", "Global Bank", "AWAITING_APPROVAL", "DRAFT", "v2.1", 4 * H, "AWAITING_APPROVAL", "SUB-2026-002", ["RECORD_APPROVAL", "WITHDRAW"], iso(2 * D)],
  [3, "Michael Park", "AWS Engineer", "Cloud Engineer", "JOB-0987", "CloudScale", "APPROVED", "CLIENT_REVIEW", "v4.0", 1 * D, "CLIENT_REVIEW", "SUB-2026-003", ["RECORD_STATUS"], iso(1 * D)],
  [4, "Emily Lawson", "Project Manager", "Project Manager", "JOB-1022", "HealthPlus", "APPROVED", "INTERVIEW_REQUESTED", "v1.8", 1 * D, "INTERVIEW_REQUESTED", "SUB-2026-004", ["RECORD_STATUS"], iso(3 * D)],
  [5, "David Kim", "Data Analyst", "BI Developer", "JOB-1105", "DataWorks", "REJECTED", "REJECTED", "v2.0", 2 * D, "REJECTED", "SUB-2026-005", [], iso(4 * D)],
  [6, "Sophia Patel", "QA Automation Engineer", "QA Automation Engineer", "JOB-1098", "NextGen", "DRAFT", "DRAFT", "v1.5", 2 * D, "DRAFT", "SUB-2026-006", ["REQUEST_APPROVAL", "WITHDRAW"], iso(2 * D)],
];
const row = (s: RowSpec) => ({
  id: s[0], code: s[11],
  consultant: { id: s[0], name: s[1], role: s[2], avatarUrl: null },
  job: { id: s[0] + 100, title: s[3], code: s[4] },
  client: { id: s[0] + 200, name: s[5] },
  submissionDate: iso(s[9]), approvalState: s[6], status: s[7], bucket: s[10], actions: s[12],
  resume: { id: s[0] + 300, version: s[8], updatedOn: s[13] },
});

const kpi = (value: number, deltaPct: number | null) => ({ value, deltaPct, sparkline: [1, 2, 3, 4, 5, 6, 7, value] });
const board = (over: Record<string, unknown> = {}) => ({
  kpis: { pendingApprovals: kpi(12, 20), submittedToday: kpi(18, 28), underClientReview: kpi(24, 14), rejected: kpi(6, -25) },
  items: SPECS.map(row),
  total: 86, page: 0, size: 10,
  breakdown: {
    period: "30d", total: 86,
    buckets: [
      { key: "DRAFT", label: "Draft", count: 14, pct: 16 }, { key: "AWAITING_APPROVAL", label: "Awaiting Approval", count: 18, pct: 21 }, { key: "SUBMITTED", label: "Submitted", count: 22, pct: 26 },
      { key: "CLIENT_REVIEW", label: "Client Review", count: 24, pct: 28 }, { key: "INTERVIEW_REQUESTED", label: "Interview Requested", count: 6, pct: 7 }, { key: "REJECTED", label: "Rejected", count: 6, pct: 7 },
    ],
  },
  activity: [
    { id: 1, submissionId: 1, kind: "SUBMITTED", text: "Alex Morgan submitted to TechCorp", detail: "Senior Java Developer", at: iso(2 * H) },
    { id: 2, submissionId: 3, kind: "CLIENT_REVIEW", text: "Michael Park moved to Client Review", detail: "Cloud Engineer at CloudScale", at: iso(1 * D) },
    { id: 3, submissionId: 5, kind: "REJECTED", text: "David Kim's submission was rejected", detail: "BI Developer at DataWorks", at: iso(2 * D) },
  ],
  filters: { clients: [{ id: 201, name: "TechCorp" }], jobTitles: ["Data Analyst"] },
  views: [],
  ...over,
});

const HREFS = { jobs: "/w/marketing/jobs", applications: "/w/marketing/applications", activity: null as string | null };
const mount = () => render(<SubmissionsPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} />);
const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A router for the fetch mock: GET list, plus write routes that answer with the row. */
function stubFetch(handlers: Record<string, (init?: RequestInit) => Response> = {}, first: unknown = board()) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : null });
    const key = `${method} ${url.split("?")[0]}`;
    if (handlers[key]) return handlers[key](init);
    if (method === "GET" && url.includes("/mkt/submissions/options")) {
      return json(200, { consultants: [{ id: 1, name: "Alex Morgan", role: "Java Developer" }], jobs: [{ id: 11, title: "Senior Java Developer", code: "JOB-1011", client: "TechCorp" }] });
    }
    if (method === "GET") return json(200, first);
    return json(200, row(SPECS[0]));
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

beforeEach(() => void stubFetch());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SubmissionsPage", () => {
  it("draws the four KPI tiles with their numbers, deltas and comparison text", async () => {
    mount();
    await waitFor(() => expect(within(document.querySelector('[data-stat-tile="pendingApprovals"]') as HTMLElement).getByText("12")).toBeTruthy());
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(4);
    const tile = (k: string) => (document.querySelector(`[data-stat-tile="${k}"]`) as HTMLElement).textContent ?? "";
    expect(tile("pendingApprovals")).toContain("Pending Approvals");
    expect(tile("pendingApprovals")).toContain("20%");
    expect(tile("pendingApprovals")).toContain("vs last week");
    expect(tile("submittedToday")).toContain("18");
    expect(tile("submittedToday")).toContain("vs yesterday");
    expect(tile("underClientReview")).toContain("Under Client Review");
    expect(tile("underClientReview")).toContain("24");
    expect(tile("rejected")).toContain("25%");
  });

  it("has the board's title controls: search, filters, More Filters, Save View and New Submission", async () => {
    mount();
    await screen.findByText("Alex Morgan");
    expect(screen.getByPlaceholderText("Search submissions by consultant, job, or client...")).toBeTruthy();
    for (const t of ["All Statuses", "All Clients", "All Job Titles", "Last 30 Days"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    expect(screen.getByText("More Filters")).toBeTruthy();
    expect(screen.getByText("Save View")).toBeTruthy();
    expect(screen.getByRole("button", { name: /New Submission/ })).toBeTruthy();
  });

  it("draws the table with every column, chip and the View button on a rejected row", async () => {
    mount();
    await screen.findByText("Alex Morgan");
    for (const h of ["Consultant", "Job Title", "Client", "Submission Date", "Approval State", "Resume Version", "Current Status", "Actions"]) {
      expect(screen.getAllByText(h).length).toBeGreaterThan(0);
    }
    const r1 = document.querySelector('[data-submission-row="1"]') as HTMLElement;
    expect(within(r1).getByText("Java Developer")).toBeTruthy();
    expect(within(r1).getByText("Senior Java Developer").getAttribute("href")).toBe("/w/marketing/jobs");
    expect(within(r1).getByText("JOB-1001")).toBeTruthy();
    expect(within(r1).getByText("TechCorp")).toBeTruthy();
    expect(within(r1).getByText(dateText(iso(2 * H)))).toBeTruthy();
    expect(within(r1).getByText("2 hours ago")).toBeTruthy();
    expect(r1.querySelector('[data-approval-chip="APPROVED"]')?.textContent).toBe("Approved");
    expect(within(r1).getByText("v3.2")).toBeTruthy();
    expect(within(r1).getByText(/Updated /)).toBeTruthy();
    expect(r1.querySelector('[data-status-chip="SUBMITTED"]')?.textContent).toBe("Submitted");
    expect((document.querySelector('[data-submission-row="2"] [data-approval-chip]') as HTMLElement).textContent).toBe("Awaiting Approval");
    expect((document.querySelector('[data-submission-row="2"] [data-status-chip]') as HTMLElement).textContent).toBe("Draft");
    expect((document.querySelector('[data-submission-row="3"] [data-status-chip]') as HTMLElement).textContent).toBe("Client Review");
    expect((document.querySelector('[data-submission-row="4"] [data-status-chip]') as HTMLElement).textContent).toBe("Interview Requested");
    expect((document.querySelector('[data-submission-row="5"] [data-approval-chip]') as HTMLElement).textContent).toBe("Rejected");
    expect((document.querySelector('[data-submission-row="5"] [data-status-chip]') as HTMLElement).textContent).toBe("Rejected");
    expect(within(document.querySelector('[data-submission-row="5"]') as HTMLElement).getByRole("button", { name: "View" })).toBeTruthy();
    expect(within(r1).getByRole("button", { name: "Actions for Alex Morgan" })).toBeTruthy();
  });

  it("has the footer: showing text, page buttons with an ellipsis and rows per page", async () => {
    mount();
    await screen.findByText("Alex Morgan");
    expect(document.querySelector("[data-showing]")?.textContent).toBe("Showing 1–10 of 86 submissions");
    for (const p of [1, 2, 3, 4, 5, 9]) expect(screen.getByRole("button", { name: `Page ${p}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("button", { name: "Page 6" })).toBeNull();
    expect(screen.getByText("…")).toBeTruthy();
    expect(screen.getByText("Rows per page")).toBeTruthy();
  });

  it("draws the right column: help card, recent activity with View all, and the status donut", async () => {
    mount();
    await screen.findByText("Alex Morgan");
    expect(screen.getByText("Need help with submissions?")).toBeTruthy();
    expect(screen.getByText("Ask a question")).toBeTruthy();
    const activity = document.querySelector('[data-submissions-card="activity"]') as HTMLElement;
    expect(within(activity).getByText("Recent Submission Activity")).toBeTruthy();
    expect(within(activity).getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/w/marketing/applications");
    expect(within(activity).getByText("Alex Morgan submitted to TechCorp")).toBeTruthy();
    expect(within(activity).getByText("Cloud Engineer at CloudScale")).toBeTruthy();
    const status = document.querySelector('[data-submissions-card="status"]') as HTMLElement;
    expect(within(status).getByText("Submissions by Status")).toBeTruthy();
    expect(status.querySelector("[data-donut-chart]")).toBeTruthy();
    expect(within(status).getByText("86")).toBeTruthy();
    expect(within(status).getByText("Total")).toBeTruthy();
    for (const l of ["Draft", "Awaiting Approval", "Submitted", "Client Review", "Interview Requested", "Rejected"]) expect(within(status).getAllByText(l).length).toBeGreaterThan(0);
    expect(within(status).getByText("27%")).toBeTruthy(); // the legend shares come from the counts (24 of 90 in this fixture)
  });

  it("says so, with no rows and no number, when there is nothing", async () => {
    stubFetch({}, board({ items: [], total: 0, kpis: {}, breakdown: { period: "30d", total: 0, buckets: [] }, activity: [] }));
    mount();
    await screen.findByText(/Nothing recorded yet\. Use New Submission/);
    expect(screen.getAllByText("Nothing yet")).toHaveLength(4);
    expect(screen.getAllByText("Nothing recorded yet.").length).toBe(2);
    expect(document.querySelector("[data-showing]")).toBeNull();
  });

  it("offers a retry when the call fails, and the denied state on 403 and 404", async () => {
    const { fn } = stubFetch({ "GET /api/orgs/2/mkt/submissions": () => json(500, {}) });
    mount();
    await screen.findByText(/didn't load/i);
    fn.mockImplementation(async () => json(200, board()));
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    await screen.findByText("Alex Morgan");
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => json(404, {})));
    mount();
    await screen.findByText("This page isn't part of your role");
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => json(403, {})));
    mount();
    await screen.findByText("This page isn't part of your role");
  });

  it("sends the filters, sort and paging to the board call", async () => {
    const { calls } = stubFetch();
    mount();
    await screen.findByText("Alex Morgan");
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("page=1"))).toBe(true));
    fireEvent.click(screen.getByText("Consultant"));
    await waitFor(() => expect(calls.some((c) => c.url.includes("sort=consultant") && c.url.includes("dir=asc") && c.url.includes("page=0"))).toBe(true));
    fireEvent.change(screen.getByPlaceholderText("Search submissions by consultant, job, or client..."), { target: { value: "priya" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("q=priya"))).toBe(true));
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("sends a draft for approval through the BFF and never calls anything that submits (E1)", async () => {
    const { calls } = stubFetch({ "POST /api/orgs/2/mkt/submissions/6/request-approval": () => json(200, row(SPECS[1])) });
    mount();
    await screen.findByText("Sophia Patel");
    fireEvent.click(screen.getByRole("button", { name: "Actions for Sophia Patel" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Send for approval" }));
    await screen.findByText(/Sent Priya Sharma's package for approval|Sent .* package for approval/);
    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(writes[0].url).toBe("/api/orgs/2/mkt/submissions/6/request-approval");
    expect(calls.some((c) => /\/(submit|send|apply)(\/|$)/i.test(c.url))).toBe(false);
  });

  it("records a status fact with PATCH and shows the API's refusal inline", async () => {
    const { calls } = stubFetch({ "PATCH /api/orgs/2/mkt/submissions/1/status": () => json(409, { error: "That status cannot be recorded from SUBMITTED.", code: "SUBMISSION_STATE" }) });
    mount();
    await screen.findByText("Alex Morgan");
    fireEvent.click(screen.getByRole("button", { name: "Actions for Alex Morgan" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Record: client review" }));
    await screen.findByText("That status cannot be recorded from SUBMITTED.");
    const w = calls.find((c) => c.method === "PATCH");
    expect(w?.body).toBe(JSON.stringify({ status: "CLIENT_REVIEW" }));
  });

  it("withdraws a draft only after a confirmation", async () => {
    const { calls } = stubFetch({ "DELETE /api/orgs/2/mkt/submissions/2": () => json(204, null) });
    mount();
    await screen.findByText("Priya Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Actions for Priya Sharma" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Withdraw draft" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw draft" }));
    await screen.findByText("Draft withdrawn.");
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("New Submission creates a draft through the BFF and says nothing is sent", async () => {
    const { calls } = stubFetch({ "POST /api/orgs/2/mkt/submissions": () => json(201, row(SPECS[5])) });
    mount();
    await screen.findByText("Alex Morgan");
    fireEvent.click(screen.getByRole("button", { name: /New Submission/ }));
    await screen.findByText(/nothing is sent to the client/i);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Consultant" }));
    fireEvent.click(await screen.findByRole("option", { name: /Alex Morgan/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Job" }));
    fireEvent.click(await screen.findByRole("option", { name: /Senior Java Developer/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create draft" }));
    await screen.findByText(/Draft prepared for Sophia Patel/);
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/orgs/2/mkt/submissions");
    expect(JSON.parse(post?.body ?? "{}")).toEqual({ consultantId: 1, requirementId: 11 });
  });

  it("Save View stores the current filters under a name", async () => {
    const { calls } = stubFetch({ "POST /api/orgs/2/mkt/submissions/views": () => json(201, { id: 1, name: "Java reviews", q: null, status: null, approval: null, clientId: null, jobTitle: null, period: "30d" }) });
    mount();
    await screen.findByText("Alex Morgan");
    fireEvent.click(screen.getByText("Save View"));
    fireEvent.change(await screen.findByLabelText("View name"), { target: { value: "Java reviews" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    await screen.findByText(/Saved the view "Java reviews"/);
    expect(JSON.parse(calls.find((c) => c.url.endsWith("/views"))?.body ?? "{}")).toMatchObject({ name: "Java reviews", period: "30d" });
  });
});
