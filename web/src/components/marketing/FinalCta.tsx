import Link from "next/link";
import { ArrowRightIcon, Confetti, SparkBurst } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import Handwritten from "./Handwritten";
import { Mascot } from "./media";
import { SIGNUP_HREF } from "./nav";

/**
 * Closing call-to-action band (spec 7.2 item 12): lime-soft panel, two buttons. V2.3b: the laptop
 * mascot sits on the band's bottom edge (the band clips it flush) beside the handwritten note.
 */
export default function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="overflow-x-clip px-5 pb-16 pt-4 lg:px-8 lg:pb-24">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft px-6 py-12 shadow-v2-card sm:px-10 lg:px-16 lg:py-16">
        <SparkBurst aria-hidden className="absolute left-6 top-6 hidden h-9 w-9 text-v2-lime-deep sm:block" />
        <Confetti aria-hidden className="absolute bottom-8 left-[46%] hidden h-8 w-8 text-v2-violet lg:block" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_260px] lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col items-start gap-4">
            <h2 id="final-cta-title" className="max-w-xl text-[28px] text-v2-navy md:text-4xl lg:text-[40px]">
              Your next opportunity is waiting.
            </h2>
            <p className="max-w-lg text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
              Build one profile, apply with less busywork, and keep every application in sight.
            </p>
            <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={SIGNUP_HREF} className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
                Get Started Free <ArrowRightIcon size={16} />
              </Link>
              <Link href="/#pricing" className={buttonVariants("ghost", "lg", "min-h-11 w-full bg-white sm:w-auto")}>
                View pricing
              </Link>
            </div>
          </div>
          {/* Mobile: the mascot closes the band, flush with its bottom edge (the band's bottom
              padding is eaten by the negative margin). md+: it is positioned on the band itself. */}
          <Mascot pose="laptop" className="-mb-12 mt-2 h-36 w-36 justify-self-center md:hidden" />
          <div aria-hidden className="relative hidden h-40 md:block">
            <Handwritten family="green" className="absolute left-2 top-0 w-56 rotate-3 text-left">
              Same goals. Bigger possibilities.
            </Handwritten>
          </div>
        </div>
        <Mascot
          pose="laptop"
          className="absolute bottom-0 right-10 hidden h-[200px] w-[190px] md:block lg:right-16 lg:h-[220px] lg:w-[208px]"
        />
      </div>
    </section>
  );
}
