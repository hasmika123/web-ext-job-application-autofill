/**
 * The applications tracker on the web (APP-E2E U6.3 / U5.1 / U3.1): the types the list v2 / detail endpoints
 * answer, the status model every tracker page shares (labels, tones, which status a tab means), the BFF fetchers
 * (`/api/applications/**`, each returns a tagged result and never throws) and a few pure helpers. Interviews live
 * in `lib/interviews.ts`.
 */
import { call, type TrackerResult } from "@/lib/tracker-client";
import type { Interview } from "@/lib/interviews";

/** The wire statuses, in funnel order. */
export const APPLICATION_STATUSES = ["DRAFT", "SAVED", "APPLIED", "IN_REVIEW", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type StatusTone = "blue" | "amber" | "green" | "violet" | "coral" | "slate";

/** What the person reads for each status, and the tone its chip wears. */
export const STATUS_META: Record<ApplicationStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "Draft", tone: "slate" },
  SAVED: { label: "Saved", tone: "slate" },
  APPLIED: { label: "Applied", tone: "blue" },
  IN_REVIEW: { label: "Under review", tone: "amber" },
  INTERVIEW: { label: "Interview", tone: "green" },
  OFFER: { label: "Offer", tone: "violet" },
  REJECTED: { label: "Rejected", tone: "coral" },
  WITHDRAWN: { label: "Withdrawn", tone: "slate" },
};

export function statusLabel(status: string): string {
  return STATUS_META[status as ApplicationStatus]?.label ?? status;
}

export function statusTone(status: string): StatusTone {
  return STATUS_META[status as ApplicationStatus]?.tone ?? "slate";
}

/** The statuses a person can move an application to (Draft is the extension's own, offered only while it is one). */
export function pickableStatuses(current: string): ApplicationStatus[] {
  return APPLICATION_STATUSES.filter((s) => s !== "DRAFT" || current === "DRAFT");
}

/** Statuses that mean "I sent it" (Saved and Draft have not been sent). */
export const SUBMITTED_STATUSES: readonly ApplicationStatus[] = ["APPLIED", "IN_REVIEW", "INTERVIEW", "OFFER", "REJECTED"];

/**
 * The page size the tracker lists ask for. It mirrors the server's default (`tracker.list.defaultSize`, which also
 * caps what a client may ask for), so it is a request, not a limit: the server answers with the size it used.
 */
export const TRACKER_PAGE_SIZE = 20;

/** The application the extension and the web board share (legacy fields) plus what the tracker v2 adds. */
export interface Application {
  id: number;
  company: string;
  roleTitle: string;
  jobUrl?: string | null;
  location?: string | null;
  jobType?: string | null;
  jobMode?: string | null;
  email?: string | null;
  salary?: string | null;
  externalJobId?: string | null;
  atsPlatform?: string | null;
  jobDescription?: string | null;
  status: string;
  submissionConfirmed?: boolean | null;
  appliedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  starred?: boolean | null;
  archived?: boolean | null;
  resume?: { id: number; label?: string | null } | null;
  attachmentFilename?: string | null;
  source?: string | null;
  // ---- tracker v2 (list v2 / detail / patch only)
  lastEventAt?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  /** ACCEPTED or DECLINED once an offer is resolved. */
  outcome?: string | null;
  acceptedAt?: string | null;
  postingId?: number | null;
  /** Derived: the soonest interview, "Review offer", or the user's own next action. */
  nextStep?: { label: string; at?: string | null } | null;
  /** Derived: applied or in review with no news for the configured number of days. */
  ghosted?: boolean | null;
  interviewsCount?: number | null;
  notesCount?: number | null;
  mailCount?: number | null;
}

export interface TimelineEvent {
  id: number;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  source: string;
  refId: number | null;
  summary: string | null;
  createdAt: string;
}

