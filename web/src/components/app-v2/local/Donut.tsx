import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "../common";

export interface DonutSegment {
  label: string;
  value: number;
  tone: Tone;
}

/**
 * conic-gradient ring (white hole) with a centre value + label, and an optional legend.
 * `legendFormat` "count" shows `count  label` (the My Applications board), "pct" shows
 * `label  value (pct%)`.
 */
export default function Donut({
  segments,
  centerValue,
  centerLabel,
  legend = true,
  legendFormat = "count",
  size = 140,
  className,
}: {
  segments: DonutSegment[];
  centerValue: string | number;
  centerLabel: string;
  legend?: boolean;
  legendFormat?: "count" | "pct";
  size?: number;
  className?: string;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const live = segments.filter((s) => s.value > 0);
  const stops = live.map((s, i) => {
    const before = live.slice(0, i).reduce((n, x) => n + x.value, 0);
    return `${TONE[s.tone].color} ${(before / total) * 100}% ${((before + s.value) / total) * 100}%`;
  });
  const ring = stops.length ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#E8ECF4 0 100%)";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-4", className)}>
      <div
        className="relative mx-auto flex-none rounded-full sm:mx-0"
        style={{ width: size, height: size, background: ring }}
        role="img"
        aria-label={`${centerValue} ${centerLabel}: ${segments.map((s) => `${s.value} ${s.label}`).join(", ")}`}
      >
        <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-white text-center">
          <span className="text-[28px] font-extrabold leading-none tracking-tight text-v2-navy">{centerValue}</span>
          <span className="mt-1 text-[12px] leading-none text-v2-ink-soft">{centerLabel}</span>
        </div>
      </div>
      {legend && (
        <ul className="min-w-[130px] flex-1 space-y-2.5">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2.5 text-[13px] text-v2-ink-soft">
              <span aria-hidden className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE[s.tone].solid)} />
              {legendFormat === "count" && (
                <span className="w-5 text-right font-semibold tabular-nums text-v2-navy">{s.value}</span>
              )}
              <span>
                {s.label}
                {legendFormat === "pct" && (
                  <span className="ml-1 tabular-nums text-v2-muted">
                    {s.value} ({Math.round((s.value / total) * 100)}%)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
