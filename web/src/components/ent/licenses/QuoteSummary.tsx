"use client";

import { MoneyText, PriceDelta } from "@kiwiply/ui";
import { dayText, lineText, type LicenseQuote } from "@/lib/ent/licenses";

/**
 * What a licence change costs, drawn 1:1 from the API's quote (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1b, 28 §7): one row per line, the monthly
 * before and after, what the rest of the billing period costs when there is one, and when the price stops holding. It never adds money itself: every
 * amount is the API's, and a missing price says "Price not set" (never $0). Nothing is billed while billing isn't connected.
 */
export default function QuoteSummary({ quote, now = new Date() }: { quote: LicenseQuote; now?: Date }) {
  const t = quote.totals;
  const cur = quote.currency;
  return (
    <section aria-label="What this change costs" className="space-y-3 rounded-[var(--radius)] border border-line bg-paper-2/60 p-3" data-quote-summary={quote.id}>
      <h3 className="text-[13px] font-semibold text-ink">Review the change for {quote.consultantName}</h3>
      <ul className="space-y-1.5 text-[12.5px]" data-quote-lines>
        {quote.lines.map((l, i) => (
          <li key={`${l.op}-${l.featureKey ?? "base"}-${i}`} className="flex items-baseline justify-between gap-3">
            <span className="text-ink">{lineText(l, now)}</span>
            <span className="shrink-0 text-right text-ink-soft">
              {l.monthlyMinor == null ? (
                "Price not set"
              ) : (
                <>
                  <MoneyText minor={l.monthlyMinor} currency={cur} tone={l.op === "REMOVE_FEATURE" ? "muted" : "default"} strike={l.op === "REMOVE_FEATURE"} /> / month
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t border-line pt-2 text-[12.5px]">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">Monthly</dt>
          <dd className="text-right" data-quote-monthly>
            {!t.priceSet || t.currentMonthlyMinor == null || t.proposedMonthlyMinor == null ? (
              <span className="text-ink-soft">Price not set</span>
            ) : (
              <span className="inline-flex flex-wrap items-baseline justify-end gap-x-2">
                <span className="text-ink-soft">
                  <MoneyText minor={t.currentMonthlyMinor} currency={cur} tone="muted" /> → <MoneyText minor={t.proposedMonthlyMinor} currency={cur} />
                </span>
                <PriceDelta minor={t.deltaMinor ?? 0} currency={cur} />
              </span>
            )}
          </dd>
        </div>
        {t.priceSet && t.dueNowMinor != null && t.dueNowMinor > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">For the rest of this period{t.periodLastDay ? ` (to ${dayText(t.periodLastDay)})` : ""}</dt>
            <dd data-quote-due>
              <MoneyText minor={t.dueNowMinor} currency={cur} />
            </dd>
          </div>
        )}
      </dl>
      <p className="text-[12px] text-muted" data-quote-note>
        {quote.billingConnected ? "" : "Nothing is billed yet: billing isn't connected for your organization. "}
        {quote.lines.some((l) => l.op === "REMOVE_FEATURE" && new Date(l.effectiveAt).getTime() > now.getTime() + 60_000)
          ? "Removed add-ons keep working until the period ends. "
          : ""}
        This price holds until {new Date(quote.expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
      </p>
    </section>
  );
}
