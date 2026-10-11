import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon, ClockIcon, buttonVariants } from "@kiwiply/ui";
import { Mascot } from "../media";
import { AboutHeading, AboutSection } from "./shared";

const LIVE_TODAY = [
  "One profile, built from your resume",
  "Autofill on Workday, Greenhouse, Lever, Ashby and Workable that you review before you submit",
  "A board for every application, with Gmail replies tracked alongside",
];

const COMING = [
  "Autopilot: batches of applications prepared in your own browser, which you review and submit",
  "Interview practice, to rehearse before the real thing",
];

/** §8.8 — "Our story": short, true; built in 2026, in beta, small team; live today vs coming. */
export default function Story() {
  return (
    <AboutSection labelledBy="story-title" className="pt-0 lg:pt-0">
      <div className="grid items-center gap-10 rounded-[28px] bg-gradient-to-br from-v2-blue-soft via-white to-v2-lime-soft p-6 shadow-v2-card md:p-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:p-14">
        <div>
          <AboutHeading id="story-title" eyebrow="Our story" title="Built for" accent="brighter careers." />
          <p className="mt-5 text-base leading-relaxed text-ink-soft md:text-lg">
            Kiwiply started in 2026 with a simple idea: job searching should be more human and less
            hectic. A small team is building it, and it&rsquo;s in beta today, so it&rsquo;s improving
            all the time. Here&rsquo;s where it stands.
          </p>
          <Link href="#mission" className={buttonVariants("accent", "lg", "mt-7 min-h-11 w-full sm:w-auto")}>
            Our mission
            <ArrowRightIcon size={16} aria-hidden />
          </Link>
        </div>

        <div className="relative grid gap-4">
          <div className="rounded-[var(--radius-v2-card)] bg-white p-5 shadow-v2-card">
            <h3 className="text-base font-bold tracking-normal text-ink">Live today (beta)</h3>
            <ul className="mt-3 grid gap-2.5">
              {LIVE_TODAY.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-soft">
                  <CheckCircleIcon size={18} aria-hidden className="mt-0.5 flex-none text-v2-green" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius-v2-card)] bg-white p-5 shadow-v2-card">
            <h3 className="text-base font-bold tracking-normal text-ink">Coming next</h3>
            <ul className="mt-3 grid gap-2.5">
              {COMING.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-soft">
                  <ClockIcon size={18} aria-hidden className="mt-0.5 flex-none text-v2-violet" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <Mascot pose="laptop" className="absolute -right-3 -top-14 hidden h-24 w-24 md:block lg:-right-8" />
        </div>
      </div>
    </AboutSection>
  );
}
