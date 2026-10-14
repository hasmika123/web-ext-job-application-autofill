/**
 * The Consultant workspace My Placement page's client logic (design/enterprise-consultant/placements.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/placements` (+ the checklist PUT and the status-note POST), tolerant parsers and the pure helpers the page
 * uses (weeks / days wording, duration, status pills, meeting blocks). Nothing here touches React, and no rate exists anywhere in these types:
 * a consultant does not see the bill rate. Every figure is the API's answer.
 */
import { shortDate, type Tone } from "./home";

export type EngagementStatus = "ON_TRACK" | "AT_RISK" | "NEEDS_ATTENTION";
const ENGAGEMENT: readonly string[] = ["ON_TRACK", "AT_RISK", "NEEDS_ATTENTION"];

export interface Placement {
  id: number;
  roleTitle: string;
  status: string;
  clientName: string | null;
  endClientName: string | null;
  projectName: string | null;
  locationLabel: string | null;
  workMode: string | null;
  managerName: string | null;
  managerTitle: string | null;
  hoursPerWeek: number | null;
  scheduleLabel: string | null;
  engagementStatus: EngagementStatus | null;
  statusNote: string | null;
  /** yyyy-mm-dd */
  startDate: string;
  endDate: string | null;
  nextCheckIn: string | null;
  durationMonths: number;
  openEnded: boolean;
  billable: boolean;
  /** The employer-side facts are demo stand-ins until those roles are connected. */
  sample: boolean;
}

export interface Marketer {
  memberId: number;
  name: string;
  title: string | null;
}

export interface ChecklistItem {
  id: number;
  label: string;
  dueOn: string | null;
  completedAt: string | null;
}

export interface Milestone {
  id: number;
  label: string;
  description: string | null;
  onDate: string;
  completed: boolean;
}

export interface Meeting {
  id: number;
  label: string;
  startsAt: string;
  durationMinutes: number;
  withLabel: string | null;
  /** Only ever an https link. */
  joinUrl: string | null;
}

export type ActivityType = "MILESTONE" | "DOCUMENT" | "UPDATE";
export interface Activity {
  id: number;
  type: ActivityType;
  description: string;
  actorLabel: string | null;
  occurredAt: string;
  sample: boolean;
}

export interface Past {
  id: number;
  roleTitle: string;
  clientName: string | null;
  startDate: string;
  endDate: string | null;
}

export interface PlacementView {
  orgId: number;
  generatedAt: string;
  name: string;
  activeCount: number;
  active: Placement | null;
  marketer: Marketer | null;
  checklist: ChecklistItem[];
  milestones: Milestone[];
  meetings: Meeting[];
  activity: Activity[];
  past: Past[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const DATE = /^\d{4}-\d{2}-\d{2}/;

/** An https link or null: the page never opens anything else. */
export const safeHttps = (v: unknown): string | null => {
  const s = str(v);
  if (!s || !/^https:\/\/\S+$/i.test(s)) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
};

function parsePlacement(o: unknown): Placement | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.roleTitle !== "string" || typeof o.startDate !== "string" || !DATE.test(o.startDate)) return null;
  const eng = typeof o.engagementStatus === "string" && ENGAGEMENT.includes(o.engagementStatus) ? (o.engagementStatus as EngagementStatus) : null;
  return {
    id: o.id,
    roleTitle: o.roleTitle,
    status: str(o.status) ?? "ACTIVE",
    clientName: str(o.clientName),
    endClientName: str(o.endClientName),
    projectName: str(o.projectName),
    locationLabel: str(o.locationLabel),
    workMode: str(o.workMode),
    managerName: str(o.managerName),
    managerTitle: str(o.managerTitle),
    hoursPerWeek: numOrNull(o.hoursPerWeek),
    scheduleLabel: str(o.scheduleLabel),
    engagementStatus: eng,
    statusNote: str(o.statusNote),
    startDate: o.startDate,
    endDate: str(o.endDate),
    nextCheckIn: str(o.nextCheckIn),
    durationMonths: Math.max(0, num(o.durationMonths)),
    openEnded: o.openEnded === true,
    billable: o.billable === true,
    sample: o.sample === true,
  };
}

