import type { ChangeActor } from "@/lib/actors";
/**
 * The Interviews page: the types of the interviews API (`OrgInterviewResource`), the client that talks to the BFF under
 * `/api/orgs/{orgId}/interviews`, the URL state of the page (tab, filters, page, open interview: a link reproduces the view) and the
 * small pure helpers (status names, sorting, calendar months, error sentences). Nothing here touches React.
 *
 * Everything the page does is a RECORD of something that happened or was arranged outside Kiwiply: nobody attends, runs or sends
 * anything for an interview here. The page never invents a figure: a tile with no history shows no delta; a field the API returns
 * null is drawn as an honest dash or empty state.
 */

/* ── contract types (mirror InterviewDTO) ────────────────────────────────────────── */

export type Status = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export const STATUSES: readonly Status[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
export type Mode = "VIDEO" | "ONSITE" | "PHONE";
export const MODES: readonly Mode[] = ["VIDEO", "ONSITE", "PHONE"];
export type Recommendation = "ADVANCE" | "HOLD" | "DECLINE";
export const RECOMMENDATIONS: readonly Recommendation[] = ["ADVANCE", "HOLD", "DECLINE"];

export const STATUS_LABEL: Record<Status, string> = { SCHEDULED: "Scheduled", IN_PROGRESS: "In Progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };
export const MODE_LABEL: Record<Mode, string> = { VIDEO: "Video", ONSITE: "Onsite", PHONE: "Phone" };
export const RECOMMENDATION_LABEL: Record<Recommendation, string> = { ADVANCE: "Advance", HOLD: "Hold", DECLINE: "Decline" };

export function statusLabel(s: string): string {
  return STATUS_LABEL[s as Status] ?? s;
}

export function modeLabel(m: string): string {
  return MODE_LABEL[m as Mode] ?? m;
}

export interface PersonRef {
  id: number | null;
  name: string;
  initials: string;
  subtitle: string | null;
  status: string | null;
}

export interface ClientRef {
  id: number;
  name: string;
  initials: string;
  industry: string | null;
}

export interface Marketer {
  memberId: number;
  name: string;
  initials: string;
}

export interface Interviewer {
  id: number | null;
  name: string;
  title: string | null;
  initials: string;
  primary: boolean;
}

export interface InterviewRow {
  id: number;
  code: string;
  applicationId: number | null;
  jobTitle: string | null;
  jobCode: string | null;
  consultant: PersonRef;
  client: ClientRef;
  round: string | null;
  roundNo: number | null;
  scheduledAt: string;
  durationMinutes: number;
  mode: Mode;
  location: string | null;
  status: Status;
  nextStep: string;
  interviewers: Interviewer[];
}

export interface InterviewPage {
  items: InterviewRow[];
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

export interface Counts {
  asOf: string;
  seriesFrom: string;
  scope: string;
  total: Tile;
  scheduledThisWeek: Tile;
  inProgress: Tile;
  completed: Tile;
  byStatus: Record<string, number>;
}

export interface Option {
  value: string;
  label: string;
}

export interface FilterOptions {
  clients: Option[];
  consultants: Option[];
  rounds: Option[];
  statuses: Option[];
  modes: Option[];
  limits: { maxInterviewers: number; maxDurationMinutes: number; undoMinutes: number };
}

export interface PickerItem {
  id: number;
  label: string;
  sub: string | null;
  clientId: number | null;
}

export interface Column {
  status: Status;
  label: string;
  count: number;
  items: InterviewRow[];
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

export interface Analytics {
  total: number;
  upcoming7: number;
  completionRate: number | null;
  avgPerWeek: number | null;
  byStatus: Bucket[];
  perMonth: Bucket[];
  byMode: Bucket[];
  byRound: Bucket[];
  topClients: Bucket[];
}

export interface Step {
  key: string;
  label: string;
  at: string | null;
  state: "DONE" | "CURRENT" | "UPCOMING" | "CANCELLED" | "NOT_SCHEDULED";
  interviewId: number | null;
}

export interface EventItem {
  id: number;
  type: "CREATED" | "STATUS" | "STATUS_REVERT" | "RESCHEDULE" | "REMINDER" | "FEEDBACK" | "UPDATE" | string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: Marketer | null;
  detail: string | null;
  at: string;
}

export interface FeedbackItem {
  id: number;
  author: Marketer | null;
  rating: number;
  recommendation: Recommendation;
  note: string | null;
  createdAt: string;
}

export interface DocumentItem {
  id: number;
  name: string | null;
  fileName: string | null;
  versionNo: number | null;
  primary: boolean;
  kind: string;
}

export interface Actions {
  edit: boolean;
  reschedule: boolean;
  changeStatus: boolean;
  remind: boolean;
  feedback: boolean;
}

export interface UndoToken {
  eventId: number;
  expiresAt: string;
  fromStatus: string;
  toStatus: string;
}

export interface InterviewDetail {
  id: number;
  code: string;
  applicationId: number | null;
  applicationCode: string | null;
  jobTitle: string | null;
  jobCode: string | null;
  employmentLabel: string | null;
  location: string | null;
  workMode: string | null;
  consultant: PersonRef;
  client: ClientRef;
  marketer: Marketer | null;
  round: string | null;
  roundNo: number | null;
  scheduledAt: string;
  durationMinutes: number;
  mode: Mode;
  meetingLink: string | null;
  interviewLocation: string | null;
  status: Status;
  nextStep: string;
  nextStepCustom: string | null;
  notes: string | null;
  reminderRequestedAt: string | null;
  interviewers: Interviewer[];
  steps: Step[];
  timeline: EventItem[];
  feedback: FeedbackItem[];
  documents: DocumentItem[];
  nextStatuses: Status[];
  actions: Actions;
  undo: UndoToken | null;
  createdAt: string;
  /** Change audit: when it last changed and by whom; who scheduled it (by name, with the relation to the consultant). */
  updatedAt?: string | null;
  updatedBy?: ChangeActor | null;
  createdBy?: ChangeActor | null;
}

/* ── URL state ───────────────────────────────────────────────────────────────────── */

export type MainTab = "all" | "calendar" | "pipeline" | "analytics";
export type DetailTab = "details" | "timeline" | "feedback" | "documents";
export type SortKey = "scheduled" | "role" | "consultant" | "client" | "round" | "status" | "mode";
export type SortDir = "asc" | "desc";
export type Layout = "list" | "grid";

export const MAIN_TABS: readonly MainTab[] = ["all", "calendar", "pipeline", "analytics"];
export const DETAIL_TABS: readonly DetailTab[] = ["details", "timeline", "feedback", "documents"];
export const SORT_KEYS: readonly SortKey[] = ["scheduled", "role", "consultant", "client", "round", "status", "mode"];
export const PAGE_SIZES = [10, 25, 50] as const;
export const MIN_SEARCH = 2;
/** The calendar asks for a whole month at once; the API's page limit. */
export const CALENDAR_SIZE = 100;

export interface ViewState {
  tab: MainTab;
  q: string;
  status: string;
  client: string;
  consultant: string;
  round: string;
  mode: string;
  from: string;
  to: string;
  sort: { key: SortKey; dir: SortDir };
  /** 0-based, as the API counts; the URL carries it 1-based. */
  page: number;
  size: number;
  layout: Layout;
  /** The calendar's month, `YYYY-MM`; empty = the current month. */
  month: string;
  selected: number | null;
  detailTab: DetailTab;
}

export const DEFAULT_VIEW: ViewState = {
  tab: "all",
  q: "",
  status: "",
  client: "",
  consultant: "",
  round: "",
  mode: "",
  from: "",
  to: "",
  sort: { key: "scheduled", dir: "desc" },
  page: 0,
  size: 10,
  layout: "list",
  month: "",
  selected: null,
  detailTab: "details",
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const oneOf = <T extends string>(v: string | null, all: readonly T[], fallback: T): T => (v && (all as readonly string[]).includes(v) ? (v as T) : fallback);

/** Reads the page's state from a query string; anything malformed falls back to the default (a hand-edited link never breaks the page). */
export function parseView(params: URLSearchParams): ViewState {
  const sortRaw = (params.get("sort") ?? "").split(",");
  const sortKey = oneOf(sortRaw[0] || null, SORT_KEYS, DEFAULT_VIEW.sort.key);
  const sortDir: SortDir = sortRaw[1] === "asc" || sortRaw[1] === "desc" ? sortRaw[1] : sortKey === "scheduled" ? "desc" : "asc";
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  const size = Number.parseInt(params.get("size") ?? "", 10);
  const selected = Number.parseInt(params.get("iv") ?? "", 10);
  const status = params.get("status") ?? "";
  const mode = params.get("mode") ?? "";
  const num = (k: string) => (/^\d{1,18}$/.test(params.get(k) ?? "") ? (params.get(k) as string) : "");
  return {
    tab: oneOf(params.get("tab"), MAIN_TABS, "all"),
    q: (params.get("q") ?? "").slice(0, 80),
    status: (STATUSES as readonly string[]).includes(status) ? status : "",
    client: num("client"),
    consultant: num("consultant"),
    round: (params.get("round") ?? "").slice(0, 40),
    mode: (MODES as readonly string[]).includes(mode) ? mode : "",
    from: DATE.test(params.get("from") ?? "") ? (params.get("from") as string) : "",
    to: DATE.test(params.get("to") ?? "") ? (params.get("to") as string) : "",
    sort: { key: sortKey, dir: sortDir },
    page: Number.isFinite(page) && page >= 1 ? page - 1 : 0,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_VIEW.size,
    layout: params.get("layout") === "grid" ? "grid" : "list",
    month: MONTH.test(params.get("month") ?? "") ? (params.get("month") as string) : "",
    selected: Number.isFinite(selected) && selected > 0 ? selected : null,
    detailTab: oneOf(params.get("dtab"), DETAIL_TABS, "details"),
  };
}

/** The query string for a view: only what differs from the default, so the shared link stays short. */
export function viewParams(v: ViewState): URLSearchParams {
  const p = new URLSearchParams();
  if (v.tab !== DEFAULT_VIEW.tab) p.set("tab", v.tab);
  if (v.q.trim()) p.set("q", v.q.trim());
  if (v.status) p.set("status", v.status);
  if (v.client) p.set("client", v.client);
  if (v.consultant) p.set("consultant", v.consultant);
  if (v.round) p.set("round", v.round);
  if (v.mode) p.set("mode", v.mode);
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  if (v.sort.key !== DEFAULT_VIEW.sort.key || v.sort.dir !== DEFAULT_VIEW.sort.dir) p.set("sort", `${v.sort.key},${v.sort.dir}`);
  if (v.page > 0) p.set("page", String(v.page + 1));
  if (v.size !== DEFAULT_VIEW.size) p.set("size", String(v.size));
  if (v.layout !== DEFAULT_VIEW.layout) p.set("layout", v.layout);
  if (v.month) p.set("month", v.month);
  if (v.selected !== null) {
    p.set("iv", String(v.selected));
    if (v.detailTab !== DEFAULT_VIEW.detailTab) p.set("dtab", v.detailTab);
  }
  return p;
}

/** The filters the API accepts, from the view (the list, the pipeline and the calendar all share them). */
export function filterParams(v: ViewState, includeStatus: boolean): URLSearchParams {
  const p = new URLSearchParams();
  if (v.q.trim().length >= MIN_SEARCH) p.set("q", v.q.trim());
  if (includeStatus && v.status) p.set("status", v.status);
  if (v.client) p.set("clientId", v.client);
  if (v.consultant) p.set("consultantId", v.consultant);
  if (v.round) p.set("round", v.round);
  if (v.mode) p.set("mode", v.mode);
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  return p;
}

export function listParams(v: ViewState): URLSearchParams {
  const p = filterParams(v, true);
  p.set("sort", `${v.sort.key},${v.sort.dir}`);
  p.set("page", String(v.page));
  p.set("size", String(v.size));
  return p;
}

/** The calendar's query: the same filters, the month's first and last day, soonest first. */
export function calendarParams(v: ViewState, month: string): URLSearchParams {
  const p = filterParams({ ...v, from: "", to: "" }, true);
  const [from, to] = monthRange(month);
  p.set("from", from);
  p.set("to", to);
  p.set("sort", "scheduled,asc");
  p.set("page", "0");
  p.set("size", String(CALENDAR_SIZE));
  return p;
}

/** More Filters counts the filters that live behind it (the other controls show their own value). */
export function moreFiltersActive(v: ViewState): number {
  return (v.mode ? 1 : 0) + (v.consultant ? 1 : 0) + (v.round ? 1 : 0);
}

export function filtersActive(v: ViewState): boolean {
  return v.q.trim().length >= MIN_SEARCH || !!(v.status || v.client || v.consultant || v.round || v.mode || v.from || v.to);
}

/** Clicking a header: the same column flips direction, a new column starts ascending (the scheduled date starts with the newest). */
export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "scheduled" ? "desc" : "asc" };
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

/** "1-10 of 124 interviews" (the board's en dash). */
export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0 || shown === 0) return "No interviews";
  const from = page * size + 1;
  return `${from}–${page * size + shown} of ${total.toLocaleString("en-US")} ${total === 1 ? "interview" : "interviews"}`;
}

/* ── display helpers ─────────────────────────────────────────────────────────────── */

const toDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "Apr 18, 2024" (UTC, so the day never shifts with the viewer's zone). */
export function formatDay(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
}

/** "Apr 18". */
export function formatShort(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
}

/** "10:00 AM". */
export function formatTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }) : "";
}

