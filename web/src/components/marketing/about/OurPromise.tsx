import { BellIcon, LayoutGridIcon, TargetIcon, ZapIcon } from "@kiwiply/ui";
import { AboutFeatureTile, AboutHeading, AboutSection } from "./shared";

/** §8.7 — "Our promise": four commitments. */
export default function OurPromise() {
  return (
    <AboutSection labelledBy="promise-title" className="pt-0 lg:pt-0">
      <AboutHeading
        id="promise-title"
        eyebrow="Our promise"
        title="A simpler job search,"
        accent="brighter tomorrows."
      />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <li>
          <AboutFeatureTile
            family="blue"
            icon={<ZapIcon size={24} />}
            title="Less busywork"
            body="Let AI handle the repetitive parts so you can focus on what matters."
            className="h-full"
          />
        </li>
        <li>
          <AboutFeatureTile
            family="green"
            icon={<TargetIcon size={24} />}
            title="Better job matches"
            body="Find opportunities that line up with your skills, interests and goals."
            className="h-full"
          />
        </li>
        <li>
          <AboutFeatureTile
            family="amber"
            icon={<BellIcon size={24} />}
            title="Never miss an update"
            body="Replies from employers show up next to the application they belong to."
            className="h-full"
          />
        </li>
        <li>
          <AboutFeatureTile
            family="violet"
            icon={<LayoutGridIcon size={24} />}
            title="Everything in one place"
            body="From first search to offer, manage your whole journey on one board."
            className="h-full"
          />
        </li>
      </ul>
    </AboutSection>
  );
}
