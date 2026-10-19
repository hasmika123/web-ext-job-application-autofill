/**
 * The Marketing Follow-ups board's data (design: Follow-ups). One call to `GET /api/orgs/{orgId}/mkt/followups` (through the BFF) draws the page;
 * writes go to the sibling BFF routes. ASSIGNED scope: only the consultants the marketer is assigned to. A list the API leaves out is an honest empty
 * state, never a made-up row. E1: every action here RECORDS; "Send Reminder" stores a reminder request and never mails a client or recruiter.
 */

export type FollowupKpiKey = "dueToday" | "overdue" | "completedToday" | "waiting";
export const FOLLOWUP_KPI_KEYS: FollowupKpiKey[] = ["dueToday", "overdue", "completedToday", "waiting"];
export const FOLLOWUP_KPI_TITLES: Record<FollowupKpiKey, string> = { dueToday: "Due today", overdue: "Overdue", completedToday: "Completed today", waiting: "Waiting on response" };

export type Channel = "PHONE" | "EMAIL" | "TEAMS" | "CHAT" | "NOTE";
export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type FollowupStatus = "PENDING" | "IN_PROGRESS" | "SCHEDULED" | "NOT_STARTED" | "WAITING" | "COMPLETED";
export type InsightWindow = "THIS_WEEK" | "LAST_WEEK" | "THIS_MONTH";

export const CHANNEL_LABEL: Record<Channel, string> = { PHONE: "Phone", EMAIL: "Email", TEAMS: "Teams", CHAT: "Chat", NOTE: "Note" };
export const PRIORITY_LABEL: Record<Priority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
export const STATUS_LABEL: Record<FollowupStatus, string> = { PENDING: "Pending", IN_PROGRESS: "In progress", SCHEDULED: "Scheduled", NOT_STARTED: "Not started", WAITING: "Waiting", COMPLETED: "Completed" };
export const STATUS_ORDER: FollowupStatus[] = ["PENDING", "IN_PROGRESS", "SCHEDULED", "NOT_STARTED", "WAITING", "COMPLETED"];
export const WINDOW_LABEL: Record<InsightWindow, string> = { THIS_WEEK: "This Week", LAST_WEEK: "Last Week", THIS_MONTH: "This Month" };

export interface FollowupKpi { key: FollowupKpiKey; value: number; deltaPct: number | null; sparkline: number[] }
export interface FollowupRow {
  id: number;
  title: string;
  detail: string | null;
  consultantId: number;
  consultantName: string;
  avatarUrl: string | null;
  applicationId: number | null;
  clientAccountId: number | null;
  counterpart: string;
  channel: Channel;
  priority: Priority;
  status: FollowupStatus;
  /** Derived by the API: not completed and due before now. */
  overdue: boolean;
  dueAt: string;
  completedAt: string | null;
}
export interface FollowupList { items: FollowupRow[]; total: number }
export interface FollowupInsights { window: InsightWindow; responseRatePct: number | null; avgResponseHours: number | null; completed: number; waiting: number }
export interface FollowupsView { kpis: FollowupKpi[]; today: FollowupList; overdue: FollowupList; upcoming: FollowupList; insights: FollowupInsights }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const oneOf = <T extends string>(x: unknown, allowed: readonly T[], d: T): T => (typeof x === "string" && (allowed as readonly string[]).includes(x) ? (x as T) : d);

export function parseRow(r: Record<string, unknown>): FollowupRow {
  return {
    id: num(r.id), title: str(r.title), detail: typeof r.detail === "string" ? r.detail : null, consultantId: num(r.consultantId), consultantName: str(r.consultantName),
    avatarUrl: typeof r.avatarUrl === "string" ? r.avatarUrl : null, applicationId: numOrNull(r.applicationId), clientAccountId: numOrNull(r.clientAccountId),
    counterpart: str(r.counterpart), channel: oneOf(r.channel, ["PHONE", "EMAIL", "TEAMS", "CHAT", "NOTE"], "NOTE"), priority: oneOf(r.priority, ["HIGH", "MEDIUM", "LOW"], "MEDIUM"),
    status: oneOf(r.status, STATUS_ORDER, "PENDING"), overdue: r.overdue === true, dueAt: str(r.dueAt), completedAt: typeof r.completedAt === "string" ? r.completedAt : null,
  };
}

function parseList(x: unknown): FollowupList {
  const o = isObj(x) ? x : {};
  const items = arr(o.items).map(parseRow);
  return { items, total: Math.max(num(o.total, items.length), items.length) };
}

