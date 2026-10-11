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
 * From md: copy | a middle column with the navy "Jobs that fit you." note + green swoosh over the
 * person cutout | the "Top Job Matches for You" card (vertically centred). The cutout stands flush
 * on the band's bottom edge (the middle column stretches to the band's bottom and a negative margin
 * eats the band's padding) and shrinks to the room below the note, so its head never climbs under it.
 * Mobile (<768): eyebrow, heading, lede, button, card, then the note over the cutout.
 */
export default function JobMatches() {
  return (
    <Section id="matches" labelledBy="matches-title" tone="mint">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,30fr)_minmax(0,26fr)_minmax(0,44fr)] md:items-center md:gap-4 lg:grid-cols-[minmax(0,30fr)_minmax(0,30fr)_minmax(0,40fr)] lg:gap-5 xl:grid-cols-[minmax(0,29fr)_minmax(0,29fr)_minmax(0,42fr)]">
        <div className="flex flex-col items-start gap-4 lg:gap-5">
          <Eyebrow family="green" className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
            Find Better Opportunities
          </Eyebrow>
          <h2 id="matches-title" className="text-[30px] text-v2-navy md:text-[clamp(22px,2.6vw,37px)] md:leading-[1.12]">
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

        <MatchesMock className="relative z-10 mx-auto max-w-[480px] md:order-3 md:max-w-none" />

        {/* Middle column (md+): a flex column. The note + swoosh sit at the top and keep their own
            height; the zone below fills what is left down to the band's bottom edge (negative
            margin eats the band's bottom padding) and the cutout, capped to that zone's height,
            shrinks instead of ever climbing under the note. */}
        <div aria-hidden className="hidden self-stretch md:order-2 md:flex md:flex-col">
          <div className="relative shrink-0 pt-2">
            <Handwritten ink="navy" className="-rotate-[4deg] text-center text-[clamp(18px,2.4cqw,28px)]">
              Jobs <br />
              that fit you.
            </Handwritten>
            <CurvedArrow
              direction="down-left"
              className="mx-auto mt-1 h-[clamp(26px,3.4cqw,40px)] w-[clamp(26px,3.4cqw,40px)] text-v2-green"
            />
            <StarDoodle className="absolute right-[6%] top-[calc(8px+clamp(24px,3cqw,36px))] h-5 w-5 text-v2-amber" />
          </div>

          <div className="relative -mb-12 mt-4 min-h-0 flex-1 lg:-mb-14">
            <Photo
              id="hero-individual"
              alt="A job seeker in a green hoodie smiling at his laptop"
              className="pointer-events-none absolute inset-0 z-20 flex w-full items-end justify-center [&_img]:max-h-full [&_img]:w-auto [&_img]:max-w-full"
              sizes="(min-width: 1024px) 340px, 260px"
              edgeFade={[4, 8]}
            />
          </div>
        </div>
      </div>

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
