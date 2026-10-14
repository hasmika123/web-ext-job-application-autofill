import { shortDate, type Tone } from "./home";

/**
 * "Activity Timeline" client logic (design/enterprise-consultant/activity-timeline.webp): the wire types of
 * `GET /api/orgs/{orgId}/me-workspace/activity-timeline`, a tolerant parser and the small pure helpers the page uses. Nothing here touches React.
 *
 * Rules the page keeps:
 *   - the feed is derived and read-only: every row and figure comes from the API's answer, there is no fallback number in this file;
 *   - a tile with no earlier count has no delta (deltaPct null): the page draws the window instead of a made-up percentage;
 *   - "Export Timeline" builds a CSV from the rows already loaded in the browser (no server file), and neutralizes spreadsheet formulas.
 */

export type TileKey = "total" | "thisWeek" | "applications" | "interviews" | "profile";

export interface TimelineTile {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
  vs: "month" | "week";
}

export type ChipKind = "FILE" | "JOB" | "DATES" | "AVAILABILITY" | "TEXT";

export interface TimelineChip {
  kind: ChipKind;
  primary: string | null;
  secondary: string | null;
  company: string | null;
  from: string | null;
  to: string | null;
}

export interface TimelineEvent {
  key: string;
  type: string;
  group: string;
  category: string | null;
  at: string;
  title: string;
  description: string;
  chip: TimelineChip | null;
  actionLabel: string;
  /** The workspace page that owns the event (a path segment under /w/consultant). */
  target: string;
  sample: boolean;
}

export interface Milestone {
  key: string;
  label: string;
  reached: boolean;
  on: string | null;
}

export interface TimelineView {
  orgId: number;
  generatedAt: string;
  consultantName: string;
  tiles: Record<TileKey, TimelineTile>;
  type: string;
  days: number;
  total: number;
  events: TimelineEvent[];
  nextCursor: string | null;
  milestones: Milestone[];
}

export interface TimelineQuery {
  type: string;
  days: number;
}

export const EMPTY_QUERY: TimelineQuery = { type: "ALL", days: 30 };
export const PERIODS: { value: number; label: string }[] = [
  { value: 7, label: "Last 7 Days" },
  { value: 30, label: "Last 30 Days" },
  { value: 90, label: "Last 90 Days" },
];
export const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "All Activity Types" },
  { value: "RESUME", label: "Resume" },
  { value: "JOB", label: "Jobs" },
  { value: "APPLICATION", label: "Applications" },
  { value: "SUBMISSION", label: "Submissions" },
  { value: "INTERVIEW", label: "Interviews" },
  { value: "FEEDBACK", label: "Feedback" },
  { value: "OFFER", label: "Offers" },
  { value: "AVAILABILITY", label: "Availability" },
  { value: "PROFILE", label: "Profile" },
  { value: "PLACEMENT", label: "Placement" },
];
export const PAGE_SIZE = 20;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const CHIP_KINDS: readonly string[] = ["FILE", "JOB", "DATES", "AVAILABILITY", "TEXT"];

function parseTile(v: unknown): TimelineTile | null {
  if (!isObj(v) || typeof v.value !== "number") return null;
  return {
    value: v.value,
    previous: typeof v.previous === "number" ? v.previous : null,
    deltaPct: typeof v.deltaPct === "number" ? v.deltaPct : null,
    sparkline: arr(v.sparkline).filter((n): n is number => typeof n === "number"),
    vs: v.vs === "week" ? "week" : "month",
  };
}

function parseChip(v: unknown): TimelineChip | null {
  if (!isObj(v) || typeof v.kind !== "string" || !CHIP_KINDS.includes(v.kind)) return null;
  return { kind: v.kind as ChipKind, primary: strOrNull(v.primary), secondary: strOrNull(v.secondary), company: strOrNull(v.company), from: strOrNull(v.from), to: strOrNull(v.to) };
}

/** One event, or null when it is not the contract (such rows are dropped, never guessed). */
export function parseEvent(o: unknown): TimelineEvent | null {
  if (!isObj(o) || typeof o.key !== "string" || typeof o.type !== "string" || typeof o.at !== "string" || Number.isNaN(Date.parse(o.at))) return null;
  return {
    key: o.key,
    type: o.type,
    group: str(o.group),
    category: strOrNull(o.category),
    at: o.at,
    title: str(o.title, o.type),
    description: str(o.description),
    chip: parseChip(o.chip),
    actionLabel: str(o.actionLabel, "View"),
    target: str(o.target),
    sample: o.sample === true,
  };
}

export function parseTimeline(body: unknown): TimelineView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles)) return null;
  const keys: TileKey[] = ["total", "thisWeek", "applications", "interviews", "profile"];
  const tiles = {} as Record<TileKey, TimelineTile>;
  for (const k of keys) {
    const t = parseTile((body.tiles as Record<string, unknown>)[k]);
    if (!t) return null;
    tiles[k] = t;
  }
  return {
    orgId: body.orgId,
    generatedAt: str(body.generatedAt),
    consultantName: str(body.consultantName),
    tiles,
    type: str(body.type, "ALL"),
    days: num(body.days, 30),
    total: num(body.total),
    events: arr(body.events).map(parseEvent).filter((e): e is TimelineEvent => e !== null),
    nextCursor: strOrNull(body.nextCursor),
    milestones: arr(body.milestones)
      .map((m): Milestone | null => (isObj(m) && typeof m.key === "string" && typeof m.label === "string" ? { key: m.key, label: m.label, reached: m.reached === true, on: strOrNull(m.on) } : null))
      .filter((m): m is Milestone => m !== null),
  };
}

