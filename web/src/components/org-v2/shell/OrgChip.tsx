"use client";

import { cn, BuildingIcon } from "@kiwiply/ui";
import { useOrg } from "./OrgContext";
import { statusLabel } from "./org-labels";

/**
 * "Acme Bootcamp [Draft]" chip: building icon, the real org name and a status pill. Static here (every page hero shows one);
 * the top bar wraps it in `OrgSwitcher` to make it the org switcher. `compact` drops the pill on a phone so the name keeps its room.
 */
export default function OrgChip({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { org } = useOrg();
  const status = statusLabel(org.status);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-xl border border-v2-line/70 bg-white/70 px-3 py-2 text-[14px] font-bold text-v2-navy",
        className,
      )}
    >
      <BuildingIcon className="h-[18px] w-[18px] flex-none text-v2-ink-soft" />
      <span className="min-w-0 truncate">{org.name}</span>
      <span className={cn("flex-none rounded-md px-2 py-0.5 text-[13px] font-semibold", status.tone, compact && "hidden sm:inline")}>{status.label}</span>
    </span>
  );
}
