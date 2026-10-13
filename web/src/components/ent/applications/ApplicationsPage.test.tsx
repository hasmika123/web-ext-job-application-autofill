// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    usePathname: () => "/w/admin/applications",
    useSearchParams: () => react.useSyncExternalStore(url.subscribe, url.get, url.get),
  };
});
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { ToastProvider } from "@kiwiply/ui";
import type { ApplicationDetail, ApplicationRow, Counts, Stage, Tile } from "@/lib/ent/applications";
import ApplicationsPage from "./ApplicationsPage";

type Call = { method: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined };
let calls: Call[];
let rowsDb: ApplicationRow[];
let overrides: ((c: Call) => { status: number; body?: unknown } | undefined)[];
let notesDb: Record<number, string[]>;
let undoable: { eventId: number; from: Stage; to: Stage } | null;

const STAGES: Stage[] = ["ASSIGNED", "SUBMITTED", "UNDER_REVIEW", "INTERVIEWING", "OFFER", "CLOSED"];
const LABEL: Record<Stage, string> = { ASSIGNED: "Assigned", SUBMITTED: "Submitted", UNDER_REVIEW: "Under Review", INTERVIEWING: "Interviewing", OFFER: "Offer", CLOSED: "Closed" };

const rowOf = (id: number, stage: Stage, job: string, consultant: string): ApplicationRow => ({
  id,
  code: `APP-2026-${String(id).padStart(3, "0")}`,
  requirementId: id,
  jobTitle: job,
  employmentLabel: "FTE",
  consultant: { id, name: consultant, initials: consultant.slice(0, 2).toUpperCase(), subtitle: null },
  client: { id: 1, name: "Global Media", initials: "GM", industry: null },
  appliedOn: "2026-09-20",
  stage,
  closedReason: null,
  marketer: { memberId: 9, name: "Jessica Davis", initials: "JD" },
  nextAction: stage === "CLOSED" ? null : "Prepare application",
  nextActionDue: "2026-10-20",
  overdue: false,
  stageChangedAt: "2026-10-01T10:00:00Z",
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
  total: tile(3, 2),
  inReview: tile(1, null),
  interviewing: tile(1, 1),
  offers: tile(0, null, [0, 0, 0, 0]),
  byStage: {},
});

const detailOf = (r: ApplicationRow, canMove = true): ApplicationDetail => {
  const i = STAGES.indexOf(r.stage);
  return {
    id: r.id,
    code: r.code,
    requirementId: r.requirementId,
    jobTitle: r.jobTitle,
    employmentLabel: r.employmentLabel,
    consultant: r.consultant,
    client: r.client,
    appliedOn: r.appliedOn,
    stage: r.stage,
    closedReason: r.closedReason,
    source: "Referral",
    marketer: r.marketer,
    nextAction: r.nextAction,
    nextActionDue: r.nextActionDue,
    overdue: false,
    stageChangedAt: r.stageChangedAt,
    steps: STAGES.map((s, k) => ({ stage: s, label: LABEL[s], reachedAt: k <= i ? "2026-09-20T09:00:00Z" : null, state: k < i ? "DONE" : k === i ? "CURRENT" : "FUTURE" })),
    nextStages: canMove && r.stage !== "CLOSED" ? STAGES.slice(i + 1) : [],
    timeline: [{ id: 1, type: "CREATED", fromStage: null, toStage: "ASSIGNED", actor: r.marketer, detail: "Assigned to Jessica", at: "2026-09-20T09:00:00Z" }],
    activity: [{ id: 1, type: "CREATED", fromStage: null, toStage: "ASSIGNED", actor: r.marketer, detail: "Assigned to Jessica", at: "2026-09-20T09:00:00Z" }],
    notes: (notesDb[r.id] ?? []).map((b, i) => ({ id: i + 1, author: r.marketer, body: b, createdAt: "2026-10-13T08:00:00Z" })),
    notesCount: (notesDb[r.id] ?? []).length,
    actions: { edit: canMove, moveStage: canMove && r.stage !== "CLOSED", addNote: canMove, reassign: false },
    undo: undoable ? { eventId: undoable.eventId, expiresAt: "2026-10-13T00:10:00Z", fromStage: undoable.from, toStage: undoable.to } : null,
  };
};

