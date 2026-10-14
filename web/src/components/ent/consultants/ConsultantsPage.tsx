"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, ErrorState, FilterBar, FilterIcon, PlusIcon, ReasonSheet, Select, TableSkeleton, UsersIcon, useMediaQuery, useNarrow, useToast } from "@kiwiply/ui";
import type { MenuEntry, ReasonSpec } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  AVAILABILITY_OPTIONS,
  bulkSummary,
  consultantsApi,
  DEFAULT_QUERY,
  errorSentence,
  LICENSE_OPTIONS,
  newKey,
  nextSort,
  paramsFromState,
  stateFromParams,
  undoPlan,
  WORK_MODE_OPTIONS,
  type Availability,
  type BulkResult,
  type ConsultantCounts,
  type ConsultantDetail,
  type ConsultantRow,
  type DetailTab,
  type Filters,
  type JobOption,
  type PageState,
  type PatchBody,
  type UndoPlan,
} from "@/lib/ent/consultants";
import { AddConsultantDialog, ApplicationDialog, BulkAvailabilityDialog, DepartmentDialog, LicenseDialog, MarketerDialog, type Outcome } from "./Dialogs";
import DetailSheet, { type FlowKind } from "./DetailSheet";
import { ConsultantsTable, Pagination } from "./ConsultantsTable";
import HelpBeeCard from "./HelpBeeCard";
import KpiTiles from "./KpiTiles";

const WIDE_QUERY = "(min-width: 1400px)"; // config-literal-ok: the width at which the drawer docks beside the table instead of floating over it
const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered (UI timing)
const UNDO_DEACTIVATE_REASON = "Undo: deactivated by mistake";

export interface ConsultantsPageProps {
  orgId: number;
  orgName: string;
  /** `me.permissions` of the tenant session: decides which buttons are drawn (the API is the gate). */
  permissions: Record<string, string>;
  supportEmail?: string | null;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: ConsultantRow[]; total: number };

/** The flow a dialog is open for: a row (name and current marketer known) or the open drawer (the whole detail known). */
type Flow = { kind: FlowKind; id: number; name: string; marketerId: number | null; detail: ConsultantDetail | null } | null;

