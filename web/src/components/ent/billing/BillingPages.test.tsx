// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SubscriptionOverviewPage from "./SubscriptionOverviewPage";
import BillingPage from "./BillingPage";
import UsagePage from "./UsagePage";

const setupOverview = {
  orgName: "Aaruna",
  status: "SETUP",
  billingConnected: false,
  currency: "USD",
  tiles: { consultants: 3, licensed: 2, unlicensed: 1 },
  monthlyRecurringMinor: null,
  priceSet: false,
  nextInvoiceOn: null,
  nextInvoiceEstimateMinor: null,
  estimate: true,
  ending: [{ consultantId: 21, name: "Anika Rao", what: "Licence", endsAt: "2026-11-30T00:00:00Z" }],
  contract: null,
  overdue: null,
  taxNote: "Taxes aren't calculated yet.",
};
const billing = {
  orgName: "Acme",
  status: "ACTIVE",
  billingConnected: false,
  account: { status: "ACTIVE", currency: "USD", collectionMethod: "SEND_INVOICE", billingCycle: "MONTH", periodStart: "2026-11-01", periodEnd: "2026-11-30", nextInvoiceOn: "2026-12-01", paidThroughOn: "2026-11-30", source: "LOCAL" },
  paymentMethod: { kind: "CARD", brand: "visa", last4: "4242", expMonth: 4, expYear: 2029 },
  contract: { name: "Acme 2026", reference: "AC-26", status: "ACTIVE", startsAt: "2026-01-01T00:00:00Z", endsAt: null, billingInterval: "MONTH" },
  taxNote: "Taxes aren't calculated yet.",
};
const invoices = {
  rows: [{ id: 41, number: "ACME-0041", kind: "RECURRING", periodStart: "2026-10-01", periodEnd: "2026-10-31", issueDate: "2026-11-01", dueDate: "2026-11-05", status: "OPEN", amountMinor: 127449, amountPaidMinor: 0, currency: "USD", estimate: true, overdue: true }],
  page: 0,
  size: 25,
  total: 1,
};
const invoice = {
  invoice: invoices.rows[0],
  description: "October",
  lines: [{ kind: "BASE_LICENSE", description: "Base licence", detail: null, quantity: 3, unitAmountMinor: 1499, amountMinor: 4497 }],
  payments: [],
};
const usage = {
  period: "2026-11",
  current: true,
  resetsOn: "2026-12-01",
  consultants: [{ consultantId: 21, name: "Anika Rao", aiBudgetPercent: 42, matchViews: 7, prepSessions: 2, applications: 3, counters: [] }],
  features: [{ key: "match_views", label: "Job-match views", used: 7, allowance: null, consultants: 1 }],
};
const history = { months: [{ period: "2026-10", matchViews: 1, prepSessions: 0, applications: 0, counted: 0 }, { period: "2026-11", matchViews: 7, prepSessions: 2, applications: 3, counted: 0 }] };

