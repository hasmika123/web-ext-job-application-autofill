"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertIcon,
  CopyIcon,
  ErrorState,
  EyeIcon,
  Input,
  Menu,
  MoreHorizontalIcon,
  useNarrow,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TrashIcon,
  UsersIcon,
  cn,
  useToast,
  type MenuEntry,
} from "@kiwiply/ui";
import { Button } from "@/components/ui";
import { undoToast } from "@/lib/undo-toast";
import {
  assignHref,
  deletable,
  draftOf,
  filterRoles,
  roleErrorMessage,
  rolesApi,
  rowsOf,
  type Catalog,
  type CatalogEntry,
  type RoleDetail,
  type RoleRow,
  type RolesOverview,
} from "@/lib/ent/roles";
import CreateRoleDialog, { type CreateSeed } from "./CreateRoleDialog";
import RoleEditor from "./RoleEditor";
import RoleIcon from "./RoleIcon";

const PAGE_SIZE = 15; // config-literal-ok: rows per page of the roles table (UI pagination, not a limit)
const CARD = "ent-card"; // config-literal-ok: the boards' soft card

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: T };

export interface RolesPageProps {
  orgId: number;
  /** The workspace slug the page is mounted in (`admin`): where "Assign users" goes. */
  workspace: string;
  /** The caller holds roles.manage at ORG: write actions exist. Everyone else gets a read-only list. */
  canManage: boolean;
}

/**
 * Roles & Permissions (X4.11; board design/enterprise-admin/roles-permissions.png): the twelve system roles and the organization's
 * own, who holds them, what each can do, and a safe way to make a new one. The numbers are the real counts from
 * `GET /roles/overview` (one line of counts, no tiles: there is no history to draw). Everything that writes goes through
 * the API's ceiling rule; the page only shows the reason before a click (`grantable`) and the sentence after a refusal.
 */
