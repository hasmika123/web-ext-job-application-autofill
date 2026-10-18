/**
 * The Marketing Tasks board's data (design: Tasks). One call to `GET /api/orgs/{orgId}/mkt/tasks` (through the BFF) draws the page; the Calendar month and the
 * write actions go to sibling BFF routes. ASSIGNED scope: a marketer sees the tasks they own. A list the API leaves out is an honest empty state, never a made-up
 * row. E1: every action here RECORDS; nothing emails anyone and nothing submits an application for a consultant.
 */

export type TaskKpiKey = "total" | "overdue" | "dueThisWeek" | "completedThisWeek";
export const TASK_KPI_KEYS: TaskKpiKey[] = ["total", "overdue", "dueThisWeek", "completedThisWeek"];
export const TASK_KPI_TITLES: Record<TaskKpiKey, string> = { total: "Total Tasks", overdue: "Overdue", dueThisWeek: "Due This Week", completedThisWeek: "Completed This Week" };

export type TaskTab = "ALL" | "MY" | "TEAM" | "OVERDUE" | "DUE_WEEK" | "COMPLETED";
export const TASK_TABS: { key: TaskTab; label: string; countKey: keyof TaskTabs }[] = [
  { key: "ALL", label: "All Tasks", countKey: "all" },
  { key: "MY", label: "My Tasks", countKey: "my" },
  { key: "TEAM", label: "Team Tasks", countKey: "team" },
  { key: "OVERDUE", label: "Overdue", countKey: "overdue" },
  { key: "DUE_WEEK", label: "Due This Week", countKey: "dueThisWeek" },
  { key: "COMPLETED", label: "Completed", countKey: "completed" },
];

export type TaskCategory = "JOB_OPPORTUNITY" | "RESUME" | "CLIENT" | "JOB_MATCH" | "APPLICATION" | "JOB_STREAM" | "INTERVIEW" | "CONTENT" | "MARKETING" | "FOLLOW_UP";
export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
export type TaskStatus = "NOT_STARTED" | "PENDING" | "IN_PROGRESS" | "COMPLETED";

export const CATEGORY_ORDER: TaskCategory[] = ["JOB_OPPORTUNITY", "RESUME", "CLIENT", "JOB_MATCH", "APPLICATION", "JOB_STREAM", "INTERVIEW", "CONTENT", "MARKETING", "FOLLOW_UP"];
export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  JOB_OPPORTUNITY: "Job Opportunity", RESUME: "Resume", CLIENT: "Client", JOB_MATCH: "Job Match", APPLICATION: "Application", JOB_STREAM: "Job Stream",
  INTERVIEW: "Interview", CONTENT: "Content", MARKETING: "Marketing", FOLLOW_UP: "Follow-up",
};
export const PRIORITY_ORDER: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];
export const PRIORITY_LABEL: Record<TaskPriority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
export const STATUS_ORDER: TaskStatus[] = ["NOT_STARTED", "PENDING", "IN_PROGRESS", "COMPLETED"];
export const STATUS_LABEL: Record<TaskStatus, string> = { NOT_STARTED: "Not Started", PENDING: "Pending", IN_PROGRESS: "In Progress", COMPLETED: "Completed" };

export interface TaskKpi { key: TaskKpiKey; value: number; deltaPct: number | null; sparkline: number[] }
export interface TaskTabs { all: number; my: number; team: number; overdue: number; dueThisWeek: number; completed: number }
export interface TaskRow {
  id: number;
  title: string;
  detail: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  /** Derived by the API: open and due before now. */
  overdue: boolean;
  dueAt: string;
  completedAt: string | null;
  consultantId: number | null;
  consultantName: string | null;
  clientAccountId: number | null;
  clientName: string | null;
  relatedLabel: string | null;
  ownerMemberId: number;
  ownerName: string;
  avatarUrl: string | null;
  mine: boolean;
  canDelete: boolean;
}
export interface TaskPage { items: TaskRow[]; total: number; page: number; size: number }
export interface Option { id: number; name: string }
export interface TaskOptions { consultants: Option[]; clients: Option[]; owners: Option[] }
export interface TasksView { wide: boolean; kpis: TaskKpi[]; tabs: TaskTabs; tasks: TaskPage; upcoming: TaskRow[]; options: TaskOptions }
export interface CalendarDay { date: string; total: number; open: number; topPriority: TaskPriority }
export interface TaskCalendar { month: string; days: CalendarDay[] }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const strOrNull = (x: unknown): string | null => (typeof x === "string" ? x : null);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const oneOf = <T extends string>(x: unknown, allowed: readonly T[], d: T): T => (typeof x === "string" && (allowed as readonly string[]).includes(x) ? (x as T) : d);

