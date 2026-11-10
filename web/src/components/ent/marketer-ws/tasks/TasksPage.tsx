"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ErrorState, ListIcon, PlusIcon, Select, cn } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_QUERY, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER, TASK_TABS, fetchAssignees, fetchTasks,
  pageCount, runTaskAction, showingText, type NewTask, type TaskAction, type TaskRow, type TasksQuery, type TasksView,
} from "@/lib/ent/marketer-ws/tasks";
import { CARD, CardSkeleton, Empty, type MktPageProps } from "../parts";
import TaskDialog, { type DialogState } from "./TaskDialog";
import TaskTable, { type RowAction } from "./TaskTable";

/**
 * Tasks (the Tasks tab of Tasks). One call draws the board: the chip row with counts, the filters and the table with its pager. ASSIGNED scope: a marketer sees the tasks they own. E1: every action only RECORDS on a task; nothing is
 * emailed and nothing is submitted for a consultant.
 */

const MESSAGES: Record<TaskAction["kind"], string> = {
  create: "Task added.",
  update: "Task saved.",
  complete: "Marked complete.",
  reopen: "Task reopened.",
  reassign: "Task reassigned.",
  delete: "Task deleted.",
};

const ALL = (label: string) => [{ value: "", label }];
const FIELD = "min-w-0 flex-1 basis-[140px]";

