import Link from "next/link";
import { ArrowRightIcon, HeartIcon, SparkBurst, buttonVariants } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import { FAMILY } from "../family";
import { Mascot } from "../media";

/** Final CTA band + the board's footer line (the shared footer follows this component). */
export default function AboutCta() {
  return (
    <section aria-labelledby="about-cta-title" className="overflow-x-clip px-5 pb-6 pt-10 lg:px-8 lg:pt-14">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[32px] bg-gradient-to-br from-v2-blue-soft via-white to-v2-lime-soft px-6 py-10 shadow-v2-card sm:px-10 lg:rounded-[48px] lg:px-14 lg:py-12">
        <SparkBurst className="absolute left-[40%] top-6 hidden h-8 w-8 text-v2-green lg:block" />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_1fr_0.9fr]">
          <div>
            <Eyebrow family="green">Your next opportunity</Eyebrow>
            <h2 id="about-cta-title" className="mt-4 text-[28px] text-v2-navy md:text-4xl lg:text-[40px]">
              Your next opportunity <span className={`block ${FAMILY.green.headline}`}>starts here.</span>
            </h2>
          </div>

          <div className="flex flex-col items-start gap-5">
            <p className="max-w-sm text-base leading-relaxed text-v2-ink-soft">
              Join thousands of job seekers who are finding brighter careers with Kiwiply.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href="/signup" className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
                Get Started Free
                <ArrowRightIcon size={16} aria-hidden />
              </Link>
              <Link href="/pricing" className={buttonVariants("ghost", "lg", "min-h-11 w-full bg-white sm:w-auto")}>
                View Pricing
              </Link>
            </div>
          </div>

          <div className="relative flex items-center justify-center gap-2 lg:justify-end">
            <Mascot pose="headphones" className="h-32 w-32 lg:h-40 lg:w-40" />
            <div
              aria-hidden
              className="w-[140px] rotate-[5deg] rounded-md bg-v2-sticky px-3.5 py-3 shadow-v2-card lg:w-[150px]"
            >
              <p className="font-[family-name:var(--font-hand)] text-[20px] leading-[1.1] text-v2-sticky-ink">
                Same you. Brighter tomorrows.
                <HeartIcon size={14} className="ml-1 inline text-v2-blue" />
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-8 flex max-w-[1200px] flex-col items-center gap-1 text-center text-sm text-v2-muted sm:flex-row sm:justify-center sm:gap-3">
        <span>A brighter future of work. Together.</span>
        <span aria-hidden className="hidden sm:inline">
          &middot;
        </span>
        <span className="inline-flex items-center gap-1.5">
          Made with <HeartIcon size={14} aria-hidden className="text-v2-green" fill="currentColor" />
          <span className="sr-only">love</span> in New Zealand
        </span>
      </p>
    </section>
  );
}
