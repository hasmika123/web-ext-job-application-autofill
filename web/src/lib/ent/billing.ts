/**
 * Organization billing pages, read-only (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a): the contract of `/api/orgs/{orgId}/billing/**` and
 * `/api/orgs/{orgId}/usage/**`, and the small pure helpers the Subscription, Billing & Invoices and Feature Usage pages draw with. Money is formatted
 * from `*Minor` fields only; the web never adds two prices. Until Stripe is connected (step 2) every organization reads as SETUP: nothing is billed.
 */

export type BillingStatus = "SETUP" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED" | string;

export interface Tiles {
  consultants: number;
  licensed: number;
  unlicensed: number;
}

export interface Ending {
  consultantId: number;
  name: string;
  what: string;
  endsAt: string;
}

export interface ContractSummary {
  name: string | null;
  reference: string | null;
  status: string | null;
  startsAt: string | null;
  endsAt: string | null;
  billingInterval: string | null;
}

export interface Overdue {
  invoices: number;
  amountMinor: number;
  oldestDueOn: string | null;
}

export interface Overview {
  orgName: string;
  status: BillingStatus;
  billingConnected: boolean;
  currency: string;
  tiles: Tiles;
  monthlyRecurringMinor: number | null;
  priceSet: boolean;
  nextInvoiceOn: string | null;
  nextInvoiceEstimateMinor: number | null;
  estimate: boolean;
  ending: Ending[];
  contract: ContractSummary | null;
  overdue: Overdue | null;
  taxNote: string;
}

export interface Account {
  status: string;
  currency: string;
  collectionMethod: string;
  billingCycle: string;
  periodStart: string | null;
  periodEnd: string | null;
  nextInvoiceOn: string | null;
  paidThroughOn: string | null;
  source: string;
  /** Step 2: where invoices go, and the setup fee (WAIVED, OWED, ADDED, PAID; amount null = price not set). */
  billingEmail?: string | null;
  setupFeeStatus?: string | null;
  setupFeeAmountMinor?: number | null;
}

