/**
 * Departments and Teams (X4.5): the contract of `/api/orgs/{orgId}/groups/**` as the two pages use it, the BFF client, and the
 * few pure helpers (icon/colour pickers, ETag handling, error sentences). Every number on the pages comes from these shapes;
 * there is no open-roles or workload field because the API has no data behind one.
 */

export type GroupKind = "DEPARTMENT" | "TEAM" | "COHORT";
export type GroupStatus = "ACTIVE" | "INACTIVE";

export interface GroupPerson {
  memberId: number;
  name: string;
  initials: string;
  roleName: string | null;
}

export interface Group {
  id: number;
  name: string;
  kind: GroupKind;
  sortOrder: number;
  /** Live seats (invited, active, suspended) placed in the group. */
  memberCount: number;
  parentGroupId: number | null;
  parentName: string | null;
  leadMemberId: number | null;
  lead: GroupPerson | null;
  status: GroupStatus;
  icon: string | null;
  color: string | null;
  /** The weak ETag `W/"n"`: what an edit sends back as If-Match. */
  version: string;
  createdAt: string;
  /** ACTIVE people only: what the pages call "employees". */
  activeCount: number;
  teamCount: number | null;
  memberPreview: GroupPerson[];
}

export interface Summary {
  departments: number;
  teams: number;
  employees: number;
  teamMembers: number;
  unplaced: number;
  departmentLeads: number;
  teamLeads: number;
  averageTeamSize: number | null;
  inactive: number;
}

export interface DirectoryPage {
  items: Group[];
  page: number;
  size: number;
  total: number;
  summary: Summary;
}

export interface Structure {
  organizationName: string;
  employees: number;
  departments: { group: Group; teams: Group[] }[];
  unassignedTeams: Group[];
  cohorts: Group[];
}

export interface GroupMember {
  memberId: number;
  name: string;
  initials: string;
  status: string;
  roleName: string | null;
  lead: boolean;
  departmentName: string | null;
  teamName: string | null;
}

export interface GroupDetail {
  group: Group;
  teams: Group[];
  members: GroupMember[];
  membersTotal: number;
}

export interface PersonOption {
  memberId: number;
  name: string;
  initials: string;
  roleName: string | null;
  departmentName: string | null;
  teamName: string | null;
}

export interface MoveResult {
  groupId: number;
  moved: number;
  unchanged: number;
  skipped: number;
  results: { memberId: number; status: "MOVED" | "UNCHANGED" | "SKIPPED"; code: string | null }[];
}

export interface DirectoryQuery {
  kind?: GroupKind;
  departmentId?: string;
  status?: string;
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  size?: number;
}

export interface GroupBody {
  name?: string;
  kind?: GroupKind;
  parentGroupId?: number | null;
  clearParent?: boolean;
  leadMemberId?: number | null;
  clearLead?: boolean;
  status?: GroupStatus;
  icon?: string;
  color?: string;
}

/* ── pickers (the API's closed lists; the sentence is the page's) ─────────────────────────────── */

export const GROUP_ICONS = ["briefcase", "users", "building", "chart", "heart", "rocket", "globe", "shield", "graduation", "dollar", "lightbulb", "handshake"] as const;
export const GROUP_COLORS = ["primary", "secondary", "success", "info", "warning", "danger", "neutral"] as const;
export const COLOR_LABEL: Record<string, string> = { primary: "Brand", secondary: "Accent", success: "Green", info: "Warm", warning: "Amber", danger: "Coral", neutral: "Grey" };

export type GroupTone = (typeof GROUP_COLORS)[number];

/** Tile (soft background + readable foreground) and bar (solid fill) classes per colour. Brand colours follow the tenant theme; the rest are fixed status tones. */
export const TONE_TILE: Record<string, string> = {
  primary: "bg-accent-soft text-accent",
  secondary: "bg-v2-violet-soft text-v2-violet",
  success: "bg-v2-green-soft text-v2-green",
  info: "bg-v2-pink-soft text-v2-pink",
  warning: "bg-v2-amber-soft text-v2-amber",
  danger: "bg-v2-coral-soft text-v2-coral",
  neutral: "bg-paper-2 text-ink-soft",
};
export const TONE_BAR: Record<string, string> = {
  primary: "bg-accent",
  secondary: "bg-v2-violet",
  success: "bg-v2-green",
  info: "bg-v2-pink",
  warning: "bg-v2-amber",
  danger: "bg-v2-coral",
  neutral: "bg-ink-soft",
};
export const toneOf = (color: string | null | undefined): string => (color && color in TONE_TILE ? color : "neutral");

