"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  LightbulbIcon,
  MenuIcon,
  XIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import {
  APPLICATION_ACTIVITY,
  APPLICATION_INSIGHTS,
  APPLICATION_ROWS,
  APPLICATION_SAMPLE_COUNTS,
  APPLICATION_SAMPLE_PROGRESS,
  APPLICATION_SAMPLE_TILES,
  APPLICATION_UPCOMING,
  type AppStatusKey,
} from "../sample-data";
import {
  CompanyTile,
  DataTable,
  Donut,
  FilterSelect,
  HeroArt,
  KebabMenu,
  PageHero,
  SearchInput,
  SectionCard,
  StatTile,
  StatusChip,
  TONE,
  UnderlineTabs,
  type DataColumn,
  type Tone,
} from "../common";
import type { ApplicationRow } from "./mapping";

type TabKey = "all" | "in-review" | "interview" | "offer" | "rejected" | "withdrawn";
type Row = ApplicationRow | (typeof APPLICATION_ROWS)[number];

const STATUS_CHIP: Record<AppStatusKey, { label: string; tone: Tone; dot?: boolean; icon?: boolean }> = {
  interview: { label: "Interview", tone: "blue", dot: true },
  "in-review": { label: "In Review", tone: "amber", icon: true },
  applied: { label: "Applied", tone: "slate" },
  offer: { label: "Offer", tone: "green", dot: true },
  rejected: { label: "Rejected", tone: "coral", dot: true },
  withdrawn: { label: "Withdrawn", tone: "slate" },
  draft: { label: "Draft", tone: "slate" },
};

