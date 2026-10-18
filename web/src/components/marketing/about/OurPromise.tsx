import type { ComponentType } from "react";
import { BellIcon, LayoutGridIcon, TargetIcon, ZapIcon, type IconProps } from "@kiwiply/ui";
import Section from "../Section";
import { IconTile, RowHeading, type Family } from "./shared";

const PROMISES: Array<{ title: string; body: string; family: Family; icon: ComponentType<IconProps> }> = [
  {
    title: "Less busywork",
    body: "Automate the repetitive stuff so you can focus on what matters.",
    family: "blue",
    icon: ZapIcon,
  },
  {
    title: "Better job matches",
    body: "Find opportunities that align with your skills, interests, and goals.",
    family: "green",
    icon: TargetIcon,
  },
  {
    title: "Never miss an update",
    body: "Stay informed with real-time tracking and alerts.",
    family: "amber",
    icon: BellIcon,
  },
  {
    title: "Everything in one place",
    body: "From search to offer, manage your entire journey in a single, easy-to-use platform.",
    family: "blue",
    icon: LayoutGridIcon,
  },
];

/** "A simpler job search, brighter tomorrows." Four promise tiles. */
export default function OurPromise() {
  return (
    <Section labelledBy="promise-title" className="py-10 lg:py-14">
      <RowHeading id="promise-title" eyebrow="Our Promise" title="A simpler job search," accent="brighter tomorrows." />
      <ul className="mt-8 grid grid-cols-2 gap-3 md:gap-4 lg:mt-10 xl:grid-cols-4">
        {PROMISES.map(({ title, body, family, icon: Icon }) => (
          <li
            key={title}
            className="flex flex-col items-center gap-3 rounded-[var(--radius-v2-card)] bg-white p-4 text-center shadow-v2-card md:flex-row md:items-center md:gap-4 md:p-5 md:text-left"
          >
            <IconTile family={family} className="h-14 w-14 rounded-full md:h-16 md:w-16">
              <Icon size={26} />
            </IconTile>
            <div>
              <h3 className="text-[15px] font-bold leading-snug tracking-normal text-v2-navy lg:text-[16px]">
                {title}
              </h3>
              <p className="mt-1 text-[13.5px] leading-snug text-v2-ink-soft">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
