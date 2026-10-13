"use client";

import type { ComponentType } from "react";
import {
  BellIcon, BriefcaseIcon, CalendarCheckIcon, CalendarIcon, CheckCircleIcon, ClipboardCheckIcon, ClipboardIcon, ClockIcon, FileTextIcon, HelpCircleIcon, MailIcon, MoreVerticalIcon,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { CARD, CardSkeleton, Empty, Head, TH, VIEW_ALL } from "../parts";
import {
  TYPE_LABEL, daysChip, dayText, shortDateTime, tileOf, timeText,
  type Checklist, type FeedbackRow, type InterviewRow, type InterviewType, type Reminder,
} from "@/lib/ent/marketer-ws/interviews";
import { Person, RowMenu, TypeLabel, type RowAction } from "./bits";

const ViewAll = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button type="button" onClick={onClick} aria-label={label} className={VIEW_ALL}>
    View all
  </button>
);

export function UpcomingCard({ rows, loading, onViewAll }: { rows: InterviewRow[]; loading: boolean; onViewAll: () => void }) {
  return (
    <section data-card="upcoming" className={CARD}>
      <Head icon={CalendarIcon} title="Upcoming Interviews" tint="pink">
        <ViewAll onClick={onViewAll} label="View all upcoming interviews" />
      </Head>
      {loading ? (
        <CardSkeleton />
      ) : rows.length === 0 ? (
        <Empty>No interviews scheduled.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[12.5px]">
            <thead>
              <tr className="bg-paper-2">
                {["Date & Time", "Consultant", "Role", "Client", "Type"].map((h) => (
                  <th key={h} className={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-upcoming-row={r.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-2 py-2 text-ink-soft">{shortDateTime(r.startsAt)}</td>
                  <td className="px-2"><Person name={r.consultant} avatarUrl={r.avatarUrl} size={24} bold={false} /></td>
                  <td className="px-2 text-ink-soft">{r.role}</td>
                  <td className="px-2 text-ink-soft">{r.client}</td>
                  <td className="px-2"><TypeLabel type={r.type} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const DAYS_TONE = { red: "bg-v2-pink-soft text-v2-pink-ink", amber: "bg-v2-amber-soft text-v2-amber-ink", green: "bg-v2-green-soft text-v2-green-ink" } as const;

export function PendingFeedbackCard({ rows, loading, onViewAll, onRecord }: { rows: FeedbackRow[]; loading: boolean; onViewAll: () => void; onRecord: (row: FeedbackRow) => void }) {
  return (
    <section data-card="pending-feedback" className={CARD}>
      <Head icon={ClockIcon} title="Pending Feedback" tint="amber">
        <ViewAll onClick={onViewAll} label="View all pending feedback" />
      </Head>
      {loading ? (
        <CardSkeleton />
      ) : rows.length === 0 ? (
        <Empty>No feedback is waiting.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-[12.5px]">
            <thead>
              <tr className="bg-paper-2">
                {["Interview Date", "Consultant", "Client", "Round", "Days"].map((h) => (
                  <th key={h} className={TH}>{h}</th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const chip = daysChip(r.daysOverdue);
                return (
                  <tr key={r.id} data-feedback-row={r.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-2 py-2 text-ink-soft">{dayText(r.interviewAt)}</td>
                    <td className="px-2"><Person name={r.consultant} avatarUrl={r.avatarUrl} size={24} bold={false} /></td>
                    <td className="px-2 text-ink-soft">{r.client}</td>
                    <td className="px-2 text-ink-soft">{r.round}</td>
                    <td className="px-2">
                      <span data-days-chip={chip.tone} className={cn("inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-semibold", DAYS_TONE[chip.tone])}>
                        {chip.label}
                      </span>
                    </td>
                    <td className="px-1">
                      <RowMenu row={{ status: "PENDING_FEEDBACK", consultant: r.consultant }} label={`Actions for ${r.consultant}`} onAction={() => onRecord(r)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const PREP_ICONS: ComponentType<IconProps>[] = [FileTextIcon, BriefcaseIcon, CalendarCheckIcon, ClipboardIcon, ClipboardCheckIcon, HelpCircleIcon, MailIcon];

export function ChecklistCard({ checklist, loading, onViewAll, onTick }: { checklist: Checklist | null; loading: boolean; onViewAll: () => void; onTick: (itemId: number, done: boolean) => void }) {
  return (
    <section data-card="checklist" className={CARD} title={checklist ? `${checklist.consultant} - ${checklist.client}` : undefined}>
      <Head icon={CheckCircleIcon} title="Preparation Checklist" tint="green">
        <ViewAll onClick={onViewAll} label="View all upcoming interviews" />
      </Head>
      {loading ? (
        <CardSkeleton />
      ) : !checklist || checklist.items.length === 0 ? (
        <Empty>Nothing to prepare for yet.</Empty>
      ) : (
        <ul className="flex flex-col" aria-label={`Preparation for ${checklist.consultant} at ${checklist.client}`}>
          {checklist.items.map((it, i) => {
            const Icon = PREP_ICONS[i % PREP_ICONS.length];
            return (
              <li key={it.id} data-prep-item={it.id} className="flex items-center gap-2.5 py-1.5 text-[12.5px] text-ink-soft">
                <input type="checkbox" checked={it.done} onChange={(e) => onTick(it.id, e.target.checked)} aria-label={it.label} className="h-4 w-4 flex-none rounded border-line accent-[var(--color-accent-deep)]" />
                <Icon size={15} className="flex-none text-accent-deep" />
                <span className={cn("min-w-0 flex-1", it.done && "text-muted line-through")}>{it.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The date tile tone follows the interview type (tenant tokens only). */
const TILE_TONE: Record<InterviewType, string> = {
  VIDEO: "border-line bg-paper text-accent-deep",
  ONSITE: "border-transparent bg-v2-pink-soft text-v2-pink-ink",
  TECHNICAL: "border-transparent bg-accent-soft text-accent-deep",
  PANEL: "border-transparent bg-v2-amber-soft text-v2-amber-ink",
  CLIENT: "border-transparent bg-v2-teal-soft text-v2-teal-ink",
};

export function RemindersCard({ reminders, rows, loading, onViewAll, onAction }: { reminders: Reminder[]; rows: InterviewRow[]; loading: boolean; onViewAll: () => void; onAction: (row: InterviewRow, a: RowAction) => void }) {
  return (
    <section data-card="reminders" className={cn(CARD, "flex-1")}>
      <Head icon={BellIcon} title="Interview Reminders" tint="pink">
        <ViewAll onClick={onViewAll} label="View all reminders" />
      </Head>
      {loading ? (
        <CardSkeleton />
      ) : reminders.length === 0 ? (
        <Empty>No reminders. Nothing is coming up.</Empty>
      ) : (
        <ul className="flex flex-col">
          {reminders.map((r) => {
            const tile = tileOf(r.startsAt);
            const row = rows.find((x) => x.id === r.id);
            return (
              <li key={r.id} data-reminder={r.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-[10px] border text-center leading-none", TILE_TONE[r.type])}>
                  <span>
                    <span className="block text-[10px] font-bold">{tile.month}</span>
                    <span className="block text-[17px] font-extrabold">{tile.day}</span>
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {r.consultant} <span className="font-normal text-ink-soft">&ndash; {r.client}</span>
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {TYPE_LABEL[r.type]} Interview &bull; {timeText(r.startsAt)}
                  </span>
                </span>
                {row ? <RowMenu row={row} label={`Actions for ${r.consultant}`} onAction={(a) => onAction(row, a)} /> : <MoreVerticalIcon size={16} className="text-muted" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
