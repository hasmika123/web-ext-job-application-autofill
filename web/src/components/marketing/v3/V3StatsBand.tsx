import Image from "next/image";
import { CurvedArrow } from "@kiwiply/ui";
import { STAT_ICONS } from "../sections/Stats";
import { STATS } from "../placeholder-data";

/**
 * Landing-v3 stats band (desktop board, md+): the graduate mascot on the left, four short value statements
 * with hairline dividers, and the handwritten "Real People. Real Opportunities. Real Growth."
 * note on the right. The statements are the shared `STATS` (no numbers: we publish no counts we cannot back up).
 */
export default function V3StatsBand() {
  return (
    <section aria-label="What Kiwiply is built around" className="relative mt-4 hidden overflow-hidden md:block">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_0%_100%,rgba(132,227,61,.3),transparent_40%),radial-gradient(ellipse_at_100%_100%,rgba(132,227,61,.26),transparent_38%),linear-gradient(180deg,#EAF4FF,#F3F8FF)]"
      />
      <div className="relative mx-auto flex max-w-[1440px] items-center gap-4 px-8 py-8 lg:gap-8 lg:pl-28 xl:pr-24">
        <Image
          src="/v2/app/mascot-grad-big.png"
          alt="The Kiwiply mascot in a graduation cap"
          width={147}
          height={120}
          sizes="150px"
          className="-mb-8 h-auto w-[130px] flex-none self-end lg:w-[150px] lg:-ml-16"
        />
        <ul className="grid flex-1 grid-cols-2 gap-y-6 lg:grid-cols-4 lg:gap-y-0">
          {STATS.map((s, i) => {
            const Icon = STAT_ICONS[s.icon];
            return (
              <li
                key={s.title}
                className={`flex flex-col items-center gap-2.5 px-4 text-center ${i > 0 ? "lg:border-l lg:border-v2-navy/10" : ""}`}
              >
                <Icon aria-hidden className="h-7 w-7 text-v2-green" />
                <span className="max-w-[170px] text-[18px] font-extrabold leading-snug text-v2-navy">{s.title}</span>
              </li>
            );
          })}
        </ul>
        <div aria-hidden className="relative hidden w-[210px] flex-none font-[family-name:var(--font-hand)] text-[26px] leading-[1.05] text-[#232A86] xl:block">
          <p className="-rotate-[8deg]">
            Real People.
            <br />
            Real Opportunities.
            <br />
            Real Growth.
          </p>
          <CurvedArrow direction="up-right" className="absolute -bottom-5 right-6 h-8 w-12 text-v2-blue" />
        </div>
      </div>
    </section>
  );
}