export function parseTask(r: Record<string, unknown>): TaskRow {
  return {
    id: num(r.id), title: str(r.title), detail: strOrNull(r.detail), category: oneOf(r.category, CATEGORY_ORDER, "FOLLOW_UP"), priority: oneOf(r.priority, PRIORITY_ORDER, "MEDIUM"),
    status: oneOf(r.status, STATUS_ORDER, "NOT_STARTED"), overdue: r.overdue === true, dueAt: str(r.dueAt), completedAt: strOrNull(r.completedAt), consultantId: numOrNull(r.consultantId),
    consultantName: strOrNull(r.consultantName), clientAccountId: numOrNull(r.clientAccountId), clientName: strOrNull(r.clientName), relatedLabel: strOrNull(r.relatedLabel),
    ownerMemberId: num(r.ownerMemberId), ownerName: str(r.ownerName), avatarUrl: strOrNull(r.avatarUrl), mine: r.mine === true, canDelete: r.canDelete === true,
  };
}

const parseOptions = (x: unknown): Option[] => arr(x).map((o) => ({ id: num(o.id), name: str(o.name) })).filter((o) => o.id > 0 && o.name);

/** Lenient: a malformed list becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseTasks(raw: unknown): TasksView | null {
  if (!isObj(raw)) return null;
  const t = isObj(raw.tabs) ? raw.tabs : {};
  const page = isObj(raw.tasks) ? raw.tasks : {};
  const items = arr(page.items).map(parseTask);
  const o = isObj(raw.options) ? raw.options : {};
  return {
    wide: raw.wide === true,
    kpis: arr(raw.kpis)
      .filter((k) => (TASK_KPI_KEYS as string[]).includes(str(k.key)))
      .map((k) => ({ key: str(k.key) as TaskKpiKey, value: num(k.value), deltaPct: numOrNull(k.deltaPct), sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [] })),
    tabs: { all: num(t.all), my: num(t.my), team: num(t.team), overdue: num(t.overdue), dueThisWeek: num(t.dueThisWeek), completed: num(t.completed) },
    tasks: { items, total: Math.max(num(page.total, items.length), items.length), page: num(page.page), size: Math.max(num(page.size, 10), 1) },
    upcoming: arr(raw.upcoming).map(parseTask),
    options: { consultants: parseOptions(o.consultants), clients: parseOptions(o.clients), owners: parseOptions(o.owners) },
  };
}

export function parseCalendar(raw: unknown): TaskCalendar | null {
  if (!isObj(raw)) return null;
  return {
    month: str(raw.month),
    days: arr(raw.days).map((d) => ({ date: str(d.date), total: num(d.total), open: num(d.open), topPriority: oneOf(d.topPriority, PRIORITY_ORDER, "MEDIUM") })).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)),
  };
}

export interface TasksQuery { tab: TaskTab; category: string; priority: string; status: string; owner: string; due: string; page: number; size: number; sort?: string }
export const DEFAULT_QUERY: TasksQuery = { tab: "ALL", category: "", priority: "", status: "", owner: "", due: "", page: 0, size: 10 };

export function queryString(q: TasksQuery): string {
  const p = new URLSearchParams();
  p.set("tab", q.tab);
  for (const k of ["category", "priority", "status", "owner", "due", "sort"] as const) if (q[k]) p.set(k, q[k] as string);
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p.toString();
}

export type TasksFetch = { kind: "OK"; view: TasksView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchTasks(orgId: number | string, query: TasksQuery, signal?: AbortSignal): Promise<TasksFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/tasks?${queryString(query)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseTasks(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** The days of a month (yyyy-MM) that have tasks; null when the call failed (the card keeps its last month). */
export async function fetchCalendar(orgId: number | string, month: string, signal?: AbortSignal): Promise<TaskCalendar | null> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/tasks/calendar?month=${encodeURIComponent(month)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    return res.ok ? parseCalendar(await res.json().catch(() => null)) : null;
  } catch {
    return null;
  }
}

