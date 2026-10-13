"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  CopyIcon,
  DataTable,
  Dialog,
  ErrorState,
  EyeIcon,
  HistoryDrawer,
  Input,
  KeyIcon,
  LayersIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TrashIcon,
  UsersIcon,
  cn,
  useToast,
  type DataTableColumn,
  type HistoryLoader,
  type MenuEntry,
} from "@kiwiply/ui";
import { Button } from "@/components/ui";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { helpLinks } from "@/lib/ent/shell";
import { undoToast } from "@/lib/undo-toast";
import { ClaimsMascot } from "@/components/ent/shell/ShellContext";
import {
  actionLabel,
  assignHref,
  deletable,
  donutGradient,
  draftOf,
  filterRoles,
  historyValues,
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
const DONUT = ["var(--brand-700)", "var(--brand-400)", "var(--brand-2-700)", "var(--brand-2-400)", "var(--brand-200)"]; // config-literal-ok: theme scale steps, never a hex

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: T };

export interface RolesPageProps {
  orgId: number;
  orgName: string;
  /** The workspace slug the page is mounted in (`admin`): where "Assign users" goes. */
  workspace: string;
  /** The caller holds roles.manage at ORG: write actions exist. Everyone else gets a read-only list. */
  canManage: boolean;
  supportEmail?: string | null;
}

/**
 * Roles & Permissions (X4.11; board design/enterprise-admin/roles-permissions.png): the twelve system roles and the organization's
 * own, who holds them, what each can do, and a safe way to make a new one. The numbers are the real counts from
 * `GET /roles/overview` (no trend lines or "vs last month": there is no history to draw). Everything that writes goes through
 * the API's ceiling rule; the page only shows the reason before a click (`grantable`) and the sentence after a refusal.
 */
