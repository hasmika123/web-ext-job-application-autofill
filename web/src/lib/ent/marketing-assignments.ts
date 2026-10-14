/**
 * The Marketing Assignments page (design/enterprise-talent/marketing-assignments.png), pure part: the types of the marketing-assignments API,
 * the URL <-> query mapping (so a link shares the selected marketer, the filters and the page), the client that talks to the BFF under
 * `/api/orgs/{orgId}/marketing-assignments`, and the small helpers the page needs (tile deltas, the reverse of a change for Undo, error
 * sentences). Nothing here touches React.
 *
 * The page never invents a figure: a tile whose `previous` is null shows no delta; a column the data cannot fill is left out.
 * A marketer prepares, requests and records: nothing on this page submits an application or acts as a consultant.
 */

import { newKey, personInitials, type ApiResult } from "@/lib/ent/members";

export { newKey, personInitials };
export type { ApiResult };

/* ── contract types (mirror MarketingAssignmentsDTO) ─────────────────────────────── */

export interface Person {
  memberId: number;
  name: string;
}

export interface Marketer {
  memberId: number;
  name: string;
  title: string | null;
  status: "ACTIVE" | "PAUSED" | string;
  capacity: number;
  assigned: number;
  percent: number;
  overloaded: boolean;
  canManage: boolean;
}

export interface Summary {
  marketers: number;
  totalAssigned: number;
  avgPerMarketer: number | null;
  overloaded: number;
  unassigned: number;
}

export interface MarketerList {
  items: Marketer[];
  summary: Summary;
  canManage: boolean;
}

export interface Row {
  consultantId: number;
  name: string;
  jobTitle: string | null;
  email: string | null;
  availability: string | null;
  marketer: Person | null;
  backup: Person | null;
  status: "ACTIVE" | "PAUSED" | null;
  priority: "HIGH" | "MEDIUM" | "LOW" | null;
  activeApps: number;
  lastActivityAt: string | null;
  assignedAt: string | null;
}

