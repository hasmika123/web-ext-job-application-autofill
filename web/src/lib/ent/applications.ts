/**
 * The Applications page: the types of the applications API (`OrgApplicationResource`), the client that talks to the BFF under
 * `/api/orgs/{orgId}/applications`, the URL state of the page (tab, filters, page, open application: a link reproduces the view) and the
 * small pure helpers (stage names, sorting, error sentences). Nothing here touches React.
 *
 * A stage change on this page is a RECORD of what happened: Kiwiply never submits an application, the consultant does. The page never
 * invents a figure: a tile with no history shows no delta; a field the API returns null is drawn as an honest dash or empty state.
 */

/* ── contract types (mirror ApplicationDTO) ──────────────────────────────────────── */

export type Stage = "ASSIGNED" | "SUBMITTED" | "UNDER_REVIEW" | "INTERVIEWING" | "OFFER" | "CLOSED";
export const STAGES: readonly Stage[] = ["ASSIGNED", "SUBMITTED", "UNDER_REVIEW", "INTERVIEWING", "OFFER", "CLOSED"];
export const CLOSE_REASONS = ["HIRED", "REJECTED", "WITHDRAWN", "NO_RESPONSE"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  ASSIGNED: "Assigned",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  CLOSED: "Closed",
};

export const REASON_LABEL: Record<string, string> = { HIRED: "Hired", REJECTED: "Rejected", WITHDRAWN: "Withdrawn", NO_RESPONSE: "No response" };

export function stageLabel(s: string): string {
  return STAGE_LABEL[s as Stage] ?? s;
}

