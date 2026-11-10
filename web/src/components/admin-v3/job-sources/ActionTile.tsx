import type { ReactNode } from "react";
import { ChevronRightIcon, cn } from "@kiwiply/ui";
import { TONE, type Tone } from "@/components/app-v2/common";

/** Button twin of `AdminLinkTile` (same look) for quick actions that run something instead of navigating. */
export default function ActionTile({
  onClick,
  disabled,
  icon,
  tone,
  title,
  description,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  tone: Tone;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("group flex min-w-0 items-start gap-3 rounded-2xl bg-paper-2/70 p-3.5 text-left transition-colors hover:bg-paper-2 disabled:opacity-60")}
    >
      <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", TONE[tone].soft, TONE[tone].ink)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">{description}</span>}
      </span>
      <ChevronRightIcon size={16} className="mt-3 flex-none text-v2-blue" />
    </button>
  );
}
