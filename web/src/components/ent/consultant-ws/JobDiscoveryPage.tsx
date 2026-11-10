"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import {
  BookmarkIcon,
  BookmarkOutlineIcon,
  BuildingIcon,
  CalendarIcon,
  Button,
  ClockIcon,
  DollarIcon,
  DonutChart,
  ErrorState,
  FileTextIcon,
  HomeIcon,
  Input,
  MapPinIcon,
  Menu,
  MoreVerticalIcon,
  SearchIcon,
  Select,
  SideSheet,
  SlidersIcon,
  Skeleton,
  StarIcon,
  Tab,
  TabList,
  Tabs,
  TrashIcon,
  TrendingUpIcon,
  ZapIcon,
  cn,
  useMediaQuery,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BeeCard, Card, Empty, Pill, useWorkspaceData } from "./parts";
import JobLinkButton, { QuickInfo } from "./JobLinkButton";
import { APPLY_HELPER } from "@/lib/ent/consultant-ws/jobSource";
import { initialsOf } from "@/lib/ent/consultant-ws/home";
import {
  EMPTY_FILTERS,
  RATE_STEPS,
  SORTS,
  applyChip,
  countFilters,
  createSavedSearch,
  deleteSavedSearch,
  demandText,
  employmentText,
  experienceText,
  fetchDetail,
  fetchOverview,
  fetchSearch,
  filtersSummary,
  hasFilters,
  isChipOn,
  markSavedSearchViewed,
  matchBand,
  matchBlurb,
  placeText,
  rateText,
  recordRecentSearch,
  relativeTime,
  saveJob,
  searchQuery,
  unsaveJob,
  workModeText,
  type Chip,
  type DetailView,
  type Filters,
  type Job,
  type Option,
  type OverviewView,
  type SavedSearch,
  type Sort,
} from "@/lib/ent/consultant-ws/jobDiscovery";

/**
 * Consultant Job Discovery (design/enterprise-consultant/job-discovery.webp). The search runs in the API over the organization's OPEN
 * jobs (paged, never filtered here); one overview call draws the filter options, the recommended chips, trending skills and the saved
 * and recent searches. Saving a job and a search are the consultant's own rows. Kiwiply holds no full job posting: each card shows the
 * marketer's quick info and an "Open job link" to the source site, where the consultant applies with the extension (the application
 * is tracked in My Applications). A full in-app job search is a later phase.
 */

const PAGE_SIZE = 10;
const RECOMMENDED_MIN_SCORE = 60;

type TabKey = "search" | "saved" | "recommended";

const CHIP_ICONS: Record<Chip["kind"], { icon: ComponentType<IconProps>; tone: IconTone }> = {
  workMode: { icon: HomeIcon, tone: "accent" },
  jobType: { icon: FileTextIcon, tone: "accent" },
  minRate: { icon: DollarIcon, tone: "green" },
  skill: { icon: ZapIcon, tone: "violet" },
  industry: { icon: BuildingIcon, tone: "amber" },
};

const MARK_COLORS = ["bg-accent-soft text-accent-deep", "bg-v2-violet-soft text-v2-violet-ink", "bg-v2-amber-soft text-v2-amber-ink", "bg-v2-green-soft text-v2-green-ink", "bg-v2-pink-soft text-v2-pink-ink", "bg-v2-teal-soft text-v2-teal-ink"];

