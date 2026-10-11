import { SparklesIcon, TargetIcon, UsersIcon, ZapIcon } from "@kiwiply/ui";
import { AboutFeatureTile } from "./shared";

/** §8.2 — four short value tiles directly under the hero. */
export default function ValuesStrip() {
  return (
    <section aria-label="What we care about" className="px-5 lg:px-8">
      <ul className="mx-auto grid max-w-[1200px] gap-3 rounded-[var(--radius-v2-card)] bg-white/70 p-3 shadow-v2-card sm:grid-cols-2 lg:grid-cols-4">
        <li>
          <AboutFeatureTile
            layout="row"
            family="amber"
            icon={<SparklesIcon size={24} />}
            title="People first"
            body="We build for real people and real career goals."
            className="h-full shadow-none"
          />
        </li>
        <li>
          <AboutFeatureTile
            layout="row"
            family="green"
            icon={<TargetIcon size={24} />}
            title="Smarter matching"
            body="AI helps you find opportunities that truly fit you."
            className="h-full shadow-none"
          />
        </li>
        <li>
          <AboutFeatureTile
            layout="row"
            family="blue"
            icon={<ZapIcon size={24} />}
            title="Less busywork"
            body="Autofill the repetitive forms and focus on what matters."
            className="h-full shadow-none"
          />
        </li>
        <li>
          <AboutFeatureTile
            layout="row"
            family="pink"
            icon={<UsersIcon size={24} />}
            title="Brighter futures"
            body="We believe a clear, fair search leads to better careers."
            className="h-full shadow-none"
          />
        </li>
      </ul>
    </section>
  );
}
