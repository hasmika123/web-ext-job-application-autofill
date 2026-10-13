"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ChevronLeftIcon, ChevronRightIcon, ClockIcon, EmptyState, ErrorState, FileTextIcon, FilterIcon, GridIcon, Input, ListIcon, PlusIcon, SearchIcon, Select, Tab, TabList, Tabs, TableSkeleton, UsersIcon, BuildingIcon, useMediaQuery, useNarrow, useToast, SEARCH_DEBOUNCE_MS } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  clientsApi,
  DEFAULT_QUERY,
  errorSentence,
  hasFilters,
  MIN_SEARCH,
  parseUrl,
  showingText,
  SIZE_LABEL,
  STATUS_LABEL,
  urlParams,
  type ClientDetail,
  type ClientQuery,
  type ClientRow,
  type DrawerTab,
  type Facet,
  type FilterKey,
  type MainTab,
  type SortDir,
  type SortKey,
  type Summary,
} from "@/lib/ent/clients";
import CreateJobDialog from "@/components/ent/jobs/CreateJobDialog";
import AddClientDialog from "./AddClientDialog";
import ClientDrawer, { UNDO_MS, type ClientDrawerHrefs } from "./ClientDrawer";
import { ClientsGrid, ClientsTable, Pagination } from "./ClientsTable";
import ContactDialog from "./ContactDialog";
import HelpBeeCard from "./HelpBeeCard";
import KpiTiles from "./KpiTiles";
import { ActivityView, ContactsView, RequirementsView } from "./TabViews";

const WIDE_QUERY = "(min-width: 1400px)"; // config-literal-ok: the width at which the drawer docks beside the list instead of floating over it

export interface ClientsPageProps {
  orgId: number;
  orgName: string;
  hrefs: ClientDrawerHrefs;
  supportEmail?: string | null;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: ClientRow[]; total: number };

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "activity,desc", label: "Last Activity" },
  { value: "activity,asc", label: "Last Activity (oldest)" },
  { value: "name,asc", label: "Company A to Z" },
  { value: "industry,asc", label: "Industry A to Z" },
  { value: "requirements,desc", label: "Most open requirements" },
  { value: "consultants,desc", label: "Most active consultants" },
  { value: "manager,asc", label: "Account manager A to Z" },
  { value: "health,asc", label: "Health" },
];

const withCount = (f: Facet) => ({ value: f.value, label: `${f.label} (${f.count})` });
const labelled = (f: Facet, labels: Record<string, string>) => ({ value: f.value, label: `${labels[f.value] ?? f.label} (${f.count})` });

const TAB_PLACEHOLDER: Record<MainTab, string> = {
  directory: "Search clients by name, industry, or account manager...",
  contacts: "Search contacts by name, title, e-mail, or client...",
  requirements: "Search requirements by title, client, or location...",
  activity: "",
};

