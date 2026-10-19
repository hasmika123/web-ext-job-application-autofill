// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ClientDetail, ClientRow, Summary, Tile } from "@/lib/ent/clients";
import { problems as clientProblems } from "./AddClientDialog";
import { problems as contactProblems } from "./ContactDialog";
import ClientsPage from "./ClientsPage";

/* ── a stand-in for the BFF: records every call, answers from a small in-memory client list ───────────────────── */

type Call = { method: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined; headers: Record<string, string> };
let calls: Call[];
let clients: C[];
let access: { canManage: boolean; canCreateRequirement: boolean };
let overrides: ((c: Call) => { status: number; body?: unknown } | undefined)[];

interface C {
  id: number;
  name: string;
  industry: string;
  status: ClientRow["status"];
  health: "HEALTHY" | "AT_RISK" | "NEUTRAL";
  open: number;
  active: number;
  manager: string | null;
  version: number;
  contacts: { id: number; name: string; title: string; email: string; status: "ACTIVE" | "LEFT" }[];
  notes: { id: number; body: string }[];
}

const tile = (value: number, previous: number | null = null): Tile => ({ value, previous, delta: previous === null ? null : value - previous, deltaPercent: previous ? Math.round((1000 * (value - previous)) / previous) / 10 : null, series: [1, 2, 3, value] });

const mk = (id: number, name: string, industry: string, health: C["health"], open: number, active: number, manager: string | null, status: C["status"] = "ACTIVE"): C => ({
  id, name, industry, status, health, open, active, manager, version: 1,
  contacts: [{ id: id * 10, name: "Jennifer Wilson", title: "VP of Talent Acquisition", email: "jennifer@x.example.com", status: "ACTIVE" }, { id: id * 10 + 1, name: "Robert Chen", title: "Hiring Manager", email: "robert@x.example.com", status: "ACTIVE" }],
  notes: [{ id: id * 100, body: "Great quarterly business review." }],
});

const rowOf = (c: C): ClientRow => ({
  id: c.id, name: c.name, industry: c.industry, status: c.status, website: "https://www.x.example.com", openRequirements: c.open, activeConsultants: c.active,
  manager: c.manager ? { id: 5, name: c.manager } : null, health: { level: c.health, reason: "Because." }, lastActivityAt: "2024-04-18T10:00:00Z",
});

const live = (c: C) => c.contacts.filter((x) => x.status === "ACTIVE");

const detailOf = (c: C): ClientDetail => ({
  id: c.id, name: c.name, status: c.status, industry: c.industry, website: "https://www.techcorp.com", location: "San Francisco, CA", sizeBand: "1000-5000", clientSince: "2022-01-15",
  about: `${c.name} is a leading company.`, manager: c.manager ? { id: 5, name: c.manager } : null, health: { level: c.health, reason: "Active within 14 days with work in flight." },
  openRequirements: c.open, activeConsultants: c.active, placements: 3, lastActivityAt: "2024-04-18T10:00:00Z",
  contacts: live(c).map((x) => ({ id: x.id, name: x.name, title: x.title, email: x.email, role: "HIRING_MANAGER", status: x.status, addedAt: "2024-01-01T10:00:00Z" })), contactCount: live(c).length,
  requirements: [{ id: 7, title: "Senior Frontend Engineer", status: "OPEN", positions: 1, filled: 0, location: "SF", postedAt: "2024-04-16T10:00:00Z", submissions: 2 }], requirementCount: 18,
  submissions: [{ applicationId: 1, code: "APP-2026-001", consultantId: 3, consultantName: "Alex Turner", jobTitle: "Senior Frontend Engineer", stage: "INTERVIEWING", closedReason: null, at: "2024-04-16T10:00:00Z" }],
  notes: c.notes.map((n) => ({ id: n.id, body: n.body, at: "2024-04-15T10:00:00Z", author: "Jessica Davis" })), noteCount: c.notes.length, version: `"${c.version}"`, access,
});

