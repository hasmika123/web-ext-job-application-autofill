/**
 * The Roles & Permissions page's client logic (X4.11): types for the roles API (X1.14 + X4.1), the draft model of the permission
 * editor, the change summary the confirm step shows, the API error mapping, and the thin fetch helpers that talk to the BFF under
 * `/api/orgs/{orgId}/roles`. Pure functions first; nothing here touches React.
 *
 * The API owns every rule (ceiling, system roles, last admin, versions). This file only mirrors what it says so the page can
 * show a reason BEFORE a click (`grantable` from the catalog) and a sentence AFTER a refusal (`roleErrorMessage`).
 */
import type { PermissionScope } from "@/lib/ent/workspaces";

export type Scope = PermissionScope;
export const SCOPES: readonly Scope[] = ["OWN", "ASSIGNED", "TEAM", "DEPARTMENT", "ORG"];

const SCOPE_LABEL: Record<Scope, string> = { OWN: "Own", ASSIGNED: "Assigned", TEAM: "Team", DEPARTMENT: "Department", ORG: "Organization" };
export const scopeLabel = (s: Scope): string => SCOPE_LABEL[s] ?? s;

/* ── API shapes ───────────────────────────────────────────────────────────────── */

export interface RoleRow {
  id: number;
  key: string;
  name: string;
  description: string | null;
  templateKey: string | null;
  /** Organization / Department / Team / Assigned / Personal for a system role; "Custom" for the organization's own. */
  scopeLabel: string;
  scopeLevel: Scope;
  system: boolean;
  editable: boolean;
  status: string;
  assignedUsers: number;
  permissionCount: number;
  version: string;
}

export interface CategorySlice {
  category: string;
  label: string;
  keys: number;
  grantedKeys: number;
  percent: number;
  permissionSets: number;
}

/** `GET /api/orgs/{o}/roles/overview`. */
export interface RolesOverview {
  roles: RoleRow[];
  totalRoles: number;
  activeUsers: number;
  customRoleCount: number;
  systemRoleCount: number;
  totalPermissionKeys: number;
  permissionOverview: CategorySlice[];
  permissionSetCount: number;
}

export interface RolePermission {
  key: string;
  scope: Scope;
  ceilingRoleKey: string | null;
  rowFilter: string | null;
}

/** `GET /api/orgs/{o}/roles/{id}`. */
export interface RoleDetail {
  id: number;
  key: string;
  name: string;
  description: string | null;
  templateKey: string | null;
  system: boolean;
  editable: boolean;
  workspaceKey: string | null;
  scopeLabel: string;
  status: string;
  assignedUsers: number;
  version: string;
  permissions: RolePermission[];
}

export interface ScopeChoice {
  scope: Scope;
  grantable: boolean;
  ceilingRoleKey: string | null;
  rowFilter: string | null;
}

export type NotGrantableReason = "NO_PERMISSION" | "OWNER_ONLY" | "BEYOND_YOUR_ACCESS";

export interface CatalogEntry {
  key: string;
  family: string;
  label: string;
  description: string;
  dangerous: boolean;
  actsForOthers: boolean;
  defaultScope: Scope;
  scopes: ScopeChoice[];
  grantable: boolean;
  reason: NotGrantableReason | null;
}

export interface CatalogCategory {
  key: string;
  label: string;
  keyCount: number;
  permissionSets: number;
  permissions: CatalogEntry[];
}

/** `GET /api/orgs/{o}/permissions`. */
export interface Catalog {
  canManage: boolean;
  totalKeys: number;
  permissionSets: number;
  categories: CatalogCategory[];
}

export interface TemplateDiff {
  roleId: number;
  template: string | null;
  templateName: string | null;
  hasTemplate: boolean;
  matches: boolean;
  added: { key: string; scope: Scope }[];
  removed: { key: string; scope: Scope | null }[];
  scopeChanged: { key: string; from: Scope; to: Scope }[];
  attributesChanged: string[];
}

export interface HistoryEntry {
  id: number;
  action: string;
  risk: string;
  actor: string;
  targetType: string;
  targetId: string | null;
  targetLogin: string | null;
  roleName: string | null;
  at: string;
  details: Record<string, unknown>;
}

/* ── the editor's draft ───────────────────────────────────────────────────────── */

/** One granted permission in the editor; `ceilingRoleKey` / `rowFilter` ride along unchanged (the API keeps or requires them). */
export interface DraftRow {
  scope: Scope;
  ceilingRoleKey: string | null;
  rowFilter: string | null;
}
export type Draft = Record<string, DraftRow>;

