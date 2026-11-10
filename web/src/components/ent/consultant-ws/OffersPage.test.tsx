// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/offers" }));

import { ToastProvider } from "@kiwiply/ui";
import OffersPage from "./OffersPage";

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const D = 86_400_000;
const day = (n: number) => new Date(NOW + n * D).toISOString().slice(0, 10);
const tile = (value: number, deltaPct: number | null = null) => ({ value, previous: 1, deltaPct, sparkline: [0, 1, 2, 3, 4, value], vs: "month" });
const r = (o: Record<string, unknown>) => ({
  id: 1, company: "CloudWave", role: "Senior Software Engineer", packageSummary: "$145K base + 15% bonus + equity", workMode: "REMOTE", startDate: day(90), offerDeadline: day(5), daysLeft: 5,
  status: "PENDING_REVIEW", baseSalaryMinor: 14_500_000, totalCompMinor: 16_675_000, currency: "USD", respondedAt: null, createdAt: iso(-D), sample: true, ...o,
});
const rows = () => [
  r({ id: 1 }),
  r({ id: 2, company: "InnovateTech", role: "Full Stack Developer", workMode: "HYBRID", status: "NEGOTIATION", daysLeft: 8, baseSalaryMinor: 13_000_000, totalCompMinor: 14_300_000 }),
  r({ id: 3, company: "FinServe Inc.", role: "Data Engineer", daysLeft: 12, baseSalaryMinor: 12_500_000, totalCompMinor: 13_750_000 }),
  r({ id: 4, company: "GlobalTech", role: "DevOps Engineer", workMode: "ONSITE", status: "DECLINED", daysLeft: null, baseSalaryMinor: 11_800_000, totalCompMinor: 12_980_000 }),
];
let current: Record<string, unknown>;
let calls: { method: string; url: string; body?: unknown }[];
let postStatus = 200;
let postBody: unknown = {};

const view = () => ({
  orgId: 2, generatedAt: iso(0), name: "Anika Rao",
  tiles: { total: tile(4, 300), pending: tile(2), accepted: tile(0), negotiation: tile(1, 0), declined: tile(1) },
  offers: { items: rows(), page: 0, size: 10, total: 4, totalPages: 1 },
  compare: rows(),
  activity: [
    { offerId: 1, kind: "RECEIVED", label: "New offer received", company: "CloudWave", role: "Senior Software Engineer", occurredAt: iso(-2 * 3_600_000) },
    { offerId: 4, kind: "DECLINED", label: "Offer declined", company: "GlobalTech", role: "DevOps Engineer", occurredAt: iso(-5 * D) },
  ],
  companies: ["CloudWave", "FinServe Inc.", "GlobalTech", "InnovateTech"],
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
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method === "POST") return json(postBody, postStatus);
      if (/offers\/list/.test(url)) return json({ items: [r({ id: 3, company: "FinServe Inc.", role: "Data Engineer" })], page: 0, size: 10, total: 1, totalPages: 1 });
      const d = /offers\/(\d+)$/.exec(url);
      if (d) {
        const id = Number(d[1]);
        const row = rows().find((x) => x.id === id) ?? r({ id });
        const open = row.status === "PENDING_REVIEW" || row.status === "NEGOTIATION";
        return json({ row, benefitsSummary: "Health, dental and 25 days off.", responseNote: null, events: [{ kind: "RECEIVED", label: "New offer received", occurredAt: iso(-D) }], canRespond: open, canNegotiate: row.status === "PENDING_REVIEW" });
      }
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
      <OffersPage orgId={2} firstName="Anika Rao" />
    </ToastProvider>,
  );
  await flush();
}
const tileOf = (k: string) => document.querySelector(`[data-stat-tile="${k}"]`) as HTMLElement;
const rowOf = (id: number) => document.querySelector(`tr[data-offer="${id}"]`) as HTMLElement;

