import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";

/** Circular progress (match score): a conic-gradient ring with a white hole and centred content. */
export default function ProgressRing({
  value,
  tone = "green",
  size = 44,
  thickness = 5,
  children,
  className,
  label,
}: {
  value: number;
  tone?: Tone;
  size?: number;
  thickness?: number;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="img"
      aria-label={label ?? `${Math.round(v)} percent`}
      className={cn("relative grid flex-none place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${TONE[tone].color} ${v * 3.6}deg, var(--color-v2-line) 0)`,
      }}
    >
      <div
        className="grid place-items-center rounded-full bg-paper text-center"
        style={{ width: size - thickness * 2, height: size - thickness * 2 }}
      >
        {children}
      </div>
    </div>
  );
}
