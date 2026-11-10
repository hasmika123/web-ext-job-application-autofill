import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "@/components/app-v2/common";
import { ribbonPath, toPoints } from "@/components/app-v2/common/chart-utils";

/**
 * Combo chart, no SVG: vertical bars (`bars`) with a line + dots (`line`) over the same x
 * positions. Both series are scaled to 0..`max`. `yLabels` run bottom to top; `xLabels` are spread
 * evenly. Legend names come from `barLabel` / `lineLabel`.
 */
export default function BarLineChart({
  bars,
  line,
  max,
  xLabels,
  yLabels,
  barLabel,
  lineLabel,
  barTone = "blue",
  lineTone = "green",
  height = 210,
  className,
}: {
  bars: number[];
  line: number[];
  max: number;
  xLabels: string[];
  yLabels: string[];
  barLabel: string;
  lineLabel: string;
  barTone?: Tone;
  lineTone?: Tone;
  height?: number;
  className?: string;
}) {
  const n = line.length;
  const pts = toPoints(line, { min: 0, max, pad: 0 });
  const lc = TONE[lineTone].color;
  const lineTop = (i: number) => `${100 - (i / (yLabels.length - 1)) * 100}%`;
  return (
    <div className={className}>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-soft">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", TONE[barTone].solid)} />
          {barLabel}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", TONE[lineTone].solid)} />
          {lineLabel}
        </li>
      </ul>
      <div className="flex gap-2">
        <div className="relative w-8 flex-none text-right text-[11px] text-v2-muted" style={{ height }} aria-hidden>
          {yLabels.map((l, i) => (
            <span key={l} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: lineTop(i) }}>
              {l}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            role="img"
            aria-label={`${barLabel}: ${bars.join(", ")}. ${lineLabel}: ${line.join(", ")}`}
            className="relative"
            style={{ height }}
          >
            {yLabels.map((l, i) => (
              <span key={l} aria-hidden className="absolute inset-x-0 border-t border-[#EDF0F6]" style={{ top: lineTop(i) }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[3px]" aria-hidden>
              {bars.map((v, i) => (
                <span key={i} className={cn("min-w-0 flex-1 rounded-t-[3px]", TONE[barTone].solid)} style={{ height: `${Math.min(100, (v / max) * 100)}%` }} />
              ))}
            </div>
            <span aria-hidden className="absolute inset-0" style={{ background: lc, clipPath: ribbonPath(pts, 1.6) }} />
            {pts.map((p, i) =>
              i % 4 === 0 || i === n - 1 ? (
                <span
                  key={i}
                  aria-hidden
                  className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper"
                  style={{ left: `${p.x}%`, top: `${p.y}%`, background: lc }}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2 flex justify-between text-[11.5px] text-v2-muted" aria-hidden>
            {xLabels.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