export default function RolesPage({ orgId, orgName, workspace, canManage, supportEmail }: RolesPageProps) {
  const router = useRouter();
  const toast = useToast();
  const [overview, setOverview] = useState<Load<RolesOverview>>({ status: "loading" });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tab, setTab] = useState("roles");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [seed, setSeed] = useState<CreateSeed | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const historyTrigger = useRef<HTMLElement | null>(null);

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
  const startDuplicate = (row?: Pick<RoleRow, "id" | "name">) => setSeed({ mode: "duplicate", sourceRoleId: row?.id, nonce: ++nonce.current });

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

  const loadHistory: HistoryLoader = useCallback(
    async (limit) => {
      const r = await rolesApi.history(orgId, null, limit);
      if (!r.ok) return { ok: false, error: roleErrorMessage(r) };
      return {
        ok: true,
        data: r.data.map((e) => ({
          id: e.id,
          key: `${actionLabel(e.action)}${e.roleName ? ` · ${e.roleName}` : e.targetLogin ? ` · ${e.targetLogin}` : ""}`,
          ...historyValues(e),
          changedAt: e.at,
          actor: e.actor,
          reason: null,
        })),
      };
    },
    [orgId],
  );

  /* ── the table ───────────────────────────────────────────────────────────── */

  const columns: DataTableColumn<RoleRow>[] = [
    {
      key: "name",
      header: "Role name",
      primary: true,
      render: (r) => (
        <span className="flex min-w-0 items-center gap-3">
          <RoleIcon role={r} />
          <span className="min-w-0 max-w-[200px] lg:max-w-[230px]">
            <span className="block truncate text-[14px] font-semibold text-ink">{r.name}</span>
            {r.description && <span className="block truncate text-[12.5px] font-normal text-muted" title={r.description}>{r.description}</span>}
          </span>
        </span>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      render: (r) => (
        <span data-scope-pill={r.scopeLabel} className={cn("inline-flex rounded-full px-2.5 py-[3px] text-[12px] font-semibold", r.system ? "bg-[var(--brand-subtle,var(--color-accent-soft))] text-[var(--brand-text,var(--color-accent-deep))]" : "bg-brown-soft text-brown-deep")}>
          {r.scopeLabel}
        </span>
      ),
    },
    {
      key: "users",
      header: "Assigned users",
      render: (r) => (
        <span data-assigned-users={r.assignedUsers} className="inline-flex items-center gap-1.5 tabular-nums text-ink-soft">
          <UsersIcon size={15} aria-hidden /> {r.assignedUsers}
        </span>
      ),
    },
    {
      key: "status",
      className: "hidden lg:table-cell",
      header: "Status",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
          {r.status === "ACTIVE" ? "Active" : r.status}
        </span>
      ),
    },
  ];

  /* ── render ──────────────────────────────────────────────────────────────── */

  if (overview.status === "error") {
    return (
      <div data-roles-page className="flex flex-col gap-5">
        <ErrorState what="the roles" description={overview.message} onRetry={() => void refresh()} />
      </div>
    );
  }

  const slices = data?.permissionOverview ?? [];

  return (
    <div data-roles-page data-can-manage={canManage ? "true" : "false"} className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <ClaimsMascot />
      <div data-roles-main className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">

      {/* KPI tiles: real numbers only (no trend lines: there is no history to draw) */}
      <section aria-label="Role totals" className="order-1 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:order-none">
        <Kpi icon={<UsersIcon size={22} />} label="Total Roles" value={data?.totalRoles} note={data ? `${data.systemRoleCount} system · ${data.customRoleCount} custom` : undefined} />
        <Kpi icon={<ClipboardCheckIcon size={22} />} label="Active Users" value={data?.activeUsers} note="with at least one role" />
        <Kpi icon={<LockIcon size={22} />} label="Permission Sets" value={data?.permissionSetCount} note={data ? `${data.totalPermissionKeys} permissions in all` : undefined} />
        <Kpi icon={<KeyIcon size={22} />} label="Custom Roles" value={data?.customRoleCount} note="made by your team" />
      </section>

      {/* tabs + table */}
      <section aria-label="Roles" className="order-3 min-w-0 xl:order-none">
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
          <TabList aria-label="Roles and permission sets">
            <Tab value="roles">
              <UsersIcon size={16} aria-hidden /> Roles
            </Tab>
            <Tab value="sets">
              <ShieldCheckIcon size={16} aria-hidden /> Permission Sets
            </Tab>
          </TabList>
          <TabPanel value="roles" className="pt-4">
            <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-3 sm:p-4">
              <div className="mb-3">
                <h2 className="text-[16px] font-bold text-ink">Role Templates &amp; Custom Roles</h2>
                <p className="text-[13px] text-muted">Manage role assignments and access levels across {orgName}.</p>
              </div>
              <DataTable<RoleRow>
                label="Roles"
                what="the roles"
                columns={columns}
                rows={shown}
                rowKey={(r) => String(r.id)}
                loading={overview.status === "loading"}
                hasFilters={query.trim() !== ""}
                empty={
                  <div className="py-6 text-center text-[13.5px] text-muted">
                    {query.trim() ? "No roles match your search." : "No roles yet."}
                  </div>
                }
                onRowClick={(r) => setEditing(r.id)}
                rowActions={menuFor}
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

      </div>
      <div data-roles-side className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
      {/* controls */}
      <div className="order-2 flex flex-col gap-2 sm:flex-row sm:items-center xl:order-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input type="search" aria-label="Search roles" placeholder="Search roles..." value={query} onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }} className="pl-9" data-role-search />
        </div>
        {canManage && (
          <Button onClick={startCreate} data-create-role-button className="min-h-11 sm:min-h-0">
            <PlusIcon size={16} aria-hidden /> Create Role
          </Button>
        )}
      </div>

      {/* the bee's help card (the page's one mascot: the sidebar's drops its own) */}
      <section aria-label="Help with roles" data-roles-help className="order-6 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper xl:order-1">
        <div className="flex justify-center bg-[var(--brand-subtle,var(--color-accent-soft))] pt-3">
          <EnterpriseMascot pose="thinking" size="md" />
        </div>
        <div className="p-4">
          <h2 className="text-[16px] font-bold text-ink">Need help setting up roles?</h2>
          <p className="mt-1 text-[13px] leading-snug text-muted">I can help you understand permissions, create custom roles, or review access for your team.</p>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-paper px-3 text-left text-[13.5px] font-semibold text-[var(--brand-text,var(--color-accent-deep))] hover:bg-[var(--brand-subtle,var(--color-accent-soft))]"
          >
            <SparklesIcon size={16} aria-hidden className="flex-none" />
            <span className="min-w-0 flex-1 truncate">Ask a question...</span>
            <ChevronRightIcon size={16} aria-hidden className="flex-none" />
          </button>
        </div>
      </section>

      {/* permission overview */}
      <section aria-label="Permission overview" data-permission-overview className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 order-4 xl:order-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <ShieldCheckIcon size={18} aria-hidden className="text-[var(--brand-text,var(--color-accent-deep))]" /> Permission Overview
        </h2>
        <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
          <div
            role="img"
            aria-label={slices.map((s) => `${s.label}: ${s.keys}`).join(", ") || "No permissions"}
            data-donut
            className="relative grid h-36 w-36 flex-none place-items-center rounded-full"
            style={{ background: donutGradient(slices, DONUT) }}
          >
            <div className="grid h-[98px] w-[98px] place-items-center rounded-full bg-paper text-center">
              <div>
                <p className="text-[24px] font-bold leading-none text-ink">{data?.totalPermissionKeys ?? "–"}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted">Permissions</p>
              </div>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 text-[13px]">
            {slices.map((s, i) => (
              <li key={s.category} data-slice={s.category} className="flex items-center gap-2 py-1">
                <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: DONUT[i % DONUT.length] }} />
                <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
                <span className="tabular-nums text-ink-soft">{s.keys}</span>
                <span className="w-10 text-right tabular-nums text-muted">{s.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* quick actions */}
      <section aria-label="Quick actions" data-quick-actions className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 order-5 xl:order-4">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <SparklesIcon size={18} aria-hidden className="text-[var(--brand-text,var(--color-accent-deep))]" /> Quick Actions
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {canManage && <Quick id="create" icon={<PlusIcon size={18} />} label="Create New Role" note="Define a custom role with specific permissions" onClick={startCreate} />}
          {canManage && <Quick id="duplicate" icon={<CopyIcon size={18} />} label="Duplicate Role" note="Create a copy of an existing role" onClick={() => startDuplicate()} />}
          <Quick id="assign" icon={<UsersIcon size={18} />} label="Manage Role Assignments" note="Assign or remove users from roles" onClick={() => router.push(`/w/${workspace}/employees`)} />
          <Quick id="sets" icon={<LayersIcon size={18} />} label="View Permission Sets" note="See how permissions are grouped" onClick={() => setTab("sets")} />
          {canManage && (
            <Quick
              id="audit"
              icon={<ShieldCheckIcon size={18} />}
              label="Audit Role Changes"
              note="View history of role and permission changes"
              onClick={(e) => {
                historyTrigger.current = e.currentTarget;
                setHistoryOpen(true);
              }}
            />
          )}
        </ul>
      </section>

      </div>
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
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        load={loadHistory}
        returnFocusTo={historyTrigger}
        id="roles-history"
        title="Role changes"
        description="Who changed which role, newest first."
        formatKey={(k) => k}
        emptyTitle="No role changes yet."
        emptyDescription="Creating, editing, restoring, deleting and assigning roles all show up here."
        what="the role changes"
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} orgName={orgName} supportEmail={supportEmail} />
    </div>
  );
}

