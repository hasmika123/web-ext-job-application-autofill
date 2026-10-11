import { ChartIcon, FileTextIcon, SearchIcon, SparklesIcon, ZapIcon, type IconProps } from "@kiwiply/ui";
import type { ComponentType } from "react";
import FeatureTile from "../FeatureTile";
import type { Family } from "../family";
import Section from "../Section";

/**
 * Pillars strip (spec 7.2 item 3): five tiles under the trust strip. Each body is one honest
 * sentence. The "Pro" chip sits only on the tile that is actually gated: Kiwiply AI drafting.
 * Core autofill is free and identical in both tiers, so the autofill tile carries no chip.
 * `#autofill` is the alias anchor for nav's "Autofill applications" (it lands on that tile).
 */
const PILLARS: {
  id?: string;
  icon: ComponentType<IconProps>;
  family: Family;
  title: string;
  body: string;
  chip?: string;
}[] = [
  {
    icon: SearchIcon,
    family: "blue",
    title: "Find the right jobs",
    body: "Fresh roles from company job boards, scored against your resume and preferences.",
  },
  {
    id: "autofill",
    icon: ZapIcon,
    family: "amber",
    title: "AI autofill",
    body: "Fills the application form from your profile. You review every field and press submit.",
  },
  {
    icon: FileTextIcon,
    family: "pink",
    title: "Best resume per job",
    body: "Keep tailored variants and let Kiwiply suggest the best one for each posting.",
  },
  {
    icon: SparklesIcon,
    family: "violet",
    title: "AI-drafted answers",
    body: "Open-ended questions get a draft you edit. Kiwiply AI on Pro, or bring your own key on Free.",
    chip: "Pro",
  },
  {
    icon: ChartIcon,
    family: "green",
    title: "Track everything",
    body: "Every application lands on one board, updated from your inbox as replies arrive.",
  },
];

export default function Pillars() {
  return (
    <Section id="pillars" labelledBy="pillars-title" className="py-12 lg:py-16">
      <h2 id="pillars-title" className="sr-only">
        What Kiwiply does
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {PILLARS.map((p) => (
          <li
            key={p.title}
            id={p.id}
            className="scroll-mt-24 last:col-span-2 lg:last:col-span-1"
          >
            <FeatureTile icon={p.icon} family={p.family} title={p.title} body={p.body} chip={p.chip} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
