/**
 * Client-side interview helpers for the applications tracker (APP-E2E U6.4): the types, the fetchers the
 * detail sheet's Interview tab and the dashboard call, and the "Add to calendar" links. Browser code only
 * calls the Next BFF (`/api/interviews/**`, `/api/applications/:id/interviews/**`); each fetcher maps the
 * HTTP outcome to a small tagged result and never throws. Pure helpers (titles, the Google Calendar link,
 * "waiting for a result") are separate so they can be tested without a network.
 */

export const INTERVIEW_KINDS = [
  { value: "PHONE", label: "Phone screen" },
  { value: "VIDEO", label: "Video call" },
  { value: "ONSITE", label: "Onsite" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "BEHAVIORAL", label: "Behavioral" },
  { value: "PANEL", label: "Panel" },
  { value: "OTHER", label: "Other" },
] as const;

export type InterviewKind = (typeof INTERVIEW_KINDS)[number]["value"];

export const INTERVIEW_OUTCOMES = [
  { value: "PENDING", label: "Waiting" },
  { value: "PASSED", label: "Went well" },
  { value: "REJECTED", label: "Didn't go through" },
  { value: "NO_SHOW", label: "Didn't happen" },
] as const;

export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number]["value"];

/** What the API returns for an interview (`InterviewDTO`); `company` / `roleTitle` name its application. */
export interface Interview {
  id: number;
  applicationId: number;
  company: string | null;
  roleTitle: string | null;
  kind: InterviewKind;
  startsAt: string;
  endsAt: string | null;
  tz: string | null;
  location: string | null;
  interviewer: string | null;
  notes: string | null;
  outcome: InterviewOutcome;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** The fields a form sends; on update only the changed ones, and `null` clears the optional ones. */
export interface InterviewInput {
  kind: InterviewKind;
  startsAt: string;
  endsAt?: string | null;
  tz?: string | null;
  location?: string | null;
  interviewer?: string | null;
  notes?: string | null;
}

export type InterviewResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "error"; message: string; code?: string; path?: string; status?: number };

interface Problem {
  code?: string;
  path?: string;
  message?: string;
  error?: string;
  detail?: string;
  title?: string;
}

const SESSION = "Your session expired — please sign in again.";

async function call<T>(method: string, url: string, body?: unknown, parse = true): Promise<InterviewResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return { kind: "ok", data: (parse && res.status !== 204 ? await res.json() : undefined) as T };
    if (res.status === 401) return { kind: "error", status: 401, message: SESSION };
    const p = (await res.json().catch(() => null)) as Problem | null;
    if (res.status === 404) return { kind: "error", status: 404, code: p?.code, message: "That interview is no longer there." };
    if (p?.code === "SENSITIVE_CONTENT") {
      return { kind: "error", status: res.status, code: p.code, path: p.path, message: p.message ?? "That looks like something we never store (an ID or bank number). Please remove it." };
    }
    return { kind: "error", status: res.status, code: p?.code, path: p?.path, message: p?.message ?? p?.error ?? p?.detail ?? p?.title ?? "Couldn't save the interview." };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}

/** `GET /api/interviews`: interviews starting in `[from, to)`, soonest first. Dates (`yyyy-MM-dd`) or ISO instants. */
export function listInterviews(range: { from?: string; to?: string; outcome?: InterviewOutcome } = {}): Promise<InterviewResult<Interview[]>> {
  const q = new URLSearchParams();
  if (range.from) q.set("from", range.from);
  if (range.to) q.set("to", range.to);
  if (range.outcome) q.set("outcome", range.outcome);
  const s = q.toString();
  return call("GET", `/api/interviews${s ? `?${s}` : ""}`);
}

export function createInterview(applicationId: number, input: InterviewInput): Promise<InterviewResult<Interview>> {
  return call("POST", `/api/applications/${applicationId}/interviews`, input);
}

/** Partial update, safe to call per field from an autosave. */
export function updateInterview(applicationId: number, id: number, patch: Partial<InterviewInput>): Promise<InterviewResult<Interview>> {
  return call("PUT", `/api/applications/${applicationId}/interviews/${id}`, patch);
}

export function deleteInterview(applicationId: number, id: number): Promise<InterviewResult<undefined>> {
  return call("DELETE", `/api/applications/${applicationId}/interviews/${id}`, undefined, false);
}

export function setInterviewOutcome(applicationId: number, id: number, outcome: InterviewOutcome): Promise<InterviewResult<Interview>> {
  return call("POST", `/api/applications/${applicationId}/interviews/${id}/outcome`, { outcome });
}

// ---- pure helpers ---------------------------------------------------------------------------------------

/** The calendar file for one interview (a download: the BFF sends it as an attachment). */
export function icsHref(id: number): string {
  return `/api/interviews/${id}/ics`;
}

export function kindLabel(kind: string): string {
  return INTERVIEW_KINDS.find((k) => k.value === kind)?.label ?? "Interview";
}

/** "Video call with Acme" / "Interview": what a list row and a calendar entry call it. */
export function interviewTitle(i: Pick<Interview, "kind" | "company" | "roleTitle">): string {
  const what = kindLabel(i.kind);
  return i.company ? `${what} with ${i.company}` : what;
}

/** `20261010T140000Z`: the form Google Calendar's `dates` parameter takes. */
function compactUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * "Add to Google Calendar": a prefilled event link (built here, nothing goes to our server). Times are sent
 * in UTC, which Google shows in the viewer's own zone; with no end time the event runs `defaultMinutes`
 * (the same length the .ics export uses, 60 unless the page knows the server's setting).
 */
export function googleCalendarUrl(i: Pick<Interview, "kind" | "company" | "roleTitle" | "startsAt" | "endsAt" | "location" | "interviewer">, defaultMinutes = 60): string {
  const end = i.endsAt ?? new Date(new Date(i.startsAt).getTime() + defaultMinutes * 60_000).toISOString();
  const details = [i.roleTitle ? `Role: ${i.roleTitle}` : null, i.interviewer ? `Interviewer: ${i.interviewer}` : null, "From your Kiwiply tracker."].filter(Boolean).join("\n");
  const q = new URLSearchParams({ action: "TEMPLATE", text: interviewTitle(i), dates: `${compactUtc(i.startsAt)}/${compactUtc(end)}`, details });
  if (i.location) q.set("location", i.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** An interview that has happened (or should have) and still has no result: the dashboard asks "How did it go?". */
export function needsOutcome(i: Pick<Interview, "startsAt" | "endsAt" | "outcome">, now: Date = new Date()): boolean {
  if (i.outcome !== "PENDING") return false;
  const over = new Date(i.endsAt ?? i.startsAt).getTime();
  return over < now.getTime();
}
