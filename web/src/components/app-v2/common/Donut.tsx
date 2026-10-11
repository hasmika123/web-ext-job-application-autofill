import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";

export interface DonutSegment {
  label: string;
  value: number;
  tone: Tone;
  /** Printed percentage when it is not `value / total` (e.g. a board that quotes % of a different base). */
  pct?: number;
}

/**
 * conic-gradient ring (140px by default) with a white hole and a centred value + label, plus an
 * optional legend. `legend` modes:
 *  - `"right"` (default) / `"bottom"`: `dot label  value (pct%)` rows beside / under the ring;
 *  - `"count"`: `dot  value  label` (the My Applications board, no percentages);
 *  - `false`: ring only (pair it with your own legend).
 */
export default function Donut({
  segments,
  centerValue,
  centerLabel,
  legend = "right",
  size = 140,
  className,
}: {
  segments: DonutSegment[];
  centerValue: string | number;
  centerLabel?: string;
  legend?: "right" | "bottom" | "count" | false;
  size?: number;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const live = segments.filter((s) => s.value > 0);
  const stops = live.map((s, i) => {
    const before = live.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    const from = (before / total) * 100;
    const to = ((before + s.value) / total) * 100;
    return `${TONE[s.tone].color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  });
  const ring = stops.length ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(var(--color-v2-line) 0 100%)";
  return (
    <div
      className={cn(
        "flex items-center gap-5",
        legend === "bottom" ? "flex-col" : "flex-col sm:flex-row",
        className,
      )}
    >
      <div
        role="img"
        aria-label={`${centerValue}${centerLabel ? ` ${centerLabel}` : ""}: ${segments.map((s) => `${s.value} ${s.label}`).join(", ")}`}
        className="relative grid flex-none place-items-center rounded-full"
        style={{ width: size, height: size, background: ring }}
      >
        <div
          className="grid place-items-center rounded-full bg-paper text-center"
          style={{ width: size * 0.64, height: size * 0.64 }}
        >
          <div>
            <div className="font-display text-[22px] font-extrabold leading-none text-ink">{centerValue}</div>
            {centerLabel && <div className="mt-1 text-[12px] text-v2-muted">{centerLabel}</div>}
          </div>
        </div>
      </div>
      {legend === "count" && (
        <ul className="min-w-[130px] flex-1 space-y-2.5 self-stretch">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2.5 text-[13px] text-ink-soft">
              <span aria-hidden className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE[s.tone].solid)} />
              <span className="w-5 text-right font-semibold tabular-nums text-ink">{s.value}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      )}
      {(legend === "right" || legend === "bottom") && (
        <ul className="min-w-0 flex-1 space-y-2 self-stretch text-[13px]">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span aria-hidden className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE[s.tone].solid)} />
              <span className="min-w-0 flex-1 truncate text-ink-soft">{s.label}</span>
              <span className="flex-none font-semibold text-ink">
                {s.value} <span className="font-normal text-v2-muted">({s.pct ?? Math.round((s.value / total) * 100)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
