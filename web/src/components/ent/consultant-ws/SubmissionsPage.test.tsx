// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/submissions" }));

import { ToastProvider } from "@kiwiply/ui";
import SubmissionsPage from "./SubmissionsPage";

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const H = 3_600_000;
const tile = (value: number, deltaPct: number | null = null, vs = "week") => ({ value, previous: 1, deltaPct, sparkline: [0, 1, 2, 3, 4, value], vs });
const r = (o: Record<string, unknown>) => ({
  id: 1, requirementId: 10, title: "Senior Java Developer", employment: "FULL_TIME", company: "TechCorp Inc.", resumeId: 5, resumeVersion: 3, resumeUpdatedAt: iso(-3 * 24 * H),
  marketerNote: "Great match for the role.", marketerName: "Mia", dueAt: iso(2 * H), attention: true, status: "PENDING_APPROVAL", submittedOn: null, decidedAt: null, clientUpdate: null, clientUpdateAt: null, sample: false, ...o,
});
const pastRow = (o: Record<string, unknown>) => r({ status: "SUBMITTED_TO_CLIENT", dueAt: null, attention: false, submittedOn: iso(-5 * 24 * H), clientUpdate: "Under review", clientUpdateAt: iso(-3 * 24 * H), ...o });
let current: Record<string, unknown>;
let calls: { method: string; url: string }[];
let postStatus = 200;
let postBody: unknown = {};

const view = () => ({
  orgId: 2, generatedAt: iso(0), name: "Anika Rao",
  tiles: { pending: tile(2, 50), approved: tile(12, 33, "month"), submitted: tile(8, 14, "month"), attention: tile(1, 100) },
  pending: [r({ id: 1 }), r({ id: 2, title: "Data Engineer", company: "DataSphere", dueAt: iso(30 * H), attention: false, sample: true })],
  past: { items: [pastRow({ id: 3, title: "Full Stack Developer" }), pastRow({ id: 4, title: "QA Lead", status: "NOT_SELECTED" })], page: 0, size: 5, total: 7, totalPages: 2, status: null },
});

beforeEach(() => {
  calls = [];
  current = view();
  postStatus = 200;
  postBody = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method === "POST") return json(postBody, postStatus);
      if (/submissions\/past/.test(url)) return json({ items: [pastRow({ id: 9, title: "Page Two Role" })], page: 1, size: 5, total: 7, totalPages: 2, status: null });
      const d = /submissions\/(\d+)$/.exec(url);
      if (d) return json({ row: r({ id: Number(d[1]) }), declineReason: null, location: "Austin, TX", workMode: "HYBRID", description: "Build services.", resume: { id: 5, name: "Casey Resume", versionNo: 3, headline: "Java engineer", summary: "Ten years.", fileName: null, updatedAt: iso(0) }, createdAt: iso(-24 * H) });
      return json(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
async function mount() {
  render(
    <ToastProvider>
      <SubmissionsPage orgId={2} />
    </ToastProvider>,
  );
  await flush();
}
const rowOf = (id: number) => document.querySelector(`tr[data-submission="${id}"]`) as HTMLElement;

describe("Submissions and Approvals from real data", () => {
  it("draws one awaiting chip, the pending rows and the past rows, with no tiles, Quick Actions, checklist card or help card", async () => {
    await mount();
    expect(calls[0]).toEqual({ method: "GET", url: "/api/orgs/2/me-workspace/submissions" });
    expect(document.querySelector("[data-stat-tile]")).toBeNull();
    expect(document.querySelector("[data-awaiting-chip]")!.textContent).toBe("2 awaiting your approval");
    expect(screen.queryByText(/Quick Actions|Ask a question/)).toBeNull();
    expect(document.querySelector("[data-home-card='subs-checklist']")).toBeNull();
    expect(within(rowOf(1)).getByText("v3")).toBeTruthy();
    expect(within(rowOf(2)).getByText("DataSphere")).toBeTruthy();
    expect(screen.getByText("Full Stack Developer")).toBeTruthy();
    expect(within(document.querySelector("tr[data-past=\"4\"]") as HTMLElement).getByText("Not Selected")).toBeTruthy();
    expect(screen.getAllByText("Sample").length).toBeGreaterThan(0);
    expect(screen.getByText("Showing 1-2 of 7")).toBeTruthy();
  });

  it("approving asks first, says nothing is sent, then posts and reloads", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Approve Senior Java Developer" }));
    expect(screen.getByText(/Nothing is sent to the client from here/)).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Yes, approve" }));
    await flush();
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/orgs/2/me-workspace/submissions/1/approve")).toBe(true);
    expect(calls.filter((c) => c.method === "GET" && c.url.endsWith("/submissions")).length).toBeGreaterThan(1);
  });

  it("a 409 shows the API message and reloads", async () => {
    await mount();
    postStatus = 409;
    postBody = { error: "You already approved this submission.", code: "SUBMISSION_NOT_PENDING" };
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Approve Senior Java Developer" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, approve" }));
    await flush();
    expect(document.querySelector("[data-notice]")!.textContent).toContain("already approved");
  });

  it("decline needs a reason of 3 characters before it posts it", async () => {
    await mount();
    fireEvent.click(within(rowOf(2)).getByRole("button", { name: "Decline Data Engineer" }));
    fireEvent.change(screen.getByLabelText("Reason for declining"), { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: "Decline submission" }));
    await flush();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.change(screen.getByLabelText("Reason for declining"), { target: { value: "Rate is too low" } });
    fireEvent.click(screen.getByRole("button", { name: "Decline submission" }));
    await flush();
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/2/decline"))).toBe(true);
  });

  it("Review opens the sheet with the resume summary", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Review Senior Java Developer" }));
    await flush();
    expect(calls.map((c) => c.url)).toContain("/api/orgs/2/me-workspace/submissions/1");
    expect(screen.getByText("Casey Resume")).toBeTruthy();
    expect(screen.getByText("Ten years.")).toBeTruthy();
    expect(document.querySelector("[data-approve-reminder]")!.textContent).toContain("Before you approve");
    expect(document.querySelectorAll("[data-approve-reminder] li").length).toBeGreaterThan(0);
  });

  it("the pager and the status filter ask the API", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await flush();
    expect(calls.some((c) => /submissions\/past\?page=1&size=5/.test(c.url))).toBe(true);
    expect(screen.getByText("Page Two Role")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "NOT_SELECTED" } });
    await flush();
    expect(calls.some((c) => /status=NOT_SELECTED/.test(c.url))).toBe(true);
  });

  it("says so when nothing is pending or past", async () => {
    current = { ...view(), pending: [], past: { items: [], page: 0, size: 5, total: 0, totalPages: 0, status: null } };
    await mount();
    expect(screen.getByText(/Nothing is waiting for your approval/)).toBeTruthy();
    expect(screen.getByText(/No past submissions yet/)).toBeTruthy();
  });
});
