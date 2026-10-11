import Link from "next/link";
import { BookmarkIcon, CheckCircleIcon, ChevronRightIcon, CurvedArrow, Squiggle, UserIcon, cn } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import ScaledCanvas from "../ScaledCanvas";
import { CompanyTile, StatusChip } from "../mocks/shared";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import { CtaLink } from "./shared";

/**
 * For Individuals (spec 13.2 item 8), rebuilt to its board (design/landing-v2/section-for-
 * individuals.webp): a lilac-to-pale-green band.
 *  - md and up: copy (left column, fluid type) | one fixed 840x300 composition scaled to its
 *    column (`ScaledCanvas`): the four audience pill-cards, the student cutout standing on the
 *    band's bottom edge (in front of the list's right edge), the "Product Designer · Google"
 *    match card, and at the far right the navy "Your Next Chapter Starts Here." note with a green
 *    arrow and the mascot-with-letter cutout on the bottom edge. The canvas hangs over the band's
 *    bottom padding (negative margin) so the cutouts are flush with the edge.
 *  - below 768: copy, CTA, the audience list, the match card, then the note over the student
 *    and the mascot.
 */
const AUDIENCES = ["Students", "New Grads", "Professionals", "Return to Work"];

const CHECKS = [
  "Role matches your skills",
  "Aligned with your goals",
  "Great culture fit",
  "High growth potential",
];

const TAGS: { label: string; className: string }[] = [
  { label: "Design", className: "bg-v2-coral-soft text-[#C93636]" },
  { label: "Figma", className: "bg-v2-canvas text-v2-ink-soft" },
  { label: "Prototyping", className: "bg-v2-canvas text-v2-ink-soft" },
  { label: "Research", className: "bg-v2-canvas text-v2-ink-soft" },
];

function MatchCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/70 bg-white p-[18px] shadow-v2-float",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <CompanyTile name="Google" className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight text-v2-navy">Product Designer</p>
          <p className="truncate text-[12.5px] leading-tight text-v2-muted">Google · Full-time · Remote</p>
        </div>
        <StatusChip family="green" className="px-2.5 py-1.5 text-[11.5px]">
          92% Match
        </StatusChip>
        <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-v2-green-soft text-v2-green max-sm:hidden">
          <BookmarkIcon className="h-4 w-4" />
        </span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {TAGS.map((t) => (
          <li key={t.label} className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none", t.className)}>
            {t.label}
          </li>
        ))}
      </ul>
      <ul className="mt-3.5 space-y-2.5 border-t border-v2-line/60 pt-3.5">
        {CHECKS.map((c) => (
          <li key={c} className="flex items-center gap-2.5 text-[14px] text-v2-ink-soft">
            <CheckCircleIcon aria-hidden className="h-[18px] w-[18px] flex-none text-v2-green" />
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

const WOMAN_ALT = "A student in a lilac hoodie with a backpack, looking up toward her next role";

export default function ForIndividuals() {
  return (
    <Section id="individuals" labelledBy="individuals-title" tone="lilac">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,300fr)_minmax(0,810fr)] md:items-center md:gap-4 lg:gap-5">
        <div className="flex flex-col items-start gap-4 md:self-center lg:gap-5">
          <Eyebrow family="blue" className="px-3 py-1.5 text-[13px]">
            For Individuals
          </Eyebrow>
          <h2 id="individuals-title" className="text-[30px] text-v2-navy md:text-[clamp(26px,3.3vw,44px)] md:leading-[1.08]">
            Land your <br />
            dream job.
          </h2>
          <p className="max-w-sm text-base leading-relaxed text-v2-ink-soft md:text-[clamp(13px,1.15vw,17px)]">
            Find better opportunities, save time and stay in control of your job search.
          </p>
          <CtaLink href={SIGNUP_HREF} className="mt-1 md:max-lg:min-h-10 md:max-lg:px-4 md:max-lg:text-sm">
            Get Started Free
          </CtaLink>
        </div>

        {/* Mobile: the audience list as one card of chevron rows, then the match card. */}
        <ul className="w-full overflow-hidden rounded-[var(--radius-v2-card)] border border-white/70 bg-white shadow-v2-card md:hidden">
          {AUDIENCES.map((label, i) => (
            <li key={label} className={cn(i > 0 && "border-t border-v2-line/60")}>
              <Link href={SIGNUP_HREF} className="group flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-v2-canvas focus-visible:bg-v2-canvas">
                <UserIcon aria-hidden className="h-[18px] w-[18px] flex-none text-v2-blue" />
                <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-v2-navy">{label}</span>
                <ChevronRightIcon aria-hidden className="h-4 w-4 flex-none text-v2-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
        <MatchCard className="mx-auto w-full max-w-[440px] md:hidden" />

        {/* md and up: the whole right-hand composition, scaled to its column and hanging over the
            band's bottom padding so the cutouts stand on the band's bottom edge. */}
        <div className="relative hidden md:-mb-12 md:block md:self-end lg:-mb-14">
          <ScaledCanvas width={870} height={300}>
            <ul className="absolute left-0 top-[66px] z-30 w-[196px]">
              {AUDIENCES.map((label) => (
                <li key={label} className="mb-1.5">
                  <Link
                    href={SIGNUP_HREF}
                    className="flex min-h-11 items-center gap-3 rounded-xl bg-white px-3.5 shadow-v2-card ring-1 ring-white/80 transition-colors hover:bg-v2-canvas focus-visible:bg-v2-canvas"
                  >
                    <UserIcon aria-hidden className="h-[18px] w-[18px] flex-none text-v2-blue" />
                    <span className="min-w-0 flex-1 text-[15px] font-semibold text-v2-navy">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Squiggle aria-hidden className="absolute left-[168px] top-[40px] z-30 h-5 w-12 -rotate-12 text-v2-green" />
            <Photo
              id="individuals-woman"
              alt={WOMAN_ALT}
              className="absolute bottom-0 left-[150px] z-20 w-[310px]"
              sizes="(min-width: 1024px) 310px, 240px"
              eager
            />
            <div className="absolute left-[396px] top-[24px] z-10 w-[360px]">
              <MatchCard />
            </div>
            <Handwritten ink="navy" className="absolute left-[766px] top-[6px] z-20 w-[100px] -rotate-6 text-[24px]">
              Your <br />
              Next Chapter <br />
              Starts Here.
            </Handwritten>
            <CurvedArrow direction="down-left" aria-hidden className="absolute left-[796px] top-[126px] z-20 h-9 w-9 text-v2-green" />
            <Photo
              id="mascot-letter"
              alt=""
              className="absolute bottom-0 left-[686px] z-30 w-[160px]"
              sizes="160px"
            />
          </ScaledCanvas>
        </div>
      </div>

      {/* Mobile: the note above the student cutout, with the mascot at its side, flush on the
          band's bottom edge (negative margin eats the band's bottom padding). */}
      <div className="relative -mb-10 mt-6 md:hidden">
        <Handwritten ink="navy" className="mb-2 text-center text-[26px] -rotate-2">
          Your Next Chapter Starts Here.
        </Handwritten>
        <div className="relative mx-auto w-[86%] max-w-[420px]">
          <Photo id="individuals-woman" alt={WOMAN_ALT} className="w-[78%]" sizes="86vw" eager />
          <Photo id="mascot-letter" alt="" className="absolute bottom-0 right-0 w-[42%]" sizes="40vw" />
        </div>
      </div>
    </Section>
  );
}
