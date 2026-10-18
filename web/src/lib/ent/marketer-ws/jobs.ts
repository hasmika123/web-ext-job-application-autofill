/**
 * The Job Discovery board's data (design: Job Discovery). One call to `GET /api/orgs/{orgId}/mkt/jobs` (through the BFF) draws the whole
 * page: tiles, the filtered job table, Trending Skills, Top Clients Hiring, Recent Job Alerts, the caller's Saved Searches and the
 * Watched Job Streams. A section the API leaves out is an honest empty state, never a made-up row.
 * E1: "Assign" writes a match RECORD for a consultant in the caller's scope; nothing here submits an application for anyone.
 */

import { confirmFields, findingsOf, type DuplicateConfirm, type DuplicateFinding } from "./duplicate";

export type Priority = "HIGH" | "MEDIUM" | "LOW";
export interface JobClient { id: number; name: string; logoUrl: string | null }
export interface JobRow {
  id: number;
  title: string;
  client: JobClient;
  location: string;
  workMode: string | null;
  rateLabel: string;
  source: string;
  postedAt: string;
  priority: Priority;
  visa: string | null;
  skills: string[];
  status: string;
}
export interface Tile { value: number; deltaPct: number | null; sparkline: number[] }
export interface Kpis { newToday: Tile | null; highMatch: Tile | null; assigned: Tile | null; savedSearches: Tile | null }
export interface TrendingSkill { rank: number; skill: string; openings: number; deltaPct: number | null; barPct: number }
export interface TopClient { id: number; name: string; logoUrl: string | null; openings: number; topSkills: string[]; deltaPct: number | null }
export interface JobAlert { id: string; kind: "CLIENT" | "SEARCH"; text: string; at: string; clientId: number | null; logoUrl: string | null }
export interface Criteria { q: string | null; skills: string[]; location: string | null; workType: string | null; visa: string | null; source: string | null; rateMin: number | null; rateMax: number | null }
export interface SavedSearch { id: number; name: string; criteria: Criteria; newCount: number }
export interface JobStream { clientId: number; name: string; subtitle: string; logoUrl: string | null; newThisWeek: number; status: string }
export interface Facets { skills: string[]; locations: string[]; workTypes: string[]; visas: string[]; sources: string[] }

export interface JobsView {
  kpis: Kpis;
  items: JobRow[];
  total: number;
  page: number;
  size: number;
  canAssign: boolean;
  facets: Facets;
  trendingSkills: TrendingSkill[];
  topClients: TopClient[];
  alerts: JobAlert[];
  savedSearches: SavedSearch[];
  streams: JobStream[];
}

export interface MatchRow { consultantId: number; name: string; score: number; status: string }
export interface JobDetail {
  job: JobRow;
  /** The posting's text: present only when the job is shown at the FULL level. */
  description: string | null;
  /** The marketer's own summary of the job (always theirs to read). */
  summaryNote: string | null;
  employment: string | null; duration: string | null; experienceLevel: string | null; matches: MatchRow[];
}
export interface Candidate { consultantId: number; name: string; title: string | null; availability: string | null; score: number | null; matchStatus: string | null;
  /** Why this consultant cannot be assigned right now ("On a project — marketing paused"); null when they can. */
  pausedReason: string | null;
  /** The organization seat of the consultant (what "Save for a consultant" names); null when they have none. */
  memberId: number | null }
export interface SavedForConsultant { applicationId: number; status: string; alreadySaved: boolean }
export interface AssignResult { matchId: number; requirementId: number; consultantId: number; status: string; score: number; created: boolean }

/** The filter row + search box + sort + page: everything the board asks the API. */
export interface JobFilters {
  q: string;
  skills: string[];
  location: string;
  workType: string;
  visa: string;
  source: string;
  rateMin: string;
  rateMax: string;
  sort: SortKey;
}
export const EMPTY_FILTERS: JobFilters = { q: "", skills: [], location: "", workType: "", visa: "", source: "", rateMin: "", rateMax: "", sort: "posted_desc" };

