"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  AlertIcon,
  BellIcon,
  BarChartIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ClockIcon,
  ArchiveIcon,
  ErrorState,
  EyeOffIcon,
  FileTextIcon,
  GearIcon,
  HandshakeIcon,
  MailIcon,
  Menu,
  MoreVerticalIcon,
  SearchIcon,
  Skeleton,
  Sparkline,
  Switch,
  TrashIcon,
  VideoIcon,
  XIcon,
  ZapIcon,
  chartColor,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BeeCard, Card, Empty, Pill, useWorkspaceData } from "./parts";
import { deltaText, firstName } from "@/lib/ent/consultant-ws/home";
import {
  ARCHIVED,
  CATEGORIES,
  CATEGORY_LABEL,
  DEFAULT_FILTERS,
  PAGE_SIZE,
  PERIOD_OPTIONS,
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  SMS_NOTE,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  channelSummary,
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
  savePreference,
  signed,
  snoozeNotifications,
  snoozeUntil,
  withFilter,
  type Category,
  type CategoryTile,
  type Filters,
  type NRow,
  type NTile,
  type NotificationsView,
  type Pref,
} from "@/lib/ent/consultant-ws/notifications";

/**
 * Consultant Notifications (design/enterprise-consultant/notifications.webp): one call to `GET /api/orgs/{orgId}/me-workspace/notifications` draws the
 * page for the signed-in consultant's OWN feed; the API first derives the missing notifications from the consultant's own rows (idempotent). Tabs,
 * filters, search, paging and the by-category period are query parameters the API answers (nothing is filtered in the browser). Delete has an undo
 * window: the rows hide, the toast offers Undo and the DELETE is sent only when the window ends (or the page is left). Mute writes preferences and
 * its Undo writes the previous ones back. Nothing is emailed, texted or pushed: the channel switches are stored preferences and SMS cannot be on.
 */

const UNDO_MS = 6000;

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

interface TileSpec {
  key: keyof NotificationsView["tiles"];
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
}
const TILE_SPECS: TileSpec[] = [
  { key: "unread", title: "Unread Notifications", icon: BellIcon, tone: "accent" },
  { key: "highPriority", title: "High Priority", icon: AlertIcon, tone: "coral" },
  { key: "today", title: "Today", icon: CalendarIcon, tone: "accent" },
  { key: "upcomingReminders", title: "Upcoming Reminders", icon: ClockIcon, tone: "amber" },
  { key: "resolvedThisWeek", title: "Resolved This Week", icon: CheckCircleIcon, tone: "green" },
];

