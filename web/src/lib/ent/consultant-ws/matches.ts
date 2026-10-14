/**
 * The Consultant workspace Job Matches page's client logic (design/enterprise-consultant/matches.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/matches` (+ `/{matchId}` detail and the write calls), tolerant parsers and the pure helpers the
 * page uses (sort, filter, relative times, rate text). Nothing here touches React and there is no fallback number: every figure is
 * the API's answer.
 */
import { initialsOf } from "./home";
import { parseJobSource, type JobSource } from "./jobSource";

export interface MatchTile {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
}

export interface MatchRow extends JobSource {
  matchId: number;
  requirementId: number;
  title: string;
  company: string | null;
  location: string | null;
  workMode: string | null;
  employment: string | null;
  score: number;
  /** Share (0-100) of the job's listed skills the consultant has; null when the job lists none. */
  skillFit: number | null;
  postedAt: string | null;
  rateMinMinor: number | null;
  rateMaxMinor: number | null;
  rateUnit: string | null;
  currency: string | null;
  saved: boolean;
  viewed: boolean;
  interestSent: boolean;
}

export interface Check {
  key: string;
  label: string;
  done: boolean;
}

export type AlertKind = "NEW_MATCHES" | "ROLE_UPDATED" | "APPLICATION_UPDATE";

export interface AlertRow {
  key: string;
  kind: AlertKind;
  title: string;
  detail: string;
  at: string;
}

export interface MatchesView {
  orgId: number;
  generatedAt: string;
  name: string;
  tiles: { total: MatchTile; high: MatchTile; fresh: MatchTile; saved: MatchTile; viewed: MatchTile };
  matches: MatchRow[];
  quality: { percent: number; checks: Check[] };
  alerts: AlertRow[];
}

export interface SkillFit {
  skill: string;
  present: boolean;
  primary: boolean;
  percent: number;
}
export interface Bullet {
  key: string;
  text: string;
  ok: boolean;
}
export interface Improvement {
  tag: "GAP" | "SUGGESTED";
  title: string;
  text: string;
}
export interface MatchDetail {
  match: MatchRow;
  reason: string | null;
  skills: SkillFit[];
  explanation: Bullet[];
  improvements: Improvement[];
  interestSentAt: string | null;
  interestNote: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rows = <T,>(v: unknown, f: (o: Record<string, unknown>) => T | null): T[] =>
  arr(v)
    .map((o) => (isObj(o) ? f(o) : null))
    .filter((x): x is T => x !== null);

function tileOf(v: unknown): MatchTile {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: numOrNull(d.previous),
    deltaPct: numOrNull(d.deltaPct),
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
  };
}

export function parseMatchRow(o: unknown): MatchRow | null {
  if (!isObj(o) || typeof o.matchId !== "number" || typeof o.title !== "string") return null;
  return {
    matchId: o.matchId,
    requirementId: num(o.requirementId),
    title: o.title,
    company: strOrNull(o.company),
    location: strOrNull(o.location),
    workMode: strOrNull(o.workMode),
    employment: strOrNull(o.employment),
    score: Math.max(0, Math.min(100, num(o.score))),
    skillFit: numOrNull(o.skillFit) === null ? null : Math.max(0, Math.min(100, num(o.skillFit))),
    postedAt: strOrNull(o.postedAt),
    rateMinMinor: numOrNull(o.rateMinMinor),
    rateMaxMinor: numOrNull(o.rateMaxMinor),
    rateUnit: strOrNull(o.rateUnit),
    currency: strOrNull(o.currency),
    saved: o.saved === true,
    viewed: o.viewed === true,
    interestSent: o.interestSent === true,
    ...parseJobSource(o),
  };
}

