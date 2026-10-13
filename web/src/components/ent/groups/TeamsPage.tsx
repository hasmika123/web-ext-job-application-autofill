"use client";

import { useMemo, useState } from "react";
import {
  ArchiveIcon,
  Button,
  Card,
  ChartIcon,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  FilterBar,
  IconButton,
  Menu,
  MoreVerticalIcon,
  NetworkIcon,
  PencilIcon,
  PersonCell,
  PlusIcon,
  RestoreIcon,
  Skeleton,
  TrashIcon,
  UserIcon,
  UsersIcon,
  useToast,
  type DataTableColumn,
  type MenuEntry,
} from "@kiwiply/ui";
import { ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { plural, type Group } from "@/lib/ent/groups";
import CreateGroupSheet from "./CreateGroupSheet";
import GroupDetailSheet from "./GroupDetailSheet";
import { AvatarStack, GroupStatus, GroupTile, Kpi } from "./GroupVisuals";
import { StructureTree } from "./StructureViews";
import { useGroupActions, useGroupsData } from "./useGroups";

const PAGE_SIZE = 8;

/**
 * Teams (X4.5): the board `design/enterprise-admin/teams.png` on real data. KPI tiles (only what the API can count), the teams as cards
 * (people stack, member count, department, status) with search and department/status filters, the structure as a tree, and the
 * directory table. There is no workload bar, open-roles count or performance chart: nothing measures them yet, so the Team
 * Performance card says so instead of drawing numbers.
 */
export default function TeamsPage({ orgId, canManage }: { orgId: number | string; canManage: boolean }) {
  // the overview cards: filtered here (an organization has at most a few dozen groups)
  const [cq, setCq] = useState("");
  const [cDept, setCDept] = useState("");
  const [cStatus, setCStatus] = useState("");
  // the directory table: asked of the API
  const [tq, setTq] = useState("");
  const [tDept, setTDept] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);
  const query = useMemo(() => ({ q: tq || undefined, departmentId: tDept || undefined, sort: sort.key, dir: sort.dir, page, size: PAGE_SIZE }), [tq, tDept, sort, page]);
  const { directory, structure, state, error, reload } = useGroupsData(orgId, "TEAM", query);
  const actions = useGroupActions(orgId, reload);
  const toast = useToast();

  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);

  const departments = useMemo(() => structure?.departments.map((d) => d.group) ?? [], [structure]);
  const teams = useMemo(() => (structure ? [...structure.departments.flatMap((d) => d.teams), ...structure.unassignedTeams] : []), [structure]);
  const s = directory?.summary;

  const shownTeams = useMemo(() => {
    const needle = cq.trim().toLowerCase();
    return teams
      .filter((t) => (cDept === "" ? true : cDept === "none" ? t.parentGroupId == null : String(t.parentGroupId) === cDept))
      .filter((t) => (cStatus === "" ? true : t.status === cStatus))
      .filter((t) => needle === "" || t.name.toLowerCase().includes(needle) || (t.lead?.name.toLowerCase().includes(needle) ?? false))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, cq, cDept, cStatus]);

  const deptOptions = [...departments.map((d) => ({ value: String(d.id), label: d.name })), { value: "none", label: "No department" }];

  function menu(g: Group): MenuEntry[] {
    const empty = g.memberCount === 0;
    const items: MenuEntry[] = [{ label: "Open", icon: <UsersIcon size={15} />, onSelect: () => setOpenId(g.id) }];
    if (!canManage) return items;
    items.push(
      { label: "Edit", icon: <PencilIcon size={15} />, onSelect: () => setOpenId(g.id) },
      g.status === "ACTIVE"
        ? { label: "Archive", icon: <ArchiveIcon size={15} />, onSelect: () => void actions.patch(g, { status: "INACTIVE" }, `${g.name} archived`, { status: "ACTIVE" }) }
        : { label: "Restore", icon: <RestoreIcon size={15} />, onSelect: () => void actions.patch(g, { status: "ACTIVE" }, `${g.name} restored`, { status: "INACTIVE" }) },
      { separator: true },
      empty
        ? { label: "Delete", icon: <TrashIcon size={15} />, danger: true, onSelect: () => setDeleting(g) }
        : { label: "Delete (move people out first)", icon: <TrashIcon size={15} />, danger: true, disabled: true, onSelect: () => toast({ title: "Move the people out first" }) },
    );
    return items;
  }

  const columns: DataTableColumn<Group>[] = [
    {
      key: "name",
      header: "Team name",
      sortable: true,
      primary: true,
      render: (g) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <GroupTile icon={g.icon} color={g.color} size={30} fallback="users" />
          <span className="truncate font-semibold text-ink">{g.name}</span>
        </span>
      ),
    },
    { key: "department", header: "Department", sortable: true, render: (g) => g.parentName ?? <span className="text-muted">None</span> },
    { key: "lead", header: "Team lead", sortable: true, render: (g) => (g.lead ? <PersonCell name={g.lead.name} avatarName={g.lead.name} sub={g.lead.roleName} size={28} /> : <span className="text-muted">No lead</span>) },
    { key: "members", header: "Members", sortable: true, className: "tabular-nums", render: (g) => g.activeCount },
    { key: "status", header: "Status", render: (g) => <GroupStatus status={g.status} /> },
  ];

  if (state === "error" && !directory) return <ErrorState what="the teams" description={error ?? undefined} onRetry={() => void reload()} />;

  const nothingAtAll = state === "ready" && structure != null && teams.length === 0 && departments.length === 0;
  const cardFilters = cq !== "" || cDept !== "" || cStatus !== "";

  return (
    <div className="flex flex-col gap-5" data-page="teams">
      <section aria-label="Team numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!s ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px] w-full rounded-2xl" />)
        ) : (
          <>
            <Kpi icon={<UsersIcon size={20} />} label="Total Teams" value={s.teams} tone="primary" hint={s.inactive > 0 ? `${s.inactive} archived` : undefined} />
            <Kpi icon={<UserIcon size={20} />} label="Total Team Members" value={s.teamMembers} tone="success" hint={s.employees > s.teamMembers ? `${s.employees - s.teamMembers} of ${s.employees} employees are in no team` : undefined} />
            <Kpi icon={<NetworkIcon size={20} />} label="Team Leads" value={s.teamLeads} tone="secondary" />
            <Kpi icon={<ChartIcon size={20} />} label="Avg. Team Size" value={s.averageTeamSize == null ? "–" : s.averageTeamSize} tone="info" hint={s.averageTeamSize == null ? "No teams yet" : "people per team"} />
          </>
        )}
      </section>

      {nothingAtAll ? (
        <>
          <ClaimsMascot />
          <EmptyState
            mascotPose="greet"
            title="Group people into departments and teams"
            description="Teams are the groups people work in. Create the first one and name its lead."
            action={canManage ? <Button onClick={() => setCreating(true)}>Create Team</Button> : undefined}
          />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-bold text-ink">Teams Overview</h2>
                  <p className="text-[13px] text-muted">Manage your teams and their members.</p>
                </div>
                {canManage && (
                  <Button variant="accent" onClick={() => setCreating(true)} className="min-h-11">
                    <PlusIcon size={16} /> Create Team
                  </Button>
                )}
              </div>
              <FilterBar
                className="mt-3"
                query={cq}
                onQueryChange={setCq}
                values={{ department: cDept, status: cStatus }}
                onFilterChange={(n, v) => (n === "department" ? setCDept(v) : setCStatus(v))}
                search={{ placeholder: "Search teams…", label: "Search teams" }}
                filters={[
                  { name: "department", label: "Department", allLabel: "All departments", options: deptOptions },
                  { name: "status", label: "Status", allLabel: "All statuses", options: [{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Archived" }] },
                ]}
              />
              {!structure ? (
                <Skeleton className="mt-4 h-44 w-full" />
              ) : shownTeams.length === 0 ? (
                <EmptyState variant="inline" className="mt-4" title={cardFilters ? "No teams match" : "No teams yet"} description={cardFilters ? "Try a different search or clear the filters." : "Create a team to get started."} />
              ) : (
                <ul aria-label="Teams" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {shownTeams.map((t) => (
                    <li key={t.id} data-team-card={t.name} className="relative flex flex-col gap-3 rounded-2xl border border-line bg-paper p-3.5">
                      <div className="flex items-start gap-3">
                        <GroupTile icon={t.icon} color={t.color} size={44} fallback="users" />
                        <button type="button" onClick={() => setOpenId(t.id)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-accent">
                          <div className="truncate text-[15px] font-bold text-ink">{t.name}</div>
                          <div className="truncate text-[12.5px] text-muted">{t.parentName ?? "No department"}</div>
                        </button>
                        <Menu
                          align="end"
                          trigger={
                            <IconButton aria-label={`Actions for ${t.name}`} title="Actions">
                              <MoreVerticalIcon size={16} />
                            </IconButton>
                          }
                          items={menu(t)}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <AvatarStack people={t.memberPreview} total={t.activeCount} />
                        <GroupStatus status={t.status} />
                      </div>
                      <div className="text-[13px] text-ink-soft">
                        <span className="font-semibold text-ink tabular-nums">{plural(t.activeCount, "member")}</span>
                        {t.lead ? <span className="text-muted"> · led by {t.lead.name}</span> : <span className="text-muted"> · no lead yet</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="mb-3">
                <h2 className="text-[17px] font-bold text-ink">Team Directory</h2>
                <p className="text-[13px] text-muted">Every team, its department, lead and size.</p>
              </div>
              <FilterBar
                query={tq}
                onQueryChange={(v) => {
                  setTq(v);
                  setPage(0);
                }}
                values={{ department: tDept }}
                onFilterChange={(_n, v) => {
                  setTDept(v);
                  setPage(0);
                }}
                search={{ placeholder: "Search teams or team leads…", label: "Search the directory" }}
                filters={[{ name: "department", label: "Department", allLabel: "All departments", options: departments.map((d) => ({ value: String(d.id), label: d.name })) }]}
                className="mb-3"
              />
              <DataTable
                label="Team directory"
                what="the teams"
                columns={columns}
                rows={directory?.items ?? []}
                rowKey={(g) => String(g.id)}
                loading={state === "loading" && !directory}
                error={state === "error" ? error : null}
                onRetry={() => void reload()}
                hasFilters={tq !== "" || tDept !== ""}
                onRowClick={(g) => setOpenId(g.id)}
                rowActions={menu}
                sort={sort}
                onSort={(key) => {
                  setSort((cur) => ({ key, dir: cur.key === key && cur.dir === "asc" ? "desc" : "asc" }));
                  setPage(0);
                }}
                page={page + 1}
                pageCount={directory ? Math.max(1, Math.ceil(directory.total / PAGE_SIZE)) : 1}
                onPage={(p) => setPage(p - 1)}
                empty={<EmptyState variant="inline" title={tq || tDept ? "No teams match" : "No teams yet"} description={tq || tDept ? "Try a different search or clear the filters." : undefined} />}
              />
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Card className="p-4 sm:p-5">
              <h2 className="mb-1 flex items-center gap-2 text-[16px] font-bold text-ink">
                <ChartIcon size={18} className="text-accent" /> Team Performance
              </h2>
              <p data-team-performance-empty className="rounded-xl bg-paper-2/60 px-3 py-4 text-[13px] leading-relaxed text-ink-soft">
                Nothing measures team performance yet. A chart will appear here once teams have assignments and placements to count. Until then we show no numbers rather than invent them.
              </p>
            </Card>

            <Card className="p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[16px] font-bold text-ink">
                <NetworkIcon size={18} className="text-accent" /> Team Structure
              </h2>
              {structure ? <StructureTree structure={structure} onOpen={(g) => setOpenId(g.id)} /> : <Skeleton className="h-40 w-full" />}
            </Card>
          </div>
        </div>
      )}

      {canManage && <CreateGroupSheet orgId={orgId} kind="TEAM" open={creating} onClose={() => setCreating(false)} departments={departments} onCreate={actions.create} />}
      <GroupDetailSheet orgId={orgId} groupId={openId} onClose={() => setOpenId(null)} canManage={canManage} groups={teams} departments={departments} actions={actions} />

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : undefined}
        description="This team is empty. Deleting it cannot be undone."
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
              Delete team
            </Button>
          </div>
        }
      />
    </div>
  );
}
