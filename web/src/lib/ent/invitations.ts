/**
 * The Invitations page's data layer (X4.12 part; design/enterprise-admin/invitations.png): the types of the API's
 * `/api/orgs/{orgId}/invitations/**` (X1.8, X1.15), a client for the web BFF in front of it, and the pure helpers the page uses
 * (relative time, status words, pasted-list parsing, human reasons). Nothing here is a gate: the API decides who may do what.
 */
import { hasStateMap, registerStateMap } from "@kiwiply/ui";

export type InviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
export const STATUSES: InviteStatus[] = ["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"];

export const STATUS_LABEL: Record<InviteStatus, string> = { PENDING: "Pending", ACCEPTED: "Accepted", EXPIRED: "Expired", REVOKED: "Revoked" };

/** One StatePill domain for the page: pending amber, accepted green, expired red, revoked grey. */
export const INVITATION_DOMAIN = "invitation";
if (!hasStateMap(INVITATION_DOMAIN)) registerStateMap(INVITATION_DOMAIN, { PENDING: "amber", ACCEPTED: "green", EXPIRED: "red", REVOKED: "grey" });

export interface RoleRef { id: number; key: string; name: string; primary: boolean }
export interface GroupRef { id: number; name: string }
export interface PersonRef { memberId: number | null; name: string | null }

export interface Invitation {
  id: number;
  email: string;
  name: string | null;
  status: InviteStatus;
  roles: RoleRef[];
  department: GroupRef | null;
  team: GroupRef | null;
  manager: PersonRef | null;
  invitedBy: PersonRef | null;
  invitedAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  endedAt: string | null;
  resendCount: number;
  message: string | null;
}

export interface InvitationPage { items: Invitation[]; page: number; size: number; total: number }
export interface StatusCount { status: InviteStatus; count: number; deltaLastMonth: number }
export interface InvitationCounts { counts: StatusCount[]; total: number }
export type ActivityKind = "INVITED" | "ACCEPTED" | "REVOKED" | "EXPIRED";
export interface Activity { kind: ActivityKind; at: string; invitationId: number | null; email: string; name: string | null; actor: PersonRef | null }

export interface RoleOption { id: number; key: string; name: string; description: string | null }
export interface GroupOption { id: number; name: string }
/** What the invite form offers (the BFF's `form-options`): roles from GET roles, departments from GET groups. */
export interface FormOptions { roles: RoleOption[]; departments: GroupOption[]; rolesAvailable: boolean; departmentsAvailable: boolean }

export type RowStatus = "INVITED" | "INVALID" | "DUPLICATE" | "ALREADY_MEMBER";
export interface InviteRow { entry: string; email: string | null; status: RowStatus; reason: string | null; memberId: number | null }
export interface InviteResult { batchId: number | null; invited: { memberId: number; email: string; name: string | null }[]; rows: InviteRow[] }
export interface BulkItem { id: number; status: "OK" | "FAILED"; code: string | null }

export interface InviteBody { emails: string[]; fullName?: string; roleIds: number[]; departmentGroupId?: number; message?: string }

export interface ListQuery {
  status: InviteStatus | "";
  roleId: string;
  departmentGroupId: string;
  range: RangeKey;
  q: string;
  page: number;
  size: number;
}

/** The date-range filter: how far back the "invited on" window reaches. `all` sends no bound. */
export type RangeKey = "all" | "7" | "30" | "90";
export const RANGES: { value: RangeKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
export const PAGE_SIZE = 10;
const DAY_MS = 86_400_000;

export const DEFAULT_QUERY: ListQuery = { status: "", roleId: "", departmentGroupId: "", range: "all", q: "", page: 1, size: PAGE_SIZE };

export function listParams(q: ListQuery, now: number = Date.now()): URLSearchParams {
  const p = new URLSearchParams();
  if (q.status) p.set("status", q.status);
  if (q.roleId) p.set("roleId", q.roleId);
  if (q.departmentGroupId) p.set("departmentGroupId", q.departmentGroupId);
  if (q.range !== "all") p.set("from", new Date(now - Number(q.range) * DAY_MS).toISOString());
  if (q.q.trim()) p.set("q", q.q.trim());
  p.set("page", String(Math.max(0, q.page - 1)));
  p.set("size", String(q.size));
  return p;
}

export const hasFilter = (q: ListQuery): boolean => !!(q.status || q.roleId || q.departmentGroupId || q.range !== "all" || q.q.trim());

/* ── API client (through the web BFF) ───────────────────────────────────────────── */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code?: string; message: string };

const base = (orgId: number | string) => `/api/orgs/${orgId}/invitations`;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection." };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: (res.status === 204 ? {} : body) as T };
  const message = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "Something went wrong.";
  return { ok: false, status: res.status, code: typeof body.code === "string" ? body.code : undefined, message };
}

