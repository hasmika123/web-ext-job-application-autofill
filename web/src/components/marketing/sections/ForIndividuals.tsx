import Link from "next/link";
import { CheckCircleIcon, ChevronRightIcon, Squiggle, UserIcon, cn } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import { CompanyTile, StatusChip } from "../mocks/shared";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import SectionHeading from "../SectionHeading";
import { CtaLink } from "./shared";

/**
 * For Individuals (spec 13.2 item 8): lavender band. Desktop: copy | the six audience pills (over
 * the left shoulder of the student cutout) | the "Product Designer · Google" match card with the
 * handwritten note. The cutout (it already contains the mascot) is anchored to the band so it
 * stands on the bottom edge. Mobile: copy, CTA, chevron list, then note + cutout (no card).
 */
const AUDIENCES = ["Students", "New Grads", "Career Switchers", "Freelancers", "Professionals", "Return to Work"];

const CHECKS = [
  "Role matches your skills",
  "Aligned with your goals",
  "Great culture fit",
  "High growth potential",
];

export default function ForIndividuals() {
  return (
    <Section id="individuals" labelledBy="individuals-title" tone="lavender">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[0.95fr_1fr_1.15fr] lg:items-center lg:gap-6">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading
            id="individuals-title"
            eyebrow="For Individuals"
            family="blue"
            title="Land your dream job."
            lede="Find better opportunities, save time and stay in control of your job search."
          />
          <CtaLink href={SIGNUP_HREF}>Get Started Free</CtaLink>
        </div>

        <ul className="relative z-20 w-full overflow-hidden rounded-[var(--radius-v2-card)] border border-white/70 bg-white shadow-v2-card lg:w-[196px] lg:overflow-visible lg:border-0 lg:bg-transparent lg:shadow-none">
          {AUDIENCES.map((label, i) => (
            <li key={label} className={cn(i > 0 && "border-t border-v2-line/60 lg:border-0", "lg:mb-2")}>
              <Link
                href={SIGNUP_HREF}
                className="group flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-v2-canvas focus-visible:bg-v2-canvas lg:min-h-10 lg:rounded-xl lg:bg-white lg:px-3 lg:shadow-v2-card lg:ring-1 lg:ring-white/80"
              >
                <UserIcon aria-hidden className="h-[18px] w-[18px] flex-none text-v2-blue" />
                <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-v2-navy lg:text-[13.5px]">{label}</span>
                <ChevronRightIcon
                  aria-hidden
                  className="h-4 w-4 flex-none text-v2-muted transition-transform group-hover:translate-x-0.5 lg:hidden"
                />
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop only: the match card the person is looking at. */}
        <div className="relative hidden lg:block">
          <div className="relative z-10 rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-5 shadow-v2-float">
            <div className="flex items-center gap-3">
              <CompanyTile name="Google" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-bold leading-tight text-v2-navy">Product Designer</p>
                <p className="truncate text-[12px] leading-tight text-v2-muted">Google · Full-time · Remote</p>
              </div>
              <StatusChip family="green">92% Match</StatusChip>
            </div>
            <ul className="mt-4 space-y-2.5">
              {CHECKS.map((c) => (
                <li key={c} className="flex items-center gap-2.5 text-[13px] text-v2-ink-soft">
                  <CheckCircleIcon aria-hidden className="h-[18px] w-[18px] flex-none text-v2-green" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <Handwritten family="blue" className="absolute -top-16 right-0 z-20 w-60 rotate-3 text-right text-[26px]">
            Your Next Chapter Starts Here.
          </Handwritten>
          <Squiggle aria-hidden className="absolute -left-10 top-2 z-20 h-5 w-12 text-v2-green" />
        </div>
      </div>

      {/* Mobile: the note above the cutout, flush on the band's bottom edge (negative margin eats
          the band's bottom padding). lg+: anchored to the band, between the pills and the card. */}
      <div className="relative -mb-10 mt-6 lg:static lg:mb-0 lg:mt-0">
        <Handwritten family="blue" className="mb-2 text-center lg:hidden">
          Your Next Chapter Starts Here.
        </Handwritten>
        <Photo
          id="hero-student"
          alt="A student thinking about her next role at a laptop, with the Kiwiply mascot peeking in"
          className="mx-auto w-[86%] max-w-[420px] lg:absolute lg:bottom-0 lg:left-[38%] lg:mx-0 lg:w-[340px] lg:max-w-none"
          sizes="(min-width: 1024px) 340px, 86vw"
          edgeFade={[8, 3]}
          eager
        />
      </div>
    </Section>
  );
}
