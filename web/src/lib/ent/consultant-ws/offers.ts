/**
 * The Consultant workspace Offers page's client logic (design/enterprise-consultant/offers.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/offers` (+ `/list`, `/{id}` and the three responses), tolerant parsers and the pure helpers the page uses
 * (minor-unit money formatting, deadline wording, status pills, the compare selection). Nothing here touches React and there is no fallback
 * number: every figure is the API's answer. Money is a RECORD in minor units; accepting, declining or negotiating only records the consultant's
 * answer, nothing is signed or sent to a client from here and no placement is created.
 */
import { type Tone } from "./home";

export type OfferStatus = "PENDING_REVIEW" | "NEGOTIATION" | "ACCEPTED" | "DECLINED" | "EXPIRED";
const STATUSES: readonly string[] = ["PENDING_REVIEW", "NEGOTIATION", "ACCEPTED", "DECLINED", "EXPIRED"];
export type WorkMode = "REMOTE" | "HYBRID" | "ONSITE";
const MODES: readonly string[] = ["REMOTE", "HYBRID", "ONSITE"];

export interface OfferTile {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
  vs: "month";
}

export interface OfferRow {
  id: number;
  company: string;
  role: string;
  packageSummary: string | null;
  workMode: WorkMode | null;
  /** yyyy-mm-dd */
  startDate: string | null;
  /** yyyy-mm-dd */
  offerDeadline: string | null;
  /** Days from today to the deadline for an open offer (0 = today), else null. */
  daysLeft: number | null;
  /** The EFFECTIVE status: an open offer past its deadline is EXPIRED. */
  status: OfferStatus;
  baseSalaryMinor: number | null;
  totalCompMinor: number | null;
  currency: string;
  respondedAt: string | null;
  createdAt: string | null;
  /** A demo stand-in row: the employer side that makes offers is not built yet. */
  sample: boolean;
}

export interface OfferPage {
  items: OfferRow[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface OfferActivity {
  offerId: number;
  kind: string;
  label: string;
  company: string;
  role: string;
  occurredAt: string;
}

export interface OffersView {
  orgId: number;
  generatedAt: string;
  name: string;
  tiles: { total: OfferTile; pending: OfferTile; accepted: OfferTile; negotiation: OfferTile; declined: OfferTile };
  offers: OfferPage;
  compare: OfferRow[];
  activity: OfferActivity[];
  companies: string[];
}

export interface OfferEvent {
  kind: string;
  label: string;
  occurredAt: string;
}

export interface OfferDetail {
  row: OfferRow;
  benefitsSummary: string | null;
  responseNote: string | null;
  events: OfferEvent[];
  canRespond: boolean;
  canNegotiate: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function tileOf(v: unknown): OfferTile {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: numOrNull(d.previous),
    deltaPct: numOrNull(d.deltaPct),
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
    vs: "month",
  };
}

export function parseRow(o: unknown): OfferRow | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.company !== "string" || typeof o.role !== "string" || typeof o.status !== "string" || !STATUSES.includes(o.status)) return null;
  return {
    id: o.id,
    company: o.company,
    role: o.role,
    packageSummary: strOrNull(o.packageSummary),
    workMode: typeof o.workMode === "string" && MODES.includes(o.workMode) ? (o.workMode as WorkMode) : null,
    startDate: strOrNull(o.startDate),
    offerDeadline: strOrNull(o.offerDeadline),
    daysLeft: numOrNull(o.daysLeft),
    status: o.status as OfferStatus,
    baseSalaryMinor: numOrNull(o.baseSalaryMinor),
    totalCompMinor: numOrNull(o.totalCompMinor),
    currency: typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) ? o.currency : "USD",
    respondedAt: strOrNull(o.respondedAt),
    createdAt: strOrNull(o.createdAt),
    sample: o.sample === true,
  };
}

const rowsOf = (v: unknown): OfferRow[] =>
  arr(v)
    .map(parseRow)
    .filter((r): r is OfferRow => r !== null);

export function parseOfferPage(body: unknown): OfferPage | null {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  return {
    items: rowsOf(body.items),
    page: Math.max(0, num(body.page)),
    size: Math.max(1, num(body.size, 10)),
    total: Math.max(0, num(body.total)),
    totalPages: Math.max(0, num(body.totalPages)),
  };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseOffers(body: unknown): OffersView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles)) return null;
  const offers = parseOfferPage(body.offers);
  if (!offers) return null;
  const t = body.tiles;
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    name: typeof body.name === "string" ? body.name : "",
    tiles: { total: tileOf(t.total), pending: tileOf(t.pending), accepted: tileOf(t.accepted), negotiation: tileOf(t.negotiation), declined: tileOf(t.declined) },
    offers,
    compare: rowsOf(body.compare),
    activity: arr(body.activity)
      .filter(isObj)
      .filter((a) => typeof a.offerId === "number" && typeof a.label === "string" && typeof a.occurredAt === "string")
      .map((a) => ({ offerId: a.offerId as number, kind: typeof a.kind === "string" ? a.kind : "", label: a.label as string, company: typeof a.company === "string" ? a.company : "", role: typeof a.role === "string" ? a.role : "", occurredAt: a.occurredAt as string })),
    companies: arr(body.companies).filter((c): c is string => typeof c === "string" && c !== ""),
  };
}

