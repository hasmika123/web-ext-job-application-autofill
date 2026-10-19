/**
 * The Jobs page, pure part: the types of the jobs API (`/api/orgs/{orgId}/jobs`, a job is a `client_requirement`), the client that talks to
 * the BFF, the URL <-> query mapping (every filter, the page, the sort and the open job live in the address, so a link reproduces the view)
 * and the small helpers the page needs. Nothing here touches React.
 *
 * The page never invents a figure: a KPI tile with `previous = null` shows no delta; a job with no matches shows no avatars; a field the
 * API returns as null is not drawn.
 */
import { newKey, relativeTime, type ApiResult, type Tile as MemberTile } from "@/lib/ent/members";

export { newKey, relativeTime };
export type { ApiResult };

/* ── contract types (mirror JobDTO) ──────────────────────────────────────────────── */

export type JobStatus = "OPEN" | "IN_REVIEW" | "ON_HOLD" | "FILLED" | "CLOSED";
export type WorkMode = "REMOTE" | "HYBRID" | "ON_SITE";
export type Employment = "CONTRACT" | "FTE" | "C2C";
export type Experience = "JUNIOR" | "MID" | "SENIOR" | "LEAD";

export interface ClientRef {
  id: number;
  name: string;
}

export interface MatchChip {
  consultantId: number;
  name: string;
  score: number;
}

export interface MatchSummary {
  count: number;
  best: number | null;
  top: MatchChip[];
}

export interface JobRow {
  id: number;
  title: string;
  client: ClientRef;
  location: string | null;
  workMode: WorkMode | null;
  employment: Employment | null;
  experienceLevel: Experience | null;
  status: JobStatus;
  postedAt: string;
  skills: string[];
  submissions: number;
  matches: MatchSummary;
  positions: number;
  filled: number;
}

