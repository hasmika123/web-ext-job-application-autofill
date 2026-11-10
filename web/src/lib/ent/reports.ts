/**
 * The Org Admin Reports page (`/w/admin/reports`): the contract of `GET /api/orgs/{orgId}/reports/overview` (through the BFF), a strict parser
 * for it, and the CSV the page offers. Counts and durations only: the API computes every number from the organization's rows, this file never
 * invents one. People appear by display name; there is no money and no email anywhere in a report.
 */

export const RANGES = [30, 90] as const;
export type RangeDays = (typeof RANGES)[number];
export const DEFAULT_RANGE: RangeDays = 30;

export interface Tile {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  unit: "count" | "hours";
}
export interface Slice {
  key: string;
  label: string;
  count: number;
}
export interface StageRow {
  key: string;
  label: string;
  count: number;
  enteredThisWeek: number;
  enteredLastWeek: number;
  deltaPct: number | null;
}
export interface WeekPoint {
  weekStart: string;
  value: number;
  second: number;
}
export interface MonthPoint {
  month: string;
  started: number;
  ended: number;
}
export interface ClientRow {
  name: string;
  activePlacements: number;
}
export interface MarketerRow {
  memberId: number;
  name: string;
  consultants: number;
  openOpportunities: number;
}

export interface Overview {
  orgId: number;
  generatedAt: string;
  rangeDays: number;
  tiles: Tile[];
  roster: { total: number; byMarketingStatus: Slice[]; byAvailability: Slice[] };
  funnel: { total: number; thisWeek: number; lastWeek: number; deltaPct: number | null; stages: StageRow[]; weekly: WeekPoint[] };
  interviews: { scheduled: number; completed: number; cancelled: number; awaitingOutcome: number; upcoming14Days: number; weekly: WeekPoint[] };
  placements: { active: number; startedInRange: number; endedInRange: number; months: MonthPoint[] };
  topClients: ClientRow[];
  marketers: MarketerRow[];
  firstSubmission: { medianHours: number | null; sample: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : []);

const slices = (v: unknown): Slice[] => list(v).map((x) => ({ key: text(x.key), label: text(x.label), count: num(x.count) }));
const weeks = (v: unknown): WeekPoint[] => list(v).map((x) => ({ weekStart: text(x.weekStart), value: num(x.value), second: num(x.second) }));

/** The body as an overview, or null when it is not the contract. */
export function parseOverview(body: unknown): Overview | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !Array.isArray(body.tiles) || !isObj(body.roster) || !isObj(body.funnel) || !isObj(body.interviews) || !isObj(body.placements)) return null;
  const f = body.funnel;
  const i = body.interviews;
  const p = body.placements;
  const fs = isObj(body.firstSubmission) ? body.firstSubmission : {};
  return {
    orgId: body.orgId,
    generatedAt: text(body.generatedAt),
    rangeDays: num(body.rangeDays),
    tiles: list(body.tiles).map((t) => ({ key: text(t.key), label: text(t.label), value: numOrNull(t.value), previous: numOrNull(t.previous), unit: t.unit === "hours" ? "hours" : "count" })),
    roster: { total: num(body.roster.total), byMarketingStatus: slices(body.roster.byMarketingStatus), byAvailability: slices(body.roster.byAvailability) },
    funnel: {
      total: num(f.total),
      thisWeek: num(f.thisWeek),
      lastWeek: num(f.lastWeek),
      deltaPct: numOrNull(f.deltaPct),
      stages: list(f.stages).map((s) => ({ key: text(s.key), label: text(s.label), count: num(s.count), enteredThisWeek: num(s.enteredThisWeek), enteredLastWeek: num(s.enteredLastWeek), deltaPct: numOrNull(s.deltaPct) })),
      weekly: weeks(f.weekly),
    },
    interviews: { scheduled: num(i.scheduled), completed: num(i.completed), cancelled: num(i.cancelled), awaitingOutcome: num(i.awaitingOutcome), upcoming14Days: num(i.upcoming14Days), weekly: weeks(i.weekly) },
    placements: {
      active: num(p.active),
      startedInRange: num(p.startedInRange),
      endedInRange: num(p.endedInRange),
      months: list(p.months).map((m) => ({ month: text(m.month), started: num(m.started), ended: num(m.ended) })),
    },
    topClients: list(body.topClients).map((c) => ({ name: text(c.name), activePlacements: num(c.activePlacements) })),
    marketers: list(body.marketers).map((m) => ({ memberId: num(m.memberId), name: text(m.name), consultants: num(m.consultants), openOpportunities: num(m.openOpportunities) })),
    firstSubmission: { medianHours: numOrNull(fs.medianHours), sample: num(fs.sample) },
  };
}

/** True when the organization has nothing to report yet (no consultants, applications, interviews or placements). */
export function isEmptyOverview(o: Overview): boolean {
  return o.roster.total === 0 && o.funnel.total === 0 && o.interviews.scheduled === 0 && o.placements.active === 0 && o.placements.startedInRange === 0 && o.placements.endedInRange === 0 && o.topClients.length === 0;
}

