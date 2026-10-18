import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";

export interface BarGroup {
  label: string;
  values: number[];
}
export interface ChartSeries {
  label: string;
  tone: Tone;
}

/**
 * Grouped vertical bars: one group per label, one bar per series, with y-axis ticks, hairline
 * grid and a legend of tone dots. Pure CSS (heights are % of `max`).
 */
export default function BarGroupChart({
  groups,
  series,
  max,
  yTicks,
  height = 200,
  className,
}: {
  groups: BarGroup[];
  series: ChartSeries[];
  max: number;
  yTicks: number[];
  height?: number;
  className?: string;
}) {
  const ticks = [...yTicks].sort((a, b) => b - a);
  return (
    <div className={cn("w-full", className)}>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-soft">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", TONE[s.tone].solid)} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="flex gap-2" style={{ height }}>
        <div className="relative w-8 flex-none text-right text-[11px] text-v2-muted" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed border-v2-line"
              style={{ top: `${100 - (t / max) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-2 px-1">
            {groups.map((g) => (
              <div key={g.label} className="flex h-full flex-1 items-end justify-center gap-1" role="group" aria-label={g.label}>
                {g.values.map((v, i) => (
                  <span
                    key={i}
                    title={`${series[i]?.label ?? ""} ${v}`}
                    className={cn("w-full max-w-[22px] rounded-t-md", TONE[series[i]?.tone ?? "blue"].solid)}
                    style={{ height: `${Math.min(100, (v / max) * 100)}%` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <span className="w-8 flex-none" />
        <div className="flex min-w-0 flex-1 justify-around gap-2 px-1 text-center text-[12px] text-v2-muted">
          {groups.map((g) => (
            <span key={g.label} className="flex-1 truncate">
              {g.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
