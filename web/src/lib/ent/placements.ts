/**
 * The Placements page: the types of the placements API (`OrgPlacementResource`), the client that talks to the BFF under
 * `/api/orgs/{orgId}/placements`, the URL state of the page (tab, filters, page, open placement: a link reproduces the view) and the small pure
 * helpers (dates, rates, sorting, error sentences). Nothing here touches React.
 *
 * Everything on this page is a RECORD: an extension request, an extension, a completion and a redeployment are rows with an audit event. A bill
 * rate is a number on the record, never money that moves. The page never invents a figure: a tile with no history shows no delta; a field the API
 * returns null is drawn as an honest dash or empty state.
 */

/* ── contract types (mirror PlacementDTO) ────────────────────────────────────────── */

export type PlacementStatus = "ACTIVE" | "UPCOMING" | "ENDED" | "ENDING" | "TERMINATED";
export type NextKind = "NONE" | "ENDS_IN" | "ENDED_AGO" | "STARTS_IN" | "REVIEW" | "POOL";
export type NextTone = "neutral" | "amber" | "red" | "blue";
export type PlacementType = "CONTRACT" | "FTE" | "C2C";

export const TYPE_LABEL: Record<string, string> = { CONTRACT: "Contract", FTE: "Full-time", C2C: "Corp-to-corp" };
export const STATUS_LABEL: Record<PlacementStatus, string> = { ACTIVE: "Active", UPCOMING: "Upcoming", ENDED: "Completed", ENDING: "Ending", TERMINATED: "Terminated" };

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

export interface Member {
  memberId: number;
  name: string;
  initials: string;
}

export interface NextAction {
  kind: NextKind;
  label: string;
  tone: NextTone;
  days: number | null;
}

export interface PlacementRow {
  id: number;
  consultant: PersonRef;
  client: ClientRef;
  roleTitle: string;
  placementType: PlacementType | string;
  startDate: string;
  endDate: string | null;
  accountManager: Member | null;
  status: PlacementStatus;
  billRateMinor: number | null;
  rateUnit: string | null;
  currency: string | null;
  nextAction: NextAction;
  inPool: boolean;
  extensionPending: boolean;
}

