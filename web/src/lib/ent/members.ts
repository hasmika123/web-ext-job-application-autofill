/**
 * The Employees page (X4.12) and its detail sheet (X4.6), pure part: the types of the members API (X4.3 / X4.4), the client that
 * talks to the BFF under `/api/orgs/{orgId}/members`, and the small pure helpers the page needs (sorting, deltas, relative time,
 * error sentences, the reverse of a bulk call for Undo). Nothing here touches React.
 *
 * The page never invents a figure: a KPI tile with `previous = null` shows no delta; a detail field the API returns as null
 * (phone, location, timezone) is not drawn at all.
 */

/* ── contract types (mirror MemberDTO / MemberActionDTO) ─────────────────────────── */

export type MemberStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "LEFT" | "REMOVED" | "ERASED";

export interface GroupRef {
  id: number;
  name: string;
}

export interface PersonRef {
  memberId: number;
  name: string;
  avatarUrl: string | null;
}

export interface RoleRef {
  roleId: number | null;
  key: string;
  name: string;
  primary: boolean;
}

export interface InviteMeta {
  expiresAt: string | null;
  expired: boolean;
}

export interface MemberRow {
  id: number;
  name: string;
  initials: string;
  workEmail: string | null;
  avatarUrl: string | null;
  status: MemberStatus;
  title: string | null;
  roles: RoleRef[];
  department: GroupRef | null;
  team: GroupRef | null;
  manager: PersonRef | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
  consentScope: string | null;
  invite: InviteMeta | null;
  summaryOnly: boolean;
}

export interface MemberPage {
  items: MemberRow[];
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
}

export interface MemberCounts {
  asOf: string | null;
  scope: string;
  total: Tile;
  active: Tile;
  invited: Tile;
  suspended: Tile;
  departments: Tile;
  teams: Tile;
}

export interface MemberActions {
  edit: boolean;
  manageRoles: boolean;
  suspend: boolean;
  reinstate: boolean;
  offboard: boolean;
  viewActivity: boolean;
}

export interface ScheduledOffboarding {
  id: number;
  effectiveAt: string;
  reason: string | null;
  createdAt: string | null;
}

export interface ActivityItem {
  id: number;
  at: string;
  actor: PersonRef | null;
  action: string;
  risk: string | null;
  targetType: string | null;
  summary: string | null;
}

export interface ActivityPage {
  direction: string;
  items: ActivityItem[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface MemberDetail {
  id: number;
  name: string;
  initials: string;
  workEmail: string | null;
  phone: string | null;
  location: string | null;
  timezone: string | null;
  avatarUrl: string | null;
  status: MemberStatus;
  statusSince: string | null;
  title: string | null;
  roles: RoleRef[];
  primaryRoleKey: string | null;
  department: GroupRef | null;
  team: GroupRef | null;
  manager: PersonRef | null;
  directReports: PersonRef[];
  joinedAt: string | null;
  lastActiveAt: string | null;
  leftAt: string | null;
  consentScope: string | null;
  consentFullTo: PersonRef | null;
  invite: InviteMeta | null;
  scheduledOffboarding: ScheduledOffboarding | null;
  actions: MemberActions;
  recentActivity: ActivityItem[];
  summaryOnly: boolean;
  version: string;
}

export interface RowResult {
  memberId: number;
  ok: boolean;
  reason: string | null;
  previous: Record<string, unknown> | null;
}

export interface BulkResult {
  action: string;
  requested: number;
  ok: number;
  skipped: { memberId: number; reason: string }[];
  results: RowResult[];
}

export interface HookLine {
  hook: string;
  kind: string;
  text: string;
}

export interface OffboardPreview {
  memberId: number;
  name: string;
  status: string;
  blockers: { code: string; message: string }[];
  lines: HookLine[];
  rolesEnded: string[];
  consentScope: string | null;
  recordsKept: string[];
  licenseNotice: string | null;
}

export interface LifecycleResult {
  memberId: number;
  action: string;
  previousStatus: string;
  status: string;
  scheduled: ScheduledOffboarding | null;
  lines: HookLine[];
}

export interface ScheduledItem {
  id: number;
  memberId: number;
  name: string;
  effectiveAt: string;
  reason: string | null;
  createdAt: string | null;
}

/** One role of `GET /api/orgs/{o}/roles` (only what the page uses). */
export interface RoleOption {
  id: number;
  key: string;
  name: string;
  description: string | null;
  system: boolean;
}

export interface GroupOption {
  id: number;
  name: string;
  kind: "DEPARTMENT" | "TEAM";
  memberCount: number;
}

/* ── list query ──────────────────────────────────────────────────────────────────── */

export type SortKey = "name" | "joined" | "status" | "lastActive";
export type SortDir = "asc" | "desc";
export const SORT_KEYS: readonly SortKey[] = ["name", "joined", "status", "lastActive"];

export interface ListQuery {
  q: string;
  status: string;
  roleId: string;
  departmentId: string;
  teamId: string;
  managerId: string;
  sort: { key: SortKey; dir: SortDir };
  /** 0-based, as the API counts. */
  page: number;
  size: number;
}

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_QUERY: ListQuery = { q: "", status: "", roleId: "", departmentId: "", teamId: "", managerId: "", sort: { key: "joined", dir: "desc" }, page: 0, size: 10 };

/** The API refuses a search shorter than 2 characters (422); the page simply waits for a second character. */
export const MIN_SEARCH = 2;

/** `?q=...&status=...&sort=joined,desc&page=0&size=10` for the list call. */
export function listParams(q: ListQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q.trim().length >= MIN_SEARCH) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  if (q.roleId) p.set("roleId", q.roleId);
  if (q.departmentId) p.set("departmentId", q.departmentId);
  if (q.teamId) p.set("teamId", q.teamId);
  if (q.managerId) p.set("managerId", q.managerId);
  p.set("sort", `${q.sort.key},${q.sort.dir}`);
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p;
}

/** Clicking a header: the same column flips direction, a new column starts ascending (dates start with the newest). */
export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "joined" || key === "lastActive" ? "desc" : "asc" };
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

