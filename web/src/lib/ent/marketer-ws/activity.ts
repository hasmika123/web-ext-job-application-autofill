/**
 * The Marketing Activities board's data (design: Activities). One call to `GET /api/orgs/{orgId}/mkt/activity` (through the BFF) draws the whole page: five KPI
 * tiles, the filtered feed, "Activity Summary by Type" and "Upcoming Activities". ASSIGNED scope: only the consultants the marketer is assigned to. The feed is a
 * read-mostly merge of what the marketer's side did (resume, opportunity, submission, follow-up, interview and application events, placements) plus the manual
 * "Log Activity" rows. E1: logging only RECORDS; nothing here submits for a consultant, mails anyone or signs in as anyone.
 */

export type ActivityKpiKey = "total" | "resume" | "submission" | "followup" | "interview";
export const ACTIVITY_KPI_KEYS: ActivityKpiKey[] = ["total", "resume", "submission", "followup", "interview"];
export const ACTIVITY_KPI_TITLES: Record<ActivityKpiKey, string> = {
  total: "Total Activities", resume: "Resume Updates", submission: "New Submissions", followup: "Client Follow-ups", interview: "Interviews Coordinated",
};

export type ActivityStatus = "COMPLETED" | "SCHEDULED" | "CANCELLED";
export const STATUS_LABEL: Record<ActivityStatus, string> = { COMPLETED: "Completed", SCHEDULED: "Scheduled", CANCELLED: "Cancelled" };
export type SortKey = "recent" | "oldest";
export const SORT_LABEL: Record<SortKey, string> = { recent: "Most Recent", oldest: "Oldest First" };
export type SummaryRange = "THIS_MONTH" | "LAST_MONTH" | "LAST_7_DAYS" | "LAST_30_DAYS";
export const SUMMARY_RANGE_LABEL: Record<SummaryRange, string> = { THIS_MONTH: "This Month", LAST_MONTH: "Last Month", LAST_7_DAYS: "Last 7 Days", LAST_30_DAYS: "Last 30 Days" };

export interface Person { id: number | null; name: string; avatarUrl: string | null }
export interface ClientRef { id: number | null; name: string }
export interface ActivityRow {
  /** "SOURCE:n"; "MANUAL:n" rows can change status. */
  id: string;
  source: string;
  type: string;
  group: string;
  groupLabel: string;
  title: string;
  subtitle: string;
  at: string;
  actor: Person | null;
  consultant: Person | null;
  client: ClientRef | null;
  tag: string;
  status: ActivityStatus;
  manual: boolean;
}
export interface ActivityKpi { key: ActivityKpiKey; value: number; deltaPct: number | null; sparkline: number[] }
export interface SummaryRow { key: string; label: string; count: number; pct: number }
export interface ActivitySummary { range: SummaryRange; from: string; to: string; total: number; rows: SummaryRow[] }
export interface UpcomingRow { id: string; kind: string; icon: string; title: string; consultantName: string; at: string }
export interface Option { id: number; name: string }
export interface Choice { key: string; label: string }
export interface ActivityOptions { consultants: Option[]; clients: Option[]; owners: Option[]; types: Choice[]; manualTypes: Choice[]; statuses: Choice[]; summaryRanges: Choice[] }
export interface ActivityView {
  from: string;
  to: string;
  canLog: boolean;
  kpis: ActivityKpi[];
  activities: { items: ActivityRow[]; total: number; page: number; size: number };
  summary: ActivitySummary;
  upcoming: UpcomingRow[];
  upcomingTotal: number;
  options: ActivityOptions;
}

/** What the filter row selects. Empty string = "All". Dates are yyyy-MM-dd. */
export interface Filters {
  from: string;
  to: string;
  consultantId: string;
  type: string;
  status: string;
  clientId: string;
  ownerId: string;
  sort: SortKey;
  summaryRange: SummaryRange;
  page: number;
}
export const PAGE_SIZE = 10;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const oneOf = <T extends string>(x: unknown, allowed: readonly T[], d: T): T => (typeof x === "string" && (allowed as readonly string[]).includes(x) ? (x as T) : d);

function person(x: unknown): Person | null {
  if (!isObj(x) || typeof x.name !== "string") return null;
  return { id: numOrNull(x.id), name: x.name, avatarUrl: typeof x.avatarUrl === "string" ? x.avatarUrl : null };
}
const options = (x: unknown): Option[] => arr(x).filter((o) => typeof o.id === "number").map((o) => ({ id: num(o.id), name: str(o.name) }));
const choices = (x: unknown): Choice[] => arr(x).filter((o) => typeof o.key === "string").map((o) => ({ key: str(o.key), label: str(o.label, str(o.key)) }));

