/**
 * The Marketing "My Assigned Talent" board's data (design: My Assigned Talent). One call to `GET /api/orgs/{orgId}/mkt/talent`
 * (through the BFF) draws the KPI tiles, the status chips, the table page and the three bottom cards. ASSIGNED scope: only the
 * consultants the marketer is assigned to. A section the API leaves out is drawn as an honest empty state, never a made-up row.
 * E1: nothing here submits for a consultant; the actions open the page where the marketer PREPARES or RECORDS.
 */

export type KpiKey = "assigned" | "availableNow" | "needUpdates" | "activeInterviews" | "pendingApprovals";
export const KPI_KEYS: KpiKey[] = ["assigned", "availableNow", "needUpdates", "activeInterviews", "pendingApprovals"];
export const KPI_TITLES: Record<KpiKey, string> = {
  assigned: "Total assigned consultants",
  availableNow: "Available now",
  needUpdates: "Profiles need updates",
  activeInterviews: "Active interviews",
  pendingApprovals: "Pending approvals",
};

export interface Kpi { key: KpiKey; value: number; deltaPct: number | null; sparkline: number[] }
export interface Counts { all: number; availableNow: number; inInterview: number; needsUpdate: number; pendingApproval: number }
export type Tone = "green" | "blue" | "violet" | "amber" | "grey";
export type AvailabilityCode = "AVAILABLE_NOW" | "IN_INTERVIEW" | "SOON" | "LATER" | "ON_PROJECT" | "UNAVAILABLE";
export type ResumeState = "UP_TO_DATE" | "NEEDS_UPDATE" | "PENDING_APPROVAL";

export interface TalentRow {
  id: number;
  name: string;
  avatarUrl: string | null;
  title: string;
  primarySkill: string;
  yearsExperience: number | null;
  location: string;
  availability: { code: AvailabilityCode; label: string; tone: Tone };
  resume: { state: ResumeState; label: string };
  activeApps: number;
  assignedJobs: number;
}

export type StatusFilter = "" | "AVAILABLE_NOW" | "IN_INTERVIEW" | "NEEDS_UPDATE" | "PENDING_APPROVAL";
export interface TalentFilters { q: string; status: StatusFilter; skill: string; location: string; experience: string; availability: string }
export const NO_FILTERS: TalentFilters = { q: "", status: "", skill: "", location: "", experience: "", availability: "" };
export interface SavedView { id: number; name: string; filters: TalentFilters }

export interface TalentView {
  kpis: Kpi[];
  counts: Counts;
  facets: { skills: string[]; locations: string[] };
  items: TalentRow[];
  total: number;
  page: number;
  size: number;
  cards: { available: TalentRow[]; needsUpdate: TalentRow[]; inInterview: TalentRow[] };
  views: SavedView[];
  canAddConsultant: boolean;
}

export const EXPERIENCE_OPTIONS = [
  { value: "0-2", label: "0-2 yrs" },
  { value: "3-5", label: "3-5 yrs" },
  { value: "6-8", label: "6-8 yrs" },
  { value: "9+", label: "9+ yrs" },
];
export const AVAILABILITY_OPTIONS: { value: AvailabilityCode; label: string }[] = [
  { value: "AVAILABLE_NOW", label: "Available now" },
  { value: "IN_INTERVIEW", label: "In interview" },
  { value: "SOON", label: "Within a month" },
  { value: "LATER", label: "Later" },
  { value: "ON_PROJECT", label: "On project" },
  { value: "UNAVAILABLE", label: "Unavailable" },
];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
const tone = (x: unknown): Tone => (x === "green" || x === "blue" || x === "violet" || x === "amber" || x === "grey" ? x : "grey");
const AVAIL: AvailabilityCode[] = ["AVAILABLE_NOW", "IN_INTERVIEW", "SOON", "LATER", "ON_PROJECT", "UNAVAILABLE"];
const STATUSES: StatusFilter[] = ["AVAILABLE_NOW", "IN_INTERVIEW", "NEEDS_UPDATE", "PENDING_APPROVAL"];

export function parseRow(r: Record<string, unknown>): TalentRow {
  const a = isObj(r.availability) ? r.availability : {};
  const s = isObj(r.resume) ? r.resume : {};
  const code = AVAIL.includes(a.code as AvailabilityCode) ? (a.code as AvailabilityCode) : "UNAVAILABLE";
  const state: ResumeState = s.state === "NEEDS_UPDATE" || s.state === "PENDING_APPROVAL" ? s.state : "UP_TO_DATE";
  return {
    id: num(r.id), name: str(r.name), avatarUrl: typeof r.avatarUrl === "string" ? r.avatarUrl : null, title: str(r.title), primarySkill: str(r.primarySkill),
    yearsExperience: typeof r.yearsExperience === "number" && Number.isFinite(r.yearsExperience) ? r.yearsExperience : null, location: str(r.location),
    availability: { code, label: str(a.label), tone: tone(a.tone) },
    resume: { state, label: str(s.label, state === "NEEDS_UPDATE" ? "Needs update" : state === "PENDING_APPROVAL" ? "Pending approval" : "Up to date") },
    activeApps: num(r.activeApps), assignedJobs: num(r.assignedJobs),
  };
}

