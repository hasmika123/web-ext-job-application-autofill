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
    usePathname: () => "/w/admin/placements",
    useSearchParams: () => react.useSyncExternalStore(url.subscribe, url.get, url.get),
  };
});
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { ToastProvider } from "@kiwiply/ui";
import type { Counts, PlacementDetail, PlacementRow, Tile } from "@/lib/ent/placements";
import PlacementsPage from "./PlacementsPage";

type Call = { method: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined };
let calls: Call[];
let rowsDb: PlacementRow[];
let overrides: ((c: Call) => { status: number; body?: unknown } | undefined)[];
let undoable: { eventId: number; kind: string } | null;
let state: Record<number, { status: PlacementRow["status"]; pool: boolean; endDate: string | null; pending: boolean }>;

const rowOf = (id: number, name: string, client: string, role: string, endDate: string | null, label = "No action", tone: PlacementRow["nextAction"]["tone"] = "neutral"): PlacementRow => ({
  id,
  consultant: { id, name, initials: name.slice(0, 2).toUpperCase(), subtitle: `${role} Consultant` },
  client: { id: id + 100, name: client, initials: client.slice(0, 2).toUpperCase(), industry: null },
  roleTitle: role,
  placementType: "CONTRACT",
  startDate: "2026-01-15",
  endDate,
  accountManager: { memberId: 9, name: "Michael Park", initials: "MP" },
  status: "ACTIVE",
  billRateMinor: 12500,
  rateUnit: "HOUR",
  currency: "USD",
  nextAction: { kind: label === "No action" ? "NONE" : "ENDS_IN", label, tone, days: null },
  inPool: false,
  extensionPending: false,
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
  active: tile(142, 127),
  startingSoon: tile(18, 15),
  endingSoon: tile(12, 16),
  pool: tile(24, null),
  tabs: { active: 3, upcoming: 2, completed: 5, extensions: 1 },
  windows: { endingSoonDays: 45, endingUrgentDays: 14, startingSoonDays: 30 },
});

const detailOf = (r: PlacementRow, canWrite = true): PlacementDetail => {
  const s = state[r.id];
  return {
    id: r.id,
    consultant: r.consultant,
    client: r.client,
    roleTitle: r.roleTitle,
    placementType: r.placementType,
    startDate: r.startDate,
    endDate: s.endDate,
    endsInDays: 45,
    startsInDays: null,
    accountManager: r.accountManager,
    clientContact: { id: 1, name: "Sarah Johnson", title: "Marketing Director" },
    status: s.status,
    billRateMinor: r.billRateMinor,
    rateUnit: r.rateUnit,
    currency: r.currency,
    nextAction: r.nextAction,
    engagement: { start: r.startDate, midpoint: "2026-06-15", end: s.endDate, percent: 64, daysLeft: 45, totalDays: 340 },
    extensionPending: s.pending,
    extensions: s.pending ? [{ id: 5, status: "REQUESTED", fromEndDate: s.endDate, requestedEndDate: "2027-02-20", note: null, requestedBy: r.accountManager, decidedBy: null, createdAt: "2026-10-01T10:00:00Z", decidedAt: null }] : [],
    availability: { inPool: s.pool, availableFrom: "2026-12-21", inDays: 46, onBench: false },
    timeline: [{ id: 1, type: "CREATED", actor: r.accountManager, detail: "Placement recorded", at: "2026-01-15T09:00:00Z" }],
    notes: [],
    notesCount: 0,
    actions: { extend: canWrite && s.status !== "ENDED", requestExtension: canWrite && s.status !== "ENDED" && !s.pending, complete: canWrite && s.status !== "ENDED", redeploy: canWrite && !s.pool, addNote: canWrite, decideExtension: canWrite && s.pending },
    undo: undoable ? { eventId: undoable.eventId, expiresAt: "2026-10-13T00:10:00Z", kind: undoable.kind } : null,
  };
};

