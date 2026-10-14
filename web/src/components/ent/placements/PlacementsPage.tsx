"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BottomSheet,
  Button,
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EmptyState,
  ErrorState,
  FilterIcon,
  Field,
  GridIcon,
  Input,
  ListIcon,
  PlusIcon,
  Popover,
  RefreshIcon,
  Select,
  SideSheet,
  Tab,
  TabList,
  Tabs,
  TableSkeleton,
  UsersIcon,
  useMediaQuery,
  useNarrow,
  useToast,
} from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import "./placements.css";
import {
  DEFAULT_VIEW,
  defaultSort,
  errorSentence,
  filtersActive,
  moreFiltersActive,
  parseView,
  placementsApi,
  showingText,
  SORT_CHOICES,
  viewParams,
  type Counts,
  type DetailTab,
  type FilterOptions,
  type MainTab,
  type PlacementDetail,
  type PlacementRow,
  type ViewState,
} from "@/lib/ent/placements";
import AddPlacementDialog from "./AddPlacementDialog";
import DetailPanel from "./DetailPanel";
import type { ExtensionMode } from "./ExtensionDialog";
import HelpCard from "./HelpCard";
import { usePlacementAction } from "./hooks";
import KpiTiles from "./KpiTiles";
import { SearchBox } from "./parts";
import { Pagination, PlacementsTable } from "./PlacementsTable";

const WIDE_QUERY = "(min-width: 1280px)"; // config-literal-ok: the width at which the drawer docks in the right column instead of floating over the page

export interface PlacementsPageProps {
  orgId: number;
  orgName: string;
  workspace: string;
  /** `me.permissions` of the tenant session: decides which controls are drawn (the API is the gate). */
  permissions: Record<string, string>;
  /** Menu hrefs of the pages a consultant / client link leads to; null when the member's menu does not list them. */
  consultantsHref: string | null;
  clientsHref: string | null;
  supportEmail?: string | null;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: PlacementRow[]; total: number };

const TAB = "!px-4 !py-3 !text-[12.5px] !font-medium !text-[color:var(--pl-body)] aria-selected:!font-semibold aria-selected:!border-accent aria-selected:!text-accent-deep";
const FIELD = "!h-[33px] !min-h-0 !rounded-lg !border-[color:var(--pl-input-line)] !bg-white !py-0 !pl-2.5 !pr-6 !text-[11.5px] !font-normal !text-[color:var(--pl-body)]";