export interface ConsultantPage {
  items: Row[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface KpiTile {
  key: "assigned" | "marketers" | "unassigned" | "overloaded";
  current: number;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
  series: number[];
  good: "UP" | "DOWN" | "NEUTRAL";
}

export interface Kpis {
  tiles: KpiTile[];
  generatedAt: string;
  note: string;
}

export interface WorkloadRow {
  memberId: number;
  name: string;
  title: string | null;
  status: string;
  capacity: number;
  assigned: number;
  percent: number;
  overloaded: boolean;
  highPriority: number;
  paused: number;
  withoutBackup: number;
  activeApps: number;
  backupFor: number;
}

export interface WorkloadReport {
  items: WorkloadRow[];
  summary: Summary;
  generatedAt: string;
}

export interface Option {
  id: number;
  name: string;
  detail: string | null;
}

export interface Filters {
  clients: Option[];
  statuses: string[];
  priorities: string[];
  availabilities: string[];
}

export interface RowResult {
  consultantId: number;
  ok: boolean;
  reason: string | null;
  previous: Record<string, unknown> | null;
}

export interface BulkResult {
  action: string;
  requested: number;
  ok: number;
  skipped: { consultantId: number; reason: string }[];
  results: RowResult[];
}

export interface RestoreRow {
  consultantId: number;
  marketerMemberId: number | null;
  backupMemberId: number | null;
  priority: string;
  status: string;
}

/* ── query <-> URL ───────────────────────────────────────────────────────────────── */

export type SortKey = "name" | "priority" | "status" | "activeApps" | "lastActivity" | "assigned";
export type SortDir = "asc" | "desc";
export const SORT_KEYS: readonly SortKey[] = ["name", "priority", "status", "activeApps", "lastActivity", "assigned"];
export const PAGE_SIZES = [10, 25, 50] as const;

export interface BoardQuery {
  /** The marketer whose consultants the table shows (null until the list loads and the first one is picked). */
  marketerId: number | null;
  /** The left panel's search and status filter. */
  mq: string;
  mstatus: string;
  /** The table's search and filters. */
  q: string;
  status: string;
  priority: string;
  clientId: string;
  availability: string;
  noBackup: boolean;
  sort: { key: SortKey; dir: SortDir };
  /** 0-based, as the API counts. */
  page: number;
  size: number;
}

export const DEFAULT_QUERY: BoardQuery = {
  marketerId: null,
  mq: "",
  mstatus: "",
  q: "",
  status: "",
  priority: "",
  clientId: "",
  availability: "",
  noBackup: false,
  sort: { key: "lastActivity", dir: "desc" },
  page: 0,
  size: 10,
};

/** The API refuses a search shorter than 2 characters (422); the page waits for a second character. */
export const MIN_SEARCH = 2;

type SearchSource = URLSearchParams | Record<string, string | string[] | undefined>;

function pick(src: SearchSource, key: string): string {
  if (src instanceof URLSearchParams) return src.get(key) ?? "";
  const v = src[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

const oneOf = <T extends string>(v: string, allowed: readonly T[]): T | "" => ((allowed as readonly string[]).includes(v) ? (v as T) : "");
const intOr = (v: string, d: number, min = 0): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min ? n : d;
};

/** The page's query from a URL's search string (anything unknown or malformed falls back to the default: a shared link never breaks the page). */
export function parseQuery(src: SearchSource): BoardQuery {
  const [sk, sd] = pick(src, "sort").split(",");
  const sortKey = oneOf(sk ?? "", SORT_KEYS);
  const size = intOr(pick(src, "size"), DEFAULT_QUERY.size, 1);
  const m = pick(src, "m");
  return {
    marketerId: /^\d{1,18}$/.test(m) ? Number(m) : null,
    mq: pick(src, "mq").slice(0, 80),
    mstatus: oneOf(pick(src, "ms"), ["ACTIVE", "PAUSED"] as const),
    q: pick(src, "q").slice(0, 80),
    status: oneOf(pick(src, "status"), ["ACTIVE", "PAUSED"] as const),
    priority: oneOf(pick(src, "priority"), ["HIGH", "MEDIUM", "LOW"] as const),
    clientId: /^\d{1,18}$/.test(pick(src, "client")) ? pick(src, "client") : "",
    availability: oneOf(pick(src, "avail"), ["AVAILABLE", "ON_PROJECT", "NOTICE", "UNAVAILABLE"] as const),
    noBackup: pick(src, "nb") === "1",
    sort: sortKey ? { key: sortKey, dir: sd === "asc" ? "asc" : "desc" } : DEFAULT_QUERY.sort,
    page: intOr(pick(src, "page"), 0),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_QUERY.size,
  };
}

/** The query as a shareable search string: only what differs from the default, so a plain page has a plain URL. */
export function toSearch(q: BoardQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.marketerId != null) p.set("m", String(q.marketerId));
  if (q.mq) p.set("mq", q.mq);
  if (q.mstatus) p.set("ms", q.mstatus);
  if (q.q) p.set("q", q.q);
  if (q.status) p.set("status", q.status);
  if (q.priority) p.set("priority", q.priority);
  if (q.clientId) p.set("client", q.clientId);
  if (q.availability) p.set("avail", q.availability);
  if (q.noBackup) p.set("nb", "1");
  if (q.sort.key !== DEFAULT_QUERY.sort.key || q.sort.dir !== DEFAULT_QUERY.sort.dir) p.set("sort", `${q.sort.key},${q.sort.dir}`);
  if (q.page > 0) p.set("page", String(q.page));
  if (q.size !== DEFAULT_QUERY.size) p.set("size", String(q.size));
  return p;
}

/** The consultants call for one marketer (or the unassigned ones). */
export function consultantParams(q: BoardQuery, marketerId: number | null): URLSearchParams {
  const p = new URLSearchParams();
  if (marketerId != null) p.set("marketerId", String(marketerId));
  if (q.q.trim().length >= MIN_SEARCH) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  if (q.priority) p.set("priority", q.priority);
  if (q.clientId) p.set("clientId", q.clientId);
  if (q.availability) p.set("availability", q.availability);
  if (q.noBackup) p.set("noBackup", "true");
  p.set("sort", `${q.sort.key},${q.sort.dir}`);
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p;
}

/** Clicking a header: the same column flips direction, a new column starts ascending (dates and counts start with the biggest). */
export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "lastActivity" || key === "assigned" || key === "activeApps" ? "desc" : "asc" };
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

/** "1-10 of 28 consultants". */
export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0 || shown === 0) return "No consultants";
  return `${page * size + 1}-${page * size + shown} of ${total} ${total === 1 ? "consultant" : "consultants"}`;
}

/** True while any table filter is applied (the page offers "Clear filters"). */
export function filtersApplied(q: BoardQuery): boolean {
  return q.q.trim().length >= MIN_SEARCH || !!(q.status || q.priority || q.clientId || q.availability) || q.noBackup;
}

/* ── display helpers ─────────────────────────────────────────────────────────────── */

