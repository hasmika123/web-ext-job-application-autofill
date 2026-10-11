import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CurvedArrow, SparkBurst, buttonVariants } from "@kiwiply/ui";
import Handwritten from "./Handwritten";
import { SIGNUP_HREF } from "./nav";

/**
 * Closing call-to-action (spec 13.2 item 12), rebuilt to its board (design/landing-v2/
 * section-final-cta.webp): a full-bleed band (~300px tall on desktop) over the whole illustrated
 * campus scene (`/v2/cta-backdrop-2.jpg`, text and mascot already painted out), with only a very
 * soft white glow behind the copy. Copy left (about 18% in), the mascot at its laptop standing on
 * the band's bottom edge, and the navy "Same goals. Bigger possibilities." note to its right with
 * a green spark and swoosh. From md everything scales with the band (the right cell is a size
 * container); on phones: copy, buttons, then the mascot and note over the backdrop.
 */
export default function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="relative overflow-hidden">
      <Image
        src="/v2/cta-backdrop-2.jpg"
        alt=""
        fill
        sizes="100vw"
        className="pointer-events-none select-none object-cover object-bottom"
      />

      <div className="relative mx-auto grid max-w-[1200px] gap-4 px-5 pt-12 md:min-h-[clamp(240px,24vw,300px)] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-2 md:pb-0 md:pl-[clamp(20px,6vw,100px)] md:pt-0 lg:px-8 lg:pl-[clamp(32px,7vw,110px)]">
        <div className="relative flex flex-col items-start gap-3 pb-6 md:py-8 lg:gap-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-10 -inset-y-6 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.7),rgba(255,255,255,0)_70%)]"
          />
          <h2 id="final-cta-title" className="max-w-md text-[30px] font-extrabold text-v2-navy md:text-[clamp(24px,2.9vw,40px)] md:leading-[1.1]">
            Your next opportunity <br className="hidden md:block" />
            is waiting.
          </h2>
          <p className="max-w-md text-base leading-relaxed text-v2-ink-soft md:text-[clamp(13px,1.2vw,17px)]">
            Build one profile, apply with less busywork, and keep every application in sight.
          </p>
          <div className="mt-1 flex flex-row flex-wrap items-center gap-x-5 gap-y-2">
            <Link href={SIGNUP_HREF} className={buttonVariants("accent", "lg", "min-h-11 md:max-lg:min-h-10 md:max-lg:px-4 md:max-lg:text-sm")}>
              Get Started for Free <ArrowRightIcon size={16} />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center px-1 text-[15px] font-bold text-v2-navy underline-offset-4 hover:underline focus-visible:underline"
            >
              View Pricing
            </Link>
          </div>
        </div>

        {/* Mascot standing on the band's bottom edge + the handwritten note (a size container, so
            both scale with the band from md). */}
        <div className="[container-type:inline-size] md:self-end">
          <div className="relative flex items-end gap-1 md:gap-[2cqw]">
            <Image
              src="/v2/mascot-cta.png"
              alt=""
              aria-hidden
              width={170}
              height={169}
              sizes="170px"
              className="relative z-10 h-auto w-[132px] flex-none drop-shadow-[0_10px_16px_rgba(27,31,94,0.16)] md:w-[clamp(100px,34cqw,170px)]"
            />
            <div aria-hidden className="relative mb-[clamp(36px,10cqw,64px)] pl-4">
              <SparkBurst className="absolute -top-5 left-0 h-[clamp(14px,3.4cqw,20px)] w-[clamp(14px,3.4cqw,20px)] text-v2-green" />
              <Handwritten ink="navy" className="-rotate-[7deg] text-[22px] md:text-[clamp(16px,3.9cqw,26px)]">
                Same goals. <br />
                Bigger possibilities.
              </Handwritten>
              <CurvedArrow direction="down-left" className="absolute -bottom-9 left-0 h-[clamp(22px,5cqw,34px)] w-[clamp(22px,5cqw,34px)] text-v2-green" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
