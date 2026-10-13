// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { JobDetail, JobRow, JobSummary, JobTile, TopMatch } from "@/lib/ent/jobs";
import JobsPage from "./JobsPage";

/* ── a stand-in for the BFF: records every call, answers from a small in-memory job board ────────────────────── */

type Call = { method: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined; headers: Record<string, string> };
let calls: Call[];
let jobs: Job[];
let access: { canCreate: boolean; canEdit: boolean; canAssign: boolean };
let overrides: ((c: Call) => { status: number; body?: unknown } | undefined)[];

interface Job {
  id: number;
  title: string;
  client: string;
  clientId: number;
  status: JobRow["status"];
  skills: string[];
  matches: TopMatch[];
  version: number;
}

const tile = (value: number, previous: number | null = null): JobTile => ({ value, previous, delta: previous === null ? null : value - previous, deltaPercent: previous ? Math.round((1000 * (value - previous)) / previous) / 10 : null, series: [1, 2, 3, value] });

const mk = (id: number, title: string, client: string, clientId: number, status: JobRow["status"], scores: number[]): Job => ({
  id, title, client, clientId, status, skills: ["React", "TypeScript", "Next.js", "Node.js"], version: 1,
  matches: scores.map((s, i) => ({ matchId: id * 10 + i, consultantId: id * 100 + i, name: ["Jessica Davis", "Michael Park", "Emily Lawson", "David Kim"][i % 4], title: "Consultant", availability: "AVAILABLE", location: "NY", score: s, reason: "Skills overlap", status: "SUGGESTED" as const, applicationCode: null })),
});

const rowOf = (j: Job): JobRow => {
  const live = j.matches.filter((m) => m.status !== "DISMISSED");
  return {
    id: j.id, title: j.title, client: { id: j.clientId, name: j.client }, location: "New York, NY", workMode: "HYBRID", employment: "CONTRACT", experienceLevel: "SENIOR", status: j.status, postedAt: "2026-03-18T10:00:00Z", skills: j.skills,
    submissions: j.matches.filter((m) => m.status === "ASSIGNED").length, positions: 1, filled: 0,
    matches: { count: live.length, best: live.length ? live[0].score : null, top: live.slice(0, 3).map((m) => ({ consultantId: m.consultantId, name: m.name, score: m.score })) },
  };
};

const detailOf = (j: Job): JobDetail => ({
  id: j.id, title: j.title, client: { id: j.clientId, name: j.client }, clientIndustry: "Software", contact: { id: 5, name: "Michael Park", title: "Hiring manager", email: "michael.park@example.com" }, description: "We are hiring.", location: "New York, NY", workMode: "HYBRID",
  employment: "CONTRACT", durationLabel: "6 months", experienceLevel: "SENIOR", rate: { min: 120, max: 160, unit: "HOUR", currency: "USD" }, positions: 1, filled: 0, status: j.status, postedAt: "2026-03-18T10:00:00Z", closedAt: null, skills: j.skills,
  topMatches: j.matches, submissions: j.matches.filter((m) => m.status === "ASSIGNED").map((m) => ({ applicationId: m.matchId, code: "APP-2026-001", consultantId: m.consultantId, consultantName: m.name, stage: "ASSIGNED", closedReason: null, appliedOn: "2026-03-19" })),
  submissionCount: j.matches.filter((m) => m.status === "ASSIGNED").length, activity: [{ at: "2026-03-18T10:00:00Z", kind: "job", summary: "Job created", actor: "Sarah Chen" }], version: `"${j.version}"`, access,
});

