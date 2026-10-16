/**
 * The Consultant workspace My Applications page's client logic (design/enterprise-consultant/applications.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/applications` (+ `/{applicationId}` detail), tolerant parsers and the pure helpers the page uses
 * (stage / source labels, next step, status updates text). The page is read-only: the marketer prepares, the consultant submits outside
 * Kiwiply. Nothing here touches React and there is no fallback number: every figure is the API's answer.
 */
import type { ChangeActor } from "@/lib/actors";
import { initialsOf, type Tone } from "./home";

export interface AppTile {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
}

export interface AppRow {
  applicationId: number;
  code: string;
  requirementId: number;
  title: string | null;
  company: string | null;
  appliedOn: string | null;
  source: string | null;
  stage: string;
  closedReason: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
}

export type FunnelKey = "TOTAL" | "UNDER_REVIEW" | "INTERVIEWING" | "OFFER" | "REJECTED";
export interface FunnelStep {
  key: FunnelKey;
  count: number;
  percent: number | null;
}

export type Actor = "YOU" | "MARKETER" | "TEAM";
export interface StatusUpdate {
  id: number;
  applicationId: number;
  toStage: string;
  closedReason: string | null;
  title: string | null;
  company: string | null;
  by: Actor;
  at: string;
}

export interface StatusOption {
  key: string;
  count: number;
}

export interface Paging {
  page: number;
  size: number;
  total: number;
  pages: number;
}

export interface ApplicationsView {
  orgId: number;
  generatedAt: string;
  name: string;
  tiles: { total: AppTile; underReview: AppTile; interviews: AppTile; rejected: AppTile; offers: AppTile };
  rows: AppRow[];
  paging: Paging;
  status: string;
  sort: string;
  statuses: StatusOption[];
  funnel: FunnelStep[];
  recent: StatusUpdate[];
}

export interface TimelineEntry {
  id: number;
  type: "CREATED" | "STAGE_CHANGE";
  fromStage: string | null;
  toStage: string;
  /** The original YOU | MARKETER | TEAM word; `actor` is who did it by name, with the relation to this consultant (change audit). */
  by: Actor;
  actor: ChangeActor | null;
  at: string;
}

export interface AppDetail {
  row: AppRow;
  createdAt: string | null;
  stageChangedAt: string | null;
  timeline: TimelineEntry[];
  updatedAt: string | null;
  updatedBy: ChangeActor | null;
  createdBy: ChangeActor | null;
}

/** An API `ChangeActorDTO`, or null for anything else (a malformed answer never breaks the sheet). */
export function changeActorOf(v: unknown): ChangeActor | null {
  if (!isObj(v) || typeof v.label !== "string" || typeof v.kind !== "string") return null;
  return {
    userId: numOrNull(v.userId),
    memberId: numOrNull(v.memberId),
    label: v.label,
    relation: typeof v.relation === "string" ? v.relation : null,
    kind: v.kind,
  };
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

const ACTORS: readonly string[] = ["YOU", "MARKETER", "TEAM"];
const actorOf = (v: unknown): Actor => (typeof v === "string" && ACTORS.includes(v) ? (v as Actor) : "TEAM");
const FUNNEL_KEYS: readonly string[] = ["TOTAL", "UNDER_REVIEW", "INTERVIEWING", "OFFER", "REJECTED"];

function tileOf(v: unknown): AppTile {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: numOrNull(d.previous),
    deltaPct: numOrNull(d.deltaPct),
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
  };
}

