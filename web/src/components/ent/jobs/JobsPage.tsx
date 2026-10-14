"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, ErrorState, FilterIcon, Input, Menu, PlusIcon, SearchIcon, Select, TableSkeleton, useMediaQuery, useNarrow, useToast, SEARCH_DEBOUNCE_MS } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  bulkSummary,
  DEFAULT_QUERY,
  errorSentence,
  hasFilters,
  jobsApi,
  parseUrl,
  statusLabel,
  undoGroups,
  urlParams,
  EMPLOYMENT_LABEL,
  EXPERIENCE_LABEL,
  MIN_SEARCH,
  type BulkResult,
  type Facet,
  type FilterKey,
  type JobDetail,
  type JobQuery,
  type JobRow,
  type JobSummary,
  type SortDir,
  type SortKey,
} from "@/lib/ent/jobs";
import CreateJobDialog from "./CreateJobDialog";
import BeeBanner from "@/components/ent/shell/BeeBanner";
import JobDrawer, { UNDO_MS, type DrawerTab } from "./JobDrawer";
import { JobsList, Pagination } from "./JobsList";
import KpiTiles from "./KpiTiles";

const WIDE_QUERY = "(min-width: 1280px)"; // config-literal-ok: the width at which the drawer docks beside the list instead of floating over it

export interface JobsPageProps {
  orgId: number;
  orgName: string;
  supportEmail?: string | null;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: JobRow[]; total: number };

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "posted,desc", label: "Posted Date" },
  { value: "posted,asc", label: "Posted Date (oldest)" },
  { value: "title,asc", label: "Title A to Z" },
  { value: "client,asc", label: "Client A to Z" },
  { value: "submissions,desc", label: "Most submissions" },
  { value: "match,desc", label: "Best match" },
  { value: "status,asc", label: "Status" },
];

const withCount = (f: Facet) => ({ value: f.value, label: `${f.label} (${f.count})` });
const labelled = (f: Facet, labels: Record<string, string>) => ({ value: f.value, label: `${labels[f.value] ?? f.label} (${f.count})` });
const MATCH_OPTIONS = [
  { value: "", label: "Any match" },
  { value: "90", label: "90% or better" },
  { value: "80", label: "80% or better" },
  { value: "70", label: "70% or better" },
];