/** "10:00 AM - 11:00 AM" from a start and a length. */
export function formatRange(iso: string, minutes: number): string {
  const d = toDate(iso);
  if (!d) return "";
  const end = new Date(d.getTime() + minutes * 60_000).toISOString();
  return `${formatTime(iso)} - ${formatTime(end)}`;
}

/** "Apr 18, 2024 • 10:00 AM - 11:00 AM" (the drawer's date line). */
export function formatWhenLine(iso: string, minutes: number): string {
  return `${formatDay(iso)} • ${formatRange(iso, minutes)}`;
}

/** "Apr 18, 10:00" for history rows. */
export function formatStamp(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }) : "";
}

/** The date range button's label: "Apr 1, 2024 – Apr 30, 2024". */
export function rangeLabel(from: string, to: string): string {
  if (!from && !to) return "Any date";
  return `${from ? formatDay(from) : "Any"} – ${to ? formatDay(to) : "Any"}`;
}

export function eventTitle(e: EventItem): string {
  switch (e.type) {
    case "CREATED":
      return "Interview scheduled";
    case "STATUS":
      return e.toStatus ? `Recorded as ${statusLabel(e.toStatus)}` : "Status changed";
    case "STATUS_REVERT":
      return e.toStatus ? `Moved back to ${statusLabel(e.toStatus)}` : "Status change undone";
    case "RESCHEDULE":
      return "Rescheduled";
    case "REMINDER":
      return "Reminder recorded";
    case "FEEDBACK":
      return "Feedback added";
    case "UPDATE":
      return "Details updated";
    default:
      return e.type;
  }
}