export interface PersonRef {
  id: number | null;
  name: string;
  initials: string;
  subtitle: string | null;
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

export interface ApplicationRow {
  id: number;
  code: string;
  requirementId: number;
  jobTitle: string;
  employmentLabel: string | null;
  consultant: PersonRef;
  client: ClientRef;
  appliedOn: string;
  stage: Stage;
  closedReason: string | null;
  marketer: Marketer | null;
  nextAction: string | null;
  nextActionDue: string | null;
  overdue: boolean;
  stageChangedAt: string;
}

export interface ApplicationPage {
  items: ApplicationRow[];
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
  inReview: Tile;
  interviewing: Tile;
  offers: Tile;
  byStage: Record<string, number>;
}

export interface Option {
  value: string;
  label: string;
}

export interface FilterOptions {
  jobTitles: Option[];
  clients: Option[];
  marketers: Option[];
  stages: Option[];
}

export interface PickerItem {
  id: number;
  label: string;
  sub: string | null;
}

export interface Column {
  stage: Stage;
  label: string;
  count: number;
  items: ApplicationRow[];
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

export interface Analytics {
  total: number;
  open: number;
  avgDaysOpen: number | null;
  byStage: Bucket[];
  reached: Bucket[];
  perMonth: Bucket[];
  closedReasons: Bucket[];
  topClients: Bucket[];
  bySource: Bucket[];
  byMarketer: Bucket[];
}

export interface Step {
  stage: Stage;
  label: string;
  reachedAt: string | null;
  state: "DONE" | "CURRENT" | "FUTURE";
}

export interface EventItem {
  id: number;
  type: "CREATED" | "STAGE_CHANGE" | "STAGE_REVERT" | "NOTE" | "UPDATE" | string;
  fromStage: string | null;
  toStage: string | null;
  actor: Marketer | null;
  detail: string | null;
  at: string;
}

export interface NoteItem {
  id: number;
  author: Marketer | null;
  body: string;
  createdAt: string;
}

export interface Actions {
  edit: boolean;
  moveStage: boolean;
  addNote: boolean;
  reassign: boolean;
}

export interface UndoToken {
  eventId: number;
  expiresAt: string;
  fromStage: string;
  toStage: string;
}

export interface ApplicationDetail {
  id: number;
  code: string;
  requirementId: number;
  jobTitle: string;
  employmentLabel: string | null;
  consultant: PersonRef;
  client: ClientRef;
  appliedOn: string;
  stage: Stage;
  closedReason: string | null;
  source: string | null;
  marketer: Marketer | null;
  nextAction: string | null;
  nextActionDue: string | null;
  overdue: boolean;
  stageChangedAt: string;
  steps: Step[];
  nextStages: Stage[];
  timeline: EventItem[];
  activity: EventItem[];
  notes: NoteItem[];
  notesCount: number;
  actions: Actions;
  undo: UndoToken | null;
}

/* ── URL state ───────────────────────────────────────────────────────────────────── */

export type MainTab = "all" | "pipeline" | "analytics";
export type DetailTab = "overview" | "timeline" | "notes" | "activity";
export type SortKey = "applied" | "job" | "consultant" | "client" | "stage" | "nextAction";
export type SortDir = "asc" | "desc";

export const SORT_KEYS: readonly SortKey[] = ["applied", "job", "consultant", "client", "stage", "nextAction"];
export const PAGE_SIZES = [10, 25, 50] as const;
export const MIN_SEARCH = 2;

export interface ViewState {
  tab: MainTab;
  q: string;
  stage: string;
  job: string;
  client: string;
  marketer: string;
  from: string;
  to: string;
  sort: { key: SortKey; dir: SortDir };
  /** 0-based, as the API counts; the URL carries it 1-based. */
  page: number;
  size: number;
  selected: number | null;
  detailTab: DetailTab;
}

export const DEFAULT_VIEW: ViewState = {
  tab: "all",
  q: "",
  stage: "",
  job: "",
  client: "",
  marketer: "",
  from: "",
  to: "",
  sort: { key: "applied", dir: "desc" },
  page: 0,
  size: 10,
  selected: null,
  detailTab: "overview",
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(v: string | null, all: readonly T[], fallback: T): T => (v && (all as readonly string[]).includes(v) ? (v as T) : fallback);

/** Reads the page's state from a query string; anything malformed falls back to the default (a hand-edited link never breaks the page). */
export function parseView(params: URLSearchParams): ViewState {
  const sortRaw = (params.get("sort") ?? "").split(",");
  const sortKey = oneOf(sortRaw[0] || null, SORT_KEYS, DEFAULT_VIEW.sort.key);
  const sortDir: SortDir = sortRaw[1] === "asc" || sortRaw[1] === "desc" ? sortRaw[1] : sortKey === "applied" ? "desc" : "asc";
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  const size = Number.parseInt(params.get("size") ?? "", 10);
  const selected = Number.parseInt(params.get("app") ?? "", 10);
  const stage = params.get("stage") ?? "";
  const num = (k: string) => (/^\d{1,18}$/.test(params.get(k) ?? "") ? (params.get(k) as string) : "");
  return {
    tab: oneOf(params.get("tab"), ["all", "pipeline", "analytics"] as const, "all"),
    q: (params.get("q") ?? "").slice(0, 80),
    stage: (STAGES as readonly string[]).includes(stage) ? stage : "",
    job: (params.get("job") ?? "").slice(0, 200),
    client: num("client"),
    marketer: num("marketer"),
    from: DATE.test(params.get("from") ?? "") ? (params.get("from") as string) : "",
    to: DATE.test(params.get("to") ?? "") ? (params.get("to") as string) : "",
    sort: { key: sortKey, dir: sortDir },
    page: Number.isFinite(page) && page >= 1 ? page - 1 : 0,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_VIEW.size,
    selected: Number.isFinite(selected) && selected > 0 ? selected : null,
    detailTab: oneOf(params.get("dtab"), ["overview", "timeline", "notes", "activity"] as const, "overview"),
  };
}

/** The query string for a view: only what differs from the default, so the shared link stays short. */
export function viewParams(v: ViewState): URLSearchParams {
  const p = new URLSearchParams();
  if (v.tab !== DEFAULT_VIEW.tab) p.set("tab", v.tab);
  if (v.q.trim()) p.set("q", v.q.trim());
  if (v.stage) p.set("stage", v.stage);
  if (v.job) p.set("job", v.job);
  if (v.client) p.set("client", v.client);
  if (v.marketer) p.set("marketer", v.marketer);
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  if (v.sort.key !== DEFAULT_VIEW.sort.key || v.sort.dir !== DEFAULT_VIEW.sort.dir) p.set("sort", `${v.sort.key},${v.sort.dir}`);
  if (v.page > 0) p.set("page", String(v.page + 1));
  if (v.size !== DEFAULT_VIEW.size) p.set("size", String(v.size));
  if (v.selected !== null) {
    p.set("app", String(v.selected));
    if (v.detailTab !== DEFAULT_VIEW.detailTab) p.set("dtab", v.detailTab);
  }
  return p;
}

/** The filters the API accepts, from the view (the list, the pipeline and the filter chips all share them). */
export function filterParams(v: ViewState, includeStage: boolean): URLSearchParams {
  const p = new URLSearchParams();
  if (v.q.trim().length >= MIN_SEARCH) p.set("q", v.q.trim());
  if (includeStage && v.stage) p.set("stage", v.stage);
  if (v.job) p.set("jobTitle", v.job);
  if (v.client) p.set("clientId", v.client);
  if (v.marketer) p.set("marketerId", v.marketer);
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

export function filtersActive(v: ViewState): boolean {
  return v.q.trim().length >= MIN_SEARCH || !!(v.stage || v.job || v.client || v.marketer || v.from || v.to);
}

/** Clicking a header: the same column flips direction, a new column starts ascending (the applied date starts with the newest). */
export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "applied" ? "desc" : "asc" };
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

/** "1-10 of 324 applications". */
export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0 || shown === 0) return "No applications";
  const from = page * size + 1;
  return `${from}-${page * size + shown} of ${total.toLocaleString("en-US")} ${total === 1 ? "application" : "applications"}`;
}

/* ── display helpers ─────────────────────────────────────────────────────────────── */

/** "Jan 12, 2024" from an ISO date or instant (UTC, so the day never shifts with the viewer's zone). */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Jan 12" for the stepper. */
export function formatShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: false, timeZone: "UTC" });
}

