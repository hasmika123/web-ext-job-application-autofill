"use client";

import { ArrowDownIcon, ArrowUpIcon, CalendarIcon, Select, cn } from "@kiwiply/ui";
import { CARD, CardSkeleton, Empty, HEAD_ROW, Head, TH } from "../parts";
import { STATUS_LABEL, STATUS_OPTIONS, dayText, timeText, type ClientOption, type InterviewRow, type Schedule } from "@/lib/ent/marketer-ws/interviews";
import { Person, RowMenu, StatusChip, TypeLabel, type RowAction } from "./bits";
import CalendarWeeks from "./CalendarWeeks";
import DateRangePicker from "./DateRangePicker";

export type Mode = "list" | "calendar";

export interface ScheduleCardProps {
  schedule: Schedule | null;
  /** Interviews in the current calendar week (the old tile), drawn as "8 this week" next to the title; null draws nothing. */
  thisWeek: number | null;
  loading: boolean;
  from: string;
  to: string;
  onRange: (from: string, to: string) => void;
  status: string;
  onStatus: (v: string) => void;
  clientId: string;
  onClient: (v: string) => void;
  clients: ClientOption[];
  mode: Mode;
  onMode: (m: Mode) => void;
  dir: "asc" | "desc";
  onSort: () => void;
  onPage: (page: number) => void;
  onAction: (row: InterviewRow, a: RowAction) => void;
  notice: { tone: "ok" | "error"; text: string } | null;
}

const SEG = "h-9 px-4 text-[13.5px] font-semibold transition-colors";

/** The Schedule card: filters, the List / Calendar switch, and the table (or the week grid) of the picked range. */
export default function ScheduleCard(p: ScheduleCardProps) {
  const rows = p.schedule?.items ?? [];
  const total = p.schedule?.total ?? 0;
  const size = p.schedule?.size ?? 25;
  const page = p.schedule?.page ?? 0;
  return (
    <section data-card="schedule" aria-label="Schedule" className={CARD}>
      <Head icon={CalendarIcon} title="Schedule" tint="blue">
        {p.thisWeek !== null ? <span data-this-week className="text-[13px] font-semibold text-ink-soft">{p.thisWeek} this week</span> : null}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={p.from} to={p.to} onChange={p.onRange} />
          <Select
            variant="pill"
            aria-label="Status"
            value={p.status}
            onChange={p.onStatus}
            className="h-10"
            options={[{ value: "ALL", label: "All statuses" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
          />
          <Select variant="pill" aria-label="Client" value={p.clientId} onChange={p.onClient} className="h-10" options={[{ value: "ALL", label: "All clients" }, ...p.clients.map((c) => ({ value: String(c.id), label: c.name }))]} />
          <div role="group" aria-label="View" className="inline-flex items-center overflow-hidden rounded-[10px] border border-line bg-paper">
            <span className={cn(SEG, "inline-flex items-center text-accent-deep")}>View</span>
            <button type="button" aria-pressed={p.mode === "list"} onClick={() => p.onMode("list")} className={cn(SEG, p.mode === "list" ? "bg-accent text-on-accent" : "text-ink hover:bg-paper-2")}>
              List
            </button>
            <button type="button" aria-pressed={p.mode === "calendar"} onClick={() => p.onMode("calendar")} className={cn(SEG, p.mode === "calendar" ? "bg-accent text-on-accent" : "text-ink hover:bg-paper-2")}>
              Calendar
            </button>
          </div>
        </div>
      </Head>

      {p.notice ? (
        <p role="status" data-notice={p.notice.tone} className={cn("mb-3 rounded-lg px-3 py-2 text-[13px]", p.notice.tone === "ok" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-pink-soft text-v2-pink-ink")}>
          {p.notice.text}
        </p>
      ) : null}

      {p.loading ? (
        <CardSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <Empty>{p.status !== "ALL" || p.clientId !== "ALL" ? "No interviews match these filters." : "No interviews scheduled in this period."}</Empty>
      ) : p.mode === "calendar" ? (
        <CalendarWeeks from={p.from} to={p.to} rows={rows} onAction={p.onAction} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[13px]">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={cn(TH, "rounded-l-lg")}>Consultant</th>
                <th className={TH}>Role</th>
                <th className={TH}>Client</th>
                <th className={TH}>Interview type</th>
                <th className={TH} aria-sort={p.dir === "asc" ? "ascending" : "descending"}>
                  <button type="button" onClick={p.onSort} className="inline-flex items-center gap-1 font-semibold text-accent-deep" aria-label="Sort by date and time">
                    Date and time
                    {p.dir === "asc" ? <ArrowUpIcon size={13} /> : <ArrowDownIcon size={13} />}
                  </button>
                </th>
                <th className={TH}>Round</th>
                <th className={TH}>Recruiter / contact</th>
                <th className={TH}>Status</th>
                <th className={cn(TH, "rounded-r-lg text-center")}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-interview-row={r.id} className="border-b border-line last:border-0">
                  <td className="px-2 py-2"><Person name={r.consultant} avatarUrl={r.avatarUrl} size={32} /></td>
                  <td className="px-2 text-ink-soft">{r.role}</td>
                  <td className="px-2 text-ink-soft">{r.client}</td>
                  <td className="px-2"><TypeLabel type={r.type} long /></td>
                  <td className="whitespace-nowrap px-2 text-ink-soft">
                    <span className="block">{dayText(r.startsAt)}</span>
                    <span className="block">{timeText(r.startsAt)}</span>
                    {r.status === "RESCHEDULED" && r.proposedFor ? <span className="block text-[12px] text-v2-pink-ink">Proposed: {dayText(r.proposedFor)} {timeText(r.proposedFor)}</span> : null}
                  </td>
                  <td className="px-2 text-ink-soft">{r.round}</td>
                  <td className="px-2 text-ink-soft">{r.recruiter}</td>
                  <td className="px-2"><StatusChip status={r.status} /></td>
                  <td className="px-2 text-center"><RowMenu row={r} onAction={(a) => p.onAction(r, a)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!p.loading && p.mode === "list" && total > size ? (
        <nav aria-label="Pages" className="mt-3 flex items-center justify-between gap-2 text-[12.5px] text-muted">
          <span>
            Showing {page * size + 1}&ndash;{Math.min(total, page * size + rows.length)} of {total}
          </span>
          <span className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => p.onPage(page - 1)} className="h-8 rounded-lg border border-line px-3 font-semibold text-ink disabled:opacity-50">
              Previous
            </button>
            <button type="button" disabled={(page + 1) * size >= total} onClick={() => p.onPage(page + 1)} className="h-8 rounded-lg border border-line px-3 font-semibold text-ink disabled:opacity-50">
              Next
            </button>
          </span>
        </nav>
      ) : null}
    </section>
  );
}
