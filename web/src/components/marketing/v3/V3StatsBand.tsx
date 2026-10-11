import Image from "next/image";
import { CurvedArrow } from "@kiwiply/ui";
import { V3_BAND_STATS } from "./placeholder-data";

/**
 * Landing-v3 stats band (desktop board, md+): the graduate mascot on the left, four big numbers
 * with hairline dividers, and the handwritten "Real People. Real Opportunities. Real Growth."
 * note on the right. The numbers live in `placeholder-data.ts`.
 */
export default function V3StatsBand() {
  return (
    <section aria-label="Kiwiply in numbers" className="relative mt-4 hidden overflow-hidden md:block">
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
          {V3_BAND_STATS.map((s, i) => (
            <li
              key={s.value}
              className={`flex flex-col items-center px-4 text-center ${i > 0 ? "lg:border-l lg:border-v2-navy/10" : ""}`}
            >
              <span className="text-[34px] font-extrabold leading-none text-v2-navy">{s.value}</span>
              <span className="mt-1.5 max-w-[150px] text-[14px] leading-snug text-v2-ink-soft">{s.label}</span>
            </li>
          ))}
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
