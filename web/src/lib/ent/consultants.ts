/**
 * The Consultants page, pure part: the types of the consultants API (mirror ConsultantDTO), the client that talks to the BFF under
 * `/api/orgs/{orgId}/consultants`, the URL state of the page (every filter, the page, the sort, the open consultant and the drawer tab live in
 * the address so a link reproduces the view), and the small helpers the page needs (labels, deltas, Undo plans, error sentences). Nothing here
 * touches React.
 *
 * The page never invents a figure: a tile with `previous = null` draws no delta; a field the API returns null (no marketer, no next interview)
 * reads as a dash or an honest empty state.
 */
import { errorSentence as memberErrorSentence, formatDate, newKey, relativeTime, type ApiResult } from "@/lib/ent/members";

export { formatDate, newKey, relativeTime };
export type { ApiResult };

/* ── contract types ───────────────────────────────────────────────────────────────── */

export type Availability = "AVAILABLE" | "ON_PROJECT" | "NOTICE" | "UNAVAILABLE";
export type LicenseStatus = "ACTIVE" | "EXPIRING" | "PENDING" | "NEEDS_REVIEW";
export type WorkMode = "REMOTE" | "HYBRID" | "ONSITE";

export interface PersonRef {
  memberId: number;
  name: string;
}

export interface GroupRef {
  id: number;
  name: string;
}

export interface NextInterview {
  scheduledAt: string;
  roundLabel: string | null;
}