export const PRIORITY_LABEL: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
export const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", PAUSED: "Paused" };
export const AVAILABILITY_LABEL: Record<string, string> = { AVAILABLE: "Available", ON_PROJECT: "On project", NOTICE: "On notice", UNAVAILABLE: "Unavailable" };

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // this year's dates drop the year (a narrow column); older ones keep it
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export interface TileView {
  dir: "up" | "down" | "flat";
  text: string;
  /** True when the move is good news for this tile (null for no change). */
  good: boolean | null;
}

/**
 * The delta line of a tile, or null. A tile whose `previous` the API left null shows nothing. Counts of marketers and of overloaded
 * marketers read as a plain difference ("+2"); the two consultant counts read as a percent when there is a base ("+12%").
 */
export function tileView(t: KpiTile | null | undefined): TileView | null {
  if (!t || t.previous === null || t.delta === null) return null;
  const dir = t.delta === 0 ? "flat" : t.delta > 0 ? "up" : "down";
  let text: string;
  if (t.delta === 0) text = "0";
  else if ((t.key === "assigned" || t.key === "unassigned") && t.deltaPct !== null) {
    const n = Math.abs(t.deltaPct * 100);
    text = `${t.delta > 0 ? "+" : "-"}${Number.isInteger(n) ? n : n.toFixed(1)}%`;
  } else text = `${t.delta > 0 ? "+" : "-"}${Math.abs(t.delta)}`;
  const good = dir === "flat" || t.good === "NEUTRAL" ? null : (dir === "up") === (t.good === "UP");
  return { dir, text, good };
}

/** "28 / 30" and "93%" of a card. */
export const loadText = (m: { assigned: number; capacity: number }): string => `${m.assigned} / ${m.capacity}`;

/* ── errors ──────────────────────────────────────────────────────────────────────── */

const REASON_TEXT: Record<string, string> = {
  NOT_FOUND: "This consultant is no longer in your view.",
  NOT_ASSIGNED: "This consultant has no marketer yet.",
  BACKUP_SAME_AS_MARKETER: "The backup can't be the marketer themselves.",
  UNCHANGED: "Nothing to change.",
  OVER_CAPACITY: "That would put the marketer over capacity.",
  MARKETER_INVALID: "That person can't carry consultants.",
  ALREADY_MARKETER: "That person is already a marketer.",
};

export function reasonText(code: string | undefined | null): string | null {
  return code ? (REASON_TEXT[code] ?? null) : null;
}

export function errorSentence(r: { status: number; code?: string; message: string }): string {
  if (r.status === 0) return r.message;
  if (r.status === 403 && r.code === "DEMO_READ_ONLY") return "This demo is read only.";
  return reasonText(r.code) ?? r.message;
}

export function skipText(reason: string): string {
  return reasonText(reason) ?? reason.toLowerCase().replace(/_/g, " ");
}

/** The 409 OVER_CAPACITY answer's figures, or null when the refusal was something else. */
export interface OverCapacity {
  marketerMemberId: number;
  capacity: number;
  current: number;
  adding: number;
  projected: number;
}

export function overCapacityOf(r: { ok: false; status: number; code?: string; extra: Record<string, unknown> }): OverCapacity | null {
  if (r.status !== 409 || r.code !== "OVER_CAPACITY") return null;
  const e = r.extra;
  const n = (v: unknown) => (typeof v === "number" ? v : NaN);
  const out = { marketerMemberId: n(e.marketerMemberId), capacity: n(e.capacity), current: n(e.current), adding: n(e.adding), projected: n(e.projected) };
  return Object.values(out).some(Number.isNaN) ? null : out;
}

