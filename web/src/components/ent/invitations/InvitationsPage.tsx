"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  DataTable,
  cn,
  EmptyState,
  FilterBar,
  MailIcon,
  MinusCircleIcon,
  PersonCell,
  SendIcon,
  StatePill,
  UploadIcon,
  useMediaQuery,
  useNarrow,
  useToast,
  type DataTableColumn,
  type MenuEntry,
} from "@kiwiply/ui";
import { undoToast } from "@/lib/undo-toast";
import PageHeader, { ClaimsMascot } from "@/components/ent/shell/ShellContext";
import {
  INVITATION_DOMAIN,
  RANGES,
  STATUSES,
  STATUS_LABEL,
  bulkSummary,
  displayName,
  invitationsApi,
  problemText,
  shortDate,
  type Invitation,
  type InviteBody,
  type InviteStatus,
  type RangeKey,
} from "@/lib/ent/invitations";
import ActivityFeed from "./ActivityFeed";
import BulkInviteSheet from "./BulkInviteSheet";
import HelpInvitesCard from "./HelpInvitesCard";
import InvitePanel, { type Sent } from "./InvitePanel";
import KpiTiles from "./KpiTiles";
import RevokeConfirm from "./RevokeConfirm";
import Sheet from "./Sheet";
import { useInvitations } from "./useInvitations";

const WIDE = "(min-width: 1280px)"; // config-literal-ok: Tailwind `xl`; below it the invite panel is a sheet

const canResend = (s: InviteStatus) => s === "PENDING" || s === "EXPIRED";
const canRevoke = (s: InviteStatus) => s === "PENDING";

/** The role names of a row: the primary one, and how many more. */
function RolesCell({ row, withDept }: { row: Invitation; withDept: boolean }) {
  if (row.roles.length === 0) return <span className="text-muted">—</span>;
  const [first, ...rest] = [...row.roles].sort((a, b) => Number(b.primary) - Number(a.primary));
  return (
    <span className="block max-w-full" title={row.roles.map((r) => r.name).join(", ")}>
      <span className="inline-flex max-w-full items-center gap-1.5">
        <span className="truncate">{first.name}</span>
        {rest.length > 0 && <span className="flex-none rounded-full bg-paper-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">+{rest.length}</span>}
      </span>
      {/* where the table has no room for a Department column the department sits under the role */}
      {withDept && row.department && <span className="block truncate text-[12px] text-muted @[760px]:hidden">{row.department.name}</span>}
    </span>
  );
}

