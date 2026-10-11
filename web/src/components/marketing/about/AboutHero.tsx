import {
  CalendarIcon,
  CheckCircleIcon,
  CurvedArrow,
  HeartIcon,
  MailIcon,
  SearchIcon,
  SparkBurst,
  SparklesIcon,
  cn,
} from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import { FAMILY } from "../family";
import Handwritten from "../Handwritten";
import { Mascot, Photo } from "../media";
import { IconTile, MissionButton, WatchStory, type Family } from "./shared";

const CHECKS: Array<{ label: string; family: Family; icon: typeof SearchIcon }> = [
  { label: "Find the right jobs", family: "blue", icon: SearchIcon },
  { label: "Auto apply with AI", family: "violet", icon: SparklesIcon },
  { label: "Track every update", family: "amber", icon: MailIcon },
  { label: "Prepare for interviews", family: "blue", icon: CalendarIcon },
];

/**
 * Hero (board: about-desktop-b). Copy left; portrait + checklist card + mascot + sticky note
 * right. Mobile order follows the mobile board: eyebrow, h1, lede, art, buttons.
 */
export default function AboutHero() {
  return (
    <section
      aria-labelledby="about-hero-title"
      className="relative overflow-x-clip px-5 pb-10 pt-10 lg:px-8 lg:pb-14 lg:pt-16"
    >
      {/* soft lime / sky blobs behind the hero */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-v2-lime/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full bg-v2-blue/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-[1200px] gap-x-8 gap-y-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        {/* copy */}
        <div className="lg:col-start-1 lg:row-start-1">
          <Eyebrow family="green">About Kiwiply</Eyebrow>
          <h1
            id="about-hero-title"
            className="mt-5 text-4xl text-v2-navy md:text-[44px] lg:text-[56px] lg:leading-[1.04]"
          >
            We&rsquo;re building
            <span className={cn("block", FAMILY.green.headline)}>a smarter way</span>
            <span className="block">to get people hired.</span>
          </h1>
          <p className="mt-5 max-w-[520px] text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
            Kiwiply was created to make job searching simpler, faster, and more personal &mdash; using AI to
            match you with the right opportunities and help you every step of the way.
          </p>
        </div>

        {/* art */}
        <div className="relative mx-auto w-full max-w-[560px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none">
          {/* Handwritten note + arrow (desktop only, decorative) */}
          <div aria-hidden className="absolute -left-20 top-2 z-10 hidden items-end gap-1 xl:flex">
            <Handwritten family="violet" className="w-40 -rotate-6 text-[26px]">
              More than job search. A brighter next chapter.
            </Handwritten>
            <CurvedArrow direction="down-right" className="mb-1 h-9 w-9 text-v2-green" />
          </div>

          {/* The tint is its own layer so the cutout (overflow visible) sits on it, flush with the bottom edge. */}
          <div className="relative h-[300px] sm:h-[380px] lg:h-[460px]">
            <div
              aria-hidden
              className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft lg:rounded-[40px]"
            />
            <div className="absolute bottom-0 left-1/2 w-[62%] -translate-x-1/2 lg:left-[44%] lg:w-[58%]">
              <Photo
                id="about-portrait"
                alt="A smiling job seeker working at a laptop"
                className="w-full"
                sizes="(min-width: 1024px) 400px, 70vw"
                edgeFade={[0, 16]}
                priority
              />
            </div>
          </div>

          <SparkBurst className="absolute -top-4 left-[38%] hidden h-9 w-9 text-v2-green lg:block" />

          {/* Floating checklist card */}
          <ul
            aria-label="What Kiwiply helps with"
            className="absolute right-[6%] top-5 z-10 hidden w-[250px] gap-2.5 rounded-[var(--radius-v2-card)] bg-white p-4 shadow-v2-float lg:grid"
          >
            {CHECKS.map(({ label, family, icon: Icon }) => (
              <li key={label} className="flex items-center gap-3 text-[13px] font-semibold text-v2-navy">
                <IconTile family={family} className="h-9 w-9 rounded-xl">
                  <Icon size={18} />
                </IconTile>
                <span className="flex-1">{label}</span>
                <CheckCircleIcon size={18} aria-hidden className="flex-none text-v2-green" />
              </li>
            ))}
          </ul>

          {/* Sticky note */}
          <div
            aria-hidden
            className="absolute -top-3 right-1 z-10 w-[132px] rotate-[5deg] rounded-md bg-v2-sticky px-3 py-2.5 shadow-v2-card lg:-right-3 lg:-top-6 lg:w-[150px]"
          >
            <p className="font-[family-name:var(--font-hand)] text-[19px] leading-[1.1] text-v2-sticky-ink lg:text-[22px]">
              Same me. Bigger opportunities.
              <HeartIcon size={14} className="ml-1 inline text-v2-amber" fill="currentColor" />
            </p>
          </div>

          {/* Mascot overlaps the panel's bottom-right corner */}
          <Mascot
            pose="headphones"
            className="absolute -bottom-3 right-2 z-10 h-24 w-24 md:h-28 md:w-28 lg:-bottom-2 lg:right-6 lg:h-36 lg:w-36"
          />
        </div>

        {/* buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6 lg:col-start-1 lg:row-start-2 lg:self-start">
          <MissionButton />
          <WatchStory
            withDuration
            className="w-full justify-center rounded-[var(--radius-button)] border border-v2-line bg-white px-4 sm:w-auto sm:justify-start sm:border-0 sm:bg-transparent sm:px-0"
          />
        </div>
      </div>
    </section>
  );
}