export type SortKey = "posted_desc" | "posted_asc" | "rate_desc" | "title_asc" | "client_asc";
export const SORTS: { value: SortKey; label: string }[] = [
  { value: "posted_desc", label: "Posted Date (Newest)" },
  { value: "posted_asc", label: "Posted Date (Oldest)" },
  { value: "rate_desc", label: "Rate (High to Low)" },
  { value: "title_asc", label: "Job Title (A-Z)" },
  { value: "client_asc", label: "Client (A-Z)" },
];
export const WORK_TYPE_LABELS: Record<string, string> = { ON_SITE: "On-site", HYBRID: "Hybrid", REMOTE: "Remote" };
export const PRIORITY_LABELS: Record<Priority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
export const PAGE_SIZE = 8;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const strOrNull = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : []);

const parseTile = (x: unknown): Tile | null => (isObj(x) ? { value: num(x.value), deltaPct: numOrNull(x.deltaPct), sparkline: Array.isArray(x.sparkline) ? x.sparkline.filter((n): n is number => typeof n === "number") : [] } : null);
const priority = (x: unknown): Priority => (x === "HIGH" || x === "LOW" ? x : "MEDIUM");

export function parseJob(j: Record<string, unknown>): JobRow {
  const c = isObj(j.client) ? j.client : {};
  return {
    id: num(j.id), title: str(j.title), client: { id: num(c.id), name: str(c.name), logoUrl: strOrNull(c.logoUrl) }, location: str(j.location), workMode: strOrNull(j.workMode),
    rateLabel: str(j.rateLabel, "-"), source: str(j.source), postedAt: str(j.postedAt), priority: priority(j.priority), visa: strOrNull(j.visa), skills: strs(j.skills), status: str(j.status),
  };
}

export function parseCriteria(x: unknown): Criteria {
  const c = isObj(x) ? x : {};
  return { q: strOrNull(c.q), skills: strs(c.skills), location: strOrNull(c.location), workType: strOrNull(c.workType), visa: strOrNull(c.visa), source: strOrNull(c.source), rateMin: numOrNull(c.rateMin), rateMax: numOrNull(c.rateMax) };
}

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseJobs(raw: unknown): JobsView | null {
  if (!isObj(raw)) return null;
  const k = isObj(raw.kpis) ? raw.kpis : {};
  const f = isObj(raw.facets) ? raw.facets : {};
  return {
    kpis: { newToday: parseTile(k.newToday), highMatch: parseTile(k.highMatch), assigned: parseTile(k.assigned), savedSearches: parseTile(k.savedSearches) },
    items: arr(raw.items).map(parseJob),
    total: num(raw.total), page: num(raw.page), size: num(raw.size, PAGE_SIZE), canAssign: raw.canAssign === true,
    facets: { skills: strs(f.skills), locations: strs(f.locations), workTypes: strs(f.workTypes), visas: strs(f.visas), sources: strs(f.sources) },
    trendingSkills: arr(raw.trendingSkills).map((t, i) => ({ rank: num(t.rank, i + 1), skill: str(t.skill), openings: num(t.openings), deltaPct: numOrNull(t.deltaPct), barPct: Math.min(100, Math.max(0, num(t.barPct))) })),
    topClients: arr(raw.topClients).map((t) => ({ id: num(t.id), name: str(t.name), logoUrl: strOrNull(t.logoUrl), openings: num(t.openings), topSkills: strs(t.topSkills), deltaPct: numOrNull(t.deltaPct) })),
    alerts: arr(raw.alerts).map((a) => ({ id: str(a.id), kind: a.kind === "SEARCH" ? "SEARCH" : "CLIENT", text: str(a.text), at: str(a.at), clientId: numOrNull(a.clientId), logoUrl: strOrNull(a.logoUrl) })),
    savedSearches: arr(raw.savedSearches).map((s) => ({ id: num(s.id), name: str(s.name), criteria: parseCriteria(s.criteria), newCount: num(s.newCount) })),
    streams: arr(raw.streams).map((s) => ({ clientId: num(s.clientId), name: str(s.name), subtitle: str(s.subtitle), logoUrl: strOrNull(s.logoUrl), newThisWeek: num(s.newThisWeek), status: str(s.status, "Active") })),
  };
}

