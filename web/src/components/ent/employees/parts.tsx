"use client";

import { Tooltip, hasStateMap, registerStateMap, toneOf } from "@kiwiply/ui";
import { rolesSorted, statusLabel, type RoleRef } from "@/lib/ent/members";

/** The member status map of the StatePill (one chip for every enterprise domain): green Active, amber Invited, red Suspended, grey Offboarded. */
if (!hasStateMap("member")) {
  registerStateMap("member", { ACTIVE: "green", INVITED: "amber", SUSPENDED: "red", LEFT: "grey", REMOVED: "grey", ERASED: "grey" });
}

/** The board's status pills: soft tinted fill, a rounded-rectangle shape (not a capsule), semibold 12 px. Green stays green under every tenant brand. */
const STATUS_TONE: Record<string, string> = {
  green: "bg-v2-green-soft text-v2-green-ink",
  amber: "bg-v2-amber-soft text-v2-amber-ink",
  red: "bg-v2-coral-soft text-v2-coral-ink",
  grey: "bg-paper-2 text-ink-soft",
};

export function MemberStatusPill({ status, className }: { status: string; className?: string }) {
  const tone = toneOf("member", status);
  return (
    <span data-state-pill="member" data-tone={tone} className={`inline-flex max-w-full items-center truncate rounded-[9px] px-2.5 py-[5px] text-[12px] font-semibold leading-none ${STATUS_TONE[tone] ?? STATUS_TONE.grey} ${className ?? ""}`}>
      {statusLabel(status)}
    </span>
  );
}

/** The board colours a role pill by its kind (violet, blue, amber, green, pink); one role keeps one colour everywhere (a stable hash of its name). */
const ROLE_TONES = [
  "bg-v2-violet-soft text-v2-violet-ink",
  "bg-accent-soft text-accent-deep",
  "bg-v2-amber-soft text-v2-amber-ink",
  "bg-v2-green-soft text-v2-green-ink",
  "bg-v2-coral-soft text-v2-coral-ink",
];
export function roleTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ROLE_TONES[h % ROLE_TONES.length];
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
        <span key={`${r.roleId}-${r.key}`} className={`inline-flex max-w-full items-center truncate rounded-full px-3.5 py-[7px] text-[13.5px] font-medium leading-none ${roleTone(r.name)}`}>
          {r.name}
        </span>
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.map((r) => r.name).join(", ")} side="top">
          <span tabIndex={0} aria-label={`${rest.length} more ${rest.length === 1 ? "role" : "roles"}: ${rest.map((r) => r.name).join(", ")}`} className="inline-flex items-center rounded-full bg-paper-2 px-2 py-[6px] text-[12px] font-semibold leading-none text-ink-soft">
            +{rest.length}
          </span>
        </Tooltip>
      )}
    </span>
  );
}