function stubApi() {
  calls = [];
  overrides = [];
  undoable = null;
  notesDb = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const u = new URL(input, "http://x");
      const raw = init.body;
      const call: Call = { method: init.method ?? "GET", path: u.pathname.replace(/^\/api\/orgs\/2\/applications/, "") || "/", params: u.searchParams, body: typeof raw === "string" ? JSON.parse(raw) : undefined };
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
    const stage = c.params.get("stage");
    const q = (c.params.get("q") ?? "").toLowerCase();
    let items = rowsDb.filter((r) => (!stage || stage.split(",").includes(r.stage)) && (!q || `${r.jobTitle} ${r.consultant.name}`.toLowerCase().includes(q)));
    const size = Number(c.params.get("size") ?? 10);
    const page = Number(c.params.get("page") ?? 0);
    const total = items.length;
    items = items.slice(page * size, page * size + size);
    return { status: 200, body: { items, page, size, total, hasNext: false } };
  }
  if (c.path === "/counts") return { status: 200, body: counts() };
  if (c.path === "/filters") return { status: 200, body: { jobTitles: [{ value: "Data Analyst", label: "Data Analyst" }], clients: [{ value: "1", label: "Global Media" }], marketers: [{ value: "9", label: "Jessica Davis" }], stages: STAGES.map((s) => ({ value: s, label: LABEL[s] })) } };
  if (c.path === "/pipeline") return { status: 200, body: { columns: STAGES.map((s) => ({ stage: s, label: LABEL[s], count: rowsDb.filter((r) => r.stage === s).length, items: rowsDb.filter((r) => r.stage === s) })) } };
  if (c.path === "/analytics") return { status: 200, body: { total: 3, open: 3, avgDaysOpen: 12.5, byStage: STAGES.map((s) => ({ key: s, label: LABEL[s], count: rowsDb.filter((r) => r.stage === s).length })), reached: [{ key: "ASSIGNED", label: "Assigned", count: 3 }, { key: "HIRED", label: "Hired", count: 1 }], perMonth: [{ key: "2026-10", label: "Oct", count: 3 }], closedReasons: [], topClients: [{ key: "Global Media", label: "Global Media", count: 3 }], bySource: [], byMarketer: [] } };
  const one = /^\/(\d+)(\/(stage|notes))?$/.exec(c.path);
  if (one) {
    const row = rowsDb.find((r) => r.id === Number(one[1]));
    if (!row) return { status: 404, body: { error: "Not found.", code: "NOT_FOUND" } };
    if (c.method === "GET" && !one[2]) return { status: 200, body: detailOf(row) };
    if (c.method === "POST" && one[3] === "stage") {
      const b = c.body as { stage?: Stage; undoEventId?: number };
      if (b.undoEventId) {
        row.stage = undoable!.from;
        undoable = null;
        return { status: 200, body: detailOf(row) };
      }
      undoable = { eventId: 77, from: row.stage, to: b.stage! };
      row.stage = b.stage!;
      return { status: 200, body: detailOf(row) };
    }
    if (c.method === "POST" && one[3] === "notes") {
      notesDb[row.id] = [...(notesDb[row.id] ?? []), String((c.body as { body: string }).body)];
      return { status: 201, body: detailOf(row) };
    }
  }
  return { status: 404, body: { error: "no" } };
}

const PERMS = { "pipeline.view": "ORG", "submissions.prepare": "ORG", "submissions.record": "ORG", "followups.manage": "ORG" };

async function mount(over: { permissions?: Record<string, string> } = {}) {
  const out = render(
    <ToastProvider>
      <ApplicationsPage orgId={2} orgName="Acme Corp" workspace="admin" permissions={over.permissions ?? PERMS} jobsHref="/w/admin/jobs" consultantsHref="/w/admin/consultants" supportEmail={null} />
    </ToastProvider>,
  );
  await settle(0);
  return out;
}

const settle = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const rows = () => Array.from(document.querySelectorAll<HTMLElement>("tr[data-row-id]"));
const listCalls = () => calls.filter((c) => c.path === "/" && c.method === "GET");

