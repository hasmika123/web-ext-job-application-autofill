/**
 * The Consultant workspace Interviews page's client logic (design/enterprise-consultant/interviews.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/interviews` (+ `/{interviewId}` detail and the write calls), tolerant parsers and the pure helpers
 * the page uses (sort, calendar grid, date text, form checks). Nothing here touches React and there is no fallback number: every figure is
 * the API's answer. Dates are shown in the viewer's own time zone.
 */
import { initialsOf, type Tone } from "./home";

export interface InterviewTile {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
  vs: string;
}

export type InterviewStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type Chip = "UPCOMING" | "SCHEDULED";
export type Mode = "VIDEO" | "ONSITE" | "PHONE";
export type Outcome = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
export type CalendarState = "UPCOMING" | "SCHEDULED" | "COMPLETED" | "PAST";

export interface InterviewRow {
  id: number;
  title: string;
  company: string | null;
  location: string | null;
  workMode: string | null;
  round: string | null;
  interviewerName: string | null;
  /** Only what the consultant stored; never invented. */
  interviewerTitle: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: InterviewStatus;
  chip: Chip | null;
  mode: Mode | null;
  meetingUrl: string | null;
  prepNote: string | null;
  hasFeedback: boolean;
}

export interface CalendarEntry {
  id: number;
  scheduledAt: string;
  state: CalendarState;
  title: string;
  company: string | null;
}

export interface FeedbackRow {
  interviewId: number;
  title: string;
  company: string | null;
  interviewedAt: string;
  outcome: Outcome;
  summary: string;
  updatedAt: string;
}

export interface PendingFeedback {
  interviewId: number;
  title: string;
  company: string | null;
  interviewedAt: string;
}

export interface InterviewsView {
  orgId: number;
  generatedAt: string;
  name: string;
  tiles: { upcoming: InterviewTile; thisWeek: InterviewTile; completed: InterviewTile; feedbackPending: InterviewTile };
  upcoming: InterviewRow[];
  calendar: CalendarEntry[];
  feedback: FeedbackRow[];
  pendingFeedback: PendingFeedback[];
}

export interface InterviewDetail {
  interview: InterviewRow;
  applicationCode: string | null;
  feedback: FeedbackRow | null;
  canEditDetails: boolean;
  canRecordFeedback: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rows = <T,>(v: unknown, f: (o: unknown) => T | null): T[] => arr(v).map(f).filter((x): x is T => x !== null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null);

const STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;
const CHIPS = ["UPCOMING", "SCHEDULED"] as const;
const MODES = ["VIDEO", "ONSITE", "PHONE"] as const;
const OUTCOMES = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;
const STATES = ["UPCOMING", "SCHEDULED", "COMPLETED", "PAST"] as const;

function tileOf(v: unknown): InterviewTile {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: numOrNull(d.previous),
    deltaPct: numOrNull(d.deltaPct),
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
    vs: typeof d.vs === "string" && d.vs ? d.vs : "last week",
  };
}

export function parseInterviewRow(o: unknown): InterviewRow | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.scheduledAt !== "string" || typeof o.title !== "string") return null;
  const status = oneOf(o.status, STATUSES);
  if (!status) return null;
  return {
    id: o.id,
    title: o.title,
    company: strOrNull(o.company),
    location: strOrNull(o.location),
    workMode: strOrNull(o.workMode),
    round: strOrNull(o.round),
    interviewerName: strOrNull(o.interviewerName),
    interviewerTitle: strOrNull(o.interviewerTitle),
    scheduledAt: o.scheduledAt,
    durationMinutes: Math.max(0, num(o.durationMinutes, 45)),
    status,
    chip: oneOf(o.chip, CHIPS),
    mode: oneOf(o.mode, MODES),
    meetingUrl: strOrNull(o.meetingUrl),
    prepNote: strOrNull(o.prepNote),
    hasFeedback: o.hasFeedback === true,
  };
}

