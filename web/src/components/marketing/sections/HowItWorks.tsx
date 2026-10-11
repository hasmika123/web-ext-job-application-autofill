import type { ComponentType } from "react";
import { ArrowRightIcon, FileTextIcon, HeartIcon, PaperPlane, SearchIcon, Squiggle, ZapIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, type Family } from "../family";
import Handwritten from "../Handwritten";
import { Mascot } from "../media";
import Section from "../Section";
import SectionHeading from "../SectionHeading";

/**
 * How it works (spec 13.2 item 7): heading left, four round-icon step cards right joined by
 * arrows; vertical on mobile (arrows point down), closed by the mascot on a paper plane with the
 * "Same goals. Bigger possibilities." note.
 */
const STEPS: { icon: ComponentType<IconProps>; family: Family; title: string; body: string }[] = [
  { icon: SearchIcon, family: "amber", title: "Find jobs", body: "We find jobs that match your profile." },
  { icon: ZapIcon, family: "blue", title: "Apply with AI", body: "We autofill and tailor your application." },
  { icon: FileTextIcon, family: "teal", title: "Track progress", body: "We monitor responses and keep you updated." },
  { icon: HeartIcon, family: "coral", title: "Get hired", body: "You focus on what's next." },
];

export default function HowItWorks() {
  return (
    <Section id="how" labelledBy="how-title" tone="white">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[0.8fr_1.9fr] lg:items-center lg:gap-10">
        <SectionHeading
          id="how-title"
          eyebrow="How It Works"
          family="green"
          caps
          title="Get from search to interview, faster."
          lede="Kiwiply handles the busy work — so you can focus on what really matters."
        />
        <ol className="flex flex-col items-stretch gap-1 lg:flex-row lg:items-stretch lg:gap-2">
          {STEPS.map((s, i) => {
            const f = FAMILY[s.family];
            return (
              <li key={s.title} className="contents">
                <div className="flex flex-1 items-center gap-4 rounded-[var(--radius-v2-card)] border border-v2-line/60 bg-white p-4 shadow-v2-card lg:flex-col lg:gap-3 lg:px-4 lg:py-6 lg:text-center">
                  <span aria-hidden className={cn("grid h-14 w-14 flex-none place-items-center rounded-full", f.soft, f.icon)}>
                    <s.icon className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="text-[16px] font-bold tracking-normal text-v2-navy">{s.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-v2-ink-soft">{s.body}</p>
                  </div>
                </div>
                {i < STEPS.length - 1 ? (
                  <span aria-hidden className="flex justify-start py-0.5 pl-9 text-v2-teal lg:items-center lg:justify-center lg:p-0">
                    <ArrowRightIcon size={18} className="rotate-90 lg:rotate-0" />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      {/* Mobile only: the paper-plane mascot closes the steps. */}
      <div aria-hidden className="mt-6 flex items-end justify-center gap-2 lg:hidden">
        <Handwritten family="green" className="mb-10 w-36 -rotate-3 text-[24px]">
          Same goals. Bigger possibilities.
        </Handwritten>
        <Squiggle className="mb-14 hidden h-5 w-12 text-v2-violet sm:block" />
        <PaperPlane className="mb-12 h-8 w-14 text-v2-blue" />
        <Mascot pose="plane" className="-mb-4 h-28 w-28" />
      </div>
    </Section>
  );
}
