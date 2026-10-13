import type { ReactNode } from "react";
import { cn } from "../primitives/cn";
import { Sparkline } from "../primitives/Charts";
import Skeleton from "../primitives/Skeleton";

/**
 * KpiTile - the stat tile of the Enterprise boards: a tinted icon square, the label, the figure with a small curve beside it and
 * a "+12% vs last month" line. The icon-tile palette is FIXED (the boards): violet, green, blue, orange, indigo, pink. It is not the
 * chart palette and not the organization's brand colour, so a tenant's two colours never recolour a tile.
 *
 *   <KpiTile tone="violet" label="Total Consultants" icon={<UsersIcon size={22} />} value="248"
 *            delta={{ text: "+12%", dir: "up", good: true }} series={[8, 9, 9, 11, 12]} />
 *
 * Tokens (theme-tenant.css, `.theme-tenant` only): `--ent-kpi-<tone>-bg|fg|line`, `--ent-kpi-good|bad`. A page that keeps its own tile
 * markup uses the same names: `<span className="ent-kpi-chip" data-tone="green">` and `color={kpiLine("green")}` for its Sparkline.
 * The delta and the curve are drawn only when given (a tile with no history shows the figure alone).
 */
export type KpiTone = "violet" | "green" | "blue" | "orange" | "indigo" | "pink";

/** The boards' order of tones, left to right on the dashboard. */
export const KPI_TONES: readonly KpiTone[] = ["violet", "green", "blue", "orange", "indigo", "pink"];

/** The sparkline stroke of a tone, as a CSS colour (a tenant token). */
export function kpiLine(tone: KpiTone): string {
  return `var(--ent-kpi-${tone}-line)`;
}

export interface KpiDelta {
  /** "+12%", "-25%", "+3". */
  text: string;
  dir: "up" | "down" | "flat";
  /** Whether the move is good news (green) or bad (red); null / omitted = neutral. */
  good?: boolean | null;
  /** Default "vs last month". */
  suffix?: string;
}

export interface KpiTileProps {
  tone: KpiTone;
  label: string;
  icon: ReactNode;
  value: ReactNode;
  delta?: KpiDelta | null;
  /** The points of the curve (two or more); omitted = no curve. */
  series?: number[] | null;
  /** Names the curve for assistive tech. */
  seriesLabel?: string;
  /** Shown in the top-right corner of the tile (the board's "Add Employee" button on the last Employees tile). */
  action?: ReactNode;
  loading?: boolean;
  /** `data-kpi` of the tile (the page's journeys find a tile by it). */
  id?: string;
  className?: string;
}

export function KpiTile({ tone, label, icon, value, delta, series, seriesLabel, action, loading = false, id, className }: KpiTileProps) {
  const good = delta ? (delta.dir === "flat" ? null : (delta.good ?? null)) : null;
  return (
    <div data-kpi={id} data-kpi-tone={tone} className={cn("ent-card relative flex h-full flex-col p-4", className)}>
      <span aria-hidden className="ent-kpi-chip" data-tone={tone}>
        {icon}
      </span>
      <span className="ent-kpi-label mt-3 leading-tight">{label}</span>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        {loading ? <Skeleton className="h-8 w-14" /> : <span className="ent-kpi-value" data-kpi-value>{value}</span>}
        {!loading && series && series.length >= 2 ? <Sparkline values={series} color={kpiLine(tone)} label={seriesLabel} className="mb-0.5 !h-9 !w-[88px] flex-none" /> : null}
      </div>
      {delta && !loading ? (
        <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-[#46527e]" data-kpi-delta data-delta={delta.dir} data-good={good === null ? undefined : String(good)}>
          <span className="ent-kpi-delta inline-flex items-center gap-1 font-bold" data-good={good === null ? undefined : String(good)}>
            <span aria-hidden>{delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "▬"}</span>
            <span className="sr-only">{delta.dir === "up" ? "Up " : delta.dir === "down" ? "Down " : "No change "}</span>
            {delta.text}
          </span>
          {delta.suffix ?? "vs last month"}
        </span>
      ) : null}
      {action ? <div className="absolute right-3 top-3">{action}</div> : null}
    </div>
  );
}
