import type { ComponentType } from "react";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  InboxIcon,
  LayoutGridIcon,
  TrendingUpIcon,
  cn,
  type IconProps,
} from "@kiwiply/ui";
import { CONSULTANCY_STEPS } from "@/lib/catalog";
import { FAMILY, type Family } from "./family";
import { Container, SectionHeading } from "./parts";

/**
 * Block 3: how it works. The first three steps are the catalog's `CONSULTANCY_STEPS` (the
 * commercial side: setup, plan per person, optional help), reused as-is so this page can't drift
 * from the pricing pop-up. The catalog stops at three, so the remaining three describe what
 * happens next, with the same rule as everywhere else: consultants review and submit.
 */
const AFTER_SETUP: { title: string; body: string }[] = [
  { title: "Consultants fill and submit", body: "Autofill runs in their own browser. They review every field and press submit themselves." },
  { title: "Replies update the board", body: "Each consultant's connected Gmail moves their applications along as recruiters reply." },
  { title: "See how it's going", body: "Notes, activity and progress across your bench, shared with consent." },
];

const STEPS = [...CONSULTANCY_STEPS, ...AFTER_SETUP];

const STEP_STYLE: { Icon: ComponentType<IconProps>; family: Family }[] = [
  { Icon: LayoutGridIcon, family: "blue" },
  { Icon: BriefcaseIcon, family: "teal" },
  { Icon: TrendingUpIcon, family: "violet" },
  { Icon: CheckCircleIcon, family: "amber" },
  { Icon: InboxIcon, family: "pink" },
  { Icon: TrendingUpIcon, family: "green" },
];

export default function OrgHow() {
  return (
    <section id="how" aria-labelledby="org-how-title" className="scroll-mt-24 py-16 md:py-24">
      <Container className="flex flex-col gap-10 md:gap-12">
        <SectionHeading
          id="org-how-title"
          eyebrow="How it works"
          family="blue"
          before="A simple way to"
          accent="support every consultant."
          lede="Set up once, choose what each person needs, and keep every decision with the consultant."
        />
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          {STEPS.map((s, i) => {
            const { Icon, family } = STEP_STYLE[i];
            const fam = FAMILY[family];
            return (
              <li
                key={s.title}
                className="relative flex gap-4 rounded-[var(--radius-v2-card)] border border-v2-line/70 bg-white p-5 shadow-v2-card lg:flex-col lg:gap-3"
              >
                <span
                  aria-hidden
                  className="absolute -top-3 left-5 grid h-7 w-7 place-items-center rounded-full bg-v2-navy text-[13px] font-bold text-white lg:left-1/2 lg:-translate-x-1/2"
                >
                  {i + 1}
                </span>
                <span aria-hidden className={cn("mt-2 grid h-11 w-11 flex-none place-items-center rounded-xl lg:mx-auto lg:mt-3", fam.soft)}>
                  <Icon size={22} className={fam.icon} />
                </span>
                <div className="mt-2 flex flex-col gap-1.5 lg:mt-0 lg:text-center">
                  <h3 className="text-[15.5px] leading-snug text-v2-navy">
                    <span className="sr-only">{`Step ${i + 1}: `}</span>
                    {s.title}
                  </h3>
                  <p className="text-[13.5px] leading-relaxed text-v2-ink-soft">{s.body}</p>
                </div>
                {i < STEPS.length - 1 ? (
                  <ArrowRightIcon
                    aria-hidden
                    size={16}
                    className="absolute -right-[18px] top-1/2 z-10 hidden -translate-y-1/2 text-v2-muted lg:block"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
