/**
 * The Consultant workspace Availability page's client logic (design/enterprise-consultant/availability.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/availability` (+ its writes), a tolerant parser, and the pure helpers the page uses (calendar grid,
 * what paints each day, wording of the tiles and preferences, form checks that mirror the API). Nothing here touches React and there is no
 * fallback number: every figure is the API's answer. Rates are recorded only; Kiwiply never moves money. Nothing here is sent to a marketer.
 */
import type { Tone } from "./home";

export type AvailStatus = "AVAILABLE" | "ON_PROJECT" | "NOTICE" | "UNAVAILABLE";
export type BlockKind = "VACATION" | "PERSONAL" | "HOLIDAY" | "AVAILABLE";
export type BlockStatus = "APPROVED" | "PENDING";
export type WorkMode = "HYBRID" | "REMOTE" | "ONSITE";
export type TravelChoice = "NONE" | "OCCASIONAL" | "FREQUENT" | "FULL";

export const AVAIL_STATUSES: readonly AvailStatus[] = ["AVAILABLE", "ON_PROJECT", "NOTICE", "UNAVAILABLE"];
export const BLOCK_KINDS: readonly BlockKind[] = ["VACATION", "PERSONAL", "HOLIDAY", "AVAILABLE"];
export const WORK_MODES: readonly WorkMode[] = ["HYBRID", "REMOTE", "ONSITE"];
export const TRAVEL_CHOICES: readonly TravelChoice[] = ["NONE", "OCCASIONAL", "FREQUENT", "FULL"];

export interface CountTile {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
}

export interface Block {
  id: number;
  kind: BlockKind;
  /** yyyy-MM-dd */
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: BlockStatus;
  /** The APPROVED / PENDING status was set by the demo seeder: the marketer's approval is not connected yet. */
  sample: boolean;
}

export interface HistoryRow {
  id: number;
  effectiveDate: string;
  availabilityStatus: AvailStatus;
  availableFrom: string | null;
  workMode: WorkMode | null;
  status: "ACTIVE" | "EXPIRED";
  sample: boolean;
}

export interface Preferences {
  /** The first one is the primary location. Edited on the Profile page. */
  locations: string[];
  workAuthorization: string | null;
  workMode: WorkMode | null;
  employmentTypes: string[];
  rateMinMinor: number | null;
  rateMaxMinor: number | null;
  rateNote: string | null;
  travelLabel: TravelChoice | null;
  travelPercent: number | null;
  noticeWeeks: number | null;
}

export interface AvailabilityView {
  orgId: number;
  generatedAt: string;
  /** The server's date (UTC), yyyy-MM-dd: "Today" on the calendar. */
  today: string;
  name: string;
  availability: { status: AvailStatus; since: string | null; availableFrom: string | null };
  tiles: {
    availableFrom: { status: AvailStatus; date: string | null; daysFromNow: number | null };
    openOpportunities: CountTile;
    workMode: WorkMode | null;
    notice: { weeks: number | null; availableOn: string | null };
    vacation: { year: number; approvedDays: number; scheduledDays: number; pendingDays: number };
  };
  preferences: Preferences;
  blocks: Block[];
  history: HistoryRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => list.find((x) => x === v) ?? null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown): string | null => (typeof v === "string" && DATE.test(v) ? v : null);

function tileOf(v: unknown): CountTile {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: numOrNull(d.previous),
    deltaPct: numOrNull(d.deltaPct),
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
  };
}

export function parseBlock(o: unknown): Block | null {
  if (!isObj(o) || typeof o.id !== "number") return null;
  const kind = oneOf(BLOCK_KINDS, o.kind);
  const start = dateOrNull(o.startDate);
  const end = dateOrNull(o.endDate);
  if (!kind || !start || !end) return null;
  return { id: o.id, kind, startDate: start, endDate: end, days: Math.max(1, num(o.days, 1)), reason: strOrNull(o.reason), status: o.status === "PENDING" ? "PENDING" : "APPROVED", sample: o.sample === true };
}

