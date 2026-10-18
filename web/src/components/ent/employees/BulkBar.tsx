"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Select, SheetFrame } from "@kiwiply/ui";
import type { GroupOption, PersonRef, RoleOption } from "@/lib/ent/members";

export interface BulkCan {
  roles: boolean;
  groups: boolean;
  manager: boolean;
  suspend: boolean;
}

export type BulkDialog = "roles" | "groups" | "manager" | null;

/** The bar that appears when rows are ticked: what can be done to all of them at once. Each button only shows for a permission the member holds. */
export function BulkBar({ count, can, onClear, onOpen, onSuspend, onReinstate }: { count: number; can: BulkCan; onClear: () => void; onOpen: (d: Exclude<BulkDialog, null>) => void; onSuspend: () => void; onReinstate: () => void }) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Bulk actions" data-bulk-bar className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-accent bg-paper px-3 py-2 shadow-[var(--shadow)]">
      <span className="mr-1 text-[13.5px] font-semibold text-ink" aria-live="polite">
        {count} selected
      </span>
      {can.roles && (
        <Button type="button" size="sm" variant="ghost" onClick={() => onOpen("roles")}>
          Change roles
        </Button>
      )}
      {can.groups && (
        <Button type="button" size="sm" variant="ghost" onClick={() => onOpen("groups")}>
          Move to department / team
        </Button>
      )}
      {can.manager && (
        <Button type="button" size="sm" variant="ghost" onClick={() => onOpen("manager")}>
          Set manager
        </Button>
      )}
      {can.suspend && (
        <>
          <Button type="button" size="sm" variant="ghost" onClick={onSuspend}>
            Suspend
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onReinstate}>
            Reinstate
          </Button>
        </>
      )}
      <Button type="button" size="sm" variant="ghost" className="ml-auto border-transparent" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}

/* ── dialogs ─────────────────────────────────────────────────────────────────────── */

export type Outcome = { ok: true } | { ok: false; error: string };

function Frame({ id, open, onClose, title, hint, applyLabel, canApply, onApply, children }: { id: string; open: boolean; onClose: () => void; title: string; hint: string; applyLabel: string; canApply: boolean; onApply: () => Promise<Outcome>; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    const out = await onApply();
    setBusy(false);
    if (out.ok) onClose();
    else setError(out.error);
  }
  return (
    <SheetFrame id={id} open={open} onClose={onClose} title={title}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canApply && !busy) void go();
        }}
      >
        <p className="text-[13.5px] text-ink-soft">{hint}</p>
        {children}
        {error && (
          <p role="alert" className="text-[12.5px] leading-snug text-danger-text">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canApply || busy}>
            {busy ? "Working…" : applyLabel}
          </Button>
        </div>
      </form>
    </SheetFrame>
  );
}

function Checks({ label, roles, value, onChange }: { label: string; roles: RoleOption[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[12.5px] font-semibold text-ink">{label}</legend>
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
        {roles.map((r) => (
          <label key={r.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1.5 text-[13.5px] hover:bg-paper-2">
            <input type="checkbox" checked={value.includes(r.id)} onChange={(e) => onChange(e.target.checked ? [...value, r.id] : value.filter((x) => x !== r.id))} className="h-4 w-4 accent-[var(--brand-primary,var(--color-accent))]" />
            {r.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function RolesDialog({ open, onClose, count, roles, onApply }: { open: boolean; onClose: () => void; count: number; roles: RoleOption[]; onApply: (add: number[], remove: number[]) => Promise<Outcome> }) {
  const [add, setAdd] = useState<number[]>([]);
  const [remove, setRemove] = useState<number[]>([]);
  const clash = add.some((a) => remove.includes(a));
  return (
    <Frame
      id="ent-bulk-roles"
      open={open}
      onClose={onClose}
      title="Change roles"
      hint={`Roles are added to or removed from ${count} ${count === 1 ? "person" : "people"}. Everyone keeps their primary role unless you remove it. Roles above your own access are skipped.`}
      applyLabel="Apply"
      canApply={(add.length > 0 || remove.length > 0) && !clash}
      onApply={async () => {
        const out = await onApply(add, remove);
        if (out.ok) {
          setAdd([]);
          setRemove([]);
        }
        return out;
      }}
    >
      <Checks label="Add these roles" roles={roles} value={add} onChange={setAdd} />
      <Checks label="Remove these roles" roles={roles} value={remove} onChange={setRemove} />
      {clash && <p className="text-[12.5px] text-danger-text">A role can&apos;t be both added and removed.</p>}
    </Frame>
  );
}

const UNSET = "__unset";
const NONE = "__none";
const idOf = (v: string): number | null => (v === NONE ? null : Number(v));

export function MoveDialog({ open, onClose, count, groups, onApply }: { open: boolean; onClose: () => void; count: number; groups: GroupOption[]; onApply: (department: number | null, team: number | null) => Promise<Outcome> }) {
  const [dept, setDept] = useState(UNSET);
  const [team, setTeam] = useState(UNSET);
  const depts = groups.filter((g) => g.kind === "DEPARTMENT");
  const teams = groups.filter((g) => g.kind === "TEAM");
  return (
    <Frame
      id="ent-bulk-groups"
      open={open}
      onClose={onClose}
      title="Move to department / team"
      hint={`Sets the placement of ${count} ${count === 1 ? "person" : "people"}. Choosing only a team also moves them to the team's department.`}
      applyLabel="Move"
      canApply={dept !== UNSET || team !== UNSET}
      onApply={() => onApply(dept === UNSET ? null : idOf(dept), team === UNSET ? null : idOf(team))}
    >
      <label className="block">
        <span className="mb-1 block text-[12.5px] font-semibold text-ink">Department</span>
        <Select aria-label="Department" value={dept} onChange={setDept} options={[{ value: UNSET, label: "Leave to the team" }, { value: NONE, label: "No department" }, ...depts.map((g) => ({ value: String(g.id), label: g.name }))]} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12.5px] font-semibold text-ink">Team</span>
        <Select aria-label="Team" value={team} onChange={setTeam} options={[{ value: UNSET, label: "No team" }, ...teams.map((g) => ({ value: String(g.id), label: g.name }))]} />
      </label>
    </Frame>
  );
}

export function ManagerDialog({ open, onClose, count, managers, onApply }: { open: boolean; onClose: () => void; count: number; managers: PersonRef[]; onApply: (managerId: number | null) => Promise<Outcome> }) {
  const [mgr, setMgr] = useState(UNSET);
  return (
    <Frame
      id="ent-bulk-manager"
      open={open}
      onClose={onClose}
      title="Set manager"
      hint={`Sets who ${count} ${count === 1 ? "person reports" : "people report"} to. A manager can't report to someone who reports to them.`}
      applyLabel="Set manager"
      canApply={mgr !== UNSET}
      onApply={() => onApply(idOf(mgr))}
    >
      <label className="block">
        <span className="mb-1 block text-[12.5px] font-semibold text-ink">Manager</span>
        <Select aria-label="Manager" value={mgr} onChange={setMgr} placeholder="Choose a manager" options={[{ value: UNSET, label: "Choose a manager" }, { value: NONE, label: "No manager" }, ...managers.map((m) => ({ value: String(m.memberId), label: m.name }))]} />
      </label>
    </Frame>
  );
}