function parseFeedback(o: unknown): FeedbackRow | null {
  if (!isObj(o) || typeof o.interviewId !== "number" || typeof o.title !== "string" || typeof o.interviewedAt !== "string") return null;
  const outcome = oneOf(o.outcome, OUTCOMES);
  if (!outcome) return null;
  return { interviewId: o.interviewId, title: o.title, company: strOrNull(o.company), interviewedAt: o.interviewedAt, outcome, summary: typeof o.summary === "string" ? o.summary : "", updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "" };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseInterviews(body: unknown): InterviewsView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles)) return null;
  const t = body.tiles;
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    name: typeof body.name === "string" ? body.name : "",
    tiles: { upcoming: tileOf(t.upcoming), thisWeek: tileOf(t.thisWeek), completed: tileOf(t.completed), feedbackPending: tileOf(t.feedbackPending) },
    upcoming: rows(body.upcoming, parseInterviewRow),
    calendar: rows(body.calendar, (o) => {
      if (!isObj(o) || typeof o.id !== "number" || typeof o.scheduledAt !== "string") return null;
      const state = oneOf(o.state, STATES);
      return state ? { id: o.id, scheduledAt: o.scheduledAt, state, title: typeof o.title === "string" ? o.title : "Interview", company: strOrNull(o.company) } : null;
    }),
    feedback: rows(body.feedback, parseFeedback),
    pendingFeedback: rows(body.pendingFeedback, (o) =>
      isObj(o) && typeof o.interviewId === "number" && typeof o.title === "string" && typeof o.interviewedAt === "string"
        ? { interviewId: o.interviewId, title: o.title, company: strOrNull(o.company), interviewedAt: o.interviewedAt }
        : null,
    ),
  };
}

export function parseInterviewDetail(body: unknown): InterviewDetail | null {
  if (!isObj(body)) return null;
  const interview = parseInterviewRow(body.interview);
  if (!interview) return null;
  return {
    interview,
    applicationCode: strOrNull(body.applicationCode),
    feedback: parseFeedback(body.feedback),
    canEditDetails: body.canEditDetails === true,
    canRecordFeedback: body.canRecordFeedback === true,
  };
}

/* ── sort and labels ──────────────────────────────────────────────────────────────────── */

export type SortKey = "soonest" | "latest";
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "soonest", label: "Date (Soonest First)" },
  { key: "latest", label: "Date (Latest First)" },
];

const time = (iso: string | null): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** A new array; ties break on id so the order never jumps. */
export function sortInterviews(list: InterviewRow[], key: SortKey): InterviewRow[] {
  const dir = key === "latest" ? -1 : 1;
  return [...list].sort((a, b) => dir * (time(a.scheduledAt) - time(b.scheduledAt)) || a.id - b.id);
}

export const CHIP_LABELS: Record<Chip, { label: string; tone: Tone }> = {
  UPCOMING: { label: "Upcoming", tone: "blue" },
  SCHEDULED: { label: "Scheduled", tone: "green" },
};

export const OUTCOME_LABELS: Record<Outcome, { label: string; tone: Tone }> = {
  POSITIVE: { label: "Positive", tone: "green" },
  NEUTRAL: { label: "Neutral", tone: "amber" },
  NEGATIVE: { label: "Negative", tone: "red" },
};

export const MODE_LABELS: Record<Mode, string> = { VIDEO: "Video", ONSITE: "Onsite", PHONE: "Phone" };

/** https links only, checked again before a link is ever rendered. */
export function safeMeetingUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.includes(".") && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Join works when the consultant has stored a safe link and the interview is still scheduled. */
export const joinUrl = (r: Pick<InterviewRow, "meetingUrl" | "status">): string | null => (r.status === "SCHEDULED" ? safeMeetingUrl(r.meetingUrl) : null);

/** The honest reason Join is off, for its tooltip. */
export const joinOffReason = (r: Pick<InterviewRow, "meetingUrl" | "status">): string =>
  r.status !== "SCHEDULED" ? "This interview is not scheduled any more." : r.meetingUrl ? "The saved meeting link is not a valid https link." : "No meeting link saved yet. Open View to add one.";

/** The next interview you can still join (the Quick Action "Join Meeting"): earliest row with a usable link. */
export function nextJoinable(list: InterviewRow[]): InterviewRow | null {
  return sortInterviews(list, "soonest").find((r) => joinUrl(r) !== null) ?? null;
}

/** The first line under the role: "Austin, TX" or "Hybrid"; "" when the job says nothing. */
export function roleSubtitle(r: Pick<InterviewRow, "location" | "workMode">): string {
  if (r.workMode === "REMOTE") return "Remote";
  if (r.location) return r.location;
  return r.workMode ? r.workMode.charAt(0) + r.workMode.slice(1).toLowerCase() : "";
}

/** "Oct 15, 2024" and "10:00 AM - 11:00 AM" in the viewer's zone. */
export function whenText(iso: string, minutes: number): { date: string; time: string } {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return { date: "", time: "" };
  const end = new Date(start.getTime() + minutes * 60_000);
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { date: start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), time: `${t(start)} - ${t(end)}` };
}

/** "Oct 10, 2024" in the viewer's zone. */
export function dayText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export { initialsOf };

/* ── the calendar ─────────────────────────────────────────────────────────────────────── */