export function parseHistory(o: unknown): HistoryRow | null {
  if (!isObj(o) || typeof o.id !== "number") return null;
  const eff = dateOrNull(o.effectiveDate);
  const st = oneOf(AVAIL_STATUSES, o.availabilityStatus);
  if (!eff || !st) return null;
  return { id: o.id, effectiveDate: eff, availabilityStatus: st, availableFrom: dateOrNull(o.availableFrom), workMode: oneOf(WORK_MODES, o.workMode), status: o.status === "ACTIVE" ? "ACTIVE" : "EXPIRED", sample: o.sample === true };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseAvailability(body: unknown): AvailabilityView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles) || !isObj(body.availability) || !isObj(body.preferences)) return null;
  const today = dateOrNull(body.today);
  if (!today) return null;
  const av = body.availability;
  const t = body.tiles;
  const af = isObj(t.availableFrom) ? t.availableFrom : {};
  const notice = isObj(t.notice) ? t.notice : {};
  const vac = isObj(t.vacation) ? t.vacation : {};
  const p = body.preferences;
  const status = oneOf(AVAIL_STATUSES, av.status) ?? "AVAILABLE";
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    today,
    name: typeof body.name === "string" ? body.name : "",
    availability: { status, since: dateOrNull(av.since), availableFrom: dateOrNull(av.availableFrom) },
    tiles: {
      availableFrom: { status: oneOf(AVAIL_STATUSES, af.status) ?? status, date: dateOrNull(af.date), daysFromNow: numOrNull(af.daysFromNow) },
      openOpportunities: tileOf(t.openOpportunities),
      workMode: oneOf(WORK_MODES, t.workMode),
      notice: { weeks: numOrNull(notice.weeks), availableOn: dateOrNull(notice.availableOn) },
      vacation: { year: num(vac.year, Number(today.slice(0, 4))), approvedDays: num(vac.approvedDays), scheduledDays: num(vac.scheduledDays), pendingDays: num(vac.pendingDays) },
    },
    preferences: {
      locations: arr(p.locations).filter((x): x is string => typeof x === "string" && x !== ""),
      workAuthorization: strOrNull(p.workAuthorization),
      workMode: oneOf(WORK_MODES, p.workMode),
      employmentTypes: arr(p.employmentTypes).filter((x): x is string => typeof x === "string" && x !== ""),
      rateMinMinor: numOrNull(p.rateMinMinor),
      rateMaxMinor: numOrNull(p.rateMaxMinor),
      rateNote: strOrNull(p.rateNote),
      travelLabel: oneOf(TRAVEL_CHOICES, p.travelLabel),
      travelPercent: numOrNull(p.travelPercent),
      noticeWeeks: numOrNull(p.noticeWeeks),
    },
    blocks: arr(body.blocks)
      .map(parseBlock)
      .filter((b): b is Block => b !== null),
    history: arr(body.history)
      .map(parseHistory)
      .filter((h): h is HistoryRow => h !== null),
  };
}

