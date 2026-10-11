import type { Metadata } from "next";
import AboutHero from "@/components/marketing/about/AboutHero";
import ValuesStrip from "@/components/marketing/about/ValuesStrip";
import Mission from "@/components/marketing/about/Mission";
import WhoWeServe from "@/components/marketing/about/WhoWeServe";
import Different from "@/components/marketing/about/Different";
import Guides from "@/components/marketing/about/Guides";
import OurPromise from "@/components/marketing/about/OurPromise";
import Story from "@/components/marketing/about/Story";
import AboutCta from "@/components/marketing/about/AboutCta";

export const metadata: Metadata = {
  title: "About Kiwiply",
  description:
    "Kiwiply makes job searching simpler and more human: one profile, AI that does the repetitive parts, and a board that keeps every application in sight, with you making every decision.",
  alternates: { canonical: "/about" },
};

/** /about (landing v2, spec §8). Static server components; shell + theme come from the (marketing) layout. */
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
      <AboutCta />
    </main>
  );
}