export interface DayCell {
  key: string; // YYYY-MM-DD in the viewer's zone
  day: number;
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKeyOfDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The viewer-zone day of a timestamp, or "" for one that does not parse. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dayKeyOfDate(d);
}

/** Sunday-first weeks covering the month (five or six rows). `month` is 0-11. */
export function monthGrid(year: number, month: number): DayCell[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      week.push({ key: dayKeyOfDate(date), day: date.getDate(), inMonth: date.getMonth() === month });
    }
    if (w >= 5 && !week.some((c) => c.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}

export const shiftMonth = (year: number, month: number, by: number): { year: number; month: number } => {
  const d = new Date(year, month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

export const monthLabel = (year: number, month: number): string => new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

export function entriesByDay(list: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const out = new Map<string, CalendarEntry[]>();
  for (const e of list) {
    const k = dayKey(e.scheduledAt);
    if (!k) continue;
    out.set(k, [...(out.get(k) ?? []), e]);
  }
  return out;
}

/** The dot colour for a day: the most pressing state present (upcoming, then scheduled, then completed, then past). */
export function dayState(entries: CalendarEntry[]): CalendarState | null {
  for (const s of ["UPCOMING", "SCHEDULED", "COMPLETED", "PAST"] as const) if (entries.some((e) => e.state === s)) return s;
  return null;
}

/* ── form checks (the same limits the API enforces; the API stays the judge) ─────────── */

export const LIMITS = { url: 500, title: 120, note: 2000, summary: 1000 } as const;

export interface DetailForm {
  mode: Mode | "";
  meetingUrl: string;
  interviewerTitle: string;
  prepNote: string;
}

/** The first problem with the form as plain words, or null when it can be sent. */
export function checkDetailForm(f: DetailForm): string | null {
  const url = f.meetingUrl.trim();
  if (url) {
    if (url.length > LIMITS.url) return `The meeting link is longer than ${LIMITS.url} characters.`;
    if (/\s/.test(url)) return "The meeting link must be a single link without spaces.";
    if (!url.toLowerCase().startsWith("https://") || safeMeetingUrl(url) === null) return "The meeting link must be a valid link that starts with https://";
  }
  if (f.interviewerTitle.trim().length > LIMITS.title) return `The interviewer's title is longer than ${LIMITS.title} characters.`;
  if (f.prepNote.trim().length > LIMITS.note) return `The note is longer than ${LIMITS.note} characters.`;
  return null;
}

export const detailFormOf = (r: InterviewRow): DetailForm => ({ mode: r.mode ?? "", meetingUrl: r.meetingUrl ?? "", interviewerTitle: r.interviewerTitle ?? "", prepNote: r.prepNote ?? "" });

export function checkFeedbackForm(outcome: Outcome | "", summary: string): string | null {
  if (!outcome) return "Choose how it went.";
  const s = summary.trim();
  if (!s) return "Write a short summary of what you heard.";
  if (s.length > LIMITS.summary) return `The summary is longer than ${LIMITS.summary} characters.`;
  return null;
}

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/interviews`;

async function read<T>(url: string, parse: (b: unknown) => T | null, signal?: AbortSignal): Promise<Fetched<T>> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parse(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export const fetchInterviews = (orgId: number | string, signal?: AbortSignal) => read(base(orgId), parseInterviews, signal);
export const fetchInterview = (orgId: number | string, id: number, signal?: AbortSignal) => read(`${base(orgId)}/${id}`, parseInterviewDetail, signal);

export interface WriteResult {
  ok: boolean;
  /** The API's own message for a refusal (for example the sensitive-data one), when it sent one. */
  message?: string;
  detail?: InterviewDetail;
}

async function write(url: string, method: "POST" | "PUT", body: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(url, { method, headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    if (res.ok) {
      const detail = parseInterviewDetail(await res.json().catch(() => null)) ?? undefined;
      return { ok: true, detail };
    }
    const j = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown; message?: unknown } | null;
    const m = j && typeof j.message === "string" ? j.message : j && typeof j.error === "string" ? j.error : j && typeof j.detail === "string" ? j.detail : undefined;
    return { ok: false, message: m };
  } catch {
    return { ok: false };
  }
}

export const saveDetail = (orgId: number, id: number, f: DetailForm) =>
  write(`${base(orgId)}/${id}/detail`, "PUT", { mode: f.mode || null, meetingUrl: f.meetingUrl.trim() || null, interviewerTitle: f.interviewerTitle.trim() || null, prepNote: f.prepNote.trim() || null });

export const recordFeedback = (orgId: number, id: number, outcome: Outcome, summary: string, existing: boolean) =>
  write(`${base(orgId)}/${id}/feedback`, existing ? "PUT" : "POST", { outcome, summary: summary.trim() });