export default function RolesPage({ orgId, workspace, canManage }: RolesPageProps) {
  const router = useRouter();
  const toast = useToast();
  const [overview, setOverview] = useState<Load<RolesOverview>>({ status: "loading" });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tab, setTab] = useState("roles");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [seed, setSeed] = useState<CreateSeed | null>(null);
  const narrow = useNarrow();
  const [banner, setBanner] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await rolesApi.overview(orgId);
    if (r.ok) setOverview({ status: "ok", data: r.data });
    else setOverview({ status: "error", message: roleErrorMessage(r) });
  }, [orgId]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [o, c] = await Promise.all([rolesApi.overview(orgId), rolesApi.catalog(orgId)]);
      if (!live) return;
      if (o.ok) setOverview({ status: "ok", data: o.data });
      else setOverview({ status: "error", message: roleErrorMessage(o) });
      if (c.ok) setCatalog(c.data);
    })();
    return () => {
      live = false;
    };
  }, [orgId]);

  const data = overview.status === "ok" ? overview.data : null;
  const rows = useMemo(() => filterRoles(data?.roles ?? [], query), [data, query]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  /* ── actions ─────────────────────────────────────────────────────────────── */

  const nonce = useRef(0);
  const startCreate = () => setSeed({ mode: "blank", nonce: ++nonce.current });
  const startDuplicate = (row: Pick<RoleRow, "id" | "name">) => setSeed({ mode: "duplicate", sourceRoleId: row.id, nonce: ++nonce.current });

  async function deleteRoleNow(role: RoleRow, then?: () => void) {
    setBanner(null);
    const got = await rolesApi.get(orgId, role.id);
    if (!got.ok) {
      setBanner(roleErrorMessage(got));
      return;
    }
    const detail = got.data;
    const r = await rolesApi.remove(orgId, role.id, detail.version);
    if (!r.ok) {
      setBanner(roleErrorMessage(r));
      return;
    }
    then?.();
    await refresh();
    undoToast(toast, {
      title: `${detail.name} deleted`,
      onUndo: () => {
        void (async () => {
          const back = await rolesApi.create(orgId, {
            name: detail.name,
            ...(detail.description ? { description: detail.description } : {}),
            ...(detail.templateKey ? { templateKey: detail.templateKey } : {}),
            permissions: rowsOf(draftOf(detail.permissions)),
          });
          if (!back.ok) setBanner(roleErrorMessage(back));
          else toast({ title: `${detail.name} is back`, variant: "success" });
          await refresh();
        })();
      },
    });
  }

  async function onCreated(role: RoleDetail) {
    const wasDuplicate = seed?.mode === "duplicate";
    setSeed(null);
    await refresh();
    undoToast(toast, {
      title: `${role.name} ${wasDuplicate ? "duplicated" : "created"}`,
      onUndo: () => {
        void (async () => {
          const fresh = await rolesApi.get(orgId, role.id);
          if (!fresh.ok) return;
          const r = await rolesApi.remove(orgId, role.id, fresh.data.version);
          if (!r.ok) setBanner(roleErrorMessage(r));
          else setEditing((cur) => (cur === role.id ? null : cur));
          await refresh();
        })();
      },
    });
    setEditing(role.id);
  }

  function menuFor(row: RoleRow): MenuEntry[] {
    const items: MenuEntry[] = [
      { label: canManage && !row.system ? "Edit permissions" : "View permissions", icon: canManage && !row.system ? <PencilIcon size={14} /> : <EyeIcon size={14} />, onSelect: () => setEditing(row.id) },
    ];
    if (canManage && row.key !== "OWNER") items.push({ label: "Duplicate", icon: <CopyIcon size={14} />, onSelect: () => startDuplicate(row) });
    items.push({ label: "Assign users", icon: <UsersIcon size={14} />, onSelect: () => router.push(assignHref(workspace, row)) });
    if (canManage && !row.system) {
      items.push({ separator: true });
      items.push({
        label: deletable(row) ? "Delete" : `Delete (used by ${row.assignedUsers})`,
        icon: <TrashIcon size={14} />,
        danger: true,
        disabled: !deletable(row),
        onSelect: () => void deleteRoleNow(row, () => setEditing((cur) => (cur === row.id ? null : cur))),
      });
    }
    return items;
  }

  /* ── render ──────────────────────────────────────────────────────────────── */

  if (overview.status === "error") {
    return (
      <div data-roles-page className="flex flex-col gap-5">
        <ErrorState what="the roles" description={overview.message} onRetry={() => void refresh()} />
      </div>
    );
  }

  return (
    <div data-roles-page data-ent-page="roles" data-can-manage={canManage ? "true" : "false"} className="flex flex-col gap-4">
      <p data-roles-count className="min-h-5 text-[14px] text-ink-soft">
        {data ? `${data.totalRoles} ${data.totalRoles === 1 ? "role" : "roles"} · ${data.customRoleCount} custom` : ""}
      </p>

      <section aria-label="Roles" className="min-w-0">
        {banner && (
          <p role="alert" data-roles-banner className="mb-3 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-[13px] text-ink">
            <AlertIcon size={16} className="mt-0.5 flex-none text-danger" aria-hidden />
            <span className="min-w-0 flex-1">{banner}</span>
            <button type="button" onClick={() => setBanner(null)} className="font-semibold underline" aria-label="Dismiss">
              Dismiss
            </button>
          </p>
        )}
        <Tabs value={tab} onValueChange={setTab} variant="underline">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <TabList aria-label="Roles and permission sets" className="inline-flex w-auto rounded-t-[14px] border border-b-0 border-line/70 bg-paper/80 px-2">
              <Tab value="roles">Roles</Tab>
              <Tab value="sets">Permission sets</Tab>
            </TabList>
            {canManage && (
              <Button variant="accent" onClick={startCreate} data-create-role-button className="min-h-11 rounded-xl px-4 text-[14.5px] font-bold sm:min-h-[42px]">
                <PlusIcon size={16} aria-hidden /> Create role
              </Button>
            )}
          </div>
          <TabPanel value="roles" className="pt-4">
            <div className={cn(CARD, "p-3 sm:p-5")}>
              <div className="relative mb-3 min-w-0">
                <SearchIcon size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input
                  type="search"
                  aria-label="Search roles"
                  placeholder="Search roles..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl pl-9"
                  data-role-search
                />
              </div>
              <RolesTable
                narrow={narrow}
                loading={overview.status === "loading"}
                rows={shown}
                empty={query.trim() ? "No roles match your search." : "No roles yet."}
                onOpen={(r) => setEditing(r.id)}
                menuFor={menuFor}
                page={Math.min(page, pageCount)}
                pageCount={pageCount}
                onPage={setPage}
              />
            </div>
          </TabPanel>
          <TabPanel value="sets" className="pt-4">
            <PermissionSets catalog={catalog} />
          </TabPanel>
        </Tabs>
      </section>

      {/* sheets */}
      {catalog && (
        <RoleEditor
          orgId={orgId}
          roleId={editing}
          catalog={catalog}
          canManage={canManage && catalog.canManage}
          onClose={() => setEditing(null)}
          onChanged={() => void refresh()}
          onDuplicate={(role) => {
            setEditing(null);
            setSeed({ mode: "duplicate", sourceRoleId: role.id, nonce: ++nonce.current });
          }}
        />
      )}
      <CreateRoleDialog orgId={orgId} seed={seed} roles={data?.roles ?? []} onClose={() => setSeed(null)} onCreated={(r) => void onCreated(r)} />
    </div>
  );
}

