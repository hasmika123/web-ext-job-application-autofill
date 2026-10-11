import type { Metadata } from "next";
import { PricingSection, ServicesSection } from "@/components/pricing/PricingSections";
import { hasSession } from "@/lib/auth";
import { getPlan } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Kiwiply is free for autofill and tracking. Upgrade to Pro or Autopilot for AI help, or book one-off expert services.",
};

/**
 * /pricing: every plan (`#pricing`) and expert service (`#services`), each card opening a
 * "What's included" pop-up. This page was a redirect to the landing page for a while; the v2
 * landing has no pricing, so it is a real page again. Stripe's cancel URL, the extension's upgrade
 * links, emails and bookmarks keep pointing here. The visitor's plan is read only to label Pro's
 * button (already on Pro / payments not open yet / checkout).
 */
export default async function PricingPage() {
  const signedIn = await hasSession();
  // Only meaningful when signed in; a signed-out visitor gets the defaults (Free, no billing).
  const plan = signedIn ? await getPlan() : null;
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
      <PricingSection signedIn={signedIn} alreadyPro={alreadyPro} billingLive={billingLive} />
      <ServicesSection />
    </main>
  );
}