export function parseItem(o: unknown): ChecklistItem | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.label !== "string") return null;
  return { id: o.id, label: o.label, dueOn: str(o.dueOn), completedAt: str(o.completedAt) };
}

export function parseActivity(o: unknown): Activity | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.description !== "string" || typeof o.occurredAt !== "string") return null;
  const type = o.type === "MILESTONE" || o.type === "DOCUMENT" ? o.type : "UPDATE";
  return { id: o.id, type, description: o.description, actorLabel: str(o.actorLabel), occurredAt: o.occurredAt, sample: o.sample === true };
}

const each = <T>(v: unknown, f: (x: unknown) => T | null): T[] => arr(v).map(f).filter((x): x is T => x !== null);

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parsePlacementView(body: unknown): PlacementView | null {
  if (!isObj(body) || typeof body.orgId !== "number") return null;
  const m = isObj(body.marketer) && typeof body.marketer.memberId === "number" && typeof body.marketer.name === "string" ? body.marketer : null;
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    name: typeof body.name === "string" ? body.name : "",
    activeCount: Math.max(0, num(body.activeCount)),
    active: parsePlacement(body.active),
    marketer: m ? { memberId: m.memberId as number, name: m.name as string, title: str(m.title) } : null,
    checklist: each(body.checklist, parseItem),
    milestones: each(body.milestones, (o) =>
      isObj(o) && typeof o.id === "number" && typeof o.label === "string" && typeof o.onDate === "string" && DATE.test(o.onDate)
        ? { id: o.id, label: o.label, description: str(o.description), onDate: o.onDate, completed: o.completed === true }
        : null,
    ),
    meetings: each(body.meetings, (o) =>
      isObj(o) && typeof o.id === "number" && typeof o.label === "string" && typeof o.startsAt === "string"
        ? { id: o.id, label: o.label, startsAt: o.startsAt, durationMinutes: Math.max(1, num(o.durationMinutes, 60)), withLabel: str(o.withLabel), joinUrl: safeHttps(o.joinUrl) }
        : null,
    ),
    activity: each(body.activity, parseActivity),
    past: each(body.past, (o) =>
      isObj(o) && typeof o.id === "number" && typeof o.roleTitle === "string" && typeof o.startDate === "string"
        ? { id: o.id, roleTitle: o.roleTitle, clientName: str(o.clientName), startDate: o.startDate, endDate: str(o.endDate) }
        : null,
    ),
  };
}

/* ── wording ──────────────────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const dayNumber = (iso: string): number => {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? NaN : Math.floor(t / DAY);
};
const todayNumber = (nowMs: number): number => Math.floor(nowMs / DAY);

/** "3 weeks ago", "Today", "5 days ago", "In 5 days", "Tomorrow" for a yyyy-mm-dd date against the server clock (UTC days). */
export function relativeDay(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const d = dayNumber(iso);
  if (Number.isNaN(d)) return "";
  const diff = d - todayNumber(nowMs);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const abs = Math.abs(diff);
  const text = abs >= 14 && abs < 70 ? `${Math.floor(abs / 7)} weeks` : abs >= 70 ? `${Math.round(abs / 30.4375)} months` : `${abs} days`;
  return diff > 0 ? `In ${text}` : `${text} ago`;
}

/** "6 Months" / "1 Month" / "Under a month". */
export function durationText(p: Pick<Placement, "durationMonths">): string {
  if (p.durationMonths <= 0) return "Under a month";
  return `${p.durationMonths} ${p.durationMonths === 1 ? "Month" : "Months"}`;
}

/** The second line of the Duration tile. */
export function durationSub(p: Pick<Placement, "openEnded" | "endDate">): string {
  return p.openEnded || !p.endDate ? "Open-ended (so far)" : `Expected End: ${shortDate(p.endDate)}`;
}

