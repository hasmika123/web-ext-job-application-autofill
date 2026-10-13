import { formatMinor } from "@kiwiply/ui";
import type { Tone } from "./home";

/**
 * The Consultant workspace's Job Discovery client logic (design/enterprise-consultant/job-discovery.webp): wire types of
 * `/api/orgs/{orgId}/me-workspace/job-discovery/**`, tolerant parsers, the pure helpers the page uses (filter <-> query string, rate
 * text, match bands, relative time) and the BFF calls. Nothing here touches React.
 *
 * Rules the page keeps:
 *   - every number comes from the API (search runs in the database; there is no client-side filtering of a job dump);
 *   - a match score is the consultant's own `requirement_match.score` (`scoreSource` MATCH) or the share of the job's required skills the
 *     consultant has (SKILLS); a job with neither has no ring, never an invented number;
 *   - Apply never submits anything: the confirm explains what it does and the API says whether a match/application exists.
 */

export interface Filters {
  q: string;
  location: string;
  jobType: string;
  workMode: string;
  experience: string;
  industry: string;
  skill: string;
  clientId: number | null;
  minRateMinor: number | null;
}

export const EMPTY_FILTERS: Filters = { q: "", location: "", jobType: "", workMode: "", experience: "", industry: "", skill: "", clientId: null, minRateMinor: null };

export type Sort = "match" | "newest" | "rate";
export const SORTS: { value: Sort; label: string }[] = [
  { value: "match", label: "Best Match" },
  { value: "newest", label: "Newest" },
  { value: "rate", label: "Rate" },
];

export type Relation = "NONE" | "MATCHED" | "ASSIGNED" | "APPLIED";

export interface Job {
  id: number;
  title: string;
  clientId: number;
  clientName: string | null;
  industry: string | null;
  location: string | null;
  workMode: string | null;
  employment: string | null;
  duration: string | null;
  experience: string | null;
  rateMinMinor: number | null;
  rateMaxMinor: number | null;
  rateUnit: string | null;
  currency: string;
  skills: string[];
  postedAt: string;
  featured: boolean;
  saved: boolean;
  score: number | null;
  scoreSource: "MATCH" | "SKILLS" | null;
  matchedSkills: number;
  totalSkills: number;
  relation: Relation;
  applicationStage: string | null;
}

export interface SearchView {
  total: number;
  page: number;
  size: number;
  sort: Sort;
  items: Job[];
}

export type ApplyStateKey = "CAN_RECORD" | "NEEDS_ASSIGNMENT" | "ALREADY_APPLIED";
export interface ApplyState {
  state: ApplyStateKey;
  message: string;
}
export interface DetailView {
  job: Job;
  description: string | null;
  openPositions: number;
  apply: ApplyState;
}
export interface ApplyResult {
  recorded: boolean;
  state: string;
  message: string;
}

