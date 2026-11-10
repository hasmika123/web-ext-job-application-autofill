"use client";

import { IconButton, MinusIcon, MoneyText, PlusIcon } from "@kiwiply/ui";
import { intervalSuffix } from "@/lib/subscription/copy";
import type { Selection } from "@/lib/subscription/catalog";
import type { CatalogOptional, Interval } from "@/lib/subscription/types";

/**
 * The optional add-ons of a plan card (docs/subscriptions/05-customer-ux.md section 2): one row per add-on that has a published price for the selected
 * interval. Nothing is pre-ticked. Unit prices are catalog fields; the card's Total comes from the server, never from this component.
 */
export default function AddonRows({
  planKey,
  addons,
  interval,
  currency,
  selection,
  onChange,
}: {
  planKey: string;
  addons: CatalogOptional[];
  interval: Interval;
  currency: string;
  selection: Selection;
  onChange: (featureKey: string, quantity: number) => void;
}) {
  if (addons.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-muted">Add-ons (optional)</p>
      <ul className="mt-2 flex flex-col gap-2">
        {addons.map((a) => {
          const qty = selection[a.featureKey] ?? 0;
          const price = a.prices[interval];
          const max = a.maxQuantity ?? 10;
          const id = `addon-${planKey}-${a.featureKey}`;
          return (
            <li key={a.featureKey} className="flex items-center justify-between gap-2 text-[13.5px]">
              <label htmlFor={id} className="flex min-w-0 flex-1 items-start gap-2 text-ink-soft">
                <input
                  id={id}
                  type="checkbox"
                  checked={qty > 0}
                  onChange={(e) => onChange(a.featureKey, e.target.checked ? 1 : 0)}
                  className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-ink">{a.name}</span>
                  {price ? (
                    <span className="block text-[12.5px] text-muted">
                      <MoneyText minor={price.amountMinor} currency={currency} tone="muted" />
                      {intervalSuffix(interval)}
                    </span>
                  ) : null}
                </span>
              </label>
              {qty > 0 ? (
                <span className="flex shrink-0 items-center gap-1" role="group" aria-label={`${a.name} quantity`}>
                  <IconButton aria-label={`Fewer ${a.name}`} onClick={() => onChange(a.featureKey, qty - 1)}>
                    <MinusIcon className="h-4 w-4" />
                  </IconButton>
                  <span className="w-5 text-center tabular-nums text-ink" aria-live="polite">
                    {qty}
                  </span>
                  <IconButton aria-label={`More ${a.name}`} disabled={qty >= max} onClick={() => onChange(a.featureKey, qty + 1)}>
                    <PlusIcon className="h-4 w-4" />
                  </IconButton>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