export interface ConsultantRow {
  id: number;
  name: string;
  email: string;
  jobTitle: string | null;
  primarySkills: string[];
  skillCount: number;
  yearsExperience: number | null;
  location: string | null;
  workMode: string | null;
  marketer: PersonRef | null;
  availability: Availability;
  availableFrom: string | null;
  license: LicenseStatus;
  licenseValidUntil: string | null;
  profileCompleteness: number;
  activeApplications: number;
  nextInterview: NextInterview | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface ConsultantPage {
  items: ConsultantRow[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface Tile {
  value: number;
  previous: number | null;
  delta: number | null;
  deltaPercent: number | null;
  series: number[];
}

export interface ConsultantCounts {
  asOf: string | null;
  scope: string;
  total: Tile;
  available: Tile;
  onProject: Tile;
  needsReview: Tile;
}

export interface Skill {
  skill: string;
  primary: boolean;
}

export interface Checklist {
  basic: boolean;
  skills: boolean;
  resume: boolean;
  certifications: boolean;
  preferences: boolean;
}

export interface AssignmentInfo {
  marketer: PersonRef;
  backup: PersonRef | null;
  priority: string;
  status: string;
  assignedAt: string | null;
}

export interface Actions {
  edit: boolean;
  assignMarketer: boolean;
  deactivate: boolean;
  reactivate: boolean;
  createApplication: boolean;
}

export interface ConsultantDetail {
  consultant: ConsultantRow;
  memberId: number | null;
  headline: string | null;
  phone: string | null;
  timeZone: string | null;
  preferredContact: string | null;
  skills: Skill[];
  availabilitySince: string | null;
  marketingStatus: string;
  department: GroupRef | null;
  assignment: AssignmentInfo | null;
  checklist: Checklist;
  applicationsTotal: number;
  upcomingInterviews: number;
  resumeCount: number;
  actions: Actions;
  version: string;
}

export interface JobAssignment {
  requirementId: number;
  title: string;
  clientName: string;
  jobStatus: string;
  score: number | null;
  assignedAt: string | null;
}

export interface PlacementItem {
  id: number;
  roleTitle: string;
  clientName: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

export interface AssignmentsTab {
  assignment: AssignmentInfo | null;
  jobs: JobAssignment[];
  placements: PlacementItem[];
}

export interface ApplicationItem {
  id: number;
  code: string;
  jobTitle: string;
  clientName: string;
  stage: string;
  closedReason: string | null;
  appliedOn: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  stageChangedAt: string | null;
}

export interface InterviewItem {
  id: number;
  clientName: string;
  scheduledAt: string;
  durationMinutes: number | null;
  roundLabel: string | null;
  status: string;
}

export interface ApplicationsTab {
  items: ApplicationItem[];
  interviews: InterviewItem[];
}

export interface ActivityItem {
  kind: "APPLICATION" | "AUDIT";
  at: string;
  actor: string | null;
  action: string;
  code: string | null;
  jobTitle: string | null;
  fromStage: string | null;
  toStage: string | null;
  detail: string | null;
}

export interface MarketerOption {
  memberId: number;
  name: string;
  workload: number;
  capacity: number;
  status: string;
}

export interface Filters {
  skills: string[];
  marketers: MarketerOption[];
  departments: GroupRef[];
}

export interface JobOption {
  id: number;
  title: string;
  clientName: string;
  score: number | null;
}

export interface RowResult {
  id: number;
  ok: boolean;
  reason: string | null;
  previous: Record<string, unknown> | null;
}

export interface BulkResult {
  action: string;
  requested: number;
  ok: number;
  results: RowResult[];
}

export interface CreateBody {
  displayName: string;
  email: string;
  jobTitle?: string;
  yearsExperience?: number;
  locationLabel?: string;
  workMode?: string;
  skills?: string[];
  departmentGroupId?: number | null;
  /** The organization member this consultant IS (their sign-in opens the consultant workspace). Left out, a free member with the same address is linked by the API. */
  memberId?: number | null;
}

/** A member who holds the Consultant role and has no profile yet: the "link to an existing person" pickers. */
export interface LinkableMember {
  memberId: number;
  name: string;
  email: string | null;
  status: string;
}

export interface PatchBody {
  jobTitle?: string | null;
  yearsExperience?: number | null;
  locationLabel?: string | null;
  workMode?: string | null;
  availabilityStatus?: Availability;
  availableFrom?: string | null;
  licenseStatus?: LicenseStatus;
  licenseValidUntil?: string | null;
  departmentGroupId?: number | null;
  phone?: string | null;
  timeZone?: string | null;
  preferredContact?: string | null;
}

/* ── labels ───────────────────────────────────────────────────────────────────────── */

export const AVAILABILITY_LABEL: Record<string, string> = { AVAILABLE: "Available", ON_PROJECT: "On project", NOTICE: "On notice", UNAVAILABLE: "Unavailable" };
export const LICENSE_LABEL: Record<string, string> = { ACTIVE: "Active", EXPIRING: "Expiring", PENDING: "Pending", NEEDS_REVIEW: "Needs Review" };
export const WORK_MODE_LABEL: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" };
export const STAGE_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  CLOSED: "Closed",
};
export const CLOSED_LABEL: Record<string, string> = { HIRED: "Hired", REJECTED: "Rejected", WITHDRAWN: "Withdrawn", NO_RESPONSE: "No response" };

export const label = (map: Record<string, string>, key: string | null | undefined): string => (key ? (map[key] ?? key.toLowerCase().replace(/_/g, " ")) : "");

export const AVAILABILITY_OPTIONS = (Object.keys(AVAILABILITY_LABEL) as Availability[]).map((v) => ({ value: v, label: AVAILABILITY_LABEL[v] }));
export const LICENSE_OPTIONS = (Object.keys(LICENSE_LABEL) as LicenseStatus[]).map((v) => ({ value: v, label: LICENSE_LABEL[v] }));
export const WORK_MODE_OPTIONS = (Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((v) => ({ value: v, label: WORK_MODE_LABEL[v] }));

/** "8 yrs" (the board's wording), a dash when unknown. */
export function experienceText(years: number | null | undefined): string {
  if (years === null || years === undefined) return "—";
  return `${years} ${years === 1 ? "yr" : "yrs"}`;
}

/** "New York, NY (Remote)" from the location label and the work mode. */
export function locationText(location: string | null | undefined, workMode: string | null | undefined): string {
  const mode = workMode ? label(WORK_MODE_LABEL, workMode) : "";
  if (location && mode) return `${location} (${mode})`;
  return location || mode || "—";
}

/** "Apr 22, 2024" + "10:00 AM" (UTC, like every date of the enterprise pages). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/** Initials of a name: first letters of the first and last word. */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}

/** The checklist as ordered, labelled rows. */
export function checklistRows(c: Checklist): { key: keyof Checklist; label: string; done: boolean }[] {
  return [
    { key: "basic", label: "Basic Information", done: c.basic },
    { key: "skills", label: "Skills & Experience", done: c.skills },
    { key: "resume", label: "Resume", done: c.resume },
    { key: "certifications", label: "Certifications", done: c.certifications },
    { key: "preferences", label: "Preferences", done: c.preferences },
  ];
}

/** A sentence for an activity item, from its structured fields. */
export function activitySentence(a: ActivityItem): string {
  if (a.kind === "AUDIT") {
    const what: Record<string, string> = {
      CONSULTANT_CREATE: "Added the consultant",
      CONSULTANT_UPDATE: "Updated the profile",
      CONSULTANT_ASSIGN: "Changed the marketer",
      CONSULTANT_DEACTIVATE: "Deactivated the consultant",
      CONSULTANT_REACTIVATE: "Reactivated the consultant",
    };
    return what[a.action] ?? label({}, a.action);
  }
  const job = a.jobTitle ? ` for ${a.jobTitle}` : "";
  if (a.action === "CREATED") return `Application ${a.code ?? ""}${job} created`.replace("  ", " ");
  if (a.action === "NOTE") return `Note added on ${a.code ?? "an application"}`;
  const to = label(STAGE_LABEL, a.toStage);
  const from = label(STAGE_LABEL, a.fromStage);
  return `${a.code ?? "Application"}${job} moved${from ? ` from ${from}` : ""} to ${to}`;
}

/* ── tiles ────────────────────────────────────────────────────────────────────────── */

export interface TileDelta {
  dir: "up" | "down" | "flat";
  text: string;
}

/**
 * The "vs last month" chip of a tile: null (nothing drawn) when the API gave no comparison. A percent when it gave one, otherwise the plain
 * difference ("+3").
 */
export function tileDelta(t: Tile | null | undefined): TileDelta | null {
  if (!t || t.previous === null || t.delta === null || typeof t.delta !== "number") return null;
  const dir = t.delta === 0 ? "flat" : t.delta > 0 ? "up" : "down";
  if (t.deltaPercent !== null && typeof t.deltaPercent === "number") {
    if (t.delta === 0) return { dir, text: "0%" };
    const n = Math.abs(t.deltaPercent);
    return { dir, text: `${n}%` };
  }
  if (t.delta === 0) return { dir, text: "0" };
  return { dir, text: `+${Math.abs(t.delta)}` };
}

/* ── URL state ────────────────────────────────────────────────────────────────────── */

export type SortKey = "name" | "experience" | "availability" | "license" | "profile" | "joined";
export type SortDir = "asc" | "desc";

export interface ListQuery {
  q: string;
  availability: string;
  skill: string;
  license: string;
  /** A seat id, or "none" for unassigned. */
  marketerId: string;
  workMode: string;
  /** "" = active (the default); "INACTIVE". */
  status: string;
  sort: { key: SortKey; dir: SortDir };
  page: number;
  size: number;
}

export const PAGE_SIZES = [10, 25, 50] as const;
export const MIN_SEARCH = 2;
export const DEFAULT_QUERY: ListQuery = { q: "", availability: "", skill: "", license: "", marketerId: "", workMode: "", status: "", sort: { key: "name", dir: "asc" }, page: 0, size: 10 };

export type DetailTab = "overview" | "assignments" | "applications" | "activity";
export const TABS: DetailTab[] = ["overview", "assignments", "applications", "activity"];

export interface PageState {
  query: ListQuery;
  selected: number | null;
  tab: DetailTab;
}

const SORT_KEYS: SortKey[] = ["name", "experience", "availability", "license", "profile", "joined"];

/** The page state a URL says; anything unknown falls back to the default (a hand-edited link never breaks the page). */
export function stateFromParams(sp: URLSearchParams): PageState {
  const sortRaw = sp.get("sort") ?? "";
  const [sk, sd] = sortRaw.split(",");
  const key = SORT_KEYS.includes(sk as SortKey) ? (sk as SortKey) : DEFAULT_QUERY.sort.key;
  const dir: SortDir = sd === "desc" ? "desc" : sd === "asc" ? "asc" : DEFAULT_QUERY.sort.dir;
  const page = Number.parseInt(sp.get("page") ?? "", 10);
  const size = Number.parseInt(sp.get("size") ?? "", 10);
  const sel = Number.parseInt(sp.get("c") ?? "", 10);
  const tab = sp.get("tab") as DetailTab | null;
  return {
    query: {
      q: sp.get("q") ?? "",
      availability: sp.get("availability") ?? "",
      skill: sp.get("skill") ?? "",
      license: sp.get("license") ?? "",
      marketerId: sp.get("marketer") ?? "",
      workMode: sp.get("workMode") ?? "",
      status: sp.get("status") === "INACTIVE" ? "INACTIVE" : "",
      sort: { key: sortRaw ? key : DEFAULT_QUERY.sort.key, dir: sortRaw ? dir : DEFAULT_QUERY.sort.dir },
      page: Number.isFinite(page) && page > 0 ? page : 0,
      size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_QUERY.size,
    },
    selected: Number.isFinite(sel) && sel > 0 ? sel : null,
    tab: tab && TABS.includes(tab) ? tab : "overview",
  };
}

/** The address of a page state: defaults are left out, so the clean list is the bare path. */
export function paramsFromState(s: PageState): URLSearchParams {
  const p = new URLSearchParams();
  const q = s.query;
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.availability) p.set("availability", q.availability);
  if (q.skill) p.set("skill", q.skill);
  if (q.license) p.set("license", q.license);
  if (q.marketerId) p.set("marketer", q.marketerId);
  if (q.workMode) p.set("workMode", q.workMode);
  if (q.status) p.set("status", q.status);
  if (q.sort.key !== DEFAULT_QUERY.sort.key || q.sort.dir !== DEFAULT_QUERY.sort.dir) p.set("sort", `${q.sort.key},${q.sort.dir}`);
  if (q.page > 0) p.set("page", String(q.page));
  if (q.size !== DEFAULT_QUERY.size) p.set("size", String(q.size));
  if (s.selected !== null) {
    p.set("c", String(s.selected));
    if (s.tab !== "overview") p.set("tab", s.tab);
  }
  return p;
}

/** `?q=...` for the list call: the search waits for a second character. */
export function listParams(q: ListQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q.trim().length >= MIN_SEARCH) p.set("q", q.q.trim());
  if (q.availability) p.set("availability", q.availability);
  if (q.skill) p.set("skill", q.skill);
  if (q.license) p.set("license", q.license);
  if (q.marketerId) p.set("marketerId", q.marketerId);
  if (q.workMode) p.set("workMode", q.workMode);
  if (q.status) p.set("status", q.status);
  p.set("sort", `${q.sort.key},${q.sort.dir}`);
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p;
}

export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "joined" || key === "profile" || key === "experience" ? "desc" : "asc" };
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