/* ── client ──────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/marketing-assignments`;

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

const post = (method: string, body: unknown, key?: string): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
  body: JSON.stringify(body),
});

export interface AssignBody {
  consultantIds: number[];
  marketerMemberId: number;
  backupMemberId?: number | null;
  priority?: string;
  status?: string;
  allowOverCapacity?: boolean;
}

export type UpdateField = { priority: string } | { status: string } | { backupMemberId: number } | { clearBackup: true };
export type UpdateBody = { consultantIds: number[] } & UpdateField;

export const marketingApi = {
  marketers: (orgId: number | string, q: { q?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (q.q && q.q.trim().length >= MIN_SEARCH) p.set("q", q.q.trim());
    if (q.status) p.set("status", q.status);
    const s = p.toString();
    return call<MarketerList>(`${base(orgId)}/marketers${s ? `?${s}` : ""}`, { cache: "no-store" });
  },
  consultants: (orgId: number | string, params: URLSearchParams) => call<ConsultantPage>(`${base(orgId)}/consultants?${params}`, { cache: "no-store" }),
  kpis: (orgId: number | string) => call<Kpis>(`${base(orgId)}/kpis`, { cache: "no-store" }),
  workload: (orgId: number | string) => call<WorkloadReport>(`${base(orgId)}/workload`, { cache: "no-store" }),
  filters: (orgId: number | string) => call<Filters>(`${base(orgId)}/filters`, { cache: "no-store" }),
  candidates: (orgId: number | string) => call<{ items: Option[] }>(`${base(orgId)}/marketers/candidates`, { cache: "no-store" }),
  addMarketer: (orgId: number | string, body: { memberId: number; capacity?: number; title?: string }) => call<Marketer>(`${base(orgId)}/marketers`, post("POST", body)),
  updateMarketer: (orgId: number | string, memberId: number, body: { capacity?: number; status?: string; title?: string }) =>
    call<Marketer>(`${base(orgId)}/marketers/${memberId}`, post("PATCH", body)),
  assign: (orgId: number | string, body: AssignBody, key: string = newKey()) => call<BulkResult>(`${base(orgId)}/assign`, post("POST", body, key)),
  update: (orgId: number | string, body: UpdateBody, key: string = newKey()) => call<BulkResult>(`${base(orgId)}/update`, post("POST", body, key)),
  unassign: (orgId: number | string, consultantIds: number[], key: string = newKey()) => call<BulkResult>(`${base(orgId)}/unassign`, post("POST", { consultantIds }, key)),
  restore: (orgId: number | string, rows: RestoreRow[], key: string = newKey()) => call<BulkResult>(`${base(orgId)}/restore`, post("POST", { rows }, key)),
};

/* ── Undo: the reverse of a change, from the `previous` values ───────────────────── */

/**
 * What it takes to put the changed rows back: rows with a `previous` carrying a marketer go back to it, rows whose `previous` is empty
 * (they had no assignment) are taken away again. Rows that were skipped or unchanged have no `previous` (null) and are left alone.
 */
export function undoRows(results: RowResult[]): RestoreRow[] {
  const out: RestoreRow[] = [];
  for (const r of results) {
    if (!r.ok || r.previous === null) continue;
    const p = r.previous;
    if (typeof p.marketerMemberId !== "number") {
      out.push({ consultantId: r.consultantId, marketerMemberId: null, backupMemberId: null, priority: "MEDIUM", status: "ACTIVE" });
      continue;
    }
    out.push({
      consultantId: r.consultantId,
      marketerMemberId: p.marketerMemberId,
      backupMemberId: typeof p.backupMemberId === "number" ? p.backupMemberId : null,
      priority: typeof p.priority === "string" ? p.priority : "MEDIUM",
      status: typeof p.status === "string" ? p.status : "ACTIVE",
    });
  }
  return out;
}

/** How many rows a call really changed (an UNCHANGED row has a null `previous`). */
export const changedCount = (r: BulkResult): number => r.results.filter((x) => x.ok && x.previous !== null).length;

/** One sentence for the outcome: "Assigned 3 consultants". `verb` is past tense and lower case. */
export function bulkSummary(r: BulkResult, verb: string, extra?: string): { title: string; description?: string; variant: "success" | "error" } {
  const changed = changedCount(r);
  const unchanged = r.ok - changed;
  const noun = (n: number) => `${n} ${n === 1 ? "consultant" : "consultants"}`;
  const parts: string[] = [];
  if (extra) parts.push(extra);
  if (unchanged > 0) parts.push(`${noun(unchanged)} already as asked`);
  if (r.skipped.length > 0) {
    const why = [...new Set(r.skipped.map((s) => skipText(s.reason)))].slice(0, 2).join("; ");
    parts.push(`${r.skipped.length} skipped: ${why}`);
  }
  if (changed === 0 && r.skipped.length > 0) return { title: `Nothing was ${verb}`, description: parts.join(". "), variant: "error" };
  return { title: `${verb[0].toUpperCase()}${verb.slice(1)} ${noun(changed)}`, description: parts.length ? parts.join(". ") : undefined, variant: "success" };
}

/** "Jessica would have 31 of 30 consultants, 1 over." for the over-capacity warning (also drawn before the call from the card's figures). */
export function overText(name: string, projected: number, capacity: number): string {
  const over = projected - capacity;
  return `${name} would have ${projected} of ${capacity} consultants${over > 0 ? `, ${over} over` : ""}.`;
}
