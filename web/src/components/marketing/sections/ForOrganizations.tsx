import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import Handwritten from "../Handwritten";
import { Mascot, Photo } from "../media";
import OrgTableMock from "../mocks/OrgTableMock";
import Section from "../Section";
import SectionHeading from "../SectionHeading";

/**
 * For organisations teaser (spec 7.2 item 10): checklist and the team cutout left (flush with the
 * section's bottom edge), OrgTableMock on the right with the note and the plane mascot beside it.
 */
const CHECKLIST = [
  "Multiple consultants",
  "Marketer-prepared applications",
  "Role-based access",
  "Progress across the bench",
  "Expert services per person",
];

export default function ForOrganizations() {
  return (
    <Section id="organizations" labelledBy="orgs-title">
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading
            id="orgs-title"
            eyebrow="For organisations"
            family="blue"
            title="Support your"
            accent="people's search."
          />
          <ul className="space-y-3">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-center gap-3 text-[15px] font-medium text-v2-navy">
                <CheckCircleIcon aria-hidden className="h-5 w-5 flex-none text-v2-green" />
                {item}
              </li>
            ))}
          </ul>
          <Link href="/organizations" className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
            Explore for Organizations <ArrowRightIcon size={16} />
          </Link>
          {/* The negative bottom margin eats the section's bottom padding (desktop only: on mobile
              the visual column follows), so the cutout rests on the section edge. */}
          <Photo
            id="hero-team"
            alt="Three colleagues smiling at their laptops together"
            className="mx-auto mt-2 w-full max-w-[520px] lg:-mb-24 lg:mt-4"
            sizes="(min-width: 1024px) 520px, 100vw"
            edgeFade={[8, 4]}
          />
        </div>

        <div className="relative pb-24 sm:pt-16 lg:pb-0">
          <Handwritten
            family="blue"
            className="mb-4 text-center sm:absolute sm:right-0 sm:top-0 sm:z-20 sm:mb-0 sm:w-56 sm:rotate-3 sm:text-left"
          >
            Build great careers together.
          </Handwritten>
          <OrgTableMock className="relative z-10 lg:w-[78%]" />
          <Mascot
            pose="plane"
            className="absolute bottom-0 right-0 z-20 h-28 w-28 sm:-right-2 sm:h-32 sm:w-32 lg:right-0 lg:h-40 lg:w-40"
          />
        </div>
      </div>
    </Section>
  );
}
