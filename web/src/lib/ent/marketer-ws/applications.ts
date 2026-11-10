/**
 * The Marketing > Applications board's data (design: Applications). One call to `GET /api/orgs/{orgId}/mkt/applications` (through the
 * BFF) draws the whole page. Scope (ASSIGNED consultants) and consent are decided by the API: a detail the consultant has not shared
 * arrives as null and the row says `consent: "SUMMARY"`. The stage names mirror the API's one stage map (MktApplicationStages):
 * Applied = ASSIGNED + SUBMITTED, Awaiting Response = UNDER_REVIEW, Interviewing, Offer, Hired = CLOSED/HIRED, Not Selected = the
 * other CLOSED reasons. E1: the writes below are RECORDS (a note, a next action, a follow-up done, a stage the consultant reached);
 * nothing here submits an application or acts as a consultant.
 */

export type StageKey = "applied" | "awaiting" | "interviewing" | "offer" | "hired" | "not_selected";
export const STAGE_KEYS: StageKey[] = ["applied", "awaiting", "interviewing", "offer", "hired", "not_selected"];
export const STAGE_LABELS: Record<StageKey, string> = {
  applied: "Applied",
  awaiting: "Awaiting response",
  interviewing: "Interviewing",
  offer: "Offer",
  hired: "Hired",
  not_selected: "Not selected",
};
export type Consent = "FULL" | "SUMMARY";
export type DotTone = "blue" | "violet" | "amber" | "green" | "red";

export type KpiKey = "active" | "awaiting" | "interviewing" | "offers";
export const KPI_KEYS: KpiKey[] = ["active", "awaiting", "interviewing", "offers"];
export const KPI_TITLES: Record<KpiKey, string> = { active: "Active applications", awaiting: "Awaiting response", interviewing: "Interviewing", offers: "Offers" };

export interface Kpi { key: KpiKey; value: number; deltaPct: number | null; sparkline: number[] }
export interface Person { id: number | null; name: string; avatarUrl: string | null }
export interface ConsultantRef { id: number; name: string; avatarUrl: string | null; consent: Consent }
import type { ChangeActor } from "@/lib/actors";

export interface Row {
  id: number;
  code: string | null;
  consultant: ConsultantRef;
  role: string | null;
  client: string | null;
  source: string | null;
  appliedOn: string | null;
  stage: { key: StageKey; label: string };
  owner: Person | null;
  nextAction: string | null;
  nextActionDue: string | null;
  /** Change audit: null below FULL consent (only stage movements are shared there). */
  updatedAt?: string | null;
  updatedBy?: ChangeActor | null;
}
export interface Tab { key: "all" | StageKey; label: string; count: number }
export interface Option { id: number; name: string }
export interface Tracker { items: Row[]; total: number; page: number; size: number; tabs: Tab[]; filters: { consultants: Option[]; clients: Option[] }; notShared: number }
export interface FunnelStage { key: string; label: string; count: number; pct: number }
export interface Funnel { period: string; total: number; stages: FunnelStage[] }
export interface Overdue { id: number; consultant: ConsultantRef; title: string; sub: string; daysOverdue: number }
export interface Update { id: number; applicationId: number; consultant: ConsultantRef; text: string; detail: string | null; at: string; tone: DotTone }

