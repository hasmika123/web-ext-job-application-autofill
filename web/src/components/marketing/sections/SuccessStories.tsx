import Eyebrow from "../Eyebrow";
import { TESTIMONIALS } from "../placeholder-data";
import Section from "../Section";
import TestimonialCarousel from "./TestimonialCarousel";

/** Success stories (spec 13.2 item 11): centred heading over the three-card carousel. */
export default function SuccessStories() {
  return (
    <Section labelledBy="stories-title" className="pb-14 pt-8 lg:pb-20 lg:pt-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Eyebrow family="blue" className="px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wide">
          Success Stories
        </Eyebrow>
        <h2 id="stories-title" className="text-[28px] text-v2-navy md:text-4xl lg:text-[36px]">
          Real People. Real Opportunities.
        </h2>
        <p className="max-w-xl text-[15px] leading-relaxed text-v2-ink-soft">
          See how Kiwiply has helped students and professionals land their dream jobs.
        </p>
      </div>
      <div className="mt-8">
        <TestimonialCarousel items={TESTIMONIALS} />
      </div>
    </Section>
  );
}
