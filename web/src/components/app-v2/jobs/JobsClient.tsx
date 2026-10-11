"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, MapPinIcon, SearchIcon, SlidersIcon, cn, useToast } from "@kiwiply/ui";
import { UnderlineTabs } from "@/components/app-v2/common";
import {
  JOB_FILTER_CHIPS,
  JOB_LIST_IDS,
  JOB_SPLIT_FILTERS,
  JOB_SPLIT_IDS,
  JOB_TABS,
  type SampleJob,
} from "@/components/app-v2/sample-data";
import { JobsHeroAi, JobsHeroList } from "./JobsHero";
import { JobRowCompact, JobRowWide } from "./JobRows";
import JobDetailPanel from "./JobDetailPanel";
import JobsRail from "./JobsRail";
import { asSplit } from "./job-utils";

/**
 * Job Search (APP-V2-SPEC 3.2). Two layouts of one page: with nothing selected it is the list board
 * (`app-job-search.webp`: hero, search, filters, tabs, list + preferences rail); clicking a row opens
 * the split board (`app-job-search-split.webp`: AI search hero, list + detail panel) and the rail
 * collapses. The filter chips are display-only until job search ships; the query, tabs and sort work
 * on the list in hand (the user's real daily matches when Pro, otherwise the board's sample rows).
 */

function daysAgo(posted: string): number {
  const m = /^(\d+)/.exec(posted);
  return m ? Number(m[1]) : 0;
}

