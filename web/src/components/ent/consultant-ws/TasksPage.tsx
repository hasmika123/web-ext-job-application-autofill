"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BriefcaseIcon,
  Button,
  CalendarCheckIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ClipboardCheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DonutChart,
  Dialog,
  ErrorState,
  FileTextIcon,
  MessageIcon,
  Menu,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Skeleton,
  Sparkline,
  TrashIcon,
  UserIcon,
  ZapIcon,
  chartColor,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { CARD, TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, CompanyMark, Empty, Pill, SampleMark, TABLE, TD, useWorkspaceData } from "./parts";
import { deltaText, firstName } from "@/lib/ent/consultant-ws/home";
import {
  DEFAULT_FILTERS,
  DUE_FILTERS,
  DUE_TEXT,
  EMPTY_FORM,
  MAX_TITLE,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  TABS,
  TYPE_OPTIONS,
  createTask,
  dateBlock,
  deleteTask,
  dueInfo,
  fetchTasks,
  formOf,
  priorityLabel,
  priorityTone,
  rangeText,
  reminderWhen,
  setTaskStatus,
  shortDate,
  sortBy,
  statusInfo,
  titleProblem,
  typeLabel,
  updateTask,
  withTab,
  type Filters,
  type SortKey,
  type TabKey,
  type TaskForm,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
  type TaskTile,
  type TaskType,
  type TasksView,
} from "@/lib/ent/consultant-ws/tasks";

/**
 * Consultant Tasks & Follow-ups (design/enterprise-consultant/tasks.webp): one call to `GET /api/orgs/{orgId}/me-workspace/tasks` draws the page for
 * the signed-in consultant's OWN tasks. Tabs, filters, search, sort and paging are query parameters the API answers (nothing is filtered in the
 * browser). Completing a task writes the same `cws_task` row the Home page reads. Delete has an undo window: the row hides, the toast offers Undo and
 * the DELETE call is sent only when the window ends (or the page is left), so Undo never has anything to restore. Rows marked `sample` carry a
 * demo stand-in for "assigned by a marketer": the marketer side is not built yet.
 */

const UNDO_MS = 6000;

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

interface TileSpec {
  key: keyof TasksView["tiles"];
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
}
const TILE_SPECS: TileSpec[] = [
  { key: "total", title: "Total Tasks", icon: ClipboardCheckIcon, tone: "accent" },
  { key: "dueToday", title: "Due Today", icon: CalendarIcon, tone: "coral" },
  { key: "upcoming", title: "Upcoming", icon: ClockIcon, tone: "violet" },
  { key: "overdue", title: "Overdue", icon: AlertIcon, tone: "coral" },
  { key: "completedThisWeek", title: "Completed This Week", icon: CheckCircleIcon, tone: "green" },
];