export function engagementInfo(status: EngagementStatus | null): { label: string; tone: Tone } | null {
  switch (status) {
    case "ON_TRACK":
      return { label: "On Track", tone: "green" };
    case "AT_RISK":
      return { label: "At Risk", tone: "amber" };
    case "NEEDS_ATTENTION":
      return { label: "Needs Attention", tone: "red" };
    default:
      return null;
  }
}

/** { month: "OCT", day: "16", line1: "10:00 AM - 11:00 AM" } in the viewer's zone. */
export function meetingBlock(m: Pick<Meeting, "startsAt" | "durationMinutes">): { month: string; day: string; time: string } {
  const start = new Date(m.startsAt);
  if (Number.isNaN(start.getTime())) return { month: "", day: "", time: "" };
  const end = new Date(start.getTime() + m.durationMinutes * 60_000);
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { month: start.toLocaleDateString("en-US", { month: "short" }).toUpperCase(), day: String(start.getDate()), time: `${t(start)} - ${t(end)}` };
}

/** "Oct 14, 2024" over "9:15 AM" for an activity time, in the viewer's zone. */
export function stampParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) };
}

export const ACTIVITY_TYPES: Record<ActivityType, { label: string; tone: Tone }> = {
  MILESTONE: { label: "Milestone", tone: "blue" },
  DOCUMENT: { label: "Document", tone: "violet" },
  UPDATE: { label: "Update", tone: "green" },
};

/** "5/7" progress of the onboarding checklist. */
export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.completedAt !== null).length, total: items.length };
}

/** A new list with one item ticked (or unticked); the time is the viewer's clock until the API's answer replaces it. */
export function withCompleted(items: ChecklistItem[], id: number, completed: boolean, at: string): ChecklistItem[] {
  return items.map((i) => (i.id === id ? { ...i, completedAt: completed ? at : null } : i));
}

export const MIN_NOTE = 3;
export const MAX_NOTE = 300;

/** The sentence to show when a status note is not acceptable, else null; the API re-checks everything. */
export function noteProblem(note: string): string | null {
  const v = note.trim();
  if (v.length < MIN_NOTE) return `Write at least ${MIN_NOTE} characters.`;
  if (v.length > MAX_NOTE) return `Keep it to ${MAX_NOTE} characters or fewer.`;
  return null;
}

/* ── static default copy (should become admin config) ─────────────────────────────────── */

/** The Helpful Resources defaults. There is no real URL for any of them yet, so the page shows them as plain text with a "Coming soon" hint. */
export const RESOURCES: readonly { key: string; label: string; href: string | null }[] = [
  { key: "onboarding", label: "Client Onboarding Guide", href: null },
  { key: "practices", label: "Consultant Best Practices", href: null },
  { key: "policy", label: "Time & Expense Policy", href: null },
  { key: "faq", label: "Placement FAQ", href: null },
];

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/placements`;

export async function fetchPlacement(orgId: number | string, signal?: AbortSignal): Promise<Fetched<PlacementView>> {
  try {
    const res = await fetch(base(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parsePlacementView(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export interface WriteResult<T = unknown> {
  ok: boolean;
  status?: number;
  /** The API's own message for a refusal (the sensitive-data one), when it sent one. */
  message?: string;
  data?: T;
}

async function write<T>(url: string, method: "PUT" | "POST", body: unknown, parse: (b: unknown) => T | null): Promise<WriteResult<T>> {
  try {
    const res = await fetch(url, { method, headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    if (res.ok) {
      const data = parse(await res.json().catch(() => null));
      return { ok: true, status: res.status, ...(data ? { data } : {}) };
    }
    const j = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null;
    const m = j && typeof j.error === "string" ? j.error : j && typeof j.detail === "string" ? j.detail : undefined;
    return { ok: false, status: res.status, message: m };
  } catch {
    return { ok: false };
  }
}

export const setChecklistItem = (orgId: number | string, id: number, completed: boolean) => write(`${base(orgId)}/checklist/${id}`, "PUT", { completed }, parseItem);
export const postStatusNote = (orgId: number | string, note: string) => write(`${base(orgId)}/status-note`, "POST", { note }, parseActivity);