export interface ApplicationNote {
  id: number;
  applicationId: number;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InboxSuggestion {
  inboxMessageId: number;
  to: string;
  subject: string | null;
  sentAt: string | null;
}

/** `GET /api/applications/:id`: the application with everything the detail sheet shows. */
export interface ApplicationDetailData extends Application {
  events: TimelineEvent[];
  notes: ApplicationNote[];
  interviews: Interview[];
  suggestions: InboxSuggestion[];
}

/** The shared list shape; `summary` holds the per-tab counts (ALL, DRAFT ... WITHDRAWN, GHOSTED, ARCHIVED). */
export interface ApplicationListPage {
  items: Application[];
  total: number;
  page: number;
  size: number;
  summary?: Record<string, number>;
}

/** The fields `PATCH /api/applications/:id` takes; a field left out stays, `null` clears the clearable ones. */
export interface ApplicationPatch {
  status?: ApplicationStatus;
  nextAction?: string | null;
  nextActionAt?: string | null;
  starred?: boolean;
  archived?: boolean;
  resumeId?: number | null;
  outcome?: "ACCEPTED" | "DECLINED" | null;
}

export interface ActivityDay {
  day: string;
  count: number;
}

export type BulkAction = "ARCHIVE" | "UNARCHIVE" | "STATUS" | "STAR" | "UNSTAR";
export interface BulkResult {
  done: number[];
  failed: { id: number; reason: string }[];
}

// ---- fetchers -----------------------------------------------------------------------------------------------

export function getApplication(id: number): Promise<TrackerResult<ApplicationDetailData>> {
  return call("GET", `/api/applications/${id}`);
}

export function patchApplication(id: number, patch: ApplicationPatch): Promise<TrackerResult<Application>> {
  return call("PATCH", `/api/applications/${id}`, patch);
}

export function addNote(applicationId: number, body: string, pinned = false): Promise<TrackerResult<ApplicationNote>> {
  return call("POST", `/api/applications/${applicationId}/notes`, { body, pinned });
}

export function updateNote(applicationId: number, noteId: number, patch: { body?: string; pinned?: boolean }): Promise<TrackerResult<ApplicationNote>> {
  return call("PUT", `/api/applications/${applicationId}/notes/${noteId}`, patch);
}

export function deleteNote(applicationId: number, noteId: number): Promise<TrackerResult<undefined>> {
  return call("DELETE", `/api/applications/${applicationId}/notes/${noteId}`, undefined, false);
}

export function bulkApplications(ids: number[], action: BulkAction, status?: ApplicationStatus): Promise<TrackerResult<BulkResult>> {
  return call("POST", "/api/applications/bulk", { ids, action, status });
}

/** Events per day for the last `days` days in the browser's own zone, oldest first (quiet days are 0). */
export function getActivity(days: number, tz: string = browserZone()): Promise<TrackerResult<ActivityDay[]>> {
  const q = new URLSearchParams({ days: String(days) });
  if (tz) q.set("tz", tz);
  return call("GET", `/api/applications/activity?${q.toString()}`);
}

/** The browser's IANA zone ("America/New_York"), or "" when it cannot say. */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

// ---- pure helpers -------------------------------------------------------------------------------------------

/** The list body as a page, whatever came back (the plain legacy array, `{}` or garbage become an empty page). */
export function asListPage(body: unknown): ApplicationListPage {
  if (body && typeof body === "object" && !Array.isArray(body) && Array.isArray((body as ApplicationListPage).items)) {
    const b = body as ApplicationListPage;
    return { items: b.items, total: b.total ?? b.items.length, page: b.page ?? 0, size: b.size ?? b.items.length, summary: b.summary };
  }
  if (Array.isArray(body)) return { items: body as Application[], total: body.length, page: 0, size: body.length };
  return { items: [], total: 0, page: 0, size: 0 };
}

/** "2 days ago": whole minutes / hours / days, then a short date. Pure given `now`. */
export function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Oct 8" (or "Oct 8, 2026" for another year). */
export function shortDay(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** "Thu, Oct 8 · 2:00 PM": a date with its time, in the viewer's zone. */
export function dayAndTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** The status filter value a tab sends (CSV on the wire). */
export function statusCsv(statuses: readonly string[]): string {
  return statuses.join(",");
}
