"use client";

import { MoneyText } from "@kiwiply/ui";
import { quoteSavingsLine } from "@/lib/subscription/copy";
import type { PlanQuote } from "@/lib/subscription/types";

/**
 * The lines of a quote's PROPOSED basket and its total, exactly as the server priced them (docs/subscriptions/05-customer-ux.md section 3).
 * Nothing is added here: every figure is a field of the quote. The total is `aria-live` so a re-quote is announced.
 */
export default function QuoteSummary({ quote, totalSuffix }: { quote: PlanQuote; totalSuffix: string }) {
  const lines = quote.proposed.lines;
  const savings = quoteSavingsLine(quote);
  return (
    <div className="flex flex-col gap-2" data-testid="quote-summary">
      <ul className="flex flex-col gap-1.5 text-[14px]">
        {lines.map((l) => (
          <li key={`${l.kind}:${l.featureKey ?? "base"}`} className="flex items-baseline justify-between gap-3">
            <span className="text-ink">
              {l.name}
              {l.quantity > 1 ? <span className="text-muted"> x{l.quantity}</span> : null}
            </span>
            <MoneyText minor={l.lineTotalMinor} currency={quote.currency} />
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2" aria-live="polite">
        <span className="text-[14px] font-semibold text-ink">Total</span>
        <span className="font-display text-xl font-bold text-ink" data-testid="quote-total">
          <MoneyText minor={quote.proposed.recurringMinor} currency={quote.currency} />
          <span className="font-body text-[13px] font-medium text-muted">{totalSuffix}</span>
        </span>
      </div>
      {savings ? <p className="text-[12.5px] text-accent-deep">{savings}</p> : null}
    </div>
  );
}
