"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Charts (X2.17): the three small chart pieces the enterprise dashboard needs, so the stories that supply the data (Team
 * Performance, Pipeline Overview, tile trends) only feed rows in. They draw what they are given and nothing else: no
 * sample series, no rounding up, no smoothing. Colours are CSS variables (the organization's `--brand-*` scale, the status
 * families), never hex, so a tenant's two colours recolour every chart. Every chart has a text alternative: the `label`
 * names it and a visually hidden table holds the numbers.
 *
 *   <Sparkline values={[1, 1, 2, 2, 3, 3, 4, 5]} label="Consultants, last 8 weeks" />
 *   <BarChart label="Applications by month" categories={["Jan", "Feb"]} series={[{ key: "a", label: "Applications", values: [40, 52] }]} />
 *   <DonutChart label="Pipeline" total={64} totalLabel="Total applications" slices={[{ key: "new", label: "New", value: 18 }]} />
 */

/** The categorical palette, in order of use. Brand primary, brand secondary, then status-family colours. */
export const CHART_COLORS = [
  "var(--brand-solid, var(--color-accent))",
  "var(--brand-2-solid, var(--color-v2-blue))",
  "var(--color-v2-amber)",
  "var(--color-v2-green)",
  "var(--color-v2-violet)",
  "var(--color-v2-coral)",
] as const;

export const chartColor = (i: number): string => CHART_COLORS[((i % CHART_COLORS.length) + CHART_COLORS.length) % CHART_COLORS.length];

/* ── Sparkline ───────────────────────────────────────────────────────────────────── */

const SPARK_W = 100;
const SPARK_H = 32;
const SPARK_PAD = 3;

/** Points on the sparkline's 100 x 32 grid; a flat series sits on the middle line. Pure. */
export function sparkPoints(values: number[]): [number, number][] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return [];
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const span = hi - lo;
  return finite.map((v, i) => [
    (i / (finite.length - 1)) * SPARK_W,
    span === 0 ? SPARK_H / 2 : SPARK_PAD + (1 - (v - lo) / span) * (SPARK_H - SPARK_PAD * 2),
  ]);
}

export interface SparklineProps {
  values: number[];
  /** CSS colour (a var); default is the brand primary. */
  color?: string;
  /** Names the trend for assistive tech; omit when the number beside it already says everything (then it is hidden). */
  label?: string;
  className?: string;
  /** Opt-in: draw the same points as a smooth curve with a soft fading fill (a look only; the points are unchanged). */
  smooth?: boolean;
}

