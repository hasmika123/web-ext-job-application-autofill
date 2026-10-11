import { CheckCircleIcon } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Mascot, Photo } from "../media";
import OrgTableMock from "../mocks/OrgTableMock";
import Section from "../Section";
import SectionHeading from "../SectionHeading";
import { CtaLink } from "./shared";

/**
 * For Organizations (spec 13.2 item 9): copy | white checklist card | "Organization Dashboard"
 * mock, with the note and the headphones mascot in a right-hand gutter. The team cutout sits under
 * the CTA. Mobile order: heading, CTA, team cutout, checklist, dashboard, note + mascot.
 */
const CHECKLIST = [
  "Manage multiple employees",
  "Track team applications",
  "Role-based access",
  "Analytics and reports",
  "Custom workflows & alerts",
];

export default function ForOrganizations() {
  return (
    <Section id="organizations" labelledBy="orgs-title" className="py-10 lg:py-14">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[0.85fr_0.8fr_1.25fr_120px] lg:items-center lg:gap-6">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading
            id="orgs-title"
            eyebrow="For Organizations"
            family="blue"
            title="Empower your team."
            lede="Help your team find opportunities, track applications and grow together."
          />
          <CtaLink href="/organizations">Explore for Organizations</CtaLink>
          <Photo
            id="hero-team"
            alt="Three colleagues smiling at their laptops together"
            className="mx-auto mt-2 w-full max-w-[360px] lg:mx-0 lg:mt-4 lg:w-[88%]"
            sizes="(min-width: 1024px) 300px, 360px"
            edgeFade={[8, 4]}
          />
        </div>

        <ul className="space-y-4 rounded-[var(--radius-v2-card)] border border-v2-line/60 bg-white p-5 shadow-v2-card lg:p-6">
          {CHECKLIST.map((item) => (
            <li key={item} className="flex items-center gap-3 text-[14px] font-medium text-v2-ink-soft">
              <CheckCircleIcon aria-hidden className="h-5 w-5 flex-none text-v2-green" />
              {item}
            </li>
          ))}
        </ul>

        <OrgTableMock />

        <div className="relative flex items-end gap-2 lg:block lg:h-[260px]">
          <Mascot pose="headphones" className="-mb-2 h-28 w-28 lg:absolute lg:bottom-0 lg:left-4 lg:mb-0 lg:h-[120px] lg:w-[116px]" />
          <Handwritten
            family="blue"
            className="mb-6 w-44 -rotate-3 text-[24px] lg:absolute lg:left-2 lg:top-8 lg:mb-0 lg:w-28 lg:rotate-[-8deg]"
          >
            Build greater opportunities together.
          </Handwritten>
        </div>
      </div>
    </Section>
  );
}
