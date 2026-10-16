/**
 * The Organization Dashboard's client logic (X2.17): the wire types of `GET /api/orgs/{orgId}/dashboard` (X2.4; DashboardDTO),
 * a tolerant parser, and the small pure helpers the cards use. Nothing here touches React.
 *
 * The contract the page keeps (docs/enterprise-v2/14 s2):
 *   - a widget absent from `widgets` is simply not drawn (the caller may not see it);
 *   - `ok` carries real data; `empty` says why; `unavailable` (reason NOT_ENABLED + `module`) never carries data and renders an
 *     honest "Available when ... launches" state, never zeros; `error` is one card's inline retry;
 *   - a number is drawn only from `data` of an `ok` widget. There is no fallback value anywhere in this file.
 */

export type WidgetState = "ok" | "empty" | "unavailable" | "error";

export interface StatTileData {
  value: number;
  previous: number | null;
  /** Percent change over `comparedTo`; null when there is no comparison (previous was 0): the tile shows no delta. */
  deltaPct: number | null;
  sparkline: number[];
  comparedTo: string;
  counts: Record<string, number>;
  /** "money": `value` is in minor units of `currency`; otherwise a plain count. */
  unit: "count" | "money";
  currency: string | null;
}

export interface QuickActionItem {
  key: string;
  label: string;
  description: string;
  href: string;
  permission: string;
  /** false renders a "soon" chip and no link. */
  available: boolean;
  soonModule: string | null;
}

export interface AlertItem {
  key: string;
  severity: "danger" | "warn" | "info";
  title: string;
  message: string;
  href: string | null;
  count: number;
  /** When the newest row behind it happened; null when the alert is a standing condition. */
  at: string | null;
}

export interface ActivityItem {
  id: number;
  action: string;
  label: string;
  actorLogin: string | null;
  actorName: string | null;
  targetType: string | null;
  targetLogin: string | null;
  targetName: string | null;
  at: string;
  /** "audit" (the organization's trail) or "application" (an application event). */
  source: string;
  /** What it was about, for example the job title. */
  subject: string | null;
}

export interface TeamData {
  months: string[];
  series: { key: string; label: string; values: number[] }[];
}

export interface PipelineData {
  total: number;
  slices: { key: string; label: string; value: number }[];
}

export interface InvitesData {
  invited: number;
  expiringSoon: number;
  suspended: number;
}

export interface SubscriptionSummaryData {
  orgStatus: string;
  setupFeePaidAt: string | null;
}

export interface DashboardWidget {
  key: string;
  state: WidgetState;
  reason: string | null;
  module: string | null;
  data: unknown;
}

export interface DashboardView {
  orgId: number;
  generatedAt: string;
  widgets: DashboardWidget[];
}

/** The six board tiles, left to right. The first two are real today; the other four are modules that are not built. */
export const TILE_KEYS = ["consultants.total", "employees.active", "applications.active", "interviews.upcoming", "placements", "finance.summary"] as const;
export type TileKey = (typeof TILE_KEYS)[number];

export const TILE_TITLES: Record<TileKey, string> = {
  "consultants.total": "Total Consultants",
  "employees.active": "Active Staff", // staff only (consultants are Total Consultants): the Employees page counts everyone, so "Active Employees" here read 13 beside 15 there
  "applications.active": "Open Applications",
  "interviews.upcoming": "Upcoming Interviews",
  placements: "Active Placements",
  "finance.summary": "Monthly Spend",
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const STATES: readonly string[] = ["ok", "empty", "unavailable", "error"];

/** The body as a view, or null when it is not the contract. Unknown widgets are kept (they are simply never asked for). */
export function parseDashboard(body: unknown): DashboardView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !Array.isArray(body.widgets)) return null;
  const widgets: DashboardWidget[] = [];
  for (const w of body.widgets) {
    if (!isObj(w) || typeof w.key !== "string" || typeof w.state !== "string" || !STATES.includes(w.state)) continue;
    widgets.push({ key: w.key, state: w.state as WidgetState, reason: str(w.reason), module: str(w.module), data: w.data ?? null });
  }
  return { orgId: body.orgId, generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "", widgets };
}

export const widgetOf = (view: DashboardView | null, key: string): DashboardWidget | null => view?.widgets.find((w) => w.key === key) ?? null;