export interface Option {
  value: string;
  label: string;
  count: number | null;
}
export interface FilterOptions {
  jobTypes: Option[];
  experience: Option[];
  workModes: Option[];
  industries: Option[];
  clients: Option[];
  skills: Option[];
}
export type ChipKind = "workMode" | "jobType" | "minRate" | "skill" | "industry";
export interface Chip {
  key: string;
  label: string;
  kind: ChipKind;
  value: string;
  source: "profile" | "market";
}
export interface TrendingSkill {
  skill: string;
  openJobs: number;
  recent: number;
  prior: number;
  changePct: number | null;
}
export interface SavedSearch {
  id: number;
  name: string;
  filters: Filters;
  newResults: number;
  createdAt: string;
  lastViewedAt: string;
}
export interface RecentSearch {
  id: number;
  label: string;
  filters: Filters;
  at: string;
}
export interface OverviewView {
  orgId: number;
  generatedAt: string;
  me: { consultantId: number; name: string };
  openJobs: number;
  filterOptions: FilterOptions;
  recommended: Chip[];
  trending: TrendingSkill[];
  savedSearches: SavedSearch[];
  recentSearches: RecentSearch[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function rows<T>(v: unknown, f: (o: Record<string, unknown>) => T | null): T[] {
  return arr(v)
    .map((o) => (isObj(o) ? f(o) : null))
    .filter((x): x is T => x !== null);
}

const RELATIONS: readonly string[] = ["NONE", "MATCHED", "ASSIGNED", "APPLIED"];
const APPLY_STATES: readonly string[] = ["CAN_RECORD", "NEEDS_ASSIGNMENT", "ALREADY_APPLIED"];
const CHIP_KINDS: readonly string[] = ["workMode", "jobType", "minRate", "skill", "industry"];

export function parseFilters(v: unknown): Filters {
  const o = isObj(v) ? v : {};
  return { q: str(o.q), location: str(o.location), jobType: str(o.jobType), workMode: str(o.workMode), experience: str(o.experience), industry: str(o.industry), skill: str(o.skill), clientId: numOrNull(o.clientId), minRateMinor: numOrNull(o.minRateMinor) };
}

export function parseJob(o: Record<string, unknown>): Job | null {
  if (typeof o.id !== "number" || typeof o.title !== "string") return null;
  return {
    id: o.id,
    title: o.title,
    clientId: num(o.clientId),
    clientName: strOrNull(o.clientName),
    industry: strOrNull(o.industry),
    location: strOrNull(o.location),
    workMode: strOrNull(o.workMode),
    employment: strOrNull(o.employment),
    duration: strOrNull(o.duration),
    experience: strOrNull(o.experience),
    rateMinMinor: numOrNull(o.rateMinMinor),
    rateMaxMinor: numOrNull(o.rateMaxMinor),
    rateUnit: strOrNull(o.rateUnit),
    currency: typeof o.currency === "string" && o.currency.length === 3 ? o.currency : "USD",
    skills: arr(o.skills).filter((s): s is string => typeof s === "string"),
    postedAt: str(o.postedAt),
    featured: o.featured === true,
    saved: o.saved === true,
    score: typeof o.score === "number" && Number.isFinite(o.score) ? Math.max(0, Math.min(100, Math.round(o.score))) : null,
    scoreSource: o.scoreSource === "MATCH" || o.scoreSource === "SKILLS" ? o.scoreSource : null,
    matchedSkills: num(o.matchedSkills),
    totalSkills: num(o.totalSkills),
    relation: (RELATIONS.includes(String(o.relation)) ? o.relation : "NONE") as Relation,
    applicationStage: strOrNull(o.applicationStage),
  };
}

export function parseSearch(body: unknown): SearchView | null {
  if (!isObj(body) || typeof body.total !== "number" || !Array.isArray(body.items)) return null;
  return { total: body.total, page: num(body.page), size: num(body.size, 10), sort: (body.sort === "newest" || body.sort === "rate" ? body.sort : "match") as Sort, items: rows(body.items, parseJob) };
}

function parseApplyState(v: unknown): ApplyState {
  const o = isObj(v) ? v : {};
  return { state: (APPLY_STATES.includes(String(o.state)) ? o.state : "NEEDS_ASSIGNMENT") as ApplyStateKey, message: str(o.message) };
}

export function parseDetail(body: unknown): DetailView | null {
  if (!isObj(body) || !isObj(body.job)) return null;
  const job = parseJob(body.job);
  if (!job) return null;
  return { job, description: strOrNull(body.description), openPositions: num(body.openPositions), apply: parseApplyState(body.apply) };
}

export function parseApplyResult(body: unknown): ApplyResult | null {
  if (!isObj(body) || typeof body.recorded !== "boolean") return null;
  return { recorded: body.recorded, state: str(body.state), message: str(body.message) };
}

const option = (o: Record<string, unknown>): Option | null => (typeof o.value === "string" && typeof o.label === "string" ? { value: o.value, label: o.label, count: numOrNull(o.count) } : null);

function parseSaved(o: Record<string, unknown>): SavedSearch | null {
  return typeof o.id === "number" && typeof o.name === "string" ? { id: o.id, name: o.name, filters: parseFilters(o.filters), newResults: num(o.newResults), createdAt: str(o.createdAt), lastViewedAt: str(o.lastViewedAt) } : null;
}

export function parseSavedSearch(body: unknown): SavedSearch | null {
  return isObj(body) ? parseSaved(body) : null;
}

export function parseOverview(body: unknown): OverviewView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.filterOptions)) return null;
  const f = body.filterOptions;
  const me = isObj(body.me) ? body.me : {};
  return {
    orgId: body.orgId,
    generatedAt: str(body.generatedAt),
    me: { consultantId: num(me.consultantId), name: str(me.name) },
    openJobs: num(body.openJobs),
    filterOptions: { jobTypes: rows(f.jobTypes, option), experience: rows(f.experience, option), workModes: rows(f.workModes, option), industries: rows(f.industries, option), clients: rows(f.clients, option), skills: rows(f.skills, option) },
    recommended: rows(body.recommended, (o) =>
      typeof o.key === "string" && typeof o.label === "string" && typeof o.value === "string" && CHIP_KINDS.includes(String(o.kind))
        ? { key: o.key, label: o.label, kind: o.kind as ChipKind, value: o.value, source: o.source === "profile" ? "profile" : "market" }
        : null,
    ),
    trending: rows(body.trending, (o) =>
      typeof o.skill === "string" ? { skill: o.skill, openJobs: num(o.openJobs), recent: num(o.recent), prior: num(o.prior), changePct: numOrNull(o.changePct) } : null,
    ),
    savedSearches: rows(body.savedSearches, parseSaved),
    recentSearches: rows(body.recentSearches, (o) => (typeof o.id === "number" && typeof o.label === "string" ? { id: o.id, label: o.label, filters: parseFilters(o.filters), at: str(o.at) } : null)),
  };
}

