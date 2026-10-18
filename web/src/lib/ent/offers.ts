/**
 * The Accounts workspace Offers page: the types of the offers API (`OrgOfferResource`), the client that talks to the BFF under
 * `/api/orgs/{orgId}/offers`, the URL state of the page (tab, search, open offer) and the small pure helpers. Nothing here touches React.
 *
 * An offer is a RECORD of what the client extended. The CONSULTANT accepts or declines it in their own workspace; no control on this page can do that for
 * them, and nothing is signed or sent by Kiwiply. Money is plain numbers (minor units) with a currency and a period: a record, never a payment.
 */
import { formatDay, newKey, type ApiResult } from "@/lib/ent/placements";

export { formatDay, formatWhen, relativeDays } from "@/lib/ent/placements";

/* ── contract types (mirror OfferDTO) ────────────────────────────────────────────── */

export type OfferState = "DRAFT" | "EXTENDED" | "NEGOTIATING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "WITHDRAWN";
export type OfferTab = "open" | "draft" | "accepted" | "closed" | "all";

export const OFFER_TABS: readonly OfferTab[] = ["open", "draft", "accepted", "closed", "all"];
export const STATE_LABEL: Record<OfferState, string> = {
  DRAFT: "Draft",
  EXTENDED: "Extended",
  NEGOTIATING: "Negotiating",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
};
export const STATE_TONE: Record<OfferState, "grey" | "blue" | "amber" | "green" | "red"> = {
  DRAFT: "grey",
  EXTENDED: "blue",
  NEGOTIATING: "amber",
  ACCEPTED: "green",
  DECLINED: "red",
  EXPIRED: "grey",
  WITHDRAWN: "grey",
};

export interface OfferPerson {
  id: number;
  name: string;
  initials: string;
}

export interface OfferRow {
  id: number;
  consultant: OfferPerson;
  clientId: number | null;
  clientName: string;
  roleTitle: string;
  state: OfferState;
  stateLabel: string;
  placementType: string | null;
  rateMinor: number | null;
  ratePeriod: string | null;
  currency: string | null;
  baseSalaryMinor: number | null;
  totalCompMinor: number | null;
  workMode: string | null;
  startDate: string | null;
  endDate: string | null;
  termMonths: number | null;
  deadline: string | null;
  daysLeft: number | null;
  placementId: number | null;
  createdAt: string;
  extendedAt: string | null;
  respondedAt: string | null;
  sampleData: boolean;
}

