"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertIcon, CheckIcon, CopyIcon, ErrorState, Input, LockIcon, RefreshIcon, SearchIcon, SideSheet, Skeleton, Switch, Textarea, Tooltip, UndoIcon, cn, useNarrow, useToast } from "@kiwiply/ui";
import { Button, Field } from "@/components/ui";
import {
  ceilingKey,
  choiceFor,
  draftOf,
  entryMap,
  isConflict,
  matchesQuery,
  reasonText,
  roleErrorMessage,
  rolesApi,
  rowsOf,
  scopeLabel,
  summarize,
  type ApiFail,
  type Catalog,
  type CatalogEntry,
  type ChangeSummary,
  type Draft,
  type RoleDetail,
  type Scope,
  type TemplateDiff,
} from "@/lib/ent/roles";
import ConfirmChangesDialog, { type ConfirmSpec } from "./ConfirmChangesDialog";

const NAME_MAX = 80; // config-literal-ok: mirrors the API's role name limit (the API is the gate)
const DESCRIPTION_MAX = 255; // config-literal-ok: mirrors the API's description limit

export interface RoleEditorProps {
  orgId: number;
  roleId: number | null;
  catalog: Catalog;
  /** The caller holds roles.manage (ORG): write controls exist. Everyone else gets a read-only view. */
  canManage: boolean;
  onClose: () => void;
  /** A write succeeded (or the role was restored): the page reloads its table and counts. */
  onChanged: () => void;
  /** "Duplicate to customise" (a system role, or any role the viewer cannot change). */
  onDuplicate: (role: RoleDetail) => void;
}

type Load = { id: number | null; status: "loading" } | { id: number | null; status: "error"; message: string } | { id: number | null; status: "ok"; detail: RoleDetail };

/**
 * The role editor (X4.11): one role's permissions, grouped by the five board categories, one scope choice per key. What the caller
 * may not grant is disabled with the reason (from the catalog's `grantable`, so nobody hits a surprise 422). Permissions are NOT
 * autosaved: "Review changes" opens a summary of what is added, removed and moved, and only the confirm writes (the API audits it
 * as high risk). The role's version travels as `If-Match`; a newer version shows "this role changed" with a reload.
 */