export function parseRow(o: unknown): AppRow | null {
  if (!isObj(o) || typeof o.applicationId !== "number" || typeof o.stage !== "string") return null;
  return {
    applicationId: o.applicationId,
    code: typeof o.code === "string" ? o.code : "",
    requirementId: num(o.requirementId),
    title: strOrNull(o.title),
    company: strOrNull(o.company),
    appliedOn: strOrNull(o.appliedOn),
    source: strOrNull(o.source),
    stage: o.stage,
    closedReason: strOrNull(o.closedReason),
    nextAction: strOrNull(o.nextAction),
    nextActionDue: strOrNull(o.nextActionDue),
  };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseApplications(body: unknown): ApplicationsView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles)) return null;
  const t = body.tiles;
  const p = isObj(body.paging) ? body.paging : {};
  const list = arr(body.rows)
    .map(parseRow)
    .filter((r): r is AppRow => r !== null);
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    name: typeof body.name === "string" ? body.name : "",
    tiles: { total: tileOf(t.total), underReview: tileOf(t.underReview), interviews: tileOf(t.interviews), rejected: tileOf(t.rejected), offers: tileOf(t.offers) },
    rows: list,
    paging: { page: num(p.page), size: num(p.size, 10), total: num(p.total, list.length), pages: num(p.pages, list.length ? 1 : 0) },
    status: typeof body.status === "string" ? body.status : "ALL",
    sort: typeof body.sort === "string" ? body.sort : "applied",
    statuses: rows(body.statuses, (o) => (typeof o.key === "string" ? { key: o.key, count: num(o.count) } : null)),
    funnel: rows(body.funnel, (o) => (typeof o.key === "string" && FUNNEL_KEYS.includes(o.key) ? { key: o.key as FunnelKey, count: num(o.count), percent: numOrNull(o.percent) } : null)),
    recent: rows(body.recent, (o) =>
      typeof o.id === "number" && typeof o.toStage === "string" && typeof o.at === "string"
        ? { id: o.id, applicationId: num(o.applicationId), toStage: o.toStage, closedReason: strOrNull(o.closedReason), title: strOrNull(o.title), company: strOrNull(o.company), by: actorOf(o.by), at: o.at }
        : null,
    ),
  };
}

export function parseDetail(body: unknown): AppDetail | null {
  if (!isObj(body)) return null;
  const row = parseRow(body.row);
  if (!row) return null;
  return {
    row,
    createdAt: strOrNull(body.createdAt),
    stageChangedAt: strOrNull(body.stageChangedAt),
    timeline: rows(body.timeline, (o) =>
      typeof o.id === "number" && typeof o.toStage === "string" && typeof o.at === "string"
        ? { id: o.id, type: o.type === "CREATED" ? "CREATED" : "STAGE_CHANGE", fromStage: strOrNull(o.fromStage), toStage: o.toStage, by: actorOf(o.by), actor: changeActorOf(o.actor), at: o.at }
        : null,
    ),
    updatedAt: strOrNull(body.updatedAt),
    updatedBy: changeActorOf(body.updatedBy),
    createdBy: changeActorOf(body.createdBy),
  };
}

/* ── labels ───────────────────────────────────────────────────────────────────────────── */

/** The stage as the consultant reads it. Only stages the data has: there is no "Phone Screen" in the pipeline, so none is drawn. */
export function stageLabel(stage: string, closedReason: string | null): { label: string; tone: Tone } {
  switch (stage) {
    case "ASSIGNED":
      return { label: "Prepared", tone: "violet" };
    case "SUBMITTED":
      return { label: "Submitted", tone: "blue" };
    case "UNDER_REVIEW":
      return { label: "Under Review", tone: "blue" };
    case "INTERVIEWING":
      return { label: "Interview Scheduled", tone: "violet" };
    case "OFFER":
      return { label: "Offer", tone: "green" };
    case "CLOSED":
      return closedReason === "HIRED"
        ? { label: "Hired", tone: "green" }
        : closedReason === "REJECTED"
          ? { label: "Rejected", tone: "red" }
          : closedReason === "WITHDRAWN"
            ? { label: "Withdrawn", tone: "slate" }
            : closedReason === "NO_RESPONSE"
              ? { label: "No Response", tone: "slate" }
              : { label: "Closed", tone: "slate" };
    default:
      return { label: stage.charAt(0) + stage.slice(1).toLowerCase().replace(/_/g, " "), tone: "slate" };
  }
}

const SOURCES: Record<string, Tone> = { "job match": "violet", "job discovery": "blue", "marketer referral": "green", "direct apply": "slate" };

/** The stored source label as given; the four the board names get their own colour, any other label is shown as it is. */
export function sourceBadge(source: string | null): { label: string; tone: Tone } | null {
  if (!source) return null;
  return { label: source, tone: SOURCES[source.trim().toLowerCase()] ?? "slate" };
}

/** The filter and the funnel use these words. */
export const STATUS_LABELS: Record<string, string> = {
  ALL: "All Statuses",
  ASSIGNED: "Prepared",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  INTERVIEWING: "Interview Scheduled",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  NO_RESPONSE: "No Response",
};
export const statusLabel = (key: string): string => STATUS_LABELS[key] ?? key;

export const FUNNEL_LABELS: Record<FunnelKey, string> = {
  TOTAL: "Total Applications",
  UNDER_REVIEW: "Under Review",
  INTERVIEWING: "Interview Scheduled",
  OFFER: "Offers",
  REJECTED: "Rejected",
};

