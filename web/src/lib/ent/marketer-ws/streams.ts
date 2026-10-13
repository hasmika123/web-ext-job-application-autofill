/**
 * The Job Streams board's data (design: Job Streams). One call to `GET /api/orgs/{orgId}/mkt/streams` (through the BFF) draws the
 * page; the writes only RECORD configuration (add / configure / pause / resume a stream, toggle a rule). Nothing here syncs from a
 * site and nothing submits for a consultant (E1). A section the API leaves out is an honest empty state, never a made-up row.
 */

export type KpiKey = "activeStreams" | "syncHealth" | "newOpenings" | "streamErrors";
export const KPI_KEYS: KpiKey[] = ["activeStreams", "syncHealth", "newOpenings", "streamErrors"];
export const KPI_TITLES: Record<KpiKey, string> = {
  activeStreams: "Active Job Streams",
  syncHealth: "Sync Health",
  newOpenings: "New Openings Captured",
  streamErrors: "Stream Errors",
};

export type StreamStatus = "ACTIVE" | "PAUSED" | "ERROR";
export const STATUS_LABEL: Record<StreamStatus, string> = { ACTIVE: "Active", PAUSED: "Paused", ERROR: "Error" };
export type RuleKey = "DEFAULT_KEYWORDS" | "CLIENT_MAPPING" | "DUPLICATE_DETECTION" | "AUTO_PUBLISH";
export const RULE_KEYS: RuleKey[] = ["DEFAULT_KEYWORDS", "CLIENT_MAPPING", "DUPLICATE_DETECTION", "AUTO_PUBLISH"];
export const RULE_COPY: Record<RuleKey, { title: string; blurb: string }> = {
  DEFAULT_KEYWORDS: { title: "Default Keywords", blurb: "Set global keyword filters for all streams" },
  CLIENT_MAPPING: { title: "Client Mapping Rules", blurb: "Automatically assign jobs to clients" },
  DUPLICATE_DETECTION: { title: "Duplicate Detection", blurb: "Prevent duplicate job postings" },
  AUTO_PUBLISH: { title: "Auto-Publish", blurb: "Sync new openings to talent matches" },
};

export interface Kpi { key: KpiKey; value: number | null; deltaPct: number | null; sparkline: number[] }
export interface StreamRow {
  id: number;
  sourceLabel: string;
  subtitle: string | null;
  status: StreamStatus;
  active: boolean;
  syncEveryMinutes: number;
  keywords: string[];
  clientScope: string | null;
  lastSyncAt: string | null;
  newOpenings: number;
  openingsDeltaPct: number | null;
}
export interface StreamPage { items: StreamRow[]; total: number; page: number; size: number }
export interface Filters { sources: string[]; statuses: StreamStatus[]; clients: string[] }
export interface SyncRow { id: number; streamId: number; source: string; syncedAt: string; openings: number; status: "OK" | "FAILED"; message: string | null }
export interface ChartSeries { key: string; label: string; values: number[] }
export interface Chart { days: string[]; series: ChartSeries[] }
export interface AlertRow { id: number; severity: "ERROR" | "WARNING"; title: string; detail: string | null; raisedAt: string }
export interface RuleRow { key: RuleKey; enabled: boolean; value: string | null }

export interface StreamsView {
  kpis: Kpi[];
  streams: StreamPage;
  filters: Filters;
  activity: SyncRow[];
  chart: Chart;
  alerts: AlertRow[];
  rules: RuleRow[];
}

