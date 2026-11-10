"use client";

import { CheckIcon, cn } from "@kiwiply/ui";
import { TONE } from "@/components/app-v2/common";
import { pickableStatuses, STATUS_META, type ApplicationStatus } from "@/lib/applications";

/**
 * The status picker of the detail sheet: every status the person can move to, as chips, with the current one
 * ticked. Picking one acts at once (the page shows an Undo toast), so this is a plain group of buttons: arrow keys
 * never change a status by accident. Not a "next stage" button: you can jump anywhere (saved straight to offer).
 */
export default function StatusPicker({
  value,
  onPick,
  disabled,
  className,
}: {
  value: string;
  onPick(next: ApplicationStatus): void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Application status" className={cn("flex flex-wrap gap-1.5", className)}>
      {pickableStatuses(value).map((s) => {
        const on = s === value;
        const tone = TONE[STATUS_META[s].tone];
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => {
              if (!on) onPick(s);
            }}
            data-status={s}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold transition-[transform,background-color] duration-150 motion-safe:active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              on ? cn("border-transparent", tone.soft, tone.ink) : "border-v2-line bg-paper text-ink-soft hover:bg-paper-2",
            )}
          >
            {on ? <CheckIcon aria-hidden className="h-3.5 w-3.5" strokeWidth={3} /> : <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tone.solid)} />}
            {STATUS_META[s].label}
          </button>
        );
      })}
    </div>
  );
}