/** "1-10 of 248 consultants" (the board's wording). */
export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0 || shown === 0) return "No consultants";
  const from = page * size + 1;
  const to = page * size + shown;
  return `${from}-${to} of ${total.toLocaleString("en-US")} ${total === 1 ? "consultant" : "consultants"}`;
}

/* ── errors ───────────────────────────────────────────────────────────────────────── */

const SENTENCES: Record<string, string> = {
  CONSULTANT_EXISTS: "A consultant with this email already exists.",
  MARKETER_INVALID: "Choose an active marketer from your team.",
  APPLICATION_EXISTS: "This consultant already has an application for that job.",
  JOB_NOT_OPEN: "That job is no longer open.",
  CONSULTANT_INACTIVE: "This consultant is inactive. Reactivate them first.",
  SENSITIVE_CONTENT: "This looks like it contains sensitive personal data. We never store it, so please remove it.",
  IDEMPOTENCY_KEY_REUSED: "That request was already sent with different details. Try again.",
};

export function errorSentence(r: { status: number; code?: string; message: string; extra?: Record<string, unknown> }): string {
  if (r.code && SENTENCES[r.code]) return SENTENCES[r.code];
  if (r.status === 412 || r.status === 428) return "Someone else changed this consultant. Reload to see the latest.";
  if (r.status === 404) return "That consultant is no longer in your view.";
  if (r.status === 0) return r.message;
  return memberErrorSentence(r);
}

