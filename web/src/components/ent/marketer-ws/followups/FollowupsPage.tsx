"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { AlertIcon, CalendarIcon, CheckCircleIcon, ErrorState, HourglassIcon, PencilIcon, PhoneIcon, SendIcon, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import {
  FOLLOWUP_KPI_KEYS, FOLLOWUP_KPI_TITLES, fetchFollowups, runFollowupAction, type FollowupAction, type FollowupKpiKey, type FollowupRow, type FollowupsView, type InsightWindow,
} from "@/lib/ent/marketer-ws/followups";
import { CARD, CardSkeleton, Empty, Head, KpiTile, VIEW_ALL, type MktPageProps, type TintName } from "../parts";
import ActionDialog, { type DialogKind } from "./ActionDialog";
import FollowupsRail from "./FollowupsRail";
import FollowupTable, { type RowAction } from "./FollowupTable";

/**
 * Follow-ups (design: Follow-ups). One call draws the board: four KPI tiles, Today / Overdue / Upcoming tables and the right column (help, Quick Actions,
 * Insights). ASSIGNED scope. E1: Send Reminder, Log Call and Update Status only RECORD on the follow-up; nothing is emailed and nothing is submitted for a consultant.
 */

const KPI: Record<FollowupKpiKey, { icon: ComponentType<IconProps>; tint: TintName; spark: number; lowerIsBetter?: boolean }> = {
  dueToday: { icon: CalendarIcon, tint: "blue", spark: 1 },
  overdue: { icon: AlertIcon, tint: "coral", spark: 4, lowerIsBetter: true },
  completedToday: { icon: CheckCircleIcon, tint: "green", spark: 2 },
  waiting: { icon: HourglassIcon, tint: "amber", spark: 3, lowerIsBetter: true },
};
const SHOWN = { today: 6, overdue: 6, upcoming: 5 } as const;
type Bucket = keyof typeof SHOWN;

const TOOLBAR_BTN = "inline-flex h-9 flex-none items-center gap-2 rounded-lg border border-[var(--brand-border,var(--color-line))] bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft";

const MESSAGES: Record<string, string> = {
  reminder: "Reminder request recorded. Nothing was emailed.",
  call: "Call logged.",
  status: "Status updated.",
  complete: "Marked complete.",
};

