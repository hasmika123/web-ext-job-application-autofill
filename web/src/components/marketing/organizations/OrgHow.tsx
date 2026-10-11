import type { ComponentType } from "react";
import {
  ArrowRightIcon,
  BellIcon,
  BriefcaseIcon,
  CalendarIcon,
  TargetIcon,
  UsersIcon,
  ZapIcon,
  cn,
  type IconProps,
} from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import SectionHeading from "../SectionHeading";
import { Container } from "./parts";

/** Block 3: "How It Works". Six steps, as on the board; vertical list on mobile. */
interface Step {
  title: string;
  body: string;
  Icon: ComponentType<IconProps>;
  family: Family;
  /** Number badge colour (solid). */
  badge: string;
}

const STEPS: Step[] = [
  {
    title: "Import or add employee profiles",
    body: "Easily import your team’s data or add profiles manually.",
    Icon: UsersIcon,
    family: "violet",
    badge: "bg-v2-violet",
  },
  {
    title: "Assign support owners",
    body: "Connect each employee with a coach or recruiter to guide their search.",
    Icon: BriefcaseIcon,
    family: "blue",
    badge: "bg-v2-blue",
  },
  {
    title: "Match opportunities",
    body: "Use AI to find the most relevant job opportunities for each person.",
    Icon: TargetIcon,
    family: "green",
    badge: "bg-v2-green",
  },
  {
    title: "Help apply faster",
    body: "Streamline applications with tailored resumes and automation tools.",
    Icon: ZapIcon,
    family: "amber",
    badge: "bg-v2-amber",
  },
  {
    title: "Track responses and interviews",
    body: "Monitor progress and stay on top of next steps in real time.",
    Icon: BellIcon,
    family: "pink",
    badge: "bg-v2-pink",
  },
  {
    title: "Measure outcomes",
    body: "Track placements and demonstrate your impact.",
    Icon: CalendarIcon,
    family: "blue",
    badge: "bg-v2-blue",
  },
];

export default function OrgHow() {
  return (
    <section id="how" aria-labelledby="org-how-title" className="scroll-mt-20 py-12 md:py-16">
      <Container>
        <SectionHeading
          id="org-how-title"
          eyebrow="How It Works"
          family="green"
          title="A simple process for"
          accent="better placement outcomes."
          accentFamily="green"
          align="center"
        />

        <ol className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          {STEPS.map((s, n) => {
            const f = FAMILY[s.family];
            const last = n === STEPS.length - 1;
            return (
              <li
                key={s.title}
                className="relative flex items-start gap-4 rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-4 shadow-v2-card lg:flex-col lg:items-center lg:gap-3 lg:px-4 lg:pb-6 lg:pt-5 lg:text-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold text-white shadow-sm lg:left-3 lg:top-3",
                    s.badge,
                  )}
                >
                  {n + 1}
                </span>
                <span className={cn("grid h-12 w-12 flex-none place-items-center rounded-2xl lg:h-14 lg:w-14", f.soft, f.icon)}>
                  <s.Icon className="h-6 w-6" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-[15px] font-bold leading-snug tracking-normal text-v2-navy">
                    <span className="sr-only">Step {n + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-v2-ink-soft">{s.body}</p>
                </div>
                {last ? null : (
                  <ArrowRightIcon
                    aria-hidden
                    className="absolute -right-[18px] top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-v2-blue lg:block"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