/** "Showing 1-10 of 186 employees" (the board says "1-10 of 186 employees"). */
export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0 || shown === 0) return "No employees";
  const from = page * size + 1;
  const to = page * size + shown;
  return `Showing ${from}-${to} of ${total} ${total === 1 ? "employee" : "employees"}`;
}

/* ── display helpers ─────────────────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", INVITED: "Invited", SUSPENDED: "Suspended", LEFT: "Offboarded", REMOVED: "Offboarded", ERASED: "Erased" };

export function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}

/** "Jessica Davis" -> kept as is; a primary role first, then the rest (`+N` in the table). */
export function rolesSorted(roles: RoleRef[]): RoleRef[] {
  return [...roles].sort((a, b) => Number(b.primary) - Number(a.primary));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "5 months ago", "in 3 days", "just now". */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  for (const [unit, secs] of UNITS) if (abs >= secs) return rtf.format(Math.round(diff / secs), unit);
  return rtf.format(Math.round(diff / 60), "minute");
}

/** Joined date with how long ago it was: "Jan 15, 2024 (5 months ago)". */
export function joinedText(iso: string | null | undefined, now?: number): string {
  const d = formatDate(iso);
  if (!d) return "";
  const rel = relativeTime(iso, now);
  return rel && rel !== "just now" ? `${d} (${rel})` : d;
}

export interface TileDelta {
  dir: "up" | "down" | "flat";
  text: string;
}

/**
 * The delta line of a KPI tile, or null. A tile whose `previous` / `delta` the API left null (a young organization, a figure with no
 * history) shows NOTHING: never a guess, never "0%". Percent when the API gave one, otherwise the plain difference ("+1").
 */
export function tileDelta(t: Tile | null | undefined): TileDelta | null {
  if (!t || t.previous === null || t.delta === null || typeof t.delta !== "number") return null;
  const dir = t.delta === 0 ? "flat" : t.delta > 0 ? "up" : "down";
  if (t.deltaPercent !== null && typeof t.deltaPercent === "number") {
    if (t.delta === 0) return { dir, text: "0%" };
    const n = Math.abs(t.deltaPercent);
    return { dir, text: `${t.delta > 0 ? "+" : "-"}${Number.isInteger(n) ? n : n.toFixed(1)}%` };
  }
  if (t.delta === 0) return { dir, text: "0" };
  return { dir, text: `${t.delta > 0 ? "+" : "-"}${Math.abs(t.delta)}` };
}

/** Initials for a name when the API has none. */
export function personInitials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
}

