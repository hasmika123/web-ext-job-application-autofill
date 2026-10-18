import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";
import { areaPath, ribbonPath, type Pt } from "./chart-utils";

export interface LineSeries {
  label: string;
  tone: Tone;
  /** Values on the same scale as the y axis: 0-100 (a percentage of the plot height). */
  points: number[];
}

/** Legend row of `dot label` pairs. */
export function LegendDots({ series, className }: { series: { label: string; tone: Tone }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-soft", className)}>
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", TONE[s.tone].solid)} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Multi-series line chart, no SVG: each series is a clip-path ribbon over a shared plot box with a
 * soft area under it and a dot per point. `yLabels` run bottom to top, evenly spaced, each with a
 * dashed gridline. `endLabels` (same order as `series`) put a coloured chip at the end of each
 * line, outside the plot.
 */
export default function LineChart({
  series,
  xLabels,
  yLabels,
  height = 190,
  endLabels,
  className,
}: {
  series: LineSeries[];
  xLabels: string[];
  /** Axis labels, bottom to top, evenly spaced. */
  yLabels: string[];
  height?: number;
  /** Chip shown at the end of each series (same order as `series`). */
  endLabels?: string[];
  className?: string;
}) {
  const n = series[0]?.points.length ?? 0;
  // x spans 5%..95% of the plot so the end dots / chips are never clipped.
  const xs = Array.from({ length: n }, (_, i) => (n < 2 ? 50 : 5 + (i * 90) / (n - 1)));
  const lineTop = (i: number) => `${100 - (i / (yLabels.length - 1)) * 100}%`;
  return (
    <div className={className}>
      <LegendDots series={series} className="mb-3" />
      <div className="flex gap-2">
        <div className="relative w-8 flex-none text-right text-[11px] text-v2-muted" style={{ height }} aria-hidden>
          {yLabels.map((l, i) => (
            <span key={l} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: lineTop(i) }}>
              {l}
            </span>
          ))}
        </div>
        <div className={cn("min-w-0 flex-1", endLabels && "pr-11")}>
          <div
            role="img"
            aria-label={series.map((s) => `${s.label}: ${s.points.join(", ")}`).join("; ")}
            className="relative"
            style={{ height }}
          >
            {yLabels.map((l, i) => (
              <span key={l} aria-hidden className="absolute inset-x-0 border-t border-dashed border-[#E6EAF3]" style={{ top: lineTop(i) }} />
            ))}
            {series.map((s, si) => {
              const pts: Pt[] = s.points.map((v, i) => ({ x: xs[i], y: 100 - v }));
              const c = TONE[s.tone].color;
              return (
                <div key={s.label} className="absolute inset-0" style={{ ["--tone" as string]: c }}>
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(to bottom, color-mix(in srgb, var(--tone) 16%, transparent), transparent 85%)",
                      clipPath: areaPath(pts),
                    }}
                  />
                  <span aria-hidden className="absolute inset-0" style={{ background: "var(--tone)", clipPath: ribbonPath(pts, 1.8) }} />
                  {pts.map((p, i) => (
                    <span
                      key={i}
                      aria-hidden
                      title={`${s.label}: ${s.points[i]}%`}
                      className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper shadow-[0_0_0_1px_var(--tone)]"
                      style={{ left: `${p.x}%`, top: `${p.y}%`, background: "var(--tone)" }}
                    />
                  ))}
                  {endLabels?.[si] && pts.length > 0 && (
                    <span
                      className="absolute -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                      style={{ left: `calc(${pts[pts.length - 1].x}% + 8px)`, top: `${pts[pts.length - 1].y}%`, background: "var(--tone)" }}
                    >
                      {endLabels[si]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="relative mt-2 h-4" aria-hidden>
            {xLabels.map((l, i) => (
              <span key={l} className="absolute -translate-x-1/2 text-[11.5px] text-v2-muted" style={{ left: `${xs[i]}%` }}>
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
