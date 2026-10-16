"use client";

import { IconButton, MinusIcon, MoneyText, PlusIcon } from "@kiwiply/ui";
import { Button } from "@/components/ui";
import { intervalSuffix, shortDate } from "@/lib/subscription/copy";
import type { Interval, PendingChange } from "@/lib/subscription/types";

export type AddonRow = {
  featureKey: string;
  name: string;
  /** Quantity in the pending change set (what the person has dialled in). */
  quantity: number;
  /** Quantity held now; the row shows a pending mark when it differs. */
  held: number;
  unitMinor: number | null;
  max: number;
  /** A scheduled removal or decrease the person can still take back. */
  pending?: PendingChange;
};

/**
 * One row per add-on the plan can carry (docs/subscriptions/05-customer-ux.md section 4): a stepper that edits the PENDING change set, never the
 * subscription. Removing says, right here, "works until {date} - no refund". A row with a scheduled change is locked and offers Undo instead.
 */
export default function AddonSteppers({
  rows,
  interval,
  currency,
  onChange,
  onUndo,
  undoing,
}: {
  rows: AddonRow[];
  interval: Interval;
  currency: string;
  onChange: (featureKey: string, quantity: number) => void;
  onUndo: (change: PendingChange) => void;
  undoing: number | null;
}) {
  if (rows.length === 0) return <p className="text-[13px] text-muted">No add-ons are offered for this plan right now.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line" data-testid="addon-steppers">
      {rows.map((r) => {
        const locked = !!r.pending;
        const decreasing = r.quantity < r.held;
        return (
          <li key={r.featureKey} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-ink">{r.name}</p>
              <p className="text-[12.5px] text-muted">
                {r.unitMinor != null ? (
                  <>
                    <MoneyText minor={r.unitMinor} currency={currency} tone="muted" />
                    {intervalSuffix(interval)} each
                  </>
                ) : null}
                {r.pending ? (
                  <span className="block text-brown-deep">
                    {r.pending.quantityTo === 0 ? "Removed" : `Down to ${r.pending.quantityTo}`} on {shortDate(r.pending.effectiveAt)} · works until then · no refund
                  </span>
                ) : decreasing ? (
                  <span className="block text-brown-deep">Works until your next renewal · no refund</span>
                ) : null}
              </p>
            </div>
            {locked ? (
              <Button variant="ghost" size="sm" disabled={undoing === r.pending!.id} onClick={() => onUndo(r.pending!)}>
                {undoing === r.pending!.id ? "Undoing..." : "Undo"}
              </Button>
            ) : (
              <span className="flex shrink-0 items-center gap-1" role="group" aria-label={`${r.name} quantity`}>
                <IconButton aria-label={`Fewer ${r.name}`} disabled={r.quantity <= 0} onClick={() => onChange(r.featureKey, r.quantity - 1)}>
                  <MinusIcon className="h-4 w-4" />
                </IconButton>
                <span className="w-6 text-center tabular-nums text-ink" aria-live="polite" data-testid={`qty-${r.featureKey}`}>
                  {r.quantity}
                </span>
                <IconButton aria-label={`More ${r.name}`} disabled={r.quantity >= r.max} onClick={() => onChange(r.featureKey, r.quantity + 1)}>
                  <PlusIcon className="h-4 w-4" />
                </IconButton>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
