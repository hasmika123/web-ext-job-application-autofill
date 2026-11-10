/**
 * The Consultant workspace Tasks & Follow-ups page's client logic (design/enterprise-consultant/tasks.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/tasks` (+ `/list` and the four writes), tolerant parsers and the pure helpers the page uses (labels, due-date
 * wording, date blocks, the list query). Nothing here touches React and there is no fallback number: every figure is the API's answer, and the
 * filtering, sorting and paging happen on the server. Tasks are the consultant's own; nothing is sent to anyone.
 */
import { initialsOf, shortDate, type Tone } from "./home";

export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "PENDING" | "DONE";
export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
export type TaskType = "RESUME_PROFILE" | "SUBMISSION_APPROVAL" | "INTERVIEW_COORDINATION" | "INTERVIEW_PREPARATION" | "COMMUNICATION" | "CLIENT_REQUIREMENTS" | "AVAILABILITY" | "OFFER_REVIEW" | "OTHER";

const STATUSES: readonly string[] = ["NOT_STARTED", "IN_PROGRESS", "PENDING", "DONE"];
const PRIORITIES: readonly string[] = ["HIGH", "MEDIUM", "LOW"];
const TYPES: readonly string[] = ["RESUME_PROFILE", "SUBMISSION_APPROVAL", "INTERVIEW_COORDINATION", "INTERVIEW_PREPARATION", "COMMUNICATION", "CLIENT_REQUIREMENTS", "AVAILABILITY", "OFFER_REVIEW", "OTHER"];

export interface TaskTile {
  value: number;
  previous: number | null;
  deltaPct: number | null;
  sparkline: number[];
}

export interface TabCounts {
  all: number;
  today: number;
  week: number;
  overdue: number;
  completed: number;
}

export interface AssignedBy {
  kind: "SELF" | "MARKETER";
  name: string | null;
  /** A demo stand-in: the marketer side is not built yet. */
  sample: boolean;
}

export interface TaskRow {
  id: number;
  title: string;
  type: TaskType;
  requirementId: number | null;
  jobTitle: string | null;
  company: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  /** yyyy-MM-dd or null. */
  dueOn: string | null;
  overdue: boolean;
  dueToday: boolean;
  assignedBy: AssignedBy;
  completedAt: string | null;
  createdAt: string | null;
}

export interface TaskPage {
  items: TaskRow[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
  counts: TabCounts;
}

export interface FocusItem {
  taskId: number;
  title: string;
  status: TaskStatus;
  done: boolean;
}

export interface Deadline {
  taskId: number;
  title: string;
  jobTitle: string | null;
  company: string | null;
  dueOn: string;
  priority: TaskPriority;
}

export interface Insights {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  completionPct: number;
  completedThisWeek: number;
  completedLastWeek: number;
  /** The API's own honest sentence, or null (then nothing is claimed). */
  note: string | null;
}

export interface Reminder {
  kind: string;
  title: string;
  subtitle: string | null;
  at: string | null;
  href: string;
}

export interface JobOption {
  id: number;
  title: string;
  company: string | null;
}

export interface TasksView {
  orgId: number;
  generatedAt: string;
  /** The server's calendar day (yyyy-MM-dd); due dates are compared with it, not with the browser clock. */
  today: string;
  name: string;
  tiles: { total: TaskTile; dueToday: TaskTile; upcoming: TaskTile; overdue: TaskTile; completedThisWeek: TaskTile };
  tasks: TaskPage;
  focus: FocusItem[];
  deadlines: Deadline[];
  insights: Insights;
  reminders: Reminder[];
  jobs: JobOption[];
  assigners: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function tileOf(v: unknown): TaskTile {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: numOrNull(d.previous),
    deltaPct: numOrNull(d.deltaPct),
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
  };
}

export function parseRow(o: unknown): TaskRow | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.title !== "string" || typeof o.status !== "string" || !STATUSES.includes(o.status)) return null;
  const by = isObj(o.assignedBy) ? o.assignedBy : {};
  return {
    id: o.id,
    title: o.title,
    type: (typeof o.type === "string" && TYPES.includes(o.type) ? o.type : "OTHER") as TaskType,
    requirementId: numOrNull(o.requirementId),
    jobTitle: strOrNull(o.jobTitle),
    company: strOrNull(o.company),
    priority: (typeof o.priority === "string" && PRIORITIES.includes(o.priority) ? o.priority : "MEDIUM") as TaskPriority,
    status: o.status as TaskStatus,
    dueOn: strOrNull(o.dueOn),
    overdue: o.overdue === true,
    dueToday: o.dueToday === true,
    assignedBy: { kind: by.kind === "MARKETER" ? "MARKETER" : "SELF", name: strOrNull(by.name), sample: by.sample === true },
    completedAt: strOrNull(o.completedAt),
    createdAt: strOrNull(o.createdAt),
  };
}

