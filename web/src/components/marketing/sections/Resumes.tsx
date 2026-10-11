import { SparkBurst } from "@kiwiply/ui";
import ResumeMock from "../mocks/ResumeMock";
import Section from "../Section";
import SectionHeading from "../SectionHeading";

/**
 * Resumes (spec 7.2 item 6): copy left, ResumeMock right. No "builder" and no "cover letter":
 * those are not shipped yet.
 */
export default function Resumes() {
  return (
    <Section id="resumes" labelledBy="resumes-title">
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <SectionHeading
          id="resumes-title"
          eyebrow="Resumes that fit the job"
          family="pink"
          title="The right resume for"
          accent="every application."
          lede="Keep tailored variants. Kiwiply picks the best one per posting, shows what the ATS will miss, and remembers which one you sent where."
        />
        <div className="relative">
          <SparkBurst aria-hidden className="absolute -right-2 -top-8 hidden h-10 w-10 text-v2-pink sm:block" />
          <ResumeMock className="relative z-10" />
        </div>
      </div>
    </Section>
  );
}
