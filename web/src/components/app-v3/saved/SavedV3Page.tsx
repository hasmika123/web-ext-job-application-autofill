"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ErrorState, LayoutGridIcon, ListSkeleton, MenuIcon, cn, useToast } from "@kiwiply/ui";
import { HeroBand, Pagination, SearchInput, UnderlineTabs } from "@/components/app-v2/common";
import { SUBMITTED_STATUSES, TRACKER_PAGE_SIZE, asListPage, patchApplication, statusCsv, type Application } from "@/lib/applications";
import { useListQuery, type Filters } from "@/lib/list-query";
import { undoToast } from "@/lib/undo-toast";
import SavedCard, { type SavedTab } from "./SavedCard";

/** What each tab asks the list for. To apply = SAVED; Applied = every submitted status; Not interested = archived SAVED. */
const TAB_FILTERS: Record<SavedTab, { status: string; archived?: string }> = {
  "to-apply": { status: "SAVED" },
  applied: { status: statusCsv(SUBMITTED_STATUSES) },
  "not-interested": { status: "SAVED", archived: "true" },
};

const csv = (v: Filters[string]): string => (Array.isArray(v) ? v.join(",") : (v ?? ""));

/** Which tab the list's filters describe (the URL is the source of truth, so a refresh lands on the same tab). */
export function savedTabOf(filters: Filters): SavedTab {
  if (csv(filters.archived) === "true") return "not-interested";
  return csv(filters.status).includes("APPLIED") ? "applied" : "to-apply";
}

/** The count behind the Not interested tab: archived SAVED applications are not in the list's summary, so one tiny query. */
function useNotInterestedCount(refreshKey: unknown): [number | null, (delta: number) => void] {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/applications?status=SAVED&archived=true&size=1&page=0", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (live && body) setCount(asListPage(body).total);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return [count, (delta) => setCount((c) => (c === null ? c : Math.max(0, c + delta)))];
}

const EMPTY: Record<SavedTab, { title: string; description: string; cta?: { label: string; href: string } }> = {
  "to-apply": {
    title: "Nothing saved yet",
    description: "Tap the bookmark on a job you like and it waits here, on your phone and your laptop.",
    cta: { label: "Find jobs", href: "/jobs" },
  },
  applied: {
    title: "No applications yet",
    description: "Once you apply, the job moves here so you can see how it is going.",
    cta: { label: "Open My Applications", href: "/applications" },
  },
  "not-interested": {
    title: "Nothing set aside",
    description: "Jobs you remove from your saved list wait here in case you change your mind.",
  },
};

/**
 * Saved Jobs (APP-V3-SPEC 2.10, U5.1) on the real SAVED applications. Saving on a phone shows up on the laptop
 * because it is the same list the extension and the board use. Tabs: To apply (SAVED), Applied (what has been sent),
 * Not interested (removed from the list, archived, so Undo and "put back" are always possible). Search, paging and
 * the counts are the server's (list v2); nothing here is sample data.
 */