export interface PlacementPage {
  items: PlacementRow[];
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

export interface TabCounts {
  active: number;
  upcoming: number;
  completed: number;
  extensions: number;
}

export interface Windows {
  endingSoonDays: number;
  endingUrgentDays: number;
  startingSoonDays: number;
}

export interface Counts {
  asOf: string;
  seriesFrom: string;
  scope: string;
  active: Tile;
  startingSoon: Tile;
  endingSoon: Tile;
  pool: Tile;
  tabs: TabCounts;
  windows: Windows;
}

export interface Option {
  value: string;
  label: string;
}

export interface FilterOptions {
  clients: Option[];
  roles: Option[];
  managers: Option[];
  types: Option[];
  statuses: Option[];
}

export interface PickerItem {
  id: number;
  label: string;
  sub: string | null;
}

export interface Contact {
  id: number;
  name: string;
  title: string | null;
}

export interface Engagement {
  start: string;
  midpoint: string | null;
  end: string | null;
  percent: number | null;
  daysLeft: number | null;
  totalDays: number | null;
}

export type ExtensionStatus = "REQUESTED" | "APPROVED" | "DECLINED" | "CANCELLED";

export interface ExtensionItem {
  id: number;
  status: ExtensionStatus;
  fromEndDate: string | null;
  requestedEndDate: string;
  note: string | null;
  requestedBy: Member | null;
  decidedBy: Member | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface EventItem {
  id: number;
  type: string;
  actor: Member | null;
  detail: string | null;
  at: string;
}

export interface NoteItem {
  id: number;
  author: Member | null;
  body: string;
  createdAt: string;
}

export interface Availability {
  inPool: boolean;
  availableFrom: string | null;
  inDays: number | null;
  onBench: boolean;
}

export interface Actions {
  extend: boolean;
  requestExtension: boolean;
  complete: boolean;
  redeploy: boolean;
  addNote: boolean;
  decideExtension: boolean;
  terminate: boolean;
  giveNotice: boolean;
}

export interface UndoToken {
  eventId: number;
  expiresAt: string;
  kind: string;
}

export interface PlacementDetail {
  id: number;
  consultant: PersonRef;
  client: ClientRef;
  roleTitle: string;
  placementType: PlacementType | string;
  startDate: string;
  endDate: string | null;
  endsInDays: number | null;
  startsInDays: number | null;
  accountManager: Member | null;
  clientContact: Contact | null;
  status: PlacementStatus;
  billRateMinor: number | null;
  rateUnit: string | null;
  currency: string | null;
  nextAction: NextAction;
  engagement: Engagement;
  extensionPending: boolean;
  extensions: ExtensionItem[];
  availability: Availability;
  timeline: EventItem[];
  notes: NoteItem[];
  notesCount: number;
  actions: Actions;
  undo: UndoToken | null;
  endKind: string | null;
  endReason: string | null;
  noticeOn: string | null;
  offerId: number | null;
}

/* ── URL state ───────────────────────────────────────────────────────────────────── */

export type MainTab = "active" | "upcoming" | "completed" | "extensions";
export type DetailTab = "overview" | "timeline" | "extensions" | "notes";
export type SortKey = "end" | "start" | "consultant" | "client" | "role" | "rate";
export type SortDir = "asc" | "desc";
export type ViewMode = "list" | "grid";

export const TABS: readonly MainTab[] = ["active", "upcoming", "completed", "extensions"];
export const DETAIL_TABS: readonly DetailTab[] = ["overview", "timeline", "extensions", "notes"];
export const SORT_KEYS: readonly SortKey[] = ["end", "start", "consultant", "client", "role", "rate"];
export const PAGE_SIZES = [10, 25, 50] as const;
export const MIN_SEARCH = 2;

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** The sort options of the "Sort by" menu, in the board's wording. */
export const SORT_CHOICES: { value: string; label: string; key: SortKey; dir: SortDir }[] = [
  { value: "end,asc", label: "End Date (Soonest)", key: "end", dir: "asc" },
  { value: "end,desc", label: "End Date (Latest)", key: "end", dir: "desc" },
  { value: "start,desc", label: "Start Date (Newest)", key: "start", dir: "desc" },
  { value: "start,asc", label: "Start Date (Oldest)", key: "start", dir: "asc" },
  { value: "consultant,asc", label: "Consultant (A to Z)", key: "consultant", dir: "asc" },
  { value: "client,asc", label: "Client (A to Z)", key: "client", dir: "asc" },
  { value: "role,asc", label: "Role (A to Z)", key: "role", dir: "asc" },
  { value: "rate,desc", label: "Bill Rate (High to Low)", key: "rate", dir: "desc" },
];

export interface ViewState {
  tab: MainTab;
  q: string;
  client: string;
  role: string;
  status: string;
  manager: string;
  type: string;
  startFrom: string;
  startTo: string;
  endFrom: string;
  endTo: string;
  sort: SortState;
  /** 0-based, as the API counts; the URL carries it 1-based. */
  page: number;
  size: number;
  mode: ViewMode;
  selected: number | null;
  detailTab: DetailTab;
}

/** Active and upcoming placements read soonest-first; a completed one reads latest-first. */
export function defaultSort(tab: MainTab): SortState {
  return tab === "completed" ? { key: "end", dir: "desc" } : { key: "end", dir: "asc" };
}

export const DEFAULT_VIEW: ViewState = {
  tab: "active",
  q: "",
  client: "",
  role: "",
  status: "",
  manager: "",
  type: "",
  startFrom: "",
  startTo: "",
  endFrom: "",
  endTo: "",
  sort: { key: "end", dir: "asc" },
  page: 0,
  size: 10,
  mode: "list",
  selected: null,
  detailTab: "overview",
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(v: string | null, all: readonly T[], fallback: T): T => (v && (all as readonly string[]).includes(v) ? (v as T) : fallback);

/** Reads the page's state from a query string; anything malformed falls back to the default (a hand-edited link never breaks the page). */
export function parseView(params: URLSearchParams): ViewState {
  const tab = oneOf(params.get("tab"), TABS, "active");
  const base = defaultSort(tab);
  const sortRaw = (params.get("sort") ?? "").split(",");
  const known = SORT_KEYS.includes(sortRaw[0] as SortKey);
  const dirOk = sortRaw[1] === "asc" || sortRaw[1] === "desc";
  const sort: SortState = known ? { key: sortRaw[0] as SortKey, dir: dirOk ? (sortRaw[1] as SortDir) : sortRaw[0] === "rate" || sortRaw[0] === "start" ? "desc" : "asc" } : base;
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  const size = Number.parseInt(params.get("size") ?? "", 10);
  const selected = Number.parseInt(params.get("pl") ?? "", 10);
  const num = (k: string) => (/^\d{1,18}$/.test(params.get(k) ?? "") ? (params.get(k) as string) : "");
  const date = (k: string) => (DATE.test(params.get(k) ?? "") ? (params.get(k) as string) : "");
  const status = params.get("status") ?? "";
  const type = params.get("type") ?? "";
  return {
    tab,
    q: (params.get("q") ?? "").slice(0, 80),
    client: num("client"),
    role: (params.get("role") ?? "").slice(0, 200),
    status: ["ACTIVE", "ENDING_SOON", "UPCOMING", "EXTENSION_REQUESTED", "IN_POOL", "COMPLETED"].includes(status) ? status : "",
    manager: num("manager"),
    type: ["CONTRACT", "FTE", "C2C"].includes(type) ? type : "",
    startFrom: date("sf"),
    startTo: date("st"),
    endFrom: date("ef"),
    endTo: date("et"),
    sort,
    page: Number.isFinite(page) && page >= 1 ? page - 1 : 0,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_VIEW.size,
    mode: params.get("view") === "grid" ? "grid" : "list",
    selected: Number.isFinite(selected) && selected > 0 ? selected : null,
    detailTab: oneOf(params.get("dtab"), DETAIL_TABS, "overview"),
  };
}

/** The query string for a view: only what differs from the default, so the shared link stays short. */
export function viewParams(v: ViewState): URLSearchParams {
  const p = new URLSearchParams();
  if (v.tab !== DEFAULT_VIEW.tab) p.set("tab", v.tab);
  if (v.q.trim()) p.set("q", v.q.trim());
  if (v.client) p.set("client", v.client);
  if (v.role) p.set("role", v.role);
  if (v.status) p.set("status", v.status);
  if (v.manager) p.set("manager", v.manager);
  if (v.type) p.set("type", v.type);
  if (v.startFrom) p.set("sf", v.startFrom);
  if (v.startTo) p.set("st", v.startTo);
  if (v.endFrom) p.set("ef", v.endFrom);
  if (v.endTo) p.set("et", v.endTo);
  const d = defaultSort(v.tab);
  if (v.sort.key !== d.key || v.sort.dir !== d.dir) p.set("sort", `${v.sort.key},${v.sort.dir}`);
  if (v.page > 0) p.set("page", String(v.page + 1));
  if (v.size !== DEFAULT_VIEW.size) p.set("size", String(v.size));
  if (v.mode === "grid") p.set("view", "grid");
  if (v.selected !== null) {
    p.set("pl", String(v.selected));
    if (v.detailTab !== DEFAULT_VIEW.detailTab) p.set("dtab", v.detailTab);
  }
  return p;
}

/** The filters and paging the API accepts, from the view. */
export function listParams(v: ViewState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("tab", v.tab);
  if (v.q.trim().length >= MIN_SEARCH) p.set("q", v.q.trim());
  if (v.client) p.set("clientId", v.client);
  if (v.role) p.set("role", v.role);
  if (v.status) p.set("status", v.status);
  if (v.manager) p.set("managerId", v.manager);
  if (v.type) p.set("type", v.type);
  if (v.startFrom) p.set("startFrom", v.startFrom);
  if (v.startTo) p.set("startTo", v.startTo);
  if (v.endFrom) p.set("endFrom", v.endFrom);
  if (v.endTo) p.set("endTo", v.endTo);
  p.set("sort", `${v.sort.key},${v.sort.dir}`);
  p.set("page", String(v.page));
  p.set("size", String(v.size));
  return p;
}

/** The "More Filters" the dropdown row does not show (account manager, type and the four dates). */
export function moreFiltersActive(v: ViewState): number {
  return [v.manager, v.type, v.startFrom, v.startTo, v.endFrom, v.endTo].filter(Boolean).length;
}

export function filtersActive(v: ViewState): boolean {
  return v.q.trim().length >= MIN_SEARCH || !!(v.client || v.role || v.status) || moreFiltersActive(v) > 0;
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

const TAB_NOUN: Record<MainTab, string> = { active: "active placements", upcoming: "upcoming placements", completed: "completed placements", extensions: "placements with an extension request" };

/** "1-10 of 142 active placements". */
export function showingText(total: number, page: number, size: number, shown: number, tab: MainTab): string {
  if (total === 0 || shown === 0) return "No placements";
  const from = page * size + 1;
  return `${from}-${page * size + shown} of ${total.toLocaleString("en-US")} ${total === 1 && tab === "active" ? "active placement" : TAB_NOUN[tab]}`;
}

/** "1-10 of 142 placements" (the foot of the table drops the tab word, as on the board). */
export function footText(total: number, page: number, size: number, shown: number): string {
  if (total === 0 || shown === 0) return "No placements";
  return `${page * size + 1}-${page * size + shown} of ${total.toLocaleString("en-US")} ${total === 1 ? "placement" : "placements"}`;
}

/* ── display helpers ─────────────────────────────────────────────────────────────── */

/** "Jan 12, 2024" from an ISO date or instant (UTC, so the day never shifts with the viewer's zone). */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The three lines of the engagement timeline: "Jan 15" over "2024". */
export function dayParts(iso: string | null | undefined): { md: string; year: string } {
  if (!iso) return { md: "", year: "" };
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return { md: "", year: "" };
  return { md: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), year: String(d.getUTCFullYear()) };
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: false, timeZone: "UTC" });
}

/** "in 45 days", "tomorrow", "today", "3 days ago". */
export function relativeDays(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

const UNIT: Record<string, string> = { HOUR: "/hr", DAY: "/day", MONTH: "/mo", YEAR: "/yr" };

/** "$125/hr" from the recorded rate in minor units; an honest dash when the caller may not see rates or none is recorded. */
export function rateText(minor: number | null | undefined, unit: string | null | undefined, currency: string | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const whole = minor / 100;
  const text = Number.isInteger(whole) ? String(whole) : whole.toFixed(2);
  const sym = !currency || currency === "USD" ? "$" : `${currency} `;
  return `${sym}${Number(text).toLocaleString("en-US", { maximumFractionDigits: 2 })}${UNIT[unit ?? "HOUR"] ?? ""}`;
}

export function typeLabel(t: string | null | undefined): string {
  return (t && TYPE_LABEL[t]) || "Contract";
}

export function eventTitle(e: EventItem): string {
  switch (e.type) {
    case "CREATED":
      return "Placement recorded";
    case "EXTENSION_REQUESTED":
      return "Extension requested";
    case "EXTENDED":
      return "Placement extended";
    case "EXTENSION_APPROVED":
      return "Extension approved";
    case "EXTENSION_DECLINED":
      return "Extension declined";
    case "COMPLETED":
      return "Marked complete";
    case "TERMINATED":
      return "Terminated";
    case "NOTICE_GIVEN":
      return "Notice recorded";
    case "STARTED":
      return "Started";
    case "REDEPLOY_STARTED":
      return "Redeployment started";
    case "REDEPLOY_CANCELLED":
      return "Removed from the redeployment pool";
    case "NOTE":
      return "Note added";
    case "UNDO":
      return "Change undone";
    default:
      return e.type;
  }
}

/** The "Extension Status" sentence under the heading. */
export function extensionSummary(d: Pick<PlacementDetail, "extensions" | "status">): { title: string; body: string } {
  const pending = d.extensions.find((x) => x.status === "REQUESTED");
  if (pending) return { title: "Extension requested", body: `An extension to ${formatDay(pending.requestedEndDate)} is waiting for a decision.` };
  const last = d.extensions.find((x) => x.status === "APPROVED");
  if (last) return { title: "Extended", body: `The end date moved to ${formatDay(last.requestedEndDate)}.` };
  if (d.status === "ENDED" || d.status === "TERMINATED") return { title: "Extension status", body: "This placement is complete. No extension can be requested." };
  return { title: "Extension status", body: "No extension requested yet. You can initiate an extension if the client wants to continue this placement." };
}

/* ── errors ──────────────────────────────────────────────────────────────────────── */

export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; status: number; code?: string; message: string; extra: Record<string, unknown> };

const CODE_TEXT: Record<string, string> = {
  ALREADY_PLACED: "This consultant already has a placement that has not ended.",
  EXTENSION_ALREADY_REQUESTED: "An extension is already waiting for a decision.",
  EXTENSION_NOT_PENDING: "That extension has already been decided.",
  PLACEMENT_ENDED: "This placement is already complete.",
  PLACEMENT_NOT_STARTED: "A placement that has not started cannot be completed.",
  ALREADY_IN_POOL: "This consultant is already in the redeployment pool.",
  NOT_IN_POOL: "This consultant is not in the redeployment pool.",
  UNDO_NOT_AVAILABLE: "That change can no longer be undone.",
  INVALID_MANAGER: "That person is not a member of this organization.",
  INVALID_CONTACT: "That contact does not belong to this client.",
  ALREADY_ON_NOTICE: "Notice was already recorded for this placement.",
};

export function errorSentence(r: { status: number; code?: string; message: string }): string {
  if (r.status === 0) return r.message;
  if (r.status === 404) return "This placement is no longer in your view.";
  return (r.code ? CODE_TEXT[r.code] : undefined) ?? r.message;
}

/* ── client ──────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/placements`;

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
  consultantId: number;
  clientId: number;
  roleTitle: string;
  startDate: string;
  endDate?: string | null;
  placementType?: PlacementType;
  accountManagerMemberId?: number | null;
  clientContactId?: number | null;
  billRateMinor?: number | null;
  rateUnit?: string | null;
  note?: string | null;
}

const key = () => ({ "idempotency-key": newKey() });

export const placementsApi = {
  list: (orgId: number | string, v: ViewState) => call<PlacementPage>(`${base(orgId)}?${listParams(v)}`, { cache: "no-store" }),
  counts: (orgId: number | string) => call<Counts>(`${base(orgId)}/counts`, { cache: "no-store" }),
  filters: (orgId: number | string) => call<FilterOptions>(`${base(orgId)}/filters`, { cache: "no-store" }),
  pickers: (orgId: number | string, kind: "consultant" | "client" | "contact" | "manager", q: string, clientId?: number) =>
    call<{ kind: string; items: PickerItem[] }>(`${base(orgId)}/pickers?kind=${kind}&q=${encodeURIComponent(q)}${clientId ? `&clientId=${clientId}` : ""}`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<PlacementDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  create: (orgId: number | string, body: CreateBody, k: string = newKey()) => call<PlacementDetail>(base(orgId), json("POST", body, { "idempotency-key": k })),
  extend: (orgId: number | string, id: number, endDate: string, note?: string) => call<PlacementDetail>(`${base(orgId)}/${id}/extend`, json("POST", { endDate, note: note || null }, key())),
  requestExtension: (orgId: number | string, id: number, requestedEndDate: string, note?: string) =>
    call<PlacementDetail>(`${base(orgId)}/${id}/extension-requests`, json("POST", { requestedEndDate, note: note || null }, key())),
  decide: (orgId: number | string, id: number, extensionId: number, decision: "APPROVE" | "DECLINE") =>
    call<PlacementDetail>(`${base(orgId)}/${id}/extensions/${extensionId}/decision`, json("POST", { decision }, key())),
  complete: (orgId: number | string, id: number, note?: string) => call<PlacementDetail>(`${base(orgId)}/${id}/complete`, json("POST", { note: note || null }, key())),
  giveNotice: (orgId: number | string, id: number, endDate: string, note?: string) => call<PlacementDetail>(`${base(orgId)}/${id}/notice`, json("POST", { endDate, note: note || null }, key())),
  terminate: (orgId: number | string, id: number, reason: string, endDate?: string) => call<PlacementDetail>(`${base(orgId)}/${id}/terminate`, json("POST", { reason, endDate: endDate || null }, key())),
  redeploy: (orgId: number | string, id: number, availableFrom?: string) => call<PlacementDetail>(`${base(orgId)}/${id}/redeploy`, json("POST", { availableFrom: availableFrom || null }, key())),
  cancelRedeploy: (orgId: number | string, id: number) => call<PlacementDetail>(`${base(orgId)}/${id}/redeploy/cancel`, json("POST", undefined, key())),
  addNote: (orgId: number | string, id: number, body: string) => call<PlacementDetail>(`${base(orgId)}/${id}/notes`, json("POST", { body }, key())),
  undo: (orgId: number | string, id: number, eventId: number) => call<PlacementDetail>(`${base(orgId)}/${id}/undo`, json("POST", { eventId }, key())),
};
