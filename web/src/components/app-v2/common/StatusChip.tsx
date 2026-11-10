import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";

/** Pill chip: tinted bg, 12px 600. `dot` prefixes a solid dot in the tone colour. */
export default function StatusChip({
  tone = "slate",
  children,
  dot,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none",
        t.soft,
        t.ink,
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", t.solid)} />}
      {children}
    </span>
  );
}
