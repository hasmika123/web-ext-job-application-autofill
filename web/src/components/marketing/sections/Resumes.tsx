import { SparkBurst } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import Handwritten from "../Handwritten";
import { Mascot } from "../media";
import { ResumeBuilderMock, ResumeChecklist } from "../mocks/ResumeMock";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import { CtaLink } from "./shared";

/**
 * AI resume builder (spec 13.2 item 5), rebuilt to its board: a soft green-to-blue wash band.
 * From md: copy (~30%, ~34% from lg) | the tab + document composition (~45%, ~42% from lg, scaled to its column) | the white
 * checklist card (~25%). Below 768: copy, mock, checklist, then the laptop mascot with its note.
 */
export default function Resumes() {
  return (
    <Section id="resumes" labelledBy="resumes-title" tone="wash">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,30fr)_minmax(0,45fr)_minmax(0,25fr)] lg:grid-cols-[minmax(0,34fr)_minmax(0,42fr)_minmax(0,24fr)] md:items-center md:gap-4 lg:gap-6 xl:gap-8">
        <div className="flex flex-col items-start gap-4 lg:gap-5">
          <Eyebrow family="green" className="px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wide">
            AI Resume Builder
          </Eyebrow>
          <h2 id="resumes-title" className="text-[30px] text-v2-navy md:text-[clamp(21px,2.3vw,33px)] md:leading-[1.12] text-balance">
            Create the perfect<br className="hidden lg:inline" />{" "}
            resume for every job.
          </h2>
          <p className="max-w-[340px] text-base leading-relaxed text-v2-ink-soft md:text-[clamp(13px,1.15vw,17px)]">
            Kiwiply tailors your resume, cover letter and application answers based on the job description.
          </p>
          <CtaLink href={SIGNUP_HREF} className="mt-1 md:max-lg:min-h-10 md:max-lg:px-4 md:max-lg:text-sm">
            Try Resume Builder
          </CtaLink>
        </div>

        <div className="relative">
          <SparkBurst aria-hidden className="absolute -right-2 -top-6 z-10 hidden h-8 w-8 text-v2-violet lg:block" />
          <ResumeBuilderMock />
        </div>

        <ResumeChecklist className="w-full" />
      </div>

      <div className="mt-6 flex items-end gap-2 md:hidden">
        <Mascot pose="laptop" className="-mb-4 h-32 w-32" />
        <Handwritten family="green" className="mb-8 w-40 -rotate-3">
          One click. Job ready!
        </Handwritten>
      </div>
    </Section>
  );
}
