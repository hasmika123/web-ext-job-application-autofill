"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarIcon, CheckCircleIcon, ClockIcon, ErrorState, RefreshIcon } from "@kiwiply/ui";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import {
  KPI_KEYS, KPI_TITLES, addDays, confirmSlot, fetchInterviews, proposeReschedule, recordFeedback, requestReminder, tickPrepItem, weekRange, ymd,
  type InterviewRow, type InterviewsView, type KpiKey,
} from "@/lib/ent/marketer-ws/interviews";
import { HelpBannerCard, KpiTile, type MktPageProps, type TintName } from "../parts";
import { ChecklistCard, PendingFeedbackCard, RemindersCard, UpcomingCard } from "./Cards";
import { FeedbackDialog, RescheduleDialog } from "./Dialogs";
import ScheduleCard, { type Mode } from "./ScheduleCard";
import type { RowAction } from "./bits";

/**
 * Interviews (Marketing workspace; design: Interviews). One call draws the whole board; the date range, status, client and sort are query
 * parameters of that call. Permission `interviews.coordinate`, ASSIGNED scope (the API filters).
 * E1: the kebab menus PROPOSE a reschedule, RECORD a confirmed slot or feedback, and REQUEST a reminder. Nothing here submits for a consultant.
 */

const KPI_STYLE: Record<KpiKey, { icon: typeof CalendarIcon; tint: TintName; spark: number }> = {
  interviewsThisWeek: { icon: CalendarIcon, tint: "blue", spark: 1 },
  confirmedInterviews: { icon: CheckCircleIcon, tint: "green", spark: 3 },
  pendingFeedback: { icon: ClockIcon, tint: "amber", spark: 2 },
  reschedules: { icon: RefreshIcon, tint: "pink", spark: 5 },
};

type Dialog = { kind: "reschedule"; row: InterviewRow } | { kind: "feedback"; row: { id: number; consultant: string; client: string; round: string } };

