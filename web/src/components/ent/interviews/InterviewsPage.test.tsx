// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ── the URL: a tiny external store so `router.replace` re-renders the page like Next does ─────────────── */
const url = vi.hoisted(() => {
  let params = new URLSearchParams("");
  const listeners = new Set<() => void>();
  return {
    get: () => params,
    set: (qs: string) => {
      params = new URLSearchParams(qs);
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

vi.mock("next/navigation", async () => {
  const react = await import("react");
  return {
    useRouter: () => ({ replace: (to: string) => url.set(to.includes("?") ? to.split("?")[1] : ""), push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/w/admin/interviews",
    useSearchParams: () => react.useSyncExternalStore(url.subscribe, url.get, url.get),
  };
});

import { ToastProvider } from "@kiwiply/ui";
import type { Counts, InterviewDetail, InterviewRow, Status, Tile } from "@/lib/ent/interviews";
import InterviewsPage from "./InterviewsPage";

type Call = { method: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined };
let calls: Call[];
let rowsDb: InterviewRow[];
let overrides: ((c: Call) => { status: number; body?: unknown } | undefined)[];

const LABEL: Record<Status, string> = { SCHEDULED: "Scheduled", IN_PROGRESS: "In Progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };

const rowOf = (id: number, status: Status, job: string, consultant: string): InterviewRow => ({
  id,
  code: `INT-${1000 + id}`,
  applicationId: id,
  jobTitle: job,
  jobCode: `JOB-${1000 + id}`,
  consultant: { id, name: consultant, initials: consultant.slice(0, 2).toUpperCase(), subtitle: "Consultant", status: "ACTIVE" },
  client: { id: 1, name: "TechCorp", initials: "TE", industry: null },
  round: "Technical Interview",
  roundNo: 1,
  scheduledAt: "2026-10-20T10:00:00Z",
  durationMinutes: 60,
  mode: "VIDEO",
  location: null,
  status,
  nextStep: "Send prep materials",
  interviewers: [
    { id: 1, name: "Michael Park", title: "Product Director", initials: "MP", primary: true },
    { id: 2, name: "Emily Lawson", title: "Design Lead", initials: "EL", primary: false },
    { id: 3, name: "Dana Reed", title: "VP", initials: "DR", primary: false },
  ],
});

const tile = (value: number, previous: number | null = null, series: number[] = [1, 2, 3, value]): Tile => ({
  value,
  previous,
  delta: previous === null ? null : value - previous,
  deltaPercent: previous ? Math.round((1000 * (value - previous)) / previous) / 10 : null,
  series,
});

const counts = (): Counts => ({
  asOf: "2026-10-13T00:00:00Z",
  seriesFrom: "2026-08-25T00:00:00Z",
  scope: "ORG",
  total: tile(124, 105),
  scheduledThisWeek: tile(28, 25),
  inProgress: tile(16, null),
  completed: tile(76, 61),
  byStatus: {},
});

const detailOf = (r: InterviewRow, can = true): InterviewDetail => ({
  id: r.id,
  code: r.code,
  applicationId: r.applicationId,
  applicationCode: "APP-2026-001",
  jobTitle: r.jobTitle,
  jobCode: r.jobCode,
  employmentLabel: "FTE",
  location: "Remote",
  workMode: "REMOTE",
  consultant: r.consultant,
  client: r.client,
  marketer: { memberId: 9, name: "Sarah Chen", initials: "SC" },
  round: r.round,
  roundNo: 1,
  scheduledAt: r.scheduledAt,
  durationMinutes: r.durationMinutes,
  mode: r.mode,
  meetingLink: "https://meet.example.com/interview/1043",
  interviewLocation: null,
  status: r.status,
  nextStep: r.nextStep,
  nextStepCustom: null,
  notes: "Focus on React.",
  reminderRequestedAt: null,
  interviewers: r.interviewers,
  steps: [
    { key: "iv-1", label: "Technical Interview", at: r.scheduledAt, state: "CURRENT", interviewId: r.id },
    { key: "final", label: "Final Round", at: null, state: "NOT_SCHEDULED", interviewId: null },
    { key: "offer", label: "Offer", at: null, state: "NOT_SCHEDULED", interviewId: null },
  ],
  timeline: [{ id: 1, type: "CREATED", fromStatus: null, toStatus: "SCHEDULED", actor: { memberId: 9, name: "Sarah Chen", initials: "SC" }, detail: "Scheduled", at: "2026-10-01T09:00:00Z" }],
  feedback: [],
  documents: [],
  nextStatuses: can && r.status === "SCHEDULED" ? ["IN_PROGRESS", "COMPLETED", "CANCELLED"] : [],
  actions: { edit: can, reschedule: can && r.status === "SCHEDULED", changeStatus: can && r.status === "SCHEDULED", remind: can && r.status === "SCHEDULED", feedback: can && r.status === "COMPLETED" },
  undo: null,
  createdAt: "2026-10-01T09:00:00Z",
});

function stubApi() {
  calls = [];
  overrides = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const u = new URL(input, "http://x");
      const raw = init.body;
      const call: Call = { method: init.method ?? "GET", path: u.pathname.replace(/^\/api\/orgs\/2\/interviews/, "") || "/", params: u.searchParams, body: typeof raw === "string" ? JSON.parse(raw) : undefined };
      calls.push(call);
      const r = answer(call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
    }),
  );
}

function answer(c: Call): { status: number; body?: unknown } {
  for (const o of overrides) {
    const r = o(c);
    if (r) return r;
  }
  if (c.path === "/" && c.method === "GET") {
    const status = c.params.get("status");
    const q = (c.params.get("q") ?? "").toLowerCase();
    const items = rowsDb.filter((r) => (!status || status.split(",").includes(r.status)) && (!q || `${r.jobTitle} ${r.consultant.name}`.toLowerCase().includes(q)));
    return { status: 200, body: { items, page: 0, size: 10, total: items.length, hasNext: false } };
  }
  if (c.path === "/counts") return { status: 200, body: counts() };
  if (c.path === "/filters")
    return {
      status: 200,
      body: {
        clients: [{ value: "1", label: "TechCorp" }],
        consultants: [],
        rounds: [],
        statuses: Object.entries(LABEL).map(([value, label]) => ({ value, label })),
        modes: [{ value: "VIDEO", label: "Video" }],
        limits: { maxInterviewers: 6, maxDurationMinutes: 480, undoMinutes: 10 },
      },
    };
  const one = /^\/(\d+)$/.exec(c.path);
  if (one && c.method === "GET") {
    const r = rowsDb.find((x) => x.id === Number(one[1]));
    return r ? { status: 200, body: detailOf(r) } : { status: 404, body: { error: "Not found." } };
  }
  const st = /^\/(\d+)\/status$/.exec(c.path);
  if (st && c.method === "POST") {
    const r = rowsDb.find((x) => x.id === Number(st[1]))!;
    r.status = (c.body?.status as Status) ?? r.status;
    return { status: 200, body: { ...detailOf(r), undo: { eventId: 5, expiresAt: "2026-10-13T00:10:00Z", fromStatus: "SCHEDULED", toStatus: r.status } } };
  }
  if (c.path === "/" && c.method === "POST") return { status: 201, body: detailOf(rowOf(99, "SCHEDULED", "New Role", "New Person")) };
  return { status: 404, body: { error: "Not found." } };
}

function mount(permissions: Record<string, string> = { "pipeline.view": "ORG", "interviews.coordinate": "ORG" }) {
  return render(
    <ToastProvider>
      <InterviewsPage orgId={2} workspace="admin" permissions={permissions} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  url.set("");
  rowsDb = [rowOf(1, "SCHEDULED", "Senior Frontend Developer", "Jessica Davis"), rowOf(2, "COMPLETED", "Product Manager", "Michael Park")];
  stubApi();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the Interviews page", () => {
  it("draws the four plain tiles with their figures: no delta, no trend line, no help card", async () => {
    mount();
    await screen.findByText("Senior Frontend Developer");
    const tiles = document.querySelector("[data-kpi-tiles]") as HTMLElement;
    expect(within(tiles).getByText("Total interviews")).toBeTruthy();
    expect(tiles.querySelector('[data-kpi="total"] [data-kpi-value]')?.textContent).toBe("124");
    expect(tiles.querySelector('[data-kpi="inProgress"] [data-kpi-value]')?.textContent).toBe("16");
    expect(tiles.querySelector("[data-kpi-delta]")).toBeNull();
    expect(tiles.querySelector("[data-sparkline]")).toBeNull();
    expect(document.querySelector("[data-help-bee]")).toBeNull();
    expect(screen.queryByText(/Ask a question/)).toBeNull();
  });

  it("lists the interviews with role, code, consultant, status pill and a +N for extra interviewers", async () => {
    mount();
    const row = (await screen.findByText("Senior Frontend Developer")).closest("tr") as HTMLElement;
    expect(within(row).getByText("JOB-1001")).toBeTruthy();
    expect(within(row).getByText("Jessica Davis")).toBeTruthy();
    expect(within(row).getByText("Scheduled")).toBeTruthy();
    expect(within(row).getByText("+1")).toBeTruthy();
    expect(screen.getByText("1–2 of 2 interviews")).toBeTruthy();
  });

  it("searches on the server and keeps the view in the URL", async () => {
    mount();
    await screen.findByText("Senior Frontend Developer");
    fireEvent.change(screen.getByLabelText("Search interviews"), { target: { value: "product" } });
    fireEvent.keyDown(screen.getByLabelText("Search interviews"), { key: "Enter" });
    await waitFor(() => expect(url.get().get("q")).toBe("product"));
    await waitFor(() => expect(calls.some((c) => c.path === "/" && c.params.get("q") === "product")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Senior Frontend Developer")).toBeNull());
  });

  it("opens the drawer with the stepper, meeting details, interviewers and the three actions", async () => {
    mount();
    fireEvent.click(await screen.findByText("Senior Frontend Developer"));
    await waitFor(() => expect(url.get().get("iv")).toBe("1"));
    const body = await screen.findByText("Interview progress");
    expect(body).toBeTruthy();
    expect(screen.getByText("Technical Interview", { selector: "span" })).toBeTruthy();
    expect(screen.getAllByText("Not scheduled").length).toBeGreaterThan(0);
    expect(screen.getByText("Meeting details")).toBeTruthy();
    expect(screen.getByText("Primary")).toBeTruthy();
    expect(document.querySelector('[data-action="reschedule"]')).toBeTruthy();
    expect(document.querySelector('[data-action="remind"]')).toBeTruthy();
  });

  it("records a status change and offers Undo", async () => {
    mount();
    fireEvent.click(await screen.findByText("Senior Frontend Developer"));
    await screen.findByText("Interview progress");
    fireEvent.click(document.querySelector("[data-status-trigger]") as HTMLElement);
    fireEvent.click(await screen.findByText("Record as Completed"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/1/status" && c.body?.status === "COMPLETED")).toBe(true));
    expect(await screen.findByText(/recorded as Completed/)).toBeTruthy();
    expect(screen.getByText("Undo")).toBeTruthy();
    fireEvent.click(screen.getByText("Undo"));
    await waitFor(() => expect(calls.some((c) => c.path === "/1/status" && c.body?.undoEventId === 5)).toBe(true));
  });

  it("schedules an interview through the dialog as a record", async () => {
    overrides.push((c) => (c.path === "/pickers" ? { status: 200, body: { kind: c.params.get("kind"), items: c.params.get("kind") === "consultant" ? [{ id: 7, label: "Jessica Davis", sub: "Engineer", clientId: null }] : [{ id: 11, label: "Senior Frontend Developer", sub: "TechCorp", clientId: 1 }] } } : undefined));
    mount();
    await screen.findByText("Senior Frontend Developer");
    fireEvent.click(document.querySelector("[data-schedule-interview]") as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByRole("button", { name: "Schedule interview" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.focus(within(dialog).getByLabelText("Consultant"));
    fireEvent.click(await within(dialog).findByText("Jessica Davis"));
    fireEvent.focus(await within(dialog).findByLabelText("Application"));
    fireEvent.click(await within(dialog).findByText("Senior Frontend Developer"));
    fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: "2026-11-03" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Schedule interview" }));
    });
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/")).toBe(true));
    const post = calls.find((c) => c.method === "POST" && c.path === "/")!;
    expect(post.body).toMatchObject({ consultantId: 7, applicationId: 11, scheduledAt: "2026-11-03T10:00:00Z", mode: "VIDEO" });
  });

  it("hides the writing controls from a viewer and sends nothing", async () => {
    rowsDb = [rowOf(1, "SCHEDULED", "Senior Frontend Developer", "Jessica Davis")];
    overrides.push((c) => (/^\/1$/.test(c.path) && c.method === "GET" ? { status: 200, body: detailOf(rowsDb[0], false) } : undefined));
    mount({ "pipeline.view": "ORG" });
    fireEvent.click(await screen.findByText("Senior Frontend Developer"));
    await screen.findByText("Interview progress");
    expect(document.querySelector("[data-schedule-interview]")).toBeNull();
    expect(document.querySelector('[data-action="reschedule"]')).toBeNull();
    expect(document.querySelector("[data-status-trigger]")).toBeNull();
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("says plainly when the list is empty and when filters hide everything", async () => {
    rowsDb = [];
    mount();
    expect(await screen.findByText("No interviews yet")).toBeTruthy();
    cleanup();
    url.set("q=zzz");
    mount();
    expect(await screen.findByText("No interviews match")).toBeTruthy();
  });
});
