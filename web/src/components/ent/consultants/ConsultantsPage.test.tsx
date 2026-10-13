// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The address, as the page sees it: `router.replace` rewrites it and every `useSearchParams` reader re-renders. */
const nav = vi.hoisted(() => ({ search: "", listeners: new Set<() => void>(), replaced: [] as string[] }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (l: () => void) => {
    nav.listeners.add(l);
    return () => nav.listeners.delete(l);
  };
  return {
    usePathname: () => "/w/admin/consultants",
    useRouter: () => ({
      push: vi.fn(),
      refresh: vi.fn(),
      replace: (u: string) => {
        nav.replaced.push(u);
        nav.search = u.includes("?") ? u.slice(u.indexOf("?") + 1) : "";
        nav.listeners.forEach((l) => l());
      },
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => nav.search, () => nav.search)),
  };
});

import { ToastProvider } from "@kiwiply/ui";
import type { ConsultantCounts, ConsultantDetail, ConsultantRow, Tile } from "@/lib/ent/consultants";
import ConsultantsPage from "./ConsultantsPage";

/* ── a stand-in for the BFF: records every call, answers from a small in-memory roster ────────────────────── */

type Call = { method: string; url: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined; headers: Record<string, string> };
let calls: Call[];
let people: Person[];
let counts: ConsultantCounts;

interface Person {
  id: number;
  name: string;
  availability: ConsultantRow["availability"];
  license: ConsultantRow["license"];
  status: "ACTIVE" | "INACTIVE";
  marketer: string | null;
  version: number;
}

const rowOf = (p: Person): ConsultantRow => ({
  id: p.id,
  name: p.name,
  email: `${p.name.split(" ")[0].toLowerCase()}@acme.test`,
  jobTitle: "Engineer",
  primarySkills: ["Salesforce", "AWS"],
  skillCount: 4,
  yearsExperience: 8,
  location: "New York, NY",
  workMode: "REMOTE",
  marketer: p.marketer ? { memberId: 7, name: p.marketer } : null,
  availability: p.availability,
  availableFrom: null,
  license: p.license,
  licenseValidUntil: "2027-01-31",
  profileCompleteness: 85,
  activeApplications: 3,
  nextInterview: p.id === 1 ? { scheduledAt: "2026-10-22T10:00:00Z", roundLabel: "Round 1" } : null,
  status: p.status,
  createdAt: "2026-06-01T09:00:00Z",
});
const detailOf = (p: Person): ConsultantDetail => ({
  consultant: rowOf(p),
  memberId: null,
  headline: null,
  skills: [
    { skill: "Salesforce", primary: true },
    { skill: "Agile", primary: false },
  ],
  availabilitySince: "2026-09-01",
  marketingStatus: "ACTIVE",
  department: null,
  assignment: p.marketer ? { marketer: { memberId: 7, name: p.marketer }, backup: null, priority: "MEDIUM", status: "ACTIVE", assignedAt: "2026-09-02T09:00:00Z" } : null,
  checklist: { basic: true, skills: true, resume: false, certifications: true, preferences: false },
  applicationsTotal: 3,
  upcomingInterviews: 1,
  resumeCount: 0,
  actions: { edit: p.status === "ACTIVE", assignMarketer: true, deactivate: p.status === "ACTIVE", reactivate: p.status === "INACTIVE", createApplication: true },
  version: `W/"${p.version}-0"`,
});
const tile = (value: number, previous: number | null = null): Tile => ({
  value,
  previous,
  delta: previous === null ? null : value - previous,
  deltaPercent: previous ? Math.round((1000 * (value - previous)) / previous) / 10 : null,
  series: [1, 2, 2, 3, 3, 4, 4, value],
});

const seed = (): Person[] => [
  { id: 1, name: "Jessica Davis", availability: "AVAILABLE", license: "ACTIVE", status: "ACTIVE", marketer: "Sarah Chen", version: 1 },
  { id: 2, name: "Michael Park", availability: "ON_PROJECT", license: "ACTIVE", status: "ACTIVE", marketer: "Sarah Chen", version: 1 },
  { id: 3, name: "Emily Lawson", availability: "AVAILABLE", license: "EXPIRING", status: "ACTIVE", marketer: null, version: 1 },
];

let overrides: ((c: Call) => { status: number; body?: unknown } | undefined)[];

