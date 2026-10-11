import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CurvedArrow, SparkBurst, buttonVariants } from "@kiwiply/ui";
import Handwritten from "./Handwritten";
import { SIGNUP_HREF } from "./nav";

/**
 * Closing call-to-action (spec 13.2 item 12), sized to its board (design/landing-v2/
 * section-final-cta.webp): a wide, SHORT illustrated campus strip. From md the band is
 * `clamp(170px, 14.5vw, 230px)` tall, so the 2400x279 backdrop (`/v2/cta-backdrop-2.jpg`, real
 * scenery at both edges, pale gradient in the middle) barely needs cropping and the trees stay
 * visible. A 60px white fade at the top blends it into the page; the bottom edge is kept (the
 * footer follows). Copy sits left, the mascot centre-right at its laptop (flush with the band's
 * bottom, 78% of its height) and the handwritten note to its right. On phones the band is auto
 * height: copy, buttons, then mascot + note, over a short strip of the backdrop.
 */
export default function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="relative overflow-hidden bg-gradient-to-b from-white to-[#F2F4F1] md:h-[clamp(170px,14.5vw,230px)]">
      {/* Backdrop at its natural aspect (no crop, so the trees at both edges stay visible),
          anchored to the band's bottom; the pale band background above it matches the image's
          top row and the image's own top 28% is masked so tree tops fade out instead of ending
          in a hard line. Nudged 0.75% left / 4.3% down so the source file's thin dark frame
          (17px left, ~5px right, ~12px bottom) falls outside the band. */}
      <div aria-hidden className="pointer-events-none absolute -left-[0.75%] -right-[0.25%] bottom-0">
        <Image
          src="/v2/cta-backdrop-2.jpg"
          alt=""
          width={2400}
          height={279}
          sizes="100vw"
          className="block h-[110px] w-full translate-y-[4.3%] select-none object-cover object-left [mask-image:linear-gradient(to_bottom,transparent,black_28%)] md:h-auto"
        />
      </div>
      {/* Top fade: the band melts into the page above (nothing at the bottom). */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[60px] bg-gradient-to-b from-white to-transparent" />

      <div className="relative mx-auto flex h-full max-w-[1200px] flex-col gap-3 px-5 pt-10 md:block md:px-0 md:pt-0">
        {/* Copy: vertically centred in the band. */}
        <div className="relative flex flex-col items-start gap-2 md:absolute md:inset-y-0 md:left-[clamp(20px,6vw,100px)] md:justify-center md:gap-[6px]">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-8 -inset-y-3 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.6),rgba(255,255,255,0)_70%)]"
          />
          <h2 id="final-cta-title" className="text-[28px] font-extrabold leading-[1.08] text-v2-navy md:text-[clamp(26px,2.4vw,34px)]">
            Your next opportunity <br className="hidden md:block" />
            is waiting.
          </h2>
          <p className="max-w-[480px] text-[15px] leading-[1.4] text-v2-ink-soft">
            One profile, less busywork, every application in sight.
          </p>
          <div className="mt-1 flex flex-row flex-wrap items-center gap-x-5 gap-y-1 md:mt-0">
            <Link href={SIGNUP_HREF} className={buttonVariants("accent", "lg", "min-h-11 md:min-h-10 md:px-5 md:text-[15px]")}>
              Get Started for Free <ArrowRightIcon size={16} />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center px-1 text-[15px] font-bold text-v2-navy underline-offset-4 hover:underline focus-visible:underline md:min-h-10"
            >
              View Pricing
            </Link>
          </div>
        </div>

        {/* Mascot flush with the band's bottom (78% of its height) + the handwritten note. */}
        <div className="relative flex items-end gap-3 md:absolute md:inset-y-0 md:left-[58%] md:gap-[clamp(10px,1.4vw,20px)]">
          <Image
            src="/v2/mascot-cta.png"
            alt=""
            aria-hidden
            width={170}
            height={169}
            sizes="170px"
            className="relative z-10 h-auto w-[120px] flex-none drop-shadow-[0_8px_12px_rgba(27,31,94,0.14)] md:h-[78%] md:w-auto"
          />
          <div aria-hidden className="relative mb-8 pl-5 md:mb-0 md:self-center md:pl-4">
            <SparkBurst className="absolute -top-4 left-0 h-4 w-4 text-v2-green" />
            <Handwritten ink="navy" className="-rotate-[7deg] text-[22px] leading-[1.05] lg:text-[22px]">
              Same goals. <br />
              Bigger possibilities.
            </Handwritten>
            <CurvedArrow direction="down-left" className="absolute -bottom-7 left-0 h-7 w-7 text-v2-green" />
          </div>
        </div>
      </div>
    </section>
  );
}