/** A tile's data when it is a real, complete stat tile; otherwise null (and nothing is drawn from it). */
export function statTileOf(w: DashboardWidget | null): StatTileData | null {
  if (!w || w.state !== "ok" || !isObj(w.data) || typeof w.data.value !== "number" || !Number.isFinite(w.data.value)) return null;
  const d = w.data;
  const spark = Array.isArray(d.sparkline) ? d.sparkline.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : [];
  const counts: Record<string, number> = {};
  if (isObj(d.counts)) for (const [k, v] of Object.entries(d.counts)) if (typeof v === "number") counts[k] = v;
  return {
    value: d.value as number, // checked above
    previous: typeof d.previous === "number" ? d.previous : null,
    deltaPct: typeof d.deltaPct === "number" && Number.isFinite(d.deltaPct) ? d.deltaPct : null,
    sparkline: spark,
    comparedTo: typeof d.comparedTo === "string" ? d.comparedTo : "30d",
    counts,
    unit: d.unit === "money" ? "money" : "count",
    currency: str(d.currency),
  };
}

const isObj2 = isObj;

/** The Team Performance chart's rows when `ok` and well formed; null otherwise (nothing is drawn from it). */
export function teamOf(w: DashboardWidget | null): TeamData | null {
  if (!w || w.state !== "ok" || !isObj2(w.data) || !Array.isArray(w.data.months) || !Array.isArray(w.data.series)) return null;
  const months = w.data.months.map(String);
  const series = w.data.series
    .filter((s): s is Record<string, unknown> => isObj2(s) && typeof s.key === "string" && typeof s.label === "string" && Array.isArray(s.values))
    .map((s) => ({ key: s.key as string, label: s.label as string, values: (s.values as unknown[]).map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0)) }));
  return series.length && months.length ? { months, series } : null;
}

/** The donut's slices when `ok` and well formed; the total is the API's, else the sum. */
export function pipelineOf(w: DashboardWidget | null): PipelineData | null {
  if (!w || w.state !== "ok" || !isObj2(w.data) || !Array.isArray(w.data.slices)) return null;
  const slices = w.data.slices
    .filter((s): s is Record<string, unknown> => isObj2(s) && typeof s.key === "string" && typeof s.label === "string" && typeof s.value === "number")
    .map((s) => ({ key: s.key as string, label: s.label as string, value: s.value as number }));
  if (!slices.length) return null;
  const sum = slices.reduce((a, s) => a + s.value, 0);
  return { total: typeof w.data.total === "number" ? w.data.total : sum, slices };
}

/** The last `n` months of the chart (the range select), keeping every series aligned. */
export function lastMonths(t: TeamData, n: number): TeamData {
  const from = Math.max(0, t.months.length - n);
  return { months: t.months.slice(from), series: t.series.map((s) => ({ ...s, values: s.values.slice(from) })) };
}

/** "$328K" style for money in minor units (compact above a thousand), whole units below. Pure. */
export function formatMoney(minor: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD", notation: Math.abs(minor) >= 100_000 ? "compact" : "standard", maximumFractionDigits: Math.abs(minor) >= 100_000 ? 0 : 0 }).format(minor / 100);
  } catch {
    return String(Math.round(minor / 100));
  }
}

/** The tile's headline number as text. */
export const tileValueText = (t: StatTileData): string => (t.unit === "money" ? formatMoney(t.value, t.currency) : t.value.toLocaleString("en-US"));

/** "vs last 30 days" for "30d"; "vs last 7 days"... anything else reads "vs earlier". */
export function comparedToText(comparedTo: string): string {
  const m = /^(\d+)d$/.exec(comparedTo);
  if (!m) return "vs earlier";
  if (Number(m[1]) === 30) return "vs last month";
  return Number(m[1]) === 7 ? "vs last week" : `vs last ${m[1]} days`;
}

/** The delta chip text and direction from the API's own percentage; null (draw nothing) when there is none. */
export function deltaFromPct(pct: number | null): { dir: "up" | "down" | "flat"; text: string } | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct === 0) return { dir: "flat", text: "0%" };
  const abs = Math.abs(pct);
  return { dir: pct > 0 ? "up" : "down", text: `${abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10}%` };
}

function listOf<T>(w: DashboardWidget | null, guard: (x: unknown) => x is T): T[] {
  if (!w || w.state !== "ok" || !isObj(w.data) || !Array.isArray(w.data.items)) return [];
  return w.data.items.filter(guard);
}

