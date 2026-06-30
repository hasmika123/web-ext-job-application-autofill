"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface Resume {
  id: number;
  label: string;
  status?: string | null;
  createdAt?: string | null;
  archived?: boolean | null;
  parsedJson?: string | null;
}

function statusBadge(status?: string | null) {
  if (!status) return null;
  // Only NEEDS_REVIEW warrants a badge (e.g. a future extension-synced resume that was
  // never reviewed). CONFIRMED is the normal, already-reviewed state — no badge, no noise.
  if (status.toUpperCase().includes("REVIEW")) return { variant: "review" as const, label: "Needs review" };
  return null;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function FileIcon() {
  return (
    <span className="relative h-[52px] w-[42px] flex-none rounded-md border border-accent bg-accent-soft">
      <span className="absolute bottom-1.5 left-0 right-0 text-center text-[8px] font-extrabold tracking-wide text-accent-deep">
        DOC
      </span>
    </span>
  );
}

/** Small square icon button for the per-row actions (archive / restore / delete). */
function IconBtn({
  onClick,
  disabled,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg border border-line bg-paper text-ink-soft transition-colors hover:bg-paper-2 disabled:opacity-50",
        danger && "hover:border-danger/40 hover:text-danger",
      )}
    >
      {children}
    </button>
  );
}

const ICON = "h-[17px] w-[17px]";
const ArchiveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" />
  </svg>
);
const RestoreIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <path d="M3 7v6h6" /><path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" />
  </svg>
);
const PencilIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