function stubApi() {
  calls = [];
  overrides = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const u = new URL(input, "http://x");
      const raw = init.body;
      const call: Call = {
        method: init.method ?? "GET",
        url: input,
        path: u.pathname.replace(/^\/api\/orgs\/2\/consultants/, "") || "/",
        params: u.searchParams,
        body: typeof raw === "string" ? JSON.parse(raw) : undefined,
        headers: (init.headers ?? {}) as Record<string, string>,
      };
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
    const q = (c.params.get("q") ?? "").toLowerCase();
    const wantInactive = c.params.get("status") === "INACTIVE";
    let items = people.filter((p) => (wantInactive ? p.status === "INACTIVE" : p.status === "ACTIVE"));
    if (q) items = items.filter((p) => p.name.toLowerCase().includes(q));
    const av = c.params.get("availability");
    if (av) items = items.filter((p) => p.availability === av);
    const size = Number(c.params.get("size") ?? 10);
    const page = Number(c.params.get("page") ?? 0);
    return { status: 200, body: { items: items.slice(page * size, page * size + size).map(rowOf), page, size, total: items.length, hasNext: false } };
  }
  if (c.path === "/" && c.method === "POST") {
    const b = c.body as { displayName: string };
    const p: Person = { id: 99, name: b.displayName, availability: "AVAILABLE", license: "PENDING", status: "ACTIVE", marketer: null, version: 1 };
    people.push(p);
    return { status: 201, body: detailOf(p) };
  }
  if (c.path === "/counts") return { status: 200, body: counts };
  if (c.path === "/filters") {
    return {
      status: 200,
      body: { skills: ["AWS", "Salesforce"], marketers: [{ memberId: 7, name: "Sarah Chen", workload: 9, capacity: 20, status: "ACTIVE" }], departments: [{ id: 5, name: "Consulting" }] },
    };
  }
  if (c.path === "/bulk/availability") {
    const b = c.body as { ids: number[]; availability: ConsultantRow["availability"] };
    const results = b.ids.map((id) => {
      const p = people.find((x) => x.id === id)!;
      if (p.availability === b.availability) return { id, ok: false, reason: "UNCHANGED", previous: null };
      const previous = { availability: p.availability };
      p.availability = b.availability;
      return { id, ok: true, reason: null, previous };
    });
    return { status: 200, body: { action: "AVAILABILITY", requested: results.length, ok: results.filter((r) => r.ok).length, results } };
  }
  if (c.path === "/bulk/status") {
    const b = c.body as { ids: number[]; action: string };
    const results = b.ids.map((id) => {
      const p = people.find((x) => x.id === id)!;
      const previous = { status: p.status };
      p.status = b.action === "DEACTIVATE" ? "INACTIVE" : "ACTIVE";
      return { id, ok: true, reason: null, previous };
    });
    return { status: 200, body: { action: b.action, requested: results.length, ok: results.length, results } };
  }
  const one = /^\/(\d+)(\/.*)?$/.exec(c.path);
  if (one) {
    const p = people.find((x) => x.id === Number(one[1]))!;
    const sub = one[2] ?? "";
    if (c.method === "GET" && sub === "") return { status: 200, body: detailOf(p) };
    if (c.method === "GET" && sub === "/assignments") return { status: 200, body: { assignment: detailOf(p).assignment, jobs: [{ requirementId: 1, title: "Senior Salesforce Developer", clientName: "TechCorp", jobStatus: "OPEN", score: 91, assignedAt: null }], placements: [] } };
    if (c.method === "GET" && sub === "/applications") return { status: 200, body: { items: [{ id: 1, code: "APP-2026-001", jobTitle: "Senior Salesforce Developer", clientName: "TechCorp", stage: "INTERVIEWING", closedReason: null, appliedOn: "2026-10-01", nextAction: "Prep call", nextActionDue: "2026-10-20", stageChangedAt: null }], interviews: [] } };
    if (c.method === "GET" && sub === "/activity") return { status: 200, body: { items: [{ kind: "APPLICATION", at: "2026-10-10T09:00:00Z", actor: "Sarah Chen", action: "STAGE_CHANGE", code: "APP-2026-001", jobTitle: "Senior Salesforce Developer", fromStage: "SUBMITTED", toStage: "INTERVIEWING", detail: null }] } };
    if (c.method === "GET" && sub === "/job-options") return { status: 200, body: [{ id: 4, title: "Platform Engineer", clientName: "FinTech", score: null }] };
    if (c.method === "PATCH") {
      if (c.headers["if-match"] !== `W/"${p.version}-0"`) return { status: 412, body: { error: "stale", code: "PRECONDITION_FAILED" } };
      const b = c.body as { availabilityStatus?: ConsultantRow["availability"] };
      if (b.availabilityStatus) p.availability = b.availabilityStatus;
      p.version++;
      return { status: 200, body: detailOf(p) };
    }
    if (c.method === "POST" && sub === "/deactivate") {
      p.status = "INACTIVE";
      return { status: 200, body: detailOf(p) };
    }
    if (c.method === "POST" && sub === "/reactivate") {
      p.status = "ACTIVE";
      return { status: 200, body: detailOf(p) };
    }
    if (c.method === "POST" && sub === "/marketer") {
      p.marketer = "Sarah Chen";
      return { status: 200, body: detailOf(p) };
    }
    if (c.method === "POST" && sub === "/applications") return { status: 201, body: { id: 5, code: "APP-2026-009", stage: "ASSIGNED" } };
  }
  return { status: 404, body: { error: "no" } };
}

