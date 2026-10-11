import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";
import { areaPath, ribbonPath, toPoints } from "./chart-utils";

export interface LineSeries {
  label: string;
  tone: Tone;
  points: number[];
}

/**
 * Multi-series line chart, no SVG: each series is a clip-path ribbon over a shared plot box, with
 * dots at the points and an end-value chip. `yLabels` are listed top to bottom; all series share
 * the same value range (`min`/`max`, default from the data).
 */
export default function LineChart({
  series,
  xLabels,
  yLabels,
  min,
  max,
  height = 200,
  className,
}: {
  series: LineSeries[];
  xLabels: string[];
  yLabels: string[];
  min?: number;
  max?: number;
  height?: number;
  className?: string;
}) {
  const all = series.flatMap((s) => s.points);
  const lo = min ?? Math.min(...all);
  const hi = max ?? Math.max(...all);
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
        <div className="flex w-8 flex-none flex-col justify-between text-right text-[11px] text-v2-muted" aria-hidden>
          {yLabels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
        <div
          role="img"
          aria-label={series.map((s) => `${s.label}: ${s.points.join(", ")}`).join("; ")}
          className="relative min-w-0 flex-1 bg-[linear-gradient(to_bottom,var(--color-v2-line)_1px,transparent_1px)] [background-size:100%_25%]"
        >
          {series.map((s) => {
            const pts = toPoints(s.points, { min: lo, max: hi, pad: 6 });
            const t = TONE[s.tone];
            const last = pts[pts.length - 1];
            return (
              <div key={s.label} className="absolute inset-0">
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(to bottom, ${t.color}, transparent)`, opacity: 0.1, clipPath: areaPath(pts) }}
                />
                <span aria-hidden className="absolute inset-0" style={{ background: t.color, clipPath: ribbonPath(pts, 2.6) }} />
                {pts.map((p, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className={cn("absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper", t.solid)}
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  />
                ))}
                {last && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -translate-y-[150%] translate-x-[-100%] rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none text-white",
                      t.solid,
                    )}
                    style={{ left: `${last.x}%`, top: `${last.y}%` }}
                  >
                    {s.points[s.points.length - 1]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <span className="w-8 flex-none" />
        <div className="flex min-w-0 flex-1 justify-between text-[12px] text-v2-muted">
          {xLabels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
