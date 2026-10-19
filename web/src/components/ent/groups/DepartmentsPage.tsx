"use client";

import { useMemo, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, BuildingIcon, Button, DataTable, Dialog, EmptyState, ErrorState, FilterBar, PersonCell, Skeleton, useToast, type DataTableColumn, type MenuEntry, PencilIcon, ArchiveIcon, RestoreIcon, TrashIcon, SwapIcon } from "@kiwiply/ui";
import { plural, shortDate, type Group } from "@/lib/ent/groups";
import CreateGroupSheet from "./CreateGroupSheet";
import GroupDetailSheet from "./GroupDetailSheet";
import PersonSearch from "./PersonSearch";
import { GroupStatus, GroupTile } from "./GroupVisuals";
import { StructureTree } from "./StructureViews";
import { useGroupActions, useGroupsData } from "./useGroups";

const PAGE_SIZE = 5;

/**
 * The Departments tab of Teams & Departments (X4.5): one line of counts, the directory (search, status filter, sort, pages) with a row
 * menu, and the structure tree once, under it. Creating a department is the page's header button (`creating`). Everything saves as
 * it is changed; there is no Save button.
 */
export default function DepartmentsPage({ orgId, canManage, creating, onCreatingChange }: { orgId: number | string; canManage: boolean; creating: boolean; onCreatingChange: (open: boolean) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);
  const query = useMemo(() => ({ q: q || undefined, status: status || undefined, sort: sort.key, dir: sort.dir, page, size: PAGE_SIZE }), [q, status, sort, page]);
  const { directory, structure, state, error, reload } = useGroupsData(orgId, "DEPARTMENT", query);
  const actions = useGroupActions(orgId, reload);
  const toast = useToast();

  const [openId, setOpenId] = useState<number | null>(null);
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
  return (
    <div className="grp-page flex flex-col gap-[14px]" data-page="departments" data-ent-page="departments">
      {nothingAtAll ? (
        <EmptyState
          mascotPose="greet"
          title="Group people into departments and teams"
          description="Departments hold teams and the people who run them. Leads and scopes follow from this structure."
          action={canManage ? <Button onClick={() => onCreatingChange(true)}>Create department</Button> : undefined}
        />
      ) : (
        <>
          <p data-group-counts className="text-[14px] text-ink-soft">
            {!s ? <Skeleton className="h-5 w-56" /> : `${s.departments} ${s.departments === 1 ? "department" : "departments"} · ${s.employees} ${s.employees === 1 ? "person" : "people"}`}
          </p>
          <section aria-label="Department directory" className="ent-card p-4 sm:p-5">
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
              filters={[{ name: "status", label: "Status", allLabel: "All departments", options: [{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Archived" }] }]}
              className="xl:flex-nowrap"
            />
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

          <section aria-label="Structure" className="ent-card p-4 sm:p-5">
            <h2 className="mb-3 text-[17px] font-extrabold text-ink">Structure</h2>
            {structure ? <StructureTree structure={structure} onOpen={(g) => setOpenId(g.id)} /> : <Skeleton className="h-40 w-full" />}
          </section>
        </>
      )}

      {canManage && <CreateGroupSheet orgId={orgId} kind="DEPARTMENT" open={creating} onClose={() => onCreatingChange(false)} departments={departments} onCreate={actions.create} />}
      <GroupDetailSheet orgId={orgId} groupId={openId} onClose={() => setOpenId(null)} canManage={canManage} groups={departments} departments={departments} actions={actions} />

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
