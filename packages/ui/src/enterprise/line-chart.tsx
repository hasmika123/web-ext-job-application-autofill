import { chartColor, niceMax } from "../primitives/Charts";
import { cn } from "../primitives/cn";

/**
 * LineChart (Marketing Performance board, "Interviews vs Offers"): several series on one set of tidy y-axis ticks, a dot on every point and, at the right
 * end of each line, a value bubble in the line's colour (nudged apart so close end values never overlap). Same family as `BarChart` (HTML labels, a legend,
 * a screen-reader table with the numbers). It draws what it is given: no smoothing, no invented points. Lines are SVG with non-scaling strokes; dots and
 * bubbles are positioned HTML so they stay round at any width.
 */

export interface LineSeries {
  key: string;
  label: string;
  /** One value per x position; a non-finite value leaves a gap. */
  values: number[];
  /** Any CSS colour (a var); defaults to the chart palette in series order. */
  color?: string;
}

export interface LineChartProps {
  series: LineSeries[];
  /** One label per x position ("" draws none), e.g. the month name on the first point of a month. */
  xLabels: string[];
  /** The hidden table's row headers, one per x position ("Aug 26"); defaults to `xLabels`, so a sparse axis can still name every row. */
  rowLabels?: string[];
  /** Names the chart; the hidden table repeats the numbers. */
  label: string;
  /** Plot height in px. */
  height?: number;
  className?: string;
}

const TICKS = 4;
const BUBBLE_H = 24;

/** Vertical centres (px) for end bubbles, nudged apart to at least `gap` while keeping their order and staying inside `[0, height]`. Pure. */
export function spreadBubbles(ys: number[], gap: number, height: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const out = new Array<number>(ys.length).fill(0);
  order.forEach(({ y, i }, k) => {
    const at = Math.min(Math.max(y, gap / 2), height - gap / 2);
    out[i] = k === 0 ? at : Math.max(at, out[order[k - 1].i] + gap);
  });
  // pushed past the bottom edge: slide the stack back up, keeping the gap
  for (let k = order.length - 1; k >= 0; k--) {
    const limit = k === order.length - 1 ? height - gap / 2 : out[order[k + 1].i] - gap;
    out[order[k].i] = Math.min(out[order[k].i], limit);
  }
  return out;
}

export function LineChart({ series, xLabels, rowLabels, label, height = 190, className }: LineChartProps) {
  const n = xLabels.length;
  const finite = series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)));
  const top = niceMax(Math.max(0, ...finite));
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => (top / TICKS) * (TICKS - i));
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => (1 - Math.max(0, v) / top) * 100;
  const ends = series.map((s) => {
    for (let i = Math.min(s.values.length, n) - 1; i >= 0; i--) if (Number.isFinite(s.values[i])) return { i, v: s.values[i] };
    return null;
  });
  const bubbleY = spreadBubbles(ends.map((e) => (e ? (y(e.v) / 100) * height : 0)), BUBBLE_H + 2, height);
  const colorOf = (i: number) => series[i].color ?? chartColor(i);
  return (
    <figure data-line-chart className={cn("m-0", className)}>
      <ul aria-hidden className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: colorOf(i) }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div aria-hidden className="flex gap-2" style={{ height }}>
        <div className="flex w-7 flex-none flex-col justify-between text-right text-[11px] tabular-nums text-muted">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {t}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 border-b border-l border-line">
          {ticks.slice(0, -1).map((t, i) => (
            <span key={t} className="pointer-events-none absolute inset-x-0 border-t border-line/70" style={{ top: `${(i / TICKS) * 100}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {series.map((s, si) => {
              const pts = s.values.slice(0, n).map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(2)},${y(v).toFixed(2)}` : null)).filter((p): p is string => p !== null);
              return pts.length > 1 ? (
                <polyline key={s.key} data-line={s.key} points={pts.join(" ")} fill="none" stroke={colorOf(si)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              ) : null;
            })}
          </svg>
          {series.map((s, si) =>
            s.values.slice(0, n).map((v, i) =>
              Number.isFinite(v) ? (
                <span
                  key={`${s.key}:${i}`}
                  data-point={`${s.key}:${i}`}
                  className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-paper"
                  style={{ left: `${x(i)}%`, top: `${y(v)}%`, borderColor: colorOf(si) }}
                />
              ) : null,
            ),
          )}
          {xLabels.map((l, i) =>
            l ? (
              <span key={`${l}:${i}`} className="absolute top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[11.5px] text-muted" style={{ left: `${x(i)}%` }}>
                {l}
              </span>
            ) : null,
          )}
        </div>
        <div className="relative w-11 flex-none">
          {series.map((s, si) =>
            ends[si] ? (
              <span
                key={s.key}
                data-end-bubble={s.key}
                className="absolute left-0 grid -translate-y-1/2 place-items-center rounded-lg border px-2 text-[12.5px] font-semibold tabular-nums text-ink"
                style={{ top: bubbleY[si], height: BUBBLE_H, borderColor: colorOf(si), background: `color-mix(in srgb, ${colorOf(si)} 14%, transparent)` }}
              >
                {ends[si]!.v}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <div aria-hidden className="h-5" />
      <figcaption className="sr-only">{label}</figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col" />
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {xLabels.map((l, i) => (
            <tr key={`${l}:${i}`}>
              <th scope="row">{rowLabels?.[i] || l || `Point ${i + 1}`}</th>
              {series.map((s) => (
                <td key={s.key}>{Number.isFinite(s.values[i]) ? s.values[i] : "no data"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
