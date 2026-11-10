/**
 * The Consultant workspace Notifications page's client logic (design/enterprise-consultant/notifications.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/notifications` (+ the read / resolve / snooze / delete / mark-all-read / mute / preference writes), tolerant
 * parsers and the pure helpers the page uses (relative time, category and priority wording, channel summaries, the query string). Nothing here touches
 * React and there is no fallback number: every figure is the API's answer. Nothing is ever emailed, texted or pushed from here: the channel switches
 * are stored preferences, and SMS cannot be switched on.
 */
import { type Tone } from "./home";

export type Category = "JOB_MATCH" | "APPLICATION" | "INTERVIEW" | "APPROVAL" | "OFFER" | "MESSAGE" | "REMINDER";
export const CATEGORIES: readonly Category[] = ["JOB_MATCH", "APPLICATION", "INTERVIEW", "APPROVAL", "OFFER", "MESSAGE", "REMINDER"];
export type Priority = "HIGH" | "MEDIUM" | "LOW";
const PRIORITIES: readonly string[] = ["HIGH", "MEDIUM", "LOW"];
export type NStatus = "UNREAD" | "READ" | "RESOLVED" | "SNOOZED";
const NSTATUSES: readonly string[] = ["UNREAD", "READ", "RESOLVED", "SNOOZED"];
export type Period = "TODAY" | "WEEK" | "MONTH";
export type StatusFilter = "ACTIVE" | "ALL" | "UNREAD" | "READ" | "RESOLVED" | "SNOOZED";

export interface NTile {
  value: number;
  previous: number;
  delta: number;
  /** null when there was nothing earlier to compare with. */
  deltaPct: number | null;
  sparkline: number[];
  vs: "week" | "day";
}

export interface NRow {
  id: number;
  category: Category;
  title: string;
  body: string | null;
  priority: Priority;
  actionLabel: string | null;
  /** An internal /w/consultant/... path or null. */
  actionHref: string | null;
  status: NStatus;
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  snoozedUntil: string | null;
}

export interface NPage {
  items: NRow[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface CategoryTile {
  category: Category;
  count: number;
  previous: number;
  deltaPct: number | null;
}

export interface Pref {
  category: Category;
  enabled: boolean;
  email: boolean;
  inApp: boolean;
  sms: boolean;
  smsAvailable: boolean;
  critical: boolean;
}

export interface NotificationsView {
  orgId: number;
  generatedAt: string;
  name: string;
  tiles: { unread: NTile; highPriority: NTile; today: NTile; upcomingReminders: NTile; resolvedThisWeek: NTile };
  /** Per category, under the current filters; ALL is the total. */
  tabs: Record<string, number>;
  notifications: NPage;
  categories: { period: Period; vs: string; items: CategoryTile[] };
  prefs: Pref[];
  muted: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isCategory = (v: unknown): v is Category => typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);

/** Only an internal consultant-workspace path may become a link, whatever the wire says. */
export const safeHref = (h: unknown): string | null => (typeof h === "string" && /^\/w\/consultant(\/[a-z0-9-]+)*(\?[A-Za-z0-9=&_-]{1,60})?$/.test(h) ? h : null);

function tileOf(v: unknown): NTile {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: num(d.previous),
    delta: num(d.delta),
    deltaPct: numOrNull(d.deltaPct),
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
    vs: d.vs === "day" ? "day" : "week",
  };
}

export function parseRow(o: unknown): NRow | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.title !== "string" || !isCategory(o.category) || typeof o.priority !== "string" || !PRIORITIES.includes(o.priority) || typeof o.status !== "string" || !NSTATUSES.includes(o.status) || typeof o.createdAt !== "string") return null;
  return {
    id: o.id,
    category: o.category,
    title: o.title,
    body: strOrNull(o.body),
    priority: o.priority as Priority,
    actionLabel: strOrNull(o.actionLabel),
    actionHref: safeHref(o.actionHref),
    status: o.status as NStatus,
    createdAt: o.createdAt,
    readAt: strOrNull(o.readAt),
    resolvedAt: strOrNull(o.resolvedAt),
    snoozedUntil: strOrNull(o.snoozedUntil),
  };
}

