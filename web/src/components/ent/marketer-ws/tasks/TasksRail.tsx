"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  BriefcaseIcon, CalendarCheckIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, FileTextIcon, FolderIcon, LayersIcon, PhoneIcon, PlusIcon, SendIcon, Skeleton, TargetIcon, cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import {
  PRIORITY_LABEL, TASKS_HERO, dayKey, monthGrid, monthLabel, relativeDue, type CalendarDay, type TaskCategory, type TaskPriority, type TaskRow,
} from "@/lib/ent/marketer-ws/tasks";
import { CARD, TINTS, type TintName } from "../parts";
import { PRIORITY_CHIP } from "./TaskTable";

/** The right column of the Tasks board: the illustrated hero card, Calendar, Upcoming Deadlines and Quick Actions. */

const LINK = "text-[12.5px] font-semibold text-accent-deep hover:underline";
const DOT: Record<TaskPriority, string> = { HIGH: "bg-v2-coral-ink", MEDIUM: "bg-accent", LOW: "bg-v2-green-ink" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEADLINE_ICON: Record<TaskCategory, { icon: ComponentType<IconProps>; tint: TintName }> = {
  JOB_OPPORTUNITY: { icon: BriefcaseIcon, tint: "coral" },
  RESUME: { icon: FileTextIcon, tint: "violet" },
  CLIENT: { icon: ClockIcon, tint: "green" },
  JOB_MATCH: { icon: TargetIcon, tint: "pink" },
  APPLICATION: { icon: FolderIcon, tint: "blue" },
  JOB_STREAM: { icon: LayersIcon, tint: "green" },
  INTERVIEW: { icon: CalendarCheckIcon, tint: "violet" },
  CONTENT: { icon: FileTextIcon, tint: "amber" },
  MARKETING: { icon: SendIcon, tint: "amber" },
  FOLLOW_UP: { icon: PhoneIcon, tint: "teal" },
};

export function HeroCard() {
  return (
    <section aria-label="Tasks help" data-tasks-card="hero" className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper">
      {/* eslint-disable-next-line @next/next/no-img-element -- the approved board illustration, cropped and served as is */}
      <img src={TASKS_HERO} alt="" className="block aspect-[299/244] w-full object-cover" />
      <div className="p-4">
        <h2 className="text-[17px] font-extrabold leading-tight text-ink">Turn your tasks into placements!</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">Stay organized, take action, and help your consultants land their next opportunity.</p>
      </div>
    </section>
  );
}

export interface CalendarCardProps {
  month: string;
  days: CalendarDay[];
  loading: boolean;
  selectedDay: string;
  onMonth: (delta: number) => void;
  onDay: (key: string) => void;
  onViewAll: () => void;
}

export function CalendarCard({ month, days, loading, selectedDay, onMonth, onDay, onViewAll }: CalendarCardProps) {
  const byDay = new Map(days.map((d) => [d.date, d]));
  const today = dayKey(new Date());
  return (
    <section aria-label="Calendar" data-tasks-card="calendar" className={CARD}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[16.5px] font-bold text-ink">Calendar</h2>
        <button type="button" onClick={onViewAll} className={LINK}>
          View All
        </button>
      </header>
      <div className="mb-2.5 flex items-center gap-2">
        <button type="button" aria-label="Previous month" onClick={() => onMonth(-1)} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-line text-ink-soft hover:bg-paper-2">
          <ChevronLeftIcon size={16} />
        </button>
        <p aria-live="polite" data-calendar-month className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg border border-line text-[14px] font-semibold text-ink">
          {monthLabel(month)}
        </p>
        <button type="button" aria-label="Next month" onClick={() => onMonth(1)} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-line text-ink-soft hover:bg-paper-2">
          <ChevronRightIcon size={16} />
        </button>
      </div>
      <div className={cn("grid grid-cols-7 gap-y-1 text-center", loading && "opacity-60")} aria-busy={loading}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-[11.5px] font-semibold text-ink-soft">
            {w}
          </span>
        ))}
        {monthGrid(month).map((c) => {
          const d = byDay.get(c.key);
          const isToday = c.key === today;
          return (
            <button
              key={c.key}
              type="button"
              data-calendar-day={c.key}
              data-today={isToday ? "true" : undefined}
              aria-label={`${c.key}${d ? `, ${d.total} ${d.total === 1 ? "task" : "tasks"}` : ""}`}
              aria-pressed={selectedDay === c.key}
              onClick={() => onDay(c.key)}
              className="mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-[13px] hover:bg-paper-2"
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full font-semibold",
                  isToday ? "bg-accent text-on-accent" : c.outside ? "text-muted/60" : "text-ink",
                  selectedDay === c.key && !isToday && "ring-2 ring-accent",
                )}
              >
                {c.day}
              </span>
              <span aria-hidden className="-mt-0.5 h-1.5">
                {d && !c.outside ? <span data-calendar-dot={d.topPriority} className={cn("block h-1.5 w-1.5 rounded-full", DOT[d.topPriority])} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function UpcomingCard({ rows, loading, onViewAll }: { rows: TaskRow[]; loading: boolean; onViewAll: () => void }) {
  const now = new Date();
  return (
    <section aria-label="Upcoming Deadlines" data-tasks-card="upcoming" className={CARD}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[16.5px] font-bold text-ink">Upcoming Deadlines</h2>
        <button type="button" onClick={onViewAll} className={LINK}>
          View All
        </button>
      </header>
      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-[13.5px] text-muted">No upcoming deadlines.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const { icon: Icon, tint } = DEADLINE_ICON[r.category];
            return (
              <li key={r.id} data-deadline={r.id} className="flex items-center gap-3">
                <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", TINTS[tint])}>
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{r.title}</span>
                  <span className="block text-[12px] text-muted">{relativeDue(r.dueAt, now)}</span>
                </span>
                <span className={cn("inline-block flex-none rounded-md px-2.5 py-1 text-center text-[12px] font-semibold", PRIORITY_CHIP[r.priority])}>{PRIORITY_LABEL[r.priority]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Tile({ icon: Icon, label, tint, onClick, href }: { icon: ComponentType<IconProps>; label: string; tint: string; onClick?: () => void; href?: string | null }) {
  const body = (
    <>
      <span aria-hidden className={cn("grid h-[54px] w-[54px] place-items-center rounded-2xl", tint)}>
        <Icon size={26} />
      </span>
      <span className="text-[12px] font-semibold text-accent-deep">{label}</span>
    </>
  );
  const cls = "flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1 hover:bg-paper-2";
  return href ? (
    <Link href={href} data-quick={label} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" data-quick={label} onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/** Quick Actions. Add Task opens the form. Send Reminder, Log Call and Schedule open the Marketing page that does it (when the member has it); otherwise they open the form with that kind of task. */
export function QuickActions({ hrefs, onAdd, onKind }: { hrefs: Record<string, string | null>; onAdd: () => void; onKind: (k: "REMINDER" | "CALL" | "SCHEDULE") => void }) {
  return (
    <section aria-label="Quick Actions" data-tasks-card="quick-actions" className={CARD}>
      <h2 className="mb-3 text-[16.5px] font-bold text-ink">Quick Actions</h2>
      <div className="grid grid-cols-4 gap-1">
        <Tile icon={PlusIcon} label="Add Task" tint="bg-accent text-on-accent" onClick={onAdd} />
        <Tile icon={SendIcon} label="Send Reminder" tint={TINTS.blue} href={hrefs.followups} onClick={() => onKind("REMINDER")} />
        <Tile icon={PhoneIcon} label="Log Call" tint={TINTS.blue} href={hrefs.followups} onClick={() => onKind("CALL")} />
        <Tile icon={CalendarIcon} label="Schedule" tint={TINTS.violet} href={hrefs.interviews} onClick={() => onKind("SCHEDULE")} />
      </div>
    </section>
  );
}

