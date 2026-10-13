"use client";

import { MemberAvatar, StatePill, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { PRIORITY_LABEL, STATUS_LABEL, type Person } from "@/lib/ent/marketing-assignments";

/** One chip for the assignment status and one for the priority (the StatePill's tones: green, amber, red, grey). */
if (!hasStateMap("assignment")) registerStateMap("assignment", { ACTIVE: "green", PAUSED: "grey" });
if (!hasStateMap("assignment-priority")) registerStateMap("assignment-priority", { HIGH: "red", MEDIUM: "amber", LOW: "grey" });

export function AssignmentStatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted">{"—"}</span>;
  return <StatePill domain="assignment" state={status} label={STATUS_LABEL[status] ?? status} />;
}

export function PriorityPill({ priority }: { priority: string | null }) {
  if (!priority) return <span className="text-muted">{"—"}</span>;
  return <StatePill domain="assignment-priority" state={priority} label={PRIORITY_LABEL[priority] ?? priority} />;
}

/** A marketer as an initials circle and a name; none reads as a dash (never a made-up face: the platform keeps no photos). */
export function PersonChip({ person, size = 24, none = "—" }: { person: Person | null; size?: number; none?: string }) {
  if (!person) return <span className="text-muted">{none}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <MemberAvatar name={person.name} size={size} />
      <span className="truncate text-[13px] text-ink">{person.name}</span>
    </span>
  );
}

/** The checkbox of the table and the pickers: a real input, 44 px tap target through its padding on a phone. */
export function Check({ checked, indeterminate, onChange, label, disabled }: { checked: boolean; indeterminate?: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded border-line accent-[var(--brand-primary,var(--color-accent))] disabled:cursor-not-allowed"
    />
  );
}
