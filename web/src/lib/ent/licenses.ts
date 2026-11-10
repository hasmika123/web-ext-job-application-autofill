/**
 * Consultant licences (docs/enterprise-v2/LICENCES-BUILD.md L3/L4): the contract of `/api/orgs/{orgId}/licenses/**` and the small pure helpers the
 * Consultant Licenses page draws with. No money moves (user decision 2026-11-10): a change works at once; a price shows only where the organization has
 * a contract price, otherwise "Price not set".
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
}

export interface LicenseChange {
  kind: string;
  featureKey: string | null;
  summary: string;
  at: string | null;
  actorMemberId: number | null;
}

export interface LicenseDetail {
  row: LicenseRow;
  history: LicenseChange[];
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

/** The sentence a refused change shows. */
export function errorText(r: { status: number; code?: string; message: string }): string {
  if (r.status === 0) return r.message;
  switch (r.code) {
    case "ALREADY_LICENSED":
      return "This consultant already has a licence. Reload to see it.";
    case "NO_LICENSE":
      return "This consultant no longer has a licence. Reload to see the latest.";
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
};