export default function FollowupsPage({ orgId }: MktPageProps) {
  const [view, setView] = useState<FollowupsView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [window, setWindow] = useState<InsightWindow>("THIS_WEEK");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [expanded, setExpanded] = useState<Record<Bucket, boolean>>({ today: false, overdue: false, upcoming: false });
  const [dueDir, setDueDir] = useState<"asc" | "desc">("asc");
  const [dialog, setDialog] = useState<{ kind: DialogKind; ids: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const load = useCallback(
    async (w: InsightWindow) => {
      const r = await fetchFollowups(orgId, w);
      if (r.kind === "OK") {
        setView(r.view);
        setStatus("ready");
      } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
      setRefreshing(false);
      return r.kind;
    },
    [orgId],
  );
  useEffect(() => {
    const t = setTimeout(() => void load("THIS_WEEK"), 0);
    return () => clearTimeout(t);
  }, [load]);

  const changeWindow = (w: InsightWindow) => {
    setWindow(w);
    setRefreshing(true);
    void load(w);
  };

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
    void load(window);
  }

  const rowAction = (a: RowAction, ids: number[]) => open(a, ids);

  const sortedToday = useMemo(() => {
    const items = view?.today.items ?? [];
    return [...items].sort((a, b) => (dueDir === "asc" ? 1 : -1) * (new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()));
  }, [view, dueDir]);

  if (status === "denied") return <ErrorState what="the Follow-ups page" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const header = (
    <>
      <PageHeader title="Follow-ups" subtitle="Track recruiter and client follow-up actions to keep opportunities moving forward." />
      <ClaimsMascot />
      <ClaimsHelpCard />
    </>
  );
  if (status === "failed")
    return (
      <div data-followups-page data-status="failed">
        {header}
        <ErrorState what="your follow-ups" description="Your follow-ups didn't load. Nothing has changed." onRetry={() => void load(window)} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;

  const section = (name: Bucket, title: string, icon: ComponentType<IconProps>, tint: TintName, rows: FollowupRow[], total: number, emptyCopy: string, opts: { withDate: boolean; alert: boolean; sortable?: boolean; toolbar?: ReactNode }) => {
    const limit = expanded[name] ? rows.length : SHOWN[name];
    const shown = rows.slice(0, limit);
    return (
      <section data-followups-card={name} className={CARD}>
        <Head icon={icon} title={title} tint={tint} count={loading ? undefined : total}>
          {opts.toolbar}
          <button type="button" className={cn(VIEW_ALL, "disabled:cursor-default disabled:opacity-60")} disabled={rows.length <= SHOWN[name]} aria-expanded={expanded[name]} onClick={() => setExpanded((e) => ({ ...e, [name]: !e[name] }))}>
            {expanded[name] ? "Show less" : "View all"}
          </button>
        </Head>
        {loading ? (
          <CardSkeleton />
        ) : rows.length === 0 ? (
          <Empty>{emptyCopy}</Empty>
        ) : (
          <FollowupTable
            name={name}
            rows={shown}
            withDate={opts.withDate}
            dueTone={opts.alert ? "alert" : "plain"}
            sortable={opts.sortable}
            sortDir={dueDir}
            onSort={() => setDueDir((d) => (d === "asc" ? "desc" : "asc"))}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onAction={rowAction}
          />
        )}
      </section>
    );
  };

  return (
    <div data-followups-page data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-followups-tiles className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {FOLLOWUP_KPI_KEYS.map((key) => {
          const k = v?.kpis.find((x) => x.key === key);
          const meta = KPI[key];
          return (
            <KpiTile
              key={key}
              id={key}
              title={FOLLOWUP_KPI_TITLES[key]}
              icon={meta.icon}
              tint={meta.tint}
              value={loading ? 0 : (k?.value ?? null)}
              loading={loading}
              deltaPct={k?.deltaPct ?? null}
              versus="vs last week"
              sparkline={k?.sparkline}
              sparkIndex={meta.spark}
              layout="inline"
              lowerIsBetter={meta.lowerIsBetter}
            />
          );
        })}
      </section>

      {notice ? (
        <p role="status" data-followups-notice className={cn("rounded-lg border px-3 py-2 text-[13px] font-medium", notice.tone === "ok" ? "border-line bg-v2-green-soft text-v2-green-ink" : "border-line bg-v2-amber-soft text-v2-amber-ink")}>
          {notice.text}
        </p>
      ) : null}

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          {section("today", "Today's Follow-ups", CalendarIcon, "blue", sortedToday, v?.today.total ?? 0, "You're all caught up.", {
            withDate: false,
            alert: true,
            sortable: true,
            toolbar: (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={TOOLBAR_BTN} onClick={() => open("reminder")}>
                  <SendIcon size={16} />
                  Send Reminder
                </button>
                <button type="button" className={TOOLBAR_BTN} onClick={() => open("call")}>
                  <PhoneIcon size={16} />
                  Log Call
                </button>
                <button type="button" className={TOOLBAR_BTN} onClick={() => open("status")}>
                  <PencilIcon size={16} />
                  Update Status
                </button>
              </div>
            ),
          })}
          {section("overdue", "Overdue Follow-ups", AlertIcon, "coral", v?.overdue.items ?? [], v?.overdue.total ?? 0, "Nothing is overdue.", { withDate: true, alert: true })}
          {section("upcoming", "Upcoming Follow-ups", CalendarIcon, "violet", v?.upcoming.items ?? [], v?.upcoming.total ?? 0, "No upcoming follow-ups.", { withDate: true, alert: false })}
        </div>
        <FollowupsRail insights={v?.insights ?? null} window={window} onWindow={changeWindow} onQuick={(k) => open(k)} loading={loading || refreshing} />
      </div>

      {dialog ? (
        <ActionDialog kind={dialog.kind} count={dialog.ids.length} busy={busy} error={dialogError} onClose={() => setDialog(null)} onSubmit={(a) => void submit(a, dialog.ids)} />
      ) : null}
    </div>
  );
}
