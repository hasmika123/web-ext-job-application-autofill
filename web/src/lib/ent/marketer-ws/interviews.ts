/**
 * The Marketing Interviews board's data (design: Interviews). One call to `GET /api/orgs/{orgId}/mkt/interviews` (through the BFF) draws
 * the whole page; filters (date range, status, client, sort) are query parameters of that same call. The API owns scope (ASSIGNED),
 * permission and the tenant wall. E1: every write here RECORDS or PROPOSES (a reschedule is a proposal the consultant confirms, a reminder
 * is a request); nothing submits anything for a consultant. A section the API leaves out is an honest empty state, never a made-up row.
 */

export type InterviewType = "VIDEO" | "ONSITE" | "TECHNICAL" | "PANEL" | "CLIENT";
export type InterviewStatus = "CONFIRMED" | "SCHEDULED" | "PENDING_FEEDBACK" | "RESCHEDULED" | "AWAITING_CONFIRMATION" | "COMPLETED";
export type KpiKey = "interviewsThisWeek" | "confirmedInterviews" | "pendingFeedback" | "reschedules";

export const KPI_KEYS: KpiKey[] = ["interviewsThisWeek", "confirmedInterviews", "pendingFeedback", "reschedules"];
export const KPI_TITLES: Record<KpiKey, string> = {
  interviewsThisWeek: "Interviews this week",
  confirmedInterviews: "Confirmed interviews",
  pendingFeedback: "Pending feedback",
  reschedules: "Reschedules",
};
export const TYPE_LABEL: Record<InterviewType, string> = { VIDEO: "Video", ONSITE: "Onsite", TECHNICAL: "Technical", PANEL: "Panel", CLIENT: "Client" };
export const STATUS_LABEL: Record<InterviewStatus, string> = {
  CONFIRMED: "Confirmed",
  SCHEDULED: "Scheduled",
  PENDING_FEEDBACK: "Pending feedback",
  RESCHEDULED: "Rescheduled",
  AWAITING_CONFIRMATION: "Awaiting confirmation",
  COMPLETED: "Completed",
};
/** The "All statuses" dropdown, in the board's order. */
export const STATUS_OPTIONS: InterviewStatus[] = ["CONFIRMED", "SCHEDULED", "PENDING_FEEDBACK", "RESCHEDULED", "AWAITING_CONFIRMATION", "COMPLETED"];
export const OUTCOMES = [
  { value: "PASSED", label: "Passed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "NO_SHOW", label: "No show" },
  { value: "PENDING", label: "Pending decision" },
] as const;

export interface Kpi {
  key: KpiKey;
  value: number;
  /** Percent change against last week; null = nothing to compare (no chip). */
  deltaPct: number | null;
  sparkline: number[];
}
export interface InterviewRow {
  id: number;
  consultantId: number;
  consultant: string;
  avatarUrl: string | null;
  role: string;
  clientId: number;
  client: string;
  type: InterviewType;
  startsAt: string;
  durationMinutes: number;
  round: string;
  recruiter: string;
  status: InterviewStatus;
  /** A reschedule proposal the consultant has not confirmed yet. */
  proposedFor: string | null;
  rescheduleCount: number;
}
export interface Schedule {
  items: InterviewRow[];
  total: number;
  page: number;
  size: number;
  from: string;
  to: string;
}
export interface FeedbackRow { id: number; interviewAt: string; consultant: string; avatarUrl: string | null; client: string; round: string; daysOverdue: number }
export interface PrepItem { id: number; label: string; done: boolean }
export interface Checklist { interviewId: number; consultant: string; client: string; items: PrepItem[] }
export interface Reminder { id: number; startsAt: string; consultant: string; client: string; type: InterviewType }
export interface ClientOption { id: number; name: string }

export interface InterviewsView {
  kpis: Kpi[];
  schedule: Schedule;
  upcoming: InterviewRow[];
  pendingFeedback: FeedbackRow[];
  checklist: Checklist | null;
  reminders: Reminder[];
  clients: ClientOption[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const url = (x: unknown): string | null => (typeof x === "string" && x ? x : null);
const oneOf = <T extends string>(x: unknown, all: readonly T[], d: T): T => (typeof x === "string" && (all as readonly string[]).includes(x) ? (x as T) : d);
const TYPES = Object.keys(TYPE_LABEL) as InterviewType[];

export function parseRow(r: Record<string, unknown>): InterviewRow {
  return {
    id: num(r.id), consultantId: num(r.consultantId), consultant: str(r.consultant), avatarUrl: url(r.avatarUrl), role: str(r.role), clientId: num(r.clientId), client: str(r.client),
    type: oneOf(r.type, TYPES, "VIDEO"), startsAt: str(r.startsAt), durationMinutes: num(r.durationMinutes, 45), round: str(r.round), recruiter: str(r.recruiter),
    status: oneOf(r.status, STATUS_OPTIONS, "SCHEDULED"), proposedFor: url(r.proposedFor), rescheduleCount: num(r.rescheduleCount),
  };
}

export function parseChecklist(raw: unknown): Checklist | null {
  if (!isObj(raw)) return null;
  return { interviewId: num(raw.interviewId), consultant: str(raw.consultant), client: str(raw.client), items: arr(raw.items).map((i) => ({ id: num(i.id), label: str(i.label), done: i.done === true })) };
}

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseInterviews(raw: unknown): InterviewsView | null {
  if (!isObj(raw)) return null;
  const s = isObj(raw.schedule) ? raw.schedule : {};
  return {
    kpis: arr(raw.kpis)
      .filter((k) => (KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({
        key: str(k.key) as KpiKey, value: num(k.value), deltaPct: typeof k.deltaPct === "number" && Number.isFinite(k.deltaPct) ? k.deltaPct : null,
        sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [],
      })),
    schedule: { items: arr(s.items).map(parseRow), total: num(s.total), page: num(s.page), size: num(s.size, 25), from: str(s.from), to: str(s.to) },
    upcoming: arr(raw.upcoming).map(parseRow),
    pendingFeedback: arr(raw.pendingFeedback).map((f) => ({ id: num(f.id), interviewAt: str(f.interviewAt), consultant: str(f.consultant), avatarUrl: url(f.avatarUrl), client: str(f.client), round: str(f.round), daysOverdue: num(f.daysOverdue) })),
    checklist: parseChecklist(raw.checklist),
    reminders: arr(raw.reminders).map((r) => ({ id: num(r.id), startsAt: str(r.startsAt), consultant: str(r.consultant), client: str(r.client), type: oneOf(r.type, TYPES, "VIDEO") })),
    clients: arr(raw.clients).map((c) => ({ id: num(c.id), name: str(c.name) })),
  };
}

// ---------------------------------------------------------------------------------------------------------- reads and writes (BFF)

export interface InterviewsQuery { from?: string; to?: string; status?: string; clientId?: number | null; sort?: string; dir?: "asc" | "desc"; page?: number; size?: number }
export type InterviewsFetch = { kind: "OK"; view: InterviewsView } | { kind: "DENIED" } | { kind: "FAILED" };

const base = (orgId: number | string) => `/api/orgs/${orgId}/mkt/interviews`;

export async function fetchInterviews(orgId: number | string, q: InterviewsQuery = {}, signal?: AbortSignal): Promise<InterviewsFetch> {
  const p = new URLSearchParams();
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.status) p.set("status", q.status);
  if (q.clientId) p.set("clientId", String(q.clientId));
  if (q.sort) p.set("sort", q.sort);
  if (q.dir) p.set("dir", q.dir);
  if (q.page) p.set("page", String(q.page));
  if (q.size) p.set("size", String(q.size));
  p.set("tzOffsetMinutes", String(-new Date().getTimezoneOffset()));
  try {
    const res = await fetch(`${base(orgId)}?${p.toString()}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseInterviews(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type WriteResult<T> = { kind: "OK"; value: T } | { kind: "DENIED" } | { kind: "REFUSED"; message: string } | { kind: "FAILED" };

async function send<T>(path: string, method: "POST" | "PATCH", body: unknown, read: (raw: unknown) => T | null): Promise<WriteResult<T>> {
  try {
    const res = await fetch(path, { method, headers: { accept: "application/json", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    const raw: unknown = await res.json().catch(() => null);
    if (res.status === 409 || res.status === 422 || res.status === 400) return { kind: "REFUSED", message: isObj(raw) ? str(raw.message, str(raw.error, "That change was refused.")) : "That change was refused." };
    if (!res.ok) return { kind: "FAILED" };
    const value = read(raw);
    return value === null ? { kind: "FAILED" } : { kind: "OK", value };
  } catch {
    return { kind: "FAILED" };
  }
}

const rowOf = (raw: unknown): InterviewRow | null => (isObj(raw) ? parseRow(raw) : null);

/** Propose a new time (a proposal: the consultant confirms; the slot keeps its time until a confirmed slot is recorded). */
export const proposeReschedule = (orgId: number | string, id: number, body: { proposedAt: string; note?: string }) => send(`${base(orgId)}/${id}/reschedule`, "POST", body, rowOf);
/** Record that the slot was confirmed. */
export const confirmSlot = (orgId: number | string, id: number) => send(`${base(orgId)}/${id}/confirm`, "POST", {}, rowOf);
export const recordFeedback = (orgId: number | string, id: number, body: { outcome: string; note?: string }) => send(`${base(orgId)}/${id}/feedback`, "POST", body, rowOf);
/** Ask for a reminder for the consultant (a record; nothing is sent from here). */
export const requestReminder = (orgId: number | string, id: number) => send(`${base(orgId)}/${id}/remind`, "POST", {}, rowOf);
export const tickPrepItem = (orgId: number | string, interviewId: number, itemId: number, done: boolean) => send(`${base(orgId)}/${interviewId}/prep/${itemId}`, "PATCH", { done }, parseChecklist);

// ---------------------------------------------------------------------------------------------------------- formatting + dates (viewer's local time)

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A `yyyy-MM-dd` string as a LOCAL date at midnight (never the UTC parse of `new Date("2026-10-11")`). */
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Sunday to Saturday around `now`, the board's "Apr 21 - Apr 27" week. */
export function weekRange(now: Date = new Date()): { from: string; to: string } {
  const start = addDays(now, -now.getDay());
  return { from: ymd(start), to: ymd(addDays(start, 6)) };
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Apr 21 – Apr 27, 2024" (the year of the end date; both years when they differ). */
export function rangeLabel(from: string, to: string): string {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return "Select dates";
  const part = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return a.getFullYear() === b.getFullYear() ? `${part(a)} – ${part(b)}, ${b.getFullYear()}` : `${part(a)}, ${a.getFullYear()} – ${part(b)}, ${b.getFullYear()}`;
}
const dateOf = (iso: string): Date | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
export function timeText(iso: string): string {
  const d = dateOf(iso);
  return d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
}
/** "Apr 22, 2024" */
export function dayText(iso: string): string {
  const d = dateOf(iso);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : "";
}
/** "Apr 22, 10:00 AM" (Upcoming Interviews card). */
export function shortDateTime(iso: string): string {
  const d = dateOf(iso);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${timeText(iso)}` : "";
}
/** Date tile of the Interview Reminders card. */
export function tileOf(iso: string): { month: string; day: string } {
  const d = dateOf(iso);
  return d ? { month: MONTHS[d.getMonth()].toUpperCase(), day: String(d.getDate()) } : { month: "", day: "" };
}
/** "datetime-local" value (local) of an ISO instant, and back. */
export function toLocalInput(iso: string): string {
  const d = dateOf(iso);
  return d ? `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
}
export function fromLocalInput(v: string): string | null {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type DaysTone = "red" | "amber" | "green";
/** The Pending Feedback chips: 2+ days red, 1 day amber, under a day green. */
export function daysChip(days: number): { label: string; tone: DaysTone } {
  if (days >= 2) return { label: `${days} days`, tone: "red" };
  if (days === 1) return { label: "1 day", tone: "amber" };
  return { label: "< 1 day", tone: "green" };
}

/**
 * Board art lives in `public/ent/marketer/interviews` (cropped from the approved board) and is reached only through an `avatarUrl` the
 * API (or the dev mock) returns; the real API returns null unless the org has a photo, and the avatar falls back to initials.
 */
export const INTERVIEWS_ART_BASE = "/ent/marketer/interviews";