const summary = (): JobSummary => ({
  openJobs: tile(jobs.filter((j) => j.status === "OPEN").length, 1),
  newThisWeek: tile(3, 2),
  assignedOpportunities: tile(0, null),
  highMatchJobs: tile(1, null),
  asOf: "2026-10-13T10:00:00Z",
  facets: {
    statuses: ["OPEN", "IN_REVIEW", "ON_HOLD", "FILLED", "CLOSED"].map((s) => ({ value: s, label: s, count: jobs.filter((j) => j.status === s).length })),
    clients: [{ value: "1", label: "TechCorp", count: 2 }, { value: "2", label: "Global Media", count: 1 }],
    locations: [{ value: "New York, NY", label: "New York, NY", count: 3 }],
    workModes: [{ value: "HYBRID", label: "HYBRID", count: 3 }],
    employment: [{ value: "CONTRACT", label: "CONTRACT", count: 3 }],
    experience: [{ value: "SENIOR", label: "SENIOR", count: 3 }],
    skills: [{ value: "React", label: "React", count: 3 }],
  },
  clientOptions: [{ id: 1, name: "TechCorp", contacts: [{ id: 5, name: "Michael Park", title: null, email: null }] }, { id: 2, name: "Global Media", contacts: [] }],
  access,
});

function answer(c: Call): { status: number; body?: unknown } {
  for (const o of overrides) {
    const r = o(c);
    if (r) return r;
  }
  if (c.path === "/jobs" && c.method === "GET") {
    let items = jobs;
    const status = c.params.get("status");
    if (status) items = items.filter((j) => j.status === status);
    const text = (c.params.get("q") ?? "").toLowerCase();
    if (text) items = items.filter((j) => j.title.toLowerCase().includes(text));
    const size = Number(c.params.get("size") ?? 10);
    const page = Number(c.params.get("page") ?? 0);
    return { status: 200, body: { items: items.slice(page * size, page * size + size).map(rowOf), page, size, total: items.length, hasNext: false } };
  }
  if (c.path === "/jobs/summary") return { status: 200, body: summary() };
  if (c.path === "/jobs" && c.method === "POST") {
    const b = c.body as { title: string; clientId: number };
    const j = mk(99, b.title, "TechCorp", b.clientId, "OPEN", []);
    jobs = [j, ...jobs];
    return { status: 201, body: detailOf(j) };
  }
  if (c.path === "/jobs/bulk/status") {
    const b = c.body as { ids: number[]; status: JobRow["status"] };
    const results = b.ids.map((id) => {
      const j = jobs.find((x) => x.id === id)!;
      const previous = { status: j.status };
      j.status = b.status;
      return { id, ok: true, reason: null, previous };
    });
    return { status: 200, body: { action: "status", requested: results.length, ok: results.length, skipped: [], results } };
  }
  const one = /^\/jobs\/(\d+)(\/.*)?$/.exec(c.path);
  if (one) {
    const j = jobs.find((x) => x.id === Number(one[1]))!;
    const sub = one[2] ?? "";
    if (c.method === "GET" && sub === "") return { status: 200, body: detailOf(j) };
    if (c.method === "PATCH" && sub === "") {
      if (c.headers["if-match"] !== `"${j.version}"`) return { status: 412, body: { error: "stale", code: "PRECONDITION_FAILED" } };
      if ("status" in c.body!) j.status = c.body!.status as JobRow["status"];
      if ("title" in c.body!) j.title = c.body!.title as string;
      j.version++;
      return { status: 200, body: detailOf(j) };
    }
    const m = /^\/matches\/(\d+)(\/assign)?$/.exec(sub);
    if (m) {
      const match = j.matches.find((x) => x.matchId === Number(m[1]))!;
      if (m[2]) {
        match.status = "ASSIGNED";
        match.applicationCode = "APP-2026-121";
        return { status: 200, body: { job: detailOf(j), applicationId: 1, applicationCode: "APP-2026-121", alreadyAssigned: false } };
      }
      match.status = (c.body as { status: TopMatch["status"] }).status;
      return { status: 200, body: detailOf(j) };
    }
  }
  return { status: 404, body: { error: "no" } };
}

