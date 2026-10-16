/**
 * The Consultant workspace Assigned Opportunities page's client logic (design/enterprise-consultant/opportunities.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/opportunities` (+ `/{matchId}` detail and the write calls), tolerant parsers and the pure helpers the
 * page uses (labels, due text, next steps). Nothing here touches React and there is no fallback number: every figure is the API's answer.
 */
import { initialsOf, type Tone } from "./home";
import { parseJobSource, type JobSource } from "./jobSource";

export type OppStatus = "NEW" | "AWAITING_RESPONSE" | "IN_REVIEW" | "DECLINED";
export type OppPriority = "HIGH" | "MEDIUM" | "LOW";
export type SortKey = "due" | "priority" | "newest";

export interface OppTile {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
}

export interface OppRow extends JobSource {
  matchId: number;
  requirementId: number;
  title: string;
  skills: string[];
  company: string | null;
  location: string | null;
  workMode: string | null;
  marketer: string | null;
  status: OppStatus;
  priority: OppPriority;
  priorityDerived: boolean;
  dueOn: string | null;
  dueDerived: boolean;
  daysLeft: number;
  score: number;
  missingSkills: number;
  interestSent: boolean;
  assignedAt: string | null;
  /** Set once the consultant pressed "I applied" (MKT-24); null = not yet. */
  appliedAt: string | null;
}

export interface NextSteps {
  toRespond: number;
  soonestDueDays: number | null;
  resumeGaps: number;
  upcomingInterviews: number;
  hasMarketer: boolean;
}

export interface OppView {
  orgId: number;
  generatedAt: string;
  name: string;
  tiles: { total: OppTile; high: OppTile; awaiting: OppTile; inReview: OppTile; declined: OppTile };
  rows: OppRow[];
  page: number;
  size: number;
  total: number;
  sort: SortKey;
  nextSteps: NextSteps;
}

export interface TimelineEvent {
  key: string;
  label: string;
  at: string | null;
}

export interface OppDetail {
  row: OppRow;
  description: string | null;
  employment: string | null;
  duration: string | null;
  experienceLevel: string | null;
  skills: { skill: string; present: boolean }[];
  rateMinMinor: number | null;
  rateMaxMinor: number | null;
  rateUnit: string | null;
  currency: string | null;
  reason: string | null;
  declineReason: string | null;
  infoRequest: string | null;
  resumeUpdateNote: string | null;
  interestSentAt: string | null;
  timeline: TimelineEvent[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const STATUSES: readonly string[] = ["NEW", "AWAITING_RESPONSE", "IN_REVIEW", "DECLINED"];
const PRIORITIES: readonly string[] = ["HIGH", "MEDIUM", "LOW"];

function tileOf(v: unknown): OppTile {
  const d = isObj(v) ? v : {};
  return { value: num(d.value), previous: numOrNull(d.previous), deltaPct: numOrNull(d.deltaPct), sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)) };
}