export default function JobsPage({ orgId, orgName, supportEmail }: JobsPageProps) {
  const toast = useToast();
  const narrow = useNarrow();
  const wide = useMediaQuery(WIDE_QUERY, false);

  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState<JobQuery>(DEFAULT_QUERY);
  const [openId, setOpenId] = useState<number | null>(null);
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [summary, setSummary] = useState<{ status: "loading" | "ok" | "error"; data: JobSummary | null }>({ status: "loading", data: null });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [searchText, setSearchText] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  /* ── the address is the state: read it once, then keep it in step ────────────────── */

  useEffect(() => {
    const u = parseUrl(new URLSearchParams(window.location.search));
    setQuery(u.query);
    setSearchText(u.query.q);
    setOpenId(u.openId);
    setTab(u.tab as DrawerTab);
    setMoreOpen(!!(u.query.employment || u.query.experience || u.query.minMatch));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const qs = urlParams(query, openId, tab).toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [ready, query, openId, tab]);

  /* ── data ─────────────────────────────────────────────────────────────────────── */

  const loadList = useCallback(
    async (q: JobQuery, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setList({ status: "loading" });
      const r = await jobsApi.list(orgId, q);
      if (mine !== seq.current) return;
      if (r.ok) setList({ status: "ok", items: r.data.items, total: r.data.total });
      else setList({ status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadSummary = useCallback(async () => {
    const r = await jobsApi.summary(orgId);
    setSummary(r.ok ? { status: "ok", data: r.data } : (s) => ({ status: "error", data: s.data }));
  }, [orgId]);

  useEffect(() => {
    if (ready) void loadList(query, false);
  }, [ready, query, loadList]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const refresh = useCallback(() => {
    void loadList(queryRef.current, true);
    void loadSummary();
  }, [loadList, loadSummary]);

  /* ── query changes ────────────────────────────────────────────────────────────── */

  const change = useCallback((c: Partial<JobQuery>) => setQuery((q) => ({ ...q, ...c, page: c.page ?? 0 })), []);
  const clearAll = () => {
    setSearchText("");
    change({ q: "", status: "", clientId: "", location: "", workMode: "", skill: "", employment: "", experience: "", minMatch: "" });
  };

  // the search box rests 300 ms before the list is asked
  useEffect(() => {
    if (!ready || searchText === queryRef.current.q) return;
    const t = setTimeout(() => change({ q: searchText }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchText, ready, change]);

  // "/" jumps to the search box
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const box = root.current?.querySelector<HTMLInputElement>('[role="search"] input[type="search"]');
      if (box) {
        e.preventDefault();
        box.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* ── selection and bulk ───────────────────────────────────────────────────────── */

  const rows = list.status === "ok" ? list.items : [];
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const togglePage = (on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const r of rows) {
        if (on) n.add(r.id);
        else n.delete(r.id);
      }
      return n;
    });

  const undoStatus = useCallback(
    async (res: BulkResult) => {
      let failed = 0;
      for (const g of undoGroups(res.results)) if (!(await jobsApi.bulkStatus(orgId, g.ids, g.status)).ok) failed++;
      toast(failed === 0 ? { title: "Undone", variant: "success" } : { title: "Couldn't undo everything", description: "Reload to see where things stand.", variant: "error" });
      refresh();
      setReloadToken((n) => n + 1);
    },
    [orgId, toast, refresh],
  );

  const setStatus = useCallback(
    async (ids: number[], status: string) => {
      const r = await jobsApi.bulkStatus(orgId, ids, status);
      if (!r.ok) {
        toast({ title: "Couldn't change the status", description: errorSentence(r), variant: "error" });
        return;
      }
      const sum = bulkSummary(r.data, `set to ${statusLabel(status)}`);
      toast({ ...sum, duration: UNDO_MS, action: r.data.ok > 0 ? { label: "Undo", onClick: () => void undoStatus(r.data) } : undefined });
      setSelected(new Set());
      refresh();
      setReloadToken((n) => n + 1);
    },
    [orgId, toast, refresh, undoStatus],
  );

  /* ── drawer ───────────────────────────────────────────────────────────────────── */

  const openRow = (row: JobRow) => {
    setOpenId(row.id);
    setTab("overview");
  };

  const copyLink = useCallback(
    async (id: number) => {
      const url = `${window.location.origin}${window.location.pathname}?job=${id}`;
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", variant: "success" });
      } catch {
        toast({ title: "Couldn't copy the link", description: url, variant: "error" });
      }
    },
    [toast],
  );

  const canEdit = summary.data?.access.canEdit ?? false;
  const canCreate = summary.data?.access.canCreate ?? false;

  const rowMenu = (row: JobRow): MenuEntry[] => {
    const items: MenuEntry[] = [{ label: "View details", onSelect: () => openRow(row) }];
    if (canEdit) {
      items.push({ heading: "Set status" });
      for (const s of ["OPEN", "IN_REVIEW", "ON_HOLD", "FILLED", "CLOSED"]) {
        if (s !== row.status) items.push({ label: statusLabel(s), onSelect: () => void setStatus([row.id], s) });
      }
    }
    items.push({ separator: true }, { label: "Copy link", onSelect: () => void copyLink(row.id) });
    return items;
  };

  const onCreated = (job: JobDetail) => {
    setCreateOpen(false);
    toast({ title: `${job.title} was created`, description: `For ${job.client.name}.`, variant: "success" });
    setOpenId(job.id);
    setTab("overview");
    setReloadToken((n) => n + 1);
    setQuery((q) => ({ ...q, q: "", status: "", clientId: "", location: "", workMode: "", skill: "", employment: "", experience: "", minMatch: "", sort: { key: "posted", dir: "desc" }, page: 0 }));
    setSearchText("");
    void loadSummary();
  };

  /* ── view ─────────────────────────────────────────────────────────────────────── */

  const mode = narrow ? "sheet" : wide ? "push" : "overlay";
  const drawerOpen = openId !== null;
  const total = list.status === "ok" ? list.total : 0;
  const filtersOn = hasFilters(query);
  const f = summary.data?.facets;
  const sortValue = `${query.sort.key},${query.sort.dir}`;
  const moreCount = (query.employment ? 1 : 0) + (query.experience ? 1 : 0) + (query.minMatch ? 1 : 0);
  const noJobsAtAll = list.status === "ok" && rows.length === 0 && !filtersOn && summary.status === "ok";

  const filterSelects = useMemo(
    () => [
      { name: "status" as FilterKey, label: "Status", all: "All Statuses", options: (f?.statuses ?? []).map((x) => labelled(x, { OPEN: "Open", IN_REVIEW: "In Review", ON_HOLD: "On Hold", FILLED: "Filled", CLOSED: "Closed" })) },
      { name: "clientId" as FilterKey, label: "Client", all: "All Clients", options: (f?.clients ?? []).map(withCount) },
      { name: "location" as FilterKey, label: "Location", all: "All Locations", options: (f?.locations ?? []).map(withCount) },
      { name: "workMode" as FilterKey, label: "Work mode", all: "All Work Modes", options: (f?.workModes ?? []).map((x) => labelled(x, { REMOTE: "Remote", HYBRID: "Hybrid", ON_SITE: "On-site" })) },
      { name: "skill" as FilterKey, label: "Skill", all: "All Skills", options: (f?.skills ?? []).map(withCount) },
    ],
    [f],
  );

  return (
    <div ref={root} data-jobs-page className="ent-fit">
      <PageHeader title="Jobs" subtitle="Manage job postings, track submissions, and find the best consultants for your opportunities." />
      <div className="space-y-[14px]">
        <KpiTiles summary={summary.data} loading={summary.status === "loading"} error={summary.status === "error"} />

        <div className="flex items-start">
          <div className="ent-card min-w-0 flex-1 space-y-2.5 !p-[10px]">
            <div role="search" className="ent-searchrow flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-0 flex-1 basis-64">
                <SearchIcon aria-hidden size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#3b5ba5]" />
                <Input
                  type="search"
                  value={searchText}
                  placeholder="Search jobs by title, client, skills, or location..."
                  aria-label="Search jobs"
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      change({ q: searchText });
                    } else if (e.key === "Escape" && searchText !== "") setSearchText("");
                  }}
                  className="ent-search !rounded-[10px] pl-10"
                />
              </div>
              {canCreate && (
                <Button type="button" variant="accent" className="ent-btn ent-btn-lg" onClick={() => setCreateOpen(true)} data-create-job>
                  <PlusIcon size={15} aria-hidden /> Create Job
                </Button>
              )}
            </div>
            {searchText.trim().length === 1 && <p className="text-[12px] text-muted">Type one more character to search.</p>}

            <div className="ent-filterrow flex flex-wrap items-center gap-2 sm:flex-nowrap" data-filters>
              {filterSelects.map((fs) => (
                <div key={fs.name} className="min-w-0 flex-1 basis-[calc(50%-0.3rem)] sm:basis-auto">
                  <Select aria-label={fs.label} value={query[fs.name]} onChange={(v) => change({ [fs.name]: v } as Partial<JobQuery>)} options={[{ value: "", label: fs.all }, ...fs.options]} />
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="ent-ctl-btn flex-1 !h-[30px] sm:flex-auto" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} data-more-filters>
                <FilterIcon size={14} aria-hidden /> More Filters{moreCount > 0 ? ` (${moreCount})` : ""}
              </Button>
              {filtersOn && (
                <Button type="button" variant="ghost" size="sm" onClick={clearAll} data-clear-filters>
                  Clear filters
                </Button>
              )}
            </div>
            {moreOpen && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-line bg-paper-2/40 p-2.5" data-more-filters-row>
                <div className="w-44">
                  <Select aria-label="Job type" value={query.employment} onChange={(v) => change({ employment: v })} options={[{ value: "", label: "Any job type" }, ...(f?.employment ?? []).map((x) => labelled(x, EMPLOYMENT_LABEL))]} />
                </div>
                <div className="w-52">
                  <Select aria-label="Experience level" value={query.experience} onChange={(v) => change({ experience: v })} options={[{ value: "", label: "Any experience" }, ...(f?.experience ?? []).map((x) => labelled(x, EXPERIENCE_LABEL))]} />
                </div>
                <div className="w-44">
                  <Select aria-label="Best match" value={query.minMatch} onChange={(v) => change({ minMatch: v })} options={MATCH_OPTIONS} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[var(--ent-soft)]">
              <p aria-live="polite" data-count>
                {list.status === "ok" ? (total === 0 ? "0 jobs" : `${query.page * query.size + 1}–${query.page * query.size + rows.length} of ${total} ${total === 1 ? "job" : "jobs"}`) : " "}
              </p>
              <label className="flex items-center gap-2">
                <span>Sort by:</span>
                <div className="ent-sort w-[140px]">
                  <Select
                    className="font-semibold"
                    aria-label="Sort by"
                    value={sortValue}
                    onChange={(v) => {
                      const [key, dir] = v.split(",");
                      change({ sort: { key: key as SortKey, dir: dir as SortDir } });
                    }}
                    options={SORT_OPTIONS}
                  />
                </div>
              </label>
            </div>

            {selected.size > 0 && (
              <div role="region" aria-label="Bulk actions" data-bulk-bar className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-accent/40 bg-accent-soft/50 px-3 py-2">
                <p className="text-[13.5px] font-semibold text-ink" aria-live="polite">
                  {selected.size} selected
                </p>
                {canEdit && (
                  <Menu
                    trigger={
                      <Button type="button" size="sm" variant="ghost" data-bulk-status>
                        Set status
                      </Button>
                    }
                    // eslint-disable-next-line react-hooks/refs -- the handlers run on click, never during render
                    items={["OPEN", "IN_REVIEW", "ON_HOLD", "FILLED", "CLOSED"].map((s) => ({ label: statusLabel(s), onSelect: () => void setStatus([...selected], s) }))}
                  />
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              </div>
            )}

            {list.status === "loading" && <TableSkeleton count={6} columns={5} label="Loading jobs" />}
            {list.status === "error" && <ErrorState what="the jobs" description={list.message} onRetry={() => void loadList(query, false)} />}
            {list.status === "ok" && rows.length > 0 && (
              <>
                <JobsList rows={rows} selected={selected} onToggle={toggle} onTogglePage={togglePage} openId={openId} onOpen={openRow} rowMenu={rowMenu} compact={drawerOpen && mode === "push"} />
                <Pagination page={query.page} size={query.size} total={total} shown={rows.length} onPage={(page) => change({ page })} onSize={(size) => change({ size })} />
              </>
            )}
            {list.status === "ok" && rows.length === 0 && (
              <EmptyState
                variant="page"
                mascotPose="peek"
                title={noJobsAtAll ? "No jobs yet" : "No jobs match"}
                description={noJobsAtAll ? "Jobs your clients send you appear here, with the consultants who fit them best." : query.q.trim().length >= MIN_SEARCH || filtersOn ? "Try a different search, or clear the filters to see every job." : "There is nothing on this page."}
                action={
                  noJobsAtAll ? (
                    canCreate ? (
                      <Button type="button" onClick={() => setCreateOpen(true)}>
                        Create your first job
                      </Button>
                    ) : undefined
                  ) : filtersOn ? (
                    <Button type="button" onClick={clearAll}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )}
            {list.status === "ok" && rows.length > 0 && !drawerOpen && <BeeBanner layout="row" title="Need help with your jobs?" body={`Questions about jobs, matches or submissions at ${orgName}? We can point you the right way.`} topic="jobs" orgName={orgName} supportEmail={supportEmail} />}
          </div>

          <JobDrawer
            orgId={orgId}
            orgName={orgName}
            jobId={openId}
            mode={mode}
            clientOptions={summary.data?.clientOptions ?? []}
            tab={tab}
            onTab={setTab}
            onClose={() => setOpenId(null)}
            onChanged={refresh}
            reloadToken={reloadToken}
            supportEmail={supportEmail}
          />
        </div>
      </div>

      <CreateJobDialog orgId={orgId} open={createOpen} onClose={() => setCreateOpen(false)} clients={summary.data?.clientOptions ?? []} onCreated={onCreated} />
    </div>
  );
}