export interface PaymentMethod {
  kind: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export interface Billing {
  orgName: string;
  status: BillingStatus;
  billingConnected: boolean;
  account: Account | null;
  paymentMethod: PaymentMethod | null;
  contract: ContractSummary | null;
  taxNote: string;
}

export interface InvoiceRow {
  id: number;
  number: string;
  kind: string;
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string | null;
  dueDate: string | null;
  status: string;
  amountMinor: number;
  amountPaidMinor: number;
  currency: string;
  estimate: boolean;
  overdue: boolean;
  /** Step 3a: Stripe's page to pay this open invoice; null otherwise. */
  payUrl?: string | null;
}

export interface InvoicePage {
  rows: InvoiceRow[];
  page: number;
  size: number;
  total: number;
}

export interface InvoiceLine {
  kind: string;
  description: string;
  detail: string | null;
  quantity: number;
  unitAmountMinor: number | null;
  amountMinor: number;
}

export interface InvoicePayment {
  amountMinor: number;
  currency: string;
  status: string;
  kind: string;
  occurredAt: string | null;
  failureReason: string | null;
}

export interface InvoiceDetail {
  invoice: InvoiceRow;
  description: string | null;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
}

export interface Counter {
  featureKey: string;
  label: string;
  used: number;
  allowance: number | null;
}

export interface ConsultantUsage {
  consultantId: number;
  name: string;
  aiBudgetPercent: number | null;
  matchViews: number;
  prepSessions: number;
  applications: number;
  counters: Counter[];
}

export interface FeatureTotal {
  key: string;
  label: string;
  used: number;
  allowance: number | null;
  consultants: number;
}

export interface Usage {
  period: string;
  current: boolean;
  resetsOn: string;
  consultants: ConsultantUsage[];
  features: FeatureTotal[];
}

export interface Month {
  period: string;
  matchViews: number;
  prepSessions: number;
  applications: number;
  counted: number;
}

export interface History {
  months: Month[];
}

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

// ------------------------------------------------------------------------------------------------ pure helpers

/** "$1,274.49" from minor units; "-" when there is no amount. */
export function money(minor: number | null | undefined, currency = "USD"): string {
  if (minor == null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(minor / 100);
}

/** "Nov 11, 2026" from an ISO date or instant; "-" when missing. */
export function day(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

/** "November 2026" from a YYYY-MM period. */
export function monthName(period: string): string {
  const d = new Date(`${period}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return period;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

/** The state pill words of a billing status. */
export const STATUS_LABEL: Record<string, string> = {
  SETUP: "Being set up",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", OPEN: "Open", PAID: "Paid", VOID: "Void", UNCOLLECTIBLE: "Uncollectible", WRITTEN_OFF: "Written off" };

/** The words of an invoice line kind. */
export const LINE_KIND_LABEL: Record<string, string> = {
  BASE_LICENSE: "Base licence",
  FEATURE: "Add-on",
  SETUP_FEE: "Setup fee",
  PRORATION: "Prorated",
  DISCOUNT: "Discount",
  CREDIT: "Credit",
};

/** The sentence under "Monthly recurring": the amount, or why there is none. */
export function recurringText(o: Pick<Overview, "monthlyRecurringMinor" | "currency" | "tiles">): string {
  if (o.monthlyRecurringMinor != null) return `${money(o.monthlyRecurringMinor, o.currency)} / month`;
  return o.tiles.licensed > 0 ? "Price not set" : "No licences yet";
}

/** "Card ending 4242, expires 04/2029", or null when nothing is on file. */
export function methodText(m: PaymentMethod | null): string | null {
  if (!m) return null;
  const brand = m.brand ? m.brand[0].toUpperCase() + m.brand.slice(1) : m.kind === "CARD" ? "Card" : m.kind;
  const exp = m.expMonth && m.expYear ? `, expires ${String(m.expMonth).padStart(2, "0")}/${m.expYear}` : "";
  return m.last4 ? `${brand} ending ${m.last4}${exp}` : brand;
}

/** "How it's paid": the collection method in plain words. */
export function collectionText(method: string | null | undefined): string {
  if (method === "SEND_INVOICE") return "An invoice each period, paid within 15 days";
  if (method === "CHARGE_AUTOMATICALLY") return "Charged automatically to the card on file";
  return "-";
}

/** A meter's width in percent (0-100) for used/allowance; null when there is no allowance. */
export function meterPercent(used: number, allowance: number | null | undefined): number | null {
  if (allowance == null || allowance <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used * 100) / allowance)));
}

/** The last `n` months as YYYY-MM, newest first, ending with `now` (for the period picker). */
export function lastMonths(now: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ client

async function call<T>(url: string, method: "GET" | "POST" = "GET"): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(url, { method, cache: "no-store", headers: { accept: "application/json" } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection." };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T };
  const message = typeof body.detail === "string" ? body.detail : typeof body.error === "string" ? body.error : typeof body.message === "string" && !body.message.startsWith("error.") ? body.message : "";
  return { ok: false, status: res.status, message: res.status === 404 ? "This page isn't open to you." : message || "Something went wrong. Try again." };
}

const org = (orgId: number | string) => `/api/orgs/${orgId}`;

export const billingApi = {
  overview: (orgId: number | string) => call<Overview>(`${org(orgId)}/billing/overview`),
  billing: (orgId: number | string) => call<Billing>(`${org(orgId)}/billing`),
  invoices: (orgId: number | string, status: string | null, page: number) => {
    const q = new URLSearchParams({ page: String(Math.max(0, page)) });
    if (status) q.set("status", status);
    return call<InvoicePage>(`${org(orgId)}/billing/invoices?${q.toString()}`);
  },
  invoice: (orgId: number | string, id: number) => call<InvoiceDetail>(`${org(orgId)}/billing/invoices/${id}`),
  usage: (orgId: number | string, period: string | null) => call<Usage>(`${org(orgId)}/usage${period ? `?period=${encodeURIComponent(period)}` : ""}`),
  history: (orgId: number | string, months: number) => call<History>(`${org(orgId)}/usage/history?months=${months}`),
  /** Step 2: a Stripe billing portal session for the organization's own customer; the page goes there. */
  portal: (orgId: number | string) => call<{ url: string }>(`${org(orgId)}/billing/portal`, "POST"),
};

/** The setup fee in words: "Waived", "On your first invoice: $500.00", "On your first invoice (price to be confirmed)", "Paid". */
export function setupFeeText(status: string | null | undefined, amountMinor: number | null | undefined, currency = "USD"): string | null {
  if (!status) return null;
  if (status === "WAIVED") return "Waived";
  if (status === "PAID") return "Paid";
  return amountMinor == null ? "On your first invoice (price to be confirmed)" : `On your first invoice: ${money(amountMinor, currency)}`;
}
