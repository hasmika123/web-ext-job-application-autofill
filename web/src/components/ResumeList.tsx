"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, useToast } from "@/components/ui";
import Select from "@/components/ui/Select";
import {
  ArchiveIcon as SharedArchiveIcon,
  ArrowsUpDownIcon,
  ChevronDownIcon,
  PencilIcon as SharedPencilIcon,
  RestoreIcon as SharedRestoreIcon,
  SearchIcon,
  StarIcon as SharedStarIcon,
  TrashIcon as SharedTrashIcon,
} from "@kiwiply/ui";
import { cn } from "@/lib/cn";

export interface Resume {
  id: number;
  label: string;
  status?: string | null;
  createdAt?: string | null;
  archived?: boolean | null;
  starred?: boolean | null;
  defaultResume?: boolean | null;
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
const ArchiveIcon = () => <SharedArchiveIcon className={ICON} />;
const RestoreIcon = () => <SharedRestoreIcon className={ICON} />;
const TrashIcon = () => <SharedTrashIcon className={ICON} />;
const PencilIcon = () => <SharedPencilIcon className={ICON} />;
const StarIcon = ({ filled }: { filled: boolean }) => (
  <SharedStarIcon fill={filled ? "currentColor" : "none"} className={ICON} />
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
  onStar,
  onSetDefault,
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
  onStar: () => void;
  onSetDefault: () => void;
  guard: string | null;
}) {
  const archived = !!resume.archived;
  const isDefault = !!resume.defaultResume;
  const badge = statusBadge(resume.status);
  // The whole card opens the editor (when editable); inner controls stopPropagation below.
  const cardClick = onEdit
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: onEdit,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEdit();
          }
        },
      }
    : {};

  return (
    <li
      {...cardClick}
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border bg-paper p-4 shadow-[var(--shadow)] transition-[border-color,box-shadow]",
        selected ? "border-accent ring-1 ring-accent" : "border-line",
        archived && "opacity-60", // greyed out — de-emphasized vs. active resumes
        onEdit && "cursor-pointer hover:border-accent hover:shadow-[var(--shadow-lg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${resume.label}`}
        className="h-4 w-4 flex-none accent-[var(--color-accent)]"
      />
      <FileIcon />
      <div className="min-w-[160px] flex-1">
        <div className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <span className="min-w-0 flex-1 truncate" title={resume.label}>{resume.label}</span>
          {isDefault && (
            <span className="shrink-0 rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-deep">
              Default
            </span>
          )}
          {!archived && badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        </div>
        <div className="mt-1 text-[12.5px] text-muted">
          {formatDate(resume.createdAt) && <span>Added {formatDate(resume.createdAt)}</span>}
          {formatDate(resume.createdAt) && " · "}
          {usage > 0 ? (
            <span className="text-ink-soft">used in {usage} application{usage === 1 ? "" : "s"}</span>
          ) : (
            "not used yet"
          )}
          {!archived && !isDefault && (
            <>
              {" · "}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSetDefault(); }}
                disabled={busy}
                className="font-semibold text-accent-deep hover:underline disabled:opacity-50"
              >
                Set as default
              </button>
            </>
          )}
        </div>
        {guard && (
          <p className="mt-2 rounded-[var(--radius)] border border-brown/40 bg-brown-soft px-3 py-2 text-[12.5px] text-brown-deep">
            {guard}{" "}
            <button onClick={(e) => { e.stopPropagation(); onArchive(); }} disabled={busy} className="font-bold underline">
              Archive instead
            </button>
          </p>
        )}
      </div>
      {archived && (
        <Badge variant="review" className="shrink-0 self-center">
          Archived
        </Badge>
      )}
      <div className="flex shrink-0 items-center gap-2 self-start sm:self-center" onClick={(e) => e.stopPropagation()}>
        <IconBtn onClick={onStar} disabled={busy} label={resume.starred ? "Unstar" : "Star"}>
          <span className={cn(resume.starred && "text-[color:var(--color-accent-deep)]")}>
            <StarIcon filled={!!resume.starred} />
          </span>
        </IconBtn>
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
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [guards, setGuards] = useState<Record<number, string>>({});
  const [archivedOpen, setArchivedOpen] = useState(false); // archived list collapsed by default

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

  async function rowStar(r: Resume) {
    setRowBusy([r.id], true);
    const res = await fetch(`/api/resumes/${r.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ starred: !r.starred }),
    });
    setRowBusy([r.id], false);
    if (res.ok) router.refresh();
    else toast({ variant: "error", title: "Couldn't update the resume." });
  }

  async function rowSetDefault(r: Resume) {
    setRowBusy([r.id], true);
    const res = await fetch(`/api/resumes/${r.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultResume: true }),
    });
    setRowBusy([r.id], false);
    if (res.ok) {
      toast({ variant: "success", title: `“${r.label}” is now your default resume` });
      router.refresh();
    } else {
      toast({ variant: "error", title: "Couldn't set the default resume." });
    }
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
      onStar={() => rowStar(r)}
      onSetDefault={() => rowSetDefault(r)}
      guard={guards[r.id] || null}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar: search · sort · select-all */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="relative min-w-[180px] max-w-[320px] flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon className="h-[15px] w-[15px]" />
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
          <Select
            variant="pill"
            aria-label="Sort resumes"
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
            leadingIcon={<ArrowsUpDownIcon className="h-3.5 w-3.5" />}
          />
        </div>
        {anyVisible > 0 && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-ink-soft">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(visibleIds) : new Set())}
              className="h-4 w-4 accent-[var(--color-accent)]"
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
            <h2 className="flex items-center gap-2.5 text-sm font-semibold uppercase tracking-wide text-muted">
              Your resumes
              <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink-soft">
                {view.active.length}
              </span>
              <span aria-hidden className="h-px flex-1 bg-line" />
            </h2>
            {view.active.length > 0 ? (
              <ul className="flex flex-col gap-3">{view.active.map(renderRow)}</ul>
            ) : (
              <p className="text-sm text-muted">No active resumes{query ? " match your search" : ""}.</p>
            )}
          </section>

          {view.archived.length > 0 && (
            <section className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setArchivedOpen((o) => !o)}
                aria-expanded={archivedOpen}
                className="flex w-full items-center gap-2.5 text-sm font-semibold uppercase tracking-wide text-muted transition-colors hover:text-ink"
              >
                <ChevronDownIcon className={cn("h-4 w-4 transition-transform", archivedOpen && "rotate-180")} />
                Archived
                <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink-soft">
                  {view.archived.length}
                </span>
                <span aria-hidden className="h-px flex-1 bg-line" />
              </button>
              {archivedOpen && <ul className="flex flex-col gap-3">{view.archived.map(renderRow)}</ul>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
