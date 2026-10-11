import { SparkBurst } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Mascot } from "../media";
import ResumeMock from "../mocks/ResumeMock";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import SectionHeading from "../SectionHeading";
import { CtaLink } from "./shared";

/**
 * AI resume builder (spec 13.2 item 5): copy left, the three-card builder mock right. Mobile order:
 * heading, mock, CTA, then the laptop mascot with its "One click. Job ready!" note.
 */
export default function Resumes() {
  return (
    <Section id="resumes" labelledBy="resumes-title" tone="sky">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[0.8fr_1.5fr] lg:items-center lg:gap-x-10 lg:gap-y-6">
        <SectionHeading
          id="resumes-title"
          eyebrow="AI Resume Builder"
          family="green"
          caps
          title="Create the perfect resume for every job."
          lede="Kiwiply tailors your resume, cover letter and application answers based on the job description."
          className="lg:self-end"
        />
        <div className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <SparkBurst aria-hidden className="absolute -right-2 -top-6 hidden h-8 w-8 text-v2-violet lg:block" />
          <ResumeMock />
        </div>
        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <CtaLink href={SIGNUP_HREF}>Try Resume Builder</CtaLink>
        </div>
        <div className="flex items-end gap-2 lg:hidden">
          <Mascot pose="laptop" className="-mb-4 h-32 w-32" />
          <Handwritten family="green" className="mb-8 w-40 -rotate-3">
            One click. Job ready!
          </Handwritten>
        </div>
      </div>
    </Section>
  );
}