/** The two keys every role holds at OWN; the API adds them itself, so the editor never shows or counts them. */
export const SELF_KEYS: readonly string[] = ["self.share_scope.set", "self.leave"];
export const isSelfKey = (key: string): boolean => SELF_KEYS.includes(key);

export function draftOf(perms: RolePermission[]): Draft {
  const d: Draft = {};
  for (const p of perms) if (!isSelfKey(p.key)) d[p.key] = { scope: p.scope, ceilingRoleKey: p.ceilingRoleKey ?? null, rowFilter: p.rowFilter ?? null };
  return d;
}

/** The PATCH / POST `permissions` array for a draft (key + scope always; an attribute only when the row has one). */
export function rowsOf(draft: Draft): { key: string; scope: Scope; ceilingRoleKey?: string; rowFilter?: string }[] {
  return Object.entries(draft)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, r]) => ({
      key,
      scope: r.scope,
      ...(r.ceilingRoleKey ? { ceilingRoleKey: r.ceilingRoleKey } : {}),
      ...(r.rowFilter ? { rowFilter: r.rowFilter } : {}),
    }));
}

export interface ChangeSummary {
  added: { key: string; scope: Scope }[];
  removed: { key: string; scope: Scope }[];
  changed: { key: string; from: Scope; to: Scope }[];
  /** Added or widened keys the registry marks dangerous (the confirm step names them). */
  dangerous: string[];
  total: number;
}

const rank = (s: Scope): number => SCOPES.indexOf(s);

/** What saving would do: keys added, removed, or moved to another scope. `isDangerous` comes from the catalog. */
export function summarize(before: Draft, after: Draft, isDangerous: (key: string) => boolean = () => false): ChangeSummary {
  const added: ChangeSummary["added"] = [];
  const removed: ChangeSummary["removed"] = [];
  const changed: ChangeSummary["changed"] = [];
  for (const [key, row] of Object.entries(after)) {
    const was = before[key];
    if (!was) added.push({ key, scope: row.scope });
    else if (was.scope !== row.scope) changed.push({ key, from: was.scope, to: row.scope });
  }
  for (const [key, row] of Object.entries(before)) if (!after[key]) removed.push({ key, scope: row.scope });
  const widened = changed.filter((c) => rank(c.to) > rank(c.from)).map((c) => c.key);
  const dangerous = [...added.map((a) => a.key), ...widened].filter(isDangerous);
  const byKey = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key);
  added.sort(byKey);
  removed.sort(byKey);
  changed.sort(byKey);
  return { added, removed, changed, dangerous: [...new Set(dangerous)].sort(), total: added.length + removed.length + changed.length };
}

/* ── catalog helpers ──────────────────────────────────────────────────────────── */

export function entriesOf(catalog: Catalog | null): CatalogEntry[] {
  return catalog ? catalog.categories.flatMap((c) => c.permissions) : [];
}

export function entryMap(catalog: Catalog | null): Map<string, CatalogEntry> {
  return new Map(entriesOf(catalog).map((e) => [e.key, e]));
}

/** The scope choice a new row at `scope` must be written with (the catalog carries the ceiling attribute the caller's own row has). */
export function choiceFor(entry: CatalogEntry | undefined, scope: Scope): ScopeChoice | undefined {
  return entry?.scopes.find((s) => s.scope === scope);
}

const REASON_TEXT: Record<NotGrantableReason, string> = {
  NO_PERMISSION: "You can view roles but not change them.",
  OWNER_ONLY: "Only the Owner holds this.",
  BEYOND_YOUR_ACCESS: "Beyond your access: you can only give what you hold yourself.",
};
export const reasonText = (r: NotGrantableReason | null): string => (r ? REASON_TEXT[r] : "");

/** Case-insensitive match on key, label, description. */
export function matchesQuery(e: CatalogEntry, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return e.key.toLowerCase().includes(t) || e.label.toLowerCase().includes(t) || e.description.toLowerCase().includes(t);
}

/* ── the roles table ──────────────────────────────────────────────────────────── */

export type RoleIconName = "crown" | "users" | "briefcase" | "handshake" | "chart" | "dollar" | "shield" | "key" | "heart";

/** The table's icon tile by what the role is for (the board colours these by category). */
export function roleIcon(role: Pick<RoleRow, "key" | "templateKey" | "system">): { icon: RoleIconName; tone: "brand" | "brand2" | "warm" } {
  const k = role.system ? role.key : (role.templateKey ?? "");
  switch (k) {
    case "OWNER":
    case "ORG_ADMIN":
      return { icon: "crown", tone: "warm" };
    case "MARKETING_MANAGER":
    case "MARKETING_SPECIALIST":
      return { icon: "chart", tone: "brand" };
    case "HR_SPECIALIST":
    case "TALENT_ACQUISITION":
      return { icon: "users", tone: "brand2" };
    case "FINANCE_SPECIALIST":
      return { icon: "dollar", tone: "brand" };
    case "ACCOUNT_MANAGER":
      return { icon: "handshake", tone: "brand2" };
    case "CONSULTANT":
      return { icon: "briefcase", tone: "warm" };
    case "EXECUTIVE_VIEWER":
      return { icon: "shield", tone: "brand" };
    case "STAFF":
    case "MEMBER":
      return { icon: "users", tone: "brand2" };
    default:
      return { icon: role.system ? "key" : "shield", tone: "brand" };
  }
}