export default function PlacementsPage({ orgId, permissions, consultantsHref, clientsHref }: PlacementsPageProps) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const narrow = useNarrow();
  const wide = useMediaQuery(WIDE_QUERY, false);
  const can = useCallback((k: string) => Object.prototype.hasOwnProperty.call(permissions, k), [permissions]);
  const canManage = can("placements.manage");
  const showRates = can("placements.manage") || can("finance.view");

  /* ── the view lives in the URL ───────────────────────────────────────────────── */
  const view = useMemo(() => parseView(new URLSearchParams(search?.toString() ?? "")), [search]);
  const viewRef = useRef<ViewState>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const setView = useCallback(
    (patch: Partial<ViewState>, resetPage = true) => {
      const next: ViewState = { ...viewRef.current, ...patch };
      if (resetPage && patch.page === undefined) next.page = 0;
      viewRef.current = next;
      const qs = viewParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const [list, setList] = useState<ListState>({ status: "loading" });
  const [counts, setCounts] = useState<{ status: "loading" | "ok" | "error"; data: Counts | null }>({ status: "loading", data: null });
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [adding, setAdding] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const [intent, setIntent] = useState<{ id: number; mode: ExtensionMode } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const autoOpened = useRef(false);

  /* ── data ────────────────────────────────────────────────────────────────────── */

  const listKey = JSON.stringify([view.tab, view.q, view.client, view.role, view.status, view.manager, view.type, view.startFrom, view.startTo, view.endFrom, view.endTo, view.sort, view.page, view.size]);

  const loadList = useCallback(
    async (v: ViewState, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setList({ status: "loading" });
      const r = await placementsApi.list(orgId, v);
      if (mine !== seq.current) return;
      setList(r.ok ? { status: "ok", items: r.data.items, total: r.data.total } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadCounts = useCallback(async () => {
    const r = await placementsApi.counts(orgId);
    setCounts(r.ok ? { status: "ok", data: r.data } : (c) => ({ status: "error", data: c.data }));
  }, [orgId]);

  useEffect(() => {
    setChecked(new Set());
    void loadList(viewRef.current, false);
  }, [listKey, loadList]);

  useEffect(() => {
    void loadCounts();
    void placementsApi.filters(orgId).then((r) => setOptions(r.ok ? r.data : null));
  }, [orgId, loadCounts]);

  /** After any change: the visible list, the tiles and the open drawer reload quietly. */
  const refresh = useCallback(() => {
    void loadList(viewRef.current, true);
    void loadCounts();
    setReloadToken((n) => n + 1);
  }, [loadList, loadCounts]);

  const onChanged = useCallback(
    (d: PlacementDetail) => {
      setList((l) =>
        l.status === "ok"
          ? { ...l, items: l.items.map((r) => (r.id === d.id ? { ...r, endDate: d.endDate, status: d.status, nextAction: d.nextAction, inPool: d.availability.inPool, extensionPending: d.extensionPending } : r)) }
          : l,
      );
      refresh();
    },
    [refresh],
  );

  const act = usePlacementAction(orgId, onChanged);

  /* ── "/" jumps to the search box ─────────────────────────────────────────────── */
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

  /* ── rows ────────────────────────────────────────────────────────────────────── */

  const rows = list.status === "ok" ? list.items : [];
  const total = list.status === "ok" ? list.total : 0;
  const mode = narrow ? "sheet" : wide ? "docked" : "overlay";
  const drawerOpen = view.selected !== null;

  /** On a wide screen the board opens with its first row selected, as the board does; closing it keeps it closed. */
  useEffect(() => {
    if (autoOpened.current || !wide || list.status !== "ok") return;
    autoOpened.current = true;
    if (viewRef.current.selected === null && list.items.length > 0) setView({ selected: list.items[0].id, detailTab: "overview" }, false);
  }, [wide, list, setView]);

  const openRow = useCallback((row: { id: number }, t: DetailTab = "overview") => setView({ selected: row.id, detailTab: t }, false), [setView]);
  const closeDrawer = useCallback(() => {
    autoOpened.current = true;
    setView({ selected: null, detailTab: DEFAULT_VIEW.detailTab }, false);
  }, [setView]);

  const rowMenu = (row: PlacementRow): MenuEntry[] => {
    const items: MenuEntry[] = [{ label: "View details", onSelect: () => openRow(row) }];
    if (canManage && row.status !== "ENDED") {
      items.push({
        label: "Extend placement…",
        onSelect: () => {
          setIntent({ id: row.id, mode: "extend" });
          openRow(row);
        },
      });
      if (!row.extensionPending) {
        items.push({
          label: "Request extension…",
          onSelect: () => {
            setIntent({ id: row.id, mode: "request" });
            openRow(row);
          },
        });
      }
      if (row.status === "ACTIVE") {
        items.push({
          label: "Mark complete",
          onSelect: () => void act(row.id, { title: "Marked complete", description: `${row.consultant.name}'s placement at ${row.client.name} is complete.` }, () => placementsApi.complete(orgId, row.id)),
        });
      }
    }
    if (canManage && !row.inPool) {
      items.push({
        label: "Start redeployment",
        onSelect: () => void act(row.id, { title: "Redeployment started", description: `${row.consultant.name} is now in the redeployment pool.` }, () => placementsApi.redeploy(orgId, row.id)),
      });
    }
    items.push({ label: "Add note", onSelect: () => openRow(row, "notes") }, { separator: true });
    items.push({
      label: "Copy placement ID",
      onSelect: () => {
        const id = `PL-${row.id}`;
        void navigator.clipboard?.writeText(id).then(
          () => toast({ title: "Copied", description: id, variant: "success" }),
          () => toast({ title: "Couldn't copy", description: id, variant: "error" }),
        );
      },
    });
    return items;
  };

  /* ── filters ─────────────────────────────────────────────────────────────────── */

  const active = filtersActive(view);
  const clearAll = () => setView({ q: "", client: "", role: "", status: "", manager: "", type: "", startFrom: "", startTo: "", endFrom: "", endTo: "" });
  const tabs = counts.data?.tabs;
  const tabLabel = (label: string, n: number | undefined) => (n === undefined ? label : `${label} (${n.toLocaleString("en-US")})`);
  const sortValue = `${view.sort.key},${view.sort.dir}`;
  const sortOptions = SORT_CHOICES.some((c) => c.value === sortValue) ? SORT_CHOICES : [...SORT_CHOICES, { value: sortValue, label: sortValue, key: view.sort.key, dir: view.sort.dir }];
  const pages = Math.max(1, Math.ceil(total / view.size));
  const moreCount = moreFiltersActive(view);
  const noneAtAll = list.status === "ok" && total === 0 && !active && view.tab === "active" && (counts.data?.tabs.completed ?? 0) + (counts.data?.tabs.upcoming ?? 0) === 0;

  const onTab = (t: MainTab) => {
    const wasDefault = view.sort.key === defaultSort(view.tab).key && view.sort.dir === defaultSort(view.tab).dir;
    setView({ tab: t, page: 0, ...(wasDefault ? { sort: defaultSort(t) } : {}) }, false);
  };

  const panel = (docked: boolean): ReactNode =>
    view.selected === null ? null : (
      <DetailPanel
        orgId={orgId}
        placementId={view.selected}
        tab={view.detailTab}
        onTab={(t) => setView({ detailTab: t }, false)}
        onClose={docked ? closeDrawer : undefined}
        onChanged={onChanged}
        reloadToken={reloadToken}
        consultantsHref={consultantsHref}
        clientsHref={clientsHref}
        intent={intent && intent.id === view.selected ? intent.mode : null}
        onIntentHandled={() => setIntent(null)}
      />
    );

  const tabIcon = (icon: ReactNode, label: string) => (
    <span className="inline-flex items-center gap-2">
      {icon} {label}
    </span>
  );

  return (
    <div ref={root} data-placements-page>
      <PageHeader title="Placements" subtitle="Track consultant placements, assignments, and redeployment readiness across your organization." />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_296px]">
        <div className="min-w-0 space-y-4">
          <KpiTiles counts={counts.data} loading={counts.status === "loading"} error={counts.status === "error"} />

          <section aria-label="Placements" className="ent-card px-4 pb-4 pt-1.5" data-placements-card>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Tabs value={view.tab} onValueChange={(t) => onTab(t as MainTab)} variant="underline" className="min-w-0 flex-1">
                <TabList aria-label="Placement views" className="!gap-3 !border-[color:var(--pl-track)]">
                  <Tab value="active" className={TAB}>{tabIcon(<UsersIcon size={18} aria-hidden />, tabLabel("Active", tabs?.active))}</Tab>
                  <Tab value="upcoming" className={TAB}>{tabIcon(<CalendarIcon size={18} aria-hidden />, tabLabel("Upcoming", tabs?.upcoming))}</Tab>
                  <Tab value="completed" className={TAB}>{tabIcon(<CheckCircleIcon size={18} aria-hidden />, tabLabel("Completed", tabs?.completed))}</Tab>
                  <Tab value="extensions" className={TAB}>{tabIcon(<RefreshIcon size={18} aria-hidden />, tabLabel("Extensions", tabs?.extensions))}</Tab>
                </TabList>
              </Tabs>
              {canManage && (
                <Button type="button" variant="accent" onClick={() => setAdding(true)} data-add-placement className="!h-[33px] flex-none !rounded-lg !px-4 !py-0 !text-[11.5px]">
                  <PlusIcon size={15} aria-hidden /> Add Placement
                </Button>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <SearchBox value={view.q} onChange={(q) => setView({ q })} label="Search placements" placeholder="Search placements by consultant, client, role, or skills…" />
              <div className="w-[108px] flex-none">
                <Select aria-label="Client" value={view.client} onChange={(v) => setView({ client: v })} options={[{ value: "", label: "All Clients" }, ...(options?.clients ?? [])]} className={FIELD} />
              </div>
              <div className="w-[108px] flex-none">
                <Select aria-label="Role" value={view.role} onChange={(v) => setView({ role: v })} options={[{ value: "", label: "All Roles" }, ...(options?.roles ?? [])]} className={FIELD} />
              </div>
              <div className="w-[108px] flex-none">
                <Select aria-label="Status" value={view.status} onChange={(v) => setView({ status: v })} options={[{ value: "", label: "All Statuses" }, ...(options?.statuses ?? [])]} className={FIELD} />
              </div>
              <Popover
                label="More filters"
                align="end"
                panelClassName="w-[19rem] p-3.5"
                trigger={(t) => (
                  <button
                    type="button"
                    ref={t.ref}
                    {...t.props}
                    data-more-filters
                    className="inline-flex h-[33px] w-[122px] flex-none items-center justify-center gap-2 rounded-lg border border-[color:var(--pl-input-line)] bg-white px-3 text-[11.5px] font-medium text-[color:var(--pl-body)] hover:bg-[color:var(--ent-field-bg)]"
                  >
                    <FilterIcon size={15} aria-hidden /> More Filters{moreCount > 0 && <span className="ml-0.5 rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent">{moreCount}</span>}
                  </button>
                )}
              >
                <div className="space-y-3" data-more-filters-panel>
                  <Field label="Account manager">
                    <Select aria-label="Account manager" value={view.manager} onChange={(v) => setView({ manager: v })} options={[{ value: "", label: "Anyone" }, ...(options?.managers ?? [])]} />
                  </Field>
                  <Field label="Placement type">
                    <Select aria-label="Placement type" value={view.type} onChange={(v) => setView({ type: v })} options={[{ value: "", label: "Any type" }, ...(options?.types ?? [])]} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Starts from">
                      <Input type="date" value={view.startFrom} max={view.startTo || undefined} onChange={(e) => setView({ startFrom: e.target.value })} aria-label="Starts from" />
                    </Field>
                    <Field label="Starts to">
                      <Input type="date" value={view.startTo} min={view.startFrom || undefined} onChange={(e) => setView({ startTo: e.target.value })} aria-label="Starts to" />
                    </Field>
                    <Field label="Ends from">
                      <Input type="date" value={view.endFrom} max={view.endTo || undefined} onChange={(e) => setView({ endFrom: e.target.value })} aria-label="Ends from" />
                    </Field>
                    <Field label="Ends to">
                      <Input type="date" value={view.endTo} min={view.endFrom || undefined} onChange={(e) => setView({ endTo: e.target.value })} aria-label="Ends to" />
                    </Field>
                  </div>
                  {moreCount > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setView({ manager: "", type: "", startFrom: "", startTo: "", endFrom: "", endTo: "" })}>
                      Clear these filters
                    </Button>
                  )}
                </div>
              </Popover>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p aria-live="polite" className="text-[11.5px] text-[color:var(--pl-body)]" data-showing-top>
                {showingText(total, view.page, view.size, rows.length, view.tab)}
                {checked.size > 0 && (
                  <>
                    {" · "}
                    <span data-selected-count>{checked.size} selected</span>
                    {" · "}
                    <button type="button" onClick={() => setChecked(new Set())} className="font-semibold text-accent-deep hover:underline">
                      Clear
                    </button>
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex h-[33px] items-center rounded-lg border border-[color:var(--pl-input-line)] bg-white pl-3">
                  <span className="text-[11.5px] text-[color:var(--pl-soft)]">Sort by:</span>
                  <div className="w-[9.6rem]">
                    <Select
                      aria-label="Sort by"
                      value={sortValue}
                      onChange={(v) => {
                        const [key, dir] = v.split(",");
                        setView({ sort: { key: key as ViewState["sort"]["key"], dir: dir as ViewState["sort"]["dir"] } });
                      }}
                      options={sortOptions.map((c) => ({ value: c.value, label: c.label }))}
                      className="!h-[31px] !min-h-0 !border-0 !bg-transparent !py-0 !pl-1.5 !pr-7 !text-[11.5px] !font-normal !text-[color:var(--pl-body)] !shadow-none"
                    />
                  </div>
                </div>
                <div role="group" aria-label="View" className="inline-flex h-[33px] overflow-hidden rounded-lg border border-[color:var(--pl-input-line)] bg-white">
                  <button type="button" aria-label="List view" aria-pressed={view.mode === "list"} onClick={() => setView({ mode: "list" }, false)} className={`grid w-8 place-items-center ${view.mode === "list" ? "text-[color:var(--ent-title)]" : "text-[color:var(--pl-subtle)]"}`} data-view-toggle="list">
                    <ListIcon size={17} aria-hidden />
                  </button>
                  <button type="button" aria-label="Grid view" aria-pressed={view.mode === "grid"} onClick={() => setView({ mode: "grid" }, false)} className={`grid w-8 place-items-center ${view.mode === "grid" ? "text-[color:var(--ent-title)]" : "text-[color:var(--pl-subtle)]"}`} data-view-toggle="grid">
                    <GridIcon size={17} aria-hidden />
                  </button>
                </div>
                <div className="inline-flex gap-1.5">
                  <button type="button" aria-label="Previous page" disabled={view.page <= 0} onClick={() => setView({ page: view.page - 1 }, false)} className="grid h-[33px] w-[33px] place-items-center rounded-lg border border-[color:var(--pl-input-line)] bg-white text-[color:var(--ent-title)] disabled:text-[color:var(--pl-disabled)]">
                    <ChevronLeftIcon size={15} aria-hidden />
                  </button>
                  <button type="button" aria-label="Next page" disabled={view.page >= pages - 1} onClick={() => setView({ page: view.page + 1 }, false)} className="grid h-[33px] w-[33px] place-items-center rounded-lg border border-[color:var(--pl-input-line)] bg-white text-[color:var(--ent-title)] disabled:text-[color:var(--pl-disabled)]">
                    <ChevronRightIcon size={15} aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3">
              {list.status === "loading" && <TableSkeleton count={6} columns={6} label="Loading placements" />}
              {list.status === "error" && <ErrorState what="the placements" description={list.message} onRetry={() => void loadList(view, false)} />}
              {list.status === "ok" && rows.length > 0 && (
                <>
                  <PlacementsTable
                    rows={rows}
                    openId={view.selected}
                    onOpen={(r) => openRow(r)}
                    rowMenu={rowMenu}
                    checked={checked}
                    onCheck={(id, on) =>
                      setChecked((s) => {
                        const n = new Set(s);
                        if (on) n.add(id);
                        else n.delete(id);
                        return n;
                      })
                    }
                    onCheckAll={(on) => setChecked(on ? new Set(rows.map((r) => r.id)) : new Set())}
                    mode={view.mode}
                    showRates={showRates}
                  />
                  <Pagination page={view.page} size={view.size} total={total} shown={rows.length} onPage={(page) => setView({ page }, false)} onSize={(size) => setView({ size })} />
                </>
              )}
              {list.status === "ok" && rows.length === 0 && (
                <EmptyState
                  variant="page"
                  mascot={false}
                  title={noneAtAll ? "No placements yet" : "No placements match"}
                  description={noneAtAll ? "Placements appear here once a consultant is placed at a client." : view.tab === "extensions" && !active ? "No extension is waiting for a decision." : "Try a different search, or clear the filters to see everything."}
                  action={
                    active ? (
                      <Button type="button" onClick={clearAll}>
                        Clear filters
                      </Button>
                    ) : canManage ? (
                      <Button type="button" onClick={() => setAdding(true)}>
                        <PlusIcon size={16} aria-hidden /> Add Placement
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-3" aria-label="Help and details">
          <div className="hidden md:block">
            <HelpCard />
          </div>
          {mode === "docked" && drawerOpen && (
            <section aria-label="Placement details" className="ent-card max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-3.5" data-docked-drawer>
              {panel(true)}
            </section>
          )}
        </aside>
      </div>

      {mode === "overlay" && (
        <SideSheet id="ent-placement-sheet" side="right" mode="overlay" width={440} open={drawerOpen} onClose={closeDrawer} title="Placement" description={undefined}>
          {panel(false)}
        </SideSheet>
      )}
      {mode === "sheet" && (
        <BottomSheet id="ent-placement-sheet" open={drawerOpen} onClose={closeDrawer} title="Placement" defaultSnap="partial">
          {panel(false)}
        </BottomSheet>
      )}

      <AddPlacementDialog
        open={adding}
        onClose={() => setAdding(false)}
        orgId={orgId}
        onCreated={(d) => {
          toast({ title: "Placement added", description: `${d.consultant.name} at ${d.client.name}. Nothing was signed and no money moved.`, variant: "success" });
          refresh();
          void placementsApi.filters(orgId).then((r) => r.ok && setOptions(r.data));
          setView({ selected: d.id, detailTab: "overview" }, false);
        }}
      />
    </div>
  );
}