const ALERT_KINDS: readonly string[] = ["NEW_MATCHES", "ROLE_UPDATED", "APPLICATION_UPDATE"];

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseMatches(body: unknown): MatchesView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles)) return null;
  const t = body.tiles;
  const q = isObj(body.quality) ? body.quality : {};
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    name: typeof body.name === "string" ? body.name : "",
    tiles: { total: tileOf(t.total), high: tileOf(t.high), fresh: tileOf(t.fresh), saved: tileOf(t.saved), viewed: tileOf(t.viewed) },
    matches: arr(body.matches)
      .map(parseMatchRow)
      .filter((m): m is MatchRow => m !== null),
    quality: {
      percent: Math.max(0, Math.min(100, num(q.percent))),
      checks: rows(q.checks, (o) => (typeof o.key === "string" && typeof o.label === "string" ? { key: o.key, label: o.label, done: o.done === true } : null)),
    },
    alerts: rows(body.alerts, (o) =>
      typeof o.key === "string" && typeof o.title === "string" && typeof o.at === "string" && typeof o.kind === "string" && ALERT_KINDS.includes(o.kind)
        ? { key: o.key, kind: o.kind as AlertKind, title: o.title, detail: typeof o.detail === "string" ? o.detail : "", at: o.at }
        : null,
    ),
  };
}

export function parseDetail(body: unknown): MatchDetail | null {
  if (!isObj(body)) return null;
  const match = parseMatchRow(body.match);
  if (!match) return null;
  return {
    match,
    reason: strOrNull(body.reason),
    skills: rows(body.skills, (o) => (typeof o.skill === "string" ? { skill: o.skill, present: o.present === true, primary: o.primary === true, percent: Math.max(0, Math.min(100, num(o.percent))) } : null)),
    explanation: rows(body.explanation, (o) => (typeof o.key === "string" && typeof o.text === "string" ? { key: o.key, text: o.text, ok: o.ok === true } : null)),
    improvements: rows(body.improvements, (o) =>
      typeof o.title === "string" && typeof o.text === "string" ? { tag: o.tag === "GAP" ? "GAP" : "SUGGESTED", title: o.title, text: o.text } : null,
    ),
    interestSentAt: strOrNull(body.interestSentAt),
    interestNote: strOrNull(body.interestNote),
  };
}

/* ── sort, filter, compare ────────────────────────────────────────────────────────────── */

export type SortKey = "score" | "newest" | "rate";
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Match Score" },
  { key: "newest", label: "Newest" },
  { key: "rate", label: "Rate" },
];

/** Yearly-equivalent top of the pay range, to rank different units against each other; null when the job lists no rate. */
export function rateRank(m: Pick<MatchRow, "rateMinMinor" | "rateMaxMinor" | "rateUnit">): number | null {
  const top = m.rateMaxMinor ?? m.rateMinMinor;
  if (top === null) return null;
  const unit = (m.rateUnit ?? "HOUR").toUpperCase();
  const f = unit === "YEAR" || unit === "ANNUAL" ? 1 : unit === "MONTH" ? 12 : unit === "WEEK" ? 52 : unit === "DAY" ? 260 : 2080;
  return top * f;
}

const time = (iso: string | null): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** A new array; ties break on score then title so the order never jumps. */
export function sortMatches(list: MatchRow[], key: SortKey): MatchRow[] {
  const byScore = (a: MatchRow, b: MatchRow) => b.score - a.score || a.title.localeCompare(b.title);
  const copy = [...list];
  if (key === "newest") return copy.sort((a, b) => time(b.postedAt) - time(a.postedAt) || byScore(a, b));
  if (key === "rate")
    return copy.sort((a, b) => {
      const ra = rateRank(a);
      const rb = rateRank(b);
      if (ra === null && rb === null) return byScore(a, b);
      if (ra === null) return 1;
      if (rb === null) return -1;
      return rb - ra || byScore(a, b);
    });
  return copy.sort(byScore);
}

export interface Filters {
  minScore: number; // 0 = any
  employment: string; // "" = any
  workMode: string; // "" = any
  savedOnly: boolean;
}
export const NO_FILTERS: Filters = { minScore: 0, employment: "", workMode: "", savedOnly: false };

export const activeFilterCount = (f: Filters): number => (f.minScore > 0 ? 1 : 0) + (f.employment ? 1 : 0) + (f.workMode ? 1 : 0) + (f.savedOnly ? 1 : 0);

