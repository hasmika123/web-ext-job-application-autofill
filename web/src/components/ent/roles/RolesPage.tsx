"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  CopyIcon,
  Dialog,
  ErrorState,
  EyeIcon,
  HistoryDrawer,
  Input,
  KeyIcon,
  KpiTile,
  Menu,
  MoreHorizontalIcon,
  FileTextIcon,
  GearIcon,
  ZapIcon,
  useNarrow,
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
const DONUT = ["var(--brand-solid, var(--color-accent))", "var(--color-v2-teal)", "var(--color-v2-amber)", "var(--color-v2-violet)", "var(--color-v2-pink)"]; // config-literal-ok: the board's five category hues (primary + fixed families), never a hex
const CARD = "ent-card"; // config-literal-ok: the boards' soft card

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
  const narrow = useNarrow();
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
    <div data-roles-page data-ent-page="roles" data-can-manage={canManage ? "true" : "false"} className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_clamp(320px,20.3vw,340px)] xl:items-start xl:gap-[14px]">
      <ClaimsMascot />
      <div data-roles-main className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">

      {/* KPI tiles: real numbers only (no trend lines: there is no history to draw) */}
      <section aria-label="Role totals" className="order-1 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:order-none">
        <KpiTile id="Total Roles" tone="violet" label="Total Roles" icon={<UsersIcon size={24} />} value={data?.totalRoles ?? "–"} loading={!data} />
        <KpiTile id="Active Users" tone="green" label="Active Users" icon={<ClipboardCheckIcon size={24} />} value={data?.activeUsers ?? "–"} loading={!data} />
        <KpiTile id="Permission Sets" tone="blue" label="Permission Sets" icon={<LockIcon size={24} />} value={data?.permissionSetCount ?? "–"} loading={!data} />
        <KpiTile id="Custom Roles" tone="orange" label="Custom Roles" icon={<KeyIcon size={24} />} value={data?.customRoleCount ?? "–"} loading={!data} />
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
          <TabList aria-label="Roles and permission sets" className="inline-flex w-auto rounded-t-[14px] border border-b-0 border-line/70 bg-paper/80 px-2">
            <Tab value="roles">
              <UsersIcon size={16} aria-hidden /> Roles
            </Tab>
            <Tab value="sets">
              <ShieldCheckIcon size={16} aria-hidden /> Permission Sets
            </Tab>
          </TabList>
          <TabPanel value="roles" className="pt-4">
            <div className={cn(CARD, "p-3 sm:p-5")}>
              <div className="mb-3 flex items-start gap-3">
                <UsersIcon size={22} aria-hidden className="mt-0.5 flex-none text-[var(--brand-solid,var(--color-accent))]" />
                <div className="min-w-0">
                <h2 className="text-[17px] font-bold leading-tight text-ink">Role Templates &amp; Custom Roles</h2>
                <p className="mt-0.5 text-[13.5px] text-muted">Manage role assignments and access levels across {orgName}.</p>
                </div>
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

      </div>
      <div data-roles-side className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
      {/* controls */}
      <div className={cn(CARD, "order-2 flex flex-col gap-2 p-2 sm:flex-row sm:items-center xl:order-2")}>
        <div className="relative min-w-0 flex-1">
          <SearchIcon size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input type="search" aria-label="Search roles" placeholder="Search roles..." value={query} onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }} className="rounded-xl pl-9" data-role-search />
        </div>
        {canManage && (
          <Button variant="accent" onClick={startCreate} data-create-role-button className="min-h-11 rounded-xl px-4 text-[14.5px] font-bold sm:min-h-[42px]">
            <PlusIcon size={16} aria-hidden /> Create Role
          </Button>
        )}
      </div>

      {/* the bee's help card (the page's one mascot: the sidebar's drops its own) */}
      <section aria-label="Help with roles" data-roles-help className={cn(CARD, "order-6 overflow-hidden xl:order-1")}>
        <div className="flex justify-center bg-[linear-gradient(180deg,var(--brand-subtle,var(--color-accent-soft)),color-mix(in_srgb,var(--color-v2-amber-soft)_70%,white))] pt-3">
          <EnterpriseMascot pose="thinking" size="md" />
        </div>
        <div className="p-4">
          <h2 className="text-[18px] font-bold text-ink">Need help setting up roles?</h2>
          <p className="mt-1.5 text-[14px] leading-snug text-ink-soft">I can help you understand permissions, create custom roles, or review access for your team.</p>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-[var(--brand-subtle,var(--color-accent-soft))]/50 px-3 text-left text-[14.5px] font-semibold text-[var(--brand-text,var(--color-accent-deep))] hover:bg-[var(--brand-subtle,var(--color-accent-soft))]"
          >
            <SparklesIcon size={16} aria-hidden className="flex-none" />
            <span className="min-w-0 flex-1 truncate">Ask a question...</span>
            <ChevronRightIcon size={16} aria-hidden className="flex-none" />
          </button>
        </div>
      </section>

      {/* permission overview */}
      <section aria-label="Permission overview" data-permission-overview className={cn(CARD, "p-4 order-4 xl:order-3")}>
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <ShieldCheckIcon size={20} aria-hidden className="text-[var(--brand-solid,var(--color-accent))]" /> Permission Overview
        </h2>
        <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row xl:flex-col 2xl:flex-row">
          <div
            role="img"
            aria-label={slices.map((s) => `${s.label}: ${s.keys}`).join(", ") || "No permissions"}
            data-donut
            className="relative grid h-[116px] w-[116px] flex-none place-items-center rounded-full"
            style={{ background: donutGradient(slices, DONUT, 0.8) }}
          >
            <div className="grid h-[78px] w-[78px] place-items-center rounded-full bg-paper text-center">
              <div>
                <p className="text-[22px] font-extrabold leading-none text-ink">{data?.totalPermissionKeys ?? "–"}</p>
                <p className="mt-0.5 text-[10px] leading-tight text-muted">Permissions</p>
              </div>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 text-[13px]">
            {slices.map((s, i) => (
              <li key={s.category} data-slice={s.category} className="flex items-center gap-2 py-[5px]">
                <span aria-hidden className="h-3 w-3 flex-none rounded-full" style={{ background: DONUT[i % DONUT.length] }} />
                <span className="min-w-0 flex-1 truncate text-ink-soft">{s.label}</span>
                <span className="font-bold tabular-nums text-ink">{s.keys}</span>
                <span className="w-9 text-right tabular-nums text-ink-soft">{s.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* quick actions */}
      <section aria-label="Quick actions" data-quick-actions className={cn(CARD, "p-4 order-5 xl:order-4")}>
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <ZapIcon size={20} aria-hidden className="text-[var(--brand-solid,var(--color-accent))]" /> Quick Actions
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {canManage && <Quick id="create" tone="blue" icon={<PlusIcon size={18} />} label="Create New Role" note="Define a custom role with specific permissions" onClick={startCreate} />}
          {canManage && <Quick id="duplicate" tone="violet" icon={<FileTextIcon size={18} />} label="Duplicate Role" note="Create a copy of an existing role" onClick={() => startDuplicate()} />}
          <Quick id="assign" tone="green" icon={<UsersIcon size={18} />} label="Manage Role Assignments" note="Assign or remove users from roles" onClick={() => router.push(`/w/${workspace}/employees`)} />
          <Quick id="sets" tone="accent" icon={<ShieldCheckIcon size={18} />} label="View Permission Sets" note="See how permissions are grouped" onClick={() => setTab("sets")} />
          {canManage && (
            <Quick
              id="audit"
              tone="violet"
              icon={<GearIcon size={18} />}
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

const QUICK_TONES = {
  blue: "bg-[var(--brand-solid,var(--color-accent))] text-[var(--color-on-accent)]",
  violet: "bg-v2-violet-soft text-v2-violet-ink",
  green: "bg-v2-green-soft text-v2-green-ink",
  accent: "bg-[var(--brand-subtle,var(--color-accent-soft))] text-[var(--brand-text,var(--color-accent-deep))]",
} as const;

function Quick({ id, icon, label, note, onClick, tone }: { tone: keyof typeof QUICK_TONES; id: string; icon: ReactNode; label: string; note: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <li>
      <button
        type="button"
        data-quick={id}
        onClick={onClick}
        className="group flex min-h-[58px] w-full items-center gap-3 rounded-[14px] border border-line/70 bg-paper px-2.5 py-2 text-left shadow-[0_1px_2px_rgba(16,40,90,0.04)] transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-[11px]", QUICK_TONES[tone])}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-ink">{label}</span>
          <span className="block truncate text-[12.5px] text-muted">{note}</span>
        </span>
        <ChevronRightIcon size={16} aria-hidden className="flex-none text-[var(--brand-solid,var(--color-accent))] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
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


/* ── the roles table (the board's: tinted header band, hairline rows, pills, a bordered "..." button) ─────────────────── */

const PILL = "inline-flex rounded-full px-3.5 py-1 text-[13.5px] font-medium";

function ScopePill({ r }: { r: RoleRow }) {
  return (
    <span data-scope-pill={r.scopeLabel} className={cn(PILL, r.system ? "bg-[var(--brand-subtle,var(--color-accent-soft))] text-[var(--brand-text,var(--color-accent-deep))]" : "bg-v2-violet-soft text-v2-violet-ink")}>
      {r.scopeLabel}
    </span>
  );
}

function StatusPill({ r }: { r: RoleRow }) {
  return (
    <span className={cn(PILL, "items-center gap-1.5 bg-v2-green-soft text-v2-green-ink")}>
      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-v2-green" />
      {r.status === "ACTIVE" ? "Active" : r.status}
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
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusPill r={r} />
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
                Role Name
              </th>
              <th scope="col" className={th}>
                Scope
              </th>
              <th scope="col" className={th}>
                Assigned Users
              </th>
              <th scope="col" className={cn(th, "hidden lg:table-cell")}>
                Status
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
                <td className={cn(td, "hidden lg:table-cell")}>
                  <StatusPill r={r} />
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