export interface JobPage {
  items: JobRow[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface JobTile {
  value: number;
  previous: number | null;
  delta: number | null;
  deltaPercent: number | null;
  series: number[];
}

export interface Facet {
  value: string;
  label: string;
  count: number;
}

export interface Facets {
  statuses: Facet[];
  clients: Facet[];
  locations: Facet[];
  workModes: Facet[];
  employment: Facet[];
  experience: Facet[];
  skills: Facet[];
}

export interface JobAccess {
  canCreate: boolean;
  canEdit: boolean;
  canAssign: boolean;
}

export interface ClientOption {
  id: number;
  name: string;
  contacts: Contact[];
}

export interface JobSummary {
  openJobs: JobTile;
  newThisWeek: JobTile;
  assignedOpportunities: JobTile;
  highMatchJobs: JobTile;
  asOf: string;
  facets: Facets;
  clientOptions: ClientOption[];
  access: JobAccess;
}

export interface Contact {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
}

export interface Rate {
  min: number | null;
  max: number | null;
  unit: "HOUR" | "YEAR" | null;
  currency: string;
}

export type MatchState = "SUGGESTED" | "ASSIGNED" | "DISMISSED";

export interface TopMatch {
  matchId: number;
  consultantId: number;
  name: string;
  title: string | null;
  availability: string | null;
  location: string | null;
  score: number;
  reason: string | null;
  status: MatchState;
  applicationCode: string | null;
}

export interface Submission {
  applicationId: number;
  code: string;
  consultantId: number;
  consultantName: string;
  stage: string;
  closedReason: string | null;
  appliedOn: string | null;
}

export interface ActivityItem {
  at: string;
  kind: "application" | "job";
  summary: string;
  actor: string | null;
}

export interface JobDetail {
  id: number;
  title: string;
  client: ClientRef;
  clientIndustry: string | null;
  contact: Contact | null;
  description: string | null;
  location: string | null;
  workMode: WorkMode | null;
  employment: Employment | null;
  durationLabel: string | null;
  experienceLevel: Experience | null;
  rate: Rate | null;
  positions: number;
  filled: number;
  status: JobStatus;
  postedAt: string;
  closedAt: string | null;
  skills: string[];
  topMatches: TopMatch[];
  submissions: Submission[];
  submissionCount: number;
  activity: ActivityItem[];
  version: string;
  access: JobAccess;
}

export interface RowResult {
  id: number;
  ok: boolean;
  reason: string | null;
  previous: { status?: JobStatus };
}

export interface BulkResult {
  action: string;
  requested: number;
  ok: number;
  skipped: { id: number; reason: string }[];
  results: RowResult[];
}

export interface AssignResult {
  job: JobDetail;
  applicationId: number;
  applicationCode: string;
  alreadyAssigned: boolean;
}

export interface CreateBody {
  title: string;
  clientId: number;
  contactId?: number | null;
  description?: string | null;
  location?: string | null;
  workMode?: WorkMode | null;
  employment?: Employment | null;
  durationLabel?: string | null;
  experienceLevel?: Experience | null;
  rateMin?: number | null;
  rateMax?: number | null;
  rateUnit?: "HOUR" | "YEAR" | null;
  positions?: number;
  status?: "OPEN" | "IN_REVIEW" | "ON_HOLD";
  skills?: string[];
}

export type PatchBody = Partial<{
  title: string;
  description: string | null;
  location: string | null;
  workMode: WorkMode | null;
  employment: Employment | null;
  durationLabel: string | null;
  experienceLevel: Experience | null;
  rateMin: number | null;
  rateMax: number | null;
  rateUnit: "HOUR" | "YEAR" | null;
  positions: number;
  filled: number;
  status: JobStatus;
  contactId: number | null;
  skills: string[];
}>;

/* ── labels ──────────────────────────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<string, string> = { OPEN: "Open", IN_REVIEW: "In Review", ON_HOLD: "On Hold", FILLED: "Filled", CLOSED: "Closed" };
export const WORK_MODE_LABEL: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ON_SITE: "On-site" };
export const EMPLOYMENT_LABEL: Record<string, string> = { CONTRACT: "Contract", FTE: "Full-time", C2C: "Corp-to-corp" };
export const EXPERIENCE_LABEL: Record<string, string> = { JUNIOR: "Junior (0-2 years)", MID: "Mid (3-5 years)", SENIOR: "Senior (5+ years)", LEAD: "Lead (8+ years)" };
export const AVAILABILITY_LABEL: Record<string, string> = { AVAILABLE: "Available", ON_PROJECT: "On project", NOTICE: "On notice", UNAVAILABLE: "Unavailable" };
export const STAGE_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  CLOSED: "Closed",
};

export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;
export const workModeLabel = (m: string | null | undefined) => (m ? (WORK_MODE_LABEL[m] ?? m) : "");
export const employmentLabel = (m: string | null | undefined) => (m ? (EMPLOYMENT_LABEL[m] ?? m) : "");
export const experienceLabel = (m: string | null | undefined) => (m ? (EXPERIENCE_LABEL[m] ?? m) : "");

/** "$120 - $160 / hour", "$140,000 / year", or "" when the job states no rate. */
export function rateText(r: Rate | null | undefined): string {
  if (!r || (r.min === null && r.max === null)) return "";
  const money = (n: number) => `${r.currency === "USD" ? "$" : `${r.currency} `}${n.toLocaleString("en-US")}`;
  const range = r.min !== null && r.max !== null && r.min !== r.max ? `${money(r.min)} - ${money(r.max)}` : money((r.min ?? r.max) as number);
  return r.unit ? `${range} / ${r.unit === "HOUR" ? "hour" : "year"}` : range;
}

/** The first three skill chips and how many are left ("+2"). */
export function skillChips(skills: string[], max = 3): { shown: string[]; more: number } {
  return { shown: skills.slice(0, max), more: Math.max(0, skills.length - max) };
}

/** "Mar 18, 2024" in UTC (the API sends instants). */
export function postedText(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * A match score as the page writes it: "92% match", or "Not scored" when the posting was never scored against the consultant (the
 * stored score stays 0 or null; only the words change, so a real 0 and "never computed" are not told apart as a number).
 */
export function matchScoreText(score: number | null | undefined): string {
  return typeof score === "number" && score > 0 ? `${Math.round(score)}% match` : "Not scored";
}

/** Initials of a consultant for the avatar circle (no photos exist). */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
}

export interface TileDelta {
  dir: "up" | "down" | "flat";
  text: string;
}

/**
 * The delta line of a KPI tile or null. `mode` picks how the board writes it: the plain difference ("+6") or the percent ("+33%", only
 * when the previous figure was above 0; otherwise the difference). A tile the API left without history shows nothing.
 */
export function tileDelta(t: Pick<JobTile, "previous" | "delta" | "deltaPercent"> | MemberTile | null | undefined, mode: "count" | "percent"): TileDelta | null {
  if (!t || t.previous === null || t.delta === null || typeof t.delta !== "number") return null;
  const dir = t.delta === 0 ? "flat" : t.delta > 0 ? "up" : "down";
  if (t.delta === 0) return { dir, text: mode === "percent" && t.deltaPercent !== null ? "0%" : "0" };
  const sign = t.delta > 0 ? "+" : "-";
  if (mode === "percent" && typeof t.deltaPercent === "number") {
    const n = Math.abs(t.deltaPercent);
    return { dir, text: `${sign}${Number.isInteger(n) ? n : n.toFixed(1)}%` };
  }
  return { dir, text: `${sign}${Math.abs(t.delta)}` };
}

/* ── the query and its URL ────────────────────────────────────────────────────────── */

export type SortKey = "posted" | "title" | "client" | "status" | "submissions" | "match";
export const SORT_KEYS: readonly SortKey[] = ["posted", "title", "client", "status", "submissions", "match"];
export type SortDir = "asc" | "desc";
export const PAGE_SIZES = [10, 25, 50] as const;
export const MIN_SEARCH = 2;

export interface JobQuery {
  q: string;
  status: string;
  clientId: string;
  location: string;
  workMode: string;
  skill: string;
  employment: string;
  experience: string;
  minMatch: string;
  sort: { key: SortKey; dir: SortDir };
  page: number;
  size: number;
}

export const DEFAULT_QUERY: JobQuery = {
  q: "",
  status: "",
  clientId: "",
  location: "",
  workMode: "",
  skill: "",
  employment: "",
  experience: "",
  minMatch: "",
  sort: { key: "posted", dir: "desc" },
  page: 0,
  size: 10,
};

const FILTER_KEYS = ["status", "clientId", "location", "workMode", "skill", "employment", "experience", "minMatch"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/** The call's parameters: `?q=..&status=OPEN&sort=posted&dir=desc&page=0&size=10`. */
export function listParams(q: JobQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q.trim().length >= MIN_SEARCH) p.set("q", q.q.trim());
  for (const k of FILTER_KEYS) if (q[k]) p.set(k, q[k]);
  p.set("sort", q.sort.key);
  p.set("dir", q.sort.dir);
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p;
}

/** The address of the page: only what differs from the default, plus the open job (`job=12`) and its tab. */
export function urlParams(q: JobQuery, openId: number | null, tab: string): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  for (const k of FILTER_KEYS) if (q[k]) p.set(k, q[k]);
  if (q.sort.key !== DEFAULT_QUERY.sort.key || q.sort.dir !== DEFAULT_QUERY.sort.dir) p.set("sort", `${q.sort.key},${q.sort.dir}`);
  if (q.page > 0) p.set("page", String(q.page + 1));
  if (q.size !== DEFAULT_QUERY.size) p.set("size", String(q.size));
  if (openId !== null) {
    p.set("job", String(openId));
    if (tab !== "overview") p.set("tab", tab);
  }
  return p;
}

/** The inverse of {@link urlParams}: junk in the address falls back to the default, never throws. */
export function parseUrl(sp: { get(name: string): string | null }): { query: JobQuery; openId: number | null; tab: string } {
  const query: JobQuery = { ...DEFAULT_QUERY, sort: { ...DEFAULT_QUERY.sort } };
  query.q = (sp.get("q") ?? "").slice(0, 80);
  for (const k of FILTER_KEYS) query[k] = (sp.get(k) ?? "").slice(0, 120);
  const sort = (sp.get("sort") ?? "").split(",");
  if ((SORT_KEYS as readonly string[]).includes(sort[0])) query.sort = { key: sort[0] as SortKey, dir: sort[1] === "asc" ? "asc" : sort[1] === "desc" ? "desc" : defaultDir(sort[0] as SortKey) };
  const page = Number(sp.get("page"));
  if (Number.isInteger(page) && page >= 1 && page < 10000) query.page = page - 1;
  const size = Number(sp.get("size"));
  if ((PAGE_SIZES as readonly number[]).includes(size)) query.size = size;
  const job = Number(sp.get("job"));
  const tab = sp.get("tab") ?? "overview";
  return { query, openId: Number.isInteger(job) && job > 0 ? job : null, tab: ["overview", "matches", "submissions", "activity"].includes(tab) ? tab : "overview" };
}

export function defaultDir(k: SortKey): SortDir {
  return k === "title" || k === "client" || k === "status" ? "asc" : "desc";
}

export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: defaultDir(key) };
}