export function parseRow(o: unknown): OppRow | null {
  if (!isObj(o) || typeof o.matchId !== "number" || typeof o.title !== "string") return null;
  return {
    matchId: o.matchId,
    requirementId: num(o.requirementId),
    title: o.title,
    skills: arr(o.skills).filter((s): s is string => typeof s === "string" && s !== ""),
    company: strOrNull(o.company),
    location: strOrNull(o.location),
    workMode: strOrNull(o.workMode),
    marketer: strOrNull(o.marketer),
    status: typeof o.status === "string" && STATUSES.includes(o.status) ? (o.status as OppStatus) : "NEW",
    priority: typeof o.priority === "string" && PRIORITIES.includes(o.priority) ? (o.priority as OppPriority) : "MEDIUM",
    priorityDerived: o.priorityDerived === true,
    dueOn: strOrNull(o.dueOn),
    dueDerived: o.dueDerived === true,
    daysLeft: num(o.daysLeft),
    score: Math.max(0, Math.min(100, num(o.score))),
    missingSkills: Math.max(0, num(o.missingSkills)),
    interestSent: o.interestSent === true,
    assignedAt: strOrNull(o.assignedAt),
    appliedAt: strOrNull(o.appliedAt),
    ...parseJobSource(o),
  };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseOpportunities(body: unknown): OppView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles)) return null;
  const t = body.tiles;
  const n = isObj(body.nextSteps) ? body.nextSteps : {};
  const sort = body.sort === "priority" || body.sort === "newest" ? body.sort : "due";
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    name: typeof body.name === "string" ? body.name : "",
    tiles: { total: tileOf(t.total), high: tileOf(t.high), awaiting: tileOf(t.awaiting), inReview: tileOf(t.inReview), declined: tileOf(t.declined) },
    rows: arr(body.rows).map(parseRow).filter((r): r is OppRow => r !== null),
    page: num(body.page),
    size: num(body.size, 50),
    total: num(body.total),
    sort,
    nextSteps: {
      toRespond: num(n.toRespond),
      soonestDueDays: numOrNull(n.soonestDueDays),
      resumeGaps: num(n.resumeGaps),
      upcomingInterviews: num(n.upcomingInterviews),
      hasMarketer: n.hasMarketer === true,
    },
  };
}

export function parseDetail(body: unknown): OppDetail | null {
  if (!isObj(body)) return null;
  const row = parseRow(body.row);
  if (!row) return null;
  return {
    row,
    description: strOrNull(body.description),
    employment: strOrNull(body.employment),
    duration: strOrNull(body.duration),
    experienceLevel: strOrNull(body.experienceLevel),
    skills: arr(body.skills).flatMap((o) => (isObj(o) && typeof o.skill === "string" ? [{ skill: o.skill, present: o.present === true }] : [])),
    rateMinMinor: numOrNull(body.rateMinMinor),
    rateMaxMinor: numOrNull(body.rateMaxMinor),
    rateUnit: strOrNull(body.rateUnit),
    currency: strOrNull(body.currency),
    reason: strOrNull(body.reason),
    declineReason: strOrNull(body.declineReason),
    infoRequest: strOrNull(body.infoRequest),
    resumeUpdateNote: strOrNull(body.resumeUpdateNote),
    interestSentAt: strOrNull(body.interestSentAt),
    timeline: arr(body.timeline).flatMap((o) => (isObj(o) && typeof o.key === "string" && typeof o.label === "string" ? [{ key: o.key, label: o.label, at: strOrNull(o.at) }] : [])),
  };
}

/* ── labels and helpers ───────────────────────────────────────────────────────────────── */

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "due", label: "Due Date (Soonest)" },
  { key: "priority", label: "Priority" },
  { key: "newest", label: "Newest" },
];

export const STATUS_LABEL: Record<OppStatus, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "blue" },
  AWAITING_RESPONSE: { label: "Awaiting Response", tone: "amber" },
  IN_REVIEW: { label: "In Review", tone: "violet" },
  DECLINED: { label: "Declined", tone: "red" },
};

export const PRIORITY_LABEL: Record<OppPriority, { label: string; tone: Tone }> = {
  HIGH: { label: "High", tone: "red" },
  MEDIUM: { label: "Medium", tone: "amber" },
  LOW: { label: "Low", tone: "green" },
};

