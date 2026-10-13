"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, ErrorState, FilterBar, FilterIcon, PlusIcon, ReasonSheet, Select, TableSkeleton, useMediaQuery, useNarrow, useToast } from "@kiwiply/ui";
import type { MenuEntry, ReasonSpec } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  bulkSummary,
  DEFAULT_QUERY,
  errorSentence,
  membersApi,
  nextSort,
  undoPlan,
  type BulkResult,
  type GroupOption,
  type ListQuery,
  type MemberCounts,
  type MemberDetail,
  type MemberRow,
  type PersonRef,
  type RoleOption,
  type ScheduledItem,
  type SortKey,
  type UndoPlan,
} from "@/lib/ent/members";
import { BulkBar, ManagerDialog, MoveDialog, RolesDialog, type BulkDialog, type Outcome } from "./BulkBar";
import DetailSheet, { type DetailTab, type FlowKind } from "./DetailSheet";
import { EmployeesTable, Pagination } from "./EmployeesTable";
import HelpBeeCard from "./HelpBeeCard";
import KpiTiles from "./KpiTiles";
import { OffboardSheet, ScheduledDialog, SuspendSheet, type Target } from "./LifecycleFlows";

const WIDE_QUERY = "(min-width: 1400px)"; // config-literal-ok: the width at which the detail sheet docks beside the table instead of floating over it
const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered (UI timing)
const UNDO_SUSPEND_REASON = "Undo: reinstated by mistake";

export interface EmployeesPageProps {
  orgId: number;
  orgName: string;
  /** The workspace slug (`admin`): Add Employee leads to `/w/{workspace}/invitations`. */
  workspace: string;
  selfMemberId: number;
  /** `me.permissions` of the tenant session: decides which buttons are drawn (the API is the gate). */
  permissions: Record<string, string>;
  supportEmail?: string | null;
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INVITED", label: "Invited" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "LEFT,REMOVED", label: "Offboarded" },
];

const SORT_OPTIONS = [
  { value: "joined,desc", label: "Newest first" },
  { value: "joined,asc", label: "Oldest first" },
  { value: "name,asc", label: "Name A to Z" },
  { value: "name,desc", label: "Name Z to A" },
  { value: "status,asc", label: "Status" },
  { value: "lastActive,desc", label: "Recently active" },
];

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: MemberRow[]; total: number };