export default function ClientsPage({ orgId, orgName, hrefs, supportEmail }: ClientsPageProps) {
  const toast = useToast();
  const narrow = useNarrow();
  const wide = useMediaQuery(WIDE_QUERY, false);

  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState<ClientQuery>(DEFAULT_QUERY);
  const [openId, setOpenId] = useState<number | null>(null);
  const [dtab, setDtab] = useState<DrawerTab>("overview");
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [summary, setSummary] = useState<{ status: "loading" | "ok" | "error"; data: Summary | null }>({ status: "loading", data: null });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [contactFor, setContactFor] = useState<{ id: number; name: string } | null>(null);
  const [reqFor, setReqFor] = useState<ClientDetail | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [searchText, setSearchText] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const queryRef = useRef(query);
  const dismissed = useRef(false);
  useEffect(() => {
    queryRef.current = query;
  });

  /* ── the address is the state: read it once, then keep it in step ────────────────── */

  useEffect(() => {
    const u = parseUrl(new URLSearchParams(window.location.search));
    setQuery(u.query);
    setSearchText(u.query.q);
    setOpenId(u.openId);
    setDtab(u.dtab);
    dismissed.current = u.openId === null && new URLSearchParams(window.location.search).has("tab");
    setMoreOpen(!!(u.query.status || u.query.sizeBand || u.query.managerId));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const qs = urlParams(query, openId, dtab).toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [ready, query, openId, dtab]);

  /* ── data ─────────────────────────────────────────────────────────────────────── */

  const loadList = useCallback(
    async (q: ClientQuery, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setList({ status: "loading" });
      const r = await clientsApi.list(orgId, q);
      if (mine !== seq.current) return;
      if (r.ok) setList({ status: "ok", items: r.data.items, total: r.data.total });
      else setList({ status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadSummary = useCallback(async () => {
    const r = await clientsApi.summary(orgId);
    setSummary(r.ok ? { status: "ok", data: r.data } : (s) => ({ status: "error", data: s.data }));
  }, [orgId]);

  useEffect(() => {
    if (ready && query.tab === "directory") void loadList(query, false);
  }, [ready, query, loadList]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const refresh = useCallback(() => {
    if (queryRef.current.tab === "directory") void loadList(queryRef.current, true);
    void loadSummary();
  }, [loadList, loadSummary]);

  /* ── query changes ────────────────────────────────────────────────────────────── */

  const change = useCallback((c: Partial<ClientQuery>) => setQuery((q) => ({ ...q, ...c, page: c.page ?? 0 })), []);
  const clearAll = () => {
    setSearchText("");
    change({ q: "", industry: "", health: "", status: "", sizeBand: "", managerId: "" });
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

  const setTab = (t: MainTab) => {
    setSearchText("");
    setQuery((q) => ({ ...q, tab: t, q: "", page: 0 }));
  };

  /* ── rows and the drawer ─────────────────────────────────────────────────────── */

  const rows = list.status === "ok" ? list.items : [];
  const total = list.status === "ok" ? list.total : 0;
  const mode = narrow ? "sheet" : wide ? "push" : "overlay";

  // on a wide screen the drawer is the page's right column: show the first client until the person closes it
  useEffect(() => {
    if (!ready || mode !== "push" || openId !== null || dismissed.current || query.tab !== "directory") return;
    if (list.status === "ok" && list.items.length > 0) setOpenId(list.items[0].id);
  }, [ready, mode, openId, list, query.tab]);

  const openRow = useCallback((row: { id: number }, t: DrawerTab = "overview") => {
    dismissed.current = false;
    setOpenId(row.id);
    setDtab(t);
  }, []);
  const closeDrawer = () => {
    dismissed.current = true;
    setOpenId(null);
    setDtab("overview");
  };
  const openFromTab = (id: number) => {
    setQuery((q) => ({ ...q, tab: "directory", q: "", page: 0 }));
    setSearchText("");
    openRow({ id });
  };

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

  const copyLink = useCallback(
    async (id: number) => {
      const url = `${window.location.origin}${window.location.pathname}?client=${id}`;
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", variant: "success" });
      } catch {
        toast({ title: "Couldn't copy the link", description: url, variant: "error" });
      }
    },
    [toast],
  );

  const canManage = summary.data?.access.canManage ?? false;
  const canCreateRequirement = summary.data?.access.canCreateRequirement ?? false;

  /** Marks one client Active or Inactive from its row (the drawer's status menu does the same for the open one), with an Undo. */
  const setStatus = useCallback(
    async (row: ClientRow, status: "ACTIVE" | "INACTIVE") => {
      const d = await clientsApi.detail(orgId, row.id);
      if (!d.ok) {
        toast({ title: "Couldn't change the status", description: errorSentence(d), variant: "error" });
        return;
      }
      const r = await clientsApi.patch(orgId, row.id, { status }, d.data.version);
      if (!r.ok) {
        toast({ title: "Couldn't change the status", description: errorSentence(r), variant: "error" });
        return;
      }
      toast({
        title: `${row.name} is now ${STATUS_LABEL[status]}`,
        variant: "success",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void clientsApi.patch(orgId, row.id, { status: d.data.status }, r.data.version).then((u) => {
              toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
              refresh();
              setReloadToken((n) => n + 1);
            }),
        },
      });
      refresh();
      setReloadToken((n) => n + 1);
    },
    [orgId, toast, refresh],
  );

  const rowMenu = (row: ClientRow): MenuEntry[] => {
    const items: MenuEntry[] = [{ label: "View details", onSelect: () => openRow(row) }];
    if (canManage) {
      items.push({ label: "Add contact", onSelect: () => setContactFor({ id: row.id, name: row.name }) });
      if (canCreateRequirement) items.push({ label: "Create requirement", onSelect: () => void openCreateRequirement(row.id) });
      items.push(row.status === "INACTIVE" ? { label: "Mark as active", onSelect: () => void setStatus(row, "ACTIVE") } : { label: "Mark as inactive", onSelect: () => void setStatus(row, "INACTIVE") });
    }
    items.push({ separator: true }, { label: "Copy link", onSelect: () => void copyLink(row.id) });
    return items;
  };

  async function openCreateRequirement(id: number) {
    const r = await clientsApi.detail(orgId, id);
    if (!r.ok) {
      toast({ title: "Couldn't open the form", description: errorSentence(r), variant: "error" });
      return;
    }
    setReqFor(r.data);
  }

  const onCreated = (c: ClientDetail) => {
    setAddOpen(false);
    toast({ title: `${c.name} was added`, description: "Add contacts and requirements from the drawer.", variant: "success" });
    dismissed.current = false;
    setOpenId(c.id);
    setDtab("overview");
    setQuery({ ...DEFAULT_QUERY, view: queryRef.current.view });
    setSearchText("");
    setReloadToken((n) => n + 1);
    void loadSummary();
  };

  /* ── view ─────────────────────────────────────────────────────────────────────── */

  const f = summary.data?.facets;
  const filtersOn = hasFilters(query);
  const sortValue = `${query.sort.key},${query.sort.dir}`;
  const moreCount = (query.status ? 1 : 0) + (query.sizeBand ? 1 : 0) + (query.managerId ? 1 : 0);
  const noClientsAtAll = list.status === "ok" && rows.length === 0 && !filtersOn && summary.status === "ok";
  const drawerOpen = openId !== null;
  const docked = mode === "push";
  const lastPage = Math.max(0, Math.ceil(total / query.size) - 1);

  const filterSelects = useMemo(
    () => [
      { name: "industry" as FilterKey, label: "Industry", all: "All Industries", options: (f?.industries ?? []).map(withCount) },
      { name: "health" as FilterKey, label: "Health", all: "All Health Statuses", options: (f?.health ?? []).map((x) => labelled(x, { HEALTHY: "Healthy", AT_RISK: "At Risk", NEUTRAL: "Neutral" })) },
    ],
    [f],
  );

  const searchBox = (
    <div className="relative min-w-0 flex-1 basis-56">
      <SearchIcon aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#2a3667]" />
      <Input
        type="search"
        value={searchText}
        placeholder={TAB_PLACEHOLDER[query.tab]}
        aria-label={query.tab === "directory" ? "Search clients" : query.tab === "contacts" ? "Search contacts" : "Search requirements"}
        onChange={(e) => setSearchText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            change({ q: searchText });
          } else if (e.key === "Escape" && searchText !== "") setSearchText("");
        }}
        className="min-h-9 !rounded-[10px] !bg-[var(--ent-field-bg,#f4f8fe)] pl-9 !text-[12.5px] sm:!min-h-9"
      />
    </div>
  );

  const mainColumn = (
    <div className="min-w-0 flex-1 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Tabs value={query.tab} onValueChange={(t) => setTab(t as MainTab)} variant="underline" className="min-w-0 flex-1">
          <TabList aria-label="Clients views">
            <Tab value="directory"><span className="inline-flex items-center gap-2"><BuildingIcon size={17} aria-hidden /> Client Directory</span></Tab>
            <Tab value="contacts"><span className="inline-flex items-center gap-2"><UsersIcon size={17} aria-hidden /> Contacts</span></Tab>
            <Tab value="requirements"><span className="inline-flex items-center gap-2"><FileTextIcon size={17} aria-hidden /> Requirements</span></Tab>
            <Tab value="activity"><span className="inline-flex items-center gap-2"><ClockIcon size={17} aria-hidden /> Activity</span></Tab>
          </TabList>
        </Tabs>
        {canManage && (
          <Button type="button" variant="accent" className="min-h-10 !rounded-[10px] !px-5 !text-[13.5px]" onClick={() => setAddOpen(true)} data-add-client>
            <PlusIcon size={16} aria-hidden /> Add Client
          </Button>
        )}
      </div>

      {query.tab !== "activity" && (
        <div role="search" className="flex flex-wrap items-center gap-2.5" data-filters>
          {searchBox}
          {query.tab === "directory" && (
            <>
              {filterSelects.map((fs) => (
                <div key={fs.name} className="min-w-0 flex-none basis-[calc(50%-0.3rem)] sm:basis-[160px]">
                  <Select className="!min-h-9 !rounded-[10px] !pl-3 !pr-7 !text-[12.5px] sm:!min-h-9" aria-label={fs.label} value={query[fs.name]} onChange={(v) => change({ [fs.name]: v } as Partial<ClientQuery>)} options={[{ value: "", label: fs.all }, ...fs.options]} />
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="min-h-9 flex-none !rounded-[10px] !border !border-[#dde5f1] bg-white !px-3.5 !text-[12.5px] !font-medium" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} data-more-filters>
                <FilterIcon size={15} aria-hidden /> More Filters{moreCount > 0 ? ` (${moreCount})` : ""}
              </Button>
              {filtersOn && (
                <Button type="button" variant="ghost" size="sm" onClick={clearAll} data-clear-filters>
                  Clear filters
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {query.tab !== "activity" && searchText.trim().length === 1 && <p className="-mt-2 text-[12px] text-muted">Type one more character to search.</p>}
      {query.tab === "directory" && moreOpen && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-line bg-paper-2/40 p-2.5" data-more-filters-row>
          <div className="w-44">
            <Select aria-label="Status" value={query.status} onChange={(v) => change({ status: v })} options={[{ value: "", label: "Any status" }, ...(f?.statuses ?? []).map((x) => labelled(x, STATUS_LABEL))]} />
          </div>
          <div className="w-52">
            <Select aria-label="Company size" value={query.sizeBand} onChange={(v) => change({ sizeBand: v })} options={[{ value: "", label: "Any size" }, ...(f?.sizes ?? []).map((x) => labelled(x, SIZE_LABEL))]} />
          </div>
          <div className="w-52">
            <Select aria-label="Account manager" value={query.managerId} onChange={(v) => change({ managerId: v })} options={[{ value: "", label: "Any account manager" }, ...(f?.managers ?? []).map(withCount)]} />
          </div>
        </div>
      )}

      {query.tab === "directory" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[#46527e]">
            <p aria-live="polite" data-count>
              {list.status === "ok" ? showingText(total, query.page, query.size, rows.length) : " "}
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                <span>Sort by:</span>
                <div className="w-40">
                  <Select
                    className="!border-transparent !bg-transparent !pl-1 !shadow-none !text-[12.5px] !text-ink sm:!min-h-9"
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
              <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-[10px] border border-[#dde5f1] bg-white">
                <button type="button" aria-label="List view" aria-pressed={query.view === "list"} onClick={() => setQuery((q) => ({ ...q, view: "list" }))} className={`grid h-9 w-9 place-items-center ${query.view === "list" ? "bg-accent-soft text-accent-deep" : "text-[#46527e] hover:bg-paper-2"}`}>
                  <ListIcon size={17} aria-hidden />
                </button>
                <button type="button" aria-label="Grid view" aria-pressed={query.view === "grid"} onClick={() => setQuery((q) => ({ ...q, view: "grid" }))} className={`grid h-9 w-9 place-items-center ${query.view === "grid" ? "bg-accent-soft text-accent-deep" : "text-[#46527e] hover:bg-paper-2"}`}>
                  <GridIcon size={17} aria-hidden />
                </button>
              </div>
              <div className="inline-flex gap-1.5">
                <button type="button" aria-label="Previous page" disabled={query.page <= 0} onClick={() => change({ page: query.page - 1 })} className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#dde5f1] bg-white text-[#46527e] hover:bg-paper-2 disabled:opacity-40">
                  <ChevronLeftIcon size={16} aria-hidden />
                </button>
                <button type="button" aria-label="Next page" disabled={query.page >= lastPage} onClick={() => change({ page: query.page + 1 })} className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#dde5f1] bg-white text-accent-deep hover:bg-paper-2 disabled:opacity-40">
                  <ChevronRightIcon size={16} aria-hidden />
                </button>
              </div>
            </div>
          </div>

          {selected.size > 0 && (
            <div role="region" aria-label="Selection" data-bulk-bar className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-accent/40 bg-accent-soft/50 px-3 py-2">
              <p className="text-[13px] font-semibold text-ink" aria-live="polite">
                {selected.size} selected
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const names = rows.filter((r) => selected.has(r.id)).map((r) => r.name).join("\n");
                  void navigator.clipboard?.writeText(names).then(
                    () => toast({ title: "Names copied", variant: "success" }),
                    () => toast({ title: "Couldn't copy", variant: "error" }),
                  );
                }}
              >
                Copy names
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          )}

          {list.status === "loading" && <TableSkeleton count={6} columns={6} label="Loading clients" />}
          {list.status === "error" && <ErrorState what="the clients" description={list.message} onRetry={() => void loadList(query, false)} />}
          {list.status === "ok" && rows.length > 0 && (
            <>
              {query.view === "grid" ? (
                <ClientsGrid rows={rows} openId={openId} onOpen={(r) => openRow(r)} rowMenu={rowMenu} />
              ) : (
                <ClientsTable rows={rows} selected={selected} onToggle={toggle} onTogglePage={togglePage} openId={openId} onOpen={(r) => openRow(r)} rowMenu={rowMenu} sort={query.sort} onSort={(sort) => change({ sort })} />
              )}
              <Pagination page={query.page} size={query.size} total={total} shown={rows.length} onPage={(page) => change({ page })} onSize={(size) => change({ size })} />
            </>
          )}
          {list.status === "ok" && rows.length === 0 && (
            <EmptyState
              variant="page"
              mascotPose="peek"
              title={noClientsAtAll ? "No clients yet" : "No clients match"}
              description={noClientsAtAll ? "The companies you place consultants with appear here, with their contacts and requirements." : query.q.trim().length >= MIN_SEARCH || filtersOn ? "Try a different search, or clear the filters to see every client." : "There is nothing on this page."}
              action={
                noClientsAtAll ? (
                  canManage ? (
                    <Button type="button" onClick={() => setAddOpen(true)}>
                      Add your first client
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
        </>
      )}

      {query.tab === "contacts" && <ContactsView orgId={orgId} query={query} token={reloadToken} filtered={query.q.trim().length >= MIN_SEARCH} onPage={(page) => change({ page })} onSize={(size) => change({ size })} onOpenClient={openFromTab} />}
      {query.tab === "requirements" && <RequirementsView orgId={orgId} query={query} token={reloadToken} filtered={query.q.trim().length >= MIN_SEARCH} onPage={(page) => change({ page })} onSize={(size) => change({ size })} onOpenClient={openFromTab} jobsHref={hrefs.jobs} />}
      {query.tab === "activity" && <ActivityView orgId={orgId} token={reloadToken} onOpenClient={openFromTab} />}
    </div>
  );

  const drawer = (
    <ClientDrawer
      orgId={orgId}
      clientId={openId}
      mode={mode}
      managers={summary.data?.managerOptions ?? []}
      tab={dtab}
      onTab={setDtab}
      onClose={closeDrawer}
      onChanged={refresh}
      reloadToken={reloadToken}
      hrefs={hrefs}
      onAddContact={(d) => setContactFor({ id: d.id, name: d.name })}
      onCreateRequirement={(d) => setReqFor(d)}
    />
  );

  return (
    <div ref={root} data-clients-page>
      <PageHeader title="Clients" subtitle="Manage client companies, contacts, and open requirements across your organization." />
      <div className="space-y-4">
        <div className="flex flex-col gap-3.5 md:flex-row md:items-stretch" data-top-row>
          <div className="min-w-0 flex-1">
            <KpiTiles summary={summary.data} loading={summary.status === "loading"} error={summary.status === "error"} />
          </div>
          <div className="hidden w-[268px] flex-none md:block lg:w-[268px]">
            <HelpBeeCard orgName={orgName} supportEmail={supportEmail} />
          </div>
        </div>

        <div className={`flex items-start ${docked ? "gap-[22px]" : ""}`} data-main-row>
          {mainColumn}
          {docked && <div className="w-[308px] flex-none">{drawer}</div>}
        </div>
        {!docked && drawer}
      </div>

      <AddClientDialog orgId={orgId} open={addOpen} onClose={() => setAddOpen(false)} industries={(f?.industries ?? []).map((x) => x.value)} managers={summary.data?.managerOptions ?? []} onCreated={onCreated} />
      <ContactDialog
        orgId={orgId}
        clientId={contactFor?.id ?? null}
        clientName={contactFor?.name ?? ""}
        open={contactFor !== null}
        onClose={() => setContactFor(null)}
        onAdded={(d, name) => {
          setContactFor(null);
          toast({ title: `${name} was added`, description: `A contact at ${d.name}.`, variant: "success" });
          refresh();
          setReloadToken((n) => n + 1);
          if (openId !== d.id) openRow(d, "contacts");
        }}
      />
      <CreateJobDialog
        orgId={orgId}
        open={reqFor !== null}
        onClose={() => setReqFor(null)}
        clients={reqFor ? [{ id: reqFor.id, name: reqFor.name, contacts: reqFor.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, email: c.email })) }] : []}
        presetClientId={reqFor?.id ?? null}
        onCreated={(job) => {
          const name = reqFor?.name ?? job.client.name;
          setReqFor(null);
          toast({ title: `${job.title} was created`, description: `A requirement for ${name}.`, variant: "success" });
          refresh();
          setReloadToken((n) => n + 1);
        }}
      />
    </div>
  );
}