/* ── formatting ───────────────────────────────────────────────────────────────────────────────────────── */

/** "3.5 hours" / "2.1 days"; a duration under an hour reads in minutes. */
export function durationText(hours: number | null): string {
  if (hours === null) return "No data yet";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${trim(hours)} hours`;
  return `${trim(hours / 24)} days`;
}
const trim = (n: number): string => (Math.round(n * 10) / 10).toString();

export function tileValueText(t: Tile): string {
  if (t.value === null) return "No data yet";
  return t.unit === "hours" ? durationText(t.value) : Math.round(t.value).toLocaleString("en-US");
}

/** "+12%" / "-8%" / "no change"; null when there is nothing to compare. */
export function deltaText(pct: number | null): string | null {
  if (pct === null) return null;
  if (pct === 0) return "no change";
  return `${pct > 0 ? "+" : "-"}${Math.abs(Math.round(pct * 10) / 10)}%`;
}

/** The change of a tile against the period before, as a percentage (null without a comparison or when the earlier figure was 0). */
export function tileDeltaPct(t: Tile): number | null {
  if (t.value === null || t.previous === null || t.previous <= 0) return null;
  return Math.round(((t.value - t.previous) * 1000) / t.previous) / 10;
}

/** "Mar 3" for a `yyyy-mm-dd` week start; "Mar 2026" style month labels for `yyyy-mm`. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function weekLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : iso;
}
export function monthLabel(ym: string): string {
  const [, m] = ym.split("-").map(Number);
  return m ? MONTHS[m - 1] : ym;
}

/* ── CSV ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One CSV cell. A value a spreadsheet would run as a formula (it starts with `=`, `+`, `-`, `@`, a tab or a carriage return) is prefixed with a
 * single quote so it opens as text; quotes, commas and line breaks are quoted. Numbers are written as numbers (a negative number is not a formula).
 */
export function csvCell(v: string | number | null): string {
  if (v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface ReportTable {
  key: string;
  title: string;
  header: string[];
  rows: (string | number | null)[][];
}

/** The report tables of an overview, as the page shows them (and as the CSV carries them). */
export function reportTables(o: Overview): ReportTable[] {
  return [
    { key: "roster-marketing", title: "Consultants by marketing status", header: ["Marketing status", "Consultants"], rows: o.roster.byMarketingStatus.map((s) => [s.label, s.count]) },
    { key: "roster-availability", title: "Consultants by availability", header: ["Availability", "Consultants"], rows: o.roster.byAvailability.map((s) => [s.label, s.count]) },
    {
      key: "funnel",
      title: `Applications by stage (last ${o.rangeDays} days)`,
      header: ["Stage", "Applications", "Entered this week", "Entered last week", "Week over week %"],
      rows: o.funnel.stages.map((s) => [s.label, s.count, s.enteredThisWeek, s.enteredLastWeek, s.deltaPct]),
    },
    { key: "applications-weekly", title: "Applications per week", header: ["Week starting", "Applications"], rows: o.funnel.weekly.map((w) => [w.weekStart, w.value]) },
    { key: "interviews-weekly", title: "Interviews per week", header: ["Week starting", "Scheduled", "Completed"], rows: o.interviews.weekly.map((w) => [w.weekStart, w.value, w.second]) },
    { key: "placements-monthly", title: "Placements started and ended per month", header: ["Month", "Started", "Ended"], rows: o.placements.months.map((m) => [m.month, m.started, m.ended]) },
    { key: "top-clients", title: "Top clients by active placements", header: ["Client", "Active placements"], rows: o.topClients.map((c) => [c.name, c.activePlacements]) },
    { key: "marketers", title: "Marketer workload", header: ["Marketer", "Assigned consultants", "Open opportunities"], rows: o.marketers.map((m) => [m.name, m.consultants, m.openOpportunities]) },
  ];
}

/** Every table in one CSV file: a title row, the header, the rows, a blank line between tables. */
export function overviewCsv(o: Overview): string {
  const out: string[] = [];
  out.push(csvCell(`Reports, last ${o.rangeDays} days`), "");
  for (const t of reportTables(o)) {
    out.push(csvCell(t.title));
    out.push(t.header.map(csvCell).join(","));
    for (const r of t.rows) out.push(r.map(csvCell).join(","));
    out.push("");
  }
  return out.join("\r\n");
}

/* ── the BFF call ─────────────────────────────────────────────────────────────────────────────────────── */

export interface OverviewFetch {
  kind: "OK" | "DENIED" | "FAILED";
  overview?: Overview;
}

export async function fetchOverview(orgId: number | string, range: RangeDays, signal?: AbortSignal): Promise<OverviewFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/reports/overview?range=${range}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const overview = parseOverview(await res.json().catch(() => null));
    return overview ? { kind: "OK", overview } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
