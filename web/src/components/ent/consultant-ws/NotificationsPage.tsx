"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  BellIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ClockIcon,
  ErrorState,
  FileTextIcon,
  HandshakeIcon,
  MailIcon,
  Menu,
  MoreVerticalIcon,
  SearchIcon,
  Skeleton,
  TrashIcon,
  VideoIcon,
  XIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES, type IconTone } from "@/components/ent/dashboard/parts";
import { Card, Empty, Pill, useWorkspaceData } from "./parts";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  DEFAULT_FILTERS,
  PAGE_SIZE,
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  deleteNotifications,
  fetchNotifications,
  markAllRead,
  markRead,
  muteNonCritical,
  previousOf,
  primaryAction,
  priorityTone,
  relativeTime,
  resolveNotifications,
  restorePreferences,
  snoozeNotifications,
  snoozeUntil,
  withFilter,
  type Category,
  type Filters,
  type NRow,
  type NotificationsView,
} from "@/lib/ent/consultant-ws/notifications";

/**
 * Consultant Notifications (design/enterprise-consultant/notifications.webp): one call to `GET /api/orgs/{orgId}/me-workspace/notifications` draws the
 * page for the signed-in consultant's OWN feed; the API first derives the missing notifications from the consultant's own rows (idempotent). Tabs,
 * filters, search, paging and the by-category period are query parameters the API answers (nothing is filtered in the browser). Delete has an undo
 * window: the rows hide, the toast offers Undo and the DELETE is sent only when the window ends (or the page is left). Mute writes preferences and
 * its Undo writes the previous ones back. Nothing is emailed, texted or pushed: the channel switches are stored preferences and SMS cannot be on.
 */

const UNDO_MS = 6000;

/* ── category look ──────────────────────────────────────────────────────────────────── */

const CATEGORY_ICON: Record<Category, ComponentType<IconProps>> = {
  JOB_MATCH: BriefcaseIcon,
  APPLICATION: FileTextIcon,
  INTERVIEW: VideoIcon,
  APPROVAL: ClipboardCheckIcon,
  OFFER: HandshakeIcon,
  MESSAGE: MailIcon,
  REMINDER: CalendarIcon,
};
const CATEGORY_TONE: Record<Category, IconTone> = { JOB_MATCH: "accent", APPLICATION: "violet", INTERVIEW: "green", APPROVAL: "violet", OFFER: "pink", MESSAGE: "amber", REMINDER: "teal" };

function CategoryMark({ category, size = "md" }: { category: Category; size?: "sm" | "md" }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <span aria-hidden className={cn("grid flex-none place-items-center", size === "md" ? "h-11 w-11 rounded-xl" : "h-9 w-9 rounded-lg", TONES[CATEGORY_TONE[category]])}>
      <Icon size={size === "md" ? 21 : 18} />
    </span>
  );
}

/* ── small pieces ───────────────────────────────────────────────────────────────────── */

const selectCls = "min-h-10 w-full appearance-none rounded-lg border border-line bg-paper py-1 pl-3 pr-8 text-[13px] font-semibold text-ink";

function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <span className="relative block min-w-0">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </span>
  );
}

function Check({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-[18px] w-[18px] flex-none cursor-pointer rounded border-line accent-[var(--brand-solid,var(--color-accent))] disabled:opacity-60"
    />
  );
}

const BTN_OUTLINE = "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft disabled:opacity-60";
const BTN_QUIET = "inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold text-ink-soft hover:bg-paper-2 disabled:opacity-60";

/* ── the feed ───────────────────────────────────────────────────────────────────────── */

interface RowActions {
  read: (r: NRow, read: boolean) => void;
  resolve: (r: NRow) => void;
  snooze: (r: NRow) => void;
  remove: (r: NRow) => void;
}

