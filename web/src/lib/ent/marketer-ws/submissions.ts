/**
 * The Marketing Submissions board's data (design: Submissions). One call to `GET /api/orgs/{orgId}/mkt/submissions` (through the BFF) draws
 * the KPI tiles, the table page, the Submissions-by-Status donut, the activity feed and the filter options. It is ASSIGNED-scope: only the
 * consultants the marketer is assigned to.
 *
 * E1: a submission here is a RECORD of a package a marketer prepared for a job. "New Submission" creates a draft, "send for approval" asks
 * the consultant/approver, and the status actions RECORD facts reported by the consultant or the client. Nothing here submits for a
 * consultant or sends anything to a client.
 */

export type ApprovalState = "DRAFT" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED";
export type SubStatus = "DRAFT" | "SUBMITTED" | "CLIENT_REVIEW" | "INTERVIEW_REQUESTED" | "REJECTED";
/** A Submissions-by-Status slice: an open approval counts as AWAITING_APPROVAL, otherwise the record's status. */
export type BucketKey = SubStatus | "AWAITING_APPROVAL";
export type RowAction = "REQUEST_APPROVAL" | "WITHDRAW" | "RECORD_APPROVAL" | "RECORD_STATUS";

export const BUCKET_KEYS: BucketKey[] = ["DRAFT", "AWAITING_APPROVAL", "SUBMITTED", "CLIENT_REVIEW", "INTERVIEW_REQUESTED", "REJECTED"];
export const BUCKET_LABELS: Record<BucketKey, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting Approval",
  SUBMITTED: "Submitted",
  CLIENT_REVIEW: "Client Review",
  INTERVIEW_REQUESTED: "Interview Requested",
  REJECTED: "Rejected",
};
export const APPROVAL_LABELS: Record<ApprovalState, string> = { DRAFT: "Draft", AWAITING_APPROVAL: "Awaiting Approval", APPROVED: "Approved", REJECTED: "Rejected" };
export const STATUS_LABELS: Record<SubStatus, string> = { DRAFT: "Draft", SUBMITTED: "Submitted", CLIENT_REVIEW: "Client Review", INTERVIEW_REQUESTED: "Interview Requested", REJECTED: "Rejected" };

export type KpiKey = "pendingApprovals" | "submittedToday" | "underClientReview" | "rejected";
export const KPI_KEYS: KpiKey[] = ["pendingApprovals", "submittedToday", "underClientReview", "rejected"];
export const KPI_TITLES: Record<KpiKey, string> = {
  pendingApprovals: "Pending Approvals",
  submittedToday: "Submitted Today",
  underClientReview: "Under Client Review",
  rejected: "Rejected",
};
/** The comparison text under each tile's delta (the board says "vs yesterday" for Submitted Today only). */
export const KPI_VERSUS: Record<KpiKey, string> = { pendingApprovals: "vs last week", submittedToday: "vs yesterday", underClientReview: "vs last week", rejected: "vs last week" };

export interface Kpi {
  value: number;
  /** Percent change against the comparison window; null = nothing to compare (no chip is drawn). */
  deltaPct: number | null;
  sparkline: number[];
}
export interface SubmissionRow {
  id: number;
  code: string;
  consultant: { id: number; name: string; role: string; avatarUrl: string | null };
  job: { id: number; title: string; code: string };
  client: { id: number; name: string };
  submissionDate: string;
  approvalState: ApprovalState;
  resume: { id: number | null; version: string; updatedOn: string | null } | null;
  status: SubStatus;
  bucket: BucketKey;
  actions: RowAction[];
}
export interface Bucket { key: BucketKey; label: string; count: number; pct: number }
export interface Breakdown { period: string; total: number; buckets: Bucket[] }
export type ActivityKind = "SUBMITTED" | "CLIENT_REVIEW" | "INTERVIEW" | "REJECTED" | "APPROVAL" | "DRAFT";
export interface ActivityRow { id: number; submissionId: number; kind: ActivityKind; text: string; detail: string | null; at: string }
export interface SavedView { id: number; name: string; q: string | null; status: string | null; approval: string | null; clientId: number | null; jobTitle: string | null; period: string | null }
export interface SubmissionsBoard {
  kpis: Partial<Record<KpiKey, Kpi>>;
  items: SubmissionRow[];
  total: number;
  page: number;
  size: number;
  breakdown: Breakdown | null;
  activity: ActivityRow[];
  filters: { clients: { id: number; name: string }[]; jobTitles: string[] };
  views: SavedView[];
}
export interface SubmissionEvent { id: number; kind: string; field: string | null; from: string | null; to: string | null; detail: string | null; at: string }
export interface SubmissionDetail { row: SubmissionRow; note: string | null; events: SubmissionEvent[] }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const strOrNull = (x: unknown): string | null => (typeof x === "string" ? x : null);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const oneOf = <T extends string>(x: unknown, all: readonly T[], d: T): T => (typeof x === "string" && (all as readonly string[]).includes(x) ? (x as T) : d);

