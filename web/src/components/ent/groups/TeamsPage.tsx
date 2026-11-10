"use client";

import { useMemo, useState } from "react";
import {
  ArchiveIcon,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  FilterBar,
  PencilIcon,
  PersonCell,
  RestoreIcon,
  Skeleton,
  TrashIcon,
  UsersIcon,
  useToast,
  type DataTableColumn,
  type MenuEntry,
} from "@kiwiply/ui";
import type { Group } from "@/lib/ent/groups";
import CreateGroupSheet from "./CreateGroupSheet";
import GroupDetailSheet from "./GroupDetailSheet";
import { GroupStatus, GroupTile } from "./GroupVisuals";
import { useGroupActions, useGroupsData } from "./useGroups";

const PAGE_SIZE = 8;

/**
 * The Teams tab of Teams & Departments (X4.5): one line of counts and the directory of teams (name, department, lead, members, status)
 * with search, a department filter, sorting and pages. Creating a team is the page's header button (`creating`), a team opens in its
 * sheet, and the structure tree lives on the Departments tab. There is no workload bar, open-roles count or performance chart:
 * nothing measures them yet, so none is drawn.
 */
export default function TeamsPage({ orgId, canManage, creating, onCreatingChange }: { orgId: number | string; canManage: boolean; creating: boolean; onCreatingChange: (open: boolean) => void }) {
  // the directory table: asked of the API
  const [tq, setTq] = useState("");
  const [tDept, setTDept] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);
  const query = useMemo(() => ({ q: tq || undefined, departmentId: tDept || undefined, sort: sort.key, dir: sort.dir, page, size: PAGE_SIZE }), [tq, tDept, sort, page]);
  const { directory, structure, state, error, reload } = useGroupsData(orgId, "TEAM", query);
  const actions = useGroupActions(orgId, reload);
  const toast = useToast();

  const [openId, setOpenId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);

  const departments = useMemo(() => structure?.departments.map((d) => d.group) ?? [], [structure]);
  const teams = useMemo(() => (structure ? [...structure.departments.flatMap((d) => d.teams), ...structure.unassignedTeams] : []), [structure]);
  const s = directory?.summary;

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
  const notInATeam = s ? Math.max(0, s.employees - s.teamMembers) : 0;

  return (
    <div className="grp-page flex flex-col gap-[14px]" data-page="teams" data-ent-page="teams">
      {nothingAtAll ? (
        <EmptyState
          mascotPose="greet"
          title="Group people into departments and teams"
          description="Teams are the groups people work in. Create the first one and name its lead."
          action={canManage ? <Button onClick={() => onCreatingChange(true)}>Create team</Button> : undefined}
        />
      ) : (
        <>
          <div data-group-counts className="text-[14px] text-ink-soft">
            {!s ? <Skeleton className="h-5 w-72" /> : `${s.teams} ${s.teams === 1 ? "team" : "teams"} · ${s.teamMembers} ${s.teamMembers === 1 ? "member" : "members"} · ${notInATeam} ${notInATeam === 1 ? "person" : "people"} not in a team`}
          </div>
          <section aria-label="Team directory" className="ent-card p-4 sm:p-5">
            <FilterBar
              compact
              query={tq}
              onQueryChange={(v) => {
                setTq(v);
                setPage(0);
              }}
              values={{ department: tDept, sort: sort.key === "name" ? "" : sort.key }}
              onFilterChange={(n, v) => {
                if (n === "sort") setSort({ key: v || "name", dir: v === "members" ? "desc" : "asc" });
                else setTDept(v);
                setPage(0);
              }}
              search={{ placeholder: "Search teams or team leads…", label: "Search the directory" }}
              filters={[
                { name: "department", label: "Department", allLabel: "All departments", options: departments.map((d) => ({ value: String(d.id), label: d.name })) },
                { name: "sort", label: "Sort by", allLabel: "Sort by name", options: [{ value: "department", label: "Sort by department" }, { value: "lead", label: "Sort by lead" }, { value: "members", label: "Sort by members" }] },
              ]}
              className="xl:flex-nowrap"
            />
            <div className="mt-4" />
            <DataTable
              variant="board"
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
          </section>
        </>
      )}

      {canManage && <CreateGroupSheet orgId={orgId} kind="TEAM" open={creating} onClose={() => onCreatingChange(false)} departments={departments} onCreate={actions.create} />}
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
