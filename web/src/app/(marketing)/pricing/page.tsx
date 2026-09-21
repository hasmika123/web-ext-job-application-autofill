import type { Metadata } from "next";
import Link from "next/link";
import { hasSession } from "@/lib/auth";
import { getPlan, PRICE_3MO, PRICE_MONTHLY } from "@/lib/billing";
import UpgradeButton from "@/components/billing/UpgradeButton";

export const metadata: Metadata = {
  title: "Pricing — Kiwiply",
  description: "Kiwiply is free to apply with. Pro adds AI resume matching, tailoring and an inbox that updates your board.",
};

/**
 * Public pricing page (Phase 12.3).
 *
 * Public on purpose: someone deciding whether to install the extension should be able to see
 * what Pro costs without signing up first. A signed-out visitor's CTA sends them to sign up and
 * back here, rather than into a checkout with no account to attach the subscription to.
 */
export default async function PricingPage() {
  const signedIn = await hasSession();
  // Only meaningful when signed in; a signed-out visitor gets the defaults (Free, no billing).
  const plan = signedIn ? await getPlan() : null;
  const alreadyPro = plan?.plan === "PRO";
  const billingLive = plan?.billingEnabled ?? false;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-5 py-14">
      <header className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Simple pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-muted">
          Applying is free, and stays free. Pro is for when you want the application to work harder than you do.
        </p>
      </header>

      <div className="grid items-start gap-5 md:grid-cols-2">
        {/* Free */}
        <section className="rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[var(--shadow)]">
          <h2 className="font-display text-xl font-semibold text-ink">Free</h2>
          <p className="mt-1 text-3xl font-bold tracking-tight text-ink">$0</p>
          <p className="mt-1 text-sm text-muted">Everything you need to apply.</p>
          <ul className="mt-5 flex flex-col gap-2.5 text-sm text-ink-soft">
            <Feature>Autofill on every supported job site</Feature>
            <Feature>Review every field before it&apos;s filled — nothing is ever submitted for you</Feature>
            <Feature>Application tracker, auto-logged as you apply</Feature>
            <Feature>Resume upload with AI parsing</Feature>
            <Feature>3 saved resumes</Feature>
            <Feature>Bring your own AI key for drafting</Feature>
          </ul>
        </section>

        {/* Pro */}
        <section className="rounded-[var(--radius-lg)] border-2 border-accent bg-paper p-6 shadow-[var(--shadow)]">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">Pro</h2>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-deep">Most popular</span>
          </div>
          <p className="mt-1 text-3xl font-bold tracking-tight text-ink">
            {PRICE_MONTHLY}
            <span className="text-base font-medium text-muted">/month</span>
          </p>
          <p className="mt-1 text-sm text-muted">or {PRICE_3MO} every 3 months — most searches take about that long.</p>
          <ul className="mt-5 flex flex-col gap-2.5 text-sm text-ink-soft">
            <Feature>Everything in Free</Feature>
            <Feature>Kiwiply AI for autofill — no API key needed</Feature>
            <Feature>Resume recommendation: which of your resumes fits this job</Feature>
            <Feature>Job-fit panel and ATS resume score</Feature>
            <Feature>Resume tailoring to the job description</Feature>
            <Feature>Inbox tracking — your board updates itself as replies arrive</Feature>
            <Feature>Unlimited resumes and cross-device answer sync</Feature>
          </ul>

          <div className="mt-6 flex flex-col gap-3">
            {alreadyPro ? (
              <p className="text-sm font-medium text-accent-deep">You&apos;re on Pro. Manage it in Settings › Billing.</p>
            ) : !signedIn ? (
              <UpgradeButton plan="monthly" signedOut label="Get started" />
            ) : !billingLive ? (
              <p className="text-sm text-muted">Payments aren&apos;t switched on yet — check back shortly.</p>
            ) : (
              <>
                <UpgradeButton plan="monthly" label={`Go Pro — ${PRICE_MONTHLY}/month`} />
                <UpgradeButton plan="3mo" variant="ghost" label={`Or ${PRICE_3MO} every 3 months`} />
              </>
            )}
          </div>
        </section>
      </div>

      {/* Stated here, next to the button, not only in the ToS — the FTC's negative-option rule
          expects renewal and cancellation terms where the user actually decides. */}
      <p className="mx-auto max-w-2xl text-center text-[12.5px] text-muted">
        Pro renews automatically — monthly, or every 3 months — until you cancel. Cancel any time from Settings › Billing;
        it takes effect at the end of the period you&apos;ve paid for, and you keep Pro until then. We don&apos;t refund
        partial periods. See the{" "}
        <Link href="/terms#billing" className="font-medium text-accent-deep hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-medium text-accent-deep hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </li>
  );
}
