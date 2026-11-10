"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, PencilIcon, PhoneIcon, SendIcon, cn } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { fetchFollowups, runFollowupAction, type FollowupAction, type FollowupRow, type FollowupsView } from "@/lib/ent/marketer-ws/followups";
import { CARD, CardSkeleton, Empty, type MktPageProps } from "../parts";
import ActionDialog, { type DialogKind } from "./ActionDialog";
import FollowupTable, { type RowAction } from "./FollowupTable";

/**
 * Follow-ups (the Follow-ups tab of Tasks). One call draws the board: a chip row (Today, Overdue, Upcoming, Done) and one table. ASSIGNED scope. E1: Send reminder,
 * Log call and Update status are row actions that only RECORD on the follow-up; nothing is emailed and nothing is submitted for a consultant.
 */

type Bucket = "today" | "overdue" | "upcoming" | "done";
const BUCKETS: { key: Bucket; label: string; empty: string }[] = [
  { key: "today", label: "Today", empty: "You're all caught up." },
  { key: "overdue", label: "Overdue", empty: "Nothing is overdue." },
  { key: "upcoming", label: "Upcoming", empty: "No upcoming follow-ups." },
  { key: "done", label: "Done", empty: "Nothing completed yet." },
];

const BAR_BTN = "inline-flex h-9 flex-none items-center gap-2 rounded-lg border border-[var(--brand-border,var(--color-line))] bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft";

const MESSAGES: Record<string, string> = {
  reminder: "Reminder request recorded. Nothing was emailed.",
  call: "Call logged.",
  status: "Status updated.",
  complete: "Marked complete.",
};

