// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    usePathname: () => "/w/accounts/offers",
    useSearchParams: () => react.useSyncExternalStore(url.subscribe, url.get, url.get),
  };
});

import { ToastProvider } from "@kiwiply/ui";
import type { OfferCounts, OfferDetail, OfferRow, OfferState } from "@/lib/ent/offers";
import OffersPage from "./OffersPage";

type Call = { method: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined };
let calls: Call[];
let db: OfferRow[];

const rowOf = (id: number, name: string, client: string, role: string, state: OfferState, over: Partial<OfferRow> = {}): OfferRow => ({
  id,
  consultant: { id: id + 10, name, initials: name.slice(0, 2).toUpperCase() },
  clientId: id + 100,
  clientName: client,
  roleTitle: role,
  state,
  stateLabel: state.charAt(0) + state.slice(1).toLowerCase(),
  placementType: "CONTRACT",
  rateMinor: 9500,
  ratePeriod: "HOUR",
  currency: "USD",
  baseSalaryMinor: null,
  totalCompMinor: null,
  workMode: "REMOTE",
  startDate: "2026-11-01",
  endDate: null,
  termMonths: null,
  deadline: "2026-10-30",
  daysLeft: 14,
  placementId: null,
  createdAt: "2026-10-16T10:00:00Z",
  extendedAt: state === "DRAFT" ? null : "2026-10-16T10:00:00Z",
  respondedAt: null,
  sampleData: false,
  ...over,
});

const detailOf = (r: OfferRow): OfferDetail => ({
  offer: r,
  benefits: null,
  notes: "Client confirmed by phone",
  responseNote: null,
  placementNote: r.state === "ACCEPTED" ? "Link a client to this offer, then create the placement." : null,
  placement: null,
  timeline: [
    { id: 2, kind: "EXTENDED", label: "Offer extended", actorKind: "MEMBER", actorName: "Amara Silva", detail: "Recorded as received. Nothing was signed or sent by Kiwiply.", at: "2026-10-16T10:05:00Z" },
    { id: 1, kind: "DRAFTED", label: "Offer drafted", actorKind: "MEMBER", actorName: "Amara Silva", detail: null, at: "2026-10-16T10:00:00Z" },
  ],
  actions: { edit: r.state === "DRAFT" || r.state === "EXTENDED", extend: r.state === "DRAFT", withdraw: r.state === "DRAFT" || r.state === "EXTENDED", createPlacement: r.state === "ACCEPTED" },
});

const counts = (): OfferCounts => ({
  all: db.length,
  draft: db.filter((r) => r.state === "DRAFT").length,
  open: db.filter((r) => r.state === "EXTENDED" || r.state === "NEGOTIATING").length,
  accepted: db.filter((r) => r.state === "ACCEPTED").length,
  closed: 0,
  closingSoon: 1,
  placed: 2,
  closingSoonDays: 3,
});

function answer(c: Call): { status: number; body?: unknown } {
  if (c.path === "/" && c.method === "GET") {
    const tab = c.params.get("tab") ?? "open";
    const q = (c.params.get("q") ?? "").toLowerCase();
    let items = db.filter((r) => (tab === "all" ? true : tab === "draft" ? r.state === "DRAFT" : tab === "open" ? r.state === "EXTENDED" || r.state === "NEGOTIATING" : tab === "accepted" ? r.state === "ACCEPTED" : false));
    items = items.filter((r) => !q || `${r.consultant.name} ${r.clientName} ${r.roleTitle}`.toLowerCase().includes(q));
    return { status: 200, body: { items, page: 0, size: 10, total: items.length, hasNext: false } };
  }
  if (c.path === "/counts") return { status: 200, body: counts() };
  if (c.path === "/pickers") {
    const kind = c.params.get("kind");
    return { status: 200, body: { kind, items: kind === "client" ? [{ id: 101, label: "Acme Corp", sub: null }] : [{ id: 11, label: "Casey One", sub: "Engineer" }] } };
  }
  if (c.path === "/" && c.method === "POST") {
    const created = rowOf(9, "Casey One", "Acme Corp", String(c.body?.roleTitle), c.body?.extend ? "EXTENDED" : "DRAFT");
    db = [created, ...db];
    return { status: 201, body: detailOf(created) };
  }
  const one = /^\/(\d+)(\/(extend|withdraw|placement))?$/.exec(c.path);
  if (one) {
    const row = db.find((r) => r.id === Number(one[1]));
    if (!row) return { status: 404, body: { error: "Not found.", code: "NOT_FOUND" } };
    if (c.method === "GET" && !one[2]) return { status: 200, body: detailOf(row) };
    if (c.method === "POST" && one[3] === "extend") {
      row.state = "EXTENDED";
      row.stateLabel = "Extended";
      return { status: 200, body: detailOf(row) };
    }
    if (c.method === "POST" && one[3] === "withdraw") {
      row.state = "WITHDRAWN";
      row.stateLabel = "Withdrawn";
      return { status: 200, body: detailOf(row) };
    }
  }
  return { status: 404, body: { error: "no" } };
}

