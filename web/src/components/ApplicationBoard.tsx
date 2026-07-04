"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/Button";
import { ResumeUpload } from "@kiwiply/ui";
import { useResumeUploadServices } from "@/lib/use-resume-upload-services";

export interface Application {
  id: number;
  company: string;
  roleTitle: string;
  jobUrl?: string | null;
  location?: string | null;
  jobType?: string | null;
  jobMode?: string | null;
  email?: string | null;
  salary?: string | null;
  externalJobId?: string | null;
  atsPlatform?: string | null;
  jobDescription?: string | null;
  status: string;
  submissionConfirmed?: boolean | null;
  appliedAt?: string | null;
  createdAt?: string | null;
  starred?: boolean | null;
  archived?: boolean | null;
  resume?: { id: number; label?: string | null } | null;
  attachmentFilename?: string | null;
}

// Board columns, left to right (the funnel order), each with a status dot color.
const COLUMNS: { key: string; label: string; dot: string }[] = [
  { key: "DRAFT", label: "Draft", dot: "var(--color-brown)" },
  { key: "SAVED", label: "Saved", dot: "var(--color-brown-2)" },
  { key: "APPLIED", label: "Applied", dot: "var(--color-accent)" },
  { key: "INTERVIEW", label: "Interview", dot: "#1d4ed8" },
  { key: "OFFER", label: "Offer", dot: "var(--color-accent-deep)" },
  { key: "REJECTED", label: "Rejected", dot: "var(--color-muted)" },
];

// Strict enums, mirrored from the backend JobType / JobMode. `value` is the wire/enum name;
// `label` is what the user sees. Empty string = "unset" (the field is nullable).
const JOB_TYPES: { value: string; label: string }[] = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "TEMPORARY", label: "Temporary" },
  { value: "OTHER", label: "Other" },
];
const JOB_MODES: { value: string; label: string }[] = [
  { value: "ON_SITE", label: "In-person" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "REMOTE", label: "Remote" },
  { value: "OTHER", label: "Other" },
];
const JOB_TYPE_LABEL: Record<string, string> = Object.fromEntries(JOB_TYPES.map((t) => [t.value, t.label]));
const JOB_MODE_LABEL: Record<string, string> = Object.fromEntries(JOB_MODES.map((m) => [m.value, m.label]));
const COL_BY_KEY: Record<string, { key: string; label: string; dot: string }> = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));
// SAVED is a bookmark, not a pipeline stage — stage pickers (stepper, move-to menus)
// offer only these; the Saved section still exists on the board as the bookmark shelf.
const STAGES = COLUMNS.filter((c) => c.key !== "SAVED");

type SortKey = "recent" | "oldest" | "applied" | "company";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest first" },
  { value: "applied", label: "Recently applied" },
  { value: "company", label: "Company A–Z" },
];
// Draft + Saved sit as full-width collapsible ROWS at the top; the funnel stages spread out
// underneath as a responsive GRID; Archived is a collapsible ROW at the very bottom.
// Attention-first layout: the Saved bookmark shelf (wide, apply-forward tiles) sits on
// top, the Draft tray (compact uniform cards) under it, the active pipeline
// (Applied/Interview/Offer) spreads as columns — Interview and Offer wider with richer
// cards — and Rejected/Archived collapse into slim list rows at the bottom.
const ROW_STATUSES = ["SAVED", "DRAFT"];
const GRID_STATUSES = ["APPLIED", "INTERVIEW", "OFFER"];
const ROW_HINTS: Record<string, string> = {
  SAVED: "bookmarks — ready to apply",
  DRAFT: "fills in progress",
};
// A single set height for every board column/section, with internal scroll when content overflows.
const COLUMN_H = "h-[440px]";

function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4 transition-transform", open && "rotate-180", className)}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// The one date shown on a decluttered card: the applied date once applied, otherwise the
// date the entry was added (Draft/Saved never have an applied date).
function cardDate(app: Application): string {
  const applied = formatDate(app.appliedAt);
  if (applied) return `Applied · ${applied}`;
  const added = formatDate(app.createdAt);
  return added ? `Added · ${added}` : "";
}

// Deterministic brand-tint for a company's initial avatar — same company, same tint.
const AVATAR_TINTS = [
  "bg-accent-soft text-accent-deep",
  "bg-brown-soft text-brown-deep",
  "bg-paper-2 text-ink-soft",
  "bg-[color:var(--color-accent-2)] text-on-accent",
];
function companyInitial(company: string): string {
  return (company.trim()[0] ?? "•").toUpperCase();
}
function avatarTint(company: string): string {
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) % AVATAR_TINTS.length;
  return AVATAR_TINTS[h];
}

function StarButton({ starred, busy, onToggle, className }: { starred: boolean; busy: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={starred}
      aria-label={starred ? "Unstar" : "Star"}
      title={starred ? "Unstar" : "Star"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "shrink-0 rounded-md px-1 text-[15px] leading-none transition-colors disabled:opacity-50",
        starred ? "text-[color:var(--color-accent-deep)]" : "text-muted hover:text-ink",
        className,
      )}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}

