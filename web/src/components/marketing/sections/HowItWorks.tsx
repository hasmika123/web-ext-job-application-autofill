import type { ComponentType } from "react";
import { ArrowRightIcon, InboxIcon, SearchIcon, TrophyIcon, ZapIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, type Family } from "../family";
import Section from "../Section";
import SectionHeading from "../SectionHeading";

/**
 * How it works (spec 7.2 item 8): four steps in cards with connector arrows. Every step ends
 * with "you stay in control" wording, because that is the product: Kiwiply prepares, you decide.
 */
const STEPS: { icon: ComponentType<IconProps>; family: Family; title: string; body: string }[] = [
  {
    icon: SearchIcon,
    family: "amber",
    title: "Find jobs",
    body: "Roles from company job boards, matched to your resume. You choose which ones are worth your time.",
  },
  {
    icon: ZapIcon,
    family: "blue",
    title: "Autofill with AI",
    body: "Open an application and Kiwiply fills the fields. You check each one and press submit yourself.",
  },
  {
    icon: InboxIcon,
    family: "teal",
    title: "Track replies",
    body: "Connect your Gmail and replies update your board. We never send, move or delete your mail.",
  },
  {
    icon: TrophyIcon,
    family: "coral",
    title: "Get hired",
    body: "Offers, notes and next steps stay in one place. Every call along the way is yours.",
  },
];

export default function HowItWorks() {
  return (
    <Section id="how" labelledBy="how-title">
      <SectionHeading
        id="how-title"
        eyebrow="How it works"
        family="blue"
        title="Get from search to interview,"
        accent="faster."
        lede="Kiwiply handles the busy work so you can focus on what really matters — and you stay in control the whole way."
        align="center"
        className="mx-auto"
      />
      <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch lg:gap-3">
        {STEPS.map((s, i) => {
          const f = FAMILY[s.family];
          return (
            <li key={s.title} className="contents">
              <div className="flex flex-col items-start gap-3 rounded-[var(--radius-v2-card)] border border-v2-line/60 bg-white p-6 shadow-v2-card">
                <div className="flex w-full items-center justify-between">
                  <span aria-hidden className={cn("grid h-12 w-12 place-items-center rounded-2xl", f.soft, f.icon)}>
                    <s.icon className="h-6 w-6" />
                  </span>
                  <span aria-hidden className="text-[13px] font-bold text-v2-muted">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="text-[18px] font-bold tracking-normal text-v2-navy">{s.title}</h3>
                <p className="text-[14px] leading-relaxed text-v2-ink-soft">{s.body}</p>
              </div>
              {i < STEPS.length - 1 ? (
                <span aria-hidden className="hidden items-center text-v2-lime-deep lg:flex">
                  <ArrowRightIcon size={20} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
