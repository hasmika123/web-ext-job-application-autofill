"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FunnelIcon, cn } from "@kiwiply/ui";
import type { AppStatusKey } from "../../app-v2/sample-data";
import type { ApplicationRow } from "../../app-v2/applications/mapping";
import {
  CompanyTile,
  DataTable,
  FilterSelect,
  KebabMenu,
  SearchInput,
  StatusChip,
  UnderlineTabs,
  type DataColumn,
  type Tone,
} from "../../app-v2/common";
import { V3_APPLICATION_ROWS, V3_APPLICATION_SAMPLE_COUNTS, type V3ApplicationSample } from "../sample-data.b";
import HeroBand from "../local-b/HeroBand";

type TabKey = "all" | "applied" | "in-review" | "interview" | "offer" | "rejected";
type Row = ApplicationRow | V3ApplicationSample;

const TABS: { value: TabKey; label: string }[] = [
  { value: "all", label: "All" },
  { value: "applied", label: "Applied" },
  { value: "in-review", label: "Under Review" },
  { value: "interview", label: "Interviews" },
  { value: "offer", label: "Offers" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_CHIP: Record<AppStatusKey, { label: string; tone: Tone }> = {
  applied: { label: "Applied", tone: "blue" },
  "in-review": { label: "Under Review", tone: "amber" },
  interview: { label: "Interview", tone: "green" },
  offer: { label: "Offer", tone: "violet" },
  rejected: { label: "Rejected", tone: "coral" },
  withdrawn: { label: "Withdrawn", tone: "slate" },
  draft: { label: "Draft", tone: "slate" },
};

const RANGES = ["Last 7 days", "Last 30 days", "Last 90 days", "All time"] as const;
const RANGE_DAYS: Record<string, number> = { "Last 7 days": 7, "Last 30 days": 30, "Last 90 days": 90 };
const SORTS = ["Recently Updated", "Oldest First", "Company", "Status"] as const;

/**
 * My Applications (APP-V3-SPEC section 2.3). `rows` are the REAL applications mapped by the v2
 * `mapApplications` (SAVED rows are bookmarks and left out); with none yet the board's sample rows
 * render (`usingSample`) so the page still looks like the design. Next Step follows the board: the
 * interview slot, "Review offer", else an em dash. Below `md` the table becomes stacked cards.
 */
export default function ApplicationsV3Page({ rows: realRows }: { rows: ApplicationRow[] }) {
  const router = useRouter();
  const usingSample = realRows.length === 0;
  const all: Row[] = useMemo(() => {
    if (usingSample) return V3_APPLICATION_ROWS;
    // Board rule: only an interview or an offer has a "next step"; everything else shows a dash.
    return realRows.map((r) => ({
      ...r,
      nextStep: r.status === "interview" ? "Interview in progress" : r.status === "offer" ? "Review offer" : "—",
    }));
  }, [realRows, usingSample]);

  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [range, setRange] = useState<string>(usingSample ? "Last 30 days" : "All time");
  const [onlyNext, setOnlyNext] = useState(false);
  const [sort, setSort] = useState<string>(SORTS[0]);
  const [mountedAt] = useState(() => Date.now());

  const count = (s: AppStatusKey) => all.filter((r) => r.status === s).length;
  const counts: Record<TabKey, number> = usingSample
    ? { ...V3_APPLICATION_SAMPLE_COUNTS }
    : {
        all: all.length,
        applied: count("applied"),
        "in-review": count("in-review"),
        interview: count("interview"),
        offer: count("offer"),
        rejected: count("rejected"),
      };

  const companies = useMemo(() => Array.from(new Set(all.map((r) => r.company))).sort(), [all]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const days = RANGE_DAYS[range];
    const cutoff = days && !usingSample ? mountedAt - days * 86400000 : null;
    const list = all.filter(
      (r) =>
        (tab === "all" || r.status === tab) &&
        (!status || STATUS_CHIP[r.status].label === status) &&
        (!company || r.company === company) &&
        (!q || `${r.title} ${r.company} ${r.sub}`.toLowerCase().includes(q)) &&
        (!onlyNext || r.nextStep !== "—") &&
        (cutoff === null || !("sortKey" in r) || !r.sortKey || new Date(r.sortKey).getTime() >= cutoff),
    );
    if (sort === "Oldest First") return [...list].reverse();
    if (sort === "Company") return [...list].sort((a, b) => a.company.localeCompare(b.company));
    if (sort === "Status") return [...list].sort((a, b) => STATUS_CHIP[a.status].label.localeCompare(STATUS_CHIP[b.status].label));
    return list; // newest first already (mapper sorts real rows; sample rows are in board order)
  }, [all, tab, query, status, company, range, onlyNext, sort, usingSample, mountedAt]);

  const columns: DataColumn<Row>[] = [
    {
      key: "title",
      primary: true,
      className: "w-[28%]",
      header: "Job Title",
      render: (r) => (
        <span className="flex items-center gap-3">
          <CompanyTile name={r.company} size={40} />
          <span className="min-w-0 text-left">
            <span className="block truncate text-[14px] font-bold leading-snug text-v2-navy">{r.title}</span>
            <span className="block truncate text-[12.5px] text-v2-ink-soft">
              <span className="xl:hidden">{r.company}{r.sub ? " · " : ""}</span>
              {r.sub}
            </span>
          </span>
        </span>
      ),
    },
    { key: "company", className: "hidden w-[14%] xl:table-cell", header: "Company", render: (r) => <span className="text-[13.5px] text-v2-navy">{r.company}</span> },
    {
      key: "status",
      className: "w-[14%] whitespace-nowrap",
      header: "Status",
      render: (r) => {
        const c = STATUS_CHIP[r.status];
        return (
          <StatusChip tone={c.tone} dot>
            {c.label}
          </StatusChip>
        );
      },
    },
    { key: "applied", className: "w-[14%] whitespace-nowrap", header: "Applied Date", render: (r) => <span className="text-[13.5px] text-v2-ink-soft">{r.appliedOn}</span> },
    {
      key: "next",
      className: "w-[18%]",
      header: "Next Step",
      render: (r) => (
        <span className="text-[13px] leading-snug text-v2-ink-soft">
          {r.nextStep}
          {"nextStepDetail" in r && r.nextStepDetail && (
            <span className="block text-[12px] text-v2-muted">{r.nextStepDetail}</span>
          )}
        </span>
      ),
    },
  ];

  const rowAction = (r: Row) => {
    const cls =
      "inline-flex h-9 min-w-[64px] items-center justify-center rounded-lg bg-v2-blue-soft px-3.5 text-[13px] font-semibold text-v2-blue hover:brightness-95";
    const target = r.href ?? (usingSample ? "/jobs" : null);
    return (
      <span className="inline-flex items-center gap-1">
        {target ? (
          target.startsWith("/") ? (
            <Link href={target} className={cls}>
              View
            </Link>
          ) : (
            <a href={target} target="_blank" rel="noopener noreferrer" className={cls}>
              View
            </a>
          )
        ) : (
          <span className={cn(cls, "opacity-50")}>View</span>
        )}
        <KebabMenu
          label={`More actions for ${r.title} at ${r.company}`}
          items={[
            ...(r.href ? [{ label: "Open job posting", onSelect: () => window.open(r.href!, "_blank", "noopener,noreferrer") }] : []),
            { label: "Prepare for interview", onSelect: () => router.push("/interview-prep") },
          ]}
        />
      </span>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <HeroBand
        title="My Applications"
        subtitle="Track, manage, and never miss an update."
        mascot="mascot-apps"
        note="Keep going. You're closer than you think!"
      />

      <section className="min-w-0 rounded-2xl border border-v2-line bg-white shadow-v2-card">
        <UnderlineTabs
          padded
          counts="pill"
          ariaLabel="Application status"
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          className="px-2 sm:px-4"
          tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))}
        />

        <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
          <SearchInput
            size="sm"
            aria-label="Search applications"
            placeholder="Search applications..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full bg-white sm:w-60"
          />
          <FilterSelect placeholder label="All Status" options={Object.values(STATUS_CHIP).map((c) => c.label)} value={status} onChange={setStatus} />
          <FilterSelect placeholder label="All Companies" options={companies} value={company} onChange={setCompany} />
          <FilterSelect label="Date range" options={[...RANGES]} value={range} onChange={setRange} />
          <button
            type="button"
            aria-pressed={onlyNext}
            onClick={() => setOnlyNext((v) => !v)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-medium",
              onlyNext ? "border-v2-blue/40 bg-v2-blue-soft text-v2-blue" : "border-[#DCE2EE] bg-white text-v2-navy hover:bg-[#F1F5FB]",
            )}
            title="Only show applications with a next step"
          >
            <FunnelIcon className="h-4 w-4" /> Filter
          </button>
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-[12.5px] text-v2-ink-soft">Sort by:</span>
            <FilterSelect label="Sort by" options={[...SORTS]} value={sort} onChange={setSort} />
          </div>
        </div>

        <div className="px-3 pb-4 sm:px-4">
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-v2-line px-4 py-10 text-center text-[14px] text-v2-ink-soft">
              No applications match these filters.
            </p>
          ) : (
            <DataTable
              columns={columns}
              rows={shown}
              rowKey={(r) => r.id}
              actions={rowAction}
              actionsHeader={<span className="pr-2">Actions</span>}
              aria-label="Applications"
              footer={
                <p className="text-[13px] text-v2-muted">
                  Showing {shown.length} of {usingSample ? counts[tab] : all.length} application{shown.length === 1 ? "" : "s"}
                </p>
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}