const PERMS = { "consultants.view": "ORG", "consultants.edit": "ORG", "assignments.manage": "ORG", "opportunities.manage": "ORG" };

async function mount(over: { permissions?: Record<string, string>; search?: string } = {}) {
  nav.search = over.search ?? "";
  const out = render(
    <ToastProvider>
      <ConsultantsPage orgId={2} orgName="Acme" permissions={over.permissions ?? PERMS} supportEmail={null} />
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
const rowFor = (name: string) => rows().find((r) => r.textContent?.includes(name))!;
const listCalls = () => calls.filter((c) => c.path === "/" && c.method === "GET");
const drawer = () => document.getElementById("ent-consultant-sheet")!;

function phone(on: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: on && query.includes("max-width: 767px"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  nav.replaced = [];
  people = seed();
  counts = { asOf: null, scope: "ORG", total: tile(3, 2), available: tile(2, 2), onProject: tile(1, null), needsReview: tile(0, null) };
  stubApi();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  nav.listeners.clear();
});

describe("Consultants: the directory", () => {
  it("shows the roster with the board's columns, an honest unassigned marker and the footer", async () => {
    await mount();
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["1", "2", "3"]);
    expect(rowFor("Emily Lawson").querySelector("[data-unassigned]")?.textContent).toBe("Unassigned");
    expect(rowFor("Jessica Davis").textContent).toContain("Sarah Chen");
    expect(rowFor("Jessica Davis").querySelector("[data-next-interview]")?.textContent).toContain("Oct 22, 2026");
    expect(rowFor("Michael Park").querySelector("[data-next-interview]")).toBeNull();
    expect(Array.from(document.querySelectorAll("th")).map((h) => h.textContent?.trim())).toEqual(
      expect.arrayContaining(["Consultant", "Primary Skills", "Experience", "Location", "Marketer", "Availability", "License", "Profile", "Apps", "Next Interview"]),
    );
    expect(screen.getByText("1-3 of 3 consultants")).toBeTruthy();
    const first = listCalls()[0];
    expect(first.params.get("sort")).toBe("name,asc");
    expect(first.params.get("size")).toBe("10");
  });

  it("draws four tiles with a sparkline, and a delta only where the API gave one", async () => {
    await mount();
    expect(Array.from(document.querySelectorAll("[data-kpi]")).map((e) => e.getAttribute("data-kpi"))).toEqual(["total", "available", "onProject", "needsReview"]);
    const total = document.querySelector("[data-kpi=total]")!;
    expect(total.querySelector("[data-kpi-value]")?.textContent).toBe("3");
    expect(total.querySelector("[data-sparkline]")).not.toBeNull();
    expect(total.querySelector("[data-kpi-delta]")?.textContent).toContain("50%");
    expect(total.querySelector("[data-kpi-delta]")?.textContent).toContain("vs last month");
    expect(document.querySelector("[data-kpi=available] [data-kpi-delta]")?.textContent).toContain("0%");
    for (const k of ["onProject", "needsReview"]) expect(document.querySelector(`[data-kpi=${k}] [data-kpi-delta]`), k).toBeNull();
  });

  it("searches after typing rests and puts the search in the address", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search consultants"), { target: { value: "jess" } });
    await settle(400);
    expect(listCalls().filter((c) => c.params.get("q") === "jess")).toHaveLength(1);
    expect(rows()).toHaveLength(1);
    expect(nav.search).toBe("q=jess");
  });

  it("reads every part of the view from the address (a shared link reproduces it)", async () => {
    await mount({ search: "availability=AVAILABLE&sort=experience,desc&page=0&size=25&c=3&tab=applications" });
    const first = listCalls()[0];
    expect(first.params.get("availability")).toBe("AVAILABLE");
    expect(first.params.get("sort")).toBe("experience,desc");
    expect(first.params.get("size")).toBe("25");
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["1", "3"]);
    // the drawer for consultant 3 is open on its Applications tab
    expect(calls.some((c) => c.path === "/3" && c.method === "GET")).toBe(true);
    expect(calls.some((c) => c.path === "/3/applications")).toBe(true);
    expect(within(drawer()).getByText("APP-2026-001", { exact: false })).toBeTruthy();
  });

  it("falls back to the default view for a hand-edited address", async () => {
    await mount({ search: "sort=salary,up&page=-4&size=7&tab=nonsense&availability=" });
    const first = listCalls()[0];
    expect(first.params.get("sort")).toBe("name,asc");
    expect(first.params.get("page")).toBe("0");
    expect(first.params.get("size")).toBe("10");
  });

  it("sorts by a header and keeps the direction in aria-sort and in the address", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Consultant" }));
    await settle();
    expect(listCalls().at(-1)!.params.get("sort")).toBe("name,desc");
    expect(document.querySelector("th[aria-sort=descending]")?.textContent).toContain("Consultant");
    expect(nav.search).toBe("sort=name%2Cdesc");
  });

  it("filters by availability through the dropdown", async () => {
    await mount();
    fireEvent.click(document.querySelector('[role=search] button[aria-label="Availability"]')!);
    fireEvent.click(screen.getByRole("option", { name: "On Project" }));
    await settle();
    expect(listCalls().at(-1)!.params.get("availability")).toBe("ON_PROJECT");
    expect(rows()).toHaveLength(1);
    expect(nav.search).toBe("availability=ON_PROJECT");
  });

  it("pages with the size the person picks", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Rows per page"));
    fireEvent.click(screen.getByRole("option", { name: "25 per page" }));
    await settle();
    expect(listCalls().at(-1)!.params.get("size")).toBe("25");
    expect(nav.search).toBe("size=25");
  });
});

