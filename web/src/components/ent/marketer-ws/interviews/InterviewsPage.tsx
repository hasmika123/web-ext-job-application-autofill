"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  addDays, confirmSlot, fetchInterviews, proposeReschedule, recordFeedback, requestReminder, weekRange, ymd,
  type InterviewRow, type InterviewsView,
} from "@/lib/ent/marketer-ws/interviews";
import type { MktPageProps } from "../parts";
import { PendingFeedbackCard } from "./Cards";
import { FeedbackDialog, RescheduleDialog } from "./Dialogs";
import ScheduleCard, { type Mode } from "./ScheduleCard";
import type { RowAction } from "./bits";

/**
 * Interviews (Marketing workspace). One call draws the whole board (the schedule and Pending feedback); the date range, status, client and sort are query
 * parameters of that call. Permission `interviews.coordinate`, ASSIGNED scope (the API filters).
 * E1: the kebab menus PROPOSE a reschedule, RECORD a confirmed slot or feedback, and REQUEST a reminder. Nothing here submits for a consultant.
 */

type Dialog = { kind: "reschedule"; row: InterviewRow } | { kind: "feedback"; row: { id: number; consultant: string; client: string; round: string } };

export default function InterviewsPage({ orgId }: MktPageProps) {
  const [from, setFrom] = useState(() => weekRange().from);
  const [to, setTo] = useState(() => weekRange().to);
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
  const header = <PageHeader title="Interviews" subtitle="Your consultants' interviews, and the feedback still owed." />;
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

  /** The "View all" button of Pending feedback moves the schedule to the matching slice. */
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

  return (
    <div data-interviews data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <ScheduleCard
          schedule={view?.schedule ?? null}
          thisWeek={view?.kpis.find((k) => k.key === "interviewsThisWeek")?.value ?? null}
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
        <PendingFeedbackCard rows={view?.pendingFeedback ?? []} loading={loading} onViewAll={showPending} onRecord={(r) => setDialog({ kind: "feedback", row: { id: r.id, consultant: r.consultant, client: r.client, round: r.round } })} />
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