function RowMenu({ row, a }: { row: NRow; a: RowActions }) {
  const read = row.readAt !== null;
  return (
    <Menu
      trigger={
        <button type="button" aria-label={`More actions for ${row.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
          <MoreVerticalIcon size={16} />
        </button>
      }
      items={[
        { label: read ? "Mark as unread" : "Mark as read", icon: <CheckIcon size={15} />, onSelect: () => a.read(row, !read) },
        ...(row.status !== "RESOLVED"
          ? [
              { label: "Resolve", icon: <CheckCircleIcon size={15} />, onSelect: () => a.resolve(row) },
              { label: "Snooze 1 day", icon: <ClockIcon size={15} />, onSelect: () => a.snooze(row) },
            ]
          : []),
        { separator: true as const },
        { label: "Delete", icon: <TrashIcon size={15} />, danger: true, onSelect: () => a.remove(row) },
      ]}
    />
  );
}

function NotificationRow({ row, selected, busy, now, a, onSelect }: { row: NRow; selected: boolean; busy: boolean; now: number; a: RowActions; onSelect: (on: boolean) => void }) {
  const action = primaryAction(row);
  const unread = row.status === "UNREAD";
  return (
    <li data-notification={row.id} data-status={row.status} data-category={row.category} className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 py-3", row.status === "RESOLVED" && "opacity-80")}>
      <div className="flex min-h-11 items-center">
        <Check checked={selected} disabled={busy} label={`Select ${row.title}`} onChange={onSelect} />
      </div>
      <CategoryMark category={row.category} />
      <div className="min-w-0 flex-1 basis-[200px]">
        <p className="flex items-center gap-1.5 text-[14.5px] leading-tight text-ink">
          {unread ? (
            <span className="inline-flex items-center" title="Unread">
              <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-accent" />
              <span className="sr-only">Unread</span>
            </span>
          ) : null}
          {row.actionHref ? (
            <Link href={row.actionHref} className={cn("min-w-0 hover:underline", unread ? "font-extrabold" : "font-semibold")}>
              {row.title}
            </Link>
          ) : (
            <span className={cn("min-w-0", unread ? "font-extrabold" : "font-semibold")}>{row.title}</span>
          )}
        </p>
        {row.body ? <p className="mt-0.5 text-[13px] leading-snug text-muted">{row.body}</p> : null}
        <p className="mt-0.5 text-[12px] text-muted sm:hidden">{relativeTime(row.createdAt, now)}</p>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {row.status === "RESOLVED" ? <Pill tone="slate">Resolved</Pill> : row.status === "SNOOZED" ? <Pill tone="violet">Snoozed</Pill> : null}
        <Pill tone={priorityTone(row.priority)} className="min-h-7 min-w-[68px] justify-center">
          {PRIORITY_LABEL[row.priority]}
        </Pill>
        <span className="hidden w-[92px] text-[12.5px] text-ink-soft sm:block">{relativeTime(row.createdAt, now)}</span>
        {action ? (
          action.kind === "link" ? (
            <Link href={action.href} aria-label={`${action.label}: ${row.title}`} className={cn(BTN_OUTLINE, "min-w-[84px]")}>
              {action.label}
            </Link>
          ) : (
            <button type="button" disabled={busy} onClick={() => a.snooze(row)} aria-label={`${action.label}: ${row.title}`} className={cn(BTN_OUTLINE, "min-w-[84px]")}>
              {action.label}
            </button>
          )
        ) : (
          <span className="min-w-[84px]" />
        )}
        <RowMenu row={row} a={a} />
      </div>
    </li>
  );
}

interface FeedProps {
  /** The two quick actions that are not reachable anywhere else (Mark all as read, Mute non-critical), drawn in the card header. */
  headerExtra?: ReactNode;
  view: NotificationsView;
  f: Filters;
  setF: (f: Filters) => void;
  q: string;
  setQ: (q: string) => void;
  selected: Set<number>;
  setSelected: (s: Set<number>) => void;
  hidden: Set<number>;
  busy: boolean;
  a: RowActions;
  bulk: { read: () => void; resolve: () => void; remove: () => void };
}

function Feed({ headerExtra, view, f, setF, q, setQ, selected, setSelected, hidden, busy, a, bulk }: FeedProps) {
  const parsed = Date.parse(view.generatedAt); // relative times are measured from the API's clock
  const now = Number.isNaN(parsed) ? 0 : parsed;
  const items = view.notifications.items.filter((r) => !hidden.has(r.id));
  const total = view.notifications.total;
  const from = total === 0 ? 0 : view.notifications.page * PAGE_SIZE + 1;
  const to = Math.min(total, view.notifications.page * PAGE_SIZE + view.notifications.items.length);
  const allOn = items.length > 0 && items.every((r) => selected.has(r.id));
  const filtered = f.category !== "" || f.priority !== "" || f.q.trim() !== "" || f.status !== "ACTIVE";
  const tabs: { key: "" | Category; label: string }[] = [{ key: "", label: "All" }, ...CATEGORIES.map((c) => ({ key: c as "" | Category, label: CATEGORY_LABEL[c] }))];
  return (
    <Card id="notifications-feed" title="All notifications" icon={BellIcon} className="scroll-mt-4" extra={headerExtra}>
      <div role="tablist" aria-label="Notification types" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
        {tabs.map((t) => {
          const on = f.category === t.key;
          const n = view.tabs[t.key === "" ? "ALL" : t.key] ?? 0;
          return (
            <button
              key={t.key || "ALL"}
              type="button"
              role="tab"
              aria-selected={on}
              data-tab={t.key || "ALL"}
              onClick={() => setF(withFilter(f, { category: t.key }))}
              className={cn("-mb-px flex-none whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-semibold", on ? "border-accent text-accent-deep" : "border-transparent text-ink-soft hover:text-ink")}
            >
              {t.label} ({n})
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <div className="w-full min-w-0 sm:w-[168px]">
          <PillSelect label="Status" value={f.status} onChange={(v) => setF(withFilter(f, { status: v as Filters["status"] }))} options={STATUS_OPTIONS} />
        </div>
        <div className="w-full min-w-0 sm:w-[150px]">
          <PillSelect label="Type" value={f.category} onChange={(v) => setF(withFilter(f, { category: v as Filters["category"] }))} options={TYPE_OPTIONS} />
        </div>
        <div className="w-full min-w-0 sm:w-[168px]">
          <PillSelect label="Priority" value={f.priority} onChange={(v) => setF(withFilter(f, { priority: v as Filters["priority"] }))} options={PRIORITY_OPTIONS} />
        </div>
        <label className="relative block min-w-[200px] flex-1">
          <span className="sr-only">Search notifications</span>
          <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notifications..."
            className="min-h-10 w-full rounded-lg border border-line bg-paper-2/40 pl-9 pr-3 text-[13px] text-ink placeholder:text-muted"
          />
        </label>
      </div>

      {selected.size > 0 ? (
        <div role="region" aria-label="Bulk actions" data-bulk className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2">
          <span className="text-[13px] font-semibold text-accent-deep">{selected.size} selected</span>
          <button type="button" disabled={busy} onClick={bulk.read} className={BTN_QUIET}>
            Mark selected read
          </button>
          <button type="button" disabled={busy} onClick={bulk.resolve} className={BTN_QUIET}>
            Resolve
          </button>
          <button type="button" disabled={busy} onClick={bulk.remove} className={cn(BTN_QUIET, "text-v2-coral-ink")}>
            Delete
          </button>
          <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-paper">
            <XIcon size={15} />
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <Empty>{filtered ? "No notifications match these filters." : "You're all caught up. New notifications will show up here."}</Empty>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-3 border-b border-line pb-2 text-[12px] font-semibold text-muted">
            <Check checked={allOn} label="Select all on this page" onChange={(on) => setSelected(on ? new Set(items.map((r) => r.id)) : new Set())} />
            <span>Select all on this page</span>
          </div>
          <ul aria-label="Notifications" className="divide-y divide-line">
            {items.map((r) => (
              <NotificationRow
                key={r.id}
                row={r}
                selected={selected.has(r.id)}
                busy={busy}
                now={now}
                a={a}
                onSelect={(on) => {
                  const next = new Set(selected);
                  if (on) next.add(r.id);
                  else next.delete(r.id);
                  setSelected(next);
                }}
              />
            ))}
          </ul>
        </>
      )}

      {total > 0 ? (
        <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px] text-muted">
          <span data-range>
            Showing {from} to {to} of {total}
          </span>
          <span className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous page" disabled={view.notifications.page <= 0} onClick={() => setF({ ...f, page: f.page - 1 })} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-paper text-ink-soft hover:bg-paper-2 disabled:opacity-50">
              <ChevronLeftIcon size={16} />
            </button>
            <span className="px-1 font-semibold text-ink">
              {view.notifications.page + 1} / {Math.max(1, view.notifications.totalPages)}
            </span>
            <button type="button" aria-label="Next page" disabled={view.notifications.page + 1 >= view.notifications.totalPages} onClick={() => setF({ ...f, page: f.page + 1 })} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-paper text-ink-soft hover:bg-paper-2 disabled:opacity-50">
              <ChevronRightIcon size={16} />
            </button>
          </span>
        </nav>
      ) : null}
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface NotificationsPageProps {
  orgId: number;
}

export default function ConsultantNotificationsPage({ orgId }: NotificationsPageProps) {
  const toast = useToast();
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [q, setQ] = useState("");
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchNotifications(orgId, f), [orgId, f]));
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef(new Map<string, { ids: number[]; timer: ReturnType<typeof setTimeout> }>());

  // the search box waits for a pause in typing before it asks the API
  useEffect(() => {
    const t = setTimeout(() => setF((cur) => (cur.q === q ? cur : { ...cur, q, page: 0 })), 300);
    return () => clearTimeout(t);
  }, [q]);

  // leaving the page inside an undo window still deletes what the consultant deleted (keepalive is not needed: the BFF call is quick and small)
  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const { ids, timer } of timers.values()) {
        clearTimeout(timer);
        void deleteNotifications(orgId, ids);
      }
      timers.clear();
    };
  }, [orgId]);

  const changeFilters = (next: Filters) => {
    setSelected(new Set());
    setF(next);
  };

  /** Runs one write, then refreshes. A refusal is shown and nothing else is changed. */
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, failure: string, success?: string) => {
    setBusy(true);
    setNotice("");
    try {
      const res = await fn();
      if (res.ok) {
        if (success) toast({ title: success, variant: "success" });
      } else setNotice(res.message ?? failure);
      setSelected(new Set());
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const removeIds = (ids: number[], what: string) => {
    const key = ids.join(",");
    setHidden((h) => new Set([...h, ...ids]));
    setSelected(new Set());
    const timer = setTimeout(() => {
      pending.current.delete(key);
      void deleteNotifications(orgId, ids).then(async (res) => {
        if (!res.ok && res.status !== 404) setNotice(res.message ?? "We couldn't delete that. It is still in your list.");
        setHidden((h) => new Set([...h].filter((x) => !ids.includes(x))));
        await reload();
      });
    }, UNDO_MS);
    pending.current.set(key, { ids, timer });
    toast({
      title: ids.length === 1 ? "Notification deleted" : `${ids.length} notifications deleted`,
      description: what,
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const p = pending.current.get(key);
          if (p) clearTimeout(p.timer);
          pending.current.delete(key);
          setHidden((h) => new Set([...h].filter((x) => !ids.includes(x))));
        },
      },
    });
  };

  const rowActions: RowActions = {
    read: (r, read) => void run(() => markRead(orgId, [r.id], read), "We couldn't update that notification."),
    resolve: (r) => void run(() => resolveNotifications(orgId, [r.id]), "We couldn't resolve that notification.", "Resolved"),
    snooze: (r) => void run(() => snoozeNotifications(orgId, [r.id], snoozeUntil()), "We couldn't snooze that notification.", "Snoozed for a day"),
    remove: (r) => removeIds([r.id], r.title),
  };
  const ids = [...selected];
  const bulk = {
    read: () => void run(() => markRead(orgId, ids, true), "We couldn't mark those as read."),
    resolve: () => void run(() => resolveNotifications(orgId, ids), "We couldn't resolve those.", `${ids.length} resolved`),
    remove: () => removeIds(ids, `${ids.length} selected`),
  };

  const mute = async () => {
    setBusy(true);
    setNotice("");
    const res = await muteNonCritical(orgId);
    setBusy(false);
    if (!res.ok) {
      setNotice(res.message ?? "We couldn't mute notifications. Nothing has changed.");
      return;
    }
    const previous = previousOf(res);
    toast({
      title: "Non-critical notifications muted",
      description: "Interviews, approvals and offers stay on.",
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          void restorePreferences(orgId, previous).then(() => reload());
        },
      },
    });
    await reload();
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-notifications data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {status === "failed" ? (
        <ErrorState what="your notifications" description="Your notifications didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {view ? (
                <>
                  {notice ? (
                    <p role="alert" data-notice className="rounded-lg bg-v2-coral-soft px-3 py-2 text-[13px] text-v2-coral-ink">
                      {notice}
                    </p>
                  ) : null}
                  <Feed
                    headerExtra={
                      <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                        <button type="button" data-mark-all disabled={busy} onClick={() => void run(() => markAllRead(orgId), "We couldn't mark everything as read.", "All notifications marked as read")} className={BTN_OUTLINE}>
                          Mark all as read
                        </button>
                        <button type="button" data-mute disabled={busy || view.muted} onClick={() => void mute()} className={BTN_OUTLINE}>
                          Mute non-critical
                        </button>
                        <Link href="/me#notifications" data-notification-prefs className={BTN_OUTLINE}>
                          Notification preferences
                        </Link>
                      </span>
                    }
                    view={view}
                    f={f}
                    setF={changeFilters}
                    q={q}
                    setQ={setQ}
                    selected={selected}
                    setSelected={setSelected}
                    hidden={hidden}
                    busy={busy}
                    a={rowActions}
                    bulk={bulk}
                  />
                </>
              ) : (
                <div className="grid gap-4" aria-busy="true">
                  <Skeleton className="h-56 w-full" />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
