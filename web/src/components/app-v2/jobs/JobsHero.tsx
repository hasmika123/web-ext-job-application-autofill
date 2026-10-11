import Image from "next/image";
import { ClockIcon, SearchIcon, SendIcon, SparklesIcon, StarDoodle, cn, ArrowRightIcon } from "@kiwiply/ui";

/** Yellow sticky note with handwriting (decorative). */
function Sticky({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      aria-hidden
      className={cn(
        "bg-v2-sticky px-3.5 py-2.5 font-[family-name:var(--font-hand)] text-[19px] leading-[1.05] text-v2-sticky-ink shadow-v2-soft",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Board `app-job-search.webp` hero: "Find Your Next Opportunity" with the binoculars mascot. */
export function JobsHeroList() {
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-white/70 bg-[linear-gradient(105deg,#F3FBE6_0%,#E6F7EF_55%,#DDEEFF_100%)]">
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-14 h-44 w-44 rounded-full bg-v2-lime/30 blur-3xl" />
      <div className="relative grid items-center gap-2 px-5 pt-6 sm:px-7 md:grid-cols-[1.7fr_1fr] md:py-0">
        <div className="min-w-0 pb-6 md:py-7">
          <h1 className="font-display text-[28px] font-extrabold leading-[1.05] text-ink sm:text-[34px] xl:text-[38px]">
            Find Your Next <span className="text-v2-green">Opportunity</span>
          </h1>
          <p className="mt-3 max-w-[480px] text-[14.5px] leading-relaxed text-ink-soft">
            Discover the right jobs, get AI-powered recommendations, and apply faster with Kiwiply.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2.5 text-[13px] font-medium text-ink-soft">
            <li className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-v2-green-soft text-v2-green-ink">
                <SparklesIcon size={14} />
              </span>
              Personalized matches
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-v2-amber-soft text-v2-amber-ink">
                <ClockIcon size={14} />
              </span>
              Real-time updates
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-v2-violet-soft text-v2-violet-ink">
                <SendIcon size={14} />
              </span>
              Apply in one click
            </li>
          </ul>
        </div>
        <div className="relative hidden h-full min-h-[190px] items-end justify-center md:flex">
          <StarDoodle aria-hidden className="absolute right-2 top-4 h-6 w-6 text-v2-amber" />
          <Sticky className="absolute right-0 top-8 z-10 rotate-6 text-[17px]">
            Explore
            <br />
            Learn
            <br />
            Grow
            <br />
            Get Hired!
          </Sticky>
          <Image
            src="/v2/app/mascot-binoculars.png"
            alt="" unoptimized
            width={171}
            height={162}
            priority
            className="relative mr-14 h-auto w-[190px] object-contain lg:w-[210px]"
          />
        </div>
      </div>
    </section>
  );
}

/** Board `app-job-search-split.webp` hero: "Find the right jobs for you with AI." with an AI search box. */
export function JobsHeroAi({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-white/70 bg-[linear-gradient(105deg,#EAF6FF_0%,#E3F4F5_55%,#EAF8E4_100%)]">
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full bg-v2-lime/25 blur-3xl" />
      <div className="relative grid items-center gap-2 px-5 pt-5 sm:px-7 md:grid-cols-[1.5fr_1fr] md:py-0">
        <div className="min-w-0 pb-5 md:py-6">
          <h1 className="font-display text-[24px] font-extrabold leading-tight text-ink sm:text-[28px]">
            Find the right jobs for you with AI.
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            Describe what you&apos;re looking for, and Kiwiply will find the best matches.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="mt-4 flex flex-col gap-2.5 sm:flex-row"
          >
            <label className="relative block min-w-0 flex-1">
              <SearchIcon size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-v2-muted" />
              <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={'Try "Software engineer internships in remote, $80k+"'}
                aria-label="Describe the jobs you want"
                className="h-12 w-full rounded-xl border border-v2-line/70 bg-paper pl-10 pr-3 text-[14px] text-ink outline-none placeholder:text-v2-muted focus-visible:ring-2 focus-visible:ring-v2-blue/25"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 flex-none items-center justify-center gap-2 rounded-xl bg-v2-lime px-5 text-[14.5px] font-bold text-v2-navy transition-[filter] hover:brightness-95"
            >
              Search with AI
              <ArrowRightIcon size={16} />
            </button>
          </form>
        </div>
        <div className="relative hidden h-full min-h-[150px] items-end justify-center md:flex">
          <StarDoodle aria-hidden className="absolute left-4 top-5 h-5 w-5 text-v2-green" />
          <StarDoodle aria-hidden className="absolute right-4 top-4 h-5 w-5 text-v2-green" />
          <Sticky className="absolute left-2 top-5 z-10 -rotate-6 text-[17px]">
            Same skills.
            <br />
            More
            <br />
            Opportunities.
          </Sticky>
          <Image
            src="/v2/app/mascot-search.png"
            alt="" unoptimized
            width={138}
            height={132}
            className="relative ml-24 h-auto w-[150px] object-contain"
          />
        </div>
      </div>
    </section>
  );
}
