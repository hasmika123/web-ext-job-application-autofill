import { CurvedArrow, SparkBurst } from "@kiwiply/ui";
import { Mascot, Photo } from "../media";
import OrgStatsMock from "./OrgStatsMock";
import { Container, Eyebrow, Handwritten, OrgCtas } from "./parts";

/**
 * Block 1: hero. Copy left; stats card, team cutout, mascot and a handwritten note right. The team
 * cutout sits under the stats card, flush with the section's bottom edge.
 */
export default function OrgHero() {
  return (
    <section aria-labelledby="org-hero-title" className="relative overflow-hidden pb-12 pt-10 md:pb-20 md:pt-14">
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-v2-lime/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-v2-blue/20 blur-3xl" />

      <Container className="relative grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-8">
        <div className="flex flex-col items-start gap-6">
          <Eyebrow family="blue">For organizations</Eyebrow>
          <h1 id="org-hero-title" className="text-[36px] leading-[1.04] text-v2-navy md:text-[44px] lg:text-[56px] xl:text-[60px]">
            Support your people&apos;s
            <br />
            <span className="text-v2-blue">job search</span>
            <br />
            at scale.
          </h1>
          <p className="max-w-[520px] text-base leading-relaxed text-v2-ink-soft md:text-lg">
            Consultancies and teams: manage every consultant&apos;s search, assign a marketer, track progress and prepare
            applications they approve and submit, all in one place.
          </p>
          <OrgCtas className="w-full" />
        </div>

        <div className="relative -mb-12 md:-mb-20">
          <Handwritten className="mb-3 block text-center lg:absolute lg:-top-6 lg:right-2 lg:z-10 lg:mb-0 lg:w-36 lg:rotate-6 lg:text-left">
            Brighter futures for your team.
          </Handwritten>
          <SparkBurst
            aria-hidden
            className="absolute -top-2 left-0 hidden h-9 w-9 text-v2-lime-deep lg:block"
          />
          <CurvedArrow
            direction="down-left"
            aria-hidden
            className="absolute right-4 top-12 z-10 hidden h-12 w-12 text-v2-blue lg:block"
          />

          <OrgStatsMock className="relative z-10 lg:absolute lg:left-4 lg:right-12 lg:top-6" />

          <div className="relative mt-4 lg:mt-0 lg:pt-72">
            <Photo
              id="org-team"
              alt="Three colleagues smiling at their laptops together"
              className="mx-auto w-full max-w-[600px]"
              sizes="(min-width: 1024px) 600px, 100vw"
              edgeFade={[8, 4]}
              priority
            />
            <Mascot pose="headphones" className="absolute bottom-0 right-0 z-10 h-28 w-28 md:h-36 md:w-36 lg:h-40 lg:w-40" />
          </div>
        </div>
      </Container>
    </section>
  );
}