export function parsePref(o: unknown): Pref | null {
  if (!isObj(o) || !isCategory(o.category)) return null;
  return { category: o.category, enabled: o.enabled !== false, email: o.email !== false, inApp: o.inApp !== false, sms: false, smsAvailable: false, critical: o.critical === true };
}

export const parsePrefs = (v: unknown): Pref[] =>
  arr(v)
    .map(parsePref)
    .filter((p): p is Pref => p !== null);

export function parseNotifications(body: unknown): NotificationsView | null {
  if (!isObj(body) || !isObj(body.tiles) || !isObj(body.notifications) || !Array.isArray(body.notifications.items)) return null;
  const t = body.tiles;
  const n = body.notifications;
  const tabs: Record<string, number> = {};
  if (isObj(body.tabs)) for (const [k, v] of Object.entries(body.tabs)) tabs[k] = num(v);
  const cats = isObj(body.categories) ? body.categories : {};
  return {
    orgId: num(body.orgId),
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    name: typeof body.name === "string" ? body.name : "",
    tiles: { unread: tileOf(t.unread), highPriority: tileOf(t.highPriority), today: tileOf(t.today), upcomingReminders: tileOf(t.upcomingReminders), resolvedThisWeek: tileOf(t.resolvedThisWeek) },
    tabs,
    notifications: {
      items: arr(n.items)
        .map(parseRow)
        .filter((r): r is NRow => r !== null),
      page: Math.max(0, num(n.page)),
      size: Math.max(1, num(n.size, 10)),
      total: Math.max(0, num(n.total)),
      totalPages: Math.max(0, num(n.totalPages)),
    },
    categories: {
      period: cats.period === "TODAY" || cats.period === "MONTH" ? cats.period : "WEEK",
      vs: typeof cats.vs === "string" ? cats.vs : "last week",
      items: arr(cats.items)
        .map((c): CategoryTile | null => (isObj(c) && isCategory(c.category) ? { category: c.category, count: num(c.count), previous: num(c.previous), deltaPct: numOrNull(c.deltaPct) } : null))
        .filter((c): c is CategoryTile => c !== null),
    },
    prefs: parsePrefs(body.prefs),
    muted: body.muted === true,
  };
}

/* ── wording ──────────────────────────────────────────────────────────────────────────── */

export const CATEGORY_LABEL: Record<Category, string> = {
  JOB_MATCH: "Job Matches",
  APPLICATION: "Applications",
  INTERVIEW: "Interviews",
  APPROVAL: "Approvals",
  OFFER: "Offers",
  MESSAGE: "Messages",
  REMINDER: "Reminders",
};

/** The singular used in the type filter and the "Notification Preferences" rows. */
export const CATEGORY_TYPE: Record<Category, string> = {
  JOB_MATCH: "Job Match",
  APPLICATION: "Application",
  INTERVIEW: "Interview",
  APPROVAL: "Approval",
  OFFER: "Offer",
  MESSAGE: "Message",
  REMINDER: "Reminder",
};

export const PRIORITY_LABEL: Record<Priority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
export const priorityTone = (p: Priority): Tone => (p === "HIGH" ? "red" : p === "MEDIUM" ? "blue" : "green");

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "ALL", label: "All Statuses" },
  { value: "UNREAD", label: "Unread" },
  { value: "READ", label: "Read" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "SNOOZED", label: "Snoozed" },
];
export const TYPE_OPTIONS: { value: "" | Category; label: string }[] = [{ value: "", label: "All Types" }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_TYPE[c] }))];
export const PRIORITY_OPTIONS: { value: "" | Priority; label: string }[] = [
  { value: "", label: "All Priorities" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];
export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "WEEK", label: "This Week" },
  { value: "MONTH", label: "This Month" },
];

/** "Email, In-app" (SMS is never part of it: it is not available). */
export function channelSummary(p: Pref): string {
  const ch = [p.email ? "Email" : null, p.inApp ? "In-app" : null].filter((c): c is string => c !== null);
  return ch.length ? ch.join(", ") : "No channels";
}

export const SMS_NOTE = "SMS isn't available yet";