/** Filled bookmark on SAVED cards (a saved job is a bookmark, not a starrable pipeline entry). */
function BookmarkButton({ busy, onRemove, className }: { busy: boolean; onRemove: () => void; className?: string }) {
  return (
    <button
      type="button"
      disabled={busy}
      aria-label="Remove from saved"
      title="Remove from saved"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className={cn(
        "shrink-0 rounded-md px-1 leading-none text-[color:var(--color-accent-deep)] transition-colors hover:text-danger disabled:opacity-50",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z" />
      </svg>
    </button>
  );
}

export interface ResumeOption {
  id: number;
  label: string;
  defaultResume?: boolean;
}

/**
 * The toolbar's "Filters" popover — starred/mode/type/resume live here instead of as
 * loose controls in the row, with an active-count badge on the trigger.
 */
function FilterMenu({
  starredOnly,
  mode,
  type,
  resume,
  resumeOptions,
  activeCount,
  onStarred,
  onMode,
  onType,
  onResume,
  onClear,
}: {
  starredOnly: boolean;
  mode: string;
  type: string;
  resume: string;
  resumeOptions: [number, string][];
  activeCount: number;
  onStarred: (v: boolean) => void;
  onMode: (v: string) => void;
  onType: (v: string) => void;
  onResume: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const field = "w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent";
  const lbl = "flex flex-col gap-1 text-[10.5px] font-bold uppercase tracking-wide text-muted";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
          activeCount > 0 ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink-soft hover:border-accent",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-3.5 w-3.5"
        >
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-on-accent">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[120]" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-[121] w-64 rounded-[var(--radius)] border border-line bg-paper p-3 shadow-[var(--shadow-lg)]">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
              <input
                type="checkbox"
                checked={starredOnly}
                onChange={(e) => onStarred(e.target.checked)}
                className="h-3.5 w-3.5 accent-[color:var(--color-accent)]"
              />
              ★ Starred only
            </label>
            <div className="mt-3 flex flex-col gap-2.5">
              <label className={lbl}>
                Job mode
                <select value={mode} onChange={(e) => onMode(e.target.value)} className={field}>
                  <option value="all">All modes</option>
                  {JOB_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label className={lbl}>
                Job type
                <select value={type} onChange={(e) => onType(e.target.value)} className={field}>
                  <option value="all">All types</option>
                  {JOB_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              {resumeOptions.length > 0 && (
                <label className={lbl}>
                  Resume sent
                  <select value={resume} onChange={(e) => onResume(e.target.value)} className={field}>
                    <option value="all">All resumes</option>
                    {resumeOptions.map(([id, label]) => (
                      <option key={id} value={String(id)}>{label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
              <button
                type="button"
                disabled={activeCount === 0}
                onClick={onClear}
                className="text-[12px] font-semibold text-muted enabled:hover:text-danger disabled:opacity-50"
              >
                Clear all
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-accent-deep hover:underline">
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Compact custom sort dropdown. A native <select> can't style its option popup (rounded
 * corners, hover states are OS-rendered), so this renders its own menu instead.
 */
function SortMenu({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-line bg-paper py-2 pl-3 pr-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-accent"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5 text-muted">
          <path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3" />
        </svg>
        <span className="whitespace-nowrap">{current.label}</span>
        <Chevron open={open} className="text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[120]" aria-hidden onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-[121] rounded-[var(--radius)] border border-line bg-paper p-1 shadow-[var(--shadow-lg)]">
            {SORT_OPTIONS.map((o) => {
              const selected = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    selected ? "bg-accent-soft font-semibold text-accent-deep" : "text-ink hover:bg-paper-2",
                  )}
                >
                  {o.label}
                  {selected && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function ApplicationBoard({
  applications,
  resumes,
  baseProfile = {},
}: {
  applications: Application[];
  resumes: ResumeOption[];
  baseProfile?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [apps, setApps] = useState(applications);
  const [syncedFrom, setSyncedFrom] = useState(applications);
  // Resume options held locally so an on-the-fly upload can appear in the picker immediately
  // (before the next server refetch). Re-synced whenever the server prop changes.
  const [resumeOpts, setResumeOpts] = useState(resumes);
  const [resumesSyncedFrom, setResumesSyncedFrom] = useState(resumes);
  const [search, setSearch] = useState("");
  const [resumeFilter, setResumeFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [starredOnly, setStarredOnly] = useState(false);
  const activeFilterCount =
    (starredOnly ? 1 : 0) + (modeFilter !== "all" ? 1 : 0) + (typeFilter !== "all" ? 1 : 0) + (resumeFilter !== "all" ? 1 : 0);
  const clearFilters = () => {
    setStarredOnly(false);
    setModeFilter("all");
    setTypeFilter("all");
    setResumeFilter("all");
  };
  const [selectedId, setSelectedId] = useState<number | null>(null); // open in the detail panel
  const [picked, setPicked] = useState<Set<number>>(new Set()); // multi-select for bulk actions
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Every collapsible section starts minimized: Saved shelf, Draft tray, Rejected and
  // Archived lists. The active pipeline (Applied/Interview/Offer) is always open.
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set(["SAVED", "DRAFT", "REJECTED", "ARCHIVED"]));
  const toggleRow = (key: string) =>
    setCollapsedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Reconcile optimistic state with the server after router.refresh() (render-phase
  // sync — the new `applications` array identity signals fresh server data).
  if (syncedFrom !== applications) {
    setSyncedFrom(applications);
    setApps(applications);
  }
  if (resumesSyncedFrom !== resumes) {
    setResumesSyncedFrom(resumes);
    setResumeOpts(resumes);
  }

  const addResumeOpt = (r: ResumeOption) =>
    setResumeOpts((prev) => (prev.some((x) => x.id === r.id) ? prev : [r, ...prev]));

  useEffect(() => {
    track("board_viewed", { count: applications.length });
  }, [applications.length]);

  const setBusy = (id: number, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const togglePick = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearPicked = () => setPicked(new Set());

  /**
   * Optimistically patch a card, then PUT/DELETE; router.refresh() reconciles (or reverts).
   * `optimisticPatch` lets the card preview differ from the request body — e.g. linking a
   * resume sends `{ resumeId }` but previews `{ resume: { id, label } }`.
   */
  async function mutate(
    id: number,
    method: "PUT" | "DELETE",
    body?: Record<string, unknown>,
    optimisticPatch?: Record<string, unknown>,
  ) {
    setError(null);
    setBusy(id, true);
    const patch = optimisticPatch ?? body;
    setApps((prev) =>
      method === "DELETE" ? prev.filter((a) => a.id !== id) : prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't update. Reverting…");
      }
    } catch {
      setError("Something went wrong. Reverting…");
    } finally {
      setBusy(id, false);
      router.refresh();
    }
  }

  const changeStatus = (id: number, status: string) => void mutate(id, "PUT", { status });
  const confirmSubmitted = (id: number) =>
    void mutate(id, "PUT", { status: "APPLIED", submissionConfirmed: true, appliedAt: new Date().toISOString() });
  // Moving an archived entry to a stage brings it back onto the active board.
  const moveTo = (app: Application, status: string) =>
    void mutate(app.id, "PUT", app.archived ? { status, archived: false } : { status });
  const toggleStar = (app: Application) => void mutate(app.id, "PUT", { starred: !app.starred });
  const setArchived = (app: Application, archived: boolean) => void mutate(app.id, "PUT", { archived });
  const remove = (app: Application) => {
    if (window.confirm(`Delete this entry — ${app.company} · ${app.roleTitle}?`)) {
      if (selectedId === app.id) setSelectedId(null);
      void mutate(app.id, "DELETE");
    }
  };
  // Un-bookmark a saved job: removing the bookmark deletes the entry (it was never applied to).
  const unsave = (app: Application) => {
    if (window.confirm(`Remove this saved job — ${app.company} · ${app.roleTitle}?`)) {
      if (selectedId === app.id) setSelectedId(null);
      void mutate(app.id, "DELETE");
    }
  };

  /** Apply one partial update to every picked application at once (client-side fan-out). */
  async function bulkPatch(body: Record<string, unknown>) {
    // Saved jobs are bookmarks, not starrable pipeline entries — skip them for a bulk star.
    const eligible = new Set(
      [...picked].filter((id) => body.starred !== true || apps.find((a) => a.id === id)?.status !== "SAVED"),
    );
    const ids = [...eligible];
    if (!ids.length) return;
    setError(null);
    ids.forEach((id) => setBusy(id, true));
    setApps((prev) => prev.map((a) => (eligible.has(a.id) ? { ...a, ...body } : a)));
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/applications/${id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }).then((r) => r.ok),
        ),
      );
      if (results.some((ok) => !ok)) setError("Some updates couldn't be applied. Reverting…");
    } catch {
      setError("Something went wrong applying the bulk action.");
    } finally {
      ids.forEach((id) => setBusy(id, false));
      clearPicked();
      router.refresh();
    }
  }

  async function bulkDelete() {
    const ids = [...picked];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected application${ids.length === 1 ? "" : "s"}?`)) return;
    setError(null);
    ids.forEach((id) => setBusy(id, true));
    if (selectedId != null && picked.has(selectedId)) setSelectedId(null);
    setApps((prev) => prev.filter((a) => !picked.has(a.id)));
    try {
      const results = await Promise.all(ids.map((id) => fetch(`/api/applications/${id}`, { method: "DELETE" }).then((r) => r.ok)));
      if (results.some((ok) => !ok)) setError("Some entries couldn't be deleted.");
    } catch {
      setError("Something went wrong deleting the selected entries.");
    } finally {
      clearPicked();
      router.refresh();
    }
  }

  /**
   * Create a board entry by hand (no extension). If an on-the-fly file was chosen with
   * "just attach", it's uploaded to the new application (not saved as a resume) once the row
   * exists. router.refresh() pulls everything back in.
   */
  async function createApplication(input: NewApplication): Promise<boolean> {
    setError(null);
    const { attachmentFile, ...appInput } = input; // the File can't go in the JSON body
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(appInput),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't add the application.");
        return false;
      }
      track("application_added_manually", { status: appInput.status });
      const newId = data.application?.id;
      if (attachmentFile && typeof newId === "number") {
        try {
          const fd = new FormData();
          fd.append("file", attachmentFile, attachmentFile.name);
          await fetch(`/api/applications/${newId}/attachment`, { method: "POST", body: fd });
        } catch {
          /* the application was created; the attachment is best-effort */
        }
      }
      router.refresh();
      return true;
    } catch {
      setError("Something went wrong while adding the application.");
      return false;
    }
  }

  function onDrop(e: DragEvent, status: string) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    const app = apps.find((a) => a.id === id);
    if (app && app.status !== status) changeStatus(id, status);
  }

  // Resume options for the filter (from the cards that have a resume linked).
  const resumeOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of apps) if (a.resume?.id) m.set(a.resume.id, a.resume.label || `Resume #${a.resume.id}`);
    return [...m.entries()];
  }, [apps]);

  // Filter + sort once; split into active (on the board) vs archived (bottom row). Starred
  // entries sort to the top of every column, then by the chosen sort.
  const { active, archivedItems } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = apps.filter((a) => {
      if (resumeFilter !== "all" && String(a.resume?.id ?? "") !== resumeFilter) return false;
      if (modeFilter !== "all" && a.jobMode !== modeFilter) return false;
      if (typeFilter !== "all" && a.jobType !== typeFilter) return false;
      if (starredOnly && !a.starred) return false;
      if (!q) return true;
      return `${a.company} ${a.roleTitle} ${a.location ?? ""}`.toLowerCase().includes(q);
    });
    filtered.sort((a, b) => {
      if (!!a.starred !== !!b.starred) return a.starred ? -1 : 1;
      if (sort === "company") return a.company.localeCompare(b.company);
      const ta = new Date(a.appliedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.appliedAt || b.createdAt || 0).getTime();
      if (sort === "oldest") return ta - tb;
      if (sort === "applied") {
        // Entries actually applied to first (newest applied date), the rest by recency.
        const aa = a.appliedAt ? new Date(a.appliedAt).getTime() : 0;
        const ba = b.appliedAt ? new Date(b.appliedAt).getTime() : 0;
        if (aa !== ba) return ba - aa;
        return tb - ta;
      }
      return tb - ta;
    });
    return {
      active: filtered.filter((a) => !a.archived),
      archivedItems: filtered.filter((a) => a.archived),
    };
  }, [apps, search, resumeFilter, modeFilter, typeFilter, sort, starredOnly]);

  const totalVisible = active.length + archivedItems.length;
  const selected = selectedId == null ? null : apps.find((a) => a.id === selectedId) ?? null;

  const cardHandlers = (a: Application) => ({
    app: a,
    busy: pending.has(a.id),
    picked: picked.has(a.id),
    onTogglePick: () => togglePick(a.id),
    onOpen: () => setSelectedId(a.id),
    onConfirm: () => confirmSubmitted(a.id),
    onStar: () => toggleStar(a),
    onUnsave: () => unsave(a),
    onArchive: (v: boolean) => setArchived(a, v),
    onMoveTo: (s: string) => moveTo(a, s),
    onDelete: () => remove(a),
  });

  return (
    <div>
      {/* Empty board still shows the stages below — this banner explains how they fill. */}
      {apps.length === 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-dashed border-line bg-paper p-4">
          <p className="text-sm text-muted">
            Your board fills itself — fill or save a job with the Kiwiply extension and it lands here
            automatically: drafts on every fill, confirmed when you submit. Or add one by hand.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setAdding(true)} className={buttonVariants("accent")}>
              + Add application
            </button>
            <Link href="/resumes" className={buttonVariants("ghost")}>
              Upload a resume
            </Link>
          </div>
        </div>
      )}

      {/* Tools — search + one Filters popover + sort, so the row stays calm. */}
      {apps.length > 0 && (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[340px] flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, role, location…"
            className="w-full rounded-full border border-line bg-paper py-2 pl-9 pr-4 text-[13.5px] text-ink outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
        <FilterMenu
          starredOnly={starredOnly}
          mode={modeFilter}
          type={typeFilter}
          resume={resumeFilter}
          resumeOptions={resumeOptions}
          activeCount={activeFilterCount}
          onStarred={setStarredOnly}
          onMode={setModeFilter}
          onType={setTypeFilter}
          onResume={setResumeFilter}
          onClear={clearFilters}
        />
        <SortMenu value={sort} onChange={setSort} />
        <button type="button" onClick={() => setAdding(true)} className={cn(buttonVariants("accent"), "ml-auto")}>
          + Add application
        </button>
      </div>
      )}

      {/* Active-filter summary — how much of the board is hidden, with a one-click reset. */}
      {apps.length > 0 && activeFilterCount > 0 && (
        <p className="-mt-2 mb-3 text-[12px] text-muted">
          Showing {totalVisible} of {apps.length} application{apps.length === 1 ? "" : "s"} ·{" "}
          <button type="button" onClick={clearFilters} className="font-semibold text-accent-deep hover:underline">
            Clear filters
          </button>
        </p>
      )}

      {/* Bulk-action toolbar — appears once one or more cards are selected. */}
      {picked.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-accent bg-accent-soft px-3 py-2 text-[13px]">
          <span className="font-semibold text-accent-deep">{picked.size} selected</span>
          <select
            aria-label="Move selected to a status"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) void bulkPatch({ status: e.target.value, archived: false });
              e.target.value = "";
            }}
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-[12.5px] font-medium text-ink-soft outline-none focus:border-accent"
          >
            <option value="" disabled>Move to…</option>
            {STAGES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <button type="button" onClick={() => void bulkPatch({ starred: true })} className="rounded-full border border-line bg-paper px-3 py-1.5 font-medium text-ink-soft hover:border-accent">★ Star</button>
          <button type="button" onClick={() => void bulkPatch({ starred: false })} className="rounded-full border border-line bg-paper px-3 py-1.5 font-medium text-ink-soft hover:border-accent">☆ Unstar</button>
          <button type="button" onClick={() => void bulkPatch({ archived: true })} className="rounded-full border border-line bg-paper px-3 py-1.5 font-medium text-ink-soft hover:border-accent">Archive</button>
          <button type="button" onClick={() => void bulkDelete()} className="rounded-full border border-line bg-paper px-3 py-1.5 font-medium text-danger hover:bg-paper-2">Delete</button>
          <button type="button" onClick={clearPicked} className="ml-auto rounded-full px-3 py-1.5 font-medium text-muted hover:text-ink">Clear</button>
        </div>
      )}

      {error && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}

      {apps.length > 0 && totalVisible === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-line bg-paper py-12 text-center text-sm text-muted">
          No applications match your search or filter.
        </p>
      ) : (
        /* Board — Saved shelf + Draft tray on top; Applied/Interview/Offer as the active
           pipeline (Interview/Offer wider + richer); Rejected/Archived as slim rows below. */
        <div className="flex flex-col gap-3.5">
          {ROW_STATUSES.map((key) => {
            const col = COL_BY_KEY[key];
            const items = active.filter((a) => a.status === key);
            const collapsed = collapsedRows.has(key);
            const saved = key === "SAVED";
            return (
              <section
                key={key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(key);
                }}
                onDragLeave={() => setDragOver((c) => (c === key ? null : c))}
                onDrop={(e) => onDrop(e, key)}
                className={cn(
                  "flex flex-col rounded-[var(--radius-lg)] border border-line/60 bg-paper-2 p-3 transition-colors",
                  dragOver === key && "outline-2 outline-dashed outline-accent",
                )}
              >
                <button type="button" onClick={() => toggleRow(key)} aria-expanded={!collapsed} className="flex w-full items-center gap-2 px-1 text-left">
                  <Chevron open={!collapsed} className="text-muted" />
                  <span className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[.06em] text-ink-soft">
                    <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                    {col.label}
                  </span>
                  {ROW_HINTS[key] && <span className="hidden text-[11px] font-medium text-muted sm:block">{ROW_HINTS[key]}</span>}
                  <span className="ml-auto rounded-full bg-paper px-2 py-0.5 text-xs text-muted">{items.length}</span>
                </button>
                {!collapsed &&
                  (items.length ? (
                    <ul className="scroll-slim mt-3 flex gap-2.5 overflow-x-auto pb-1.5">
                      {items.map((a) => (
                        <BoardCard
                          key={a.id}
                          variant={saved ? "saved" : "compact"}
                          className="w-[280px] shrink-0"
                          {...cardHandlers(a)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 px-1 text-[12px] text-muted">Nothing here yet.</p>
                  ))}
              </section>
            );
          })}

          {/* Active pipeline — Applied/Interview/Offer as equal-width columns; every card
              in them shows the same richer detail set. */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {GRID_STATUSES.map((key) => {
              const col = COL_BY_KEY[key];
              const items = active.filter((a) => a.status === key);
              return (
                <section
                  key={key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(key);
                  }}
                  onDragLeave={() => setDragOver((c) => (c === key ? null : c))}
                  onDrop={(e) => onDrop(e, key)}
                  className={cn(
                    "flex flex-col rounded-[var(--radius-lg)] border border-line/60 bg-paper-2 p-3 transition-colors",
                    COLUMN_H,
                    dragOver === key && "outline-2 outline-dashed outline-accent",
                  )}
                >
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[.06em] text-ink-soft">
                      <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                      {col.label}
                    </span>
                    <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">{items.length}</span>
                  </div>
                  <ul className="scroll-slim flex flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
                    {items.length ? (
                      items.map((a) => <BoardCard key={a.id} variant="rich" {...cardHandlers(a)} />)
                    ) : (
                      <li className="grid flex-1 place-items-center rounded-[var(--radius)] border border-dashed border-line text-[12px] text-muted">
                        Drag a card here
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>

          {/* Rejected — slim collapsible list rows; still a drop target for drag-to-reject. */}
          {(() => {
            const col = COL_BY_KEY.REJECTED;
            const items = active.filter((a) => a.status === "REJECTED");
            const collapsed = collapsedRows.has("REJECTED");
            return (
              <section
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver("REJECTED");
                }}
                onDragLeave={() => setDragOver((c) => (c === "REJECTED" ? null : c))}
                onDrop={(e) => onDrop(e, "REJECTED")}
                className={cn(
                  "flex flex-col rounded-[var(--radius-lg)] border border-line/60 bg-paper-2 p-3 transition-colors",
                  dragOver === "REJECTED" && "outline-2 outline-dashed outline-accent",
                )}
              >
                <button type="button" onClick={() => toggleRow("REJECTED")} aria-expanded={!collapsed} className="flex w-full items-center gap-2 px-1 text-left">
                  <Chevron open={!collapsed} className="text-muted" />
                  <span className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[.06em] text-ink-soft">
                    <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                    {col.label}
                  </span>
                  <span className="ml-auto rounded-full bg-paper px-2 py-0.5 text-xs text-muted">{items.length}</span>
                </button>
                {!collapsed &&
                  (items.length ? (
                    <ul className="scroll-slim mt-3 flex max-h-[264px] flex-col gap-1.5 overflow-y-auto pr-1">
                      {items.map((a) => (
                        <BoardRow key={a.id} {...cardHandlers(a)} />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 px-1 text-[12px] text-muted">Nothing here — drag a card here when a rejection comes in.</p>
                  ))}
              </section>
            );
          })()}

          {/* Archived — same slim rows, greyed out. */}
          {archivedItems.length > 0 && (() => {
            const collapsed = collapsedRows.has("ARCHIVED");
            return (
              <section className="flex flex-col rounded-[var(--radius-lg)] border border-line/60 bg-paper-2 p-3">
                <button type="button" onClick={() => toggleRow("ARCHIVED")} aria-expanded={!collapsed} className="flex w-full items-center gap-2 px-1 text-left">
                  <Chevron open={!collapsed} className="text-muted" />
                  <span className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[.06em] text-muted">
                    <span className="h-2 w-2 rounded-full bg-[color:var(--color-muted)]" />
                    Archived
                  </span>
                  <span className="ml-auto rounded-full bg-paper px-2 py-0.5 text-xs text-muted">{archivedItems.length}</span>
                </button>
                {!collapsed && (
                  <ul className="scroll-slim mt-3 flex max-h-[264px] flex-col gap-1.5 overflow-y-auto pr-1">
                    {archivedItems.map((a) => (
                      <BoardRow key={a.id} archived {...cardHandlers(a)} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })()}
        </div>
      )}

      <DetailPanel
        app={selected}
        resumes={resumeOpts}
        onClose={() => setSelectedId(null)}
        onChangeStatus={(s) => selected && changeStatus(selected.id, s)}
        onSaveDetails={(changes) => {
          if (!selected) return;
          // A resume re-link sends { resumeId } but the card previews the resolved { resume }.
          const rid = typeof changes.resumeId === "number" ? changes.resumeId : null;
          const r = rid ? resumeOpts.find((x) => x.id === rid) : null;
          void mutate(selected.id, "PUT", changes, r ? { ...changes, resume: { id: r.id, label: r.label } } : changes);
        }}
        onStar={() => selected && toggleStar(selected)}
        onUnsave={() => selected && unsave(selected)}
        onArchive={(v) => selected && setArchived(selected, v)}
        onDelete={() => selected && remove(selected)}
      />

      {adding && (
        <AddApplicationDialog
          resumes={resumeOpts}
          baseProfile={baseProfile}
          existingApps={apps}
          onResumeCreated={addResumeOpt}
          onClose={() => setAdding(false)}
          onCreate={createApplication}
        />
      )}
    </div>
  );
}

interface NewApplication {
  company: string;
  roleTitle: string;
  status: string;
  jobUrl?: string;
  location?: string;
  jobType?: string;
  jobMode?: string;
  email?: string;
  salary?: string;
  jobDescription?: string;
  resumeId?: number;
  attachmentFile?: File;
}

function AddApplicationDialog({
  resumes,
  baseProfile,
  existingApps,
  onResumeCreated,
  onClose,
  onCreate,
}: {
  resumes: ResumeOption[];
  baseProfile: Record<string, unknown>;
  existingApps: Application[];
  onResumeCreated: (r: ResumeOption) => void;
  onClose: () => void;
  onCreate: (input: NewApplication) => Promise<boolean>;
}) {
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [status, setStatus] = useState("SAVED");
  const [jobUrl, setJobUrl] = useState("");
  const [location, setLocation] = useState("");
  const [jobType, setJobType] = useState("");
  const [jobMode, setJobMode] = useState("");
  const [email, setEmail] = useState("");
  const [salary, setSalary] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  // Preselect the user's default resume, if they have one.
  const [resumeId, setResumeId] = useState(() => {
    const def = resumes.find((r) => r.defaultResume);
    return def ? String(def.id) : "";
  });
  const [saving, setSaving] = useState(false);
  const [dupConfirm, setDupConfirm] = useState(false); // armed when the entry matches an existing one
  const firstRef = useRef<HTMLInputElement>(null);
  const resumeUploadServices = useResumeUploadServices();

  // On-the-fly resume upload from within the dialog. The dialog stays mounted throughout, so
  // anything already typed survives the upload/review round-trip.
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null); // chosen file → parse-or-attach prompt
  const [reviewFile, setReviewFile] = useState<File | null>(null); // file being parsed+reviewed (overlay)
  const [attachment, setAttachment] = useState<File | null>(null); // "just attach" — uploaded to the app on save

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (f) setPendingFile(f);
  }

  // Esc closes; focus the first field on open.
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave = company.trim() !== "" && roleTitle.trim() !== "" && !saving;

  // Warn (never block) when this manual entry matches an existing one on company + role (+ location
  // if given). The server still dedups by job-id/URL; this catches URL-less manual duplicates.
  function isDuplicate(): boolean {
    const c = company.trim().toLowerCase();
    const r = roleTitle.trim().toLowerCase();
    if (!c || !r) return false;
    const loc = location.trim().toLowerCase();
    return existingApps.some(
      (a) =>
        (a.company ?? "").trim().toLowerCase() === c &&
        (a.roleTitle ?? "").trim().toLowerCase() === r &&
        (loc === "" || (a.location ?? "").trim().toLowerCase() === loc),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    if (!dupConfirm && isDuplicate()) {
      setDupConfirm(true);
      return;
    }
    setSaving(true);
    const ok = await onCreate({
      company: company.trim(),
      roleTitle: roleTitle.trim(),
      status,
      jobUrl: jobUrl.trim() || undefined,
      location: location.trim() || undefined,
      jobType: jobType || undefined,
      jobMode: jobMode || undefined,
      email: email.trim() || undefined,
      salary: salary.trim() || undefined,
      jobDescription: jobDescription.trim() || undefined,
      resumeId: resumeId ? Number(resumeId) : undefined,
      attachmentFile: attachment ?? undefined,
    });
    setSaving(false);
    if (ok) onClose();
  }

  const fieldClass = "w-full rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent";
  const labelClass = "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted";

  return (
    <>
      <div onClick={onClose} aria-hidden className="fixed inset-0 z-[145] bg-[rgba(35,40,38,.45)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add application"
        className="fixed left-1/2 top-1/2 z-[150] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-line bg-paper shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center justify-between border-b border-line p-5">
          <h2 className="font-display text-xl font-semibold text-ink">Add application</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-muted hover:bg-paper-2">✕</button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3 p-5">
          <label className={labelClass}>
            Company *
            <input ref={firstRef} value={company} onChange={(e) => { setCompany(e.target.value); setDupConfirm(false); }} className={fieldClass} required />
          </label>
          <label className={labelClass}>
            Role title *
            <input value={roleTitle} onChange={(e) => { setRoleTitle(e.target.value); setDupConfirm(false); }} className={fieldClass} required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Add to
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>{c.key === "SAVED" ? "Saved (bookmark)" : c.label}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Location
              <input value={location} onChange={(e) => { setLocation(e.target.value); setDupConfirm(false); }} className={fieldClass} placeholder="Remote · NYC…" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Job type
              <select value={jobType} onChange={(e) => setJobType(e.target.value)} className={fieldClass}>
                <option value="">—</option>
                {JOB_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
              </select>
            </label>
            <label className={labelClass}>
              Job mode
              <select value={jobMode} onChange={(e) => setJobMode(e.target.value)} className={fieldClass}>
                <option value="">—</option>
                {JOB_MODES.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} placeholder="Defaults to your profile email" />
            </label>
            <label className={labelClass}>
              Salary
              <input value={salary} onChange={(e) => setSalary(e.target.value)} className={fieldClass} placeholder="$120k – $150k/yr" />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Resume sent</span>
            {resumes.length > 0 && (
              <select value={resumeId} onChange={(e) => setResumeId(e.target.value)} className={cn(fieldClass, "min-w-0 truncate")}>
                <option value="">— None —</option>
                {resumes.map((r) => (
                  <option key={r.id} value={String(r.id)}>{r.label}{r.defaultResume ? " · default" : ""}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="self-start text-[12px] font-semibold text-accent-deep hover:underline"
            >
              + Upload a new resume
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain" onChange={onPickFile} className="hidden" />
            {attachment && (
              <p className="flex items-center gap-1.5 text-[12px] text-ink-soft">
                <span>📎</span>
                <span className="min-w-0 truncate">{attachment.name}</span>
                <span className="flex-none text-muted">— attached to this application</span>
                <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment" className="flex-none text-muted hover:text-danger">✕</button>
              </p>
            )}
          </div>
          <label className={labelClass}>
            Job URL
            <input type="url" value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} className={fieldClass} placeholder="https://…" />
          </label>
          <label className={labelClass}>
            Job description
            <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={3} className={cn(fieldClass, "resize-y")} />
          </label>
          {dupConfirm && (
            <p role="alert" className="text-[12.5px] font-medium text-brown-deep">
              You already have an application for this company and role. Add it anyway?
            </p>
          )}
          <div className="mt-1 flex justify-end gap-3">
            <button type="button" onClick={onClose} className={buttonVariants("ghost")}>Cancel</button>
            <button type="submit" disabled={!canSave} className={cn(buttonVariants("accent"), "disabled:opacity-50")}>
              {saving ? "Adding…" : dupConfirm ? "Add anyway" : "Add to board"}
            </button>
          </div>
        </form>
      </div>

      {/* After picking a file: parse & save to the board, or just attach the raw file. */}
      {pendingFile && (
        <div className="fixed inset-0 z-[155] grid place-items-center bg-[rgba(35,40,38,.45)] p-6" role="dialog" aria-modal="true" aria-label="Use this resume">
          <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[var(--shadow-lg)]">
            <h3 className="font-display text-lg font-semibold text-ink">Add “{pendingFile.name}”</h3>
            <p className="mt-1.5 text-sm text-muted">
              Parse it into a reviewed resume on your board, or just attach the file to this application for reference.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={() => { const f = pendingFile; setPendingFile(null); setReviewFile(f); }} className={buttonVariants("accent")}>
                Parse &amp; save to my board
              </button>
              <button type="button" onClick={() => { setAttachment(pendingFile); setPendingFile(null); }} className={buttonVariants("ghost")}>
                Just attach the file
              </button>
              <button type="button" onClick={() => setPendingFile(null)} className="mt-1 text-[12.5px] font-medium text-muted hover:text-ink">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parse & save: full review overlay on top of this dialog, which stays mounted so the
          form keeps everything already typed. On save it selects the new resume here. */}
      {reviewFile && (
        <ResumeUpload
          embedded
          sectionsDefaultOpen
          initialFile={reviewFile}
          baseProfile={baseProfile}
          onSaved={(r) => { onResumeCreated(r); setResumeId(String(r.id)); }}
          onClose={() => setReviewFile(null)}
          {...resumeUploadServices}
        />
      )}
    </>
  );
}

/** Per-card ⋯ options menu, rendered in a portal so a column's internal scroll never clips it. */
function CardMenu({
  starred,
  archived,
  busy,
  canStar = true,
  onStar,
  onArchive,
  onMoveTo,
  onDelete,
}: {
  starred: boolean;
  archived: boolean;
  busy: boolean;
  canStar?: boolean;
  onStar: () => void;
  onArchive: (v: boolean) => void;
  onMoveTo: (status: string) => void;
  onDelete: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      setPos(null);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Estimate the menu height from its row count so it can flip above the button when
    // there isn't room below (fixes rows near the viewport bottom running off-screen).
    const rows = (canStar ? 1 : 0) + STAGES.length + 2; // star + stages + archive/delete
    const estH = rows * 30 + 44; // rows + "Move to" label + divider + padding
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < estH + 12 && r.top > spaceBelow;
    const top = openUp ? Math.max(8, r.top - estH - 4) : r.bottom + 4;
    setPos({ top, left: Math.max(8, r.right - 180) });
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const item = "block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:bg-paper-2";
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setPos(null);
    fn();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Options"
        title="Options"
        onClick={toggle}
        className="shrink-0 rounded-md px-1.5 leading-none text-muted transition-colors hover:bg-paper-2 hover:text-ink disabled:opacity-50"
      >
        ⋯
      </button>
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[160]" aria-hidden onClick={(e) => { e.stopPropagation(); setPos(null); }} />
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 180, maxHeight: "calc(100vh - 16px)" }}
              className="scroll-slim z-[161] overflow-y-auto rounded-lg border border-line bg-paper p-1 shadow-[var(--shadow-lg)]"
            >
              {canStar && (
                <button role="menuitem" className={item} onClick={run(onStar)}>{starred ? "★ Unstar" : "☆ Star"}</button>
              )}
              <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">Move to</div>
              {STAGES.map((c) => (
                <button key={c.key} role="menuitem" className={cn(item, "pl-4")} onClick={run(() => onMoveTo(c.key))}>{c.label}</button>
              ))}
              <div className="my-1 h-px bg-line" />
              <button role="menuitem" className={item} onClick={run(() => onArchive(!archived))}>{archived ? "Unarchive" : "Archive"}</button>
              <button role="menuitem" className={cn(item, "text-danger")} onClick={run(onDelete)}>Delete</button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function BoardCard({
  app,
  busy,
  picked,
  archived = false,
  variant = "compact",
  className,
  onTogglePick,
  onOpen,
  onConfirm,
  onStar,
  onUnsave,
  onArchive,
  onMoveTo,
  onDelete,
}: {
  app: Application;
  busy: boolean;
  picked: boolean;
  archived?: boolean;
  /** compact = dense pipeline card; rich = larger Interview/Offer card; saved = wide bookmark tile. */
  variant?: "compact" | "rich" | "saved";
  className?: string;
  onTogglePick: () => void;
  onOpen: () => void;
  onConfirm: () => void;
  onStar: () => void;
  onUnsave: () => void;
  onArchive: (v: boolean) => void;
  onMoveTo: (status: string) => void;
  onDelete: () => void;
}) {
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const isSaved = app.status === "SAVED";
  const rich = variant === "rich";
  const showNudge = app.status === "DRAFT" && !archived && !nudgeDismissed;
  const date = cardDate(app);
  const modeLabel = app.jobMode ? JOB_MODE_LABEL[app.jobMode] : "";
  const typeLabel = app.jobType ? JOB_TYPE_LABEL[app.jobType] : "";
  // Don't repeat a mode the location already conveys (e.g. location "Remote, US" + mode "Remote").
  const showModeChip = !!modeLabel && !(app.location && app.location.toLowerCase().includes(modeLabel.toLowerCase()));
  const openPosting = () => {
    if (!app.jobUrl) return;
    track("board_apply_clicked", { status: app.status });
    window.open(app.jobUrl, "_blank", "noopener");
  };

  return (
    <li
      draggable={!archived}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragStart={(e) => {
        if (archived) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", String(app.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "rounded-[var(--radius)] border bg-paper shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        rich ? "p-3.5" : "p-3",
        archived
          ? "cursor-pointer opacity-60 grayscale hover:opacity-100"
          : "cursor-grab hover:border-accent hover:shadow-[var(--shadow)] active:cursor-grabbing",
        picked ? "border-accent ring-1 ring-accent" : "border-line",
        busy && "opacity-60",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Company avatar; hovering it (or a picked state) swaps in the multi-select checkbox. */}
        <span className={cn("group/pick relative shrink-0", rich ? "h-9 w-9" : "h-8 w-8")}>
          <input
            type="checkbox"
            checked={picked}
            aria-label="Select application"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onTogglePick();
            }}
            className={cn(
              "peer absolute inset-0 z-[1] m-auto h-4 w-4 accent-[color:var(--color-accent)] transition-opacity",
              picked
                ? "opacity-100"
                : "pointer-events-none opacity-0 focus-visible:opacity-100 group-hover/pick:pointer-events-auto group-hover/pick:opacity-100",
            )}
          />
          <span
            aria-hidden
            className={cn(
              "grid h-full w-full place-items-center rounded-lg font-bold transition-opacity group-hover/pick:opacity-0 peer-focus-visible:opacity-0",
              rich ? "text-[14px]" : "text-[13px]",
              picked && "opacity-0",
              avatarTint(app.company),
            )}
          >
            {companyInitial(app.company)}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate font-bold leading-snug text-ink", rich ? "text-[14px]" : "text-[13.5px]")}>{app.roleTitle}</div>
          <div className={cn("truncate text-ink-soft", rich ? "text-[13px]" : "text-[12.5px]")}>{app.company}</div>
        </div>
        {/* Star/bookmark sits right beside the ⋯ menu, apart from the title. */}
        <div className="flex items-start gap-0.5">
          {isSaved ? (
            <BookmarkButton busy={busy} onRemove={onUnsave} />
          ) : (
            <StarButton starred={!!app.starred} busy={busy} onToggle={onStar} />
          )}
          <CardMenu
            starred={!!app.starred}
            archived={archived}
            busy={busy}
            canStar={!isSaved}
            onStar={onStar}
            onArchive={onArchive}
            onMoveTo={onMoveTo}
            onDelete={onDelete}
          />
        </div>
      </div>

      {(app.salary || app.location || typeLabel || showModeChip) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {app.salary && (
            <span className="max-w-full truncate rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-deep">
              {app.salary}
            </span>
          )}
          {app.location && (
            <span className="max-w-full truncate rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent-deep">
              {app.location}
            </span>
          )}
          {typeLabel && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent-deep">{typeLabel}</span>
          )}
          {showModeChip && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent-deep">{modeLabel}</span>
          )}
        </div>
      )}
      {date && <div className={cn("text-[11px] text-muted", app.salary || app.location || typeLabel || showModeChip ? "mt-1.5" : "mt-2")}>{date}</div>}

      {/* Saved bookmarks: one-click jump to the posting. Filling it there moves it to Draft. */}
      {isSaved && !archived && app.jobUrl && (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            openPosting();
          }}
          className="mt-2 w-full rounded-md bg-accent px-2.5 py-1.5 text-[11.5px] font-bold text-on-accent transition-[filter] hover:brightness-95 disabled:opacity-50"
        >
          Apply now ↗
        </button>
      )}

      {showNudge && (
        <div className="mt-2 w-fit max-w-full rounded-lg border border-accent bg-accent-soft p-2 text-[11.5px] text-accent-deep">
          <div className="flex items-center justify-between gap-1.5">
            <div className="font-bold">Did you finish applying?</div>
            <button
              onClick={(e) => { e.stopPropagation(); setNudgeDismissed(true); }}
              disabled={busy}
              aria-label="Dismiss"
              title="Dismiss"
              className="shrink-0 rounded px-1 leading-none text-muted hover:text-ink"
            >
              ✕
            </button>
          </div>
          <div className="mt-1 flex gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onConfirm(); }}
              disabled={busy}
              className="rounded-md bg-accent px-2.5 py-1 font-bold text-on-accent disabled:opacity-50"
            >
              Applied
            </button>
            {app.jobUrl ? (
              <button
                onClick={(e) => { e.stopPropagation(); openPosting(); }}
                disabled={busy}
                className="rounded-md border border-accent px-2.5 py-1 font-bold text-accent-deep disabled:opacity-50"
              >
                Continue ↗
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setNudgeDismissed(true); }}
                disabled={busy}
                className="rounded-md border border-accent px-2.5 py-1 font-bold text-accent-deep"
              >
                Not yet
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Slim one-line row for the low-attention lists (Rejected, Archived) — same avatar/
 * checkbox swap and handlers as a card, a fraction of the height.
 */
function BoardRow({
  app,
  busy,
  picked,
  archived = false,
  onTogglePick,
  onOpen,
  onStar,
  onArchive,
  onMoveTo,
  onDelete,
}: {
  app: Application;
  busy: boolean;
  picked: boolean;
  archived?: boolean;
  onTogglePick: () => void;
  onOpen: () => void;
  onStar: () => void;
  onArchive: (v: boolean) => void;
  onMoveTo: (status: string) => void;
  onDelete: () => void;
}) {
  const date = cardDate(app);
  return (
    <li
      draggable={!archived}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragStart={(e) => {
        if (archived) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", String(app.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius)] border bg-paper px-3 py-2 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        archived ? "cursor-pointer opacity-60 grayscale hover:opacity-100" : "cursor-grab hover:border-accent active:cursor-grabbing",
        picked ? "border-accent ring-1 ring-accent" : "border-line",
        busy && "opacity-60",
      )}
    >
      <span className="group/pick relative h-6 w-6 shrink-0">
        <input
          type="checkbox"
          checked={picked}
          aria-label="Select application"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onTogglePick();
          }}
          className={cn(
            "peer absolute inset-0 z-[1] m-auto h-3.5 w-3.5 accent-[color:var(--color-accent)] transition-opacity",
            picked
              ? "opacity-100"
              : "pointer-events-none opacity-0 focus-visible:opacity-100 group-hover/pick:pointer-events-auto group-hover/pick:opacity-100",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "grid h-full w-full place-items-center rounded-md text-[10.5px] font-bold transition-opacity group-hover/pick:opacity-0 peer-focus-visible:opacity-0",
            picked && "opacity-0",
            avatarTint(app.company),
          )}
        >
          {companyInitial(app.company)}
        </span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <span className="font-bold text-ink">{app.roleTitle}</span>
        <span className="text-muted"> — {app.company}</span>
      </span>
      {date && <span className="hidden shrink-0 text-[11px] text-muted sm:block">{date}</span>}
      <StarButton starred={!!app.starred} busy={busy} onToggle={onStar} />
      <CardMenu
        starred={!!app.starred}
        archived={archived}
        busy={busy}
        onStar={onStar}
        onArchive={onArchive}
        onMoveTo={onMoveTo}
        onDelete={onDelete}
      />
    </li>
  );
}

function DetailPanel({
  app,
  resumes,
  onClose,
  onChangeStatus,
  onSaveDetails,
  onStar,
  onUnsave,
  onArchive,
  onDelete,
}: {
  app: Application | null;
  resumes: ResumeOption[];
  onClose: () => void;
  onChangeStatus: (status: string) => void;
  onSaveDetails: (changes: Record<string, unknown>) => void;
  onStar: () => void;
  onUnsave: () => void;
  onArchive: (v: boolean) => void;
  onDelete: () => void;
}) {
  const open = !!app;
  const closeRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ company: "", roleTitle: "", location: "", jobType: "", jobMode: "", email: "", salary: "", jobUrl: "", jobDescription: "", resumeId: "" });
  const [descOpen, setDescOpen] = useState(false); // job description collapsed by default
  const [resumeOpen, setResumeOpen] = useState(false); // resume preview collapsed — the file loads only on expand

  // Reset the transient panel view whenever the selected application changes (render-phase
  // adjustment — the documented pattern for resetting state on a prop change, no effect needed).
  const [prevId, setPrevId] = useState(app?.id);
  if (app?.id !== prevId) {
    setPrevId(app?.id);
    setEditing(false);
    setDescOpen(false);
    setResumeOpen(false);
  }

  function startEdit() {
    if (!app) return;
    setForm({
      company: app.company ?? "",
      roleTitle: app.roleTitle ?? "",
      location: app.location ?? "",
      jobType: app.jobType ?? "",
      jobMode: app.jobMode ?? "",
      email: app.email ?? "",
      salary: app.salary ?? "",
      jobUrl: app.jobUrl ?? "",
      jobDescription: app.jobDescription ?? "",
      resumeId: app.resume?.id ? String(app.resume.id) : "",
    });
    setEditing(true);
  }
  function saveEdit() {
    const company = form.company.trim();
    const roleTitle = form.roleTitle.trim();
    if (!company || !roleTitle) return;
    const changes: Record<string, unknown> = {
      company,
      roleTitle,
      location: form.location.trim(),
      jobType: form.jobType,
      jobMode: form.jobMode,
      email: form.email.trim(),
      salary: form.salary.trim(),
      jobUrl: form.jobUrl.trim(),
      jobDescription: form.jobDescription.trim(),
    };
    // The backend can only (re)link a resume, not unlink — send only a real new pick.
    const rid = form.resumeId ? Number(form.resumeId) : null;
    if (rid && rid !== app?.resume?.id) changes.resumeId = rid;
    onSaveDetails(changes);
    setEditing(false);
  }

  const dField = "w-full rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent";
  const dLabel = "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted";

  // Esc closes; move focus into the panel when it opens (a11y for the dialog).
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // The resume file actually used for this job: its one-off attachment if present, otherwise
  // the linked library resume. `previewHref` streams inline for the collapsible preview and
  // isn't fetched until the user expands that section.
  const previewHref = app
    ? app.attachmentFilename
      ? `/api/applications/${app.id}/attachment`
      : app.resume?.id
        ? `/api/resumes/${app.resume.id}/file`
        : null
    : null;
  const resumeName = app ? app.attachmentFilename || app.resume?.label || (app.resume?.id ? `Resume #${app.resume.id}` : "") : "";

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "fixed inset-0 z-[130] bg-[rgba(35,40,38,.45)] transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={app ? `${app.company} — ${app.roleTitle}` : "Application detail"}
        className={cn(
          "fixed inset-y-0 right-0 z-[140] flex w-full max-w-md flex-col bg-paper shadow-[var(--shadow-lg)] transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {app && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-line p-5">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden
                  className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[16px] font-bold", avatarTint(app.company))}
                >
                  {companyInitial(app.company)}
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold leading-snug text-ink">{app.roleTitle}</h2>
                  <p className="mt-0.5 flex items-baseline gap-1.5 text-sm text-ink-soft">
                    <span className="truncate">{app.company}</span>
                    {app.archived && (
                      <span className="shrink-0 rounded-[5px] border border-line px-1.5 py-0.5 text-[10px] text-muted">Archived</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {app.status === "SAVED" ? (
                  <BookmarkButton busy={false} onRemove={onUnsave} className="px-1.5 py-1" />
                ) : (
                  <StarButton starred={!!app.starred} busy={false} onToggle={onStar} className="text-[18px]" />
                )}
                <button ref={closeRef} onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-muted hover:bg-paper-2">✕</button>
              </div>
            </div>

            <div className="scroll-slim flex-1 overflow-auto p-5">
              {editing ? (
                <div className="flex flex-col gap-3">
                  <label className={dLabel}>
                    Company *
                    <input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} className={dField} />
                  </label>
                  <label className={dLabel}>
                    Role title *
                    <input value={form.roleTitle} onChange={(e) => setForm((f) => ({ ...f, roleTitle: e.target.value }))} className={dField} />
                  </label>
                  <label className={dLabel}>
                    Location
                    <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className={dField} placeholder="Remote · NYC…" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={dLabel}>
                      Job type
                      <select value={form.jobType} onChange={(e) => setForm((f) => ({ ...f, jobType: e.target.value }))} className={dField}>
                        <option value="">—</option>
                        {JOB_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                      </select>
                    </label>
                    <label className={dLabel}>
                      Job mode
                      <select value={form.jobMode} onChange={(e) => setForm((f) => ({ ...f, jobMode: e.target.value }))} className={dField}>
                        <option value="">—</option>
                        {JOB_MODES.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={dLabel}>
                      Email
                      <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={dField} placeholder="you@example.com" />
                    </label>
                    <label className={dLabel}>
                      Salary
                      <input value={form.salary} onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))} className={dField} placeholder="$120k – $150k/yr" />
                    </label>
                  </div>
                  <label className={dLabel}>
                    Job URL
                    <input type="url" value={form.jobUrl} onChange={(e) => setForm((f) => ({ ...f, jobUrl: e.target.value }))} className={dField} placeholder="https://…" />
                  </label>
                  <label className={dLabel}>
                    Resume sent
                    <select
                      value={form.resumeId}
                      onChange={(e) => setForm((f) => ({ ...f, resumeId: e.target.value }))}
                      disabled={resumes.length === 0}
                      className={cn(dField, "min-w-0 truncate disabled:opacity-60")}
                    >
                      <option value="">{resumes.length ? "— None linked —" : "No resumes uploaded yet"}</option>
                      {resumes.map((r) => (
                        <option key={r.id} value={String(r.id)}>{r.label}{r.defaultResume ? " · default" : ""}</option>
                      ))}
                    </select>
                  </label>
                  <label className={dLabel}>
                    Job description
                    <textarea value={form.jobDescription} onChange={(e) => setForm((f) => ({ ...f, jobDescription: e.target.value }))} rows={6} className={cn(dField, "resize-y")} />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditing(false)} className={buttonVariants("ghost")}>Cancel</button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={!form.company.trim() || !form.roleTitle.trim()}
                      className={cn(buttonVariants("accent"), "disabled:opacity-50")}
                    >
                      Save details
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Stage stepper — the funnel at a glance; click a pill to move the application.
                      SAVED is a bookmark, not a stage: a saved job shows no active pill, and
                      picking one moves it into the pipeline. */}
                  <div className="mb-6">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[.06em] text-muted">Stage</div>
                    {app.status === "SAVED" && (
                      <p className="mb-2 text-[12px] text-muted">
                        This is a saved job — pick a stage to move it into your pipeline.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {STAGES.map((c) => {
                        const current = c.key === app.status;
                        return (
                          <button
                            key={c.key}
                            type="button"
                            aria-pressed={current}
                            onClick={() => !current && onChangeStatus(c.key)}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                              current
                                ? "border-transparent bg-ink text-paper"
                                : "border-line bg-paper text-muted hover:border-accent hover:text-ink",
                            )}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[.06em] text-muted">Details</span>
                    <button
                      type="button"
                      onClick={startEdit}
                      className="rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-ink-soft transition-colors hover:border-accent hover:text-ink"
                    >
                      Edit
                    </button>
                  </div>
                  {/* Every field is always shown (— when empty) so nothing looks silently missing. */}
                  <dl className="divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line">
                    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="shrink-0 text-[12px] font-medium text-muted">Location</dt>
                      <dd className="min-w-0 text-right text-[13px] text-ink">{app.location || "—"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="shrink-0 text-[12px] font-medium text-muted">Job type</dt>
                      <dd className="min-w-0 text-right text-[13px] text-ink">{(app.jobType && (JOB_TYPE_LABEL[app.jobType] || app.jobType)) || "—"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="shrink-0 text-[12px] font-medium text-muted">Job mode</dt>
                      <dd className="min-w-0 text-right text-[13px] text-ink">{(app.jobMode && (JOB_MODE_LABEL[app.jobMode] || app.jobMode)) || "—"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="shrink-0 text-[12px] font-medium text-muted">Salary</dt>
                      <dd className="min-w-0 text-right text-[13px] text-ink">{app.salary || "—"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="shrink-0 text-[12px] font-medium text-muted">Email</dt>
                      <dd className="min-w-0 break-all text-right text-[13px] text-ink">{app.email || "—"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="shrink-0 text-[12px] font-medium text-muted">ATS</dt>
                      <dd className="min-w-0 text-right text-[13px] capitalize text-ink">{app.atsPlatform || "—"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="shrink-0 text-[12px] font-medium text-muted">Applied</dt>
                      <dd className="min-w-0 text-right text-[13px] text-ink">{formatDate(app.appliedAt) || "—"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="shrink-0 text-[12px] font-medium text-muted">Added</dt>
                      <dd className="min-w-0 text-right text-[13px] text-ink">{formatDate(app.createdAt) || "—"}</dd>
                    </div>
                  </dl>

                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setDescOpen((o) => !o)}
                      aria-expanded={descOpen}
                      className="flex w-full items-center gap-1.5 text-left text-ink transition-colors hover:text-accent-deep"
                    >
                      <Chevron open={descOpen} className="text-muted" />
                      <h3 className="font-display text-base font-semibold">Job description</h3>
                    </button>
                    {descOpen &&
                      (app.jobDescription ? (
                        <div className="scroll-slim mt-2 max-h-72 overflow-y-auto overflow-x-hidden rounded-[var(--radius)] border border-line bg-paper-2/40 p-3">
                          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-soft">{app.jobDescription}</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-[13px] text-muted">No description was captured for this job.</p>
                      ))}
                  </div>

                  {/* Resume preview — collapsed by default; the file is only requested from the
                      backend once the user expands this section (the iframe mounts on open). */}
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setResumeOpen((o) => !o)}
                      aria-expanded={resumeOpen}
                      className="flex w-full items-center gap-1.5 text-left text-ink transition-colors hover:text-accent-deep"
                    >
                      <Chevron open={resumeOpen} className="text-muted" />
                      <h3 className="font-display text-base font-semibold">Resume sent</h3>
                      {resumeName && (
                        <span className="ml-auto min-w-0 max-w-[45%] truncate text-[12px] text-muted">{resumeName}</span>
                      )}
                    </button>
                    {resumeOpen &&
                      (previewHref ? (
                        <div className="mt-2 overflow-hidden rounded-[var(--radius)] border border-line bg-paper-2/40">
                          <iframe src={previewHref} title="Resume preview" className="h-96 w-full" />
                        </div>
                      ) : (
                        <p className="mt-2 text-[13px] text-muted">
                          No resume is linked to this application yet — link one via Edit.
                        </p>
                      ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-line p-4">
              {app.jobUrl && (
                <a
                  href={app.jobUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent-deep transition-colors hover:bg-accent-soft"
                >
                  View posting <span aria-hidden>↗</span>
                </a>
              )}
              <button
                onClick={() => onArchive(!app.archived)}
                className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-paper-2"
              >
                {app.archived ? "Unarchive" : "Archive"}
              </button>
              <button
                onClick={onDelete}
                className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-paper-2"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