function stubApi() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const u = new URL(input, "http://x");
      const raw = init.body;
      const call: Call = { method: init.method ?? "GET", path: u.pathname.replace(/^\/api\/orgs\/2\/offers/, "") || "/", params: u.searchParams, body: typeof raw === "string" ? JSON.parse(raw) : undefined };
      calls.push(call);
      const r = answer(call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
    }),
  );
}

function screenSize(kind: "phone" | "tablet") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: kind === "phone" && query.includes("max-width: 767px"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const settle = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const PERMS = { "offers.manage": "ORG" };

async function mount(permissions: Record<string, string> = PERMS) {
  const out = render(
    <ToastProvider>
      <OffersPage orgId={2} orgName="Acme Corp" permissions={permissions} />
    </ToastProvider>,
  );
  await settle(0);
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
  url.set("");
  db = [
    rowOf(1, "Casey One", "Acme Corp", "Platform Engineer", "EXTENDED"),
    rowOf(2, "Robin Two", "Globex", "Data Engineer", "NEGOTIATING", { daysLeft: 2 }),
    rowOf(3, "Sam Three", "Initech", "SRE", "DRAFT", { deadline: null, daysLeft: null }),
    rowOf(4, "Pat Four", "Umbrella", "Backend Developer", "ACCEPTED", { daysLeft: null }),
  ];
  stubApi();
  screenSize("tablet");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tableRows = () => Array.from(document.querySelectorAll<HTMLElement>("tr[data-row-id]"));

/**
 * Pick a consultant and a client in the dialog. The tests run on vitest fake timers, where testing-library's findBy* queries never advance the clock
 * (they wait on real timers and hang until the test timeout), so the clock is advanced with settle() and the options are read with getByRole.
 */
async function pickConsultantAndClient() {
  const dialog = (document.querySelector('[role="dialog"]') ?? document.body) as HTMLElement;
  fireEvent.click(within(dialog).getByRole("button", { name: "Consultant" }));
  await settle(0);
  fireEvent.click(screen.getByRole("option", { name: "Casey One" }));
  await settle(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Client" }));
  await settle(0);
  fireEvent.click(screen.getByRole("option", { name: "Acme Corp" }));
  await settle(0);
}

describe("the Accounts Offers page", () => {
  it("draws the four tiles from the counts and the open offers with their state", async () => {
    await mount();
    expect(Array.from(document.querySelectorAll("[data-tile]")).map((e) => e.getAttribute("data-tile"))).toEqual(["open", "soon", "accepted", "placed"]);
    expect(document.querySelector("[data-tile=open] [data-tile-value]")?.textContent).toBe("2");
    expect(document.querySelector("[data-tile=placed] [data-tile-value]")?.textContent).toBe("2");
    expect(tableRows().map((r) => r.getAttribute("data-row-id"))).toEqual(["1", "2"]);
    expect(tableRows()[0].querySelector("[data-offer-state]")?.textContent).toBe("Extended");
    expect(tableRows()[0].textContent).toContain("$95/hr");
    expect(screen.getByRole("tab", { name: "Drafts (1)" })).toBeTruthy();
  });

  it("switches tab through the URL and searches only from two characters", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Drafts (1)" }));
    await settle();
    expect(url.get().get("tab")).toBe("draft");
    expect(tableRows().map((r) => r.getAttribute("data-row-id"))).toEqual(["3"]);
  });

  it("opens an offer in the drawer: the consent line, the timeline, and no accept or decline control", async () => {
    await mount();
    fireEvent.click(tableRows()[0]);
    await settle();
    const detail = document.querySelector("[data-offer-detail]") as HTMLElement;
    expect(detail).toBeTruthy();
    expect(within(detail).getByText(/Only Casey can accept or decline this offer/)).toBeTruthy();
    expect(within(detail).getByText(/Nothing is signed or sent from here/)).toBeTruthy();
    expect(within(detail).getByText("Offer extended")).toBeTruthy();
    expect(within(detail).getByText("Offer drafted")).toBeTruthy();
    expect(within(detail).queryByRole("button", { name: /accept|decline/i })).toBeNull();
    expect(within(detail).getByRole("button", { name: "Withdraw" })).toBeTruthy();
  });

  it("records a draft as extended from the drawer", async () => {
    url.set("tab=draft&of=3");
    await mount();
    await settle();
    const extend = document.querySelector("[data-action=extend]") as HTMLElement;
    expect(extend).toBeTruthy();
    await act(async () => {
      fireEvent.click(extend);
    });
    await settle();
    expect(calls.some((c) => c.method === "POST" && c.path === "/3/extend")).toBe(true);
    expect(db[2].state).toBe("EXTENDED");
  });

  it("an accepted offer without a placement offers to create it", async () => {
    url.set("tab=accepted&of=4");
    await mount();
    await settle();
    expect(document.querySelector("[data-offer-placement]")?.textContent).toContain("Link a client");
    expect(document.querySelector("[data-action=placement]")).toBeTruthy();
  });

  it("records an offer: needs consultant, client and role; sends plain numbers and no signing", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-record-offer]") as HTMLElement);
    await settle();
    const submit = document.querySelector("[data-offer-submit]") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await pickConsultantAndClient();
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Cloud Architect" } });
    fireEvent.change(screen.getByLabelText("Rate"), { target: { value: "95.50" } });
    expect(submit.disabled).toBe(false);
    expect(screen.getByText(/Nothing is signed or sent from here, and no money moves/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(submit);
    });
    await settle();
    const post = calls.find((c) => c.method === "POST" && c.path === "/");
    expect(post?.body).toMatchObject({ consultantId: 11, clientId: 101, roleTitle: "Cloud Architect", rateMinor: 9550, ratePeriod: "HOUR", currency: "USD", extend: false });
    expect(JSON.stringify(post?.body)).not.toMatch(/bank|ssn|tax/i);
  });

  it("asking to record it as extended needs a start date", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-record-offer]") as HTMLElement);
    await settle();
    await pickConsultantAndClient();
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Cloud Architect" } });
    fireEvent.click(document.querySelector("[data-offer-extend]") as HTMLElement);
    expect((document.querySelector("[data-offer-submit]") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-11-15" } });
    expect((document.querySelector("[data-offer-submit]") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a member without offers.manage sees the offers but no Record an offer button", async () => {
    await mount({});
    expect(document.querySelector("[data-record-offer]")).toBeNull();
    expect(tableRows()).toHaveLength(2);
  });

  it("shows an empty state for a search with no match", async () => {
    url.set("q=zzzz");
    await mount();
    expect(screen.getByText("No offers match that search")).toBeTruthy();
  });

  it("shows cards instead of a table on a phone", async () => {
    screenSize("phone");
    await mount();
    expect(document.querySelector("[data-offers-table]")).toBeNull();
    const cards = Array.from(document.querySelectorAll("[data-offer-cards] li"));
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Casey One");
    expect(cards[0].textContent).toContain("Answer due in 14 days");
  });

  it("shows an error state when the list cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ message: "boom" }) }) as Response),
    );
    await mount();
    expect(screen.getByText(/boom/)).toBeTruthy();
  });
});