/** The stepper's date line: "Apr 18, 2024 - 10:00 AM" or "Not scheduled". */
export function stepLine(s: Step): string {
  if (!s.at) return "Not scheduled";
  const day = formatDay(s.at);
  return s.key === "offer" ? day : `${day} - ${formatTime(s.at)}`;
}

/* ── calendar ────────────────────────────────────────────────────────────────────── */

/** `YYYY-MM` of a date (UTC). */
export function monthOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return monthOf(new Date(Date.UTC(y, m - 1 + delta, 1)));
}

/** First and last day of a month as `yyyy-mm-dd`. */
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, "0")}`];
}

export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The weeks of a month, Monday first: 6 rows of 7 `yyyy-mm-dd` strings (days outside the month included, so the grid is always full). */
export function monthGrid(month: string): string[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const rows: string[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: string[] = [];
    for (let c = 0; c < 7; c++) row.push(new Date(Date.UTC(y, m - 1, 1 - offset + r * 7 + c)).toISOString().slice(0, 10));
    rows.push(row);
  }
  return rows;
}

/* ── errors ──────────────────────────────────────────────────────────────────────── */

export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; status: number; code?: string; message: string; extra: Record<string, unknown> };

const CODE_TEXT: Record<string, string> = {
  INVALID_TRANSITION: "That change isn't allowed from the interview's current status.",
  SLOT_OVERLAP: "This consultant already has an interview at that time.",
  UNDO_NOT_AVAILABLE: "That change can no longer be undone.",
  REMINDER_RECENT: "A reminder was just recorded for this interview.",
  REMINDER_NOT_APPLICABLE: "A reminder can only be recorded for a scheduled interview.",
  FEEDBACK_NOT_APPLICABLE: "Feedback can be added once the interview has started.",
  INVALID_APPLICATION: "That application belongs to a different consultant.",
};

export function errorSentence(r: { status: number; code?: string; message: string }): string {
  if (r.status === 0) return r.message;
  if (r.status === 404) return "This interview is no longer in your view.";
  return (r.code ? CODE_TEXT[r.code] : undefined) ?? r.message;
}

/* ── client ──────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/interviews`;

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

