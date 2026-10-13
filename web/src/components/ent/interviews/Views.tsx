"use client";

import type { ReactNode } from "react";
import { BarChart, Card, ChevronLeftIcon, ChevronRightIcon, DonutChart, EmptyState, IconButton, KanbanBoard, Menu, MoreHorizontalIcon, Button, chartColor, useNarrow } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import {
  CALENDAR_SIZE,
  formatDay,
  formatTime,
  monthGrid,
  monthTitle,
  statusLabel,
  type Analytics,
  type Bucket,
  type Column,
  type InterviewRow,
  type Status,
} from "@/lib/ent/interviews";
import { ClientCell, ConsultantCell, ModeCell, StatusPill } from "./parts";

/* ── Pipeline: one column per status ─────────────────────────────────────────────── */

export interface PipelineProps {
  columns: Column[];
  openId: number | null;
  onOpen: (row: InterviewRow) => void;
  /** Whether the caller may record changes (the API is the real gate). */
  canMove: boolean;
  onMove: (row: InterviewRow, status: Status) => void;
}

const NEXT: Record<Status, Status[]> = { SCHEDULED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"], IN_PROGRESS: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [] };

/**
 * The pipeline view: one column per status, built from the same rows as the table (same filters). There is no dragging: a card moves by
 * its own menu, which records what happened ("Record as Completed"); the API decides which changes are legal.
 */
export function PipelineBoard({ columns, openId, onOpen, canMove, onMove }: PipelineProps) {
  const board = columns.map((c) => ({ id: c.status, title: c.label, count: c.count, cards: c.items }));
  return (
    <div data-pipeline>
      <KanbanBoard
        label="Interviews by status"
        columns={board}
        cardKey={(c) => String(c.id)}
        emptyLabel="No interviews in this status"
        renderCard={(c) => {
          const items: MenuEntry[] = [{ label: "Open details", onSelect: () => onOpen(c) }];
          if (canMove && NEXT[c.status].length > 0) items.push({ separator: true }, { heading: "Record a change" }, ...NEXT[c.status].map((s) => ({ label: `Record as ${statusLabel(s)}`, onSelect: () => onMove(c, s) })));
          return (
            <div data-card-id={c.id} className={`rounded-xl border bg-paper p-2.5 ${openId === c.id ? "border-accent" : "border-line"}`}>
              <div className="flex items-start gap-1">
                <button type="button" onClick={() => onOpen(c)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <span className="block truncate text-[13px] font-semibold text-ink">{c.jobTitle ?? "Not linked to a job"}</span>
                  <span className="block truncate text-[11.5px] text-muted">{c.jobCode ?? c.code}</span>
                </button>
                <Menu
                  trigger={
                    <IconButton aria-label={`Actions for ${c.code}`} title="Card actions">
                      <MoreHorizontalIcon size={15} />
                    </IconButton>
                  }
                  items={items}
                />
              </div>
              <p className="mt-1.5 truncate text-[12.5px] text-ink-soft">{c.consultant.name}</p>
              <p className="truncate text-[12px] text-muted">{c.client.name}</p>
              <p className="mt-1.5 text-[11.5px] text-muted">
                {formatDay(c.scheduledAt)}, {formatTime(c.scheduledAt)}
              </p>
            </div>
          );
        }}
      />
      {columns.some((c) => c.count > c.items.length) && <p className="mt-2 text-[12px] text-muted">Each column shows its 20 nearest interviews. Use the table (All Interviews) with the status filter to see the rest.</p>}
    </div>
  );
}

/* ── Calendar: a month of interviews ─────────────────────────────────────────────── */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CHIPS_PER_DAY = 3; // config-literal-ok: how many interviews one day cell lists before "+N more" (layout)
const DOT: Record<Status, string> = { SCHEDULED: "bg-[var(--ent-pill-blue-fg)]", IN_PROGRESS: "bg-[var(--ent-pill-amber-fg)]", COMPLETED: "bg-[var(--ent-pill-green-fg)]", CANCELLED: "bg-[var(--ent-pill-red-fg)]" };

export interface CalendarProps {
  month: string;
  rows: InterviewRow[];
  total: number;
  openId: number | null;
  onOpen: (row: InterviewRow) => void;
  onMonth: (delta: number | "today") => void;
  today: string;
}

export function CalendarView({ month, rows, total, openId, onOpen, onMonth, today }: CalendarProps) {
  const narrow = useNarrow();
  const byDay = new Map<string, InterviewRow[]>();
  for (const r of rows) {
    const day = r.scheduledAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  const head = (
    <div className="mb-2 flex items-center justify-between gap-2" data-calendar-head>
      <h3 className="text-[15px] font-bold text-ink">{monthTitle(month)}</h3>
      <div className="flex items-center gap-1.5">
        <IconButton aria-label="Previous month" title="Previous month" className="border border-line" onClick={() => onMonth(-1)}>
          <ChevronLeftIcon size={16} />
        </IconButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => onMonth("today")}>
          Today
        </Button>
        <IconButton aria-label="Next month" title="Next month" className="border border-line" onClick={() => onMonth(1)}>
          <ChevronRightIcon size={16} />
        </IconButton>
      </div>
    </div>
  );
  const note = total > rows.length ? <p className="mt-2 text-[12px] text-muted">Showing the first {CALENDAR_SIZE} of {total} interviews this month. Narrow the filters to see the rest.</p> : null;

  if (narrow) {
    const days = [...byDay.keys()].sort();
    return (
      <div data-calendar>
        {head}
        {days.length === 0 ? (
          <EmptyState variant="inline" mascot={false} title="No interviews this month" description="Pick another month, or clear the filters." />
        ) : (
          <ul className="space-y-3" aria-label="Interviews this month">
            {days.map((d) => (
              <li key={d}>
                <p className="mb-1 text-[12.5px] font-semibold text-ink-soft">{formatDay(d)}</p>
                <ul className="space-y-1.5">
                  {(byDay.get(d) ?? []).map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => onOpen(r)} data-calendar-chip={r.id} className={`flex w-full items-center gap-2 rounded-lg border bg-paper px-2.5 py-2 text-left text-[13px] ${openId === r.id ? "border-accent" : "border-line"}`}>
                        <span aria-hidden className={`h-2 w-2 flex-none rounded-full ${DOT[r.status]}`} />
                        <span className="font-semibold text-ink">{formatTime(r.scheduledAt)}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-soft">{r.consultant.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {note}
      </div>
    );
  }
  return (
    <div data-calendar>
      {head}
      <div className="overflow-hidden rounded-xl border border-[var(--ent-table-line,var(--color-line))] bg-paper" role="grid" aria-label={`Interviews in ${monthTitle(month)}`}>
        <div className="grid grid-cols-7 border-b border-[var(--ent-table-line,var(--color-line))] bg-[var(--ent-table-head-bg,transparent)]" role="row">
          {WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" className="px-2 py-2 text-[12px] font-semibold text-ink">
              {w}
            </div>
          ))}
        </div>
        {monthGrid(month).map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-[var(--ent-table-line,var(--color-line))] last:border-b-0" role="row">
            {week.map((day) => {
              const inMonth = day.startsWith(month);
              const list = byDay.get(day) ?? [];
              return (
                <div key={day} role="gridcell" data-day={day} className={`min-h-[92px] border-r border-[var(--ent-table-line,var(--color-line))] p-1.5 last:border-r-0 ${inMonth ? "" : "bg-paper-2/40"}`}>
                  <span className={`mb-1 inline-grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11.5px] font-semibold ${day === today ? "bg-accent text-on-accent" : inMonth ? "text-ink" : "text-muted"}`}>{Number(day.slice(8, 10))}</span>
                  <ul className="space-y-0.5">
                    {list.slice(0, CHIPS_PER_DAY).map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(r)}
                          data-calendar-chip={r.id}
                          title={`${formatTime(r.scheduledAt)} ${r.consultant.name} (${statusLabel(r.status)})`}
                          className={`flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] hover:bg-accent-soft ${openId === r.id ? "bg-accent-soft" : "bg-paper-2/60"}`}
                        >
                          <span aria-hidden className={`h-1.5 w-1.5 flex-none rounded-full ${DOT[r.status]}`} />
                          <span className="font-semibold text-ink">{formatTime(r.scheduledAt).replace(":00", "")}</span>
                          <span className="truncate text-ink-soft">{r.consultant.name.split(" ")[0]}</span>
                        </button>
                      </li>
                    ))}
                    {list.length > CHIPS_PER_DAY && <li className="px-1.5 text-[11px] font-semibold text-accent-deep">+{list.length - CHIPS_PER_DAY} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {note}
    </div>
  );
}

/* ── Analytics ───────────────────────────────────────────────────────────────────── */

function Panel({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <Card className="!p-4" data-analytics={testId}>
      <h3 className="mb-3 text-[14px] font-bold text-ink">{title}</h3>
      {children}
    </Card>
  );
}

function Bars({ rows, label }: { rows: Bucket[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0 || rows.every((r) => r.count === 0)) return <p className="py-3 text-[13px] text-muted">Nothing to show yet.</p>;
  return (
    <ul aria-label={label} className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[minmax(5rem,9rem)_1fr_2.5rem] items-center gap-2 text-[12.5px]">
          <span className="truncate text-ink-soft" title={r.label}>{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-paper-2">
            <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: chartColor(i % 5) }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-ink">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** The Analytics tab: small charts of real counts. Percentages are computed by the API from counts; nothing is typed in. */
export function AnalyticsTab({ data }: { data: Analytics }) {
  if (data.total === 0) {
    return <EmptyState variant="inline" mascot={false} title="No interviews to analyse yet" description="Charts appear once interviews are scheduled." />;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-analytics-tab>
      <Panel title="Where interviews are now" testId="status">
        <DonutChart label="Interviews by status" total={data.total} totalLabel="interviews" size={140} slices={data.byStatus.map((b, i) => ({ key: b.key, label: b.label, value: b.count, color: chartColor(i) }))} />
        <p className="mt-3 text-[12.5px] text-muted">
          {data.upcoming7} scheduled in the next 7 days
          {data.completionRate !== null ? `, ${data.completionRate}% of finished interviews were completed` : ""}
          {data.avgPerWeek !== null ? `, about ${data.avgPerWeek} a week lately` : ""}.
        </p>
      </Panel>
      <Panel title="Interviews per month" testId="months">
        <BarChart label="Interviews per month, last six months" categories={data.perMonth.map((m) => m.label)} series={[{ key: "interviews", label: "Interviews", values: data.perMonth.map((m) => m.count) }]} height={170} />
      </Panel>
      <Panel title="By mode" testId="modes">
        <Bars rows={data.byMode} label="Interviews per mode" />
      </Panel>
      <Panel title="By round" testId="rounds">
        <Bars rows={data.byRound} label="Interviews per round" />
      </Panel>
      <Panel title="Top clients" testId="clients">
        <Bars rows={data.topClients} label="Interviews per client" />
      </Panel>
    </div>
  );
}

/** Used by the calendar's agenda rows on a phone and by the grid. */
export function RowSummary({ row }: { row: InterviewRow }) {
  return (
    <div className="space-y-1.5">
      <ConsultantCell consultant={row.consultant} />
      <div className="flex items-center justify-between gap-2">
        <ClientCell client={row.client} />
        <StatusPill status={row.status} />
      </div>
      <ModeCell mode={row.mode} />
    </div>
  );
}
