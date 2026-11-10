import type { ComponentType } from "react";
import { SparklesIcon, TargetIcon, UsersIcon, ZapIcon, cn, type IconProps } from "@kiwiply/ui";
import { IconTile, type Family } from "./shared";

const VALUES: Array<{
  title: string;
  body: string;
  family: Family;
  icon: ComponentType<IconProps>;
}> = [
  {
    title: "People first",
    body: "We’re building for real people and real career goals.",
    family: "amber",
    icon: SparklesIcon,
  },
  {
    title: "Smarter matching",
    body: "AI helps you find opportunities that truly fit you.",
    family: "green",
    icon: TargetIcon,
  },
  {
    title: "Less busywork",
    body: "Automate applications and focus on what matters.",
    family: "blue",
    icon: ZapIcon,
  },
  {
    title: "Brighter futures",
    body: "We believe great jobs create brighter lives.",
    family: "pink",
    icon: UsersIcon,
  },
];

/** Values strip under the hero: four icon + title + one-liner items in one white bar. */
export default function ValuesStrip() {
  return (
    <section aria-label="What we stand for" className="px-5 lg:px-8">
      <ul className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-4 gap-y-6 rounded-[28px] bg-white p-5 shadow-v2-card md:gap-x-6 xl:grid-cols-4 xl:gap-0 xl:px-4 xl:py-5">
        {VALUES.map(({ title, body, family, icon: Icon }, i) => (
          <li
            key={title}
            className={cn(
              "flex flex-col items-center gap-3 text-center md:flex-row md:items-center md:gap-4 md:px-3 md:text-left xl:px-5",
              i > 0 && "xl:border-l xl:border-v2-line",
            )}
          >
            <IconTile family={family} className="h-14 w-14">
              <Icon size={26} />
            </IconTile>
            <div>
              <h3 className="text-[16px] font-bold leading-snug tracking-normal text-v2-navy">{title}</h3>
              <p className="mt-1 text-[13.5px] leading-snug text-v2-ink-soft">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
