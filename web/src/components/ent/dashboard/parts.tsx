"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { Button, DeltaChip, LockIcon, RefreshIcon, Skeleton, Sparkline, Tooltip, IconButton, chartColor, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { comparedToText, deltaFromPct, statTileOf, unavailableText, type DashboardWidget } from "@/lib/ent/dashboard";

/**
 * The dashboard's shared card pieces (X2.17). Every widget state has ONE honest rendering here:
 *   loading      a skeleton the size of the card (no spinner, the page never blocks)
 *   ok           the data
 *   empty        a plain sentence from the reason, no number
 *   unavailable  "Available when X launches", no number, no sample chart
 *   error        one inline retry for this card only
 */

export const CARD = "rounded-[var(--radius-lg)] border border-line bg-paper";

export function CardHead({ icon: Icon, title, tone = "accent", children, id }: { icon: ComponentType<IconProps>; title: string; tone?: IconTone; children?: ReactNode; id: string }) {
  return (
    <header className="flex min-h-9 items-center gap-2.5">
      <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px]", TONES[tone])}>
        <Icon size={19} />
      </span>
      <h2 id={id} className="min-w-0 flex-1 truncate text-[16.5px] font-bold text-ink">
        {title}
      </h2>
      {children}
    </header>
  );
}

export type IconTone = "accent" | "violet" | "green" | "amber" | "pink" | "teal" | "coral";
export const TONES: Record<IconTone, string> = {
  accent: "bg-accent-soft text-accent-deep",
  violet: "bg-v2-violet-soft text-v2-violet-ink",
  green: "bg-v2-green-soft text-v2-green-ink",
  amber: "bg-v2-amber-soft text-v2-amber-ink",
  pink: "bg-v2-pink-soft text-v2-pink-ink",
  teal: "bg-v2-teal-soft text-v2-teal-ink",
  coral: "bg-v2-coral-soft text-v2-coral-ink",
};

/** The text for an `empty` widget, from the API's reason. Never a number. */
const EMPTY_TEXT: Record<string, string> = {
  NO_CONSULTANTS: "No consultants yet",
  NO_EMPLOYEES: "No active employees yet",
  NO_ALERTS: "All clear. Nothing needs your attention.",
  NO_ACTIVITY: "Nothing has happened yet.",
  NO_ACTIONS: "No shortcuts for your role.",
};
export const emptyText = (reason: string | null): string => (reason && EMPTY_TEXT[reason]) || "Nothing here yet.";

/** One card's failure: the sentence and its own retry (the rest of the page keeps working). */
export function CardError({ onRetry, what }: { onRetry: () => void; what: string }) {
  return (
    <div data-widget-error role="alert" className="flex flex-col items-start gap-2 py-3">
      <p className="text-[13.5px] text-ink-soft">We couldn&apos;t load {what} just now.</p>
      <Button type="button" size="sm" variant="accent-soft" onClick={onRetry} aria-label={`Try again: ${what}`}>
        <RefreshIcon size={14} /> Try again
      </Button>
    </div>
  );
}

/** The honest locked body of a card whose module is not built yet. No chart, no figure, no sample. */
export function Unavailable({ module }: { module: string | null }) {
  return (
    <div data-widget-unavailable className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-paper-2 text-muted">
        <LockIcon size={20} />
      </span>
      <p className="text-[14.5px] font-semibold text-ink">{unavailableText(module)}</p>
      <p className="max-w-[26ch] text-[12.5px] leading-snug text-muted">Nothing to show until then, and we won&apos;t fill the space with made-up numbers.</p>
    </div>
  );
}