function Kpi({ icon, label, value, note }: { icon: ReactNode; label: string; value?: number; note?: string }) {
  return (
    <div data-kpi={label} className="rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-4">
      <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-subtle,var(--color-accent-soft))] text-[var(--brand-text,var(--color-accent-deep))]">
        {icon}
      </span>
      <p className="mt-3 text-[14px] font-semibold text-ink">{label}</p>
      <p data-kpi-value className="mt-0.5 text-[30px] font-bold leading-none tabular-nums text-ink">
        {value ?? "–"}
      </p>
      {note && <p className="mt-1.5 text-[12px] text-muted">{note}</p>}
    </div>
  );
}

function Quick({ id, icon, label, note, onClick }: { id: string; icon: ReactNode; label: string; note: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <li>
      <button
        type="button"
        data-quick={id}
        onClick={onClick}
        className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2 text-left transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[var(--brand-subtle,var(--color-accent-soft))] text-[var(--brand-text,var(--color-accent-deep))]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink">{label}</span>
          <span className="block truncate text-[12px] text-muted">{note}</span>
        </span>
        <ChevronRightIcon size={16} aria-hidden className="flex-none text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </button>
    </li>
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

function HelpDialog({ open, onClose, orgName, supportEmail }: { open: boolean; onClose: () => void; orgName: string; supportEmail?: string | null }) {
  const links = helpLinks(supportEmail);
  return (
    <Dialog open={open} onClose={onClose} title="Setting up roles" description={`How roles work in ${orgName}.`}>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
        <li>Start from a template (Marketing Manager, HR Specialist, ...) and change what you need. System roles themselves never change.</li>
        <li>You can only give permissions you hold yourself. Anything beyond your access is greyed out with the reason.</li>
        <li>Every permission change is confirmed first and recorded under Audit Role Changes.</li>
        <li>A role nobody holds can be deleted; to move people, use Assign users.</li>
      </ul>
      <p className="mt-3 text-[13px] text-muted">The question assistant isn&apos;t switched on yet. Until it is, these reach a person.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              {...(l.external && l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="flex min-h-11 items-center rounded-xl border border-line px-4 py-2.5 text-[14px] font-semibold text-ink hover:bg-paper-2"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
