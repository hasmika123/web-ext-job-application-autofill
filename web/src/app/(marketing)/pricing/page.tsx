import type { Metadata } from "next";
import Link from "next/link";
import { hasSession } from "@/lib/auth";
import { getPlan, PRICE_3MO, PRICE_MONTHLY } from "@/lib/billing";
import { AUTOPILOT, CONSULTANCY, CONSULTANCY_OPS, ORGANIZATION, ORG_PER_PERSON, SERVICES } from "@/lib/catalog";
import { Card, buttonVariants } from "@/components/ui";
import UpgradeButton from "@/components/billing/UpgradeButton";
import OfferCard, { Feature } from "@/components/pricing/OfferCard";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Kiwiply is free to apply with. Pro adds AI resume matching, tailoring and an inbox that updates your board. Autopilot, team plans and expert services too.",
};

/**
 * Public pricing page (Phase 12.3; the full catalog since 15.6).
 *
 * Public on purpose: someone deciding whether to install the extension should be able to see
 * what everything costs without signing up first. Free and Pro are sold by checkout. Everything
 * else is listed in full — scope, limits, price — with "Contact us" until its checkout exists
 * (see `lib/catalog.ts`). A signed-out visitor's Pro CTA sends them to sign up and back here,
 * rather than into a checkout with no account to attach the subscription to.
 */
export default async function PricingPage() {
  const signedIn = await hasSession();
  // Only meaningful when signed in; a signed-out visitor gets the defaults (Free, no billing).
  const plan = signedIn ? await getPlan() : null;
  const alreadyPro = plan?.plan === "PRO";
  const billingLive = plan?.billingEnabled ?? false;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 py-14">
      <header className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Plans and services</h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-muted">
          Applying is free, and stays free. Pro is for when you want the application to work harder than you do.
        </p>
      </header>

      {/* ---- Job seekers ---- */}
      <section aria-labelledby="seekers" className="flex flex-col gap-6">
        <SectionHeading id="seekers" title="For job seekers" />
        <div className="grid items-stretch gap-5 lg:grid-cols-3">
          {/* Free */}
          <Card className="flex h-full flex-col">
            <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-accent-deep">To get started</p>
            <h3 className="mt-1 font-display text-xl font-semibold text-ink">Free</h3>
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
            {!signedIn && (
              <Link href="/signup" className={buttonVariants("ghost", "md", "mt-auto w-full")}>
                Get started free
              </Link>
            )}
          </Card>

          {/* Pro */}
          <Card className="flex h-full flex-col border-2 border-accent">
            <div className="flex items-center justify-between">
              <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-accent-deep">For your search</p>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-deep">Most popular</span>
            </div>
            <h3 className="mt-1 font-display text-xl font-semibold text-ink">Pro</h3>
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
          </Card>

          <OfferCard offer={AUTOPILOT} />
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
      </section>

      {/* ---- Organizations ---- */}
      <section aria-labelledby="orgs" className="flex flex-col gap-6">
        <SectionHeading
          id="orgs"
          title="For organizations"
          lead="A one-time setup fee, then you pay per person for exactly what each person gets."
        />
        <div className="grid items-stretch gap-5 lg:grid-cols-2">
          <OfferCard offer={ORGANIZATION} />
          <Card className="flex h-full flex-col">
            <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-accent-deep">Per person</p>
            <h3 className="mt-1 font-display text-xl font-semibold text-ink">Choose for each person</h3>
            <p className="mt-1 text-sm text-muted">Different people can have different plans. Change them any time.</p>
            <table className="mt-5 w-full border-collapse text-sm">
              <tbody>
                {ORG_PER_PERSON.map((row) => (
                  <tr key={row.item} className="border-b border-line last:border-0">
                    <td className="py-3 pr-3 font-medium text-ink">{row.item}</td>
                    <td className="py-3 pr-3 text-right font-bold text-ink">{row.price}</td>
                    <td className="py-3 text-right text-[13px] text-muted">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-[13px] text-muted">
              Plus the {ORGANIZATION.price} one-time setup fee. Nothing is charged per person until you assign something to them.
            </p>
          </Card>
        </div>
        <div className="grid items-stretch gap-5 lg:grid-cols-2">
          <OfferCard offer={CONSULTANCY} />
          <OfferCard offer={CONSULTANCY_OPS} />
        </div>
      </section>

      {/* ---- Services ---- */}
      <section aria-labelledby="services" className="flex flex-col gap-6">
        <SectionHeading
          id="services"
          title="Expert services"
          lead="One-off help from vetted resume writers, interviewers and coaches. Pro and Autopilot members get 10% off."
        />
        <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <OfferCard key={s.topic} offer={s} compact />
          ))}
        </div>
      </section>

      <section className="text-center">
        <h2 className="font-display text-xl font-semibold text-ink">Not sure what fits?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">Tell us what you&apos;re after and we&apos;ll point you to the right plan.</p>
        <Link href="/contact" className={buttonVariants("primary", "md", "mt-5")}>
          Talk to us
        </Link>
      </section>
    </div>
  );
}

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="text-center">
      <h2 id={id} className="font-display text-2xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {lead && <p className="mx-auto mt-2 max-w-xl text-[14.5px] text-muted">{lead}</p>}
    </div>
  );
}