export function parseFilters(f: unknown): TalentFilters {
  const o = isObj(f) ? f : {};
  return {
    q: str(o.q), status: STATUSES.includes(o.status as StatusFilter) ? (o.status as StatusFilter) : "", skill: str(o.skill), location: str(o.location),
    experience: str(o.experience), availability: str(o.availability),
  };
}

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseTalent(raw: unknown): TalentView | null {
  if (!isObj(raw)) return null;
  const c = isObj(raw.counts) ? raw.counts : {};
  const f = isObj(raw.facets) ? raw.facets : {};
  const cards = isObj(raw.cards) ? raw.cards : {};
  return {
    kpis: arr(raw.kpis)
      .filter((k) => (KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({ key: str(k.key) as KpiKey, value: num(k.value), deltaPct: typeof k.deltaPct === "number" && Number.isFinite(k.deltaPct) ? k.deltaPct : null, sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [] })),
    counts: { all: num(c.all), availableNow: num(c.availableNow), inInterview: num(c.inInterview), needsUpdate: num(c.needsUpdate), pendingApproval: num(c.pendingApproval) },
    facets: { skills: strs(f.skills), locations: strs(f.locations) },
    items: arr(raw.items).map(parseRow),
    total: num(raw.total),
    page: num(raw.page),
    size: num(raw.size, 8) || 8,
    cards: { available: arr(cards.available).map(parseRow), needsUpdate: arr(cards.needsUpdate).map(parseRow), inInterview: arr(cards.inInterview).map(parseRow) },
    views: arr(raw.views).map((v) => ({ id: num(v.id), name: str(v.name), filters: parseFilters(v.filters) })),
    canAddConsultant: raw.canAddConsultant === true,
  };
}

// ---- the consultant drawer --------------------------------------------------------------------------------------------------------

export interface TalentDetail {
  id: number;
  name: string;
  avatarUrl: string | null;
  title: string;
  headline: string;
  yearsExperience: number | null;
  location: string;
  workMode: string;
  availability: TalentRow["availability"];
  resume: TalentRow["resume"];
  profileCompleteness: number;
  skills: string[];
  resumes: { id: number; name: string; version: number; primary: boolean; approval: string; updatedAt: string }[];
  applications: { code: string; jobTitle: string; client: string; stage: string; nextAction: string }[];
  interviews: { scheduledAt: string; round: string; client: string; durationMinutes: number }[];
  assignedJobs: { jobId: number; title: string; client: string; matchPct: number }[];
  consent: "SUMMARY" | "FULL" | "NONE";
}

export function parseDetail(raw: unknown): TalentDetail | null {
  if (!isObj(raw) || typeof raw.id !== "number") return null;
  const base = parseRow({ ...raw, primarySkill: "", activeApps: 0, assignedJobs: 0 });
  return {
    id: base.id, name: base.name, avatarUrl: base.avatarUrl, title: base.title, headline: str(raw.headline), yearsExperience: base.yearsExperience, location: base.location,
    workMode: str(raw.workMode), availability: base.availability, resume: base.resume, profileCompleteness: num(raw.profileCompleteness), skills: strs(raw.skills),
    resumes: arr(raw.resumes).map((r) => ({ id: num(r.id), name: str(r.name), version: num(r.version, 1), primary: r.primary === true, approval: str(r.approval), updatedAt: str(r.updatedAt) })),
    applications: arr(raw.applications).map((a) => ({ code: str(a.code), jobTitle: str(a.jobTitle), client: str(a.client), stage: str(a.stage), nextAction: str(a.nextAction) })),
    interviews: arr(raw.interviews).map((i) => ({ scheduledAt: str(i.scheduledAt), round: str(i.round), client: str(i.client), durationMinutes: num(i.durationMinutes) })),
    assignedJobs: arr(raw.assignedJobs).map((j) => ({ jobId: num(j.jobId), title: str(j.title), client: str(j.client), matchPct: num(j.matchPct) })),
    consent: raw.consent === "FULL" || raw.consent === "NONE" ? raw.consent : "SUMMARY",
  };
}

// ---- the selected consultant, in full (the overview behind View Profile) -----------------------------------------------------------------

export interface OverviewActor { userId?: number | null; memberId?: number | null; label: string; relation?: string | null; kind: string }
export interface TalentOverview {
  id: number;
  name: string;
  title: string;
  headline: string;
  workMode: string;
  availability: TalentRow["availability"];
  contact: { workEmail: string; location: string; workAuthorization: string; phone: string; timeZone: string; preferredContact: string };
  skills: string[];
  placement: { roleTitle: string; client: string; startDate: string; status: string } | null;
  resumes: { id: number; name: string; version: number; primary: boolean; approval: string; updatedAt: string }[];
  applications: {
    total: number;
    open: number;
    byStage: { key: string; label: string; count: number }[];
    recent: { code: string; jobTitle: string; client: string; stage: string; nextAction: string; updatedAt: string; updatedBy: OverviewActor | null }[];
  };
  interviews: { scheduledAt: string; round: string; client: string; durationMinutes: number }[];
}

/** Lenient like the rest: a malformed document is null (the drawer then keeps the summary it already has). No phone or time zone: the API does not store them. */
export function parseOverview(raw: unknown): TalentOverview | null {
  if (!isObj(raw) || typeof raw.id !== "number" || !isObj(raw.contact)) return null;
  const base = parseRow({ ...raw, primarySkill: "", activeApps: 0, assignedJobs: 0 });
  const c = raw.contact;
  const pl = isObj(raw.placement) ? raw.placement : null;
  const ap = isObj(raw.applications) ? raw.applications : {};
  return {
    id: base.id, name: base.name, title: str(raw.title), headline: str(raw.headline), workMode: str(raw.workMode), availability: base.availability,
    contact: { workEmail: str(c.workEmail), location: str(c.location), workAuthorization: str(c.workAuthorization), phone: str(c.phone), timeZone: str(c.timeZone), preferredContact: str(c.preferredContact) },
    skills: strs(raw.skills),
    placement: pl ? { roleTitle: str(pl.roleTitle), client: str(pl.client), startDate: str(pl.startDate), status: str(pl.status) } : null,
    resumes: arr(raw.resumes).map((r) => ({ id: num(r.id), name: str(r.name), version: num(r.version, 1), primary: r.primary === true, approval: str(r.approval), updatedAt: str(r.updatedAt) })),
    applications: {
      total: num(ap.total), open: num(ap.open),
      byStage: arr(ap.byStage).map((g) => ({ key: str(g.key), label: str(g.label), count: num(g.count) })),
      recent: arr(ap.recent).map((a) => ({
        code: str(a.code), jobTitle: str(a.jobTitle), client: str(a.client), stage: str(a.stage), nextAction: str(a.nextAction), updatedAt: str(a.updatedAt),
        updatedBy: isObj(a.updatedBy) ? { userId: typeof a.updatedBy.userId === "number" ? a.updatedBy.userId : null, memberId: typeof a.updatedBy.memberId === "number" ? a.updatedBy.memberId : null, label: str(a.updatedBy.label), relation: typeof a.updatedBy.relation === "string" ? a.updatedBy.relation : null, kind: str(a.updatedBy.kind, "PERSON") } : null,
      })),
    },
    interviews: arr(raw.interviews).map((i) => ({ scheduledAt: str(i.scheduledAt), round: str(i.round), client: str(i.client), durationMinutes: num(i.durationMinutes) })),
  };
}

// ---- fetch ------------------------------------------------------------------------------------------------------------------------------

export type Fetched<T> = { kind: "OK"; view: T } | { kind: "DENIED" } | { kind: "FAILED" };
export interface TalentQuery extends TalentFilters { page: number; size?: number; sort?: string }

export function talentQueryString(q: TalentQuery): string {
  const p = new URLSearchParams();
  (["q", "status", "skill", "location", "experience", "availability"] as const).forEach((k) => {
    const v = q[k].trim();
    if (v) p.set(k, v);
  });
  if (q.sort) p.set("sort", q.sort);
  if (q.page > 0) p.set("page", String(q.page));
  if (q.size) p.set("size", String(q.size));
  return p.toString();
}

async function getJson<T>(url: string, parse: (raw: unknown) => T | null, signal?: AbortSignal): Promise<Fetched<T>> {
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

export function fetchTalent(orgId: number | string, q: TalentQuery, signal?: AbortSignal): Promise<Fetched<TalentView>> {
  const qs = talentQueryString(q);
  return getJson(`/api/orgs/${orgId}/mkt/talent${qs ? `?${qs}` : ""}`, parseTalent, signal);
}

export function fetchTalentDetail(orgId: number | string, consultantId: number, signal?: AbortSignal): Promise<Fetched<TalentDetail>> {
  return getJson(`/api/orgs/${orgId}/mkt/talent/${consultantId}`, parseDetail, signal);
}

export function fetchTalentOverview(orgId: number | string, consultantId: number, signal?: AbortSignal): Promise<Fetched<TalentOverview>> {
  return getJson(`/api/orgs/${orgId}/mkt/talent/${consultantId}/overview`, parseOverview, signal);
}

export type SaveResult = { ok: true; view: SavedView } | { ok: false; error: string };

export async function saveTalentView(orgId: number | string, name: string, f: TalentFilters): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/talent/views`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ name, q: f.q || null, status: f.status || null, skill: f.skill || null, location: f.location || null, experience: f.experience || null, availability: f.availability || null }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: isObj(body) && typeof body.error === "string" ? body.error : "That view couldn't be saved." };
    if (!isObj(body)) return { ok: false, error: "That view couldn't be saved." };
    return { ok: true, view: { id: num(body.id), name: str(body.name), filters: parseFilters(body.filters) } };
  } catch {
    return { ok: false, error: "That view couldn't be saved." };
  }
}

export async function deleteTalentView(orgId: number | string, id: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/talent/views/${id}`, { method: "DELETE" });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export const yearsText = (y: number | null): string => (y === null ? "" : `${y} yrs`);
export const hasFilters = (f: TalentFilters): boolean => Object.values(f).some((v) => v.trim() !== "");
