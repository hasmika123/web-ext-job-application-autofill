"use client";

import { cn } from "@kiwiply/ui";
import { addDays, parseYmd, timeText, ymd, type InterviewRow } from "@/lib/ent/marketer-ws/interviews";
import { RowMenu, StatusChip, TypeLabel, type RowAction } from "./bits";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_WEEKS = 5;

const hourOf = (iso: string) => new Date(iso).getHours();
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

/**
 * The Calendar half of the List / Calendar switch: a real week grid (days across, hours down) over the picked range, one grid per 7 days
 * (at most five). Every event is the same row the list shows, with the same kebab; nothing here moves an interview by itself.
 */
export default function CalendarWeeks({ from, to, rows, onAction }: { from: string; to: string; rows: InterviewRow[]; onAction: (row: InterviewRow, a: RowAction) => void }) {
  const start = parseYmd(from);
  const end = parseYmd(to);
  if (!start || !end) return null;
  const weeks: Date[][] = [];
  for (let w = 0, d = start; w < MAX_WEEKS && d <= end; w++, d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  const byDay = new Map<string, InterviewRow[]>();
  for (const r of rows) {
    const k = ymd(new Date(r.startsAt));
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  return (
    <div data-calendar className="flex flex-col gap-4">
      {weeks.map((days, wi) => {
        const inWeek = rows.filter((r) => days.some((d) => ymd(d) === ymd(new Date(r.startsAt))));
        const hours = inWeek.map((r) => hourOf(r.startsAt));
        const lo = Math.min(8, ...hours);
        const hi = Math.max(17, ...hours);
        return (
          <div key={wi} className="overflow-x-auto">
            <div role="grid" aria-label={`Week of ${ymd(days[0])}`} className="grid min-w-[760px] grid-cols-[52px_repeat(7,minmax(0,1fr))] border-l border-t border-line text-[12.5px]">
              <div role="row" className="contents">
                <div role="columnheader" aria-label="Hour" className="border-b border-r border-line bg-paper-2" />
                {days.map((d) => {
                  const inRange = ymd(d) >= from && ymd(d) <= to;
                  return (
                    <div key={ymd(d)} role="columnheader" className={cn("border-b border-r border-line bg-paper-2 px-2 py-1.5 text-center font-semibold", inRange ? "text-ink-soft" : "text-muted opacity-60")}>
                      {DAY[d.getDay()]} <span className="text-ink">{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>
              {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((h) => (
                <div key={h} role="row" className="contents">
                  <div role="rowheader" className="border-b border-r border-line px-1.5 py-1 text-right text-[11.5px] text-muted">{hourLabel(h)}</div>
                  {days.map((d) => {
                    const cell = (byDay.get(ymd(d)) ?? []).filter((r) => hourOf(r.startsAt) === h);
                    return (
                      <div key={ymd(d)} role="gridcell" className="flex min-h-[44px] flex-col gap-1 border-b border-r border-line p-1">
                        {cell.map((r) => (
                          <div key={r.id} data-cal-event={r.id} className="rounded-md border border-line bg-accent-soft/60 p-1.5">
                            <div className="flex items-start justify-between gap-1">
                              <span className="min-w-0 truncate font-semibold text-ink">{r.consultant}</span>
                              <RowMenu row={r} onAction={(a) => onAction(r, a)} />
                            </div>
                            <div className="truncate text-ink-soft">
                              {timeText(r.startsAt)} &middot; {r.client}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <TypeLabel type={r.type} />
                              <StatusChip status={r.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
