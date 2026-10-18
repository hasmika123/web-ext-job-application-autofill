import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";

/** 6px rounded progress bar (0-100). */
export default function Progress({
  value,
  tone = "green",
  className,
  label,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label ?? "Progress"}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-v2-line", className)}
    >
      <div className={cn("h-full rounded-full", TONE[tone].solid)} style={{ width: `${v}%` }} />
    </div>
  );
}
