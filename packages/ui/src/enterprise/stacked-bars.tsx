import { chartColor, niceMax } from "../primitives/Charts";
import { cn } from "../primitives/cn";

/**
 * StackedBarChart (Job Streams board, "Openings Captured"): one column per category, each column a stack of the series values from the
 * bottom up. Same look as `BarChart` (HTML bars, a y axis of tidy ticks, the legend, a screen-reader table with the numbers) but stacked,
 * with the legend UNDER the plot as drawn on the board. Pure and dependency-free; every number is also in the hidden table.
 */

export interface StackedSeries {
  key: string;
  label: string;
  values: number[];
  /** Any CSS colour (a var); defaults to the chart palette in series order. */
  color?: string;
}

export interface StackedBarChartProps {
  categories: string[];
  series: StackedSeries[];
  /** Names the chart; the hidden table repeats the numbers. */
  label: string;
  /** Plot height in px. */
  height?: number;
  className?: string;
}

const TICKS = 4;

/** The tallest column: the sum of every series' (finite, non-negative) value per category. Pure. */
export function stackTotals(categories: string[], series: StackedSeries[]): number[] {
  return categories.map((_, ci) => series.reduce((sum, s) => sum + (Number.isFinite(s.values[ci]) ? Math.max(0, s.values[ci]) : 0), 0));
}

export function StackedBarChart({ categories, series, label, height = 160, className }: StackedBarChartProps) {
  const totals = stackTotals(categories, series);
  const top = niceMax(Math.max(0, ...totals));
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => (top / TICKS) * (TICKS - i));
  return (
    <figure data-stacked-bar-chart className={cn("m-0", className)}>
      <div aria-hidden className="flex gap-2" style={{ height }}>
        <div className="flex w-7 flex-none flex-col justify-between text-right text-[11px] tabular-nums text-muted">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex min-w-0 flex-1 items-end gap-1 border-b border-line sm:gap-3">
          {ticks.slice(0, -1).map((t, i) => (
            <span key={t} className="pointer-events-none absolute inset-x-0 border-t border-line/70" style={{ top: `${(i / TICKS) * 100}%` }} />
          ))}
          {categories.map((c, ci) => (
            <div key={c} data-stack={c} className="relative flex h-full min-w-0 flex-1 items-end justify-center">
              <div className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-[4px]" style={{ height: `${(totals[ci] / top) * 100}%` }}>
                {series.map((s, si) => {
                  const v = Number.isFinite(s.values[ci]) ? Math.max(0, s.values[ci]) : 0;
                  return v > 0 ? <span key={s.key} data-segment={`${s.key}:${c}`} className="block w-full" style={{ height: `${(v / totals[ci]) * 100}%`, background: s.color ?? chartColor(si) }} /> : null;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-1.5 flex gap-2 pl-9 text-[11.5px] text-muted">
        {categories.map((c) => (
          <span key={c} className="min-w-0 flex-1 truncate text-center">
            {c}
          </span>
        ))}
      </div>
      <ul aria-hidden className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color ?? chartColor(i) }} />
            {s.label}
          </li>
        ))}
      </ul>
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
          {categories.map((c, ci) => (
            <tr key={c}>
              <th scope="row">{c}</th>
              {series.map((s) => (
                <td key={s.key}>{Number.isFinite(s.values[ci]) ? s.values[ci] : "no data"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
