"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookmarkIcon, CheckCircleIcon, LayoutGridIcon, MenuIcon, cn, useToast } from "@kiwiply/ui";
import { CompanyTile, KebabMenu, SearchInput, UnderlineTabs } from "../../app-v2/common";
import { V3_SAVED_JOBS, type V3SavedJob, type V3SavedState } from "../sample-data.b";
import HeroBand from "../local-b/HeroBand";

type TabKey = "all" | "recent" | "to-apply" | "applied" | "not-interested";

const RECENT_DAYS = 14;

/**
 * Saved Jobs (APP-V3-SPEC section 2.10). Sample data + client state (the v2 behaviour): search,
 * the list/grid toggle, "Remove" and moving a job between To Apply / Applied / Not Interested all
 * work locally and the tab counts follow. Rows keep the board's order (newest saved first).
 */
export default function SavedV3Page() {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, V3SavedState>>({});

  const live = useMemo(
    () => V3_SAVED_JOBS.filter((j) => !removed.has(j.id)).map((j) => ({ ...j, state: overrides[j.id] ?? j.state })),
    [removed, overrides],
  );

  const counts: Record<TabKey, number | undefined> = {
    all: live.length,
    recent: undefined,
    "to-apply": live.filter((j) => j.state === "to-apply").length,
    applied: live.filter((j) => j.state === "applied").length,
    "not-interested": live.filter((j) => j.state === "not-interested").length,
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return live.filter(
      (j) =>
        (tab === "all" || (tab === "recent" ? j.savedDaysAgo <= RECENT_DAYS : j.state === tab)) &&
        (!q || `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [live, tab, query]);

  const remove = (j: V3SavedJob) => {
    setRemoved((prev) => new Set(prev).add(j.id));
    toast({ title: "Removed from saved jobs", description: `${j.title} at ${j.company}` });
  };
  const move = (j: V3SavedJob, state: V3SavedState) => setOverrides((prev) => ({ ...prev, [j.id]: state }));

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <HeroBand
        title="Saved Jobs"
        subtitle="Keep track of opportunities you're interested in."
        mascot="mascot-heart"
        note="Good opportunities lead to great journeys!"
      />

      <section className="min-w-0 rounded-2xl border border-v2-line bg-white shadow-v2-card">
        <UnderlineTabs
          padded
          counts="paren"
          ariaLabel="Saved jobs views"
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          className="px-2 sm:px-4"
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "recent", label: "Recently Saved" },
            { value: "to-apply", label: "To Apply", count: counts["to-apply"] },
            { value: "applied", label: "Applied", count: counts.applied },
            { value: "not-interested", label: "Not Interested", count: counts["not-interested"] },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
          <SearchInput
            size="sm"
            aria-label="Search saved jobs"
            placeholder="Search saved jobs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
                className={cn(
                  "flex h-10 w-10 items-center justify-center",
                  view === key ? "bg-v2-blue-soft text-v2-blue" : "bg-white text-v2-ink-soft hover:bg-[#F1F5FB]",
                )}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 pb-10 pt-6 text-center text-[14px] text-v2-ink-soft">No saved jobs match these filters.</p>
        ) : (
          <ul className={cn("px-3 pb-3 sm:px-4 sm:pb-4", view === "grid" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "divide-y divide-v2-line/70")}>
            {rows.map((j) => (
              <li
                key={j.id}
                className={cn(
                  "flex flex-col gap-3 py-4 md:flex-row md:items-center md:gap-4",
                  view === "grid" && "rounded-2xl border border-v2-line p-4 md:flex-col md:items-stretch",
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <CompanyTile name={j.company} size={46} />
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold leading-snug tracking-normal text-v2-navy">{j.title}</h3>
                    <p className="mt-0.5 text-[13px] text-v2-ink-soft">
                      {j.company} {"·"} {j.location} {"·"} {j.mode}
                      {j.salary && (
                        <>
                          {" "}
                          {"·"} {j.salary}
                        </>
                      )}
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
                  <p className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] leading-tight text-v2-muted md:w-[128px]">
                    <BookmarkIcon className="h-3.5 w-3.5 flex-none text-v2-blue" /> Saved {j.savedLabel}
                  </p>
                  <div className="ml-auto flex items-center gap-1.5 md:ml-0">
                    {j.state === "applied" ? (
                      <span className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl bg-v2-green-soft px-4 text-[13.5px] font-bold text-v2-green-ink">
                        <CheckCircleIcon className="h-4 w-4" /> Applied
                      </span>
                    ) : (
                      // The sample ids don't exist in the Job Search sample set, so this goes to the list.
                      <Link
                        href="/jobs"
                        className="inline-flex h-10 items-center whitespace-nowrap rounded-xl bg-v2-lime px-5 text-[13.5px] font-bold text-v2-navy hover:brightness-95"
                      >
                        Apply
                      </Link>
                    )}
                    <KebabMenu
                      label={`More actions for ${j.title} at ${j.company}`}
                      items={[
                        { label: "View job", onSelect: () => router.push("/jobs") },
                        ...(j.state !== "applied" ? [{ label: "Mark as applied", onSelect: () => move(j, "applied") }] : []),
                        ...(j.state !== "to-apply" ? [{ label: "Move to To Apply", onSelect: () => move(j, "to-apply") }] : []),
                        ...(j.state !== "not-interested" ? [{ label: "Not interested", onSelect: () => move(j, "not-interested") }] : []),
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
    </div>
  );
}
