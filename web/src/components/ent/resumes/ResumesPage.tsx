"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button,
  ClipboardCheckIcon,
  EmptyState,
  ErrorState,
  FileTextIcon,
  FilterBar,
  FilterIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  Select,
  Tab,
  TabList,
  Tabs,
  TableSkeleton,
  UploadIcon,
  useMediaQuery,
  useNarrow,
  useToast,
  ClockIcon,
} from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  bulkSummary,
  bulkUndoPlans,
  errorSentence,
  exportUrl,
  filtersActive,
  listParams,
  nextSort,
  parseState,
  resumesApi,
  stateToSearch,
  VISIBILITY_OPTIONS,
  type BulkUndo,
  type FilterOptions,
  type ResumeCounts,
  type ResumeDetail,
  type ResumeRow,
  type ResumeUrlState,
  type SortKey,
  type Tab as TabKey,
  type Visibility,
} from "@/lib/ent/resumes";
import ResumeDrawer, { printHtml } from "./ResumeDrawer";
import ResumeHelpCard from "./ResumeHelpCard";
import ResumeKpiTiles from "./ResumeKpiTiles";
import { Pagination, ResumesTable } from "./ResumesTable";
import UploadResumeDialog from "./UploadResumeDialog";

const WIDE_QUERY = "(min-width: 1400px)"; // config-literal-ok: the width at which the drawer docks beside the table instead of floating over it
const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered (UI timing)

export interface ResumesPageProps {
  orgId: number;
  orgName: string;
  workspace: string;
  selfMemberId: number;
  /** `me.permissions` of the tenant session: decides which buttons are drawn (the API is the gate). */
  permissions: Record<string, string>;
  supportEmail?: string | null;
}

const SORT_OPTIONS = [
  { value: "modified,desc", label: "Last Modified" },
  { value: "modified,asc", label: "Least recently modified" },
  { value: "created,desc", label: "Newest created" },
  { value: "consultant,asc", label: "Consultant A to Z" },
  { value: "name,asc", label: "Resume name A to Z" },
  { value: "version,desc", label: "Highest version" },
  { value: "status,asc", label: "Status" },
];

const TAB_LABEL: Record<TabKey, string> = { all: "All Resumes", pending: "Pending Approval", recent: "Recent Updates" };

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: ResumeRow[]; total: number };