/* ── errors ──────────────────────────────────────────────────────────────────────── */

export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; status: number; code?: string; message: string; extra: Record<string, unknown> };

const REASON_TEXT: Record<string, string> = {
  SELF: "You can't do this to your own seat.",
  LAST_ADMIN: "That would leave the organization without an administrator.",
  ADMIN_ROLE: "Only an owner can give or remove an administrator role.",
  TARGET_RANK: "This person is above your level, so you can't change their access.",
  NOT_FOUND: "This person is no longer in your view.",
  MANAGER_CYCLE: "That would make a reporting loop.",
  MANAGER_INVALID: "That person can't be a manager.",
  TEAM_NOT_IN_DEPARTMENT: "That team is not part of the department.",
  SEAT_STATE: "This person has already left the organization.",
  UNCHANGED: "Nothing to change.",
};

/** A sentence for a refusal code or reason; null when the page has no friendlier wording than the server's. */
export function reasonText(code: string | undefined | null): string | null {
  return code ? (REASON_TEXT[code] ?? null) : null;
}

/** The sentence an inline error shows: ROLE_CEILING names its reason, the rest use the server's own message. */
export function errorSentence(r: { status: number; code?: string; message: string; extra?: Record<string, unknown> }): string {
  if (r.status === 0) return r.message;
  if (r.status === 412 || r.status === 409 && r.code === "VERSION_CONFLICT") return "Someone else changed this person. Reload to see the latest.";
  if (r.status === 428) return "Reload this person and try again.";
  const reason = typeof r.extra?.reason === "string" ? r.extra.reason : undefined;
  if (r.code === "ROLE_CEILING") {
    const why = reasonText(reason);
    if (why) return why;
    if (typeof r.extra?.key === "string") return `You can't give access you don't hold yourself (${r.extra.key}).`;
    return "That role is above your own access.";
  }
  return reasonText(r.code) ?? reasonText(reason) ?? r.message;
}

/** How a per-row skip reads in the summary toast. */
export function skipText(reason: string): string {
  return reasonText(reason) ?? reason.toLowerCase().replace(/_/g, " ");
}

/* ── client ──────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}`;

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

export interface PatchBody {
  title?: string | null;
  departmentGroupId?: number | null;
  teamGroupId?: number | null;
  managerMemberId?: number | null;
}

export const membersApi = {
  list: (orgId: number | string, q: ListQuery) => call<MemberPage>(`${base(orgId)}/members?${listParams(q)}`, { cache: "no-store" }),
  counts: (orgId: number | string) => call<MemberCounts>(`${base(orgId)}/members/counts`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<MemberDetail>(`${base(orgId)}/members/${id}`, { cache: "no-store" }),
  activity: (orgId: number | string, id: number, direction: "on" | "by", page: number) =>
    call<ActivityPage>(`${base(orgId)}/members/${id}/activity?direction=${direction}&page=${page}&size=10`, { cache: "no-store" }),
  patch: (orgId: number | string, id: number, body: PatchBody, version: string) => call<MemberDetail>(`${base(orgId)}/members/${id}`, json("PATCH", body, { "if-match": version })),
  setRoles: (orgId: number | string, id: number, roleIds: number[], primaryRoleId: number) =>
    call<{ memberId: number; roles: { roleId: number; key: string; name: string; primary: boolean }[] }>(`${base(orgId)}/members/${id}/roles`, json("PUT", { roleIds, primaryRoleId })),
  bulk: (orgId: number | string, kind: "roles" | "groups" | "manager" | "status", body: Record<string, unknown>, key: string = newKey()) =>
    call<BulkResult>(`${base(orgId)}/members/bulk/${kind}`, json("POST", body, { "idempotency-key": key })),
  suspend: (orgId: number | string, id: number, reason: string) => call<LifecycleResult>(`${base(orgId)}/members/${id}/suspend`, json("POST", { reason }, { "idempotency-key": newKey() })),
  reinstate: (orgId: number | string, id: number, reason?: string) => call<LifecycleResult>(`${base(orgId)}/members/${id}/reinstate`, json("POST", reason ? { reason } : {}, { "idempotency-key": newKey() })),
  offboardPreview: (orgId: number | string, id: number) => call<OffboardPreview>(`${base(orgId)}/members/${id}/offboard-preview`, { cache: "no-store" }),
  offboard: (orgId: number | string, id: number, body: { reason: string; confirm: string; effectiveAt?: string | null }) =>
    call<LifecycleResult>(`${base(orgId)}/members/${id}/offboard`, json("POST", body, { "idempotency-key": newKey() })),
  scheduled: (orgId: number | string) => call<{ items: ScheduledItem[] }>(`${base(orgId)}/members/offboarding`, { cache: "no-store" }),
  cancelScheduled: (orgId: number | string, id: number) => call<void>(`${base(orgId)}/members/offboarding/${id}`, { method: "DELETE" }),
  roles: (orgId: number | string) => call<RoleOption[]>(`${base(orgId)}/roles`, { cache: "no-store" }),
  groups: (orgId: number | string) => call<GroupOption[]>(`${base(orgId)}/groups`, { cache: "no-store" }),
};

/* ── Undo: the reverse of a bulk call, from the `previous` values ─────────────────── */