function stubApi() {
  calls = [];
  overrides = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const u = new URL(input, "http://x");
      const raw = init.body;
      const call: Call = { method: init.method ?? "GET", path: u.pathname.replace(/^\/api\/orgs\/2/, ""), params: u.searchParams, body: typeof raw === "string" ? JSON.parse(raw) : undefined, headers: (init.headers ?? {}) as Record<string, string> };
      calls.push(call);
      const r = answer(call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
    }),
  );
}

const settle = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

async function mount() {
  const out = render(
    <ToastProvider>
      <JobsPage orgId={2} orgName="Acme" supportEmail={null} />
    </ToastProvider>,
  );
  await settle(0);
  await settle(0);
  return out;
}

const rows = () => Array.from(document.querySelectorAll<HTMLElement>("li[data-row-id]"));
const listCalls = () => calls.filter((c) => c.path === "/jobs" && c.method === "GET");

function phone(on: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: on && query.includes("max-width: 767px"), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }));
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/w/admin/jobs");
  access = { canCreate: true, canEdit: true, canAssign: true };
  jobs = [mk(1, "Senior React Developer", "TechCorp", 1, "OPEN", [92, 88, 85, 80]), mk(2, "Data Analyst", "Global Media", 2, "IN_REVIEW", [85]), mk(3, "UX Designer", "TechCorp", 1, "OPEN", [])];
  stubApi();
  phone(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Jobs: the list and the tiles", () => {
  it("shows the four tiles with their deltas only where the API gave one, the rows, and the count", async () => {
    await mount();
    expect(Array.from(document.querySelectorAll("[data-kpi]")).map((e) => e.getAttribute("data-kpi"))).toEqual(["openJobs", "newThisWeek", "assignedOpportunities", "highMatchJobs"]);
    expect(document.querySelector("[data-kpi=openJobs] [data-kpi-value]")?.textContent).toBe("2");
    expect(document.querySelector("[data-kpi=openJobs] [data-kpi-delta]")?.textContent).toContain("+1");
    expect(document.querySelector("[data-kpi=openJobs] [data-kpi-delta]")?.textContent).toContain("vs last month");
    expect(document.querySelector("[data-kpi=newThisWeek] [data-kpi-delta]")?.textContent).toContain("vs last week");
    expect(document.querySelector("[data-kpi=assignedOpportunities] [data-kpi-delta]")).toBeNull();
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["1", "2", "3"]);
    expect(screen.getAllByText("1-3 of 3 jobs").length).toBeGreaterThan(0);
    const first = listCalls()[0];
    expect(first.params.get("sort")).toBe("posted");
    expect(first.params.get("dir")).toBe("desc");
    expect(first.params.get("size")).toBe("10");
  });

  it("shows the best match with avatars, and says so when a job has none", async () => {
    await mount();
    const r1 = rows()[0];
    expect(within(r1).getByText("92% match")).toBeTruthy();
    expect(r1.querySelectorAll("[data-member-avatar]").length).toBe(3);
    expect(within(r1.querySelector("[data-match-stack]") as HTMLElement).getByText("+1")).toBeTruthy(); // 4 matches, 3 shown
    expect(within(rows()[2]).getByText("No matches yet")).toBeTruthy();
  });

  it("searches after the typing rests and filters by status", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search jobs"), { target: { value: "data" } });
    await settle(400);
    expect(listCalls().filter((c) => c.params.get("q") === "data")).toHaveLength(1);
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search jobs"), { target: { value: "" } });
    await settle(400);
    fireEvent.click(document.querySelector('[data-filters] button[aria-label="Status"]')!);
    fireEvent.click(screen.getByRole("option", { name: "In Review (1)" }));
    await settle();
    expect(listCalls().at(-1)!.params.get("status")).toBe("IN_REVIEW");
    expect(rows()).toHaveLength(1);
  });

  it("keeps the view in the address and restores it from a link", async () => {
    window.history.replaceState(null, "", "/w/admin/jobs?status=OPEN&page=1&job=1&tab=matches");
    await mount();
    expect(listCalls()[0].params.get("status")).toBe("OPEN");
    expect(document.querySelector("[data-detail-body][data-job-id='1']")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Top Matches/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(window.location.search).toContain("job=1");
    expect(window.location.search).not.toContain("tab=");
    fireEvent.click(screen.getByRole("button", { name: /^Close/ }));
    await settle();
    expect(window.location.search).not.toContain("job=");
  });

  it("says nothing matches, and offers to clear the filters", async () => {
    await mount();
    overrides.push((c) => (c.path === "/jobs" && c.params.get("q") === "zzz" ? { status: 200, body: { items: [], page: 0, size: 10, total: 0, hasNext: false } } : undefined));
    fireEvent.change(screen.getByLabelText("Search jobs"), { target: { value: "zzz" } });
    await settle(400);
    expect(screen.getByText("No jobs match")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);
  });

  it("shows an error with a retry when the list cannot load", async () => {
    overrides.push((c) => (c.path === "/jobs" && c.method === "GET" ? { status: 500, body: { error: "boom" } } : undefined));
    await mount();
    expect(screen.getByText(/boom/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try again|Retry/i })).toBeTruthy();
  });
});

