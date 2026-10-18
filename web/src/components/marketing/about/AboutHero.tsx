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
import ScaledCanvas from "../ScaledCanvas";
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

      <div className="relative mx-auto grid max-w-[1200px] gap-x-6 gap-y-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center lg:gap-x-8">
        {/* copy */}
        <div className="md:col-start-1 md:row-start-1">
          <Eyebrow family="green">About Kiwiply</Eyebrow>
          <h1
            id="about-hero-title"
            className="mt-5 text-4xl text-v2-navy md:text-[clamp(30px,4.4vw,56px)] md:leading-[1.06]"
          >
            We&rsquo;re building
            <span className={cn("block", FAMILY.green.headline)}>a smarter way</span>
            <span className="block">to get people hired.</span>
          </h1>
          <p className="mt-5 max-w-[520px] text-base leading-relaxed text-v2-ink-soft md:text-[clamp(14px,1.4vw,17px)]">
            Kiwiply was created to make job searching simpler, faster, and more personal &mdash; using AI to
            match you with the right opportunities and help you every step of the way.
          </p>
        </div>

        {/* art, mobile (< md): a compact panel; the person is anchored left so the mascot (right)
            never touches her laptop. z: wash < person < mascot / sticky. */}
        <div className="relative mx-auto w-full max-w-[560px] md:hidden">
          <div className="relative h-[300px] sm:h-[380px]">
            <div
              aria-hidden
              className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft"
            />
            <div className="absolute bottom-0 left-[4%] z-20 w-[58%]">
              <Photo
                id="about-portrait"
                alt="A smiling job seeker working at a laptop"
                className="w-full"
                sizes="70vw"
                edgeFade={[0, 16]}
                eager
              />
            </div>
            <div
              aria-hidden
              className="absolute -top-3 right-1 z-30 w-[132px] rotate-[5deg] rounded-md bg-v2-sticky px-3 py-2.5 shadow-v2-card"
            >
              <p className="font-[family-name:var(--font-hand)] text-[19px] leading-[1.1] text-v2-sticky-ink">
                Same me. Bigger opportunities.
                <HeartIcon size={14} className="ml-1 inline text-v2-amber" fill="currentColor" />
              </p>
            </div>
            <Mascot pose="headphones" className="absolute bottom-0 right-2 z-30 h-24 w-24 sm:h-32 sm:w-32" />
          </div>
        </div>

        {/* art, md and up: ONE fixed composition scaled to its column (`ScaledCanvas`), so nothing can
            collide at any width. Stacking: wash (0) < arrow/spark (1) < checklist card (10) < person
            (20) < mascot + sticky (30). The card sits right of her head; her hair and shoulder overlap
            its lower-left corner, her face is clear. */}
        <div className="relative hidden w-full max-w-[660px] md:col-start-2 md:row-span-2 md:row-start-1 md:ml-auto md:block">
          <ScaledCanvas width={620} height={480}>
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 top-6 z-0 rounded-[40px] bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft"
            />

            {/* Handwritten note + arrow (decorative) */}
            <div aria-hidden className="absolute left-2 top-10 z-[1] hidden items-end gap-1 lg:flex">
              <Handwritten family="violet" className="w-40 -rotate-6 text-[26px]">
                More than job search. A brighter next chapter.
              </Handwritten>
              <CurvedArrow direction="down-right" className="mb-1 h-9 w-9 text-v2-green" />
            </div>
            <SparkBurst className="absolute left-[220px] top-2 z-[1] h-9 w-9 text-v2-green" />

            {/* Floating checklist card */}
            <ul
              aria-label="What Kiwiply helps with"
              className="absolute left-[392px] top-[96px] z-10 grid w-[220px] gap-2.5 rounded-[var(--radius-v2-card)] bg-white p-4 shadow-v2-float"
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

            {/* Person: bottom flush with the band, in front of the card */}
            <div className="absolute bottom-0 left-[80px] z-20 w-[370px]">
              <Photo
                id="about-portrait"
                alt="A smiling job seeker working at a laptop"
                className="w-full"
                sizes="(min-width: 1024px) 400px, 50vw"
                edgeFade={[0, 16]}
                priority
              />
            </div>

            {/* Sticky note, above the card's top edge */}
            <div
              aria-hidden
              className="absolute right-0 top-0 z-30 w-[150px] rotate-[5deg] rounded-md bg-v2-sticky px-3 py-2.5 shadow-v2-card"
            >
              <p className="font-[family-name:var(--font-hand)] text-[22px] leading-[1.1] text-v2-sticky-ink">
                Same me. Bigger opportunities.
                <HeartIcon size={14} className="ml-1 inline text-v2-amber" fill="currentColor" />
              </p>
            </div>

            {/* Mascot: far right, bottom flush, clear of the laptop */}
            <Mascot pose="headphones" className="absolute bottom-0 right-0 z-30 h-[132px] w-[132px]" />
          </ScaledCanvas>
        </div>

        {/* buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6 md:col-start-1 md:row-start-2 md:self-start">
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
