import { cn } from "@kiwiply/ui";
import { FAMILY } from "../family";
import { STATS } from "../placeholder-data";
import { STAT_ICONS } from "../sections/Stats";

/** "Built to keep you in control." (phone board): a 2x2 grid of value cards, four across from lg. Same copy as the landing value band. */

export default function V3Results() {
  return (
    <section aria-labelledby="v3-results-title" className="px-5 py-12 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-[1100px]">
        <h2 id="v3-results-title" className="max-w-md text-[32px] text-v2-navy md:max-w-none md:text-center md:text-[38px]">
          Built to keep you in control.
        </h2>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-v2-ink-soft md:mx-auto md:text-center md:text-[16px]">
          Build one profile, apply with less busywork, and keep every application in sight.
        </p>
        <ul className="mt-8 grid grid-cols-2 gap-3.5 lg:grid-cols-4 lg:gap-5">
          {STATS.map((r) => {
            const Icon = STAT_ICONS[r.icon];
            const f = FAMILY[r.family];
            return (
              <li
                key={r.title}
                className="flex flex-col items-center rounded-[20px] border border-v2-line/50 bg-white px-3 py-6 text-center shadow-v2-card"
              >
                <span aria-hidden className={cn("grid h-14 w-14 place-items-center rounded-2xl", f.soft, f.icon)}>
                  <Icon className="h-7 w-7" />
                </span>
                <p className="mt-3 max-w-[10.5rem] text-[18px] font-extrabold leading-snug text-v2-navy">{r.title}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
