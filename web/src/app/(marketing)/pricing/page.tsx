import type { Metadata } from "next";
import { PricingSection, ServicesSection } from "@/components/pricing/PricingSections";
import CatalogPricing from "@/components/pricing/CatalogPricing";
import { hasSellablePlan, fetchPublicCatalog } from "@/lib/subscription/catalog";
import { hasSession } from "@/lib/auth";
import { getPlan } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Kiwiply is free for autofill and tracking. Upgrade to Pro or Autopilot for AI help, or book one-off expert services.",
};

/**
 * /pricing: every plan (`#pricing`) and expert service (`#services`), each card opening a
 * "What's included" pop-up. The plan cards are generated from the public catalog (`GET /api/catalog/public`,
 * K5.1): interval tabs, add-on rows, totals from the API. When the catalog has no sellable plan (nothing
 * published yet, or the API is unreachable and nothing was cached) the page shows today's static cards, so it
 * is never blank. Stripe's cancel URL, the extension's upgrade links, emails and bookmarks keep pointing here.
 * The visitor's plan is read only to label the buttons (already on a plan / payments not open yet / checkout).
 */
export default async function PricingPage() {
  const signedIn = await hasSession();
  // Only meaningful when signed in; a signed-out visitor gets the defaults (Free, no billing).
  const [plan, catalog] = await Promise.all([signedIn ? getPlan() : Promise.resolve(null), fetchPublicCatalog()]);
  const alreadyPro = plan?.plan === "PRO";
  const billingLive = plan?.billingEnabled ?? false;

  return (
    <main>
      <header className="mx-auto max-w-6xl px-6 pb-8 pt-14 text-center sm:pt-20">
        <h1 className="text-[34px] text-v2-navy sm:text-[44px]">Pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-v2-ink-soft sm:text-[17px]">
          Simple plans for job seekers and teams, plus one-off help from vetted experts.
        </p>
      </header>
      {hasSellablePlan(catalog) ? (
        <CatalogPricing
          catalog={catalog}
          signedIn={signedIn}
          billingLive={billingLive}
          currentPlanKey={alreadyPro ? (plan?.planKey ?? "PRO") : null}
          onPaidPlan={alreadyPro}
        />
      ) : (
        <PricingSection signedIn={signedIn} alreadyPro={alreadyPro} billingLive={billingLive} />
      )}
      <ServicesSection />
    </main>
  );
}
