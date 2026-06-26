"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { parseResume } from "@/lib/resume-parse";
import type { StructuredResume, ResumeExperience, ResumeEducation, ParsedBio } from "@/lib/parser-core";
import { track } from "@/lib/analytics";
import { Input, useToast } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type BaseProfile = Record<string, unknown>;

// Contact fields the review can edit + push to the base profile.
const CONTACT_FIELDS: { key: keyof ParsedBio; label: string; wide?: boolean }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", wide: true },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "linkedin", label: "LinkedIn", wide: true },
  { key: "github", label: "GitHub", wide: true },
  { key: "website", label: "Website", wide: true },
];

function labelFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || "Resume";
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

const compactInput =
  "w-full rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent";

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={compactInput} />
    </label>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("h-[18px] w-[18px] transition-transform", open && "rotate-180")}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-soft transition-colors hover:border-accent hover:text-accent-deep">
      + {label}
    </button>
  );
}

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-md px-1.5 text-muted transition-colors hover:bg-paper-2 hover:text-danger">
      ✕
    </button>
  );
}

function SkillChips({ skills, baseSet, onChange }: { skills: string[]; baseSet: Set<string>; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...skills];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft("");
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-line bg-paper p-2.5">
      {skills.map((sk, i) => {
        const isBase = baseSet.has(sk.toLowerCase());
        return (
          <span
            key={i}
            className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold", isBase ? "bg-accent-soft text-accent-deep" : "bg-brown-soft text-brown-deep")}
            title={isBase ? "Already one of your base skills" : "New in this resume — not in your base skills"}
          >
            {sk}
            <button type="button" onClick={() => onChange(skills.filter((x) => x !== sk))} className="opacity-60 hover:opacity-100" aria-label={`Remove ${sk}`}>×</button>
          </span>
        );
      })}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
          else if (e.key === "Backspace" && !draft && skills.length) onChange(skills.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        placeholder={skills.length ? "Add a skill…" : "e.g. Python, SQL"}
        className="min-w-[140px] flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}

function SkillLegend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden /> In your base skills</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brown" aria-hidden /> New in this resume</span>
    </div>
  );
}

function ExperienceEditor({
  exp,
  onPatch,
  onRemove,
  onBullet,
  onAddBullet,
  onRemoveBullet,
}: {
  exp: ResumeExperience;
  onPatch: (p: Partial<ResumeExperience>) => void;
  onRemove: () => void;
  onBullet: (bi: number, v: string) => void;
  onAddBullet: () => void;
  onRemoveBullet: (bi: number) => void;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-paper-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Role</span>
        <RemoveBtn onClick={onRemove} label="Remove this role" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="Title" value={exp.title} onChange={(v) => onPatch({ title: v })} />
        <LabeledInput label="Company" value={exp.company} onChange={(v) => onPatch({ company: v })} />
        <LabeledInput label="Location" value={exp.location} onChange={(v) => onPatch({ location: v })} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Start" value={exp.startDate} onChange={(v) => onPatch({ startDate: v })} />
          <LabeledInput label="End" value={exp.endDate} onChange={(v) => onPatch({ endDate: v })} />
        </div>
      </div>
      <label className="mt-3 flex w-fit items-center gap-2 text-[12.5px] text-ink-soft">
        <input type="checkbox" checked={exp.current} onChange={(e) => onPatch({ current: e.target.checked })} className="accent-[var(--accent)]" /> Current role
      </label>
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Highlights</span>
          <AddBtn onClick={onAddBullet} label="Add bullet" />
        </div>
        <div className="flex flex-col gap-2">
          {exp.bullets.map((b, bi) => (
            <div key={bi} className="flex items-start gap-2">
              <span className="mt-2 flex-none text-muted">•</span>
              <textarea value={b} rows={1} onChange={(e) => onBullet(bi, e.target.value)} className={cn(compactInput, "flex-1 resize-y py-1.5 text-[13px]")} />
              <span className="mt-1"><RemoveBtn onClick={() => onRemoveBullet(bi)} label="Remove bullet" /></span>
            </div>
          ))}
          {exp.bullets.length === 0 && <p className="text-[12.5px] text-muted">No highlights detected — add one.</p>}
        </div>
      </div>
    </div>
  );
}