export default function FollowupsPage({ orgId, embedded }: MktPageProps) {
  const [view, setView] = useState<FollowupsView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [bucket, setBucket] = useState<Bucket>("today");
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [dueDir, setDueDir] = useState<"asc" | "desc">("asc");
  const [dialog, setDialog] = useState<{ kind: DialogKind; ids: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const load = useCallback(
    async () => {
      const r = await fetchFollowups(orgId, "THIS_WEEK");
      if (r.kind === "OK") {
        setView(r.view);
        setStatus("ready");
      } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
      return r.kind;
    },
    [orgId],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = useCallback((id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const toggleAll = useCallback((ids: number[], on: boolean) => setSelected((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; }), []);

  /** Open the dialog for the given rows (or the checked ones). Asks for a selection first when there is none. */
  const open = (kind: DialogKind | "complete", ids?: number[]) => {
    const target = ids ?? [...selected];
    if (target.length === 0) {
      setNotice({ tone: "warn", text: "Select at least one follow-up first." });
      return;
    }
    setNotice(null);
    setDialogError(null);
    if (kind === "complete") void submit({ kind: "complete" }, target);
    else setDialog({ kind, ids: target });
  };

  async function submit(action: FollowupAction, ids: number[]) {
    setBusy(true);
    setDialogError(null);
    let failed: { message: string; denied: boolean } | null = null;
    for (const id of ids) {
      const r = await runFollowupAction(orgId, id, action);
      if (!r.ok) {
        failed = { message: r.message, denied: r.denied };
        break;
      }
    }
    setBusy(false);
    if (failed) {
      if (failed.denied) setStatus("denied");
      else if (dialog) setDialogError(failed.message);
      else setNotice({ tone: "warn", text: failed.message });
      return;
    }
    setDialog(null);
    setSelected(new Set());
    setNotice({ tone: "ok", text: ids.length > 1 ? `${MESSAGES[action.kind]} (${ids.length} follow-ups)` : MESSAGES[action.kind] });
    void load();
  }

  const rowAction = (a: RowAction, ids: number[]) => open(a, ids);

  // the rows of each chip, from the lists the board already loads; "Done" is the completed ones among them
  const lists = useMemo(() => {
    const sortByDue = (items: FollowupRow[]) => [...items].sort((a, b) => (dueDir === "asc" ? 1 : -1) * (new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()));
    const seen = new Set<number>();
    const done: FollowupRow[] = [];
    for (const r of [...(view?.today.items ?? []), ...(view?.overdue.items ?? []), ...(view?.upcoming.items ?? [])]) {
      if (r.status === "COMPLETED" && !seen.has(r.id)) {
        seen.add(r.id);
        done.push(r);
      }
    }
    return {
      today: { rows: sortByDue(view?.today.items ?? []), total: view?.today.total ?? 0 },
      overdue: { rows: view?.overdue.items ?? [], total: view?.overdue.total ?? 0 },
      upcoming: { rows: view?.upcoming.items ?? [], total: view?.upcoming.total ?? 0 },
      done: { rows: done, total: done.length },
    } satisfies Record<Bucket, { rows: FollowupRow[]; total: number }>;
  }, [view, dueDir]);

  if (status === "denied") return <ErrorState what="the Follow-ups page" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const header = embedded ? null : <PageHeader title="Tasks" subtitle="What you owe and when: tasks, calls and reminders." />;
  if (status === "failed")
    return (
      <div data-followups-page data-status="failed">
        {header}
        <ErrorState what="your follow-ups" description="Your follow-ups didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";

  return (
    <div data-followups-page data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <div role="group" aria-label="Follow-up filter" data-followups-chips className="flex flex-wrap items-center gap-2">
        {BUCKETS.map((b) => {
          const active = bucket === b.key;
          return (
            <button
              key={b.key}
              type="button"
              aria-pressed={active}
              data-followup-chip={b.key}
              onClick={() => setBucket(b.key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold",
                active ? "border-accent bg-accent-soft text-accent-deep" : b.key === "overdue" ? "border-line bg-paper text-v2-coral-ink hover:border-accent" : "border-line bg-paper text-ink-soft hover:border-accent",
              )}
            >
              {b.label} ({loading ? "..." : lists[b.key].total})
            </button>
          );
        })}
      </div>

      {notice ? (
        <p role="status" data-followups-notice className={cn("rounded-lg border px-3 py-2 text-[13px] font-medium", notice.tone === "ok" ? "border-line bg-v2-green-soft text-v2-green-ink" : "border-line bg-v2-amber-soft text-v2-amber-ink")}>
          {notice.text}
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div data-followups-selection className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-accent-soft px-3 py-2 text-[13px] font-semibold text-accent-deep">
          {selected.size} selected
          <button type="button" className={BAR_BTN} onClick={() => open("reminder")}>
            <SendIcon size={16} />
            Send reminder
          </button>
          <button type="button" className={BAR_BTN} onClick={() => open("call")}>
            <PhoneIcon size={16} />
            Log call
          </button>
          <button type="button" className={BAR_BTN} onClick={() => open("status")}>
            <PencilIcon size={16} />
            Update status
          </button>
          <button type="button" className="underline" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      ) : null}

      <section data-followups-card={bucket} className={CARD}>
        {loading ? (
          <CardSkeleton />
        ) : lists[bucket].rows.length === 0 ? (
          <Empty>{BUCKETS.find((b) => b.key === bucket)!.empty}</Empty>
        ) : (
          <FollowupTable
            name={bucket}
            rows={lists[bucket].rows}
            withDate={bucket !== "today"}
            dueTone={bucket === "upcoming" || bucket === "done" ? "plain" : "alert"}
            sortable={bucket === "today"}
            sortDir={dueDir}
            onSort={() => setDueDir((d) => (d === "asc" ? "desc" : "asc"))}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onAction={rowAction}
          />
        )}
      </section>

      {dialog ? (
        <ActionDialog kind={dialog.kind} count={dialog.ids.length} busy={busy} error={dialogError} onClose={() => setDialog(null)} onSubmit={(a) => void submit(a, dialog.ids)} />
      ) : null}
    </div>
  );
}