function stubApi() {
  calls = [];
  overrides = [];
  undoable = null;
  state = {};
  for (const r of rowsDb) state[r.id] = { status: r.status, pool: r.inPool, endDate: r.endDate, pending: r.extensionPending };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const u = new URL(input, "http://x");
      const raw = init.body;
      const call: Call = { method: init.method ?? "GET", path: u.pathname.replace(/^\/api\/orgs\/2\/placements/, "") || "/", params: u.searchParams, body: typeof raw === "string" ? JSON.parse(raw) : undefined };
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
    const status = c.params.get("status");
    let items = rowsDb.filter((r) => (!q || `${r.consultant.name} ${r.client.name} ${r.roleTitle}`.toLowerCase().includes(q)) && (!status || (status === "ENDING_SOON" ? r.nextAction.kind === "ENDS_IN" : true)));
    const size = Number(c.params.get("size") ?? 10);
    const page = Number(c.params.get("page") ?? 0);
    const total = items.length;
    items = items.slice(page * size, page * size + size);
    return { status: 200, body: { items, page, size, total, hasNext: false } };
  }
  if (c.path === "/counts") return { status: 200, body: counts() };
  if (c.path === "/filters") {
    return {
      status: 200,
      body: {
        clients: [{ value: "101", label: "Acme Corp" }],
        roles: [{ value: "Marketing Strategist", label: "Marketing Strategist" }],
        managers: [{ value: "9", label: "Michael Park" }],
        types: [{ value: "CONTRACT", label: "Contract" }],
        statuses: [{ value: "ACTIVE", label: "Active" }, { value: "ENDING_SOON", label: "Ending soon" }],
      },
    };
  }
  const one = /^\/(\d+)(\/(extend|extension-requests|complete|redeploy|notes|undo))?$/.exec(c.path);
  if (one) {
    const row = rowsDb.find((r) => r.id === Number(one[1]));
    if (!row) return { status: 404, body: { error: "Not found.", code: "NOT_FOUND" } };
    const s = state[row.id];
    if (c.method === "GET" && !one[2]) return { status: 200, body: detailOf(row) };
    if (c.method === "POST" && one[3] === "complete") {
      undoable = { eventId: 77, kind: "COMPLETED" };
      s.status = "ENDED";
      return { status: 200, body: detailOf(row) };
    }
    if (c.method === "POST" && one[3] === "redeploy") {
      undoable = { eventId: 78, kind: "REDEPLOY_STARTED" };
      s.pool = true;
      return { status: 200, body: detailOf(row) };
    }
    if (c.method === "POST" && one[3] === "extension-requests") {
      s.pending = true;
      return { status: 201, body: detailOf(row) };
    }
    if (c.method === "POST" && one[3] === "extend") {
      s.endDate = String((c.body as { endDate: string }).endDate);
      return { status: 200, body: detailOf(row) };
    }
    if (c.method === "POST" && one[3] === "undo") {
      s.status = "ACTIVE";
      s.pool = false;
      undoable = null;
      return { status: 200, body: detailOf(row) };
    }
  }
  return { status: 404, body: { error: "no" } };
}

const PERMS = { "placements.view": "ORG", "placements.manage": "ORG" };

