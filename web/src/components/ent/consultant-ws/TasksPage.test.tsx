// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/tasks" }));

import { ToastProvider } from "@kiwiply/ui";
import TasksPage from "./TasksPage";

const tile = (value: number, deltaPct: number | null = null) => ({ value, previous: 1, deltaPct, sparkline: [0, 1, 2, 3, 4, value] });
const task = (o: Record<string, unknown>) => ({
  id: 1, title: "Update resume for Data Engineer role", type: "RESUME_PROFILE", requirementId: 5, jobTitle: "Data Engineer", company: "FinServe Inc.", priority: "HIGH", status: "IN_PROGRESS",
  dueOn: "2026-10-12", overdue: true, dueToday: false, assignedBy: { kind: "MARKETER", name: "Michael Park", sample: true }, completedAt: null, createdAt: "2026-10-01T00:00:00Z", ...o,
});
const view = () => ({
  orgId: 2, generatedAt: "2026-10-14T10:00:00Z", today: "2026-10-14", name: "Anika Rao",
  tiles: { total: tile(12, 20), dueToday: tile(4, 33), upcoming: tile(5), overdue: tile(2, 100), completedThisWeek: tile(8, 14) },
  tasks: {
    items: [
      task({ id: 1 }),
      task({ id: 2, title: "Approve submission to InnovateTech", type: "SUBMISSION_APPROVAL", company: "InnovateTech", priority: "HIGH", status: "PENDING", dueOn: "2026-10-14", overdue: false, dueToday: true, assignedBy: { kind: "SELF", name: "Anika Rao", sample: false } }),
      task({ id: 3, title: "Update availability", type: "AVAILABILITY", requirementId: null, jobTitle: null, company: null, priority: "LOW", status: "NOT_STARTED", dueOn: null, overdue: false, dueToday: false, assignedBy: { kind: "SELF", name: "Anika Rao", sample: false } }),
    ],
    page: 0, size: 8, total: 20, totalPages: 3, counts: { all: 12, today: 4, week: 5, overdue: 2, completed: 8 },
  },
  focus: [{ taskId: 1, title: "Update resume for Data Engineer role", status: "IN_PROGRESS", done: false }, { taskId: 9, title: "Send the form", status: "DONE", done: true }],
  deadlines: [{ taskId: 2, title: "Approve submission to InnovateTech", jobTitle: null, company: "InnovateTech", dueOn: "2026-10-14", priority: "HIGH" }],
  insights: { total: 12, completed: 8, inProgress: 3, notStarted: 4, overdue: 2, completionPct: 67, completedThisWeek: 8, completedLastWeek: 7, note: "You've completed 14% more tasks than last week." },
  reminders: [
    { kind: "INTERVIEW", title: "Interview with TechCorp", subtitle: "Round 1", at: "2026-10-15T14:00:00Z", href: "/w/consultant/interviews" },
    { kind: "SUBMISSION", title: "Submission approval pending", subtitle: "InnovateTech - Data Analyst", at: null, href: "/w/consultant/submissions" },
  ],
  jobs: [{ id: 5, title: "Data Engineer", company: "FinServe Inc." }],
  assigners: ["Michael Park"],
});

let current: Record<string, unknown>;
let calls: { method: string; url: string; body?: unknown }[];
let writeStatus = 200;
let writeBody: unknown = {};