/** "2 days left", "1 day left", "Due today", "3 days overdue". */
export function daysLeftText(days: number): string {
  if (days === 0) return "Due today";
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} left`;
  const d = Math.abs(days);
  return `${d} day${d === 1 ? "" : "s"} overdue`;
}

/** Coral from 3 days left down, and when overdue. A declined opportunity is no longer pressing. */
export const dueUrgent = (r: Pick<OppRow, "daysLeft" | "status">): boolean => r.status !== "DECLINED" && r.daysLeft <= 3;

/** Opportunities the quick actions can act on: a declined one only offers reopen. */
export const canRespond = (r: Pick<OppRow, "status">): boolean => r.status !== "DECLINED";

/** "I applied" is offered while the opportunity is open and not yet marked applied. */
export const canMarkApplied = (r: Pick<OppRow, "status" | "appliedAt">): boolean => canRespond(r) && !r.appliedAt;

/** The row the quick actions act on: the picked one while it exists, else the first row. */
export function actionTarget(rows: OppRow[], picked: number | null): OppRow | null {
  return rows.find((r) => r.matchId === picked) ?? rows[0] ?? null;
}

export interface Step {
  key: "respond" | "resume" | "interviews" | "marketer";
  title: string;
  text: string;
  href: string | null;
}

/** "Recommended Next Steps", derived only from the counts the API sends. Steps with nothing to do are left out (the marketer step stays). */
export function nextSteps(n: NextSteps, base: string): Step[] {
  const steps: Step[] = [];
  if (n.toRespond > 0)
    steps.push({
      key: "respond",
      title: `Respond to ${n.toRespond} ${n.toRespond === 1 ? "opportunity" : "opportunities"}`,
      text: n.soonestDueDays !== null && n.soonestDueDays < 0 ? "Share your interest or ask for more info. One is overdue." : "Share your interest or ask for more info before the due date.",
      href: null,
    });
  if (n.resumeGaps > 0)
    steps.push({ key: "resume", title: "Update your resume", text: `${n.resumeGaps} ${n.resumeGaps === 1 ? "role lists" : "roles list"} skills your profile lacks.`, href: `${base}/resumes` });
  if (n.upcomingInterviews > 0)
    steps.push({ key: "interviews", title: "Prepare for upcoming interviews", text: `You have ${n.upcomingInterviews} upcoming ${n.upcomingInterviews === 1 ? "interview" : "interviews"}.`, href: `${base}/interview-prep` });
  steps.push({ key: "marketer", title: "Discuss priorities with your marketer", text: n.hasMarketer ? "Align on your career goals and preferences." : "Priorities are set by your marketer once one is assigned.", href: `${base}/marketer` });
  return steps;
}

/** The rate as "$85-95/hr", "$120k/yr", or null when none (minor units: cents). */
export function rateText(m: Pick<OppDetail, "rateMinMinor" | "rateMaxMinor" | "rateUnit" | "currency">): string | null {
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

export { initialsOf };

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/opportunities`;

async function read<T>(url: string, parse: (b: unknown) => T | null, signal?: AbortSignal): Promise<Fetched<T>> {
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

export const fetchOpportunities = (orgId: number | string, sort: SortKey = "due", signal?: AbortSignal) => read(`${base(orgId)}?sort=${sort}&size=50`, parseOpportunities, signal);
export const fetchDetail = (orgId: number | string, matchId: number, signal?: AbortSignal) => read(`${base(orgId)}/${matchId}`, parseDetail, signal);

export interface WriteResult {
  ok: boolean;
  /** The API's own message for a refusal (for example the sensitive-data one), when it sent one. */
  message?: string;
}

async function write(url: string, body?: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown; message?: unknown } | null;
    const m = j && typeof j.error === "string" ? j.error : j && typeof j.detail === "string" ? j.detail : j && typeof j.message === "string" ? j.message : undefined;
    return { ok: false, message: m };
  } catch {
    return { ok: false };
  }
}

export const expressInterest = (orgId: number, matchId: number, note?: string) => write(`${base(orgId)}/${matchId}/express-interest`, note ? { note } : {});
export const needMoreInfo = (orgId: number, matchId: number, message: string) => write(`${base(orgId)}/${matchId}/need-more-info`, { message });
export const decline = (orgId: number, matchId: number, reason: string) => write(`${base(orgId)}/${matchId}/decline`, { reason });
export const reopen = (orgId: number, matchId: number) => write(`${base(orgId)}/${matchId}/reopen`);
/** "I applied": the consultant applied themselves on the source site. Only records it for the marketer; Kiwiply never applies or submits. Idempotent. */
export const markApplied = (orgId: number, matchId: number) => write(`${base(orgId)}/${matchId}/applied`);
export const requestResumeUpdate = (orgId: number, matchId: number, note?: string) => write(`${base(orgId)}/${matchId}/request-resume-update`, note ? { note } : {});