describe("Jobs: the drawer", () => {
  it("opens a job from its row, with the facts, the contact and the top matches", async () => {
    await mount();
    fireEvent.click(rows()[0]);
    await settle();
    const body = document.querySelector("[data-detail-body]") as HTMLElement;
    expect(within(body).getByText("Job Type")).toBeTruthy();
    expect(within(body).getByText("Contract")).toBeTruthy();
    expect(within(body).getByText("$120 - $160 / hour")).toBeTruthy();
    expect(within(body).getByText("michael.park@example.com")).toBeTruthy();
    expect(body.querySelectorAll("[data-match-row]")).toHaveLength(3);
    expect(within(body).getByRole("tab", { name: "Submissions (0)" })).toBeTruthy();
    expect(window.location.search).toContain("job=1");
  });

  it("assigns a consultant, shows the application code and updates the match", async () => {
    await mount();
    fireEvent.click(rows()[0]);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Assign Jessica Davis" }));
    await settle();
    const post = calls.find((c) => c.method === "POST" && c.path === "/jobs/1/matches/10/assign");
    expect(post).toBeTruthy();
    expect(post!.headers["idempotency-key"]).toBeTruthy();
    expect(screen.getByText(/APP-2026-121/, { selector: "[data-match-assigned]" })).toBeTruthy();
    expect(screen.getByText("Jessica Davis assigned")).toBeTruthy();
  });

  it("dismisses a match with an Undo that restores it", async () => {
    await mount();
    fireEvent.click(rows()[0]);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "More for Michael Park" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Not a fit (dismiss)" }));
    await settle();
    expect(calls.find((c) => c.method === "PATCH" && c.path === "/jobs/1/matches/11")!.body).toEqual({ status: "DISMISSED" });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(calls.filter((c) => c.method === "PATCH" && c.path === "/jobs/1/matches/11").at(-1)!.body).toEqual({ status: "SUGGESTED" });
  });

  it("changes the status from the drawer with the version it loaded, and Undo puts it back", async () => {
    await mount();
    fireEvent.click(rows()[0]);
    await settle();
    fireEvent.click(within(document.querySelector("[data-detail-body]") as HTMLElement).getByRole("button", { name: "Status" }));
    fireEvent.click(screen.getByRole("option", { name: "On Hold" }));
    await settle();
    const patch = calls.find((c) => c.method === "PATCH" && c.path === "/jobs/1")!;
    expect(patch.body).toEqual({ status: "ON_HOLD" });
    expect(patch.headers["if-match"]).toBe('"1"');
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    const undo = calls.filter((c) => c.method === "PATCH" && c.path === "/jobs/1").at(-1)!;
    expect(undo.body).toEqual({ status: "OPEN" });
    expect(undo.headers["if-match"]).toBe('"2"');
  });

  it("saves an edited title by itself when the box loses focus, and refuses a title that is too short", async () => {
    await mount();
    fireEvent.click(rows()[0]);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /Edit job/ }));
    const title = screen.getByLabelText("Job title");
    fireEvent.change(title, { target: { value: "Staff React Developer" } });
    fireEvent.blur(title);
    await settle();
    expect(calls.find((c) => c.method === "PATCH" && c.path === "/jobs/1")!.body).toEqual({ title: "Staff React Developer" });
    expect(document.querySelector("[data-save-status]")?.textContent).toBe("Saved");
    fireEvent.change(title, { target: { value: "x" } });
    fireEvent.blur(title);
    await settle();
    expect(document.querySelector("[data-save-status]")?.textContent).toContain("at least 2 characters");
    expect(calls.filter((c) => c.method === "PATCH" && c.path === "/jobs/1")).toHaveLength(1);
  });

  it("hides every write control from a viewer", async () => {
    access = { canCreate: false, canEdit: false, canAssign: false };
    await mount();
    expect(screen.queryByRole("button", { name: /Create Job/ })).toBeNull();
    fireEvent.click(rows()[0]);
    await settle();
    expect(screen.queryByRole("button", { name: /Edit job/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Assign/ })).toBeNull();
    expect(document.querySelector("[data-detail-body] [data-job-status]")?.textContent).toBe("Open");
  });
});

