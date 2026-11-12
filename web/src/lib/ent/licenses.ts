/**
 * Consultant licences (docs/enterprise-v2/LICENCES-BUILD.md L3/L4, ORG-BILLING-BUILD.md step 1b): the contract of `/api/orgs/{orgId}/licenses/**` and the
 * small pure helpers the Consultant Licenses page draws with. No money moves yet (user decision 2026-11-10). An add-on change is priced by the API first
 * (a quote) and confirmed; the page only shows the quote's numbers and never adds money. A missing price reads "Price not set", never $0.
 */

export type LicenseState = "NONE" | "ACTIVE" | "SUSPENDED" | "ENDING" | "ENDED";

export interface LicenseRow {
  consultantId: number;
  name: string;
  email: string | null;
  signInLinked: boolean;
  status: LicenseState;
  features: string[];
  monthlyMinor: number | null;
  priceSet: boolean;
  since: string | null;
  endsAt: string | null;
  suspendReason: string | null;
  /** Add-ons taken away at the end of the billing period: they still work until then. */
  endingFeatures?: string[];
}

export interface LicenseChange {
  kind: string;
  featureKey: string | null;
  summary: string;
  at: string | null;
  actorMemberId: number | null;
}

/** A removal waiting for the end of the billing period; `changeId` undoes it. */
export interface ScheduledRemoval {
  changeId: number;
  featureKey: string;
  name: string;
  effectiveAt: string;
}

export interface LicenseDetail {
  row: LicenseRow;
  history: LicenseChange[];
  scheduled?: ScheduledRemoval[];
}

export type QuoteOp = "CREATE" | "ADD_FEATURE" | "REMOVE_FEATURE" | "KEEP_FEATURE";

export interface QuoteLine {
  op: QuoteOp;
  featureKey: string | null;
  name: string;
  monthlyMinor: number | null;
  dueNowMinor: number | null;
  effectiveAt: string;
}

export interface QuoteTotals {
  currentMonthlyMinor: number | null;
  proposedMonthlyMinor: number | null;
  deltaMinor: number | null;
  dueNowMinor: number | null;
  priceSet: boolean;
  periodLastDay: string | null;
}

export interface LicenseQuote {
  id: number;
  consultantId: number;
  consultantName: string;
  status: "OPEN" | "CONFIRMED" | "EXPIRED";
  currency: string;
  lines: QuoteLine[];
  totals: QuoteTotals;
  billingConnected: boolean;
  expiresAt: string;
}

export interface AddOn {
  key: string;
  name: string;
  description: string | null;
  priceMinor: number | null;
  usesAi: boolean;
}

export interface LicenseCatalog {
  currency: string;
  basePriceMinor: number | null;
  addOns: AddOn[];
  billingConnected: boolean;
}

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; code?: string; message: string };

export const STATE_LABEL: Record<LicenseState, string> = {
  NONE: "No licence",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  ENDING: "Ending",
  ENDED: "Ended",
};

/** Whether a row holds a licence that can still be changed (suspended counts: it can be reactivated or ended). */
export function holdsLicense(row: Pick<LicenseRow, "status">): boolean {
  return row.status === "ACTIVE" || row.status === "SUSPENDED" || row.status === "ENDING";
}

/** The add-on names of a row, in catalog order; an unknown key shows as itself. */
export function addOnNames(keys: string[], catalog: LicenseCatalog | null): string[] {
  if (!catalog) return keys;
  const byKey = new Map(catalog.addOns.map((a, i) => [a.key, { a, i }]));
  return [...keys].sort((x, y) => (byKey.get(x)?.i ?? 999) - (byKey.get(y)?.i ?? 999)).map((k) => byKey.get(k)?.a.name ?? k);
}

/** The tiles above the table: active consultants, licensed now, with AI help, without a licence. */
export function summarize(rows: LicenseRow[], catalog: LicenseCatalog | null): { consultants: number; licensed: number; withAi: number; unlicensed: number } {
  const ai = new Set((catalog?.addOns ?? []).filter((a) => a.usesAi).map((a) => a.key));
  let licensed = 0;
  let withAi = 0;
  for (const r of rows) {
    if (r.status !== "ACTIVE" && r.status !== "ENDING") continue;
    licensed++;
    if (r.features.some((k) => ai.has(k))) withAi++;
  }
  return { consultants: rows.length, licensed, withAi, unlicensed: rows.filter((r) => !holdsLicense(r)).length };
}

/** "$54.00 / month" from a contract price, or "Price not set" (nothing is billed). */
export function priceText(minor: number | null | undefined, currency: string): string {
  if (minor == null) return "Price not set";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(minor / 100);
  return `${amount} / month`;
}

/** An amount in minor units, e.g. "$9.00"; null reads "Price not set". */
export function moneyText(minor: number | null | undefined, currency: string): string {
  if (minor == null) return "Price not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(minor / 100);
}

