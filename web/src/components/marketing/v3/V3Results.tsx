import type { ComponentType } from "react";
import { ChartIcon, ClockIcon, RocketIcon, ZapIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY } from "../family";
import { V3_RESULTS, type V3Result } from "./placeholder-data";

/** "Results that speak for themselves." (phone board): a 2x2 grid of stat cards, four across from lg. */
const ICONS: Record<V3Result["icon"], ComponentType<IconProps>> = {
  zap: ZapIcon,
  rocket: RocketIcon,
  chart: ChartIcon,
  clock: ClockIcon,
};

export default function V3Results() {
  return (
    <section aria-labelledby="v3-results-title" className="px-5 py-12 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-[1100px]">
        <h2 id="v3-results-title" className="max-w-md text-[32px] text-v2-navy md:max-w-none md:text-center md:text-[38px]">
          Results that speak for themselves.
        </h2>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-v2-ink-soft md:mx-auto md:text-center md:text-[16px]">
          Join thousands who are saving time and getting hired with Kiwiply.
        </p>
        <ul className="mt-8 grid grid-cols-2 gap-3.5 lg:grid-cols-4 lg:gap-5">
          {V3_RESULTS.map((r) => {
            const Icon = ICONS[r.icon];
            const f = FAMILY[r.family];
            return (
              <li
                key={r.label}
                className="flex flex-col items-center rounded-[20px] border border-v2-line/50 bg-white px-3 py-6 text-center shadow-v2-card"
              >
                <span aria-hidden className={cn("grid h-14 w-14 place-items-center rounded-2xl", f.soft, f.icon)}>
                  <Icon className="h-7 w-7" />
                </span>
                <p className="mt-3 text-[34px] font-extrabold leading-none text-v2-navy">{r.value}</p>
                <p className="mt-2 max-w-[9.5rem] text-[13.5px] leading-snug text-v2-ink-soft">{r.label}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
