"use client";

import { useState } from "react";
import { useToast } from "@kiwiply/ui";
import { errorSentence, membersApi, type MemberDetail, type RoleOption } from "@/lib/ent/members";
import { RoleChips } from "./parts";

/**
 * Access & Roles: the member's roles and the picker. One tick adds or removes a role, the star makes it primary; every change is ONE
 * `PUT /members/{id}/roles` with the whole set (X1.14), shown at once and put back with the reason if the API refuses. The API is the
 * ceiling: a role above the editor's own access answers 422 ROLE_CEILING and that reason is shown right under the picker.
 */
export default function AccessRolesTab({ orgId, detail, roles, selfId, onChanged }: { orgId: number | string; detail: MemberDetail; roles: RoleOption[]; selfId: number; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [pending, setPending] = useState<{ ids: number[]; primary: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const held = detail.roles.filter((r) => r.roleId !== null);
  const shownIds = pending?.ids ?? held.map((r) => r.roleId as number);
  const shownPrimary = pending?.primary ?? held.find((r) => r.primary)?.roleId ?? shownIds[0];
  const isSelf = detail.id === selfId;
  const editable = detail.actions.manageRoles && !isSelf && roles.length > 0;

  async function apply(ids: number[], primary: number) {
    if (ids.length === 0) {
      setError("A person keeps at least one role.");
      return;
    }
    setPending({ ids, primary });
    setError(null);
    setBusy(true);
    const r = await membersApi.setRoles(orgId, detail.id, ids, primary);
    if (!r.ok) {
      setBusy(false);
      setPending(null);
      setError(errorSentence(r));
      return;
    }
    toast({ title: "Roles updated", variant: "success" });
    await onChanged(); // the reloaded person replaces the optimistic picture
    setBusy(false);
    setPending(null);
  }

  const toggle = (id: number) => {
    const has = shownIds.includes(id);
    const ids = has ? shownIds.filter((x) => x !== id) : [...shownIds, id];
    const primary = has && id === shownPrimary ? ids[0] : shownPrimary;
    void apply(ids, primary as number);
  };

  return (
    <div className="space-y-4" data-tab-panel="access">
      <section aria-label="Current roles">
        <h3 className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-[.04em] text-muted">Current roles</h3>
        <RoleChips roles={detail.roles} max={6} />
      </section>

      {isSelf && <p className="rounded-lg bg-paper-2 p-3 text-[13px] text-ink-soft">You can&apos;t change your own roles. Ask another administrator.</p>}
      {!isSelf && !detail.actions.manageRoles && <p className="rounded-lg bg-paper-2 p-3 text-[13px] text-ink-soft">You can see this person&apos;s roles, but changing them is not part of your access.</p>}
      {roles.length === 0 && detail.actions.manageRoles && <p className="rounded-lg bg-paper-2 p-3 text-[13px] text-ink-soft">The roles of this organization couldn&apos;t be loaded.</p>}

      {editable && (
        <fieldset disabled={busy} aria-label="Role picker" className="space-y-1" data-role-picker>
          <legend className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-[.04em] text-muted">Roles</legend>
          {roles.map((r) => {
            const on = shownIds.includes(r.id);
            return (
              <div key={r.id} className={`flex items-start gap-2 rounded-lg border p-2.5 ${on ? "border-accent bg-accent-soft/40" : "border-line"}`}>
                <input
                  id={`role-${r.id}`}
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(r.id)}
                  className="mt-0.5 h-4 w-4 flex-none cursor-pointer accent-[var(--brand-primary,var(--color-accent))]"
                />
                <label htmlFor={`role-${r.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-[13.5px] font-semibold text-ink">{r.name}</span>
                  {r.description && <span className="block text-[12px] leading-snug text-muted">{r.description}</span>}
                </label>
                {on && (
                  <button
                    type="button"
                    onClick={() => void apply(shownIds, r.id)}
                    disabled={r.id === shownPrimary}
                    aria-pressed={r.id === shownPrimary}
                    title={r.id === shownPrimary ? "Primary role" : `Make ${r.name} the primary role`}
                    className={`flex-none rounded-full px-2 py-1 text-[11.5px] font-semibold ${r.id === shownPrimary ? "bg-accent text-on-accent" : "border border-line text-ink-soft hover:bg-paper-2"}`}
                  >
                    {r.id === shownPrimary ? "Primary" : "Make primary"}
                  </button>
                )}
              </div>
            );
          })}
        </fieldset>
      )}

      {error && (
        <p role="alert" data-role-error className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-[12.5px] leading-snug text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
