/**
 * The Consultant workspace Submissions and Approvals page's client logic (design/enterprise-consultant/submissions.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/submissions` (+ `/past`, `/{id}` and the two decisions), tolerant parsers and the pure helpers the
 * page uses (due-time wording, status pills, sort, paging text). Nothing here touches React and there is no fallback number: every figure
 * is the API's answer. Approving or declining only records the consultant's decision; nothing is sent to a client from here.
 */
import { initialsOf, shortDate, type Tone } from "./home";

export type SubStatus = "PENDING_APPROVAL" | "APPROVED" | "DECLINED" | "SUBMITTED_TO_CLIENT" | "CLIENT_INTERVIEW" | "NOT_SELECTED" | "CLOSED";
const STATUSES: readonly string[] = ["PENDING_APPROVAL", "APPROVED", "DECLINED", "SUBMITTED_TO_CLIENT", "CLIENT_INTERVIEW", "NOT_SELECTED", "CLOSED"];

export interface SubTile {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
  /** The window the change is about: "week" or "month". */
  vs: "week" | "month";
}

export interface SubRow {
  id: number;
  requirementId: number;
  title: string;
  employment: string | null;
  company: string | null;
  resumeId: number | null;
  resumeVersion: number | null;
  resumeUpdatedAt: string | null;
  marketerNote: string | null;
  marketerName: string | null;
  dueAt: string | null;
  /** Pending and due within 24 hours or already past due (the API's own definition). */
  attention: boolean;
  status: SubStatus;
  submittedOn: string | null;
  decidedAt: string | null;
  clientUpdate: string | null;
  clientUpdateAt: string | null;
  /** A demo stand-in row: the marketer / client side is not built yet. */
  sample: boolean;
}

export interface PastPage {
  items: SubRow[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
  status: string | null;
}

export interface SubmissionsView {
  orgId: number;
  generatedAt: string;
  name: string;
  tiles: { pending: SubTile; approved: SubTile; submitted: SubTile; attention: SubTile };
  pending: SubRow[];
  past: PastPage;
}

export interface ResumeSummary {
  id: number;
  name: string;
  versionNo: number | null;
  headline: string | null;
  summary: string | null;
  fileName: string | null;
  updatedAt: string | null;
}

export interface SubDetail {
  row: SubRow;
  declineReason: string | null;
  location: string | null;
  workMode: string | null;
  description: string | null;
  resume: ResumeSummary | null;
  createdAt: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function tileOf(v: unknown): SubTile {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: numOrNull(d.previous),
    deltaPct: numOrNull(d.deltaPct),
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
    vs: d.vs === "month" ? "month" : "week",
  };
}

export function parseRow(o: unknown): SubRow | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.title !== "string" || typeof o.status !== "string" || !STATUSES.includes(o.status)) return null;
  return {
    id: o.id,
    requirementId: num(o.requirementId),
    title: o.title,
    employment: strOrNull(o.employment),
    company: strOrNull(o.company),
    resumeId: numOrNull(o.resumeId),
    resumeVersion: numOrNull(o.resumeVersion),
    resumeUpdatedAt: strOrNull(o.resumeUpdatedAt),
    marketerNote: strOrNull(o.marketerNote),
    marketerName: strOrNull(o.marketerName),
    dueAt: strOrNull(o.dueAt),
    attention: o.attention === true,
    status: o.status as SubStatus,
    submittedOn: strOrNull(o.submittedOn),
    decidedAt: strOrNull(o.decidedAt),
    clientUpdate: strOrNull(o.clientUpdate),
    clientUpdateAt: strOrNull(o.clientUpdateAt),
    sample: o.sample === true,
  };
}

const rowsOf = (v: unknown): SubRow[] =>
  arr(v)
    .map(parseRow)
    .filter((r): r is SubRow => r !== null);

export function parsePast(body: unknown): PastPage | null {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  return {
    items: rowsOf(body.items),
    page: Math.max(0, num(body.page)),
    size: Math.max(1, num(body.size, 5)),
    total: Math.max(0, num(body.total)),
    totalPages: Math.max(0, num(body.totalPages)),
    status: strOrNull(body.status),
  };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseSubmissions(body: unknown): SubmissionsView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles)) return null;
  const past = parsePast(body.past);
  if (!past) return null;
  const t = body.tiles;
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    name: typeof body.name === "string" ? body.name : "",
    tiles: { pending: tileOf(t.pending), approved: tileOf(t.approved), submitted: tileOf(t.submitted), attention: tileOf(t.attention) },
    pending: rowsOf(body.pending),
    past,
  };
}