/** Events already shown plus a newly loaded page, without repeats (a refresh can overlap a page). */
export function mergeEvents(shown: TimelineEvent[], more: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set(shown.map((e) => e.key));
  return [...shown, ...more.filter((e) => !seen.has(e.key))];
}

/* ── labels, time and grouping ───────────────────────────────────────────────────────── */

const DOT: Record<string, Tone> = {
  RESUME: "blue",
  JOB: "green",
  APPLICATION: "violet",
  SUBMISSION: "green",
  INTERVIEW: "amber",
  FEEDBACK: "violet",
  OFFER: "amber",
  AVAILABILITY: "blue",
  PROFILE: "slate",
  PLACEMENT: "green",
};
/** The rail dot colour of an event group (the marketer note is red, as on the board). */
export const dotTone = (e: Pick<TimelineEvent, "group" | "type">): Tone => (e.type === "MARKETER_NOTE" ? "red" : (DOT[e.group] ?? "slate"));

export function timeLabel(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

export function dayLabel(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
}

/** The day heading: Today / Yesterday for the two latest days, else the date. */
export function dayHeading(iso: string, now: number = Date.now(), timeZone?: string): string {
  const day = dayLabel(iso, timeZone);
  if (day === dayLabel(new Date(now).toISOString(), timeZone)) return "Today";
  if (day === dayLabel(new Date(now - 86_400_000).toISOString(), timeZone)) return "Yesterday";
  return day;
}

export interface DayGroup {
  day: string;
  events: TimelineEvent[];
}

/** Consecutive events of the same calendar day, in the order given (the API sends newest first). */
export function groupByDay(events: TimelineEvent[], timeZone?: string): DayGroup[] {
  const out: DayGroup[] = [];
  for (const e of events) {
    const day = dayLabel(e.at, timeZone);
    const last = out[out.length - 1];
    if (last && last.day === day) last.events.push(e);
    else out.push({ day, events: [e] });
  }
  return out;
}

/** "Oct 15, 2024" + "10:00 AM - 11:00 AM" for a DATES chip. */
export function rangeLabel(from: string | null, to: string | null, timeZone?: string): { day: string; time: string } | null {
  if (!from) return null;
  const day = dayLabel(from, timeZone);
  if (!day) return null;
  const a = timeLabel(from, timeZone);
  const b = to ? timeLabel(to, timeZone) : "";
  return { day, time: b ? `${a} - ${b}` : a };
}

/** The availability chip's second line: "Nov 4, 2024" from an ISO date, or the text as it came. */
export function chipDate(v: string | null): string {
  if (!v) return "";
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? shortDate(v) : v;
}

/** The deep link of an event: the page that owns it. */
export const hrefFor = (base: string, e: Pick<TimelineEvent, "target">): string => (e.target ? `${base}/${e.target}` : base);

export function milestoneDate(m: Milestone): string {
  return m.on ? shortDate(m.on) : "-";
}

/* ── query ───────────────────────────────────────────────────────────────────────────── */

export function queryString(q: TimelineQuery, cursor?: string | null, size: number = PAGE_SIZE): string {
  const p = new URLSearchParams();
  if (q.type && q.type !== "ALL") p.set("type", q.type);
  p.set("days", String(q.days));
  p.set("size", String(size));
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

/* ── CSV export of the rows already loaded ───────────────────────────────────────────── */

/** One CSV cell: quoted when needed, and a leading = + - @ is neutralized so a spreadsheet never runs it as a formula. */
export function csvCell(v: string): string {
  let t = v.replace(/\r?\n/g, " ");
  if (/^[=+\-@\t]/.test(t)) t = `'${t}`;
  return /[",]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function chipText(c: TimelineChip | null, timeZone?: string): string {
  if (!c) return "";
  if (c.kind === "DATES") {
    const r = rangeLabel(c.from, c.to, timeZone);
    return r ? `${r.day} ${r.time}` : "";
  }
  if (c.kind === "AVAILABILITY") return [c.primary, chipDate(c.secondary)].filter(Boolean).join(" ");
  return [c.primary, c.secondary].filter(Boolean).join(" - ");
}

export function timelineCsv(events: TimelineEvent[], timeZone?: string): string {
  const rows = [["Date", "Time", "Activity", "Title", "Description", "Context"]];
  for (const e of events) rows.push([dayLabel(e.at, timeZone), timeLabel(e.at, timeZone), e.type, e.title, e.description, chipText(e.chip, timeZone)]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ── BFF call (the browser talks to Next, Next to the API) ───────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

export async function fetchTimeline(orgId: number | string, q: TimelineQuery, cursor?: string | null, signal?: AbortSignal): Promise<Fetched<TimelineView>> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/me-workspace/activity-timeline?${queryString(q, cursor)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseTimeline(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
