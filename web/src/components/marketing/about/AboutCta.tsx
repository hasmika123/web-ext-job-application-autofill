import Link from "next/link";
import { ArrowRightIcon, SparkBurst, buttonVariants } from "@kiwiply/ui";
import { Mascot } from "../media";

/** §8.9 — final CTA band (local; the shared FinalCta lands in another phase). */
export default function AboutCta() {
  return (
    <section aria-labelledby="about-cta-title" className="px-5 pb-16 pt-0 lg:px-8 lg:pb-24">
      <div className="relative mx-auto grid max-w-[1200px] items-center gap-6 overflow-hidden rounded-[28px] bg-v2-lime-soft px-6 py-10 md:grid-cols-[auto_1fr] md:gap-10 md:px-12 lg:py-12">
        <SparkBurst className="absolute left-6 top-6 hidden h-8 w-8 text-v2-green md:block" />
        <Mascot pose="wave" className="mx-auto h-36 w-36 md:h-44 md:w-44" />
        <div className="text-center md:text-left">
          <h2 id="about-cta-title" className="text-[28px] text-ink md:text-4xl">
            Your next opportunity <span className="text-accent-deep">starts here.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-ink-soft md:mx-0 md:text-lg">
            Start free, bring your resume, and let Kiwiply handle the repetitive parts while you make
            every call.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
            <Link href="/signup" className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
              Get Started Free
              <ArrowRightIcon size={16} aria-hidden />
            </Link>
            <Link href="/#pricing" className={buttonVariants("ghost", "lg", "min-h-11 w-full bg-white sm:w-auto")}>
              View pricing
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
