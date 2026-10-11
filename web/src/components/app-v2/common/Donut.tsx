import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";

export interface DonutSegment {
  label: string;
  value: number;
  tone: Tone;
}

/**
 * conic-gradient ring (140px by default) with a white hole, a centred value + label and an
 * optional legend of `dot label  value (pct%)` rows. `legend` places it beside or under the ring.
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
  legend?: "right" | "bottom" | false;
  size?: number;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const stops = segments.map((s, i) => {
    const before = segments.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    const from = (before / total) * 100;
    const to = ((before + s.value) / total) * 100;
    return `${TONE[s.tone].color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  });
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
        aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}
        className="relative grid flex-none place-items-center rounded-full"
        style={{ width: size, height: size, background: `conic-gradient(${stops.join(", ")})` }}
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
      {legend && (
        <ul className="min-w-0 flex-1 space-y-2 self-stretch text-[13px]">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span aria-hidden className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE[s.tone].solid)} />
              <span className="min-w-0 flex-1 truncate text-ink-soft">{s.label}</span>
              <span className="flex-none font-semibold text-ink">
                {s.value} <span className="font-normal text-v2-muted">({Math.round((s.value / total) * 100)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
