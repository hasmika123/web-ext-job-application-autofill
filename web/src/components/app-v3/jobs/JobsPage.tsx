"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, EmptyState, SearchIcon, SlidersIcon, SparklesIcon, cn } from "@kiwiply/ui";
import { FilterSelect, HeroBand, Pagination, PromptChip } from "@/components/app-v2/common";
import { JOBS_PAGE_SIZE, type JobType, type V3Job } from "@/components/app-v3/sample-data";
import { useSamples } from "@/components/app-v3/SamplesProvider";
import type { SampleJob } from "@/components/app-v2/sample-data";
import FilterRail from "./FilterRail";
import JobRow from "./JobRow";
import JobDetail from "./JobDetail";
import { SORTS, applyFilters, companyFacets, defaultFilters, isDefault, realToV3, type Filters, type Sort } from "./filter";

const CHIPS: { label: string; type?: JobType }[] = [
  { label: "Remote" },
  { label: "Full-time", type: "Full-time" },
  { label: "Part-time", type: "Part-time" },
  { label: "Contract", type: "Contract" },
  { label: "Internship", type: "Internship" },
];

/**
 * Job Search (APP-V3-SPEC 2.2): hero with search + quick chips, filter rail, result list with the
 * "N jobs found" header, sort and pagination, and the right-hand detail panel. Pro accounts see their
 * real daily matches (`realJobs`); everyone else sees an honest empty state, except a demo account on a
 * sample-enabled build, which sees the board's SAMPLE rows (`samples()`, U0.5). Below `xl` the filter rail folds behind a Filters button; below
 * `md` the detail panel replaces the list.
 */
