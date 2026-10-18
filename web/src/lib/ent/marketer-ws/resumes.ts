/**
 * The Marketing Resumes board's data (design: Resumes). One call to `GET /api/orgs/{orgId}/mkt/resumes` (through the BFF) draws the KPIs,
 * the page of rows and "Recent Resume Activity". Resumes are metadata only (no file bytes): View is a read-only preview, Edit changes the
 * metadata (a new version), Download is honestly "No file stored". E1: a marketer prepares and REQUESTS approval; the org admin approves.
 * A section the API leaves out is drawn as an honest empty state, never a made-up row.
 */

export type ResumeKpiKey = "total" | "profilesReady" | "needUpdates" | "approvalsPending";
export const RESUME_KPI_KEYS: ResumeKpiKey[] = ["total", "profilesReady", "needUpdates", "approvalsPending"];
export const RESUME_KPI_TITLES: Record<ResumeKpiKey, string> = {
  total: "Total Resumes",
  profilesReady: "Profiles Ready",
  needUpdates: "Resumes Need Updates",
  approvalsPending: "Approvals Pending",
};

export type Approval = "APPROVED" | "PENDING" | "NEEDS_UPDATE";
export const APPROVAL_LABELS: Record<Approval, string> = { APPROVED: "Approved", PENDING: "Pending Review", NEEDS_UPDATE: "Needs Update" };

export interface ResumeKpi {
  key: ResumeKpiKey;
  value: number;
  /** Percent change against the same rows a month ago; null = nothing to compare (no chip is drawn). */
  deltaPct: number | null;
  sparkline: number[];
}
export interface ResumeRow {
  id: number;
  consultantId: number;
  consultantName: string;
  consultantTitle: string;
  avatarUrl: string | null;
  title: string;
  targetRole: string | null;
  version: number;
  lastModifiedAt: string;
  primary: boolean;
  completeness: number;
  approval: Approval;
  hasFile: boolean;
  canEdit: boolean;
}
export interface ResumeActivity { id: number; resumeId: number; consultantId: number; consultantName: string; avatarUrl: string | null; kind: string; text: string; at: string }
export interface ResumesView { kpis: ResumeKpi[]; items: ResumeRow[]; total: number; page: number; size: number; skills: string[]; activity: ResumeActivity[]; canApprove: boolean }
export interface ResumeDetail {
  row: ResumeRow;
  headline: string | null;
  summary: string | null;
  fileName: string | null;
  skills: { name: string; primary: boolean }[];
  experience: { title: string; employer: string; startYear: number; endYear: number | null }[];
  history: ResumeActivity[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const nstr = (x: unknown): string | null => (typeof x === "string" ? x : null);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const approval = (x: unknown): Approval => (x === "PENDING" || x === "NEEDS_UPDATE" ? x : "APPROVED");

function parseRow(r: Record<string, unknown>): ResumeRow {
  return {
    id: num(r.id), consultantId: num(r.consultantId), consultantName: str(r.consultantName), consultantTitle: str(r.consultantTitle), avatarUrl: nstr(r.avatarUrl),
    title: str(r.title), targetRole: nstr(r.targetRole), version: Math.max(1, num(r.version, 1)), lastModifiedAt: str(r.lastModifiedAt), primary: r.primary === true,
    completeness: Math.min(100, Math.max(0, num(r.completeness))), approval: approval(r.approval), hasFile: r.hasFile === true, canEdit: r.canEdit === true,
  };
}
function parseActivity(a: Record<string, unknown>): ResumeActivity {
  return { id: num(a.id), resumeId: num(a.resumeId), consultantId: num(a.consultantId), consultantName: str(a.consultantName), avatarUrl: nstr(a.avatarUrl), kind: str(a.kind), text: str(a.text), at: str(a.at) };
}

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseResumes(raw: unknown): ResumesView | null {
  if (!isObj(raw)) return null;
  const kpis: ResumeKpi[] = arr(raw.kpis)
    .filter((k) => (RESUME_KPI_KEYS as string[]).includes(str(k.key)))
    .map((k) => ({
      key: str(k.key) as ResumeKpiKey, value: num(k.value), deltaPct: typeof k.deltaPct === "number" && Number.isFinite(k.deltaPct) ? k.deltaPct : null,
      sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [],
    }));
  const items = arr(raw.items).map(parseRow);
  return {
    kpis, items, total: num(raw.total, items.length), page: Math.max(0, num(raw.page)), size: Math.max(1, num(raw.size, 10)),
    skills: Array.isArray(raw.skills) ? raw.skills.filter((s): s is string => typeof s === "string") : [], activity: arr(raw.activity).map(parseActivity), canApprove: raw.canApprove === true,
  };
}

export function parseResumeDetail(raw: unknown): ResumeDetail | null {
  if (!isObj(raw) || !isObj(raw.row)) return null;
  return {
    row: parseRow(raw.row), headline: nstr(raw.headline), summary: nstr(raw.summary), fileName: nstr(raw.fileName),
    skills: arr(raw.skills).map((s) => ({ name: str(s.name), primary: s.primary === true })),
    experience: arr(raw.experience).map((x) => ({ title: str(x.title), employer: str(x.employer), startYear: num(x.startYear), endYear: typeof x.endYear === "number" ? x.endYear : null })),
    history: arr(raw.history).map(parseActivity),
  };
}

// ---- filters ---------------------------------------------------------------------------------------------------------------

export interface ResumeFilters { q: string; skill: string; status: string; updated: string; availability: string; sort: string; page: number; size: number }
export const DEFAULT_FILTERS: ResumeFilters = { q: "", skill: "", status: "", updated: "3m", availability: "", sort: "modified,desc", page: 0, size: 10 };
export const UPDATED_OPTIONS = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "3m", label: "Last 3 Months" },
  { value: "6m", label: "Last 6 Months" },
  { value: "all", label: "Any time" },
];
export const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "APPROVED", label: "Approved" },
  { value: "PENDING", label: "Pending Review" },
  { value: "NEEDS_UPDATE", label: "Needs Update" },
];
export const AVAILABILITY_OPTIONS = [
  { value: "", label: "All" },
  { value: "AVAILABLE", label: "Available" },
  { value: "ON_PROJECT", label: "On Project" },
  { value: "NOTICE", label: "On Notice" },
  { value: "UNAVAILABLE", label: "Unavailable" },
];
export const PAGE_SIZES = [10, 25, 50];