/** Lenient: a malformed list becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseFollowups(raw: unknown): FollowupsView | null {
  if (!isObj(raw)) return null;
  const i = isObj(raw.insights) ? raw.insights : {};
  return {
    kpis: arr(raw.kpis)
      .filter((k) => (FOLLOWUP_KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({ key: str(k.key) as FollowupKpiKey, value: num(k.value), deltaPct: numOrNull(k.deltaPct), sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [] })),
    today: parseList(raw.today),
    overdue: parseList(raw.overdue),
    upcoming: parseList(raw.upcoming),
    insights: {
      window: oneOf(i.window, ["THIS_WEEK", "LAST_WEEK", "THIS_MONTH"], "THIS_WEEK"), responseRatePct: numOrNull(i.responseRatePct), avgResponseHours: numOrNull(i.avgResponseHours),
      completed: num(i.completed), waiting: num(i.waiting),
    },
  };
}

export type FollowupsFetch = { kind: "OK"; view: FollowupsView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchFollowups(orgId: number | string, window: InsightWindow = "THIS_WEEK", signal?: AbortSignal): Promise<FollowupsFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/followups?window=${window}&size=100`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseFollowups(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

// ---- writes (record only) -----------------------------------------------------------------------------------------------

export type FollowupAction =
  | { kind: "reminder"; note?: string }
  | { kind: "call"; note: string; awaitingReply?: boolean }
  | { kind: "status"; status: FollowupStatus }
  | { kind: "complete" };

export type ActionOutcome = { ok: true } | { ok: false; denied: boolean; message: string };

/** Runs one action on one follow-up through the BFF. Only the four record-keeping routes exist; none of them can submit for a consultant or send mail. */
export async function runFollowupAction(orgId: number | string, id: number, action: FollowupAction): Promise<ActionOutcome> {
  const base = `/api/orgs/${orgId}/mkt/followups/${id}`;
  const init: RequestInit =
    action.kind === "reminder" ? { method: "POST", body: JSON.stringify({ note: action.note ?? null }) }
    : action.kind === "call" ? { method: "POST", body: JSON.stringify({ note: action.note, awaitingReply: action.awaitingReply === true }) }
    : action.kind === "status" ? { method: "PATCH", body: JSON.stringify({ status: action.status }) }
    : { method: "POST" };
  const path = action.kind === "reminder" ? "reminder" : action.kind === "call" ? "call" : action.kind === "status" ? "status" : "complete";
  try {
    const res = await fetch(`${base}/${path}`, { ...init, headers: { "content-type": "application/json", accept: "application/json" }, cache: "no-store" });
    if (res.ok) return { ok: true };
    const body: unknown = await res.json().catch(() => null);
    const message = isObj(body) && typeof body.error === "string" ? body.error : "That didn't save. Nothing has changed.";
    return { ok: false, denied: res.status === 403 || res.status === 404, message };
  } catch {
    return { ok: false, denied: false, message: "Couldn't reach the server. Nothing has changed." };
  }
}

// ---- display helpers ----------------------------------------------------------------------------------------------------

/** "9:00 AM" for the Today list, "Oct 14, 9:00 AM" for the others. */
export function dueText(iso: string, withDate: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return withDate ? `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}` : time;
}

/** The status chip's label: an overdue item reads "Overdue" whatever it was set to. */
export const statusText = (r: Pick<FollowupRow, "status" | "overdue">): string => (r.overdue ? "Overdue" : STATUS_LABEL[r.status]);

/** "1.8 days" from 43 hours, "5.0 hrs" below a day, an em dash when there is nothing to average. */
export function responseTimeText(hours: number | null): string {
  if (hours === null) return "—";
  return hours >= 24 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} hrs`;
}

// ---- board art (cropped from the approved board into public/ent/marketer/followups) --------------------------------------

export const FOLLOWUPS_ART = "/ent/marketer/followups";
const FACES = new Set([
  "alex-morgan", "priya-sharma", "michael-park", "emily-lawson", "david-kim", "sophia-martinez", "daniel-wright", "olivia-bennett", "james-carter", "ava-wilson", "ethan-brooks",
  "isabella-rossi", "liam-oconnor", "mia-thompson", "noah-patel", "charlotte-lee",
]);
const LOGOS: Record<string, string> = { techcorp: "techcorp", aws: "aws", healthplus: "healthplus", cloudscale: "cloudscale", deloitte: "deloitte", "acme internal": "acme-internal" };
const slug = (s: string) => s.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** A real `avatarUrl` from the API wins; the board's cropped photo only for the people on it; otherwise null (the page draws initials). */
export const photoFor = (name: string, url: string | null): string | null => url ?? (FACES.has(slug(name)) ? `${FOLLOWUPS_ART}/${slug(name)}.png` : null);
export const logoFor = (counterpart: string): string | null => (LOGOS[counterpart.trim().toLowerCase()] ? `${FOLLOWUPS_ART}/logo-${LOGOS[counterpart.trim().toLowerCase()]}.png` : null);