/* ── pure helpers ────────────────────────────────────────────────────────────────── */

/** Query string for `GET /search`: only the filters that are set. */
export function searchQuery(f: Filters, sort: Sort, page: number, size: number, minScore = 0): string {
  const p = new URLSearchParams();
  const set = (k: string, v: string) => v.trim() && p.set(k, v.trim());
  set("q", f.q);
  set("location", f.location);
  set("jobType", f.jobType);
  set("workMode", f.workMode);
  set("experience", f.experience);
  set("industry", f.industry);
  set("skill", f.skill);
  if (f.clientId) p.set("clientId", String(f.clientId));
  if (f.minRateMinor) p.set("minRateMinor", String(f.minRateMinor));
  p.set("sort", sort);
  p.set("page", String(Math.max(0, page)));
  p.set("size", String(size));
  if (minScore > 0) p.set("minScore", String(minScore));
  return p.toString();
}

export const hasFilters = (f: Filters): boolean => countFilters(f) > 0;

/** How many filters (search text included) are set. */
export function countFilters(f: Filters): number {
  return [f.q, f.location, f.jobType, f.workMode, f.experience, f.industry, f.skill].filter((s) => s.trim() !== "").length + (f.clientId ? 1 : 0) + (f.minRateMinor ? 1 : 0);
}

/** A recommended chip as a filter change; applying the chip that is already applied removes it. */
export function applyChip(f: Filters, chip: Chip): Filters {
  const on = isChipOn(f, chip);
  switch (chip.kind) {
    case "workMode":
      return { ...f, workMode: on ? "" : chip.value };
    case "jobType":
      return { ...f, jobType: on ? "" : chip.value };
    case "industry":
      return { ...f, industry: on ? "" : chip.value };
    case "skill":
      return { ...f, skill: on ? "" : chip.value };
    case "minRate": {
      const n = Number(chip.value);
      return { ...f, minRateMinor: on || !Number.isFinite(n) ? null : n };
    }
  }
}

export function isChipOn(f: Filters, chip: Chip): boolean {
  switch (chip.kind) {
    case "workMode":
      return f.workMode === chip.value;
    case "jobType":
      return f.jobType === chip.value;
    case "industry":
      return f.industry === chip.value;
    case "skill":
      return f.skill.toLowerCase() === chip.value.toLowerCase();
    case "minRate":
      return f.minRateMinor === Number(chip.value);
  }
}

/** "$95" / "$95.50" from minor units (a whole-dollar amount drops its ".00"); null when it cannot be formatted. */
export function moneyShort(minor: number, currency: string): string | null {
  const t = formatMinor(minor, currency);
  return t === null ? null : t.replace(/\.00$/, "");
}

