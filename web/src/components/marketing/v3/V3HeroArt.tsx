import Image from "next/image";
import { BriefcaseIcon, CheckIcon, ChatIcon, FileTextIcon, PaperPlane, SparkBurst, StarDoodle, ZapIcon, cn } from "@kiwiply/ui";
import { CompanyTile } from "../mocks/shared";

/**
 * Desktop hero art stage for landing v3 (board: landing-v3-desktop). A fixed 780x400 canvas the
 * parent scales with a CSS transform; everything is placed in plain px. The mascot is the real
 * `/v2/app/mascot-laptop-big.png` cutout; the four floating cards are CSS (never images) so the
 * copy stays real text. The interview card's face is a crop of the existing hero portrait.
 */

const CARD =
  "absolute rounded-[18px] border border-white/80 bg-white/95 shadow-[0_18px_44px_rgba(27,31,94,.14)] backdrop-blur-sm";

function SkeletonLines({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex flex-col gap-1.5", className)}>
      <i className="block h-1.5 w-full rounded-full bg-[#DDE6F3]" />
      <i className="block h-1.5 w-4/5 rounded-full bg-[#E8EEF7]" />
    </span>
  );
}

function Tick({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid h-3.5 w-3.5 flex-none place-items-center rounded-full bg-v2-teal text-white", className)}>
      <CheckIcon className="h-2.5 w-2.5" strokeWidth={3.5} />
    </span>
  );
}

function JobRow({ name }: { name: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <CompanyTile name={name} className="h-7 w-7 rounded-lg border-0 bg-transparent" />
      <span className="flex-1 text-[11px] font-medium text-v2-navy">{name}</span>
      <span className="rounded-md bg-v2-green-soft px-2.5 py-1 text-[10px] font-bold leading-none text-[#157A2B]">Apply</span>
    </li>
  );
}

export default function V3HeroArt() {
  return (
    <div className="relative h-[400px] w-[780px]">
      {/* Soft green/blue wash behind the mascot (stands in for the board's foliage). */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 top-8 rounded-[60%] bg-[radial-gradient(ellipse_at_45%_62%,rgba(132,227,61,.34),rgba(132,227,61,0)_62%),radial-gradient(ellipse_at_88%_80%,rgba(95,191,31,.22),rgba(95,191,31,0)_52%)]"
      />

      {/* Handwriting: Plan / Apply / Grow */}
      <div
        aria-hidden
        className="absolute left-[22px] top-[18px] z-10 -rotate-[10deg] font-[family-name:var(--font-hand)] text-[40px] leading-[1.02] text-[#232A86]"
      >
        <span className="block">Plan</span>
        <span className="block pl-3">Apply</span>
        <span className="block pl-6">Grow</span>
      </div>
      <StarDoodle className="absolute left-[8px] top-[78px] z-10 h-4 w-4 rotate-12 text-[#F25C7A]" />
      <SparkBurst className="absolute left-[130px] top-[46px] z-10 h-7 w-7 text-v2-lime-deep" />
      <StarDoodle className="absolute left-[322px] top-[8px] z-10 h-6 w-6 text-[#F5C400]" fill="#F5C400" />

      {/* Build Resume */}
      <div className={cn(CARD, "left-[236px] top-[20px] z-10 w-[188px] -rotate-[8deg] p-3.5")}>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-v2-blue-soft text-v2-blue">
            <FileTextIcon className="h-5 w-5" />
          </span>
          <p className="text-[13px] font-bold text-v2-navy">Build Resume</p>
        </div>
        <ul className="mt-3 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-2.5">
              <Tick />
              <SkeletonLines className="flex-1" />
            </li>
          ))}
        </ul>
      </div>

      {/* Find Jobs */}
      <div className={cn(CARD, "right-[10px] top-[20px] z-10 w-[246px] rotate-[2deg] p-4")}>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-v2-blue-soft text-v2-blue">
            <BriefcaseIcon className="h-[18px] w-[18px]" />
          </span>
          <p className="text-[13px] font-bold text-v2-navy">Find Jobs</p>
        </div>
        <ul className="mt-3 space-y-2.5">
          <JobRow name="Google" />
          <JobRow name="Microsoft" />
          <JobRow name="Amazon" />
        </ul>
      </div>

      {/* AI Apply */}
      <div className={cn(CARD, "left-[316px] top-[168px] z-20 w-[196px] -rotate-[6deg] p-3.5")}>
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="relative grid h-9 w-9 flex-none place-items-center rounded-lg bg-[#FFE4EC] text-[#E5446D]">
            <PaperPlane className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-tight text-v2-navy">AI Apply</p>
            <p className="mt-1 text-[10.5px] leading-snug text-v2-ink-soft">
              Apply to multiple jobs
              <br />
              in seconds
            </p>
          </div>
        </div>
        <ZapIcon aria-hidden className="absolute -left-3 bottom-1.5 h-5 w-5 text-v2-amber" fill="currentColor" />
      </div>

      {/* Prepare for Interviews */}
      <div className={cn(CARD, "bottom-[0px] right-[-6px] z-20 w-[250px] rotate-[5deg] p-4")}>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-v2-blue text-white">
            <ChatIcon className="h-5 w-5" />
          </span>
          <p className="text-[13px] font-bold text-v2-navy">Prepare for Interviews</p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ul aria-hidden className="flex w-[72px] flex-none flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Tick className="h-3 w-3" />
                <i className="block h-1.5 flex-1 rounded-full bg-[#DDE6F3]" />
              </li>
            ))}
          </ul>
          <span className="relative block h-[74px] flex-1 overflow-hidden rounded-xl bg-v2-blue-soft">
            <Image
              src="/v2/hero-copilot.png"
              alt=""
              fill
              sizes="120px"
              className="object-cover object-[50%_8%]"
            />
          </span>
        </div>
      </div>

      {/* Books under the mascot */}
      <div aria-hidden className="absolute bottom-[10px] left-[12px] z-10 flex w-[118px] flex-col gap-[3px]">
        <i className="block h-[13px] w-full rounded-[3px] bg-[#C9923C]" />
        <i className="ml-3 block h-[13px] w-[100px] rounded-[3px] bg-[#3FB1A8]" />
        <i className="ml-1 block h-[13px] w-[110px] rounded-[3px] bg-[#E56A5A]" />
        <i className="ml-4 block h-[13px] w-[96px] rounded-[3px] bg-[#3F67C7]" />
      </div>

      {/* Mascot with laptop */}
      <Image
        src="/v2/app/mascot-laptop-big.png"
        alt="The Kiwiply mascot working on a laptop"
        width={270}
        height={254}
        priority
        sizes="300px"
        className="absolute bottom-[4px] left-[88px] z-10 h-auto w-[300px]"
      />
    </div>
  );
}