const APPROVALS: ApprovalState[] = ["DRAFT", "AWAITING_APPROVAL", "APPROVED", "REJECTED"];
const STATUSES: SubStatus[] = ["DRAFT", "SUBMITTED", "CLIENT_REVIEW", "INTERVIEW_REQUESTED", "REJECTED"];
const ACTIONS: RowAction[] = ["REQUEST_APPROVAL", "WITHDRAW", "RECORD_APPROVAL", "RECORD_STATUS"];
const KINDS: ActivityKind[] = ["SUBMITTED", "CLIENT_REVIEW", "INTERVIEW", "REJECTED", "APPROVAL", "DRAFT"];

export function parseRow(r: Record<string, unknown>): SubmissionRow {
  const c = isObj(r.consultant) ? r.consultant : {};
  const j = isObj(r.job) ? r.job : {};
  const k = isObj(r.client) ? r.client : {};
  const rs = isObj(r.resume) ? r.resume : null;
  return {
    id: num(r.id),
    code: str(r.code),
    consultant: { id: num(c.id), name: str(c.name), role: str(c.role), avatarUrl: strOrNull(c.avatarUrl) },
    job: { id: num(j.id), title: str(j.title), code: str(j.code) },
    client: { id: num(k.id), name: str(k.name) },
    submissionDate: str(r.submissionDate),
    approvalState: oneOf(r.approvalState, APPROVALS, "DRAFT"),
    resume: rs && str(rs.version) ? { id: numOrNull(rs.id), version: str(rs.version), updatedOn: strOrNull(rs.updatedOn) } : null,
    status: oneOf(r.status, STATUSES, "DRAFT"),
    bucket: oneOf(r.bucket, BUCKET_KEYS, oneOf(r.status, STATUSES, "DRAFT")),
    actions: Array.isArray(r.actions) ? r.actions.filter((a): a is RowAction => (ACTIONS as string[]).includes(a as string)) : [],
  };
}

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseBoard(raw: unknown): SubmissionsBoard | null {
  if (!isObj(raw)) return null;
  const kpis: Partial<Record<KpiKey, Kpi>> = {};
  if (isObj(raw.kpis)) {
    for (const key of KPI_KEYS) {
      const k = raw.kpis[key];
      if (isObj(k) && typeof k.value === "number") kpis[key] = { value: num(k.value), deltaPct: numOrNull(k.deltaPct), sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [] };
    }
  }
  const b = raw.breakdown;
  const f = isObj(raw.filters) ? raw.filters : {};
  return {
    kpis,
    items: arr(raw.items).map(parseRow),
    total: num(raw.total),
    page: num(raw.page),
    size: num(raw.size, 10) || 10,
    breakdown: isObj(b)
      ? { period: str(b.period, "30d"), total: num(b.total), buckets: arr(b.buckets).filter((x) => (BUCKET_KEYS as string[]).includes(str(x.key))).map((x) => ({ key: str(x.key) as BucketKey, label: str(x.label), count: num(x.count), pct: num(x.pct) })) }
      : null,
    activity: arr(raw.activity).map((a) => ({ id: num(a.id), submissionId: num(a.submissionId), kind: oneOf(a.kind, KINDS, "DRAFT"), text: str(a.text), detail: strOrNull(a.detail), at: str(a.at) })),
    filters: { clients: arr(f.clients).map((c) => ({ id: num(c.id), name: str(c.name) })), jobTitles: Array.isArray(f.jobTitles) ? f.jobTitles.filter((t): t is string => typeof t === "string") : [] },
    views: arr(raw.views).map((v) => ({ id: num(v.id), name: str(v.name), q: strOrNull(v.q), status: strOrNull(v.status), approval: strOrNull(v.approval), clientId: numOrNull(v.clientId), jobTitle: strOrNull(v.jobTitle), period: strOrNull(v.period) })),
  };
}