function EducationEditor({ edu, onPatch, onRemove }: { edu: ResumeEducation; onPatch: (p: Partial<ResumeEducation>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-paper-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">School</span>
        <RemoveBtn onClick={onRemove} label="Remove this school" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="School" value={edu.school} onChange={(v) => onPatch({ school: v })} />
        <LabeledInput label="Degree" value={edu.degree} onChange={(v) => onPatch({ degree: v })} />
        <LabeledInput label="Field of study" value={edu.field} onChange={(v) => onPatch({ field: v })} />
        <LabeledInput label="Location" value={edu.location} onChange={(v) => onPatch({ location: v })} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Start" value={edu.startDate} onChange={(v) => onPatch({ startDate: v })} />
          <LabeledInput label="End" value={edu.endDate} onChange={(v) => onPatch({ endDate: v })} />
        </div>
        <LabeledInput label="GPA" value={edu.gpa} onChange={(v) => onPatch({ gpa: v })} />
      </div>
    </div>
  );
}

export default function ResumeUpload({ baseProfile = {} }: { baseProfile?: BaseProfile }) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Review mode is active when `struct` is set (the full-page editor).
  const [struct, setStruct] = useState<StructuredResume | null>(null);
  const [bio, setBio] = useState<ParsedBio>({});
  const [contactOpen, setContactOpen] = useState(true);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const baseSkills = Array.isArray(baseProfile.skills)
    ? (baseProfile.skills as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const baseSet = new Set(baseSkills.map((s) => s.toLowerCase()));

  async function handleFile(picked: File) {
    setFile(picked);
    setLabel(labelFromName(picked.name));
    setParsing(true);
    setError(null);
    setSaveError(null);
    try {
      const parsed = await parseResume(picked);
      setBio(parsed.bio);
      setStruct(parsed.structured);
      setContactOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setParsing(false);
    }
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) void handleFile(picked);
    e.target.value = ""; // allow re-picking the same file
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) void handleFile(picked);
  }

  function closeReview() {
    setStruct(null);
    setBio({});
    setFile(null);
    setSaveError(null);
  }

  // Esc closes the full-page review.
  useEffect(() => {
    if (!struct) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeReview();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [struct]);

  async function onSave() {
    if (!file || !struct) return;
    setSaving(true);
    setSaveError(null);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("label", label.trim() || labelFromName(file.name));
      form.append("parsedJson", JSON.stringify(struct));
      const res = await fetch("/api/resumes/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save the resume.");
        return;
      }
      track("resume_saved");
      toast({ variant: "success", title: `Saved “${data.label ?? label}”`, description: "Added to your account." });
      closeReview();
      router.refresh();
    } catch {
      setSaveError("Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  }

  // "Update base profile" — enabled only when a detected contact value differs from the base.
  const baseDiffers = CONTACT_FIELDS.some((f) => {
    const detected = asStr(bio[f.key]).trim();
    return detected !== "" && detected !== asStr(baseProfile[f.key as string]).trim();
  });

  async function onUpdateBaseProfile() {
    setUpdatingProfile(true);
    try {
      const merged: BaseProfile = { ...baseProfile };
      for (const f of CONTACT_FIELDS) {
        const v = asStr(bio[f.key]).trim();
        if (v) merged[f.key as string] = v;
      }
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: JSON.stringify(merged) }),
      });
      if (res.ok) {
        toast({ variant: "success", title: "Base profile updated", description: "Your profile now matches this contact info." });
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ variant: "error", title: d.error ?? "Couldn't update your profile." });
      }
    } catch {
      toast({ variant: "error", title: "Something went wrong updating your profile." });
    } finally {
      setUpdatingProfile(false);
    }
  }

  // Struct edit helpers.
  const setBioField = (k: keyof ParsedBio, v: string) => setBio((b) => ({ ...b, [k]: v }));
  const patchStruct = (p: Partial<StructuredResume>) => setStruct((s) => (s ? { ...s, ...p } : s));
  const patchExp = (i: number, p: Partial<ResumeExperience>) =>
    setStruct((s) => (s ? { ...s, experience: s.experience.map((e, idx) => (idx === i ? { ...e, ...p } : e)) } : s));
  const setExpBullet = (i: number, bi: number, v: string) =>
    setStruct((s) => (s ? { ...s, experience: s.experience.map((e, idx) => (idx === i ? { ...e, bullets: e.bullets.map((b, j) => (j === bi ? v : b)) } : e)) } : s));
  const addExpBullet = (i: number) =>
    setStruct((s) => (s ? { ...s, experience: s.experience.map((e, idx) => (idx === i ? { ...e, bullets: [...e.bullets, ""] } : e)) } : s));
  const removeExpBullet = (i: number, bi: number) =>
    setStruct((s) => (s ? { ...s, experience: s.experience.map((e, idx) => (idx === i ? { ...e, bullets: e.bullets.filter((_, j) => j !== bi) } : e)) } : s));
  const addExp = () =>
    setStruct((s) => (s ? { ...s, experience: [...s.experience, { company: "", title: "", location: "", startDate: "", endDate: "", current: false, bullets: [] }] } : s));
  const removeExp = (i: number) => setStruct((s) => (s ? { ...s, experience: s.experience.filter((_, idx) => idx !== i) } : s));
  const patchEdu = (i: number, p: Partial<ResumeEducation>) =>
    setStruct((s) => (s ? { ...s, education: s.education.map((e, idx) => (idx === i ? { ...e, ...p } : e)) } : s));
  const addEdu = () =>
    setStruct((s) => (s ? { ...s, education: [...s.education, { school: "", degree: "", field: "", startDate: "", endDate: "", gpa: "", location: "" }] } : s));
  const removeEdu = (i: number) => setStruct((s) => (s ? { ...s, education: s.education.filter((_, idx) => idx !== i) } : s));

  const SaveBtn = (
    <button onClick={onSave} disabled={saving} className={cn(buttonVariants("accent"), "whitespace-nowrap disabled:opacity-50")}>
      {saving ? "Saving…" : "Save to my account"}
    </button>
  );

  return (
    <>
      {/* Drop-zone (the page; the review opens as a full-page overlay on top) */}
      <div className="flex flex-col gap-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "cursor-pointer rounded-[var(--radius-lg)] border-2 border-dashed p-8 text-center transition-colors",
            dragging ? "border-accent bg-accent-soft" : "border-line bg-paper hover:bg-paper-2",
          )}
        >
          <div className="text-3xl">📄</div>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">Drop a resume here</h3>
          <p className="mt-1 text-[13.5px] text-muted">
            or <span className="font-semibold text-accent-deep">browse</span> — PDF, DOCX, or TXT. Parsed right here in your browser.
          </p>
          <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain" onChange={onInput} className="hidden" />
        </div>
        {parsing && <p className="text-sm text-muted">Reading your resume…</p>}
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>

      {/* Full-page editable review */}
      {struct && (
        <div role="dialog" aria-modal="true" aria-label="Review resume" className="fixed inset-0 z-[150] overflow-y-auto bg-app-bg">
          <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">Review &amp; edit resume</h2>
                <p className="mt-1 text-sm text-muted">Edit anything before saving — parsed in your browser, nothing leaves until you save.</p>
              </div>
              <button
                onClick={closeReview}
                aria-label="Close review"
                title="Close (Esc)"
                className="grid h-10 w-10 flex-none place-items-center rounded-full border border-line bg-paper text-lg text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-5 pb-6">
              {/* Resume name + Save (input & button share a row → aligned) */}
              <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
                <label htmlFor="resume-label" className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Resume name</label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <Input id="resume-label" value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1" />
                  {SaveBtn}
                </div>
                {saveError && (
                  <p role="alert" className="mt-2 text-sm font-medium text-danger">
                    {saveError}
                  </p>
                )}
              </div>

              {/* Detected contact — collapsible, with a one-click base-profile update */}
              <SectionCard
                title="Detected contact"
                action={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onUpdateBaseProfile}
                      disabled={!baseDiffers || updatingProfile}
                      title={baseDiffers ? "Update your base profile with this contact info" : "Your base profile already matches this contact"}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                        baseDiffers && !updatingProfile
                          ? "border-accent bg-accent-soft text-accent-deep hover:bg-[color-mix(in_srgb,var(--accent)_22%,var(--paper))]"
                          : "cursor-not-allowed border-line text-muted opacity-60",
                      )}
                    >
                      {updatingProfile ? "Updating…" : "Update base profile"}
                    </button>
                    <button type="button" onClick={() => setContactOpen((o) => !o)} aria-expanded={contactOpen} aria-label={contactOpen ? "Collapse contact" : "Expand contact"} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-paper-2">
                      <Chevron open={contactOpen} />
                    </button>
                  </div>
                }
              >
                {contactOpen && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {CONTACT_FIELDS.map((f) => (
                      <div key={f.key} className={cn(f.wide && "sm:col-span-2")}>
                        <LabeledInput label={f.label} value={asStr(bio[f.key])} onChange={(v) => setBioField(f.key, v)} />
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Summary */}
              <SectionCard title="Summary">
                <textarea value={struct.summary} rows={4} onChange={(e) => patchStruct({ summary: e.target.value })} placeholder="No summary detected — add one if you like." className={cn(compactInput, "resize-y")} />
              </SectionCard>

              {/* Skills (editable + base-overlap coloring) */}
              <SectionCard title={`Skills (${struct.skills.length})`}>
                <SkillChips skills={struct.skills} baseSet={baseSet} onChange={(next) => patchStruct({ skills: next })} />
                <SkillLegend />
              </SectionCard>

              {/* Experience — full entries with editable bullets */}
              <SectionCard title={`Experience (${struct.experience.length})`} action={<AddBtn onClick={addExp} label="Add role" />}>
                <div className="flex flex-col gap-4">
                  {struct.experience.map((exp, i) => (
                    <ExperienceEditor
                      key={i}
                      exp={exp}
                      onPatch={(p) => patchExp(i, p)}
                      onRemove={() => removeExp(i)}
                      onBullet={(bi, v) => setExpBullet(i, bi, v)}
                      onAddBullet={() => addExpBullet(i)}
                      onRemoveBullet={(bi) => removeExpBullet(i, bi)}
                    />
                  ))}
                  {struct.experience.length === 0 && <p className="text-[13px] text-muted">No experience detected — add a role.</p>}
                </div>
              </SectionCard>

              {/* Education */}
              <SectionCard title={`Education (${struct.education.length})`} action={<AddBtn onClick={addEdu} label="Add school" />}>
                <div className="flex flex-col gap-4">
                  {struct.education.map((edu, i) => (
                    <EducationEditor key={i} edu={edu} onPatch={(p) => patchEdu(i, p)} onRemove={() => removeEdu(i)} />
                  ))}
                  {struct.education.length === 0 && <p className="text-[13px] text-muted">No education detected — add a school.</p>}
                </div>
              </SectionCard>

              <div className="flex justify-end gap-3">
                <button onClick={closeReview} className={buttonVariants("ghost")}>Cancel</button>
                {SaveBtn}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
