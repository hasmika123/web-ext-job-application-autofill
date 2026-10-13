"use client";

import type { ReactNode } from "react";
import { AlertIcon, Card, CheckCircleIcon, ChevronRightIcon, DeltaChip, Skeleton, SparklesIcon, Sparkline, UserIcon, UsersIcon, chartColor } from "@kiwiply/ui";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { ClaimsHelpCard, ClaimsMascot, openHelpPanel } from "@/components/ent/shell/ShellContext";
import { tileView, type KpiTile, type Kpis } from "@/lib/ent/marketing-assignments";

const TILES: { key: KpiTile["key"]; label: string; icon: ReactNode }[] = [
  { key: "assigned", label: "Assigned Consultants", icon: <UsersIcon size={20} /> },
  { key: "marketers", label: "Active Marketers", icon: <CheckCircleIcon size={20} /> },
  { key: "unassigned", label: "Unassigned Consultants", icon: <UserIcon size={20} /> },
  { key: "overloaded", label: "Overloaded Marketers", icon: <AlertIcon size={20} /> },
];

/**
 * The four KPI tiles and the bee help card. Every figure and delta comes from the API's rows ("vs last month" is rebuilt from the
 * rows' own timestamps, see the note in the answer); a tile with no history shows the figure and nothing else, and a series with
 * fewer than two points draws no sparkline.
 */
export default function KpiRow({ kpis, loading, error, onRetry, orgName }: { kpis: Kpis | null; loading: boolean; error: boolean; onRetry: () => void; orgName: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.25fr)]" data-kpi-row>
      {TILES.map((t, i) => {
        const tile = kpis?.tiles.find((x) => x.key === t.key) ?? null;
        const view = tileView(tile);
        return (
          <Card key={t.key} className="flex min-w-0 flex-col gap-2 !p-4" data-kpi={t.key}>
            <span aria-hidden className="inline-grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent-deep">
              {t.icon}
            </span>
            <span className="text-[13.5px] font-medium leading-tight text-ink-soft">{t.label}</span>
            <div className="flex items-end justify-between gap-2">
              {loading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <span className="text-[32px] font-extrabold leading-none tracking-tight text-ink tabular-nums" data-kpi-value>
                  {tile ? tile.current.toLocaleString("en-US") : error ? "—" : ""}
                </span>
              )}
              {tile && tile.series.length > 1 && (
                <div className="mb-1 w-[46%] max-w-[110px] flex-none" data-kpi-spark>
                  <Sparkline values={tile.series} color={chartColor(i)} />
                </div>
              )}
            </div>
            {view && (
              <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-kpi-delta>
                <DeltaChip delta={{ dir: view.dir, text: view.text.replace(/^[+-]/, "") }} lowerIsBetter={tile?.good === "DOWN"} />
                vs last month
              </span>
            )}
            {error && !loading && (
              <button type="button" onClick={onRetry} className="self-start text-[12px] font-semibold text-accent-deep underline">
                Try again
              </button>
            )}
          </Card>
        );
      })}
      <section aria-label="Help" data-help-bee className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-paper sm:col-span-2 xl:col-span-1">
        <ClaimsMascot />
        <ClaimsHelpCard />
        <div className="flex justify-center bg-accent-soft/60 pt-2">
          <EnterpriseMascot pose="greet" size="md" />
        </div>
        <div className="flex flex-1 flex-col p-3.5">
          <h2 className="text-[15px] font-extrabold leading-tight text-ink">Need help with marketing assignments?</h2>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">I can help you balance workloads, reassign consultants, or find the best marketer for your team at {orgName}.</p>
          <button
            type="button"
            onClick={openHelpPanel}
            className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[13.5px] font-semibold text-accent-deep hover:bg-accent-soft/70"
          >
            <SparklesIcon size={16} className="flex-none" />
            <span className="min-w-0 flex-1 truncate">Ask a question...</span>
            <ChevronRightIcon size={15} className="flex-none" />
          </button>
        </div>
      </section>
    </div>
  );
}