export function parseOfferDetail(body: unknown): OfferDetail | null {
  if (!isObj(body)) return null;
  const row = parseRow(body.row);
  if (!row) return null;
  return {
    row,
    benefitsSummary: strOrNull(body.benefitsSummary),
    responseNote: strOrNull(body.responseNote),
    events: arr(body.events)
      .filter(isObj)
      .filter((e) => typeof e.label === "string" && typeof e.occurredAt === "string")
      .map((e) => ({ kind: typeof e.kind === "string" ? e.kind : "", label: e.label as string, occurredAt: e.occurredAt as string })),
    canRespond: body.canRespond === true,
    canNegotiate: body.canNegotiate === true,
  };
}

/* ── money (RECORD only, minor units) ─────────────────────────────────────────────────── */

/** "$145,000" / "$1,234.50" from minor units (cents) without floating-point arithmetic on the amount; "-" when there is no figure. */
export function formatMoney(minor: number | null, currency = "USD"): string {
  if (minor === null || !Number.isFinite(minor)) return "-";
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = whole.toLocaleString("en-US");
  let symbol: string;
  try {
    symbol = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    symbol = currency;
  }
  return `${negative ? "-" : ""}${symbol}${grouped}${cents === 0 ? "" : `.${String(cents).padStart(2, "0")}`}`;
}

/* ── dates ────────────────────────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jan 13, 2025" from a yyyy-mm-dd date (no time zone shift), "-" when absent or malformed. */
export function dateLabel(d: string | null): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(d) : null;
  if (!m) return "-";
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : "-";
}

/** The Offer Deadline cell: the date, and "(5 days left)" while the offer is open. Urgent (coral) from 14 days down. */
export function deadlineInfo(r: Pick<OfferRow, "offerDeadline" | "daysLeft" | "status">): { date: string; left: string | null; urgent: boolean } {
  const date = dateLabel(r.offerDeadline);
  if (r.daysLeft === null || (r.status !== "PENDING_REVIEW" && r.status !== "NEGOTIATION")) return { date, left: null, urgent: r.status === "EXPIRED" };
  const left = r.daysLeft <= 0 ? "(due today)" : r.daysLeft === 1 ? "(1 day left)" : `(${r.daysLeft} days left)`;
  return { date, left, urgent: r.daysLeft <= 14 };
}

/** "2 hours ago", "1 day ago", "just now". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return days === 1 ? "1 day ago" : `${days} days ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Oct 25, 2024, 3:40 PM" in the viewer's zone, for the detail timeline. */
export function stampLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/* ── status, work mode, filters ───────────────────────────────────────────────────────── */

export function statusInfo(status: OfferStatus): { label: string; tone: Tone } {
  switch (status) {
    case "NEGOTIATION":
      return { label: "Negotiation", tone: "violet" };
    case "ACCEPTED":
      return { label: "Accepted", tone: "green" };
    case "DECLINED":
      return { label: "Declined", tone: "red" };
    case "EXPIRED":
      return { label: "Expired", tone: "slate" };
    default:
      return { label: "Pending Review", tone: "amber" };
  }
}

export function workModeInfo(mode: WorkMode | null): { label: string; tone: Tone } | null {
  switch (mode) {
    case "REMOTE":
      return { label: "Remote", tone: "blue" };
    case "HYBRID":
      return { label: "Hybrid", tone: "violet" };
    case "ONSITE":
      return { label: "Onsite", tone: "violet" };
    default:
      return null;
  }
}

export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Status" },
  { value: "PENDING_REVIEW", label: "Pending Review" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
  { value: "EXPIRED", label: "Expired" },
];

export const MODE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Work Mode" },
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "ONSITE", label: "Onsite" },
];

export type SortKey = "recent" | "deadline" | "company" | "start";
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Newest First" },
  { value: "deadline", label: "Deadline (Soonest)" },
  { value: "company", label: "Company (A-Z)" },
  { value: "start", label: "Start Date (Soonest)" },
];

export interface OfferQuery {
  status: string;
  company: string;
  workMode: string;
  q: string;
  sort: SortKey;
  page: number;
  size: number;
}

