import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  RefreshIcon,
  TrophyIcon,
  UserIcon,
  cn,
  type IconProps,
} from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import { FAMILY, type Family } from "../family";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import SectionHeading from "../SectionHeading";

/**
 * For individuals (spec 7.2 item 9): audience rows linking to sign-up, the student cutout on the
 * right (it already contains the mascot) sitting flush on the bottom edge of the section.
 */
const AUDIENCES: { icon: ComponentType<IconProps>; family: Family; label: string }[] = [
  { icon: GraduationCapIcon, family: "teal", label: "Students" },
  { icon: TrophyIcon, family: "green", label: "New grads" },
  { icon: RefreshIcon, family: "violet", label: "Career switchers" },
  { icon: BriefcaseIcon, family: "amber", label: "Freelancers & contractors" },
  { icon: UserIcon, family: "blue", label: "Professionals" },
  { icon: CalendarIcon, family: "pink", label: "Returning to work" },
];

export default function ForIndividuals() {
  return (
    <Section id="individuals" labelledBy="individuals-title">
      <div className="grid grid-cols-[minmax(0,1fr)] items-end gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div className="flex flex-col items-start gap-6 lg:self-center">
          <SectionHeading
            id="individuals-title"
            eyebrow="For individuals"
            family="green"
            title="Land your"
            accent="next role."
          />
          <ul className="w-full max-w-md overflow-hidden rounded-[var(--radius-v2-card)] border border-v2-line/60 bg-white shadow-v2-card">
            {AUDIENCES.map((a, i) => (
              <li key={a.label} className={cn(i > 0 && "border-t border-v2-line/60")}>
                <Link
                  href={SIGNUP_HREF}
                  className="group flex min-h-14 items-center gap-3.5 px-4 py-2.5 transition-colors hover:bg-v2-canvas focus-visible:bg-v2-canvas"
                >
                  <span
                    aria-hidden
                    className={cn("grid h-9 w-9 flex-none place-items-center rounded-xl", FAMILY[a.family].soft, FAMILY[a.family].icon)}
                  >
                    <a.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-semibold text-v2-navy">{a.label}</span>
                  <ChevronRightIcon
                    aria-hidden
                    className="h-4 w-4 flex-none text-v2-muted transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
          <Link href={SIGNUP_HREF} className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
            Get Started Free <ArrowRightIcon size={16} />
          </Link>
        </div>

        {/* Negative bottom margin eats the section's bottom padding: the cutout's flat bottom edge
            lands exactly on the section edge instead of floating above it. */}
        <div className="relative -mb-16 sm:pt-12 lg:-mb-24">
          <Handwritten
            family="green"
            className="mb-3 text-center sm:absolute sm:right-6 sm:top-0 sm:z-20 sm:mb-0 sm:w-64 sm:rotate-3 sm:text-left"
          >
            Your next chapter starts here.
          </Handwritten>
          <Photo
            id="hero-student"
            alt="A student thinking about her next role at a laptop, with the Kiwiply mascot peeking in"
            className="mx-auto w-[88%] max-w-[500px] lg:ml-auto lg:mr-0 lg:w-full"
            sizes="(min-width: 1024px) 500px, 88vw"
            edgeFade={[10, 3]}
            eager
          />
        </div>
      </div>
    </Section>
  );
}
