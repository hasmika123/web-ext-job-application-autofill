import { UsersIcon } from "@kiwiply/ui";
import { Photo } from "../media";
import { V3CheckRow, V3Cta, V3Pill } from "./parts";

/**
 * "Empower your people. Grow together." (phone board, For Organizations): the heading with a small
 * CSS bar-chart doodle, four-point checklist, "Explore for Organizations" and the team photo. md+:
 * copy left, photo right.
 */
const POINTS = ["Manage multiple employees", "Track team applications", "Role-based access", "Analytics and reporting"];

function BarsDoodle() {
  return (
    <span aria-hidden className="absolute right-0 top-1 flex h-9 md:left-full md:right-auto md:ml-3 items-end gap-1 text-v2-green">
      <i className="block h-3 w-2.5 rounded-sm border-2 border-current" />
      <i className="block h-5 w-2.5 rounded-sm border-2 border-current" />
      <i className="block h-8 w-2.5 rounded-sm border-2 border-current" />
    </span>
  );
}

export default function V3Organizations() {
  return (
    <section id="organizations" aria-labelledby="v3-org-title" className="scroll-mt-20 overflow-x-clip px-5 py-6 lg:px-8">
      <div className="relative mx-auto max-w-[1100px] overflow-hidden rounded-[28px] bg-gradient-to-br from-[#F3F8FF] via-white to-v2-lime-soft/70 px-6 pt-10 md:px-10 lg:rounded-[32px] lg:px-14 lg:pt-14">
        <div className="grid grid-cols-[minmax(0,1fr)] items-end gap-6 md:grid-cols-2 md:gap-10">
          <div className="flex flex-col items-start pb-2 md:pb-14">
            <V3Pill>For Organizations</V3Pill>
            <div className="relative mt-4 w-fit max-w-full">
              <h2 id="v3-org-title" className="text-[32px] text-v2-navy md:text-[clamp(28px,3.7vw,38px)]">
                <span className="md:whitespace-nowrap">Empower your people.</span>
                <br />
                <span className="text-v2-green">Grow together.</span>
              </h2>
              <BarsDoodle />
            </div>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-v2-ink-soft md:text-[16px]">
              Help your team find opportunities faster with AI, tracking, analytics and powerful collaboration tools.
            </p>
            <ul className="mt-6 space-y-3.5">
              {POINTS.map((p, i) =>
                i === 0 ? (
                  <li key={p} className="flex items-center gap-3 text-[14.5px] font-medium text-v2-ink-soft">
                    <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-full bg-v2-green text-white">
                      <UsersIcon className="h-3.5 w-3.5" />
                    </span>
                    {p}
                  </li>
                ) : (
                  <V3CheckRow key={p}>{p}</V3CheckRow>
                ),
              )}
            </ul>
            <div className="mt-7 w-full sm:w-auto">
              <V3Cta href="/organizations">Explore for Organizations</V3Cta>
            </div>
          </div>
          <div className="relative -mx-2 md:mx-0">
            <Photo
              id="hero-team"
              alt="Three colleagues smiling at their laptops together"
              className="mx-auto w-full max-w-[420px] md:-mr-10 md:ml-auto md:w-[calc(100%+2.5rem)] md:max-w-none lg:-mr-14 lg:w-[calc(100%+3.5rem)]"
              sizes="(min-width: 768px) 480px, 100vw"
              edgeFade={[6, 4]}
              topFade={10}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