describe("Offers from real data", () => {
  it("draws the tiles, the offers table, the compare table and the activity", async () => {
    await mount();
    expect(calls[0]).toEqual({ method: "GET", url: "/api/orgs/2/me-workspace/offers", body: undefined });
    expect(document.querySelector("[data-consultant-offers]")?.getAttribute("data-status")).toBe("ready");
    expect(within(tileOf("total")).getByText("4")).toBeTruthy();
    expect(within(tileOf("total")).getByText(/300%/)).toBeTruthy();
    expect(within(tileOf("negotiation")).getByText(/no change/)).toBeTruthy();
    expect(within(tileOf("pending")).queryByText(/vs last month/)).toBeNull(); // no delta from the API: none is made up
    expect(screen.getByRole("heading", { name: "Your Offers (4)" })).toBeTruthy();
    expect(within(rowOf(1)).getByText("Remote")).toBeTruthy();
    expect(within(rowOf(1)).getByText("(5 days left)")).toBeTruthy();
    expect(within(rowOf(2)).getByText("Negotiation")).toBeTruthy();
    expect(within(rowOf(4)).getByText("Declined")).toBeTruthy();
    expect(within(rowOf(4)).queryByText(/days left/)).toBeNull();
    expect(screen.getByText("New offer received")).toBeTruthy();
    expect(screen.getByText("Offer declined")).toBeTruthy();
    expect(screen.getAllByText("Sample").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Compare Selected (0)" }).hasAttribute("disabled")).toBe(true);
  });

  it("filters, search and sort ask the API", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "NEGOTIATION" } });
    await flush();
    expect(calls.some((c) => /offers\/list\?status=NEGOTIATION&page=0&size=10/.test(c.url))).toBe(true);
    fireEvent.change(screen.getByLabelText("Filter by company"), { target: { value: "GlobalTech" } });
    await flush();
    expect(calls.some((c) => /status=NEGOTIATION&company=GlobalTech/.test(c.url))).toBe(true);
    fireEvent.change(screen.getByLabelText("Filter by work mode"), { target: { value: "REMOTE" } });
    await flush();
    expect(calls.some((c) => /workMode=REMOTE/.test(c.url))).toBe(true);
    fireEvent.change(screen.getByLabelText("Sort offers"), { target: { value: "deadline" } });
    await flush();
    expect(calls.some((c) => /sort=deadline/.test(c.url))).toBe(true);
    fireEvent.change(screen.getByLabelText("Search offers"), { target: { value: "data" } });
    await act(async () => void (await new Promise((res) => setTimeout(res, 450))));
    expect(calls.some((c) => /q=data/.test(c.url))).toBe(true);
  });

  it("compares up to three offers side by side from minor units", async () => {
    await mount();
    for (const id of [1, 2]) fireEvent.click(within(rowOf(id)).getByRole("checkbox"));
    const btn = screen.getByRole("button", { name: "Compare Selected (2)" });
    expect(btn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(btn);
    const result = document.querySelector("[data-compare-result]") as HTMLElement;
    expect(within(result).getByText("$145,000")).toBeTruthy();
    expect(within(result).getByText("$166,750")).toBeTruthy();
    expect(within(result).getByText("$130,000")).toBeTruthy();
    expect(within(result).getByText("$143,000")).toBeTruthy();
    fireEvent.click(within(rowOf(3)).getByRole("checkbox"));
    fireEvent.click(within(rowOf(4)).getByRole("checkbox")); // the fourth is refused
    expect(document.querySelector("[data-compare-notice]")!.textContent).toMatch(/up to 3 offers/);
    expect(screen.getByRole("button", { name: "Compare Selected (3)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(document.querySelector("[data-compare-result]")).toBeNull();
  });

  it("View opens the sheet with the benefits, the timeline and the three responses", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "View Senior Software Engineer at CloudWave" }));
    await flush();
    expect(calls.map((c) => c.url)).toContain("/api/orgs/2/me-workspace/offers/1");
    expect(screen.getByText("Health, dental and 25 days off.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept Offer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Negotiate" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  });

  it("a closed offer's sheet offers no response", async () => {
    await mount();
    fireEvent.click(within(rowOf(4)).getByRole("button", { name: "View DevOps Engineer at GlobalTech" }));
    await flush();
    expect(screen.queryByRole("button", { name: "Accept Offer" })).toBeNull();
  });

  it("accepting says nothing is signed or sent, posts once and reloads", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "View Senior Software Engineer at CloudWave" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Accept Offer" }));
    expect(screen.getByText(/Nothing is signed or sent to the client from here/)).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Yes, accept offer" }));
    await flush();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/orgs/2/me-workspace/offers/1/accept"]);
    expect(calls.filter((c) => c.method === "GET" && c.url.endsWith("/offers")).length).toBeGreaterThan(1);
  });

  it("a 409 shows the API message and reloads", async () => {
    await mount();
    postStatus = 409;
    postBody = { error: "You already accepted this offer.", code: "OFFER_NOT_OPEN" };
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "View Senior Software Engineer at CloudWave" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Accept Offer" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, accept offer" }));
    await flush();
    expect(document.querySelector("[data-notice]")!.textContent).toContain("already accepted");
  });

  it("negotiate needs a note of 3 characters; decline may go without one", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "View Senior Software Engineer at CloudWave" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Negotiate" }));
    fireEvent.change(screen.getByLabelText("What you would like to negotiate"), { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await flush();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.change(screen.getByLabelText("What you would like to negotiate"), { target: { value: "Talk about base salary" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await flush();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: "/api/orgs/2/me-workspace/offers/1/negotiate", body: { note: "Talk about base salary" } });

    calls.length = 0;
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: "View Data Engineer at FinServe Inc." }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline offer" }));
    await flush();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: "/api/orgs/2/me-workspace/offers/3/decline", body: { reason: "" } });
  });

  it("says so when there are no offers", async () => {
    current = {
      ...view(),
      tiles: { total: tile(0), pending: tile(0), accepted: tile(0), negotiation: tile(0), declined: tile(0) },
      offers: { items: [], page: 0, size: 10, total: 0, totalPages: 0 },
      compare: [], activity: [], companies: [],
    };
    await mount();
    expect(screen.getByText(/No offers yet/)).toBeTruthy();
    expect(screen.getByText(/Nothing to compare yet/)).toBeTruthy();
    expect(screen.getByText(/No activity yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Respond to Offer Accept, negotiate or decline" }).hasAttribute("disabled")).toBe(true);
  });
});
