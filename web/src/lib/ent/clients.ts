/**
 * The Clients page, pure part: the types of the clients API (`/api/orgs/{orgId}/clients`, a client is a `client_account`), the client that
 * talks to the BFF, the URL <-> query mapping (every filter, the page, the sort, the tab and the open client live in the address, so a link
 * reproduces the view) and the small helpers the page needs. Nothing here touches React.
 *
 * The page never invents a figure: a KPI tile with `previous = null` shows no delta; a client with no manager shows a dash; the health
 * badge is the API's own (computed from rows by the organization's thresholds), never worked out here.
 */
import { newKey, relativeTime, type ApiResult } from "@/lib/ent/members";
import { tileDelta, type TileDelta } from "@/lib/ent/jobs";

export { newKey, relativeTime, tileDelta };
export type { ApiResult, TileDelta };

/* ── contract types (mirror ClientDTO) ───────────────────────────────────────────── */

export type Health = "HEALTHY" | "AT_RISK" | "NEUTRAL";
export type ClientStatus = "ACTIVE" | "PROSPECT" | "INACTIVE";

export interface Person {
  id: number;
  name: string;
}

export interface HealthInfo {
  level: Health;
  reason: string;
}

export interface ClientRow {
  id: number;
  name: string;
  industry: string | null;
  status: ClientStatus;
  website: string | null;
  openRequirements: number;
  activeConsultants: number;
  manager: Person | null;
  health: HealthInfo;
  lastActivityAt: string;
}

