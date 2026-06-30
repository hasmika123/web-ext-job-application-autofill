"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/Button";
import ResumeUpload from "@/components/ResumeUpload";
import { useResumeUploadServices } from "@/lib/use-resume-upload-services";

export interface Application {
  id: number;
  company: string;
  roleTitle: string;
  jobUrl?: string | null;
  location?: string | null;
  externalJobId?: string | null;
  atsPlatform?: string | null;
  jobDescription?: string | null;
  status: string;
  submissionConfirmed?: boolean | null;
  appliedAt?: string | null;
  createdAt?: string | null;
  resume?: { id: number; label?: string | null } | null;
  attachmentFilename?: string | null;
}

// Board columns, left to right (the funnel order), each with a status dot color.
const COLUMNS: { key: string; label: string; dot: string }[] = [
  { key: "DRAFT", label: "Draft", dot: "var(--brown)" },
  { key: "SAVED", label: "Saved", dot: "var(--brown-2)" },
  { key: "APPLIED", label: "Applied", dot: "var(--accent)" },
  { key: "INTERVIEW", label: "Interview", dot: "#1d4ed8" },
  { key: "OFFER", label: "Offer", dot: "var(--accent-deep)" },
  { key: "REJECTED", label: "Rejected", dot: "var(--muted)" },
];
const STATUS_LABEL: Record<string, string> = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label]));

