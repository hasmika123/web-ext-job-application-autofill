/**
 * The Consultant workspace Home's client logic (design/enterprise-consultant/home.webp): the wire types of
 * `GET /api/orgs/{orgId}/me-workspace/home`, a tolerant parser and the small pure helpers the cards use. Nothing here touches React.
 *
 * Rules the page keeps:
 *   - every figure comes from the API's answer; there is no fallback number in this file;
 *   - a block the API flags `sample` (submissions pending, marketer messages, interview mode) is placeholder data for another
 *     role's module and is drawn with a "Sample" marker until the roles merge.
 */

export interface TileData {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
  sample: boolean;
}

export interface MatchRow {
  matchId: number;
  requirementId: number;
  title: string;
  company: string | null;
  score: number;
  location: string | null;
  workMode: string | null;
  employment: string | null;
}

export type OpportunityStatus = "REVIEW_NEEDED" | "AWAITING_APPROVAL" | "INTERESTED";

export interface OpportunityRow {
  matchId: number;
  requirementId: number;
  title: string;
  company: string | null;
  status: OpportunityStatus;
  assignedAt: string | null;
}

export interface ApplicationRow {
  id: number;
  code: string;
  title: string | null;
  company: string | null;
  stage: string;
  closedReason: string | null;
  appliedOn: string | null;
}

export interface InterviewRow {
  id: number;
  scheduledAt: string;
  durationMinutes: number;
  title: string | null;
  company: string | null;
  round: string | null;
  mode: string;
  modeSample: boolean;
}

export interface Check {
  key: string;
  label: string;
  done: boolean;
}

export interface TaskRow {
  id: number;
  title: string;
  dueOn: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: string;
}

export interface MessageRow {
  from: string;
  preview: string;
  at: string;
  unread: boolean;
}

export interface HomeView {
  orgId: number;
  generatedAt: string;
  me: { consultantId: number; name: string; jobTitle: string | null };
  tiles: {
    jobMatches: TileData;
    assignedOpportunities: TileData;
    activeApplications: TileData;
    upcomingInterviews: TileData;
    submissionsPending: TileData;
    activePlacement: { value: number; label: string | null };
  };
  recommendedMatches: MatchRow[];
  assignedOpportunities: OpportunityRow[];
  applications: ApplicationRow[];
  interviews: InterviewRow[];
  resumeStrength: { percent: number; hasResume: boolean; checks: Check[] };
  todaysFocus: { date: string; items: { key: string; label: string }[] };
  tasks: TaskRow[];
  marketerMessages: { sample: boolean; items: MessageRow[] };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function tileOf(v: unknown): TileData {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: typeof d.previous === "number" ? d.previous : null,
    deltaPct: typeof d.deltaPct === "number" && Number.isFinite(d.deltaPct) ? d.deltaPct : null,
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
    sample: d.sample === true,
  };
}

