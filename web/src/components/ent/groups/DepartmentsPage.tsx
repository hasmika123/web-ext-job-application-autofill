"use client";

import { useMemo, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, BarChartIcon, BuildingIcon, Button, DataTable, Dialog, EmptyState, ErrorState, FilterBar, MemberAvatar, PersonCell, PlusIcon, Select, Skeleton, UserIcon, UsersIcon, ChevronRightIcon, NetworkIcon, useToast, type DataTableColumn, type MenuEntry, PencilIcon, ArchiveIcon, RestoreIcon, TrashIcon, SwapIcon } from "@kiwiply/ui";
import { ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { plural, shortDate, TONE_BAR, toneOf, type Group } from "@/lib/ent/groups";
import CreateGroupSheet from "./CreateGroupSheet";
import GroupDetailSheet from "./GroupDetailSheet";
import PersonSearch from "./PersonSearch";
import { GroupStatus, GroupTile, Kpi, PageHelpCard, SectionHead } from "./GroupVisuals";
import { OrgChart, StructureTree } from "./StructureViews";
import { useGroupActions, useGroupsData } from "./useGroups";

const PAGE_SIZE = 5;

/**
 * Departments (X4.5): the board `design/enterprise-admin/departments.png` on real data. KPI tiles (only the ones the API can count),
 * a card per department with its lead, the organization as a small chart, employees per department as bars, and the directory
 * (search, status filter, sort, pages) with a row menu. Everything saves as it is changed; there is no Save button.
 */
export default function DepartmentsPage({ orgId, canManage }: { orgId: number | string; canManage: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);
  const query = useMemo(() => ({ q: q || undefined, status: status || undefined, sort: sort.key, dir: sort.dir, page, size: PAGE_SIZE }), [q, status, sort, page]);
  const { directory, structure, state, error, reload } = useGroupsData(orgId, "DEPARTMENT", query);
  const actions = useGroupActions(orgId, reload);
  const toast = useToast();

  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [fullTree, setFullTree] = useState(false);
  const [leadFor, setLeadFor] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);

  const departments = useMemo(() => structure?.departments.map((d) => d.group) ?? [], [structure]);
  const s = directory?.summary;
  const hasFilters = q !== "" || status !== "";

  const columns: DataTableColumn<Group>[] = [
    {
      key: "name",
      header: "Department name",
      sortable: true,
      primary: true,
      render: (g) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <GroupTile icon={g.icon} color={g.color} size={32} />
          <span className="truncate font-semibold text-ink">{g.name}</span>
        </span>
      ),
    },
    { key: "members", header: "Employees", sortable: true, className: "tabular-nums", render: (g) => g.activeCount },
    {
      key: "lead",
      header: "Department lead",
      sortable: true,
      render: (g) => (g.lead ? <PersonCell name={g.lead.name} avatarName={g.lead.name} sub={g.lead.roleName} size={30} /> : <span className="text-muted">No lead</span>),
    },
    { key: "created", header: "Created on", sortable: true, hideOnMobile: true, render: (g) => <span className="whitespace-nowrap text-ink-soft">{shortDate(g.createdAt)}</span> },
    { key: "status", header: "Status", render: (g) => <GroupStatus status={g.status} /> },
  ];

  function rowActions(g: Group): MenuEntry[] {
    const empty = g.memberCount === 0 && (g.teamCount ?? 0) === 0;
    const items: MenuEntry[] = [{ label: "Open", icon: <BuildingIcon size={15} />, onSelect: () => setOpenId(g.id) }];
    if (!canManage) return items;
    items.push(
      { label: "Edit", icon: <PencilIcon size={15} />, onSelect: () => setOpenId(g.id) },
      { label: "Change lead", icon: <SwapIcon size={15} />, onSelect: () => setLeadFor(g) },
      g.status === "ACTIVE"
        ? { label: "Archive", icon: <ArchiveIcon size={15} />, onSelect: () => void actions.patch(g, { status: "INACTIVE" }, `${g.name} archived`, { status: "ACTIVE" }) }
        : { label: "Restore", icon: <RestoreIcon size={15} />, onSelect: () => void actions.patch(g, { status: "ACTIVE" }, `${g.name} restored`, { status: "INACTIVE" }) },
      { separator: true },
      empty
        ? { label: "Delete", icon: <TrashIcon size={15} />, danger: true, onSelect: () => setDeleting(g) }
        : { label: "Delete (move people out first)", icon: <TrashIcon size={15} />, danger: true, disabled: true, onSelect: () => toast({ title: "Move the people and teams out first" }) },
    );
    return items;
  }

  if (state === "error" && !directory) return <ErrorState what="the departments" description={error ?? undefined} onRetry={() => void reload()} />;

  const nothingAtAll = state === "ready" && directory != null && directory.total === 0 && !hasFilters && (structure?.departments.length ?? 0) === 0;
  const maxEmployees = Math.max(1, ...departments.map((d) => d.activeCount));
  const performance = [...departments].sort((a, b) => b.activeCount - a.activeCount);

  return (
    <div className="grp-page flex flex-col gap-5" data-page="departments">
      {/* KPI tiles: only what the API can count (open positions has no data behind it, so there is no tile) */}
      <section aria-label="Department numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!s ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px] w-full rounded-2xl" />)
        ) : (
          <>
            <Kpi icon={<BuildingIcon size={20} />} label="Total Departments" value={s.departments} tone="secondary" hint={s.inactive > 0 ? `${s.inactive} archived` : undefined} />
            <Kpi icon={<UsersIcon size={20} />} label="Total Employees" value={s.employees} tone="success" hint={s.unplaced > 0 ? `${s.unplaced} not in a department yet` : undefined} />
            <Kpi icon={<UserIcon size={20} />} label="Department Leads" value={s.departmentLeads} tone="primary" />
            <Kpi icon={<NetworkIcon size={20} />} label="Avg. Team Size" value={s.averageTeamSize == null ? "–" : s.averageTeamSize} tone="warning" hint={s.averageTeamSize == null ? "No teams yet" : `across ${plural(s.teams, "team")}`} />
          </>
        )}
      </section>

      {nothingAtAll ? (
        <>
          <ClaimsMascot />
          <EmptyState
            mascotPose="greet"
            title="Group people into departments and teams"
            description="Departments hold teams and the people who run them. Leads and scopes follow from this structure."
            action={canManage ? <Button onClick={() => setCreating(true)}>Create Department</Button> : undefined}
          />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="flex min-w-0 flex-col gap-5">
            <section aria-label="Departments overview" className="grp-card p-4 sm:p-5">
              <SectionHead icon={<BuildingIcon size={26} />} title="Departments" subtitle="Manage departments, view details, and explore team structure.">
                {canManage && (
                  <Button variant="accent" onClick={() => setCreating(true)} className="min-h-11 rounded-[10px] px-5 text-[15px] font-bold">
                    <PlusIcon size={18} /> Create Department
                  </Button>
                )}
              </SectionHead>
              {!structure ? (
                <Skeleton className="mt-4 h-44 w-full" />
              ) : (
                <ul aria-label="Departments" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                  {departments.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(d.id)}
                        data-department-card={d.name}
                        className="grp-card flex h-full w-full flex-col gap-2.5 !rounded-[14px] p-3.5 text-left hover:bg-paper-2/50 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <GroupTile icon={d.icon} color={d.color} size={52} />
                        <div className="min-w-0">
                          <div className="truncate text-[16px] font-extrabold leading-tight text-ink">{d.name}</div>
                          <div className="mt-0.5 text-[13.5px] text-ink-soft">
                            <span className="text-[15px] font-bold tabular-nums text-ink">{d.activeCount}</span> {d.activeCount === 1 ? "employee" : "employees"}
                          </div>
                        </div>
                        <div className="mt-auto pt-1.5">
                          <div className="text-[12px] text-ink-soft">Department Lead</div>
                          {d.lead ? (
                            <div className="mt-1 flex items-center gap-2">
                              <MemberAvatar name={d.lead.name} size={34} />
                              <div className="min-w-0 flex-1 leading-tight">
                                <div className="line-clamp-2 break-words text-[12.5px] font-bold leading-tight text-ink">{d.lead.name}</div>
                                {d.lead.roleName && <div className="truncate text-[11.5px] text-muted">{d.lead.roleName}</div>}
                              </div>
                              <ChevronRightIcon aria-hidden size={14} className="flex-none text-accent" />
                            </div>
                          ) : (
                            <div className="mt-1 text-[12.5px] text-muted">No lead yet</div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Department directory" className="grp-card p-4 sm:p-5">
              <SectionHead icon={<BuildingIcon size={26} />} title="Department Directory" subtitle="View and manage all departments in your organization.">
              <FilterBar
                compact
                query={q}
                onQueryChange={(v) => {
                  setQ(v);
                  setPage(0);
                }}
                values={{ status }}
                onFilterChange={(_n, v) => {
                  setStatus(v);
                  setPage(0);
                }}
                search={{ placeholder: "Search departments…", label: "Search departments" }}
                filters={[{ name: "status", label: "Status", allLabel: "All Departments", options: [{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Archived" }] }]}
                className="xl:flex-nowrap"
              />
              </SectionHead>
              <div className="mt-4" />
              <DataTable
                variant="board"
                renderPager={({ page: pg, pageCount: pc, onPage }) => (
                  <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3 text-[12.5px] text-ink-soft">
                    <span aria-live="polite">{directory && directory.total > 0 ? `Showing ${directory.page * PAGE_SIZE + 1}-${Math.min(directory.total, (directory.page + 1) * PAGE_SIZE)} of ${plural(directory.total, "department")}` : ""}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <button type="button" aria-label="Previous page" disabled={pg <= 1} onClick={() => onPage(pg - 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-paper-2 disabled:opacity-40">
                        <ArrowLeftIcon size={15} />
                      </button>
                      <span aria-current="page" aria-label={`Page ${pg} of ${pc}`} className="grid h-8 min-w-8 place-items-center rounded-lg bg-accent px-2 text-[13px] font-bold text-on-accent">
                        {pg}
                      </span>
                      <button type="button" aria-label="Next page" disabled={pg >= pc} onClick={() => onPage(pg + 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-paper-2 disabled:opacity-40">
                        <ArrowRightIcon size={15} />
                      </button>
                    </span>
                  </nav>
                )}
                label="Departments"
                what="the departments"
                columns={columns}
                rows={directory?.items ?? []}
                rowKey={(g) => String(g.id)}
                loading={state === "loading" && !directory}
                error={state === "error" ? error : null}
                onRetry={() => void reload()}
                hasFilters={hasFilters}
                onRowClick={(g) => setOpenId(g.id)}
                rowActions={rowActions}
                sort={sort}
                onSort={(key) => {
                  setSort((cur) => ({ key, dir: cur.key === key && cur.dir === "asc" ? "desc" : "asc" }));
                  setPage(0);
                }}
                page={page + 1}
                pageCount={directory ? Math.max(1, Math.ceil(directory.total / PAGE_SIZE)) : 1}
                onPage={(p) => setPage(p - 1)}
                empty={<EmptyState variant="inline" title={hasFilters ? "No departments match" : "No departments yet"} description={hasFilters ? "Try a different search or clear the filters." : undefined} />}
              />
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <section aria-label="Organization structure" className="grp-card p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h2 className="flex items-center gap-2.5 whitespace-nowrap text-[17px] font-extrabold text-ink">
                  <NetworkIcon size={22} className="flex-none text-accent" /> Organization Structure
                </h2>
                <Button variant="ghost" size="sm" className="whitespace-nowrap text-[13px] font-semibold text-accent" onClick={() => setFullTree(true)} disabled={!structure}>
                  View Full Structure <ArrowRightIcon size={14} />
                </Button>
              </div>
              {structure ? <OrgChart structure={structure} onOpen={(g) => setOpenId(g.id)} /> : <Skeleton className="h-40 w-full" />}
            </section>

            <section aria-label="Department performance" className="grp-card p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2.5 whitespace-nowrap text-[17px] font-extrabold text-ink">
                  <BarChartIcon size={22} className="text-accent" /> Department Performance
                </h2>
                <div className="w-40 flex-none" title="Trends are on the way">
                  <Select aria-label="Period" disabled value="6" options={[{ value: "6", label: "Last 6 Months" }]} />
                </div>
              </div>
              {!structure ? (
                <Skeleton className="h-32 w-full" />
              ) : performance.length === 0 ? (
                <p className="text-[13px] text-muted">No departments to compare yet.</p>
              ) : (
                <ul aria-label="Employees per department" className="flex flex-col gap-3">
                  {performance.map((d) => (
                    <li key={d.id} className="grid grid-cols-[88px_1fr_28px] items-center gap-3 text-[13px]">
                      <span className="truncate text-ink-soft">{d.name}</span>
                      <span className="h-3 overflow-hidden rounded-full bg-paper-2" role="img" aria-label={`${d.name}: ${plural(d.activeCount, "employee")}`}>
                        <span className={`block h-full rounded-full ${TONE_BAR[toneOf(d.color)]}`} style={{ width: `${Math.max(2, Math.round((d.activeCount / maxEmployees) * 100))}%` }} />
                      </span>
                      <span className="text-right font-bold tabular-nums text-ink">{d.activeCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <PageHelpCard layout="side" topic="departments" text="I can help you set up departments, manage team structure, or answer any questions about organization management." />
          </div>
        </div>
      )}

      {canManage && <CreateGroupSheet orgId={orgId} kind="DEPARTMENT" open={creating} onClose={() => setCreating(false)} departments={departments} onCreate={actions.create} />}
      <GroupDetailSheet orgId={orgId} groupId={openId} onClose={() => setOpenId(null)} canManage={canManage} groups={departments} departments={departments} actions={actions} />

      <Dialog open={fullTree} onClose={() => setFullTree(false)} title="Full structure" description="Departments, their teams and how many people are in each.">
        {structure && (
          <StructureTree
            structure={structure}
            onOpen={(g) => {
              setFullTree(false);
              setOpenId(g.id);
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={leadFor != null}
        onClose={() => setLeadFor(null)}
        title={leadFor ? `Change the lead of ${leadFor.name}` : undefined}
        description="Pick a person. It is saved as you pick, and the toast lets you undo it."
      >
        {leadFor && (
          <div className="min-h-[220px]">
            <PersonSearch
              orgId={orgId}
              label="New department lead"
              placeholder="Search your members"
              onPick={(p) => {
                const g = leadFor;
                setLeadFor(null);
                void actions.patch(g, { leadMemberId: p.memberId }, `${p.name} now leads ${g.name}`, g.lead ? { leadMemberId: g.lead.memberId } : { clearLead: true });
              }}
            />
          </div>
        )}
      </Dialog>

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : undefined}
        description="This department is empty. Deleting it cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const g = deleting;
                setDeleting(null);
                if (g) void actions.remove(g);
              }}
            >
              Delete department
            </Button>
          </div>
        }
      />
    </div>
  );
}