function Row({
  resume,
  usage,
  selected,
  busy,
  onToggleSelect,
  onArchive,
  onDelete,
  onEdit,
  guard,
}: {
  resume: Resume;
  usage: number;
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  guard: string | null;
}) {
  const archived = !!resume.archived;
  const badge = statusBadge(resume.status);

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border bg-paper p-4 shadow-[var(--shadow)] transition-colors",
        selected ? "border-accent ring-1 ring-accent" : "border-line",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select ${resume.label}`}
        className="h-4 w-4 flex-none accent-[var(--accent)]"
      />
      <FileIcon />
      <div className="min-w-[160px] flex-1">
        <div className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <span className="min-w-0 flex-1 truncate" title={resume.label}>{resume.label}</span>
          {!archived && badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          {archived && <Badge variant="review">Archived</Badge>}
        </div>
        <div className="mt-1 text-[12.5px] text-muted">
          {formatDate(resume.createdAt) && <span>Added {formatDate(resume.createdAt)}</span>}
          {formatDate(resume.createdAt) && " · "}
          {usage > 0 ? (
            <span className="text-ink-soft">used in {usage} application{usage === 1 ? "" : "s"}</span>
          ) : (
            "not used yet"
          )}
        </div>
        {guard && (
          <p className="mt-2 rounded-[var(--radius)] border border-brown/40 bg-brown-soft px-3 py-2 text-[12.5px] text-brown-deep">
            {guard}{" "}
            <button onClick={onArchive} disabled={busy} className="font-bold underline">
              Archive instead
            </button>
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
        {onEdit && (
          <IconBtn onClick={onEdit} disabled={busy} label="Edit">
            <PencilIcon />
          </IconBtn>
        )}
        <IconBtn onClick={onArchive} disabled={busy} label={archived ? "Restore" : "Archive"}>
          {archived ? <RestoreIcon /> : <ArchiveIcon />}
        </IconBtn>
        <IconBtn onClick={onDelete} disabled={busy} label="Delete" danger>
          <TrashIcon />
        </IconBtn>
      </div>
    </li>
  );
}

type SortKey = "recent" | "name" | "used";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Most recent" },
  { key: "name", label: "Name A–Z" },
  { key: "used", label: "Most used" },
];

/**
 * The user's saved resumes: search, sort, multi-select + bulk archive/restore/delete, and
 * per-row icon actions. Archiving hides a resume from the active picker without deleting it;
 * the delete-guard (Phase 3.5) blocks deleting a resume an application references and nudges
 * toward archiving instead.
 */
export default function ResumeList({
  resumes,
  usage = {},
  onEdit,
}: {
  resumes: Resume[];
  usage?: Record<number, number>;
  onEdit?: (r: Resume) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [guards, setGuards] = useState<Record<number, string>>({});

  const setRowBusy = (ids: number[], on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // One archive/restore call. Returns ok so bulk can tally.
  async function archiveOne(id: number, next: boolean): Promise<boolean> {
    const res = await fetch(`/api/resumes/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: next }),
    });
    return res.ok;
  }

  // One delete call. Returns "ok" | "guard" | "error" so callers can message precisely.
  async function deleteOne(id: number): Promise<"ok" | "guard" | "error"> {
    const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
    if (res.ok) return "ok";
    if (res.status === 409) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setGuards((g) => ({ ...g, [id]: data.error ?? "This resume is used by an application. Archive it instead of deleting." }));
      return "guard";
    }
    return "error";
  }

  async function rowArchive(r: Resume) {
    setRowBusy([r.id], true);
    setGuards((g) => ({ ...g, [r.id]: "" }));
    const ok = await archiveOne(r.id, !r.archived);
    setRowBusy([r.id], false);
    if (ok) {
      toast({ variant: "success", title: r.archived ? "Resume restored" : "Resume archived" });
      router.refresh();
    } else {
      toast({ variant: "error", title: "Couldn't update the resume." });
    }
  }

  async function rowDelete(r: Resume) {
    if (!window.confirm(`Delete "${r.label}"? This can't be undone.`)) return;
    setRowBusy([r.id], true);
    const result = await deleteOne(r.id);
    setRowBusy([r.id], false);
    if (result === "ok") {
      toast({ variant: "success", title: "Resume deleted" });
      setSelected((s) => { const n = new Set(s); n.delete(r.id); return n; });
      router.refresh();
    } else if (result === "error") {
      toast({ variant: "error", title: "Couldn't delete the resume." });
    }
    // "guard" → the inline nudge is shown by the row; no toast.
  }

  async function bulkArchive(next: boolean) {
    const ids = [...selected].filter((id) => {
      const r = resumes.find((x) => x.id === id);
      return r && !!r.archived !== next;
    });
    if (!ids.length) return;
    setRowBusy(ids, true);
    const results = await Promise.all(ids.map((id) => archiveOne(id, next)));
    setRowBusy(ids, false);
    const ok = results.filter(Boolean).length;
    toast({ variant: ok ? "success" : "error", title: `${next ? "Archived" : "Restored"} ${ok} resume${ok === 1 ? "" : "s"}` });
    setSelected(new Set());
    router.refresh();
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} resume${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    setRowBusy(ids, true);
    const results = await Promise.all(ids.map((id) => deleteOne(id)));
    setRowBusy(ids, false);
    const deleted = results.filter((r) => r === "ok").length;
    const guarded = results.filter((r) => r === "guard").length;
    toast({
      variant: deleted ? "success" : "error",
      title: `Deleted ${deleted} resume${deleted === 1 ? "" : "s"}`,
      description: guarded ? `${guarded} kept — still used by an application (archive instead).` : undefined,
    });
    setSelected(new Set());
    router.refresh();
  }

  // Search + sort, applied to both the active and archived lists.
  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (r: Resume) => !q || r.label.toLowerCase().includes(q);
    const sortFn = (a: Resume, b: Resume) => {
      if (sort === "name") return a.label.localeCompare(b.label);
      if (sort === "used") return (usage[b.id] ?? 0) - (usage[a.id] ?? 0);
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    };
    const ordered = resumes.filter(match).sort(sortFn);
    return { active: ordered.filter((r) => !r.archived), archived: ordered.filter((r) => r.archived) };
  }, [resumes, usage, query, sort]);

  const selectedActive = [...selected].some((id) => resumes.find((r) => r.id === id && !r.archived));
  const selectedArchived = [...selected].some((id) => resumes.find((r) => r.id === id && r.archived));
  const visibleIds = view.active.concat(view.archived).map((r) => r.id);
  const anyVisible = visibleIds.length;
  const allVisibleSelected = anyVisible > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  // "Select all" shows a dash (indeterminate) when only some visible rows are selected — there's
  // no HTML attribute for it, so it's set imperatively on the DOM node.
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  if (resumes.length === 0) {
    return (
      <EmptyState
        icon="📄"
        title="No resumes yet"
        description="Drop a resume above and Kiwiply parses it in your browser — ready to autofill on every application."
      />
    );
  }

  const toolInput =
    "rounded-full border border-line bg-paper px-4 py-2 text-[13.5px] text-ink outline-none placeholder:text-muted focus:border-accent";

  const renderRow = (r: Resume) => (
    <Row
      key={r.id}
      resume={r}
      usage={usage[r.id] ?? 0}
      selected={selected.has(r.id)}
      busy={busy.has(r.id)}
      onToggleSelect={() => toggleSelect(r.id)}
      onArchive={() => rowArchive(r)}
      onDelete={() => rowDelete(r)}
      onEdit={onEdit ? () => onEdit(r) : undefined}
      guard={guards[r.id] || null}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar: search · sort · select-all */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[180px] max-w-[320px] flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search resumes…"
            className={cn(
              "w-full rounded-full border border-line bg-paper py-2 pl-9 text-[13.5px] text-ink outline-none placeholder:text-muted focus:border-accent",
              query ? "pr-9" : "pr-4",
            )}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-paper-2 hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <span className="sr-only sm:not-sr-only">Sort:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={cn(toolInput, "font-medium text-ink-soft")}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
        {anyVisible > 0 && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-ink-soft">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(visibleIds) : new Set())}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Select all ({anyVisible})
          </label>
        )}
      </div>

      {/* Bulk action bar — only when something is selected */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-accent bg-accent-soft px-4 py-2.5">
          <span className="text-[13px] font-semibold text-accent-deep">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {selectedActive && (
              <button onClick={() => bulkArchive(true)} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-2">
                Archive
              </button>
            )}
            {selectedArchived && (
              <button onClick={() => bulkArchive(false)} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-2">
                Restore
              </button>
            )}
            <button onClick={bulkDelete} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-[12.5px] font-semibold text-danger hover:bg-paper-2">
              Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-ink">
              Clear
            </button>
          </div>
        </div>
      )}

      {anyVisible === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-line bg-paper py-10 text-center text-sm text-muted">
          No resumes match “{query}”.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Your resumes ({view.active.length})
            </h2>
            {view.active.length > 0 ? (
              <ul className="flex flex-col gap-3">{view.active.map(renderRow)}</ul>
            ) : (
              <p className="text-sm text-muted">No active resumes{query ? " match your search" : ""}.</p>
            )}
          </section>

          {view.archived.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Archived ({view.archived.length})
              </h2>
              <ul className="flex flex-col gap-3">{view.archived.map(renderRow)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
