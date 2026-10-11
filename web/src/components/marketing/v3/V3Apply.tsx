import Image from "next/image";
import { ClipboardIcon, SparkBurst, StarDoodle } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { V3CheckRow, V3Cta, V3Pill } from "./parts";

/**
 * "Apply with AI on LinkedIn + major ATS" (phone board, column 2): the heading, a cluster of site
 * tiles around the laptop mascot with the "One click. Multiple sites." note, the four-step
 * checklist card and "See How It Works". md+: copy and checklist left, art right.
 */
const CHECKS = ["Analyze job description", "Select best resume", "Fill application forms", "Generate tailored answers"];

function SiteTiles() {
  return (
    <div className="relative mx-auto h-[270px] w-full max-w-[360px] md:h-[320px]">
      <span
        aria-hidden
        className="absolute left-[22%] top-[16%] z-10 grid h-[88px] w-[88px] place-items-center rounded-[22px] bg-white shadow-v2-float"
      >
        <span className="grid h-[58px] w-[58px] place-items-center rounded-xl bg-[#0A66C2] text-[34px] font-extrabold leading-none text-white">
          in
        </span>
      </span>
      <span aria-hidden className="absolute left-[4%] top-[42%] z-10 grid h-[68px] w-[68px] -rotate-6 place-items-center rounded-[18px] bg-white shadow-v2-float">
        <span className="text-[34px] font-extrabold leading-none text-[#24A47F]">g</span>
      </span>
      <span aria-hidden className="absolute left-[38%] top-[44%] z-10 grid h-[52px] w-[52px] rotate-6 place-items-center rounded-2xl bg-white text-[#F5A623] shadow-v2-float">
        <ClipboardIcon className="h-7 w-7" />
      </span>
      <StarDoodle aria-hidden className="absolute left-[2%] top-[8%] h-5 w-5 text-v2-lime-deep" />
      <SparkBurst aria-hidden className="absolute right-[6%] top-[2%] h-9 w-9 -rotate-12 text-v2-green" />
      <StarDoodle aria-hidden className="absolute bottom-[8%] left-[4%] h-5 w-5 text-[#F5C400]" />
      <Handwritten ink="navy" className="absolute right-0 top-[18%] z-10 w-[120px] rotate-6 text-[22px]">
        One click.
        <br />
        Multiple sites.
      </Handwritten>
      <Image
        src="/v2/app/mascot-laptop-big.png"
        alt="The Kiwiply mascot at a laptop"
        width={270}
        height={254}
        sizes="200px"
        className="absolute bottom-0 right-[2%] h-auto w-[56%] max-w-[200px]"
      />
    </div>
  );
}

export default function V3Apply() {
  return (
    <section
      id="apply"
      aria-labelledby="v3-apply-title"
      className="relative scroll-mt-20 overflow-x-clip bg-gradient-to-b from-transparent via-v2-lime-soft/50 to-transparent px-5 py-12 lg:px-8 lg:py-16"
    >
      <div className="mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] items-center gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col items-start md:order-1">
          <V3Pill>Let AI do the busy work</V3Pill>
          <h2 id="v3-apply-title" className="mt-4 text-[32px] text-v2-navy md:text-[38px]">
            Apply with AI
            <br />
            on <span className="text-v2-green">LinkedIn + major ATS</span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-v2-ink-soft md:text-[16px]">
            Kiwiply fills forms, generates tailored answers, and selects the best resume — so you can focus on what
            really matters.
          </p>
          <div className="mt-6 hidden w-full max-w-md md:block">
            <Checklist />
          </div>
        </div>
        <div className="md:order-2">
          <SiteTiles />
        </div>
        <div className="md:hidden">
          <Checklist />
        </div>
        <div className="md:order-3 md:col-span-2 md:flex md:justify-center">
          <V3Cta href="#steps">
            See How It Works
          </V3Cta>
        </div>
      </div>
    </section>
  );
}

function Checklist() {
  return (
    <ul className="space-y-3.5 rounded-[20px] border border-v2-line/50 bg-white p-5 shadow-v2-card">
      {CHECKS.map((c) => (
        <V3CheckRow key={c}>{c}</V3CheckRow>
      ))}
    </ul>
  );
}