/** The "Permission Sets" tab: the registry grouped by category and family (read only: doc 05 has no stored permission-set concept). */
function PermissionSets({ catalog }: { catalog: Catalog | null }) {
  if (!catalog) return <p className="py-6 text-center text-[13.5px] text-muted">Loading permission sets…</p>;
  return (
    <div data-permission-sets className="flex flex-col gap-4">
      <p className="text-[13.5px] text-ink-soft">
        A permission set is a group of related permissions. Roles are built from them; this view is read only. {catalog.permissionSets} sets across {catalog.totalKeys} permissions.
      </p>
      {catalog.categories.map((c) => {
        const families = new Map<string, CatalogEntry[]>();
        for (const e of c.permissions) families.set(e.family, [...(families.get(e.family) ?? []), e]);
        return (
          <section key={c.key} aria-label={c.label} data-sets-category={c.key} className="rounded-[var(--radius-lg)] border border-line bg-paper p-3 sm:p-4">
            <h3 className="flex flex-wrap items-baseline justify-between gap-2 text-[15px] font-bold text-ink">
              {c.label}
              <span className="text-[12.5px] font-medium text-muted">
                {c.permissionSets} {c.permissionSets === 1 ? "set" : "sets"} · {c.keyCount} permissions
              </span>
            </h3>
            <div className="mt-2 divide-y divide-line/60">
              {[...families.entries()].map(([family, list]) => (
                <details key={family} className="group py-2" data-set-family={family}>
                  <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-[13.5px] font-semibold capitalize text-ink">
                    <span>{family.replace(/_/g, " ")}</span>
                    <span className="text-[12px] font-medium normal-case text-muted">{list.length} permissions</span>
                  </summary>
                  <ul className="mt-1.5 grid gap-1.5 pl-1">
                    {list.map((e) => (
                      <li key={e.key} className="text-[12.5px] leading-snug text-ink-soft">
                        <span className="font-mono text-[11.5px] text-ink">{e.key}</span> · {e.description}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ── the roles table (the board's: tinted header band, hairline rows, pills, a bordered "..." button) ─────────────────── */

const PILL = "inline-flex rounded-full px-3.5 py-1 text-[13.5px] font-medium";

function ScopePill({ r }: { r: RoleRow }) {
  return (
    <span data-scope-pill={r.scopeLabel} className={cn(PILL, r.system ? "bg-[var(--brand-subtle,var(--color-accent-soft))] text-[var(--brand-text,var(--color-accent-deep))]" : "bg-v2-violet-soft text-v2-violet-ink")}>
      {r.scopeLabel}
    </span>
  );
}

function Assigned({ r }: { r: RoleRow }) {
  return (
    <span data-assigned-users={r.assignedUsers} className="inline-flex items-center gap-2 tabular-nums text-ink-soft">
      <UsersIcon size={17} aria-hidden className="text-[var(--brand-solid,var(--color-accent))]" /> {r.assignedUsers}
    </span>
  );
}

function RowMenu({ items }: { items: MenuEntry[] }) {
  return (
    <Menu
      trigger={
        <button type="button" aria-label="Row actions" title="Row actions" className="grid h-10 w-10 place-items-center rounded-xl border border-line/80 bg-paper text-ink hover:bg-paper-2">
          <MoreHorizontalIcon size={18} aria-hidden />
        </button>
      }
      items={items}
    />
  );
}

function RoleName({ r }: { r: RoleRow }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <RoleIcon role={r} />
      <span className="min-w-0 max-w-[230px] lg:max-w-[260px]">
        <span className="block truncate text-[15px] font-semibold text-ink">{r.name}</span>
        {r.description && (
          <span className="block truncate text-[13px] font-normal text-muted" title={r.description}>
            {r.description}
          </span>
        )}
      </span>
    </span>
  );
}

function RolesTable({
  narrow,
  loading,
  rows,
  empty,
  onOpen,
  menuFor,
  page,
  pageCount,
  onPage,
}: {
  narrow: boolean;
  loading: boolean;
  rows: RoleRow[];
  empty: string;
  onOpen: (r: RoleRow) => void;
  menuFor: (r: RoleRow) => MenuEntry[];
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (loading) return <div role="status" aria-label="Loading roles" className="h-64 animate-pulse rounded-xl bg-paper-2" />;
  if (rows.length === 0) return <div className="py-6 text-center text-[13.5px] text-muted">{empty}</div>;
  const pager =
    pageCount > 1 ? (
      <nav aria-label="Pagination" className="flex items-center justify-end gap-2 pt-3 text-[13px] text-ink-soft">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40">
          Previous
        </button>
        <span className="tabular-nums">
          Page {page} of {pageCount}
        </span>
        <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40">
          Next
        </button>
      </nav>
    ) : null;
  if (narrow) {
    return (
      <div>
        <ul aria-label="Roles" className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[14px] border border-line/70 bg-paper">
              <div className="flex items-start gap-2 p-3">
                <button type="button" onClick={() => onOpen(r)} className="min-h-11 min-w-0 flex-1 text-left">
                  <RoleName r={r} />
                </button>
                <RowMenu items={menuFor(r)} />
              </div>
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 border-t border-line/60 px-3 py-2.5 text-[13px]">
                <dt className="text-muted">Scope</dt>
                <dd>
                  <ScopePill r={r} />
                </dd>
                <dt className="text-muted">Assigned users</dt>
                <dd>
                  <Assigned r={r} />
                </dd>
              </dl>
            </li>
          ))}
        </ul>
        {pager}
      </div>
    );
  }
  const th = "px-3 py-3 text-[14px] font-semibold text-ink";
  const td = "border-b border-line/50 px-3";
  return (
    <div>
      <div className="overflow-x-auto">
        <table aria-label="Roles" className="w-full border-separate border-spacing-0 text-left text-[14px]">
          <thead>
            <tr className="bg-[color-mix(in_srgb,var(--brand-subtle,var(--color-accent-soft))_65%,white)]">
              <th scope="col" className={cn(th, "rounded-l-xl pl-4")}>
                Role name
              </th>
              <th scope="col" className={th}>
                Scope
              </th>
              <th scope="col" className={th}>
                Assigned users
              </th>
              <th scope="col" className={cn(th, "rounded-r-xl text-center")}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => onOpen(r)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onOpen(r);
                  }
                }}
                className="cursor-pointer hover:bg-paper-2/50 focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <td className="border-b border-line/50 py-2.5 pl-3 pr-3">
                  <RoleName r={r} />
                </td>
                <td className={td}>
                  <ScopePill r={r} />
                </td>
                <td className={td}>
                  <Assigned r={r} />
                </td>
                <td className={cn(td, "text-center")} onClick={(e) => e.stopPropagation()}>
                  <RowMenu items={menuFor(r)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pager}
    </div>
  );
}