export function parseDetail(raw: unknown): JobDetail | null {
  if (!isObj(raw) || !isObj(raw.job)) return null;
  return {
    job: parseJob(raw.job), description: strOrNull(raw.description), summaryNote: strOrNull(raw.summaryNote), employment: strOrNull(raw.employment), duration: strOrNull(raw.duration), experienceLevel: strOrNull(raw.experienceLevel),
    matches: arr(raw.matches).map((m) => ({ consultantId: num(m.consultantId), name: str(m.name), score: num(m.score), status: str(m.status) })),
  };
}

export const parseCandidates = (raw: unknown): Candidate[] =>
  Array.isArray(raw) ? raw.filter(isObj).map((c) => ({ consultantId: num(c.consultantId), name: str(c.name), title: strOrNull(c.title), availability: strOrNull(c.availability), score: numOrNull(c.score), matchStatus: strOrNull(c.matchStatus), pausedReason: strOrNull(c.pausedReason), memberId: numOrNull(c.memberId) })) : [];

/** The query string of the board call. Empty filters are left out. */
export function jobsQuery(f: JobFilters, page: number, size = PAGE_SIZE): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.skills.length) p.set("skills", f.skills.join(","));
  if (f.location) p.set("location", f.location);
  if (f.workType) p.set("workType", f.workType);
  if (f.visa) p.set("visa", f.visa);
  if (f.source) p.set("source", f.source);
  if (f.rateMin.trim()) p.set("rateMin", f.rateMin.trim());
  if (f.rateMax.trim()) p.set("rateMax", f.rateMax.trim());
  if (f.sort !== "posted_desc") p.set("sort", f.sort);
  p.set("page", String(page));
  p.set("size", String(size));
  return p.toString();
}

export function hasFilters(f: JobFilters): boolean {
  return Boolean(f.q.trim() || f.skills.length || f.location || f.workType || f.visa || f.source || f.rateMin.trim() || f.rateMax.trim());
}

/** A saved search put back into the filter row (the sort is kept). */
export function filtersFromCriteria(c: Criteria, sort: SortKey): JobFilters {
  return { q: c.q ?? "", skills: c.skills, location: c.location ?? "", workType: c.workType ?? "", visa: c.visa ?? "", source: c.source ?? "", rateMin: c.rateMin === null ? "" : String(c.rateMin), rateMax: c.rateMax === null ? "" : String(c.rateMax), sort };
}

/** The filter row as the criteria a saved search stores. */
export function criteriaFromFilters(f: JobFilters): Criteria {
  const n = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : null);
  return { q: f.q.trim() || null, skills: f.skills, location: f.location || null, workType: f.workType || null, visa: f.visa || null, source: f.source || null, rateMin: n(f.rateMin), rateMax: n(f.rateMax) };
}

/** "Skills: Java, Spring, AWS | Location: NY" under a saved search's name. */
export function criteriaLine(c: Criteria): string {
  const parts: string[] = [];
  if (c.skills.length) parts.push(`Skills: ${c.skills.join(", ")}`);
  if (c.q) parts.push(`Keywords: ${c.q}`);
  if (c.location) parts.push(`Location: ${c.location}`);
  if (c.workType) parts.push(`Work type: ${WORK_TYPE_LABELS[c.workType] ?? c.workType}`);
  if (c.visa) parts.push(`Visa: ${c.visa}`);
  if (c.source) parts.push(`Source: ${c.source}`);
  if (c.rateMin !== null || c.rateMax !== null) parts.push(`Rate: ${c.rateMin ?? "0"}-${c.rateMax ?? "any"}/hr`);
  return parts.join(" | ");
}