export default function InterviewsPage({ orgId, orgName }: MktPageProps) {
  const initial = useRef(weekRange()).current;
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [clientFilter, setClientFilter] = useState("ALL");
  const [mode, setMode] = useState<Mode>("list");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<InterviewsView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const r = await fetchInterviews(orgId, {
      from, to, status: statusFilter === "ALL" ? undefined : statusFilter, clientId: clientFilter === "ALL" ? null : Number(clientFilter), sort: "date", dir,
      page: mode === "calendar" ? 0 : page, size: mode === "calendar" ? 100 : 25,
    });
    if (mine !== seq.current) return; // a newer request is in flight
    if (r.kind === "OK") {
      setView(r.view);
      setStatus("ready");
    } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
  }, [orgId, from, to, statusFilter, clientFilter, dir, page, mode]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (status === "denied") return <ErrorState what="Interviews" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const loading = status === "loading";
  const header = (
    <>
      <PageHeader title="Interviews" subtitle="Manage consultant interview schedules and feedback to keep your hiring process on track." />
      <ClaimsMascot />
      <ClaimsHelpCard />
    </>
  );
  if (status === "failed")
    return (
      <div data-interviews data-status="failed">
        {header}
        <ErrorState what="Interviews" description="The interview schedule didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const say = (tone: "ok" | "error", text: string) => setNotice({ tone, text });
  const refused = (r: { kind: string; message?: string }) => (r.kind === "REFUSED" && r.message ? r.message : "That didn't save. Nothing has changed.");

  const act = async (row: InterviewRow, a: RowAction) => {
    setNotice(null);
    if (a === "reschedule") return setDialog({ kind: "reschedule", row });
    if (a === "feedback") return setDialog({ kind: "feedback", row });
    const r = a === "confirm" ? await confirmSlot(orgId, row.id) : await requestReminder(orgId, row.id);
    if (r.kind === "OK") {
      say("ok", a === "confirm" ? `Recorded: ${row.consultant}'s slot with ${row.client} is confirmed.` : `Reminder requested for ${row.consultant}. Nothing is sent from here.`);
      void load();
    } else say("error", refused(r));
  };

  /** The "View all" buttons of the cards under the table move the schedule to the matching slice. */
  const showUpcoming = () => {
    const today = new Date();
    setFrom(ymd(today));
    setTo(ymd(addDays(today, 30)));
    setStatusFilter("ALL");
    setClientFilter("ALL");
    setMode("list");
    setPage(0);
    setDir("asc");
  };
  const showPending = () => {
    const today = new Date();
    setFrom(ymd(addDays(today, -365)));
    setTo(ymd(today));
    setStatusFilter("PENDING_FEEDBACK");
    setClientFilter("ALL");
    setMode("list");
    setPage(0);
    setDir("desc");
  };

  const tick = async (itemId: number, done: boolean) => {
    const before = view;
    const c = view?.checklist;
    if (!c) return;
    setView({ ...view, checklist: { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, done } : i)) } });
    const r = await tickPrepItem(orgId, c.interviewId, itemId, done);
    if (r.kind !== "OK") {
      setView(before);
      say("error", refused(r));
    }
  };

  return (
    <div data-interviews data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-interviews-tiles className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {KPI_KEYS.map((key) => {
          const k = view?.kpis.find((x) => x.key === key);
          const s = KPI_STYLE[key];
          return (
            <KpiTile key={key} id={key} title={KPI_TITLES[key]} icon={s.icon} tint={s.tint} value={k ? k.value : null} deltaPct={k?.deltaPct} versus="vs last week" sparkline={k?.sparkline} sparkIndex={s.spark} loading={loading} />
          );
        })}
      </section>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,310px)]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <ScheduleCard
            schedule={view?.schedule ?? null}
            loading={loading}
            from={from}
            to={to}
            onRange={(f, t) => { setFrom(f); setTo(t); setPage(0); }}
            status={statusFilter}
            onStatus={(v) => { setStatusFilter(v); setPage(0); }}
            clientId={clientFilter}
            onClient={(v) => { setClientFilter(v); setPage(0); }}
            clients={view?.clients ?? []}
            mode={mode}
            onMode={setMode}
            dir={dir}
            onSort={() => { setDir((d) => (d === "asc" ? "desc" : "asc")); setPage(0); }}
            onPage={setPage}
            onAction={(row, a) => void act(row, a)}
            notice={notice}
          />
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.95fr)]">
            <UpcomingCard rows={view?.upcoming ?? []} loading={loading} onViewAll={showUpcoming} />
            <PendingFeedbackCard rows={view?.pendingFeedback ?? []} loading={loading} onViewAll={showPending} onRecord={(r) => setDialog({ kind: "feedback", row: { id: r.id, consultant: r.consultant, client: r.client, round: r.round } })} />
            <ChecklistCard checklist={view?.checklist ?? null} loading={loading} onViewAll={showUpcoming} onTick={(id, done) => void tick(id, done)} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <HelpBannerCard
            title={`Get ready for your interviews with ${orgName} AI`}
            body="I can help you find interview details, past feedback, and preparation tips for your upcoming interviews."
          />
          <RemindersCard reminders={view?.reminders ?? []} rows={view?.upcoming ?? []} loading={loading} onViewAll={showUpcoming} onAction={(row, a) => void act(row, a)} />
        </div>
      </div>

      {dialog?.kind === "reschedule" ? (
        <RescheduleDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            const r = await proposeReschedule(orgId, dialog.row.id, { proposedAt: v.proposedAt, note: v.note || undefined });
            if (r.kind !== "OK") return refused(r);
            setDialog(null);
            say("ok", `Proposed a new time for ${dialog.row.consultant}. They confirm it; the slot keeps its time until then.`);
            void load();
            return null;
          }}
        />
      ) : null}
      {dialog?.kind === "feedback" ? (
        <FeedbackDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            const r = await recordFeedback(orgId, dialog.row.id, { outcome: v.outcome, note: v.note || undefined });
            if (r.kind !== "OK") return refused(r);
            setDialog(null);
            say("ok", `Feedback recorded for ${dialog.row.consultant}.`);
            void load();
            return null;
          }}
        />
      ) : null}
    </div>
  );
}