export function parseDetail(raw: unknown): SubmissionDetail | null {
  if (!isObj(raw) || !isObj(raw.row)) return null;
  return {
    row: parseRow(raw.row),
    note: strOrNull(raw.note),
    events: arr(raw.events).map((e) => ({ id: num(e.id), kind: str(e.kind), field: strOrNull(e.field), from: strOrNull(e.from), to: strOrNull(e.to), detail: strOrNull(e.detail), at: str(e.at) })),
  };
}

/** What the toolbar controls hold. Empty string = "All". */
export interface BoardQuery {
  q: string;
  status: string;
  approval: string;
  clientId: string;
  jobTitle: string;
  period: string;
  donutPeriod: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  size: number;
}
export const DEFAULT_QUERY: BoardQuery = { q: "", status: "", approval: "", clientId: "", jobTitle: "", period: "30d", donutPeriod: "30d", sort: "date", dir: "desc", page: 0, size: 10 };
export const PERIODS: { value: string; label: string }[] = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "all", label: "All Time" },
];
export const PAGE_SIZES = [10, 25, 50];

export function boardQueryString(q: BoardQuery): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  if (q.approval) p.set("approval", q.approval);
  if (q.clientId) p.set("clientId", q.clientId);
  if (q.jobTitle) p.set("jobTitle", q.jobTitle);
  p.set("period", q.period);
  p.set("donutPeriod", q.donutPeriod);
  p.set("sort", q.sort);
  p.set("dir", q.dir);
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p.toString();
}

export type BoardFetch = { kind: "OK"; board: SubmissionsBoard } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchSubmissions(orgId: number | string, query: BoardQuery, signal?: AbortSignal): Promise<BoardFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/submissions?${boardQueryString(query)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const board = parseBoard(await res.json().catch(() => null));
    return board ? { kind: "OK", board } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export async function fetchSubmission(orgId: number | string, id: number, signal?: AbortSignal): Promise<SubmissionDetail | null> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/submissions/${id}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    return res.ok ? parseDetail(await res.json().catch(() => null)) : null;
  } catch {
    return null;
  }
}

export interface SubmissionOptions {
  consultants: { id: number; name: string; role: string }[];
  jobs: { id: number; title: string; code: string; client: string }[];
}

/** The New Submission dialog's choices (the consultants you are assigned to, open jobs); null when it could not load. */
export async function fetchOptions(orgId: number | string, signal?: AbortSignal): Promise<SubmissionOptions | null> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/submissions/options`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (!res.ok) return null;
    const raw: unknown = await res.json().catch(() => null);
    if (!isObj(raw)) return null;
    return {
      consultants: arr(raw.consultants).map((c) => ({ id: num(c.id), name: str(c.name), role: str(c.role) })),
      jobs: arr(raw.jobs).map((j) => ({ id: num(j.id), title: str(j.title), code: str(j.code), client: str(j.client) })),
    };
  } catch {
    return null;
  }
}

/** A write's answer: `error` is the API's human message (409/422), shown inline by the page. */
export type WriteResult<T = unknown> = { ok: true; data: T } | { ok: false; status: number; error: string; code: string | null };

async function write<T>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, map?: (raw: unknown) => T): Promise<WriteResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) {
      const raw: unknown = res.status === 204 ? null : await res.json().catch(() => null);
      return { ok: true, data: (map ? map(raw) : raw) as T };
    }
    const j: unknown = await res.json().catch(() => null);
    const o = isObj(j) ? j : {};
    return { ok: false, status: res.status, error: str(o.error, "That didn't work. Nothing has changed."), code: strOrNull(o.code) };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Nothing has changed.", code: null };
  }
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/mkt/submissions`;
const rowOf = (raw: unknown): SubmissionRow => parseRow(isObj(raw) ? raw : {});