export type SortKey = "applied" | "company" | "stage";
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "applied", label: "Applied Date" },
  { key: "company", label: "Company" },
  { key: "stage", label: "Stage" },
];

/** The next step as two lines: what, and by when; null when the application has none (a closed one). */
export function nextStep(r: Pick<AppRow, "nextAction" | "nextActionDue">): { action: string; due: string } | null {
  if (!r.nextAction) return null;
  return { action: r.nextAction, due: formatDate(r.nextActionDue) };
}

/** "Oct 12, 2024" from a date or timestamp (UTC, so the day never moves with the viewer's zone); "" for none. */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The time of a status update in the viewer's zone, "11:32 AM"; "" for none. */
export function formatTime(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export const ACTOR_LABELS: Record<Actor, string> = { YOU: "You", MARKETER: "Your marketer", TEAM: "The team" };

/** One status update as a title and a sentence, from the stage it moved to. */
export function updateText(u: Pick<StatusUpdate, "toStage" | "closedReason" | "title" | "company">): { title: string; body: string; tone: "blue" | "green" | "red" | "violet" | "slate" } {
  const at = u.company ? ` at ${u.company}` : "";
  const role = u.title ? ` for ${u.title}` : "";
  switch (u.toStage) {
    case "ASSIGNED":
      return { title: "Application Prepared", body: `Your marketer prepared your application${at}${role}.`, tone: "violet" };
    case "SUBMITTED":
      return { title: "Application Submitted", body: `Your application${at}${role} was submitted.`, tone: "blue" };
    case "UNDER_REVIEW":
      return { title: "Application Under Review", body: `Your application${at} is under review.`, tone: "blue" };
    case "INTERVIEWING":
      return { title: "Interview Scheduled", body: `You are in the interview stage${at}${role}.`, tone: "violet" };
    case "OFFER":
      return { title: "Offer Received", body: `You received an offer${u.company ? ` from ${u.company}` : ""}${role}.`, tone: "green" };
    case "CLOSED": {
      if (u.closedReason === "HIRED") return { title: "Hired", body: `You were hired${at}${role}.`, tone: "green" };
      if (u.closedReason === "REJECTED") return { title: "Application Rejected", body: `Your application${at} was not selected${role}.`, tone: "red" };
      if (u.closedReason === "WITHDRAWN") return { title: "Application Withdrawn", body: `Your application${at} was withdrawn.`, tone: "slate" };
      if (u.closedReason === "NO_RESPONSE") return { title: "No Response", body: `The client${at} has not responded.`, tone: "slate" };
      return { title: "Application Closed", body: `Your application${at} was closed.`, tone: "slate" };
    }
    default:
      return { title: statusLabel(u.toStage), body: `Your application${at} moved to ${statusLabel(u.toStage)}.`, tone: "slate" };
  }
}

/** Funnel bar width in percent of the track: proportional to the count, at least 6% when there is one so it stays visible; 0 for none. */
export function barWidth(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Math.max(6, Math.min(100, (count / total) * 100));
}

export const percentText = (p: number | null): string => (p === null ? "" : `${Number.isInteger(p) ? p : Math.round(p)}%`);

export { initialsOf };

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

export interface ListQuery {
  status: string;
  sort: SortKey;
  page: number;
  size: number;
}
export const DEFAULT_QUERY: ListQuery = { status: "ALL", sort: "applied", page: 0, size: 10 };

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/applications`;

export function listUrl(orgId: number | string, q: ListQuery): string {
  const p = new URLSearchParams();
  if (q.status !== "ALL") p.set("status", q.status);
  if (q.sort !== "applied") p.set("sort", q.sort);
  if (q.page > 0) p.set("page", String(q.page));
  if (q.size !== 10) p.set("size", String(q.size));
  const s = p.toString();
  return s ? `${base(orgId)}?${s}` : base(orgId);
}

export async function fetchApplications(orgId: number | string, q: ListQuery = DEFAULT_QUERY, signal?: AbortSignal): Promise<Fetched<ApplicationsView>> {
  try {
    const res = await fetch(listUrl(orgId, q), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseApplications(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export async function fetchDetail(orgId: number | string, applicationId: number, signal?: AbortSignal): Promise<Fetched<AppDetail>> {
  try {
    const res = await fetch(`${base(orgId)}/${applicationId}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseDetail(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