async function mount(over: { permissions?: Record<string, string> } = {}) {
  const out = render(
    <ToastProvider>
      <PlacementsPage orgId={2} orgName="Acme Corp" workspace="admin" permissions={over.permissions ?? PERMS} consultantsHref="/w/admin/consultants" clientsHref="/w/admin/clients" supportEmail={null} />
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

function screenSize(kind: "phone" | "tablet" | "wide") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: (kind === "phone" && query.includes("max-width: 767px")) || (kind === "wide" && query.includes("min-width: 1280px")),
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
  url.set("");
  rowsDb = [
    rowOf(1, "Jessica Davis", "Acme Corp", "Marketing Strategist", "2026-12-20"),
    rowOf(2, "Michael Park", "Globex", "Product Manager", "2026-12-31", "Ends in 45 days", "amber"),
    rowOf(3, "Emily Lawson", "Initech", "Growth Strategist", "2026-10-25", "Ends in 12 days", "red"),
  ];
  stubApi();
  screenSize("tablet");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Placements: the list", () => {
  it("shows the four tiles, the four tabs with their counts, the table and the range like the board", async () => {
    await mount();
    expect(Array.from(document.querySelectorAll("[data-kpi]")).map((e) => e.getAttribute("data-kpi"))).toEqual(["active", "startingSoon", "endingSoon", "pool"]);
    expect(document.querySelector("[data-kpi=active] [data-kpi-value]")?.textContent).toBe("142");
    expect(document.querySelector("[data-kpi=active] [data-kpi-delta]")?.textContent).toContain("+12%");
    expect(document.querySelector("[data-kpi=endingSoon] [data-kpi-delta]")?.textContent).toContain("-25%");
    expect(screen.getByRole("tab", { name: "Active (3)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Upcoming (2)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Completed (5)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Extensions (1)" })).toBeTruthy();
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["1", "2", "3"]);
    expect(screen.getByText("1-3 of 3 active placements")).toBeTruthy();
    expect(screen.getByText("1-3 of 3 placements")).toBeTruthy();
    expect(document.querySelector("[data-help-card]")).toBeTruthy();
    const first = listCalls()[0];
    expect(first.params.get("tab")).toBe("active");
    expect(first.params.get("sort")).toBe("end,asc");
    expect(first.params.get("size")).toBe("10");
  });

  it("draws a delta from the API only: a tile with no history shows no delta", async () => {
    await mount();
    expect(document.querySelector("[data-kpi=pool] [data-kpi-delta]")).toBeNull();
    expect(document.querySelector("[data-kpi=pool] [data-kpi-value]")?.textContent).toBe("24");
  });

  it("writes the Next Action pill with its tone and the recorded bill rate", async () => {
    await mount();
    const pills = rows().map((r) => r.querySelector("[data-next-action]")?.textContent);
    expect(pills).toEqual(["No action", "Ends in 45 days", "Ends in 12 days"]);
    expect(rows()[1].querySelector("[data-next-action]")?.getAttribute("data-next-tone")).toBe("amber");
    expect(rows()[2].querySelector("[data-next-action]")?.getAttribute("data-next-tone")).toBe("red");
    expect(rows()[0].textContent).toContain("$125/hr");
    expect(rows()[0].querySelector("[data-status-pill]")?.textContent).toBe("Active");
  });

  it("hides the bill rate column and the add button from someone who may only read", async () => {
    await mount({ permissions: { "placements.view": "ORG" } });
    expect(screen.queryByText("Bill Rate")).toBeNull();
    expect(document.querySelector("[data-add-placement]")).toBeNull();
    expect(rows()).toHaveLength(3);
  });

  it("switches tab into the URL, asks the API for it and keeps the default sort per tab", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: /Completed/ }));
    await settle();
    expect(url.get().get("tab")).toBe("completed");
    expect(url.get().has("sort")).toBe(false); // latest end first is the default of this tab
    const last = listCalls().at(-1)!;
    expect(last.params.get("tab")).toBe("completed");
    expect(last.params.get("sort")).toBe("end,desc");
  });

  it("filters by status through the dropdown and asks the API", async () => {
    await mount();
    fireEvent.click(document.querySelector('button[aria-label="Status"]')!);
    fireEvent.click(screen.getByRole("option", { name: "Ending soon" }));
    await settle();
    expect(url.get().get("status")).toBe("ENDING_SOON");
    expect(listCalls().at(-1)!.params.get("status")).toBe("ENDING_SOON");
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["2", "3"]);
  });

  it("searches once the typing rests and says when nothing matches", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search placements"), { target: { value: "zzzz" } });
    await settle(400);
    expect(url.get().get("q")).toBe("zzzz");
    expect(screen.getByText("No placements match")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await settle();
    expect(url.get().has("q")).toBe(false);
    expect(rows()).toHaveLength(3);
  });

  it("starts from the URL (a shared link reproduces the view) and keeps the page 1-based", async () => {
    url.set("tab=upcoming&sort=rate,desc&page=2&size=25&view=grid");
    await mount();
    const first = listCalls()[0];
    expect(first.params.get("tab")).toBe("upcoming");
    expect(first.params.get("sort")).toBe("rate,desc");
    expect(first.params.get("page")).toBe("1");
    expect(first.params.get("size")).toBe("25");
  });

  it("opens in grid view from the URL", async () => {
    url.set("view=grid");
    await mount();
    expect(document.querySelectorAll("[data-placement-cards=grid] li")).toHaveLength(3);
    expect(document.querySelector("[data-placement-table]")).toBeNull();
  });

  it("changes the sort from the Sort by menu and the view with the toggle", async () => {
    await mount();
    fireEvent.click(document.querySelector('button[aria-label="Sort by"]')!);
    fireEvent.click(screen.getByRole("option", { name: "Bill Rate (High to Low)" }));
    await settle();
    expect(listCalls().at(-1)!.params.get("sort")).toBe("rate,desc");
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    await settle();
    expect(url.get().get("view")).toBe("grid");
    expect(document.querySelector("[data-placement-cards=grid] li")).toBeTruthy();
  });

  it("ticks rows and counts them", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Select Jessica Davis"));
    fireEvent.click(screen.getByLabelText("Select Emily Lawson"));
    expect(document.querySelector("[data-selected-count]")?.textContent).toBe("2 selected");
    fireEvent.click(screen.getByLabelText("Select all placements on this page"));
    expect(document.querySelector("[data-selected-count]")?.textContent).toBe("3 selected");
  });

  it("shows an error with a retry when the list cannot be read", async () => {
    overrides.push((c) => (c.path === "/" && c.method === "GET" ? { status: 500, body: { error: "Boom" } } : undefined));
    await mount();
    expect(screen.getAllByText(/Boom/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeTruthy();
  });

  it("becomes cards on a phone", async () => {
    screenSize("phone");
    await mount();
    expect(document.querySelectorAll("[data-placement-cards] li")).toHaveLength(3);
    expect(document.querySelector("[data-placement-table]")).toBeNull();
  });
});

