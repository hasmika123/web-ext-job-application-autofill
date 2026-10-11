import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  CurvedArrow,
  MailIcon,
  SearchIcon,
  SparkBurst,
  SparklesIcon,
  buttonVariants,
  cn,
} from "@kiwiply/ui";
import { Mascot, Photo } from "../media";
import { AboutEyebrow, IconTile, type Family } from "./shared";

const CHECKS: Array<{ label: string; family: Family; icon: typeof SearchIcon }> = [
  { label: "Find the right jobs", family: "blue", icon: SearchIcon },
  { label: "Autofill with AI", family: "violet", icon: SparklesIcon },
  { label: "Track every reply", family: "amber", icon: MailIcon },
  { label: "Prepare for interviews", family: "teal", icon: CalendarIcon },
];

/** §8.1 — hero: copy left; portrait + checklist card + mascot + sticky note right. */
export default function AboutHero() {
  return (
    <section
      aria-labelledby="about-hero-title"
      className="relative overflow-hidden px-5 pb-16 pt-10 lg:px-8 lg:pb-24 lg:pt-16"
    >
      {/* soft lime / sky blobs behind the hero */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-v2-lime/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full bg-v2-blue/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div>
          <AboutEyebrow family="green">About Kiwiply</AboutEyebrow>
          <h1
            id="about-hero-title"
            className="mt-5 text-4xl text-ink md:text-[44px] lg:text-[56px] lg:leading-[1.04]"
          >
            We&rsquo;re building a <span className="text-accent-deep">smarter way</span> to get people hired.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft md:text-lg">
            Kiwiply exists to make job searching simpler and more human: one profile, AI that does the
            repetitive parts, and a board that keeps every application in sight &mdash; with you making
            every decision.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="#mission" className={buttonVariants("ghost", "lg", "min-h-11 w-full sm:w-auto")}>
              Our mission
            </Link>
            <Link href="/signup" className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
              Get Started Free
              <ArrowRightIcon size={16} aria-hidden />
            </Link>
          </div>
        </div>

        <div className="relative pb-8">
          {/* Handwritten note + arrow (desktop only, decorative) */}
          <div aria-hidden className="absolute -top-10 left-0 z-10 hidden items-end gap-1 lg:flex">
            <span className="-rotate-6 font-[family-name:var(--font-hand)] text-2xl leading-6 text-ink">
              More than
              <br />a job search.
              <br />A brighter
              <br />next chapter.
            </span>
            <CurvedArrow direction="down-right" className="h-10 w-10 text-v2-green" />
          </div>

          <Photo
            id="about-portrait"
            alt="A smiling job seeker working on a laptop"
            className="aspect-[4/3] w-full rounded-[28px] shadow-v2-float lg:aspect-[5/4]"
            sizes="(min-width: 1024px) 560px, 100vw"
            priority
          />
          <SparkBurst className="absolute -right-1 -top-4 h-10 w-10 text-v2-green" />

          {/* Floating checklist card */}
          <ul
            aria-label="What Kiwiply helps with"
            className={cn(
              "mt-4 grid gap-2.5 rounded-[var(--radius-v2-card)] bg-white p-4 shadow-v2-float",
              "lg:absolute lg:left-0 lg:top-14 lg:mt-0 lg:w-[250px] lg:-translate-x-8",
            )}
          >
            {CHECKS.map(({ label, family, icon: Icon }) => (
              <li key={label} className="flex items-center gap-3 text-sm font-semibold text-ink">
                <IconTile family={family} className="h-9 w-9 rounded-xl">
                  <Icon size={18} />
                </IconTile>
                <span className="flex-1">{label}</span>
                <CheckCircleIcon size={18} aria-hidden className="text-v2-green" />
              </li>
            ))}
          </ul>

          {/* Sticky note */}
          <div
            aria-hidden
            className="absolute -top-3 right-3 z-10 w-[150px] rotate-[5deg] rounded-md bg-v2-sticky px-3.5 py-3 shadow-v2-card md:right-6"
          >
            <p className="font-[family-name:var(--font-hand)] text-xl leading-6 text-v2-sticky-ink">
              Same me.
              <br />
              Bigger opportunities.
            </p>
          </div>

          {/* Mascot overlaps the photo's bottom-right corner */}
          <Mascot
            pose="headphones"
            className="absolute bottom-0 right-0 h-28 w-28 md:h-36 md:w-36 lg:-right-4 lg:h-40 lg:w-40"
          />
        </div>
      </div>
    </section>
  );
}