export function parseDetail(body: unknown): SubDetail | null {
  if (!isObj(body)) return null;
  const row = parseRow(body.row);
  if (!row) return null;
  const r = isObj(body.resume) && typeof body.resume.id === "number" && typeof body.resume.name === "string" ? body.resume : null;
  return {
    row,
    declineReason: strOrNull(body.declineReason),
    location: strOrNull(body.location),
    workMode: strOrNull(body.workMode),
    description: strOrNull(body.description),
    resume: r
      ? { id: r.id as number, name: r.name as string, versionNo: numOrNull(r.versionNo), headline: strOrNull(r.headline), summary: strOrNull(r.summary), fileName: strOrNull(r.fileName), updatedAt: strOrNull(r.updatedAt) }
      : null,
    createdAt: strOrNull(body.createdAt),
  };
}

/* ── due time ─────────────────────────────────────────────────────────────────────────── */

const time = (iso: string | null): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

const dayStart = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export type DueKind = "overdue" | "today" | "tomorrow" | "later" | "none";
export interface Due {
  kind: DueKind;
  /** The bold first line: "Overdue", "Today", "Tomorrow" or the date. */
  head: string;
  /** The second line: the date and time in the viewer's zone. */
  sub: string;
}

/** "Oct 14, 5:00 PM" / "Oct 16, 2024" in the viewer's zone. */
function stamp(ms: number, withYear: boolean): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
  return `${date}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** The Due Time cell: Today and Tomorrow are calendar days in the viewer's zone, a time already gone is "Overdue". */
export function dueOf(dueAt: string | null, now: number = Date.now()): Due {
  const t = time(dueAt);
  if (!t) return { kind: "none", head: "No due time", sub: "" };
  const days = Math.round((dayStart(t) - dayStart(now)) / 86_400_000);
  if (t < now) return { kind: "overdue", head: "Overdue", sub: stamp(t, false) };
  if (days <= 0) return { kind: "today", head: "Today", sub: stamp(t, false) };
  if (days === 1) return { kind: "tomorrow", head: "Tomorrow", sub: stamp(t, false) };
  const d = new Date(t);
  return {
    kind: "later",
    head: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    sub: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

export const DUE_TEXT: Record<DueKind, string> = { overdue: "text-v2-coral-ink", today: "text-v2-coral-ink", tomorrow: "text-v2-amber-ink", later: "text-ink", none: "text-muted" };

/** "Oct 08, 2024" over "11:06 AM" for a past row's Submitted On; both empty when the row was never submitted. */
export function whenOf(iso: string | null): { date: string; time: string } {
  const t = time(iso);
  if (!t) return { date: "", time: "" };
  const d = new Date(t);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

/** The Past Submissions "Submitted On" cell: when it went to the client, else when the consultant decided it. */
export const submittedStamp = (r: Pick<SubRow, "submittedOn" | "decidedAt">): string | null => r.submittedOn ?? r.decidedAt;

/* ── status, sort, paging ─────────────────────────────────────────────────────────────── */

export type StatusIcon = "send" | "check" | "x" | "users" | "clock" | "none";
export function statusInfo(status: SubStatus): { label: string; tone: Tone; icon: StatusIcon } {
  switch (status) {
    case "SUBMITTED_TO_CLIENT":
      return { label: "Submitted to Client", tone: "blue", icon: "send" };
    case "APPROVED":
      return { label: "Approved", tone: "green", icon: "check" };
    case "NOT_SELECTED":
      return { label: "Not Selected", tone: "red", icon: "x" };
    case "CLIENT_INTERVIEW":
      return { label: "Client Interview", tone: "violet", icon: "users" };
    case "DECLINED":
      return { label: "Declined", tone: "slate", icon: "x" };
    case "CLOSED":
      return { label: "Closed", tone: "slate", icon: "none" };
    default:
      return { label: "Awaiting Approval", tone: "amber", icon: "clock" };
  }
}

export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "SUBMITTED_TO_CLIENT", label: "Submitted to Client" },
  { value: "APPROVED", label: "Approved" },
  { value: "CLIENT_INTERVIEW", label: "Client Interview" },
  { value: "NOT_SELECTED", label: "Not Selected" },
  { value: "DECLINED", label: "Declined" },
  { value: "CLOSED", label: "Closed" },
];

export type SortKey = "due" | "title" | "client";
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "due", label: "Due Date (Soonest)" },
  { value: "title", label: "Job Title (A-Z)" },
  { value: "client", label: "Client (A-Z)" },
];

/** A new array. Due Date puts the soonest first and rows without a due time last; ties break on title so the order never jumps. */
export function sortPending(list: SubRow[], key: SortKey): SubRow[] {
  const byTitle = (a: SubRow, b: SubRow) => a.title.localeCompare(b.title) || a.id - b.id;
  const copy = [...list];
  if (key === "title") return copy.sort(byTitle);
  if (key === "client") return copy.sort((a, b) => (a.company ?? "~").localeCompare(b.company ?? "~") || byTitle(a, b));
  return copy.sort((a, b) => {
    const ta = time(a.dueAt) || Number.POSITIVE_INFINITY;
    const tb = time(b.dueAt) || Number.POSITIVE_INFINITY;
    return ta === tb ? byTitle(a, b) : ta - tb;
  });
}

/** "Showing 1-5 of 12" (empty text for no rows). */
export function rangeText(p: Pick<PastPage, "page" | "size" | "total">, shown: number): string {
  if (p.total === 0 || shown === 0) return "";
  const from = p.page * p.size + 1;
  return `Showing ${from}-${from + shown - 1} of ${p.total}`;
}

/** "v3" for a resume version, "" when the row has none. */
export const versionText = (v: number | null): string => (v === null ? "" : `v${v}`);

export { initialsOf, shortDate };

/* ── static default copy (should become admin config) ─────────────────────────────────── */

export const CHECKLIST: readonly string[] = [
  "Review the job description and requirements",
  "Confirm the correct resume version",
  "Check marketer's notes and client details",
  "Ensure your availability matches the opportunity",
  "Reach out if you have any questions",
];

export const APPROVE_COPY = "You're attesting this is accurate. Nothing is sent to the client by Kiwiply. Your marketer proceeds only after you approve.";

export const MIN_REASON = 3;
export const MAX_REASON = 300;

/** The reason the consultant typed, trimmed, or the sentence to show when it is not acceptable; the API re-checks everything. */
export function reasonProblem(reason: string): string | null {
  const v = reason.trim();
  if (v.length < MIN_REASON) return `Tell your marketer why, in at least ${MIN_REASON} characters.`;
  if (v.length > MAX_REASON) return `Keep it to ${MAX_REASON} characters or fewer.`;
  return null;
}

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/submissions`;

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