const TABS: { value: TabKey; label: string }[] = [
  { value: "all", label: "All Applications" },
  { value: "in-review", label: "In Review" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export interface ActivityItem {
  id: string;
  title: string;
  body: string;
  ago: string;
  tone: Tone;
}

/**
 * My Applications (board `app-my-applications.webp`). `rows` are the REAL applications mapped
 * by `mapping.ts`; when the account has none yet, the board's sample rows render instead
 * (`usingSample`) so the page still looks like the design. Tab counts, tiles and the progress
 * donut are computed from whichever rows are shown (the sample uses the board's numbers).
 */
export default function ApplicationsPage({
  rows: realRows,
  activity,
}: {
  rows: ApplicationRow[];
  activity: ActivityItem[];
}) {
  const toast = useToast();
  const router = useRouter();
  const usingSample = realRows.length === 0;
  const all: Row[] = usingSample ? APPLICATION_ROWS : realRows;

  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"date" | "company" | "status">("date");

  const count = (s: AppStatusKey) => all.filter((r) => r.status === s).length;
  const counts: Record<TabKey, number> = usingSample
    ? { ...APPLICATION_SAMPLE_COUNTS }
    : {
        all: all.length,
        "in-review": count("in-review"),
        interview: count("interview"),
        offer: count("offer"),
        rejected: count("rejected"),
        withdrawn: count("withdrawn"),
      };
  const tiles = usingSample
    ? APPLICATION_SAMPLE_TILES
    : { total: all.length, "in-review": counts["in-review"], interview: counts.interview, offer: counts.offer, rejected: counts.rejected, withdrawn: counts.withdrawn };
  const progress = usingSample
    ? APPLICATION_SAMPLE_PROGRESS
    : { "in-review": counts["in-review"], interview: counts.interview, offer: counts.offer, rejected: counts.rejected, withdrawn: counts.withdrawn };

  const companies = useMemo(() => Array.from(new Set(all.map((r) => r.company))).sort(), [all]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter(
      (r) =>
        (tab === "all" || r.status === tab) &&
        (!status || STATUS_CHIP[r.status].label === status) &&
        (!company || r.company === company) &&
        (!q || `${r.title} ${r.company} ${r.sub}`.toLowerCase().includes(q)),
    );
    if (sort === "company") return [...list].sort((a, b) => a.company.localeCompare(b.company));
    if (sort === "status") return [...list].sort((a, b) => STATUS_CHIP[a.status].label.localeCompare(STATUS_CHIP[b.status].label));
    return list; // already newest-first (real rows are sorted by the mapper; sample rows are in board order)
  }, [all, tab, query, company, status, sort]);

  const upcoming = usingSample
    ? APPLICATION_UPCOMING
    : all
        .filter((r) => r.status === "interview")
        .slice(0, 2)
        .map((r) => ({ id: r.id, title: r.title, company: r.company, when: `Applied ${r.appliedOn}`, kind: "Interview stage" }));
  const interviewCount = usingSample ? 3 : counts.interview;
  const insights = [
    interviewCount > 0
      ? `You have ${interviewCount} upcoming interview${interviewCount === 1 ? "" : "s"}. Prepare with AI.`
      : APPLICATION_INSIGHTS[0],
    APPLICATION_INSIGHTS[1],
    APPLICATION_INSIGHTS[2],
  ];
  const feed = usingSample || activity.length === 0 ? APPLICATION_ACTIVITY : activity;

  const columns: DataColumn<Row>[] = [
    {
      key: "title",
      className: "w-[30%]",
      header: "Job Title",
      render: (r) => (
        <span className="flex items-center gap-3">
          <CompanyTile name={r.company} size={40} />
          <span className="min-w-0 text-left">
            <span className="block truncate text-[14px] font-bold leading-snug text-v2-navy">{r.title}</span>
            {r.sub && <span className="block truncate text-[12.5px] text-v2-ink-soft">{r.sub}</span>}
          </span>
        </span>
      ),
    },
    { key: "company", className: "w-[14%]", header: "Company", render: (r) => <span className="text-[13.5px] text-v2-navy">{r.company}</span> },
    {
      key: "status",
      className: "w-[15%]",
      header: "Status",
      render: (r) => {
        const c = STATUS_CHIP[r.status];
        return (
          <StatusChip tone={c.tone} dot={c.dot}>
            {c.icon && <ClockIcon className="h-3 w-3" />}
            {c.label}
          </StatusChip>
        );
      },
    },
    { key: "applied", className: "w-[12%]", header: "Applied On", render: (r) => <span className="text-[13.5px] text-v2-ink-soft">{r.appliedOn}</span> },
    {
      key: "next",
      className: "w-[20%]",
      header: "Next Step",
      render: (r) => (
        <span className="text-[13px] leading-snug text-v2-ink-soft">
          {r.nextStep}
          {"nextStepDetail" in r && r.nextStepDetail && (
            <>
              <br className="hidden md:block" /> <span className="md:inline">{r.nextStepDetail}</span>
            </>
          )}
        </span>
      ),
    },
  ];

  const rowAction = (r: Row) => {
    const prepare = r.status === "interview";
    const cls =
      "inline-flex h-9 min-w-[72px] items-center justify-center rounded-lg px-3.5 text-[13px] font-semibold " +
      (prepare ? "border border-v2-line bg-white text-v2-navy hover:bg-[#F1F5FB]" : "bg-v2-blue-soft text-v2-blue hover:brightness-95");
    const target = prepare ? "/interviews" : r.href ?? (usingSample ? "/jobs" : null);
    return (
      <>
        {target ? (
          prepare || target.startsWith("/") ? (
            <Link href={target} className={cls}>
              {prepare ? "Prepare" : "View"}
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
            { label: "Prepare for interview", onSelect: () => router.push("/interviews") },
          ]}
        />
      </>
    );
  };

  return (
    <div className="mx-auto grid w-full max-w-[1400px] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <PageHero
          title="My Applications"
          subtitle="Track, manage, and stay on top of all your job applications. Get AI-powered insights and next steps."
          art={<HeroArt mascot="mascot-apps" note="Keep going. You're closer than you think!" mascotHeight={124} />}
          actions={
            <button
              type="button"
              onClick={() =>
                toast({
                  title: "Applications are added automatically",
                  description: "Fill or save a job with the Kiwiply extension and it shows up here.",
                })
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-v2-green px-4 text-[14px] font-bold text-white hover:brightness-95"
            >
              <span aria-hidden>+</span> Add Application
            </button>
          }
        />

        <section className="min-w-0 rounded-2xl border border-v2-line bg-white shadow-v2-card">
          <UnderlineTabs padded counts="pill"
            ariaLabel="Application status"
            value={tab}
            onChange={(v) => setTab(v as TabKey)}
            className="px-2 sm:px-4"
            tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))}
          />

          <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
            <FilterSelect placeholder label="Job Type" options={["Internship"]} />
            <FilterSelect placeholder label="Status" options={Object.values(STATUS_CHIP).map((c) => c.label)} value={status} onChange={setStatus} />
            <FilterSelect placeholder label="Company" options={companies} value={company} onChange={setCompany} />
            <FilterSelect placeholder label="Date Applied" options={[]} />
            <FilterSelect placeholder label="Location" options={[]} />
            <SearchInput
              size="sm"
              aria-label="Search applications"
              placeholder="Search applications..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-full bg-white sm:ml-auto sm:w-56"
            />
            <span aria-hidden className="hidden h-10 w-10 items-center justify-center rounded-xl border border-v2-line text-v2-ink-soft sm:flex">
              <MenuIcon className="h-4 w-4" />
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 pb-3 text-[12.5px] text-v2-ink-soft">
            <label htmlFor="apps-sort">Sort by:</label>
            <select
              id="apps-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-md bg-transparent font-semibold text-v2-navy outline-none"
            >
              <option value="date">Date Applied</option>
              <option value="company">Company</option>
              <option value="status">Status</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5 px-3 pb-4 sm:grid-cols-3 sm:px-4 min-[1440px]:grid-cols-6">
            <StatTile compact tone="blue" icon={<FileTextIcon className="h-5 w-5" />} value={tiles.total} label="Total Applications" />
            <StatTile compact tone="amber" icon={<ClockIcon className="h-5 w-5" />} value={tiles["in-review"]} label="In Review" />
            <StatTile compact tone="blue" icon={<CalendarIcon className="h-5 w-5" />} value={tiles.interview} label="Interviews" />
            <StatTile compact tone="teal" icon={<BriefcaseIcon className="h-5 w-5" />} value={tiles.offer} label="Offers" />
            <StatTile compact tone="coral" icon={<XIcon className="h-5 w-5" />} value={tiles.rejected} label="Rejected" />
            <StatTile compact tone="slate" icon={<ArchiveIcon className="h-5 w-5" />} value={tiles.withdrawn} label="Withdrawn" />
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
                selectable
                actions={rowAction}
                actionsHeader={<span className="pr-2">Actions</span>}
              />
            )}
          </div>
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <SectionCard title="Application Progress">
          <Donut
            centerValue={tiles.total}
            centerLabel="Applications"
            size={132}
            segments={[
              { label: "In Review", value: progress["in-review"], tone: "green" },
              { label: "Interviews", value: progress.interview, tone: "blue" },
              { label: "Offers", value: progress.offer, tone: "violet" },
              { label: "Rejected", value: progress.rejected, tone: "coral" },
              { label: "Withdrawn", value: progress.withdrawn, tone: "slate" },
            ]}
          />
        </SectionCard>

        <section className="rounded-2xl border border-v2-line bg-[linear-gradient(160deg,#F1FBE5_0%,#EAF8F0_100%)] p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[16px] font-bold tracking-normal text-v2-navy">
            <LightbulbIcon className="h-5 w-5 text-v2-amber" /> AI Insights
          </h2>
          <ul className="divide-y divide-v2-line/60 rounded-xl bg-white/80">
            {insights.map((t) => (
              <li key={t}>
                <Link href="/ai-apply" className="flex items-center gap-3 px-3 py-3 text-[13.5px] leading-snug text-v2-navy">
                  <CheckCircleIcon className="h-5 w-5 flex-none text-v2-green" />
                  <span className="flex-1">{t}</span>
                  <ChevronRightIcon className="h-4 w-4 flex-none text-v2-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <SectionCard title="Upcoming Interviews" action={{ label: "View all", href: "/interviews" }}>
          {upcoming.length === 0 ? (
            <p className="text-[13.5px] text-v2-ink-soft">No interviews yet. They&apos;ll show up here once an application reaches that stage.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((u) => (
                <li key={u.id} className="flex items-center gap-3">
                  <CompanyTile name={u.company} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-v2-navy">{u.title}</p>
                    <p className="text-[12px] leading-snug text-v2-ink-soft">{u.when}</p>
                    <p className="text-[12px] text-v2-muted">{u.kind}</p>
                  </div>
                  <Link href="/interviews" className="rounded-lg bg-v2-lime-soft px-3 py-1.5 text-[13px] font-bold text-v2-navy">
                    Prepare
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent Activity" action={{ label: "View all", href: "/applications" }}>
          <ul className="space-y-3.5">
            {feed.map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <span className={cn("mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full", TONE[a.tone].soft, TONE[a.tone].ink)}>
                  <FileTextIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold leading-snug text-v2-navy">{a.title}</p>
                  <p className="text-[12.5px] leading-snug text-v2-ink-soft">{a.body}</p>
                  <p className="text-[12px] text-v2-muted">{a.ago}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </aside>
    </div>
  );
}