function hostOf(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export interface ResumeOption {
  id: number;
  label: string;
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
  const [sort, setSort] = useState<"recent" | "company">("recent");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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
  const remove = (app: Application) => {
    if (window.confirm(`Delete this entry — ${app.company} · ${app.roleTitle}?`)) {
      if (selectedId === app.id) setSelectedId(null);
      void mutate(app.id, "DELETE");
    }
  };
  const changeResume = (id: number, resumeId: number) => {
    const r = resumeOpts.find((x) => x.id === resumeId);
    void mutate(id, "PUT", { resumeId }, { resume: r ? { id: r.id, label: r.label } : null });
  };

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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = apps.filter((a) => {
      if (resumeFilter !== "all" && String(a.resume?.id ?? "") !== resumeFilter) return false;
      if (!q) return true;
      return `${a.company} ${a.roleTitle} ${a.location ?? ""}`.toLowerCase().includes(q);
    });
    filtered.sort((a, b) => {
      if (sort === "company") return a.company.localeCompare(b.company);
      const ta = new Date(a.appliedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.appliedAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
    return filtered;
  }, [apps, search, resumeFilter, sort]);

  const selected = selectedId == null ? null : apps.find((a) => a.id === selectedId) ?? null;

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

      {/* Tools — only meaningful once there are entries */}
      {apps.length > 0 && (
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, role, location…"
          className="min-w-[180px] max-w-[320px] flex-1 rounded-full border border-line bg-paper px-4 py-2 text-[13.5px] text-ink outline-none placeholder:text-muted focus:border-accent"
        />
        {resumeOptions.length > 0 && (
          <select
            value={resumeFilter}
            onChange={(e) => setResumeFilter(e.target.value)}
            className="rounded-full border border-line bg-paper px-3 py-2 text-[13px] font-medium text-ink-soft outline-none focus:border-accent"
          >
            <option value="all">All resumes</option>
            {resumeOptions.map(([id, label]) => (
              <option key={id} value={String(id)}>{label}</option>
            ))}
          </select>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "recent" | "company")}
          className="rounded-full border border-line bg-paper px-3 py-2 text-[13px] font-medium text-ink-soft outline-none focus:border-accent"
        >
          <option value="recent">Most recent</option>
          <option value="company">Company A–Z</option>
        </select>
        <button type="button" onClick={() => setAdding(true)} className={cn(buttonVariants("accent"), "ml-auto")}>
          + Add application
        </button>
      </div>
      )}

      {error && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}

      {apps.length > 0 && visible.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-line bg-paper py-12 text-center text-sm text-muted">
          No applications match your search or filter.
        </p>
      ) : (
        /* Kanban */
        <div className="flex gap-3.5 overflow-x-auto pb-3">
        {COLUMNS.map((col) => {
          const items = visible.filter((a) => a.status === col.key);
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver((c) => (c === col.key ? null : c))}
              onDrop={(e) => onDrop(e, col.key)}
              className={cn(
                "flex min-h-[320px] w-[200px] shrink-0 flex-col rounded-[var(--radius-lg)] bg-paper-2 p-3 transition-colors",
                dragOver === col.key && "outline-2 outline-dashed outline-accent",
              )}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[.06em] text-ink-soft">
                  <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                  {col.label}
                </span>
                <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">{items.length}</span>
              </div>
              <ul className="flex flex-1 flex-col gap-2.5">
                {items.map((a) => (
                  <BoardCard
                    key={a.id}
                    app={a}
                    busy={pending.has(a.id)}
                    onOpen={() => setSelectedId(a.id)}
                    onConfirm={() => confirmSubmitted(a.id)}
                    onChangeStatus={(s) => changeStatus(a.id, s)}
                    onDelete={() => remove(a)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
        </div>
      )}

      <DetailPanel
        app={selected}
        resumes={resumeOpts}
        onClose={() => setSelectedId(null)}
        onChangeStatus={(s) => selected && changeStatus(selected.id, s)}
        onChangeResume={(rid) => selected && changeResume(selected.id, rid)}
        onDelete={() => selected && remove(selected)}
      />

      {adding && (
        <AddApplicationDialog
          resumes={resumeOpts}
          baseProfile={baseProfile}
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
  jobDescription?: string;
  resumeId?: number;
  attachmentFile?: File;
}

function AddApplicationDialog({
  resumes,
  baseProfile,
  onResumeCreated,
  onClose,
  onCreate,
}: {
  resumes: ResumeOption[];
  baseProfile: Record<string, unknown>;
  onResumeCreated: (r: ResumeOption) => void;
  onClose: () => void;
  onCreate: (input: NewApplication) => Promise<boolean>;
}) {
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [status, setStatus] = useState("SAVED");
  const [jobUrl, setJobUrl] = useState("");
  const [location, setLocation] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [saving, setSaving] = useState(false);
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const ok = await onCreate({
      company: company.trim(),
      roleTitle: roleTitle.trim(),
      status,
      jobUrl: jobUrl.trim() || undefined,
      location: location.trim() || undefined,
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
            <input ref={firstRef} value={company} onChange={(e) => setCompany(e.target.value)} className={fieldClass} required />
          </label>
          <label className={labelClass}>
            Role title *
            <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} className={fieldClass} required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Stage
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Location
              <input value={location} onChange={(e) => setLocation(e.target.value)} className={fieldClass} placeholder="Remote · NYC…" />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Resume sent</span>
            {resumes.length > 0 && (
              <select value={resumeId} onChange={(e) => setResumeId(e.target.value)} className={cn(fieldClass, "min-w-0 truncate")}>
                <option value="">— None —</option>
                {resumes.map((r) => (
                  <option key={r.id} value={String(r.id)}>{r.label}</option>
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
          <div className="mt-1 flex justify-end gap-3">
            <button type="button" onClick={onClose} className={buttonVariants("ghost")}>Cancel</button>
            <button type="submit" disabled={!canSave} className={cn(buttonVariants("accent"), "disabled:opacity-50")}>
              {saving ? "Adding…" : "Add to board"}
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

function BoardCard({
  app,
  busy,
  onOpen,
  onConfirm,
  onChangeStatus,
  onDelete,
}: {
  app: Application;
  busy: boolean;
  onOpen: () => void;
  onConfirm: () => void;
  onChangeStatus: (status: string) => void;
  onDelete: () => void;
}) {
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const host = hostOf(app.jobUrl);
  const showNudge = app.status === "DRAFT" && !nudgeDismissed;

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(app.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "cursor-grab rounded-[var(--radius)] border border-line bg-paper p-3 shadow-[var(--shadow)] active:cursor-grabbing",
        busy && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[13.5px] font-bold text-ink">{app.company}</div>
          <div className="truncate text-[12.5px] text-ink-soft">{app.roleTitle}</div>
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete entry"
          title="Delete entry"
          className="shrink-0 rounded-md px-1.5 text-muted transition-colors hover:bg-paper-2 hover:text-danger disabled:opacity-50"
        >
          ×
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        {app.atsPlatform && (
          <span className="rounded-[5px] border border-line bg-paper-2 px-1.5 py-0.5 capitalize">{app.atsPlatform}</span>
        )}
        {app.location && <span className="truncate">{app.location}</span>}
      </div>
      {app.resume?.label && <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">📄 <span className="truncate">{app.resume.label}</span></div>}

      {showNudge && (
        <div className="mt-2 rounded-lg border border-accent bg-accent-soft p-2 text-[11.5px] text-accent-deep">
          <div className="font-bold">Did you submit this application?</div>
          <div className="mt-1.5 flex gap-1.5">
            <button onClick={onConfirm} disabled={busy} className="rounded-md bg-accent px-2.5 py-1 font-bold text-on-accent disabled:opacity-50">
              Yes, I applied
            </button>
            <button onClick={() => setNudgeDismissed(true)} disabled={busy} className="rounded-md border border-accent px-2.5 py-1 font-bold text-accent-deep">
              Not yet
            </button>
          </div>
        </div>
      )}

      {/* a11y / fallback status control */}
      <label className="sr-only" htmlFor={`status-${app.id}`}>Status</label>
      <select
        id={`status-${app.id}`}
        value={app.status}
        disabled={busy}
        onChange={(e) => onChangeStatus(e.target.value)}
        className="mt-2 w-full rounded-lg border border-line bg-paper px-2 py-1 text-[11.5px] text-ink-soft outline-none focus:border-accent disabled:opacity-50"
      >
        {COLUMNS.map((c) => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>
      {host && <div className="mt-1.5 truncate text-[10.5px] text-muted">{host}</div>}
    </li>
  );
}

function DetailPanel({
  app,
  resumes,
  onClose,
  onChangeStatus,
  onChangeResume,
  onDelete,
}: {
  app: Application | null;
  resumes: ResumeOption[];
  onClose: () => void;
  onChangeStatus: (status: string) => void;
  onChangeResume: (resumeId: number) => void;
  onDelete: () => void;
}) {
  const open = !!app;
  const closeRef = useRef<HTMLButtonElement>(null);

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
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-[.06em] text-accent-deep">
                  {STATUS_LABEL[app.status] ?? app.status}
                </span>
                <h2 className="mt-1 font-display text-xl font-semibold text-ink">{app.company}</h2>
                <p className="text-sm text-ink-soft">{app.roleTitle}</p>
              </div>
              <button ref={closeRef} onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-muted hover:bg-paper-2">✕</button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
                {app.location && (<><dt className="text-muted">Location</dt><dd className="text-ink">{app.location}</dd></>)}
                {app.atsPlatform && (<><dt className="text-muted">ATS</dt><dd className="capitalize text-ink">{app.atsPlatform}</dd></>)}
                <dt className="self-center text-muted">Resume sent</dt>
                <dd className="min-w-0">
                  <select
                    aria-label="Resume sent"
                    value={app.resume?.id ? String(app.resume.id) : ""}
                    onChange={(e) => e.target.value && onChangeResume(Number(e.target.value))}
                    disabled={resumes.length === 0}
                    className="w-full min-w-0 truncate rounded-lg border border-line bg-paper px-2 py-1 text-[13px] text-ink outline-none focus:border-accent disabled:opacity-60"
                  >
                    <option value="" disabled>{resumes.length ? "Select a resume…" : "No resumes uploaded yet"}</option>
                    {resumes.map((r) => (
                      <option key={r.id} value={String(r.id)}>{r.label}</option>
                    ))}
                  </select>
                </dd>
                {formatDate(app.appliedAt) && (<><dt className="text-muted">Applied</dt><dd className="text-ink">{formatDate(app.appliedAt)}</dd></>)}
                {formatDate(app.createdAt) && (<><dt className="text-muted">Added</dt><dd className="text-ink">{formatDate(app.createdAt)}</dd></>)}
              </dl>

              {app.jobUrl && (
                <a href={app.jobUrl} target="_blank" rel="noreferrer noopener" className="mt-4 inline-block text-sm font-medium text-accent-deep underline underline-offset-2">
                  View original posting ↗
                </a>
              )}

              {(() => {
                // Preview the resume actually used for this job: its one-off attachment if present,
                // otherwise the linked library resume's file.
                const pdfUrl = app.attachmentFilename
                  ? `/api/applications/${app.id}/attachment`
                  : app.resume?.id
                    ? `/api/resumes/${app.resume.id}/file`
                    : null;
                if (!pdfUrl) return null;
                return (
                  <div className="mt-6">
                    <h3 className="mb-2 font-display text-base font-semibold text-ink">
                      Resume {app.attachmentFilename ? "attached" : "sent"}
                    </h3>
                    <object data={pdfUrl} type="application/pdf" className="h-80 w-full rounded-[var(--radius)] border border-line">
                      <div className="rounded-[var(--radius)] border border-line bg-paper-2/40 p-3 text-[13px] text-muted">
                        Preview isn&apos;t available here.{" "}
                        <a href={pdfUrl} target="_blank" rel="noreferrer noopener" className="font-medium text-accent-deep underline">
                          Open the file ↗
                        </a>
                      </div>
                    </object>
                  </div>
                );
              })()}

              <h3 className="mt-6 mb-2 font-display text-base font-semibold text-ink">Job description</h3>
              {app.jobDescription ? (
                <div className="max-h-72 overflow-y-auto overflow-x-hidden rounded-[var(--radius)] border border-line bg-paper-2/40 p-3">
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-soft">{app.jobDescription}</p>
                </div>
              ) : (
                <p className="text-[13px] text-muted">No description was captured for this job.</p>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-line p-4">
              <label className="sr-only" htmlFor="detail-status">Status</label>
              <select
                id="detail-status"
                value={app.status}
                onChange={(e) => onChangeStatus(e.target.value)}
                className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <button onClick={onDelete} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-danger hover:bg-paper-2">
                Delete
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