export function filterMatches(list: MatchRow[], f: Filters): MatchRow[] {
  return list.filter((m) => m.score >= f.minScore && (!f.employment || m.employment === f.employment) && (!f.workMode || m.workMode === f.workMode) && (!f.savedOnly || m.saved));
}

/** The distinct values present in the list, so the filter menu never offers an empty choice. */
export const distinct = (list: MatchRow[], pick: (m: MatchRow) => string | null): string[] => [...new Set(list.map(pick).filter((v): v is string => !!v))].sort();

export const MAX_COMPARE = 3;
/** Toggles a match in the compare set (at most three; a fourth is ignored). */
export function toggleCompare(ids: number[], id: number): number[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return ids.length >= MAX_COMPARE ? ids : [...ids, id];
}

/* ── labels ───────────────────────────────────────────────────────────────────────────── */

/** Skill-fit bar colour: green 80+, amber 50-79, coral below; null (no skills listed) draws no bar. */
export const fitTone = (pct: number): "green" | "amber" | "red" => (pct >= 80 ? "green" : pct >= 50 ? "amber" : "red");

/** The rate as "$85-$95/hr", "$120k/yr", or null when none. */
export function rateText(m: Pick<MatchRow, "rateMinMinor" | "rateMaxMinor" | "rateUnit" | "currency">): string | null {
  const lo = m.rateMinMinor;
  const hi = m.rateMaxMinor;
  if (lo === null && hi === null) return null;
  const unit = (m.rateUnit ?? "HOUR").toUpperCase();
  const suffix = unit === "YEAR" || unit === "ANNUAL" ? "/yr" : unit === "MONTH" ? "/mo" : unit === "WEEK" ? "/wk" : unit === "DAY" ? "/day" : "/hr";
  const sym = (m.currency ?? "USD") === "USD" ? "$" : `${m.currency} `;
  const fmt = (minor: number) => {
    const major = minor / 100;
    return suffix === "/yr" && major >= 1000 ? `${sym}${Math.round(major / 1000)}k` : `${sym}${Math.round(major)}`;
  };
  if (lo !== null && hi !== null && lo !== hi) return `${fmt(lo)}-${fmt(hi).replace(sym, "")}${suffix}`;
  return `${fmt((hi ?? lo) as number)}${suffix}`;
}

/** "Today", "1 day ago", "2 days ago", "3 weeks ago" for the Posted column; "" for no date. */
export function postedAgo(iso: string | null, now: number = Date.now()): string {
  const t = time(iso);
  if (!t) return "";
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** The alert time as on the board: "2h ago", "1d ago", "just now". */
export function alertAgo(iso: string, now: number = Date.now()): string {
  const t = time(iso);
  if (!t) return "";
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export { initialsOf };

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/matches`;

export async function fetchMatches(orgId: number | string, signal?: AbortSignal): Promise<Fetched<MatchesView>> {
  try {
    const res = await fetch(base(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseMatches(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export async function fetchDetail(orgId: number | string, matchId: number, signal?: AbortSignal): Promise<Fetched<MatchDetail>> {
  try {
    const res = await fetch(`${base(orgId)}/${matchId}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseDetail(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export interface WriteResult {
  ok: boolean;
  /** The API's own message for a refusal (for example the sensitive-data one), when it sent one. */
  message?: string;
}

async function write(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null;
    const m = j && typeof j.error === "string" ? j.error : j && typeof j.detail === "string" ? j.detail : undefined;
    return { ok: false, message: m };
  } catch {
    return { ok: false };
  }
}

export const recordView = (orgId: number, matchId: number) => write(`${base(orgId)}/${matchId}/view`, "POST");
export const setSaved = (orgId: number, matchId: number, saved: boolean) => write(`${base(orgId)}/${matchId}/save`, saved ? "PUT" : "DELETE");
export const expressInterest = (orgId: number, matchId: number, note?: string) => write(`${base(orgId)}/${matchId}/interest`, "POST", note ? { note } : {});
