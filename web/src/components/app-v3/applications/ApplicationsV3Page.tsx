"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ErrorState, StarIcon, TableSkeleton, cn, useToast } from "@kiwiply/ui";
import {
  CompanyTile,
  DataTable,
  FilterSelect,
  HeroBand,
  KebabMenu,
  Pagination,
  SearchInput,
  StatusChip,
  UnderlineTabs,
  type DataColumn,
} from "@/components/app-v2/common";
import {
  TRACKER_PAGE_SIZE,
  asListPage,
  dayAndTime,
  patchApplication,
  shortDay,
  statusLabel,
  statusTone,
  type Application,
} from "@/lib/applications";
import { useListQuery, type Filters } from "@/lib/list-query";
import { undoToast } from "@/lib/undo-toast";
import ApplicationDetail from "./ApplicationDetail";

type TabKey = "all" | "applied" | "in-review" | "interview" | "offer" | "rejected" | "archived";

/** What each tab asks the list for, and which summary count it shows. */
const TABS: { value: TabKey; label: string; status?: string; archived?: boolean; summary: string }[] = [
  { value: "all", label: "All", summary: "ALL" },
  { value: "applied", label: "Applied", status: "APPLIED", summary: "APPLIED" },
  { value: "in-review", label: "Under review", status: "IN_REVIEW", summary: "IN_REVIEW" },
  { value: "interview", label: "Interviews", status: "INTERVIEW", summary: "INTERVIEW" },
  { value: "offer", label: "Offers", status: "OFFER", summary: "OFFER" },
  { value: "rejected", label: "Rejected", status: "REJECTED", summary: "REJECTED" },
  { value: "archived", label: "Archived", archived: true, summary: "ARCHIVED" },
];

const SORTS = [
  { label: "Recently updated", value: "updatedAt,desc" },
  { label: "Recently applied", value: "appliedAt,desc" },
  { label: "Oldest first", value: "createdAt,asc" },
  { label: "Company A-Z", value: "company,asc" },
  { label: "By status", value: "status,asc" },
] as const;
const DEFAULT_SORT = SORTS[0].value;

const csv = (v: Filters[string]): string => (Array.isArray(v) ? v.join(",") : (v ?? ""));

/** Which tab the list's filters describe. */
export function tabOf(filters: Filters): TabKey {
  if (csv(filters.archived) === "true") return "archived";
  const status = csv(filters.status);
  return TABS.find((t) => t.status && t.status === status)?.value ?? "all";
}

/**
 * My Applications (APP-V3-SPEC 2.3, U6.3). The list is the server's: real paging, search, sort and the per-tab
 * counts all come from `GET /api/applications` (list v2), so nothing here invents a number. A row opens the detail
 * (a side panel on a desktop, a bottom sheet on a phone; `?app=<id>` deep-links to it). A real account with no
 * applications gets the mascot empty state, never a sample row.
 */
