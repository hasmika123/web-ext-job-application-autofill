"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownIcon, BriefcaseIcon, DollarIcon, ErrorState, IconButton, LayersIcon, LayoutGridIcon, ListIcon,
  MapPinIcon, Menu, MoreVerticalIcon, SearchIcon, Select, Skeleton, SlidersIcon, GearIcon, cn,
} from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { relativeTime } from "@/lib/ent/dashboard";
import {
  EMPTY_FILTERS, SORTS, WORK_TYPE_LABELS, criteriaFromFilters, criteriaLine, deleteSearch, fetchJobs, filtersFromCriteria, hasFilters, jobsQuery, markSearchSeen, saveSearch,
  type JobFilters, type JobRow, type JobsView, type SavedSearch, type SortKey,
} from "@/lib/ent/marketer-ws/jobs";
import { CARD, Empty, Head, withQuery, type MktPageProps } from "../parts";
import { AssignSheet, ClientChip, FilterBox, JobSheet, OverlaySelect, PANEL, PriorityChip, SourceCell, usePanel } from "./JobsParts";

/**
 * The Openings tab of Jobs. One call draws the board: a chip row ("N new today" and the caller's saved searches), the search + filter row and the
 * openings table or cards. Every card has its own empty state, never a made-up row. E1: "Match" opens the Job Matches page and "Assign"
 * records a match for a consultant in the caller's scope; nothing here submits an application for a consultant.
 */

const FIELD = "h-full w-full min-w-0 bg-transparent text-[14px] text-ink placeholder:text-muted focus:outline-none";
const OUTLINE_BTN = "inline-flex h-8 items-center justify-center rounded-md border border-line bg-paper px-3 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft";
const FILL_BTN = "inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-[12.5px] font-bold text-on-accent hover:brightness-95";

const opts = (first: string, values: string[], current: string, label: (v: string) => string = (v) => v) => {
  const list = values.includes(current) || !current ? values : [current, ...values];
  return [{ value: "", label: first }, ...list.map((v) => ({ value: v, label: label(v) }))];
};

