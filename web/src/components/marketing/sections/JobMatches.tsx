import Link from "next/link";
import { ArrowRightIcon, CurvedArrow } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import Handwritten from "../Handwritten";
import MatchesMock from "../mocks/MatchesMock";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import SectionHeading from "../SectionHeading";

/** Job matches (spec 7.2 item 5): mock on the left, copy on the right (alternating side). */
export default function JobMatches() {
  return (
    <Section id="matches" labelledBy="matches-title">
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="relative order-2 lg:order-1 lg:pt-16">
          <Handwritten
            family="blue"
            className="mb-4 text-center lg:absolute lg:right-10 lg:top-0 lg:z-20 lg:mb-0 lg:w-56 lg:-rotate-3 lg:text-left"
          >
            Jobs that fit you.
          </Handwritten>
          <CurvedArrow
            direction="down-left"
            aria-hidden
            className="absolute right-0 top-10 z-20 hidden h-10 w-10 text-v2-blue lg:block"
          />
          <MatchesMock className="relative z-10" />
        </div>
        <div className="order-1 flex flex-col items-start gap-6 lg:order-2">
          <SectionHeading
            id="matches-title"
            eyebrow="Find better opportunities"
            family="blue"
            title="Get personalised"
            accent="job matches."
            lede="Fresh roles from company job boards, scored against your resume and preferences overnight. Free gets three a day; Pro gets the full ranked list."
          />
          <Link href={SIGNUP_HREF} className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
            Find my matches <ArrowRightIcon size={16} />
          </Link>
        </div>
      </div>
    </Section>
  );
}
