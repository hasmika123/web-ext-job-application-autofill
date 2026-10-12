/**
 * Job search on the web (APP-E2E U4.3): the types `GET /api/jobs/search` / `GET /api/jobs/:id` answer (through the BFF
 * routes under `/api/jobs`), the filter vocabulary the page and its sheet share, the fetchers (each returns a tagged
 * result and never throws) and a few pure helpers. The postings are the ones the nightly board read keeps; the search
 * never shows a job the user hid or applied to.
 */
import { call, type TrackerResult } from "@/lib/tracker-client";

export const JOB_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"] as const;
export type JobTypeValue = (typeof JOB_TYPES)[number];
export const WORKPLACES = ["REMOTE", "HYBRID", "ONSITE"] as const;
export type Workplace = (typeof WORKPLACES)[number];

export const TYPE_LABELS: Record<JobTypeValue, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
};
export const WORKPLACE_LABELS: Record<Workplace, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" };

/**
 * The page size the search asks for. It mirrors the server's default (`jobs.search.defaultSize`, which also caps what a
 * client may ask for), so it is a request, not a limit: the server answers with the size it used.
 */
export const JOBS_PAGE_SIZE = 20;

export interface JobCardSource {
  kind: string;
  platform: string | null;
  label: string | null;
}

export interface JobCard {
  id: number;
  title: string;
  company: string;
  companyKey: string;
  location: string | null;
  remote: boolean;
  workplaceType: string | null;
  employmentType: JobTypeValue | null;
  publishedAt: string | null;
  source: JobCardSource;
  applyAts: string | null;
  /** The user already tracks this posting. */
  saved: boolean;
  /** The nightly match score (Pro only). */
  match?: { score: number; reason: string | null };
}

export interface JobFacets {
  remote: Record<string, number>;
  type: Record<string, number>;
  /** Matching postings published within N days, keyed by N ("1", "3", "7"...). */
  postedBuckets: Record<string, number>;
}

/** A cheaper search offered when little matched: `params` are the query parameters to use. */
export interface JobRelax {
  label: string;
  params: Record<string, string>;
  total: number;
}

export interface JobSearchPage {
  items: JobCard[];
  total: number;
  page: number;
  size: number;
  /** More matched than the search will page through: say "narrow your search". */
  capped: boolean;
  tookMs: number;
  facets: JobFacets;
  suggestions: JobRelax[];
}

export interface JobDetailData {
  card: JobCard;
  descriptionText: string | null;
  url: string | null;
  applyUrl: string | null;
  companyJobsCount: number;
  similar: JobCard[];
}

/** The filter chips on the page and the sheet's fields, as one value (what the URL and the request carry). */
export interface JobFilters {
  remote: Workplace | "";
  types: JobTypeValue[];
  posted: string;
  loc: string;
  company: string;
}

export const NO_FILTERS: JobFilters = { remote: "", types: [], posted: "", loc: "", company: "" };

/** How many filters are on (the Filters button's badge). */
export function activeFilterCount(f: JobFilters): number {
  return (f.remote ? 1 : 0) + f.types.length + (f.posted ? 1 : 0) + (f.loc.trim() ? 1 : 0) + (f.company.trim() ? 1 : 0);
}

/** The "posted within" choices as labels ("Past 24 hours"), from the server's day buckets. */
export function postedLabel(days: number): string {
  if (days === 1) return "Past 24 hours";
  if (days === 7) return "Past week";
  if (days === 14) return "Past 2 weeks";
  if (days === 30) return "Past month";
  return `Past ${days} days`;
}

/** Posted "2 days ago", from the board's publish time. Pure given `now`. */
export function postedAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const hours = Math.max(0, Math.round((now - t) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Company · Location · Full-time" for a result's second line. */
export function jobMeta(j: Pick<JobCard, "company" | "location" | "employmentType" | "workplaceType" | "remote">): string {
  const remoteWord = j.remote && !/remote/i.test(j.location ?? "") ? "Remote" : null;
  return [j.company, j.location || null, j.employmentType ? TYPE_LABELS[j.employmentType] : null, remoteWord].filter(Boolean).join(" · ");
}

/** The small tags under a result: where it is worked, what kind of job, where it came from. */
export function jobTags(j: JobCard): string[] {
  const tags: string[] = [];
  if (j.workplaceType && j.workplaceType in WORKPLACE_LABELS) tags.push(WORKPLACE_LABELS[j.workplaceType as Workplace]);
  else if (j.remote) tags.push("Remote");
  if (j.employmentType) tags.push(TYPE_LABELS[j.employmentType]);
  if (j.source?.label) tags.push(`via ${j.source.label}`);
  return tags;
}

// ---- fetchers (browser) -----------------------------------------------------------------------------------------

export function getJob(id: number): Promise<TrackerResult<JobDetailData>> {
  return call("GET", `/api/jobs/${id}`);
}

/** Put the posting on the board as a SAVED application; answers the application's id. */
export function saveJob(id: number): Promise<TrackerResult<{ applicationId: number }>> {
  return call("POST", `/api/jobs/${id}/save`);
}

/** Hide a job (or, with HIDE_COMPANY, every job of its company). `archivedApplicationId` is the saved job it put away. */
export function hideJob(id: number, signal: "HIDE" | "HIDE_COMPANY" = "HIDE"): Promise<TrackerResult<{ signal: string; archivedApplicationId: number | null }>> {
  return call("POST", `/api/jobs/${id}/feedback`, { signal });
}

export function unhideJob(id: number, signal: "HIDE" | "HIDE_COMPANY" = "HIDE"): Promise<TrackerResult<undefined>> {
  return call("DELETE", `/api/jobs/${id}/feedback/${signal}`, undefined, false);
}

/** Job titles to offer as you type (public data; empty under the server's minimum). */
export function suggestTitles(q: string, signal?: AbortSignal): Promise<string[]> {
  return fetch(`/api/jobs/suggest?q=${encodeURIComponent(q)}`, { signal, headers: { accept: "application/json" } })
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : []))
    .then((b) => (Array.isArray(b) ? b.filter((x): x is string => typeof x === "string") : []))
    .catch(() => []);
}