function JobMark({ name }: { name: string | null }) {
  const i = name ? [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % MARK_COLORS.length : 0;
  return (
    <span aria-hidden className={cn("grid h-12 w-12 flex-none place-items-center rounded-xl text-[16px] font-extrabold sm:h-14 sm:w-14", MARK_COLORS[i])}>
      {initialsOf(name)}
    </span>
  );
}

function MatchRing({ job }: { job: Job }) {
  if (job.score === null) {
    return (
      <div className="flex items-center gap-3 lg:w-[250px]" data-match="none">
        <span aria-hidden className="grid h-16 w-16 flex-none place-items-center rounded-full border-2 border-dashed border-line text-[13px] font-bold text-muted">
          n/a
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-muted">Not scored</p>
          <p className="text-[12px] leading-snug text-muted">{matchBlurb(job)}</p>
        </div>
      </div>
    );
  }
  const band = matchBand(job.score);
  const ink = band.tone === "green" ? "var(--color-v2-green-ink)" : "var(--color-v2-amber-ink)";
  return (
    <div className="flex items-center gap-3 lg:w-[250px]" data-match={job.score}>
      <div className="flex-none">
        <DonutChart label={`Match ${job.score}%`} size={64} legend={false} total={job.score} totalSuffix="%" slices={[{ key: "m", label: "Match", value: job.score, color: ink }, { key: "r", label: "Remaining", value: 100 - job.score, color: "transparent" }]} />
      </div>
      <div className="min-w-0">
        <p className={cn("text-[14px] font-bold", band.tone === "green" ? "text-v2-green-ink" : "text-v2-amber-ink")}>{band.label}</p>
        <p className="text-[12px] leading-snug text-muted">{matchBlurb(job)}</p>
      </div>
    </div>
  );
}

function Meta({ icon: Icon, children }: { icon: ComponentType<IconProps>; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
      <Icon size={14} className="flex-none text-muted" />
      {children}
    </span>
  );
}

function JobCard({ job, onSave, onView }: { job: Job; onSave: (j: Job) => void; onView: (j: Job) => void }) {
  const rate = rateText(job);
  const emp = employmentText(job.employment);
  const applied = job.relation === "APPLIED";
  return (
    <article data-job={job.id} aria-label={job.title} className="grid gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center lg:gap-5">
      <div className="flex min-w-0 gap-3">
        <JobMark name={job.clientName} />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] font-extrabold leading-tight text-ink">
            <button type="button" onClick={() => onView(job)} className="min-w-0 text-left hover:underline focus-visible:underline">
              {job.title}
            </button>
            {job.featured ? (
              <Pill tone="blue" className="gap-1">
                <StarIcon size={11} />
                Featured
              </Pill>
            ) : null}
            {applied ? <Pill tone="green">Applied</Pill> : null}
          </h3>
          {job.clientName ? <p className="mt-0.5 text-[13.5px] font-semibold text-accent-deep">{job.clientName}</p> : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Meta icon={MapPinIcon}>{placeText(job.location, job.workMode)}</Meta>
            {emp ? <Meta icon={FileTextIcon}>{emp}</Meta> : null}
            {job.duration ? <Meta icon={CalendarIcon}>{job.duration}</Meta> : null}
            {rate ? <Meta icon={DollarIcon}>{rate}</Meta> : null}
          </p>
          <QuickInfo source={job} clamp className="mt-2" />
          {job.skills.length ? (
            <ul aria-label="Skills" className="mt-2 flex flex-wrap gap-1.5">
              {job.skills.slice(0, 6).map((s) => (
                <li key={s}>
                  <Pill tone="slate">{s}</Pill>
                </li>
              ))}
              {job.skills.length > 6 ? (
                <li>
                  <Pill tone="slate">+{job.skills.length - 6}</Pill>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
      <MatchRing job={job} />
      <div className="flex flex-wrap items-center gap-2 lg:grid lg:w-[176px] lg:grid-cols-2">
        <button
          type="button"
          aria-pressed={job.saved}
          aria-label={job.saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`}
          onClick={() => onSave(job)}
          className={cn("inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold", job.saved ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink hover:bg-paper-2")}
        >
          {job.saved ? <BookmarkIcon size={15} /> : <BookmarkOutlineIcon size={15} />}
          {job.saved ? "Saved" : "Save"}
        </button>
        <Button variant="ghost" size="sm" onClick={() => onView(job)} aria-label={`View ${job.title}`} className="min-h-9 text-accent-deep">
          View
        </Button>
        <JobLinkButton title={job.title} source={job} className="lg:col-span-2 [&>a]:w-full [&>button]:w-full" />
      </div>
    </article>
  );
}

/* ── filter bar ─────────────────────────────────────────────────────────────────────── */

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Select
      variant="pill"
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(v) => onChange(v === "__any" ? "" : v)}
      options={[{ value: "__any", label: `Any ${label.toLowerCase()}` }, ...options]}
      className="min-w-0"
    />
  );
}

const labelled = (opts: Option[], fmt: (v: string) => string, withCount = false): { value: string; label: string }[] => opts.map((o) => ({ value: o.value, label: withCount && o.count !== null ? `${fmt(o.label)} (${o.count})` : fmt(o.label) }));

/* ── right rail ─────────────────────────────────────────────────────────────────────── */

function RailRow({ children }: { children: ReactNode }) {
  return <li className="flex items-center gap-2 py-2">{children}</li>;
}

function SavedSearchesCard({ ov, onRun, onDelete, onViewAll }: { ov: OverviewView; onRun: (s: SavedSearch) => void; onDelete: (s: SavedSearch) => void; onViewAll: () => void }) {
  const list = ov.savedSearches.slice(0, 5);
  return (
    <Card
      id="jd-saved"
      title="Saved Searches"
      icon={BookmarkIcon}
      extra={
        ov.savedSearches.length > 0 ? (
          <button type="button" onClick={onViewAll} className="flex-none text-[13px] font-semibold text-accent-deep hover:underline">
            View All
          </button>
        ) : null
      }
    >
      {list.length === 0 ? (
        <Empty>No saved searches yet. Search, then choose &ldquo;Save this search&rdquo; under More Filters.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((s) => (
            <RailRow key={s.id}>
              <SearchIcon size={15} className="flex-none text-muted" />
              <button type="button" onClick={() => onRun(s)} className="min-w-0 flex-1 text-left" aria-label={`Run saved search ${s.name}`}>
                <span className="block truncate text-[13.5px] font-semibold text-ink">{s.name}</span>
                <span className="block text-[12px] font-medium text-v2-green-ink">
                  {s.newResults} new result{s.newResults === 1 ? "" : "s"}
                </span>
              </button>
              <Menu
                trigger={
                  <button type="button" aria-label={`More actions for ${s.name}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
                    <MoreVerticalIcon size={16} />
                  </button>
                }
                items={[
                  { label: "Run search", icon: <SearchIcon size={14} />, onSelect: () => onRun(s) },
                  { label: "Delete", icon: <TrashIcon size={14} />, danger: true, onSelect: () => onDelete(s) },
                ]}
              />
            </RailRow>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TrendingCard({ ov, onSkill }: { ov: OverviewView; onSkill: (skill: string) => void }) {
  return (
    <Card id="jd-trending" title="Trending Skills" icon={TrendingUpIcon} tone="violet">
      {ov.trending.length === 0 ? (
        <Empty>Not enough open jobs yet to show what is in demand.</Empty>
      ) : (
        <ol className="divide-y divide-line">
          {ov.trending.map((t, i) => {
            const d = demandText(t);
            return (
              <li key={t.skill} data-trending={t.skill} className="flex items-center gap-2.5 py-2">
                <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-full bg-paper-2 text-[12px] font-bold text-ink-soft">
                  {i + 1}
                </span>
                <button type="button" onClick={() => onSkill(t.skill)} className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold text-ink hover:underline" aria-label={`Search jobs needing ${t.skill}`}>
                  {t.skill}
                </button>
                <span className={cn("flex-none text-[12px] font-semibold", d?.dir === "up" ? "text-v2-green-ink" : d?.dir === "down" ? "text-v2-coral-ink" : "text-muted")}>
                  {d ? (d.dir === "up" ? "↗ " : d.dir === "down" ? "↘ " : "") + d.text : `${t.openJobs} open job${t.openJobs === 1 ? "" : "s"}`}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function RecentCard({ ov, onRun }: { ov: OverviewView; onRun: (f: Filters) => void }) {
  return (
    <Card id="jd-recent" title="Recent Searches" icon={ClockIcon} tone="accent">
      {ov.recentSearches.length === 0 ? (
        <Empty>Your last searches will show up here.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {ov.recentSearches.map((r) => (
            <RailRow key={r.id}>
              <SearchIcon size={14} className="flex-none text-muted" />
              <button type="button" onClick={() => onRun(r.filters)} className="min-w-0 flex-1 truncate text-left text-[13.5px] text-ink hover:underline" aria-label={`Search again: ${r.label}`}>
                {r.label}
              </button>
              <span className="flex-none text-[12px] text-muted">{relativeTime(r.at)}</span>
            </RailRow>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── job detail sheet ───────────────────────────────────────────────── */

function DetailBody({ d, onSave }: { d: DetailView; onSave: (j: Job) => void }) {
  const j = d.job;
  const rate = rateText(j);
  const emp = employmentText(j.employment);
  const mode = workModeText(j.workMode);
  const band = j.score === null ? null : matchBand(j.score);
  return (
    <div data-job-detail={j.id} className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <JobMark name={j.clientName} />
        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold leading-tight text-ink">{j.title}</h3>
          {j.clientName ? <p className="text-[14px] font-semibold text-accent-deep">{j.clientName}</p> : null}
          {j.industry ? <p className="text-[12.5px] text-muted">{j.industry}</p> : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
        {[
          ["Location", placeText(j.location, j.workMode)],
          ["Work mode", mode],
          ["Type", emp],
          ["Duration", j.duration],
          ["Experience", j.experience ? experienceText(j.experience) : null],
          ["Rate", rate],
          ["Open positions", String(d.openPositions)],
          ["Posted", j.postedAt ? relativeTime(j.postedAt) : null],
        ]
          .filter((r): r is [string, string] => !!r[1])
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] font-semibold text-muted">{k}</dt>
              <dd className="font-medium text-ink">{v}</dd>
            </div>
          ))}
      </dl>
      {band && j.score !== null ? (
        <p className="rounded-xl bg-paper-2 p-3 text-[13px] text-ink-soft">
          <span className={cn("font-bold", band.tone === "green" ? "text-v2-green-ink" : "text-v2-amber-ink")}>
            {j.score}% - {band.label}.
          </span>{" "}
          {matchBlurb(j)}
        </p>
      ) : null}
      {j.skills.length ? (
        <div>
          <h4 className="text-[13px] font-bold text-ink">Required skills</h4>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {j.skills.map((s) => (
              <li key={s}>
                <Pill tone="slate">{s}</Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <QuickInfo source={j} />
      {d.description && d.description !== j.quickInfo ? (
        <div>
          <h4 className="text-[13px] font-bold text-ink">Marketer&apos;s job notes</h4>
          <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">{d.description}</p>
          <p className="mt-1 text-[12px] text-muted">These are your marketer&apos;s notes, not the full posting. Read the full posting on the source site.</p>
        </div>
      ) : null}
      <p className="text-[12.5px] text-muted">{APPLY_HELPER}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" aria-pressed={j.saved} onClick={() => onSave(j)}>
          {j.saved ? "Saved" : "Save"}
        </Button>
        <JobLinkButton title={j.title} source={j} />
      </div>
    </div>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

interface Results {
  pageKey: string;
  baseKey: string;
  state: "ready" | "failed" | "denied";
  total: number;
  items: Job[];
}

export interface JobDiscoveryPageProps {
  orgId: number;
  firstName: string;
}

export default function JobDiscoveryPage({ orgId, firstName }: JobDiscoveryPageProps) {
  const { view: ov, status, reload } = useWorkspaceData(useCallback(() => fetchOverview(orgId), [orgId]));
  const narrow = useMediaQuery("(max-width: 639px)", false);

  const [tab, setTab] = useState<TabKey>("search");
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS); // the two text boxes
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS); // what the API is asked
  const [sort, setSort] = useState<Sort>("match");
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<Results | null>(null);
  const [more, setMore] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ id: number; state: "ready" | "failed"; view: DetailView | null } | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  const filters = tab === "recommended" ? EMPTY_FILTERS : applied;
  const effSort: Sort = tab === "recommended" ? "match" : sort;
  const minScore = tab === "recommended" ? RECOMMENDED_MIN_SCORE : 0;
  const baseKey = useMemo(() => JSON.stringify([tab === "saved" ? "search" : tab, filters, effSort]), [tab, filters, effSort]);
  const pageKey = `${baseKey}|${page}`;
  const query = useMemo(() => searchQuery(filters, effSort, page, PAGE_SIZE, minScore), [filters, effSort, page, minScore]);
  const wantsResults = tab !== "saved";

  useEffect(() => {
    if (!wantsResults) return;
    const ctl = new AbortController();
    void (async () => {
      const r = await fetchSearch(orgId, query, ctl.signal);
      if (ctl.signal.aborted) return;
      setResults((prev) => {
        const same = prev !== null && prev.baseKey === baseKey;
        if (r.kind === "OK" && r.view) return { pageKey, baseKey, state: "ready", total: r.view.total, items: page > 0 && same ? [...prev.items, ...r.view.items] : r.view.items };
        return { pageKey, baseKey, state: r.kind === "DENIED" ? "denied" : "failed", total: same ? prev.total : 0, items: same ? prev.items : [] };
      });
    })();
    return () => ctl.abort();
  }, [orgId, query, pageKey, baseKey, page, wantsResults]);

  const loading = wantsResults && (results === null || results.pageKey !== pageKey);

  useEffect(() => {
    if (detailId === null) return;
    const ctl = new AbortController();
    void (async () => {
      const r = await fetchDetail(orgId, detailId, ctl.signal);
      if (ctl.signal.aborted) return;
      setDetail({ id: detailId, state: r.kind === "OK" ? "ready" : "failed", view: r.view ?? null });
    })();
    return () => ctl.abort();
  }, [orgId, detailId]);

  /* -- actions -- */

  const patchJob = useCallback((id: number, change: Partial<Job>) => {
    setResults((r) => (r ? { ...r, items: r.items.map((j) => (j.id === id ? { ...j, ...change } : j)) } : r));
    setDetail((d) => (d && d.view && d.view.job.id === id ? { ...d, view: { ...d.view, job: { ...d.view.job, ...change } } } : d));
  }, []);

  const toggleSave = useCallback(
    async (job: Job) => {
      const next = !job.saved;
      patchJob(job.id, { saved: next });
      const r = next ? await saveJob(orgId, job.id) : await unsaveJob(orgId, job.id);
      if (!r.ok) {
        patchJob(job.id, { saved: !next });
        setNotice("Couldn't update your saved jobs. Nothing was changed.");
      } else setNotice(next ? "Saved to your jobs." : "Removed from your saved jobs.");
    },
    [orgId, patchJob],
  );

  const runSearch = useCallback(
    (f: Filters, record: boolean) => {
      setTab("search");
      setDraft((d) => ({ ...d, q: f.q, location: f.location }));
      setApplied(f);
      setPage(0);
      if (record && hasFilters(f)) void recordRecentSearch(orgId, f).then((r) => r.ok && void reload());
    },
    [orgId, reload],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch({ ...applied, q: draft.q.trim(), location: draft.location.trim() }, true);
  };

  const setFilter = (change: Partial<Filters>) => {
    setApplied((a) => ({ ...a, ...change }));
    setPage(0);
  };

  const clearAll = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(0);
  };

  const runSaved = (s: SavedSearch) => {
    runSearch(s.filters, false);
    void markSavedSearchViewed(orgId, s.id).then((r) => r.ok && void reload());
  };

  const removeSaved = async (s: SavedSearch) => {
    const r = await deleteSavedSearch(orgId, s.id);
    setNotice(r.ok ? `Deleted "${s.name}".` : "Couldn't delete that search. Nothing was changed.");
    if (r.ok) void reload();
  };

  const saveThisSearch = async () => {
    const f = { ...applied, q: draft.q.trim() || applied.q, location: draft.location.trim() || applied.location };
    const r = await createSavedSearch(orgId, saveName, f);
    if (r.ok) {
      setSaveName("");
      setSaveMsg({ ok: true, text: "Search saved." });
      void reload();
    } else setSaveMsg({ ok: false, text: r.error ?? "Couldn't save the search. Please try again." });
  };

  /* -- render -- */

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const opts = ov?.filterOptions;
  const items = results?.items ?? [];
  const total = results?.total ?? 0;
  const failed = wantsResults && results !== null && results.state !== "ready" && results.pageKey === pageKey;
  const canMore = results !== null && results.state === "ready" && items.length < total;
  const active = countFilters({ ...applied, q: "", location: "" }) + 0;

  return (
    <div data-job-discovery data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Job Discovery" subtitle="These are the jobs your marketer loaded for you. Open the job link, apply on the source site with the browser extension, and track it in My Applications. A full job search arrives in a later phase." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      <p role="status" aria-live="polite" className={cn("min-h-0 text-[13px] font-medium text-accent-deep", notice ? "" : "sr-only")}>
        {notice ?? ""}
      </p>

      {status === "failed" ? (
        <ErrorState what="Job Discovery" description="Your workspace didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
            <section aria-label="Search jobs" className="rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-5">
              <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} variant="underline">
                <TabList aria-label="Job Discovery views">
                  <Tab value="search">
                    <SearchIcon size={16} /> Search Jobs
                  </Tab>
                  <Tab value="saved">
                    <BookmarkIcon size={16} /> Saved Searches
                  </Tab>
                  <Tab value="recommended">
                    <StarIcon size={16} /> Recommended for You
                  </Tab>
                </TabList>
              </Tabs>

              {tab === "search" ? (
                <>
                  <form role="search" onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]">
                    <label className="relative block">
                      <span className="sr-only">Job title, skill, keyword or company</span>
                      <SearchIcon size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <Input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="Job title, skill, keyword or company (e.g. Data Engineer, AWS, Python)" className="pl-10" maxLength={120} />
                    </label>
                    <label className="relative block">
                      <span className="sr-only">Location</span>
                      <MapPinIcon size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Location (e.g. New York, Remote)" className="pl-10" maxLength={120} />
                    </label>
                    <Button type="submit" variant="accent" className="min-h-11 md:min-w-[120px]">
                      Search
                    </Button>
                  </form>

                  <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
                    <FilterSelect label="Job Type" value={applied.jobType} options={labelled(opts?.jobTypes ?? [], (v) => employmentText(v) ?? v, true)} onChange={(v) => setFilter({ jobType: v })} />
                    <FilterSelect label="Location" value={applied.workMode} options={labelled(opts?.workModes ?? [], (v) => workModeText(v) ?? v, true)} onChange={(v) => setFilter({ workMode: v })} />
                    <FilterSelect label="Experience" value={applied.experience} options={labelled(opts?.experience ?? [], experienceText)} onChange={(v) => setFilter({ experience: v })} />
                    <FilterSelect label="Rate / Compensation" value={applied.minRateMinor ? String(applied.minRateMinor) : ""} options={RATE_STEPS} onChange={(v) => setFilter({ minRateMinor: v ? Number(v) : null })} />
                    <FilterSelect label="Skills" value={applied.skill} options={labelled(opts?.skills ?? [], (v) => v, true)} onChange={(v) => setFilter({ skill: v })} />
                    <FilterSelect label="Industry" value={applied.industry} options={labelled(opts?.industries ?? [], (v) => v, true)} onChange={(v) => setFilter({ industry: v })} />
                    <FilterSelect label="Client" value={applied.clientId ? String(applied.clientId) : ""} options={labelled(opts?.clients ?? [], (v) => v, true)} onChange={(v) => setFilter({ clientId: v ? Number(v) : null })} />
                    <button type="button" onClick={clearAll} className="px-1 text-[13px] font-semibold text-accent-deep hover:underline">
                      Clear All
                    </button>
                    <button
                      ref={toggleRef}
                      type="button"
                      aria-expanded={more}
                      aria-controls="jd-more-filters"
                      onClick={() => setMore((m) => !m)}
                      className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft"
                    >
                      <SlidersIcon size={15} /> More Filters{active > 0 ? ` (${active})` : ""}
                    </button>
                  </div>
                  {more ? (
                    <div id="jd-more-filters" className="mt-3 rounded-xl border border-line bg-paper-2/50 p-3">
                      <p className="text-[13px] font-semibold text-ink">Save this search</p>
                      <p className="text-[12px] text-muted">We&apos;ll count the new jobs that match it each time you come back.</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">Name for this search</span>
                          <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name, e.g. Data Engineer - Remote" maxLength={80} />
                        </label>
                        <Button variant="accent" size="sm" disabled={!saveName.trim() || !(hasFilters(applied) || draft.q.trim() !== "" || draft.location.trim() !== "")} onClick={() => void saveThisSearch()}>
                          Save search
                        </Button>
                      </div>
                      {saveMsg ? (
                        <p role={saveMsg.ok ? "status" : "alert"} className={cn("mt-2 text-[12.5px]", saveMsg.ok ? "text-v2-green-ink" : "text-v2-coral-ink")}>
                          {saveMsg.text}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>

            {tab === "search" && ov && ov.recommended.length > 0 ? (
              <section aria-labelledby="jd-reco" className="rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-4">
                <h2 id="jd-reco" className="flex items-center gap-2 text-[14px] font-bold text-ink">
                  <StarIcon size={16} className="text-accent-deep" /> Recommended Filters
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {ov.recommended.map((c) => {
                    const spec = CHIP_ICONS[c.kind];
                    const Icon = spec.icon;
                    const on = isChipOn(applied, c);
                    return (
                      <li key={c.key}>
                        <button
                          type="button"
                          aria-pressed={on}
                          data-chip={c.key}
                          onClick={() => {
                            setApplied(applyChip(applied, c));
                            setPage(0);
                          }}
                          className={cn("inline-flex min-h-10 items-center gap-2 rounded-xl border px-2.5 text-[13px] font-medium", on ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink hover:bg-paper-2")}
                        >
                          <span aria-hidden className={cn("grid h-6 w-6 flex-none place-items-center rounded-full", TONES[spec.tone])}>
                            <Icon size={13} />
                          </span>
                          {c.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {tab === "saved" ? (
              <section aria-label="Saved searches" className="rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-5">
                {!ov || ov.savedSearches.length === 0 ? (
                  <Empty>No saved searches yet. Run a search, open More Filters and save it to get a count of new jobs each time.</Empty>
                ) : (
                  <ul className="divide-y divide-line">
                    {ov.savedSearches.map((s) => (
                      <li key={s.id} data-saved-search={s.id} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14.5px] font-bold text-ink">{s.name}</p>
                          <p className="truncate text-[12.5px] text-muted">{filtersSummary(s.filters)}</p>
                        </div>
                        <Pill tone={s.newResults > 0 ? "green" : "slate"}>
                          {s.newResults} new result{s.newResults === 1 ? "" : "s"}
                        </Pill>
                        <Button variant="accent" size="sm" onClick={() => runSaved(s)} aria-label={`Run saved search ${s.name}`}>
                          Run
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void removeSaved(s)} aria-label={`Delete saved search ${s.name}`}>
                          <TrashIcon size={14} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (
              <section aria-label="Opportunities" className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 data-results-count className="text-[19px] font-extrabold text-ink">
                    {loading && results === null ? "Searching..." : `Showing ${total} ${total === 1 ? "opportunity" : "opportunities"}`}
                  </h2>
                  {tab === "search" ? (
                    <label className="flex items-center gap-2 text-[13px] text-ink-soft">
                      Sort by
                      <Select
                        variant="pill"
                        aria-label="Sort by"
                        value={sort}
                        onChange={(v) => {
                          setSort(v as Sort);
                          setPage(0);
                        }}
                        options={SORTS}
                      />
                    </label>
                  ) : null}
                </div>
                <p data-apply-helper className="text-[13px] text-ink-soft">
                  {APPLY_HELPER}
                </p>

                {failed ? (
                  <ErrorState what="the jobs" description="The search didn't load. Nothing has changed." onRetry={() => setApplied((a) => ({ ...a }))} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
                ) : loading && items.length === 0 ? (
                  <div aria-busy="true" className="grid gap-3">
                    {Array.from({ length: 3 }, (_, i) => (
                      <Skeleton key={i} className="h-36 w-full" />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="rounded-[var(--radius-lg)] border border-line bg-paper px-4 py-8">
                    <Empty>
                      {tab === "recommended"
                        ? "No recommendations yet. Add your skills to your profile and we'll rank open jobs for you."
                        : ov && ov.openJobs === 0
                          ? "There are no open jobs right now. New roles show up here as soon as they're posted."
                          : "No jobs match these filters. Try fewer filters or a different keyword."}
                    </Empty>
                  </div>
                ) : (
                  <div className="grid gap-3" aria-busy={loading}>
                    {items.map((j) => (
                      <JobCard key={j.id} job={j} onSave={(x) => void toggleSave(x)} onView={(x) => setDetailId(x.id)} />
                    ))}
                    {canMore ? (
                      <div className="flex justify-center">
                        <Button variant="ghost" onClick={() => setPage((p) => p + 1)} disabled={loading}>
                          {loading ? "Loading..." : `Show more (${total - items.length} left)`}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            )}
          </div>

          <aside aria-label="Help and shortcuts" className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-1">
            <BeeCard
              name={firstName.trim().split(/\s+/)[0] || "there"}
              body="Tell me what kind of roles you're looking for, and I'll help you find the best opportunities that match your skills, experience and goals."
            />
            {ov ? (
              <>
                <SavedSearchesCard ov={ov} onRun={runSaved} onDelete={(s) => void removeSaved(s)} onViewAll={() => setTab("saved")} />
                <TrendingCard ov={ov} onSkill={(skill) => runSearch({ ...EMPTY_FILTERS, skill }, false)} />
                <RecentCard ov={ov} onRun={(f) => runSearch(f, false)} />
              </>
            ) : (
              <Skeleton className="h-56 w-full" />
            )}
          </aside>
        </div>
      )}

      <SideSheet
        id="jd-detail"
        side="right"
        mode={narrow ? "fullscreen" : "overlay"}
        open={detailId !== null}
        title={detail && detail.id === detailId && detail.view ? detail.view.job.title : "Job details"}
        description={detail && detail.id === detailId && detail.view?.job.clientName ? detail.view.job.clientName : undefined}
        onClose={() => setDetailId(null)}
      >
        {detail === null || detail.id !== detailId ? (
          <div aria-busy="true" className="grid gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detail.state === "failed" || !detail.view ? (
          <Empty>We couldn&apos;t load this job. It may have been closed.</Empty>
        ) : (
          <DetailBody d={detail.view} onSave={(x) => void toggleSave(x)} />
        )}
      </SideSheet>

    </div>
  );
}