const summary = (): Summary => ({
  totalClients: tile(clients.length, 4),
  activeRequirements: tile(124, 100),
  newThisMonth: tile(6, null),
  placementsViaClients: tile(42, 34),
  asOf: "2026-10-13T10:00:00Z",
  facets: {
    industries: [{ value: "Technology", label: "Technology", count: 2 }, { value: "Retail", label: "Retail", count: 1 }],
    health: ["HEALTHY", "AT_RISK", "NEUTRAL"].map((h) => ({ value: h, label: h, count: clients.filter((c) => c.health === h).length })),
    statuses: [{ value: "ACTIVE", label: "ACTIVE", count: 3 }],
    sizes: [{ value: "1000-5000", label: "1000-5000", count: 3 }],
    managers: [{ value: "5", label: "Jessica Davis", count: 2 }],
  },
  healthRule: { healthyDays: 14, atRiskDays: 45 },
  managerOptions: access.canManage ? [{ id: 5, name: "Jessica Davis" }, { id: 6, name: "Michael Park" }] : [],
  access,
});

function answer(c: Call): { status: number; body?: unknown } {
  for (const o of overrides) {
    const r = o(c);
    if (r) return r;
  }
  if (c.path === "/clients" && c.method === "GET") {
    let items = clients;
    const health = c.params.get("health");
    if (health) items = items.filter((x) => x.health === health);
    const industry = c.params.get("industry");
    if (industry) items = items.filter((x) => x.industry === industry);
    const text = (c.params.get("q") ?? "").toLowerCase();
    if (text) items = items.filter((x) => x.name.toLowerCase().includes(text));
    const size = Number(c.params.get("size") ?? 10);
    const page = Number(c.params.get("page") ?? 0);
    return { status: 200, body: { items: items.slice(page * size, page * size + size).map(rowOf), page, size, total: items.length, hasNext: false } };
  }
  if (c.path === "/clients/summary") return { status: 200, body: summary() };
  if (c.path === "/clients/contacts") {
    const items = clients.flatMap((x) => live(x).map((k) => ({ id: k.id, name: k.name, title: k.title, email: k.email, role: "HIRING_MANAGER", status: "ACTIVE", client: { id: x.id, name: x.name }, addedAt: "2024-01-01T10:00:00Z" })));
    return { status: 200, body: { items, page: 0, size: 10, total: items.length, hasNext: false } };
  }
  if (c.path === "/clients/requirements") return { status: 200, body: { items: [{ id: 7, title: "Senior Frontend Engineer", client: { id: 1, name: "TechCorp Inc." }, status: "OPEN", positions: 1, filled: 0, location: "SF", postedAt: "2024-04-16T10:00:00Z", submissions: 2 }], page: 0, size: 10, total: 1, hasNext: false } };
  if (c.path === "/clients/activity") return { status: 200, body: { items: [{ at: "2024-04-16T10:00:00Z", kind: "requirement", summary: "Senior Frontend Engineer was posted for TechCorp Inc.", client: { id: 1, name: "TechCorp Inc." }, actor: null }] } };
  if (c.path === "/clients" && c.method === "POST") {
    const b = c.body as { name: string };
    const n = mk(99, b.name, "Technology", "NEUTRAL", 0, 0, "Jessica Davis");
    clients = [n, ...clients];
    return { status: 201, body: detailOf(n) };
  }
  const one = /^\/clients\/(\d+)(\/.*)?$/.exec(c.path);
  if (one) {
    const x = clients.find((k) => k.id === Number(one[1]))!;
    const sub = one[2] ?? "";
    if (c.method === "GET" && sub === "") return { status: 200, body: detailOf(x) };
    if (c.method === "PATCH" && sub === "") {
      if (c.headers["if-match"] !== `"${x.version}"`) return { status: 412, body: { error: "stale", code: "PRECONDITION_FAILED" } };
      if ("status" in c.body!) x.status = c.body!.status as C["status"];
      x.version++;
      return { status: 200, body: detailOf(x) };
    }
    if (c.method === "POST" && sub === "/contacts") {
      const b = c.body as { name: string; email?: string };
      if (b.email && b.email.endsWith("@gmail.com")) return { status: 422, body: { error: "Use a work e-mail.", code: "WORK_EMAIL_REQUIRED" } };
      x.contacts.push({ id: 900, name: b.name, title: "", email: b.email ?? "", status: "ACTIVE" });
      return { status: 201, body: detailOf(x) };
    }
    const k = /^\/contacts\/(\d+)$/.exec(sub);
    if (k && c.method === "PATCH") {
      x.contacts.find((y) => y.id === Number(k[1]))!.status = (c.body as { status: "ACTIVE" | "LEFT" }).status;
      return { status: 200, body: detailOf(x) };
    }
    if (c.method === "POST" && sub === "/notes") {
      x.notes.unshift({ id: 777, body: (c.body as { body: string }).body });
      return { status: 201, body: detailOf(x) };
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
      <ClientsPage orgId={2} hrefs={{ jobs: "/w/admin/jobs", applications: "/w/admin/applications", placements: "/w/admin/placements" }} />
    </ToastProvider>,
  );
  await settle(0);
  await settle(0);
  return out;
}

const rows = () => Array.from(document.querySelectorAll<HTMLElement>("tr[data-row-id]"));
const listCalls = () => calls.filter((c) => c.path === "/clients" && c.method === "GET");

function media(opts: { phone?: boolean; wide?: boolean }) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: (!!opts.phone && query.includes("max-width: 767px")) || (!!opts.wide && query.includes("min-width: 1400px")),
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
  window.history.replaceState(null, "", "/w/admin/clients");
  access = { canManage: true, canCreateRequirement: true };
  clients = [mk(1, "TechCorp Inc.", "Technology", "HEALTHY", 18, 12, "Jessica Davis"), mk(2, "Global Finance Co.", "Financial Services", "AT_RISK", 14, 8, "Michael Park"), mk(3, "Retail Solutions", "Retail", "NEUTRAL", 9, 7, null)];
  stubApi();
  media({});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Clients: the directory and the tiles", () => {
  it("shows the two plain tiles (Clients, Active requirements), the rows, and the count", async () => {
    await mount();
    expect(Array.from(document.querySelectorAll("[data-kpi]")).map((e) => e.getAttribute("data-kpi"))).toEqual(["totalClients", "activeRequirements"]);
    expect(document.querySelector("[data-kpi=totalClients] [data-kpi-value]")?.textContent).toBe("3");
    expect(document.querySelector("[data-kpi-delta]")).toBeNull();
    expect(document.querySelector("[data-kpi] [data-sparkline]")).toBeNull();
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["1", "2", "3"]);
    expect(screen.getAllByText("1-3 of 3 clients").length).toBeGreaterThan(0);
    const first = listCalls()[0];
    expect(first.params.get("sort")).toBe("activity");
    expect(first.params.get("dir")).toBe("desc");
    expect(first.params.get("size")).toBe("10");
  });

  it("draws each row with its company tile, counts, manager and the API's health", async () => {
    await mount();
    const r1 = rows()[0];
    expect(within(r1).getByText("TechCorp Inc.")).toBeTruthy();
    expect(r1.querySelector("[data-company-tile]")?.textContent).toBe("T");
    expect(r1.querySelector("[data-open-requirements]")?.textContent).toBe("18");
    expect(r1.querySelector("[data-active-consultants]")?.textContent).toBe("12");
    expect(within(r1).getByText("Jessica Davis")).toBeTruthy();
    expect(r1.querySelector("[data-health]")?.getAttribute("data-health")).toBe("HEALTHY");
    expect(rows()[1].querySelector("[data-health]")?.textContent).toBe("At Risk");
    expect(rows()[2].querySelector("[data-health]")?.textContent).toBe("Neutral");
    expect(rows()[2].textContent).toContain("—"); // no account manager
    expect(r1.querySelector("[data-last-activity]")?.textContent).toBe("Apr 18, 2024");
    expect(document.querySelector("[data-help-bee]")).toBeNull();
    expect(screen.queryByText(/Need help with client management/)).toBeNull();
  });

  it("searches after the typing rests, filters by health and industry, and keeps the address in step", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search clients"), { target: { value: "global" } });
    await settle(400);
    expect(listCalls().filter((c) => c.params.get("q") === "global")).toHaveLength(1);
    expect(rows()).toHaveLength(1);
    expect(window.location.search).toContain("q=global");
    fireEvent.change(screen.getByLabelText("Search clients"), { target: { value: "" } });
    await settle(400);
    fireEvent.click(document.querySelector('[data-filters] button[aria-label="Health"]')!);
    fireEvent.click(screen.getByRole("option", { name: "At Risk (1)" }));
    await settle();
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["2"]);
    expect(window.location.search).toContain("health=AT_RISK");
    fireEvent.click(screen.getByText("Clear filters"));
    await settle(400);
    expect(rows()).toHaveLength(3);
    fireEvent.click(document.querySelector('[data-filters] button[aria-label="Industry"]')!);
    fireEvent.click(screen.getByRole("option", { name: "Retail (1)" }));
    await settle();
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["3"]);
  }, 20000);

  it("sorts from the header and from the menu", async () => {
    await mount();
    fireEvent.click(document.querySelector("button[data-sort=name]") as HTMLElement);
    await settle();
    expect(listCalls().at(-1)!.params.get("sort")).toBe("name");
    expect(listCalls().at(-1)!.params.get("dir")).toBe("asc");
    fireEvent.click(document.querySelector('button[aria-label="Sort by"]')!);
    fireEvent.click(screen.getByRole("option", { name: "Most open requirements" }));
    await settle();
    expect(listCalls().at(-1)!.params.get("sort")).toBe("requirements");
  });

  it("opens the same view from a link", async () => {
    window.history.replaceState(null, "", "/w/admin/clients?q=tech&health=HEALTHY&sort=name,asc&page=2&size=25");
    await mount();
    const p = listCalls()[0].params;
    expect(p.get("q")).toBe("tech");
    expect(p.get("health")).toBe("HEALTHY");
    expect(p.get("sort")).toBe("name");
    expect(p.get("dir")).toBe("asc");
    expect(p.get("page")).toBe("1");
    expect(p.get("size")).toBe("25");
  });

  it("says so when there is nothing, and offers the first client to someone who may add one", async () => {
    clients = [];
    await mount();
    expect(screen.getByText("No clients yet")).toBeTruthy();
    expect(screen.getByText("Add your first client")).toBeTruthy();
  });

  it("switches to the grid view", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Grid view"));
    await settle();
    expect(document.querySelector("[data-clients-grid]")).toBeTruthy();
    expect(window.location.search).toContain("view=grid");
  });
});

