import type { ComponentType } from "react";
import { ChartIcon, HeartIcon, LayersIcon, ShieldCheckIcon, StarIcon, UsersIcon, type IconProps } from "@kiwiply/ui";
import Section from "../Section";
import { IconTile, RowHeading, type Family } from "./shared";

const VALUES: Array<{ title: string; body: string; family: Family; icon: ComponentType<IconProps> }> = [
  { title: "People first", body: "Real people, real goals, real impact.", family: "amber", icon: StarIcon },
  { title: "Simplicity", body: "Less complexity, more progress.", family: "green", icon: LayersIcon },
  { title: "Opportunity for everyone", body: "A fairer, more inclusive job market.", family: "violet", icon: UsersIcon },
  {
    title: "Progress with confidence",
    body: "Tools that help you move forward with clarity.",
    family: "blue",
    icon: ChartIcon,
  },
  { title: "Privacy and trust", body: "Your data, your choice, always protected.", family: "pink", icon: ShieldCheckIcon },
  { title: "Human-centered AI", body: "AI that empowers people, not replaces them.", family: "green", icon: HeartIcon },
];

/** "What guides us every day." Six values, centred icon + title + one-liner. */
export default function Guides() {
  return (
    <Section labelledBy="guides-title" className="py-10 lg:py-14">
      <RowHeading id="guides-title" eyebrow="Our Values" title="What guides us every day." />
      <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:mt-10 lg:grid-cols-6 lg:gap-4">
        {VALUES.map(({ title, body, family, icon: Icon }) => (
          <li
            key={title}
            className="flex flex-col items-center gap-3 rounded-[var(--radius-v2-card)] bg-white p-4 text-center shadow-v2-card lg:px-3 lg:py-5"
          >
            <IconTile family={family} className="h-14 w-14 rounded-full">
              <Icon size={26} />
            </IconTile>
            <h3 className="text-[15px] font-bold leading-snug tracking-normal text-v2-navy">{title}</h3>
            <p className="text-[13.5px] leading-snug text-v2-ink-soft">{body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
