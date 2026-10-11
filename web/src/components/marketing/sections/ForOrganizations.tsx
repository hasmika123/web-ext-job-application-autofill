import Image from "next/image";
import { CheckCircleIcon } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import Handwritten from "../Handwritten";
import OrgTableMock from "../mocks/OrgTableMock";
import ScaledCanvas from "../ScaledCanvas";
import Section from "../Section";
import { CtaLink } from "./shared";

/**
 * For Organizations (spec 13.2 item 9), rebuilt to its board (design/landing-v2/
 * section-for-organizations.png): a pale blue-to-white band.
 *  - md and up: copy (left column, fluid type) | one fixed 830x396 composition scaled to its column
 *    (`ScaledCanvas`): the white checklist card, the "Organization Dashboard" card, and at the far
 *    right the navy "Build greater opportunities together." note over the headphones mascot, which
 *    stands on the band's bottom edge (the canvas hangs over the band's bottom padding).
 *  - below 768: copy, checklist, dashboard, then the note beside the mascot.
 * There is no team photo in this section (desktop or mobile).
 */
const CHECKLIST = [
  "Manage multiple employees",
  "Track team applications",
  "Role-based access",
  "Analytics and reports",
  "Custom workflows & alerts",
];

function Checklist({ className }: { className?: string }) {
  return (
    <ul aria-label="What organizations get" className={className}>
      {CHECKLIST.map((item) => (
        <li key={item} className="flex items-center gap-3 text-[15px] font-medium text-v2-ink-soft">
          <CheckCircleIcon aria-hidden className="h-6 w-6 flex-none text-v2-green" />
          {item}
        </li>
      ))}
    </ul>
  );
}

const CARD = "rounded-2xl border border-white/70 bg-white shadow-v2-card";

function OrgMascot({ className }: { className?: string }) {
  return (
    <Image
      src="/v2/mascot-org.png"
      alt=""
      aria-hidden
      width={135}
      height={111}
      sizes="170px"
      className={`h-auto drop-shadow-[0_10px_16px_rgba(27,31,94,0.16)] ${className ?? ""}`}
    />
  );
}

export default function ForOrganizations() {
  return (
    <Section id="organizations" labelledBy="orgs-title" tone="blue">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,290fr)_minmax(0,810fr)] md:items-center md:gap-4 lg:gap-5">
        <div className="flex flex-col items-start gap-4 md:self-center lg:gap-5">
          <Eyebrow family="blue" className="px-3 py-1.5 text-[13px]">
            For Organizations
          </Eyebrow>
          <h2 id="orgs-title" className="text-[30px] text-v2-navy md:text-[clamp(26px,3.3vw,44px)] md:leading-[1.08]">
            Empower <br />
            your team.
          </h2>
          <p className="max-w-sm text-base leading-relaxed text-v2-ink-soft md:text-[clamp(13px,1.15vw,17px)]">
            Help your team find opportunities, track applications and grow together.
          </p>
          <CtaLink href="/organizations" className="mt-1 md:max-lg:min-h-10 md:max-lg:px-4 md:max-lg:text-sm">
            Explore for Organizations
          </CtaLink>
        </div>

        {/* Mobile: checklist, dashboard, then the note beside the mascot. */}
        <Checklist className={`${CARD} space-y-4 p-5 md:hidden`} />
        <OrgTableMock className="md:hidden" />

        {/* md and up: the whole right-hand composition, scaled to its column; it hangs over the
            band's bottom padding so the mascot stands on the band's bottom edge. */}
        <div className="relative hidden md:-mb-12 md:block md:self-end lg:-mb-14">
          <ScaledCanvas width={830} height={396}>
            <Checklist className={`${CARD} absolute left-0 top-[56px] w-[262px] space-y-[22px] px-6 py-[26px]`} />
            <div className="absolute left-[280px] top-[8px] w-[424px]">
              <OrgTableMock />
            </div>
            <Handwritten ink="navy" className="absolute left-[716px] top-[10px] w-[118px] -rotate-6 text-[24px]">
              Build <br />
              greater <br />
              opportunities <br />
              together.
            </Handwritten>
            <OrgMascot className="absolute bottom-0 left-[690px] w-[140px]" />
          </ScaledCanvas>
        </div>
      </div>

      <div aria-hidden className="relative -mb-10 mt-6 flex items-end justify-center gap-3 md:hidden">
        <Handwritten ink="navy" className="mb-4 w-40 -rotate-3 text-[26px]">
          Build greater opportunities together.
        </Handwritten>
        <OrgMascot className="w-[112px]" />
      </div>
    </Section>
  );
}
