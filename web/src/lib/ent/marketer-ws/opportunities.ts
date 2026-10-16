/**
 * The Opportunities board's data (Marketing workspace, design: Opportunities). One call to `GET /api/orgs/{orgId}/mkt/opportunities`
 * (through the BFF) draws the whole page; every card has an honest empty state. E1: nothing here answers for a consultant or submits
 * for one: "Assign", "Follow Up" and the quick actions only prepare or REQUEST (the consultant answers on their own workspace).
 */

export type KpiKey = "open" | "ready" | "awaiting" | "stale";
export const KPI_KEYS: KpiKey[] = ["open", "ready", "awaiting", "stale"];
export const KPI_TITLES: Record<KpiKey, string> = {
  open: "Open Opportunities",
  ready: "Ready to Assign",
  awaiting: "Awaiting Consultant Review",
  stale: "Stale Opportunities",
};

export type Interest = "VERY_INTERESTED" | "INTERESTED" | "OPEN" | "NOT_INTERESTED" | "NO_RESPONSE";
export const INTERESTS: Interest[] = ["VERY_INTERESTED", "INTERESTED", "OPEN", "NOT_INTERESTED", "NO_RESPONSE"];
export const INTEREST_LABELS: Record<Interest, string> = {
  VERY_INTERESTED: "Very Interested",
  INTERESTED: "Interested",
  OPEN: "Open",
  NOT_INTERESTED: "Not Interested",
  NO_RESPONSE: "No Response",
};
export type ActionKey = "REVIEW" | "ASSIGN" | "FOLLOW_UP" | "COMPARE";
export const ACTION_LABELS: Record<ActionKey, string> = { REVIEW: "Review", ASSIGN: "Assign", FOLLOW_UP: "Follow Up", COMPARE: "Compare" };

export interface Kpi { key: KpiKey; value: number; deltaPct: number | null; sparkline: number[] }
export interface Person { id: number; name: string; avatarUrl: string | null }
export interface Opportunity {
  id: number;
  consultant: Person;
  requirementId: number;
  jobTitle: string;
  location: string;
  clientId: number;
  client: string;
  matchScore: number;
  interest: Interest;
  resumeStatus: "UPDATED" | "NEEDS_UPDATE";
  owner: Person | null;
  nextActionAt: string | null;
  action: ActionKey;
  status: "ASSIGNED" | "SUGGESTED";
  lastActivityAt: string;
  stale: boolean;
  ready: boolean;
  reason: string | null;
}
export interface TopMatch { id: number; jobTitle: string; client: string; location: string; matchScore: number }
export interface Slice { key: Interest; label: string; count: number }
export interface Responses { total: number; days: number; slices: Slice[] }
export interface Activity { id: number; kind: string; consultant: string; text: string; detail: string; at: string }
export interface Option { id: number; name: string }
export interface OpportunitiesView {
  kpis: Kpi[];
  items: Opportunity[];
  total: number;
  page: number;
  size: number;
  topMatches: TopMatch[];
  responses: Responses;
  activity: Activity[];
  filters: { consultants: Option[]; clients: Option[] };
}
/** The consultant's question and the marketer's answer (MKT-41). `awaitingAnswer`: the question is open and the marketer may answer it. */
export interface InfoThread { question: string; answer: string; awaitingAnswer: boolean }
export interface Detail { item: Opportunity; alternatives: Opportunity[]; events: Activity[]; info: InfoThread | null }
export interface JobOption { id: number; title: string; client: string; location: string }
export interface Options { consultants: Option[]; jobs: JobOption[] }

/** The list's filters as the page holds them ("" = none). `days` "" = any time. */
export interface Filters {
  q: string;
  consultantId: string;
  clientId: string;
  interest: string;
  minScore: string;
  days: string;
  stale: boolean;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  responseDays: string;
}
export const DEFAULT_FILTERS: Filters = { q: "", consultantId: "", clientId: "", interest: "", minScore: "", days: "30", stale: false, sort: "recent", dir: "desc", page: 0, responseDays: "30" };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const orNull = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