/** What sits under the number: a plain count change for the open-item tiles, a percent for Resolved, a fixed phrase for Upcoming Reminders. */
function TileNote({ spec, tile }: { spec: TileSpec; tile: NTile }) {
  if (spec.key === "upcomingReminders") return <span className="text-muted">Next 7 days</span>;
  if (spec.key === "resolvedThisWeek") {
    const d = deltaText(tile.deltaPct);
    if (!d) return <span className="text-muted">vs last week</span>;
    return (
      <>
        <span className={cn("font-bold", d.dir === "up" ? "text-v2-green-ink" : d.dir === "down" ? "text-v2-coral-ink" : "text-muted")}>
          {d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"} {d.text}
        </span>
        <span>vs last week</span>
      </>
    );
  }
  // more open items is a worry, more activity today is just a number
  const good = spec.key === "today" ? tile.delta >= 0 : tile.delta <= 0;
  return (
    <>
      <span data-delta className={cn("font-bold", tile.delta === 0 ? "text-muted" : good ? "text-v2-green-ink" : "text-v2-coral-ink")}>
        {signed(tile.delta)}
      </span>
      <span>{tile.vs === "day" ? "from yesterday" : "since last week"}</span>
    </>
  );
}

function Tile({ spec, tile, index }: { spec: TileSpec; tile: NTile | null; index: number }) {
  const Icon = spec.icon;
  return (
    <section aria-label={spec.title} data-stat-tile={spec.key} data-tone={spec.tone} data-state={tile ? "ok" : "loading"} className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
      <span aria-hidden className={cn("grid h-14 w-14 flex-none place-items-center rounded-[14px]", TONES[spec.tone])}>
        <Icon size={26} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-bold leading-tight text-ink">{spec.title}</h3>
        {tile ? (
          <>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p data-tile-value className="text-[30px] font-extrabold leading-none tabular-nums text-ink">
                {tile.value}
              </p>
              {tile.sparkline.length > 1 ? (
                <div className="mb-0.5 w-[42%] max-w-[84px] flex-none">
                  <Sparkline values={tile.sparkline} color={chartColor(index)} />
                </div>
              ) : null}
            </div>
            <p className="mt-2 flex min-h-5 flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
              <TileNote spec={spec} tile={tile} />
            </p>
          </>
        ) : (
          <>
            <Skeleton className="mt-2 h-8 w-16" />
            <Skeleton className="mt-2 h-4 w-24" />
          </>
        )}
      </div>
    </section>
  );
}

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

function Feed({ view, f, setF, q, setQ, selected, setSelected, hidden, busy, a, bulk }: FeedProps) {
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
    <Card id="notifications-feed" title="All Notifications" icon={BellIcon} className="scroll-mt-4">
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

/* ── by category ────────────────────────────────────────────────────────────────────── */

function CategoryCard({ view, period, onPeriod }: { view: NotificationsView; period: Filters["period"]; onPeriod: (p: Filters["period"]) => void }) {
  const items: CategoryTile[] = view.categories.items;
  return (
    <Card
      id="notifications-categories"
      title="Notifications by Category"
      icon={BarChartIcon}
      extra={
        <div className="w-[136px] flex-none">
          <PillSelect label="Period" value={period} onChange={(v) => onPeriod(v as Filters["period"])} options={PERIOD_OPTIONS} />
        </div>
      }
    >
      <ul aria-label="Notifications by category" className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
        {items.map((c) => {
          const d = deltaText(c.deltaPct);
          return (
            <li key={c.category} data-category-tile={c.category} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-paper p-3">
              <CategoryMark category={c.category} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-ink-soft">{CATEGORY_LABEL[c.category]}</p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px] text-muted">
                  <span data-category-count className="text-[22px] font-extrabold leading-none tabular-nums text-ink">
                    {c.count}
                  </span>
                  {d ? (
                    <span>
                      <span className={cn("font-bold", d.dir === "up" ? "text-v2-green-ink" : d.dir === "down" ? "text-v2-coral-ink" : "text-muted")}>
                        {d.dir === "up" ? "+" : d.dir === "down" ? "-" : ""}
                        {d.text}
                      </span>{" "}
                      vs {view.categories.vs}
                    </span>
                  ) : c.count > 0 ? (
                    <span>New this period</span>
                  ) : (
                    <span>None yet</span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── the rail ───────────────────────────────────────────────────────────────────────── */

interface QuickSpec {
  key: string;
  label: string;
  hint: string;
  icon: ComponentType<IconProps>;
  disabled?: boolean;
  onClick: () => void;
}

function QuickActions({ specs }: { specs: QuickSpec[] }) {
  return (
    <Card id="notifications-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {specs.map((q) => {
          const Icon = q.icon;
          return (
            <li key={q.key} className="min-w-0">
              <button
                type="button"
                data-quick={q.key}
                disabled={q.disabled}
                onClick={q.onClick}
                className="flex h-full min-h-[64px] w-full items-center gap-2.5 rounded-xl border border-line bg-paper p-2.5 text-left hover:bg-paper-2/60 disabled:opacity-60"
              >
                <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONES.accent)}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-tight text-ink">{q.label}</span>
                  <span className="block text-[11.5px] leading-snug text-muted">{q.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PrefRow({ pref, open, onToggleOpen, onSave }: { pref: Pref; open: boolean; onToggleOpen: () => void; onSave: (patch: { enabled?: boolean; email?: boolean; inApp?: boolean }) => void }) {
  const label = CATEGORY_LABEL[pref.category];
  return (
    <li data-pref={pref.category} data-enabled={pref.enabled} className="py-2">
      <div className="flex items-center gap-2.5">
        <CategoryMark category={pref.category} size="sm" />
        <button type="button" aria-expanded={open} aria-label={`${label} channels`} onClick={onToggleOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-bold leading-tight text-ink">{label}</span>
          <span className="block truncate text-[11.5px] leading-snug text-muted">{pref.enabled ? channelSummary(pref) : "Off"}</span>
        </button>
        <Switch checked={pref.enabled} onCheckedChange={(on) => onSave({ enabled: on })} aria-label={`${label} notifications`} />
        <button type="button" aria-label={`${open ? "Hide" : "Show"} ${label} channels`} onClick={onToggleOpen} className="grid h-7 w-7 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
          <ChevronRightIcon size={15} className={cn("transition-transform", open && "rotate-90")} />
        </button>
      </div>
      {open ? (
        <div className="ml-[46px] mt-2 grid gap-1.5 text-[12.5px] text-ink-soft">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pref.email} onChange={(e) => onSave({ email: e.target.checked })} className="h-4 w-4 accent-[var(--brand-solid,var(--color-accent))]" />
            Email
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pref.inApp} onChange={(e) => onSave({ inApp: e.target.checked })} className="h-4 w-4 accent-[var(--brand-solid,var(--color-accent))]" />
            In-app
          </label>
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" checked={false} disabled aria-describedby={`sms-note-${pref.category}`} className="h-4 w-4" />
            SMS
            <span id={`sms-note-${pref.category}`} className="text-[11.5px]">
              {SMS_NOTE}
            </span>
          </label>
          {pref.critical ? <p className="text-[11.5px] text-muted">Time-sensitive: Mute Notifications leaves this on.</p> : null}
        </div>
      ) : null}
    </li>
  );
}

function PrefsCard({ view, onSave }: { view: NotificationsView; onSave: (c: Category, patch: { enabled?: boolean; email?: boolean; inApp?: boolean }) => void }) {
  const [open, setOpen] = useState<Category | null>(null);
  return (
    <section id="notifications-prefs" aria-labelledby="notifications-prefs-title" data-home-card="notifications-prefs" className="flex min-w-0 scroll-mt-4 flex-col rounded-[var(--radius-lg)] border border-line bg-paper p-4 sm:p-5">
      <header className="flex min-h-9 items-center gap-2.5">
        <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px]", TONES.accent)}>
          <GearIcon size={19} />
        </span>
        <h2 id="notifications-prefs-title" tabIndex={-1} className="min-w-0 flex-1 text-[16.5px] font-bold text-ink">
          Notification Preferences
        </h2>
      </header>
      <p className="mt-2 text-[12px] leading-snug text-muted">These are your settings only. Nothing is emailed or texted from here yet. SMS isn&apos;t available yet.</p>
      <ul aria-label="Notification preferences" className="mt-1 divide-y divide-line">
        {view.prefs.map((p) => (
          <PrefRow key={p.category} pref={p} open={open === p.category} onToggleOpen={() => setOpen(open === p.category ? null : p.category)} onSave={(patch) => onSave(p.category, patch)} />
        ))}
      </ul>
    </section>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface NotificationsPageProps {
  orgId: number;
  firstName: string;
}

export default function ConsultantNotificationsPage({ orgId, firstName: first }: NotificationsPageProps) {
  const toast = useToast();
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [q, setQ] = useState("");
  const { view, status, reload, setView } = useWorkspaceData(useCallback(() => fetchNotifications(orgId, f), [orgId, f]));
  const loading = status === "loading";
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

  const savePref = async (category: Category, patch: { enabled?: boolean; email?: boolean; inApp?: boolean }) => {
    if (view) setView({ ...view, prefs: view.prefs.map((p) => (p.category === category ? { ...p, ...patch } : p)) });
    setNotice("");
    const res = await savePreference(orgId, category, patch);
    if (!res.ok) setNotice(res.message ?? "We couldn't save that preference. Nothing has changed.");
    await reload();
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

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    el?.querySelector<HTMLElement>("h2")?.focus?.();
  };

  const quick: QuickSpec[] = [
    {
      key: "mark-all",
      label: "Mark All as Read",
      hint: "Clear your unread notifications",
      icon: MailIcon,
      disabled: busy,
      onClick: () => void run(() => markAllRead(orgId), "We couldn't mark everything as read.", "All notifications marked as read"),
    },
    { key: "preferences", label: "Manage Preferences", hint: "Choose what notifications you receive", icon: GearIcon, onClick: () => scrollTo("notifications-prefs") },
    {
      key: "mute",
      label: "Mute Notifications",
      hint: view?.muted ? "Non-critical ones are already paused" : "Pause non-critical notifications",
      icon: EyeOffIcon,
      disabled: busy || view?.muted === true,
      onClick: () => void mute(),
    },
    {
      key: "archived",
      label: "View Archived",
      hint: "See your resolved notifications",
      icon: ArchiveIcon,
      onClick: () => {
        changeFilters(withFilter(DEFAULT_FILTERS, { status: ARCHIVED, period: f.period }));
        scrollTo("notifications-feed");
      },
    },
  ];

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-notifications data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Notifications" subtitle="Stay updated on applications, interviews, approvals, offers, and your career activity." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your notifications" description="Your notifications didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <section aria-label="Key numbers" data-notifications-tiles className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
            {TILE_SPECS.map((s, i) => (
              <Tile key={s.key} spec={s} tile={loading || !view ? null : view.tiles[s.key]} index={i} />
            ))}
          </section>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.36fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {view ? (
                <>
                  {notice ? (
                    <p role="alert" data-notice className="rounded-lg bg-v2-coral-soft px-3 py-2 text-[13px] text-v2-coral-ink">
                      {notice}
                    </p>
                  ) : null}
                  <Feed view={view} f={f} setF={changeFilters} q={q} setQ={setQ} selected={selected} setSelected={setSelected} hidden={hidden} busy={busy} a={rowActions} bulk={bulk} />
                  <CategoryCard view={view} period={f.period} onPeriod={(period) => setF((cur) => ({ ...cur, period }))} />
                </>
              ) : (
                <div className="grid gap-4" aria-busy="true">
                  {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-56 w-full" />
                  ))}
                </div>
              )}
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
              <BeeCard name={firstName(first)} title="Your career companion, here to help!" body="Get timely notifications and never miss important career updates. I'll help you understand your notifications and take the next steps." />
              <QuickActions specs={quick} />
              {view ? <PrefsCard view={view} onSave={(c, patch) => void savePref(c, patch)} /> : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
