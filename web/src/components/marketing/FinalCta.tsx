import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CurvedArrow, StarDoodle } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import Handwritten from "./Handwritten";
import { Mascot } from "./media";
import { SIGNUP_HREF } from "./nav";

/**
 * Closing call-to-action (spec 13.2 item 12): full-bleed, standing on the board's illustrated campus
 * band (`/v2/cta-backdrop.jpg`). The board crop had its own copy baked in, so the file is a cleaned
 * composite (trees and buildings only, on the canvas colour, fading in from the top); it hangs on
 * the section's bottom edge. Copy left, the laptop mascot in the middle, the handwritten note
 * right. Mobile: copy, buttons, then the mascot beside the note (the mobile board's wording).
 */
export default function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="relative overflow-hidden">
      <Image
        src="/v2/cta-backdrop.jpg"
        alt=""
        width={1920}
        height={198}
        sizes="100vw"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full select-none object-cover object-center sm:h-auto"
      />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-6 px-5 pb-12 pt-14 lg:grid-cols-[minmax(0,520px)_230px_1fr] lg:gap-6 lg:px-8 lg:pb-16 lg:pt-20">
        <div className="flex flex-col items-start gap-4">
          <h2 id="final-cta-title" className="max-w-md text-[30px] text-v2-navy md:text-4xl lg:text-[40px]">
            Your next opportunity is waiting.
          </h2>
          <p className="max-w-md text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
            Join thousands of students and professionals who are building brighter futures with Kiwiply.
          </p>
          <div className="mt-2 flex flex-row flex-wrap items-center gap-3">
            <Link href={SIGNUP_HREF} className={buttonVariants("accent", "lg", "min-h-11")}>
              Get Started for Free <ArrowRightIcon size={16} />
            </Link>
            <Link href="/pricing" className={buttonVariants("ghost", "lg", "min-h-11 border-transparent bg-transparent shadow-none")}>
              View Pricing
            </Link>
          </div>
        </div>

        <Mascot pose="laptop" className="hidden h-[210px] w-[200px] justify-self-center lg:block" />
        <div aria-hidden className="relative hidden h-40 lg:block">
          <Handwritten family="green" className="absolute left-0 top-6 w-52 -rotate-3 text-[26px]">
            Same goals. Bigger possibilities.
          </Handwritten>
          <CurvedArrow direction="down-left" className="absolute left-1 top-[104px] h-9 w-9 text-v2-green" />
          <StarDoodle className="absolute left-0 top-0 h-5 w-5 text-v2-lime-deep" />
        </div>

        <div className="flex items-end gap-2 lg:hidden">
          <Mascot pose="laptop" className="h-32 w-32" />
          <Handwritten family="blue" className="mb-6 w-40 -rotate-3">
            More opportunities for a brighter you.
          </Handwritten>
        </div>
      </div>
    </section>
  );
}
