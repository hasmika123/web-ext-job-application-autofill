import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";

/** Square tinted icon tile used in the settings / preparation lists. `tone` picks the tint + icon colour; `className` overrides (a raw bg/text pair). */
export default function IconTile({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 flex-none items-center justify-center rounded-xl",
        tone && TONE[tone].soft,
        tone && TONE[tone].ink,
        className,
      )}
    >
      {children}
    </span>
  );
}