const UNIT_SUFFIX: Record<string, string> = { HOUR: "/hr", DAY: "/day", WEEK: "/wk", MONTH: "/mo", YEAR: "/yr" };

/** "$95 - $120/hr"; one bound alone as "From $95/hr" or "Up to $120/hr"; null when the job has no rate. */
export function rateText(j: Pick<Job, "rateMinMinor" | "rateMaxMinor" | "rateUnit" | "currency">): string | null {
  const lo = j.rateMinMinor !== null ? moneyShort(j.rateMinMinor, j.currency) : null;
  const hi = j.rateMaxMinor !== null ? moneyShort(j.rateMaxMinor, j.currency) : null;
  const unit = j.rateUnit ? (UNIT_SUFFIX[j.rateUnit] ?? "") : "";
  if (lo && hi) return lo === hi ? `${lo}${unit}` : `${lo} - ${hi}${unit}`;
  if (lo) return `From ${lo}${unit}`;
  if (hi) return `Up to ${hi}${unit}`;
  return null;
}

export interface Band {
  label: string;
  tone: Tone;
}

/** Excellent 90+, Great 80-89, Good 70-79, Potential below that (the board: 92, 86, 78/76, 68). */
export function matchBand(score: number): Band {
  if (score >= 90) return { label: "Excellent match", tone: "green" };
  if (score >= 80) return { label: "Great match", tone: "green" };
  if (score >= 70) return { label: "Good match", tone: "amber" };
  return { label: "Potential match", tone: "amber" };
}

/** The one honest sentence under the band label. */
export function matchBlurb(j: Pick<Job, "score" | "scoreSource" | "matchedSkills" | "totalSkills">): string {
  if (j.score === null) return "Add skills to your profile to see how well this role fits.";
  if (j.scoreSource === "MATCH") return "Your marketer's match score for this role.";
  return `You have ${j.matchedSkills} of ${j.totalSkills} required skills.`;
}

/**
 * What Apply would do for this card right now (the API decides again when the consultant confirms): a match or assignment lets the
 * consultant add a follow-up task; a role with neither has to be assigned or approved by the marketer first.
 */
export function applyHint(j: Pick<Job, "relation">): ApplyState {
  if (j.relation === "APPLIED") return { state: "ALREADY_APPLIED", message: "You already have an application for this role. Follow it on My Applications." };
  if (j.relation === "NONE") return { state: "NEEDS_ASSIGNMENT", message: "This role has to be assigned or approved by your marketer before you can apply. Ask them to line it up for you." };
  return { state: "CAN_RECORD", message: "Kiwiply never submits for you. This adds a follow-up to your tasks so you can confirm and submit this application yourself." };
}

export function employmentText(e: string | null): string | null {
  if (!e) return null;
  if (e === "FTE") return "Full-time";
  if (e === "C2C") return "C2C";
  return e.charAt(0) + e.slice(1).toLowerCase().replace(/_/g, " ");
}

export function workModeText(w: string | null): string | null {
  if (!w) return null;
  if (w === "ON_SITE") return "On-site";
  return w.charAt(0) + w.slice(1).toLowerCase().replace(/_/g, " ");
}

/** "Remote", or the city, with the work mode when both are known and it is not remote: "Austin, TX" / "Remote". */
export function placeText(location: string | null, workMode: string | null): string {
  if (workMode === "REMOTE") return "Remote";
  return location ?? workModeText(workMode) ?? "Not specified";
}

export function experienceText(e: string): string {
  return e.charAt(0) + e.slice(1).toLowerCase().replace(/_/g, " ");
}

/** "+42% demand" / "-10% demand" or null when the earlier window was too small to compare. */
export function demandText(t: Pick<TrendingSkill, "changePct">): { text: string; dir: "up" | "down" | "flat" } | null {
  if (t.changePct === null || !Number.isFinite(t.changePct)) return null;
  const p = Math.round(Math.abs(t.changePct));
  if (p === 0) return { text: "steady demand", dir: "flat" };
  return t.changePct > 0 ? { text: `+${p}% demand`, dir: "up" } : { text: `-${p}% demand`, dir: "down" };
}

