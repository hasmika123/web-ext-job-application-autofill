"use client";

import { useEffect, useRef, useState } from "react";
import { BuildingIcon, ChevronDownIcon, MemberAvatar, MoreHorizontalIcon, UsersIcon, cn } from "@kiwiply/ui";
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, dueDateText, logoFor, photoFor, type TaskCategory, type TaskPriority, type TaskRow } from "@/lib/ent/marketer-ws/tasks";
import { HEAD_ROW, TH, TINTS } from "../parts";

/** The Tasks table: checkbox, Task (title + subtitle), Related To, Type, Priority, Due Date, Status, Owner, menu. Colours are tenant tokens only. */

export const TYPE_CHIP: Record<TaskCategory, string> = {
  JOB_OPPORTUNITY: TINTS.blue, RESUME: TINTS.violet, CLIENT: TINTS.green, JOB_MATCH: TINTS.coral, APPLICATION: TINTS.blue,
  JOB_STREAM: TINTS.green, INTERVIEW: TINTS.violet, CONTENT: TINTS.amber, MARKETING: TINTS.pink, FOLLOW_UP: TINTS.teal,
};
export const PRIORITY_CHIP: Record<TaskPriority, string> = { HIGH: TINTS.coral, MEDIUM: TINTS.blue, LOW: TINTS.green };
const STATUS_CHIP: Record<TaskRow["status"], string> = { NOT_STARTED: "bg-paper-2 text-muted", PENDING: TINTS.amber, IN_PROGRESS: TINTS.blue, COMPLETED: TINTS.green };

export type RowAction = "edit" | "complete" | "reopen" | "reassign" | "delete";

/** The consultant (photo + name), else the client (logo or building + name), else the free label ("All Consultants", an ATS name). */
function Related({ row }: { row: TaskRow }) {
  if (row.consultantName) {
    return (
      <span className="flex items-center gap-2.5 whitespace-nowrap text-ink-soft">
        <MemberAvatar name={row.consultantName} src={photoFor(row.consultantName, null)} size={34} />
        {row.consultantName}
      </span>
    );
  }
  const name = row.clientName ?? row.relatedLabel ?? "";
  if (!name) return null;
  const logo = logoFor(name);
  const group = !row.clientName && /^all /i.test(name);
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap text-ink-soft">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- approved board art, served as is
        <img src={logo} alt="" aria-hidden className="h-[34px] w-[34px] flex-none rounded-lg border border-line object-contain" />
      ) : (
        <span aria-hidden className={cn("grid h-[34px] w-[34px] flex-none place-items-center rounded-lg", TINTS.blue)}>
          {group ? <UsersIcon size={18} /> : <BuildingIcon size={18} />}
        </span>
      )}
      {name}
    </span>
  );
}

function RowMenu({ row, onAction }: { row: TaskRow; onAction: (a: RowAction, row: TaskRow) => void }) {
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
  const item = (label: string, action: RowAction, tone = "text-ink") => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onAction(action, row);
      }}
      className={cn("block w-full px-3 py-2 text-left text-[13px] hover:bg-accent-soft", tone)}
    >
      {label}
    </button>
  );
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={`More for ${row.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="grid h-8 w-8 place-items-center rounded-md text-ink-soft hover:bg-paper-2">
        <MoreHorizontalIcon size={18} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-paper py-1 shadow-lg">
          {item("Edit task", "edit")}
          {row.status === "COMPLETED" ? item("Reopen", "reopen") : item("Mark complete", "complete")}
          {item("Reassign", "reassign")}
          {row.canDelete ? item("Delete", "delete", "text-v2-coral-ink") : null}
        </div>
      ) : null}
    </div>
  );
}

export interface TaskTableProps {
  rows: TaskRow[];
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: number[], on: boolean) => void;
  onAction: (action: RowAction, row: TaskRow) => void;
  /** The list-view toggle: tighter rows. */
  compact?: boolean;
}

export default function TaskTable({ rows, selected, onToggle, onToggleAll, onAction, compact }: TaskTableProps) {
  const ids = rows.map((r) => r.id);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const pad = compact ? "py-1.5" : "py-3";
  return (
    <div className="overflow-x-auto" data-task-table>
      <table className="w-full min-w-[980px] text-left text-[13px]">
        <thead>
          <tr className={HEAD_ROW}>
            <th className="w-10 rounded-l-lg px-3 py-3">
              <input type="checkbox" aria-label="Select all tasks" checked={all} onChange={(e) => onToggleAll(ids, e.target.checked)} className="h-[18px] w-[18px] accent-[var(--color-accent)]" />
            </th>
            <th className={cn(TH, "py-3 text-[13px] font-bold text-ink")}>Task</th>
            <th className={cn(TH, "py-3 text-[13px] font-bold text-ink")}>Related To</th>
            <th className={cn(TH, "py-3 text-[13px] font-bold text-ink")}>Type</th>
            <th className={cn(TH, "py-3 text-[13px] font-bold text-ink")}>Priority</th>
            <th className={cn(TH, "py-3 text-[13px] font-bold text-ink")}>Due Date</th>
            <th className={cn(TH, "py-3 text-[13px] font-bold text-ink")}>Status</th>
            <th className={cn(TH, "py-3 text-[13px] font-bold text-ink")}>Owner</th>
            <th className="w-12 rounded-r-lg px-2 text-muted">
              <ChevronDownIcon size={16} aria-hidden />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-task-row={r.id} className={cn("border-b border-line last:border-0", selected.has(r.id) && "bg-accent-soft/40")}>
              <td className={cn("px-3", pad)}>
                <input type="checkbox" aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onChange={() => onToggle(r.id)} className="h-[18px] w-[18px] accent-[var(--color-accent)]" />
              </td>
              <td className={cn("min-w-[200px] px-2", pad)}>
                <span className={cn("block font-bold text-ink", r.status === "COMPLETED" && "text-ink-soft line-through")}>{r.title}</span>
                {r.detail ? <span className="mt-0.5 block text-[12px] text-muted">{r.detail}</span> : null}
              </td>
              <td className={cn("px-2", pad)}>
                <Related row={r} />
              </td>
              <td className={cn("px-2", pad)}>
                <span className={cn("inline-block whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-semibold", TYPE_CHIP[r.category])}>{CATEGORY_LABEL[r.category]}</span>
              </td>
              <td className={cn("px-2", pad)}>
                <span className={cn("inline-block min-w-[62px] rounded-md px-2.5 py-1 text-center text-[12px] font-semibold", PRIORITY_CHIP[r.priority])}>{PRIORITY_LABEL[r.priority]}</span>
              </td>
              <td className={cn("whitespace-nowrap px-2 font-medium", pad, r.overdue ? "text-v2-coral-ink" : "text-ink")}>{dueDateText(r.dueAt)}</td>
              <td className={cn("px-2", pad)}>
                <span className={cn("inline-block min-w-[84px] whitespace-nowrap rounded-md px-2.5 py-1 text-center text-[12px] font-semibold", STATUS_CHIP[r.status])}>{STATUS_LABEL[r.status]}</span>
              </td>
              <td className={cn("px-2", pad)}>
                <span title={r.ownerName || undefined}>
                  <MemberAvatar name={r.ownerName || "Owner"} src={photoFor(r.ownerName, r.avatarUrl)} size={36} />
                </span>
              </td>
              <td className={cn("px-2", pad)}>
                <RowMenu row={r} onAction={onAction} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
