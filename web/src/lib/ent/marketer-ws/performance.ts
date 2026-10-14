/**
 * The Marketing Performance board's data (design: Performance). One call to `GET /api/orgs/{orgId}/mkt/performance` (through the BFF) draws the page;
 * the card periods ride in the query. ASSIGNED scope: only the consultants the marketer is assigned to. A section the API leaves out is an honest
 * empty state, never a made-up row. E1: the page is read-only except the marketer's own monthly targets (numbers recorded, nothing submitted).
 */

export type KpiKey = "assignedConsultants" | "activeSubmissions" | "interviewRate" | "offerRate" | "placements" | "followupCompletion";
export const KPI_KEYS: KpiKey[] = ["assignedConsultants", "activeSubmissions", "interviewRate", "offerRate", "placements", "followupCompletion"];
export const KPI_TITLES: Record<KpiKey, string> = {
  assignedConsultants: "Assigned Consultants",
  activeSubmissions: "Active Submissions",
  interviewRate: "Interview Rate",
  offerRate: "Offer Rate",
  placements: "Placements This Month",
  followupCompletion: "Follow-up Completion",
};
/** The exact formula behind each tile (shown by its info icon). */
export const KPI_INFO: Record<KpiKey, string> = {
  assignedConsultants: "Active consultants assigned to you as marketer or backup. Change vs the same count 30 days ago.",
  activeSubmissions: "Submissions of your consultants that are not closed yet (stage is not Hired or Not Selected). Change vs 30 days ago.",
  interviewRate: "Interviews divided by submissions over the last 30 days. A submission counts as an interview once it reached the Interviewing stage. Change vs the 30 days before.",
  offerRate: "Offers divided by submissions over the last 30 days. A submission counts as an offer once it reached the Offer stage. Change vs the 30 days before.",
  placements: "Placements that started in the last 30 days. Change vs the 30 days before.",
  followupCompletion: "Of the follow-ups that fell due in the last 30 days, the share that is completed. Change vs the 30 days before.",
};

export interface Kpi { key: KpiKey; value: number | null; deltaPct: number | null; sparkline: number[] }
export interface Week { start: string; end: string; submissions: number; interviews: number; offers: number }
export interface WeeklyChart { period: string; weeks: Week[] }
export interface TrendPoint { date: string; submissions: number; interviews: number; offers: number }
export interface Trend { period: string; points: TrendPoint[] }
export interface Stage { key: string; label: string; count: number; pct: number }
export interface Funnel { period: string; total: number; stages: Stage[] }
export type BucketKey = "ready" | "progress" | "attention" | "inactive";
export interface Bucket { key: BucketKey; label: string; count: number; pct: number }
export interface Readiness { total: number; buckets: Bucket[] }
export interface StreamRow { clientId: number; client: string; submissions: number; interviews: number; offers: number; placements: number; offerRatePct: number | null; good: boolean }
export interface Streams { period: string; rows: StreamRow[] }
export interface TopConsultant {
  rank: number; id: number; name: string; avatarUrl: string | null; submissions: number; interviews: number; offers: number; placements: number;
  matchRatePct: number | null; lastActivityAt: string | null; trend: number[];
}
export interface BenchmarkRow { key: "interviewRate" | "offerRate" | "placementRate"; label: string; value: number | null; deltaPct: number | null; industry: number | null }
export interface Benchmarks { period: string; rows: BenchmarkRow[] }
export type GoalKey = "submissions" | "interviews" | "offers" | "placements";
export interface GoalRow { key: GoalKey; label: string; actual: number; target: number | null; pct: number | null }
export interface Goals { period: string; rows: GoalRow[]; canEdit: boolean }
export interface Action { key: string; text: string; detail: string | null; page: string }

export interface PerformanceView {
  generatedAt: string;
  kpis: Kpi[];
  weekly: WeeklyChart | null;
  trend: Trend | null;
  funnel: Funnel | null;
  readiness: Readiness | null;
  streams: Streams | null;
  top: TopConsultant[];
  benchmarks: Benchmarks | null;
  goals: Goals | null;
  actions: Action[];
}

