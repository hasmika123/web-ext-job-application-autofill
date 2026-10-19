"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { BuildingIcon, CalendarIcon, ChevronDownIcon, ChevronUpIcon, MailIcon, MemberAvatar, MessageIcon, MoreVerticalIcon, PhoneIcon, TeamsIcon, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { CHANNEL_LABEL, PRIORITY_LABEL, dueText, logoFor, photoFor, statusText, type Channel, type FollowupRow, type Priority } from "@/lib/ent/marketer-ws/followups";
import { HEAD_ROW, TH, TINTS } from "../parts";

/** One follow-up table of the board (Today, Overdue or Upcoming): same columns in all three. Colours are tenant tokens only. */

const CHANNEL_ICON: Record<Channel, { icon: ComponentType<IconProps>; tint: string }> = {
  PHONE: { icon: PhoneIcon, tint: TINTS.green },
  EMAIL: { icon: MailIcon, tint: TINTS.blue },
  TEAMS: { icon: TeamsIcon, tint: TINTS.violet },
  CHAT: { icon: MessageIcon, tint: TINTS.teal },
  NOTE: { icon: CalendarIcon, tint: TINTS.amber },
};
const PRIORITY_CHIP: Record<Priority, string> = { HIGH: TINTS.pink, MEDIUM: TINTS.blue, LOW: TINTS.green };
const STATUS_CHIP: Record<string, string> = {
  Pending: TINTS.amber, "In progress": TINTS.blue, Scheduled: TINTS.violet, Overdue: TINTS.pink, "Not started": "bg-paper-2 text-muted", Waiting: TINTS.teal, Completed: TINTS.green,
};

export type RowAction = "reminder" | "call" | "status" | "complete";
export type DueTone = "alert" | "plain";

export interface FollowupTableProps {
  /** `today` | `overdue` | `upcoming`: a data hook for tests and the Home card. */
  name: string;
  rows: FollowupRow[];
  /** Overdue and upcoming rows carry the date ("Oct 14, 9:00 AM"); today's only the time. */
  withDate: boolean;
  dueTone: DueTone;
  /** The Due Time header sorts (the board shows the chevron on Today only). */
  sortable?: boolean;
  sortDir?: "asc" | "desc";
  onSort?: () => void;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: number[], on: boolean) => void;
  onAction: (action: RowAction, ids: number[]) => void;
}

function RowMenu({ row, onAction }: { row: FollowupRow; onAction: FollowupTableProps["onAction"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = (label: string, action: RowAction) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onAction(action, [row.id]);
      }}
      className="block w-full px-3 py-2 text-left text-[13px] text-ink hover:bg-accent-soft"
    >
      {label}
    </button>
  );
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={`More for ${row.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-paper-2">
        <MoreVerticalIcon size={16} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-paper py-1 shadow-lg">
          {item("Log call", "call")}
          {item("Send reminder", "reminder")}
          {item("Update status", "status")}
          {row.status === "COMPLETED" ? null : item("Mark complete", "complete")}
        </div>
      ) : null}
    </div>
  );
}

export default function FollowupTable({ name, rows, withDate, dueTone, sortable, sortDir = "asc", onSort, selected, onToggle, onToggleAll, onAction }: FollowupTableProps) {
  const ids = rows.map((r) => r.id);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <div className="overflow-x-auto" data-followup-table={name}>
      <table className="w-full min-w-[820px] text-left text-[13px]">
        <thead>
          <tr className={HEAD_ROW}>
            <th className="w-9 rounded-l-lg px-2 py-2">
              <input type="checkbox" aria-label={`Select all ${name} follow-ups`} checked={all} onChange={(e) => onToggleAll(ids, e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
            </th>
            <th className={TH}>Follow-up</th>
            <th className={TH}>Consultant</th>
            <th className={TH}>Client / recruiter</th>
            <th className={TH}>Channel</th>
            <th className={TH} aria-sort={sortable ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
              {sortable ? (
                <button type="button" onClick={onSort} className="inline-flex items-center gap-1 font-semibold">
                  Due time {sortDir === "asc" ? <ChevronDownIcon size={13} /> : <ChevronUpIcon size={13} />}
                </button>
              ) : (
                "Due time"
              )}
            </th>
            <th className={TH}>Priority</th>
            <th className={TH}>Status</th>
            <th className="w-9 rounded-r-lg" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const { icon: ChannelIcon, tint } = CHANNEL_ICON[r.channel];
            const logo = logoFor(r.counterpart);
            const label = statusText(r);
            return (
              <tr key={r.id} data-followup-row={r.id} title={r.detail ?? undefined} className="border-b border-line last:border-0">
                <td className="px-2 py-2.5">
                  <input type="checkbox" aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onChange={() => onToggle(r.id)} className="h-4 w-4 accent-[var(--color-accent)]" />
                </td>
                <td className="px-2 font-semibold text-ink">{r.title}</td>
                <td className="px-2">
                  <span className="flex items-center gap-2 whitespace-nowrap text-ink-soft">
                    <MemberAvatar name={r.consultantName} src={photoFor(r.consultantName, r.avatarUrl)} size={30} />
                    {r.consultantName}
                  </span>
                </td>
                <td className="px-2">
                  {r.counterpart ? (
                    <span className="flex items-center gap-2 whitespace-nowrap text-ink-soft">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- approved board art, served as is
                        <img src={logo} alt="" aria-hidden className="h-5 w-5 flex-none rounded object-contain" />
                      ) : (
                        <span aria-hidden className={cn("grid h-5 w-5 flex-none place-items-center rounded", TINTS.blue)}>
                          <BuildingIcon size={13} />
                        </span>
                      )}
                      {r.counterpart}
                    </span>
                  ) : null}
                </td>
                <td className="px-2">
                  <span className="flex items-center gap-2 whitespace-nowrap text-ink-soft">
                    <span aria-hidden className={cn("grid h-6 w-6 flex-none place-items-center rounded-full", tint)}>
                      <ChannelIcon size={13} />
                    </span>
                    {CHANNEL_LABEL[r.channel]}
                  </span>
                </td>
                <td className={cn("whitespace-nowrap px-2 font-medium", dueTone === "alert" ? "text-v2-coral-ink" : "text-ink-soft")}>{dueText(r.dueAt, withDate)}</td>
                <td className="px-2">
                  <span className={cn("inline-block min-w-[58px] rounded-md px-2.5 py-1 text-center text-[12px] font-semibold", PRIORITY_CHIP[r.priority])}>{PRIORITY_LABEL[r.priority]}</span>
                </td>
                <td className="px-2">
                  <span className={cn("inline-block min-w-[78px] whitespace-nowrap rounded-md px-2.5 py-1 text-center text-[12px] font-semibold", STATUS_CHIP[label] ?? "bg-paper-2 text-muted")}>{label}</span>
                </td>
                <td className="px-1">
                  <RowMenu row={r} onAction={onAction} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