beforeEach(() => {
  calls = [];
  current = view();
  writeStatus = 200;
  writeBody = task({ id: 1 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method === "DELETE") return json(null, 204);
      if (method !== "GET") return json(writeBody, writeStatus);
      return json(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
async function mount() {
  render(
    <ToastProvider>
      <TasksPage orgId={2} firstName="Anika Rao" />
    </ToastProvider>,
  );
  await flush();
}
const tileOf = (k: string) => document.querySelector(`[data-stat-tile="${k}"]`) as HTMLElement;
const rowOf = (id: number) => document.querySelector(`tr[data-task="${id}"]`) as HTMLElement;
const gets = () => calls.filter((c) => c.method === "GET").map((c) => new URLSearchParams(c.url.split("?")[1] ?? ""));

describe("Tasks and Follow-ups from real data", () => {
  it("draws the tiles, tabs, rows, bottom cards and rail from the API's answer", async () => {
    await mount();
    expect(document.querySelector("[data-consultant-tasks]")!.getAttribute("data-status")).toBe("ready");
    expect(calls[0].url).toMatch(/^\/api\/orgs\/2\/me-workspace\/tasks\?/);
    expect(within(tileOf("total")).getByText("12")).toBeTruthy();
    expect(within(tileOf("total")).getByText(/20%/)).toBeTruthy();
    expect(within(tileOf("upcoming")).queryByText(/vs last week/)).toBeNull(); // no delta from the API, none drawn
    expect(screen.getByRole("tab", { name: "All Tasks (12)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Completed (8)" })).toBeTruthy();
    expect(within(rowOf(1)).getByText("Resume & Profile")).toBeTruthy();
    expect(within(rowOf(1)).getByText("FinServe Inc.")).toBeTruthy();
    expect(within(rowOf(1)).getByText("High")).toBeTruthy();
    expect(within(rowOf(1)).getByText("In Progress")).toBeTruthy();
    expect(rowOf(1).querySelector('[data-due="overdue"]')).toBeTruthy();
    expect(rowOf(2).querySelector('[data-due="today"]')).toBeTruthy();
    expect(rowOf(3).querySelector('[data-due="none"]')).toBeTruthy();
    expect(screen.getAllByText("Sample").length).toBeGreaterThan(0);
    expect(screen.getByText("Showing 1-3 of 20")).toBeTruthy();
    // bottom cards
    expect(within(document.querySelector('[data-home-card="tasks-focus"]') as HTMLElement).getByLabelText("Reopen Send the form")).toBeTruthy();
    expect(within(document.querySelector('[data-home-card="tasks-deadlines"]') as HTMLElement).getByText("OCT")).toBeTruthy();
    expect(document.querySelector('[data-home-card="tasks-insights"]')!.textContent).toContain("67");
    expect(document.querySelector("[data-insight-note]")!.textContent).toContain("14% more tasks");
    // rail
    expect(document.querySelector('[data-quick="resume"]')!.getAttribute("href")).toBe("/w/consultant/resumes");
    expect(document.querySelector('[data-quick="matches"]')!.getAttribute("href")).toBe("/w/consultant/matches");
    expect(document.querySelector('[data-quick="prep"]')!.getAttribute("href")).toBe("/w/consultant/interview-prep");
    expect(document.querySelector('[data-quick="availability"]')!.getAttribute("href")).toBe("/w/consultant/availability");
    expect(document.querySelector('[data-reminder="INTERVIEW"]')!.getAttribute("href")).toBe("/w/consultant/interviews");
  });

  it("claims no progress when the API gave no note", async () => {
    const v = view();
    current = { ...v, insights: { ...v.insights, note: null } };
    await mount();
    expect(document.querySelector("[data-insight-note]")).toBeNull();
  });

  it("says so when there are no tasks", async () => {
    const v = view();
    current = { ...v, tasks: { items: [], page: 0, size: 8, total: 0, totalPages: 0, counts: { all: 0, today: 0, week: 0, overdue: 0, completed: 0 } }, focus: [], deadlines: [], reminders: [], insights: { ...v.insights, total: 0, note: null } };
    await mount();
    expect(screen.getByText(/You have no tasks yet/)).toBeTruthy();
    expect(screen.getByText(/Nothing is due today/)).toBeTruthy();
    expect(screen.getByText(/No upcoming deadlines/)).toBeTruthy();
    expect(screen.getByText(/Add a task to see your progress/)).toBeTruthy();
    expect(screen.getByText(/No reminders right now/)).toBeTruthy();
  });

  it("tabs, filters, sort and the pager are asked of the API", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Overdue (2)" }));
    await flush();
    expect(gets().at(-1)!.get("tab")).toBe("OVERDUE");
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "HIGH" } });
    await flush();
    expect(gets().at(-1)!.get("priority")).toBe("HIGH");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Priority" }));
    await flush();
    expect(gets().at(-1)!.get("sort")).toBe("priority");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await flush();
    expect(gets().at(-1)!.get("page")).toBe("1");
    fireEvent.click(screen.getByRole("tab", { name: "Completed (8)" }));
    await flush();
    expect(gets().at(-1)!.get("sort")).toBe("completed");
    expect(gets().at(-1)!.get("page")).toBe("0");
  });

  it("search is sent to the API after a short pause", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search tasks"), { target: { value: "offer" } });
    await act(async () => void (await new Promise((res) => setTimeout(res, 400))));
    await flush();
    expect(gets().at(-1)!.get("q")).toBe("offer");
    expect(gets().at(-1)!.get("page")).toBe("0");
  });

  it("the checkbox completes a task through the API and reloads", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByLabelText("Complete Update resume for Data Engineer role"));
    await flush();
    expect(calls.some((c) => c.method === "PUT" && c.url === "/api/orgs/2/me-workspace/tasks/1/status" && JSON.stringify(c.body) === '{"status":"DONE"}')).toBe(true);
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(1);
  });

  it("a refused write shows the API's own message and keeps what is on screen", async () => {
    await mount();
    writeStatus = 404;
    writeBody = { error: "Not found." };
    fireEvent.click(within(rowOf(2)).getByLabelText("Complete Approve submission to InnovateTech"));
    await flush();
    expect(document.querySelector("[data-notice]")!.textContent).toContain("Not found.");
    expect(rowOf(2)).toBeTruthy();
  });

  it("New Task checks the name first, then posts the whole body and shows the API's refusal", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "New Task" }));
    fireEvent.change(screen.getByLabelText("Task name"), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await flush();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(screen.getByRole("alert", { name: "" }).textContent).toMatch(/at least 3 characters/);

    fireEvent.change(screen.getByLabelText("Task name"), { target: { value: "my SSN 123-45-6789" } });
    fireEvent.change(screen.getByLabelText("Task priority"), { target: { value: "HIGH" } });
    fireEvent.change(screen.getByLabelText("Linked job"), { target: { value: "5" } });
    writeStatus = 422;
    writeBody = { error: "This looks like sensitive personal data.", code: "SENSITIVE_CONTENT" };
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await flush();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/me-workspace/tasks");
    expect(post.body).toEqual({ title: "my SSN 123-45-6789", priority: "HIGH", type: "OTHER", requirementId: 5 });
    expect(screen.getByText("This looks like sensitive personal data.")).toBeTruthy();
    expect(screen.getByLabelText("Task name")).toBeTruthy(); // the dialog stays open

    writeStatus = 201;
    writeBody = task({ id: 99, title: "Call the recruiter" });
    fireEvent.change(screen.getByLabelText("Task name"), { target: { value: "Call the recruiter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await flush();
    expect(screen.queryByLabelText("Task name")).toBeNull();
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(1);
  });

  it("Edit puts the changed fields for that task", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "More actions for Update resume for Data Engineer role" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Edit task/ }));
    fireEvent.change(screen.getByLabelText("Task name"), { target: { value: "Update resume today" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await flush();
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/orgs/2/me-workspace/tasks/1");
    expect(put.body).toMatchObject({ title: "Update resume today", priority: "HIGH", type: "RESUME_PROFILE", dueOn: "2026-10-12", requirementId: 5 });
  });

  it("Delete hides the row with an Undo; Undo sends nothing", async () => {
    await mount();
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: "More actions for Update availability" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete task/ }));
    await flush();
    expect(rowOf(3)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await flush();
    expect(rowOf(3)).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("Delete is sent only when the undo window ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mount();
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: "More actions for Update availability" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete task/ }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await act(async () => void (await vi.advanceTimersByTimeAsync(3500)));
    expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/orgs/2/me-workspace/tasks/3")).toBe(true);
  });

  it("leaving the page inside the window still deletes", async () => {
    await mount();
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: "More actions for Update availability" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete task/ }));
    cleanup();
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/tasks/3"))).toBe(true);
  });
});
