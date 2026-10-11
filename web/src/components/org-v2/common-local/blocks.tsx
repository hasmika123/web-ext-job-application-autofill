import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { StatTile, TONE, type Tone } from "@/components/app-v2/common";

/**
 * Small composed blocks shared by the org pages (still "common-local": the QA phase decides
 * whether they graduate into app-v2/common).
 */

/** Row of StatTiles: 2 per row from `sm`, 4 from `xl` (3 from `xl` when `cols` = 3, 5 when 5). */
export function StatRow({
  stats,
  icons,
  cols = 4,
}: {
  stats: readonly {
    id: string;
    value: string;
    label: string;
    delta?: { value: string; up: boolean };
    tone: Tone;
    spark?: readonly number[];
  }[];
  icons: Record<string, ReactNode>;
  cols?: 4 | 5;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-3.5 sm:grid-cols-2", cols === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
      {stats.map((s) => (
        <StatTile
          key={s.id}
          icon={icons[s.id]}
          value={s.value}
          label={s.label}
          delta={s.delta}
          sparkline={s.spark ? [...s.spark] : undefined}
          tone={s.tone}
        />
      ))}
    </div>
  );
}

/** Dot timeline ("Application Activity Timeline", "Recent Activity"). */
export function ActivityTimeline({
  items,
  className,
}: {
  items: readonly { id: string; title: string; sub: string; when: string; tone: Tone }[];
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-3.5", className)}>
      <span aria-hidden className="absolute bottom-2 left-[4.5px] top-2 w-px bg-v2-line" />
      {items.map((it) => (
        <li key={it.id} className="relative flex items-start gap-3">
          <span className={cn("relative z-[1] mt-1.5 h-[10px] w-[10px] flex-none rounded-full ring-4 ring-white", TONE[it.tone].solid)} />
          <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-snug text-v2-navy">{it.title}</p>
              <p className="text-[12px] leading-snug text-v2-muted">{it.sub}</p>
            </div>
            <p className="mt-0.5 flex-none text-[11.5px] leading-snug text-v2-muted sm:max-w-[84px] sm:text-right">{it.when}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Donut legend with explicit percentages. `app-v2/common` Donut derives `(pct%)` from the segment
 * sum, but the Application Stage Breakdown board prints percentages of the 124 total (23%, 39%, ...)
 * while its counts sum to 140, so that one donut renders with `legend={false}` + this legend.
 */
export function DonutLegend({
  items,
  className,
}: {
  items: readonly { label: string; value: number; pct: number; tone: Tone }[];
  className?: string;
}) {
  return (
    <ul className={cn("min-w-0 flex-1 space-y-2 text-[13px]", className)}>
      {items.map((s) => (
        <li key={s.label} className="flex items-center gap-2">
          <span aria-hidden className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE[s.tone].solid)} />
          <span className="min-w-0 flex-1 truncate text-ink-soft">{s.label}</span>
          <span className="flex-none font-semibold text-ink">
            {s.value} <span className="font-normal text-v2-muted">({s.pct}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface QuickAction {
  id: string;
  label: string;
  sub?: string;
  icon: ReactNode;
  href?: string;
}

/** "Quick Actions" tiles. `compact` = the 2-column icon-over-label tiles; otherwise icon-left with a subtitle. */
export function QuickActionTiles({
  items,
  compact,
  cols,
  className,
}: {
  items: readonly QuickAction[];
  compact?: boolean;
  /** Replaces the default grid-column classes. */
  cols?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2.5",
        cols ?? (compact ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"),
        className,
      )}
    >
      {items.map((a) => {
        const inner = compact ? (
          <>
            <span className="text-v2-blue">{a.icon}</span>
            <span className="text-[12.5px] font-semibold leading-tight text-v2-navy">{a.label}</span>
          </>
        ) : (
          <>
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-v2-blue-soft text-v2-blue">{a.icon}</span>
            <span className="min-w-0 text-left">
              <span className="block text-[13.5px] font-bold leading-tight text-v2-navy">{a.label}</span>
              {a.sub && <span className="mt-0.5 block text-[12px] leading-snug text-v2-muted">{a.sub}</span>}
            </span>
          </>
        );
        const cls = cn(
          "rounded-xl bg-[#F1F6FF] transition-colors hover:bg-[#E6EFFF]",
          compact ? "flex flex-col items-center justify-center gap-1.5 px-2 py-3.5 text-center" : "flex items-center gap-3 p-3",
        );
        return a.href ? (
          <Link key={a.id} href={a.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={a.id} type="button" className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/** Outlined / solid toolbar buttons used in card headers ("+ Add Application", "Bulk Update"). */
export function ToolbarButton({
  children,
  solid,
  icon,
  className,
}: {
  children: ReactNode;
  solid?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
        solid
          ? "bg-v2-blue text-white hover:bg-[#1A62DC]"
          : "border border-v2-line bg-white text-v2-blue hover:bg-[#F3F7FF]",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Native <select> styled as the board's "All Statuses ▾" filter. */
export function FilterSelect({
  options,
  label,
  className,
}: {
  options: string[];
  label: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      defaultValue={options[0]}
      className={cn(
        "h-11 min-w-0 rounded-xl border border-v2-line bg-white px-3 text-[13px] text-v2-ink-soft outline-none focus:border-v2-blue/50",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

/** Page body grid: main column + right rail (rail drops under main below `xl`). */
export function RailLayout({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">{main}</div>
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-1">{rail}</div>
    </div>
  );
}
