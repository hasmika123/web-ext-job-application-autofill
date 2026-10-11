import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon, CheckIcon, PlayIcon, SparklesIcon, StarDoodle, ZapIcon } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import { DEMO_VIDEO_URL } from "@/lib/site";
import Eyebrow from "../Eyebrow";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import { SIGNUP_HREF } from "../nav";
import ScaledCanvas from "../ScaledCanvas";
import V3HeroArt from "./V3HeroArt";

/**
 * Landing-v3 hero. Two boards, two variants: from md up the desktop board ("From Resume to Dream
 * Job with AI by Your Side" + the floating cards and the laptop mascot); below md the phone board
 * ("Find jobs. Apply faster. Get hired." + the portrait). The desktop art is a fixed 780x400
 * canvas scaled to its column (copy and art stay side by side from md).
 */

const DESKTOP_TICKS = ["AI-Powered", "Save Time", "More Interviews", "Land Better Jobs"];

const WATCH_HREF = DEMO_VIDEO_URL ?? "#steps";

const watchClass =
  "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[12px] border border-v2-line bg-white px-6 py-3.5 text-[15px] font-semibold leading-none text-v2-navy shadow-sm transition-shadow hover:shadow-v2-card";

function WatchVideo({ className }: { className?: string }) {
  return (
    <Link href={WATCH_HREF} className={`${watchClass} ${className ?? ""}`}>
      <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full border-2 border-v2-navy">
        <PlayIcon className="ml-0.5 h-2.5 w-2.5" fill="currentColor" />
      </span>
      Watch Video
    </Link>
  );
}

export default function V3Hero() {
  return (
    <section aria-labelledby="v3-hero-title" className="relative overflow-x-clip">
      {/* Wash behind the nav and hero: lime top-left, sky top-right (spec 2.4). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_0%_0%,rgba(132,227,61,.22),transparent_45%),radial-gradient(ellipse_at_100%_0%,rgba(120,190,255,.26),transparent_50%)]"
      />

      {/* ───────── Desktop / tablet (md+) ───────── */}
      <div className="relative mx-auto hidden max-w-[1440px] px-5 pb-6 pt-24 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] md:items-center md:gap-2 lg:px-8 lg:pt-32">
        <div className="flex flex-col items-start xl:pl-8">
          <Eyebrow family="blue" className="px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.12em]">
            Your AI Career Copilot
          </Eyebrow>
          <h1
            id="v3-hero-title"
            className="mt-4 text-v2-navy md:text-[clamp(28px,4.3vw,62px)] md:leading-[1.04] lg:mt-5"
          >
            From Resume
            <br />
            to Dream Job
            <br />
            <span className="text-v2-green">with AI by Your Side</span>
          </h1>
          <p className="mt-4 max-w-[520px] text-v2-ink-soft md:text-[clamp(14px,1.4vw,18px)] md:leading-[1.45] lg:mt-5">
            Create standout resumes, find the right opportunities, apply faster, and prepare for interviews — all in
            one place.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 lg:mt-7">
            <Link
              href={SIGNUP_HREF}
              className={buttonVariants("accent", "lg", "min-h-12 shadow-[0_8px_20px_rgba(95,191,31,.3)] md:max-lg:min-h-10 md:max-lg:px-4 md:max-lg:text-sm lg:px-7")}
            >
              Get Started for Free <ArrowRightIcon size={16} />
            </Link>
            <WatchVideo className="md:max-lg:min-h-10 md:max-lg:px-4 md:max-lg:py-2 md:max-lg:text-sm" />
          </div>
          <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-v2-ink-soft lg:mt-5 lg:gap-x-6 lg:text-[13px]">
            {DESKTOP_TICKS.map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckIcon aria-hidden className="h-4 w-4 text-v2-green" strokeWidth={2.6} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Art: a fixed 780x400 canvas scaled to its column (never overflows). */}
        <ScaledCanvas width={780} height={400} className="mx-auto mt-0 max-w-[780px]">
          <V3HeroArt />
        </ScaledCanvas>
      </div>

      {/* ───────── Phone (< md) ───────── */}
      <div className="relative px-5 pb-2 pt-[88px] md:hidden">
        <Eyebrow family="lime" icon={SparklesIcon} bordered className="text-[12px]">
          AI Job Application Copilot
        </Eyebrow>
        <h1 className="mt-4 text-[38px] leading-[1.04] text-v2-navy">
          Find jobs.
          <br />
          Apply faster.
          <br />
          <span className="text-v2-green">Get hired.</span>
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-v2-ink-soft">
          Kiwiply helps you find the right jobs, autofill applications with AI, and keep track of everything — so you
          can spend less time on paperwork and more time on your future.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href={SIGNUP_HREF} className={buttonVariants("accent", "lg", "min-h-12 w-full")}>
            Get Started Free <ArrowRightIcon size={16} />
          </Link>
          <WatchVideo className="w-full" />
        </div>

        <div className="relative mt-4 flex min-h-[270px] items-end justify-center">
          <Handwritten ink="navy" className="absolute left-2 top-2 z-10 -rotate-3 text-[22px]">
            Same me.
            <br />
            More opportunities.
          </Handwritten>
          <StarDoodle aria-hidden className="absolute right-6 top-3 h-5 w-5 text-v2-green" />
          <Photo
            id="hero-copilot"
            alt="A smiling young woman working on a laptop with a Kiwiply sticker"
            className="w-[78%] max-w-[300px]"
            sizes="300px"
            priority
          />
        </div>

        <ul className="mt-2 grid grid-cols-3 gap-2 text-center text-[11.5px] leading-snug text-v2-ink-soft">
          <li className="flex flex-col items-center gap-2">
            <CheckCircleIcon aria-hidden className="h-7 w-7 text-v2-navy" />
            Works on LinkedIn + major ATS
          </li>
          <li className="flex flex-col items-center gap-2">
            <ZapIcon aria-hidden className="h-7 w-7 text-v2-amber" />
            AI autofills applications
          </li>
          <li className="flex flex-col items-center gap-2">
            <CheckCircleIcon aria-hidden className="h-7 w-7 text-v2-navy" />
            Free plan available
          </li>
        </ul>
      </div>
    </section>
  );
}