export interface OfferPage {
  items: OfferRow[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface OfferCounts {
  all: number;
  draft: number;
  open: number;
  accepted: number;
  closed: number;
  closingSoon: number;
  placed: number;
  closingSoonDays: number;
}

export interface OfferEvent {
  id: number;
  kind: string;
  label: string;
  actorKind: "MEMBER" | "CONSULTANT" | "SYSTEM";
  actorName: string;
  detail: string | null;
  at: string;
}

export interface OfferActions {
  edit: boolean;
  extend: boolean;
  withdraw: boolean;
  createPlacement: boolean;
}

export interface OfferDetail {
  offer: OfferRow;
  benefits: string | null;
  notes: string | null;
  responseNote: string | null;
  placementNote: string | null;
  placement: { id: number; status: string; startDate: string } | null;
  timeline: OfferEvent[];
  actions: OfferActions;
}

export interface PickerItem {
  id: number;
  label: string;
  sub: string | null;
}

export interface OfferWrite {
  consultantId?: number;
  clientId?: number;
  submissionId?: number | null;
  roleTitle?: string;
  placementType?: string;
  workMode?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  termMonths?: number | null;
  rateMinor?: number | null;
  ratePeriod?: string | null;
  baseSalaryMinor?: number | null;
  totalCompMinor?: number | null;
  currency?: string;
  deadline?: string | null;
  benefits?: string | null;
  notes?: string | null;
  extend?: boolean;
}

/* ── URL state ───────────────────────────────────────────────────────────────────── */

export interface OfferView {
  tab: OfferTab;
  q: string;
  /** 0-based, as the API counts; the URL carries it 1-based. */
  page: number;
  size: number;
  selected: number | null;
}

export const DEFAULT_OFFER_VIEW: OfferView = { tab: "open", q: "", page: 0, size: 10, selected: null }; // config-literal-ok: the table's page size (UI paging; the API caps it)
export const MIN_SEARCH = 2;

export function parseOfferView(params: URLSearchParams): OfferView {
  const tabRaw = params.get("tab");
  const tab = (OFFER_TABS as readonly string[]).includes(tabRaw ?? "") ? (tabRaw as OfferTab) : "open";
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  const selected = Number.parseInt(params.get("of") ?? "", 10);
  return {
    tab,
    q: (params.get("q") ?? "").slice(0, 80),
    page: Number.isFinite(page) && page >= 1 ? page - 1 : 0,
    size: DEFAULT_OFFER_VIEW.size,
    selected: Number.isFinite(selected) && selected > 0 ? selected : null,
  };
}

/** The query string that reproduces a view (defaults are left out). */
export function offerViewParams(v: OfferView): string {
  const p = new URLSearchParams();
  if (v.tab !== "open") p.set("tab", v.tab);
  if (v.q) p.set("q", v.q);
  if (v.page > 0) p.set("page", String(v.page + 1));
  if (v.selected) p.set("of", String(v.selected));
  return p.toString();
}

/** What goes to the API list call (a search shorter than two characters is not sent). */
export function offerListParams(v: OfferView): string {
  const p = new URLSearchParams({ tab: v.tab, page: String(v.page), size: String(v.size) });
  if (v.q.trim().length >= MIN_SEARCH) p.set("q", v.q.trim());
  return p.toString();
}

/* ── display helpers ─────────────────────────────────────────────────────────────── */

const PERIOD: Record<string, string> = { HOUR: "/hr", DAY: "/day", MONTH: "/mo", YEAR: "/yr" };

function money(minor: number, currency: string | null | undefined): string {
  const whole = minor / 100;
  const sym = !currency || currency === "USD" ? "$" : `${currency} `;
  return `${sym}${whole.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** "$95/hr" or "$140,000/yr": the recorded rate, else the recorded salary; an honest dash when neither is recorded. */
export function packageText(o: Pick<OfferRow, "rateMinor" | "ratePeriod" | "baseSalaryMinor" | "currency">): string {
  if (o.rateMinor !== null) return `${money(o.rateMinor, o.currency)}${PERIOD[o.ratePeriod ?? "HOUR"] ?? ""}`;
  if (o.baseSalaryMinor !== null) return `${money(o.baseSalaryMinor, o.currency)}/yr`;
  return "—";
}

export function termText(o: Pick<OfferRow, "startDate" | "endDate" | "termMonths">): string {
  const start = o.startDate ? formatDay(o.startDate) : "Start date not set";
  if (o.endDate) return `${start} to ${formatDay(o.endDate)}`;
  if (o.termMonths) return `${start}, ${o.termMonths} ${o.termMonths === 1 ? "month" : "months"}`;
  return start;
}

export function deadlineText(o: Pick<OfferRow, "state" | "deadline" | "daysLeft">): string {
  if (!o.deadline) return "";
  if (o.state === "EXTENDED" || o.state === "NEGOTIATING") {
    const n = o.daysLeft ?? 0;
    return n === 0 ? "Answer due today" : n === 1 ? "Answer due tomorrow" : `Answer due in ${n} days`;
  }
  return `Deadline ${formatDay(o.deadline)}`;
}

export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0 || shown === 0) return "No offers";
  return `${page * size + 1}-${page * size + shown} of ${total.toLocaleString("en-US")} ${total === 1 ? "offer" : "offers"}`;
}

export function eventTitle(e: OfferEvent): string {
  return e.label;
}

/** Major units from a number typed in a field to minor units; null for blank, NaN for junk. */
export function toMinor(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}

/* ── errors ──────────────────────────────────────────────────────────────────────── */

const CODE_TEXT: Record<string, string> = {
  OFFER_NOT_EDITABLE: "This offer can no longer be edited.",
  OFFER_NOT_DRAFT: "Only a draft can be recorded as extended.",
  OFFER_NOT_OPEN: "This offer can no longer be withdrawn.",
  OFFER_NOT_ACCEPTED: "A placement can only be created from an offer the consultant accepted.",
  PLACEMENT_EXISTS: "This offer already has a placement.",
  PLACEMENT_NOT_CREATED: "The placement could not be created.",
  INVALID_SUBMISSION: "That submission belongs to another consultant.",
  INVALID_APPLICATION: "That application belongs to another consultant.",
};

export function errorSentence(r: { status: number; code?: string; message: string }): string {
  if (r.status === 0) return r.message;
  if (r.status === 404) return "This offer is no longer in your view.";
  if (r.status === 422 && r.code === "PLACEMENT_NOT_CREATED") return r.message;
  return (r.code ? CODE_TEXT[r.code] : undefined) ?? r.message;
}

/* ── client ──────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/offers`;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection.", extra: {} };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T, status: res.status };
  const { error, message, code, ...extra } = body;
  return { ok: false, status: res.status, code: typeof code === "string" ? code : undefined, message: typeof error === "string" ? error : typeof message === "string" ? message : "Something went wrong.", extra };
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json", "idempotency-key": newKey() },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const offersApi = {
  list: (orgId: number | string, v: OfferView) => call<OfferPage>(`${base(orgId)}?${offerListParams(v)}`, { cache: "no-store" }),
  counts: (orgId: number | string) => call<OfferCounts>(`${base(orgId)}/counts`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<OfferDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  pickers: (orgId: number | string, kind: "consultant" | "client" | "submission", q: string, consultantId?: number) =>
    call<{ kind: string; items: PickerItem[] }>(`${base(orgId)}/pickers?kind=${kind}&q=${encodeURIComponent(q)}${consultantId ? `&consultantId=${consultantId}` : ""}`, { cache: "no-store" }),
  create: (orgId: number | string, body: OfferWrite) => call<OfferDetail>(base(orgId), json("POST", body)),
  update: (orgId: number | string, id: number, body: OfferWrite) => call<OfferDetail>(`${base(orgId)}/${id}`, json("PUT", body)),
  extend: (orgId: number | string, id: number) => call<OfferDetail>(`${base(orgId)}/${id}/extend`, json("POST")),
  withdraw: (orgId: number | string, id: number, reason: string) => call<OfferDetail>(`${base(orgId)}/${id}/withdraw`, json("POST", { reason: reason || null })),
  createPlacement: (orgId: number | string, id: number) => call<OfferDetail>(`${base(orgId)}/${id}/placement`, json("POST")),
};
