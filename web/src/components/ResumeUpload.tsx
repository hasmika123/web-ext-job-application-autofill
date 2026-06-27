"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { parseResume } from "@/lib/resume-parse";
import type { StructuredResume, ResumeExperience, ResumeEducation, ResumeProject, ParsedBio } from "@/lib/parser-core";
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
            className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold", isBase ? "bg-brown-soft text-brown-deep" : "bg-accent-soft text-accent-deep")}
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
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brown" aria-hidden /> In your base skills</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden /> New in this resume</span>
    </div>
  );
}

// Resume dates → a consistent YYYY-MM the <input type="month"> picker accepts. Best-effort
// coercion of the free-text the parser produced (e.g. "Jan 2020", "2020", "01/2020").
const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03", apr: "04", april: "04",
  may: "05", jun: "06", june: "06", jul: "07", july: "07", aug: "08", august: "08", sep: "09", sept: "09",
  september: "09", oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12",
};
function toMonthValue(raw: string): string {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) return `${m[2]}-${MONTHS[m[1]]}`;
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01`;
  return "";
}
/** Normalize every experience/education date to YYYY-MM up front so the month pickers populate. */
function normalizeDates(struct: StructuredResume): StructuredResume {
  return {
    ...struct,
    experience: struct.experience.map((e) => ({ ...e, startDate: toMonthValue(e.startDate), endDate: toMonthValue(e.endDate) })),
    education: struct.education.map((e) => ({ ...e, startDate: toMonthValue(e.startDate), endDate: toMonthValue(e.endDate) })),
  };
}

const DEGREE_OPTIONS = [
  "High School Diploma",
  "Associate's Degree",
  "Bachelor of Arts (BA)",
  "Bachelor of Science (BS)",
  "Bachelor of Engineering (BEng)",
  "Master of Arts (MA)",
  "Master of Science (MS)",
  "Master of Business Administration (MBA)",
  "Doctor of Philosophy (PhD)",
  "Juris Doctor (JD)",
  "Doctor of Medicine (MD)",
  "Certificate",
  "Diploma",
];

function DegreeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = DEGREE_OPTIONS.includes(value);
  const [other, setOther] = useState(value.trim() !== "" && !known);
  const selectVal = other ? "__other__" : known ? value : "";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Degree</span>
      <select
        value={selectVal}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other__") setOther(true);
          else {
            setOther(false);
            onChange(v);
          }
        }}
        className={compactInput}
      >
        <option value="">—</option>
        {DEGREE_OPTIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
        <option value="__other__">Other…</option>
      </select>
      {other && (
        <input
          type="text"
          value={value}
          placeholder="Enter degree"
          onChange={(e) => onChange(e.target.value)}
          className={cn(compactInput, "mt-1")}
        />
      )}
    </label>
  );
}

function GpaField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const num = parseFloat(value);
  const invalid = value.trim() !== "" && (!Number.isFinite(num) || num < 0 || num >= 5);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">GPA</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        max="4.99"
        step="0.01"
        value={value}
        placeholder="e.g. 3.75"
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          // Hard restriction to 0.00–4.99 on blur.
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) {
            if (n < 0) onChange("0.00");
            else if (n >= 5) onChange("4.99");
          }
        }}
        className={cn(compactInput, invalid && "border-danger")}
      />
      {invalid && <span className="text-[11.5px] font-medium text-danger">GPA must be between 0.00 and 4.99</span>}
    </label>
  );
}

function BulletsBox({ label, bullets, onChange }: { label: string; bullets: string[]; onChange: (next: string[]) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label} — one per line</span>
      <textarea
        value={bullets.join("\n")}
        rows={Math.max(3, bullets.length + 1)}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        placeholder="• Led a team of 5…&#10;• Shipped X, improving Y by Z%…"
        className={cn(compactInput, "resize-y leading-relaxed")}
      />
    </label>
  );
}

function ExperienceEditor({
  index,
  exp,
  onPatch,
  onRemove,
}: {
  index: number;
  exp: ResumeExperience;
  onPatch: (p: Partial<ResumeExperience>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-paper-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Experience {index + 1}</span>
        <RemoveBtn onClick={onRemove} label="Remove this role" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="Title" value={exp.title} onChange={(v) => onPatch({ title: v })} />
        <LabeledInput label="Company" value={exp.company} onChange={(v) => onPatch({ company: v })} />
        <LabeledInput label="Location" value={exp.location} onChange={(v) => onPatch({ location: v })} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Start" type="month" value={exp.startDate} onChange={(v) => onPatch({ startDate: v })} />
          <LabeledInput label="End" type="month" value={exp.endDate} onChange={(v) => onPatch({ endDate: v })} />
        </div>
      </div>
      <label className="mt-3 flex w-fit items-center gap-2 text-[12.5px] text-ink-soft">
        <input type="checkbox" checked={exp.current} onChange={(e) => onPatch({ current: e.target.checked })} className="accent-[var(--accent)]" /> Current role
      </label>
      <div className="mt-3">
        <BulletsBox label="Highlights" bullets={exp.bullets} onChange={(next) => onPatch({ bullets: next })} />
      </div>
    </div>
  );
}

function ProjectEditor({
  index,
  proj,
  onPatch,
  onRemove,
}: {
  index: number;
  proj: ResumeProject;
  onPatch: (p: Partial<ResumeProject>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-paper-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Project {index + 1}</span>
        <RemoveBtn onClick={onRemove} label="Remove this project" />
      </div>
      <div className="flex flex-col gap-3">
        <LabeledInput label="Name" value={proj.name} onChange={(v) => onPatch({ name: v })} />
        <BulletsBox label="Details" bullets={proj.bullets} onChange={(next) => onPatch({ bullets: next })} />
      </div>
    </div>
  );
}

function EducationEditor({ index, edu, onPatch, onRemove }: { index: number; edu: ResumeEducation; onPatch: (p: Partial<ResumeEducation>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-paper-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Education {index + 1}</span>
        <RemoveBtn onClick={onRemove} label="Remove this education" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="School" value={edu.school} onChange={(v) => onPatch({ school: v })} />
        <DegreeSelect value={edu.degree} onChange={(v) => onPatch({ degree: v })} />
        <LabeledInput label="Field of study" value={edu.field} onChange={(v) => onPatch({ field: v })} />
        <LabeledInput label="Location" value={edu.location} onChange={(v) => onPatch({ location: v })} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Start" type="month" value={edu.startDate} onChange={(v) => onPatch({ startDate: v })} />
          <LabeledInput label="End" type="month" value={edu.endDate} onChange={(v) => onPatch({ endDate: v })} />
        </div>
        <GpaField value={edu.gpa} onChange={(v) => onPatch({ gpa: v })} />
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
      setStruct(normalizeDates(parsed.structured));
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
      // Drop blank bullet lines (the one-per-line boxes keep them while editing).
      const clean: StructuredResume = {
        ...struct,
        experience: struct.experience.map((e) => ({ ...e, bullets: e.bullets.map((b) => b.trim()).filter(Boolean) })),
        projects: struct.projects.map((p) => ({ ...p, bullets: p.bullets.map((b) => b.trim()).filter(Boolean) })),
      };
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("label", label.trim() || labelFromName(file.name));
      form.append("parsedJson", JSON.stringify(clean));
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
  const addExp = () =>
    setStruct((s) => (s ? { ...s, experience: [...s.experience, { company: "", title: "", location: "", startDate: "", endDate: "", current: false, bullets: [] }] } : s));
  const removeExp = (i: number) => setStruct((s) => (s ? { ...s, experience: s.experience.filter((_, idx) => idx !== i) } : s));
  const patchProj = (i: number, p: Partial<ResumeProject>) =>
    setStruct((s) => (s ? { ...s, projects: s.projects.map((e, idx) => (idx === i ? { ...e, ...p } : e)) } : s));
  const addProj = () => setStruct((s) => (s ? { ...s, projects: [...s.projects, { name: "", bullets: [] }] } : s));
  const removeProj = (i: number) => setStruct((s) => (s ? { ...s, projects: s.projects.filter((_, idx) => idx !== i) } : s));
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
                    <ExperienceEditor key={i} index={i} exp={exp} onPatch={(p) => patchExp(i, p)} onRemove={() => removeExp(i)} />
                  ))}
                  {struct.experience.length === 0 && <p className="text-[13px] text-muted">No experience detected — add a role.</p>}
                </div>
              </SectionCard>

              {/* Projects */}
              <SectionCard title={`Projects (${struct.projects.length})`} action={<AddBtn onClick={addProj} label="Add project" />}>
                <div className="flex flex-col gap-4">
                  {struct.projects.map((proj, i) => (
                    <ProjectEditor key={i} index={i} proj={proj} onPatch={(p) => patchProj(i, p)} onRemove={() => removeProj(i)} />
                  ))}
                  {struct.projects.length === 0 && <p className="text-[13px] text-muted">No projects detected — add one.</p>}
                </div>
              </SectionCard>

              {/* Education */}
              <SectionCard title={`Education (${struct.education.length})`} action={<AddBtn onClick={addEdu} label="Add education" />}>
                <div className="flex flex-col gap-4">
                  {struct.education.map((edu, i) => (
                    <EducationEditor key={i} index={i} edu={edu} onPatch={(p) => patchEdu(i, p)} onRemove={() => removeEdu(i)} />
                  ))}
                  {struct.education.length === 0 && <p className="text-[13px] text-muted">No education detected — add one.</p>}
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
