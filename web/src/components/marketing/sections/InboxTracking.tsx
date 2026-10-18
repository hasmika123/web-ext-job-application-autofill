import Image from "next/image";
import { CalendarIcon, SparkBurst, StarDoodle, TargetIcon } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import Handwritten from "../Handwritten";
import { Mascot } from "../media";
import InboxMock from "../mocks/InboxMock";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import { CtaLink } from "./shared";

/**
 * Track applications (spec 13.2 item 3), rebuilt to its own board (design/landing-v2/
 * section-track-applications.webp): a green-to-blue wash band. Desktop: copy (CTA, Gmail + Yahoo
 * tiles and the "No more checking manually!" note) | a dotted-line stack of three app tiles | the
 * inbox card | a right gutter holding the navy note, doodles and the envelope mascot, which sits
 * flush on the band's bottom edge in front of everything. The decorations are direct children of
 * the band (`Section` is `relative overflow-hidden`), so `bottom-0` is the band's edge.
 * Mobile: copy, CTA, tiles + note, the inbox card, then the note over the mascot.
 */
const TILE = "grid place-items-center rounded-2xl border border-white bg-white shadow-v2-card";

/** Multicolour Gmail "M" (no logo file: gradient-clipped letter). */
function GmailTile({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`${TILE} ${className ?? ""}`}>
      <span
        className="bg-clip-text text-[34px] font-extrabold leading-none text-transparent"
        style={{ backgroundImage: "linear-gradient(90deg,#4285F4 0%,#EA4335 34%,#FBBC05 66%,#34A853 100%)" }}
      >
        M
      </span>
    </span>
  );
}

function YahooTile({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`${TILE} ${className ?? ""}`}>
      <span className="text-[34px] font-extrabold italic leading-none text-[#6001D2]">Y</span>
    </span>
  );
}

/**
 * The board's soft watercolour greenery with the envelope mascot on top. `track-foliage-2.png`
 * (372x402) was cut from the board and itself contains the mascot, so `mascot-envelope-2.png`
 * (213x250) is laid over it at the same spot (left 64px, top 121px in the 372x402 frame) and
 * everything scales with the box width. The cut still carries a few board leftovers (the board's
 * own handwriting at the top, a dark page-edge strip on the right), which the mask hides.
 */
const FOLIAGE_MASK =
  "linear-gradient(to bottom, transparent 20%, #000 28%), linear-gradient(to right, #000 95.5%, transparent 95.5%), linear-gradient(to right, transparent 3%, #000 15%)";

function FoliageMascot({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`aspect-[372/402] ${className ?? ""}`}>
      <Image
        src="/v2/track-foliage-2.png"
        alt=""
        width={372}
        height={402}
        sizes="372px"
        className="absolute inset-0 h-full w-full"
        style={{
          maskImage: FOLIAGE_MASK,
          WebkitMaskImage: FOLIAGE_MASK,
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
        }}
      />
      <Mascot pose="envelope" className="absolute left-[17.2%] top-[30.1%] z-10 aspect-[213/250] w-[57.3%]" />
    </div>
  );
}

export default function InboxTracking() {
  return (
    <Section id="inbox" labelledBy="inbox-title" tone="wash">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_calc(236*var(--u))] md:items-center md:gap-4 lg:grid-cols-[minmax(0,0.95fr)_calc(80*var(--u))_minmax(0,1.05fr)_calc(236*var(--u))] lg:gap-5">
        {/* Copy */}
        <div className="flex flex-col items-start gap-4 lg:gap-5">
          <Eyebrow family="green" className="px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wide">
            Track Applications
          </Eyebrow>
          <h2 id="inbox-title" className="text-[30px] text-v2-navy md:text-[clamp(22px,2.6vw,40px)] md:leading-[1.12]">
            We track your job application emails automatically.
          </h2>
          <p className="max-w-md text-base leading-relaxed text-v2-ink-soft md:text-[clamp(13.5px,1.15vw,17px)]">
            Connect your Gmail or Outlook and Kiwiply monitors recruiter responses, interview invites, rejections and
            more — then alerts you instantly.
          </p>
          <CtaLink href={SIGNUP_HREF} className="mt-1 md:max-lg:min-h-10 md:max-lg:px-4 md:max-lg:text-sm">
            Connect Your Email
          </CtaLink>
          <div className="flex items-center gap-3">
            <span className="sr-only">Gmail and Yahoo Mail supported</span>
            <GmailTile className="h-16 w-16" />
            <YahooTile className="h-16 w-16" />
            <Handwritten family="amber" className="ml-1 w-28 -rotate-6 text-[22px]">
              No more checking manually!
            </Handwritten>
          </div>
        </div>

        {/* Dotted connector with the three provider tiles (desktop only) */}
        <div className="relative hidden flex-col items-center gap-[clamp(10px,2.2cqw,24px)] self-center lg:flex">
          <span aria-hidden className="absolute bottom-8 left-1/2 top-8 border-l-2 border-dotted border-v2-blue/35" />
          <span aria-hidden className={`${TILE} relative h-[calc(80*var(--u))] min-h-12 w-[calc(80*var(--u))] min-w-12 text-v2-blue`}>
            <TargetIcon className="h-9 w-9" />
          </span>
          <GmailTile className="relative h-[calc(80*var(--u))] min-h-12 w-[calc(80*var(--u))] min-w-12" />
          <span aria-hidden className={`${TILE} relative h-[calc(80*var(--u))] min-h-12 w-[calc(80*var(--u))] min-w-12 text-[#0F6CBD]`}>
            <CalendarIcon className="h-9 w-9" />
          </span>
          <span className="sr-only">Gmail, Outlook and Yahoo Mail supported</span>
        </div>

        {/* Inbox card */}
        <InboxMock className="relative z-10 w-full max-w-[560px] md:max-w-none" />

        {/* Right gutter spacer (desktop): the note, doodles and mascot are positioned against the band */}
        <div aria-hidden className="hidden md:block" />
      </div>

      {/* Desktop decorations, positioned against the band */}
      <Handwritten
        ink="navy"
        className="absolute right-12 top-10 z-20 hidden w-[calc(150*var(--u))] min-w-[96px] -rotate-[10deg] text-[clamp(18px,2.7cqw,30px)] md:block md:right-5 md:top-6 lg:right-8 lg:top-9 xl:right-12 xl:top-10"
      >
        We&apos;ll keep an eye on your inbox!
      </Handwritten>
      <StarDoodle aria-hidden className="absolute right-[calc(250*var(--u))] top-[34%] z-20 hidden h-7 w-7 text-v2-amber lg:block" />
      <StarDoodle aria-hidden className="absolute right-4 top-[44%] z-20 hidden h-6 w-6 text-v2-amber lg:block" />
      <SparkBurst aria-hidden className="absolute right-[calc(160*var(--u))] top-[40%] z-20 hidden h-8 w-8 text-v2-green lg:block" />
      <FoliageMascot className="absolute bottom-0 right-0 z-30 hidden w-[calc(310*var(--u))] md:block" />

      {/* Mobile: note over the mascot, bottom flush with the band */}
      <div className="-mb-10 mt-6 flex flex-col items-start gap-1 md:hidden">
        <Handwritten ink="navy" className="w-full -rotate-3 text-center text-[26px]">
          We&apos;ll keep an eye on your inbox!
        </Handwritten>
        <FoliageMascot className="relative left-1/2 -ml-[170px] -mt-20 w-[372px] flex-none" />
      </div>
    </Section>
  );
}
