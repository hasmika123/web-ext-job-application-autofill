import { TONE, type Tone } from "./tones";

/**
 * Stacked-trapezoid placement funnel (clip-path, no SVG). The visual width is eased (a true 124 -> 12
 * funnel would be a needle); print the true percentages in a legend next to it.
 */
export default function Funnel({ stages }: { stages: { label: string; value: number; tone: Tone }[] }) {
  const max = stages[0]?.value || 1;
  const widths = stages.map((s) => 30 + 70 * Math.pow(s.value / max, 0.6));
  const bottoms = widths.map((w, i) => (i < widths.length - 1 ? widths[i + 1] : Math.max(w - 14, 18)));
  return (
    <div
      className="mx-auto flex w-full max-w-[210px] flex-col gap-[3px]"
      role="img"
      aria-label={`Funnel: ${stages.map((s) => `${s.label} ${s.value}`).join(", ")}`}
    >
      {stages.map((s, i) => {
        const t = widths[i];
        const b = bottoms[i];
        return (
          <div
            key={s.label}
            className="flex h-[46px] items-center justify-center text-[15px] font-extrabold text-white"
            style={{
              background: TONE[s.tone].color,
              clipPath: `polygon(${(100 - t) / 2}% 0, ${(100 + t) / 2}% 0, ${(100 + b) / 2}% 100%, ${(100 - b) / 2}% 100%)`,
            }}
          >
            {s.value}
          </div>
        );
      })}
    </div>
  );
}
