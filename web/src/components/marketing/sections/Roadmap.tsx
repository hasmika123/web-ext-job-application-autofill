import type { ComponentType } from "react";
import { CheckCircleIcon, ClockIcon, cn, type IconProps } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import { ROADMAP, type RoadmapStatus } from "../partners-data";
import Section from "../Section";

/**
 * "Where Kiwiply works next": what is supported now, what is being built and what is planned.
 * Chips are check (now), clock (in progress) and dot (planned). Anchor target of the trust strip's
 * "See what's next" link. Lists live in `partners-data.ts` and must be edited when support changes.
 */

function Dot({ className }: IconProps) {
  return (
    <span aria-hidden className={cn("grid place-items-center", className)}>
      <span className="h-2 w-2 rounded-full bg-current" />
    </span>
  );
}

const CHIP: Record<RoadmapStatus, { Icon: ComponentType<IconProps>; icon: string; chip: string; label: string }> = {
  now: { Icon: CheckCircleIcon, icon: "text-v2-green", chip: "border-v2-green/30 bg-v2-green-soft text-v2-navy", label: "Available now" },
  progress: { Icon: ClockIcon, icon: "text-v2-amber", chip: "border-v2-amber/30 bg-v2-amber-soft text-v2-navy", label: "In progress" },
  planned: { Icon: Dot, icon: "text-v2-muted", chip: "border-v2-line bg-white text-v2-ink-soft", label: "Planned" },
};

export default function Roadmap() {
  return (
    <Section id="roadmap" labelledBy="roadmap-title" className="py-10 lg:py-14">
      <div className="flex flex-col items-center gap-3 text-center">
        <Eyebrow family="green">Roadmap</Eyebrow>
        <h3 id="roadmap-title" className="text-[24px] font-extrabold leading-tight text-v2-navy md:text-[28px]">
          Where Kiwiply works next
        </h3>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
        {ROADMAP.map((col) => {
          const c = CHIP[col.status];
          return (
            <div key={col.status} className="rounded-[20px] border border-v2-line/60 bg-white p-5 shadow-v2-card">
              <p className="text-[15px] font-bold text-v2-navy">{col.title}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {col.items.map((item) => (
                  <li
                    key={item}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13.5px] font-medium leading-none",
                      c.chip,
                    )}
                  >
                    <c.Icon aria-hidden className={cn("h-4 w-4 flex-none", c.icon)} />
                    <span>
                      {item}
                      <span className="sr-only"> ({c.label})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