/* ── dates (yyyy-MM-dd strings compare correctly as text) ─────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (y: number, m0: number, d: number): string => `${y}-${pad(m0 + 1)}-${pad(d)}`;

/** "Oct 21, 2024" from a yyyy-MM-dd (never shifted by the viewer's zone). */
export function dayText(iso: string | null): string {
  if (!iso || !DATE.test(iso)) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Oct 8, 2024 - Oct 9, 2024", or one date for a single day. */
export function rangeLabel(start: string, end: string): string {
  return start === end ? dayText(start) : `${dayText(start)} - ${dayText(end)}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function monthTitle(year: number, month0: number): string {
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function shiftMonth(year: number, month0: number, by: number): { year: number; month0: number } {
  const t = year * 12 + month0 + by;
  return { year: Math.floor(t / 12), month0: ((t % 12) + 12) % 12 };
}

export interface Cell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** The weeks (Sunday first) that cover the month: every row has seven cells, leading and trailing days belong to the next / previous month. */
export function monthGrid(year: number, month0: number): Cell[][] {
  const first = new Date(Date.UTC(year, month0, 1));
  const lead = first.getUTCDay();
  const count = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const weeks = Math.ceil((lead + count) / 7);
  const rows: Cell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(year, month0, 1 - lead + w * 7 + i));
      row.push({ iso: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month0 });
    }
    rows.push(row);
  }
  return rows;
}

/** The first day the consultant counts as available: the date they set, else today when they are AVAILABLE, else none. */
export function openFrom(view: Pick<AvailabilityView, "availability" | "today">): string | null {
  if (view.availability.availableFrom) return view.availability.availableFrom;
  return view.availability.status === "AVAILABLE" ? view.today : null;
}

export interface DayPaint {
  /** The entries covering the day (an unavailable one wins over green). */
  blocks: Block[];
  /** Green: a working day on or after the open date, or inside an AVAILABLE entry, with nothing unavailable on it. */
  available: boolean;
}

export const isUnavailableKind = (k: BlockKind): boolean => k !== "AVAILABLE";

export function paintDay(view: Pick<AvailabilityView, "availability" | "today" | "blocks">, iso: string): DayPaint {
  const covering = view.blocks.filter((b) => b.startDate <= iso && iso <= b.endDate);
  if (covering.some((b) => isUnavailableKind(b.kind))) return { blocks: covering, available: false };
  const from = openFrom(view);
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const weekday = dow !== 0 && dow !== 6;
  const viaDate = from !== null && iso >= from && weekday;
  const viaBlock = covering.some((b) => b.kind === "AVAILABLE");
  return { blocks: covering, available: viaDate || viaBlock };
}

/** Entries that have not ended yet and are time off (the Upcoming Unavailable Dates table), soonest first. */
export function upcomingUnavailable(blocks: Block[], today: string): Block[] {
  return blocks.filter((b) => isUnavailableKind(b.kind) && b.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
}

/* ── wording ──────────────────────────────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<AvailStatus, string> = { AVAILABLE: "Available", ON_PROJECT: "On a project", NOTICE: "On notice", UNAVAILABLE: "Not available" };
export const WORK_MODE_LABEL: Record<WorkMode, string> = { HYBRID: "Hybrid", REMOTE: "Remote", ONSITE: "On-site" };
export const TRAVEL_LABEL: Record<TravelChoice, string> = { NONE: "No travel", OCCASIONAL: "Occasional travel", FREQUENT: "Frequent travel", FULL: "Full-time travel" };
export const EMPLOYMENT_LABEL: Record<string, string> = { CONTRACT: "Contract", CONTRACT_TO_HIRE: "Contract-to-Hire", FULL_TIME: "Full-time", PART_TIME: "Part-time" };
export const AUTH_LABEL: Record<string, { title: string; detail: string }> = {
  AUTHORIZED_NO_SPONSORSHIP: { title: "Authorized to work", detail: "No sponsorship needed" },
  AUTHORIZED_NEEDS_SPONSORSHIP: { title: "Authorized to work", detail: "Needs sponsorship" },
  NOT_AUTHORIZED: { title: "Not authorized to work", detail: "Status as you entered it" },
};

/** "2 weeks from now" / "In 3 days" / "Available now" for the Available From tile. */
export function fromNowText(t: AvailabilityView["tiles"]["availableFrom"]): string {
  if (t.date === null) return t.status === "AVAILABLE" ? "Available now" : "No date set";
  const d = t.daysFromNow ?? 0;
  if (d <= 0) return "Available now";
  if (d < 7) return d === 1 ? "1 day from now" : `${d} days from now`;
  const w = Math.floor(d / 7);
  return w === 1 ? "1 week from now" : `${w} weeks from now`;
}

export const noticeText = (weeks: number | null): string => (weeks === null ? "Not set" : weeks === 0 ? "Immediate" : weeks === 1 ? "1 week" : `${weeks} weeks`);

/** "$110" or "$110.50" from minor units (USD). */
export function moneyText(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const cents = minor % 100;
  return cents === 0 ? `$${whole}` : `$${whole}.${pad(cents)}`;
}

export function rateText(p: Pick<Preferences, "rateMinMinor" | "rateMaxMinor">): string {
  const { rateMinMinor: lo, rateMaxMinor: hi } = p;
  if (lo !== null && hi !== null) return lo === hi ? `${moneyText(lo)} per hour` : `${moneyText(lo)} - ${moneyText(hi)} per hour`;
  if (lo !== null) return `From ${moneyText(lo)} per hour`;
  if (hi !== null) return `Up to ${moneyText(hi)} per hour`;
  return "Not set";
}

export function travelText(p: Pick<Preferences, "travelLabel" | "travelPercent">): { title: string; detail: string | null } {
  if (!p.travelLabel) return { title: "Not set", detail: null };
  const detail = p.travelLabel === "NONE" ? null : p.travelPercent !== null ? `Up to ${p.travelPercent}% travel` : null;
  return { title: TRAVEL_LABEL[p.travelLabel], detail };
}

/** The one-line sub text under the work mode, derived from the choice itself. */
export const workModeHint = (m: WorkMode | null): string | null => (m === "HYBRID" ? "Open to remote or on-site" : m === "REMOTE" ? "Remote first" : m === "ONSITE" ? "On-site first" : null);

export const employmentText = (types: string[]): { title: string; detail: string | null } =>
  types.length === 0 ? { title: "Not set", detail: null } : { title: EMPLOYMENT_LABEL[types[0]] ?? types[0], detail: types.length > 1 ? `Open to ${types.slice(1).map((t) => EMPLOYMENT_LABEL[t] ?? t).join(", ")}` : null };

export function kindInfo(kind: BlockKind): { label: string; tone: Tone } {
  switch (kind) {
    case "VACATION":
      return { label: "Vacation", tone: "red" };
    case "PERSONAL":
      return { label: "Personal", tone: "blue" };
    case "HOLIDAY":
      return { label: "Holiday", tone: "violet" };
    default:
      return { label: "Available", tone: "green" };
  }
}

export const blockStatusInfo = (s: BlockStatus): { label: string; tone: Tone } => (s === "PENDING" ? { label: "Pending", tone: "amber" } : { label: "Approved", tone: "green" });

export function historyStatusInfo(s: HistoryRow["status"]): { label: string; tone: Tone } {
  return s === "ACTIVE" ? { label: "Active", tone: "green" } : { label: "Expired", tone: "slate" };
}

/** "Immediately" or the date for a history row's Availability cell. */
export function historyWhen(h: Pick<HistoryRow, "availableFrom" | "effectiveDate">): string {
  return h.availableFrom && h.availableFrom > h.effectiveDate ? dayText(h.availableFrom) : "Immediately";
}

/* ── form checks (the API repeats every one of them) ──────────────────────────────────── */

export const REASON_MAX = 200;
export const MAX_SPAN_DAYS = 366;

export interface BlockDraft {
  kind: BlockKind;
  startDate: string;
  endDate: string;
  reason: string;
}

/** The sentence to show when the draft is not acceptable, else null. Overlaps are the API's call (it knows every entry). */
export function blockProblem(d: BlockDraft, today: string): string | null {
  if (!DATE.test(d.startDate)) return "Pick a start date.";
  const end = d.endDate || d.startDate;
  if (!DATE.test(end)) return "Pick an end date.";
  if (end < d.startDate) return "The end date can't be before the start date.";
  if (daysBetween(d.startDate, end) + 1 > MAX_SPAN_DAYS) return `An entry can span at most ${MAX_SPAN_DAYS} days.`;
  if (d.startDate < addDays(today, -MAX_SPAN_DAYS) || d.startDate > addDays(today, 731)) return "Pick a date within the last year or the next two years.";
  if (d.reason.trim().length > REASON_MAX) return `Keep the reason to ${REASON_MAX} characters or fewer.`;
  return null;
}

export function fromDateProblem(value: string, today: string): string | null {
  if (!value) return null;
  if (!DATE.test(value)) return "Pick a date.";
  if (value < today) return "Pick today or a later date.";
  if (value > addDays(today, 730)) return "Pick a date within the next two years.";
  return null;
}

export interface PrefDraft {
  workMode: WorkMode | "";
  noticeWeeks: string;
  rateMin: string;
  rateMax: string;
  rateNote: string;
  travelLabel: TravelChoice | "";
  travelPercent: string;
}

export function draftOf(p: Preferences): PrefDraft {
  return {
    workMode: p.workMode ?? "",
    noticeWeeks: p.noticeWeeks === null ? "" : String(p.noticeWeeks),
    rateMin: p.rateMinMinor === null ? "" : String(p.rateMinMinor / 100),
    rateMax: p.rateMaxMinor === null ? "" : String(p.rateMaxMinor / 100),
    rateNote: p.rateNote ?? "",
    travelLabel: p.travelLabel ?? "",
    travelPercent: p.travelPercent === null ? "" : String(p.travelPercent),
  };
}

/** Dollars typed as "110" or "110.5" to minor units, null for blank, NaN for junk. */
export function toMinor(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}

const intOrNull = (v: string): number | null => (v.trim() === "" ? null : /^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);

export function prefProblem(d: PrefDraft): string | null {
  const weeks = intOrNull(d.noticeWeeks);
  if (weeks !== null && (Number.isNaN(weeks) || weeks > 26)) return "Notice period is between 0 and 26 weeks.";
  const lo = toMinor(d.rateMin);
  const hi = toMinor(d.rateMax);
  if ((lo !== null && Number.isNaN(lo)) || (hi !== null && Number.isNaN(hi))) return "Enter the rate in dollars, like 110 or 110.50.";
  if (lo !== null && hi !== null && lo > hi) return "The lowest rate can't be above the highest.";
  if (d.rateNote.trim().length > 120) return "Keep the rate note to 120 characters or fewer.";
  const pct = intOrNull(d.travelPercent);
  if (pct !== null && (Number.isNaN(pct) || pct > 100)) return "Travel is a percentage from 0 to 100.";
  if (d.travelLabel === "" && pct !== null) return "Choose how much you can travel first.";
  return null;
}

export function prefBody(d: PrefDraft) {
  const lo = toMinor(d.rateMin);
  const hi = toMinor(d.rateMax);
  return {
    workMode: d.workMode || null,
    noticeWeeks: intOrNull(d.noticeWeeks),
    rateMinMinor: lo,
    rateMaxMinor: hi,
    rateNote: d.rateNote.trim() || null,
    travelLabel: d.travelLabel || null,
    travelPercent: d.travelLabel === "NONE" ? 0 : intOrNull(d.travelPercent),
  };
}

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

export type WriteResult = { kind: "OK"; view: AvailabilityView } | { kind: "DENIED" } | { kind: "INVALID"; message: string; sensitive: boolean; conflict: boolean } | { kind: "FAILED" };

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/availability`;

export async function fetchAvailability(orgId: number | string, signal?: AbortSignal): Promise<Fetched<AvailabilityView>> {
  try {
    const res = await fetch(base(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseAvailability(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

async function write(orgId: number | string, tail: string, method: "PUT" | "POST" | "DELETE", body?: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(`${base(orgId)}${tail}`, {
      method,
      headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 422 || res.status === 400 || res.status === 409) {
      const o = isObj(json) ? json : {};
      return { kind: "INVALID", message: typeof o.error === "string" ? o.error : "That value was not accepted.", sensitive: o.code === "SENSITIVE_CONTENT", conflict: res.status === 409 };
    }
    if (!res.ok) return { kind: "FAILED" };
    const view = parseAvailability(json);
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export const saveStatus = (orgId: number | string, status: AvailStatus, availableFrom: string | null) => write(orgId, "/status", "PUT", { status, availableFrom });
export const createBlock = (orgId: number | string, d: BlockDraft) => write(orgId, "/blocks", "POST", { kind: d.kind, startDate: d.startDate, endDate: d.endDate || d.startDate, reason: d.reason.trim() || null });
export const changeBlock = (orgId: number | string, id: number, d: BlockDraft) => write(orgId, `/blocks/${id}`, "PUT", { kind: d.kind, startDate: d.startDate, endDate: d.endDate || d.startDate, reason: d.reason.trim() || null });
export const removeBlock = (orgId: number | string, id: number) => write(orgId, `/blocks/${id}`, "DELETE");
export const savePreferences = (orgId: number | string, d: PrefDraft) => write(orgId, "/preferences", "PUT", prefBody(d));