/** Prepare a package for a job: creates a DRAFT record. Nothing is sent to anyone. */
export const createSubmission = (orgId: number | string, body: { consultantId: number; requirementId: number; resumeId?: number | null; note?: string }) =>
  write(base(orgId), "POST", body, rowOf);
/** Ask the consultant/approver to approve a draft. */
export const requestApproval = (orgId: number | string, id: number) => write(`${base(orgId)}/${id}/request-approval`, "POST", undefined, rowOf);
/** Record the approver's decision as the consultant/approver told the marketer. */
export const recordApproval = (orgId: number | string, id: number, decision: "APPROVED" | "REJECTED", note?: string) =>
  write(`${base(orgId)}/${id}/approval`, "POST", { decision, ...(note ? { note } : {}) }, rowOf);
/** Record a fact about where the submission stands (the consultant submitted; the client moved it on). */
export const recordStatus = (orgId: number | string, id: number, status: "SUBMITTED" | "CLIENT_REVIEW" | "INTERVIEW_REQUESTED" | "REJECTED", note?: string) =>
  write(`${base(orgId)}/${id}/status`, "PATCH", { status, ...(note ? { note } : {}) }, rowOf);
/** Withdraw a draft. */
export const withdrawSubmission = (orgId: number | string, id: number) => write<null>(`${base(orgId)}/${id}`, "DELETE");
/** "Save View". */
export const saveView = (orgId: number | string, body: { name: string; q?: string; status?: string; approval?: string; clientId?: number | null; jobTitle?: string; period?: string }) =>
  write<SavedView>(`${base(orgId)}/views`, "POST", body, (raw) => {
    const v = isObj(raw) ? raw : {};
    return { id: num(v.id), name: str(v.name), q: strOrNull(v.q), status: strOrNull(v.status), approval: strOrNull(v.approval), clientId: numOrNull(v.clientId), jobTitle: strOrNull(v.jobTitle), period: strOrNull(v.period) };
  });
export const deleteView = (orgId: number | string, viewId: number) => write<null>(`${base(orgId)}/views/${viewId}`, "DELETE");

/** Board art served from `public/ent/marketer/submissions` (cropped from the approved board). A real `avatarUrl` from the API always wins. */
export const SUBMISSIONS_ART_BASE = "/ent/marketer/submissions";
export const HELP_BANNER = `${SUBMISSIONS_ART_BASE}/help-banner.png`;
const PEOPLE: Record<string, string> = {
  "alex morgan": "alex-morgan", "priya sharma": "priya-sharma", "michael park": "michael-park", "emily lawson": "emily-lawson", "david kim": "david-kim",
  "sophia patel": "sophia-patel", "daniel brooks": "daniel-brooks", "olivia martinez": "olivia-martinez", "james wilson": "james-wilson", "chloe nguyen": "chloe-nguyen",
};
const LOGOS: Record<string, string> = {
  techcorp: "techcorp", "global bank": "global-bank", cloudscale: "cloudscale", healthplus: "healthplus", dataworks: "dataworks", nextgen: "nextgen",
  innovatelab: "innovatelab", brightpath: "brightpath", "acme inc": "acme-inc", riverstone: "riverstone",
};
export const photoFor = (name: string, url: string | null): string | null => url ?? (PEOPLE[name.trim().toLowerCase()] ? `${SUBMISSIONS_ART_BASE}/${PEOPLE[name.trim().toLowerCase()]}.png` : null);
export const logoFor = (client: string): string | null => (LOGOS[client.trim().toLowerCase()] ? `${SUBMISSIONS_ART_BASE}/logo-${LOGOS[client.trim().toLowerCase()]}.png` : null);

/** "Jan 28, 2025". */
export function dateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
/** "Jan 27" (the resume's "Updated" line). */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The page numbers the footer draws: «, the first pages, an ellipsis, the last page, » (the board shows 1 2 3 4 5 … 9). */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const out: (number | "gap")[] = [];
  if (page < 4) {
    for (let i = 0; i < 5; i++) out.push(i);
    out.push("gap", pages - 1);
  } else if (page > pages - 5) {
    out.push(0, "gap");
    for (let i = pages - 5; i < pages; i++) out.push(i);
  } else {
    out.push(0, "gap", page - 1, page, page + 1, "gap", pages - 1);
  }
  return out;
}