export function CardSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div data-widget-skeleton aria-busy="true" className={cn("flex flex-col gap-3 py-2", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/* ── the KPI tile ──────────────────────────────────────────────────────────────────── */

export interface TileSpec {
  key: string;
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
  /** Where the tile leads, when its page exists. */
  href?: string | null;
}

const TILE = "flex min-h-[148px] min-w-0 flex-col rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-4";

function TileFrame({ spec, children, state }: { spec: TileSpec; children: ReactNode; state: string }) {
  const Icon = spec.icon;
  return (
    <section aria-label={spec.title} data-stat-tile={spec.key} data-state={state} className={TILE}>
      <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-[11px]", TONES[spec.tone])}>
        <Icon size={20} />
      </span>
      <h3 className="mt-2.5 truncate text-[14px] font-semibold text-ink-soft">{spec.title}</h3>
      {children}
    </section>
  );
}

const nf = (n: number) => n.toLocaleString("en-US");

export function StatTile({ spec, widget, loading, onRetry, index }: { spec: TileSpec; widget: DashboardWidget | null; loading: boolean; onRetry: () => void; index: number }) {
  if (loading)
    return (
      <TileFrame spec={spec} state="loading">
        <Skeleton className="mt-2 h-8 w-20" />
        <Skeleton className="mt-3 h-4 w-28" />
      </TileFrame>
    );
  if (!widget) return null; // absent from the API's answer: this member does not see it
  if (widget.state === "unavailable")
    return (
      <TileFrame spec={spec} state="unavailable">
        <p data-widget-unavailable className="mt-2 flex items-start gap-1.5 text-[13px] font-semibold leading-snug text-muted">
          <LockIcon size={14} className="mt-[3px] flex-none" />
          <span>{unavailableText(widget.module)}</span>
        </p>
      </TileFrame>
    );
  if (widget.state === "error")
    return (
      <TileFrame spec={spec} state="error">
        <div data-widget-error role="alert" className="mt-2 flex flex-col items-start gap-1.5">
          <p className="text-[13px] text-ink-soft">Couldn&apos;t load this.</p>
          <Button type="button" size="sm" variant="accent-soft" onClick={onRetry} aria-label={`Try again: ${spec.title}`}>
            Try again
          </Button>
        </div>
      </TileFrame>
    );
  const tile = statTileOf(widget);
  if (widget.state === "empty" || !tile)
    return (
      <TileFrame spec={spec} state="empty">
        <p className="mt-2 text-[13.5px] font-semibold text-muted">{emptyText(widget.reason)}</p>
      </TileFrame>
    );

  const delta = deltaFromPct(tile.deltaPct);
  const parts = Object.entries(tile.counts)
    .filter(([k, n]) => k !== "active" && n > 0)
    .map(([k, n]) => `${nf(n)} ${k}`)
    .join(" · ");
  const body = (
    <>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p data-tile-value className="text-[30px] font-extrabold leading-none tabular-nums text-ink">
          {nf(tile.value)}
        </p>
        <div className="mb-0.5 w-[44%] max-w-[88px] flex-none">
          <Sparkline values={tile.sparkline} color={chartColor(index)} />
        </div>
      </div>
      <p className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
        {delta ? (
          <>
            <DeltaChip delta={delta} />
            <span>{comparedToText(tile.comparedTo)}</span>
          </>
        ) : parts ? (
          <span data-tile-counts>{parts}</span>
        ) : null}
      </p>
    </>
  );
  return (
    <TileFrame spec={spec} state="ok">
      {spec.href ? (
        <Link href={spec.href} className="-m-1 block rounded-lg p-1 hover:bg-paper-2/60" aria-label={`${spec.title}: ${nf(tile.value)}. Open`}>
          {body}
        </Link>
      ) : (
        body
      )}
    </TileFrame>
  );
}

/* ── "Updated" line ────────────────────────────────────────────────────────────────── */

export function UpdatedAt({ text, refreshing, onRefresh }: { text: string; refreshing: boolean; onRefresh: () => void }) {
  return (
    <div className="flex items-center gap-1 text-[12px] text-muted">
      <span role="status" aria-live="polite" data-updated-at>
        {refreshing ? "Refreshing..." : text}
      </span>
      <Tooltip content="Refresh now" side="bottom">
        <IconButton aria-label="Refresh dashboard" onClick={onRefresh} className="h-8 w-8">
          <RefreshIcon size={14} className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} />
        </IconButton>
      </Tooltip>
    </div>
  );
}
