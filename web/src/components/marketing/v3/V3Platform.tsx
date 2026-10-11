import { BookmarkIcon, BriefcaseIcon, CalendarIcon, FileTextIcon, SearchIcon, SparkBurst, StarDoodle, UserIcon, cn } from "@kiwiply/ui";
import BrandLogo from "../BrandLogo";
import { CompanyTile } from "../mocks/shared";
import { V3_PHONE_JOBS } from "./placeholder-data";
import { V3Pill } from "./parts";

/**
 * "One platform for your entire job search." (phone board, "See Kiwiply in action"): the heading
 * over a CSS phone showing the job list. Pure HTML/CSS mock, one accessible label instead of a
 * read-through of sample rows. md+: copy left, phone right.
 */

const NAV: { label: string; Icon: typeof BriefcaseIcon; active?: boolean }[] = [
  { label: "Jobs", Icon: BriefcaseIcon, active: true },
  { label: "Applications", Icon: FileTextIcon },
  { label: "Interviews", Icon: CalendarIcon },
  { label: "Profile", Icon: UserIcon },
];

function Phone() {
  return (
    <div
      role="img"
      aria-label="Kiwiply on a phone: a list of job matches from Google, Amazon and Microsoft"
      className="relative mx-auto w-[264px] rounded-[38px] border-[7px] border-[#1B1F5E] bg-white shadow-[0_28px_60px_rgba(27,31,94,.22)]"
    >
      <span aria-hidden className="absolute left-1/2 top-0 z-10 h-4 w-20 -translate-x-1/2 rounded-b-xl bg-[#1B1F5E]" />
      <div className="overflow-hidden rounded-[30px] bg-white px-3.5 pb-3 pt-3">
        <div aria-hidden className="flex items-center justify-between px-1 text-[9px] font-bold text-v2-navy">
          <span>9:41</span>
          <span>●●●</span>
        </div>
        <div aria-hidden className="mt-3 flex items-center justify-between">
          <BrandLogo height={22} />
          <SearchIcon className="h-4 w-4 text-v2-navy" />
        </div>
        <div aria-hidden className="mt-3 flex items-center gap-2 rounded-xl bg-v2-canvas px-3 py-2.5 text-[11px] text-v2-muted">
          <SearchIcon className="h-3.5 w-3.5" />
          Search jobs, companies...
        </div>
        <ul aria-hidden className="mt-3 space-y-2.5">
          {V3_PHONE_JOBS.map((j) => (
            <li key={j.title} className="flex items-center gap-2.5 rounded-2xl border border-v2-line/70 bg-white p-2.5 shadow-sm">
              <CompanyTile name={j.company} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold leading-tight text-v2-navy">{j.title}</p>
                <p className="truncate text-[10px] leading-tight text-v2-muted">{j.meta}</p>
                <p className="truncate text-[10px] leading-tight text-v2-muted">{j.ago}</p>
              </div>
              <BookmarkIcon className="h-4 w-4 flex-none text-v2-navy/70" />
            </li>
          ))}
        </ul>
        <ul aria-hidden className="mt-3 grid grid-cols-4 border-t border-v2-line/70 pt-2">
          {NAV.map(({ label, Icon, active }) => (
            <li key={label} className={cn("flex flex-col items-center gap-0.5 text-[8.5px] font-semibold", active ? "text-v2-green" : "text-v2-muted")}>
              <Icon className="h-4 w-4" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function V3Platform() {
  return (
    <section
      id="platform"
      aria-labelledby="v3-platform-title"
      className="relative scroll-mt-20 overflow-x-clip px-5 py-12 lg:px-8 lg:py-16"
    >
      <div className="mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] items-center gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col items-start">
          <V3Pill>See Kiwiply in action</V3Pill>
          <h2 id="v3-platform-title" className="mt-4 max-w-md text-[32px] text-v2-navy md:text-[38px]">
            One platform for your entire job search.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-v2-ink-soft md:text-[16px]">
            Search jobs, autofill applications, track progress, and get AI suggestions — all in one place.
          </p>
        </div>
        <div className="relative pb-2">
          <Phone />
          <span aria-hidden className="pointer-events-none absolute right-2 top-6 hidden text-v2-green sm:block md:right-6">
            <SparkBurst className="h-12 w-12" />
          </span>
          <StarDoodle aria-hidden className="absolute -left-1 top-10 h-6 w-6 text-v2-lime-deep" />
        </div>
      </div>
    </section>
  );
}
