import { ChartIcon, FileTextIcon, SearchIcon, TargetIcon, ZapIcon, cn, type IconProps } from "@kiwiply/ui";
import type { ComponentType } from "react";
import FeatureTile from "../FeatureTile";
import type { Family } from "../family";
import Section from "../Section";

/**
 * Pillars strip (spec 13.2 item 2): five tiles under the trust strip; a vertical list on mobile
 * with its own heading (desktop keeps the heading for screen readers only). `#autofill` is the
 * alias anchor for nav's "Autofill applications" (it lands on that tile).
 */
const PILLARS: {
  id?: string;
  icon: ComponentType<IconProps>;
  family: Family;
  title: string;
  body: string;
}[] = [
  {
    icon: SearchIcon,
    family: "blue",
    title: "Find the right jobs",
    body: "Discover opportunities that match your skills, goals and vibe.",
  },
  {
    id: "autofill",
    icon: ZapIcon,
    family: "amber",
    title: "AI autofill applications",
    body: "Accurate, fast and tailored to each job.",
  },
  {
    icon: FileTextIcon,
    family: "pink",
    title: "Smart resume selection",
    body: "Use the best resume automatically.",
  },
  {
    icon: TargetIcon,
    family: "coral",
    title: "AI-generated answers",
    body: "Get good answers for tough questions.",
  },
  {
    icon: ChartIcon,
    family: "green",
    title: "Track everything",
    body: "Keep all your applications, responses and interviews in one place.",
  },
];

export default function Pillars() {
  return (
    <Section id="pillars" labelledBy="pillars-title" className="pb-10 pt-10 lg:pb-12 lg:pt-10">
      <div className="mb-8 text-center md:sr-only md:mb-0">
        <h2 id="pillars-title" className="mx-auto max-w-sm text-[28px] text-v2-navy">
          Everything you need to get hired faster.
        </h2>
        <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-v2-ink-soft">
          Powerful AI tools to simplify your job search from start to finish.
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-6 md:gap-4 xl:grid-cols-5">
        {PILLARS.map((p, i) => (
          <li key={p.title} id={p.id} className={cn("scroll-mt-24 md:col-span-2 xl:col-span-1", i === 3 && "md:col-start-2 xl:col-start-auto", i === 4 && "md:col-start-4 xl:col-start-auto")}>
            <FeatureTile icon={p.icon} family={p.family} title={p.title} body={p.body} layout="responsive" />
          </li>
        ))}
      </ul>
    </Section>
  );
}