export type UndoPlan =
  | { kind: "roles"; memberId: number; roleIds: number[]; primaryRoleId: number }
  | { kind: "groups"; memberIds: number[]; departmentGroupId: number | null; teamGroupId: number | null }
  | { kind: "manager"; memberIds: number[]; managerMemberId: number | null }
  | { kind: "status"; memberIds: number[]; action: "SUSPEND" | "REINSTATE" };

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * What it takes to put the changed rows back. Roles are restored one person at a time (each had their own set), the others are
 * grouped by their shared previous value so one call restores many. Rows that were skipped or unchanged have no `previous` and are
 * left alone.
 */
export function undoPlan(action: "roles" | "groups" | "manager" | "status", results: RowResult[]): UndoPlan[] {
  const changed = results.filter((r) => r.ok && r.previous);
  if (action === "roles") {
    return changed.flatMap((r) => {
      const ids = Array.isArray(r.previous!.roleIds) ? (r.previous!.roleIds as unknown[]).filter((x): x is number => typeof x === "number") : [];
      const primary = num(r.previous!.primaryRoleId) ?? ids[0];
      return ids.length > 0 && primary != null ? [{ kind: "roles" as const, memberId: r.memberId, roleIds: ids, primaryRoleId: primary }] : [];
    });
  }
  const groups = new Map<string, { ids: number[]; a: number | null; b: number | null }>();
  for (const r of changed) {
    let a: number | null = null;
    let b: number | null = null;
    let tag = "";
    if (action === "groups") {
      a = num(r.previous!.departmentGroupId);
      b = num(r.previous!.teamGroupId);
      tag = `${a}:${b}`;
    } else if (action === "manager") {
      a = num(r.previous!.managerMemberId);
      tag = `${a}`;
    } else {
      tag = String(r.previous!.status);
    }
    const g = groups.get(tag) ?? { ids: [], a, b };
    g.ids.push(r.memberId);
    groups.set(tag, g);
  }
  return [...groups.entries()].map(([tag, g]): UndoPlan => {
    if (action === "groups") return { kind: "groups", memberIds: g.ids, departmentGroupId: g.a, teamGroupId: g.b };
    if (action === "manager") return { kind: "manager", memberIds: g.ids, managerMemberId: g.a };
    return { kind: "status", memberIds: g.ids, action: tag === "ACTIVE" ? "REINSTATE" : "SUSPEND" };
  });
}

/** One sentence for a bulk outcome: "Changed 3 people. 1 skipped: that would leave the organization without an administrator." */
export function bulkSummary(r: BulkResult, verb: string): { title: string; description?: string; variant: "success" | "error" } {
  const changed = r.results.filter((x) => x.ok && x.previous).length;
  const unchanged = r.ok - changed;
  const noun = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  const parts: string[] = [];
  if (unchanged > 0) parts.push(`${noun(unchanged)} already as asked`);
  if (r.skipped.length > 0) {
    const why = [...new Set(r.skipped.map((s) => skipText(s.reason)))].slice(0, 2).join("; ");
    parts.push(`${r.skipped.length} skipped: ${why}`);
  }
  if (changed === 0 && r.skipped.length > 0) return { title: `Nothing was ${verb}`, description: parts.join(". "), variant: "error" };
  return { title: `${verb[0].toUpperCase()}${verb.slice(1)} ${noun(changed)}`, description: parts.length ? parts.join(". ") : undefined, variant: "success" };
}