export function parseRow(r: Record<string, unknown>): ActivityRow {
  const client = isObj(r.client) && typeof r.client.name === "string" ? { id: numOrNull(r.client.id), name: r.client.name } : null;
  return {
    id: str(r.id), source: str(r.source), type: str(r.type), group: str(r.group), groupLabel: str(r.groupLabel), title: str(r.title), subtitle: str(r.subtitle), at: str(r.at),
    actor: person(r.actor), consultant: person(r.consultant), client, tag: str(r.tag), status: oneOf(r.status, ["COMPLETED", "SCHEDULED", "CANCELLED"], "COMPLETED"), manual: r.manual === true,
  };
}

/** Lenient: a malformed list becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseActivity(raw: unknown): ActivityView | null {
  if (!isObj(raw)) return null;
  const a = isObj(raw.activities) ? raw.activities : {};
  const items = arr(a.items).map(parseRow);
  const s = isObj(raw.summary) ? raw.summary : {};
  const o = isObj(raw.options) ? raw.options : {};
  return {
    from: str(raw.from), to: str(raw.to), canLog: raw.canLog === true,
    kpis: arr(raw.kpis)
      .filter((k) => (ACTIVITY_KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({ key: str(k.key) as ActivityKpiKey, value: num(k.value), deltaPct: numOrNull(k.deltaPct), sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [] })),
    activities: { items, total: Math.max(num(a.total, items.length), items.length), page: num(a.page), size: Math.max(1, num(a.size, PAGE_SIZE)) },
    summary: {
      range: oneOf(s.range, ["THIS_MONTH", "LAST_MONTH", "LAST_7_DAYS", "LAST_30_DAYS"], "THIS_MONTH"), from: str(s.from), to: str(s.to), total: num(s.total),
      rows: arr(s.rows).map((r) => ({ key: str(r.key), label: str(r.label), count: num(r.count), pct: num(r.pct) })),
    },
    upcoming: arr(raw.upcoming).map((u) => ({ id: str(u.id), kind: str(u.kind), icon: str(u.icon), title: str(u.title), consultantName: str(u.consultantName), at: str(u.at) })),
    upcomingTotal: Math.max(num(raw.upcomingTotal), arr(raw.upcoming).length),
    options: { consultants: options(o.consultants), clients: options(o.clients), owners: options(o.owners), types: choices(o.types), manualTypes: choices(o.manualTypes), statuses: choices(o.statuses), summaryRanges: choices(o.summaryRanges) },
  };
}

export type ActivityFetch = { kind: "OK"; view: ActivityView } | { kind: "DENIED" } | { kind: "FAILED" };

/** The query string for a filter state (empty filters are left out). */
export function buildQuery(f: Partial<Filters>): string {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.consultantId) p.set("consultantId", f.consultantId);
  if (f.type) p.set("type", f.type);
  if (f.status) p.set("status", f.status);
  if (f.clientId) p.set("clientId", f.clientId);
  if (f.ownerId) p.set("ownerId", f.ownerId);
  if (f.sort && f.sort !== "recent") p.set("sort", f.sort);
  if (f.summaryRange && f.summaryRange !== "THIS_MONTH") p.set("summaryRange", f.summaryRange);
  p.set("page", String(f.page ?? 0));
  p.set("size", String(PAGE_SIZE));
  return p.toString();
}