export default function TasksPage({ orgId, embedded }: MktPageProps) {
  const [query, setQuery] = useState<TasksQuery>(DEFAULT_QUERY);
  const [view, setView] = useState<TasksView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [compact, setCompact] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (q: TasksQuery) => {
      const mine = ++seq.current;
      const r = await fetchTasks(orgId, q);
      if (mine !== seq.current) return;
      if (r.kind === "OK") {
        setView(r.view);
        setStatus("ready");
      } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
      setRefreshing(false);
    },
    [orgId],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(query), 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const change = (patch: Partial<TasksQuery>) => {
    setRefreshing(true);
    setSelected(new Set());
    setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 0 }));
  };

  const toggle = useCallback((id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const toggleAll = useCallback((ids: number[], on: boolean) => setSelected((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; }), []);

  async function submit(action: TaskAction | TaskAction[]) {
    const list = Array.isArray(action) ? action : [action];
    setBusy(true);
    setDialogError(null);
    let failed: { message: string; denied: boolean } | null = null;
    for (const a of list) {
      const r = await runTaskAction(orgId, a);
      if (!r.ok) {
        failed = { message: r.message, denied: r.denied };
        break;
      }
    }
    setBusy(false);
    if (failed) {
      if (failed.denied && !dialog) setStatus("denied");
      else if (dialog) setDialogError(failed.message);
      else setNotice({ tone: "warn", text: failed.message });
      return;
    }
    setDialog(null);
    setSelected(new Set());
    setNotice({ tone: "ok", text: list.length > 1 ? `${MESSAGES[list[0].kind]} (${list.length} tasks)` : MESSAGES[list[0].kind] });
    void load(query);
  }

  const onRowAction = (a: RowAction, row: TaskRow) => {
    setNotice(null);
    setDialogError(null);
    if (a === "complete") void submit({ kind: "complete", id: row.id });
    else if (a === "reopen") void submit({ kind: "reopen", id: row.id });
    else if (a === "edit") setDialog({ kind: "edit", task: row });
    else if (a === "delete") setDialog({ kind: "delete", task: row });
    else {
      setDialog({ kind: "reassign", task: row, assignees: null });
      void fetchAssignees(orgId, row.id).then((list) => {
        if (list === null) {
          setDialog(null);
          setNotice({ tone: "warn", text: "Couldn't load who can take this task. Nothing has changed." });
        } else setDialog((d) => (d && d.kind === "reassign" && d.task.id === row.id ? { ...d, assignees: list } : d));
      });
    }
  };

  const openAdd = (preset?: Partial<NewTask>) => {
    setNotice(null);
    setDialogError(null);
    setDialog({ kind: "create", preset });
  };

  if (status === "denied") return <ErrorState what="the Tasks page" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const header = embedded ? null : <PageHeader title="Tasks" subtitle="What you owe and when: tasks, calls and reminders." />;
  if (status === "failed")
    return (
      <div data-tasks-page data-status="failed">
        {header}
        <ErrorState what="your tasks" description="Your tasks didn't load. Nothing has changed." onRetry={() => void load(query)} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;
  const rows = v?.tasks.items ?? [];
  const total = v?.tasks.total ?? 0;
  const pages = pageCount(total, query.size);
  const filtered = Boolean(query.category || query.priority || query.status || query.owner || query.due);
  const pageNumbers = Array.from({ length: pages }, (_, i) => i).filter((i) => pages <= 5 || Math.abs(i - query.page) <= 2 || i === 0 || i === pages - 1);

  return (
    <div data-tasks-page data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Task views" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-[var(--radius-lg)] border border-line bg-paper p-1.5">
            {TASK_TABS.map((t) => {
              const on = query.tab === t.key;
              const count = v ? v.tabs[t.countKey] : null;
              const red = t.key === "OVERDUE";
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-task-tab={t.key}
                  onClick={() => change({ tab: t.key })}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-colors",
                    on ? "bg-accent text-on-accent" : red ? "text-v2-coral-ink hover:bg-v2-coral-soft" : "text-ink-soft hover:bg-paper-2",
                  )}
                >
                  {t.label}
                  {count !== null ? (
                    <span data-tab-count className={cn("min-w-6 rounded-full px-2 py-0.5 text-center text-[12px] font-bold", on ? "bg-paper/25 text-on-accent" : red ? "bg-v2-coral-soft text-v2-coral-ink" : "bg-paper-2 text-ink-soft")}>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <Button variant="accent" onClick={() => openAdd()} className="min-h-11 gap-2 px-5">
            <PlusIcon size={16} />
            Add task
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5" data-task-filters>
          <div className={FIELD}>
            <Select value={query.category} onChange={(c) => change({ category: c })} aria-label="Category" options={[...ALL("All categories"), ...CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]} />
          </div>
          <div className={FIELD}>
            <Select value={query.priority} onChange={(c) => change({ priority: c })} aria-label="Priority" options={[...ALL("All priorities"), ...PRIORITY_ORDER.map((c) => ({ value: c, label: PRIORITY_LABEL[c] }))]} />
          </div>
          <div className={FIELD}>
            <Select value={query.status} onChange={(c) => change({ status: c })} aria-label="Status" options={[...ALL("All statuses"), ...STATUS_ORDER.map((c) => ({ value: c, label: STATUS_LABEL[c] }))]} />
          </div>
          <div className={FIELD}>
            <Select
              value={query.owner}
              onChange={(c) => change({ owner: c })}
              aria-label="Owner"
              options={[...ALL("All owners"), ...(v?.options.owners ?? []).map((o) => ({ value: String(o.id), label: o.name }))]}
            />
          </div>
          <label className={cn(FIELD, "relative flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-line bg-paper px-3 text-[14px] text-muted")}>
            <CalendarIcon size={17} aria-hidden className="flex-none" />
            <span className="sr-only">Due date</span>
            <input
              type="date"
              aria-label="Due date"
              value={query.due}
              onChange={(e) => change({ due: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
            />
          </label>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={compact}
            title="Compact list"
            onClick={() => setCompact((c) => !c)}
            className={cn("grid h-11 w-11 flex-none place-items-center rounded-[var(--radius)] border border-line text-accent-deep hover:bg-accent-soft", compact ? "bg-accent-soft" : "bg-paper")}
          >
            <ListIcon size={18} />
          </button>
        </div>

        {notice ? (
          <p role="status" data-tasks-notice className={cn("rounded-lg border px-3 py-2 text-[13px] font-medium", notice.tone === "ok" ? "border-line bg-v2-green-soft text-v2-green-ink" : "border-line bg-v2-amber-soft text-v2-amber-ink")}>
            {notice.text}
          </p>
        ) : null}

        {selected.size > 0 ? (
          <div data-tasks-selection className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-accent-soft px-3 py-2 text-[13px] font-semibold text-accent-deep">
            {selected.size} selected
            <Button variant="accent-soft" size="sm" disabled={busy} onClick={() => void submit([...selected].map((id): TaskAction => ({ kind: "complete", id })))}>
              Mark complete
            </Button>
            <button type="button" className="underline" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        ) : null}

        <section data-tasks-card="table" aria-busy={refreshing} className={cn(CARD, "p-0", refreshing && "opacity-70")}>
          {loading ? (
            <div className="p-4">
              <CardSkeleton rows={6} />
            </div>
          ) : rows.length === 0 ? (
            <Empty>{filtered || query.tab !== "ALL" ? "No tasks match these filters." : "No tasks yet. Add one to get started."}</Empty>
          ) : (
            <TaskTable rows={rows} selected={selected} onToggle={toggle} onToggleAll={toggleAll} onAction={onRowAction} compact={compact} />
          )}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <p data-tasks-showing className="text-[13px] text-ink-soft">
              {loading ? "" : showingText(query.page, query.size, total)}
            </p>
            <nav aria-label="Pages" className="flex items-center gap-1.5">
              <button type="button" aria-label="Previous page" disabled={query.page <= 0} onClick={() => change({ page: query.page - 1 })} className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink-soft hover:bg-paper-2 disabled:opacity-40">
                <ChevronLeftIcon size={16} />
              </button>
              {pageNumbers.map((i, idx) => (
                <span key={i} className="flex items-center gap-1.5">
                  {idx > 0 && i - pageNumbers[idx - 1] > 1 ? <span aria-hidden className="text-muted">…</span> : null}
                  <button
                    type="button"
                    aria-label={`Page ${i + 1}`}
                    aria-current={i === query.page ? "page" : undefined}
                    onClick={() => change({ page: i })}
                    className={cn("grid h-10 w-10 place-items-center rounded-lg text-[14px] font-semibold", i === query.page ? "bg-accent-soft text-accent-deep" : "border border-line text-ink hover:bg-paper-2")}
                  >
                    {i + 1}
                  </button>
                </span>
              ))}
              <button type="button" aria-label="Next page" disabled={query.page >= pages - 1} onClick={() => change({ page: query.page + 1 })} className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink-soft hover:bg-paper-2 disabled:opacity-40">
                <ChevronRightIcon size={16} />
              </button>
            </nav>
          </footer>
        </section>
      </div>

      {dialog ? <TaskDialog state={dialog} options={v?.options ?? { consultants: [], clients: [], owners: [] }} busy={busy} error={dialogError} onClose={() => setDialog(null)} onSubmit={(a) => void submit(a)} /> : null}
    </div>
  );
}