export interface ApplicationsView {
  kpis: Kpi[];
  tracker: Tracker;
  funnel: Funnel;
  overdue: Overdue[];
  overdueTotal: number;
  updates: Update[];
  perms: { followups: boolean; record: boolean };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const strOrNull = (x: unknown): string | null => (typeof x === "string" ? x : null);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const stageKey = (x: unknown): StageKey => (STAGE_KEYS as string[]).includes(str(x)) ? (str(x) as StageKey) : "applied";
const tone = (x: unknown): DotTone => (x === "violet" || x === "amber" || x === "green" || x === "red" ? x : "blue");

const consultant = (x: unknown): ConsultantRef => {
  const c = isObj(x) ? x : {};
  return { id: num(c.id), name: str(c.name), avatarUrl: strOrNull(c.avatarUrl), consent: c.consent === "SUMMARY" ? "SUMMARY" : "FULL" };
};
const person = (x: unknown): Person | null => (isObj(x) ? { id: typeof x.id === "number" ? x.id : null, name: str(x.name), avatarUrl: strOrNull(x.avatarUrl) } : null);

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseApplications(raw: unknown): ApplicationsView | null {
  if (!isObj(raw)) return null;
  const t = isObj(raw.tracker) ? raw.tracker : {};
  const f = isObj(t.filters) ? t.filters : {};
  const fu = isObj(raw.funnel) ? raw.funnel : {};
  const p = isObj(raw.perms) ? raw.perms : {};
  const options = (x: unknown): Option[] => arr(x).map((o) => ({ id: num(o.id), name: str(o.name) }));
  return {
    kpis: arr(raw.kpis)
      .filter((k) => (KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({ key: str(k.key) as KpiKey, value: num(k.value), deltaPct: typeof k.deltaPct === "number" && Number.isFinite(k.deltaPct) ? k.deltaPct : null, sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [] })),
    tracker: {
      items: arr(t.items).map((r) => {
        const s = isObj(r.stage) ? r.stage : {};
        const key = stageKey(s.key);
        return { id: num(r.id), code: strOrNull(r.code), consultant: consultant(r.consultant), role: strOrNull(r.role), client: strOrNull(r.client), source: strOrNull(r.source), appliedOn: strOrNull(r.appliedOn), stage: { key, label: str(s.label, STAGE_LABELS[key]) }, owner: person(r.owner), nextAction: strOrNull(r.nextAction), nextActionDue: strOrNull(r.nextActionDue) } satisfies Row;
      }),
      total: num(t.total),
      page: num(t.page),
      size: num(t.size, 8),
      tabs: arr(t.tabs).map((x) => ({ key: (str(x.key) === "all" ? "all" : stageKey(x.key)) as Tab["key"], label: str(x.label), count: num(x.count) })),
      filters: { consultants: options(f.consultants), clients: options(f.clients) },
      notShared: num(t.notShared),
    },
    funnel: { period: str(fu.period, "3m"), total: num(fu.total), stages: arr(fu.stages).map((s) => ({ key: str(s.key), label: str(s.label), count: num(s.count), pct: num(s.pct) })) },
    overdue: arr(raw.overdue).map((o) => ({ id: num(o.id), consultant: consultant(o.consultant), title: str(o.title), sub: str(o.sub), daysOverdue: num(o.daysOverdue) })),
    overdueTotal: num(raw.overdueTotal),
    updates: arr(raw.updates).map((u) => ({ id: num(u.id), applicationId: num(u.applicationId), consultant: consultant(u.consultant), text: str(u.text), detail: strOrNull(u.detail), at: str(u.at), tone: tone(u.tone) })),
    perms: { followups: p.followups === true, record: p.record === true },
  };
}

export type Period = "1m" | "3m" | "6m" | "12m" | "all";
export const PERIODS: { value: Period; label: string }[] = [
  { value: "1m", label: "Last month" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

export interface BoardQuery {
  q: string;
  consultantId: string;
  clientId: string;
  stage: "all" | StageKey;
  period: Period;
  funnelPeriod: Period;
  sort: "appliedOn,desc" | "appliedOn,asc";
  page: number;
  size: number;
}
export const DEFAULT_QUERY: BoardQuery = { q: "", consultantId: "", clientId: "", stage: "all", period: "3m", funnelPeriod: "3m", sort: "appliedOn,desc", page: 0, size: 8 };

export function queryString(q: BoardQuery): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.consultantId) p.set("consultantId", q.consultantId);
  if (q.clientId) p.set("clientId", q.clientId);
  if (q.stage !== "all") p.set("stage", q.stage);
  p.set("period", q.period);
  p.set("funnelPeriod", q.funnelPeriod);
  p.set("sort", q.sort);
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p.toString();
}

export type ApplicationsFetch = { kind: "OK"; view: ApplicationsView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchApplications(orgId: number | string, query: BoardQuery, signal?: AbortSignal): Promise<ApplicationsFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/applications?${queryString(query)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseApplications(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** The four records a marketer may write. Each answers the updated row or an error message to show. */
export type WriteResult = { ok: true; row: Row | null } | { ok: false; denied: boolean; message: string };

async function write(orgId: number | string, id: number, path: string, method: "POST" | "PATCH", body?: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/applications/${id}/${path}`, {
      method,
      headers: { accept: "application/json", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 404) return { ok: false, denied: true, message: "This application isn't available to you." };
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, denied: false, message: isObj(json) && typeof json.error === "string" && json.error ? json.error : "That didn't save. Nothing has changed." };
    const parsed = parseApplications({ tracker: { items: [json] } });
    return { ok: true, row: parsed?.tracker.items[0] ?? null };
  } catch {
    return { ok: false, denied: false, message: "That didn't save. Nothing has changed." };
  }
}

export const addNote = (orgId: number | string, id: number, body: string) => write(orgId, id, "notes", "POST", { body });
export const setNextAction = (orgId: number | string, id: number, nextAction: string, dueDate: string | null) => write(orgId, id, "next-action", "PATCH", { nextAction, dueDate });
export const markFollowUpDone = (orgId: number | string, id: number) => write(orgId, id, "follow-up-done", "POST");
export const recordStage = (orgId: number | string, id: number, stage: StageKey, reason?: string) => write(orgId, id, "stage", "POST", { stage, reason: reason ?? null });

/** Whole days from `due` (a yyyy-mm-dd date) to `today`; positive = overdue. */
export function daysOverdue(due: string, today: Date = new Date()): number {
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t.getTime() - d.getTime()) / 86_400_000);
}

/** "Apr 12, 2024" from a yyyy-mm-dd date; empty when it isn't one. */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
/** "Apr 18" (the due date under a next action). */
export function dueDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
/** "3 days" / "1 day" (the red count in Overdue Actions). */
export const daysText = (n: number): string => `${n} ${n === 1 ? "day" : "days"}`;

/** Board art served from `public/ent/marketer/applications` (cropped from the approved board). The API's own `avatarUrl` always wins; the mock sends the photo paths. */
export const ART_BASE = "/ent/marketer/applications";
export const BANNER = `${ART_BASE}/banner.png`;
const LOGOS: Record<string, string> = {
  linkedin: "linkedin", "linkedin jobs": "linkedin", "client portal": "portal", dice: "dice", ziprecruiter: "zip", indeed: "indeed", referral: "referral", "company website": "website",
};
export const logoFor = (source: string): string | null => (LOGOS[source.trim().toLowerCase()] ? `${ART_BASE}/logo-${LOGOS[source.trim().toLowerCase()]}.png` : null);
