"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { DeltaChip, MoreVerticalIcon, Skeleton, Sparkline, SparklesIcon, ChevronRightIcon, chartColor, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { openHelpPanel } from "@/components/ent/shell/ShellContext";
import { deltaFromPct } from "@/lib/ent/dashboard";
import { HELP_BANNER } from "@/lib/ent/marketer-ws/home";

/**
 * Shared building blocks of the Marketing workspace boards (every page under `/w/marketing/**`). A page imports these instead of
 * re-drawing a KPI tile, a card header or the bee help card, so all eleven boards stay one design. Colours come only from the
 * tenant tokens (`bg-accent-soft`, `text-accent-deep`, `bg-v2-*-soft`); never a hex literal (ESLint enforces it).
 */

export interface MktPageProps {
  orgId: number;
  orgName: string;
  firstName: string;
  /** Menu hrefs of this member's Marketing workspace by nav key (`home`, `talent`, `resumes`, `jobs`, `matches`, `opportunities`, `streams`, ...); null/absent hides a link. */
  hrefs: Record<string, string | null>;
}

export const CARD = "min-w-0 rounded-[var(--radius-lg)] border border-line bg-paper p-4";
export const VIEW_ALL = "inline-flex h-8 flex-none items-center rounded-lg border border-line bg-paper px-3 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft";
export const TH = "px-2 py-2 text-[12px] font-semibold text-ink-soft";
export const HEAD_ROW = "bg-paper-2";

/** Soft tinted square behind an icon, by tone name. */
export const TINTS = {
  blue: "bg-accent-soft text-accent-deep",
  violet: "bg-v2-violet-soft text-v2-violet-ink",
  green: "bg-v2-green-soft text-v2-green-ink",
  amber: "bg-v2-amber-soft text-v2-amber-ink",
  pink: "bg-v2-pink-soft text-v2-pink-ink",
  teal: "bg-v2-teal-soft text-v2-teal-ink",
  coral: "bg-v2-coral-soft text-v2-coral-ink",
} as const;
export type TintName = keyof typeof TINTS;

/** Card header: tinted icon + bold title + optional "View all" + free slot (filters, buttons) on the right. */
export function Head({ icon: Icon, title, tint = "blue", viewAll, children, count }: { icon: ComponentType<IconProps>; title: string; tint?: TintName; viewAll?: string | null; children?: ReactNode; count?: number | string }) {
  return (
    <header className="mb-3 flex flex-wrap items-center gap-2.5">
      <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-[9px]", TINTS[tint])}>
        <Icon size={18} />
      </span>
      <h2 className="min-w-0 flex-1 truncate text-[16.5px] font-bold text-ink">
        {title}
        {count !== undefined ? <span className="ml-1 font-semibold text-ink-soft">({count})</span> : null}
      </h2>
      {children}
      {viewAll ? (
        <Link href={viewAll} className={VIEW_ALL}>
          View all
        </Link>
      ) : null}
    </header>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-[13.5px] text-muted">{children}</p>;
export const More = ({ label }: { label: string }) => <MoreVerticalIcon size={16} aria-label={label} className="text-muted" />;

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/**
 * The KPI tile of every board: tinted icon, title, big number, sparkline, delta chip + comparison text. A missing number
 * (`value === null`) is "Nothing yet", never a made-up zero; a missing delta draws no chip.
 */
export function KpiTile({
  id, title, icon: Icon, tint, value, deltaPct, versus = "vs last month", sparkline, sparkIndex = 1, loading, layout = "stacked", lowerIsBetter,
}: {
  id: string; title: string; icon: ComponentType<IconProps>; tint: TintName; value: number | string | null; deltaPct?: number | null; versus?: string;
  sparkline?: number[]; sparkIndex?: number; loading?: boolean;
  /** `stacked`: icon, title, number (Home, Talent, Resumes...). `inline`: icon left of title+number (Follow-ups, Applications). */
  layout?: "stacked" | "inline"; lowerIsBetter?: boolean;
}) {
  const delta = deltaFromPct(deltaPct ?? null);
  const iconBox = (
    <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-[11px]", TINTS[tint])}>
      <Icon size={20} />
    </span>
  );
  const number = loading ? (
    <Skeleton className="mt-2 h-8 w-20" />
  ) : value === null ? (
    <p className="mt-2 text-[13.5px] font-semibold text-muted">Nothing yet</p>
  ) : (
    <>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p data-tile-value className="text-[30px] font-extrabold leading-none tabular-nums text-ink">
          {typeof value === "number" ? value.toLocaleString("en-US") : value}
        </p>
        {sparkline && sparkline.length > 1 ? (
          <div className="mb-0.5 w-[44%] max-w-[110px] flex-none">
            <Sparkline values={sparkline} color={chartColor(sparkIndex)} />
          </div>
        ) : null}
      </div>
      <p className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
        {delta ? (
          <>
            <DeltaChip delta={delta} lowerIsBetter={lowerIsBetter} />
            <span>{versus}</span>
          </>
        ) : null}
      </p>
    </>
  );
  return (
    <section aria-label={title} data-stat-tile={id} className="flex min-h-[148px] min-w-0 flex-col rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-4">
      {layout === "inline" ? (
        <div className="flex items-start gap-3">
          {iconBox}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-semibold text-ink-soft">{title}</h3>
            {number}
          </div>
        </div>
      ) : (
        <>
          {iconBox}
          <h3 className="mt-2.5 truncate text-[14px] font-semibold text-ink-soft">{title}</h3>
          {number}
        </>
      )}
    </section>
  );
}

/** The bee help card (photo banner on top, headline, copy, "Ask a question" button that opens the shared help panel). */
export function HelpBannerCard({ title, body, ask = "Ask a question", className }: { title: string; body: string; ask?: string; className?: string }) {
  return (
    <section aria-label="Help" data-home-card="help" className={cn("flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the approved board art, served as is */}
      <img src={HELP_BANNER} alt="" className="block w-full object-cover" />
      <div className="p-4">
        <h2 className="text-[19px] font-extrabold leading-tight text-ink">{title}</h2>
        <p className="mt-1.5 text-[13.5px] leading-snug text-muted">{body}</p>
        <button type="button" onClick={openHelpPanel} className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70">
          <SparklesIcon size={17} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">{ask}</span>
          <ChevronRightIcon size={16} className="flex-none" />
        </button>
      </div>
    </section>
  );
}