describe("Placements: the drawer", () => {
  it("opens from a row into the URL with the board's details, engagement timeline, extension status and availability", async () => {
    await mount();
    fireEvent.click(rows()[0]);
    await settle();
    expect(url.get().get("pl")).toBe("1");
    const body = document.querySelector("[data-detail-body]") as HTMLElement;
    expect(body).toBeTruthy();
    expect(within(body).getByText("Placement Details")).toBeTruthy();
    expect(body.querySelector("[data-field=client]")?.textContent).toContain("Acme Corp");
    expect(body.querySelector("[data-field=type]")?.textContent).toContain("Contract");
    expect(body.querySelector("[data-field=rate]")?.textContent).toContain("$125/hr");
    expect(body.querySelector("[data-field=contact]")?.textContent).toContain("Sarah Johnson");
    expect(body.querySelector("[data-engagement]")).toBeTruthy();
    expect(body.querySelector("[data-dot=Started][data-on=true]")).toBeTruthy();
    expect(body.querySelector("[data-dot=Ends][data-on=false]")).toBeTruthy();
    expect(body.querySelector("[data-extension-status]")?.textContent).toContain("No extension requested yet");
    expect(body.querySelector("[data-availability]")?.textContent).toContain("will be available starting");
    expect(body.querySelectorAll("[data-quick]")).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByText("Placement recorded", { selector: "span" })).toBeTruthy();
    expect(url.get().get("dtab")).toBe("timeline");
  });

  it("docks in the right column on a wide screen and opens the first row, as the board does", async () => {
    screenSize("wide");
    await mount();
    await settle();
    expect(url.get().get("pl")).toBe("1");
    expect(document.querySelector("[data-docked-drawer] [data-detail-body]")).toBeTruthy();
    fireEvent.click(document.querySelector("[data-drawer-close]")!);
    await settle();
    expect(url.get().has("pl")).toBe(false);
    expect(document.querySelector("[data-docked-drawer]")).toBeNull();
  });

  it("marks a placement complete with one click, says what was recorded, and Undo takes it back", async () => {
    url.set("pl=1");
    await mount();
    await settle();
    fireEvent.click(document.querySelector("[data-quick=complete]")!);
    await settle();
    expect(calls.some((c) => c.method === "POST" && c.path === "/1/complete")).toBe(true);
    expect(screen.getByText("Marked complete")).toBeTruthy();
    expect(document.querySelector("[data-status-label]")?.textContent).toBe("Completed");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(calls.some((c) => c.path === "/1/undo" && (c.body as { eventId: number }).eventId === 77)).toBe(true);
    expect(screen.getByText("Undone")).toBeTruthy();
    expect(document.querySelector("[data-status-label]")?.textContent).toBe("Active");
  });

  it("starts redeployment from the quick action and shows the pool chip", async () => {
    url.set("pl=2");
    await mount();
    await settle();
    fireEvent.click(document.querySelector("[data-quick=redeploy]")!);
    await settle();
    expect(calls.some((c) => c.method === "POST" && c.path === "/2/redeploy")).toBe(true);
    expect(document.querySelector("[data-availability]")?.textContent).toContain("In the redeployment pool");
    expect(document.querySelector("[data-quick=redeploy]")).toBeNull();
  });

  it("requests an extension through a date dialog and refuses a date that is not later", async () => {
    url.set("pl=1");
    await mount();
    await settle();
    fireEvent.click(document.querySelector("[data-request-extension]")!);
    const submit = () => document.querySelector("[data-extension-submit]") as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Requested end date"), { target: { value: "2026-12-01" } });
    expect(submit().disabled).toBe(true); // before the current end date (2026-12-20)
    fireEvent.change(screen.getByLabelText("Requested end date"), { target: { value: "2027-02-20" } });
    expect(submit().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(submit());
    });
    await settle();
    const call = calls.find((c) => c.path === "/1/extension-requests");
    expect(call?.body).toEqual({ requestedEndDate: "2027-02-20", note: null });
    expect(screen.getByText("Extension requested", { selector: "div,span,h4" })).toBeTruthy();
    expect(document.querySelector("[data-request-extension]")).toBeNull();
  });

  it("opens the extend dialog from the row menu once the placement has loaded", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Actions for Jessica Davis"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Extend placement…" }));
    await settle();
    expect(url.get().get("pl")).toBe("1");
    expect(document.querySelector("[data-extension-dialog=extend]")).toBeTruthy();
  });

  it("says plainly when the placement is no longer in view", async () => {
    url.set("pl=99");
    await mount();
    await settle();
    expect(screen.getByText(/no longer in your view/i)).toBeTruthy();
  });
});