let urls: string[];
let overview: unknown;
beforeEach(() => {
  urls = [];
  overview = setupOverview;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      let json: unknown = {};
      if (url.endsWith("/billing/overview")) json = overview;
      else if (url.endsWith("/billing")) json = billing;
      else if (url.includes("/billing/invoices/41")) json = invoice;
      else if (url.includes("/billing/invoices")) json = invoices;
      else if (url.includes("/usage/history")) json = history;
      else if (url.includes("/usage")) json = usage;
      return { ok: true, status: 200, json: async () => json } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {});

/** ORG-BILLING-BUILD.md step 1a: the three billing pages draw the API's answer and never invent money. */
describe("Subscription Overview", () => {
  it("says billing is being set up, counts licences and shows 'Price not set' instead of $0", async () => {
    render(<SubscriptionOverviewPage orgId={2} />);
    await settle();
    expect(urls[0]).toBe("/api/orgs/2/billing/overview");
    expect(document.querySelector("[data-billing-setup]")?.textContent).toMatch(/nothing is billed yet/);
    expect(document.querySelector("[data-billing-recurring]")?.textContent).toBe("Price not set");
    expect(screen.getByText(/Licence ends · Anika Rao/)).toBeTruthy();
    expect(document.querySelector("[data-billing-next]")?.textContent).toMatch(/billing isn't connected/);
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("an overdue invoice shows the warning and the recurring amount is money", async () => {
    overview = { ...setupOverview, status: "PAST_DUE", monthlyRecurringMinor: 127449, priceSet: true, nextInvoiceOn: "2026-12-01", nextInvoiceEstimateMinor: 127449, overdue: { invoices: 1, amountMinor: 5000, oldestDueOn: "2026-11-05" } };
    render(<SubscriptionOverviewPage orgId={2} />);
    await settle();
    expect(screen.getByRole("alert").textContent).toMatch(/One invoice is overdue: \$50\.00, due since Nov 5, 2026/);
    expect(document.querySelector("[data-billing-recurring]")?.textContent).toBe("$1,274.49 / month");
    expect(document.querySelector("[data-billing-next]")?.textContent).toMatch(/~\$1,274\.49/);
  });
});

describe("Billing & Invoices", () => {
  it("shows the account, only brand and last 4 of the card, and a disabled portal until Stripe is connected", async () => {
    render(<BillingPage orgId={2} />);
    await settle();
    expect(screen.getByText("An invoice each period, paid within 15 days")).toBeTruthy();
    expect(screen.getByText("Visa ending 4242, expires 04/2029")).toBeTruthy();
    const portal = document.querySelector<HTMLButtonElement>("[data-billing-portal]")!;
    expect(portal.disabled).toBe(true);
    expect(portal.textContent).toBe("Billing isn't connected yet");
  });

  it("lists invoices as estimates, marks an overdue one and opens its lines", async () => {
    render(<BillingPage orgId={2} />);
    await settle();
    fireEvent.click(screen.getByRole("tab", { name: "Invoices" }));
    await settle();
    expect(urls).toContain("/api/orgs/2/billing/invoices?page=0");
    expect(screen.getByText(/Issued Nov 1, 2026 · Estimate/)).toBeTruthy();
    expect(screen.getByText("Overdue since Nov 5, 2026")).toBeTruthy();
    fireEvent.click(document.querySelector("[data-invoice-open='41']")!);
    await settle();
    expect(document.querySelector("[data-invoice-lines]")?.textContent).toMatch(/Base licence · 3 × \$14\.99\$44\.97/);
  });

  it("the contract tab names the contract", async () => {
    render(<BillingPage orgId={2} />);
    await settle();
    fireEvent.click(screen.getByRole("tab", { name: "Contract" }));
    expect(screen.getByText("Acme 2026")).toBeTruthy();
    expect(screen.getByText("No end date")).toBeTruthy();
  });
});

describe("Feature Usage", () => {
  it("shows each consultant's real counts and the AI budget as a percent, then the history", async () => {
    render(<UsagePage orgId={2} now={new Date("2026-11-11T10:00:00Z")} />);
    await settle();
    expect(urls[0]).toBe("/api/orgs/2/usage?period=2026-11");
    const row = document.querySelector("[data-usage-row='21']")!;
    expect(row.textContent).toMatch(/42% used/);
    expect(row.textContent).toMatch(/7/);
    expect(row.textContent).not.toMatch(/\$/);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    await settle();
    expect(urls).toContain("/api/orgs/2/usage/history?months=6");
    expect(document.querySelector("[data-usage-history]")?.textContent).toMatch(/November 2026/);
  });

  it("another month is asked for by its period", async () => {
    render(<UsagePage orgId={2} now={new Date("2026-11-11T10:00:00Z")} />);
    await settle();
    fireEvent.click(screen.getByLabelText("Month"));
    fireEvent.click(screen.getByRole("option", { name: "October 2026" }));
    await settle();
    expect(urls).toContain("/api/orgs/2/usage?period=2026-10");
  });
});
