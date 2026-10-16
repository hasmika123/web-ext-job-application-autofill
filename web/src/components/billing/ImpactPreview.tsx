"use client";

import { MoneyText, PriceDelta } from "@kiwiply/ui";
import { Button } from "@/components/ui";
import { NO_REFUND, TAX_NOTE, clockTime, intervalSuffix, money, shortDate } from "@/lib/subscription/copy";
import type { Interval, PlanQuote } from "@/lib/subscription/types";

const PER: Record<Interval, string> = { MONTH: "mo", QUARTER: "3 mo", YEAR: "yr" };

/** The sentence about an interval change (S-04): monthly to yearly starts at the next renewal, yearly to monthly at the end of the term, nothing is refunded. */
export function intervalChangeSentence(quote: PlanQuote): string | null {
  const c = quote.intervalChange;
  if (!c) return null;
  const when = shortDate(quote.nextInvoiceAt) || shortDate(c.effectiveAt) || "your next renewal";
  const to = money(quote.proposed.recurringMinor, quote.currency);
  const from = quote.current ? money(quote.current.recurringMinor, quote.currency) : null;
  if (c.to === "MONTH") return `Your plan switches to monthly on ${when} (the end of your term). Nothing is refunded.`;
  const unit = c.to === "YEAR" ? "once a year" : "every 3 months";
  const fromUnit = c.from === "MONTH" ? "monthly" : c.from === "QUARTER" ? "every 3 months" : "yearly";
  return `From ${when} you'll pay ${to} ${unit}${from ? ` instead of ${from} ${fromUnit}` : ""}.`;
}

/**
 * The impact of a pending change, exactly as the server priced it (docs/subscriptions/05-customer-ux.md section 4): current against proposed, the
 * difference, what happens to each removal ("works until Nov 15 - no refund"), what is charged today (prorated), the next invoice, and the confirm button
 * carrying the price and its date. Every figure is a quote field; nothing is added here. `names` maps a feature key to its display name.
 */
export default function ImpactPreview({
  quote,
  names,
  confirming,
  onConfirm,
  onConfirmDep,
  confirmedDeps,
  fromPlanKey,
}: {
  /** The plan the subscriber holds now; a quote for another plan is a plan switch. */
  fromPlanKey: string;
  quote: PlanQuote;
  names: Record<string, string>;
  confirming: boolean;
  onConfirm: () => void;
  onConfirmDep: (requires: string) => void;
  confirmedDeps: string[];
}) {
  const cur = quote.current;
  const per = PER[quote.interval];
  const name = (k: string) => names[k] ?? k;
  const intervalSentence = intervalChangeSentence(quote);
  const immediate = quote.effectiveAt === "now";
  const needsDeps = (quote.requiresConfirmation ?? []).filter((d) => !confirmedDeps.includes(d.requires));
  const today = quote.prorationEstimateMinor;
  const planSwitch = quote.plan.planKey !== fromPlanKey;

  return (
    <div className="flex flex-col gap-3" data-testid="impact-preview">
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 text-[14px]">
        {cur ? (
          <>
            <dt className="text-muted">Current</dt>
            <dd className="text-right text-ink" data-testid="impact-current">
              <MoneyText minor={cur.recurringMinor} currency={quote.currency} />
              {intervalSuffix(quote.intervalChange?.from ?? quote.interval)}
            </dd>
          </>
        ) : null}
        <dt className="text-muted">Proposed</dt>
        <dd className="text-right font-semibold text-ink" data-testid="impact-proposed" aria-live="polite">
          <MoneyText minor={quote.proposed.recurringMinor} currency={quote.currency} />
          {intervalSuffix(quote.interval)}{" "}
          <PriceDelta minor={quote.deltaMinor} currency={quote.currency} per={PER[quote.intervalChange?.from ?? quote.interval]} />
        </dd>
      </dl>

      {planSwitch ? (
        <p className="text-[13px] text-ink-soft" data-testid="plan-switch-note">
          {immediate
            ? `Upgrade now: ${money(today, quote.currency)} today, prorated for the rest of this period. Included add-ons end at your next renewal.`
            : `Switches to ${quote.plan.name} on ${shortDate(quote.effectiveAt) || "your next renewal"}. Nothing changes until then.`}
        </p>
      ) : null}
      {intervalSentence ? (
        <p className="text-[13px] text-ink-soft" data-testid="interval-note">
          {intervalSentence}
        </p>
      ) : null}

      {(quote.removals ?? []).length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px] text-ink-soft" data-testid="impact-removals">
          {(quote.removals ?? []).map((r) => (
            <li key={r.featureKey}>
              {name(r.featureKey)} x{r.quantityFrom} to x{r.quantityTo}: works until {shortDate(r.effectiveAt)} · no refund
            </li>
          ))}
        </ul>
      ) : null}

      {(quote.additions ?? []).length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px] text-ink-soft" data-testid="impact-additions">
          {(quote.additions ?? []).map((a) => (
            <li key={a.featureKey}>
              {a.name} x{a.quantityFrom} to x{a.quantityTo}: today, prorated, up to {money(a.prorationMinor, quote.currency)}
            </li>
          ))}
        </ul>
      ) : null}

      {needsDeps.map((d) => (
        <div key={d.requires} className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-[13px] text-ink-soft" data-testid="impact-dependency">
          <p>
            {name(d.featureKey)} also needs {d.name}, {money(d.priceMinor, quote.currency)}
            {intervalSuffix(quote.interval)} more.
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => onConfirmDep(d.requires)}>
            Add {d.name}
          </Button>
        </div>
      ))}

      {(quote.warnings ?? []).map((w) => (
        <p key={w} className="text-[12.5px] text-muted">
          {w}
        </p>
      ))}

      <p className="text-[13px] text-ink-soft" data-testid="impact-today">
        Today: {money(immediate ? today : 0, quote.currency)}
        {quote.nextInvoiceAt && quote.nextInvoiceEstimateMinor != null
          ? ` · Next invoice ${shortDate(quote.nextInvoiceAt)} about ${money(quote.nextInvoiceEstimateMinor, quote.currency)}`
          : ""}
      </p>
      <p className="text-[12px] leading-relaxed text-muted">
        {NO_REFUND} {quote.taxNote ?? TAX_NOTE}
      </p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted" aria-live="polite">
          price valid {clockTime(quote.expiresAt)}
        </span>
        <Button variant="accent" disabled={confirming || needsDeps.length > 0} onClick={onConfirm}>
          {confirming ? "Confirming..." : `Confirm change · ${money(immediate ? today : 0, quote.currency)} today`}
        </Button>
      </div>
    </div>
  );
}
