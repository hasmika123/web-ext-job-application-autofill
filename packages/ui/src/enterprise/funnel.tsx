import { cn } from "../primitives/cn";

/**
 * FunnelChart + SourceLogo (marketer Home board). Both are additive, props-driven and dependency-free.
 *  - `FunnelChart`: stacked trapezoid bars that narrow stage by stage (HTML + clip-path, so the numbers stay real text).
 *  - `SourceLogo`: the small brand tile for a job-board source; an unknown source falls back to its first letter.
 */

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Any CSS colour (a var); defaults cycle through the chart palette. */
  color?: string;
}

export const FUNNEL_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
const MIN_WIDTH_PCT = 28; // config-literal-ok: the narrowest bar, so its number still fits

/** Each bar's width as a percent of the first: proportional to its count, never narrower than MIN_WIDTH_PCT. Pure. */
export function funnelWidths(counts: number[]): number[] {
  const top = Math.max(0, ...counts.filter((c) => Number.isFinite(c)));
  return counts.map((c) => (top <= 0 ? 100 : Math.max(MIN_WIDTH_PCT, Math.round((Math.max(0, c) / top) * 100))));
}

export function FunnelChart({ stages, label, className }: { stages: FunnelStage[]; label: string; className?: string }) {
  const widths = funnelWidths(stages.map((s) => s.count));
  return (
    <div role="img" aria-label={`${label}: ${stages.map((s) => `${s.label} ${s.count}`).join(", ")}`} data-funnel className={cn("flex flex-col items-center gap-[3px]", className)}>
      {stages.map((s, i) => {
        const next = widths[i + 1] ?? widths[i];
        // The bar's bottom edge is as wide as the next bar's top, so the stack reads as one funnel.
        const inset = Math.max(0, ((widths[i] - next) / widths[i]) * 50);
        return (
          <div
            key={s.key}
            data-funnel-stage={s.key}
            style={{ width: `${widths[i]}%`, background: s.color ?? FUNNEL_COLORS[i % FUNNEL_COLORS.length], clipPath: `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)` }}
            className="grid h-[34px] place-items-center text-[14px] font-bold text-white"
          >
            {s.count}
          </div>
        );
      })}
    </div>
  );
}

const SOURCE_TILES: Record<string, { bg: string; glyph: string; fg?: string }> = {
  linkedin: { bg: "#0a66c2", glyph: "in" },
  indeed: { bg: "#2557a7", glyph: "i" },
  dice: { bg: "#d6202b", glyph: "D" },
  ziprecruiter: { bg: "#3a9d23", glyph: "Z" },
  "client portal": { bg: "#e8ecf3", glyph: "▣", fg: "#3b4a63" },
};

export function SourceLogo({ source, size = 30, className }: { source: string; size?: number; className?: string }) {
  const tile = SOURCE_TILES[source.trim().toLowerCase()] ?? { bg: "#e8ecf3", glyph: source.trim().charAt(0).toUpperCase() || "?", fg: "#3b4a63" };
  return (
    <span
      aria-hidden
      data-source-logo={source}
      style={{ width: size, height: size, background: tile.bg, color: tile.fg ?? "#fff", fontSize: Math.round(size * 0.5) }}
      className={cn("inline-grid flex-none place-items-center rounded-[8px] font-extrabold leading-none", className)}
    >
      {tile.glyph}
    </span>
  );
}
