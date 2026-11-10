import { StarDoodle } from "@kiwiply/ui";
import { V3_STORIES } from "./placeholder-data";
import V3StoryCarousel from "./V3StoryCarousel";

/** "Real stories, real progress." (phone board): heading + lede over the dotted carousel. */
export default function V3Stories() {
  return (
    <section aria-labelledby="v3-stories-title" className="relative overflow-x-clip px-5 py-12 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-[1100px]">
        <div className="relative">
          <h2 id="v3-stories-title" className="max-w-md text-[32px] text-v2-navy md:text-[38px]">
            Real stories, real progress.
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-v2-ink-soft md:text-[16px]">
            Students, new grads and young professionals are landing more interviews with Kiwiply.
          </p>
          <StarDoodle aria-hidden className="absolute right-0 top-0 h-7 w-7 text-[#F5C400]" />
        </div>
        <div className="mt-8">
          <V3StoryCarousel items={V3_STORIES} />
        </div>
      </div>
    </section>
  );
}
