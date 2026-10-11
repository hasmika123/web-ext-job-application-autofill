import { StarDoodle } from "@kiwiply/ui";
import { Photo } from "../media";
import { SIGNUP_HREF } from "../nav";
import { V3Cta, V3Pill, V3SquareCheck } from "./parts";

/**
 * "More opportunities for a brighter you." (phone board, For Individuals): lime-washed panel with
 * the five-point checklist, "Get Started Free" and the smiling-student cutout standing on the
 * panel's bottom edge. md+: copy left, photo right.
 */
const POINTS = [
  "Find better matching jobs",
  "Save hours with AI autofill",
  "Track applications & interviews",
  "Get smart insights and tips",
  "Build a stronger career profile",
];

export default function V3Individuals() {
  return (
    <section id="individuals" aria-labelledby="v3-ind-title" className="scroll-mt-20 overflow-x-clip px-5 py-6 lg:px-8">
      <div className="relative mx-auto max-w-[1100px] overflow-hidden rounded-[28px] bg-gradient-to-br from-v2-lime-soft via-[#F4FCEA] to-white px-6 pt-10 md:px-10 lg:rounded-[32px] lg:px-14 lg:pt-14">
        <div className="grid grid-cols-[minmax(0,1fr)] items-end gap-6 md:grid-cols-2 md:gap-10">
          <div className="flex flex-col items-start pb-2 md:pb-14">
            <V3Pill>For Individuals</V3Pill>
            <h2 id="v3-ind-title" className="mt-4 max-w-md text-[32px] text-v2-navy md:text-[38px]">
              More opportunities for a brighter you.
            </h2>
            <ul className="mt-6 space-y-4">
              {POINTS.map((p) => (
                <V3SquareCheck key={p}>{p}</V3SquareCheck>
              ))}
            </ul>
            <div className="relative mt-7">
              <V3Cta href={SIGNUP_HREF} className="sm:px-7">
                Get Started Free
              </V3Cta>
              <StarDoodle aria-hidden className="absolute -right-14 -top-3 hidden h-10 w-10 text-[#F5C400] sm:block md:-right-12" />
            </div>
          </div>
          <div className="relative -mx-2 md:mx-0">
            <Photo
              id="hero-individual"
              alt="A smiling young man with curly hair working on a laptop with a Kiwiply sticker"
              className="ml-auto w-[78%] max-w-[360px] md:w-full md:max-w-[400px]"
              sizes="(min-width: 768px) 400px, 78vw"
              edgeFade={[4, 4]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