/** Search the table: name, description, scope label. */
export function filterRoles(roles: RoleRow[], q: string): RoleRow[] {
  const t = q.trim().toLowerCase();
  if (!t) return roles;
  return roles.filter((r) => r.name.toLowerCase().includes(t) || (r.description ?? "").toLowerCase().includes(t) || r.scopeLabel.toLowerCase().includes(t));
}

/** A role the page may delete: the organization's own, held by nobody. */
export const deletable = (r: Pick<RoleRow, "system" | "assignedUsers">): boolean => !r.system && r.assignedUsers === 0;

/** Where "Assign users" goes: the Employees page filtered to the role. */
export const assignHref = (workspace: string, role: Pick<RoleRow, "id">): string => `/w/${workspace}/employees?role=${role.id}`;

/** The donut: a conic-gradient from the slices' percentages (whole circle even when rounding leaves a gap). */
export function donutGradient(slices: Pick<CategorySlice, "keys">[], colours: string[]): string {
  const total = slices.reduce((n, s) => n + s.keys, 0);
  if (total === 0) return "conic-gradient(var(--color-line) 0 100%)";
  let at = 0;
  const stops = slices.map((s, i) => {
    const from = at;
    at += (s.keys / total) * 100;
    return `${colours[i % colours.length]} ${from.toFixed(2)}% ${at.toFixed(2)}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

/* ── history ──────────────────────────────────────────────────────────────────── */

const ACTION_LABEL: Record<string, string> = {
  ROLE_CREATE: "Role created",
  ROLE_UPDATE: "Role changed",
  ROLE_DELETE: "Role deleted",
  ROLE_RESYNC: "Role restored to its template",
  ROLE_ASSIGN: "Role given to a member",
  ROLE_REVOKE: "Role taken from a member",
};
export const actionLabel = (a: string): string => ACTION_LABEL[a] ?? a;

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : typeof x === "object" && x ? `${(x as { key?: string }).key ?? "?"}` : String(x))) : []);

/** One line each for what an audit row says went out and came in (for the history drawer's old -> new). */
export function historyValues(e: HistoryEntry): { oldValue: string | null; newValue: string | null } {
  const d = e.details;
  const added = list(d.added);
  const removed = list(d.removed);
  const changed = Array.isArray(d.scopeChanged) ? (d.scopeChanged as { key: string; from: string; to: string }[]).map((c) => `${c.key} ${c.from}→${c.to}`) : [];
  if (e.action === "ROLE_CREATE") return { oldValue: null, newValue: `${typeof d.permissions === "number" ? d.permissions : "?"} permissions` };
  if (e.action === "ROLE_DELETE") return { oldValue: `${typeof d.name === "string" ? d.name : "role"}`, newValue: null };
  const out = [...removed.map((k) => `−${k}`)].join(", ") || null;
  const inn = [...added.map((k) => `+${k}`), ...changed].join(", ") || null;
  if (e.action === "ROLE_ASSIGN" || e.action === "ROLE_REVOKE") {
    return { oldValue: removed.length ? removed.join(", ") : null, newValue: added.length ? added.join(", ") : null };
  }
  if (!out && !inn && typeof d.name === "string") return { oldValue: null, newValue: `renamed to ${d.name}` };
  return { oldValue: out, newValue: inn };
}

/* ── errors ───────────────────────────────────────────────────────────────────── */

export interface ApiFail {
  ok: false;
  status: number;
  code?: string;
  message: string;
  extra: Record<string, unknown>;
}
export type ApiResult<T> = { ok: true; data: T } | ApiFail;

/** A human sentence for an API refusal (the API's own wording is the fallback). `roleName` names the role in the sentence when known. */
export function roleErrorMessage(r: Pick<ApiFail, "status" | "code" | "message" | "extra">): string {
  const x = r.extra;
  switch (r.code) {
    case "ROLE_CEILING": {
      if (x.reason === "SELF") return "You can't change your own roles. Ask another administrator.";
      if (x.reason === "ADMIN_ROLE") return "Administrator roles can only be given or taken away by an Owner.";
      const key = typeof x.key === "string" ? x.key : null;
      const scope = typeof x.scope === "string" ? x.scope : null;
      if (key) return `You can't give ${key}${scope ? ` at ${scopeLabel(scope as Scope).toLowerCase()} level` : ""}: you don't hold it yourself.`;
      return "That role includes permissions you don't hold yourself.";
    }
    case "LAST_ADMIN":
      return x.role === "OWNER" ? "The organization needs at least one Owner." : "The organization needs at least one administrator.";
    case "ROLE_IN_USE": {
      const n = typeof x.count === "number" ? x.count : null;
      return n === null ? "This role is still assigned to people." : `Used by ${n} ${n === 1 ? "person" : "people"}. Move them to another role first.`;
    }
    case "ROLE_SYSTEM":
      return "System roles can't be changed. Duplicate it to customise.";
    case "ROLE_NAME_TAKEN":
      return `A role with that name already exists.`;
    case "PRECONDITION_FAILED":
      return "This role changed while you were editing it. Reload to see the latest version.";
    case "PRECONDITION_REQUIRED":
      return "Reload the role and try again.";
    case "ORG_LIMIT_REACHED":
      return "Your organization has reached its limit of roles.";
    default:
      if (r.status === 404) return "That role isn't available. It may have been deleted.";
      if (r.status === 0) return "We couldn't reach the server. Check your connection.";
      return r.message || "Something went wrong.";
  }
}

export const isConflict = (r: ApiFail): boolean => r.code === "PRECONDITION_FAILED" || r.status === 412;

/** The key a ROLE_CEILING refusal names, so the editor can mark that row. */
export function ceilingKey(r: ApiFail): string | null {
  return r.code === "ROLE_CEILING" && typeof r.extra.key === "string" ? r.extra.key : null;
}

/* ── API client ───────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}`;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection.", extra: {} };
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  const body = (await res.json().catch(() => ({}))) as unknown;
  if (res.ok) return { ok: true, data: body as T };
  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const message = typeof obj.error === "string" ? obj.error : typeof obj.message === "string" ? obj.message : "Something went wrong.";
  const { error: _e, message: _m, code, ...extra } = obj;
  void _e;
  void _m;
  return { ok: false, status: res.status, code: typeof code === "string" ? code : undefined, message, extra };
}

const json = (method: string, body?: unknown, headers?: Record<string, string>): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export interface CreateBody {
  name: string;
  description?: string;
  templateKey?: string;
  sourceRoleId?: number;
  permissions?: { key: string; scope: Scope; ceilingRoleKey?: string; rowFilter?: string }[];
}

export interface UpdateBody {
  name?: string;
  description?: string;
  permissions?: { key: string; scope: Scope; ceilingRoleKey?: string; rowFilter?: string }[];
}

export const rolesApi = {
  overview: (orgId: number | string) => call<RolesOverview>(`${base(orgId)}/roles/overview`, { cache: "no-store" }),
  catalog: (orgId: number | string) => call<Catalog>(`${base(orgId)}/permissions`, { cache: "no-store" }),
  get: (orgId: number | string, roleId: number) => call<RoleDetail>(`${base(orgId)}/roles/${roleId}`, { cache: "no-store" }),
  diff: (orgId: number | string, roleId: number) => call<TemplateDiff>(`${base(orgId)}/roles/${roleId}/diff`, { cache: "no-store" }),
  history: (orgId: number | string, roleId: number | null, limit = 50) =>
    call<HistoryEntry[]>(`${base(orgId)}/roles/${roleId === null ? "history" : `${roleId}/history`}?limit=${limit}`, { cache: "no-store" }),
  create: (orgId: number | string, body: CreateBody) => call<RoleDetail>(`${base(orgId)}/roles`, json("POST", body)),
  update: (orgId: number | string, roleId: number, version: string, body: UpdateBody) => call<RoleDetail>(`${base(orgId)}/roles/${roleId}`, json("PATCH", body, { "if-match": version })),
  remove: (orgId: number | string, roleId: number, version: string) => call<void>(`${base(orgId)}/roles/${roleId}`, json("DELETE", undefined, { "if-match": version })),
  resync: (orgId: number | string, roleId: number, version: string) => call<RoleDetail>(`${base(orgId)}/roles/${roleId}/resync`, json("POST", undefined, { "if-match": version })),
  setMemberRoles: (orgId: number | string, memberId: number, roleIds: number[], primaryRoleId?: number) =>
    call<{ memberId: number; roles: { roleId: number; key: string; name: string; primary: boolean }[] }>(
      `${base(orgId)}/members/${memberId}/roles`,
      json("PUT", { roleIds, ...(primaryRoleId !== undefined ? { primaryRoleId } : {}) }),
    ),
};