export async function fetchActivity(orgId: number | string, filters: Partial<Filters> = {}, signal?: AbortSignal): Promise<ActivityFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/activity?${buildQuery(filters)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseActivity(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

// ---- writes (record only) -----------------------------------------------------------------------------------------------

export interface LogInput {
  consultantId: number;
  clientAccountId?: number | null;
  type: string;
  title: string;
  detail?: string;
  tags?: string;
  status?: ActivityStatus;
  /** ISO instant; omitted = now. */
  occurredAt?: string;
}

export type ActionOutcome = { ok: true } | { ok: false; denied: boolean; message: string };

async function send(path: string, method: "POST" | "PATCH", body: unknown): Promise<ActionOutcome> {
  try {
    const res = await fetch(path, { method, body: JSON.stringify(body), headers: { "content-type": "application/json", accept: "application/json" }, cache: "no-store" });
    if (res.ok) return { ok: true };
    const b: unknown = await res.json().catch(() => null);
    const message = isObj(b) && typeof b.error === "string" ? b.error : isObj(b) && typeof b.message === "string" ? b.message : "That didn't save. Nothing has changed.";
    return { ok: false, denied: res.status === 403 || res.status === 404, message };
  } catch {
    return { ok: false, denied: false, message: "Couldn't reach the server. Nothing has changed." };
  }
}

/** "Log Activity": records one manual row through the BFF. It can not submit for a consultant, send mail or sign in as anyone. */
export const logActivity = (orgId: number | string, input: LogInput): Promise<ActionOutcome> =>
  send(`/api/orgs/${orgId}/mkt/activity`, "POST", { ...input, clientAccountId: input.clientAccountId ?? null });

/** Marks one of the marketer's own manual rows COMPLETED, SCHEDULED or CANCELLED (`id` is the row id, "MANUAL:n"). */
export function setActivityStatus(orgId: number | string, rowId: string, status: ActivityStatus): Promise<ActionOutcome> {
  const n = /^MANUAL:(\d{1,18})$/.exec(rowId);
  if (!n) return Promise.resolve({ ok: false, denied: false, message: "Only logged activities can be changed." });
  return send(`/api/orgs/${orgId}/mkt/activity/${n[1]}/status`, "PATCH", { status });
}

// ---- display helpers ----------------------------------------------------------------------------------------------------

const ymdOf = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
export const addDaysUtc = (d: Date, n: number): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
export { ymdOf };

/** "Oct 1, 2024 - Oct 31, 2024" from two yyyy-MM-dd strings (UTC day, no timezone drift). */
export function rangeLabel(from: string, to: string): string {
  const f = (s: string) => {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  };
  return `${f(from)} - ${f(to)}`;
}

/** The date range presets of the picker, as yyyy-MM-dd pairs (UTC days, as the API counts them). */
export function rangePresets(now: Date): { label: string; from: string; to: string }[] {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0));
  const lastFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return [
    { label: "This month", from: ymdOf(first), to: ymdOf(end(now.getUTCFullYear(), now.getUTCMonth())) },
    { label: "Last month", from: ymdOf(lastFirst), to: ymdOf(end(lastFirst.getUTCFullYear(), lastFirst.getUTCMonth())) },
    { label: "Last 7 days", from: ymdOf(addDaysUtc(today, -6)), to: ymdOf(today) },
    { label: "Last 30 days", from: ymdOf(addDaysUtc(today, -29)), to: ymdOf(today) },
  ];
}

/** "Oct 18, 2024" (UTC day, as the range filters it). */
export function dayText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
/** "4:32 PM" (UTC). */
export function timeText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/** "Today, 10:00 AM" / "Tomorrow, 9:00 AM" / "Oct 20, 10:00 AM" and a tone for the colour (amber today, green tomorrow, muted later). */
export function upcomingWhen(iso: string, now: Date): { text: string; tone: "today" | "tomorrow" | "later" } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { text: "", tone: "later" };
  const day = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  const time = timeText(iso);
  if (diff === 0) return { text: `Today, ${time}`, tone: "today" };
  if (diff === 1) return { text: `Tomorrow, ${time}`, tone: "tomorrow" };
  return { text: `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${time}`, tone: "later" };
}

/** Rounded whole percent for the summary ("19%"). */
export const pctText = (pct: number): string => `${Math.round(pct)}%`;

// ---- board art (cropped from the approved board into public/ent/marketer/activity) -----------------------------------------

export const ACTIVITY_ART = "/ent/marketer/activity";
const FACES = new Set([
  "emily-lawson", "alex-morgan", "sarah-chen", "priya-sharma", "michael-park", "david-kim", "daniel-wright", "anna-wilson", "olivia-bennett", "daniel-kim", "ethan-brooks", "isabella-rossi", "noah-patel",
]);
const LOGOS = new Set(["techcorp", "global-bank", "cloudscale", "healthplus", "aws", "retailco", "nextgen-tech", "acme-internal"]);
const slug = (s: string) => s.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** A real `avatarUrl` from the API wins; the board's cropped photo only for the people on it; otherwise null (the page draws initials). */
export const photoFor = (name: string, url: string | null): string | null => url ?? (FACES.has(slug(name)) ? `${ACTIVITY_ART}/${slug(name)}.png` : null);
export const logoFor = (client: string): string | null => (LOGOS.has(slug(client)) ? `${ACTIVITY_ART}/logo-${slug(client)}.png` : null);
