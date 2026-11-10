/**
 * The Job Matches board's data (design: Job Matches). One call to `GET /api/orgs/{orgId}/mkt/matches` (through the BFF) draws the
 * whole page (KPIs, filters, the table page, Top Matches Today, the explanation of the selected row). It is ASSIGNED-scope: only the
 * consultants the marketer is assigned to. A section the API leaves out is an honest empty state, never a made-up row.
 * E1: Assign records that the marketer put a match forward; nothing here submits anything for a consultant.
 */

import { ASSIGNMENT_CAP, DUPLICATE_BLOCKED, DUPLICATE_WARNING, confirmFields, findingsOf, plainRefusal, type DuplicateConfirm, type DuplicateFinding } from "./duplicate";

export type MatchKpiKey = "matched" | "highConfidence" | "ready" | "stale";
export const MATCH_KPI_KEYS: MatchKpiKey[] = ["matched", "highConfidence", "ready", "stale"];
export const MATCH_KPI_TITLES: Record<MatchKpiKey, string> = {
  matched: "Matched openings",
  highConfidence: "High-Confidence Matches",
  ready: "Consultant-Ready Matches",
  stale: "Stale Matches (7+ days)",
};

export interface MatchKpi { key: MatchKpiKey; value: number; deltaPct: number | null; sparkline: number[] }
export interface Option { key: string; label: string }
export interface MatchFilters { consultants: Option[]; skills: string[]; clients: Option[]; scores: Option[] }
export type FitTone = "green" | "blue" | "amber" | "red";
export interface Availability { key: string; label: string; tone: FitTone; pct: number }
export interface ResumeUpdate { needed: boolean; reasons: string[] }
export type MatchStatus = "SUGGESTED" | "ASSIGNED" | "DISMISSED";