describe("Clients: the drawer", () => {
  async function open(id = 1) {
    await mount();
    fireEvent.click(document.querySelector(`tr[data-row-id="${id}"]`) as HTMLElement);
    await settle();
    await settle();
  }

  it("opens the client with its facts, key contacts, requirements, submissions and notes", async () => {
    await open();
    const body = document.querySelector("[data-detail-body]") as HTMLElement;
    expect(body.getAttribute("data-client-id")).toBe("1");
    expect(within(body).getByText("About")).toBeTruthy();
    expect(within(body).getByText("TechCorp Inc. is a leading company.")).toBeTruthy();
    expect(within(body).getByText("San Francisco, CA")).toBeTruthy();
    expect(within(body).getByText("1,000 - 5,000 employees")).toBeTruthy();
    expect(within(body).getByText("Client since Jan 2022")).toBeTruthy();
    expect(within(body).getByText("Key Contacts")).toBeTruthy();
    expect(within(body).getByText("Jennifer Wilson")).toBeTruthy();
    expect(within(body).getByText("Recent Requirements")).toBeTruthy();
    expect(within(body).getAllByText("Senior Frontend Engineer")).toHaveLength(2); // the requirement and the submission's job
    expect(within(body).getByText("Alex Turner")).toBeTruthy();
    expect(within(body).getByText("Interview")).toBeTruthy();
    expect(within(body).getByText("Great quarterly business review.")).toBeTruthy();
    expect(within(body).getByText("Contacts (2)")).toBeTruthy();
    expect(within(body).getByText("Requirements (18)")).toBeTruthy();
    expect(within(body).getByText("Active within 14 days with work in flight.")).toBeTruthy();
    expect(window.location.search).toContain("client=1");
  });

  it("links to the other pages with the client in the address", async () => {
    await open();
    const body = document.querySelector("[data-detail-body]") as HTMLElement;
    expect(body.querySelector("a[data-view-placements]")?.getAttribute("href")).toBe("/w/admin/placements?client=1");
    expect(within(body).getByLabelText("View all submissions").getAttribute("href")).toBe("/w/admin/applications?client=1");
  });

  it("shows the contacts and requirements tabs as lists", async () => {
    await open();
    fireEvent.click(screen.getByRole("tab", { name: "Contacts (2)" }));
    await settle();
    expect(document.querySelector("[data-contacts-tab]")?.textContent).toContain("Robert Chen");
    fireEvent.click(screen.getByRole("tab", { name: "Requirements (18)" }));
    await settle();
    expect(document.querySelector("[data-requirements-tab] a")?.getAttribute("href")).toBe("/w/admin/jobs?job=7");
    expect(window.location.search).toContain("dtab=requirements");
  });

  it("marks a contact as left with an Undo", async () => {
    await open();
    const row = document.querySelector("[data-key-contacts] [data-contact-row]") as HTMLElement;
    fireEvent.click(within(row).getByLabelText("More for Jennifer Wilson"));
    await settle();
    fireEvent.click(screen.getByText("Mark as left the company"));
    await settle();
    const patch = calls.find((c) => c.method === "PATCH" && c.path === "/clients/1/contacts/10")!;
    expect(patch.body).toEqual({ status: "LEFT" });
    expect(screen.getByText("Jennifer Wilson was marked as having left")).toBeTruthy();
    fireEvent.click(screen.getByText("Undo"));
    await settle();
    expect(calls.filter((c) => c.method === "PATCH" && c.path === "/clients/1/contacts/10").at(-1)!.body).toEqual({ status: "ACTIVE" });
  });

  it("adds a relationship note with an explicit send", async () => {
    await open();
    fireEvent.click(screen.getByLabelText("Add a relationship note"));
    await settle();
    const box = screen.getByLabelText("New relationship note");
    fireEvent.change(box, { target: { value: "Call back after the board meeting." } });
    fireEvent.click(document.querySelector("[data-note-send]") as HTMLElement);
    await settle();
    const post = calls.find((c) => c.method === "POST" && c.path === "/clients/1/notes")!;
    expect(post.body).toEqual({ body: "Call back after the board meeting." });
    expect(post.headers["idempotency-key"]).toBeTruthy();
    expect(screen.getByText("Note added")).toBeTruthy();
  });

  it("changes the status from the pill with an Undo, sending the version it loaded", async () => {
    await open();
    fireEvent.click(document.querySelector("[data-status-menu]") as HTMLElement);
    await settle();
    fireEvent.click(screen.getByText("Inactive"));
    await settle();
    const patch = calls.find((c) => c.method === "PATCH" && c.path === "/clients/1")!;
    expect(patch.body).toEqual({ status: "INACTIVE" });
    expect(patch.headers["if-match"]).toBe('"1"');
    fireEvent.click(screen.getByText("Undo"));
    await settle();
    expect(calls.filter((c) => c.method === "PATCH" && c.path === "/clients/1").at(-1)!.body).toEqual({ status: "ACTIVE" });
  });
});