export function buildQuery(f: ResumeFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.skill) p.set("skill", f.skill);
  if (f.status) p.set("status", f.status);
  if (f.updated) p.set("updated", f.updated);
  if (f.availability) p.set("availability", f.availability);
  p.set("sort", f.sort);
  p.set("page", String(f.page));
  p.set("size", String(f.size));
  return p.toString();
}

/** Pagination window: the board shows 1 2 3 4 5; a long list slides the window around the current page. */
export function pageWindow(page: number, pages: number, width = 5): number[] {
  if (pages <= 0) return [];
  const start = Math.max(0, Math.min(page - Math.floor(width / 2), pages - width));
  return Array.from({ length: Math.min(width, pages) }, (_, i) => start + i);
}

// ---- fetching --------------------------------------------------------------------------------------------------------------

export type ResumesFetch = { kind: "OK"; view: ResumesView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchResumes(orgId: number | string, f: ResumeFilters, signal?: AbortSignal): Promise<ResumesFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/resumes?${buildQuery(f)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseResumes(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type DetailFetch = { kind: "OK"; detail: ResumeDetail } | { kind: "DENIED" } | { kind: "FAILED" };
export async function fetchResumeDetail(orgId: number | string, id: number, signal?: AbortSignal): Promise<DetailFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/resumes/${id}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const detail = parseResumeDetail(await res.json().catch(() => null));
    return detail ? { kind: "OK", detail } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type WriteResult = { kind: "OK"; detail: ResumeDetail } | { kind: "DENIED" } | { kind: "INVALID"; message: string } | { kind: "FAILED"; message: string };

async function write(url: string, method: "PATCH" | "POST", body?: Record<string, unknown>): Promise<WriteResult> {
  try {
    const res = await fetch(url, { method, headers: body ? { accept: "application/json", "content-type": "application/json" } : { accept: "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const data: unknown = await res.json().catch(() => null);
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    const message = isObj(data) && typeof data.error === "string" ? data.error : "Couldn't save that. Nothing has changed.";
    if (res.status === 422) return { kind: "INVALID", message };
    if (!res.ok) return { kind: "FAILED", message };
    const detail = parseResumeDetail(data);
    return detail ? { kind: "OK", detail } : { kind: "FAILED", message: "Couldn't read the answer. Nothing has changed." };
  } catch {
    return { kind: "FAILED", message: "Couldn't reach the server. Nothing has changed." };
  }
}

/** Metadata edit: a new version of the resume (PATCH through the BFF). Never submits anything for a consultant. */
export const patchResume = (orgId: number | string, id: number, body: { title?: string; headline?: string | null; summary?: string | null; targetRole?: string | null }) =>
  write(`/api/orgs/${orgId}/mkt/resumes/${id}`, "PATCH", body);
/** Ask the org admin to approve; never approves. */
export const requestApproval = (orgId: number | string, id: number) => write(`/api/orgs/${orgId}/mkt/resumes/${id}/approval-request`, "POST");
export const markNeedsUpdate = (orgId: number | string, id: number) => write(`/api/orgs/${orgId}/mkt/resumes/${id}/needs-update`, "POST", {});
/** The org admin's own action (the API refuses anyone else and refuses approving your own request). */
export const approveResume = (orgId: number | string, id: number) => write(`/api/orgs/${orgId}/mkt/resumes/${id}/approve`, "POST");

// ---- display ---------------------------------------------------------------------------------------------------------------

export function dateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "2 days ago", "2 weeks ago", "3 months ago" (the board's wording). */
export function agoText(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.round(h / 24);
  if (d < 14) return d === 1 ? "1 day ago" : `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo} months ago` : mo < 18 ? "1 year ago" : `${Math.round(mo / 12)} years ago`;
}

/** Completeness bar colour by band: green from 80, amber below. */
export function completenessTone(pct: number): "green" | "amber" | "red" {
  return pct >= 80 ? "green" : pct >= 60 ? "amber" : "red";
}

/** Board art served from `public/ent/marketer/resumes` (cropped from the approved board). A real `avatarUrl` from the API always wins. */
export const RESUME_ART_BASE = "/ent/marketer/resumes";
const PEOPLE = ["alex-morgan", "priya-sharma", "michael-park", "emily-lawson", "david-kim", "sophia-patel", "james-wilson", "olivia-martinez", "daniel-lee", "natalie-brown"];
export const photoFor = (name: string, url: string | null): string | null => {
  if (url) return url;
  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
  return PEOPLE.includes(slug) ? `${RESUME_ART_BASE}/${slug}.png` : null;
};
