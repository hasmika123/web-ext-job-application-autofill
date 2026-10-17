"use client";

import { Button, ErrorState, MoneyText, Select, Skeleton, cn } from "@kiwiply/ui";
import { INTERVAL_LABEL, INTERVAL_SUFFIX, bpText, failingChecks, type PlanPreview } from "@/lib/admin-plans";
import ChecksTable from "./ChecksTable";
import ImpactBlock from "./ImpactBlock";
import { MarginTick } from "./PriceCell";
import RosterPreview from "./RosterPreview";
import type { PlanPreviewState, PreviewQuery } from "./usePlanPreview";

export interface PlanPreviewPaneProps {
  state: PlanPreviewState;
  query: PreviewQuery;
  onQuery: (patch: Partial<PreviewQuery>) => void;
  intervals: string[];
  currencies: string[];
  version: number;
  liveVersion?: number | null;
  /** featureKey -> the service's name, for the add-on rows. */
  names: Record<string, string>;
}

const Section = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={cn("border-t border-line pt-3", className)}>
    <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-v2-muted">{title}</h3>
    {children}
  </section>
);

/**
 * The right pane of the plan editor (K4.3; 04 section 3): the server-computed preview of the draft. Interval and currency selectors,
 * the base price, the optional add-ons with their margin ticks, the composition WORST CASE with its levers, annual, the seat
 * roster of an organization plan, the publish checks and the impact. It renders `GET .../preview` 1:1 and computes nothing: the
 * number shown is the number the guard checks. The previous answer stays on screen while a new one loads.
 */
export default function PlanPreviewPane({ state, query, onQuery, intervals, currencies, version, liveVersion, names }: PlanPreviewPaneProps) {
  const { preview, loading, error, reload } = state;
  if (!preview) {
    if (error) return <ErrorState what="the preview" description={error} onRetry={reload} variant="inline" />;
    return (
      <div role="status" aria-label="Loading the preview" className="space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return <Loaded preview={preview} loading={loading} error={error} reload={reload} query={query} onQuery={onQuery} intervals={intervals} currencies={currencies} version={version} liveVersion={liveVersion} names={names} />;
}

function Loaded({
  preview,
  loading,
  error,
  reload,
  query,
  onQuery,
  intervals,
  currencies,
  version,
  liveVersion,
  names,
}: Omit<PlanPreviewPaneProps, "state"> & { preview: PlanPreview; loading: boolean; error: string | null; reload: () => void }) {
  const cur = preview.currency;
  const failing = failingChecks(preview);
  const w = preview.worstCase;
  const suffix = INTERVAL_SUFFIX[preview.interval] ?? preview.interval.toLowerCase();
  const extra = w && !w.ok && !preview.checks.some((c) => c.id === "margin" && !c.ok) ? [{ label: "Worst case margin", ok: false, failing: [{ marginBp: w.marginBp, floorBp: w.floorBp, levers: w.levers } as Record<string, unknown>] }] : [];
  return (
    <div className={cn("space-y-3", loading && "opacity-70")} aria-busy={loading || undefined} data-preview-version={preview.version}>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[12px] font-semibold text-ink">
          <span className="mb-1 block">Interval</span>
          <Select value={query.interval} onChange={(interval) => onQuery({ interval })} aria-label="Preview interval" options={intervals.map((i) => ({ value: i, label: INTERVAL_LABEL[i] ?? i }))} />
        </label>
        <label className="text-[12px] font-semibold text-ink">
          <span className="mb-1 block">Currency</span>
          <Select value={query.currency} onChange={(currency) => onQuery({ currency })} aria-label="Preview currency" options={currencies.map((c) => ({ value: c, label: c }))} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] text-danger-text">
          Couldn&apos;t refresh the preview: {error}{" "}
          <button type="button" onClick={reload} className="font-semibold underline">
            Retry
          </button>
        </p>
      )}

      <Section title="Price">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] text-ink">Base price / {suffix}</span>
          <span aria-live="polite" className="text-[20px] font-extrabold tabular-nums text-ink">
            {preview.baseMinor == null ? "—" : <MoneyText minor={preview.baseMinor} currency={cur} />}
          </span>
        </div>
        <p className="text-[12.5px] text-v2-muted">
          Included AI cap <MoneyText minor={preview.includedAiCapCents} currency={cur} /> per period
        </p>
      </Section>

      {preview.optional.length > 0 && (
        <Section title="Optional add-ons">
          <ul className="space-y-2">
            {preview.optional.map((o) => (
              <li key={o.featureKey} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[13px]">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{names[o.featureKey] ?? o.featureKey}</span>
                  <span className="text-v2-muted">
                    {" "}
                    · <MoneyText minor={o.unitMinor} currency={cur} /> × 1…{o.maxQuantity}
                  </span>
                </span>
                <MarginTick marginBp={o.marginBp} ok={o.ok} levers={o.levers} currency={cur} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {w && (
        <Section title="Worst case">
          <p className="text-[12.5px] text-v2-muted">Base plus every add-on at its maximum on one invoice.</p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span aria-live="polite" className="text-[18px] font-extrabold tabular-nums text-ink">
              <MoneyText minor={w.totalMinor} currency={cur} /> <span className="text-[12px] font-medium text-v2-muted">/ {suffix}</span>
            </span>
            <MarginTick marginBp={w.marginBp} ok={w.ok} levers={w.levers} currency={cur} />
          </div>
          <p className="text-[12px] text-v2-muted tabular-nums">
            AI <MoneyText minor={w.aiCents} currency={cur} /> · payment fee <MoneyText minor={w.feeMinor} currency={cur} /> · floor {bpText(w.floorBp)}
          </p>
        </Section>
      )}

      {preview.annual && (
        <Section title="Annual">
          {preview.annual.enabled ? (
            <p className="text-[13px] tabular-nums">
              {preview.annual.baseYearMinor != null && <MoneyText minor={preview.annual.baseYearMinor} currency={cur} className="font-semibold" />} / yr
              {preview.annual.monthlyEquivalentMinor != null && (
                <span className="text-v2-muted">
                  {" "}
                  · <MoneyText minor={preview.annual.monthlyEquivalentMinor} currency={cur} /> a month
                </span>
              )}
              {preview.annual.savingsBp != null && <span className="text-v2-muted"> · saves {bpText(preview.annual.savingsBp)}</span>}
            </p>
          ) : (
            <p className="text-[13px] text-v2-muted">Not offered: annual billing is off or this version does not list the yearly interval.</p>
          )}
        </Section>
      )}

      {preview.seats && (
        <Section title="Seats">
          <RosterPreview seats={preview.seats} currency={cur} roster={query.roster ?? ""} onRoster={(roster) => onQuery({ roster })} />
        </Section>
      )}

      <Section title="Checks">
        <ChecksTable checks={preview.checks} currency={cur} extra={extra} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p role="status" className={cn("text-[12.5px] font-semibold", failing > 0 ? "text-danger-text" : "text-accent-deep")}>
            {failing > 0 ? `${failing} failing ${failing === 1 ? "check" : "checks"}` : "All checks pass"}
          </p>
          <Button type="button" variant="accent-soft" onClick={reload} className="min-h-11 sm:min-h-0">
            Run all checks
          </Button>
        </div>
      </Section>

      {preview.impact && (
        <Section title="Impact if published">
          <ImpactBlock impact={preview.impact} version={version} liveVersion={liveVersion} />
        </Section>
      )}
    </div>
  );
}