function phone(on: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({ matches: on && query.includes("max-width: 767px"), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  url.set("");
  rowsDb = [rowOf(1, "ASSIGNED", "Data Analyst", "Anika Rao"), rowOf(2, "INTERVIEWING", "Product Manager", "Ben Okafor"), rowOf(3, "CLOSED", "QA Engineer", "Cara Diaz")];
  stubApi();
  phone(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Applications: the list", () => {
  it("shows the four tiles, the table and the range like the board", async () => {
    await mount();
    expect(Array.from(document.querySelectorAll("[data-kpi]")).map((e) => e.getAttribute("data-kpi"))).toEqual(["total", "inReview", "interviewing", "offers"]);
    expect(document.querySelector("[data-kpi=total] [data-kpi-value]")?.textContent).toBe("3");
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["1", "2", "3"]);
    expect(screen.getByText("1-3 of 3 applications")).toBeTruthy();
    expect(document.querySelector("[data-help-bee=promo]")).toBeTruthy();
    const first = listCalls()[0];
    expect(first.params.get("sort")).toBe("applied,desc");
    expect(first.params.get("size")).toBe("10");
  });

  it("draws a delta and a sparkline from the API only; a tile with no history shows neither a delta nor an invented one", async () => {
    await mount();
    const total = document.querySelector("[data-kpi=total]")!;
    expect(total.querySelector("[data-kpi-delta]")?.textContent).toContain("vs last month");
    expect(total.querySelector("svg[data-sparkline]")).toBeTruthy();
    expect(document.querySelector("[data-kpi=inReview] [data-kpi-delta]")).toBeNull();
    expect(document.querySelector("[data-kpi=offers] [data-kpi-delta]")).toBeNull();
  });

  it("closed applications read N/A for their next action and stages show as pills", async () => {
    await mount();
    const closed = rows().find((r) => r.getAttribute("data-row-id") === "3")!;
    expect(closed.textContent).toContain("N/A");
    expect(closed.querySelector("[data-state-pill=application]")?.textContent).toBe("Closed");
  });

  it("filters by stage into the URL and asks the API for it", async () => {
    await mount();
    fireEvent.click(document.querySelector('[role=search] button[aria-label="Stage"]')!);
    fireEvent.click(screen.getByRole("option", { name: "Interviewing" }));
    await settle();
    expect(url.get().get("stage")).toBe("INTERVIEWING");
    expect(listCalls().at(-1)!.params.get("stage")).toBe("INTERVIEWING");
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["2"]);
  });

  it("searches once the typing rests and says when nothing matches", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search applications"), { target: { value: "zzzz" } });
    await settle(400);
    expect(url.get().get("q")).toBe("zzzz");
    expect(screen.getByText("No applications match")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await settle();
    expect(url.get().has("q")).toBe(false);
    expect(rows()).toHaveLength(3);
  });

  it("starts from the URL (a shared link reproduces the view) and keeps the page 1-based", async () => {
    url.set("stage=CLOSED&sort=job,asc&page=1&size=25");
    await mount();
    const first = listCalls()[0];
    expect(first.params.get("stage")).toBe("CLOSED");
    expect(first.params.get("sort")).toBe("job,asc");
    expect(first.params.get("page")).toBe("0");
    expect(first.params.get("size")).toBe("25");
  });

  it("sorts by a header and keeps the direction in aria-sort", async () => {
    await mount();
    fireEvent.click(screen.getByTitle("Sort by job title"));
    await settle();
    expect(listCalls().at(-1)!.params.get("sort")).toBe("job,asc");
    expect(document.querySelector("th[aria-sort=ascending]")?.textContent).toContain("Job Title");
    expect(url.get().get("sort")).toBe("job,asc");
  });

  it("shows an error with a retry when the list cannot be read", async () => {
    overrides.push((c) => (c.path === "/" && c.method === "GET" ? { status: 500, body: { error: "Boom" } } : undefined));
    await mount();
    expect(screen.getAllByText(/Boom/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeTruthy();
  });

  it("becomes cards on a phone", async () => {
    phone(true);
    await mount();
    expect(document.querySelectorAll("[data-application-cards] li")).toHaveLength(3);
    expect(document.querySelector("[data-application-table]")).toBeNull();
  });
});

describe("Applications: the drawer", () => {
  it("opens from a row into the URL with the stepper and the details, and closes again", async () => {
    await mount();
    fireEvent.click(rows()[1]);
    await settle();
    expect(url.get().get("app")).toBe("2");
    const body = document.querySelector("[data-detail-body]")!;
    expect(body.querySelector("[data-step=INTERVIEWING][data-step-state=CURRENT]")).toBeTruthy();
    expect(body.querySelector("[data-field=code]")?.textContent).toContain("APP-2026-002");
    expect(body.querySelector("[data-field=consultant]")?.textContent).toContain("Ben Okafor");
    expect(body.querySelector('a[href="/w/admin/jobs"]')).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Notes (0)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Close/ }));
    await settle(400);
    expect(url.get().has("app")).toBe(false);
  });

  it("records a move as a record, offers Undo and puts it back", async () => {
    await mount();
    fireEvent.click(rows()[0]);
    await settle();
    expect(screen.getByText(/never submits an application/i)).toBeTruthy();
    fireEvent.click(document.querySelector("[data-move-trigger]")!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Record as Submitted" }));
    await settle();
    const move = calls.find((c) => c.method === "POST" && c.path === "/1/stage")!;
    expect(move.body).toEqual({ stage: "SUBMITTED", closedReason: null });
    expect(screen.getByText(/APP-2026-001 recorded as Submitted/)).toBeTruthy();
    expect(document.querySelector("[data-step=SUBMITTED][data-step-state=CURRENT]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(calls.filter((c) => c.method === "POST" && c.path === "/1/stage").at(-1)!.body).toEqual({ undoEventId: 77 });
    expect(screen.getByText("Undone")).toBeTruthy();
    expect(document.querySelector("[data-step=ASSIGNED][data-step-state=CURRENT]")).toBeTruthy();
  });

  it("offers closing as one entry per reason", async () => {
    await mount();
    fireEvent.click(rows()[0]);
    await settle();
    fireEvent.click(document.querySelector("[data-move-trigger]")!);
    for (const r of ["Hired", "Rejected", "Withdrawn", "No response"]) expect(screen.getByRole("menuitem", { name: `Close: ${r}` })).toBeTruthy();
  });

  it("adds a note and shows the new count", async () => {
    await mount();
    fireEvent.click(rows()[0]);
    await settle();
    fireEvent.click(screen.getByRole("tab", { name: "Notes (0)" }));
    fireEvent.change(screen.getByLabelText("Add a note"), { target: { value: "Prefers Fridays" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await settle();
    expect(calls.find((c) => c.method === "POST" && c.path === "/1/notes")!.body).toEqual({ body: "Prefers Fridays" });
    expect(screen.getByRole("tab", { name: "Notes (1)" })).toBeTruthy();
    expect(document.querySelector("[data-note-id]")?.textContent).toContain("Prefers Fridays");
  });

  it("draws no move or edit control for someone who may only read", async () => {
    overrides.push((c) => (c.method === "GET" && /^\/\d+$/.test(c.path) ? { status: 200, body: detailOf(rowsDb.find((r) => `/${r.id}` === c.path)!, false) } : undefined));
    await mount({ permissions: { "pipeline.view": "ORG" } });
    expect(document.querySelector("[data-add-application]")).toBeNull();
    fireEvent.click(rows()[0]);
    await settle();
    expect(document.querySelector("[data-move-trigger]")).toBeNull();
    expect(document.querySelector("[data-edit-toggle]")).toBeNull();
    expect(screen.queryByLabelText("Add a note")).toBeNull();
  });

  it("says the application is no longer in view when the API answers 404", async () => {
    url.set("app=999");
    await mount();
    expect(screen.getByText(/no longer in your view/i)).toBeTruthy();
  });
});

describe("Applications: the other tabs", () => {
  it("builds the pipeline from the same rows, one column per stage", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: /Pipeline View/ }));
    await settle();
    expect(url.get().get("tab")).toBe("pipeline");
    expect(document.querySelectorAll("[data-kanban-column]")).toHaveLength(6);
    expect(document.querySelectorAll("[data-kanban-column=INTERVIEWING] [data-card-id]")).toHaveLength(1);
  });

  it("draws the analytics from the API's counts", async () => {
    url.set("tab=analytics");
    await mount();
    expect(document.querySelector("[data-analytics-tab]")).toBeTruthy();
    expect(document.querySelector("[data-analytics=funnel]")?.textContent).toContain("Hired");
    expect(document.querySelector("[data-analytics=stages]")?.textContent).toContain("3 open");
  });

  it("says so when there is nothing to analyse", async () => {
    url.set("tab=analytics");
    overrides.push((c) => (c.path === "/analytics" ? { status: 200, body: { total: 0, open: 0, avgDaysOpen: null, byStage: [], reached: [], perMonth: [], closedReasons: [], topClients: [], bySource: [], byMarketer: [] } } : undefined));
    await mount();
    expect(screen.getByText("No applications to analyse yet")).toBeTruthy();
  });
});

describe("Applications: adding", () => {
  it("opens the dialog and creates through the API with the picked consultant and job", async () => {
    overrides.push((c) => (c.path === "/pickers" ? { status: 200, body: { kind: c.params.get("kind"), items: [{ id: 41, label: c.params.get("kind") === "job" ? "Data Analyst" : "Sky Spare", sub: "x" }] } } : undefined));
    overrides.push((c) => (c.method === "POST" && c.path === "/" ? { status: 201, body: { ...detailOf(rowsDb[0]), id: 1 } } : undefined));
    await mount();
    fireEvent.click(document.querySelector("[data-add-application]")!);
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Add Application" });
    expect(dialog.textContent).toContain("doesn't apply anywhere");
    const submit = dialog.querySelector<HTMLButtonElement>("[data-add-submit]")!;
    expect(submit.disabled).toBe(true);
    fireEvent.focus(screen.getByLabelText("Consultant"));
    await settle(400);
    fireEvent.click(within(dialog).getByRole("button", { name: /Sky Spare/ }));
    fireEvent.focus(screen.getByLabelText("Job"));
    await settle(400);
    fireEvent.click(within(dialog).getByRole("button", { name: /Data Analyst/ }));
    await settle();
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await settle();
    const create = calls.find((c) => c.method === "POST" && c.path === "/")!;
    expect(create.body).toMatchObject({ requirementId: 41, consultantId: 41, stage: "ASSIGNED" });
    expect(screen.getByText(/Nothing was submitted/)).toBeTruthy();
    expect(url.get().get("app")).toBe("1");
  });
});
