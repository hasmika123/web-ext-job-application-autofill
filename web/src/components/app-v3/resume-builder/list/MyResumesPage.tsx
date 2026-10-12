"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileTextIcon, GridIcon, ListIcon, PlusIcon, cn } from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import ResumeDrawer from "@/components/app-v2/resume/ResumeDrawer";
import { FilterSelect, SearchInput, UnderlineTabs } from "@/components/app-v2/common";
import { useDateDisplay } from "@/lib/use-date-display";
import { toCardModels } from "./adapter";
import { PopularTemplates, QuickTips } from "./BottomCards";
import {
  DEFAULT_SORT,
  SORTS,
  STATUS_FILTERS,
  TAB_EMPTY,
  TAB_LABELS,
  TAB_ORDER,
  type SortKey,
  type StatusFilter,
  type TabId,
} from "./constants";
import { applyQuery, tabCounts } from "./filter";
import { useNewResume, useSoon, useViewMode } from "./hooks";
import ResumeCard from "./ResumeCard";
import ResumesHero from "./ResumesHero";

export interface MyResumesPageProps {
  resumes: Resume[];
  /** Applications per resume id (the archive guard in the manage panel hinges on it). */
  usage: Record<number, number>;
  baseProfile: Record<string, unknown>;
  isPro: boolean;
}

const VIEW_BTN =
  "inline-flex h-10 w-10 cursor-pointer items-center justify-center text-ink-soft transition-colors hover:bg-paper-2 sm:h-9 sm:w-9";

/**
 * "My Resumes" (`/resume-builder`), laid out to design/resume-builder-v3/user-my-resumes.webp:
 * hero, tabs with counts + search / status / sort / view toggle, resume cards, then Popular
 * Templates and Quick Tips. Everything the board shows that the API does not carry yet is decided in
 * `./adapter.ts`; nothing here reads the DTO directly.
 *
 * Wired today: "+ New Resume", Edit (built resumes open the editor; uploaded files open the manage
 * panel), tabs / search / filter / sort / view. Everything else renders and says "Coming soon"
 * (each marked `DESIGN-PENDING (R-list)` where it is defined).
 */
export default function MyResumesPage({ resumes, usage, baseProfile, isPro }: MyResumesPageProps) {
  const display = useDateDisplay();
  const soon = useSoon();
  const { create, busy, limit } = useNewResume();
  const [view, setView] = useViewMode();
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<TabId>("all");
  const [status, setStatus] = useState<StatusFilter>("All Status");
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [query, setQuery] = useState("");

  const models = useMemo(() => toCardModels(resumes), [resumes]);
  const counts = useMemo(() => tabCounts(models), [models]);
  const shown = useMemo(() => applyQuery(models, { tab, status, sort, query }), [models, tab, status, sort, query]);
  const filtering = query.trim() !== "" || status !== "All Status";

  const clearFilters = () => {
    setQuery("");
    setStatus("All Status");
  };

  const empty = TAB_EMPTY[models.length === 0 ? "all" : tab];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <ResumesHero onNew={create} busy={busy} />

      {limit && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-v2-line bg-paper p-3.5 text-[13.5px] text-ink shadow-v2-soft">
          <p className="min-w-0 flex-1">{limit.message}</p>
          {limit.plan === "PRO" || isPro ? (
            <button type="button" onClick={() => setDrawer(true)} className="font-bold text-v2-blue hover:underline">
              Archive a resume
            </button>
          ) : (
            <Link href="/pricing" className="font-bold text-v2-blue hover:underline">
              See Pro
            </Link>
          )}
        </div>
      )}

      <section aria-label="Your resumes" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border border-v2-line/70 bg-paper px-2 shadow-v2-soft sm:px-3">
          <UnderlineTabs
            ariaLabel="Resume status"
            tone="blue"
            padded
            counts="pill"
            value={tab}
            onChange={(id) => setTab(id as TabId)}
            tabs={TAB_ORDER.map((id) => ({ id, label: TAB_LABELS[id], count: counts[id] }))}
            className="max-w-full min-w-0 border-b-0"
          />
          <div className="flex w-full flex-wrap items-center gap-2 pb-3 sm:pb-0 lg:w-auto">
            <SearchInput
              variant="grey"
              size="sm"
              placeholder="Search resumes..."
              aria-label="Search resumes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              wrapperClassName="w-full sm:w-56"
            />
            <FilterSelect label="Status" options={[...STATUS_FILTERS]} value={status} onChange={(v) => setStatus(v as StatusFilter)} className="w-[calc(50%-0.25rem)] sm:w-[128px]" />
            <FilterSelect label="Sort by" options={[...SORTS]} value={sort} onChange={(v) => setSort(v as SortKey)} className="w-[calc(50%-0.25rem)] sm:w-[150px]" />
            <div role="group" aria-label="Layout" className="ml-auto flex overflow-hidden rounded-[10px] border border-v2-line sm:ml-0">
              <button type="button" aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => setView("grid")} className={cn(VIEW_BTN, view === "grid" && "bg-v2-blue-soft text-v2-blue")}>
                <GridIcon size={16} />
              </button>
              <button type="button" aria-pressed={view === "list"} aria-label="List view" onClick={() => setView("list")} className={cn(VIEW_BTN, "border-l border-v2-line", view === "list" && "bg-v2-blue-soft text-v2-blue")}>
                <ListIcon size={16} />
              </button>
            </div>
          </div>
        </div>

        {shown.length === 0 ? (
          <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-v2-line bg-paper px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-v2-blue-soft text-v2-blue">
              <FileTextIcon size={22} aria-hidden />
            </span>
            {models.length > 0 && filtering ? (
              <>
                <p className="text-[15px] font-bold text-ink">No resumes match</p>
                <p className="max-w-sm text-[13.5px] text-ink-soft">Try a different search or status.</p>
                <button type="button" onClick={clearFilters} className="mt-1 text-[13.5px] font-bold text-v2-blue hover:underline">
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-[15px] font-bold text-ink">{empty.title}</p>
                <p className="max-w-sm text-[13.5px] text-ink-soft">{empty.body}</p>
                {models.length === 0 && (
                  <button
                    type="button"
                    onClick={create}
                    disabled={busy}
                    className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-v2-lime px-4 text-[13.5px] font-bold text-v2-navy hover:brightness-95 disabled:opacity-60"
                  >
                    <PlusIcon size={16} aria-hidden /> New Resume
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="@container">
            <ul
              data-view={view}
              className={cn(
                "grid gap-4",
                view === "grid" ? "grid-cols-1 @[640px]:grid-cols-2 @[1100px]:grid-cols-3" : "grid-cols-1 gap-3",
              )}
            >
              {shown.map((m) => (
                <ResumeCard key={m.id} model={m} layout={view} display={display} onManage={() => setDrawer(true)} soon={soon} />
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <PopularTemplates onViewAll={soon("The template gallery")} />
        <QuickTips />
      </div>

      {drawer && <ResumeDrawer onClose={() => setDrawer(false)} baseProfile={baseProfile} resumes={resumes} usage={usage} isPro={isPro} />}
    </div>
  );
}
