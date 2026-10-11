"use client";

import { useState } from "react";
import {
  cn,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@kiwiply/ui";
import type { Tone } from "@/components/app-v2/common";
import { CALENDAR_EVENTS, WEEK, type CalendarEvent } from "../sample-data";

/** Event-block palette: soft tint, tone-coloured left rule, navy text. */
const EVENT_TONE: Record<string, string> = {
  blue: "bg-[#E4EEFF] border-v2-blue",
  green: "bg-[#DDF6E3] border-v2-green",
  amber: "bg-[#FFF0D2] border-v2-amber",
  violet: "bg-[#EAE5FF] border-v2-violet",
};
const eventTone = (t: Tone) => EVENT_TONE[t] ?? "bg-[#EEF0F6] border-[#B8BDD0]";

const FIRST_HOUR = 9;
const ROW_PX = 60;

function WeekGrid({ events }: { events: CalendarEvent[] }) {
  return (
    <div
      className="hidden overflow-hidden rounded-xl border border-v2-line md:grid"
      style={{
        gridTemplateColumns: "56px repeat(5, minmax(0, 1fr))",
        gridTemplateRows: `46px repeat(${WEEK.hours.length}, ${ROW_PX}px)`,
      }}
      role="group"
      aria-label={`Interview schedule ${WEEK.label}`}
    >
      {/* corner + day headers */}
      <div style={{ gridColumn: 1, gridRow: 1 }} className="bg-[#F6F8FC]" />
      {WEEK.days.map((d, i) => (
        <div
          key={d.short}
          style={{ gridColumn: i + 2, gridRow: 1 }}
          className="flex flex-col items-center justify-center border-l border-v2-line bg-[#F6F8FC] leading-tight"
        >
          <span className="text-[12.5px] font-bold text-v2-navy">{d.short}</span>
          <span className="text-[11.5px] text-v2-muted">{d.date}</span>
        </div>
      ))}

      {/* hour labels + empty cells */}
      {WEEK.hours.map((h, r) => (
        <div
          key={h}
          style={{ gridColumn: 1, gridRow: r + 2 }}
          className="border-t border-v2-line bg-[#FBFCFE] px-2 pt-1.5 text-right text-[11px] text-v2-muted"
        >
          {h}
        </div>
      ))}
      {WEEK.hours.flatMap((h, r) =>
        WEEK.days.map((d, c) => (
          <div
            key={`${h}-${d.short}`}
            style={{ gridColumn: c + 2, gridRow: r + 2 }}
            className="border-l border-t border-v2-line bg-white"
          />
        )),
      )}

      {/* events, placed on the same grid */}
      {events.map((e) => (
        <div
          key={e.id}
          style={{ gridColumn: e.day + 2, gridRow: `${e.start - FIRST_HOUR + 2} / span ${e.span}` }}
          className={cn(
            "z-[1] m-1 min-w-0 overflow-hidden rounded-lg border-l-[3px] px-2 py-1.5",
            eventTone(e.tone),
          )}
        >
          <p className="truncate text-[12px] font-bold leading-tight text-v2-navy">{e.title}</p>
          <p className="truncate text-[11.5px] leading-tight text-v2-ink-soft">{e.sub}</p>
        </div>
      ))}
    </div>
  );
}

/** Day-by-day list: the < md calendar and the "Month" toggle. */
function Agenda({ events, className }: { events: CalendarEvent[]; className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      {WEEK.days.map((d, i) => {
        const day = events.filter((e) => e.day === i);
        if (day.length === 0) return null;
        return (
          <div key={d.short}>
            <p className="mb-2 text-[12.5px] font-bold text-v2-navy">
              {d.short} {d.date}
            </p>
            <ul className="space-y-2">
              {day.map((e) => (
                <li key={e.id} className={cn("rounded-lg border-l-[3px] px-3 py-2", eventTone(e.tone))}>
                  <p className="text-[12.5px] font-bold leading-tight text-v2-navy">{e.title}</p>
                  <p className="text-[12px] leading-tight text-v2-ink-soft">
                    {e.sub} · {e.time}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Same look as `SectionCard`, but with a header slot for the week navigator + Week/Month toggle. */
function CalendarCard({ title, actions, children }: { title: string; actions: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[16px] font-bold leading-tight tracking-normal text-ink">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** "Interview Schedule" card: Mon-Fri week grid (CSS grid, positioned events) + Week/Month toggle. */
export default function InterviewCalendar() {
  const [view, setView] = useState<"week" | "month">("week");

  return (
    <CalendarCard
      title="Interview Schedule"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-[13px] font-semibold text-v2-navy">
            <button type="button" aria-label="Previous week" className="grid h-7 w-7 place-items-center rounded-lg text-v2-muted hover:bg-[#F1F4FA]">
              <ChevronLeftIcon size={15} />
            </button>
            <span className="whitespace-nowrap px-1">{WEEK.label}</span>
            <button type="button" aria-label="Next week" className="grid h-7 w-7 place-items-center rounded-lg text-v2-muted hover:bg-[#F1F4FA]">
              <ChevronRightIcon size={15} />
            </button>
          </div>
          <div role="group" aria-label="Calendar view" className="flex rounded-[10px] border border-v2-line bg-white p-0.5 text-[12.5px] font-semibold">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-lg px-3 py-1 capitalize transition-colors",
                  view === v ? "bg-v2-blue text-white" : "text-v2-ink-soft hover:bg-[#F1F4FA]",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rounded-[10px] border border-v2-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-v2-blue hover:bg-[#F3F7FF]"
          >
            Today
          </button>
        </div>
      }
    >
      {view === "week" ? (
        <>
          <WeekGrid events={CALENDAR_EVENTS} />
          <Agenda events={CALENDAR_EVENTS} className="md:hidden" />
        </>
      ) : (
        <Agenda events={CALENDAR_EVENTS} />
      )}
    </CalendarCard>
  );
}