/** A smooth path through the points (Catmull-Rom turned into cubic curves, clamped to the grid). Pure. */
export function smoothPath(pts: [number, number][]): string {
  const clamp = (y: number) => Math.min(SPARK_H, Math.max(0, y));
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function Sparkline({ values, color = chartColor(0), label, className, smooth = false }: SparklineProps) {
  const gid = useId();
  const pts = sparkPoints(values);
  if (pts.length < 2) return null; // one point (or none) is not a trend: draw nothing
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${SPARK_H} ${line} ${SPARK_W},${SPARK_H}`;
  if (smooth) {
    const d = smoothPath(pts);
    return (
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        preserveAspectRatio="none"
        data-sparkline
        data-smooth
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className={cn("h-8 w-full", className)}
        style={{ color }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`${d} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z`} fill={`url(#${gid})`} />
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      data-sparkline
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("h-8 w-full", className)}
      style={{ color }}
    >
      <polygon points={area} fill="currentColor" opacity={0.12} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ── BarChart (grouped, HTML bars so the labels stay readable at 360 px) ─────────── */

export interface BarSeries {
  key: string;
  label: string;
  values: number[];
  color?: string;
}

export interface BarChartProps {
  categories: string[];
  series: BarSeries[];
  /** Names the chart; the hidden table repeats the numbers. */
  label: string;
  /** Plot height in px. */
  height?: number;
  className?: string;
}

const TICKS = 4;

/** A tidy axis maximum (a multiple of 1, 2, 5 x 10^n) at least as high as `max`, split into `TICKS` steps. Pure. */
export function niceMax(max: number): number {
  if (!(max > 0)) return TICKS;
  const raw = max / TICKS;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 5, 10].map((m) => m * pow).find((u) => u >= raw) ?? pow * 10;
  return unit * TICKS;
}

export function BarChart({ categories, series, label, height = 190, className }: BarChartProps) {
  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)))));
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => (top / TICKS) * (TICKS - i));
  return (
    <figure data-bar-chart className={cn("m-0", className)}>
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
          {categories.map((c, ci) => (
            <div key={c} className="relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] sm:gap-1">
              {series.map((s, si) => {
                const v = s.values[ci];
                const ok = Number.isFinite(v);
                return (
                  <span
                    key={s.key}
                    data-bar={`${s.key}:${c}`}
                    className="block w-full max-w-5 rounded-t-[3px]"
                    style={{ height: ok ? `${(Math.max(0, v) / top) * 100}%` : 0, background: s.color ?? chartColor(si) }}
                  />
                );
              })}
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

/* ── DonutChart ──────────────────────────────────────────────────────────────────── */

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  slices: DonutSlice[];
  /** The number in the middle; defaults to the sum of the slices. */
  total?: number;
  /** The words under it ("Total applications"). */
  totalLabel?: string;
  label: string;
  /** Diameter in px. */
  size?: number;
  /** Draw the slice list beside the ring (default true); false gives the bare ring. */
  legend?: boolean;
  /** Text after the middle number ("%"). */
  totalSuffix?: string;
  className?: string;
}

const R = 42;
const CIRC = 2 * Math.PI * R;

/** Each slice's share (0..1) of the slices' sum; a zero sum gives zeros. Pure. */
export function shares(values: number[]): number[] {
  const sum = values.reduce((a, v) => a + (Number.isFinite(v) && v > 0 ? v : 0), 0);
  return values.map((v) => (sum > 0 && Number.isFinite(v) && v > 0 ? v / sum : 0));
}

export function DonutChart({ slices, total, totalLabel, label, size = 150, legend = true, totalSuffix, className }: DonutChartProps): ReactNode {
  const parts = shares(slices.map((s) => s.value));
  const sum = slices.reduce((a, s) => a + (Number.isFinite(s.value) && s.value > 0 ? s.value : 0), 0);
  let offset = 0;
  return (
    <div data-donut-chart className={cn("flex flex-wrap items-center gap-x-6 gap-y-4", className)}>
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label}: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`} className="-rotate-90">
          <circle cx={50} cy={50} r={R} fill="none" stroke="currentColor" strokeWidth={14} className="text-paper-2" />
          {slices.map((s, i) => {
            const len = parts[i] * CIRC;
            const el =
              len > 0 ? (
                <circle
                  key={s.key}
                  cx={50}
                  cy={50}
                  r={R}
                  fill="none"
                  strokeWidth={14}
                  stroke={s.color ?? chartColor(i)}
                  strokeDasharray={`${Math.max(0, len - 0.6)} ${CIRC - Math.max(0, len - 0.6)}`}
                  strokeDashoffset={-offset}
                />
              ) : null;
            offset += len;
            return el;
          })}
        </svg>
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[26px] font-bold leading-none tabular-nums text-ink">{total ?? sum}{totalSuffix}</span>
          {totalLabel ? <span className="mt-1 max-w-[80px] text-[11.5px] leading-tight text-muted">{totalLabel}</span> : null}
        </div>
      </div>
      {legend ? (
      <ul className="min-w-[10rem] flex-1">
        {slices.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 py-1 text-[13px] text-ink-soft">
            <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color ?? chartColor(i) }} />
            <span className="min-w-0 flex-1 leading-tight">{s.label}</span>
            <span className="w-8 text-right font-semibold tabular-nums text-ink">{s.value}</span>
            <span className="w-10 text-right tabular-nums text-muted">{Math.round(parts[i] * 100)}%</span>
          </li>
        ))}
      </ul>
      ) : null}
    </div>
  );
}