const rowsOf = (v: unknown): TaskRow[] =>
  arr(v)
    .map(parseRow)
    .filter((r): r is TaskRow => r !== null);

export function parseTaskPage(body: unknown): TaskPage | null {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  const c = isObj(body.counts) ? body.counts : {};
  return {
    items: rowsOf(body.items),
    page: Math.max(0, num(body.page)),
    size: Math.max(1, num(body.size, 8)),
    total: Math.max(0, num(body.total)),
    totalPages: Math.max(0, num(body.totalPages)),
    counts: { all: num(c.all), today: num(c.today), week: num(c.week), overdue: num(c.overdue), completed: num(c.completed) },
  };
}

const priorityOf = (v: unknown): TaskPriority => (typeof v === "string" && PRIORITIES.includes(v) ? (v as TaskPriority) : "MEDIUM");

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseTasks(body: unknown): TasksView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles) || typeof body.today !== "string") return null;
  const tasks = parseTaskPage(body.tasks);
  if (!tasks) return null;
  const t = body.tiles;
  const i = isObj(body.insights) ? body.insights : {};
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    today: body.today,
    name: typeof body.name === "string" ? body.name : "",
    tiles: { total: tileOf(t.total), dueToday: tileOf(t.dueToday), upcoming: tileOf(t.upcoming), overdue: tileOf(t.overdue), completedThisWeek: tileOf(t.completedThisWeek) },
    tasks,
    focus: arr(body.focus)
      .filter((f): f is Record<string, unknown> => isObj(f) && typeof f.taskId === "number" && typeof f.title === "string")
      .map((f) => ({ taskId: f.taskId as number, title: f.title as string, status: (typeof f.status === "string" && STATUSES.includes(f.status) ? f.status : "NOT_STARTED") as TaskStatus, done: f.done === true })),
    deadlines: arr(body.deadlines)
      .filter((d): d is Record<string, unknown> => isObj(d) && typeof d.taskId === "number" && typeof d.title === "string" && typeof d.dueOn === "string")
      .map((d) => ({ taskId: d.taskId as number, title: d.title as string, jobTitle: strOrNull(d.jobTitle), company: strOrNull(d.company), dueOn: d.dueOn as string, priority: priorityOf(d.priority) })),
    insights: {
      total: num(i.total),
      completed: num(i.completed),
      inProgress: num(i.inProgress),
      notStarted: num(i.notStarted),
      overdue: num(i.overdue),
      completionPct: Math.max(0, Math.min(100, num(i.completionPct))),
      completedThisWeek: num(i.completedThisWeek),
      completedLastWeek: num(i.completedLastWeek),
      note: strOrNull(i.note),
    },
    reminders: arr(body.reminders)
      .filter((r): r is Record<string, unknown> => isObj(r) && typeof r.title === "string" && typeof r.href === "string")
      .map((r) => ({ kind: typeof r.kind === "string" ? r.kind : "", title: r.title as string, subtitle: strOrNull(r.subtitle), at: strOrNull(r.at), href: r.href as string })),
    jobs: arr(body.jobs)
      .filter((j): j is Record<string, unknown> => isObj(j) && typeof j.id === "number" && typeof j.title === "string")
      .map((j) => ({ id: j.id as number, title: j.title as string, company: strOrNull(j.company) })),
    assigners: arr(body.assigners).filter((a): a is string => typeof a === "string" && a !== ""),
  };
}

/* ── labels and wording ───────────────────────────────────────────────────────────────── */

