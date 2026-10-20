// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/tasks" }));

import TasksPage from "./TasksPage";

const at = (day: number, h: number, m = 0) => new Date(2026, 9, 10 + day, h, m).toISOString();
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [3, 4, 4, 6, 5, 8, 9, value] });
const task = (id: number, title: string, detail: string, category: string, priority: string, status: string, due: string, rel: Record<string, unknown>, owner = "Sarah Chen", extra: Record<string, unknown> = {}) => ({
  id, title, detail, category, priority, status, overdue: false, dueAt: due, completedAt: null, consultantId: null, consultantName: null, clientAccountId: null, clientName: null, relatedLabel: null,
  ownerMemberId: owner === "Sarah Chen" ? 7 : 8, ownerName: owner, avatarUrl: null, mine: owner === "Sarah Chen", canDelete: owner === "Sarah Chen", ...rel, ...extra,
});

const ROWS = [
  task(1, "Share new openings with team", "Send 5 new openings from TechCorp", "JOB_OPPORTUNITY", "HIGH", "IN_PROGRESS", at(0, 9), { clientAccountId: 5, clientName: "TechCorp" }),
  task(2, "Review and update resume", "Update skills and keywords", "RESUME", "HIGH", "PENDING", at(0, 11), { consultantId: 4, consultantName: "Ava Patel" }, "Michael Park"),
  task(3, "Schedule client call", "Discuss Q4 hiring needs", "CLIENT", "MEDIUM", "NOT_STARTED", at(1, 10), { relatedLabel: "Global Bank" }),
  task(4, "Assign job matches", "Send top 3 matches to consultant", "JOB_MATCH", "HIGH", "PENDING", at(1, 12), { consultantId: 5, consultantName: "Ethan Chen" }, "Michael Park"),
  task(5, "Follow up on application status", "Check status with hiring manager", "APPLICATION", "MEDIUM", "IN_PROGRESS", at(2, 9), { consultantId: 6, consultantName: "Noah Williams" }),
  task(6, "Configure new job stream", "Set up AWS job alerts", "JOB_STREAM", "MEDIUM", "NOT_STARTED", at(2, 11), { relatedLabel: "AWS" }, "Michael Park"),
  task(7, "Prepare consultant for interview", "Share tips and do mock session", "INTERVIEW", "HIGH", "PENDING", at(3, 9), { consultantId: 7, consultantName: "Olivia Brown" }),
  task(8, "Update job description summary", "Create client-facing summary", "CONTENT", "LOW", "NOT_STARTED", at(3, 11), { clientAccountId: 6, clientName: "RetailCo" }, "Michael Park"),
  task(9, "Send weekly job market update", "Top trends and opportunities", "MARKETING", "MEDIUM", "NOT_STARTED", at(4, 9), { relatedLabel: "All Consultants" }),
  task(10, "Follow up with inactive consultant", "Check availability and interest", "FOLLOW_UP", "HIGH", "PENDING", at(4, 11), { consultantId: 8, consultantName: "Liam Johnson" }, "Michael Park"),
];
const UPCOMING = [
  task(21, "Share openings with team", "", "JOB_OPPORTUNITY", "HIGH", "PENDING", at(0, 16), { clientAccountId: 5, clientName: "TechCorp" }),
  task(22, "Client call - Global Bank", "", "CLIENT", "MEDIUM", "PENDING", at(1, 10), { relatedLabel: "Global Bank" }),
  task(23, "Update resumes (3)", "", "RESUME", "HIGH", "PENDING", at(1, 14), { relatedLabel: "All Consultants" }),
  task(24, "Send weekly job update", "", "MARKETING", "MEDIUM", "PENDING", at(4, 9), { relatedLabel: "All Consultants" }),
];

