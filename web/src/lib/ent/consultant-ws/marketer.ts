import { initialsOf, shortDate, type Tone } from "./home";

/**
 * "My Marketer" client logic (design/enterprise-consultant/marketer.webp): the wire types of
 * `GET /api/orgs/{orgId}/me-workspace/marketer`, a tolerant parser and the small pure helpers the cards use. Nothing here touches React.
 *
 * Rules the page keeps:
 *   - every figure comes from the API's answer; there is no fallback number in this file;
 *   - the marketer card, focus opportunities, follow-ups and focus summary are the consultant's real data; messages, the shared action
 *     plan, collaboration notes and the response badge are `sample` blocks (the marketer's half of the relationship) and are drawn with
 *     a "Sample" marker until the roles merge.
 */

export interface MarketerInfo {
  memberId: number;
  name: string;
  title: string | null;
  assignedAt: string | null;
}

export interface FocusRow {
  matchId: number | null;
  requirementId: number;
  title: string;
  company: string | null;
  location: string | null;
  workMode: string | null;
  stage: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  nextStep: string | null;
  nextStepDue: string | null;
}

export interface Followup {
  key: string;
  kind: "APPLICATION" | "TASK";
  dueOn: string;
  description: string;
  status: string;
  relatedTitle: string | null;
  relatedCompany: string | null;
}

export interface FocusItem {
  key: string;
  title: string;
  detail: string;
}

export interface MessageRow {
  from: string;
  mine: boolean;
  preview: string;
  at: string;
  unread: boolean;
}

export interface PlanItem {
  title: string;
  status: string;
  dueOn: string | null;
  completedOn: string | null;
}

export interface NoteRow {
  title: string;
  on: string;
  body: string;
}

export interface MarketerView {
  orgId: number;
  generatedAt: string;
  marketer: MarketerInfo | null;
  responseBadge: { sample: boolean; label: string; detail: string };
  focusOpportunities: FocusRow[];
  followups: Followup[];
  marketerFocus: FocusItem[];
  messages: { sample: boolean; items: MessageRow[] };
  actionPlan: { sample: boolean; items: PlanItem[] };
  notes: { sample: boolean; items: NoteRow[] };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const PRIORITIES: readonly string[] = ["HIGH", "MEDIUM", "LOW"];

function rows<T>(v: unknown, f: (o: Record<string, unknown>) => T | null): T[] {
  return arr(v)
    .map((o) => (isObj(o) ? f(o) : null))
    .filter((x): x is T => x !== null);
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseMarketer(body: unknown): MarketerView | null {
  if (!isObj(body) || typeof body.orgId !== "number") return null;
  const m =
    isObj(body.marketer) &&
    typeof body.marketer.memberId === "number" &&
    typeof body.marketer.name === "string"
      ? body.marketer
      : null;
  const badge = isObj(body.responseBadge) ? body.responseBadge : {};
  const msgs = isObj(body.messages) ? body.messages : {};
  const plan = isObj(body.actionPlan) ? body.actionPlan : {};
  const notes = isObj(body.notes) ? body.notes : {};
  return {
    orgId: body.orgId,
    generatedAt: str(body.generatedAt),
    marketer: m
      ? {
          memberId: num(m.memberId),
          name: str(m.name),
          title: strOrNull(m.title),
          assignedAt: strOrNull(m.assignedAt),
        }
      : null,
    responseBadge: {
      sample: badge.sample !== false,
      label: str(badge.label, "Responsive"),
      detail: str(badge.detail),
    },
    focusOpportunities: rows(body.focusOpportunities, (o) =>
      typeof o.title === "string" && typeof o.stage === "string"
        ? {
            matchId: typeof o.matchId === "number" ? o.matchId : null,
            requirementId: num(o.requirementId),
            title: o.title,
            company: strOrNull(o.company),
            location: strOrNull(o.location),
            workMode: strOrNull(o.workMode),
            stage: o.stage,
            priority: (PRIORITIES.includes(String(o.priority))
              ? o.priority
              : "MEDIUM") as FocusRow["priority"],
            nextStep: strOrNull(o.nextStep),
            nextStepDue: strOrNull(o.nextStepDue),
          }
        : null,
    ),
    followups: rows(body.followups, (o) =>
      typeof o.key === "string" &&
      typeof o.dueOn === "string" &&
      typeof o.description === "string"
        ? {
            key: o.key,
            kind: o.kind === "TASK" ? "TASK" : "APPLICATION",
            dueOn: o.dueOn,
            description: o.description,
            status: str(o.status, "UPCOMING"),
            relatedTitle: strOrNull(o.relatedTitle),
            relatedCompany: strOrNull(o.relatedCompany),
          }
        : null,
    ),
    marketerFocus: rows(body.marketerFocus, (o) =>
      typeof o.key === "string" && typeof o.title === "string"
        ? { key: o.key, title: o.title, detail: str(o.detail) }
        : null,
    ),
    messages: {
      sample: msgs.sample === true,
      items: rows(msgs.items, (o) =>
        typeof o.from === "string" &&
        typeof o.preview === "string" &&
        typeof o.at === "string"
          ? {
              from: o.from,
              mine: o.mine === true,
              preview: o.preview,
              at: o.at,
              unread: o.unread === true,
            }
          : null,
      ),
    },
    actionPlan: {
      sample: plan.sample === true,
      items: rows(plan.items, (o) =>
        typeof o.title === "string"
          ? {
              title: o.title,
              status: str(o.status, "NOT_STARTED"),
              dueOn: strOrNull(o.dueOn),
              completedOn: strOrNull(o.completedOn),
            }
          : null,
      ),
    },
    notes: {
      sample: notes.sample === true,
      items: rows(notes.items, (o) =>
        typeof o.title === "string" && typeof o.body === "string"
          ? { title: o.title, on: str(o.on), body: o.body }
          : null,
      ),
    },
  };
}

/* ── labels and tones ────────────────────────────────────────────────────────────── */

/** The Stage pill of a focus opportunity (the board: Marketing, Submitted, In Review, Interested). */
export function focusStage(stage: string): { label: string; tone: Tone } {
  switch (stage) {
    case "MARKETING":
      return { label: "Marketing", tone: "blue" };
    case "ASSIGNED":
      return { label: "Prepared", tone: "violet" };
    case "SUBMITTED":
      return { label: "Submitted", tone: "green" };
    case "UNDER_REVIEW":
      return { label: "In Review", tone: "amber" };
    case "INTERVIEWING":
      return { label: "Interviewing", tone: "green" };
    case "OFFER":
      return { label: "Offer", tone: "green" };
    default:
      return {
        label:
          stage.charAt(0) + stage.slice(1).toLowerCase().replace(/_/g, " "),
        tone: "slate",
      };
  }
}

export const PRIORITY_LABEL: Record<
  FocusRow["priority"],
  { label: string; tone: Tone }
> = {
  HIGH: { label: "High", tone: "red" },
  MEDIUM: { label: "Medium", tone: "amber" },
  LOW: { label: "Low", tone: "slate" },
};

/** The Status pill of a follow-up row. */
export function followupStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "OVERDUE":
      return { label: "Overdue", tone: "red" };
    case "TODAY":
      return { label: "Due today", tone: "amber" };
    case "UPCOMING":
      return { label: "Upcoming", tone: "blue" };
    case "IN_PROGRESS":
      return { label: "In Progress", tone: "blue" };
    case "PENDING":
      return { label: "Pending", tone: "amber" };
    default:
      return { label: "Not Started", tone: "slate" };
  }
}