function matchesQuery(j: SampleJob, q: string): boolean {
  if (!q) return true;
  const hay = [j.title, j.company, j.location, j.mode ?? "", ...j.tags].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function FilterChip({ label, icon, onClick }: { label: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 flex-none items-center gap-2 rounded-xl border border-v2-line bg-paper px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-paper-2"
    >
      {icon}
      {label}
      <ChevronDownIcon size={14} className="text-v2-muted" />
    </button>
  );
}

export default function JobsClient({
  jobs,
  real,
  matchEnabled,
  initialQuery = "",
  initialSelectedId = null,
}: {
  jobs: SampleJob[];
  real: boolean;
  matchEnabled?: boolean;
  initialQuery?: string;
  initialSelectedId?: string | null;
}) {
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [applied, setApplied] = useState(initialQuery);
  const [tab, setTab] = useState("recommended");
  const [sort, setSort] = useState<"best" | "latest">("best");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId && jobs.some((j) => j.id === initialSelectedId) ? initialSelectedId : null,
  );

  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const split = selectedId !== null;

  const comingSoon = (what: string) => toast({ variant: "default", title: `${what} filters are coming soon.` });

  function open(id: string) {
    setSelectedId(id);
    try {
      window.history.replaceState(null, "", `/jobs?job=${encodeURIComponent(id)}`);
    } catch {
      /* the URL is a nicety */
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function close() {
    setSelectedId(null);
    try {
      window.history.replaceState(null, "", "/jobs");
    } catch {
      /* ignore */
    }
  }
  function runSearch(q: string) {
    setQuery(q);
    setApplied(q.trim());
    setTab("recommended");
  }

  // The list shown. Untouched = the board's rows in board order; a query, tab or sort filters the
  // whole pool instead.
  const { rows, total } = useMemo(() => {
    const touched = applied !== "" || tab !== "recommended" || sort !== "best";
    let list: SampleJob[];
    if (!touched) {
      const ids = real ? jobs.map((j) => j.id) : split ? JOB_SPLIT_IDS : JOB_LIST_IDS;
      list = ids.map((id) => byId.get(id)).filter((j): j is SampleJob => !!j);
      const sel = selectedId ? byId.get(selectedId) : null;
      if (sel && !list.some((j) => j.id === sel.id)) list = [sel, ...list];
    } else {
      list = jobs.filter((j) => matchesQuery(j, applied));
      if (tab === "remote") list = list.filter((j) => j.mode === "Remote");
      if (tab === "high") list = list.filter((j) => j.score >= 90);
      if (tab === "internships") list = list.filter((j) => j.tags.includes("Internship"));
      if (tab === "latest" || sort === "latest") list = [...list].sort((a, b) => daysAgo(a.posted) - daysAgo(b.posted));
    }
    const view = split && !real ? list.map(asSplit) : list;
    return { rows: view, total: touched ? view.length : null };
  }, [applied, tab, sort, jobs, byId, real, split, selectedId]);

  const selected = selectedId ? byId.get(selectedId) : null;
  const selectedView = selected ? (!real ? asSplit(selected) : selected) : null;

  const tabs = real
    ? JOB_TABS.map((t) => ({
        ...t,
        count:
          t.id === "recommended" || t.id === "latest"
            ? jobs.length
            : t.id === "remote"
              ? jobs.filter((j) => j.mode === "Remote").length
              : t.id === "high"
                ? jobs.filter((j) => j.score >= 90).length
                : jobs.filter((j) => j.tags.includes("Internship")).length,
      }))
    : JOB_TABS;

  const sortSelect = (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Sort by</span>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as "best" | "latest")}
        className="h-10 cursor-pointer appearance-none rounded-xl border border-v2-line bg-paper pl-3.5 pr-9 text-[13px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-v2-blue/25"
      >
        <option value="best">Sort by: Best Match</option>
        <option value="latest">Sort by: Latest</option>
      </select>
      <ChevronDownIcon size={14} className="pointer-events-none absolute right-3 text-ink-soft" />
    </label>
  );

  const empty = (
    <li className="rounded-2xl border border-dashed border-v2-line bg-paper p-8 text-center text-[14px] text-v2-muted">
      No jobs match that search. Try a different title, skill or company.
    </li>
  );

  /* ── Split layout ─────────────────────────────────────────────────────────────────────── */
  if (split && selectedView) {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => comingSoon("All")}
            className="inline-flex h-10 flex-none items-center gap-2 rounded-xl border border-v2-line bg-v2-blue-soft/60 px-3.5 text-[13px] font-semibold text-ink"
          >
            <SlidersIcon size={15} />
            All Filters
          </button>
          {JOB_SPLIT_FILTERS.map((f) => (
            <FilterChip key={f} label={f} onClick={() => comingSoon(f)} />
          ))}
        </div>

        <JobsHeroAi value={query} onChange={setQuery} onSubmit={() => runSearch(query)} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <section aria-label="Jobs" className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-[16px] font-bold! tracking-normal! text-ink">
                {(total ?? (real ? rows.length : 1248)).toLocaleString("en-US")} jobs found
              </h2>
              {sortSelect}
            </div>
            <ul className="flex flex-col gap-3">
              {rows.length === 0
                ? empty
                : rows.map((j) => <JobRowCompact key={j.id} job={j} selected={j.id === selectedId} onOpen={() => open(j.id)} />)}
            </ul>
          </section>
          <div className="order-first min-w-0 xl:order-none">
            <JobDetailPanel key={selectedView.id} job={selectedView} onClose={close} />
          </div>
        </div>
      </div>
    );
  }

  /* ── List layout ──────────────────────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <JobsHeroList />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
          role="search"
          className="flex flex-col gap-2.5 rounded-2xl border border-v2-line/70 bg-paper p-2.5 shadow-v2-soft sm:flex-row"
        >
          <label className="relative block min-w-0 flex-1">
            <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by job title, skills, or company..."
              aria-label="Search by job title, skills, or company"
              className="h-12 w-full rounded-xl bg-transparent pl-11 pr-3 text-[14.5px] text-ink outline-none placeholder:text-v2-muted focus-visible:ring-2 focus-visible:ring-v2-blue/25"
            />
          </label>
          <button
            type="submit"
            className="h-12 flex-none rounded-xl bg-v2-green px-8 text-[14.5px] font-bold text-white transition-[filter] hover:brightness-95"
          >
            Search Jobs
          </button>
        </form>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
          {JOB_FILTER_CHIPS.map((f, i) => (
            <FilterChip
              key={f}
              label={f}
              icon={i === 0 ? <MapPinIcon size={15} className="text-ink-soft" /> : undefined}
              onClick={() => comingSoon(f)}
            />
          ))}
          <button
            type="button"
            onClick={() => comingSoon("More")}
            className="inline-flex h-10 flex-none items-center gap-2 rounded-xl border border-v2-line bg-paper px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-paper-2"
          >
            <SlidersIcon size={15} />
            More Filters
          </button>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <UnderlineTabs
            tabs={tabs}
            value={tab}
            onChange={setTab}
            className="min-w-0 max-w-full flex-1 border-b-0"
            aria-label="Job lists"
          />
          {sortSelect}
        </div>

        <ul className={cn("flex flex-col gap-3", rows.length === 0 && "pt-2")}>
          {rows.length === 0 ? empty : rows.map((j) => <JobRowWide key={j.id} job={j} onOpen={() => open(j.id)} />)}
        </ul>
      </div>

      <aside aria-label="Preferences and alerts" className="min-w-0">
        <JobsRail onSearch={runSearch} matchEnabled={real ? matchEnabled : undefined} />
      </aside>
    </div>
  );
}