export type JobsFetch = { kind: "OK"; view: JobsView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchJobs(orgId: number | string, query: string, signal?: AbortSignal): Promise<JobsFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/jobs?${query}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseJobs(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** A refused write: the API's sentence and status; `code` and `findings` are set only when the API sent them (a duplicate warning, a block or the open limit). */
export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string; code?: string; findings?: DuplicateFinding[] };

async function call<T>(url: string, init: RequestInit, parse: (raw: unknown) => T | null): Promise<Outcome<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) }, cache: "no-store" });
    const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const error = isObj(body) && typeof body.error === "string" ? body.error : res.status === 404 ? "This isn't available to you." : "That didn't work. Nothing was changed.";
      const code = isObj(body) && typeof body.code === "string" ? body.code : undefined;
      const findings = isObj(body) ? findingsOf(body.findings) : [];
      return { ok: false, status: res.status, error, ...(code ? { code } : {}), ...(findings.length ? { findings } : {}) };
    }
    const value = parse(body);
    return value === null ? { ok: false, status: 502, error: "That didn't work. Nothing was changed." } : { ok: true, value };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Nothing was changed." };
  }
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/mkt/jobs`;
export const fetchJobDetail = (orgId: number | string, jobId: number) => call(`${base(orgId)}/${jobId}`, {}, parseDetail);
export const fetchCandidates = (orgId: number | string, jobId: number, q: string) => call(`${base(orgId)}/${jobId}/candidates${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, {}, parseCandidates);
/** Creates or updates a match RECORD in ASSIGNED for a consultant in the caller's scope. It never submits an application (E1). */
/** A duplicate warning (409 DUPLICATE_WARNING) is answered by sending the same call again with `confirm` (a reason). */
export const assignJob = (orgId: number | string, jobId: number, consultantId: number, confirm?: DuplicateConfirm) =>
  call(`${base(orgId)}/${jobId}/assign`, { method: "POST", body: JSON.stringify({ consultantId, ...confirmFields(confirm) }) }, (raw): AssignResult | null =>
    isObj(raw) ? { matchId: num(raw.matchId), requirementId: num(raw.requirementId), consultantId: num(raw.consultantId), status: str(raw.status), score: num(raw.score), created: raw.created === true } : null,
  );
/**
 * "Save a job for <consultant>": puts the job on the assigned consultant's own tracker as SAVED (X9.12). It never applies, fills or submits (E1); saving the
 * same job twice is the same entry. The consultant is named by the organization seat (`memberId`), as the API route is.
 */
export const saveJobForConsultant = (orgId: number | string, memberId: number, job: JobRow) =>
  call(
    `/api/orgs/${orgId}/consultants/${memberId}/applications/save`,
    { method: "POST", body: JSON.stringify({ company: job.client.name, roleTitle: job.title, location: job.location || null }) },
    (raw): SavedForConsultant | null => (isObj(raw) ? { applicationId: num(raw.applicationId), status: str(raw.status), alreadySaved: raw.alreadySaved === true } : null),
  );
export const saveSearch =(orgId: number | string, name: string, criteria: Criteria) =>
  call(`${base(orgId)}/saved-searches`, { method: "POST", body: JSON.stringify({ name, criteria }) }, (raw): SavedSearch | null => (isObj(raw) ? { id: num(raw.id), name: str(raw.name), criteria: parseCriteria(raw.criteria), newCount: num(raw.newCount) } : null));
export const markSearchSeen = (orgId: number | string, id: number) => call(`${base(orgId)}/saved-searches/${id}/seen`, { method: "POST" }, () => true);
export const deleteSearch = (orgId: number | string, id: number) => call(`${base(orgId)}/saved-searches/${id}`, { method: "DELETE" }, () => true);

/** Board art cropped from the approved board (`public/ent/marketer/jobs`). A real `logoUrl` from the API always wins. */
export const JOBS_ART_BASE = "/ent/marketer/jobs";
export const JOBS_BANNER = `${JOBS_ART_BASE}/banner.png`;
export const SAVED_ART = `${JOBS_ART_BASE}/saved-art.png`;
const SOURCE_LOGOS: Record<string, string> = { "linkedin jobs": "linkedin", linkedin: "linkedin", indeed: "indeed", dice: "dice", ziprecruiter: "zip", "client portal": "portal" };
export const sourceLogo = (source: string): string | null => (SOURCE_LOGOS[source.trim().toLowerCase()] ? `${JOBS_ART_BASE}/source-${SOURCE_LOGOS[source.trim().toLowerCase()]}.png` : null);