export default function JobsPage({
  realJobs,
  initialQuery = "",
  initialSelectedId = null,
}: {
  /** The user's real daily matches (Pro), else null. */
  realJobs: SampleJob[] | null;
  initialQuery?: string;
  initialSelectedId?: string | null;
}) {
  const sample = useSamples();
  const real = !!realJobs && realJobs.length > 0;
  const sampleJobs = useMemo(() => sample("V3_JOBS"), [sample]);
  const sampleTotal = sample("JOBS_SAMPLE_TOTAL");
  const pool: V3Job[] = useMemo(() => (real ? realJobs!.map(realToV3) : sampleJobs), [real, realJobs, sampleJobs]);
  const facets = useMemo(() => companyFacets(pool), [pool]);

  // Real matches have no job-type facet worth defaulting; start with nothing ticked.
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultFilters(initialQuery.trim()),
    types: real ? [] : ["Full-time"],
  }));
  const [draft, setDraft] = useState(initialQuery);
  const [sort, setSort] = useState<Sort>("relevant");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId && pool.some((j) => j.id === initialSelectedId) ? initialSelectedId : null,
  );

  const results = useMemo(() => applyFilters(pool, filters, sort), [pool, filters, sort]);
  const pages = Math.max(1, Math.ceil(results.length / JOBS_PAGE_SIZE));
  const cur = Math.min(page, pages);
  const rows = results.slice((cur - 1) * JOBS_PAGE_SIZE, cur * JOBS_PAGE_SIZE);
  const untouched = !real && sampleTotal !== null && isDefault(filters, initialQuery.trim());
  const total = untouched ? sampleTotal : results.length;
  const selected = selectedId ? (pool.find((j) => j.id === selectedId) ?? null) : null;

  const change = (f: Filters) => {
    setFilters(f);
    setPage(1);
  };
  function open(id: string) {
    setSelectedId(id);
    try {
      window.history.replaceState(null, "", `/jobs?job=${encodeURIComponent(id)}`);
    } catch {
      /* the URL is a nicety */
    }
  }
  function close() {
    setSelectedId(null);
    try {
      window.history.replaceState(null, "", "/jobs");
    } catch {
      /* ignore */
    }
  }
  function toggleChip(c: (typeof CHIPS)[number]) {
    if (c.type) {
      const on = filters.types.includes(c.type);
      change({ ...filters, types: on ? filters.types.filter((t) => t !== c.type) : [...filters.types, c.type] });
    } else {
      change({ ...filters, remote: !filters.remote });
    }
  }
  const chipOn = (c: (typeof CHIPS)[number]) => (c.type ? filters.types.includes(c.type) : filters.remote);

  const rail = (
    <FilterRail
      filters={filters}
      onChange={change}
      companies={facets}
      onClear={() => change({ ...defaultFilters(""), types: [] })}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <HeroBand
        title="Find your next opportunity"
        subtitle="Search, filter, and discover jobs that match your skills and goals."
        art="mascot-search"
        artHeight={128}
        aside={
          <div className="w-[230px] rounded-2xl border border-white/80 bg-paper/85 p-3.5 shadow-v2-soft">
            <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink">
              <SparklesIcon size={15} className="text-v2-green" />
              Let AI find better matches for you
            </p>
            <Link
              href="/assistant"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-v2-lime px-3.5 py-1.5 text-[12.5px] font-bold text-v2-navy hover:brightness-95"
            >
              Try AI Search
              <ArrowRightIcon size={13} />
            </Link>
          </div>
        }
      >
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            change({ ...filters, q: draft.trim() });
          }}
          className="flex max-w-[620px] flex-col gap-2 sm:flex-row"
        >
          <label className="relative block min-w-0 flex-1">
            <SearchIcon size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-v2-muted" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search job titles, keywords, or companies..."
              aria-label="Search job titles, keywords, or companies"
              className="h-11 w-full rounded-xl border border-v2-line/70 bg-paper pl-10 pr-3 text-[14px] text-ink outline-none placeholder:text-v2-muted focus-visible:ring-2 focus-visible:ring-v2-blue/25"
            />
          </label>
          <button
            type="submit"
            className="h-11 flex-none rounded-xl bg-v2-lime px-6 text-[14.5px] font-bold text-v2-navy transition-[filter] hover:brightness-95"
          >
            Search
          </button>
        </form>
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
          {CHIPS.map((c) => (
            <PromptChip key={c.label} active={chipOn(c)} onClick={() => toggleChip(c)} aria-pressed={chipOn(c)}>
              {c.label}
            </PromptChip>
          ))}
        </div>
      </HeroBand>

      {pool.length === 0 ? (
        <EmptyState
          mascot
          title="No jobs to show yet"
          description="Daily matches land here once your profile and resume are ready."
          action={
            <Link href="/profiles" className="inline-flex h-10 items-center rounded-xl bg-v2-lime px-5 text-[13.5px] font-bold text-v2-navy hover:brightness-95">
              Open your profile
            </Link>
          }
        />
      ) : (
      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
        <div className="hidden xl:block">{rail}</div>

        <div className="min-w-0">
          <div className="mb-3 xl:hidden">
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-v2-line bg-paper px-3.5 text-[13px] font-semibold text-ink hover:bg-paper-2"
            >
              <SlidersIcon size={15} />
              Filters
            </button>
            {showFilters && <div className="mt-2">{rail}</div>}
          </div>

          <div
            className={cn(
              "grid items-start gap-4",
              selected && "md:grid-cols-[minmax(0,1fr)_minmax(290px,340px)] xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]",
            )}
          >
            <section aria-label="Jobs" className={cn("min-w-0", selected && "hidden md:block")}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-[16px] font-bold! tracking-normal! text-ink">
                  {total.toLocaleString("en-US")} jobs found
                </h2>
                <div className="flex items-center gap-2 text-[13px] text-ink-soft">
                  <span className="hidden sm:inline">Sort by:</span>
                  <FilterSelect
                    label="Sort by"
                    options={SORTS.map((s) => s.label)}
                    value={SORTS.find((s) => s.id === sort)!.label}
                    onChange={(l) => {
                      setSort(SORTS.find((s) => s.label === l)!.id);
                      setPage(1);
                    }}
                    className="w-[160px]"
                  />
                </div>
              </div>

              <ul className="flex flex-col gap-3">
                {rows.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-v2-line bg-paper p-8 text-center text-[14px] text-v2-muted">
                    No jobs match those filters. Try clearing some or searching a different title.
                  </li>
                ) : (
                  rows.map((j) => <JobRow key={j.id} job={j} selected={j.id === selectedId} onOpen={() => open(j.id)} />)
                )}
              </ul>

              {results.length > JOBS_PAGE_SIZE && (
                <Pagination
                  className="mt-4"
                  page={cur}
                  pages={pages}
                  onPageChange={(p) => {
                    setPage(p);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  summary={`Showing ${(cur - 1) * JOBS_PAGE_SIZE + 1}-${Math.min(cur * JOBS_PAGE_SIZE, results.length)} of ${total.toLocaleString("en-US")}`}
                />
              )}
            </section>

            {selected && <JobDetail key={selected.id} job={selected} onClose={close} />}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
