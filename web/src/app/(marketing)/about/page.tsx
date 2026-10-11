import type { Metadata } from "next";
import AboutHero from "@/components/marketing/about/AboutHero";
import ValuesStrip from "@/components/marketing/about/ValuesStrip";
import Mission from "@/components/marketing/about/Mission";
import WhoWeServe from "@/components/marketing/about/WhoWeServe";
import Different from "@/components/marketing/about/Different";
import Guides from "@/components/marketing/about/Guides";
import OurPromise from "@/components/marketing/about/OurPromise";
import Story from "@/components/marketing/about/Story";
import Testimonials from "@/components/marketing/about/Testimonials";
import AboutCta from "@/components/marketing/about/AboutCta";

export const metadata: Metadata = {
  title: "About Kiwiply",
  description:
    "Kiwiply was created to make job searching simpler, faster, and more personal, using AI to match you with the right opportunities and help you every step of the way.",
  alternates: { canonical: "/about" },
};

/** /about (landing v2, exact-board mode: spec section 13.5). Static server components. */
export default function AboutPage() {
  return (
    <main>
      <AboutHero />
      <ValuesStrip />
      <Mission />
      <WhoWeServe />
      <Different />
      <Guides />
      <OurPromise />
      <Story />
      <Testimonials />
      <AboutCta />
    </main>
  );
}