export default function RoleEditor({ orgId, roleId, catalog, canManage, onClose, onChanged, onDuplicate }: RoleEditorProps) {
  const open = roleId !== null;
  const narrow = useNarrow();
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ id: null, status: "loading" });
  const [diff, setDiff] = useState<TemplateDiff | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [baseline, setBaseline] = useState<Draft>({});
  const [draft, setDraft] = useState<Draft>({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [grantedOnly, setGrantedOnly] = useState(false);
  const [refused, setRefused] = useState<{ key: string | null; message: string } | null>(null);
  const [stale, setStale] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [saving, setSaving] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);

  const entries = useMemo(() => entryMap(catalog), [catalog]);
  const labelOf = useCallback((key: string) => entries.get(key)?.label ?? key, [entries]);
  const isDangerous = useCallback((key: string) => entries.get(key)?.dangerous ?? false, [entries]);

  const adopt = useCallback((detail: RoleDetail) => {
    const d = draftOf(detail.permissions);
    setLoad({ id: detail.id, status: "ok", detail });
    setBaseline(d);
    setDraft(d);
    setName(detail.name);
    setDescription(detail.description ?? "");
    setRefused(null);
    setStale(false);
  }, []);

  /** Fetches the role and its diff; the caller decides what to do with the answer (nothing here sets state). */
  const fetchRole = useCallback(
    async (id: number) => {
      const [r, d] = await Promise.all([rolesApi.get(orgId, id), rolesApi.diff(orgId, id)]);
      return { id, r, d };
    },
    [orgId],
  );

  const apply = useCallback(
    (res: Awaited<ReturnType<typeof fetchRole>>) => {
      if (!res.r.ok) {
        setLoad({ id: res.id, status: "error", message: roleErrorMessage(res.r) });
        return;
      }
      adopt(res.r.data);
      setDiff(res.d.ok ? res.d.data : null);
    },
    [adopt],
  );

  /** The "Reload" and "Try again" buttons (event handlers). */
  const reload = useCallback(async () => {
    if (roleId === null) return;
    setLoad({ id: roleId, status: "loading" });
    apply(await fetchRole(roleId));
  }, [roleId, fetchRole, apply]);

  useEffect(() => {
    if (roleId === null) return;
    let live = true;
    void fetchRole(roleId).then((res) => {
      if (live) apply(res);
    });
    return () => {
      live = false;
    };
  }, [roleId, fetchRole, apply]);

  const current: Load = load.id === roleId ? load : { id: roleId, status: "loading" }; // a role that is not the one asked for is stale
  const detail = current.status === "ok" ? current.detail : null;

  /** A role that holds anything beyond the caller's reach cannot be edited by them (the API refuses the whole role). */
  const beyondReach = useMemo(() => {
    if (!detail) return false;
    return detail.permissions.some((p) => {
      if (p.scope === "OWN") return false;
      const c = choiceFor(entries.get(p.key), p.scope);
      return !c || !c.grantable;
    });
  }, [detail, entries]);

  const editable = !!detail && canManage && detail.editable && !detail.system && !beyondReach;
  const summary: ChangeSummary = useMemo(() => summarize(baseline, draft, isDangerous), [baseline, draft, isDangerous]);
  const renamed = !!detail && (name.trim() !== detail.name || description.trim() !== (detail.description ?? ""));
  const dirty = summary.total > 0 || renamed;

  function setScope(entry: CatalogEntry, scope: Scope | null) {
    setRefused(null);
    setDraft((cur) => {
      const next = { ...cur };
      if (scope === null) {
        delete next[entry.key];
        return next;
      }
      const existing = cur[entry.key];
      const choice = choiceFor(entry, scope);
      next[entry.key] = existing
        ? { ...existing, scope }
        : { scope, ceilingRoleKey: choice?.ceilingRoleKey ?? null, rowFilter: choice?.rowFilter ?? null };
      return next;
    });
  }

  function onFail(r: ApiFail): string {
    const key = ceilingKey(r);
    const message = roleErrorMessage(r);
    if (isConflict(r)) setStale(true);
    setRefused({ key, message });
    return message;
  }

  async function writeChanges(): Promise<string | null> {
    if (!detail) return "Reload and try again.";
    const body: { name?: string; description?: string; permissions?: ReturnType<typeof rowsOf> } = {};
    if (name.trim() !== detail.name) body.name = name.trim();
    if (description.trim() !== (detail.description ?? "")) body.description = description.trim();
    if (summary.total > 0) body.permissions = rowsOf(draft);
    setSaving(true);
    const r = await rolesApi.update(orgId, detail.id, detail.version, body);
    setSaving(false);
    if (!r.ok) return onFail(r);
    adopt(r.data);
    const d = await rolesApi.diff(orgId, detail.id);
    setDiff(d.ok ? d.data : null);
    toast({ title: "Role updated", description: `${r.data.name} is saved.`, variant: "success" });
    onChanged();
    return null;
  }

  function review() {
    if (summary.total === 0) {
      // a rename alone is low risk: no summary to confirm
      void writeChanges().then((m) => m && setRefused({ key: null, message: m }));
      return;
    }
    setConfirm({
      title: `Save changes to ${detail?.name ?? "this role"}?`,
      intro: "Permissions are not saved until you confirm. Everyone who holds this role gets the change the next time they open the app.",
      confirmLabel: "Save changes",
      summary,
      run: writeChanges,
    });
  }

  function restore() {
    if (!detail || !diff || diff.matches) return;
    // restoring is the reverse of the difference: what the role dropped comes back, what it added goes
    const rev: ChangeSummary = {
      added: diff.removed.map((r) => ({ key: r.key, scope: (r.scope ?? "ORG") as Scope })),
      removed: diff.added.map((a) => ({ key: a.key, scope: a.scope })),
      changed: diff.scopeChanged.map((c) => ({ key: c.key, from: c.to, to: c.from })),
      dangerous: [],
      total: 0,
    };
    rev.dangerous = rev.added.filter((a) => isDangerous(a.key)).map((a) => a.key);
    rev.total = rev.added.length + rev.removed.length + rev.changed.length;
    setConfirm({
      title: `Restore ${detail.name} to ${diff.templateName ?? "its template"}?`,
      intro: "This replaces the permissions of the role with the template's. Your unsaved edits here are dropped.",
      confirmLabel: "Restore",
      summary: rev,
      run: async () => {
        const r = await rolesApi.resync(orgId, detail.id, detail.version);
        if (!r.ok) return onFail(r);
        adopt(r.data);
        const d = await rolesApi.diff(orgId, detail.id);
        setDiff(d.ok ? d.data : null);
        toast({ title: "Restored to the template", variant: "success" });
        onChanged();
        return null;
      },
    });
  }

  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  function close() {
    if (dirtyRef.current && !window.confirm("Discard your unsaved changes?")) return;
    setQuery("");
    setGrantedOnly(false);
    setShowDiff(false);
    onClose();
  }

  const q = query.trim();
  const sections = catalog.categories
    .map((c) => ({
      ...c,
      rows: c.permissions.filter((e) => matchesQuery(e, q) && (!grantedOnly || draft[e.key] !== undefined)),
      granted: c.permissions.filter((e) => draft[e.key] !== undefined).length,
    }))
    .filter((c) => c.rows.length > 0);

  const title = detail ? detail.name : "Role";
  const subtitle = !detail
    ? undefined
    : detail.system
      ? "System role: read only"
      : editable
        ? "Choose what this role can do, then review the changes."
        : "View only";

  const footer =
    editable && dirty ? (
      <div data-editor-footer className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-soft" aria-live="polite">
          {summary.total > 0 ? `${summary.total} permission ${summary.total === 1 ? "change" : "changes"}` : "Name or description changed"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(baseline);
              setName(detail?.name ?? "");
              setDescription(detail?.description ?? "");
              setRefused(null);
            }}
            disabled={saving}
          >
            Discard
          </Button>
          <Button onClick={review} disabled={saving || name.trim() === "" || (summary.total === 0 && !renamed)} data-review-changes>
            {summary.total > 0 ? "Review changes" : "Save"}
          </Button>
        </div>
      </div>
    ) : undefined;

  return (
    <>
      <SideSheet
        id="roles-editor"
        side="right"
        mode={narrow ? "fullscreen" : "overlay"}
        width={760}
        open={open}
        onClose={close}
        title={title}
        description={subtitle}
        returnFocusTo={returnTo}
        footer={footer}
      >
        <div data-role-editor className="flex flex-col gap-4">
          {current.status === "loading" && (
            <div role="status" aria-label="Loading the role" className="flex flex-col gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {current.status === "error" && <ErrorState variant="inline" what="this role" description={current.message} onRetry={() => void reload()} />}
          {detail && (
            <>
              {stale && (
                <div role="alert" data-role-stale className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-[13px] text-ink">
                  <span>This role changed while you were editing it. Reload to see the latest version (your edits here are dropped).</span>
                  <Button size="sm" variant="ghost" onClick={() => void reload()}>
                    <RefreshIcon size={14} aria-hidden /> Reload
                  </Button>
                </div>
              )}
              {refused && !stale && (
                <p role="alert" data-role-refused className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-[13px] text-ink">
                  <AlertIcon size={16} className="mt-0.5 flex-none text-danger" aria-hidden />
                  <span>{refused.message}</span>
                </p>
              )}

              {detail.system && (
                <div data-role-system className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper-2/60 p-3">
                  <p className="flex items-center gap-2 text-[13px] text-ink-soft">
                    <LockIcon size={16} aria-hidden className="flex-none" />
                    System roles are read only so every organization starts from the same, tested set.
                  </p>
                  {canManage && detail.key !== "OWNER" && (
                    <Button size="sm" onClick={() => onDuplicate(detail)} data-duplicate-to-customise>
                      <CopyIcon size={14} aria-hidden /> Duplicate to customise
                    </Button>
                  )}
                </div>
              )}
              {!detail.system && !canManage && (
                <p data-role-readonly className="flex items-center gap-2 rounded-xl border border-line bg-paper-2/60 p-3 text-[13px] text-ink-soft">
                  <LockIcon size={16} aria-hidden className="flex-none" />
                  You can view roles but not change them.
                </p>
              )}
              {!detail.system && canManage && beyondReach && (
                <div data-role-beyond className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper-2/60 p-3">
                  <p className="flex items-center gap-2 text-[13px] text-ink-soft">
                    <LockIcon size={16} aria-hidden className="flex-none" />
                    This role includes permissions beyond your access, so you can view it but not change it.
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => onDuplicate(detail)}>
                    <CopyIcon size={14} aria-hidden /> Duplicate
                  </Button>
                </div>
              )}

              {editable ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Role name">
                    <Input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="off" data-role-name />
                  </Field>
                  <Field label="Description" hint={`${description.length}/${DESCRIPTION_MAX}`}>
                    <Textarea rows={1} value={description} maxLength={DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} data-role-description />
                  </Field>
                </div>
              ) : (
                detail.description && <p className="text-[13.5px] text-ink-soft">{detail.description}</p>
              )}

              {diff && (
                <div data-template-diff className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {!diff.hasTemplate ? (
                      <span data-diff-chip="none" className="rounded-full bg-paper-2 px-3 py-1 text-[12.5px] font-semibold text-ink-soft">
                        {detail.system ? "A system template" : "Built from scratch"}
                      </span>
                    ) : diff.matches ? (
                      <span data-diff-chip="match" className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent-deep">
                        <CheckIcon size={13} aria-hidden /> Matches {diff.templateName}
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-diff-chip="differs"
                        aria-expanded={showDiff}
                        onClick={() => setShowDiff((v) => !v)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-[12.5px] font-semibold text-ink hover:bg-paper-2"
                      >
                        Differs from {diff.templateName}
                        <span className="text-accent-deep">+{diff.added.length}</span>
                        <span className="text-danger">−{diff.removed.length}</span>
                        <span className="text-ink-soft">~{diff.scopeChanged.length}</span>
                      </button>
                    )}
                    {editable && diff.hasTemplate && !diff.matches && (
                      <Tooltip content="Put the template's permissions back">
                        <Button size="sm" variant="ghost" onClick={restore} data-restore-template aria-label="Restore to template">
                          <UndoIcon size={14} aria-hidden /> Restore to template
                        </Button>
                      </Tooltip>
                    )}
                  </div>
                  {showDiff && diff.hasTemplate && !diff.matches && (
                    <ul data-diff-details className="grid gap-1 rounded-xl border border-line bg-paper-2/40 p-3 text-[13px]">
                      {diff.added.map((a) => (
                        <li key={`a-${a.key}`}>
                          <span className="font-semibold text-accent-deep">+ {labelOf(a.key)}</span> <span className="text-muted">({scopeLabel(a.scope)}), not in the template</span>
                        </li>
                      ))}
                      {diff.removed.map((r) => (
                        <li key={`r-${r.key}`}>
                          <span className="font-semibold text-danger">− {labelOf(r.key)}</span> <span className="text-muted">is in the template, not here</span>
                        </li>
                      ))}
                      {diff.scopeChanged.map((c) => (
                        <li key={`c-${c.key}`}>
                          <span className="font-semibold text-ink">~ {labelOf(c.key)}</span>{" "}
                          <span className="text-muted">
                            {scopeLabel(c.from)} in the template, {scopeLabel(c.to)} here
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-0 flex-1 basis-56">
                  <SearchIcon size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <Input
                    type="search"
                    aria-label="Search permissions"
                    placeholder="Search permissions"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-9"
                    data-perm-search
                  />
                </div>
                <Switch label="Granted only" checked={grantedOnly} onCheckedChange={setGrantedOnly} />
              </div>

              {sections.length === 0 && <p data-perm-empty className="py-6 text-center text-[13.5px] text-muted">No permissions match.</p>}
              <div className="flex flex-col gap-5">
                {sections.map((c) => (
                  <section key={c.key} aria-labelledby={`cat-${c.key}`} data-perm-category={c.key}>
                    <h3 id={`cat-${c.key}`} className="flex items-baseline justify-between gap-2 border-b border-line pb-1.5 text-[13px] font-bold text-ink">
                      <span>{c.label}</span>
                      <span className="text-[12px] font-medium text-muted">
                        {c.granted} of {c.keyCount} granted
                      </span>
                    </h3>
                    <ul className="divide-y divide-line/60">
                      {c.rows.map((e) => (
                        <PermissionRow
                          key={e.key}
                          entry={e}
                          scope={draft[e.key]?.scope ?? null}
                          was={baseline[e.key]?.scope ?? null}
                          editable={editable}
                          flagged={refused?.key === e.key}
                          onScope={(s) => setScope(e, s)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </SideSheet>
      <ConfirmChangesDialog spec={confirm} onClose={() => setConfirm(null)} labelOf={labelOf} />
    </>
  );
}

function PermissionRow({ entry, scope, was, editable, flagged, onScope }: { entry: CatalogEntry; scope: Scope | null; was: Scope | null; editable: boolean; flagged: boolean; onScope: (s: Scope | null) => void }) {
  const changed = scope !== was;
  const locked = editable && !entry.grantable;
  return (
    <li data-perm-row={entry.key} data-perm-scope={scope ?? "NONE"} data-perm-locked={locked ? "true" : undefined} className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4", flagged && "rounded-lg bg-danger/5 ring-1 ring-danger/40")}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-semibold text-ink">
          <span>{entry.label}</span>
          {entry.dangerous && <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[.05em] text-ink">Sensitive</span>}
          {changed && editable && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[.05em] text-accent-deep">Changed</span>}
        </p>
        <p className="text-[12.5px] leading-snug text-ink-soft">{entry.description}</p>
        <p className="mt-0.5 font-mono text-[11.5px] text-muted">{entry.key}</p>
        {locked && (
          <p data-perm-reason className="mt-1 flex items-center gap-1 text-[12px] text-muted">
            <LockIcon size={12} aria-hidden /> {reasonText(entry.reason)}
          </p>
        )}
      </div>
      {editable ? (
        <div role="radiogroup" aria-label={`${entry.label} scope`} className="flex flex-wrap gap-1.5 sm:max-w-[340px] sm:justify-end">
          <ScopeButton label="Not granted" active={scope === null} disabled={false} onClick={() => onScope(null)} />
          {entry.scopes.map((s) => (
            <ScopeButton
              key={s.scope}
              label={scopeLabel(s.scope)}
              active={scope === s.scope}
              disabled={!s.grantable}
              title={!s.grantable ? reasonText(entry.reason ?? "BEYOND_YOUR_ACCESS") : undefined}
              onClick={() => onScope(s.scope)}
            />
          ))}
        </div>
      ) : (
        <span data-perm-pill className={cn("self-start rounded-full px-3 py-1 text-[12.5px] font-semibold", scope ? "bg-accent-soft text-accent-deep" : "bg-paper-2 text-muted")}>
          {scope ? scopeLabel(scope) : "Not granted"}
        </span>
      )}
    </li>
  );
}

function ScopeButton({ label, active, disabled, title, onClick }: { label: string; active: boolean; disabled: boolean; title?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-8",
        active ? "border-[var(--brand-solid,var(--color-accent))] bg-[var(--brand-solid,var(--color-accent))] text-[var(--on-brand,var(--color-on-accent))]" : "border-line bg-paper text-ink hover:bg-paper-2",
        disabled && "cursor-not-allowed opacity-45 hover:bg-paper",
      )}
    >
      {label}
    </button>
  );
}