export interface StreamsQuery {
  q?: string;
  source?: string;
  status?: string;
  client?: string;
  showInactive?: boolean;
  page?: number;
  size?: number;
  sort?: string;
  days?: number;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const strOrNull = (x: unknown): string | null => (typeof x === "string" && x.length > 0 ? x : null);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const status = (x: unknown): StreamStatus => (x === "PAUSED" || x === "ERROR" ? x : "ACTIVE");

export function parseStream(s: Record<string, unknown>): StreamRow {
  const st = status(s.status);
  return {
    id: num(s.id),
    sourceLabel: str(s.sourceLabel),
    subtitle: strOrNull(s.subtitle),
    status: st,
    active: typeof s.active === "boolean" ? s.active : st !== "PAUSED",
    syncEveryMinutes: num(s.syncEveryMinutes, 60),
    keywords: Array.isArray(s.keywords) ? s.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0) : [],
    clientScope: strOrNull(s.clientScope),
    lastSyncAt: strOrNull(s.lastSyncAt),
    newOpenings: num(s.newOpenings),
    openingsDeltaPct: numOrNull(s.openingsDeltaPct),
  };
}

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseStreams(raw: unknown): StreamsView | null {
  if (!isObj(raw)) return null;
  const page = isObj(raw.streams) ? raw.streams : {};
  const items = arr(page.items).map(parseStream);
  const f = isObj(raw.filters) ? raw.filters : {};
  const c = isObj(raw.chart) ? raw.chart : {};
  const days = Array.isArray(c.days) ? c.days.filter((d): d is string => typeof d === "string") : [];
  return {
    kpis: arr(raw.kpis)
      .filter((k) => (KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({ key: str(k.key) as KpiKey, value: numOrNull(k.value), deltaPct: numOrNull(k.deltaPct), sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : [] })),
    streams: { items, total: num(page.total, items.length), page: num(page.page), size: num(page.size, 25) },
    filters: {
      sources: Array.isArray(f.sources) ? f.sources.filter((s): s is string => typeof s === "string") : [],
      statuses: Array.isArray(f.statuses) ? f.statuses.filter((s) => s === "ACTIVE" || s === "PAUSED" || s === "ERROR") : [],
      clients: Array.isArray(f.clients) ? f.clients.filter((s): s is string => typeof s === "string") : [],
    },
    activity: arr(raw.activity).map((a) => ({ id: num(a.id), streamId: num(a.streamId), source: str(a.source), syncedAt: str(a.syncedAt), openings: num(a.openings), status: a.status === "FAILED" ? "FAILED" : "OK", message: strOrNull(a.message) })),
    chart: {
      days,
      series: arr(c.series).map((s) => ({ key: str(s.key), label: str(s.label), values: days.map((_, i) => (Array.isArray(s.values) ? num(s.values[i]) : 0)) })),
    },
    alerts: arr(raw.alerts).map((a) => ({ id: num(a.id), severity: a.severity === "ERROR" ? "ERROR" : "WARNING", title: str(a.title), detail: strOrNull(a.detail), raisedAt: str(a.raisedAt) })),
    rules: arr(raw.rules)
      .filter((r) => (RULE_KEYS as string[]).includes(str(r.key)))
      .map((r) => ({ key: str(r.key) as RuleKey, enabled: r.enabled === true, value: strOrNull(r.value) })),
  };
}

export type StreamsFetch = { kind: "OK"; view: StreamsView } | { kind: "DENIED" } | { kind: "FAILED" };

export function streamsUrl(orgId: number | string, q: StreamsQuery = {}): string {
  const p = new URLSearchParams();
  if (q.q?.trim()) p.set("q", q.q.trim());
  if (q.source) p.set("source", q.source);
  if (q.status) p.set("status", q.status);
  if (q.client) p.set("client", q.client);
  if (q.showInactive) p.set("showInactive", "true");
  if (q.page) p.set("page", String(q.page));
  if (q.size) p.set("size", String(q.size));
  if (q.sort) p.set("sort", q.sort);
  if (q.days && q.days !== 7) p.set("days", String(q.days));
  const qs = p.toString();
  return `/api/orgs/${orgId}/mkt/streams${qs ? `?${qs}` : ""}`;
}

export async function fetchStreams(orgId: number | string, q: StreamsQuery = {}, signal?: AbortSignal): Promise<StreamsFetch> {
  try {
    const res = await fetch(streamsUrl(orgId, q), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseStreams(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

// ---- writes: record configuration only -----------------------------------------------------------------------------------------

export interface StreamInput { sourceLabel?: string; subtitle?: string; syncEveryMinutes?: number; keywords?: string; clientScope?: string }
export type WriteResult<T> = { ok: true; value: T } | { ok: false; denied: boolean; error: string };

async function write<T>(url: string, method: "POST" | "PATCH", body: unknown, map: (raw: Record<string, unknown>) => T): Promise<WriteResult<T>> {
  try {
    const res = await fetch(url, { method, headers: { accept: "application/json", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const raw: unknown = await res.json().catch(() => null);
    if (res.ok && isObj(raw)) return { ok: true, value: map(raw) };
    const error = isObj(raw) && typeof raw.error === "string" ? raw.error : "That didn't save. Nothing has changed.";
    return { ok: false, denied: res.status === 403 || res.status === 404, error };
  } catch {
    return { ok: false, denied: false, error: "Couldn't reach the server. Nothing has changed." };
  }
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/mkt/streams`;
export const createStream = (orgId: number | string, input: StreamInput) => write(base(orgId), "POST", input, parseStream);
export const configureStream = (orgId: number | string, id: number, input: StreamInput) => write(`${base(orgId)}/${id}`, "PATCH", input, parseStream);
export const pauseStream = (orgId: number | string, id: number) => write(`${base(orgId)}/${id}/pause`, "POST", undefined, parseStream);
export const resumeStream = (orgId: number | string, id: number) => write(`${base(orgId)}/${id}/resume`, "POST", undefined, parseStream);
export const updateRule = (orgId: number | string, key: RuleKey, input: { enabled?: boolean; value?: string }) =>
  write(`${base(orgId)}/rules/${key}`, "PATCH", input, (r): RuleRow => ({ key: (RULE_KEYS as string[]).includes(str(r.key)) ? (str(r.key) as RuleKey) : key, enabled: r.enabled === true, value: strOrNull(r.value) }));

// ---- display helpers -------------------------------------------------------------------------------------------------------------

/** "Every 30 mins", "Every 1 hour", "Every 2 hours". */
export function scheduleLabel(minutes: number): string {
  if (minutes < 60) return `Every ${minutes} min${minutes === 1 ? "" : "s"}`;
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `Every ${h} hour${h === 1 ? "" : "s"}`;
  }
  return `Every ${minutes} mins`;
}

export const SCHEDULE_CHOICES = [15, 30, 60, 120, 240, 720, 1440];

const KEYWORD_BUDGET = 32; // characters of keywords the Keywords / Filters cell shows before "+n"

/** The keywords the cell shows (at least one, as many as fit in the budget) and how many more there are. */
export function keywordSummary(keywords: string[]): { shown: string[]; more: number } {
  const shown: string[] = [];
  let used = 0;
  for (const k of keywords) {
    const next = used + (shown.length ? 2 : 0) + k.length;
    if (shown.length > 0 && next > KEYWORD_BUDGET) break;
    shown.push(k);
    used = next;
  }
  return { shown, more: keywords.length - shown.length };
}

/** "10 mins ago", "1 hour ago", "2 hours ago", "3 days ago"; null (no sync yet) is "Never". */
export function agoText(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Never";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** "Apr 21" from an ISO date (UTC, so the label never slips a day). */
export function dayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Board art served from `public/ent/marketer/streams` (cropped from the approved board). */
const LOGOS: Record<string, string> = {
  "linkedin jobs": "linkedin", linkedin: "linkedin", indeed: "indeed", dice: "dice", ziprecruiter: "zip", "client portal": "portal", "vendor feed": "vendor",
};
export const STREAMS_ART_BASE = "/ent/marketer/streams";
export const logoForStream = (source: string): string | null => (LOGOS[source.trim().toLowerCase()] ? `${STREAMS_ART_BASE}/logo-${LOGOS[source.trim().toLowerCase()]}.png` : null);
export const ASSISTANT_ART = `${STREAMS_ART_BASE}/assistant.png`;