export async function fetchAssignees(orgId: number | string, id: number): Promise<Option[] | null> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/tasks/${id}/assignees`, { headers: { accept: "application/json" }, cache: "no-store" });
    return res.ok ? parseOptions(await res.json().catch(() => null)) : null;
  } catch {
    return null;
  }
}

// ---- writes (record only) -----------------------------------------------------------------------------------------------

export interface NewTask {
  title: string;
  detail?: string;
  category: TaskCategory;
  priority: TaskPriority;
  status?: TaskStatus;
  dueAt: string;
  consultantId?: number | null;
  clientAccountId?: number | null;
}
export interface TaskPatch { title?: string; detail?: string; category?: TaskCategory; priority?: TaskPriority; status?: TaskStatus; dueAt?: string }

export type TaskAction =
  | { kind: "create"; task: NewTask }
  | { kind: "update"; id: number; patch: TaskPatch }
  | { kind: "complete"; id: number }
  | { kind: "reopen"; id: number }
  | { kind: "reassign"; id: number; ownerMemberId: number }
  | { kind: "delete"; id: number };

export type ActionOutcome = { ok: true } | { ok: false; denied: boolean; message: string };

/** Runs one write through the BFF. Only these six record-keeping routes exist; none of them can submit for a consultant or send mail. */
export async function runTaskAction(orgId: number | string, action: TaskAction): Promise<ActionOutcome> {
  const base = `/api/orgs/${orgId}/mkt/tasks`;
  const [url, method, body]: [string, string, unknown] =
    action.kind === "create" ? [base, "POST", action.task]
    : action.kind === "update" ? [`${base}/${action.id}`, "PATCH", action.patch]
    : action.kind === "complete" ? [`${base}/${action.id}/complete`, "POST", undefined]
    : action.kind === "reopen" ? [`${base}/${action.id}/reopen`, "POST", undefined]
    : action.kind === "reassign" ? [`${base}/${action.id}/reassign`, "POST", { ownerMemberId: action.ownerMemberId }]
    : [`${base}/${action.id}`, "DELETE", undefined];
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json", accept: "application/json" }, cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.ok) return { ok: true };
    const err: unknown = await res.json().catch(() => null);
    const message = isObj(err) && typeof err.error === "string" ? err.error : "That didn't save. Nothing has changed.";
    return { ok: false, denied: res.status === 403 || res.status === 404, message };
  } catch {
    return { ok: false, denied: false, message: "Couldn't reach the server. Nothing has changed." };
  }
}

// ---- display helpers ----------------------------------------------------------------------------------------------------

/** "Oct 10, 2026". */
export function dueDateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const dayNumber = (d: Date) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);

/** The Upcoming Deadlines time: "Today, 4:00 PM", "Tomorrow, 10:00 AM", otherwise the date ("Oct 14, 2026"). */
export function relativeDue(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const diff = dayNumber(d) - dayNumber(now);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Tomorrow, ${time}`;
  return dueDateText(iso);
}

/** A local calendar day key `yyyy-MM-dd` (what the calendar cells and the Due Date filter use). */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const monthKey = (d: Date): string => dayKey(d).slice(0, 7);

/** The cells of a month grid starting on Sunday: the leading/trailing days of the neighbouring months are flagged `outside`. */
export function monthGrid(month: string): { key: string; day: number; outside: boolean }[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: dayKey(d), day: d.getDate(), outside: d.getMonth() !== m - 1 };
  });
}

/** "October 2026" for a `yyyy-MM` key; `delta` moves it by whole months. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

/** How many pages `total` rows make (at least one). */
export const pageCount = (total: number, size: number): number => Math.max(1, Math.ceil(total / Math.max(size, 1)));

/** "Showing 1 to 10 of 24 tasks" ("Showing 0 of 0 tasks" when empty). */
export function showingText(page: number, size: number, total: number): string {
  if (total === 0) return "Showing 0 of 0 tasks";
  return `Showing ${page * size + 1} to ${Math.min(total, (page + 1) * size)} of ${total} tasks`;
}

// ---- board art (cropped from the approved board into public/ent/marketer/tasks) -----------------------------------------

export const TASKS_ART = "/ent/marketer/tasks";
export const TASKS_HERO = `${TASKS_ART}/hero.png`;
const FACES = new Set(["ava-patel", "ethan-chen", "noah-williams", "olivia-brown", "liam-johnson", "sarah-chen", "michael-park"]);
const LOGOS = new Set(["aws"]);
const slug = (s: string) => s.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** A real `avatarUrl` from the API wins; the board's cropped photo only for the people on it; otherwise null (the page draws initials). */
export const photoFor = (name: string, url: string | null): string | null => url ?? (FACES.has(slug(name)) ? `${TASKS_ART}/${slug(name)}.png` : null);
export const logoFor = (name: string): string | null => (LOGOS.has(slug(name)) ? `${TASKS_ART}/logo-${slug(name)}.png` : null);