const view = (over: Record<string, unknown> = {}) => ({
  generatedAt: at(0, 8),
  wide: true,
  kpis: [kpi("total", 24, 12), kpi("overdue", 5, 25), kpi("dueThisWeek", 8, 14), kpi("completedThisWeek", 16, 33)],
  tabs: { all: 24, my: 18, team: 6, overdue: 5, dueThisWeek: 8, completed: 16 },
  tasks: { items: ROWS, total: 24, page: 0, size: 10 },
  upcoming: UPCOMING,
  options: { consultants: [{ id: 4, name: "Ava Patel" }], clients: [{ id: 5, name: "TechCorp" }], owners: [{ id: 7, name: "Sarah Chen" }, { id: 8, name: "Michael Park" }] },
  ...over,
});
const calendar = { month: "2026-10", days: [{ date: "2026-10-12", total: 2, open: 2, topPriority: "HIGH" }, { date: "2026-10-19", total: 1, open: 1, topPriority: "MEDIUM" }, { date: "2026-10-21", total: 1, open: 1, topPriority: "LOW" }] };

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => (c as unknown as [string])[0]);
const writes = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => (c as unknown as [string, RequestInit?])[1]?.method && (c as unknown as [string, RequestInit])[1].method !== "GET").map((c) => c as unknown as [string, RequestInit]);
let fetchMock: ReturnType<typeof vi.fn>;
const HREFS = { followups: "/w/marketing/followups", interviews: "/w/marketing/interviews" };
const mount = (hrefs: Record<string, string | null> = HREFS) => render(<TasksPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={hrefs} />);
const loaded = async (hrefs?: Record<string, string | null>) => {
  mount(hrefs);
  await screen.findByText("Share new openings with team");
};
const table = () => document.querySelector("[data-task-table]") as HTMLElement;
const rowOf = (id: number) => table().querySelector(`[data-task-row="${id}"]`) as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 10, 9, 0) });
  fetchMock = vi.fn(async (u: string, init?: RequestInit) => {
    if (u.includes("/calendar")) return reply(200, calendar);
    if (u.includes("/assignees")) return reply(200, [{ id: 8, name: "Michael Park" }]);
    if (init?.method && init.method !== "GET") return reply(200, { item: null, event: "X", emailed: false });
    return reply(200, view());
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TasksPage board", () => {
  it("has no tiles; the chip row carries the counts, All is selected, and Add task is the one button", async () => {
    await loaded();
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(0);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((x) => x.textContent)).toEqual(["All24", "My tasks18", "Overdue5", "Due this week8", "Completed16"]);
    expect(screen.getByRole("tab", { name: /^All/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /My tasks/ }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getAllByRole("button", { name: "Add task" })).toHaveLength(1);
  });

  it("draws the filter row: four dropdowns, the Due Date picker and the list-view button", async () => {
    await loaded();
    for (const l of ["Category", "Priority", "Status", "Owner"]) expect(screen.getByRole("button", { name: l })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Category" }).textContent).toContain("All categories");
    expect(screen.getByRole("button", { name: "Priority" }).textContent).toContain("All priorities");
    expect(screen.getByRole("button", { name: "Status" }).textContent).toContain("All statuses");
    expect(screen.getByRole("button", { name: "Owner" }).textContent).toContain("All owners");
    expect((screen.getByLabelText("Due date") as HTMLInputElement).type).toBe("date");
    expect(screen.getByRole("button", { name: "List view" })).toBeTruthy();
  });

  it("draws the table's columns and the board's row cells", async () => {
    await loaded();
    for (const h of ["Task", "Related to", "Type", "Priority", "Due date", "Status", "Owner"]) expect(within(table()).getByText(h)).toBeTruthy();
    expect(within(table()).getByRole("checkbox", { name: "Select all tasks" })).toBeTruthy();
    expect(table().querySelectorAll("[data-task-row]")).toHaveLength(10);
    const r1 = rowOf(1);
    expect(within(r1).getByText("Share new openings with team")).toBeTruthy();
    expect(within(r1).getByText("Send 5 new openings from TechCorp")).toBeTruthy();
    expect(within(r1).getByText("TechCorp")).toBeTruthy();
    expect(within(r1).getByText("Job opportunity")).toBeTruthy();
    expect(within(r1).getByText("High")).toBeTruthy();
    expect(within(r1).getByText("Oct 10, 2026")).toBeTruthy();
    expect(within(r1).getByText("In progress")).toBeTruthy();
    expect(within(r1).getByRole("checkbox", { name: "Select Share new openings with team" })).toBeTruthy();
    expect(within(r1).getByRole("button", { name: "More for Share new openings with team" })).toBeTruthy();
    const types: Record<number, string> = { 2: "Resume", 3: "Client", 4: "Job match", 5: "Application", 6: "Job stream", 7: "Interview", 8: "Content", 9: "Marketing", 10: "Follow-up" };
    for (const [id, label] of Object.entries(types)) expect(within(rowOf(Number(id))).getByText(label)).toBeTruthy();
    expect(within(rowOf(2)).getByText("Ava Patel")).toBeTruthy();
    expect(within(rowOf(3)).getByText("Global Bank")).toBeTruthy();
    expect(within(rowOf(6)).getByText("AWS")).toBeTruthy();
    expect(within(rowOf(9)).getByText("All Consultants")).toBeTruthy();
    expect(within(rowOf(8)).getByText("Low")).toBeTruthy();
    expect(within(rowOf(3)).getByText("Not started")).toBeTruthy();
    expect(within(rowOf(2)).getByText("Pending")).toBeTruthy();
    expect(within(rowOf(3)).getByText("Medium")).toBeTruthy();
  });

  it("uses the board's cropped photos for the people on it and a real avatarUrl when given", async () => {
    await loaded();
    const imgs = (el: HTMLElement) => [...el.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(imgs(rowOf(2))).toContain("/ent/marketer/tasks/ava-patel.png");
    expect(imgs(rowOf(2))).toContain("/ent/marketer/tasks/michael-park.png"); // owner
    expect(imgs(rowOf(1))).toContain("/ent/marketer/tasks/sarah-chen.png");
    expect(imgs(rowOf(6))).toContain("/ent/marketer/tasks/logo-aws.png");
  });

  it("footer reads 'Showing 1 to 10 of 24 tasks' with a numbered pager", async () => {
    await loaded();
    expect(screen.getByText("Showing 1 to 10 of 24 tasks")).toBeTruthy();
    for (const n of ["1", "2", "3"]) expect(screen.getByRole("button", { name: `Page ${n}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe("page");
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("/mkt/tasks?") && u.includes("page=1"))).toBe(true));
  });

  it("has no right column: no hero, Calendar, Upcoming deadlines or Quick Actions, and no calendar call", async () => {
    await loaded();
    for (const c of ["hero", "calendar", "upcoming", "quick-actions"]) expect(document.querySelector(`[data-tasks-card="${c}"]`), c).toBeNull();
    expect(screen.queryByText("Quick Actions")).toBeNull();
    expect(screen.queryByText("Upcoming Deadlines")).toBeNull();
    expect(urls(fetchMock).some((u) => u.includes("/calendar"))).toBe(false);
  });

  it("draws no header of its own when it is a tab of Tasks", async () => {
    await loaded();
    expect(document.querySelector("[data-page-header]")).toBeNull();
  });
});

describe("TasksPage interaction", () => {
  it("a tab click asks the API for that tab", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: /My tasks/ }));
    await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("/mkt/tasks?") && u.includes("tab=MY"))).toBe(true));
    fireEvent.click(screen.getByRole("tab", { name: /Overdue/ }));
    await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("tab=OVERDUE"))).toBe(true));
  });

  it("the filters are sent as query parameters", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Category" }));
    fireEvent.click(await screen.findByRole("option", { name: "Resume" }));
    await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("category=RESUME"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Priority" }));
    fireEvent.click(await screen.findByRole("option", { name: "High" }));
    await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("priority=HIGH"))).toBe(true));
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-10-12" } });
    await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("due=2026-10-12"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Owner" }));
    fireEvent.click(await screen.findByRole("option", { name: "Michael Park" }));
    await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("owner=8"))).toBe(true));
  });

  it("the list-view button toggles the compact rows", async () => {
    await loaded();
    const btn = screen.getByRole("button", { name: "List view" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

});

describe("TasksPage states", () => {
  it("an empty list shows the empty copy and no fake rows", async () => {
    fetchMock.mockImplementation(async (u: string) =>
      u.includes("/calendar")
        ? reply(200, { month: "2026-10", days: [] })
        : reply(200, view({ tasks: { items: [], total: 0, page: 0, size: 10 }, upcoming: [], tabs: { all: 0, my: 0, team: 0, overdue: 0, dueThisWeek: 0, completed: 0 }, kpis: [kpi("total", 0, null), kpi("overdue", 0, null), kpi("dueThisWeek", 0, null), kpi("completedThisWeek", 0, null)] })),
    );
    mount();
    expect(await screen.findByText("No tasks yet. Add one to get started.")).toBeTruthy();
    expect(document.querySelectorAll("[data-task-row]")).toHaveLength(0);
    expect(screen.getByText("Showing 0 of 0 tasks")).toBeTruthy();
  });

  it("a failed load shows a retry that loads again", async () => {
    fetchMock.mockImplementationOnce(async () => reply(500, {}));
    mount();
    const retry = await screen.findByRole("button", { name: /retry|try again/i });
    fireEvent.click(retry);
    expect(await screen.findByText("Share new openings with team")).toBeTruthy();
  });

  it.each([403, 404])("a %i says this page isn't part of the role", async (code) => {
    fetchMock.mockImplementation(async () => reply(code, {}));
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
    expect(document.querySelectorAll("[data-task-row]")).toHaveLength(0);
  });
});

describe("TasksPage actions (E1: they only record)", () => {
  it("Add Task posts to the BFF with the form's values and reloads", async () => {
    await loaded();
    fireEvent.click(screen.getAllByRole("button", { name: "Add task" })[0]);
    const dlg = await screen.findByRole("dialog", { name: "Add task" });
    const save = within(dlg).getByRole("button", { name: "Add task" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // a title is required
    fireEvent.change(within(dlg).getByLabelText("Task title"), { target: { value: "Call the hiring manager" } });
    fireEvent.change(within(dlg).getByLabelText("Task due date"), { target: { value: "2026-10-15T10:00" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Task priority" }));
    fireEvent.click(await screen.findByRole("option", { name: "High" }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    const [url, init] = writes(fetchMock)[0];
    expect(url).toBe("/api/orgs/2/mkt/tasks");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ title: "Call the hiring manager", priority: "HIGH", category: "FOLLOW_UP", status: "NOT_STARTED" });
    expect(new Date(body.dueAt).getTime()).toBe(new Date(2026, 9, 15, 10, 0).getTime());
    expect(await screen.findByText("Task added.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the row menu completes a task through the complete route", async () => {
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "More for Share new openings with team" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark complete" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0][0]).toBe("/api/orgs/2/mkt/tasks/1/complete");
    expect(await screen.findByText("Marked complete.")).toBeTruthy();
  });

  it("a completed task offers Reopen, and Delete is offered only on the caller's own tasks", async () => {
    fetchMock.mockImplementation(async (u: string, init?: RequestInit) => {
      if (u.includes("/calendar")) return reply(200, calendar);
      if (init?.method && init.method !== "GET") return reply(200, { item: null, event: "X", emailed: false });
      return reply(200, view({ tasks: { items: [{ ...ROWS[0], status: "COMPLETED", canDelete: false }, ROWS[1]], total: 2, page: 0, size: 10 } }));
    });
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /More for/ }));
    expect(screen.queryByRole("menuitem", { name: "Mark complete" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reopen" }));
    await waitFor(() => expect(writes(fetchMock)[0][0]).toBe("/api/orgs/2/mkt/tasks/1/reopen"));
    // row 2 belongs to a teammate: no Delete
    fireEvent.click(within(rowOf(2)).getByRole("button", { name: /More for/ }));
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  });

  it("Delete asks first, then calls DELETE on that task", async () => {
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /More for/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dlg = await screen.findByRole("dialog", { name: "Delete task" });
    expect(writes(fetchMock)).toHaveLength(0);
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete task" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0][0]).toBe("/api/orgs/2/mkt/tasks/1");
    expect(writes(fetchMock)[0][1].method).toBe("DELETE");
  });

  it("Edit sends only a PATCH to that task", async () => {
    await loaded();
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: /More for/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit task" }));
    const dlg = await screen.findByRole("dialog", { name: "Edit task" });
    expect((within(dlg).getByLabelText("Task title") as HTMLInputElement).value).toBe("Schedule client call");
    fireEvent.change(within(dlg).getByLabelText("Task title"), { target: { value: "Schedule the client call" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0][0]).toBe("/api/orgs/2/mkt/tasks/3");
    expect(writes(fetchMock)[0][1].method).toBe("PATCH");
    expect(JSON.parse(String(writes(fetchMock)[0][1].body)).title).toBe("Schedule the client call");
  });

  it("Reassign lists who can take the task, then posts the chosen owner", async () => {
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /More for/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reassign" }));
    const dlg = await screen.findByRole("dialog", { name: "Reassign task" });
    await waitFor(() => expect(urls(fetchMock).some((u) => u.endsWith("/mkt/tasks/1/assignees"))).toBe(true));
    fireEvent.click(await within(dlg).findByRole("button", { name: "New owner" }));
    fireEvent.click(await screen.findByRole("option", { name: "Michael Park" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Reassign" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0][0]).toBe("/api/orgs/2/mkt/tasks/1/reassign");
    expect(JSON.parse(String(writes(fetchMock)[0][1].body))).toEqual({ ownerMemberId: 8 });
  });

  it("checked rows can be completed together", async () => {
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("checkbox"));
    fireEvent.click(within(rowOf(3)).getByRole("checkbox"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(2));
    expect(writes(fetchMock).map((w) => w[0])).toEqual(["/api/orgs/2/mkt/tasks/1/complete", "/api/orgs/2/mkt/tasks/3/complete"]);
    expect(await screen.findByText("Marked complete. (2 tasks)")).toBeTruthy();
  });

  it("a refused write keeps the dialog open with the server's message and changes nothing", async () => {
    fetchMock.mockImplementation(async (u: string, init?: RequestInit) => {
      if (u.includes("/calendar")) return reply(200, calendar);
      if (init?.method && init.method !== "GET") return reply(422, { error: "title contains characters that are not allowed" });
      return reply(200, view());
    });
    await loaded();
    fireEvent.click(screen.getAllByRole("button", { name: "Add task" })[0]);
    const dlg = await screen.findByRole("dialog", { name: "Add task" });
    fireEvent.change(within(dlg).getByLabelText("Task title"), { target: { value: "x" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Add task" }));
    expect(await within(dlg).findByRole("alert")).toBeTruthy();
    expect(within(dlg).getByRole("alert").textContent).toContain("not allowed");
  });

  it("nothing on the page can submit an application or send mail: every write is to a tasks route", async () => {
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /More for/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark complete" }));
    await waitFor(() => expect(writes(fetchMock).length).toBeGreaterThan(0));
    for (const [url] of writes(fetchMock)) {
      expect(url).toMatch(/^\/api\/orgs\/2\/mkt\/tasks(\/|$)/);
      expect(url).not.toMatch(/submit|email|send|mail/i);
    }
  });
});
