// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReqRow } from "@/lib/ent/accounts-ws/requirements";
import AccountsHomePage from "./AccountsHomePage";
import { accountsPage } from "../registry";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/accounts" }));

const row = (id: number, title: string, client: string, over: Partial<ReqRow> = {}): ReqRow => ({
  id, title, client: { id: 1, name: client }, location: null, workMode: null, priority: "HIGH", status: "OPEN", positions: 1, filled: 0, rate: null, skills: [], dueOn: null,
  postedAt: "2026-09-20T10:00:00Z", ageDays: 26, consultantCount: 0, source: "MANUAL", ...over,
});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let urls: string[];
let summaryStatus: number;
let withoutRows: ReqRow[];
let agingRows: ReqRow[];

beforeEach(() => {
  urls = [];
  summaryStatus = 200;
  withoutRows = [row(1, "Senior Frontend Engineer", "Alpha Corp", { dueOn: "2026-12-31" }), row(2, "ML Engineer", "Beta Health", { priority: "LOW" })];
  agingRows = [row(1, "Senior Frontend Engineer", "Alpha Corp")];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const u = new URL(url, "http://web.test");
      if (u.pathname.endsWith("/summary")) {
        return summaryStatus === 200
          ? reply(200, { open: 7, unassigned: 2, aging: 1, onHold: 0, contacts: 12, agingDays: 14, asOf: "", clientOptions: [], access: { canCreate: true, canEdit: true, canAssign: true } })
          : reply(summaryStatus, { error: "x" });
      }
      const list = u.searchParams.get("aging") === "true" ? agingRows : withoutRows;
      return reply(200, { items: list, page: 0, size: 5, total: list.length, hasNext: false });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = () => render(<AccountsHomePage orgId={2} orgName="Acme" firstName="Amara" hrefs={{ requirements: "/w/accounts/requirements", contacts: "/w/accounts/contacts" }} />);

describe("AccountsHomePage", () => {
  it("draws the four tiles from real queries and links them to the pages", async () => {
    mount();
    await screen.findByText("Waiting for a consultant");
    const tile = (id: string) => document.querySelector(`[data-stat-tile="${id}"]`) as HTMLElement;
    await waitFor(() => expect(within(tile("open")).getByText("7")).toBeTruthy());
    expect(within(tile("unassigned")).getByText("2")).toBeTruthy();
    expect(within(tile("aging")).getByText("1")).toBeTruthy();
    expect(tile("aging").textContent).toContain("Aging (14+ days)");
    expect(within(tile("contacts")).getByText("12")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Client contacts: open" }).getAttribute("href")).toBe("/w/accounts/contacts");
    expect(screen.getByRole("link", { name: "Open requirements: open" }).getAttribute("href")).toBe("/w/accounts/requirements");
  });

  it("lists the requirements nobody has, and the ones open the longest", async () => {
    mount();
    await screen.findByText("ML Engineer");
    const without = document.querySelector('[data-home-card="without"]') as HTMLElement;
    expect(within(without).getByText("Senior Frontend Engineer")).toBeTruthy();
    expect(within(without).getByText(/needed by Dec 31, 2026/)).toBeTruthy();
    const aging = document.querySelector('[data-home-card="aging"]') as HTMLElement;
    expect(aging.querySelectorAll("[data-home-row]")).toHaveLength(1);
    expect(urls.some((u) => u.includes("assigned=NONE") && u.includes("status=OPEN"))).toBe(true);
    expect(urls.some((u) => u.includes("aging=true"))).toBe(true);
  });

  it("says so when there is nothing to show, never a made-up row", async () => {
    withoutRows = [];
    agingRows = [];
    mount();
    expect(await screen.findByText("Every open requirement has a consultant. Nice.")).toBeTruthy();
    expect(screen.getByText("Nothing has been open for 14 days or more.")).toBeTruthy();
    expect(document.querySelectorAll("[data-home-row]")).toHaveLength(0);
  });

  it("shows an error with Try again, and 'isn't part of your role' for a caller the API does not know", async () => {
    summaryStatus = 500;
    mount();
    expect(await screen.findByText(/didn't load/)).toBeTruthy();
    summaryStatus = 200;
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText("Waiting for a consultant")).toBeTruthy();
    cleanup();
    summaryStatus = 404;
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
  });
});

describe("the Accounts registry", () => {
  const props = { orgId: 2, orgName: "Acme", firstName: "Amara", hrefs: {} };

  it("builds Home, Contacts and Requirements, and leaves Submissions and Offers to their own pages", () => {
    expect(accountsPage([], props)).not.toBeNull();
    expect(accountsPage(["contacts"], props)).not.toBeNull();
    expect(accountsPage(["requirements"], props)).not.toBeNull();
    expect(accountsPage(["submissions"], props)).toBeNull();
    expect(accountsPage(["offers"], props)).toBeNull();
    expect(accountsPage(["requirements", "9"], props)).toBeNull();
  });
});