function Tile({ spec, tile, index }: { spec: TileSpec; tile: TaskTile | null; index: number }) {
  const Icon = spec.icon;
  const d = tile ? deltaText(tile.deltaPct) : null;
  return (
    <section aria-label={spec.title} data-stat-tile={spec.key} data-state={tile ? "ok" : "loading"} className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
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
              {d ? (
                <>
                  <span className={cn("font-bold", d.dir === "up" ? "text-v2-green-ink" : d.dir === "down" ? "text-v2-coral-ink" : "text-muted")}>
                    {d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"} {d.text}
                  </span>
                  <span>vs last week</span>
                </>
              ) : null}
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

/* ── small pieces ───────────────────────────────────────────────────────────────────── */

const selectCls = "min-h-9 w-full appearance-none rounded-lg border border-line bg-paper py-1 pl-3 pr-8 text-[13px] font-semibold text-ink";

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

const PriorityPill = ({ priority }: { priority: string }) => (
  <Pill tone={priorityTone(priority)} className="min-h-7 min-w-[68px] justify-center">
    {priorityLabel(priority)}
  </Pill>
);

const StatusPill = ({ status }: { status: string }) => {
  const s = statusInfo(status);
  return (
    <Pill tone={s.tone} className="min-h-7 min-w-[88px] justify-center">
      {s.label}
    </Pill>
  );
};

const BTN_SOLID = "inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-paper hover:bg-accent-deep disabled:opacity-60";

/** A checkbox that stays a real input (keyboard, screen reader) but is drawn with the theme. */
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

function SortHead({ label, k, f, onSort, className }: { label: string; k: SortKey; f: Filters; onSort: (k: SortKey) => void; className?: string }) {
  const active = f.sort === k;
  return (
    <th scope="col" aria-sort={active ? (f.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap bg-paper-2/60 px-2.5 py-2 text-left text-[12px] font-semibold text-muted", className)}>
      <button type="button" onClick={() => onSort(k)} aria-label={`Sort by ${label}`} className="inline-flex items-center gap-1 font-semibold hover:text-ink">
        {label}
        {active ? f.dir === "asc" ? <ArrowUpIcon size={12} /> : <ArrowDownIcon size={12} /> : null}
      </button>
    </th>
  );
}

/* ── the table ──────────────────────────────────────────────────────────────────────── */

interface Actions {
  toggle: (r: TaskRow) => void;
  status: (r: TaskRow, s: TaskStatus) => void;
  edit: (r: TaskRow) => void;
  remove: (r: TaskRow) => void;
}

function RowMenu({ row, a }: { row: TaskRow; a: Actions }) {
  const moves = STATUS_OPTIONS.filter((s) => s.value !== row.status).map((s) => ({ label: `Mark as ${s.label.toLowerCase()}`, icon: <CheckIcon size={15} />, onSelect: () => a.status(row, s.value) }));
  return (
    <Menu
      trigger={
        <button type="button" aria-label={`More actions for ${row.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
          <MoreVerticalIcon size={16} />
        </button>
      }
      items={[
        { label: "Edit task", icon: <PencilIcon size={15} />, onSelect: () => a.edit(row) },
        ...moves,
        { separator: true },
        { label: "Delete task", icon: <TrashIcon size={15} />, danger: true, onSelect: () => a.remove(row) },
      ]}
    />
  );
}

function AssignedCell({ row, self }: { row: TaskRow; self: string }) {
  const name = row.assignedBy.kind === "SELF" ? "You" : (row.assignedBy.name ?? "Your marketer");
  return (
    <span className="flex items-center gap-2" title={row.assignedBy.kind === "SELF" ? self : name}>
      <span aria-hidden className={cn("grid h-7 w-7 flex-none place-items-center rounded-full text-[10px] font-bold", row.assignedBy.kind === "SELF" ? TONES.accent : TONES.violet)}>
        {row.assignedBy.kind === "SELF" ? <UserIcon size={14} /> : initials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        {row.assignedBy.sample ? <SampleMark /> : null}
      </span>
    </span>
  );
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

function TaskTable({ rows, busy, f, onSort, a, self }: { rows: TaskRow[]; busy: Set<number>; f: Filters; onSort: (k: SortKey) => void; a: Actions; self: string }) {
  return (
    <div className="relative overflow-x-auto">
      <table className={cn(TABLE, "min-w-[680px]")}>
        <thead>
          <tr>
            <th scope="col" className="w-9 rounded-l-lg bg-paper-2/60 px-2.5 py-2">
              <span className="sr-only">Done</span>
            </th>
            <SortHead label="Task Name" k="title" f={f} onSort={onSort} />
            <th scope="col" className="whitespace-nowrap bg-paper-2/60 px-2.5 py-2 text-left text-[12px] font-semibold text-muted">
              Linked Job / Client
            </th>
            <SortHead label="Priority" k="priority" f={f} onSort={onSort} />
            <SortHead label="Due Date" k="due" f={f} onSort={onSort} />
            <SortHead label="Status" k="status" f={f} onSort={onSort} />
            <th scope="col" className="hidden whitespace-nowrap bg-paper-2/60 px-2.5 py-2 text-left text-[12px] font-semibold text-muted 2xl:table-cell">
              Assigned By
            </th>
            <th scope="col" className="rounded-r-lg bg-paper-2/60 px-2.5 py-2 text-left text-[12px] font-semibold text-muted">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const due = dueInfo(r);
            const off = busy.has(r.id);
            const done = r.status === "DONE";
            return (
              <tr key={r.id} data-task={r.id} data-status={r.status} className={done ? "opacity-80" : undefined}>
                <td className={TD}>
                  <Check checked={done} disabled={off} label={`${done ? "Reopen" : "Complete"} ${r.title}`} onChange={() => a.toggle(r)} />
                </td>
                <td className={cn(TD, "max-w-[240px]")}>
                  <span className={cn("block font-semibold leading-tight text-ink", done && "line-through decoration-muted")}>{r.title}</span>
                  <span className="block text-[12px] text-muted">{typeLabel(r.type)}</span>
                  {/* below 2xl the Assigned By column is hidden; the name moves under the title */}
                  <span className="mt-0.5 block text-[12px] text-ink-soft 2xl:hidden">{r.assignedBy.kind === "SELF" ? "Assigned by you" : `Assigned by ${r.assignedBy.name ?? "your marketer"}`}</span>
                </td>
                <td className={TD}>
                  {r.jobTitle || r.company ? (
                    <span className="flex items-center gap-1.5">
                      <CompanyMark name={r.company ?? r.jobTitle} />
                      <span className="min-w-0">
                        <span className="block truncate">{r.company ?? r.jobTitle}</span>
                        {r.company && r.jobTitle ? <span className="block truncate text-[12px] text-muted">{r.jobTitle}</span> : null}
                      </span>
                    </span>
                  ) : (
                    <span aria-label="No linked job" className="text-muted">
                      -
                    </span>
                  )}
                </td>
                <td className={TD}>
                  <PriorityPill priority={r.priority} />
                </td>
                <td className={cn(TD, "whitespace-nowrap")}>
                  <span data-due={due.kind} className={cn("font-semibold", DUE_TEXT[due.kind])}>
                    {due.text}
                  </span>
                </td>
                <td className={TD}>
                  <StatusPill status={r.status} />
                </td>
                <td className={cn(TD, "hidden 2xl:table-cell")}>
                  <AssignedCell row={r} self={self} />
                </td>
                <td className={TD}>
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    <RowMenu row={r} a={a} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── the list card: tabs, filters, table, pager ─────────────────────────────────────── */

function TaskList({ view, f, setF, busy, hidden, a, onNew }: { view: TasksView; f: Filters; setF: (f: Filters) => void; busy: Set<number>; hidden: Set<number>; a: Actions; onNew: () => void }) {
  const [qInput, setQInput] = useState(f.q);
  const lastQ = useRef(f.q);
  useEffect(() => {
    // a reset from outside (a card sent the page to another tab) clears the box too
    if (f.q !== lastQ.current) {
      lastQ.current = f.q;
      setQInput(f.q);
    }
  }, [f.q]);
  useEffect(() => {
    if (qInput === lastQ.current) return;
    const t = setTimeout(() => {
      lastQ.current = qInput;
      setF({ ...f, q: qInput, page: 0 });
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, f, setF]);

  const page = view.tasks;
  const rows = page.items.filter((r) => !hidden.has(r.id));
  const filtered = f.type !== "" || f.priority !== "" || f.assignedBy !== "" || f.due !== "" || f.q !== "";
  const assignedOptions = [{ value: "", label: "Assigned By" }, { value: "SELF", label: "Me" }, ...view.assigners.map((n) => ({ value: n, label: n }))];
  const sampleShown = rows.some((r) => r.assignedBy.sample);
  return (
    <section aria-label="Tasks" data-home-card="tasks-list" className={cn(CARD, "flex min-w-0 flex-col p-3.5 sm:p-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Task views" className="flex min-w-0 flex-1 flex-wrap gap-2">
          {TABS.map((t) => {
            const on = f.tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                data-tab={t.key}
                onClick={() => setF(withTab(f, t.key as TabKey))}
                className={cn("min-h-9 rounded-lg border px-3.5 text-[13px] font-semibold", on ? "border-transparent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink-soft hover:bg-paper-2")}
              >
                {t.label} ({page.counts[t.count]})
              </button>
            );
          })}
        </div>
        <button type="button" data-action="new-task" onClick={onNew} className={BTN_SOLID}>
          <PlusIcon size={15} />
          New Task
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)]">
        <PillSelect label="Task Type" value={f.type} onChange={(v) => setF({ ...f, type: v, page: 0 })} options={[{ value: "", label: "Task Type" }, ...TYPE_OPTIONS]} />
        <PillSelect label="Priority" value={f.priority} onChange={(v) => setF({ ...f, priority: v, page: 0 })} options={[{ value: "", label: "Priority" }, ...PRIORITY_OPTIONS]} />
        <PillSelect label="Assigned By" value={f.assignedBy} onChange={(v) => setF({ ...f, assignedBy: v, page: 0 })} options={assignedOptions} />
        <PillSelect label="Due Date" value={f.due} onChange={(v) => setF({ ...f, due: v, page: 0 })} options={DUE_FILTERS} />
        <label className="relative block min-w-0 sm:col-span-2 xl:col-span-1">
          <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks..."
            value={qInput}
            maxLength={100}
            onChange={(e) => setQInput(e.target.value)}
            className="min-h-9 w-full rounded-lg border border-line bg-paper py-1 pl-9 pr-3 text-[13px] text-ink"
          />
        </label>
      </div>

      <div className="mt-3">
        {rows.length > 0 ? (
          <TaskTable rows={rows} busy={busy} f={f} onSort={(k) => setF(sortBy(f, k))} a={a} self={view.name} />
        ) : (
          <Empty>
            {filtered || f.tab !== "ALL"
              ? "No tasks match these filters."
              : "You have no tasks yet. Add one to keep your follow-ups on track."}
          </Empty>
        )}
      </div>

      {sampleShown ? (
        <p data-sample-note className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <SampleMark />
          Tasks assigned by a marketer are demo stand-ins until that role is connected.
        </p>
      ) : null}

      {page.total > 0 ? (
        <nav aria-label="Task pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <span data-range>{rangeText(page, page.items.length)}</span>
          <span className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous page" disabled={page.page <= 0} onClick={() => setF({ ...f, page: f.page - 1 })} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-paper text-ink hover:bg-paper-2 disabled:opacity-40">
              <ChevronLeftIcon size={15} />
            </button>
            <span className="tabular-nums">
              {page.page + 1} / {Math.max(1, page.totalPages)}
            </span>
            <button type="button" aria-label="Next page" disabled={page.page + 1 >= page.totalPages} onClick={() => setF({ ...f, page: f.page + 1 })} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-paper text-ink hover:bg-paper-2 disabled:opacity-40">
              <ChevronRightIcon size={15} />
            </button>
          </span>
        </nav>
      ) : null}
    </section>
  );
}

/* ── bottom row ─────────────────────────────────────────────────────────────────────── */

function FocusCard({ view, busy, onToggle }: { view: TasksView; busy: Set<number>; onToggle: (id: number, done: boolean) => void }) {
  return (
    <Card id="tasks-focus" title="Today's Focus" icon={CheckCircleIcon} extra={<span className="flex-none text-[12.5px] font-semibold text-muted">{shortDate(view.today)}</span>}>
      {view.focus.length === 0 ? (
        <Empty>Nothing is due today. Enjoy the calm.</Empty>
      ) : (
        <ul aria-label="Today's focus" className="space-y-2.5">
          {view.focus.map((i) => (
            <li key={i.taskId} className="flex items-center gap-2.5 text-[13.5px] text-ink">
              <Check checked={i.done} disabled={busy.has(i.taskId)} label={`${i.done ? "Reopen" : "Complete"} ${i.title}`} onChange={(next) => onToggle(i.taskId, next)} />
              <span className={cn("min-w-0 flex-1", i.done && "text-muted line-through")}>{i.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DeadlinesCard({ view, onOpen }: { view: TasksView; onOpen: () => void }) {
  return (
    <Card id="tasks-deadlines" title="Upcoming Deadlines" icon={ClockIcon} tone="violet">
      {view.deadlines.length === 0 ? (
        <Empty>No upcoming deadlines.</Empty>
      ) : (
        <ul aria-label="Upcoming deadlines" className="space-y-2.5">
          {view.deadlines.map((d) => {
            const b = dateBlock(d.dueOn);
            return (
              <li key={d.taskId}>
                <button type="button" onClick={onOpen} className="flex w-full items-center gap-2.5 rounded-lg text-left hover:bg-paper-2/60">
                  <span aria-hidden className="flex h-11 w-10 flex-none flex-col items-center justify-center rounded-lg border border-line bg-paper">
                    <span className="text-[10px] font-bold leading-none text-v2-coral-ink">{b.month}</span>
                    <span className="text-[16px] font-extrabold leading-tight text-ink">{b.day}</span>
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
                    <span className="block truncate font-semibold">{d.title}</span>
                    {d.company ? <span className="block truncate text-[12px] text-muted">{d.company}</span> : null}
                  </span>
                  <PriorityPill priority={d.priority} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function InsightsCard({ view }: { view: TasksView }) {
  const i = view.insights;
  const rows: { label: string; value: number; color: string }[] = [
    { label: "Completed", value: i.completed, color: "var(--color-v2-green)" },
    { label: "In Progress", value: i.inProgress, color: "var(--color-v2-blue)" },
    { label: "Not Started", value: i.notStarted, color: "var(--color-line)" },
    { label: "Overdue", value: i.overdue, color: "var(--color-v2-coral)" },
  ];
  return (
    <Card id="tasks-insights" title="Task Insights" icon={ZapIcon} tone="amber" extra={<span className="flex-none text-[12.5px] font-semibold text-muted">All tasks</span>}>
      {i.total === 0 ? (
        <Empty>Add a task to see your progress here.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <DonutChart label="Task completion" size={112} legend={false} total={i.completionPct} totalSuffix="%" slices={rows.map((r) => ({ key: r.label, label: r.label, value: r.value, color: r.color }))} />
            <ul aria-label="Task counts" className="min-w-0 flex-1 space-y-1.5 text-[13px]">
              {rows.map((r) => (
                <li key={r.label} className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: r.color }} />
                  <span className="min-w-0 flex-1 text-ink-soft">{r.label}</span>
                  <span className="font-bold tabular-nums text-ink">{r.value}</span>
                </li>
              ))}
            </ul>
          </div>
          {i.note ? (
            <p data-insight-note className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-[12.5px] leading-snug text-accent-deep">
              <span className="block font-bold">You&apos;re making great progress!</span>
              {i.note}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

const QUICK: { key: string; label: string; hint: string; href: string; icon: ComponentType<IconProps> }[] = [
  { key: "resume", label: "Update My Resume", hint: "Keep your profile current", href: `${BASE}/resumes`, icon: FileTextIcon },
  { key: "matches", label: "View Job Matches", hint: "See new opportunities", href: `${BASE}/matches`, icon: BriefcaseIcon },
  { key: "prep", label: "Prepare for Interview", hint: "Access practice resources", href: `${BASE}/interview-prep`, icon: CalendarIcon },
  { key: "availability", label: "Set My Availability", hint: "Update your schedule", href: `${BASE}/availability`, icon: CalendarCheckIcon },
];

function QuickActions() {
  return (
    <Card id="tasks-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <li key={q.key} className="min-w-0">
              <Link href={q.href} data-quick={q.key} className="flex h-full min-h-[64px] items-center gap-2.5 rounded-xl border border-line bg-paper p-2.5 hover:bg-paper-2/60">
                <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONES.accent)}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-tight text-ink">{q.label}</span>
                  <span className="block text-[11.5px] leading-snug text-muted">{q.hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const REMINDER_ICON: Record<string, ComponentType<IconProps>> = { INTERVIEW: CalendarIcon, SUBMISSION: FileTextIcon, FOLLOW_UP: MessageIcon };

function RemindersCard({ view }: { view: TasksView }) {
  return (
    <Card id="tasks-reminders" title="Reminders" icon={AlertIcon} tone="accent">
      {view.reminders.length === 0 ? (
        <Empty>No reminders right now.</Empty>
      ) : (
        <ul aria-label="Reminders" className="space-y-1">
          {view.reminders.map((r, i) => {
            const Icon = REMINDER_ICON[r.kind] ?? ClockIcon;
            const when = reminderWhen(r.at);
            return (
              <li key={`${r.kind}-${i}`}>
                <Link href={r.href} data-reminder={r.kind} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-paper-2/60">
                  <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONES.accent)}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">
                    <span className="block font-semibold text-ink">{r.title}</span>
                    {r.subtitle || when ? <span className="block text-[12px] text-muted">{[r.subtitle, when].filter(Boolean).join(" · ")}</span> : null}
                  </span>
                  <ChevronRightIcon size={15} className="flex-none text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ── create / edit dialog ───────────────────────────────────────────────────────────── */

const fieldCls = "mt-1.5 min-h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13.5px] font-normal text-ink";

function TaskDialog({ open, editing, jobs, busy, error, onCancel, onSave }: { open: boolean; editing: TaskRow | null; jobs: TasksView["jobs"]; busy: boolean; error: string | null; onCancel: () => void; onSave: (f: TaskForm) => void }) {
  return open ? <TaskDialogBody key={editing?.id ?? "new"} editing={editing} jobs={jobs} busy={busy} error={error} onCancel={onCancel} onSave={onSave} /> : null;
}

function TaskDialogBody({ editing, jobs, busy, error, onCancel, onSave }: { editing: TaskRow | null; jobs: TasksView["jobs"]; busy: boolean; error: string | null; onCancel: () => void; onSave: (f: TaskForm) => void }) {
  const [form, setForm] = useState<TaskForm>(editing ? formOf(editing) : EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const problem = touched ? titleProblem(form.title) : null;
  const jobOptions = useMemo(() => {
    const list = [...jobs];
    // an already linked job stays selectable even when it is no longer among the caller's matches
    if (editing?.requirementId && !list.some((j) => j.id === editing.requirementId)) list.unshift({ id: editing.requirementId, title: editing.jobTitle ?? "Linked job", company: editing.company });
    return list;
  }, [jobs, editing]);
  const set = <K extends keyof TaskForm>(k: K, v: TaskForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog
      open
      onClose={onCancel}
      title={editing ? "Edit task" : "New task"}
      description={editing ? undefined : "Add something to your own to-do list. Only you can see it."}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setTouched(true);
              if (!titleProblem(form.title)) onSave(form);
            }}
          >
            {editing ? "Save changes" : "Add task"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block text-[13px] font-semibold text-ink">
          Task name
          <input
            aria-label="Task name"
            value={form.title}
            maxLength={MAX_TITLE + 20}
            onChange={(e) => set("title", e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={problem !== null || error !== null}
            className={fieldCls}
            placeholder="For example: Call the recruiter about the offer"
          />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <label className="block text-[13px] font-semibold text-ink">
            Due date
            <input aria-label="Due date" type="date" value={form.dueOn} onChange={(e) => set("dueOn", e.target.value)} className={fieldCls} />
          </label>
          <label className="block text-[13px] font-semibold text-ink">
            Priority
            <select aria-label="Task priority" value={form.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)} className={fieldCls}>
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] font-semibold text-ink">
            Type
            <select aria-label="Task type" value={form.type} onChange={(e) => set("type", e.target.value as TaskType)} className={fieldCls}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] font-semibold text-ink">
            Linked job
            <select aria-label="Linked job" value={form.requirementId} onChange={(e) => set("requirementId", e.target.value)} className={fieldCls}>
              <option value="">No linked job</option>
              {jobOptions.map((j) => (
                <option key={j.id} value={String(j.id)}>
                  {j.company ? `${j.title} - ${j.company}` : j.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p role="alert" className="min-h-5 text-[12.5px] text-v2-coral-ink">
          {problem ?? error ?? ""}
        </p>
        <p className="text-[12px] text-muted">Please don&apos;t include personal identifiers such as ID or account numbers.</p>
      </div>
    </Dialog>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface TasksPageProps {
  orgId: number;
  firstName: string;
}

export default function ConsultantTasksPage({ orgId, firstName: first }: TasksPageProps) {
  const toast = useToast();
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchTasks(orgId, f), [orgId, f]));
  const loading = status === "loading";
  const [busy, setBusy] = useState<Set<number>>(() => new Set());
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<{ editing: TaskRow | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const pending = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // leaving the page inside an undo window still deletes what the consultant deleted (keepalive lets the request finish)
  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const [id, t] of timers) {
        clearTimeout(t);
        void deleteTask(orgId, id, true);
      }
      timers.clear();
    };
  }, [orgId]);

  const withBusy = async (id: number, fn: () => Promise<void>) => {
    setBusy((s) => new Set(s).add(id));
    try {
      await fn();
    } finally {
      setBusy((s) => new Set([...s].filter((x) => x !== id)));
    }
  };

  const changeStatus = (id: number, next: TaskStatus, title: string) =>
    withBusy(id, async () => {
      setNotice("");
      const res = await setTaskStatus(orgId, id, next);
      if (res.ok) {
        if (next === "DONE") toast({ title: "Task completed", description: title, variant: "success" });
      } else setNotice(res.message ?? "We couldn't update that task. Nothing has changed.");
      await reload();
    });

  const actions: Actions = {
    toggle: (r) => void changeStatus(r.id, r.status === "DONE" ? "NOT_STARTED" : "DONE", r.title),
    status: (r, s) => void changeStatus(r.id, s, r.title),
    edit: (r) => {
      setFormError(null);
      setDialog({ editing: r });
    },
    remove: (r) => {
      setHidden((h) => new Set(h).add(r.id));
      const timer = setTimeout(() => {
        pending.current.delete(r.id);
        void deleteTask(orgId, r.id).then(async (res) => {
          if (!res.ok && res.status !== 404) setNotice(res.message ?? "We couldn't delete that task. It is still on your list.");
          setHidden((h) => new Set([...h].filter((x) => x !== r.id)));
          await reload();
        });
      }, UNDO_MS);
      pending.current.set(r.id, timer);
      toast({
        title: "Task deleted",
        description: r.title,
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            const t = pending.current.get(r.id);
            if (t) clearTimeout(t);
            pending.current.delete(r.id);
            setHidden((h) => new Set([...h].filter((x) => x !== r.id)));
          },
        },
      });
    },
  };

  const save = async (form: TaskForm) => {
    const editing = dialog?.editing ?? null;
    setSaving(true);
    setFormError(null);
    const res = editing ? await updateTask(orgId, editing.id, form) : await createTask(orgId, form);
    setSaving(false);
    if (res.ok) {
      setDialog(null);
      toast({ title: editing ? "Task updated" : "Task added", description: form.title.trim(), variant: "success" });
      await reload();
    } else setFormError(res.message ?? "We couldn't save that task. Nothing has changed.");
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-tasks data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Tasks & Follow-ups" subtitle="Stay on top of your consultant tasks and follow-ups to keep your career moving forward." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your tasks" description="Your tasks didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <section aria-label="Key numbers" data-tasks-tiles className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
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
                  <TaskList
                    view={view}
                    f={f}
                    setF={setF}
                    busy={busy}
                    hidden={hidden}
                    a={actions}
                    onNew={() => {
                      setFormError(null);
                      setDialog({ editing: null });
                    }}
                  />
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-3">
                    <FocusCard view={view} busy={busy} onToggle={(id, done) => void changeStatus(id, done ? "DONE" : "NOT_STARTED", view.focus.find((x) => x.taskId === id)?.title ?? "")} />
                    <DeadlinesCard view={view} onOpen={() => setF(withTab({ ...DEFAULT_FILTERS }, "WEEK"))} />
                    <InsightsCard view={view} />
                  </div>
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
              <BeeCard name={firstName(first)} body="Keep track of your consultant tasks, get personalized guidance, and take action on your next steps. I'm here whenever you need support on your journey." />
              <QuickActions />
              {view ? <RemindersCard view={view} /> : null}
            </div>
          </div>
        </>
      )}

      <TaskDialog open={dialog !== null} editing={dialog?.editing ?? null} jobs={view?.jobs ?? []} busy={saving} error={formError} onCancel={() => setDialog(null)} onSave={(form) => void save(form)} />
    </div>
  );
}