export const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: "RESUME_PROFILE", label: "Resume & Profile" },
  { value: "SUBMISSION_APPROVAL", label: "Submission Approval" },
  { value: "INTERVIEW_COORDINATION", label: "Interview Coordination" },
  { value: "INTERVIEW_PREPARATION", label: "Interview Preparation" },
  { value: "COMMUNICATION", label: "Communication" },
  { value: "CLIENT_REQUIREMENTS", label: "Client Requirements" },
  { value: "AVAILABILITY", label: "Profile & Availability" },
  { value: "OFFER_REVIEW", label: "Offer Review" },
  { value: "OTHER", label: "General" },
];

export const typeLabel = (t: string): string => TYPE_OPTIONS.find((o) => o.value === t)?.label ?? "General";

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export const priorityLabel = (p: string): string => PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? "Medium";
export const priorityTone = (p: string): Tone => (p === "HIGH" ? "red" : p === "LOW" ? "green" : "blue");

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING", label: "Pending" },
  { value: "DONE", label: "Done" },
];

export function statusInfo(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "IN_PROGRESS":
      return { label: "In Progress", tone: "blue" };
    case "PENDING":
      return { label: "Pending", tone: "amber" };
    case "DONE":
      return { label: "Done", tone: "green" };
    default:
      return { label: "Not Started", tone: "slate" };
  }
}

export const DUE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Due Date" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "TODAY", label: "Today" },
  { value: "NEXT_7", label: "Next 7 days" },
  { value: "NEXT_30", label: "Next 30 days" },
  { value: "NO_DATE", label: "No due date" },
];

export type TabKey = "ALL" | "TODAY" | "WEEK" | "OVERDUE" | "COMPLETED";
export const TABS: { key: TabKey; label: string; count: keyof TabCounts }[] = [
  { key: "ALL", label: "All Tasks", count: "all" },
  { key: "TODAY", label: "Due Today", count: "today" },
  { key: "WEEK", label: "This Week", count: "week" },
  { key: "OVERDUE", label: "Overdue", count: "overdue" },
  { key: "COMPLETED", label: "Completed", count: "completed" },
];

export type DueKind = "overdue" | "today" | "later" | "none";

/** The Due Date cell: today and overdue are the server's verdict (it knows the calendar day the numbers are about). */
export function dueInfo(r: Pick<TaskRow, "dueOn" | "overdue" | "dueToday">): { kind: DueKind; text: string } {
  if (!r.dueOn) return { kind: "none", text: "No due date" };
  return { kind: r.overdue ? "overdue" : r.dueToday ? "today" : "later", text: shortDate(r.dueOn) };
}

export const DUE_TEXT: Record<DueKind, string> = { overdue: "text-v2-coral-ink", today: "text-v2-coral-ink", later: "text-ink", none: "text-muted" };