export default function EmployeesPage({ orgId, orgName, workspace, selfMemberId, permissions, supportEmail }: EmployeesPageProps) {
  const toast = useToast();
  const narrow = useNarrow();
  const wide = useMediaQuery(WIDE_QUERY, false);
  const can = useCallback((k: string) => Object.prototype.hasOwnProperty.call(permissions, k), [permissions]);

  const [query, setQuery] = useState<ListQuery>(DEFAULT_QUERY);
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [counts, setCounts] = useState<{ status: "loading" | "ok" | "error"; data: MemberCounts | null }>({ status: "loading", data: null });
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [reloadToken, setReloadToken] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bulkDialog, setBulkDialog] = useState<BulkDialog>(null);
  const [bulkSuspend, setBulkSuspend] = useState(false);
  const [suspendT, setSuspendT] = useState<Target | null>(null);
  const [offT, setOffT] = useState<Target | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [managers, setManagers] = useState<PersonRef[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const queryRef = useRef(query);
  const managersLoad = useRef<Promise<PersonRef[]> | null>(null);
  useEffect(() => {
    queryRef.current = query;
  });

  /* ── data ─────────────────────────────────────────────────────────────────────── */

  const loadList = useCallback(
    async (q: ListQuery, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setList({ status: "loading" });
      const r = await membersApi.list(orgId, q);
      if (mine !== seq.current) return;
      if (r.ok) setList({ status: "ok", items: r.data.items, total: r.data.total });
      else setList({ status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadCounts = useCallback(async () => {
    const r = await membersApi.counts(orgId);
    setCounts(r.ok ? { status: "ok", data: r.data } : (c) => ({ status: "error", data: c.data }));
  }, [orgId]);

  const loadScheduled = useCallback(async () => {
    const r = await membersApi.scheduled(orgId);
    setScheduled(r.ok ? r.data.items : []);
  }, [orgId]);

  /* The Roles page's "Assign users" lands here as `?role=<id>` (the API's own name `roleId` works too): start filtered to that role. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = (p.get("role") ?? p.get("roleId") ?? "").trim();
    if (/^\d+$/.test(id)) setQuery((q) => (q.roleId === id ? q : { ...q, roleId: id, page: 0 }));
  }, []);

  useEffect(() => {
    void loadList(query, false);
  }, [query, loadList]);

  useEffect(() => {
    void loadCounts();
    void loadScheduled();
    void membersApi.roles(orgId).then((r) => setRoles(r.ok ? r.data.map((x) => ({ id: x.id, key: x.key, name: x.name, description: x.description ?? null, system: x.system })) : []));
    void membersApi.groups(orgId).then((r) => setGroups(r.ok ? r.data : []));
  }, [orgId, loadCounts, loadScheduled]);

  const refresh = useCallback(() => {
    void loadList(queryRef.current, true);
    void loadCounts();
    void loadScheduled();
    setReloadToken((n) => n + 1);
  }, [loadList, loadCounts, loadScheduled]);

  /** Active people, for the manager pickers: asked once, on first use. */
  const loadManagers = useCallback((): Promise<PersonRef[]> => {
    if (!managersLoad.current) {
      managersLoad.current = membersApi.list(orgId, { ...DEFAULT_QUERY, status: "ACTIVE", size: 100, sort: { key: "name", dir: "asc" } }).then((r) => {
        const people = r.ok ? r.data.items.map((m) => ({ memberId: m.id, name: m.name, avatarUrl: m.avatarUrl })) : [];
        if (!r.ok) managersLoad.current = null;
        setManagers(people);
        return people;
      });
    }
    return managersLoad.current;
  }, [orgId]);

  /* ── query changes ────────────────────────────────────────────────────────────── */

  const change = useCallback((c: Partial<ListQuery>) => setQuery((q) => ({ ...q, ...c, page: c.page ?? 0 })), []);
  const filterValues = { department: query.departmentId, team: query.teamId, role: query.roleId, status: query.status };
  const onFilter = (name: string, value: string) => {
    const key = name === "department" ? "departmentId" : name === "team" ? "teamId" : name === "role" ? "roleId" : "status";
    change({ [key]: value } as Partial<ListQuery>);
  };
  const filtersActive = query.q.trim().length >= 2 || !!(query.status || query.roleId || query.departmentId || query.teamId || query.managerId);
  const clearAll = () => change({ q: "", status: "", roleId: "", departmentId: "", teamId: "", managerId: "" });

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

  /* ── undo ─────────────────────────────────────────────────────────────────────── */

  const applyUndo = useCallback(
    async (plans: UndoPlan[]) => {
      let failed = 0;
      for (const p of plans) {
        let ok = true;
        if (p.kind === "roles") ok = (await membersApi.setRoles(orgId, p.memberId, p.roleIds, p.primaryRoleId)).ok;
        else if (p.kind === "groups") ok = (await membersApi.bulk(orgId, "groups", { memberIds: p.memberIds, departmentGroupId: p.departmentGroupId, teamGroupId: p.teamGroupId })).ok;
        else if (p.kind === "manager") ok = (await membersApi.bulk(orgId, "manager", { memberIds: p.memberIds, managerMemberId: p.managerMemberId })).ok;
        else ok = (await membersApi.bulk(orgId, "status", { memberIds: p.memberIds, action: p.action, reason: p.action === "SUSPEND" ? UNDO_SUSPEND_REASON : undefined })).ok;
        if (!ok) failed++;
      }
      toast(failed === 0 ? { title: "Undone", variant: "success" } : { title: "Couldn't undo everything", description: "Some changes could not be put back. Reload to see where things stand.", variant: "error" });
      refresh();
    },
    [orgId, toast, refresh],
  );

  /** Shows the outcome of a bulk call as one toast with an Undo that sends the reverse from `previous`. */
  const announce = useCallback(
    (kind: "roles" | "groups" | "manager" | "status", res: BulkResult, verb: string) => {
      const sum = bulkSummary(res, verb);
      const plans = undoPlan(kind, res.results);
      toast({ ...sum, duration: UNDO_MS, action: plans.length > 0 ? { label: "Undo", onClick: () => void applyUndo(plans) } : undefined });
      setSelected(new Set());
      refresh();
    },
    [toast, applyUndo, refresh],
  );

  async function runBulk(kind: "roles" | "groups" | "manager" | "status", body: Record<string, unknown>, verb: string): Promise<Outcome> {
    const r = await membersApi.bulk(orgId, kind, { memberIds: [...selected], ...body });
    if (!r.ok) return { ok: false, error: errorSentence(r) };
    announce(kind, r.data, verb);
    return { ok: true };
  }

  const bulkSuspendSpec = useMemo<ReasonSpec | null>(
    () =>
      bulkSuspend
        ? {
            title: `Suspend ${selected.size} ${selected.size === 1 ? "person" : "people"}?`,
            body: <>They lose access at their next request. You, the last administrator and anyone above your level are skipped. You can undo this or reinstate them any time.</>,
            confirmLabel: "Suspend",
            run: async (reason) => {
              const o = await runBulk("status", { action: "SUSPEND", reason }, "suspended");
              return o.ok ? { ok: true } : { ok: false, error: o.error };
            },
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bulkSuspend, selected],
  );

  /* ── single-person lifecycle ──────────────────────────────────────────────────── */

  const reinstate = useCallback(
    async (t: Target) => {
      const r = await membersApi.reinstate(orgId, t.id);
      if (!r.ok) {
        toast({ title: `Couldn't reinstate ${t.name}`, description: errorSentence(r), variant: "error" });
        return;
      }
      toast({
        title: `${t.name} is active again`,
        variant: "success",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void membersApi.suspend(orgId, t.id, UNDO_SUSPEND_REASON).then((u) => {
              toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
              refresh();
            }),
        },
      });
      refresh();
    },
    [orgId, toast, refresh],
  );

  const onSuspended = useCallback(
    (t: Target) => {
      toast({ title: `${t.name} is suspended`, variant: "success", duration: UNDO_MS, action: { label: "Undo", onClick: () => void reinstate(t) } });
      refresh();
    },
    [toast, reinstate, refresh],
  );

  const onOffboarded = useCallback(
    (t: Target, r: { scheduled: { effectiveAt: string } | null }) => {
      toast(r.scheduled ? { title: `${t.name}'s last day is set`, description: "They keep access until then. You can cancel it from Scheduled last days.", variant: "success" } : { title: `${t.name} was offboarded`, description: "Their records are kept.", variant: "success" });
      if (!r.scheduled && openId === t.id) setOpenId(null);
      refresh();
    },
    [toast, refresh, openId],
  );

  const startFlow = useCallback(
    (kind: FlowKind, t: Target) => {
      if (kind === "suspend") setSuspendT(t);
      else if (kind === "offboard") setOffT(t);
      else void reinstate(t);
    },
    [reinstate],
  );

  /** From a row menu: the API says what this person's seat allows (`actions`), so ask before opening the sheet for it. */
  const startRowFlow = useCallback(
    async (kind: FlowKind, row: MemberRow) => {
      const r = await membersApi.detail(orgId, row.id);
      if (!r.ok) {
        toast({ title: "Couldn't open this person", description: errorSentence(r), variant: "error" });
        return;
      }
      if (!r.data.actions[kind]) {
        toast({ title: "That isn't part of your access", variant: "error" });
        return;
      }
      startFlow(kind, { id: row.id, name: row.name });
    },
    [orgId, toast, startFlow],
  );

  const cancelScheduled = useCallback(
    async (id: number, name: string) => {
      const r = await membersApi.cancelScheduled(orgId, id);
      toast(r.ok ? { title: `${name}'s last day was cancelled`, variant: "success" } : { title: "Couldn't cancel", description: errorSentence(r), variant: "error" });
      refresh();
    },
    [orgId, toast, refresh],
  );

  /* ── sheet ────────────────────────────────────────────────────────────────────── */

  const openRow = (row: MemberRow, t: DetailTab = "overview") => {
    setOpenId(row.id);
    setTab(t);
  };

  const onSaved = useCallback((d: MemberDetail) => {
    setList((l) =>
      l.status === "ok"
        ? {
            ...l,
            items: l.items.map((r) =>
              r.id === d.id ? { ...r, title: d.title, roles: d.roles, department: d.department, team: d.team, manager: d.manager, status: d.status } : r,
            ),
          }
        : l,
    );
  }, []);

  const rowMenu = (row: MemberRow): MenuEntry[] => {
    const items: MenuEntry[] = [{ label: "View details", onSelect: () => openRow(row) }];
    if (can("members.role.set") && row.status !== "LEFT" && row.status !== "REMOVED") items.push({ label: "Manage roles & permissions", onSelect: () => openRow(row, "access") });
    if (can("members.suspend")) {
      if (row.status === "ACTIVE") items.push({ label: "Suspend", onSelect: () => void startRowFlow("suspend", row), danger: true });
      if (row.status === "SUSPENDED") items.push({ label: "Reinstate", onSelect: () => void startRowFlow("reinstate", row) });
    }
    if (can("members.remove") && (row.status === "ACTIVE" || row.status === "SUSPENDED")) items.push({ separator: true }, { label: "Delete employee", onSelect: () => void startRowFlow("offboard", row), danger: true });
    return items;
  };

  const mode = narrow ? "sheet" : wide ? "push" : "overlay";
  const sheetOpen = openId !== null;
  const canInvite = can("members.invite");
  const inviteHref = `/w/${workspace}/invitations?invite=1`;
  const total = list.status === "ok" ? list.total : 0;
  const onlyOwner = list.status === "ok" && !filtersActive && total === 1;
  const sortValue = `${query.sort.key},${query.sort.dir}`;

  const filters = [
    { name: "department", label: "Department", allLabel: "All Departments", options: groups.filter((g) => g.kind === "DEPARTMENT").map((g) => ({ value: String(g.id), label: g.name })) },
    { name: "team", label: "Team", allLabel: "All Teams", options: groups.filter((g) => g.kind === "TEAM").map((g) => ({ value: String(g.id), label: g.name })) },
    ...(roles.length > 0 ? [{ name: "role", label: "Role", allLabel: "All Roles", options: roles.map((r) => ({ value: String(r.id), label: r.name })) }] : []),
    { name: "status", label: "Status", allLabel: "All Statuses", options: STATUS_OPTIONS },
  ];

  return (
    <div ref={root} data-employees-page>
      <PageHeader title="Employees" subtitle="Manage your organization's employees, roles, and access permissions." />
      <div className="space-y-4">
        <KpiTiles
          compact={sheetOpen && mode === "push"}
          counts={counts.data}
          loading={counts.status === "loading"}
          error={counts.status === "error"}
          action={
            canInvite ? (
              <Link href={inviteHref} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-[14px] font-semibold text-on-accent shadow-sm hover:brightness-95" data-add-employee>
                <PlusIcon size={16} aria-hidden /> Add Employee
              </Link>
            ) : undefined
          }
        />
        <div className="flex items-start">
        <div className="min-w-0 flex-1 space-y-3 rounded-2xl border border-line bg-paper p-3 shadow-[0_1px_3px_rgba(16,24,64,.06)]">
          {scheduled.length > 0 && (
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => setQueueOpen(true)} data-scheduled-button>
                Scheduled last days ({scheduled.length})
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <FilterBar
              compact
              className="flex-nowrap max-sm:flex-wrap [&>div:first-child]:sm:!w-auto [&>div:first-child]:sm:min-w-0 [&>div:first-child]:sm:flex-1 [&>div:first-child_input]:!rounded-[10px] [&>div:first-child_input]:!border-brand-border [&>div:first-child_input]:!bg-accent-soft/40 [&>div:not(:first-child)]:sm:!w-auto [&>div:not(:first-child)]:sm:min-w-[7.5rem] [&_button[aria-haspopup]]:!rounded-[10px] [&_button[aria-haspopup]]:!pl-3 [&_button[aria-haspopup]]:!pr-8 [&_button[aria-haspopup]]:!text-[13.5px]"
              query={query.q}
              onQueryChange={(q) => change({ q })}
              values={filterValues}
              onFilterChange={onFilter}
              search={{ placeholder: "Search employees by name, email, role, or department...", label: "Search employees" }}
              filters={filters}
              actions={
                <Button type="button" variant="ghost" size="sm" className="!h-10 !rounded-[10px] border border-line !px-3 !text-[13.5px] !font-medium" aria-expanded={moreOpen} onClick={() => { setMoreOpen((o) => !o); void loadManagers(); }} data-more-filters>
                  <FilterIcon size={15} aria-hidden /> More Filters{query.managerId ? " (1)" : ""}
                </Button>
              }
            />
            {moreOpen && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-line bg-paper-2/40 p-2.5" data-more-filters-row>
                <div className="w-56">
                  <Select
                    aria-label="Manager"
                    value={query.managerId}
                    onChange={(v) => change({ managerId: v })}
                    options={[{ value: "", label: "Any manager" }, ...managers.map((m) => ({ value: String(m.memberId), label: m.name }))]}
                  />
                </div>
                <p className="text-[12px] text-muted">Sort the table by Joined to browse by join date.</p>
              </div>
            )}
          </div>

          {narrow && list.status === "ok" && rows.length > 0 && (
            <div className="w-48">
              <Select aria-label="Sort by" value={sortValue} onChange={(v) => { const [key, dir] = v.split(","); change({ sort: { key: key as SortKey, dir: dir as "asc" | "desc" } }); }} options={SORT_OPTIONS} />
            </div>
          )}

          <BulkBar
            count={selected.size}
            can={{ roles: can("members.role.set"), groups: can("members.group.set"), manager: can("members.manager.set"), suspend: can("members.suspend") }}
            onClear={() => setSelected(new Set())}
            onOpen={(d) => {
              setBulkDialog(d);
              if (d === "manager") void loadManagers();
            }}
            onSuspend={() => setBulkSuspend(true)}
            onReinstate={() => void runBulk("status", { action: "REINSTATE" }, "reinstated")}
          />

          {list.status === "loading" && <TableSkeleton count={6} columns={5} label="Loading employees" />}
          {list.status === "error" && <ErrorState what="the employees" description={list.message} onRetry={() => void loadList(query, false)} />}
          {list.status === "ok" && rows.length > 0 && (
            <>
              <EmployeesTable
                rows={rows}
                selected={selected}
                onToggle={toggle}
                onTogglePage={togglePage}
                openId={openId}
                onOpen={(r) => openRow(r)}
                rowMenu={rowMenu}
                sort={query.sort}
                onSort={(k) => change({ sort: nextSort(query.sort, k) })}
                compact={sheetOpen && mode === "push"}
              />
              <Pagination page={query.page} size={query.size} total={total} shown={rows.length} onPage={(page) => change({ page })} onSize={(size) => change({ size })} />
            </>
          )}
          {list.status === "ok" && (rows.length === 0 || onlyOwner) && (
            <EmptyState
              variant={onlyOwner ? "inline" : "page"}
              mascot
              mascotPose={onlyOwner ? "greet" : "peek"}
              title={onlyOwner ? "Invite your first teammate" : filtersActive ? "No employees match" : "No employees yet"}
              description={onlyOwner ? "You are the only person here so far." : filtersActive ? "Try a different search, or clear the filters to see everyone." : "People appear here once they join your organization."}
              action={
                filtersActive && rows.length === 0 ? (
                  <Button type="button" onClick={clearAll}>
                    Clear filters
                  </Button>
                ) : canInvite ? (
                  <Link href={inviteHref} className="font-semibold text-accent-deep underline">
                    Invite your first teammate
                  </Link>
                ) : undefined
              }
            />
          )}
          {list.status === "ok" && rows.length > 0 && !onlyOwner && !(sheetOpen && mode === "push") && <HelpBeeCard orgName={orgName} supportEmail={supportEmail} />}
        </div>

        <DetailSheet
          orgId={orgId}
          memberId={openId}
          selfId={selfMemberId}
          mode={mode}
          roles={roles}
          groups={groups}
          loadManagers={loadManagers}
          onClose={() => setOpenId(null)}
          onSaved={onSaved}
          onChanged={refresh}
          onFlow={(k, d) => startFlow(k, { id: d.id, name: d.name })}
          onCancelScheduled={(id, name) => void cancelScheduled(id, name)}
          reloadToken={reloadToken}
          tab={tab}
          onTab={setTab}
          footer={<HelpBeeCard compact orgName={orgName} supportEmail={supportEmail} />}
        />
        </div>
      </div>

      <RolesDialog open={bulkDialog === "roles"} onClose={() => setBulkDialog(null)} count={selected.size} roles={roles} onApply={(add, remove) => runBulk("roles", { add, remove }, "updated roles for")} />
      <MoveDialog open={bulkDialog === "groups"} onClose={() => setBulkDialog(null)} count={selected.size} groups={groups} onApply={(department, team) => runBulk("groups", { departmentGroupId: department, teamGroupId: team }, "moved")} />
      <ManagerDialog open={bulkDialog === "manager"} onClose={() => setBulkDialog(null)} count={selected.size} managers={managers} onApply={(managerId) => runBulk("manager", { managerMemberId: managerId }, "updated the manager of")} />
      <ReasonSheet spec={bulkSuspendSpec} onClose={() => setBulkSuspend(false)} />
      <SuspendSheet orgId={orgId} target={suspendT} onClose={() => setSuspendT(null)} onDone={onSuspended} />
      <OffboardSheet orgId={orgId} target={offT} onClose={() => setOffT(null)} onDone={onOffboarded} />
      <ScheduledDialog
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        items={scheduled}
        onCancel={async (i) => {
          await cancelScheduled(i.id, i.name);
        }}
      />
    </div>
  );
}