export default function ResumesPage({ orgName, orgId, permissions, supportEmail }: ResumesPageProps) {
  const toast = useToast();
  const narrow = useNarrow();
  const wide = useMediaQuery(WIDE_QUERY, false);
  const can = useCallback((k: string) => Object.prototype.hasOwnProperty.call(permissions, k), [permissions]);
  const searchParams = useSearchParams();
  const state = useMemo(() => parseState(searchParams), [searchParams]);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const [list, setList] = useState<ListState>({ status: "loading" });
  const [counts, setCounts] = useState<{ status: "loading" | "ok" | "error"; data: ResumeCounts | null }>({ status: "loading", data: null });
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ departments: [], owners: [] });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  /* ── URL state: every change rewrites the query in place, so any view can be shared ── */

  const apply = useCallback((patch: Partial<ResumeUrlState>, resetPage = true) => {
    const next: ResumeUrlState = { ...stateRef.current, ...patch, page: patch.page ?? (resetPage ? 0 : stateRef.current.page) };
    window.history.replaceState(null, "", `${window.location.pathname}${stateToSearch(next)}`);
  }, []);

  /* ── data ─────────────────────────────────────────────────────────────────────── */

  const listKey = listParams(state).toString();
  const loadList = useCallback(
    async (s: ResumeUrlState, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setList({ status: "loading" });
      const r = await resumesApi.list(orgId, s);
      if (mine !== seq.current) return;
      if (r.ok) setList({ status: "ok", items: r.data.items, total: r.data.total });
      else setList({ status: "error", message: errorSentence(r) });
    },
    [orgId],
  );
  const loadCounts = useCallback(async () => {
    const r = await resumesApi.counts(orgId);
    setCounts(r.ok ? { status: "ok", data: r.data } : (c) => ({ status: "error", data: c.data }));
  }, [orgId]);

  useEffect(() => {
    void loadList(stateRef.current, false);
    setSelected(new Set());
  }, [listKey, loadList]);

  useEffect(() => {
    void loadCounts();
    void resumesApi.filters(orgId).then((r) => setFilterOptions(r.ok ? r.data : { departments: [], owners: [] }));
  }, [orgId, loadCounts]);

  const refresh = useCallback(() => {
    void loadList(stateRef.current, true);
    void loadCounts();
    setReloadToken((n) => n + 1);
  }, [loadList, loadCounts]);

  /** A change made in the drawer: the row is updated in place and the tiles reload. */
  const onChanged = useCallback(
    (d: ResumeDetail) => {
      setList((l) => (l.status === "ok" ? { ...l, items: l.items.map((r) => (r.id === d.row.id ? d.row : r.primary && d.row.primary && r.consultant.id === d.row.consultant.id ? { ...r, primary: false } : r)) } : l));
      void loadCounts();
      void loadList(stateRef.current, true); // the tab or filter may no longer include the row
    },
    [loadCounts, loadList],
  );

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

  const applyUndo = useCallback(
    async (plans: BulkUndo[]) => {
      let failed = 0;
      for (const p of plans) {
        const r =
          p.kind === "visibility"
            ? await resumesApi.bulk(orgId, { ids: p.ids, action: "VISIBILITY", visibility: p.visibility })
            : p.kind === "reopen"
              ? await resumesApi.bulk(orgId, { ids: p.ids, action: "REOPEN" })
              : await resumesApi.bulk(orgId, { ids: p.ids, action: p.decision });
        if (!r.ok) failed++;
      }
      toast(failed === 0 ? { title: "Undone", variant: "success" } : { title: "Couldn't undo everything", description: "Some changes could not be put back. Reload to see where things stand.", variant: "error" });
      refresh();
    },
    [orgId, toast, refresh],
  );

  async function runBulk(action: "VISIBILITY" | "APPROVE" | "REJECT", verb: string, visibility?: Visibility) {
    const r = await resumesApi.bulk(orgId, { ids: [...selected], action, visibility });
    if (!r.ok) {
      toast({ title: "Couldn't update the resumes", description: errorSentence(r), variant: "error" });
      return;
    }
    const sum = bulkSummary(r.data, verb);
    const plans = bulkUndoPlans(action, r.data.results);
    toast({ ...sum, duration: UNDO_MS, action: plans.length > 0 ? { label: "Undo", onClick: () => void applyUndo(plans) } : undefined });
    setSelected(new Set());
    refresh();
  }

  /* ── row actions ──────────────────────────────────────────────────────────────── */

  const rowMenu = (row: ResumeRow): MenuEntry[] => [
    { label: "View details", onSelect: () => apply({ open: row.id }, false) },
    {
      label: "Download",
      onSelect: () => {
        const a = document.createElement("a");
        a.href = exportUrl(orgId, row.id, "txt");
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
    },
    {
      label: "Print",
      onSelect: () =>
        void resumesApi.html(orgId, row.id).then((r) => (r.ok ? printHtml(r.html) : toast({ title: "Couldn't print", description: r.message, variant: "error" }))),
    },
  ];

  /* ── layout ───────────────────────────────────────────────────────────────────── */

  const mode = narrow ? "sheet" : wide ? "push" : "overlay";
  const openId = state.open;
  const sheetOpen = openId !== null;
  const docked = sheetOpen && mode === "push";
  const total = list.status === "ok" ? list.total : 0;
  const active = filtersActive(state);
  const sortValue = `${state.sort.key},${state.sort.dir}`;
  const canUpload = can("resumes.edit_for");
  const moreCount = [state.primary, state.owner, state.updated].filter(Boolean).length;

  const filters = [
    { name: "department", label: "Department", allLabel: "All Departments", options: filterOptions.departments },
    { name: "visibility", label: "Visibility", allLabel: "All Visibility", options: VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
    { name: "status", label: "Status", allLabel: "All Statuses", options: [{ value: "APPROVED", label: "Approved" }, { value: "PENDING", label: "Pending" }, { value: "REJECTED", label: "Rejected" }] },
  ];
  const filterValues = { department: state.department, visibility: state.visibility, status: state.status };
  const onFilter = (name: string, value: string) => apply(name === "department" ? { department: value } : name === "visibility" ? { visibility: value } : { status: value });
  const clearAll = () => apply({ q: "", department: "", visibility: "", status: "", primary: "", owner: "", updated: "" });

  const pageNav = list.status === "ok" && total > state.size;
  const from = list.status === "ok" && total > 0 ? state.page * state.size + 1 : 0;
  const to = list.status === "ok" ? state.page * state.size + rows.length : 0;

  return (
    <div ref={root} data-resumes-page>
      <PageHeader title="Resumes" subtitle="Manage and organize consultant resumes, track versions, and control visibility across your organization." />
      <div className="flex items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <div className={`grid gap-3 ${docked || sheetOpen ? "" : "xl:grid-cols-[minmax(0,4fr)_minmax(0,1.05fr)]"}`}>
            <ResumeKpiTiles compact={docked || sheetOpen} counts={counts.data} loading={counts.status === "loading"} error={counts.status === "error"} />
            {!sheetOpen && <ResumeHelpCard orgName={orgName} supportEmail={supportEmail} />}
          </div>

          <section aria-label="Resumes" className="space-y-3 rounded-2xl border border-line bg-paper p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs value={state.tab} onValueChange={(v) => apply({ tab: v as TabKey })} variant="underline" className="min-w-0 max-w-full overflow-x-auto">
                <TabList aria-label="Resume views">
                  <Tab value="all">
                    <span className="inline-flex items-center gap-1.5">
                      <FileTextIcon aria-hidden size={15} className="hidden sm:block" /> {TAB_LABEL.all}
                    </span>
                  </Tab>
                  <Tab value="pending">
                    <span className="inline-flex items-center gap-1.5">
                      <ClipboardCheckIcon aria-hidden size={15} className="hidden sm:block" /> {TAB_LABEL.pending}
                    </span>
                  </Tab>
                  <Tab value="recent">
                    <span className="inline-flex items-center gap-1.5">
                      <ClockIcon aria-hidden size={15} className="hidden sm:block" /> {TAB_LABEL.recent}
                    </span>
                  </Tab>
                </TabList>
              </Tabs>
              {canUpload && (
                <Button type="button" variant="accent" onClick={() => setUploadOpen(true)} data-upload-open>
                  <PlusIcon aria-hidden size={16} /> Upload Resume
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <FilterBar
                compact
                query={state.q}
                onQueryChange={(q) => apply({ q })}
                values={filterValues}
                onFilterChange={onFilter}
                search={{ placeholder: "Search name, role, or skills...", label: "Search resumes" }}
                filters={filters}
                actions={
                  <Button type="button" variant="ghost" size="sm" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} data-more-filters>
                    <FilterIcon size={15} aria-hidden /> More Filters{moreCount > 0 ? ` (${moreCount})` : ""}
                  </Button>
                }
              />
              {moreOpen && (
                <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-line bg-paper-2/40 p-2.5" data-more-filters-row>
                  <div className="w-44">
                    <Select
                      aria-label="Primary"
                      value={state.primary}
                      onChange={(v) => apply({ primary: v as ResumeUrlState["primary"] })}
                      options={[{ value: "", label: "Primary or not" }, { value: "yes", label: "Primary only" }, { value: "no", label: "Not primary" }]}
                    />
                  </div>
                  <div className="w-52">
                    <Select aria-label="Owner" value={state.owner} onChange={(v) => apply({ owner: v })} options={[{ value: "", label: "Any owner" }, ...filterOptions.owners]} />
                  </div>
                  <div className="w-48">
                    <Select
                      aria-label="Last modified"
                      value={state.updated}
                      onChange={(v) => apply({ updated: v })}
                      options={[{ value: "", label: "Any time" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]}
                    />
                  </div>
                </div>
              )}
            </div>

            {selected.size > 0 && (
              <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/50 px-3 py-2" data-bulk-bar>
                <span className="text-[13px] font-semibold text-ink" aria-live="polite">
                  {selected.size} selected
                </span>
                {canUpload && (
                  <div className="w-52">
                    <Select
                      aria-label="Set visibility for the selected resumes"
                      value=""
                      placeholder="Set visibility..."
                      onChange={(v) => void runBulk("VISIBILITY", "updated", v as Visibility)}
                      options={VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.long }))}
                    />
                  </div>
                )}
                {can("resumes.approve_request") && (
                  <>
                    <Button type="button" size="sm" variant="accent-soft" onClick={() => void runBulk("APPROVE", "approved")}>
                      Approve
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void runBulk("REJECT", "rejected")}>
                      Reject
                    </Button>
                  </>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-soft">
              <p aria-live="polite" data-range>
                {list.status === "ok" ? (total === 0 ? "No resumes" : `${from}-${to} of ${total} ${total === 1 ? "resume" : "resumes"}`) : " "}
              </p>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline">Sort by:</span>
                <div className="w-48">
                  <Select
                    aria-label="Sort by"
                    value={SORT_OPTIONS.some((o) => o.value === sortValue) ? sortValue : ""}
                    placeholder="Sorted by column"
                    onChange={(v) => {
                      const [key, dir] = v.split(",");
                      apply({ sort: { key: key as SortKey, dir: dir as "asc" | "desc" } });
                    }}
                    options={SORT_OPTIONS}
                  />
                </div>
                <div role="group" aria-label="View" className="flex overflow-hidden rounded-lg border border-line">
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={state.view === "list"}
                    onClick={() => apply({ view: "list" }, false)}
                    className={`grid h-9 w-9 place-items-center ${state.view === "list" ? "bg-accent-soft text-accent-deep" : "text-ink-soft hover:bg-paper-2"}`}
                  >
                    <ListIcon aria-hidden size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={state.view === "grid"}
                    onClick={() => apply({ view: "grid" }, false)}
                    className={`grid h-9 w-9 place-items-center border-l border-line ${state.view === "grid" ? "bg-accent-soft text-accent-deep" : "text-ink-soft hover:bg-paper-2"}`}
                  >
                    <LayoutGridIcon aria-hidden size={16} />
                  </button>
                </div>
                {pageNav && (
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="Previous page" disabled={state.page <= 0} onClick={() => apply({ page: state.page - 1 })} className="grid h-9 w-9 place-items-center rounded-lg border border-line hover:bg-paper-2 disabled:opacity-40">
                      {"‹"}
                    </button>
                    <button type="button" aria-label="Next page" disabled={to >= total} onClick={() => apply({ page: state.page + 1 })} className="grid h-9 w-9 place-items-center rounded-lg border border-line hover:bg-paper-2 disabled:opacity-40">
                      {"›"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {list.status === "loading" && <TableSkeleton count={6} columns={5} label="Loading resumes" />}
            {list.status === "error" && <ErrorState what="the resumes" description={list.message} onRetry={() => void loadList(state, false)} />}
            {list.status === "ok" && rows.length > 0 && (
              <>
                <ResumesTable
                  rows={rows}
                  selected={selected}
                  onToggle={toggle}
                  onTogglePage={togglePage}
                  openId={openId}
                  onOpen={(r) => apply({ open: r.id }, false)}
                  rowMenu={rowMenu}
                  sort={state.sort}
                  onSort={(k) => apply({ sort: nextSort(state.sort, k) })}
                  compact={docked}
                  view={state.view}
                />
                <Pagination page={state.page} size={state.size} total={total} shown={rows.length} onPage={(page) => apply({ page }, false)} onSize={(size) => apply({ size })} />
              </>
            )}
            {list.status === "ok" && rows.length === 0 && (
              <EmptyState
                variant="inline"
                title={active ? "No resumes match" : state.tab === "pending" ? "Nothing is waiting for approval" : state.tab === "recent" ? "No recent updates" : "No resumes yet"}
                description={
                  active
                    ? "Try a different search, or clear the filters to see everything in your view."
                    : state.tab === "pending"
                      ? "Resumes prepared for a consultant show up here until someone approves them."
                      : state.tab === "recent"
                        ? "Resumes changed in the last 30 days show up here."
                        : "Resumes appear here once they are added for the consultants in your view."
                }
                action={
                  active ? (
                    <Button type="button" onClick={clearAll}>
                      Clear filters
                    </Button>
                  ) : canUpload && state.tab === "all" ? (
                    <Button type="button" variant="accent" onClick={() => setUploadOpen(true)}>
                      <UploadIcon aria-hidden size={15} /> Upload Resume
                    </Button>
                  ) : undefined
                }
              />
            )}
          </section>
        </div>

        <ResumeDrawer
          orgId={orgId}
          resumeId={openId}
          mode={mode}
          onClose={() => apply({ open: null }, false)}
          onChanged={onChanged}
          reloadToken={reloadToken}
        />
      </div>

      <UploadResumeDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        orgId={orgId}
        onCreated={(d) => {
          setUploadOpen(false);
          toast({ title: `${d.row.name} was added`, description: "It is pending approval.", variant: "success", duration: UNDO_MS });
          refresh();
          apply({ open: d.row.id }, false);
        }}
      />
    </div>
  );
}