export interface ClientPage {
  items: ClientRow[];
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

export interface Facet {
  value: string;
  label: string;
  count: number;
}

export interface Facets {
  industries: Facet[];
  health: Facet[];
  statuses: Facet[];
  sizes: Facet[];
  managers: Facet[];
}

export interface Access {
  canManage: boolean;
  canCreateRequirement: boolean;
}

export interface Summary {
  totalClients: Tile;
  activeRequirements: Tile;
  newThisMonth: Tile;
  placementsViaClients: Tile;
  asOf: string;
  facets: Facets;
  healthRule: { healthyDays: number; atRiskDays: number };
  managerOptions: Person[];
  access: Access;
}

export interface Contact {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone?: string | null;
  notes?: string | null;
  role: string | null;
  status: "ACTIVE" | "LEFT";
  addedAt: string;
}

export interface RequirementItem {
  id: number;
  title: string;
  status: string;
  positions: number;
  filled: number;
  location: string | null;
  postedAt: string;
  submissions: number;
}

export interface SubmissionItem {
  applicationId: number;
  code: string;
  consultantId: number;
  consultantName: string;
  jobTitle: string;
  stage: string;
  closedReason: string | null;
  at: string;
}

export interface NoteItem {
  id: number;
  body: string;
  at: string;
  author: string | null;
}

export interface ClientDetail {
  id: number;
  name: string;
  status: ClientStatus;
  industry: string | null;
  website: string | null;
  location: string | null;
  sizeBand: string | null;
  clientSince: string | null;
  about: string | null;
  manager: Person | null;
  health: HealthInfo;
  openRequirements: number;
  activeConsultants: number;
  placements: number;
  lastActivityAt: string;
  contacts: Contact[];
  contactCount: number;
  requirements: RequirementItem[];
  requirementCount: number;
  submissions: SubmissionItem[];
  notes: NoteItem[];
  noteCount: number;
  version: string;
  access: Access;
}

export interface ClientRef {
  id: number;
  name: string;
}

export interface ContactRow {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone?: string | null;
  notes?: string | null;
  role: string | null;
  status: string;
  client: ClientRef;
  addedAt: string;
}

export interface RequirementRow {
  id: number;
  title: string;
  client: ClientRef;
  status: string;
  positions: number;
  filled: number;
  location: string | null;
  postedAt: string;
  submissions: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface ActivityItem {
  at: string;
  kind: "client" | "contact" | "note" | "requirement" | "submission" | "placement";
  summary: string;
  client: ClientRef;
  actor: string | null;
}

export interface CreateBody {
  name: string;
  industry?: string | null;
  website?: string | null;
  location?: string | null;
  sizeBand?: string | null;
  clientSince?: string | null;
  about?: string | null;
  status?: "ACTIVE" | "PROSPECT";
  ownerMemberId?: number | null;
}

export type PatchBody = Partial<{
  name: string;
  industry: string | null;
  website: string | null;
  location: string | null;
  sizeBand: string | null;
  clientSince: string | null;
  about: string | null;
  status: ClientStatus;
  ownerMemberId: number | null;
}>;

export interface ContactBody {
  name: string;
  title?: string | null;
  email?: string | null;
  /** A work phone (digits, +, spaces, dashes, brackets). Optional. */
  phone?: string | null;
  /** A short note about the person (at most 500 characters). No identity or bank values: the API scans it. */
  notes?: string | null;
  role?: string | null;
}

/* ── labels ──────────────────────────────────────────────────────────────────────── */

export const HEALTH_LABEL: Record<string, string> = { HEALTHY: "Healthy", AT_RISK: "At Risk", NEUTRAL: "Neutral" };
/** The pill tone of each health (the boards' pill tokens: green, amber, blue). */
export const HEALTH_TONE: Record<string, "green" | "amber" | "blue"> = { HEALTHY: "green", AT_RISK: "amber", NEUTRAL: "blue" };
export const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", PROSPECT: "Prospect", INACTIVE: "Inactive" };
export const STATUS_TONE: Record<string, "green" | "purple" | "grey"> = { ACTIVE: "green", PROSPECT: "purple", INACTIVE: "grey" };
export const SIZE_LABEL: Record<string, string> = {
  "1-50": "1 - 50 employees",
  "51-200": "51 - 200 employees",
  "201-1000": "201 - 1,000 employees",
  "1000-5000": "1,000 - 5,000 employees",
  "5000+": "5,000+ employees",
};
export const SIZE_OPTIONS = Object.keys(SIZE_LABEL);
export const REQUIREMENT_STATUS_LABEL: Record<string, string> = { OPEN: "Open", IN_REVIEW: "In Review", ON_HOLD: "On Hold", FILLED: "Filled", CLOSED: "Closed" };
export const REQUIREMENT_TONE: Record<string, "green" | "blue" | "amber" | "purple" | "grey"> = { OPEN: "green", IN_REVIEW: "blue", ON_HOLD: "amber", FILLED: "purple", CLOSED: "grey" };
export const ROLE_LABEL: Record<string, string> = { HIRING_MANAGER: "Hiring manager", RECRUITER: "Recruiter", VMS_ADMIN: "VMS admin", AP: "Accounts payable", OTHER: "Other" };
/** The stage words of the board's submission pill ("Interview", "Submitted"). */
export const STAGE_PILL: Record<string, string> = { ASSIGNED: "Assigned", SUBMITTED: "Submitted", UNDER_REVIEW: "In review", INTERVIEWING: "Interview", OFFER: "Offer", CLOSED: "Closed" };
export const STAGE_TONE: Record<string, "blue" | "green" | "amber" | "purple" | "grey"> = { ASSIGNED: "grey", SUBMITTED: "blue", UNDER_REVIEW: "blue", INTERVIEWING: "blue", OFFER: "purple", CLOSED: "grey" };

export const healthLabel = (h: string) => HEALTH_LABEL[h] ?? h;
export const sizeLabel = (s: string | null | undefined) => (s ? (SIZE_LABEL[s] ?? s) : "");

/** "Apr 18, 2024" in UTC (the API sends instants). */
export function dayText(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Client since Jan 2022"; falls back to nothing when the API has no date. */
export function sinceText(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? "" : `Client since ${d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;
}

/** The address without scheme or trailing slash, for display ("www.techcorp.com"). */
export function siteText(url: string | null | undefined): string {
  return (url ?? "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** A link target for a website the API returned; only http(s) is ever linked. */
export function siteHref(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

const SUFFIXES = new Set(["inc", "co", "corp", "corporation", "ltd", "llc", "plc", "group", "systems", "solutions", "labs", "lab", "company", "holdings", "partners", "internal", "&"]);

/**
 * Initials of a company for the tile (no logos exist). A trailing legal or generic word is not part of the mark: "TechCorp Inc." is a "T",
 * "Global Finance Co." a "GF", "Retail Solutions" an "R" (the board's tiles). A person's name keeps its two initials (`words = 2`, any suffix kept).
 */
export function tileInitials(name: string, words = 2): string {
  const w = name.replace(/[^\p{L}\p{N}\s&.-]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  const core = [...w];
  while (core.length > 1 && SUFFIXES.has(core[core.length - 1].replace(/\.$/, "").toLowerCase())) core.pop();
  if (core.length === 1) return core[0][0].toUpperCase();
  return core.slice(0, words).map((x) => x[0]).join("").toUpperCase();
}

/** The colour family of a company tile: one of six, stable for a given name. */
export const TILE_TONES = ["violet", "blue", "pink", "ink", "orange", "green", "indigo", "teal"] as const;
export type TileTone = (typeof TILE_TONES)[number];
export function tileTone(name: string): TileTone {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TILE_TONES[h % TILE_TONES.length];
}

/* ── the query and its URL ────────────────────────────────────────────────────────── */

export type MainTab = "directory" | "contacts" | "requirements" | "activity";
export const MAIN_TABS: readonly MainTab[] = ["directory", "contacts", "requirements", "activity"];
export type DrawerTab = "overview" | "contacts" | "requirements";
export const DRAWER_TABS: readonly DrawerTab[] = ["overview", "contacts", "requirements"];
export type SortKey = "name" | "industry" | "requirements" | "consultants" | "manager" | "health" | "activity";
export const SORT_KEYS: readonly SortKey[] = ["name", "industry", "requirements", "consultants", "manager", "health", "activity"];
export type SortDir = "asc" | "desc";
export type ViewMode = "list" | "grid";
export const PAGE_SIZES = [10, 25, 50] as const;
export const MIN_SEARCH = 2;

export interface ClientQuery {
  tab: MainTab;
  q: string;
  industry: string;
  health: string;
  status: string;
  sizeBand: string;
  managerId: string;
  sort: { key: SortKey; dir: SortDir };
  page: number;
  size: number;
  view: ViewMode;
}

export const DEFAULT_QUERY: ClientQuery = {
  tab: "directory",
  q: "",
  industry: "",
  health: "",
  status: "",
  sizeBand: "",
  managerId: "",
  sort: { key: "activity", dir: "desc" },
  page: 0,
  size: 10,
  view: "list",
};

const FILTER_KEYS = ["industry", "health", "status", "sizeBand", "managerId"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export function defaultDir(k: SortKey): SortDir {
  return k === "name" || k === "industry" || k === "manager" ? "asc" : "desc";
}

export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: defaultDir(key) };
}

const searchOk = (q: string) => q.trim().length >= MIN_SEARCH;

/** The directory call's parameters: `?q=..&industry=..&sort=activity&dir=desc&page=0&size=10`. */
export function listParams(q: ClientQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (searchOk(q.q)) p.set("q", q.q.trim());
  for (const k of FILTER_KEYS) if (q[k]) p.set(k, q[k]);
  p.set("sort", q.sort.key);
  p.set("dir", q.sort.dir);
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p;
}

/** The Contacts / Requirements tabs' parameters. */
export function tabParams(q: ClientQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (searchOk(q.q)) p.set("q", q.q.trim());
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p;
}

/** The address of the page: only what differs from the default, plus the open client (`client=12`) and its tab. */
export function urlParams(q: ClientQuery, openId: number | null, dtab: DrawerTab): URLSearchParams {
  const p = new URLSearchParams();
  if (q.tab !== "directory") p.set("tab", q.tab);
  if (q.q.trim()) p.set("q", q.q.trim());
  for (const k of FILTER_KEYS) if (q[k]) p.set(k, q[k]);
  if (q.sort.key !== DEFAULT_QUERY.sort.key || q.sort.dir !== DEFAULT_QUERY.sort.dir) p.set("sort", `${q.sort.key},${q.sort.dir}`);
  if (q.page > 0) p.set("page", String(q.page + 1));
  if (q.size !== DEFAULT_QUERY.size) p.set("size", String(q.size));
  if (q.view !== "list") p.set("view", q.view);
  if (openId !== null) {
    p.set("client", String(openId));
    if (dtab !== "overview") p.set("dtab", dtab);
  }
  return p;
}

/** The inverse of {@link urlParams}: junk in the address falls back to the default, never throws. */
export function parseUrl(sp: { get(name: string): string | null }): { query: ClientQuery; openId: number | null; dtab: DrawerTab } {
  const query: ClientQuery = { ...DEFAULT_QUERY, sort: { ...DEFAULT_QUERY.sort } };
  const tab = sp.get("tab") ?? "";
  if ((MAIN_TABS as readonly string[]).includes(tab)) query.tab = tab as MainTab;
  query.q = (sp.get("q") ?? "").slice(0, 80);
  for (const k of FILTER_KEYS) query[k] = (sp.get(k) ?? "").slice(0, 120);
  const sort = (sp.get("sort") ?? "").split(",");
  if ((SORT_KEYS as readonly string[]).includes(sort[0])) query.sort = { key: sort[0] as SortKey, dir: sort[1] === "asc" ? "asc" : sort[1] === "desc" ? "desc" : defaultDir(sort[0] as SortKey) };
  const page = Number(sp.get("page"));
  if (Number.isInteger(page) && page >= 1 && page < 10000) query.page = page - 1;
  const size = Number(sp.get("size"));
  if ((PAGE_SIZES as readonly number[]).includes(size)) query.size = size;
  if (sp.get("view") === "grid") query.view = "grid";
  const id = Number(sp.get("client"));
  const dtab = sp.get("dtab") ?? "overview";
  return { query, openId: Number.isInteger(id) && id > 0 ? id : null, dtab: (DRAWER_TABS as readonly string[]).includes(dtab) ? (dtab as DrawerTab) : "overview" };
}

export const activeFilterCount = (q: ClientQuery): number => FILTER_KEYS.filter((k) => !!q[k]).length;
export const hasFilters = (q: ClientQuery): boolean => searchOk(q.q) || activeFilterCount(q) > 0;

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** "1-10 of 86 clients" (the noun is plural-aware). */
export function showingText(total: number, page: number, size: number, shown: number, noun = "client"): string {
  if (total === 0) return `0 ${noun}s`;
  const from = page * size + 1;
  return `${from}-${from + shown - 1} of ${total} ${total === 1 ? noun : `${noun}s`}`;
}

/* ── errors ──────────────────────────────────────────────────────────────────────── */

const CODE_TEXT: Record<string, string> = {
  DUPLICATE_CLIENT: "You already have a client with that name.",
  DUPLICATE_CONTACT: "That e-mail already belongs to a contact of this client.",
  WORK_EMAIL_REQUIRED: "Use a work e-mail: we keep business contacts, not private mailboxes.",
  SENSITIVE_CONTENT: "That looks like sensitive personal data. We never store it, so please remove it.",
};

export function errorSentence(r: { status: number; code?: string; message: string; extra?: Record<string, unknown> }): string {
  if (r.status === 0) return r.message;
  if (r.status === 412 || r.status === 428) return "Someone else changed this client. It was reloaded, try again.";
  if (r.status === 404) return "This client is no longer in your view.";
  if (r.code && CODE_TEXT[r.code]) return CODE_TEXT[r.code];
  if (r.status === 422 && r.message) return r.message;
  return r.message;
}

/* ── client ──────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/clients`;

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

export const clientsApi = {
  list: (orgId: number | string, q: ClientQuery) => call<ClientPage>(`${base(orgId)}?${listParams(q)}`, { cache: "no-store" }),
  summary: (orgId: number | string) => call<Summary>(`${base(orgId)}/summary`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<ClientDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  contacts: (orgId: number | string, q: ClientQuery) => call<Paged<ContactRow>>(`${base(orgId)}/contacts?${tabParams(q)}`, { cache: "no-store" }),
  /** The Account Manager's Contacts page: every contact, optionally of one client. */
  contactList: (orgId: number | string, f: { q: string; clientId: string; page: number; size: number }) => {
    const p = new URLSearchParams();
    if (searchOk(f.q)) p.set("q", f.q.trim());
    if (f.clientId) p.set("clientId", f.clientId);
    p.set("page", String(f.page));
    p.set("size", String(f.size));
    return call<Paged<ContactRow>>(`${base(orgId)}/contacts?${p}`, { cache: "no-store" });
  },
  requirements: (orgId: number | string, q: ClientQuery) => call<Paged<RequirementRow>>(`${base(orgId)}/requirements?${tabParams(q)}`, { cache: "no-store" }),
  activity: (orgId: number | string, limit: number) => call<{ items: ActivityItem[] }>(`${base(orgId)}/activity?limit=${limit}`, { cache: "no-store" }),
  create: (orgId: number | string, body: CreateBody, key: string = newKey()) => call<ClientDetail>(base(orgId), json("POST", body, { "idempotency-key": key })),
  patch: (orgId: number | string, id: number, body: PatchBody, version: string) => call<ClientDetail>(`${base(orgId)}/${id}`, json("PATCH", body, { "if-match": version })),
  addContact: (orgId: number | string, id: number, body: ContactBody, key: string = newKey()) => call<ClientDetail>(`${base(orgId)}/${id}/contacts`, json("POST", body, { "idempotency-key": key })),
  patchContact: (orgId: number | string, id: number, contactId: number, body: Partial<ContactBody> & { status?: "ACTIVE" | "LEFT" }) => call<ClientDetail>(`${base(orgId)}/${id}/contacts/${contactId}`, json("PATCH", body)),
  addNote: (orgId: number | string, id: number, text: string, key: string = newKey()) => call<ClientDetail>(`${base(orgId)}/${id}/notes`, json("POST", { body: text }, { "idempotency-key": key })),
};
