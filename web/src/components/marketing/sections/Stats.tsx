import type { ComponentType } from "react";
import { CheckCircleIcon, FileTextIcon, MailIcon, ShieldCheckIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY } from "../family";
import { STATS, type Stat } from "../placeholder-data";
import Section from "../Section";

/**
 * Value band (spec 13.2 item 10): icon tile + a short statement, no numbers (we publish no counts
 * we cannot back up); 2x2 on mobile, 4-up from lg. `/v3` reuses `STATS` and `STAT_ICONS`.
 */
export const STAT_ICONS: Record<Stat["icon"], ComponentType<IconProps>> = {
  file: FileTextIcon,
  check: CheckCircleIcon,
  mail: MailIcon,
  shield: ShieldCheckIcon,
};

export default function Stats() {
  return (
    <Section labelledBy="stats-title" tone="white" className="py-3 lg:py-4" innerClassName="lg:py-8">
      <h2 id="stats-title" className="sr-only">
        What Kiwiply is built around
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-7 lg:grid-cols-4 lg:gap-6">
        {STATS.map((s) => {
          const Icon = STAT_ICONS[s.icon];
          const f = FAMILY[s.family];
          return (
            <li key={s.title} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center lg:justify-center lg:gap-4">
              <span aria-hidden className={cn("grid h-14 w-14 flex-none place-items-center rounded-2xl", f.soft, f.icon)}>
                <Icon className="h-7 w-7" />
              </span>
              <p className="max-w-[11rem] text-[18px] font-extrabold leading-snug text-v2-navy lg:text-[19px]">{s.title}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
