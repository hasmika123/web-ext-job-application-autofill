import { chartColor, niceMax } from "../primitives/Charts";
import type { BarSeries } from "../primitives/Charts";
import { cn } from "../primitives/cn";

/**
 * WeekBarChart (Marketing Performance board, "Submissions by Week"): the grouped `BarChart` look (legend above, tidy y ticks, one bar per series per category,
 * a screen-reader table) with category labels of SEVERAL lines, so a week reads "Aug 26" over "Sep 1" under its bars. Draws only the data it is given.
 */

export interface WeekBarChartProps {
  /** One entry per category; each is the lines of its label, top to bottom. */
  categories: string[][];
  series: BarSeries[];
  /** Names the chart; the hidden table repeats the numbers. */
  label: string;
  /** Plot height in px. */
  height?: number;
  className?: string;
}

const TICKS = 4;

export function WeekBarChart({ categories, series, label, height = 190, className }: WeekBarChartProps) {
  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)))));
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => (top / TICKS) * (TICKS - i));
  const names = categories.map((c) => c.join(" to "));
  return (
    <figure data-week-bar-chart className={cn("m-0", className)}>
      <ul aria-hidden className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color ?? chartColor(i) }} />
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
        <div className="relative flex min-w-0 flex-1 items-end gap-1 border-b border-line sm:gap-3">
          {ticks.slice(0, -1).map((t, i) => (
            <span key={t} className="pointer-events-none absolute inset-x-0 border-t border-line/70" style={{ top: `${(i / TICKS) * 100}%` }} />
          ))}
          {categories.map((_, ci) => (
            <div key={ci} className="relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] sm:gap-1">
              {series.map((s, si) => {
                const v = s.values[ci];
                const ok = Number.isFinite(v);
                return (
                  <span
                    key={s.key}
                    data-bar={`${s.key}:${ci}`}
                    className="block w-full max-w-5 rounded-t-[3px]"
                    style={{ height: ok ? `${(Math.max(0, v) / top) * 100}%` : 0, background: s.color ?? chartColor(si) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-1.5 flex gap-1 pl-9 text-[11.5px] leading-tight text-muted sm:gap-3">
        {categories.map((lines, ci) => (
          <span key={ci} data-week-label={ci} className="min-w-0 flex-1 text-center">
            {lines.map((l, li) => (
              <span key={li} className="block truncate">
                {l}
              </span>
            ))}
          </span>
        ))}
      </div>
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
          {names.map((c, ci) => (
            <tr key={ci}>
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