/** How a per-row skip reads in the summary toast. */
export function skipText(reason: string): string {
  const map: Record<string, string> = { NOT_FOUND: "not in your view", INACTIVE: "inactive", UNCHANGED: "already set" };
  return map[reason] ?? reason.toLowerCase().replace(/_/g, " ");
}

export function bulkSummary(res: BulkResult, verb: string): { title: string; description?: string; variant: "success" | "error" } {
  const skipped = res.results.filter((r) => !r.ok);
  const title = res.ok === 0 ? `Nothing to ${verb.split(" ")[0]}` : `${res.ok} ${res.ok === 1 ? "consultant" : "consultants"} ${verb}`;
  if (skipped.length === 0) return { title, variant: "success" };
  const reasons = new Map<string, number>();
  for (const s of skipped) reasons.set(skipText(s.reason ?? ""), (reasons.get(skipText(s.reason ?? "")) ?? 0) + 1);
  const description = `Skipped ${skipped.length}: ${[...reasons.entries()].map(([r, n]) => `${n} ${r}`).join(", ")}.`;
  return { title, description, variant: res.ok === 0 ? "error" : "success" };
}

/* ── Undo ─────────────────────────────────────────────────────────────────────────── */

export type UndoPlan =
  | { kind: "availability"; ids: number[]; availability: Availability }
  | { kind: "marketer"; ids: number[]; marketerMemberId: number }
  | { kind: "status"; ids: number[]; action: "DEACTIVATE" | "REACTIVATE" };

