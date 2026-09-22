import Link from "next/link";
import { PRICE_3MO, PRICE_MONTHLY, type Plan } from "@/lib/billing";
import { formatDate } from "@/lib/dates";
import LocalDate from "@/components/LocalDate";
import ManageBillingButton from "@/components/billing/ManageBillingButton";
import UpgradeButton from "@/components/billing/UpgradeButton";

/**
 * The Billing section of Settings (Phase 12.3) — plan, what happens next, and the two actions.
 *
 * Deliberately states the auto-renew terms and the refund policy inline rather than only in the
 * ToS: a renewal or a no-refund rule a user discovers after the fact is what produces
 * chargebacks, and the FTC's negative-option rule expects the terms next to the action. The link
 * to /terms#billing (12.6) is the durable version of the same facts, not a substitute for saying
 * them here.
 */
export default function BillingCard({ plan }: { plan: Plan }) {
  const isPro = plan.plan === "PRO";
  // Validity only — the date itself is rendered by <LocalDate>, in the viewer's time zone. The
  // server can't know it, and the box's UTC would put a 02:53 UTC renewal on the wrong day.
  const ends = formatDate(plan.currentPeriodEnd, {}) ? plan.currentPeriodEnd : null;

  if (!plan.billingEnabled) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-deep">Free plan</span>
          <span className="text-sm text-muted">Unlimited autofill, resume parsing &amp; tracker. Pro is coming soon.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-deep">
            {isPro ? "Pro" : "Free plan"}
          </span>
          {isPro ? (
            <span className="text-sm text-muted">
              {plan.cancelAtPeriodEnd ? (
                <>Cancels on {ends ? <LocalDate iso={ends} /> : "the end of the period"} — you keep Pro until then.</>
              ) : plan.status === "canceled" ? (
                // Cancelled outright (not at period end): Stripe says `canceled` with
                // cancelAtPeriodEnd false, and the grace rule keeps Pro until the paid-for period
                // ends. This used to fall through to "Renews on …" — for a subscription that
                // will never renew (pre-launch review, 2026-09-22).
                <>Cancelled — you keep Pro until {ends ? <LocalDate iso={ends} /> : "the end of the period"}.</>
              ) : ends ? (
                <>
                  Renews on <LocalDate iso={ends} />.
                </>
              ) : (
                "Active."
              )}
            </span>
          ) : (
            <span className="text-sm text-muted">Unlimited autofill, resume parsing &amp; tracker.</span>
          )}
        </div>
        {isPro ? <ManageBillingButton /> : <UpgradeButton plan="monthly" />}
      </div>

      {/* A failed charge is recoverable and the user is the only one who can fix it — so say so
          plainly, and reassure them nothing has been switched off yet. */}
      {plan.status === "past_due" ? (
        <p className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-[12.5px] text-ink-soft">
          Your last payment didn&apos;t go through. You still have Pro while we retry — updating your card in{" "}
          <strong>Manage billing</strong> is the quickest fix.
        </p>
      ) : null}

      {!isPro ? (
        <p className="text-[12.5px] text-muted">
          Pro is {PRICE_MONTHLY}/month, or {PRICE_3MO} every 3 months. Renews until you cancel; cancel any time from here
          and it takes effect at the end of the period. No refunds for partial periods. See{" "}
          <Link href="/pricing" className="font-medium text-accent-deep hover:underline">
            what&apos;s included
          </Link>{" "}
          or the{" "}
          <Link href="/terms#billing" className="font-medium text-accent-deep hover:underline">
            billing terms
          </Link>
          .
        </p>
      ) : (
        <p className="text-[12.5px] text-muted">
          Renews automatically until you cancel. Cancelling takes effect at the end of the period you&apos;ve paid for;
          we don&apos;t refund partial periods. Full{" "}
          <Link href="/terms#billing" className="font-medium text-accent-deep hover:underline">
            billing terms
          </Link>
          .
        </p>
      )}
    </div>
  );
}