const WEEK_MS = 7 * 86400_000;

/** "Jan 12, 2024 (3 weeks ago)". */
export function appliedText(iso: string, now: number = Date.now()): string {
  const d = formatDay(iso);
  if (!d) return "";
  const t = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  const days = Math.floor((now - t) / 86400_000);
  if (days < 0) return d;
  if (days < 1) return `${d} (today)`;
  if (days < 7) return `${d} (${days} ${days === 1 ? "day" : "days"} ago)`;
  const weeks = Math.floor((now - t) / WEEK_MS);
  if (weeks < 9) return `${d} (${weeks} ${weeks === 1 ? "week" : "weeks"} ago)`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${d} (${months} ${months === 1 ? "month" : "months"} ago)`;
  const years = Math.floor(days / 365);
  return `${d} (${years} ${years === 1 ? "year" : "years"} ago)`;
}

/** How the next-action cell reads: closed applications have none ("N/A"); a missing one is an honest dash. */
export function nextActionText(r: Pick<ApplicationRow, "stage" | "nextAction">): string {
  if (r.stage === "CLOSED") return "N/A";
  return r.nextAction ?? "";
}

export function eventTitle(e: EventItem): string {
  switch (e.type) {
    case "CREATED":
      return "Application added";
    case "STAGE_CHANGE":
      return e.toStage ? `Recorded as ${stageLabel(e.toStage)}` : "Stage changed";
    case "STAGE_REVERT":
      return e.toStage ? `Moved back to ${stageLabel(e.toStage)}` : "Stage move undone";
    case "NOTE":
      return "Note added";
    case "UPDATE":
      return "Details updated";
    default:
      return e.type;
  }
}

/** The stages a move may go to from `stage` (the API enforces the same rule; this only decides which menu entries to draw). */
export function nextStagesOf(stage: Stage): Stage[] {
  const i = STAGES.indexOf(stage);
  return stage === "CLOSED" || i < 0 ? [] : STAGES.slice(i + 1);
}

/** The stage moves the "move" control offers, as `{ stage, reason? }` (closing is one entry per reason). */
export interface MoveOption {
  key: string;
  label: string;
  stage: Stage;
  closedReason?: CloseReason;
}

export function moveOptions(next: readonly Stage[]): MoveOption[] {
  const out: MoveOption[] = [];
  for (const s of next) {
    if (s === "CLOSED") for (const r of CLOSE_REASONS) out.push({ key: `CLOSED:${r}`, label: `Close: ${REASON_LABEL[r]}`, stage: s, closedReason: r });
    else out.push({ key: s, label: `Record as ${STAGE_LABEL[s]}`, stage: s });
  }
  return out;
}

/* ── errors ──────────────────────────────────────────────────────────────────────── */

export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; status: number; code?: string; message: string; extra: Record<string, unknown> };

const CODE_TEXT: Record<string, string> = {
  INVALID_TRANSITION: "That move isn't allowed from the application's current stage.",
  DUPLICATE_APPLICATION: "This consultant already has an application for this job.",
  INVALID_MARKETER: "That person isn't an active marketer.",
  APPLICATION_CLOSED: "A closed application has no next action.",
  UNDO_NOT_AVAILABLE: "That move can no longer be undone.",
};

export function errorSentence(r: { status: number; code?: string; message: string }): string {
  if (r.status === 0) return r.message;
  if (r.status === 404) return "This application is no longer in your view.";
  return (r.code ? CODE_TEXT[r.code] : undefined) ?? r.message;
}

/* ── client ──────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/applications`;

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

export interface CreateBody {
  requirementId: number;
  consultantId: number;
  marketerMemberId?: number | null;
  source?: string | null;
  nextAction?: string | null;
  nextActionDue?: string | null;
  appliedOn?: string | null;
  stage?: "ASSIGNED" | "SUBMITTED";
}

export interface PatchBody {
  nextAction?: string | null;
  nextActionDue?: string | null;
  marketerMemberId?: number | null;
}

export const applicationsApi = {
  list: (orgId: number | string, v: ViewState) => call<ApplicationPage>(`${base(orgId)}?${listParams(v)}`, { cache: "no-store" }),
  counts: (orgId: number | string) => call<Counts>(`${base(orgId)}/counts`, { cache: "no-store" }),
  filters: (orgId: number | string) => call<FilterOptions>(`${base(orgId)}/filters`, { cache: "no-store" }),
  pickers: (orgId: number | string, kind: "consultant" | "job" | "marketer", q: string) =>
    call<{ kind: string; items: PickerItem[] }>(`${base(orgId)}/pickers?kind=${kind}&q=${encodeURIComponent(q)}`, { cache: "no-store" }),
  pipeline: (orgId: number | string, v: ViewState) => call<{ columns: Column[] }>(`${base(orgId)}/pipeline?${filterParams(v, false)}`, { cache: "no-store" }),
  analytics: (orgId: number | string) => call<Analytics>(`${base(orgId)}/analytics`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<ApplicationDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  create: (orgId: number | string, body: CreateBody, key: string = newKey()) => call<ApplicationDetail>(base(orgId), json("POST", body, { "idempotency-key": key })),
  patch: (orgId: number | string, id: number, body: PatchBody) => call<ApplicationDetail>(`${base(orgId)}/${id}`, json("PATCH", body)),
  move: (orgId: number | string, id: number, stage: Stage, closedReason?: CloseReason) =>
    call<ApplicationDetail>(`${base(orgId)}/${id}/stage`, json("POST", { stage, closedReason: closedReason ?? null }, { "idempotency-key": newKey() })),
  undo: (orgId: number | string, id: number, eventId: number) => call<ApplicationDetail>(`${base(orgId)}/${id}/stage`, json("POST", { undoEventId: eventId }, { "idempotency-key": newKey() })),
  addNote: (orgId: number | string, id: number, body: string) => call<ApplicationDetail>(`${base(orgId)}/${id}/notes`, json("POST", { body }, { "idempotency-key": newKey() })),
};