/** A fresh key per user action; a retry of the same action reuses it, so a double submit applies once. */
export function newKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface InterviewerInput {
  name: string;
  title?: string | null;
  primary?: boolean;
}

export interface CreateBody {
  consultantId: number;
  applicationId?: number | null;
  clientId?: number | null;
  round?: string | null;
  scheduledAt: string;
  durationMinutes?: number | null;
  mode?: Mode;
  meetingLink?: string | null;
  location?: string | null;
  notes?: string | null;
  interviewers?: InterviewerInput[];
}

export interface PatchBody {
  nextStep?: string | null;
  notes?: string | null;
  meetingLink?: string | null;
  mode?: Mode;
  location?: string | null;
  interviewers?: InterviewerInput[];
}

export interface FeedbackBody {
  rating: number;
  recommendation: Recommendation;
  note?: string | null;
}

export const interviewsApi = {
  list: (orgId: number | string, v: ViewState) => call<InterviewPage>(`${base(orgId)}?${listParams(v)}`, { cache: "no-store" }),
  calendar: (orgId: number | string, v: ViewState, month: string) => call<InterviewPage>(`${base(orgId)}?${calendarParams(v, month)}`, { cache: "no-store" }),
  counts: (orgId: number | string) => call<Counts>(`${base(orgId)}/counts`, { cache: "no-store" }),
  filters: (orgId: number | string) => call<FilterOptions>(`${base(orgId)}/filters`, { cache: "no-store" }),
  pickers: (orgId: number | string, kind: "consultant" | "application" | "client", q: string, consultantId?: number) =>
    call<{ kind: string; items: PickerItem[] }>(`${base(orgId)}/pickers?kind=${kind}&q=${encodeURIComponent(q)}${consultantId ? `&consultantId=${consultantId}` : ""}`, { cache: "no-store" }),
  pipeline: (orgId: number | string, v: ViewState) => call<{ columns: Column[] }>(`${base(orgId)}/pipeline?${filterParams(v, false)}`, { cache: "no-store" }),
  analytics: (orgId: number | string) => call<Analytics>(`${base(orgId)}/analytics`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<InterviewDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  create: (orgId: number | string, body: CreateBody, key: string = newKey()) => call<InterviewDetail>(base(orgId), json("POST", body, { "idempotency-key": key })),
  patch: (orgId: number | string, id: number, body: PatchBody) => call<InterviewDetail>(`${base(orgId)}/${id}`, json("PATCH", body)),
  reschedule: (orgId: number | string, id: number, body: { scheduledAt: string; durationMinutes?: number | null; reason?: string | null }, key: string = newKey()) =>
    call<InterviewDetail>(`${base(orgId)}/${id}/reschedule`, json("POST", body, { "idempotency-key": key })),
  setStatus: (orgId: number | string, id: number, status: Status, reason?: string) =>
    call<InterviewDetail>(`${base(orgId)}/${id}/status`, json("POST", { status, reason: reason ?? null }, { "idempotency-key": newKey() })),
  undo: (orgId: number | string, id: number, eventId: number) => call<InterviewDetail>(`${base(orgId)}/${id}/status`, json("POST", { undoEventId: eventId }, { "idempotency-key": newKey() })),
  remind: (orgId: number | string, id: number) => call<InterviewDetail>(`${base(orgId)}/${id}/reminder`, json("POST", {}, { "idempotency-key": newKey() })),
  feedback: (orgId: number | string, id: number, body: FeedbackBody, key: string = newKey()) =>
    call<InterviewDetail>(`${base(orgId)}/${id}/feedback`, json("POST", body, { "idempotency-key": key })),
};