/** "Dec 1, 2026" from an ISO instant or date, in UTC (billing periods are UTC days). */
export function dayText(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** What one quote line does, in words: "Add Inbox monitoring", "Remove AI resume tailoring on Dec 1, 2026", ... */
export function lineText(l: QuoteLine, now: Date = new Date()): string {
  switch (l.op) {
    case "CREATE":
      return "Give the base licence";
    case "ADD_FEATURE":
      return `Add ${l.name}`;
    case "KEEP_FEATURE":
      return `Keep ${l.name}`;
    case "REMOVE_FEATURE":
      return new Date(l.effectiveAt).getTime() > now.getTime() + 60_000 ? `Remove ${l.name} on ${dayText(l.effectiveAt)}` : `Remove ${l.name} now`;
  }
}

/** The monthly change of a quote: "+$9.00 / month", "-$9.00 / month", "No change", or "Price not set". */
export function deltaText(t: QuoteTotals, currency: string): string {
  if (!t.priceSet || t.deltaMinor == null) return "Price not set";
  if (t.deltaMinor === 0) return "No change";
  return `${t.deltaMinor > 0 ? "+" : "-"}${moneyText(Math.abs(t.deltaMinor), currency)} / month`;
}

/** A fresh Idempotency-Key for one confirm click (a retry of the same click reuses it). */
export function newKey(): string {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === "function" ? c.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The sentence a refused change shows. */
export function errorText(r: { status: number; code?: string; message: string }): string {
  if (r.status === 0) return r.message;
  switch (r.code) {
    case "ALREADY_LICENSED":
      return "This consultant already has a licence. Reload to see it.";
    case "NO_LICENSE":
      return "This consultant no longer has a licence. Reload to see the latest.";
    case "QUOTE_STALE":
      return "The licence or a price changed since this price was shown. Review the change again.";
    case "QUOTE_EXPIRED":
      return "This price is no longer valid. Review the change again.";
    case "QUOTE_USED":
      return "This change was already confirmed. Reload to see the licence.";
    case "NO_CHANGE":
      return "Nothing changes. Turn an add-on on or off first.";
    case "NOT_PENDING":
      return "This removal is no longer waiting. Reload to see the latest.";
    default:
      break;
  }
  if (r.status === 404) return "This consultant is no longer in your view.";
  if (r.status === 422) return r.message || "Check the details and try again.";
  return r.message || "Something went wrong. Try again.";
}

/** A refused API call carries "CODE: sentence" in its detail (the licence service's conflicts); split it. */
function codeAndText(text: string): { code?: string; message: string } {
  const m = /^([A-Z][A-Z_]+): ([\s\S]*)$/.exec(text);
  return m ? { code: m[1], message: m[2] } : { message: text };
}

async function call<T>(url: string, init?: RequestInit): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection." };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T };
  const raw = typeof body.detail === "string" ? body.detail : typeof body.error === "string" ? body.error : typeof body.message === "string" && !body.message.startsWith("error.") ? body.message : "";
  const parsed = codeAndText(raw);
  return { ok: false, status: res.status, code: typeof body.code === "string" ? body.code : parsed.code, message: parsed.message };
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/licenses`;
const post = (body?: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const licensesApi = {
  list: (orgId: number | string) => call<LicenseRow[]>(base(orgId)),
  catalog: (orgId: number | string) => call<LicenseCatalog>(`${base(orgId)}/catalog`),
  get: (orgId: number | string, consultantId: number) => call<LicenseDetail>(`${base(orgId)}/${consultantId}`),
  give: (orgId: number | string, consultantId: number, features: string[]) => call<LicenseDetail>(`${base(orgId)}/${consultantId}`, post({ features })),
  setFeatures: (orgId: number | string, consultantId: number, features: string[]) =>
    call<LicenseDetail>(`${base(orgId)}/${consultantId}/features`, { method: "PUT", body: JSON.stringify({ features }) }),
  suspend: (orgId: number | string, consultantId: number, reason: string) => call<LicenseDetail>(`${base(orgId)}/${consultantId}/suspend`, post({ reason })),
  reactivate: (orgId: number | string, consultantId: number) => call<LicenseDetail>(`${base(orgId)}/${consultantId}/reactivate`, post()),
  end: (orgId: number | string, consultantId: number, reason: string) => call<LicenseDetail>(`${base(orgId)}/${consultantId}/end`, post({ reason })),
  quote: (orgId: number | string, consultantId: number, features: string[]) => call<LicenseQuote>(`${base(orgId)}/quotes`, post({ consultantId, features })),
  confirm: (orgId: number | string, quoteId: number, key: string) =>
    call<LicenseDetail>(`${base(orgId)}/quotes/${quoteId}/confirm`, { method: "POST", headers: { "Idempotency-Key": key } }),
  keep: (orgId: number | string, changeId: number) => call<LicenseDetail>(`${base(orgId)}/changes/${changeId}`, { method: "DELETE" }),
};
