/**
 * The Account Manager's Requirements page and Home tiles, pure part: the types of the requirements API (`/api/orgs/{orgId}/requirements`, a
 * requirement is a `client_requirement`), the client that talks to the BFF, the labels and the small helpers the pages need. Nothing here touches React.
 *
 * The pages never invent a figure: a tile is the API's count; a requirement with nobody put forward says so; a field the API leaves null is not drawn.
 * E1: putting a requirement in front of a consultant RECORDS it; the consultant decides and applies, and nothing here submits for anyone.
 */
import { newKey, relativeTime, type ApiResult } from "@/lib/ent/members";

export { newKey, relativeTime };
export type { ApiResult };

/* ── contract types (mirror RequirementDTO) ──────────────────────────────────────── */

export type ReqStatus = "OPEN" | "IN_REVIEW" | "ON_HOLD" | "FILLED" | "CLOSED";
export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type Source = "MANUAL" | "PASTED_TEXT" | "LINK";
export type WorkMode = "REMOTE" | "HYBRID" | "ON_SITE";

export interface ClientRef {
  id: number;
  name: string;
}

export interface Rate {
  min: number | null;
  max: number | null;
  unit: "HOUR" | "YEAR" | null;
  currency: string;
}

export interface ReqRow {
  id: number;
  title: string;
  client: ClientRef;
  location: string | null;
  workMode: WorkMode | null;
  priority: Priority;
  status: ReqStatus;
  positions: number;
  filled: number;
  rate: Rate | null;
  skills: string[];
  dueOn: string | null;
  postedAt: string;
  ageDays: number;
  consultantCount: number;
  source: string;
}