describe("Clients: adding", () => {
  it("adds a client with one Idempotency-Key and opens it", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-add-client]") as HTMLElement);
    await settle();
    fireEvent.change(screen.getByPlaceholderText("TechCorp Inc."), { target: { value: "Delta Logistics" } });
    fireEvent.click(document.querySelector("[data-add-submit]") as HTMLElement);
    await settle();
    const post = calls.find((c) => c.method === "POST" && c.path === "/clients")!;
    expect(post.body).toMatchObject({ name: "Delta Logistics", status: "ACTIVE" });
    expect(post.headers["idempotency-key"]).toBeTruthy();
    expect(screen.getByText("Delta Logistics was added")).toBeTruthy();
    expect(window.location.search).toContain("client=99");
  });

  it("explains a short name before sending anything", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-add-client]") as HTMLElement);
    await settle();
    fireEvent.click(document.querySelector("[data-add-submit]") as HTMLElement);
    await settle();
    expect(screen.getByText("A name needs at least 2 characters.")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("says why the API refused a duplicate", async () => {
    overrides.push((c) => (c.method === "POST" && c.path === "/clients" ? { status: 409, body: { error: "dup", code: "DUPLICATE_CLIENT" } } : undefined));
    await mount();
    fireEvent.click(document.querySelector("[data-add-client]") as HTMLElement);
    await settle();
    fireEvent.change(screen.getByPlaceholderText("TechCorp Inc."), { target: { value: "TechCorp Inc." } });
    fireEvent.click(document.querySelector("[data-add-submit]") as HTMLElement);
    await settle();
    expect(document.querySelector("[data-add-error]")?.textContent).toContain("already have a client");
  });

  it("hides every write control from someone who may only look", async () => {
    access = { canManage: false, canCreateRequirement: false };
    await mount();
    expect(document.querySelector("[data-add-client]")).toBeNull();
    fireEvent.click(document.querySelector('tr[data-row-id="1"]') as HTMLElement);
    await settle();
    await settle();
    expect(document.querySelector("[data-add-contact]")).toBeNull();
    expect(document.querySelector("[data-create-requirement]")).toBeNull();
    expect(document.querySelector("[data-status-menu]")).toBeNull();
    expect(document.querySelector("[data-edit-toggle]")).toBeNull();
  });

  it("checks the forms the same way the API does", () => {
    expect(clientProblems({ name: "x", industry: "", website: "", location: "", sizeBand: "", status: "ACTIVE", owner: "", about: "" }).name).toBeTruthy();
    expect(clientProblems({ name: "Ok Co", industry: "", website: "acme.com", location: "", sizeBand: "", status: "ACTIVE", owner: "", about: "" })).toEqual({});
    expect(clientProblems({ name: "Ok Co", industry: "", website: "not a site", location: "", sizeBand: "", status: "ACTIVE", owner: "", about: "" }).website).toBeTruthy();
    expect(contactProblems({ name: "Jo Doe", title: "", email: "jo@company.com", role: "" })).toEqual({});
    expect(contactProblems({ name: "Jo Doe", title: "", email: "nope", role: "" }).email).toBeTruthy();
    expect(contactProblems({ name: "J", title: "", email: "", role: "" }).name).toBeTruthy();
  });
});

describe("Clients: the other tabs", () => {
  it("lists every contact, requirement and happening, and opens a client from them", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: /Contacts/ }));
    await settle();
    expect(document.querySelector("[data-contacts-view]")?.textContent).toContain("Jennifer Wilson");
    expect(window.location.search).toContain("tab=contacts");
    fireEvent.click(screen.getByRole("tab", { name: /Requirements/ }));
    await settle();
    expect(document.querySelector("[data-requirements-view] a")?.getAttribute("href")).toBe("/w/admin/jobs?job=7");
    fireEvent.click(screen.getByRole("tab", { name: /Activity/ }));
    await settle();
    expect(document.querySelector("[data-activity-view]")?.textContent).toContain("Senior Frontend Engineer was posted for TechCorp Inc.");
    fireEvent.click(screen.getByText("Open TechCorp Inc."));
    await settle();
    await settle();
    expect(document.querySelector("[data-clients-list]")).toBeTruthy();
    expect(window.location.search).toContain("client=1");
    expect(window.location.search).not.toContain("tab=");
  });
});
