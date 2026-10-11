import { CurvedArrow, StarDoodle } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import MatchesMock from "../mocks/MatchesMock";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import { CtaLink } from "./shared";

/**
 * Find better opportunities (spec 13.2 item 4), rebuilt to its board: a soft white-to-green band.
 * From md: copy | "Top Job Matches for You" card | a right column holding the navy "Jobs that fit
 * you." note with a green swoosh and the person cutout, which stands flush on the band's bottom
 * edge (it is placed against the band, whose inner column is a size container; `--u` is one design
 * pixel of the 1088px-wide band, so the cutout and the right column scale with it).
 * The board's man points up at the note; we only have the seated pose, so it sits beside the note.
 * Mobile (<768): eyebrow, heading, lede, button, card, then the note over the cutout.
 */
export default function JobMatches() {
  return (
    <Section id="matches" labelledBy="matches-title" tone="mint">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)_calc(250*var(--u))] md:items-center md:gap-4 lg:gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)_calc(300*var(--u))]">
        <div className="flex flex-col items-start gap-4 lg:gap-5">
          <Eyebrow family="green" className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
            Find Better Opportunities
          </Eyebrow>
          <h2 id="matches-title" className="text-[30px] text-v2-navy md:text-[clamp(22px,2.6vw,40px)] md:leading-[1.12]">
            Get personalized <br className="hidden md:block" />
            job matches.
          </h2>
          <p className="max-w-[360px] text-base leading-relaxed text-v2-ink-soft md:text-[clamp(13.5px,1.15vw,17px)]">
            Kiwiply finds jobs that match your skills, interests and goals — so you don&apos;t have to search endlessly.
          </p>
          <CtaLink href={SIGNUP_HREF} className="mt-1 md:max-lg:min-h-10 md:max-lg:px-4 md:max-lg:text-sm">
            Find My Matches
          </CtaLink>
        </div>

        <MatchesMock className="relative z-10 mx-auto max-w-[480px] md:max-w-none" />

        {/* Right column (md+): reserves the space; the note sits at its top, the cutout is placed
            against the band below. */}
        <div aria-hidden className="relative hidden self-stretch md:block">
          <Handwritten
            ink="navy"
            className="absolute right-0 top-[8%] z-20 -rotate-[4deg] text-right text-[clamp(18px,2.4cqw,28px)]"
          >
            Jobs <br />
            that fit you.
          </Handwritten>
          <CurvedArrow
            direction="down-left"
            className="absolute right-[34%] top-[calc(8%+clamp(44px,5.4cqw,64px))] z-20 h-[clamp(26px,3.4cqw,40px)] w-[clamp(26px,3.4cqw,40px)] text-v2-green"
          />
          <StarDoodle className="absolute right-[3%] top-[calc(8%+clamp(52px,6.4cqw,76px))] z-20 h-5 w-5 text-v2-amber" />
        </div>
      </div>

      {/* md+: the cutout stands on the band's bottom edge, in front of the wash. */}
      <Photo
        id="hero-individual"
        alt="A job seeker in a green hoodie smiling at his laptop"
        className="pointer-events-none absolute bottom-0 right-[calc(8*var(--u))] z-20 hidden w-[calc(250*var(--u))] md:block xl:w-[calc(300*var(--u))]"
        sizes="(min-width: 1024px) 300px, 250px"
        edgeFade={[4, 8]}
      />

      {/* Mobile: the note over the cutout, flush on the band's bottom edge (negative margin eats the band's padding). */}
      <div className="relative -mb-10 mt-6 md:hidden">
        <Handwritten ink="navy" className="mb-2 -rotate-2 text-center text-[26px]">
          Jobs that fit you.
        </Handwritten>
        <Photo
          id="hero-individual"
          alt="A job seeker in a green hoodie smiling at his laptop"
          className="mx-auto w-[62%] max-w-[280px]"
          sizes="62vw"
          edgeFade={[4, 8]}
        />
      </div>
    </Section>
  );
}