export const followupType = (kind: Followup["kind"]): string =>
  kind === "TASK" ? "Task" : "Follow-up";

/** The date block of a follow-up: { month: "OCT", day: "15" } from a calendar date (UTC, so the day never moves). */
export function dateBlock(date: string): { month: string; day: string } {
  const d = new Date(date.length === 10 ? `${date}T00:00:00Z` : date);
  if (Number.isNaN(d.getTime())) return { month: "", day: "" };
  return {
    month: d
      .toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
      .toUpperCase(),
    day: String(d.getUTCDate()),
  };
}

/** "Share with client" + "Oct 15, 2024" on two lines of the Next Step cell. */
export function nextStepText(r: Pick<FocusRow, "nextStep" | "nextStepDue">): {
  line1: string;
  line2: string;
} {
  if (!r.nextStep) return { line1: "", line2: "" };
  return { line1: r.nextStep, line2: shortDate(r.nextStepDue) };
}

export const PLAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  DONE: { label: "Completed", tone: "green" },
  ON_TRACK: { label: "On track", tone: "green" },
  IN_PROGRESS: { label: "In progress", tone: "blue" },
  NOT_STARTED: { label: "Not started", tone: "slate" },
};

/** The plan row's trailing text: "Completed Oct 1, 2024" / "On track · Due Oct 31, 2024" / "Not started · Due Oct 25, 2024". */
export function planLine(p: PlanItem): string {
  const s = PLAN_STATUS[p.status] ?? PLAN_STATUS.NOT_STARTED;
  if (p.status === "DONE")
    return p.completedOn ? `${s.label} ${shortDate(p.completedOn)}` : s.label;
  return p.dueOn ? `${s.label} · Due ${shortDate(p.dueOn)}` : s.label;
}

/** "2 hours ago", "1 day ago", else the short date. `now` is injectable for tests. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return shortDate(iso);
}

/** Two letters for the marketer's circle ("Emily Carter" -> "EC"); no photo is ever shown. */
export const personInitials = (name: string): string => initialsOf(name);

/* ── the BFF call (the browser talks to Next, Next to the API) ───────────────────── */

export interface MarketerFetch {
  kind: "OK" | "DENIED" | "FAILED";
  view?: MarketerView;
}

export async function fetchMarketer(
  orgId: number | string,
  signal?: AbortSignal,
): Promise<MarketerFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/me-workspace/marketer`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseMarketer(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