export default function ApplicationsV3Page({ initialOpenId = null, isPro = false }: { initialOpenId?: number | null; isPro?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const list = useListQuery<Application>("/api/applications", {
    size: TRACKER_PAGE_SIZE,
    sort: DEFAULT_SORT,
    filters: { status: undefined, archived: undefined, ghosted: undefined },
  });
  const [openId, setOpenId] = useState<number | null>(initialOpenId);
  const returnRef = useRef<HTMLElement | null>(null);

  const tab = tabOf(list.filters);
  const ghostedOnly = csv(list.filters.ghosted) === "true";
  const summary = list.summary;
  const page = asListPage(list.data);

  const setTab = (next: string) => {
    const t = TABS.find((x) => x.value === next);
    if (!t) return;
    list.setFilter("status", t.status);
    list.setFilter("archived", t.archived ? "true" : undefined);
  };

  const openApp = useCallback((id: number | null) => {
    if (id !== null) returnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenId(id);
    const p = new URLSearchParams(window.location.search);
    if (id === null) p.delete("app");
    else p.set("app", String(id));
    const qs = p.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, []);

  const { optimistic, refetch } = list;
  const onRow = useCallback((id: number, patch: Partial<Application>) => void optimistic(id, patch), [optimistic]);

  /** Archive / restore straight from a row's menu: the row leaves at once, Undo brings it back. */
  async function archiveRow(a: Application) {
    const to = !a.archived;
    const rollback = optimistic(a.id, null);
    const r = await patchApplication(a.id, { archived: to });
    if (r.kind === "error") {
      rollback();
      toast({ title: to ? "Couldn't archive that" : "Couldn't restore that", description: r.message, variant: "error" });
      return;
    }
    refetch();
    undoToast(toast, {
      title: to ? "Application archived" : "Application restored",
      onUndo: () => void patchApplication(a.id, { archived: !to }).then(() => refetch()),
    });
  }

  async function starRow(a: Application) {
    const to = !a.starred;
    const rollback = optimistic(a.id, { starred: to });
    const r = await patchApplication(a.id, { starred: to });
    if (r.kind === "error") {
      rollback();
      toast({ title: "Couldn't update the star", description: r.message, variant: "error" });
    }
  }

  const seed = openId === null ? null : (list.items.find((a) => a.id === openId) ?? null);
  const pages = Math.max(1, Math.ceil(list.total / Math.max(1, page.size || list.size)));
  const hero = (
    <HeroBand mascotHeight={124} title="My Applications" subtitle="Track, manage, and never miss an update." mascot="mascot-apps" note="Keep going. You're closer than you think!" />
  );

  const trulyEmpty = !list.isLoading && !list.error && list.total === 0 && !list.q && tab === "all" && !ghostedOnly && (summary?.ALL ?? 0) === 0 && (summary?.ARCHIVED ?? 0) === 0;

  const columns: DataColumn<Application>[] = [
    {
      key: "title",
      primary: true,
      className: "w-[34%]",
      header: "Job",
      render: (a) => (
        <span className="flex items-center gap-3">
          <CompanyTile name={a.company} size={40} />
          <span className="min-w-0 text-left">
            <button
              type="button"
              onClick={() => openApp(a.id)}
              className="block max-w-full text-left md:truncate text-[14px] font-bold leading-snug text-v2-navy hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {a.starred && <StarIcon aria-label="Starred" className="mr-1 inline h-3.5 w-3.5 fill-current text-v2-amber" />}
              {a.roleTitle}
            </button>
            <span className="block truncate text-[12.5px] text-v2-ink-soft">
              {a.company}
              {a.location ? ` · ${a.location}` : ""}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "status",
      className: "w-[16%]",
      header: "Status",
      render: (a) => (
        <span className="flex flex-wrap items-center gap-1">
          <StatusChip tone={statusTone(a.status)} dot>
            {statusLabel(a.status)}
          </StatusChip>
          {a.ghosted && <StatusChip tone="amber">Gone quiet</StatusChip>}
        </span>
      ),
    },
    { key: "applied", className: "w-[14%] whitespace-nowrap", header: "Applied", render: (a) => <span className="text-[13.5px] text-v2-ink-soft">{shortDay(a.appliedAt) || "—"}</span> },
    {
      key: "next",
      className: "w-[22%]",
      header: "Next step",
      render: (a) => (
        <span className="text-[13px] leading-snug text-v2-ink-soft">
          {a.nextStep ? a.nextStep.label : "—"}
          {a.nextStep?.at && <span className="block text-[12px] text-v2-muted">{dayAndTime(a.nextStep.at)}</span>}
        </span>
      ),
    },
  ];

  const rowAction = (a: Application) => (
    // The row itself opens the detail; its buttons must not also bubble a row click.
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => openApp(a.id)}
        className="inline-flex h-10 min-w-[64px] items-center justify-center rounded-lg bg-v2-blue-soft px-3.5 text-[13px] font-semibold text-v2-blue hover:brightness-95 sm:h-9"
      >
        View
      </button>
      <KebabMenu
        label={`More actions for ${a.roleTitle} at ${a.company}`}
        items={[
          ...(a.jobUrl ? [{ label: "Open job posting", onSelect: () => window.open(a.jobUrl!, "_blank", "noopener,noreferrer") }] : []),
          { label: a.starred ? "Remove star" : "Star it", onSelect: () => void starRow(a) },
          { label: "Prepare for interview", onSelect: () => router.push("/interview-prep") },
          { separator: true },
          { label: a.archived ? "Restore" : "Archive", onSelect: () => void archiveRow(a) },
        ]}
      />
    </span>
  );

  const detail = <ApplicationDetail id={openId} seed={seed} isPro={isPro} onClose={() => openApp(null)} onRow={onRow} onStale={refetch} returnFocusTo={returnRef} />;

  if (trulyEmpty) {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
        {hero}
        <EmptyState
          mascot
          title="No applications yet"
          description="Apply with the Kiwiply extension, or add a job you are chasing, and it lands here with its whole story."
          action={
            <Link href="/jobs" className="inline-flex h-10 items-center rounded-xl bg-v2-lime px-5 text-[13.5px] font-bold text-v2-navy hover:brightness-95">
              Find jobs
            </Link>
          }
        />
        {detail}
      </div>
    );
  }

  const from = list.total === 0 ? 0 : page.page * (page.size || list.size) + 1;
  const to = Math.min(list.total, from + page.items.length - 1);
  const footerText = `Showing ${from}–${to} of ${list.total} application${list.total === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      {hero}

      <section className="min-w-0 rounded-2xl border border-v2-line bg-white shadow-v2-card">
        <UnderlineTabs
          padded
          counts="pill"
          ariaLabel="Application status"
          value={tab}
          onChange={setTab}
          className="px-2 sm:px-4"
          tabs={TABS.map((t) => ({ id: t.value, label: t.label, count: summary ? (summary[t.summary] ?? 0) : undefined }))}
        />

        <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
          <SearchInput
            size="sm"
            aria-label="Search applications"
            placeholder="Search applications…"
            value={list.q}
            onChange={(e) => list.setQuery(e.target.value)}
            className="h-10 w-full bg-white sm:w-72"
          />
          {((summary?.GHOSTED ?? 0) > 0 || ghostedOnly) && (
            <button
              type="button"
              aria-pressed={ghostedOnly}
              onClick={() => list.setFilter("ghosted", ghostedOnly ? undefined : "true")}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-medium",
                ghostedOnly ? "border-v2-amber/60 bg-v2-amber-soft text-v2-amber-ink" : "border-[#DCE2EE] bg-white text-v2-navy hover:bg-[#F1F5FB]",
              )}
            >
              Gone quiet
              <span className="rounded-full bg-paper-2 px-1.5 text-[11.5px] font-bold tabular-nums text-ink-soft">{summary?.GHOSTED ?? 0}</span>
            </button>
          )}
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-[12.5px] text-v2-ink-soft">Sort by:</span>
            <FilterSelect
              label="Sort by"
              options={SORTS.map((s) => s.label)}
              value={SORTS.find((s) => s.value === (list.sort ?? DEFAULT_SORT))?.label ?? SORTS[0].label}
              onChange={(label) => list.setSort(SORTS.find((s) => s.label === label)?.value)}
            />
          </div>
        </div>

        <div className="px-3 pb-4 sm:px-4" aria-busy={list.isFetching}>
          {list.isLoading ? (
            <TableSkeleton label="Loading your applications" columns={4} />
          ) : list.error && !list.data ? (
            <ErrorState what="your applications" description={list.error.message} requestId={list.error.requestId} onRetry={refetch} />
          ) : list.items.length === 0 ? (
            <EmptyState
              variant="inline"
              title={list.q ? `Nothing matches "${list.q}"` : tab === "archived" ? "Nothing archived" : ghostedOnly ? "Nobody has gone quiet" : "Nothing in this tab yet"}
              description={
                list.q
                  ? "Try a different word, or clear the search."
                  : tab === "archived"
                    ? "Applications you archive wait here, and you can bring them back."
                    : ghostedOnly
                      ? "When an application hears nothing for a few weeks, it shows up here for a nudge."
                      : "Move an application to this stage and it will show up here."
              }
              action={
                list.q ? (
                  <Button size="sm" variant="ghost" onClick={() => list.setQuery("")} className="min-h-10">
                    Clear search
                  </Button>
                ) : undefined
              }
              className="py-10"
            />
          ) : (
            <>
              {list.error && <ErrorState variant="inline" what="the latest applications" description="Showing what we had." onRetry={refetch} />}
              <DataTable
                columns={columns}
                rows={list.items}
                rowKey={(a) => a.id}
                actions={rowAction}
                actionsHeader={<span className="pr-2">Actions</span>}
                onRowClick={(a) => openApp(a.id)}
                isActive={(a) => a.id === openId}
                aria-label="Applications"
                footer={
                  pages > 1 ? (
                    <Pagination page={list.page + 1} pages={pages} summary={footerText} onPageChange={(p) => list.setPage(p - 1)} />
                  ) : (
                    <p className="text-[13px] text-v2-muted">{footerText}</p>
                  )
                }
              />
            </>
          )}
        </div>
      </section>
      {detail}
    </div>
  );
}