/** { month: "OCT", day: "14" } for a yyyy-MM-dd date (UTC, so the day never moves). */
export function dateBlock(dueOn: string): { month: string; day: string } {
  const d = new Date(`${dueOn.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { month: "", day: "" };
  return { month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(), day: String(d.getUTCDate()) };
}

/** "Oct 15, 2024 at 2:00 PM" for a reminder time (the viewer's zone); a date-only time shows just the day. */
export function reminderWhen(at: string | null): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  // a bare date (the API sends a follow-up day as UTC midnight) keeps its calendar day in every zone
  if (midnight) return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** "Showing 1-8 of 12" (empty text for no rows). */
export function rangeText(p: Pick<TaskPage, "page" | "size" | "total">, shown: number): string {
  if (p.total === 0 || shown === 0) return "";
  const from = p.page * p.size + 1;
  return `Showing ${from}-${from + shown - 1} of ${p.total}`;
}

export { initialsOf, shortDate };

/* ── list query ───────────────────────────────────────────────────────────────────────── */

export type SortKey = "due" | "title" | "priority" | "status" | "completed";
export interface Filters {
  tab: TabKey;
  type: string;
  priority: string;
  assignedBy: string;
  due: string;
  q: string;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
}
export const PAGE_SIZE = 8;

export const DEFAULT_FILTERS: Filters = { tab: "ALL", type: "", priority: "", assignedBy: "", due: "", q: "", sort: "due", dir: "asc", page: 0 };

/** The query string the API understands (empty values are left out). */
export function buildQuery(f: Filters, size: number = PAGE_SIZE): string {
  const q = new URLSearchParams();
  if (f.tab !== "ALL") q.set("tab", f.tab);
  if (f.type) q.set("type", f.type);
  if (f.priority) q.set("priority", f.priority);
  if (f.assignedBy) q.set("assignedBy", f.assignedBy);
  if (f.due) q.set("due", f.due);
  if (f.q.trim()) q.set("q", f.q.trim().slice(0, 100));
  q.set("sort", f.sort);
  q.set("dir", f.dir);
  q.set("page", String(f.page));
  q.set("size", String(size));
  return q.toString();
}

/** Clicking a column: the same key flips the direction, a new key starts ascending (due date, title) and page 0. */
export function sortBy(f: Filters, key: SortKey): Filters {
  return key === f.sort ? { ...f, dir: f.dir === "asc" ? "desc" : "asc", page: 0 } : { ...f, sort: key, dir: "asc", page: 0 };
}

/** The Completed tab lists the most recently finished first; every other tab starts on due date. Called when the tab changes. */
export function withTab(f: Filters, tab: TabKey): Filters {
  return tab === "COMPLETED" ? { ...f, tab, sort: "completed", dir: "desc", page: 0 } : { ...f, tab, sort: f.sort === "completed" ? "due" : f.sort, dir: f.sort === "completed" ? "asc" : f.dir, page: 0 };
}

/* ── write form ───────────────────────────────────────────────────────────────────────── */

export const MIN_TITLE = 3;
export const MAX_TITLE = 200;

export interface TaskForm {
  title: string;
  dueOn: string;
  priority: TaskPriority;
  type: TaskType;
  requirementId: string;
}

export const EMPTY_FORM: TaskForm = { title: "", dueOn: "", priority: "MEDIUM", type: "OTHER", requirementId: "" };

export const formOf = (r: TaskRow): TaskForm => ({ title: r.title, dueOn: r.dueOn ?? "", priority: r.priority, type: r.type, requirementId: r.requirementId === null ? "" : String(r.requirementId) });

/** The sentence to show when the title is not acceptable; the API re-checks everything (including the sensitive-data scan). */
export function titleProblem(title: string): string | null {
  const v = title.trim();
  if (v.length < MIN_TITLE) return `Give the task a name of at least ${MIN_TITLE} characters.`;
  if (v.length > MAX_TITLE) return `Keep the name to ${MAX_TITLE} characters or fewer.`;
  return null;
}

export const bodyOf = (f: TaskForm) => ({
  title: f.title.trim(),
  ...(f.dueOn ? { dueOn: f.dueOn } : {}),
  priority: f.priority,
  type: f.type,
  ...(f.requirementId ? { requirementId: Number(f.requirementId) } : {}),
});

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/tasks`;

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

export const fetchTasks = (orgId: number | string, f: Filters, signal?: AbortSignal) => read(`${base(orgId)}?${buildQuery(f)}`, parseTasks, signal);
export const fetchList = (orgId: number | string, f: Filters, signal?: AbortSignal) => read(`${base(orgId)}/list?${buildQuery(f)}`, parseTaskPage, signal);

export interface WriteResult {
  ok: boolean;
  /** The HTTP status when the call reached the API. */
  status?: number;
  /** The API's own message for a refusal (the sensitive-data one, a validation sentence), when it sent one. */
  message?: string;
  row?: TaskRow;
}

async function write(method: "POST" | "PUT" | "DELETE", url: string, body?: unknown, keepalive = false): Promise<WriteResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      keepalive,
    });
    if (res.ok) {
      const json = res.status === 204 ? null : await res.json().catch(() => null);
      return { ok: true, status: res.status, row: parseRow(json) ?? undefined };
    }
    const j = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null;
    const m = j && typeof j.error === "string" ? j.error : j && typeof j.detail === "string" ? j.detail : undefined;
    return { ok: false, status: res.status, message: m };
  } catch {
    return { ok: false };
  }
}

export const createTask = (orgId: number, f: TaskForm) => write("POST", base(orgId), bodyOf(f));
export const updateTask = (orgId: number, id: number, f: TaskForm) => write("PUT", `${base(orgId)}/${id}`, bodyOf(f));
export const setTaskStatus = (orgId: number, id: number, status: TaskStatus) => write("PUT", `${base(orgId)}/${id}/status`, { status });
export const deleteTask = (orgId: number, id: number, keepalive = false) => write("DELETE", `${base(orgId)}/${id}`, undefined, keepalive);