/** "2 hours ago", "1 day ago", "3 weeks ago" against `now`. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.floor(d / 7);
  if (d < 60) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} month${mo === 1 ? "" : "s"} ago`;
}

/** A one-line summary of a saved search's filters: "data engineer, Remote, Contract". */
export function filtersSummary(f: Filters): string {
  const parts = [f.q, f.skill, f.location, f.workMode ? workModeText(f.workMode) : "", f.jobType ? employmentText(f.jobType) : "", f.experience ? experienceText(f.experience) : "", f.industry, f.clientId ? "One client" : "", f.minRateMinor ? `$${Math.round(f.minRateMinor / 100)}+/hr` : ""].filter((s): s is string => !!s && s.trim() !== "");
  return parts.length ? parts.join(", ") : "All jobs";
}

/** The hourly-rate steps of the Rate / Compensation dropdown (minor units; the API compares them to the hourly ceiling). */
export const RATE_STEPS: { value: string; label: string }[] = [50, 75, 100, 125, 150].map((d) => ({ value: String(d * 100), label: `$${d}+/hr` }));

/* ── the BFF calls (the browser talks to Next, Next to the API) ───────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const BASE_PATH = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/job-discovery`;

async function get<T>(url: string, parse: (b: unknown) => T | null, signal?: AbortSignal): Promise<Fetched<T>> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parse(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export const fetchOverview = (orgId: number | string, signal?: AbortSignal) => get(`${BASE_PATH(orgId)}/overview`, parseOverview, signal);
export const fetchSearch = (orgId: number | string, query: string, signal?: AbortSignal) => get(`${BASE_PATH(orgId)}/search?${query}`, parseSearch, signal);
export const fetchDetail = (orgId: number | string, jobId: number, signal?: AbortSignal) => get(`${BASE_PATH(orgId)}/jobs/${jobId}`, parseDetail, signal);

export interface WriteResult<T = null> {
  ok: boolean;
  status: number;
  /** The API's sentence for a refusal (422 sensitive content, 409 duplicate name, limit reached). */
  error: string | null;
  code: string | null;
  data: T | null;
}

async function write<T>(method: "POST" | "DELETE", url: string, body: unknown, parse: (b: unknown) => T | null): Promise<WriteResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, error: null, code: null, data: parse(json) };
    const o = isObj(json) ? json : {};
    return { ok: false, status: res.status, error: strOrNull(o.error) ?? strOrNull(o.message) ?? strOrNull(o.detail), code: strOrNull(o.code), data: null };
  } catch {
    return { ok: false, status: 0, error: null, code: null, data: null };
  }
}

const nothing = () => null;
const filtersBody = (f: Filters) => ({ q: f.q.trim() || null, location: f.location.trim() || null, jobType: f.jobType || null, workMode: f.workMode || null, experience: f.experience || null, industry: f.industry || null, skill: f.skill || null, clientId: f.clientId, minRateMinor: f.minRateMinor });

export const saveJob = (orgId: number | string, jobId: number) => write("POST", `${BASE_PATH(orgId)}/saved/${jobId}`, undefined, nothing);
export const unsaveJob = (orgId: number | string, jobId: number) => write("DELETE", `${BASE_PATH(orgId)}/saved/${jobId}`, undefined, nothing);
export const applyToJob = (orgId: number | string, jobId: number) => write("POST", `${BASE_PATH(orgId)}/jobs/${jobId}/apply`, undefined, parseApplyResult);
export const createSavedSearch = (orgId: number | string, name: string, f: Filters) => write("POST", `${BASE_PATH(orgId)}/saved-searches`, { name: name.trim(), filters: filtersBody(f) }, parseSavedSearch);
export const deleteSavedSearch = (orgId: number | string, id: number) => write("DELETE", `${BASE_PATH(orgId)}/saved-searches/${id}`, undefined, nothing);
export const markSavedSearchViewed = (orgId: number | string, id: number) => write("POST", `${BASE_PATH(orgId)}/saved-searches/${id}/viewed`, undefined, parseSavedSearch);
export const recordRecentSearch = (orgId: number | string, f: Filters) => write("POST", `${BASE_PATH(orgId)}/recent-searches`, filtersBody(f), nothing);
