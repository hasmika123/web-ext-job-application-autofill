"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
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
  /**
   * Draw the same points as a smooth curve with a soft fading fill (a look only; the points are unchanged). Unset = the page's default
   * (`SparklineDefaults`: smooth inside an enterprise tenant page, the straight line everywhere else); `true` / `false` always win.
   */
  smooth?: boolean;
}

/** The look a `Sparkline` takes when it is not told: the tenant tree provides `{ smooth: true }` (the boards' soft gradient curve). */
export const SparklineDefaults = createContext<{ smooth: boolean }>({ smooth: false });

/** A client-side way to set the sparkline default from a server component (the tenant root): `<SparklineDefaultsProvider smooth>`. */
export function SparklineDefaultsProvider({ smooth, children }: { smooth: boolean; children: ReactNode }) {
  return <SparklineDefaults.Provider value={{ smooth }}>{children}</SparklineDefaults.Provider>;
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

export function Sparkline({ values, color = chartColor(0), label, className, smooth: smoothProp }: SparklineProps) {
  const gid = useId();
  const defaults = useContext(SparklineDefaults);
  const smooth = smoothProp ?? defaults.smooth;
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
  /** "board": the enterprise boards' larger legend, axis text, rounded bars and column rules (a look only). */
  variant?: "board";
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

export function BarChart({ categories, series, label, height = 190, className, variant }: BarChartProps) {
  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)))));
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => (top / TICKS) * (TICKS - i));
  const board = variant === "board";
  return (
    <figure data-bar-chart data-variant={variant} className={cn("m-0", className)}>
      <ul aria-hidden className={cn("flex flex-wrap gap-y-1", board ? "mb-3.5 gap-x-7" : "mb-3 gap-x-4")}>
        {series.map((s, i) => (
          <li key={s.key} className={cn("flex items-center text-ink-soft", board ? "gap-2 text-[14px]" : "gap-1.5 text-[12.5px]")}>
            <span className={cn("flex-none rounded-full", board ? "h-3 w-3" : "h-2.5 w-2.5")} style={{ background: s.color ?? chartColor(i) }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div aria-hidden className={cn("flex gap-2", board && "pt-2")} style={{ height: board ? height + 8 : height }}>
        <div className={cn("flex flex-none flex-col justify-between text-right tabular-nums text-muted", board ? "w-8 text-[14px]" : "w-7 text-[11px]")}>
          {ticks.map((t) => (
            <span key={t} className={cn("-translate-y-1/2", !board && "first:translate-y-0 last:translate-y-0")}>
              {t}
            </span>
          ))}
        </div>
        <div className={cn("relative flex min-w-0 flex-1 items-end border-b", board ? "gap-0 border-line" : "gap-1 border-line sm:gap-3")}>
          {ticks.slice(0, -1).map((t, i) => (
            <span key={t} className={cn("pointer-events-none absolute inset-x-0 border-t", board ? "border-line/60" : "border-line/70")} style={{ top: `${(i / TICKS) * 100}%` }} />
          ))}
          {categories.map((c, ci) => (
            <div key={c} className={cn("relative flex h-full min-w-0 flex-1 items-end justify-center", board ? "gap-[3px] border-l border-line/60 first:border-l-0" : "gap-[2px] sm:gap-1")}>
              {series.map((s, si) => {
                const v = s.values[ci];
                const ok = Number.isFinite(v);
                return (
                  <span
                    key={s.key}
                    data-bar={`${s.key}:${c}`}
                    className={cn("block w-full", board ? "max-w-[17px] rounded-t-[6px]" : "max-w-5 rounded-t-[3px]")}
                    style={{ height: ok ? `${(Math.max(0, v) / top) * 100}%` : 0, background: s.color ?? chartColor(si) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className={cn("flex gap-2 text-muted", board ? "mt-2 pl-10 text-[14px]" : "mt-1.5 pl-9 text-[11.5px]")}>
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
  className?: string;
  /** "board": the enterprise boards' thicker ring, larger centre figure and roomier legend (a look only). */
  variant?: "board";
}

const R = 42;
const CIRC = 2 * Math.PI * R;
const R_BOARD = 40;
const CIRC_BOARD = 2 * Math.PI * R_BOARD;

/** Each slice's share (0..1) of the slices' sum; a zero sum gives zeros. Pure. */
export function shares(values: number[]): number[] {
  const sum = values.reduce((a, v) => a + (Number.isFinite(v) && v > 0 ? v : 0), 0);
  return values.map((v) => (sum > 0 && Number.isFinite(v) && v > 0 ? v / sum : 0));
}

export function DonutChart({ slices, total, totalLabel, label, size = 150, className, variant }: DonutChartProps): ReactNode {
  const board = variant === "board";
  const r = board ? R_BOARD : R;
  const circ = board ? CIRC_BOARD : CIRC;
  const sw = board ? 19 : 14;
  const parts = shares(slices.map((s) => s.value));
  const sum = slices.reduce((a, s) => a + (Number.isFinite(s.value) && s.value > 0 ? s.value : 0), 0);
  let offset = 0;
  return (
    <div data-donut-chart data-variant={variant} className={cn("flex items-center gap-y-4", board ? "flex-nowrap gap-x-5" : "flex-wrap gap-x-6", className)}>
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label}: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`} className="-rotate-90">
          <circle cx={50} cy={50} r={r} fill="none" stroke="currentColor" strokeWidth={sw} className="text-paper-2" />
          {slices.map((s, i) => {
            const len = parts[i] * circ;
            const el =
              len > 0 ? (
                <circle
                  key={s.key}
                  cx={50}
                  cy={50}
                  r={r}
                  fill="none"
                  strokeWidth={sw}
                  stroke={s.color ?? chartColor(i)}
                  strokeDasharray={`${Math.max(0, len - 0.6)} ${circ - Math.max(0, len - 0.6)}`}
                  strokeDashoffset={-offset}
                />
              ) : null;
            offset += len;
            return el;
          })}
        </svg>
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={cn("font-bold leading-none tabular-nums text-ink", board ? "text-[30px]" : "text-[26px]")}>{total ?? sum}</span>
          {totalLabel ? <span className={cn("mt-1 leading-tight text-muted", board ? "max-w-[76px] text-[12.5px]" : "max-w-[80px] text-[11.5px]")}>{totalLabel}</span> : null}
        </div>
      </div>
      <ul className={cn("flex-1", board ? "min-w-0" : "min-w-[10rem]")}>
        {slices.map((s, i) => (
          <li key={s.key} className={cn("flex items-center text-ink-soft", board ? "gap-2 py-[6px] text-[14.5px]" : "gap-2 py-1 text-[13px]")}>
            <span aria-hidden className={cn("flex-none rounded-full", board ? "h-3.5 w-3.5" : "h-2.5 w-2.5")} style={{ background: s.color ?? chartColor(i) }} />
            <span className="min-w-0 flex-1 leading-tight">{s.label}</span>
            <span className={cn("text-right tabular-nums text-ink", board ? "w-6 font-bold" : "w-8 font-semibold")}>{s.value}</span>
            <span className={cn("text-right tabular-nums text-muted", board ? "w-10" : "w-10")}>{Math.round(parts[i] * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