export const activeFilterCount = (q: JobQuery): number => FILTER_KEYS.filter((k) => !!q[k]).length;
export const hasFilters = (q: JobQuery): boolean => q.q.trim().length >= MIN_SEARCH || activeFilterCount(q) > 0;

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** "1-10 of 24 jobs". */
export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0) return "0 jobs";
  const from = page * size + 1;
  return `${from}–${from + shown - 1} of ${total} ${total === 1 ? "job" : "jobs"}`;
}

/* ── errors ──────────────────────────────────────────────────────────────────────── */

const CODE_TEXT: Record<string, string> = {
  JOB_NOT_OPEN: "This job is not taking assignments right now. Reopen it first.",
  MATCH_STATE: "That match changed. Reload to see where it stands.",
  CONSULTANT_UNAVAILABLE: "This consultant is not active.",
  SENSITIVE_CONTENT: "That looks like sensitive personal data. We never store it, so please remove it.",
};

export function errorSentence(r: { status: number; code?: string; message: string; extra?: Record<string, unknown> }): string {
  if (r.status === 0) return r.message;
  if (r.status === 412 || r.status === 428) return "Someone else changed this job. It was reloaded, try again.";
  if (r.status === 404) return "This job is no longer in your view.";
  if (r.status === 422 && typeof r.extra?.field === "string" && r.message) return r.message;
  return (r.code && CODE_TEXT[r.code]) || r.message;
}