export const quickActionsOf = (w: DashboardWidget | null): QuickActionItem[] =>
  listOf(w, (x): x is QuickActionItem => isObj(x) && typeof x.key === "string" && typeof x.label === "string" && typeof x.available === "boolean").map((x) => ({
    ...x,
    description: x.description ?? "",
    soonModule: x.soonModule ?? null,
  }));

const SEVERITY_ORDER = { danger: 0, warn: 1, info: 2 } as const;

/** Alerts, danger first (the API already sorts; this keeps the page right if it ever does not). */
export const alertsOf = (w: DashboardWidget | null): AlertItem[] =>
  listOf(w, (x): x is AlertItem => isObj(x) && typeof x.key === "string" && typeof x.title === "string" && (x.severity === "danger" || x.severity === "warn" || x.severity === "info"))
    .map((x) => ({ ...x, href: x.href ?? null, message: x.message ?? "", count: typeof x.count === "number" ? x.count : 0, at: typeof x.at === "string" ? x.at : null }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

export const activityOf = (w: DashboardWidget | null): ActivityItem[] =>
  listOf(w, (x): x is ActivityItem => isObj(x) && typeof x.label === "string" && typeof x.at === "string" && typeof x.id === "number").map((x) => ({
    ...x,
    source: typeof x.source === "string" ? x.source : "audit",
    subject: typeof x.subject === "string" ? x.subject : null,
  }));

export function invitesOf(w: DashboardWidget | null): InvitesData | null {
  if (!w || w.state !== "ok" || !isObj(w.data)) return null;
  const d = w.data;
  return { invited: Number(d.invited) || 0, expiringSoon: Number(d.expiringSoon) || 0, suspended: Number(d.suspended) || 0 };
}

export function subscriptionOf(w: DashboardWidget | null): SubscriptionSummaryData | null {
  if (!w || w.state !== "ok" || !isObj(w.data) || typeof w.data.orgStatus !== "string") return null;
  return { orgStatus: w.data.orgStatus, setupFeePaidAt: str(w.data.setupFeePaidAt) };
}

/** "applications" -> "Applications"; the module name as the "Available when ... launches" sentence wants it. */
const MODULE_NAMES: Record<string, string> = { hrFinance: "HR and Finance", extensionWorkspaces: "Extension workspaces" };
export function moduleName(module: string | null): string {
  if (!module) return "this module";
  if (MODULE_NAMES[module]) return MODULE_NAMES[module];
  const s = module.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The honest line for an unavailable widget: "Available when Applications launches". */
export const unavailableText = (module: string | null): string => `Available when ${moduleName(module)} launches`;

/** "2 hours ago", "yesterday", "3 days ago", then a short date. Pure (takes `now`). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "1 day ago";
  if (d < 14) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Who did what: "Sarah Chen invited a member"; falls back to the login when the account has no name. */
export function activityText(a: ActivityItem): { who: string; what: string; target: string | null } {
  return { who: a.actorName ?? a.actorLogin ?? "Someone", what: a.label, target: a.subject ?? a.targetName ?? (a.targetLogin ? a.targetLogin : null) };
}

/** Where an activity row leads, by what it touched (never a guess: unknown kinds have no link). */
export function activityHref(a: ActivityItem): string | null {
  if (a.source === "application") return "/w/admin/applications";
  if (/^MEMBER_INVITE/.test(a.action)) return "/w/admin/invitations";
  if (/^(MEMBER|ASSIGNMENT|ROLE)_/.test(a.action)) return "/w/admin/employees";
  if (/^BRANDING_/.test(a.action)) return "/w/admin/branding";
  return null;
}

/** First name for "Welcome back" and "Need help, Sarah?". */
export const firstNameOf = (name: string): string => name.trim().split(/\s+/)[0] || "there";

/* ── the BFF calls (the browser talks to Next, Next to the API) ───────────────────── */

export interface DashboardFetch {
  kind: "OK" | "DENIED" | "FAILED";
  view?: DashboardView;
}

export async function fetchDashboard(orgId: number | string, signal?: AbortSignal): Promise<DashboardFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/dashboard`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseDashboard(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** Hides an alert for the caller for 7 days. `keepalive` lets the request finish while the page is closing. */
export async function dismissAlert(orgId: number | string, key: string, keepalive = false): Promise<boolean> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/dashboard/alerts/${encodeURIComponent(key)}/dismiss`, { method: "POST", keepalive });
    return res.ok;
  } catch {
    return false;
  }
}
