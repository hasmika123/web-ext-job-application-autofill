import HeroArt from "@/components/marketing/HeroArt";
import HeroCarousel from "@/components/marketing/HeroCarousel";
import { HERO_SLIDES } from "@/components/marketing/hero-slides";
import FinalCta from "@/components/marketing/FinalCta";
import Dashboard from "@/components/marketing/sections/Dashboard";
import ForIndividuals from "@/components/marketing/sections/ForIndividuals";
import ForOrganizations from "@/components/marketing/sections/ForOrganizations";
import HowItWorks from "@/components/marketing/sections/HowItWorks";
import InboxTracking from "@/components/marketing/sections/InboxTracking";
import JobMatches from "@/components/marketing/sections/JobMatches";
import Pillars from "@/components/marketing/sections/Pillars";
import Resumes from "@/components/marketing/sections/Resumes";
import TrustStrip from "@/components/marketing/TrustStrip";
import { PricingSection, ServicesSection } from "@/components/pricing/PricingSections";
import { hasSession } from "@/lib/auth";
import { getPlan } from "@/lib/billing";

/**
 * Marketing landing (v2, spec web/LANDING-V2-SPEC.md section 7). Order: hero carousel (V2.2) and
 * ATS trust strip, then the page body (V2.3): pillars, inbox tracking, job matches, resumes,
 * dashboard, how it works, for individuals, for organisations; then the full Pricing and
 * Services sections (every plan and service, each with a details pop-up - there is no separate
 * pricing page) and the final call to action. Header + footer come from the `(marketing)`
 * layout. The visitor's plan is read only to label Pro's button (already on Pro / payments not
 * open yet / checkout). There is deliberately no stats or testimonials section (spec section 1).
 */

export default async function Home() {
  const signedIn = await hasSession();
  // Only meaningful when signed in; a signed-out visitor gets the defaults (Free, no billing).
  const plan = signedIn ? await getPlan() : null;
  const alreadyPro = plan?.plan === "PRO";
  const billingLive = plan?.billingEnabled ?? false;

  return (
    <>
      {/* Hero carousel (V2.2) + trust strip. Slide art is rendered here on the server (Photo and
          Mascot read the filesystem) and handed to the client carousel as nodes. */}
      <HeroCarousel
        slides={HERO_SLIDES.map((slide, i) => ({
          id: slide.id,
          title: slide.title,
          eyebrow: slide.eyebrow,
          family: slide.family,
          headline: slide.headline,
          lede: slide.lede,
          ticks: slide.ticks,
          cta: slide.cta,
          art: <HeroArt slide={slide} priority={i === 0} />,
        }))}
      />
      <TrustStrip />

      <Pillars />
      <InboxTracking />
      <JobMatches />
      <Resumes />
      <Dashboard />
      <HowItWorks />
      <ForIndividuals />
      <ForOrganizations />

      {/* Pricing (Free · Pro · Autopilot · Consultancy) and Services — each card opens a pop-up with
          the full breakdown. This replaced the separate /pricing page, which now redirects here. */}
      <PricingSection signedIn={signedIn} alreadyPro={alreadyPro} billingLive={billingLive} />
      <ServicesSection />
      <FinalCta />
    </>
  );
}
