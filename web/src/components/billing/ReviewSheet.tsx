"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import ResponsiveSheet from "@/components/billing/ResponsiveSheet";
import QuoteSummary from "@/components/billing/QuoteSummary";
import { createQuote, startQuoteCheckout } from "@/lib/subscription/client";
import { TAX_NOTE, chargeSentence, clockTime, intervalSuffix, money, problemCopy } from "@/lib/subscription/copy";
import type { Interval, PlanQuote } from "@/lib/subscription/types";

export type CheckoutBasket = { planKey: string; interval: Interval; addons: { featureKey: string; quantity: number }[] };

type Phase = "loading" | "ready" | "error" | "redirecting";

/**
 * The review sheet of a new subscription (docs/subscriptions/05-customer-ux.md section 3): the line items of a CHECKOUT quote, the consent sentence
 * from settings, the price with its date, and "Continue to payment", which sends the person to Stripe Checkout built from the very same quote.
 *
 * Errors follow the registry: QUOTE_STALE and QUOTE_EXPIRED re-quote (the new total is shown and the button works again), ALREADY_SUBSCRIBED points to
 * My plan, BILLING_DISABLED says payments are not open. Nothing here adds a price: the sheet shows the quote's own fields.
 */
export default function ReviewSheet({
  open,
  basket,
  planName,
  consentText,
  onClose,
}: {
  open: boolean;
  basket: CheckoutBasket;
  planName: string;
  consentText?: string | null;
  onClose: () => void;
}) {
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<{ code?: string; text: string } | null>(null);
  const [confirmedDeps, setConfirmedDeps] = useState<string[]>([]);
  const seq = useRef(0);
  // the basket is compared by value: a parent that rebuilds the array each render must not re-quote in a loop
  const addonsKey = JSON.stringify(basket.addons);

  const requote = useCallback(
    async (deps: string[], keepNotice = false) => {
      const mine = ++seq.current;
      setPhase("loading");
      if (!keepNotice) setNotice(null);
      setError(null);
      const addons = JSON.parse(addonsKey) as CheckoutBasket["addons"];
      const res = await createQuote({ kind: "CHECKOUT", planKey: basket.planKey, interval: basket.interval, addons, confirmedCommercialDeps: deps });
      if (mine !== seq.current) return;
      if (res.ok) {
        setQuote(res.data);
        setPhase("ready");
      } else {
        setError({ code: res.problem.code, text: problemCopy(res.problem.code, { max: res.problem.max }) });
        setPhase("error");
      }
    },
    [basket.planKey, basket.interval, addonsKey],
  );

  useEffect(() => {
    if (!open) return;
    // the parent mounts this sheet per open, so the confirmations start empty
    const timer = setTimeout(() => void requote([]), 0);
    const counter = seq;
    return () => {
      clearTimeout(timer);
      counter.current++;
    };
  }, [open, requote]);

  async function proceed() {
    if (!quote) return;
    setPhase("redirecting");
    setError(null);
    const res = await startQuoteCheckout(quote.quoteId, "/settings/plan");
    if (res.ok && res.data.url) {
      window.location.href = res.data.url; // hand off to Stripe's hosted page
      return;
    }
    const code = res.ok ? undefined : res.problem.code;
    if (code === "QUOTE_STALE" || code === "QUOTE_EXPIRED") {
      setNotice(problemCopy(code));
      await requote(confirmedDeps, true);
      return;
    }
    setError({ code, text: problemCopy(code) });
    setPhase("error");
  }

  const dep = quote?.requiresConfirmation?.[0];
  const needsDep = !!dep;
  const ready = phase === "ready" && !!quote && !needsDep;
  const today = quote?.nextInvoiceEstimateMinor ?? quote?.proposed.recurringMinor;

  const footer = (
    <div className="flex w-full flex-col gap-2">
      <Button variant="accent" className="w-full" disabled={!ready} onClick={proceed}>
        {phase === "redirecting" ? "Opening payment..." : quote ? `Continue to payment - ${money(today, quote.currency)} today` : "Continue to payment"}
      </Button>
      <Button variant="ghost" className="w-full" onClick={onClose}>
        Back
      </Button>
    </div>
  );

  return (
    <ResponsiveSheet open={open} onClose={onClose} id="checkout-review" title={`${planName} - ${basket.interval === "MONTH" ? "monthly" : basket.interval === "QUARTER" ? "every 3 months" : "yearly"}`} footer={footer}>
      <div className="flex flex-col gap-4" data-testid="review-sheet">
        {notice ? (
          <p role="status" className="rounded-lg bg-paper-2 px-3 py-2 text-[13px] text-ink-soft">
            {notice}
          </p>
        ) : null}

        {phase === "loading" && !quote ? (
          <p className="text-sm text-muted" role="status">
            Getting your price...
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-[13px] text-danger-text">
            <p>{error.text}</p>
            {error.code === "ALREADY_SUBSCRIBED" ? (
              <Link href="/settings/plan" className="mt-1 inline-block font-semibold text-accent-deep hover:underline">
                Open My plan
              </Link>
            ) : null}
          </div>
        ) : null}

        {quote && phase !== "error" ? (
          <>
            <QuoteSummary quote={quote} totalSuffix={intervalSuffix(quote.interval)} />
            {dep ? (
              <div className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-[13px] text-ink-soft" data-testid="dependency-prompt">
                <p>
                  One of your add-ons also needs {dep.name}, which is {money(dep.priceMinor, quote.currency)}
                  {intervalSuffix(quote.interval)} more.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    const next = [...confirmedDeps, dep.requires];
                    setConfirmedDeps(next);
                    void requote(next);
                  }}
                >
                  Add {dep.name}
                </Button>
              </div>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-muted" data-testid="charge-sentence">
                {chargeSentence({
                  todayMinor: today ?? quote.proposed.recurringMinor,
                  recurringMinor: quote.proposed.recurringMinor,
                  currency: quote.currency,
                  interval: quote.interval,
                  nextAt: quote.nextInvoiceAt,
                })}{" "}
                {quote.taxNote ?? TAX_NOTE}
              </p>
            )}
            {consentText ? <p className="text-[12px] leading-relaxed text-muted">{consentText}</p> : null}
            <p className="text-[12px] text-muted" aria-live="polite">
              price valid {clockTime(quote.expiresAt)}
            </p>
          </>
        ) : null}
      </div>
    </ResponsiveSheet>
  );
}
