"use client";

import { useEffect, useRef, useState } from "react";
import { Button, FileTextIcon, PencilIcon, SideSheet, Skeleton, Select } from "@kiwiply/ui";
import { Pill } from "./parts";
import { VISIBILITY_LABELS, dateOf, patchResume, setPrimary, type ResumePreview, type ResumeRow, type Visibility } from "@/lib/ent/consultant-ws/resumes";

/** The two side sheets of My Resumes: a paper-style Preview of the structured fields, and the Edit-details form (name, visibility, primary). */

/* ── preview ────────────────────────────────────────────────────────────────────────── */

export function PreviewSheet({
  open,
  title,
  state,
  preview,
  onClose,
  onRetry,
  actions,
}: {
  open: boolean;
  title: string;
  state: "loading" | "ready" | "failed";
  preview: ResumePreview | null;
  onClose: () => void;
  onRetry: () => void;
  actions: React.ReactNode;
}) {
  return (
    <SideSheet id="resume-preview-sheet" side="right" mode="overlay" width={560} open={open} title={title} description={preview ? `Version ${preview.versionNo} - updated ${dateOf(preview.updatedAt)}` : undefined} icon={<FileTextIcon size={20} />} onClose={onClose} footer={actions}>
      {state === "loading" ? (
        <div aria-busy="true" className="space-y-3 pt-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : state === "failed" || !preview ? (
        <div className="py-8 text-center text-[13.5px] text-muted">
          <p>This resume didn&apos;t load. Nothing has changed.</p>
          <Button variant="ghost" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <article data-resume-paper aria-label={`${preview.title} preview`} className="rounded-lg border border-line bg-paper p-5 shadow-[var(--shadow)] sm:p-7">
          <h3 className="text-[22px] font-extrabold leading-tight text-ink">{preview.name}</h3>
          <p className="mt-0.5 text-[13px] text-muted">{[preview.headline ?? preview.jobTitle, preview.email].filter(Boolean).join(" | ")}</p>
          {preview.summary ? (
            <section className="mt-5">
              <h4 className="border-b border-line pb-1 text-[11.5px] font-bold uppercase tracking-widest text-ink-soft">Summary</h4>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink">{preview.summary}</p>
            </section>
          ) : null}
          {preview.skills.length ? (
            <section className="mt-5">
              <h4 className="border-b border-line pb-1 text-[11.5px] font-bold uppercase tracking-widest text-ink-soft">Skills</h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {preview.skills.map((s) => (
                  <li key={s} className="rounded-md bg-paper-2 px-2 py-0.5 text-[12.5px] text-ink">
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {preview.experience.length ? (
            <section className="mt-5">
              <h4 className="border-b border-line pb-1 text-[11.5px] font-bold uppercase tracking-widest text-ink-soft">Experience</h4>
              <ul className="mt-2 space-y-2">
                {preview.experience.map((x, i) => (
                  <li key={i} className="text-[13.5px] text-ink">
                    <span className="font-semibold">{x.title}</span>
                    {x.employer ? `, ${x.employer}` : ""}
                    {x.startYear !== null || x.endYear !== null ? <span className="ml-1.5 text-muted">{`${x.startYear ?? ""} - ${x.endYear ?? "Present"}`}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {!preview.summary && !preview.skills.length && !preview.experience.length ? <p className="mt-6 text-center text-[13.5px] text-muted">This resume has no content yet.</p> : null}
        </article>
      )}
    </SideSheet>
  );
}

/* ── edit details ───────────────────────────────────────────────────────────────────── */

const VIS_OPTIONS = (Object.keys(VISIBILITY_LABELS) as Visibility[]).map((v) => ({ value: v, label: v === "INTERNAL" ? "Team (people in your organization)" : v === "PUBLIC" ? "Public" : "Private (only you)" }));

export function EditSheet({ open, orgId, resume, onClose, onSaved }: { open: boolean; orgId: number; resume: ResumeRow | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("INTERNAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (open && resume && seen.current !== resume.id) {
      seen.current = resume.id;
      const t = setTimeout(() => {
        setName(resume.title);
        setVisibility(resume.visibility);
        setError(null);
      }, 0);
      return () => clearTimeout(t);
    }
    if (!open) seen.current = null;
  }, [open, resume]);

  if (!resume) return null;
  const changedName = name.trim() !== resume.title;
  const changedVis = visibility !== resume.visibility;

  const save = async () => {
    if (!changedName && !changedVis) return onClose();
    setBusy(true);
    setError(null);
    const r = await patchResume(orgId, resume.id, { ...(changedName ? { name: name.trim() } : {}), ...(changedVis ? { visibility } : {}) });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onSaved("Resume updated");
  };

  const makePrimary = async () => {
    setBusy(true);
    setError(null);
    const r = await setPrimary(orgId, resume.id);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onSaved("Primary resume changed");
  };

  return (
    <SideSheet
      id="resume-edit-sheet"
      side="right"
      mode="overlay"
      width={440}
      open={open}
      title="Edit resume details"
      description="Rename it, choose who can see it, or make it your primary resume."
      icon={<PencilIcon size={20} />}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={() => void save()} disabled={busy || name.trim() === "" || (!changedName && !changedVis)}>
            {busy ? "Saving..." : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-5 pt-1">
        <div>
          <label htmlFor="resume-name" className="text-[13px] font-semibold text-ink">
            Resume name
          </label>
          <input id="resume-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink outline-none focus-visible:border-accent" />
        </div>
        <div>
          <label htmlFor="resume-visibility" className="text-[13px] font-semibold text-ink">
            Visibility
          </label>
          <Select id="resume-visibility" variant="field" value={visibility} onChange={(v) => setVisibility(v as Visibility)} options={VIS_OPTIONS} aria-label="Visibility" className="mt-1.5" />
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold text-ink">Primary resume</p>
            {resume.primary ? <Pill tone="blue">Primary</Pill> : null}
          </div>
          <p className="mt-1 text-[12.5px] text-muted">{resume.primary ? "This is the resume used in your applications." : "Your primary resume is the one used in applications. Making this one primary replaces the current one."}</p>
          {resume.primary ? null : (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => void makePrimary()} disabled={busy}>
              Make primary
            </Button>
          )}
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-v2-coral-soft px-3 py-2 text-[13px] text-v2-coral-ink">
            {error}
          </p>
        ) : null}
      </div>
    </SideSheet>
  );
}