function person(x: unknown): Person {
  const p = isObj(x) ? x : {};
  return { id: num(p.id), name: str(p.name), avatarUrl: orNull(p.avatarUrl) };
}
const interestOf = (x: unknown): Interest => ((INTERESTS as string[]).includes(str(x)) ? (str(x) as Interest) : "NO_RESPONSE");
const actionOf = (x: unknown): ActionKey => (x === "REVIEW" || x === "ASSIGN" || x === "COMPARE" ? x : "FOLLOW_UP");

export function parseOpportunity(x: unknown): Opportunity | null {
  if (!isObj(x)) return null;
  return {
    id: num(x.id),
    consultant: person(x.consultant),
    requirementId: num(x.requirementId),
    jobTitle: str(x.jobTitle),
    location: str(x.location),
    clientId: num(x.clientId),
    client: str(x.client),
    matchScore: num(x.matchScore),
    interest: interestOf(x.interest),
    resumeStatus: x.resumeStatus === "UPDATED" ? "UPDATED" : "NEEDS_UPDATE",
    owner: isObj(x.owner) ? person(x.owner) : null,
    nextActionAt: orNull(x.nextActionAt),
    action: actionOf(x.action),
    status: x.status === "ASSIGNED" ? "ASSIGNED" : "SUGGESTED",
    lastActivityAt: str(x.lastActivityAt),
    stale: x.stale === true,
    ready: x.ready === true,
    reason: orNull(x.reason),
  };
}
const items = (x: unknown): Opportunity[] => (Array.isArray(x) ? x.map(parseOpportunity).filter((o): o is Opportunity => o !== null) : []);
const activityOf = (x: unknown): Activity[] => arr(x).map((a) => ({ id: num(a.id), kind: str(a.kind), consultant: str(a.consultant), text: str(a.text), detail: str(a.detail), at: str(a.at) }));
const options = (x: unknown): Option[] => arr(x).map((o) => ({ id: num(o.id), name: str(o.name) }));

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseOpportunities(raw: unknown): OpportunitiesView | null {
  if (!isObj(raw)) return null;
  const r = isObj(raw.responses) ? raw.responses : {};
  const f = isObj(raw.filters) ? raw.filters : {};
  return {
    kpis: arr(raw.kpis)
      .filter((k) => (KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({ key: str(k.key) as KpiKey, value: num(k.value), deltaPct: typeof k.deltaPct === "number" && Number.isFinite(k.deltaPct) ? k.deltaPct : null, sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [] })),
    items: items(raw.items),
    total: num(raw.total),
    page: num(raw.page),
    size: num(raw.size, 8),
    topMatches: arr(raw.topMatches).map((t) => ({ id: num(t.id), jobTitle: str(t.jobTitle), client: str(t.client), location: str(t.location), matchScore: num(t.matchScore) })),
    responses: {
      total: num(r.total),
      days: num(r.days, 30),
      slices: arr(r.slices).filter((s) => (INTERESTS as string[]).includes(str(s.key))).map((s) => ({ key: str(s.key) as Interest, label: str(s.label), count: num(s.count) })),
    },
    activity: activityOf(raw.activity),
    filters: { consultants: options(f.consultants), clients: options(f.clients) },
  };
}

export function parseDetail(raw: unknown): Detail | null {
  if (!isObj(raw)) return null;
  const item = parseOpportunity(raw.item);
  const i = isObj(raw.info) && str(raw.info.question) ? raw.info : null;
  const info: InfoThread | null = i ? { question: str(i.question), answer: str(i.answer), awaitingAnswer: i.awaitingAnswer === true } : null;
  return item ? { item, alternatives: items(raw.alternatives), events: activityOf(raw.events), info } : null;
}

export function parseOptions(raw: unknown): Options {
  const o = isObj(raw) ? raw : {};
  return { consultants: options(o.consultants), jobs: arr(o.jobs).map((j) => ({ id: num(j.id), title: str(j.title), client: str(j.client), location: str(j.location) })) };
}

/** The query string of the list and of the CSV export (the same filters; the board filters, never the caller's scope). */
export function queryString(f: Filters, withPaging = true): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.consultantId) p.set("consultantId", f.consultantId);
  if (f.clientId) p.set("clientId", f.clientId);
  if (f.interest) p.set("interest", f.interest);
  if (f.minScore) p.set("minScore", f.minScore);
  p.set("days", f.days === "" ? "0" : f.days);
  if (f.stale) p.set("stale", "true");
  p.set("sort", f.sort);
  p.set("dir", f.dir);
  if (withPaging) {
    p.set("page", String(f.page));
    p.set("responseDays", f.responseDays === "" ? "0" : f.responseDays);
  }
  return p.toString();
}