export interface ReqPage {
  items: ReqRow[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface Assignee {
  consultantId: number;
  name: string;
  title: string | null;
  matchStatus: string;
  stage: string | null;
  assignedAt: string | null;
}

export interface ContactRef {
  id: number;
  name: string;
  title: string | null;
}

export interface Access {
  canCreate: boolean;
  canEdit: boolean;
  canAssign: boolean;
}

export interface ReqDetail {
  requirement: ReqRow;
  description: string | null;
  employment: string | null;
  durationLabel: string | null;
  experienceLevel: string | null;
  contact: ContactRef | null;
  jobUrl: string | null;
  assignees: Assignee[];
  version: string;
  access: Access;
}

export interface ContactOption {
  id: number;
  name: string;
}

export interface ClientOption {
  id: number;
  name: string;
  contacts: ContactOption[];
}

export interface ReqSummary {
  open: number;
  unassigned: number;
  aging: number;
  onHold: number;
  contacts: number;
  agingDays: number;
  asOf: string;
  clientOptions: ClientOption[];
  access: Access;
}

export interface Candidate {
  consultantId: number;
  name: string;
  title: string | null;
  availability: string | null;
  score: number | null;
  matchStatus: string | null;
  pausedReason: string | null;
}

export interface AssignResult {
  requirement: ReqDetail;
  consultantId: number;
  created: boolean;
  existing: boolean;
}

export interface CreateBody {
  title: string;
  clientId: number;
  contactId?: number | null;
  description?: string | null;
  location?: string | null;
  workMode?: WorkMode | null;
  employment?: string | null;
  durationLabel?: string | null;
  experienceLevel?: string | null;
  rateMin?: number | null;
  rateMax?: number | null;
  rateUnit?: "HOUR" | "YEAR" | null;
  positions?: number;
  status?: "OPEN" | "ON_HOLD";
  priority?: Priority;
  dueOn?: string | null;
  skills?: string[];
  source?: Source;
  sourceUrl?: string | null;
}

/** What a PATCH may carry (the API refuses any other key). */
export type PatchBody = Partial<{
  title: string;
  description: string | null;
  location: string | null;
  workMode: WorkMode | null;
  employment: string | null;
  durationLabel: string | null;
  experienceLevel: string | null;
  rateMin: number | null;
  rateMax: number | null;
  rateUnit: "HOUR" | "YEAR" | null;
  positions: number;
  filled: number;
  status: ReqStatus;
  contactId: number | null;
  skills: string[];
  priority: Priority;
  dueOn: string | null;
}>;

/* ── labels ──────────────────────────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<string, string> = { OPEN: "Open", IN_REVIEW: "In review", ON_HOLD: "On hold", FILLED: "Filled", CLOSED: "Closed" };
export const STATUS_TONE: Record<string, string> = { OPEN: "green", IN_REVIEW: "blue", ON_HOLD: "amber", FILLED: "purple", CLOSED: "grey" };
export const PRIORITY_LABEL: Record<string, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
export const PRIORITY_TONE: Record<string, string> = { LOW: "grey", NORMAL: "blue", HIGH: "amber", URGENT: "red" };
export const SOURCE_LABEL: Record<string, string> = { MANUAL: "Typed in", PASTED_TEXT: "Pasted text", LINK: "Link" };
export const WORK_MODE_LABEL: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ON_SITE: "On site" };
export const EMPLOYMENT_LABEL: Record<string, string> = { CONTRACT: "Contract", C2C: "Corp to corp", FTE: "Full time" };
export const EXPERIENCE_LABEL: Record<string, string> = { JUNIOR: "Junior", MID: "Mid", SENIOR: "Senior", LEAD: "Lead" };
export const STATUS_OPTIONS: ReqStatus[] = ["OPEN", "IN_REVIEW", "ON_HOLD", "FILLED", "CLOSED"];
export const PRIORITY_OPTIONS: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;
export const priorityLabel = (p: string) => PRIORITY_LABEL[p] ?? p;
export const workModeLabel = (m: string | null | undefined) => (m ? (WORK_MODE_LABEL[m] ?? m) : "");

/** "$120 - $160 / hour", "$140,000 / year", or "" when the requirement states no rate. Business data only. */
export function rateText(r: Rate | null | undefined): string {
  if (!r || (r.min === null && r.max === null)) return "";
  const money = (n: number) => `${r.currency === "USD" ? "$" : `${r.currency} `}${n.toLocaleString("en-US")}`;
  const range = r.min !== null && r.max !== null && r.min !== r.max ? `${money(r.min)} - ${money(r.max)}` : money((r.min ?? r.max) as number);
  return r.unit ? `${range} / ${r.unit === "HOUR" ? "hour" : "year"}` : range;
}

/** "Dec 31, 2026" for a date-only value (no time zone shift), "" for none. */
export function dueText(d: string | null | undefined): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return "";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Today", "3 days", "1 day": how old a requirement is. */
export function ageText(days: number): string {
  if (days <= 0) return "Today";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Days from today to a due date (negative when it has passed); null for none. */
export function daysUntil(due: string | null | undefined, now: Date = new Date()): number | null {
  const m = due ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(due) : null;
  if (!m) return null;
  const a = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / 86_400_000);
}

export const initialsOf = (name: string): string => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
};

/* ── the query ───────────────────────────────────────────────────────────────────── */

export type SortKey = "posted" | "due" | "priority" | "title" | "client" | "status" | "age";
export type SortDir = "asc" | "desc";
export const PAGE_SIZES = [10, 25, 50] as const;
export const MIN_SEARCH = 2;

export interface ReqQuery {
  q: string;
  status: string;
  priority: string;
  clientId: string;
  /** "" (all), "NONE" (nobody put forward) or "ANY". */
  assigned: string;
  aging: boolean;
  sort: { key: SortKey; dir: SortDir };
  page: number;
  size: number;
}

export const DEFAULT_QUERY: ReqQuery = { q: "", status: "", priority: "", clientId: "", assigned: "", aging: false, sort: { key: "posted", dir: "desc" }, page: 0, size: 10 };

/** The call's parameters: `?q=..&status=OPEN&assigned=NONE&aging=true&sort=posted&dir=desc&page=0&size=10`. */
export function listParams(q: ReqQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q.trim().length >= MIN_SEARCH) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  if (q.priority) p.set("priority", q.priority);
  if (q.clientId) p.set("clientId", q.clientId);
  if (q.assigned) p.set("assigned", q.assigned);
  if (q.aging) p.set("aging", "true");
  p.set("sort", q.sort.key);
  p.set("dir", q.sort.dir);
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p;
}