export default function ConsultantsPage({ orgId, orgName, permissions, supportEmail }: ConsultantsPageProps) {
  const toast = useToast();
  const narrow = useNarrow();
  const wide = useMediaQuery(WIDE_QUERY, false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const can = useCallback((k: string) => Object.prototype.hasOwnProperty.call(permissions, k), [permissions]);

  /* ── URL state: the address is the source of truth ─────────────────────────────── */

  const paramsText = searchParams.toString();
  const state = useMemo(() => stateFromParams(new URLSearchParams(paramsText)), [paramsText]);
  const stateRef = useRef<PageState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const update = useCallback(
    (patch: Partial<PageState> | ((s: PageState) => PageState)) => {
      const next = typeof patch === "function" ? patch(stateRef.current) : { ...stateRef.current, ...patch };
      stateRef.current = next;
      const qs = paramsFromState(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  const { query } = state;
  const changeQuery = useCallback((c: Partial<typeof DEFAULT_QUERY>) => update((s) => ({ ...s, query: { ...s.query, ...c, page: c.page ?? 0 } })), [update]);

  /* ── data ─────────────────────────────────────────────────────────────────────── */

  const [list, setList] = useState<ListState>({ status: "loading" });
  const [counts, setCounts] = useState<{ status: "loading" | "ok" | "error"; data: ConsultantCounts | null }>({ status: "loading", data: null });
  const [filters, setFilters] = useState<Filters>({ skills: [], marketers: [], departments: [] });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reloadToken, setReloadToken] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [flow, setFlow] = useState<Flow>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkDialog, setBulkDialog] = useState<"availability" | "marketer" | null>(null);
  const [bulkDeactivate, setBulkDeactivate] = useState(false);
  const [jobs, setJobs] = useState<{ loading: boolean; items: JobOption[] }>({ loading: false, items: [] });
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const queryRef = useRef(query);
  const addKey = useRef(newKey());
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const queryKey = JSON.stringify(query);
  const loadList = useCallback(
    async (q: typeof DEFAULT_QUERY, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setList({ status: "loading" });
      const r = await consultantsApi.list(orgId, q);
      if (mine !== seq.current) return;
      if (r.ok) setList({ status: "ok", items: r.data.items, total: r.data.total });
      else setList({ status: "error", message: errorSentence(r) });
    },
    [orgId],
  );
  const loadCounts = useCallback(async () => {
    const r = await consultantsApi.counts(orgId);
    setCounts(r.ok ? { status: "ok", data: r.data } : (c) => ({ status: "error", data: c.data }));
  }, [orgId]);
  const loadFilters = useCallback(async () => {
    const r = await consultantsApi.filters(orgId);
    if (r.ok) setFilters(r.data);
  }, [orgId]);

  useEffect(() => {
    void loadList(queryRef.current, false);
    // the page re-asks whenever the address changes the query (queryKey is the query, serialised)
  }, [queryKey, loadList]);
  useEffect(() => {
    void loadCounts();
    void loadFilters();
  }, [loadCounts, loadFilters]);

  const refresh = useCallback(() => {
    void loadList(queryRef.current, true);
    void loadCounts();
    void loadFilters();
    setReloadToken((n) => n + 1);
  }, [loadList, loadCounts, loadFilters]);

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

  /* ── filters ──────────────────────────────────────────────────────────────────── */

  const filterValues = { availability: query.availability, skill: query.skill, license: query.license, marketer: query.marketerId };
  const onFilter = (name: string, value: string) => {
    const key = name === "marketer" ? "marketerId" : name;
    changeQuery({ [key]: value } as Partial<typeof DEFAULT_QUERY>);
  };
  const filtersActive = query.q.trim().length >= 2 || !!(query.availability || query.skill || query.license || query.marketerId || query.workMode || query.status);
  const clearAll = () => changeQuery({ q: "", availability: "", skill: "", license: "", marketerId: "", workMode: "", status: "" });

  /* ── selection ────────────────────────────────────────────────────────────────── */

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

  /* ── undo and bulk ────────────────────────────────────────────────────────────── */

  const applyUndo = useCallback(
    async (plans: UndoPlan[]) => {
      let failed = 0;
      for (const p of plans) {
        let ok = true;
        if (p.kind === "availability") ok = (await consultantsApi.bulk(orgId, "availability", { ids: p.ids, availability: p.availability })).ok;
        else if (p.kind === "marketer") ok = (await consultantsApi.bulk(orgId, "marketer", { ids: p.ids, marketerMemberId: p.marketerMemberId })).ok;
        else ok = (await consultantsApi.bulk(orgId, "status", { ids: p.ids, action: p.action, reason: p.action === "DEACTIVATE" ? UNDO_DEACTIVATE_REASON : undefined })).ok;
        if (!ok) failed++;
      }
      toast(failed === 0 ? { title: "Undone", variant: "success" } : { title: "Couldn't undo everything", description: "Some changes could not be put back. Reload to see where things stand.", variant: "error" });
      refresh();
    },
    [orgId, toast, refresh],
  );

  const announce = useCallback(
    (kind: UndoPlan["kind"], res: BulkResult, verb: string) => {
      const sum = bulkSummary(res, verb);
      const plans = undoPlan(kind, res.results);
      toast({ ...sum, duration: UNDO_MS, action: plans.length > 0 ? { label: "Undo", onClick: () => void applyUndo(plans) } : undefined });
      setSelected(new Set());
      refresh();
    },
    [toast, applyUndo, refresh],
  );

  async function runBulk(kind: "availability" | "marketer" | "status", body: Record<string, unknown>, verb: string): Promise<Outcome> {
    const r = await consultantsApi.bulk(orgId, kind, { ids: [...selected], ...body });
    if (!r.ok) return { ok: false, error: errorSentence(r) };
    announce(kind, r.data, verb);
    return { ok: true };
  }

  const bulkDeactivateSpec = useMemo<ReasonSpec | null>(
    () =>
      bulkDeactivate
        ? {
            title: `Deactivate ${selected.size} ${selected.size === 1 ? "consultant" : "consultants"}?`,
            body: <>They leave the directory and the figures above. Their records are kept and you can undo this or reactivate them any time.</>,
            confirmLabel: "Deactivate",
            run: async (reason) => {
              const o = await runBulk("status", { action: "DEACTIVATE", reason }, "deactivated");
              return o.ok ? { ok: true } : { ok: false, error: o.error };
            },
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bulkDeactivate, selected],
  );

  /* ── single-consultant flows ──────────────────────────────────────────────────── */

  /** A PATCH from a dialog: on a stale version it reloads the consultant and sends the same change once more. */
  const patchFrom = useCallback(
    async (id: number, body: PatchBody, version: string): Promise<Outcome> => {
      let r = await consultantsApi.patch(orgId, id, body, version);
      if (!r.ok && (r.status === 412 || r.status === 428)) {
        const fresh = await consultantsApi.detail(orgId, id);
        if (fresh.ok) r = await consultantsApi.patch(orgId, id, body, fresh.data.version);
      }
      if (!r.ok) return { ok: false, error: errorSentence(r) };
      refresh();
      return { ok: true };
    },
    [orgId, refresh],
  );

  const reactivate = useCallback(
    async (id: number, name: string) => {
      const r = await consultantsApi.reactivate(orgId, id);
      if (!r.ok) {
        toast({ title: `Couldn't reactivate ${name}`, description: errorSentence(r), variant: "error" });
        return;
      }
      toast({
        title: `${name} is active again`,
        variant: "success",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void consultantsApi.deactivate(orgId, id, UNDO_DEACTIVATE_REASON).then((u) => {
              toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
              refresh();
            }),
        },
      });
      refresh();
    },
    [orgId, toast, refresh],
  );

  const deactivateSpec = useMemo<ReasonSpec | null>(
    () =>
      flow && flow.kind === "deactivate"
        ? {
            title: `Deactivate ${flow.name}?`,
            body: <>They leave the directory and the figures above. Their records are kept and you can undo this or reactivate them any time.</>,
            confirmLabel: "Deactivate",
            run: async (reason) => {
              const r = await consultantsApi.deactivate(orgId, flow.id, reason);
              if (!r.ok) return { ok: false, error: errorSentence(r) };
              toast({ title: `${flow.name} is deactivated`, variant: "success", duration: UNDO_MS, action: { label: "Undo", onClick: () => void reactivate(flow.id, flow.name) } });
              refresh();
              return { ok: true };
            },
          }
        : null,
    [flow, orgId, toast, reactivate, refresh],
  );

  const startFlow = useCallback(
    (kind: FlowKind, id: number, name: string, marketerId: number | null, detail: ConsultantDetail | null) => {
      if (kind === "reactivate") {
        void reactivate(id, name);
        return;
      }
      setFlow({ kind, id, name, marketerId, detail });
      if (kind === "application") {
        setJobs({ loading: true, items: [] });
        void consultantsApi.jobOptions(orgId, id).then((r) => setJobs({ loading: false, items: r.ok ? r.data : [] }));
      }
    },
    [orgId, reactivate],
  );

  const assignOne = useCallback(
    async (f: NonNullable<Flow>, marketerMemberId: number): Promise<Outcome> => {
      const r = await consultantsApi.assignMarketer(orgId, f.id, { marketerMemberId });
      if (!r.ok) return { ok: false, error: errorSentence(r) };
      const who = r.data.assignment?.marketer.name ?? "the marketer";
      const back = f.marketerId;
      toast({
        title: `${who} now markets ${f.name}`,
        variant: "success",
        duration: UNDO_MS,
        action:
          back !== null
            ? {
                label: "Undo",
                onClick: () =>
                  void consultantsApi.assignMarketer(orgId, f.id, { marketerMemberId: back }).then((u) => {
                    toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
                    refresh();
                  }),
              }
            : undefined,
      });
      refresh();
      return { ok: true };
    },
    [orgId, toast, refresh],
  );

  async function createConsultant(body: Parameters<typeof consultantsApi.create>[1]): Promise<Outcome> {
    const r = await consultantsApi.create(orgId, body, addKey.current);
    if (!r.ok) return { ok: false, error: errorSentence(r) };
    addKey.current = newKey();
    const created = r.data.consultant;
    toast({
      title: `${created.name} was added`,
      variant: "success",
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () =>
          void consultantsApi.deactivate(orgId, created.id, "Undo: added by mistake").then((u) => {
            toast(u.ok ? { title: "Undone", description: "They were deactivated, not erased.", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
            refresh();
          }),
      },
    });
    update((s) => ({ ...s, selected: created.id, tab: "overview" }));
    refresh();
    return { ok: true };
  }

  /* ── drawer ───────────────────────────────────────────────────────────────────── */

  const openRow = (row: ConsultantRow, t: DetailTab = "overview") => update((s) => ({ ...s, selected: row.id, tab: t }));
  const closeDrawer = () => update((s) => ({ ...s, selected: null, tab: "overview" }));
  const onSaved = useCallback((d: ConsultantDetail) => {
    setList((l) => (l.status === "ok" ? { ...l, items: l.items.map((r) => (r.id === d.consultant.id ? d.consultant : r)) } : l));
    void loadCounts();
  }, [loadCounts]);

  const canEdit = can("consultants.edit");
  const canAssign = can("assignments.manage");
  const rowMenu = (row: ConsultantRow): MenuEntry[] => {
    const items: MenuEntry[] = [{ label: "View details", onSelect: () => openRow(row) }];
    if (row.status === "ACTIVE" && canAssign) items.push({ label: "Assign marketer", onSelect: () => startFlow("marketer", row.id, row.name, row.marketer?.memberId ?? null, null) });
    if (row.status === "ACTIVE" && canEdit) items.push({ separator: true }, { label: "Deactivate", onSelect: () => startFlow("deactivate", row.id, row.name, null, null), danger: true });
    if (row.status === "INACTIVE" && canEdit) items.push({ label: "Reactivate", onSelect: () => startFlow("reactivate", row.id, row.name, null, null) });
    return items;
  };

  const mode = narrow ? "sheet" : wide ? "push" : "overlay";
  const drawerOpen = state.selected !== null;
  const total = list.status === "ok" ? list.total : 0;
  const sortOptions = [
    { value: "name,asc", label: "Name A to Z" },
    { value: "name,desc", label: "Name Z to A" },
    { value: "joined,desc", label: "Newest first" },
    { value: "experience,desc", label: "Most experience" },
    { value: "profile,desc", label: "Profile, most complete" },
  ];
  const filterDefs = [
    { name: "availability", label: "Availability", allLabel: "All Availability", options: AVAILABILITY_OPTIONS },
    { name: "skill", label: "Skills", allLabel: "All Skills", options: filters.skills.map((s) => ({ value: s, label: s })) },
    { name: "license", label: "License Status", allLabel: "All License Status", options: LICENSE_OPTIONS },
    { name: "marketer", label: "Marketers", allLabel: "All Marketers", options: [{ value: "none", label: "Unassigned" }, ...filters.marketers.map((m) => ({ value: String(m.memberId), label: m.name }))] },
  ];
  const moreCount = (query.workMode ? 1 : 0) + (query.status ? 1 : 0);
  const helpCard = <HelpBeeCard orgName={orgName} supportEmail={supportEmail} compact={drawerOpen && mode === "push"} />;

  return (
    <div ref={root} data-consultants-page>
      <PageHeader title="Consultants" subtitle="Manage your consultant network, track availability, assignments, and performance." />
      <div className="flex items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <KpiTiles compact={drawerOpen && mode === "push"} counts={counts.data} loading={counts.status === "loading"} error={counts.status === "error"} />

          <section aria-label="Consultant directory" className="rounded-2xl border border-line bg-paper p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="inline-grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent-deep">
                  <UsersIcon size={20} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-bold leading-tight text-ink">Consultant Directory</h2>
                  <p className="text-[12.5px] text-muted">View and manage all consultants in your organization.</p>
                </div>
              </div>
              {canEdit && (
                <Button type="button" onClick={() => setAddOpen(true)} data-add-consultant>
                  <PlusIcon size={16} aria-hidden /> Add Consultant
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <FilterBar
                className="[&>div:first-child]:!w-full [&>div:first-child]:basis-full sm:[&>div:not(:first-child):not(:last-child)]:!w-auto sm:[&>div:not(:first-child):not(:last-child)]:!flex-1"
                query={query.q}
                onQueryChange={(q) => changeQuery({ q })}
                values={filterValues}
                onFilterChange={onFilter}
                search={{ placeholder: "Search consultants by name, skills, or location...", label: "Search consultants" }}
                filters={filterDefs}
                actions={
                  <Button type="button" variant="ghost" size="sm" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} data-more-filters>
                    <FilterIcon size={15} aria-hidden /> More Filters{moreCount > 0 ? ` (${moreCount})` : ""}
                  </Button>
                }
              />
              {moreOpen && (
                <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-line bg-paper-2/40 p-2.5" data-more-filters-row>
                  <div className="w-44">
                    <Select aria-label="Work mode" value={query.workMode} onChange={(v) => changeQuery({ workMode: v })} options={[{ value: "", label: "Any work mode" }, ...WORK_MODE_OPTIONS]} />
                  </div>
                  <div className="w-44">
                    <Select
                      aria-label="Status"
                      value={query.status}
                      onChange={(v) => changeQuery({ status: v })}
                      options={[
                        { value: "", label: "Active consultants" },
                        { value: "INACTIVE", label: "Inactive consultants" },
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>

            {narrow && list.status === "ok" && rows.length > 0 && (
              <div className="mt-3 w-52">
                <Select
                  aria-label="Sort by"
                  value={`${query.sort.key},${query.sort.dir}`}
                  onChange={(v) => {
                    const [key, dir] = v.split(",");
                    changeQuery({ sort: { key: key as typeof query.sort.key, dir: dir as "asc" | "desc" } });
                  }}
                  options={sortOptions}
                />
              </div>
            )}

            {selected.size > 0 && (
              <div role="region" aria-label="Bulk actions" data-bulk-bar className="sticky top-2 z-20 my-3 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-accent bg-paper px-3 py-2 shadow-[var(--shadow)]">
                <span className="mr-1 text-[13.5px] font-semibold text-ink" aria-live="polite">
                  {selected.size} selected
                </span>
                {canEdit && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setBulkDialog("availability")}>
                    Set availability
                  </Button>
                )}
                {canAssign && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setBulkDialog("marketer")}>
                    Assign marketer
                  </Button>
                )}
                {canEdit && query.status !== "INACTIVE" && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setBulkDeactivate(true)}>
                    Deactivate
                  </Button>
                )}
                {canEdit && query.status === "INACTIVE" && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void runBulk("status", { action: "REACTIVATE" }, "reactivated")}>
                    Reactivate
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" className="ml-auto border-transparent" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              </div>
            )}

            <div className="mt-3">
              {list.status === "loading" && <TableSkeleton count={6} columns={5} label="Loading consultants" />}
              {list.status === "error" && <ErrorState what="the consultants" description={list.message} onRetry={() => void loadList(query, false)} />}
              {list.status === "ok" && rows.length > 0 && (
                <>
                  <ConsultantsTable
                    rows={rows}
                    selected={selected}
                    onToggle={toggle}
                    onTogglePage={togglePage}
                    openId={state.selected}
                    onOpen={(r) => openRow(r)}
                    rowMenu={rowMenu}
                    sort={query.sort}
                    onSort={(k) => changeQuery({ sort: nextSort(query.sort, k) })}
                    compact={drawerOpen && mode === "push"}
                  />
                  <Pagination page={query.page} size={query.size} total={total} shown={rows.length} onPage={(page) => changeQuery({ page })} onSize={(size) => changeQuery({ size })} />
                </>
              )}
              {list.status === "ok" && rows.length === 0 && (
                <EmptyState
                  variant="page"
                  mascot
                  mascotPose="peek"
                  title={filtersActive ? "No consultants match" : "No consultants yet"}
                  description={filtersActive ? "Try a different search, or clear the filters to see everyone." : "Add your first consultant to start tracking availability, licenses and assignments."}
                  action={
                    filtersActive ? (
                      <Button type="button" onClick={clearAll}>
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button type="button" onClick={() => setAddOpen(true)}>
                        <PlusIcon size={16} aria-hidden /> Add Consultant
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </div>
          </section>

          {list.status === "ok" && rows.length > 0 && !drawerOpen && helpCard}
        </div>

        <DetailSheet
          orgId={orgId}
          consultantId={state.selected}
          mode={mode}
          onClose={closeDrawer}
          onSaved={onSaved}
          onFlow={(k, d) => startFlow(k, d.consultant.id, d.consultant.name, d.assignment?.marketer.memberId ?? null, d)}
          reloadToken={reloadToken}
          tab={state.tab}
          onTab={(t) => update((s) => ({ ...s, tab: t }))}
          footer={helpCard}
        />
      </div>

      <AddConsultantDialog open={addOpen} onClose={() => setAddOpen(false)} departments={filters.departments} onCreate={createConsultant} />
      <MarketerDialog
        open={flow?.kind === "marketer"}
        onClose={() => setFlow(null)}
        subject={flow?.name ?? "this consultant"}
        marketers={filters.marketers}
        currentId={flow?.marketerId}
        onApply={(id) => (flow ? assignOne(flow, id) : Promise.resolve({ ok: false, error: "Nothing selected." }))}
      />
      <LicenseDialog
        open={flow?.kind === "license"}
        onClose={() => setFlow(null)}
        detail={flow?.detail ?? null}
        onApply={(body) => (flow?.detail ? patchFrom(flow.id, body, flow.detail.version) : Promise.resolve({ ok: false, error: "Nothing selected." }))}
      />
      <DepartmentDialog
        open={flow?.kind === "department"}
        onClose={() => setFlow(null)}
        detail={flow?.detail ?? null}
        departments={filters.departments}
        onApply={(departmentGroupId) => (flow?.detail ? patchFrom(flow.id, { departmentGroupId }, flow.detail.version) : Promise.resolve({ ok: false, error: "Nothing selected." }))}
      />
      <ApplicationDialog
        open={flow?.kind === "application"}
        onClose={() => setFlow(null)}
        subject={flow?.name ?? "this consultant"}
        jobs={jobs.items}
        loading={jobs.loading}
        onApply={async (requirementId) => {
          if (!flow) return { ok: false, error: "Nothing selected." };
          const r = await consultantsApi.createApplication(orgId, flow.id, requirementId);
          if (!r.ok) return { ok: false, error: errorSentence(r) };
          toast({ title: `Application ${r.data.code} created`, description: `${flow.name}'s application starts as Assigned.`, variant: "success" });
          refresh();
          return { ok: true };
        }}
      />
      <BulkAvailabilityDialog open={bulkDialog === "availability"} onClose={() => setBulkDialog(null)} count={selected.size} onApply={(a: Availability) => runBulk("availability", { availability: a }, "updated")} />
      <MarketerDialog
        open={bulkDialog === "marketer"}
        onClose={() => setBulkDialog(null)}
        subject={`${selected.size} ${selected.size === 1 ? "consultant" : "consultants"}`}
        marketers={filters.marketers}
        onApply={(id) => runBulk("marketer", { marketerMemberId: id }, "assigned")}
      />
      <ReasonSheet spec={deactivateSpec} onClose={() => setFlow(null)} />
      <ReasonSheet spec={bulkDeactivateSpec} onClose={() => setBulkDeactivate(false)} />
    </div>
  );
}