export const exportUrl = (orgId: number | string, f: Filters): string => `/api/orgs/${orgId}/mkt/opportunities/export?${queryString(f, false)}`;

export type ListFetch = { kind: "OK"; view: OpportunitiesView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchOpportunities(orgId: number | string, f: Filters, signal?: AbortSignal): Promise<ListFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/opportunities?${queryString(f)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseOpportunities(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** Every opportunity that is ready to assign (suggested, resume up to date, job open): the Bulk Assign list. */
export async function fetchReady(orgId: number | string): Promise<Opportunity[] | null> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/opportunities?ready=true&days=0&size=50&sort=score`, { headers: { accept: "application/json" }, cache: "no-store" });
    return res.ok ? (parseOpportunities(await res.json().catch(() => null))?.items ?? null) : null;
  } catch {
    return null;
  }
}

export async function fetchDetail(orgId: number | string, id: number): Promise<Detail | null> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/opportunities/${id}`, { headers: { accept: "application/json" }, cache: "no-store" });
    return res.ok ? parseDetail(await res.json().catch(() => null)) : null;
  } catch {
    return null;
  }
}

export async function fetchOptions(orgId: number | string, q = ""): Promise<Options | null> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/opportunities/options${q ? `?q=${encodeURIComponent(q)}` : ""}`, { headers: { accept: "application/json" }, cache: "no-store" });
    return res.ok ? parseOptions(await res.json().catch(() => null)) : null;
  } catch {
    return null;
  }
}

/** The result of a write: a short sentence for the toast, or the API's error message and code. */
export type ActionOutcome = { ok: true; message: string; changed: boolean; skipped: number } | { ok: false; error: string; code: string | null; status: number };

async function send(orgId: number | string, path: string, method: "POST" | "PATCH", body?: unknown): Promise<ActionOutcome> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/opportunities${path}`, {
      method,
      headers: { accept: "application/json", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    const d = isObj(data) ? data : {};
    if (!res.ok) return { ok: false, error: str(d.error, "That didn't work. Nothing was changed."), code: orNull(d.code), status: res.status };
    return { ok: true, message: str(d.message, "Done."), changed: d.changed !== false, skipped: Array.isArray(d.skipped) ? d.skipped.length : 0 };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Nothing was changed.", code: null, status: 0 };
  }
}

/** E1: every one of these prepares or requests. There is no call that sets a consultant's interest, submits, or acts as them. */
export const assignOpportunity = (orgId: number | string, id: number) => send(orgId, `/${id}/assign`, "POST");
export const bulkAssign = (orgId: number | string, ids: number[]) => send(orgId, "/bulk-assign", "POST", { ids });
export const requestFromConsultant = (orgId: number | string, id: number, kind: "INTEREST" | "RESUME") => send(orgId, `/${id}/request`, "POST", { kind });
export const notifyAwaiting = (orgId: number | string) => send(orgId, "/notify", "POST");
/** Answers the consultant's open question. The consultant's own state never changes: only they move the opportunity on. */
export const answerInfo = (orgId: number | string, id: number, answer: string) => send(orgId, `/${id}/answer-info`, "POST", { answer });
export const reviewOpportunity = (orgId: number | string, id: number) => send(orgId, `/${id}/review`, "POST");
export const setNextAction = (orgId: number | string, id: number, nextActionAt: string | null) => send(orgId, `/${id}/next-action`, "PATCH", { nextActionAt });
export const createOpportunity = (orgId: number | string, consultantId: number, requirementId: number) => send(orgId, "", "POST", { consultantId, requirementId });

/** "Today", "1 day", "3 days" by calendar day; a date in the past is "Overdue"; none is "-". */
export function nextActionText(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "-";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "-";
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(t) - day(new Date(now))) / 86_400_000);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

/** Share of each slice in percent (rounded), 0 when the total is 0. */
export function sharePct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export const matchTone = (pct: number): "green" | "amber" => (pct >= 80 ? "green" : "amber");
