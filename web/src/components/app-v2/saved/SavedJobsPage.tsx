"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  LayersIcon,
  LayoutGridIcon,
  LightbulbIcon,
  MenuIcon,
  RocketIcon,
  StarIcon,
  TargetIcon,
  ChartIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import {
  SAVED_BENEFITS,
  SAVED_COLLECTIONS,
  SAVED_INSIGHTS,
  SAVED_JOBS,
  SAVED_TAB_COUNTS,
  type SavedJobSample,
} from "../sample-data";
import {
  CheckList,
  CompanyTile,
  FilterSelect,
  HeroArt,
  KebabMenu,
  PageHero,
  SearchInput,
  SectionCard,
  StatTile,
  TONE,
  UnderlineTabs,
  type Tone,
} from "../common";
import MatchRing from "./MatchRing";

type TabKey = "all" | "high" | "applied" | "notApplied" | "collections";

const TAB_LABELS: { value: TabKey; label: string }[] = [
  { value: "all", label: "All Saved Jobs" },
  { value: "high", label: "High Match" },
  { value: "applied", label: "Applied" },
  { value: "notApplied", label: "Not Applied" },
  { value: "collections", label: "Collections" },
];

const inTab = (j: SavedJobSample, tab: TabKey) =>
  tab === "all" || tab === "collections" ? true : tab === "high" ? j.match >= 85 : tab === "applied" ? j.applied : !j.applied;

const COLLECTION_ICON: Record<string, { icon: React.ReactNode; tone: Tone }> = {
  "All Saved Jobs": { icon: <BookmarkIcon className="h-5 w-5" />, tone: "green" },
  "Top Picks": { icon: <StarIcon className="h-5 w-5" />, tone: "amber" },
  "Dream Companies": { icon: <BriefcaseIcon className="h-5 w-5" />, tone: "blue" },
  "Product Roles": { icon: <LayersIcon className="h-5 w-5" />, tone: "violet" },
};

/**
 * Saved Jobs (board `app-saved-jobs.webp`). All sample data + client state: filtering, the
 * list/grid toggle and "Remove from saved" work locally. The tab counts are the board's
 * (12 / 7 / 3 / 9 / 3) adjusted by whatever the user removes, because the list shows only the
 * board's first page of the 12.
 */