export default function JobDiscoveryPage({ orgId, hrefs, embedded }: MktPageProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<JobFilters>(EMPTY_FILTERS);
  const [draftQ, setDraftQ] = useState("");
  const [page, setPage] = useState(0);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<JobsView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"table" | "card">("table");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [viewing, setViewing] = useState<JobRow | null>(null);
  const [assigning, setAssigning] = useState<JobRow | null>(null);
  const [saving, setSaving] = useState<JobRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    void tick; // `tick` only asks for a reload after a write (saved search, assignment)
    const mine = ++seq.current;
    setBusy(true);
    const r = await fetchJobs(orgId, jobsQuery(filters, page));
    if (mine !== seq.current) return;
    setBusy(false);
    if (r.kind === "OK") {
      setView(r.view);
      setStatus("ready");
      setNow(Date.now());
    } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
  }, [orgId, filters, page, tick]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const update = (patch: Partial<JobFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
    setSelected(new Set());
  };
  const reload = () => setTick((t) => t + 1);

  const header = embedded ? null : <PageHeader title="Jobs" subtitle="Openings from your sources, matched to your consultants." />;
  if (status === "denied") return <ErrorState what="the openings" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  if (status === "failed")
    return (
      <div data-jobs-page data-status="failed">
        {header}
        <ErrorState what="the openings" description="The openings didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;
  const newToday = v?.kpis.newToday?.value ?? null;
  const facets = v?.facets ?? { skills: [], locations: [], workTypes: ["ON_SITE", "HYBRID", "REMOTE"], visas: [], sources: [] };
  const matchesHref = hrefs.matches ?? null;
  const canAssign = v?.canAssign ?? false;
  const skeleton = (
    <div aria-busy="true" className="flex flex-col gap-3 py-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    update({ q: draftQ });
  };
  const clearAll = () => {
    setDraftQ("");
    update({ ...EMPTY_FILTERS, sort: filters.sort });
  };

  const applySearch = (s: SavedSearch) => {
    setFilters(filtersFromCriteria(s.criteria, filters.sort));
    setDraftQ(s.criteria.q ?? "");
    setPage(0);
    if (s.newCount > 0) void markSearchSeen(orgId, s.id).then((r) => (r.ok ? reload() : undefined));
  };
  const removeSearch = async (s: SavedSearch) => {
    const r = await deleteSearch(orgId, s.id);
    setNotice(r.ok ? `Removed the saved search "${s.name}".` : r.error);
    if (r.ok) reload();
  };
  const submitSave = async () => {
    setSaveError(null);
    const r = await saveSearch(orgId, searchName.trim(), criteriaFromFilters({ ...filters, q: draftQ || filters.q }));
    if (r.ok) {
      setSearchName("");
      setMoreOpen(false);
      setNotice(`Saved "${r.value.name}" to your saved searches.`);
      reload();
    } else setSaveError(r.error);
  };

  const toggleRow = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const items = v?.items ?? [];
  const allSelected = items.length > 0 && items.every((j) => selected.has(j.id));

  const rowMenu = (j: JobRow): ReactNode => (
    <Menu
      align="end"
      trigger={<IconButton aria-label={`More for ${j.title}`}><MoreVerticalIcon size={16} /></IconButton>}
      items={[
        { label: "View details", onSelect: () => setViewing(j) },
        ...(matchesHref ? [{ label: "Find matches", onSelect: () => router.push(withQuery(matchesHref, "job", j.id)) }] : []),
        ...(canAssign ? [{ label: "Assign consultant", onSelect: () => setAssigning(j) }] : []),
      ]}
    />
  );
  const actions = (j: JobRow) => (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => setViewing(j)} className={OUTLINE_BTN} aria-label={`View ${j.title}`}>View</button>
      {matchesHref ? <Link href={withQuery(matchesHref, "job", j.id)} className={OUTLINE_BTN} aria-label={`Match ${j.title}`}>Match</Link> : null}
      {canAssign ? <button type="button" onClick={() => setAssigning(j)} className={FILL_BTN} aria-label={`Assign ${j.title}`}>Assign</button> : null}
    </div>
  );

  const searches = v?.savedSearches ?? [];

  return (
    <div data-jobs-page data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        {/* ------------------------------------------------------------ chip row: new today + saved searches */}
        {loading || newToday !== null || searches.length > 0 ? (
          <div data-jobs-chips role="group" aria-label="Saved searches" className="flex flex-wrap items-center gap-2">
            {newToday !== null ? <span data-chip="new-today" className="inline-flex h-8 items-center rounded-full bg-v2-green-soft px-3 text-[12.5px] font-semibold text-v2-green-ink">{newToday.toLocaleString("en-US")} new today</span> : null}
            {searches.map((s) => (
              <span key={s.id} data-saved-row={s.id} className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-paper pl-3 pr-1 text-[12.5px] font-semibold text-ink-soft">
                <button type="button" onClick={() => applySearch(s)} title={criteriaLine(s.criteria)} aria-label={`Apply search ${s.name}`} className="max-w-[200px] truncate hover:text-accent-deep">
                  {s.name}
                </button>
                {s.newCount > 0 ? <span data-new-badge className="rounded-full bg-v2-green-soft px-2 py-0.5 text-[11.5px] font-semibold text-v2-green-ink">{s.newCount} new</span> : null}
                <Menu
                  align="end"
                  trigger={<IconButton aria-label={`More for ${s.name}`}><MoreVerticalIcon size={14} /></IconButton>}
                  items={[
                    { label: "Apply search", onSelect: () => applySearch(s) },
                    { label: "Mark as seen", onSelect: () => void markSearchSeen(orgId, s.id).then((r) => (r.ok ? reload() : setNotice(r.error))) },
                    { label: "Delete", danger: true, onSelect: () => void removeSearch(s) },
                  ]}
                />
              </span>
            ))}
          </div>
        ) : null}

        {/* ------------------------------------------------------------ search + filters */}
        <section aria-label="Search and filters" className={cn(CARD, "flex flex-col gap-3 p-3 sm:p-4")}>
          <form role="search" onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
            <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-paper px-3 focus-within:border-accent">
              <SearchIcon size={18} aria-hidden className="flex-none text-accent-deep" />
              <span className="sr-only">Search openings</span>
              <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} placeholder={'Search title, skills, client, or keywords (e.g. "Java", "AWS", "Project Manager")'} className={FIELD} />
            </label>
            <button type="submit" className="h-12 flex-none rounded-lg bg-accent px-8 text-[14.5px] font-bold text-on-accent hover:brightness-95">Search</button>
          </form>
          <div data-jobs-filters className="grid grid-cols-2 items-center gap-2 md:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto_auto]">
            <SkillsBox selected={filters.skills} all={facets.skills} onChange={(skills) => update({ skills })} />
            <FilterBox icon={MapPinIcon} label="Location" value={filters.location || "Select location"} active={Boolean(filters.location)}>
              <OverlaySelect label="Location" value={filters.location} onChange={(x) => update({ location: x })} options={opts("All locations", facets.locations, filters.location)} />
            </FilterBox>
            <FilterBox icon={BriefcaseIcon} label="Work type" value={filters.workType ? WORK_TYPE_LABELS[filters.workType] ?? filters.workType : "All types"} active={Boolean(filters.workType)}>
              <OverlaySelect label="Work type" value={filters.workType} onChange={(x) => update({ workType: x })} options={opts("All types", facets.workTypes, filters.workType, (t) => WORK_TYPE_LABELS[t] ?? t)} />
            </FilterBox>
            <FilterBox icon={LayersIcon} label="Source" value={filters.source || "All sources"} active={Boolean(filters.source)}>
              <OverlaySelect label="Source" value={filters.source} onChange={(x) => update({ source: x })} options={opts("All sources", facets.sources, filters.source)} />
            </FilterBox>
            <button type="button" onClick={clearAll} disabled={!hasFilters(filters) && !draftQ} className="justify-self-start px-2 text-[12.5px] font-semibold text-accent-deep hover:underline disabled:opacity-50 disabled:no-underline">Clear all</button>
            <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="inline-flex h-[46px] items-center justify-center gap-2 rounded-lg border border-accent bg-paper px-4 text-[13.5px] font-semibold text-accent-deep hover:bg-accent-soft">
              <SlidersIcon size={16} aria-hidden />
              More filters
            </button>
          </div>
          {moreOpen ? (
            <div data-more-filters className="flex flex-col gap-3 rounded-lg bg-paper-2 p-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <FilterBox icon={ListIcon} label="Visa" value={filters.visa || "All visa types"} active={Boolean(filters.visa)}>
                  <OverlaySelect label="Visa" value={filters.visa} onChange={(x) => update({ visa: x })} options={opts("All visa types", facets.visas, filters.visa)} />
                </FilterBox>
                <RateBox filters={filters} onApply={(min, max) => update({ rateMin: min, rateMax: max })} />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">
                Save this search
                <input value={searchName} onChange={(e) => setSearchName(e.target.value)} maxLength={80} placeholder="Name it, e.g. Java Developers - East Coast" className="h-10 rounded-lg border border-line bg-paper px-3 text-[13.5px] font-normal text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
              </label>
              <button type="button" onClick={() => void submitSave()} disabled={!searchName.trim() || (!hasFilters(filters) && !draftQ.trim())} className="h-10 flex-none self-end rounded-lg bg-accent px-5 text-[13.5px] font-bold text-on-accent hover:brightness-95 disabled:opacity-50">Save search</button>
              {saveError ? <p role="alert" className="text-[12.5px] text-v2-pink-ink sm:self-end">{saveError}</p> : null}
              </div>
            </div>
          ) : null}
        </section>

        {/* ------------------------------------------------------------ Job Openings */}
        <section data-jobs-card="openings" aria-label="Openings" className={cn(CARD, "p-3 sm:p-4", busy && !loading && "opacity-70")}>
          <Head icon={BriefcaseIcon} title="Openings" tint="violet" count={v ? v.total.toLocaleString("en-US") : undefined}>
            <span className="text-[12.5px] text-ink-soft">Sort by</span>
            <Select variant="pill" aria-label="Sort by" value={filters.sort} onChange={(x) => update({ sort: x as SortKey })} options={SORTS} />
            <div role="group" aria-label="Layout" className="flex rounded-lg border border-line bg-paper p-0.5">
              <button type="button" aria-pressed={mode === "table"} onClick={() => setMode("table")} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold", mode === "table" ? "bg-accent text-on-accent" : "text-ink-soft hover:bg-paper-2")}>
                <LayoutGridIcon size={14} aria-hidden />Table
              </button>
              <button type="button" aria-pressed={mode === "card"} onClick={() => setMode("card")} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold", mode === "card" ? "bg-accent text-on-accent" : "text-ink-soft hover:bg-paper-2")}>
                <ListIcon size={14} aria-hidden />Card
              </button>
            </div>
          </Head>
          {notice ? (
            <p role="status" className="mb-3 flex items-start justify-between gap-3 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent-deep">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="flex-none font-semibold hover:underline">Dismiss</button>
            </p>
          ) : null}
          {loading ? (
            skeleton
          ) : items.length === 0 ? (
            <Empty>{hasFilters(filters) ? "No openings match these filters." : "No openings yet."}</Empty>
          ) : mode === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1010px] text-left text-[13px]">
                <thead>
                  <tr className="bg-paper-2 text-[12px] font-semibold text-ink-soft">
                    <th className="w-8 rounded-l-lg px-2 py-2.5">
                      <input type="checkbox" aria-label="Select all jobs on this page" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((j) => j.id)))} className="h-4 w-4 rounded border-line" />
                    </th>
                    <th className="px-2">Opening</th>
                    <th className="px-2">Client</th>
                    <th className="px-2">Location</th>
                    <th className="px-2">Rate</th>
                    <th className="px-2">Source</th>
                    <th className="px-2">
                      <button type="button" onClick={() => update({ sort: filters.sort === "posted_desc" ? "posted_asc" : "posted_desc" })} className="inline-flex items-center gap-1 font-semibold" aria-label="Sort by posted date">
                        Posted
                        {filters.sort === "posted_desc" || filters.sort === "posted_asc" ? <ArrowDownIcon size={12} aria-hidden className={filters.sort === "posted_asc" ? "rotate-180" : undefined} /> : null}
                      </button>
                    </th>
                    <th className="px-2">Priority</th>
                    <th className="px-2">Actions</th>
                    <th className="rounded-r-lg" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((j) => (
                    <tr key={j.id} data-job-row={j.id} className="border-b border-line last:border-0">
                      <td className="px-2 py-2.5"><input type="checkbox" aria-label={`Select ${j.title}`} checked={selected.has(j.id)} onChange={() => toggleRow(j.id)} className="h-4 w-4 rounded border-line" /></td>
                      <td className="px-2 font-bold text-ink">{j.title}</td>
                      <td className="px-2"><span className="inline-flex items-center gap-2 text-ink-soft"><ClientChip name={j.client.name} src={j.client.logoUrl} />{j.client.name}</span></td>
                      <td className="px-2"><span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft"><MapPinIcon size={13} aria-hidden className="flex-none text-muted" />{j.location || "—"}</span></td>
                      <td className="whitespace-nowrap px-2 text-ink-soft">{j.rateLabel}</td>
                      <td className="px-2"><SourceCell source={j.source} /></td>
                      <td className="whitespace-nowrap px-2 text-ink-soft">{j.postedAt ? relativeTime(j.postedAt, now) : "—"}</td>
                      <td className="px-2"><PriorityChip priority={j.priority} /></td>
                      <td className="px-2">{actions(j)}</td>
                      <td className="px-1">{rowMenu(j)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul data-job-cards className="grid gap-3 sm:grid-cols-2">
              {items.map((j) => (
                <li key={j.id} data-job-row={j.id} className="flex flex-col gap-2.5 rounded-xl border border-line p-3">
                  <div className="flex items-start gap-2.5">
                    <ClientChip name={j.client.name} src={j.client.logoUrl} size={32} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[14px] font-bold text-ink">{j.title}</h3>
                      <p className="truncate text-[12.5px] text-muted">{j.client.name}</p>
                    </div>
                    <PriorityChip priority={j.priority} />
                  </div>
                  <p className="flex items-center gap-1.5 text-[12.5px] text-ink-soft"><MapPinIcon size={13} aria-hidden className="text-muted" />{j.location || "—"}<span className="ml-auto font-semibold text-ink">{j.rateLabel}</span></p>
                  <div className="flex items-center justify-between gap-2 text-[12.5px]">
                    <SourceCell source={j.source} />
                    <span className="text-muted">{j.postedAt ? relativeTime(j.postedAt, now) : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">{actions(j)}{rowMenu(j)}</div>
                </li>
              ))}
            </ul>
          )}
          {v && v.total > v.size ? (
            <nav aria-label="Pages" className="mt-3 flex items-center justify-between gap-3 text-[12.5px] text-muted">
              <span>Showing {v.page * v.size + 1}-{Math.min(v.total, v.page * v.size + items.length)} of {v.total.toLocaleString("en-US")}</span>
              <span className="flex gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className={cn(OUTLINE_BTN, "disabled:opacity-50")}>Previous</button>
                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * v.size >= v.total} className={cn(OUTLINE_BTN, "disabled:opacity-50")}>Next</button>
              </span>
            </nav>
          ) : null}
          {selected.size > 0 ? <p className="mt-2 text-[12.5px] text-muted">{selected.size} selected. <button type="button" onClick={() => setSelected(new Set())} className="font-semibold text-accent-deep hover:underline">Clear</button></p> : null}
        </section>

      </div>

      {viewing ? (
        <JobSheet orgId={orgId} job={viewing} matchesHref={matchesHref} canAssign={canAssign} now={now} onClose={() => setViewing(null)} onAssign={() => { setAssigning(viewing); setViewing(null); }} onSave={() => { setSaving(viewing); setViewing(null); }} />
      ) : null}
      {saving ? (
        <AssignSheet
          orgId={orgId}
          job={saving}
          mode="save"
          onClose={() => setSaving(null)}
          onDone={() => setSaving(null)}
          onSaved={(r, who) => {
            setNotice(`${r.alreadySaved ? "Already saved:" : "Saved for"} ${who} - ${saving.title}. It is on their job list; the consultant applies themselves.`);
            setSaving(null);
          }}
        />
      ) : null}
      {assigning ? (
        <AssignSheet
          orgId={orgId}
          job={assigning}
          onClose={() => setAssigning(null)}
          onDone={(r, who) => {
            setNotice(`${r.created ? "Assigned" : "Already assigned:"} ${who} - ${assigning.title}. The match is recorded; the consultant submits the application.`);
            setAssigning(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

/** The Skills filter: a box that opens a checklist of the skills on the open jobs (a job matches when it has any chosen skill). */
function SkillsBox({ selected, all, onChange }: { selected: string[]; all: string[]; onChange: (skills: string[]) => void }) {
  const { open, setOpen, ref } = usePanel();
  const value = selected.length ? (selected.length > 1 ? `${selected[0]} +${selected.length - 1}` : selected[0]) : "Select skills";
  return (
    <div ref={ref} className="relative">
      <FilterBox icon={GearIcon} label="Skills" value={value} active={selected.length > 0} expanded={open} onClick={() => setOpen(!open)} />
      {open ? (
        <div role="dialog" aria-label="Skills" className={PANEL}>
          {all.length === 0 ? (
            <p className="text-[13px] text-muted">No skills on the open jobs yet.</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {all.map((s) => (
                <li key={s}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-ink hover:bg-paper-2">
                    <input type="checkbox" checked={selected.includes(s)} onChange={() => onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s])} className="h-4 w-4 rounded border-line" />
                    {s}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** The "Rate Min - Max" box: opens a small panel with two dollar-per-hour inputs. */
function RateBox({ filters, onApply }: { filters: JobFilters; onApply: (min: string, max: string) => void }) {
  const { open, setOpen, ref } = usePanel();
  const [min, setMin] = useState(filters.rateMin);
  const [max, setMax] = useState(filters.rateMax);
  const label = filters.rateMin || filters.rateMax ? `${filters.rateMin || "0"} - ${filters.rateMax || "Any"}` : "Min - Max";
  const apply = () => {
    onApply(min.trim(), max.trim());
    setOpen(false);
  };
  const input = "h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13.5px] text-ink focus:border-accent focus:outline-none";
  return (
    <div ref={ref} className="relative">
      <FilterBox icon={DollarIcon} label="Rate" value={label} active={Boolean(filters.rateMin || filters.rateMax)} expanded={open} onClick={() => { setMin(filters.rateMin); setMax(filters.rateMax); setOpen(!open); }} />
      {open ? (
        <div role="dialog" aria-label="Rate" className={PANEL}>
          <p className="mb-2 text-[12px] text-muted">Dollars per hour (a yearly rate is compared as year / 2080).</p>
          <div className="flex items-center gap-2">
            <label className="flex-1 text-[12px] font-semibold text-ink-soft">Min<input type="number" min={0} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} className={input} /></label>
            <label className="flex-1 text-[12px] font-semibold text-ink-soft">Max<input type="number" min={0} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} className={input} /></label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setMin(""); setMax(""); onApply("", ""); setOpen(false); }} className={OUTLINE_BTN}>Clear</button>
            <button type="button" onClick={apply} className={FILL_BTN}>Apply</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