describe("Jobs: create and bulk", () => {
  it("creates a job with one idempotency key and opens it", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Create Job/ }));
    await settle();
    fireEvent.click(document.querySelector("[data-create-submit]")!);
    await settle();
    expect(screen.getByText("A title needs at least 2 characters.")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST" && c.path === "/jobs")).toBe(false);
    fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: "Platform Engineer" } });
    fireEvent.click(within(document.querySelector("[data-create-form]") as HTMLElement).getAllByRole("button")[0]); // the client select
    fireEvent.click(screen.getByRole("option", { name: "TechCorp" }));
    fireEvent.click(document.querySelector("[data-create-submit]")!);
    await settle();
    const post = calls.find((c) => c.method === "POST" && c.path === "/jobs")!;
    expect(post.body).toMatchObject({ title: "Platform Engineer", clientId: 1, positions: 1 });
    expect(post.headers["idempotency-key"]).toBeTruthy();
    expect(screen.getByText("Platform Engineer was created")).toBeTruthy();
    expect(window.location.search).toContain("job=99");
  });

  it("changes the status of the selected jobs and undoes it by the status each had", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Select Senior React Developer at TechCorp"));
    fireEvent.click(screen.getByLabelText("Select UX Designer at TechCorp"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(document.querySelector("[data-bulk-status]")!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Closed" }));
    await settle();
    const bulk = calls.find((c) => c.method === "POST" && c.path === "/jobs/bulk/status")!;
    expect(bulk.body).toEqual({ ids: [1, 3], status: "CLOSED" });
    expect(bulk.headers["idempotency-key"]).toBeTruthy();
    expect(screen.getByText("2 jobs set to Closed")).toBeTruthy();
    expect(document.querySelector("[data-bulk-bar]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    const undo = calls.filter((c) => c.method === "POST" && c.path === "/jobs/bulk/status").at(-1)!;
    expect(undo.body).toEqual({ ids: [1, 3], status: "OPEN" });
  });
});

describe("Jobs: a phone", () => {
  it("keeps the same cards and opens the job in a bottom sheet", async () => {
    phone(true);
    await mount();
    expect(rows()).toHaveLength(3);
    fireEvent.click(rows()[0]);
    await settle();
    expect(document.querySelector("#ent-job-sheet")).toBeTruthy();
    expect(document.querySelector("[data-detail-body]")).toBeTruthy();
  });
});
