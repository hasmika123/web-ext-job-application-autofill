"use client";

import type { ComponentType } from "react";
import { BuildingIcon, CodeBracketsIcon, MemberAvatar, Menu, MoreVerticalIcon, UsersIcon, VideoIcon, cn } from "@kiwiply/ui";
import type { IconProps, MenuEntry } from "@kiwiply/ui";
import { STATUS_LABEL, type InterviewRow, type InterviewStatus, type InterviewType } from "@/lib/ent/marketer-ws/interviews";

/** The icon the board draws for each interview type (Onsite and Client share the building). */
export const TYPE_ICON: Record<InterviewType, ComponentType<IconProps>> = {
  VIDEO: VideoIcon,
  ONSITE: BuildingIcon,
  TECHNICAL: CodeBracketsIcon,
  PANEL: UsersIcon,
  CLIENT: BuildingIcon,
};

/** Status chip tones: a dot + label on a soft tint, tenant tokens only. */
const STATUS_TONE: Record<InterviewStatus, string> = {
  CONFIRMED: "bg-v2-green-soft text-v2-green-ink",
  SCHEDULED: "bg-accent-soft text-accent-deep",
  PENDING_FEEDBACK: "bg-v2-amber-soft text-v2-amber-ink",
  RESCHEDULED: "bg-v2-pink-soft text-v2-pink-ink",
  AWAITING_CONFIRMATION: "bg-paper-2 text-ink-soft",
  COMPLETED: "bg-v2-teal-soft text-v2-teal-ink",
};

export function StatusChip({ status }: { status: InterviewStatus }) {
  return (
    <span data-status-chip={status} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] font-semibold", STATUS_TONE[status])}>
      <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TypeLabel({ type, long = false }: { type: InterviewType; long?: boolean }) {
  const Icon = TYPE_ICON[type];
  const text = type.charAt(0) + type.slice(1).toLowerCase();
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-soft">
      <Icon size={16} className="flex-none text-accent-deep" />
      {long ? `${text} Interview` : text}
    </span>
  );
}

export function Person({ name, avatarUrl, size = 30, bold = true }: { name: string; avatarUrl: string | null; size?: number; bold?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <MemberAvatar name={name} src={avatarUrl} size={size} />
      <span className={cn("truncate", bold ? "font-semibold text-ink" : "text-ink-soft")}>{name}</span>
    </span>
  );
}

export type RowAction = "reschedule" | "confirm" | "feedback" | "remind";

/**
 * The kebab of a row. E1: every item RECORDS or PROPOSES (a reschedule is a proposal, a confirmation is written down, a reminder is a
 * request); there is deliberately nothing here that submits for a consultant.
 */
export function RowMenu({ row, label, onAction }: { row: Pick<InterviewRow, "status" | "consultant">; label?: string; onAction: (a: RowAction) => void }) {
  const items: MenuEntry[] = [];
  if (row.status === "PENDING_FEEDBACK") {
    items.push({ label: "Record feedback", onSelect: () => onAction("feedback") });
  } else if (row.status === "COMPLETED") {
    items.push({ label: "Feedback recorded", onSelect: () => undefined, disabled: true });
  } else {
    items.push({ label: "Propose reschedule", onSelect: () => onAction("reschedule") });
    if (row.status !== "CONFIRMED") items.push({ label: "Record slot confirmed", onSelect: () => onAction("confirm") });
    items.push({ label: "Request reminder", onSelect: () => onAction("remind") });
  }
  return (
    <Menu
      items={items}
      trigger={
        <button type="button" aria-label={label ?? `Actions for ${row.consultant}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-paper-2 hover:text-ink">
          <MoreVerticalIcon size={16} />
        </button>
      }
    />
  );
}