export default function SavedV3Page() {
  const toast = useToast();
  const router = useRouter();
  const list = useListQuery<Application>("/api/applications", {
    size: TRACKER_PAGE_SIZE,
    sort: "createdAt,desc",
    filters: { status: TAB_FILTERS["to-apply"].status, archived: undefined },
  });
  const [view, setView] = useState<"list" | "grid">("list");
  const [mountedAt] = useState(() => Date.now());
  const [notInterested, bumpNotInterested] = useNotInterestedCount(list.data);

  const tab = savedTabOf(list.filters);
  const summary = list.summary;
  const submitted = summary ? SUBMITTED_STATUSES.reduce((n, s) => n + (summary[s] ?? 0), 0) : undefined;
  const counts: Record<SavedTab, number | undefined> = { "to-apply": summary?.SAVED, applied: submitted, "not-interested": notInterested ?? undefined };

  const setTab = (next: string) => {
    const f = TAB_FILTERS[next as SavedTab];
    if (!f) return;
    list.setFilter("status", f.status);
    list.setFilter("archived", f.archived);
  };

  const { optimistic, refetch } = list;

  /** Move a saved job to another place: it leaves this tab at once, a refusal puts it back, Undo reverses the move. */
  const move = useCallback(
    async (job: Application, change: { status?: "APPLIED" | "SAVED"; archived?: boolean }, undoChange: typeof change, messages: { done: string; description?: string; fail: string }, tabDelta: number) => {
      const rollback = optimistic(job.id, null);
      const r = await patchApplication(job.id, change);
      if (r.kind === "error") {
        rollback();
        toast({ title: messages.fail, description: r.message, variant: "error" });
        return;
      }
      if (tabDelta !== 0) bumpNotInterested(tabDelta);
      refetch();
      undoToast(toast, {
        title: messages.done,
        description: messages.description ?? `${job.roleTitle} at ${job.company}`,
        onUndo: () => {
          if (tabDelta !== 0) bumpNotInterested(-tabDelta);
          void patchApplication(job.id, undoChange).then(() => refetch());
        },
      });
    },
    [optimistic, refetch, toast, bumpNotInterested],
  );

  const hero = (
    <HeroBand
      mascotHeight={124}
      title="Saved Jobs"
      subtitle="Keep track of opportunities you're interested in."
      mascot="mascot-heart"
      note="Good opportunities lead to great journeys!"
    />
  );

  const pages = Math.max(1, Math.ceil(list.total / Math.max(1, list.size)));
  const empty = EMPTY[tab];
  const from = list.total === 0 ? 0 : list.page * list.size + 1;
  const to = Math.min(list.total, from + list.items.length - 1);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      {hero}

      <section className="min-w-0 rounded-2xl border border-v2-line bg-white shadow-v2-card">
        <UnderlineTabs
          padded
          counts="paren"
          ariaLabel="Saved jobs views"
          value={tab}
          onChange={setTab}
          className="px-2 sm:px-4"
          tabs={[
            { id: "to-apply", label: "To apply", count: counts["to-apply"] },
            { id: "applied", label: "Applied", count: counts.applied },
            { id: "not-interested", label: "Not interested", count: counts["not-interested"] },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
          <SearchInput
            size="sm"
            aria-label="Search saved jobs"
            placeholder="Search saved jobs…"
            value={list.q}
            onChange={(e) => list.setQuery(e.target.value)}
            className="h-10 w-full bg-white sm:w-64"
          />
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
                className={cn("flex h-10 w-10 items-center justify-center", view === key ? "bg-v2-blue-soft text-v2-blue" : "bg-white text-v2-ink-soft hover:bg-[#F1F5FB]")}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 pb-3 sm:px-4 sm:pb-4" aria-busy={list.isFetching}>
          {list.isLoading ? (
            <ListSkeleton label="Loading your saved jobs" count={4} />
          ) : list.error && !list.data ? (
            <ErrorState what="your saved jobs" description={list.error.message} requestId={list.error.requestId} onRetry={refetch} />
          ) : list.items.length === 0 ? (
            list.q ? (
              <EmptyState
                variant="inline"
                title={`Nothing matches "${list.q}"`}
                description="Try a different word, or clear the search."
                action={
                  <Button size="sm" variant="ghost" onClick={() => list.setQuery("")} className="min-h-10">
                    Clear search
                  </Button>
                }
                className="py-10"
              />
            ) : (
              <EmptyState
                mascot
                title={empty.title}
                description={empty.description}
                action={
                  empty.cta ? (
                    <Link href={empty.cta.href} className="inline-flex h-10 items-center rounded-xl bg-v2-lime px-5 text-[13.5px] font-bold text-v2-navy hover:brightness-95">
                      {empty.cta.label}
                    </Link>
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              <ul className={cn(view === "grid" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "divide-y divide-v2-line/70")}>
                {list.items.map((job) => (
                  <SavedCard
                    key={job.id}
                    job={job}
                    tab={tab}
                    view={view}
                    now={mountedAt}
                    onOpen={() => router.push(`/applications?app=${job.id}`)}
                    onMarkApplied={() =>
                      void move(job, { status: "APPLIED" }, { status: "SAVED" }, { done: "Marked as applied. Fingers crossed!", fail: "Couldn't mark that as applied" }, 0)
                    }
                    onRemove={() =>
                      void move(job, { archived: true }, { archived: false }, { done: "Removed from saved jobs", fail: "Couldn't remove that" }, 1)
                    }
                    onRestore={() =>
                      void move(job, { archived: false }, { archived: true }, { done: "Back in your To apply list", fail: "Couldn't put that back" }, -1)
                    }
                  />
                ))}
              </ul>
              <div className="mt-3 border-t border-v2-line/70 pt-3">
                {pages > 1 ? (
                  <Pagination page={list.page + 1} pages={pages} summary={`Showing ${from}–${to} of ${list.total}`} onPageChange={(p) => list.setPage(p - 1)} />
                ) : (
                  <p className="text-[13px] text-v2-muted">{`Showing ${from}–${to} of ${list.total}`}</p>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