const OPP_STATUSES: readonly string[] = ["REVIEW_NEEDED", "AWAITING_APPROVAL", "INTERESTED"];
const PRIORITIES: readonly string[] = ["HIGH", "MEDIUM", "LOW"];

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseHome(body: unknown): HomeView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.me) || !isObj(body.tiles)) return null;
  const t = body.tiles;
  const rows = <T,>(v: unknown, f: (o: Record<string, unknown>) => T | null): T[] =>
    arr(v)
      .map((o) => (isObj(o) ? f(o) : null))
      .filter((x): x is T => x !== null);
  const strength = isObj(body.resumeStrength) ? body.resumeStrength : {};
  const focus = isObj(body.todaysFocus) ? body.todaysFocus : {};
  const msgs = isObj(body.marketerMessages) ? body.marketerMessages : {};
  const place = isObj(t.activePlacement) ? t.activePlacement : {};
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    me: { consultantId: num(body.me.consultantId), name: typeof body.me.name === "string" ? body.me.name : "", jobTitle: strOrNull(body.me.jobTitle) },
    tiles: {
      jobMatches: tileOf(t.jobMatches),
      assignedOpportunities: tileOf(t.assignedOpportunities),
      activeApplications: tileOf(t.activeApplications),
      upcomingInterviews: tileOf(t.upcomingInterviews),
      submissionsPending: tileOf(t.submissionsPending),
      activePlacement: { value: num(place.value), label: strOrNull(place.label) },
    },
    recommendedMatches: rows(body.recommendedMatches, (o) =>
      typeof o.matchId === "number" && typeof o.title === "string"
        ? { matchId: o.matchId, requirementId: num(o.requirementId), title: o.title, company: strOrNull(o.company), score: num(o.score), location: strOrNull(o.location), workMode: strOrNull(o.workMode), employment: strOrNull(o.employment) }
        : null,
    ),
    assignedOpportunities: rows(body.assignedOpportunities, (o) =>
      typeof o.matchId === "number" && typeof o.title === "string" && typeof o.status === "string" && OPP_STATUSES.includes(o.status)
        ? { matchId: o.matchId, requirementId: num(o.requirementId), title: o.title, company: strOrNull(o.company), status: o.status as OpportunityStatus, assignedAt: strOrNull(o.assignedAt) }
        : null,
    ),
    applications: rows(body.applications, (o) =>
      typeof o.id === "number" && typeof o.stage === "string"
        ? { id: o.id, code: typeof o.code === "string" ? o.code : "", title: strOrNull(o.title), company: strOrNull(o.company), stage: o.stage, closedReason: strOrNull(o.closedReason), appliedOn: strOrNull(o.appliedOn) }
        : null,
    ),
    interviews: rows(body.interviews, (o) =>
      typeof o.id === "number" && typeof o.scheduledAt === "string"
        ? { id: o.id, scheduledAt: o.scheduledAt, durationMinutes: num(o.durationMinutes, 60), title: strOrNull(o.title), company: strOrNull(o.company), round: strOrNull(o.round), mode: typeof o.mode === "string" ? o.mode : "VIDEO", modeSample: o.modeSample === true }
        : null,
    ),
    resumeStrength: {
      percent: Math.max(0, Math.min(100, num(strength.percent))),
      hasResume: strength.hasResume === true,
      checks: rows(strength.checks, (o) => (typeof o.key === "string" && typeof o.label === "string" ? { key: o.key, label: o.label, done: o.done === true } : null)),
    },
    todaysFocus: {
      date: typeof focus.date === "string" ? focus.date : "",
      items: rows(focus.items, (o) => (typeof o.key === "string" && typeof o.label === "string" ? { key: o.key, label: o.label } : null)),
    },
    tasks: rows(body.tasks, (o) =>
      typeof o.id === "number" && typeof o.title === "string"
        ? { id: o.id, title: o.title, dueOn: strOrNull(o.dueOn), priority: (PRIORITIES.includes(String(o.priority)) ? o.priority : "MEDIUM") as TaskRow["priority"], status: typeof o.status === "string" ? o.status : "NOT_STARTED" }
        : null,
    ),
    marketerMessages: {
      sample: msgs.sample === true,
      items: rows(msgs.items, (o) => (typeof o.from === "string" && typeof o.preview === "string" && typeof o.at === "string" ? { from: o.from, preview: o.preview, at: o.at, unread: o.unread === true } : null)),
    },
  };
}

/* ── labels and tones ────────────────────────────────────────────────────────────── */

export type Tone = "green" | "amber" | "blue" | "red" | "violet" | "slate";

/** The match pill: 90+ green, 75-89 amber-green, below that amber (the board shows 92/88/85 green and 78/76 amber). */
export const matchTone = (score: number): Tone => (score >= 80 ? "green" : "amber");

export const OPPORTUNITY_LABELS: Record<OpportunityStatus, { label: string; tone: Tone }> = {
  REVIEW_NEEDED: { label: "Review Needed", tone: "amber" },
  AWAITING_APPROVAL: { label: "Awaiting Approval", tone: "blue" },
  INTERESTED: { label: "Interested", tone: "green" },
};

