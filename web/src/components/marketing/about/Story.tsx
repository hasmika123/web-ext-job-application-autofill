import { HeartIcon } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import { FAMILY } from "../family";
import Handwritten from "../Handwritten";
import { Mascot, Photo } from "../media";
import ScaledCanvas from "../ScaledCanvas";
import Section from "../Section";
import { MissionButton } from "./shared";

const TEAM_ALT = "A small team gathered around a laptop, smiling";

function StoryNote({ className }: { className?: string }) {
  return (
    <Handwritten family="violet" className={className}>
      A brighter future of work.{" "}
      <span className="whitespace-nowrap">
        Together.
        <HeartIcon size={16} className="ml-1 inline text-v2-blue" />
      </span>
    </Handwritten>
  );
}

function StickyText() {
  return (
    <p className="font-[family-name:var(--font-hand)] text-[18px] leading-[1.1] text-v2-sticky-ink">
      People Opportunity Progress Always.
      <HeartIcon size={13} className="ml-1 inline text-v2-amber" fill="currentColor" />
    </p>
  );
}

/**
 * "Built for brighter careers." Copy left, team photo + handwriting + sticky + mascot right.
 * Mobile order: copy, photo, button (as on the mobile board).
 */
export default function Story() {
  return (
    <Section labelledBy="story-title" className="py-10 lg:py-14">
      <div className="grid gap-x-6 gap-y-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center lg:gap-x-12">
        <div className="md:col-start-1 md:row-start-1">
          <Eyebrow family="green">Our Story</Eyebrow>
          <h2 id="story-title" className="mt-4 text-[28px] text-v2-navy md:text-[clamp(24px,3.2vw,40px)]">
            Built for <span className={FAMILY.green.headline}>brighter careers.</span>
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
            Kiwiply started with a simple idea: job searching should be more human, less hectic. Our team of
            builders, designers, and career advocates came together to create a platform that helps people
            find meaningful opportunities and reach their potential.
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
            Today, Kiwiply is in beta and improving every week, built for job seekers and the organizations that
            believe in a brighter, more inclusive future of work.
          </p>
        </div>

        {/* art, mobile (< md): handwriting + sticky above, team left, mascot right; no overlaps */}
        <div className="relative mx-auto w-full max-w-[560px] md:hidden">
          <div className="relative h-[330px] sm:h-[380px]">
            <div aria-hidden className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft" />
            <StoryNote className="absolute left-4 top-4 z-[1] w-44 -rotate-6 text-[24px]" />
            <div
              aria-hidden
              className="absolute right-3 top-5 z-30 w-[112px] rotate-[4deg] rounded-md bg-v2-sticky px-3 py-2.5 shadow-v2-card"
            >
              <StickyText />
            </div>
            <div className="absolute bottom-0 left-2 z-20 w-[76%]">
              <Photo id="about-team" alt={TEAM_ALT} className="w-full" sizes="76vw" />
            </div>
            <Mascot pose="headphones" className="absolute bottom-0 right-1 z-30 h-20 w-[22%] sm:h-28" />
          </div>
        </div>

        {/* art, md and up: one fixed composition scaled to its column (`ScaledCanvas`). The card is a
            separate wash layer (the cutout is never inside an overflow clip); the team stands flush on
            its bottom edge, the mascot is bottom-right OUTSIDE the people, sticky top-right. */}
        <div className="relative hidden md:col-start-2 md:row-span-2 md:row-start-1 md:block">
          <ScaledCanvas width={560} height={380}>
            <div aria-hidden className="absolute inset-0 z-0 rounded-[48px] bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft" />
            <StoryNote className="absolute left-6 top-[22px] z-[1] w-[190px] -rotate-6 text-[26px]" />
            <div
              aria-hidden
              className="absolute right-3 top-6 z-30 w-[128px] rotate-[4deg] rounded-md bg-v2-sticky px-3 py-2.5 shadow-v2-card"
            >
              <StickyText />
            </div>
            <div className="absolute bottom-0 left-3 z-20 w-[420px]">
              <Photo id="about-team" alt={TEAM_ALT} className="w-full" sizes="(min-width: 1024px) 420px, 40vw" />
            </div>
            <Mascot pose="headphones" className="absolute bottom-0 right-2 z-30 h-[120px] w-[120px]" />
          </ScaledCanvas>
        </div>

        <div className="md:col-start-1 md:row-start-2 md:self-start">
          <MissionButton />
        </div>
      </div>
    </Section>
  );
}
