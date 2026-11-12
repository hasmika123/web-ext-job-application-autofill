// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import LicensesPage from "./LicensesPage";

const catalog = {
  currency: "USD",
  basePriceMinor: null,
  billingConnected: false,
  addOns: [
    { key: "ai.resume_tailoring", name: "AI resume tailoring", description: "Tailor a resume to a posting.", priceMinor: null, usesAi: true },
    { key: "inbox.monitoring", name: "Inbox monitoring", description: "Track applications from Gmail.", priceMinor: null, usesAi: true },
  ],
};
const anika = { consultantId: 21, name: "Anika Rao", email: "anika@aaruna.test", signInLinked: true, status: "NONE", features: [], monthlyMinor: null, priceSet: false, since: null, endsAt: null, suspendReason: null };
const vikram = { ...anika, consultantId: 22, name: "Vikram Iyer", email: "vikram@aaruna.test", status: "ACTIVE", features: ["inbox.monitoring"] };
const meera = { ...anika, consultantId: 23, name: "Meera Shah", email: "meera@aaruna.test", status: "ACTIVE", features: ["inbox.monitoring"], endingFeatures: ["inbox.monitoring"], monthlyMinor: 2399, priceSet: true };
const giveQuote = {
  id: 7,
  consultantId: 21,
  consultantName: "Anika Rao",
  status: "OPEN",
  currency: "USD",
  lines: [
    { op: "CREATE", featureKey: null, name: "Base licence", monthlyMinor: null, dueNowMinor: null, effectiveAt: "2026-11-10T12:00:00Z" },
    { op: "ADD_FEATURE", featureKey: "ai.resume_tailoring", name: "AI resume tailoring", monthlyMinor: null, dueNowMinor: null, effectiveAt: "2026-11-10T12:00:00Z" },
  ],
  totals: { currentMonthlyMinor: null, proposedMonthlyMinor: null, deltaMinor: null, dueNowMinor: null, priceSet: false, periodLastDay: null },
  billingConnected: false,
  expiresAt: "2026-11-10T12:15:00Z",
};

let calls: { url: string; method: string; body: unknown; key?: string }[];
let rows: unknown[];
beforeEach(() => {
  calls = [];
  rows = [anika, vikram, meera];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, key: (init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"] } as (typeof calls)[number]);
      let json: unknown = {};
      if (url.endsWith("/licenses/catalog")) json = catalog;
      else if (url.endsWith("/licenses")) json = rows;
      else if (method === "POST" && url.endsWith("/licenses/quotes")) json = giveQuote;
      else if (method === "POST" && url.endsWith("/quotes/7/confirm")) json = { row: { ...anika, status: "ACTIVE", features: ["ai.resume_tailoring"] }, history: [{ kind: "CREATE", featureKey: null, summary: "gave a licence", at: "2026-11-10T12:00:00Z", actorMemberId: 5 }], scheduled: [] };
      else if (method === "DELETE" && url.endsWith("/changes/55")) json = { row: { ...meera, endingFeatures: [] }, history: [], scheduled: [] };
      else if (method === "GET" && url.endsWith("/23")) json = { row: meera, history: [], scheduled: [{ changeId: 55, featureKey: "inbox.monitoring", name: "Inbox monitoring", effectiveAt: "2026-12-01T00:00:00Z" }] };
      else if (method === "GET") json = { row: url.endsWith("/21") ? anika : vikram, history: [] };
      else json = { row: vikram, history: [] };
      return { ok: true, status: 200, json: async () => json } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {});
const mount = (canManage = true) =>
  render(
    <ToastProvider>
      <LicensesPage orgId={2} canManage={canManage} />
    </ToastProvider>,
  );

describe("Consultant Licenses (L4)", () => {
  it("lists every consultant with their licence, add-ons and the honest price line", async () => {
    mount();
    await settle();
    const table = screen.getByRole("table", { name: "Consultant licences" });
    expect(within(table).getByText("Anika Rao")).toBeTruthy();
    expect(within(table).getByText("No licence")).toBeTruthy();
    expect(within(table).getAllByText("Inbox monitoring").length).toBe(2);
    expect(within(table).getAllByText("Price not set").length).toBe(1); // only the licensed rows have a price cell (Meera has a price)
    expect(screen.getByText(/Nothing is billed yet/)).toBeTruthy();
  });

  it("gives a licence only after the priced review is confirmed", async () => {
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Give licence" }));
    await settle();
    const sheet = document.querySelector("[data-license-sheet='21']") as HTMLElement;
    expect(sheet).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("switch", { name: "AI resume tailoring" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Review licence" }));
    await settle();
    const quote = calls.find((c) => c.method === "POST" && c.url === "/api/orgs/2/licenses/quotes");
    expect(quote?.body).toEqual({ consultantId: 21, features: ["ai.resume_tailoring"] });
    expect(calls.some((c) => c.url.endsWith("/confirm"))).toBe(false);
    const summary = document.querySelector("[data-quote-summary='7']") as HTMLElement;
    expect(summary.textContent).toMatch(/Give the base licence/);
    expect(summary.textContent).toMatch(/Add AI resume tailoring/);
    expect(document.querySelector("[data-quote-monthly]")?.textContent).toBe("Price not set");
    expect(summary.textContent).toMatch(/Nothing is billed yet/);
    expect(summary.textContent).not.toMatch(/\$0/);

    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm licence" }));
    await settle();
    const confirm = calls.find((c) => c.method === "POST" && c.url === "/api/orgs/2/licenses/quotes/7/confirm");
    expect(confirm?.key).toBeTruthy();
    expect(within(screen.getByRole("table", { name: "Consultant licences" })).getByText("AI resume tailoring")).toBeTruthy();
  });

  it("an add-on whose removal waits for the period end is marked, and Keep undoes it", async () => {
    mount();
    await settle();
    const row = document.querySelector("[data-license-row='23']") as HTMLElement;
    expect(row.querySelector("[data-feature-chip]")?.getAttribute("data-feature-chip")).toBe("pending-removal");
    expect(row.textContent).toMatch(/stops when the period ends/);
    fireEvent.click(within(row).getByRole("button", { name: "Configure" }));
    await settle();
    const sheet = document.querySelector("[data-license-sheet='23']") as HTMLElement;
    expect(within(sheet).getByText("Inbox monitoring stops on Dec 1, 2026")).toBeTruthy();
    expect((within(sheet).getByRole("switch", { name: "Inbox monitoring" }) as HTMLElement).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(within(sheet).getByRole("button", { name: "Keep Inbox monitoring" }));
    await settle();
    expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/orgs/2/licenses/changes/55")).toBe(true);
    expect(document.querySelector("[data-license-scheduled]")).toBeNull();
  });

  it("filters to the consultants without a licence", async () => {
    mount();
    await settle();
    fireEvent.change(screen.getByLabelText("Search consultants"), { target: { value: "vikram" } });
    expect(screen.queryByText("Anika Rao")).toBeNull();
    expect(screen.getByText("Vikram Iyer")).toBeTruthy();
  });

  it("a member who may only view sees no way to give a licence", async () => {
    mount(false);
    await settle();
    expect(screen.queryByRole("button", { name: "Give licence" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "View" }).length).toBe(2);
  });
});
