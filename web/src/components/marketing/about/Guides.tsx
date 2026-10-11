import {
  ChartIcon,
  HeartIcon,
  LayersIcon,
  ShieldCheckIcon,
  StarIcon,
  UsersIcon,
} from "@kiwiply/ui";
import { AboutFeatureTile, AboutHeading, AboutSection } from "./shared";

/** §8.6 — "What guides us every day": six values. */
export default function Guides() {
  return (
    <AboutSection labelledBy="guides-title" className="pt-0 lg:pt-0">
      <AboutHeading id="guides-title" eyebrow="Our values" title="What guides us every day." />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <AboutFeatureTile
            layout="row"
            family="amber"
            icon={<StarIcon size={24} />}
            title="People first"
            body="Real people, real goals, real impact."
            className="h-full"
          />
        </li>
        <li>
          <AboutFeatureTile
            layout="row"
            family="green"
            icon={<LayersIcon size={24} />}
            title="Simplicity"
            body="Less complexity, more progress."
            className="h-full"
          />
        </li>
        <li>
          <AboutFeatureTile
            layout="row"
            family="violet"
            icon={<UsersIcon size={24} />}
            title="Opportunity for everyone"
            body="A fairer, more open job search, whatever your starting point."
            className="h-full"
          />
        </li>
        <li>
          <AboutFeatureTile
            layout="row"
            family="blue"
            icon={<ChartIcon size={24} />}
            title="Progress with confidence"
            body="Tools that help you move forward with clarity."
            className="h-full"
          />
        </li>
        <li>
          <AboutFeatureTile
            layout="row"
            family="pink"
            icon={<ShieldCheckIcon size={24} />}
            title="Privacy & trust"
            body="Your data is yours. Delete it any time."
            className="h-full"
          />
        </li>
        <li>
          <AboutFeatureTile
            layout="row"
            family="teal"
            icon={<HeartIcon size={24} />}
            title="Human-centred AI"
            body="AI drafts, you decide. Kiwiply never auto-submits an application."
            className="h-full"
          />
        </li>
      </ul>
    </AboutSection>
  );
}