/** What the page asks for: one period per card that has a select. */
export interface PerformanceQuery { weeks: string; trend: string; funnel: string; streams: string; benchmarks: string; goals: string }
export const DEFAULT_QUERY: PerformanceQuery = { weeks: "8w", trend: "3m", funnel: "3m", streams: "3m", benchmarks: "month", goals: "month" };
export const WEEK_PERIODS = [{ value: "4w", label: "Last 4 Weeks" }, { value: "8w", label: "Last 8 Weeks" }, { value: "12w", label: "Last 12 Weeks" }];
export const MONTH_PERIODS = [{ value: "1m", label: "Last Month" }, { value: "3m", label: "Last 3 Months" }, { value: "6m", label: "Last 6 Months" }];
export const THIS_MONTH_PERIODS = [{ value: "month", label: "This Month" }, { value: "lastMonth", label: "Last Month" }];

export function queryString(q: PerformanceQuery): string {
  const p = new URLSearchParams();
  (Object.keys(q) as (keyof PerformanceQuery)[]).forEach((k) => {
    if (q[k] !== DEFAULT_QUERY[k]) p.set(k, q[k]);
  });
  return p.toString();
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const strOrNull = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const nums = (x: unknown): number[] => (Array.isArray(x) ? x.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : []);

const BUCKETS: BucketKey[] = ["ready", "progress", "attention", "inactive"];
const GOALS: GoalKey[] = ["submissions", "interviews", "offers", "placements"];

/** Lenient: a malformed section becomes empty/null, a malformed document becomes null (the page shows "couldn't load"). */
export function parsePerformance(raw: unknown): PerformanceView | null {
  if (!isObj(raw)) return null;
  const w = raw.weekly;
  const t = raw.trend;
  const f = raw.funnel;
  const r = raw.readiness;
  const s = raw.streams;
  const b = raw.benchmarks;
  const g = raw.goals;
  return {
    generatedAt: str(raw.generatedAt),
    kpis: arr(raw.kpis)
      .filter((k) => (KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({ key: str(k.key) as KpiKey, value: numOrNull(k.value), deltaPct: numOrNull(k.deltaPct), sparkline: nums(k.sparkline) })),
    weekly: isObj(w) ? { period: str(w.period), weeks: arr(w.weeks).map((x) => ({ start: str(x.start), end: str(x.end), submissions: num(x.submissions), interviews: num(x.interviews), offers: num(x.offers) })) } : null,
    trend: isObj(t) ? { period: str(t.period), points: arr(t.points).map((x) => ({ date: str(x.date), submissions: num(x.submissions), interviews: num(x.interviews), offers: num(x.offers) })) } : null,
    funnel: isObj(f) ? { period: str(f.period), total: num(f.total), stages: arr(f.stages).map((x) => ({ key: str(x.key), label: str(x.label), count: num(x.count), pct: num(x.pct) })) } : null,
    readiness: isObj(r)
      ? { total: num(r.total), buckets: arr(r.buckets).filter((x) => (BUCKETS as string[]).includes(str(x.key))).map((x) => ({ key: str(x.key) as BucketKey, label: str(x.label), count: num(x.count), pct: num(x.pct) })) }
      : null,
    streams: isObj(s)
      ? {
          period: str(s.period),
          rows: arr(s.rows).map((x) => ({
            clientId: num(x.clientId), client: str(x.client), submissions: num(x.submissions), interviews: num(x.interviews), offers: num(x.offers), placements: num(x.placements),
            offerRatePct: numOrNull(x.offerRatePct), good: x.good === true,
          })),
        }
      : null,
    top: arr(raw.top).map((x, i) => ({
      rank: num(x.rank, i + 1), id: num(x.id), name: str(x.name), avatarUrl: strOrNull(x.avatarUrl), submissions: num(x.submissions), interviews: num(x.interviews), offers: num(x.offers),
      placements: num(x.placements), matchRatePct: numOrNull(x.matchRatePct), lastActivityAt: strOrNull(x.lastActivityAt), trend: nums(x.trend),
    })),
    benchmarks: isObj(b)
      ? {
          period: str(b.period),
          rows: arr(b.rows)
            .filter((x) => ["interviewRate", "offerRate", "placementRate"].includes(str(x.key)))
            .map((x) => ({ key: str(x.key) as BenchmarkRow["key"], label: str(x.label), value: numOrNull(x.value), deltaPct: numOrNull(x.deltaPct), industry: numOrNull(x.industry) })),
        }
      : null,
    goals: isObj(g)
      ? {
          period: str(g.period),
          canEdit: g.canEdit === true,
          rows: arr(g.rows).filter((x) => (GOALS as string[]).includes(str(x.key))).map((x) => ({ key: str(x.key) as GoalKey, label: str(x.label), actual: num(x.actual), target: numOrNull(x.target), pct: numOrNull(x.pct) })),
        }
      : null,
    actions: arr(raw.actions).map((x) => ({ key: str(x.key), text: str(x.text), detail: strOrNull(x.detail), page: str(x.page) })),
  };
}

export type PerformanceFetch = { kind: "OK"; view: PerformanceView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchPerformance(orgId: number | string, query: PerformanceQuery = DEFAULT_QUERY, signal?: AbortSignal): Promise<PerformanceFetch> {
  try {
    const qs = queryString(query);
    const res = await fetch(`/api/orgs/${orgId}/mkt/performance${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parsePerformance(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** The marketer's own monthly targets. A metric left out (undefined) stays as it is. Records numbers only (E1). */
export type GoalTargets = Partial<Record<GoalKey, number>>;
export type SaveGoalsResult = { ok: true; goals: Goals | null } | { ok: false; denied: boolean; message: string };

export async function saveGoals(orgId: number | string, targets: GoalTargets): Promise<SaveGoalsResult> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/performance/goals`, {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(targets),
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 404) return { ok: false, denied: true, message: "You can't change these targets." };
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const msg = isObj(body) && typeof body.message === "string" ? body.message : isObj(body) && typeof body.error === "string" ? body.error : "";
      return { ok: false, denied: false, message: msg || "The targets weren't saved." };
    }
    const body: unknown = await res.json().catch(() => null);
    const parsed = isObj(body) ? parsePerformance({ goals: body })?.goals ?? null : null;
    return { ok: true, goals: parsed };
  } catch {
    return { ok: false, denied: false, message: "The targets weren't saved." };
  }
}

// ---- small view helpers -----------------------------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 26" from a yyyy-mm-dd date; empty when it isn't one. */
export function shortDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[3])}` : "";
}

/** The two lines under a week's bars: its first and last day ("Aug 26" / "Sep 1"). */
export function weekLines(w: Week): [string, string] {
  return [shortDay(w.start), shortDay(w.end)];
}

/** x labels of the trend line: the month name on the first point of each month, nothing elsewhere. */
export function monthLabels(points: TrendPoint[]): string[] {
  let last = "";
  return points.map((p) => {
    const m = /^\d{4}-(\d{2})/.exec(p.date)?.[1] ?? "";
    if (!m || m === last) return "";
    last = m;
    return MONTHS[Number(m) - 1] ?? "";
  });
}

export const percentText = (v: number | null): string => (v === null ? "-" : `${Math.round(v * 10) / 10}%`);
export const rateText = (v: number | null): string => (v === null ? "-" : `${Math.round(v)}%`);

/** Match Rate chip colour: green from 80%, amber below. */
export const matchTone = (pct: number | null): "green" | "amber" | "none" => (pct === null ? "none" : pct >= 80 ? "green" : "amber");

/** Board art cropped from the approved Performance board (`public/ent/marketer/performance`). A real `avatarUrl` from the API always wins. */
export const ART_BASE = "/ent/marketer/performance";
export const BANNER = `${ART_BASE}/banner.png`;
const PEOPLE: Record<string, string> = { "alex morgan": "alex-morgan", "priya sharma": "priya-sharma", "michael park": "michael-park", "emily lawson": "emily-lawson", "david kim": "david-kim" };
export const photoFor = (name: string, url: string | null): string | null => url ?? (PEOPLE[name.trim().toLowerCase()] ? `${ART_BASE}/${PEOPLE[name.trim().toLowerCase()]}.png` : null);
