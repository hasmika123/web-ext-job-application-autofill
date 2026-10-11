import Link from "next/link";
import { ArrowRightIcon, Confetti, SparkBurst } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import Handwritten from "./Handwritten";
import { Mascot } from "./media";
import { SIGNUP_HREF } from "./nav";

/** Closing call-to-action band (spec 7.2 item 12): lime-soft panel, mascot wave, two buttons. */
export default function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="overflow-x-clip px-5 pb-16 pt-4 lg:px-8 lg:pb-24">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft px-6 py-12 shadow-v2-card sm:px-10 lg:px-16 lg:py-16">
        <SparkBurst aria-hidden className="absolute left-6 top-6 hidden h-9 w-9 text-v2-lime-deep sm:block" />
        <Confetti aria-hidden className="absolute bottom-8 left-[46%] hidden h-8 w-8 text-v2-violet lg:block" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
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
          <div className="relative flex items-end justify-center md:justify-end md:pt-14">
            <Handwritten family="green" className="absolute right-0 top-0 hidden w-56 rotate-3 text-left md:block">
              Same goals. Bigger possibilities.
            </Handwritten>
            <Mascot pose="wave" className="mt-4 h-40 w-40 md:mt-8 md:h-48 md:w-48" />
          </div>
        </div>
      </div>
    </section>
  );
}
