import { CurvedArrow, StarDoodle } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import MatchesMock from "../mocks/MatchesMock";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import SectionHeading from "../SectionHeading";
import { CtaLink } from "./shared";

/**
 * Find better opportunities (spec 13.2 item 4): copy left, "Top Job Matches for You" mock right with
 * the man cutout standing on the band's bottom edge and the "Jobs that fit you." note above him.
 * Mobile order: heading, mock, note, cutout, CTA. The cutout and note anchor to the band on lg+
 * (the visual column is not positioned there), so the cutout is flush with the band's bottom.
 */
export default function JobMatches() {
  return (
    <Section id="matches" labelledBy="matches-title" tone="blue">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[0.9fr_1.4fr] lg:gap-x-12 lg:gap-y-6">
        <SectionHeading
          id="matches-title"
          eyebrow="Find Better Opportunities"
          family="green"
          caps
          title="Get personalized job matches."
          lede="Kiwiply finds jobs that match your skills, interests and goals — so you don't have to search endlessly."
          className="lg:self-end"
        />
        <div className="lg:row-span-2 lg:row-start-1 lg:col-start-2 lg:self-center">
          <MatchesMock className="relative z-10 lg:w-[74%]" />
          <Handwritten
            family="blue"
            className="mt-6 text-center lg:absolute lg:right-14 lg:top-6 lg:mt-0 lg:w-40 lg:-rotate-3 lg:text-left"
          >
            Jobs that fit you.
          </Handwritten>
          <CurvedArrow
            direction="down-left"
            aria-hidden
            className="absolute right-[250px] top-[84px] hidden h-10 w-10 text-v2-green lg:block"
          />
          <StarDoodle aria-hidden className="absolute right-[300px] top-8 hidden h-6 w-6 text-v2-amber lg:block" />
          <Photo
            id="hero-individual"
            alt="A job seeker in a green hoodie smiling at his laptop"
            className="z-20 mx-auto mt-2 w-[62%] max-w-[280px] lg:absolute lg:bottom-0 lg:right-6 lg:mt-0 lg:w-[250px] lg:max-w-none"
            sizes="(min-width: 1024px) 250px, 62vw"
            edgeFade={[4, 8]}
          />
        </div>
        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <CtaLink href={SIGNUP_HREF}>Find My Matches</CtaLink>
        </div>
      </div>
    </Section>
  );
}