export const hasFilters = (q: ReqQuery): boolean => q.q.trim().length >= MIN_SEARCH || !!q.status || !!q.priority || !!q.clientId || !!q.assigned || q.aging;

/** "1-10 of 24 requirements". */
export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0) return "0 requirements";
  const from = page * size + 1;
  return `${from}–${from + shown - 1} of ${total} ${total === 1 ? "requirement" : "requirements"}`;
}

/* ── errors ──────────────────────────────────────────────────────────────────────── */

const CODE_TEXT: Record<string, string> = {
  REQUIREMENT_EXISTS: "This client already has an open requirement like this one.",
  JOB_NOT_OPEN: "This requirement is not taking assignments right now. Reopen it first.",
  CONSULTANT_PAUSED: "This consultant is on a project and their marketing is paused, so nothing can be put in front of them.",
  RESUME_NOT_APPROVED: "This consultant needs an approved resume before a requirement can be put in front of them.",
  SENSITIVE_CONTENT: "That looks like sensitive personal data. We never store it, so please remove it.",
  IDEMPOTENCY_KEY_REUSED: "That was already sent with different details. Close this form and start again.",
};

export function errorSentence(r: { status: number; code?: string; message: string; extra?: Record<string, unknown> }): string {
  if (r.status === 0) return r.message;
  if (r.status === 412 || r.status === 428) return "Someone else changed this requirement. It was reloaded, try again.";
  if (r.status === 404) return "This requirement is no longer in your view.";
  if (r.code && CODE_TEXT[r.code]) return CODE_TEXT[r.code];
  return r.message;
}

/** The id of the requirement a REQUIREMENT_EXISTS refusal points at, if the API sent it. */
export function existingId(r: { code?: string; extra?: Record<string, unknown> }): number | null {
  const v = r.extra?.existingId;
  return r.code === "REQUIREMENT_EXISTS" && typeof v === "number" ? v : null;
}

/* ── client ──────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/requirements`;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection.", extra: {} };
  }
  if (res.status === 204) return { ok: true, data: undefined as T, status: 204 };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: (body as unknown) as T, status: res.status };
  const { error, message, code, ...extra } = body;
  return { ok: false, status: res.status, code: typeof code === "string" ? code : undefined, message: typeof error === "string" ? error : typeof message === "string" ? message : "Something went wrong.", extra };
}

const json = (method: string, body?: unknown, headers?: Record<string, string>): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const requirementsApi = {
  list: (orgId: number | string, q: ReqQuery) => call<ReqPage>(`${base(orgId)}?${listParams(q)}`, { cache: "no-store" }),
  summary: (orgId: number | string) => call<ReqSummary>(`${base(orgId)}/summary`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<ReqDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  candidates: (orgId: number | string, id: number, q = "") => call<Candidate[]>(`${base(orgId)}/${id}/candidates${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { cache: "no-store" }),
  create: (orgId: number | string, body: CreateBody, key: string = newKey()) => call<ReqDetail>(base(orgId), json("POST", body, { "idempotency-key": key })),
  patch: (orgId: number | string, id: number, body: PatchBody, version: string) => call<ReqDetail>(`${base(orgId)}/${id}`, json("PATCH", body, { "if-match": version })),
  assign: (orgId: number | string, id: number, consultantId: number) => call<AssignResult>(`${base(orgId)}/${id}/assignments`, json("POST", { consultantId })),
};