function Checkbox({ checked, indeterminate, label, onChange }: { checked: boolean; indeterminate?: boolean; label: string; onChange: (v: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />;
}

/**
 * The Invitations page (design/enterprise-admin/invitations.png), connected to the real API through the BFF: four counters, the
 * filtered and paged table with row and bulk actions, the invite panel (also the create form), the recent-activity feed and the help
 * card. Everything is undoable or confirmed: a single revoke acts at once and the toast offers Undo, a bulk revoke asks for the word.
 * The API is the gate for all of it; `canInvite` only decides what is drawn.
 */
export default function InvitationsPage({ orgId, orgName, supportEmail, canInvite = true }: { orgId: number | string; orgName: string; supportEmail?: string | null; canInvite?: boolean }) {
  const toast = useToast();
  const narrow = useNarrow();
  const wide = useMediaQuery(WIDE, false);
  const inv = useInvitations(orgId);
  const { query, list, options } = inv;

  const [panelClosed, setPanelClosed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmRevoke, setConfirmRevoke] = useState(0);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const openInvite = () => {
    if (wide) {
      setPanelClosed(false);
      setFocusSignal((n) => n + 1);
    } else setSheetOpen(true);
  };

  /* ── single-row actions ─────────────────────────────────────────────────────── */

  const mark = (id: number, on: boolean) =>
    setBusyIds((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const reinvite = useCallback(
    async (row: Invitation) => {
      const body: InviteBody = {
        emails: [row.email],
        roleIds: [...row.roles].sort((a, b) => Number(b.primary) - Number(a.primary)).map((r) => r.id),
        ...(row.name ? { fullName: row.name } : {}),
        ...(row.department ? { departmentGroupId: row.department.id } : {}),
        ...(row.message ? { message: row.message } : {}),
      };
      const r = await invitationsApi.invite(orgId, body);
      if (!r.ok || r.data.rows?.[0]?.status === "INVALID") toast({ title: "Couldn't bring the invitation back", description: r.ok ? "Invite them again from the panel." : problemText(r), variant: "error" });
      await inv.reload();
    },
    [orgId, toast, inv],
  );

  async function resendOne(row: Invitation) {
    const snapshot = { ...list };
    inv.patchRow(row.id, (x) => ({ ...x, status: "PENDING", endedAt: null }));
    mark(row.id, true);
    const r = await invitationsApi.resend(orgId, row.id);
    mark(row.id, false);
    if (!r.ok) {
      inv.restore(snapshot);
      toast({ title: "Couldn't resend", description: problemText(r), variant: "error" });
      return;
    }
    toast({ title: "Invitation sent again", description: `A new link is on its way to ${row.email}.`, variant: "success" });
    await inv.reload();
  }

  async function revokeOne(row: Invitation) {
    const snapshot = { ...list };
    inv.patchRow(row.id, (x) => (query.status && query.status !== "REVOKED" ? null : { ...x, status: "REVOKED" }));
    mark(row.id, true);
    const r = await invitationsApi.revoke(orgId, row.id);
    mark(row.id, false);
    if (!r.ok) {
      inv.restore(snapshot);
      toast({ title: "Couldn't revoke", description: problemText(r), variant: "error" });
      return;
    }
    undoToast(toast, { title: "Invitation revoked", description: row.email, onUndo: () => void reinvite(row) });
    await inv.refreshSide();
  }

  /** The Undo of "Invite sent": find the invitation that was just made (the API does not hand back its id) and revoke it. */
  async function undoSent(sent: Sent) {
    const found = await invitationsApi.list(orgId, { ...query, status: "PENDING", roleId: "", departmentGroupId: "", range: "all", q: sent.email, page: 1, size: 5 });
    const row = found.ok ? found.data.items.find((i) => i.email.toLowerCase() === sent.email.toLowerCase()) : undefined;
    const r = row ? await invitationsApi.revoke(orgId, row.id) : null;
    if (!r || !r.ok) toast({ title: "Couldn't undo", description: "Revoke it from the table instead.", variant: "error" });
    else toast({ title: "Invitation cancelled", description: sent.email });
    await inv.reload();
  }

  function onSent(sent: Sent) {
    setSheetOpen(false);
    undoToast(toast, { title: "Invite sent", description: sent.email, onUndo: () => void undoSent(sent) });
    inv.setFilter({ page: 1 });
    void inv.reload();
  }

  /* ── bulk actions ───────────────────────────────────────────────────────────── */

  // a selection only means rows still on this page (a page or filter change leaves old ids behind, harmlessly)
  const selectedRows = list.items.filter((i) => selected.has(i.id));

  async function bulkResend() {
    const ids = selectedRows.filter((r) => canResend(r.status)).map((r) => r.id);
    if (ids.length === 0) return toast({ title: "Nothing to resend", description: "Only pending or expired invitations can be sent again.", variant: "error" });
    const r = await invitationsApi.bulkResend(orgId, ids);
    if (!r.ok) return toast({ title: "Couldn't resend", description: problemText(r), variant: "error" });
    toast({ title: bulkSummary(r.data.results, "resent"), variant: r.data.results.every((x) => x.status === "OK") ? "success" : "default" });
    setSelected(new Set());
    await inv.reload();
  }

  async function bulkRevoke() {
    const ids = selectedRows.filter((r) => canRevoke(r.status)).map((r) => r.id);
    if (ids.length === 0) return toast({ title: "Nothing to revoke", description: "Only pending invitations can be revoked.", variant: "error" });
    const r = await invitationsApi.bulkRevoke(orgId, ids);
    if (!r.ok) return toast({ title: "Couldn't revoke", description: problemText(r), variant: "error" });
    toast({ title: bulkSummary(r.data.results, "revoked"), variant: r.data.results.every((x) => x.status === "OK") ? "success" : "default" });
    setSelected(new Set());
    await inv.reload();
  }

  /* ── table ──────────────────────────────────────────────────────────────────── */

  const allOnPage = list.items.length > 0 && list.items.every((i) => selected.has(i.id));
  const someOnPage = list.items.some((i) => selected.has(i.id));
  const toggle = (id: number, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const baseColumns: DataTableColumn<Invitation>[] = [
    ...(canInvite
      ? [
          {
            key: "select",
            header: <Checkbox checked={allOnPage} indeterminate={someOnPage} label="Select all invitations on this page" onChange={(v) => setSelected(v ? new Set(list.items.map((i) => i.id)) : new Set())} />,
            headerLabel: "Select",
            hideOnMobile: true,
            className: "w-9 !pr-0",
            render: (r: Invitation) => <Checkbox checked={selected.has(r.id)} label={`Select ${displayName(r)}`} onChange={(v) => toggle(r.id, v)} />,
          } satisfies DataTableColumn<Invitation>,
        ]
      : []),
    {
      key: "name",
      header: "Name",
      primary: true,
      className: "min-w-40 max-w-[14rem]",
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          {canInvite && narrow && <Checkbox checked={selected.has(r.id)} label={`Select ${displayName(r)}`} onChange={(v) => toggle(r.id, v)} />}
          <PersonCell name={displayName(r)} avatarName={displayName(r)} size={32} sub={narrow ? undefined : <span className="@[1040px]:hidden">{r.email}</span>} />
        </span>
      ),
    },
    { key: "email", header: "Email", className: "hidden @[1040px]:table-cell", render: (r) => <span className="block max-w-56 truncate text-ink-soft">{r.email}</span> },
    { key: "roles", header: "Role", className: "max-w-44 whitespace-nowrap", render: (r) => <RolesCell row={r} withDept={!narrow} /> },
    { key: "department", header: "Department", className: "hidden whitespace-nowrap @[760px]:table-cell", render: (r) => r.department?.name ?? <span className="text-muted">—</span> },
    { key: "invitedBy", header: "Invited By", className: "hidden whitespace-nowrap @[760px]:table-cell", render: (r) => r.invitedBy?.name ?? <span className="text-muted">—</span> },
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      render: (r) => (
        <span title={r.status === "PENDING" && r.expiresAt ? `Expires ${shortDate(r.expiresAt)}` : undefined} data-invitation-status={r.status}>
          <StatePill domain={INVITATION_DOMAIN} state={r.status} label={STATUS_LABEL[r.status]} />
        </span>
      ),
    },
    { key: "invitedAt", header: "Invited On", className: "whitespace-nowrap", render: (r) => (
        <>
          {shortDate(r.invitedAt)}
          {!narrow && r.invitedBy?.name && <span className="block text-[12px] text-muted @[760px]:hidden">by {r.invitedBy.name}</span>}
        </>
      ),
    },
  ];

  // tighter cells than the kit's default: the table shares the row with the invite panel
  const columns = baseColumns.map((c) => ({ ...c, className: cn(c.className, "px-2!") }));

  const rowActions = canInvite
    ? (row: Invitation): MenuEntry[] => {
        const items: MenuEntry[] = [];
        const busy = busyIds.has(row.id);
        if (canResend(row.status)) items.push({ label: "Resend", icon: <SendIcon size={15} />, disabled: busy, onSelect: () => void resendOne(row) });
        if (canRevoke(row.status)) items.push({ label: "Revoke", icon: <MinusCircleIcon size={15} />, danger: true, disabled: busy, onSelect: () => void revokeOne(row) });
        if (items.length === 0) items.push({ label: row.status === "ACCEPTED" ? "Already accepted" : "Nothing to do", disabled: true, onSelect: () => {} });
        return items;
      }
    : undefined;

  const filterValues = { status: query.status, roleId: query.roleId, departmentGroupId: query.departmentGroupId, range: query.range === "all" ? "" : query.range };
  const empty = !list.loading && !list.error && inv.counts !== null && inv.counts.total === 0 && !inv.filtered;
  const showPanel = canInvite && wide && !panelClosed;
  const from = list.total === 0 ? 0 : (query.page - 1) * query.size + 1;
  const to = Math.min(list.total, query.page * query.size);

  return (
    <div data-invitations-page className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Invitations" subtitle="Invite and manage your organization's team members." />
      <ClaimsMascot />

      <KpiTiles counts={inv.counts} failed={inv.countsError} onRetry={() => void inv.refreshSide()} />

      <div className={showPanel ? "grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" : "grid gap-4"}>
        {empty ? (
          <section aria-label="Employee Invitations" className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 sm:p-5">
            <EmptyState
              mascotPose="empty"
              title="No invitations yet"
              description="Invite the people who will use this workspace. They get an email with a link to join."
              action={
                canInvite ? (
                  <Button type="button" variant="accent" size="lg" onClick={openInvite}>
                    <MailIcon aria-hidden size={18} />
                    Invite your first teammate
                  </Button>
                ) : undefined
              }
            />
          </section>
        ) : (
          <section aria-labelledby="inv-table-h" className="@container min-w-0 rounded-[var(--radius-lg)] border border-line bg-paper p-3 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="inv-table-h" className="text-[18px] font-bold text-ink">
                Employee Invitations
              </h2>
              {canInvite && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="ghost" onClick={() => setBulkOpen(true)} className="min-h-11 border-accent text-accent-deep sm:min-h-0">
                    <UploadIcon aria-hidden size={16} />
                    Bulk Invite
                  </Button>
                  <Button type="button" variant="accent" onClick={openInvite} className="min-h-11 sm:min-h-0">
                    <span aria-hidden className="text-[18px] leading-none">+</span>
                    Invite Employee
                  </Button>
                </div>
              )}
            </div>

            <FilterBar
              className="mt-4"
              query={query.q}
              onQueryChange={(q) => inv.setFilter({ q })}
              values={filterValues}
              onFilterChange={(name, value) => inv.setFilter(name === "range" ? { range: (value || "all") as RangeKey } : ({ [name]: value } as Partial<typeof query>))}
              search={{ placeholder: "Search by name, email, or role...", label: "Search invitations" }}
              filters={[
                { name: "status", label: "Status", allLabel: "All Statuses", options: STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
                { name: "roleId", label: "Role", allLabel: "All Roles", options: (options?.roles ?? []).map((r) => ({ value: String(r.id), label: r.name })) },
                { name: "departmentGroupId", label: "Department", allLabel: "All Departments", options: (options?.departments ?? []).map((d) => ({ value: String(d.id), label: d.name })) },
                { name: "range", label: "Invited on", allLabel: "All time", options: RANGES.filter((r) => r.value !== "all").map((r) => ({ value: r.value, label: r.label })) },
              ]}
            />

            {selectedRows.length > 0 && canInvite && (
              <div role="region" aria-label="Bulk actions" data-bulk-bar className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-accent/40 bg-accent-soft/60 px-3 py-2">
                <span className="mr-auto text-[13.5px] font-semibold text-accent-deep" aria-live="polite">
                  {selectedRows.length} selected
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => void bulkResend()} className="min-h-11 sm:min-h-0">
                  <SendIcon aria-hidden size={14} />
                  Resend selected
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRevoke(selectedRows.length)} className="min-h-11 text-danger-text sm:min-h-0">
                  <MinusCircleIcon aria-hidden size={14} />
                  Revoke selected
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="min-h-11 sm:min-h-0">
                  Clear
                </Button>
              </div>
            )}

            <p role="status" aria-live="polite" className="mb-2 mt-3 text-[12.5px] text-muted">
              {list.loading || list.error ? "" : list.total === 0 ? "No invitations to show" : `Showing ${from}–${to} of ${list.total}`}
            </p>
            <DataTable
              label="Invitations"
              what="the invitations"
              columns={columns}
              rows={list.items}
              rowKey={(r) => String(r.id)}
              loading={list.loading && list.items.length === 0}
              error={list.error}
              onRetry={() => void inv.load(query)}
              hasFilters={inv.filtered}
              empty={<EmptyState variant="inline" title={inv.filtered ? "No invitations match" : "No invitations here"} description={inv.filtered ? "Try a different search or clear the filters." : undefined} />}
              rowActions={rowActions}
              page={query.page}
              pageCount={inv.pageCount}
              onPage={(p) => inv.setFilter({ page: p })}
            />
          </section>
        )}

        {showPanel && (
          <aside aria-label="Invite Employee" className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 sm:p-5 xl:sticky xl:top-4">
            <InvitePanel orgId={orgId} options={options} onSent={onSent} onClose={() => setPanelClosed(true)} focusSignal={focusSignal} />
          </aside>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ActivityFeed items={inv.activity} />
        <HelpInvitesCard orgName={orgName} supportEmail={supportEmail} bee={!empty} />
      </div>

      {canInvite && (
        <>
          <Sheet id="invitations-invite-sheet" open={sheetOpen && !wide} onClose={() => setSheetOpen(false)} title="Invite Employee">
            <InvitePanel orgId={orgId} options={options} onSent={onSent} headingId="invite-sheet-h" />
          </Sheet>
          <BulkInviteSheet
            open={bulkOpen}
            onClose={() => setBulkOpen(false)}
            orgId={orgId}
            options={options}
            onDone={(n) => {
              toast({ title: `${n} ${n === 1 ? "invitation" : "invitations"} sent`, variant: "success" });
              inv.setFilter({ page: 1 });
              void inv.reload();
            }}
          />
          <RevokeConfirm count={confirmRevoke} onClose={() => setConfirmRevoke(0)} onConfirm={bulkRevoke} />
        </>
      )}
    </div>
  );
}