describe("Consultants: empty, error and phone", () => {
  it("says nobody matches and offers to clear the filters", async () => {
    await mount();
    overrides.push((c) => (c.path === "/" && c.params.get("q") === "zzz" ? { status: 200, body: { items: [], page: 0, size: 10, total: 0, hasNext: false } } : undefined));
    fireEvent.change(screen.getByLabelText("Search consultants"), { target: { value: "zzz" } });
    await settle(400);
    expect(screen.getByText("No consultants match")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);
  });

  it("invites the first consultant when there are none, only to people who may add one", async () => {
    people = [];
    await mount();
    expect(screen.getByText("No consultants yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Add Consultant/ }).length).toBeGreaterThan(0);
    cleanup();
    stubApi();
    await mount({ permissions: { "consultants.view": "ORG" } });
    expect(screen.getByText("No consultants yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add Consultant/ })).toBeNull();
  });

  it("shows a retry when the list fails", async () => {
    overrides.push((c) => (c.path === "/" && c.method === "GET" ? { status: 500, body: { error: "boom" } } : undefined));
    await mount();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    overrides.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    await settle();
    expect(rows()).toHaveLength(3);
  });

  it("turns the table into cards on a phone", async () => {
    phone(true);
    await mount();
    expect(document.querySelector("[data-consultant-cards]")).not.toBeNull();
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelectorAll("[data-consultant-cards] > li")).toHaveLength(3);
  });
});

describe("Consultants: the drawer", () => {
  it("opens from a row, writes the address, and shows overview, checklist and quick actions", async () => {
    await mount();
    fireEvent.click(rowFor("Jessica Davis"));
    await settle();
    expect(nav.search).toBe("c=1");
    const d = drawer();
    expect(within(d).getByText("8 years of experience")).toBeTruthy();
    expect(d.querySelectorAll("[data-checklist] li")).toHaveLength(5);
    expect(d.querySelectorAll("[data-checklist] [data-done=true]")).toHaveLength(3);
    expect(Array.from(d.querySelectorAll("[data-quick-action]")).map((b) => b.getAttribute("data-quick-action"))).toEqual(["applications", "marketer", "license", "department", "application", "deactivate"]);
    expect(within(d).getByText("Need help managing consultants?")).toBeTruthy();
  });

  it("switches tabs, loading each one lazily and putting the tab in the address", async () => {
    await mount({ search: "c=1" });
    await settle();
    expect(calls.some((c) => c.path === "/1/assignments")).toBe(false);
    fireEvent.click(within(drawer()).getByRole("tab", { name: "Assignments" }));
    await settle();
    expect(nav.search).toBe("c=1&tab=assignments");
    expect(within(drawer()).getByText("Senior Salesforce Developer")).toBeTruthy();
    expect(within(drawer()).getByText("91% match")).toBeTruthy();
    fireEvent.click(within(drawer()).getByRole("tab", { name: "Activity" }));
    await settle();
    expect(within(drawer()).getByText(/moved from Submitted to Interviewing/)).toBeTruthy();
  });

  it("autosaves an availability change with the drawer's version, then offers Undo", async () => {
    await mount({ search: "c=1" });
    await settle();
    fireEvent.click(within(drawer()).getByRole("button", { name: "Availability" }));
    fireEvent.click(screen.getByRole("option", { name: "On Project" }));
    await settle();
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.path).toBe("/1");
    expect(patch.body).toEqual({ availabilityStatus: "ON_PROJECT" });
    expect(patch.headers["if-match"]).toBe('W/"1-0"');
    expect(screen.getByText("Availability set to On Project")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(2);
    expect(patches[1].body).toEqual({ availabilityStatus: "AVAILABLE" });
    expect(patches[1].headers["if-match"]).toBe('W/"2-0"');
  });

  it("closes from the close control and drops the consultant from the address", async () => {
    await mount({ search: "c=1&tab=activity&page=0" });
    await settle();
    fireEvent.click(within(drawer()).getByRole("button", { name: /close/i }));
    await settle();
    expect(nav.search).toBe("");
  });

  it("says the consultant is no longer in view on a 404", async () => {
    overrides.push((c) => (c.path === "/1" && c.method === "GET" ? { status: 404, body: { error: "Not found", code: "NOT_FOUND" } } : undefined));
    await mount({ search: "c=1" });
    await settle();
    expect(within(drawer()).getByText(/no longer in your view/i)).toBeTruthy();
  });

  it("hides the edit controls from someone who may only view", async () => {
    overrides.push((c) => {
      const m = /^\/(\d+)$/.exec(c.path);
      if (c.method === "GET" && m) {
        const d = detailOf(people.find((p) => p.id === Number(m[1]))!);
        return { status: 200, body: { ...d, actions: { edit: false, assignMarketer: false, deactivate: false, reactivate: false, createApplication: false } } };
      }
      return undefined;
    });
    await mount({ permissions: { "consultants.view": "ORG" }, search: "c=1" });
    await settle();
    expect(within(drawer()).queryByRole("button", { name: "Availability" })).toBeNull();
    expect(Array.from(drawer().querySelectorAll("[data-quick-action]")).map((b) => b.getAttribute("data-quick-action"))).toEqual(["applications"]);
  });
});

describe("Consultants: actions", () => {
  it("adds a consultant with an idempotency key, opens the drawer on them and offers Undo", async () => {
    await mount();
    fireEvent.click(screen.getAllByRole("button", { name: /Add Consultant/ })[0]);
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Add Consultant" });
    expect((within(dialog).getByRole("button", { name: "Add consultant" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Full name"), { target: { value: "Fay Fox" } });
    fireEvent.change(within(dialog).getByLabelText("Work email"), { target: { value: "fay@acme.test" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add consultant" }));
    await settle();
    const post = calls.find((c) => c.method === "POST" && c.path === "/")!;
    expect(post.body).toMatchObject({ displayName: "Fay Fox", email: "fay@acme.test" });
    expect(post.headers["idempotency-key"]).toMatch(/.{8,}/);
    expect(screen.getByText("Fay Fox was added")).toBeTruthy();
    expect(nav.search).toBe("c=99");
  });

  it("shows the server's sentence when a duplicate email is refused, and keeps the form", async () => {
    overrides.push((c) => (c.method === "POST" && c.path === "/" ? { status: 409, body: { error: "dup", code: "CONSULTANT_EXISTS" } } : undefined));
    await mount();
    fireEvent.click(screen.getAllByRole("button", { name: /Add Consultant/ })[0]);
    const dialog = screen.getByRole("dialog", { name: "Add Consultant" });
    fireEvent.change(within(dialog).getByLabelText("Full name"), { target: { value: "Fay Fox" } });
    fireEvent.change(within(dialog).getByLabelText("Work email"), { target: { value: "fay@acme.test" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add consultant" }));
    await settle();
    expect(within(dialog).getByRole("alert").textContent).toContain("already exists");
    expect((within(dialog).getByLabelText("Full name") as HTMLInputElement).value).toBe("Fay Fox");
  });

  it("sets the availability of the ticked rows in one call, with a summary and an Undo that sends the old value", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Select Jessica Davis"));
    fireEvent.click(screen.getByLabelText("Select Michael Park"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set availability" }));
    const dialog = screen.getByRole("dialog", { name: "Set availability" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Availability" }));
    fireEvent.click(screen.getByRole("option", { name: "On Project" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await settle();
    const bulk = calls.find((c) => c.path === "/bulk/availability")!;
    expect(bulk.body).toEqual({ ids: [1, 2], availability: "ON_PROJECT" });
    expect(bulk.headers["idempotency-key"]).toBeTruthy();
    expect(screen.getByText("1 consultant updated")).toBeTruthy();
    expect(screen.getByText(/Skipped 1: 1 already set/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    const undo = calls.filter((c) => c.path === "/bulk/availability")[1];
    expect(undo.body).toEqual({ ids: [1], availability: "AVAILABLE" });
    expect(screen.queryByText("2 selected")).toBeNull();
  });

  it("deactivates from the row menu with a reason, and Undo reactivates", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Actions for Emily Lawson"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    await settle();
    const reason = screen.getByRole("textbox");
    fireEvent.change(reason, { target: { value: "Left the bench for a full-time offer" } });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await settle();
    const post = calls.find((c) => c.path === "/3/deactivate")!;
    expect(post.body).toEqual({ reason: "Left the bench for a full-time offer" });
    expect(screen.getByText("Emily Lawson is deactivated")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(calls.some((c) => c.path === "/3/reactivate")).toBe(true);
  });

  it("assigns a marketer from the row menu, naming the workload in the picker", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Actions for Emily Lawson"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Assign marketer" }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Assign Marketer" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Marketer" }));
    fireEvent.click(screen.getByRole("option", { name: "Sarah Chen · 9 / 20" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    await settle();
    expect(calls.find((c) => c.path === "/3/marketer")!.body).toEqual({ marketerMemberId: 7 });
    expect(screen.getByText("Sarah Chen now markets Emily Lawson")).toBeTruthy();
  });

  it("creates a job application from the drawer's quick action", async () => {
    await mount({ search: "c=1" });
    await settle();
    fireEvent.click(drawer().querySelector("[data-quick-action=application]")!);
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Create Job Application" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Job" }));
    fireEvent.click(screen.getByRole("option", { name: "Platform Engineer · FinTech" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create application" }));
    await settle();
    const post = calls.find((c) => c.method === "POST" && c.path === "/1/applications")!;
    expect(post.body).toEqual({ requirementId: 4 });
    expect(post.headers["idempotency-key"]).toBeTruthy();
    expect(screen.getByText("Application APP-2026-009 created")).toBeTruthy();
  });

  it("offers no add, bulk or row actions to someone who may only view", async () => {
    await mount({ permissions: { "consultants.view": "ORG" } });
    expect(screen.queryByRole("button", { name: /Add Consultant/ })).toBeNull();
    fireEvent.click(screen.getByLabelText("Select Jessica Davis"));
    expect(screen.queryByRole("button", { name: "Set availability" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign marketer" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Actions for Jessica Davis"));
    expect(screen.queryByRole("menuitem", { name: "Deactivate" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "View details" })).toBeTruthy();
  });
});