/** "Just now", "2 hours ago", "1 day ago". `now` is passed in so tests do not depend on the clock. */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} month${mo === 1 ? "" : "s"} ago`;
}

/** "+3" / "-2" / "0" for a plain count difference. */
export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `-${Math.abs(n)}` : "0");

export type PrimaryAction = { kind: "link"; label: string; href: string } | { kind: "snooze"; label: string } | null;

/** The row's main button: "Snooze" snoozes in place, anything else with a link opens that page. */
export function primaryAction(r: NRow): PrimaryAction {
  if (r.status === "RESOLVED") return r.actionHref ? { kind: "link", label: "View", href: r.actionHref } : null;
  if (r.actionLabel === "Snooze") return { kind: "snooze", label: "Snooze" };
  if (r.actionHref) return { kind: "link", label: r.actionLabel ?? "View", href: r.actionHref };
  return null;
}

/** One day from `now`, the "Snooze 1 day" choice (the API accepts up to 14 days). */
export const snoozeUntil = (now: number = Date.now()): string => new Date(now + 24 * 3600 * 1000).toISOString();

/* ── filters and the query string ────────────────────────────────────────────────────── */

export interface Filters {
  status: StatusFilter;
  category: "" | Category;
  priority: "" | Priority;
  q: string;
  period: Period;
  page: number;
}
export const DEFAULT_FILTERS: Filters = { status: "ACTIVE", category: "", priority: "", q: "", period: "WEEK", page: 0 };
export const PAGE_SIZE = 8;

export function queryString(f: Filters): string {
  const p = new URLSearchParams();
  p.set("status", f.status);
  if (f.category) p.set("category", f.category);
  if (f.priority) p.set("priority", f.priority);
  if (f.q.trim()) p.set("q", f.q.trim().slice(0, 80));
  p.set("period", f.period);
  p.set("page", String(f.page));
  p.set("size", String(PAGE_SIZE));
  return p.toString();
}

/** A filter change goes back to the first page. */
export const withFilter = (f: Filters, patch: Partial<Filters>): Filters => ({ ...f, ...patch, page: patch.page ?? 0 });

/** The status filter the "View Archived" quick action sets. */
export const ARCHIVED: StatusFilter = "RESOLVED";

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/notifications`;

export async function fetchNotifications(orgId: number | string, f: Filters, signal?: AbortSignal): Promise<Fetched<NotificationsView>> {
  try {
    const res = await fetch(`${base(orgId)}?${queryString(f)}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseNotifications(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export interface WriteResult {
  ok: boolean;
  status?: number;
  message?: string;
  /** The parsed answer for calls that return something the page needs (mute). */
  body?: unknown;
}

async function write(method: "POST" | "PUT" | "DELETE", url: string, body?: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return { ok: true, status: res.status, body: j };
    const m = j && typeof j.error === "string" ? j.error : j && typeof j.detail === "string" ? j.detail : j && typeof j.message === "string" ? j.message : undefined;
    return { ok: false, status: res.status, message: m };
  } catch {
    return { ok: false };
  }
}

export const markRead = (orgId: number, ids: number[], read: boolean) => write("POST", `${base(orgId)}/read`, { ids, read });
export const resolveNotifications = (orgId: number, ids: number[]) => write("POST", `${base(orgId)}/resolve`, { ids });
export const snoozeNotifications = (orgId: number, ids: number[], until: string) => write("POST", `${base(orgId)}/snooze`, { ids, until });
export const deleteNotifications = (orgId: number, ids: number[]) => (ids.length === 1 ? write("DELETE", `${base(orgId)}/${ids[0]}`) : write("POST", `${base(orgId)}/delete`, { ids }));
export const markAllRead = (orgId: number) => write("POST", `${base(orgId)}/mark-all-read`);
export const muteNonCritical = (orgId: number) => write("POST", `${base(orgId)}/mute-non-critical`);
export const savePreference = (orgId: number, category: Category, patch: { enabled?: boolean; email?: boolean; inApp?: boolean }) => write("PUT", `${base(orgId)}/preferences/${category}`, patch);
export const restorePreferences = (orgId: number, prefs: Pref[]) =>
  write("PUT", `${base(orgId)}/preferences`, { items: prefs.map((p) => ({ category: p.category, enabled: p.enabled, email: p.email, inApp: p.inApp })) });

/** The previous settings the mute answer carries, so Undo can write them back. */
export function previousOf(res: WriteResult): Pref[] {
  const b = res.body;
  return isObj(b) ? parsePrefs(b.previous) : [];
}