export interface MatchRow {
  id: number;
  consultantId: number;
  consultantName: string;
  avatarUrl: string | null;
  consultantRole: string;
  primarySkill: string;
  requirementId: number;
  jobTitle: string;
  clientId: number;
  client: string;
  score: number;
  status: MatchStatus;
  stale: boolean;
  highConfidence: boolean;
  availability: Availability;
  resumeUpdate: ResumeUpdate;
  createdAt: string | null;
}
export interface Tick { key: string; ok: boolean; text: string }
export interface Insight { key: string; label: string; pct: number | null }
export interface MatchDetail {
  row: MatchRow;
  consultant: { id: number; name: string; role: string; avatarUrl: string | null; skills: string[] };
  job: { id: number; title: string; client: string; location: string; skills: string[] };
  ticks: Tick[];
  insights: Insight[];
  missingSkills: string[];
  reason: string;
  assignedAt: string | null;
}
export interface MatchesView {
  kpis: MatchKpi[];
  filters: MatchFilters;
  items: MatchRow[];
  total: number;
  page: number;
  size: number;
  topToday: MatchRow[];
  explanation: MatchDetail | null;
  highConfidenceMin: number;
  staleDays: number;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
const tone = (x: unknown): FitTone => (x === "green" || x === "blue" || x === "amber" || x === "red" ? x : "amber");
const opt = (o: Record<string, unknown>): Option => ({ key: str(o.key), label: str(o.label) });

export function parseRow(raw: unknown): MatchRow | null {
  if (!isObj(raw) || typeof raw.id !== "number") return null;
  const a = isObj(raw.availability) ? raw.availability : {};
  const r = isObj(raw.resumeUpdate) ? raw.resumeUpdate : {};
  const status = raw.status === "ASSIGNED" || raw.status === "DISMISSED" ? raw.status : "SUGGESTED";
  return {
    id: raw.id,
    consultantId: num(raw.consultantId),
    consultantName: str(raw.consultantName),
    avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
    consultantRole: str(raw.consultantRole),
    primarySkill: str(raw.primarySkill),
    requirementId: num(raw.requirementId),
    jobTitle: str(raw.jobTitle),
    clientId: num(raw.clientId),
    client: str(raw.client),
    score: num(raw.score),
    status,
    stale: raw.stale === true,
    highConfidence: raw.highConfidence === true,
    availability: { key: str(a.key), label: str(a.label), tone: tone(a.tone), pct: num(a.pct) },
    resumeUpdate: { needed: r.needed === true, reasons: strs(r.reasons) },
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : null,
  };
}

export function parseDetail(raw: unknown): MatchDetail | null {
  if (!isObj(raw)) return null;
  const row = parseRow(raw.row);
  if (!row) return null;
  const c = isObj(raw.consultant) ? raw.consultant : {};
  const j = isObj(raw.job) ? raw.job : {};
  return {
    row,
    consultant: { id: num(c.id), name: str(c.name), role: str(c.role), avatarUrl: typeof c.avatarUrl === "string" ? c.avatarUrl : null, skills: strs(c.skills) },
    job: { id: num(j.id), title: str(j.title), client: str(j.client), location: str(j.location), skills: strs(j.skills) },
    ticks: arr(raw.ticks).map((t) => ({ key: str(t.key), ok: t.ok === true, text: str(t.text) })),
    insights: arr(raw.insights).map((i) => ({ key: str(i.key), label: str(i.label), pct: typeof i.pct === "number" && Number.isFinite(i.pct) ? i.pct : null })),
    missingSkills: strs(raw.missingSkills),
    reason: str(raw.reason),
    assignedAt: typeof raw.assignedAt === "string" ? raw.assignedAt : null,
  };
}

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseMatches(raw: unknown): MatchesView | null {
  if (!isObj(raw)) return null;
  const f = isObj(raw.filters) ? raw.filters : {};
  const rows = (x: unknown) => (Array.isArray(x) ? x.map(parseRow).filter((r): r is MatchRow => r !== null) : []);
  return {
    kpis: arr(raw.kpis)
      .filter((k) => (MATCH_KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({
        key: str(k.key) as MatchKpiKey,
        value: num(k.value),
        deltaPct: typeof k.deltaPct === "number" && Number.isFinite(k.deltaPct) ? k.deltaPct : null,
        sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [],
      })),
    filters: { consultants: arr(f.consultants).map(opt), skills: strs(f.skills), clients: arr(f.clients).map(opt), scores: arr(f.scores).map(opt) },
    items: rows(raw.items),
    total: num(raw.total),
    page: num(raw.page),
    size: num(raw.size, 10),
    topToday: rows(raw.topToday),
    explanation: parseDetail(raw.explanation),
    highConfidenceMin: num(raw.highConfidenceMin, 85),
    staleDays: num(raw.staleDays, 7),
  };
}

export interface MatchQuery { page: number; size: number; consultantId: string; skill: string; clientId: string; score: string; selected: number | null; q?: string; sort?: string }
export const EMPTY_QUERY: MatchQuery = { page: 0, size: 10, consultantId: "", skill: "", clientId: "", score: "", selected: null };

export function queryString(q: MatchQuery): string {
  const p = new URLSearchParams();
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  if (q.consultantId) p.set("consultantId", q.consultantId);
  if (q.skill) p.set("skill", q.skill);
  if (q.clientId) p.set("clientId", q.clientId);
  if (q.score) p.set("score", q.score);
  if (q.q) p.set("q", q.q);
  if (q.sort) p.set("sort", q.sort);
  if (q.selected !== null) p.set("selected", String(q.selected));
  return p.toString();
}

export type MatchesFetch = { kind: "OK"; view: MatchesView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchMatches(orgId: number | string, q: MatchQuery, signal?: AbortSignal): Promise<MatchesFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/matches?${queryString(q)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseMatches(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type DetailFetch = { kind: "OK"; detail: MatchDetail } | { kind: "GONE" } | { kind: "FAILED" };

export async function fetchMatchDetail(orgId: number | string, id: number, signal?: AbortSignal): Promise<DetailFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/matches/${id}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "GONE" };
    if (!res.ok) return { kind: "FAILED" };
    const detail = parseDetail(await res.json().catch(() => null));
    return detail ? { kind: "OK", detail } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type CompareFetch = { kind: "OK"; a: MatchDetail; b: MatchDetail } | { kind: "GONE" } | { kind: "FAILED" };

export async function fetchCompare(orgId: number | string, a: number, b: number, signal?: AbortSignal): Promise<CompareFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/matches/compare?a=${a}&b=${b}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "GONE" };
    if (!res.ok) return { kind: "FAILED" };
    const raw: unknown = await res.json().catch(() => null);
    const da = isObj(raw) ? parseDetail(raw.a) : null;
    const db = isObj(raw) ? parseDetail(raw.b) : null;
    return da && db ? { kind: "OK", a: da, b: db } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type MatchAction = "assign" | "dismiss";
/** DUPLICATE: the guard found the same role already in front of this consultant; the marketer may go ahead with a reason (CONFLICT covers a block, the open limit and every other 409). */
export type ActionResult =
  | { kind: "OK"; row: MatchRow }
  | { kind: "DENIED" }
  | { kind: "CONFLICT"; message: string }
  | { kind: "DUPLICATE"; message: string; findings: DuplicateFinding[] }
  | { kind: "FAILED" };

/**
 * Assign / Dismiss record the marketer's decision on a match. Neither submits anything for a consultant (E1). An assign the duplicate guard flagged answers
 * DUPLICATE; send it again with `confirm` (a reason) to go ahead. A block and the open-opportunity limit come back as a plain CONFLICT sentence.
 */
export async function actOnMatch(orgId: number | string, id: number, action: MatchAction, confirm?: DuplicateConfirm): Promise<ActionResult> {
  try {
    const withBody = action === "assign" && confirm;
    const res = await fetch(`/api/orgs/${orgId}/mkt/matches/${id}/${action}`, {
      method: "POST",
      headers: { accept: "application/json", ...(withBody ? { "content-type": "application/json" } : {}) },
      ...(withBody ? { body: JSON.stringify(confirmFields(confirm)) } : {}),
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (res.status === 409) {
      const body: unknown = await res.json().catch(() => null);
      const o = isObj(body) ? body : {};
      const code = typeof o.code === "string" ? o.code : null;
      const error = str(o.error) || str(o.message); // the BFF sends `error`; an older answer sent `message`
      if (code === DUPLICATE_WARNING) return { kind: "DUPLICATE", message: plainRefusal({ code, error }), findings: findingsOf(o.findings) };
      return { kind: "CONFLICT", message: code === DUPLICATE_BLOCKED || code === ASSIGNMENT_CAP ? plainRefusal({ code, error }) : error || "That match changed. Refresh and try again." };
    }
    if (!res.ok) return { kind: "FAILED" };
    const row = parseRow(await res.json().catch(() => null));
    return row ? { kind: "OK", row } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** Board art served from `public/ent/marketer/matches` (cropped from the approved board). A real `avatarUrl` from the API always wins. */
export const MATCHES_ART_BASE = "/ent/marketer/matches";
const PEOPLE = ["alex-morgan", "priya-sharma", "michael-park", "emily-lawson", "david-kim", "sophie-turner", "james-wilson", "anita-desai", "robert-chen", "lisa-gomez"];
export const matchPhoto = (name: string, url: string | null, large = false): string | null => {
  if (url) return url;
  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
  if (!PEOPLE.includes(slug)) return null;
  return `${MATCHES_ART_BASE}/${slug}${large && slug === "alex-morgan" ? "-large" : ""}.png`;
};
export const MATCHES_BANNER = `${MATCHES_ART_BASE}/help-banner.png`;

/** The board draws 82% and up green, 78% and below amber (the same cut as Home's openings). */
export const scoreTone = (score: number): "green" | "amber" => (score >= 80 ? "green" : "amber");