/**
 * What it takes to put the changed rows back, from the `previous` values the API returned. Rows grouped by their shared previous value so one call
 * restores many. A consultant who had no marketer before cannot be un-assigned (there is no such call): that part is left, and the toast says so.
 */
export function undoPlan(kind: UndoPlan["kind"], results: RowResult[]): UndoPlan[] {
  const changed = results.filter((r) => r.ok && r.previous);
  const groups = new Map<string, number[]>();
  for (const r of changed) {
    const v = kind === "availability" ? r.previous!.availability : kind === "marketer" ? r.previous!.marketerMemberId : r.previous!.status;
    if (v === null || v === undefined) continue;
    const k = String(v);
    groups.set(k, [...(groups.get(k) ?? []), r.id]);
  }
  return [...groups.entries()].map(([v, ids]): UndoPlan => {
    if (kind === "availability") return { kind, ids, availability: v as Availability };
    if (kind === "marketer") return { kind, ids, marketerMemberId: Number(v) };
    return { kind: "status", ids, action: v === "ACTIVE" ? "REACTIVATE" : "DEACTIVATE" };
  });
}

/* ── client ───────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/consultants`;

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

type Id = number | string;

export const consultantsApi = {
  list: (orgId: Id, q: ListQuery) => call<ConsultantPage>(`${base(orgId)}?${listParams(q)}`, { cache: "no-store" }),
  counts: (orgId: Id) => call<ConsultantCounts>(`${base(orgId)}/counts`, { cache: "no-store" }),
  filters: (orgId: Id) => call<Filters>(`${base(orgId)}/filters`, { cache: "no-store" }),
  detail: (orgId: Id, id: number) => call<ConsultantDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  assignments: (orgId: Id, id: number) => call<AssignmentsTab>(`${base(orgId)}/${id}/assignments`, { cache: "no-store" }),
  applications: (orgId: Id, id: number) => call<ApplicationsTab>(`${base(orgId)}/${id}/applications`, { cache: "no-store" }),
  activity: (orgId: Id, id: number) => call<{ items: ActivityItem[] }>(`${base(orgId)}/${id}/activity?limit=20`, { cache: "no-store" }),
  jobOptions: (orgId: Id, id: number) => call<JobOption[]>(`${base(orgId)}/${id}/job-options`, { cache: "no-store" }),
  create: (orgId: Id, body: CreateBody, key: string = newKey()) => call<ConsultantDetail>(base(orgId), json("POST", body, { "idempotency-key": key })),
  patch: (orgId: Id, id: number, body: PatchBody, version: string) => call<ConsultantDetail>(`${base(orgId)}/${id}`, json("PATCH", body, { "if-match": version })),
  assignMarketer: (orgId: Id, id: number, body: { marketerMemberId: number; backupMemberId?: number | null; priority?: string }) =>
    call<ConsultantDetail>(`${base(orgId)}/${id}/marketer`, json("POST", body)),
  linkableMembers: (orgId: Id) => call<LinkableMember[]>(`${base(orgId)}/linkable-members`, { cache: "no-store" }),
  linkMember: (orgId: Id, id: number, memberId: number) => call<ConsultantDetail>(`${base(orgId)}/${id}/member`, json("POST", { memberId })),
  deactivate: (orgId: Id, id: number, reason: string) => call<ConsultantDetail>(`${base(orgId)}/${id}/deactivate`, json("POST", { reason })),
  reactivate: (orgId: Id, id: number) => call<ConsultantDetail>(`${base(orgId)}/${id}/reactivate`, json("POST", {})),
  createApplication: (orgId: Id, id: number, requirementId: number, key: string = newKey()) =>
    call<{ id: number; code: string; stage: string }>(`${base(orgId)}/${id}/applications`, json("POST", { requirementId }, { "idempotency-key": key })),
  bulk: (orgId: Id, kind: "availability" | "marketer" | "status", body: Record<string, unknown>, key: string = newKey()) =>
    call<BulkResult>(`${base(orgId)}/bulk/${kind}`, json("POST", body, { "idempotency-key": key })),
};