export const PAGE_SIZE = 10;
export const EMPTY_QUERY: OfferQuery = { status: "", company: "", workMode: "", q: "", sort: "recent", page: 0, size: PAGE_SIZE };

/** True when the query is the page's own default (so the first page from the page call can be used as it is). */
export const isDefaultQuery = (q: OfferQuery): boolean => q.status === "" && q.company === "" && q.workMode === "" && q.q.trim() === "" && q.sort === "recent" && q.page === 0;

export function queryString(q: OfferQuery): string {
  const p = new URLSearchParams();
  if (q.status) p.set("status", q.status);
  if (q.company) p.set("company", q.company);
  if (q.workMode) p.set("workMode", q.workMode);
  if (q.q.trim()) p.set("q", q.q.trim().slice(0, 80));
  if (q.sort !== "recent") p.set("sort", q.sort);
  p.set("page", String(Math.max(0, q.page)));
  p.set("size", String(Math.min(50, Math.max(1, q.size))));
  return p.toString();
}

/** "Showing 1-10 of 12" (empty text for no rows). */
export function rangeText(p: Pick<OfferPage, "page" | "size" | "total">, shown: number): string {
  if (p.total === 0 || shown === 0) return "";
  const from = p.page * p.size + 1;
  return `Showing ${from}-${from + shown - 1} of ${p.total}`;
}

/* ── compare ──────────────────────────────────────────────────────────────────────────── */

export const MAX_COMPARE = 3;

/** The selection after toggling one offer: removing is always allowed, adding stops at three (the cap is reported, never silently exceeded). */
export function toggleSelection(selected: number[], id: number): { next: number[]; capped: boolean } {
  if (selected.includes(id)) return { next: selected.filter((x) => x !== id), capped: false };
  if (selected.length >= MAX_COMPARE) return { next: selected, capped: true };
  return { next: [...selected, id], capped: false };
}

/** The chosen offers in the order they were chosen; ids that no longer exist are dropped. */
export function comparedRows(all: OfferRow[], selected: number[]): OfferRow[] {
  const byId = new Map(all.map((r) => [r.id, r]));
  return selected.map((id) => byId.get(id)).filter((r): r is OfferRow => r !== undefined);
}

/** "Compare Selected (2)". */
export const compareLabel = (n: number): string => `Compare Selected (${n})`;

/* ── copy (should become admin config) ────────────────────────────────────────────────── */

export const ACCEPT_COPY = "Accepting records your answer here and, when the offer is linked to a client, starts your placement. Nothing is signed or sent to the client from here, and no money moves.";
export const MIN_NOTE = 3;
export const MAX_NOTE = 300;

/** The note the consultant typed, or the sentence to show when it is not acceptable; the API re-checks everything. `required` is false for a decline reason. */
export function noteProblem(note: string, required: boolean): string | null {
  const v = note.trim();
  if (v.length === 0 && !required) return null;
  if (v.length < MIN_NOTE) return `Say a little more, at least ${MIN_NOTE} characters.`;
  if (v.length > MAX_NOTE) return `Keep it to ${MAX_NOTE} characters or fewer.`;
  return null;
}

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/offers`;

async function read<T>(url: string, parse: (b: unknown) => T | null, signal?: AbortSignal): Promise<Fetched<T>> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parse(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export const fetchOffers = (orgId: number | string, signal?: AbortSignal) => read(base(orgId), parseOffers, signal);
export const fetchOfferList = (orgId: number | string, q: OfferQuery, signal?: AbortSignal) => read(`${base(orgId)}/list?${queryString(q)}`, parseOfferPage, signal);
export const fetchOfferDetail = (orgId: number | string, id: number, signal?: AbortSignal) => read(`${base(orgId)}/${id}`, parseOfferDetail, signal);

export interface WriteResult {
  ok: boolean;
  /** The HTTP status when the call reached the API (409 = already answered or past its deadline). */
  status?: number;
  /** The API's own message for a refusal (the sensitive-data one, "already accepted"), when it sent one. */
  message?: string;
}

async function write(url: string, body?: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) return { ok: true, status: res.status };
    const j = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown; message?: unknown } | null;
    const m = j && typeof j.error === "string" ? j.error : j && typeof j.detail === "string" ? j.detail : j && typeof j.message === "string" ? j.message : undefined;
    return { ok: false, status: res.status, message: m };
  } catch {
    return { ok: false };
  }
}

export const acceptOffer = (orgId: number, id: number) => write(`${base(orgId)}/${id}/accept`);
export const declineOffer = (orgId: number, id: number, reason: string) => write(`${base(orgId)}/${id}/decline`, { reason });
export const negotiateOffer = (orgId: number, id: number, note: string) => write(`${base(orgId)}/${id}/negotiate`, { note });