const post = (body?: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export const invitationsApi = {
  list: (orgId: number | string, q: ListQuery) => call<InvitationPage>(`${base(orgId)}?${listParams(q)}`),
  counts: (orgId: number | string) => call<InvitationCounts>(`${base(orgId)}/counts`),
  activity: (orgId: number | string, limit = 10) => call<Activity[]>(`${base(orgId)}/activity?limit=${limit}`),
  options: (orgId: number | string) => call<FormOptions>(`${base(orgId)}/form-options`),
  invite: (orgId: number | string, body: InviteBody) => call<InviteResult>(base(orgId), post(body)),
  resend: (orgId: number | string, id: number) => call<Record<string, unknown>>(`${base(orgId)}/${id}/resend`, post()),
  revoke: (orgId: number | string, id: number) => call<Record<string, never>>(`${base(orgId)}/${id}/revoke`, post()),
  bulkResend: (orgId: number | string, ids: number[]) => call<{ results: BulkItem[] }>(`${base(orgId)}/bulk/resend`, post({ ids })),
  bulkRevoke: (orgId: number | string, ids: number[]) => call<{ results: BulkItem[] }>(`${base(orgId)}/bulk/revoke`, post({ ids })),
};

/* ── pure helpers ───────────────────────────────────────────────────────────────── */

const EMAIL = /^[^\s@<>"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
export const isEmail = (s: string): boolean => EMAIL.test(s.trim());

/** "2 hours ago", "3 days ago", "just now"; a date beyond a month ("Jun 10, 2024"). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
  if (s < 3600) return unit(Math.max(1, Math.round(s / 60)), "minute");
  if (s < 86_400) return unit(Math.round(s / 3600), "hour");
  if (s < 30 * 86_400) return unit(Math.round(s / 86_400), "day");
  return shortDate(iso);
}

export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The name to show for an invitation: the given name, else the address before the @. */
export const displayName = (i: { name: string | null; email: string }): string => (i.name && i.name.trim() ? i.name.trim() : i.email.split("@")[0]);

/** Splits a pasted list (lines, commas or semicolons; `Name <a@b.co>` allowed) into the entries the API takes, without duplicates. */
export function parseEntries(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n\r;]+|,(?![^<]*>)/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** The API's refusal reason for an entry, in words a person can act on. */
export function rowProblem(row: Pick<InviteRow, "status" | "reason" | "email" | "entry">): string | null {
  switch (row.status) {
    case "INVITED":
      return null;
    case "ALREADY_MEMBER":
      return "Already a member of this organization.";
    case "DUPLICATE":
      return row.reason === "duplicate" || !row.reason ? "Listed more than once or already invited." : row.reason;
    default:
      switch (row.reason) {
        case "malformed":
          return "That doesn't look like an email address.";
        case "too_long":
          return "That entry is too long.";
        case "duplicate":
          return "Listed more than once.";
        case "sensitive_name":
          return "The name looks like it holds private numbers. Remove them.";
        default:
          return row.reason || "Couldn't be invited.";
      }
  }
}

export const ROW_LABEL: Record<RowStatus, string> = { INVITED: "Invited", INVALID: "Not valid", DUPLICATE: "Duplicate", ALREADY_MEMBER: "Already a member" };

/** A friendly line for a refused action; the server's own sentence wins when it sent one. */
export function problemText(r: { status: number; code?: string; message: string }): string {
  if (r.code === "ROLE_CEILING") return "One of those roles gives more access than you hold. Pick a lower role.";
  if (r.status === 404) return "That invitation isn't available any more.";
  if (r.status === 429) return r.message.length > 12 ? r.message : "That was sent too often. Try again later.";
  return r.message;
}

/** What a bulk action did, in one sentence: "Resent 3. 1 couldn't be resent." */
export function bulkSummary(results: BulkItem[], verb: "resent" | "revoked"): string {
  const ok = results.filter((r) => r.status === "OK").length;
  const failed = results.length - ok;
  const head = `${ok === 1 ? "1 invitation" : `${ok} invitations`} ${verb}`;
  return failed === 0 ? `${head}.` : `${head}. ${failed} couldn't be ${verb}.`;
}

/* ── direct account creation (employee onboarding with a temporary password) ───────────────────────── */

export interface AccountBody {
  email: string;
  fullName?: string;
  /** The password the form showed (server-generated, possibly overwritten). Omit to let the server generate one and return it once. */
  password?: string;
  roleIds: number[];
  departmentGroupId?: number;
}
/** `ACCOUNT_CREATED`: active at once, must change the temporary password. `INVITED`: the address already had an account, so a normal invitation was sent instead. */
export interface AccountResult { memberId: number | null; email: string; mode: "ACCOUNT_CREATED" | "INVITED"; tempPassword: string | null; tempPasswordExpiresAt: string | null; roleIds: number[] }
export interface PasswordResetResult { memberId: number; email: string; tempPassword: string; tempPasswordExpiresAt: string }

const membersBase = (orgId: number | string) => `/api/orgs/${orgId}/members`;

/** The calls behind "Create account now" and "Reset password". The answers carry a one-time password: callers keep it in memory only while their dialog is open. */
export const accountsApi = {
  suggest: (orgId: number | string) => call<{ password: string }>(`${membersBase(orgId)}/temp-password`),
  create: (orgId: number | string, body: AccountBody) => call<AccountResult>(`${membersBase(orgId)}/account`, post(body)),
  reset: (orgId: number | string, memberId: number, reason: string) => call<PasswordResetResult>(`${membersBase(orgId)}/${memberId}/reset-password`, post({ reason })),
};

/** The platform password rule (4 to 100 characters), mirrored so the button is not lit for a password the API will refuse. */
export function passwordIssue(p: string): string | null {
  if (p.length < 4) return "At least 4 characters.";
  if (p.length > 100) return "At most 100 characters.";
  return null;
}