/** Application stage as the consultant reads it (the board: Submitted, Under Review, Interview Scheduled, Not Selected). */
export function applicationLabel(stage: string, closedReason: string | null): { label: string; tone: Tone } {
  switch (stage) {
    case "ASSIGNED":
      return { label: "Prepared", tone: "violet" };
    case "SUBMITTED":
      return { label: "Submitted", tone: "blue" };
    case "UNDER_REVIEW":
      return { label: "Under Review", tone: "amber" };
    case "INTERVIEWING":
      return { label: "Interview Scheduled", tone: "green" };
    case "OFFER":
      return { label: "Offer", tone: "green" };
    case "CLOSED":
      return closedReason === "HIRED" ? { label: "Hired", tone: "green" } : closedReason === "WITHDRAWN" ? { label: "Withdrawn", tone: "slate" } : { label: "Not Selected", tone: "red" };
    default:
      return { label: stage.charAt(0) + stage.slice(1).toLowerCase().replace(/_/g, " "), tone: "slate" };
  }
}

export const PRIORITY_TONE: Record<TaskRow["priority"], Tone> = { HIGH: "red", MEDIUM: "amber", LOW: "green" };

export function taskStatusLabel(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "IN_PROGRESS":
      return { label: "In Progress", tone: "blue" };
    case "PENDING":
      return { label: "Pending", tone: "amber" };
    default:
      return { label: "Not Started", tone: "slate" };
  }
}

/** "Contract", "Full-time", "C2C" from the stored label. */
export function employmentLabel(e: string | null): string | null {
  if (!e) return null;
  if (e === "FTE") return "Full-time";
  if (e === "C2C") return "C2C";
  return e.charAt(0) + e.slice(1).toLowerCase();
}

/** "Remote" / "Hybrid" / "Onsite", or the city label when the job has one and is not remote. */
export function placeLabel(location: string | null, workMode: string | null): string {
  if (workMode === "REMOTE") return "Remote";
  if (workMode === "HYBRID" && !location) return "Hybrid";
  return location ?? (workMode ? workMode.charAt(0) + workMode.slice(1).toLowerCase() : "Not specified");
}

/** Two letters for a company avatar: "TechCorp" -> "TC", "Global Media" -> "GM". */
export function initialsOf(name: string | null): string {
  if (!name) return "?";
  const words = name.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) {
    const caps = words[0].match(/[A-Z]/g);
    return (caps && caps.length >= 2 ? caps.slice(0, 2).join("") : words[0].slice(0, 2)).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The change chip text and direction from the API's own percentage; null (draw nothing) when there is none. */
export function deltaText(pct: number | null): { dir: "up" | "down" | "flat"; text: string } | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct === 0) return { dir: "flat", text: "0%" };
  const abs = Math.abs(pct);
  return { dir: pct > 0 ? "up" : "down", text: `${abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10}%` };
}

/** "Oct 12, 2024" from a date or timestamp (UTC, so the day never moves with the viewer's zone). */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The interview block: { month: "OCT", day: "15", line1: "Tue, Oct 15, 2024", line2: "10:00 AM – 11:00 AM" } in the viewer's zone. */
export function interviewWhen(iso: string, minutes: number): { month: string; day: string; line1: string; line2: string } {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return { month: "", day: "", line1: "", line2: "" };
  const end = new Date(start.getTime() + minutes * 60_000);
  const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return {
    month: start.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(start.getDate()),
    line1: start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
    line2: `${time(start)} – ${time(end)}`,
  };
}

/** The first name for a greeting. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || "there";

/* ── the BFF call (the browser talks to Next, Next to the API) ───────────────────── */

export interface HomeFetch {
  kind: "OK" | "DENIED" | "FAILED";
  view?: HomeView;
}

export async function fetchHome(orgId: number | string, signal?: AbortSignal): Promise<HomeFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/me-workspace/home`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseHome(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
