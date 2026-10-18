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
import Stats from "@/components/marketing/sections/Stats";
import SuccessStories from "@/components/marketing/sections/SuccessStories";
import TrustStrip from "@/components/marketing/TrustStrip";

/**
 * Marketing landing (v2, exact-board mode, spec web/LANDING-V2-SPEC.md section 13). Order: hero
 * carousel and trust strip, then pillars, track applications, find opportunities, AI resume builder,
 * dashboard, how it works, for individuals, for organizations, stats, success stories and the final
 * call to action. Pricing and Services live on /pricing. Header + footer come from the
 * `(marketing)` layout.
 */

export default function Home() {
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
      <Stats />
      <SuccessStories />
      <FinalCta />
    </>
  );
}
