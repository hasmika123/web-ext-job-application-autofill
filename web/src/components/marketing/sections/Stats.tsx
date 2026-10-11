import type { ComponentType } from "react";
import { ChartIcon, FileTextIcon, RocketIcon, ZapIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY } from "../family";
import { STATS, type Stat } from "../placeholder-data";
import Section from "../Section";

/** Stats row (spec 13.2 item 10): icon tile + big number + label; 2x2 on mobile, 4-up from lg. */
const ICONS: Record<Stat["icon"], ComponentType<IconProps>> = {
  zap: ZapIcon,
  rocket: RocketIcon,
  chart: ChartIcon,
  file: FileTextIcon,
};

export default function Stats() {
  return (
    <Section labelledBy="stats-title" tone="white" className="py-3 lg:py-4" innerClassName="lg:py-8">
      <h2 id="stats-title" className="sr-only">
        Kiwiply in numbers
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-7 lg:grid-cols-4 lg:gap-6">
        {STATS.map((s) => {
          const Icon = ICONS[s.icon];
          const f = FAMILY[s.family];
          return (
            <li key={s.label} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center lg:justify-center lg:gap-4">
              <span aria-hidden className={cn("grid h-14 w-14 flex-none place-items-center rounded-2xl", f.soft, f.icon)}>
                <Icon className="h-7 w-7" />
              </span>
              <div>
                <p className="text-[32px] font-extrabold leading-none text-v2-navy lg:text-[34px]">{s.value}</p>
                <p className="mt-1 max-w-[9.5rem] text-[13.5px] leading-snug text-v2-ink-soft">{s.label}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
