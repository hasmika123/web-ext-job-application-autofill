import { cn } from "@kiwiply/ui";

/** Plain vertical bar chart (no line): bars scaled to 0..`max`, y labels bottom to top, x labels spread evenly. */
export default function MiniBars({
  bars,
  max,
  xLabels,
  yLabels,
  label,
  height = 150,
}: {
  bars: number[];
  max: number;
  xLabels: string[];
  yLabels: string[];
  label: string;
  height?: number;
}) {
  return (
    <div className="flex gap-2">
      <div className="relative w-8 flex-none text-right text-[11px] text-v2-muted" style={{ height }} aria-hidden>
        {yLabels.map((l, i) => (
          <span key={l} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${100 - (i / (yLabels.length - 1)) * 100}%` }}>
            {l}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div role="img" aria-label={`${label}: ${bars.join(", ")}`} className="relative" style={{ height }}>
          {yLabels.map((l, i) => (
            <span key={l} aria-hidden className="absolute inset-x-0 border-t border-[#EDF0F6]" style={{ top: `${100 - (i / (yLabels.length - 1)) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px]" aria-hidden>
            {bars.map((v, i) => (
              <span key={i} className={cn("min-w-0 flex-1 rounded-t-[3px] bg-v2-blue")} style={{ height: `${Math.min(100, (v / max) * 100)}%` }} />
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[11.5px] text-v2-muted" aria-hidden>
          {xLabels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