export default function SavedJobsPage() {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [score, setScore] = useState("");
  const [month, setMonth] = useState("");
  const [jobType, setJobType] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const live = useMemo(() => SAVED_JOBS.filter((j) => !removed.has(j.id)), [removed]);
  const companies = useMemo(() => Array.from(new Set(SAVED_JOBS.map((j) => j.company))), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = score ? parseInt(score, 10) : 0;
    return live.filter(
      (j) =>
        inTab(j, tab) &&
        (!q || `${j.title} ${j.company} ${j.tags.join(" ")}`.toLowerCase().includes(q)) &&
        (!company || j.company === company) &&
        (!location || j.mode === location) &&
        (!jobType || j.tags.includes(jobType)) &&
        (!min || j.match >= min) &&
        (!month || j.savedOn.startsWith(month)),
    );
  }, [live, tab, query, company, location, jobType, score, month]);

  // Board counts, minus whatever the user removed from each bucket.
  const gone = SAVED_JOBS.filter((j) => removed.has(j.id));
  const counts: Record<TabKey, number> = {
    all: SAVED_TAB_COUNTS.all - gone.length,
    high: SAVED_TAB_COUNTS.high - gone.filter((j) => j.match >= 85).length,
    applied: SAVED_TAB_COUNTS.applied - gone.filter((j) => j.applied).length,
    notApplied: SAVED_TAB_COUNTS.notApplied - gone.filter((j) => !j.applied).length,
    collections: SAVED_TAB_COUNTS.collections,
  };

  const remove = (j: SavedJobSample) => {
    setRemoved((prev) => new Set(prev).add(j.id));
    toast({ title: "Removed from saved jobs", description: `${j.title} at ${j.company}` });
  };

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <PageHero
        title="Saved Jobs"
        subtitle="Keep track of opportunities you're interested in. Organize, compare, and get AI-powered insights."
        art={<HeroArt mascot="mascot-heart" note="Good opportunities lead to great journeys!" mascotHeight={128} />}
      />
      <div className="rounded-2xl border border-v2-line bg-[linear-gradient(160deg,#F1FBE5_0%,#EAF8F0_100%)] p-5">
        <CheckList items={SAVED_BENEFITS} />
      </div>

      <section className="min-w-0 rounded-2xl border border-v2-line bg-white shadow-v2-card">
        <UnderlineTabs padded counts="pill"
          ariaLabel="Saved jobs views"
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          className="px-3 sm:px-4"
          tabs={TAB_LABELS.map((t) => ({ ...t, count: counts[t.value] }))}
        />

        <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
          <SearchInput
            size="sm"
            aria-label="Search saved jobs"
            placeholder="Search saved jobs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full bg-white sm:w-52"
          />
          <FilterSelect placeholder label="Job Type" options={["Internship"]} value={jobType} onChange={setJobType} />
          <FilterSelect placeholder label="Location" options={["Remote", "Hybrid", "On-site"]} value={location} onChange={setLocation} />
          <FilterSelect placeholder label="Company" options={companies} value={company} onChange={setCompany} />
          <FilterSelect placeholder label="Match Score" options={["90%+", "85%+", "80%+"]} value={score} onChange={setScore} />
          <FilterSelect placeholder label="Date Saved" options={["Oct", "Sep"]} value={month} onChange={setMonth} />
          <div className="ml-auto flex overflow-hidden rounded-xl border border-v2-line">
            {(
              [
                ["list", "List view", <MenuIcon key="l" className="h-4 w-4" />],
                ["grid", "Grid view", <LayoutGridIcon key="g" className="h-4 w-4" />],
              ] as const
            ).map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center",
                  view === key ? "bg-v2-lime-soft text-v2-navy" : "bg-white text-v2-ink-soft hover:bg-[#F1F5FB]",
                )}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {tab === "collections" ? (
          <ul className="grid gap-3 p-3 pt-0 sm:grid-cols-2 sm:p-4 sm:pt-0">
            {SAVED_COLLECTIONS.map((c) => (
              <li key={c.label} className="flex items-center gap-3 rounded-2xl border border-v2-line p-4">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", TONE[c.tone].soft, TONE[c.tone].ink)}>
                  {COLLECTION_ICON[c.label]?.icon}
                </span>
                <span className="font-semibold text-v2-navy">{c.label}</span>
                <span className="ml-auto text-[13px] text-v2-muted">{c.count}</span>
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className="px-4 pb-10 pt-6 text-center text-[14px] text-v2-ink-soft">No saved jobs match these filters.</p>
        ) : (
          <ul className={cn("px-3 pb-3 sm:px-4 sm:pb-4", view === "grid" ? "grid gap-3 md:grid-cols-2" : "divide-y divide-v2-line/70")}>
            {rows.map((j) => (
              <li
                key={j.id}
                className={cn(
                  "flex flex-col gap-3 py-4 md:flex-row md:items-center md:gap-4",
                  view === "grid" && "rounded-2xl border border-v2-line p-4 md:flex-col md:items-stretch",
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {view === "list" && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${j.title} at ${j.company}`}
                      className="mt-4 hidden h-4 w-4 flex-none accent-[#20B33D] md:block"
                    />
                  )}
                  <CompanyTile name={j.company} size={46} />
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold leading-snug tracking-normal text-v2-navy">{j.title}</h3>
                    <p className="mt-0.5 text-[13px] text-v2-ink-soft">
                      {j.company} {"·"} {j.location} {"·"} {j.mode}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {j.tags.map((t) => (
                        <li key={t} className="rounded-md bg-v2-blue-soft px-2 py-0.5 text-[12px] font-medium text-v2-blue">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:flex-nowrap">
                  <MatchRing value={j.match} />
                  <p className="text-[12.5px] leading-tight text-v2-muted md:w-[88px]">
                    Saved on
                    <br />
                    {j.savedOn}
                  </p>
                  <div className="ml-auto flex items-center gap-1.5 md:ml-0">
                    {j.primaryAction === "apply" && !j.applied ? (
                      <Link
                        href={`/ai-apply?job=${j.id}`}
                        className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-v2-lime px-4 text-[13.5px] font-bold text-v2-navy hover:brightness-95"
                      >
                        <RocketIcon className="h-4 w-4" />
                        Apply with AI
                      </Link>
                    ) : (
                      // The sample ids don't exist in the Job Search sample set, so this goes to the list.
                      <Link
                        href="/jobs"
                        className="inline-flex h-10 min-w-[104px] items-center justify-center whitespace-nowrap rounded-xl border border-v2-line bg-white px-4 text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]"
                      >
                        View Job
                      </Link>
                    )}
                    <KebabMenu
                      label={`More actions for ${j.title} at ${j.company}`}
                      items={[
                        { label: "View job", onSelect: () => router.push("/jobs") },
                        { label: "Apply with AI", onSelect: () => router.push(`/ai-apply?job=${j.id}`) },
                        { separator: true },
                        { label: "Remove from saved", danger: true, onSelect: () => remove(j) },
                      ]}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-4">
        <SectionCard title="Quick Stats" icon={<ChartIcon className="h-5 w-5 text-v2-blue" />}>
          <div className="grid grid-cols-2 gap-3">
            <StatTile compact tone="blue" icon={<BookmarkIcon className="h-5 w-5" />} value={counts.all} label="Saved Jobs" />
            <StatTile
              compact
              tone="amber"
              icon={<TargetIcon className="h-5 w-5" />}
              value={counts.high}
              label="High Match"
              sublabel={"(≥ 85%)"}
            />
            <StatTile compact tone="blue" icon={<RocketIcon className="h-5 w-5" />} value={counts.applied} label="Already Applied" />
            <StatTile compact tone="amber" icon={<ClockIcon className="h-5 w-5" />} value={5 - gone.filter((j) => !j.applied).length} label="Not Applied" />
          </div>
        </SectionCard>

        <SectionCard title="Collections" icon={<BookmarkIcon className="h-5 w-5 text-v2-blue" />} action={{ label: "View all", onClick: () => setTab("collections") }}>
          <ul className="space-y-1">
            {SAVED_COLLECTIONS.map((c, i) => (
              <li
                key={c.label}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px]",
                  i === 0 ? "bg-v2-lime-soft font-semibold text-v2-navy" : "text-v2-ink-soft",
                )}
              >
                <span className={TONE[COLLECTION_ICON[c.label].tone].ink}>{COLLECTION_ICON[c.label].icon}</span>
                {c.label}
                <span className="ml-auto text-[13px] tabular-nums text-v2-muted">{i === 0 ? counts.all : c.count}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => toast({ title: "Coming soon", description: "Custom collections are on the way." })}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-v2-line bg-white text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]"
          >
            <span aria-hidden>+</span> Create New Collection
          </button>
        </SectionCard>

        <SectionCard title="AI Insights" icon={<LightbulbIcon className="h-5 w-5 text-v2-amber" />}>
          <ul className="divide-y divide-v2-line/70">
            {SAVED_INSIGHTS.map((t) => (
              <li key={t} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <CheckCircleIcon className="h-5 w-5 flex-none text-v2-green" />
                <span className="flex-1 text-[13.5px] leading-snug text-v2-navy">{t}</span>
                <ChevronRightIcon className="h-4 w-4 flex-none text-v2-muted" />
              </li>
            ))}
          </ul>
        </SectionCard>
      </aside>
    </div>
  );
}
