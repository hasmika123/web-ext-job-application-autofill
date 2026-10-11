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

export default function InboxTracking() {
  return (
    <Section id="inbox" labelledBy="inbox-title" tone="wash">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,0.95fr)_80px_minmax(0,1.05fr)_200px] xl:items-center xl:gap-5">
        {/* Copy */}
        <div className="flex flex-col items-start gap-5">
          <Eyebrow family="green" className="px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wide">
            Track Applications
          </Eyebrow>
          <h2 id="inbox-title" className="text-[30px] text-v2-navy md:text-4xl xl:text-[40px]">
            We track your job application emails automatically.
          </h2>
          <p className="max-w-md text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
            Connect your Gmail or Outlook and Kiwiply monitors recruiter responses, interview invites, rejections and
            more — then alerts you instantly.
          </p>
          <CtaLink href={SIGNUP_HREF} className="mt-1">
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
        <div className="relative hidden flex-col items-center gap-6 self-center xl:flex">
          <span aria-hidden className="absolute bottom-8 left-1/2 top-8 border-l-2 border-dotted border-v2-blue/35" />
          <span aria-hidden className={`${TILE} relative h-20 w-20 text-v2-blue`}>
            <TargetIcon className="h-9 w-9" />
          </span>
          <GmailTile className="relative h-20 w-20" />
          <span aria-hidden className={`${TILE} relative h-20 w-20 text-[#0F6CBD]`}>
            <CalendarIcon className="h-9 w-9" />
          </span>
          <span className="sr-only">Gmail, Outlook and Yahoo Mail supported</span>
        </div>

        {/* Inbox card */}
        <InboxMock className="relative z-10 md:max-w-[560px] xl:max-w-none" />

        {/* Right gutter spacer (desktop): the note, doodles and mascot are positioned against the band */}
        <div aria-hidden className="hidden xl:block" />
      </div>

      {/* Desktop decorations, positioned against the band */}
      <Handwritten
        ink="navy"
        className="absolute right-12 top-10 z-20 hidden w-[150px] -rotate-[10deg] text-[30px] xl:block xl:right-12 xl:top-10"
      >
        We&apos;ll keep an eye on your inbox!
      </Handwritten>
      <StarDoodle aria-hidden className="absolute right-[250px] top-[34%] z-20 hidden h-7 w-7 text-v2-amber xl:block" />
      <StarDoodle aria-hidden className="absolute right-6 top-[44%] z-20 hidden h-6 w-6 text-v2-amber xl:block" />
      <SparkBurst aria-hidden className="absolute right-[160px] top-[40%] z-20 hidden h-8 w-8 text-v2-green xl:block" />
      <Mascot
        pose="envelope"
        className="absolute bottom-0 right-6 z-30 hidden h-[270px] w-[230px] xl:block"
      />

      {/* Mobile: note over the mascot, bottom flush with the band */}
      <div className="-mb-10 mt-6 flex flex-col items-center gap-1 xl:hidden">
        <Handwritten ink="navy" className="-rotate-3 text-center text-[26px]">
          We&apos;ll keep an eye on your inbox!
        </Handwritten>
        <Mascot pose="envelope" className="h-[250px] w-[213px]" />
      </div>
    </Section>
  );
}