/* ── errors ───────────────────────────────────────────────────────────────────────────────────── */

export interface ApiFail {
  ok: false;
  status: number;
  code?: string;
  message: string;
  field?: string;
  count?: number;
  currentVersion?: string;
}
export type ApiResult<T> = { ok: true; data: T } | ApiFail;

/** One friendly sentence per typed refusal; the server's own sentence is the fallback. */
export function failMessage(f: ApiFail): string {
  switch (f.code) {
    case "GROUP_NAME_TAKEN":
      return "A department or team with that name already exists.";
    case "GROUP_NOT_EMPTY":
      return f.count ? `Move the ${f.count} ${f.count === 1 ? "person or team" : "people and teams"} out first.` : "Move the people out first.";
    case "LEAD_NOT_ACTIVE":
      return "The lead has to be an active member of the organization.";
    case "GROUP_PARENT_INVALID":
      return "A team can only sit under a department.";
    case "GROUP_INACTIVE":
      return "That group is archived. Restore it before adding people.";
    case "PRECONDITION_FAILED":
      return "Someone else changed this just now. It has been reloaded.";
    case "PRECONDITION_REQUIRED":
      return "Reload the page and try again.";
    case "ORG_LIMIT_REACHED":
      return "You have reached the number of groups this organization may have.";
    case "SENSITIVE_CONTENT":
      return "Names can't contain numbers that look like personal identifiers.";
    default:
      return f.message || "Something went wrong.";
  }
}

/* ── BFF client ───────────────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/groups`;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection." };
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T };
  return {
    ok: false,
    status: res.status,
    code: typeof body.code === "string" ? body.code : undefined,
    message: typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "Something went wrong.",
    field: typeof body.field === "string" ? body.field : undefined,
    count: typeof body.count === "number" ? body.count : undefined,
    currentVersion: typeof body.currentVersion === "string" ? body.currentVersion : undefined,
  };
}

const jsonInit = (method: string, body?: unknown, headers?: Record<string, string>): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const uuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-0000-4000-8000-000000000000`.slice(0, 36);

export function directoryQueryString(q: DirectoryQuery): string {
  const p = new URLSearchParams();
  if (q.kind) p.set("kind", q.kind);
  if (q.departmentId) p.set("departmentId", q.departmentId);
  if (q.status) p.set("status", q.status);
  if (q.q) p.set("q", q.q);
  if (q.sort) p.set("sort", q.sort);
  if (q.dir) p.set("dir", q.dir);
  p.set("page", String(q.page ?? 0));
  p.set("size", String(q.size ?? 10));
  return p.toString();
}

export const groupsApi = {
  directory: (orgId: number | string, q: DirectoryQuery) => call<DirectoryPage>(`${base(orgId)}/directory?${directoryQueryString(q)}`, { cache: "no-store" }),
  structure: (orgId: number | string) => call<Structure>(`${base(orgId)}/structure`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<GroupDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  people: (orgId: number | string, q: string) => call<PersonOption[]>(`${base(orgId)}/people?${new URLSearchParams({ q, limit: "20" })}`, { cache: "no-store" }),
  create: (orgId: number | string, body: GroupBody) => call<Group>(base(orgId), jsonInit("POST", body)),
  update: (orgId: number | string, id: number, version: string, body: GroupBody) => call<Group>(`${base(orgId)}/${id}`, jsonInit("PATCH", body, { "if-match": version })),
  remove: (orgId: number | string, id: number, version: string) => call<void>(`${base(orgId)}/${id}`, jsonInit("DELETE", undefined, { "if-match": version })),
  move: (orgId: number | string, id: number, memberIds: number[]) =>
    call<MoveResult>(`${base(orgId)}/${id}/members`, jsonInit("POST", { memberIds }, { "idempotency-key": uuid() })),
  removeMember: (orgId: number | string, id: number, memberId: number) => call<void>(`${base(orgId)}/${id}/members/${memberId}`, jsonInit("DELETE")),
};

/** "1 employee" / "28 employees". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Created-on date in the viewer's locale ("Jan 10, 2024"); a bad value is shown as a dash. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