export const fetchSubmissions = (orgId: number | string, signal?: AbortSignal) => read(base(orgId), parseSubmissions, signal);

export function fetchPast(orgId: number | string, status: string, page: number, size: number, signal?: AbortSignal): Promise<Fetched<PastPage>> {
  const q = new URLSearchParams({ page: String(page), size: String(size), ...(status ? { status } : {}) });
  return read(`${base(orgId)}/past?${q.toString()}`, parsePast, signal);
}

export const fetchDetail = (orgId: number | string, id: number, signal?: AbortSignal) => read(`${base(orgId)}/${id}`, parseDetail, signal);

export interface WriteResult {
  ok: boolean;
  /** The HTTP status when the call reached the API (409 = already decided). */
  status?: number;
  /** The API's own message for a refusal (the sensitive-data one, "already approved"), when it sent one. */
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
    const j = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null;
    const m = j && typeof j.error === "string" ? j.error : j && typeof j.detail === "string" ? j.detail : undefined;
    return { ok: false, status: res.status, message: m };
  } catch {
    return { ok: false };
  }
}

export const approveSubmission = (orgId: number, id: number) => write(`${base(orgId)}/${id}/approve`);
export const declineSubmission = (orgId: number, id: number, reason: string) => write(`${base(orgId)}/${id}/decline`, { reason });
