import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";
import { areaPath, ribbonPath, toPoints } from "./chart-utils";

/** 80x28 sparkline: a ribbon along the values plus a faint area, in the tone colour. */
export default function Sparkline({
  points,
  tone = "blue",
  className,
  width = 80,
  height = 28,
}: {
  points: number[];
  tone?: Tone;
  className?: string;
  width?: number;
  height?: number;
}) {
  const pts = toPoints(points, { pad: 14 });
  const color = TONE[tone].color;
  return (
    <span role="img" aria-label="Trend" className={cn("relative block flex-none", className)} style={{ width, height }}>
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: `linear-gradient(to bottom, ${color}, transparent)`, opacity: 0.18, clipPath: areaPath(pts) }}
      />
      <span aria-hidden className="absolute inset-0" style={{ background: color, clipPath: ribbonPath(pts, 11) }} />
    </span>
  );
}
