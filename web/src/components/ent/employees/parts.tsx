"use client";

import { MemberAvatar, StatePill, Tooltip, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { rolesSorted, statusLabel, type PersonRef, type RoleRef } from "@/lib/ent/members";

/** The member status map of the StatePill (one chip for every enterprise domain): green Active, amber Invited, red Suspended, grey Offboarded. */
if (!hasStateMap("member")) {
  registerStateMap("member", { ACTIVE: "green", INVITED: "amber", SUSPENDED: "red", LEFT: "grey", REMOVED: "grey", ERASED: "grey" });
}

export function MemberStatusPill({ status }: { status: string }) {
  return <StatePill domain="member" state={status} label={statusLabel(status)} />;
}

/** The primary role first and filled, the rest soft; more than `max` collapse into "+N" (with the names in a tooltip). */
export function RoleChips({ roles, max = 1, className }: { roles: RoleRef[]; max?: number; className?: string }) {
  const sorted = rolesSorted(roles);
  if (sorted.length === 0) return <span className="text-muted">None</span>;
  const shown = sorted.slice(0, max);
  const rest = sorted.slice(max);
  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-1 ${className ?? ""}`} data-role-chips>
      {shown.map((r) => (
        <span key={`${r.roleId}-${r.key}`} className="inline-flex max-w-full items-center truncate rounded-full bg-accent-soft px-2.5 py-[3px] text-[11.5px] font-semibold leading-none text-accent-deep">
          {r.name}
        </span>
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.map((r) => r.name).join(", ")} side="top">
          <span tabIndex={0} aria-label={`${rest.length} more ${rest.length === 1 ? "role" : "roles"}: ${rest.map((r) => r.name).join(", ")}`} className="inline-flex items-center rounded-full bg-paper-2 px-2 py-[3px] text-[11.5px] font-semibold leading-none text-ink-soft">
            +{rest.length}
          </span>
        </Tooltip>
      )}
    </span>
  );
}

/** A manager as a small avatar and a name; a row seen only through a summary scope carries none, and that reads as a dash. */
export function ManagerCell({ manager, size = 24 }: { manager: PersonRef | null; size?: number }) {
  if (!manager) return <span className="text-muted">{"—"}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <MemberAvatar name={manager.name} size={size} src={manager.avatarUrl} />
      <span className="truncate text-[13px] text-ink">{manager.name}</span>
    </span>
  );
}