/* ── client ──────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/jobs`;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection.", extra: {} };
  }
  if (res.status === 204) return { ok: true, data: undefined as T, status: 204 };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T, status: res.status };
  const { error, message, code, ...extra } = body;
  return { ok: false, status: res.status, code: typeof code === "string" ? code : undefined, message: typeof error === "string" ? error : typeof message === "string" ? message : "Something went wrong.", extra };
}

const json = (method: string, body?: unknown, headers?: Record<string, string>): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const jobsApi = {
  list: (orgId: number | string, q: JobQuery) => call<JobPage>(`${base(orgId)}?${listParams(q)}`, { cache: "no-store" }),
  summary: (orgId: number | string) => call<JobSummary>(`${base(orgId)}/summary`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<JobDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  create: (orgId: number | string, body: CreateBody, key: string = newKey()) => call<JobDetail>(base(orgId), json("POST", body, { "idempotency-key": key })),
  patch: (orgId: number | string, id: number, body: PatchBody, version: string) => call<JobDetail>(`${base(orgId)}/${id}`, json("PATCH", body, { "if-match": version })),
  bulkStatus: (orgId: number | string, ids: number[], status: string, key: string = newKey()) =>
    call<BulkResult>(`${base(orgId)}/bulk/status`, json("POST", { ids, status }, { "idempotency-key": key })),
  assign: (orgId: number | string, jobId: number, matchId: number) => call<AssignResult>(`${base(orgId)}/${jobId}/matches/${matchId}/assign`, json("POST", {}, { "idempotency-key": newKey() })),
  setMatch: (orgId: number | string, jobId: number, matchId: number, status: "DISMISSED" | "SUGGESTED") => call<JobDetail>(`${base(orgId)}/${jobId}/matches/${matchId}`, json("PATCH", { status })),
};

/** The reverse of a bulk status call, grouped by the status each job had: one call per status. */
export function undoGroups(results: RowResult[]): { status: string; ids: number[] }[] {
  const by = new Map<string, number[]>();
  for (const r of results) {
    const prev = r.ok ? r.previous?.status : undefined;
    if (!prev) continue;
    by.set(prev, [...(by.get(prev) ?? []), r.id]);
  }
  return [...by.entries()].map(([status, ids]) => ({ status, ids }));
}

/** The sentence of a finished bulk call. */
export function bulkSummary(r: BulkResult, verb: string): { title: string; description?: string; variant: "success" | "error" } {
  const jobs = (n: number) => `${n} ${n === 1 ? "job" : "jobs"}`;
  if (r.ok === 0) return { title: `No jobs were ${verb}`, description: r.skipped.length > 0 ? "They were already in that state or are no longer in your view." : undefined, variant: "error" };
  const skipped = r.requested - r.ok;
  return { title: `${jobs(r.ok)} ${verb}`, description: skipped > 0 ? `${jobs(skipped)} skipped (already in that state or not in your view).` : undefined, variant: "success" };
}
